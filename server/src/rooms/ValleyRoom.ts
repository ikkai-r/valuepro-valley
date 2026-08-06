import { Room, Client } from '@colyseus/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE,
  BATTLE_BOX,
  ENEMY_TURN_MS,
  HEARTS_HATED_GIFT,
  HEARTS_LIKED_GIFT,
  HEARTS_LOVED_GIFT,
  HEARTS_PER_TALK,
  HURT_FLASH_MS,
  JOBS,
  LOTS,
  MAP,
  MAX_HEARTS,
  MAX_PLAYERS,
  MONSTERS,
  MonsterType,
  NPCS,
  PLAYER_IFRAME_MS,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
  PLAYER_TURN_MS,
  QUESTS,
  RND_BANTER,
  SHARED_BANTER,
  SOUL_RADIUS,
  SOUL_SPEED,
  SUPPORT_BANTER,
  TILE,
} from '../../../shared/src/index.js';
import {
  BulletState,
  InventoryItem,
  MonsterState,
  NpcHeartState,
  PlayerState,
  ValleyState,
} from '../schema/ValleyState.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(__dirname, '../../.snapshots');

type Msg =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'setTool'; tool: string; seedCrop?: string }
  | { type: 'useTool' }
  | { type: 'attack' }
  | { type: 'interact' }
  | { type: 'talk'; npcId: string }
  | { type: 'gift'; npcId: string; itemId: string }
  | { type: 'acceptJob'; jobId: string }
  | { type: 'enterInspection' }
  | { type: 'leaveInspection' }
  | { type: 'submitReport' }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'tryCompleteQuest'; questId: string }
  | { type: 'setName'; name: string };

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

function near(ax: number, ay: number, bx: number, by: number, r = 48) {
  return dist(ax, ay, bx, by) <= r;
}

export class ValleyRoom extends Room<ValleyState> {
  maxClients = MAX_PLAYERS;
  private attackCooldown = new Map<string, number>();
  private playerIframes = new Map<string, number>();
  private foughtThisTurn = new Set<string>();
  private bulletSeq = 0;
  private spawnAcc = 0;
  private patternCursor = 0;
  private safeLane = 0;
  private lastNpcLine = new Map<string, string>();
  private simTimer?: ReturnType<typeof setInterval>;
  private saveTimer?: ReturnType<typeof setInterval>;
  private colorCursor = 0;

  onCreate(options: { roomCode?: string }) {
    const code = (options.roomCode || this.generateCode()).toUpperCase();
    this.roomId = code;
    this.setMetadata({ roomCode: code });
    this.setState(new ValleyState());
    this.state.roomCode = code;

    this.initHearts();
    this.initInventory();
    this.refreshJobs();
    this.tryLoadSnapshot(code);

    this.onMessage('input', (client, message: Msg) => this.handleMessage(client, message));

    this.simTimer = setInterval(() => this.tickBattle(0.05), 50);
    this.saveTimer = setInterval(() => this.saveSnapshot(), 15000);

    this.setAnnouncement(`Room ${code} is open. Share the code!`);
  }

  onJoin(client: Client, options: { name?: string; gender?: string }) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = (options.name || `Player ${this.clients.length}`).slice(0, 16);
    player.gender = options.gender === 'male' ? 'male' : 'female';
    player.colorIndex = this.colorCursor % MAX_PLAYERS;
    this.colorCursor += 1;
    player.maxHp = PLAYER_MAX_HP;
    player.hp = PLAYER_MAX_HP;
    player.tool = 'sword';
    player.bedSlot = this.claimBedSlot();
    const bunk = MAP.bedSlots[player.bedSlot] ?? MAP.bedSlots[0];
    player.x = bunk.x;
    player.y = bunk.y + 18;
    this.state.players.set(client.sessionId, player);
    this.setAnnouncement(`${player.name} joined — bunk ${player.bedSlot + 1} is ready.`);
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.setAnnouncement(`${p.name} left.`);
    this.state.players.delete(client.sessionId);
    this.attackCooldown.delete(client.sessionId);
    this.playerIframes.delete(client.sessionId);
    if (this.state.acceptedBy === client.sessionId && this.state.inspectionActive) {
      // keep inspection running for others
    }
  }

  private claimBedSlot() {
    const used = new Set<number>();
    this.state.players.forEach((p) => {
      if (p.bedSlot >= 0) used.add(p.bedSlot);
    });
    for (let i = 0; i < MAP.bedSlots.length; i++) {
      if (!used.has(i)) return i;
    }
    return Math.min(used.size, MAP.bedSlots.length - 1);
  }

  private playerBed(player: PlayerState) {
    if (player.bedSlot < 0 || player.bedSlot >= MAP.bedSlots.length) return null;
    return MAP.bedSlots[player.bedSlot];
  }

  private trySleep(player: PlayerState) {
    const bunk = this.playerBed(player);
    if (!bunk) {
      this.setAnnouncement('No bunk assigned yet.');
      return;
    }
    if (!near(player.x, player.y, bunk.x, bunk.y, 36)) {
      this.setAnnouncement('Stand next to your bunk to rest (E or B).');
      return;
    }
    player.sleeping = true;
    player.x = bunk.x;
    player.y = bunk.y;
    player.hp = player.maxHp;
    this.clientSend(player.id, 'sleepStarted', { day: this.state.day });
    this.setAnnouncement(`${player.name} is resting in bunk ${player.bedSlot + 1}. HP restored.`);
    this.tryAdvanceDay();
  }

  onDispose() {
    if (this.simTimer) clearInterval(this.simTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.saveSnapshot();
  }

  private generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  private setAnnouncement(text: string) {
    this.state.lastAnnouncement = text;
  }

  private initHearts() {
    for (const npc of NPCS) {
      const h = new NpcHeartState();
      h.npcId = npc.id;
      this.state.hearts.set(npc.id, h);
    }
  }

  private initInventory() {
    const starter: Record<string, number> = {
      coffee: 5,
      turnip: 4,
      coffee_bean: 3,
      sticky_note_flower: 3,
    };
    for (const [id, qty] of Object.entries(starter)) {
      const item = new InventoryItem();
      item.itemId = id;
      item.qty = qty;
      this.state.inventory.set(id, item);
    }
  }

  private addItem(itemId: string, qty: number) {
    let item = this.state.inventory.get(itemId);
    if (!item) {
      item = new InventoryItem();
      item.itemId = itemId;
      this.state.inventory.set(itemId, item);
    }
    item.qty = Math.max(0, item.qty + qty);
  }

  private getItemQty(itemId: string) {
    return this.state.inventory.get(itemId)?.qty ?? 0;
  }

  /** Jobs stay posted until their report is submitted, so a new day never strands one. */
  private refreshJobs() {
    this.state.availableJobs.clear();
    const pool = JOBS.filter((j) => {
      if (this.state.jobsCompleted.get(j.id)) return false;
      if (j.isBigHouse) {
        return (j.houseFloor ?? 99) <= this.state.houseFloorUnlocked;
      }
      return true;
    });
    const picks = pool.filter((j) => !j.isBigHouse).slice(0, 3);
    for (const j of picks) this.state.availableJobs.set(j.id, j.id);
    for (const j of pool.filter((j) => j.isBigHouse)) {
      this.state.availableJobs.set(j.id, j.id);
    }
  }

  private handleMessage(client: Client, msg: Msg) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !msg?.type) return;

    switch (msg.type) {
      case 'setName':
        player.name = (msg.name || player.name).slice(0, 16);
        break;
      case 'move':
        this.movePlayer(player, msg.dx, msg.dy);
        break;
      case 'setTool':
        player.tool = msg.tool === 'gift' ? 'gift' : 'sword';
        break;
      case 'useTool':
        // Farming removed — interact / attack handle actions
        break;
      case 'attack':
        this.attack(player);
        break;
      case 'interact':
        this.interact(player);
        break;
      case 'talk':
        this.talk(player, msg.npcId);
        break;
      case 'gift':
        this.gift(player, msg.npcId, msg.itemId);
        break;
      case 'acceptJob':
        this.acceptJob(player, msg.jobId);
        break;
      case 'enterInspection':
        this.enterInspection(player);
        break;
      case 'leaveInspection':
        this.leaveInspection(player);
        break;
      case 'submitReport':
        this.submitReport(player);
        break;
      case 'sleep':
        this.trySleep(player);
        break;
      case 'wake':
        player.sleeping = false;
        break;
      case 'tryCompleteQuest':
        this.tryCompleteQuest(player, msg.questId);
        break;
    }
  }

  private movePlayer(player: PlayerState, dx: number, dy: number) {
    if (player.sleeping) return;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    if (Math.abs(nx) > Math.abs(ny)) player.facing = nx > 0 ? 'right' : 'left';
    else if (ny !== 0) player.facing = ny > 0 ? 'down' : 'up';

    if (player.inInspection) {
      // Undertale soul only moves during enemy dodge phase
      if (this.state.battlePhase !== 'enemy_turn') return;
      const speed = SOUL_SPEED * 0.05;
      const pad = SOUL_RADIUS + 2;
      player.x = clamp(
        player.x + nx * speed,
        BATTLE_BOX.x + pad,
        BATTLE_BOX.x + BATTLE_BOX.w - pad,
      );
      player.y = clamp(
        player.y + ny * speed,
        BATTLE_BOX.y + pad,
        BATTLE_BOX.y + BATTLE_BOX.h - pad,
      );
      return;
    }

    const speed = PLAYER_SPEED * 0.05;
    const targetX = clamp(player.x + nx * speed, TILE, (MAP.widthTiles - 1) * TILE);
    const targetY = clamp(player.y + ny * speed, TILE, (MAP.heightTiles - 1) * TILE);

    // Try the full step, then each axis alone so players slide along walls.
    const candidates: Array<[number, number]> = [
      [targetX, targetY],
      [targetX, player.y],
      [player.x, targetY],
    ];
    for (const [x, y] of candidates) {
      if (x === player.x && y === player.y) continue;
      if (this.blocked(x, y)) continue;
      player.x = x;
      player.y = y;
      this.tryEnterJobDoor(player);
      return;
    }
  }

  private blocked(x: number, y: number) {
    for (const lot of LOTS) {
      if (this.circleRect(x, y, 10, lot.x, lot.y, lot.w, lot.h)) {
        const doorY = lot.y + lot.h;
        const inDoor =
          y >= doorY - 12 &&
          y <= doorY + 28 &&
          x >= lot.x - 8 &&
          x <= lot.x + lot.w + 8;
        if (!inDoor) return true;
      }
    }
    for (const tree of MAP.trees) {
      if (this.circleRect(x, y, 10, tree.x * TILE, tree.y * TILE, 2 * TILE, 3 * TILE)) return true;
    }
    for (const building of MAP.buildings) {
      if (
        this.circleRect(
          x,
          y,
          10,
          building.tileX * TILE,
          building.tileY * TILE,
          building.tilesW * TILE,
          building.tilesH * TILE,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private jobDoorPoint(lot: (typeof LOTS)[0]) {
    return {
      x: lot.x + lot.w / 2,
      y: lot.y + lot.h + 10,
    };
  }

  /** Returns true if the player entered an inspection. */
  private tryEnterJobDoor(player: PlayerState): boolean {
    if (!this.state.activeJobId || player.inInspection || player.sleeping) return false;
    const job = JOBS.find((j) => j.id === this.state.activeJobId);
    const lot = LOTS.find((l) => l.id === job?.lotId);
    if (!job || !lot) return false;
    const door = this.jobDoorPoint(lot);
    if (!near(player.x, player.y, door.x, door.y, 56)) return false;
    this.enterInspection(player);
    return true;
  }

  private circleRect(
    cx: number,
    cy: number,
    r: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
  ) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    return dist(cx, cy, closestX, closestY) < r;
  }

  private attack(player: PlayerState) {
    if (!player.inInspection || player.sleeping) return;
    if (this.state.battlePhase !== 'player_turn' || this.state.inspectionCleared) return;
    if (this.foughtThisTurn.has(player.id)) {
      this.setAnnouncement(`${player.name} already FIGHT'd this turn.`);
      return;
    }
    const now = Date.now();
    const last = this.attackCooldown.get(player.id) || 0;
    if (now - last < ATTACK_COOLDOWN_MS) return;
    this.attackCooldown.set(player.id, now);
    this.foughtThisTurn.add(player.id);
    player.attackFlash = now;

    // Hit the living monster with lowest HP (focus fire)
    let targetId: string | null = null;
    let targetHp = Infinity;
    let targetType = '';
    let targetMax = 1;
    this.state.monsters.forEach((m) => {
      if (m.hp <= 0) return;
      if (m.hp < targetHp) {
        targetId = m.id;
        targetHp = m.hp;
        targetType = m.monsterType;
        targetMax = m.maxHp;
      }
    });
    if (!targetId) {
      this.checkInspectionCleared();
      return;
    }

    const target = this.state.monsters.get(targetId);
    if (!target) return;
    target.hp -= ATTACK_DAMAGE;
    target.hurtFlash = now + HURT_FLASH_MS;
    const def = MONSTERS[targetType as MonsterType];
    this.setAnnouncement(
      `* ${player.name} FIGHT! ${def?.name ?? 'Enemy'} took ${ATTACK_DAMAGE} — ${Math.max(0, target.hp)}/${targetMax} HP`,
    );
    if (target.hp <= 0) {
      this.setAnnouncement(`* ${def?.name ?? 'Enemy'} was defeated!`);
      // Delay removal so clients can show the red hurt flash.
      const deadId = targetId;
      setTimeout(() => {
        if (!this.state.monsters.has(deadId)) return;
        this.state.monsters.delete(deadId);
        this.checkInspectionCleared();
      }, HURT_FLASH_MS);
    } else {
      this.checkInspectionCleared();
    }
    if (!this.state.inspectionCleared) {
      this.state.battlePhaseEndsAt = Math.min(this.state.battlePhaseEndsAt, Date.now() + 900);
    }
  }

  private checkInspectionCleared() {
    if (!this.state.inspectionActive) return;
    let alive = 0;
    this.state.monsters.forEach((m) => {
      if (m.hp > 0) alive += 1;
    });
    if (alive === 0) {
      this.state.inspectionCleared = true;
      this.state.battlePhase = 'cleared';
      this.state.bullets.clear();
      this.setAnnouncement('* You won! Press E to submit the report.');
    }
  }

  private centerSoul(player: PlayerState) {
    player.x = BATTLE_BOX.x + BATTLE_BOX.w / 2;
    player.y = BATTLE_BOX.y + BATTLE_BOX.h / 2;
  }

  private startPlayerTurn() {
    this.state.battlePhase = 'player_turn';
    this.state.battlePhaseEndsAt = Date.now() + PLAYER_TURN_MS;
    this.state.bullets.clear();
    this.foughtThisTurn.clear();
    this.spawnAcc = 0;
    this.state.dodgeHint = '';
    this.state.players.forEach((p) => {
      if (p.inInspection) this.centerSoul(p);
    });
    this.setAnnouncement('* Your turn — press SPACE to FIGHT!');
  }

  private startEnemyTurn() {
    if (this.state.inspectionCleared) return;
    let alive = 0;
    this.state.monsters.forEach((m) => {
      if (m.hp > 0) alive += 1;
    });
    if (alive === 0) {
      this.checkInspectionCleared();
      return;
    }
    this.state.battlePhase = 'enemy_turn';
    this.state.battlePhaseEndsAt = Date.now() + ENEMY_TURN_MS;
    this.state.bullets.clear();
    // Brief warning window, then one readable pattern at a time.
    this.spawnAcc = -0.8;
    this.patternCursor = 0;
    this.safeLane = Math.floor(Math.random() * 4);
    this.state.dodgeHint = 'Get ready — watch for the open lane!';
    this.state.players.forEach((p) => {
      if (p.inInspection) this.centerSoul(p);
    });
    this.setAnnouncement('* Dodge! Survive the attack!');
  }

  private interact(player: PlayerState) {
    if (player.sleeping) return;

    // Job doors first
    if (this.tryEnterJobDoor(player)) return;

    // Your bunk — rest / majority day vote
    const bunk = this.playerBed(player);
    if (bunk && near(player.x, player.y, bunk.x, bunk.y, 36)) {
      this.trySleep(player);
      return;
    }

    // noticeboard quests (including office keys)
    if (near(player.x, player.y, MAP.noticeboard.x, MAP.noticeboard.y, 40)) {
      this.autoUnlockHeartQuests();
      for (const id of ['quest_office_keys', 'quest_bridge', 'quest_cafe', 'quest_greenhouse']) {
        this.state.questUnlocked.set(id, true);
      }
      this.setAnnouncement('Noticeboard updated. Hand in quests here with E.');
      for (const q of QUESTS) {
        if (!this.state.questCompleted.get(q.id)) this.tryCompleteQuest(player, q.id, true);
      }
      return;
    }

    // job board
    if (near(player.x, player.y, MAP.jobBoard.x, MAP.jobBoard.y, 48)) {
      this.clientSend(player.id, 'openJobs', {});
      this.setAnnouncement('The Help Wanted board is open.');
      return;
    }

    // talk nearest npc
    let best: (typeof NPCS)[0] | null = null;
    let bestD = 40;
    for (const npc of NPCS) {
      const d = dist(player.x, player.y, npc.x, npc.y);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    if (best) this.talk(player, best.id);
  }

  private talk(player: PlayerState, npcId: string) {
    const npc = NPCS.find((n) => n.id === npcId);
    const heart = this.state.hearts.get(npcId);
    if (!npc || !heart) return;
    if (!near(player.x, player.y, npc.x, npc.y, 48)) return;

    const teamPool = npc.team === 'support' ? SUPPORT_BANTER : RND_BANTER;
    const pool = [...npc.greetings, ...teamPool, ...SHARED_BANTER];
    const previous = this.lastNpcLine.get(npcId);
    const choices = pool.filter((line) => line !== previous);
    const candidates = choices.length ? choices : pool;
    const line = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastNpcLine.set(npcId, line);

    if (heart.talkedDay !== this.state.day) {
      heart.talkedDay = this.state.day;
      heart.points = Math.min(MAX_HEARTS * 100, heart.points + HEARTS_PER_TALK);
      this.maybeUnlockHeartQuest(npcId);
    }
    this.setAnnouncement(`${npc.name}: "${line}" ♥ ${Math.floor(heart.points / 100)}/${MAX_HEARTS}`);
    this.clientSend(player.id, 'dialogue', {
      npcId,
      name: npc.name,
      text: line,
      hearts: Math.floor(heart.points / 100),
    });
  }

  private gift(player: PlayerState, npcId: string, itemId: string) {
    const npc = NPCS.find((n) => n.id === npcId);
    const heart = this.state.hearts.get(npcId);
    if (!npc || !heart) return;
    if (!near(player.x, player.y, npc.x, npc.y, 48)) return;
    if (this.getItemQty(itemId) <= 0) {
      this.setAnnouncement('You do not have that gift.');
      return;
    }
    if (heart.giftedDay === this.state.day) {
      this.setAnnouncement(`${npc.name} already got a gift today.`);
      return;
    }
    this.addItem(itemId, -1);
    heart.giftedDay = this.state.day;
    let delta = HEARTS_LIKED_GIFT;
    let reaction = 'liked';
    if (npc.lovedGifts.includes(itemId)) {
      delta = HEARTS_LOVED_GIFT;
      reaction = 'loved';
    } else if (npc.hatedGifts.includes(itemId)) {
      delta = HEARTS_HATED_GIFT;
      reaction = 'hated';
    }
    heart.points = clamp(heart.points + delta, 0, MAX_HEARTS * 100);
    const friendshipText =
      `${npc.name} ${reaction} the ${itemId.replaceAll('_', ' ')}! ♥ ${Math.floor(heart.points / 100)}/${MAX_HEARTS}`;
    this.setAnnouncement(friendshipText);
    this.clientSend(player.id, 'notification', {
      title: npc.name,
      text: friendshipText,
    });
    this.maybeUnlockHeartQuest(npcId);
  }

  private maybeUnlockHeartQuest(npcId: string) {
    const npc = NPCS.find((n) => n.id === npcId);
    const heart = this.state.hearts.get(npcId);
    if (!npc || !heart || npc.heartQuestAt == null || !npc.heartQuestId) return;
    if (Math.floor(heart.points / 100) >= npc.heartQuestAt) {
      if (!this.state.questUnlocked.get(npc.heartQuestId)) {
        this.state.questUnlocked.set(npc.heartQuestId, true);
        this.setAnnouncement(`Quest unlocked: ${QUESTS.find((q) => q.id === npc.heartQuestId)?.title}`);
      }
    }
  }

  private autoUnlockHeartQuests() {
    for (const npc of NPCS) this.maybeUnlockHeartQuest(npc.id);
    // unlock porch paint at 100 rep
    if (this.state.reputation >= 100) this.state.questUnlocked.set('quest_porch_paint', true);
    this.state.questUnlocked.set('quest_attic_clear', true);
  }

  private tryCompleteQuest(player: PlayerState, questId: string, quiet = false) {
    if (this.state.questCompleted.get(questId)) return;
    const quest = QUESTS.find((q) => q.id === questId);
    if (!quest) return;

    // unlock gates
    if (
      questId !== 'quest_attic_clear' &&
      !this.state.questUnlocked.get(questId) &&
      !['quest_office_keys', 'quest_bridge', 'quest_cafe', 'quest_greenhouse'].includes(questId)
    ) {
      // heart quests need unlock; starter ones unlock at board after talk thresholds OR free start
    }

    // Free unlock starter quests on day 1 via board
    if (['quest_office_keys', 'quest_bridge', 'quest_cafe', 'quest_greenhouse'].includes(questId)) {
      this.state.questUnlocked.set(questId, true);
    }

    if (!this.state.questUnlocked.get(questId) && questId !== 'quest_attic_clear') {
      if (!quiet) this.setAnnouncement('That quest is not unlocked yet.');
      return;
    }

    let ok = false;
    if (questId === 'quest_office_keys') {
      ok = near(player.x, player.y, MAP.noticeboard.x, MAP.noticeboard.y, 64);
    } else if (questId === 'quest_bridge') {
      if (this.getItemQty('turnip') >= 2) {
        this.addItem('turnip', -2);
        ok = true;
      }
    } else if (questId === 'quest_cafe') {
      if (this.getItemQty('coffee_bean') >= 1) {
        this.addItem('coffee_bean', -1);
        ok = true;
      }
    } else if (questId === 'quest_greenhouse') {
      if (this.getItemQty('sticky_note_flower') >= 2) {
        this.addItem('sticky_note_flower', -2);
        ok = true;
      }
    } else if (questId === 'quest_porch_paint') {
      ok = this.state.reputation >= 100;
    } else if (questId === 'quest_attic_clear') {
      ok = this.state.festivalDone || this.state.questCompleted.get('quest_attic_clear') === true;
      // completed via boss report
      return;
    }

    if (!ok) {
      if (!quiet) this.setAnnouncement(`Cannot complete ${quest.title} yet.`);
      return;
    }

    this.state.questCompleted.set(questId, true);
    if (quest.rewardCoins) {
      // shared coin pot to first player interacting — split to all
      this.state.players.forEach((p) => {
        p.coins += Math.floor((quest.rewardCoins || 0) / Math.max(1, this.state.players.size));
      });
    }
    if (quest.rewardSeeds) this.addItem(quest.rewardSeeds, 2);
    if (quest.unlocksHouseFloor) {
      this.state.houseFloorUnlocked = Math.max(this.state.houseFloorUnlocked, quest.unlocksHouseFloor);
      this.refreshJobs();
    }
    this.setAnnouncement(`Quest complete: ${quest.title}!`);
    this.checkFestival();
  }

  private acceptJob(player: PlayerState, jobId: string) {
    if (!this.state.availableJobs.get(jobId)) {
      this.setAnnouncement('That job is not on the board.');
      return;
    }
    if (this.state.inspectionActive) {
      this.setAnnouncement('Finish the current inspection first.');
      return;
    }
    const job = JOBS.find((j) => j.id === jobId);
    if (!job) return;
    if (job.isBigHouse && (job.houseFloor || 0) > this.state.houseFloorUnlocked) {
      this.setAnnouncement('Big House floor still locked. Complete more quests!');
      return;
    }
    this.state.activeJobId = jobId;
    this.state.acceptedBy = player.id;
    this.state.inspectionCleared = false;
    const lot = LOTS.find((l) => l.id === job.lotId);
    this.setAnnouncement(
      `${player.name} accepted: ${job.title}. Walk into the orange door at ${lot?.name ?? job.lotId} (or press E).`,
    );
  }

  private enterInspection(player: PlayerState) {
    if (!this.state.activeJobId) {
      this.setAnnouncement('Accept a job from the board first.');
      return;
    }
    const job = JOBS.find((j) => j.id === this.state.activeJobId);
    if (!job) return;

    if (!this.state.inspectionActive) {
      this.state.inspectionActive = true;
      this.state.inspectionCleared = false;
      this.state.monsters.clear();
      this.state.bullets.clear();
      this.spawnMonsters(job);
      this.startPlayerTurn();
    }

    player.inInspection = true;
    this.centerSoul(player);
    if (player.hp <= 0) player.hp = player.maxHp;
    this.setAnnouncement(
      `${player.name} joined the fight! HP ${player.hp}/${player.maxHp} — SPACE to FIGHT, then dodge.`,
    );
    this.broadcast('enterInspection', { jobId: job.id });
  }

  private spawnMonsters(job: (typeof JOBS)[0]) {
    const place = (id: string, type: MonsterType, i: number) => {
      const def = MONSTERS[type];
      const m = new MonsterState();
      m.id = id;
      m.monsterType = type;
      m.x = 160 + (i % 4) * 90;
      m.y = 70;
      m.hp = def.hp;
      m.maxHp = def.hp;
      this.state.monsters.set(m.id, m);
    };
    if (job.monsterTypes.includes(MonsterType.AtticBoss)) {
      place('boss', MonsterType.AtticBoss, 1);
      return;
    }
    for (let i = 0; i < job.monsterCount; i++) {
      place(`m${i}`, job.monsterTypes[i % job.monsterTypes.length], i);
    }
  }

  private leaveInspection(player: PlayerState) {
    player.inInspection = false;
    player.x = 10 * TILE;
    player.y = 12.5 * TILE;
    let anyInside = false;
    this.state.players.forEach((p) => {
      if (p.inInspection) anyInside = true;
    });
    if (!anyInside) {
      this.state.inspectionActive = false;
      this.state.monsters.clear();
      this.state.bullets.clear();
      this.state.inspectionCleared = false;
      this.state.battlePhase = 'player_turn';
      this.setAnnouncement('Party left the inspection. Job still available.');
    }
    this.broadcast('leaveInspection', {});
  }

  private submitReport(player: PlayerState) {
    if (!player.inInspection || !this.state.inspectionCleared || !this.state.activeJobId) {
      this.setAnnouncement('Win the fight before submitting.');
      return;
    }
    const job = JOBS.find((j) => j.id === this.state.activeJobId);
    if (!job) return;

    this.state.players.forEach((p) => {
      p.coins += Math.floor(job.payout / Math.max(1, this.state.players.size));
      if (p.inInspection) {
        p.inInspection = false;
        p.x = 10 * TILE;
        p.y = 12.5 * TILE;
      }
    });
    this.state.reputation += job.reputation;
    this.state.inspectionActive = false;
    this.state.monsters.clear();
    this.state.bullets.clear();
    this.state.jobsCompleted.set(job.id, true);
    this.state.availableJobs.delete(job.id);
    this.refreshJobs();
    if (job.id === 'job_big_attic') {
      this.state.questCompleted.set('quest_attic_clear', true);
      this.state.festivalDone = true;
      this.setAnnouncement('ATTIC CLEAR! Housewarming Festival unlocked!');
      this.broadcast('festival', {});
    } else {
      this.setAnnouncement(`Report submitted: ${job.title}. +$${job.payout}, +${job.reputation} rep.`);
    }
    this.state.activeJobId = '';
    this.state.acceptedBy = '';
    this.state.inspectionCleared = false;
    this.state.battlePhase = 'player_turn';
    this.checkFestival();
    this.broadcast('leaveInspection', {});
  }

  private checkFestival() {
    const required = QUESTS.filter((q) => q.required);
    const done = required.every((q) => this.state.questCompleted.get(q.id));
    if (done && this.state.festivalDone) {
      this.setAnnouncement('ValuePro Valley Grand Reopening! The Big House is alive again.');
    }
  }

  private tryAdvanceDay() {
    const players = [...this.state.players.values()];
    if (players.length === 0) return;
    const sleeping = players.filter((p) => p.sleeping).length;
    if (sleeping < Math.ceil(players.length / 2)) {
      this.setAnnouncement(`Sleeping ${sleeping}/${players.length} — need majority to advance day.`);
      return;
    }
    this.advanceDay();
  }

  private advanceDay() {
    this.state.players.forEach((p) => {
      p.sleeping = false;
      p.hp = p.maxHp;
      p.inInspection = false;
    });
    this.state.sellBoxValue = 0;

    this.state.day += 1;
    this.state.inspectionActive = false;
    this.state.monsters.clear();
    this.state.bullets.clear();
    this.state.activeJobId = '';
    this.state.battlePhase = 'player_turn';
    // Restock a few gifts each morning
    this.addItem('coffee', 1);
    this.addItem('turnip', 1);
    this.refreshJobs();
    this.setAnnouncement(`Dawn of day ${this.state.day}. New jobs posted.`);
    this.broadcast('dayAdvanced', { day: this.state.day });
    this.saveSnapshot();
  }

  private spawnBullet(x: number, y: number, vx: number, vy: number, radius: number, damage: number) {
    const b = new BulletState();
    b.id = `b${this.bulletSeq++}`;
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.radius = radius;
    b.damage = damage;
    this.state.bullets.set(b.id, b);
  }

  private spawnBulletWave() {
    const living: MonsterState[] = [];
    this.state.monsters.forEach((m) => {
      if (m.hp > 0) living.push(m);
    });
    if (living.length === 0) return;

    const box = BATTLE_BOX;
    if (this.state.bullets.size >= 48) return;
    const players = [...this.state.players.values()].filter((p) => p.inInspection);
    const focus = players[Math.floor(Math.random() * Math.max(1, players.length))];
    const m = living[this.patternCursor++ % living.length];
    const def = MONSTERS[m.monsterType as MonsterType];
    const dmg = def?.damage ?? 1;
    const laneWidth = box.w / 4;
    const columnNames = ['far left', 'left-centre', 'right-centre', 'far right'];
    const rowNames = ['top', 'upper-middle', 'lower-middle', 'bottom'];

    switch (m.monsterType) {
        case MonsterType.SpreadsheetSlime: {
          this.state.dodgeHint = `SLIME — ${columnNames[this.safeLane]} column is open`;
          for (let lane = 0; lane < 4; lane++) {
            if (lane === this.safeLane) continue;
            const x = box.x + laneWidth * (lane + 0.5);
            this.spawnBullet(x, box.y - 10, 0, 82, 8, dmg);
          }
          break;
        }
        case MonsterType.ScopeCreepBat: {
          this.state.dodgeHint = `BAT — ${rowNames[this.safeLane]} row is open`;
          const rowHeight = box.h / 4;
          const fromLeft = this.patternCursor % 2 === 0;
          for (let row = 0; row < 4; row++) {
            if (row === this.safeLane) continue;
            const y = box.y + rowHeight * (row + 0.5);
            this.spawnBullet(
              fromLeft ? box.x - 10 : box.x + box.w + 10,
              y,
              fromLeft ? 105 : -105,
              0,
              7,
              dmg,
            );
          }
          break;
        }
        case MonsterType.LegacyBugBeetle: {
          this.state.dodgeHint = 'BEETLE — keep moving; shots aim at your old position';
          if (focus) {
            for (let i = -1; i <= 1; i += 2) {
              const sx = box.x + box.w / 2 + i * 12;
              const sy = box.y - 12;
              const ang = Math.atan2(focus.y - sy, focus.x - sx) + i * 0.1;
              const spd = 88;
              this.spawnBullet(sx, sy, Math.cos(ang) * spd, Math.sin(ang) * spd, 7, dmg);
            }
          }
          break;
        }
        case MonsterType.AtticBoss: {
          this.state.dodgeHint = 'BOSS — escape through the missing part of the ring';
          const cx = box.x + box.w / 2;
          const cy = box.y + box.h / 2;
          const n = 12;
          const gapStart = this.safeLane * 3;
          const radius = Math.min(box.w, box.h) / 2 - 8;
          for (let i = 0; i < n; i++) {
            if (i === gapStart || i === (gapStart + 1) % n || i === (gapStart + 2) % n) continue;
            const ang = (i / n) * Math.PI * 2;
            const sx = cx + Math.cos(ang) * radius;
            const sy = cy + Math.sin(ang) * radius;
            this.spawnBullet(
              sx,
              sy,
              -Math.cos(ang) * 58,
              -Math.sin(ang) * 58,
              8,
              dmg,
            );
          }
          break;
        }
        default: {
          this.state.dodgeHint = 'Move away from the falling shot';
          this.spawnBullet(box.x + box.w / 2, box.y - 8, 0, 82, 7, dmg);
        }
    }
  }

  private tickBattle(dt: number) {
    if (!this.state.inspectionActive || this.state.inspectionCleared) return;
    const now = Date.now();

    if (now >= this.state.battlePhaseEndsAt) {
      if (this.state.battlePhase === 'player_turn') this.startEnemyTurn();
      else if (this.state.battlePhase === 'enemy_turn') this.startPlayerTurn();
    }

    if (this.state.battlePhase !== 'enemy_turn') {
      this.state.bullets.clear();
      return;
    }

    this.spawnAcc += dt;
    const livingCount = [...this.state.monsters.values()].filter((m) => m.hp > 0).length;
    const interval = livingCount >= 4 ? 0.62 : livingCount >= 2 ? 0.72 : 0.82;
    if (this.spawnAcc >= interval) {
      this.spawnAcc = 0;
      this.spawnBulletWave();
    }

    const toDelete: string[] = [];
    this.state.bullets.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const margin = 40;
      if (
        b.x < BATTLE_BOX.x - margin ||
        b.x > BATTLE_BOX.x + BATTLE_BOX.w + margin ||
        b.y < BATTLE_BOX.y - margin ||
        b.y > BATTLE_BOX.y + BATTLE_BOX.h + margin
      ) {
        toDelete.push(b.id);
        return;
      }

      this.state.players.forEach((p) => {
        if (!p.inInspection || p.hp <= 0) return;
        const iframeUntil = this.playerIframes.get(p.id) || 0;
        if (now < iframeUntil) return;
        if (dist(b.x, b.y, p.x, p.y) < b.radius + SOUL_RADIUS) {
          this.playerIframes.set(p.id, now + PLAYER_IFRAME_MS);
          p.hp = Math.max(0, p.hp - b.damage);
          this.setAnnouncement(`* Ow! ${p.name} HP ${p.hp}/${p.maxHp}`);
          toDelete.push(b.id);
          if (p.hp <= 0) {
            p.inInspection = false;
            p.x = 10 * TILE;
            p.y = 12.5 * TILE;
            this.setAnnouncement(`* ${p.name} was defeated! Sleep to recover.`);
            this.broadcast('leaveInspection', { sessionId: p.id });
          }
        }
      });
    });
    for (const id of toDelete) this.state.bullets.delete(id);

    // If everyone knocked out, end battle without reward
    let anyInside = false;
    this.state.players.forEach((p) => {
      if (p.inInspection) anyInside = true;
    });
    if (!anyInside) {
      this.state.inspectionActive = false;
      this.state.monsters.clear();
      this.state.bullets.clear();
      this.state.inspectionCleared = false;
      this.setAnnouncement('* The party wiped. Job still on the board.');
    }
  }

  private clientSend(sessionId: string, type: string, data: unknown) {
    const client = this.clients.find((c) => c.sessionId === sessionId);
    client?.send(type, data);
  }

  private snapshotPath(code: string) {
    return join(SNAPSHOT_DIR, `${code}.json`);
  }

  private saveSnapshot() {
    try {
      if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
      const inv: Record<string, number> = {};
      this.state.inventory.forEach((v, k) => {
        inv[k] = v.qty;
      });
      const farm: Array<{
        index: number;
        state: number;
        cropId: string;
        growthDays: number;
        wateredToday: boolean;
      }> = [];
      this.state.farm.forEach((t) => {
        farm.push({
          index: t.index,
          state: t.state,
          cropId: t.cropId,
          growthDays: t.growthDays,
          wateredToday: t.wateredToday,
        });
      });
      const hearts: Record<string, number> = {};
      this.state.hearts.forEach((h, id) => {
        hearts[id] = h.points;
      });
      const quests: Record<string, boolean> = {};
      this.state.questCompleted.forEach((v, k) => {
        quests[k] = v;
      });
      const unlocked: Record<string, boolean> = {};
      this.state.questUnlocked.forEach((v, k) => {
        unlocked[k] = v;
      });
      const jobsDone: Record<string, boolean> = {};
      this.state.jobsCompleted.forEach((v, k) => {
        jobsDone[k] = v;
      });
      const data = {
        day: this.state.day,
        reputation: this.state.reputation,
        houseFloorUnlocked: this.state.houseFloorUnlocked,
        festivalDone: this.state.festivalDone,
        sellBoxValue: this.state.sellBoxValue,
        inventory: inv,
        farm,
        hearts,
        quests,
        unlocked,
        jobsDone,
      };
      writeFileSync(this.snapshotPath(this.state.roomCode), JSON.stringify(data, null, 2));
    } catch {
      // ignore snapshot errors in MVP
    }
  }

  private tryLoadSnapshot(code: string) {
    try {
      const path = this.snapshotPath(code);
      if (!existsSync(path)) return;
      const data = JSON.parse(readFileSync(path, 'utf8'));
      this.state.day = data.day ?? 1;
      this.state.reputation = data.reputation ?? 0;
      this.state.houseFloorUnlocked = data.houseFloorUnlocked ?? 0;
      this.state.festivalDone = data.festivalDone ?? false;
      this.state.sellBoxValue = data.sellBoxValue ?? 0;
      if (data.inventory) {
        for (const [id, qty] of Object.entries(data.inventory as Record<string, number>)) {
          this.addItem(id, qty - this.getItemQty(id));
        }
      }
      if (Array.isArray(data.farm)) {
        for (const t of data.farm) {
          const tile = this.state.farm.get(String(t.index));
          if (!tile) continue;
          tile.state = t.state;
          tile.cropId = t.cropId || '';
          tile.growthDays = t.growthDays || 0;
          tile.wateredToday = !!t.wateredToday;
        }
      }
      if (data.hearts) {
        for (const [id, points] of Object.entries(data.hearts as Record<string, number>)) {
          const h = this.state.hearts.get(id);
          if (h) h.points = points;
        }
      }
      if (data.quests) {
        for (const [id, v] of Object.entries(data.quests as Record<string, boolean>)) {
          if (v) this.state.questCompleted.set(id, true);
        }
      }
      if (data.unlocked) {
        for (const [id, v] of Object.entries(data.unlocked as Record<string, boolean>)) {
          if (v) this.state.questUnlocked.set(id, true);
        }
      }
      if (data.jobsDone) {
        for (const [id, v] of Object.entries(data.jobsDone as Record<string, boolean>)) {
          if (v) this.state.jobsCompleted.set(id, true);
        }
      }
      this.refreshJobs();
      this.setAnnouncement(`Loaded saved valley for room ${code}.`);
    } catch {
      // ignore
    }
  }
}
