import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

export class PlayerState extends Schema {
  id = '';
  name = 'Player';
  gender = 'female';
  x = 8 * 32;
  y = 12 * 32;
  colorIndex = 0;
  hp = 10;
  maxHp = 10;
  tool = 'sword';
  seedCrop = 'turnip';
  sleeping = false;
  inInspection = false;
  coins = 50;
  facing = 'down';
  attackFlash = 0;
  /** Index into MAP.bedSlots; -1 means no bunk assigned yet. */
  bedSlot = -1;
}
defineTypes(PlayerState, {
  id: 'string',
  name: 'string',
  gender: 'string',
  x: 'number',
  y: 'number',
  colorIndex: 'number',
  hp: 'number',
  maxHp: 'number',
  tool: 'string',
  seedCrop: 'string',
  sleeping: 'boolean',
  inInspection: 'boolean',
  coins: 'number',
  facing: 'string',
  attackFlash: 'number',
  bedSlot: 'number',
});

export class FarmTileState extends Schema {
  index = 0;
  state = 0;
  cropId = '';
  growthDays = 0;
  wateredToday = false;
}
defineTypes(FarmTileState, {
  index: 'number',
  state: 'number',
  cropId: 'string',
  growthDays: 'number',
  wateredToday: 'boolean',
});

export class NpcHeartState extends Schema {
  npcId = '';
  points = 0;
  talkedDay = -1;
  giftedDay = -1;
}
defineTypes(NpcHeartState, {
  npcId: 'string',
  points: 'number',
  talkedDay: 'number',
  giftedDay: 'number',
});

export class MonsterState extends Schema {
  id = '';
  monsterType = '';
  x = 0;
  y = 0;
  hp = 1;
  maxHp = 1;
  /** Client flashes the sprite red while Date.now() < hurtFlash. */
  hurtFlash = 0;
}
defineTypes(MonsterState, {
  id: 'string',
  monsterType: 'string',
  x: 'number',
  y: 'number',
  hp: 'number',
  maxHp: 'number',
  hurtFlash: 'number',
});

export class BulletState extends Schema {
  id = '';
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 6;
  damage = 1;
}
defineTypes(BulletState, {
  id: 'string',
  x: 'number',
  y: 'number',
  vx: 'number',
  vy: 'number',
  radius: 'number',
  damage: 'number',
});

export class InventoryItem extends Schema {
  itemId = '';
  qty = 0;
}
defineTypes(InventoryItem, {
  itemId: 'string',
  qty: 'number',
});

export class ValleyState extends Schema {
  players = new MapSchema<PlayerState>();
  farm = new MapSchema<FarmTileState>();
  hearts = new MapSchema<NpcHeartState>();
  inventory = new MapSchema<InventoryItem>();
  monsters = new MapSchema<MonsterState>();
  bullets = new MapSchema<BulletState>();
  questCompleted = new MapSchema<boolean>();
  questUnlocked = new MapSchema<boolean>();
  availableJobs = new MapSchema<string>();
  jobsCompleted = new MapSchema<boolean>();
  activeJobId = '';
  acceptedBy = '';
  inspectionActive = false;
  inspectionCleared = false;
  /** player_turn | enemy_turn | cleared */
  battlePhase = 'player_turn';
  battlePhaseEndsAt = 0;
  dodgeHint = '';
  day = 1;
  reputation = 0;
  houseFloorUnlocked = 0;
  festivalDone = false;
  sellBoxValue = 0;
  roomCode = '';
  lastAnnouncement = 'Welcome to ValuePro Valley!';
}
defineTypes(ValleyState, {
  players: { map: PlayerState },
  farm: { map: FarmTileState },
  hearts: { map: NpcHeartState },
  inventory: { map: InventoryItem },
  monsters: { map: MonsterState },
  bullets: { map: BulletState },
  questCompleted: { map: 'boolean' },
  questUnlocked: { map: 'boolean' },
  availableJobs: { map: 'string' },
  jobsCompleted: { map: 'boolean' },
  activeJobId: 'string',
  acceptedBy: 'string',
  inspectionActive: 'boolean',
  inspectionCleared: 'boolean',
  battlePhase: 'string',
  battlePhaseEndsAt: 'number',
  dodgeHint: 'string',
  day: 'number',
  reputation: 'number',
  houseFloorUnlocked: 'number',
  festivalDone: 'boolean',
  sellBoxValue: 'number',
  roomCode: 'string',
  lastAnnouncement: 'string',
});
