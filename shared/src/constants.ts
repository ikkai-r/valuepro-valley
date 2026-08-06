export const TILE = 32;
export const FARM_COLS = 8;
export const FARM_ROWS = 6;
export const FARM_ORIGIN_X = 4;
export const FARM_ORIGIN_Y = 10;
export const MAX_PLAYERS = 4;
export const MAX_HEARTS = 10;
export const HEARTS_PER_TALK = 5;
export const HEARTS_LOVED_GIFT = 40;
export const HEARTS_LIKED_GIFT = 20;
export const HEARTS_HATED_GIFT = -20;
export const PLAYER_SPEED = 140;
export const ATTACK_COOLDOWN_MS = 420;
export const ATTACK_RANGE = 40;
export const ATTACK_DAMAGE = 3;
export const PLAYER_MAX_HP = 10;
export const PLAYER_IFRAME_MS = 550;
export const MONSTER_ATTACK_COOLDOWN_MS = 900;
export const HURT_FLASH_MS = 420;
export const ROOM_NAME = 'valley';
export const DEFAULT_SERVER = 'ws://localhost:2567';

/** Undertale-style dodge arena (screen coords inside Inspection). */
export const BATTLE_BOX = {
  x: 210,
  y: 145,
  w: 220,
  h: 180,
};
export const SOUL_SPEED = 105;
export const SOUL_RADIUS = 6;
export const PLAYER_TURN_MS = 8500;
export const ENEMY_TURN_MS = 8000;

export const PLAYER_COLORS = [0x4caf50, 0x2196f3, 0xff9800, 0xe91e63];

export enum Tool {
  Hoe = 'hoe',
  Watercan = 'watercan',
  Seeds = 'seeds',
  Sword = 'sword',
  Gift = 'gift',
}

export enum CropId {
  Turnip = 'turnip',
  CoffeeBean = 'coffee_bean',
  StickyNoteFlower = 'sticky_note_flower',
}

export enum TileState {
  Grass = 0,
  Tilled = 1,
  Watered = 2,
  Growing = 3,
  Ready = 4,
}

export enum MonsterType {
  SpreadsheetSlime = 'spreadsheet_slime',
  ScopeCreepBat = 'scope_creep_bat',
  LegacyBugBeetle = 'legacy_bug_beetle',
  AtticBoss = 'attic_boss',
}
