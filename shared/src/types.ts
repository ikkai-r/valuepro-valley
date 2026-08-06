import type { CropId, MonsterType, Tool } from './constants';

export interface CropDef {
  id: CropId;
  name: string;
  daysToGrow: number;
  sellPrice: number;
  seedCost: number;
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  team: 'support' | 'rnd';
  x: number;
  y: number;
  color: number;
  greetings: string[];
  lovedGifts: string[];
  likedGifts: string[];
  hatedGifts: string[];
  heartQuestAt?: number;
  heartQuestId?: string;
}

export type PlayerGender = 'female' | 'male';


export interface QuestDef {
  id: string;
  title: string;
  description: string;
  required?: boolean;
  unlocksHouseFloor?: number;
  rewardCoins?: number;
  rewardSeeds?: CropId;
}

export interface JobDef {
  id: string;
  title: string;
  flavour: string;
  lotId: string;
  payout: number;
  reputation: number;
  monsterCount: number;
  monsterTypes: MonsterType[];
  isTutorial?: boolean;
  isBigHouse?: boolean;
  houseFloor?: number;
}

export interface MonsterDef {
  type: MonsterType;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  color: number;
  radius: number;
}

export interface LotDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlayerInput {
  dx: number;
  dy: number;
  interacting?: boolean;
  attacking?: boolean;
  tool?: Tool;
  giftItem?: string;
}

export type ClientMessage =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'setTool'; tool: Tool; seedCrop?: CropId }
  | { type: 'useTool' }
  | { type: 'attack' }
  | { type: 'interact' }
  | { type: 'talk'; npcId: string }
  | { type: 'gift'; npcId: string; itemId: string }
  | { type: 'acceptJob'; jobId: string }
  | { type: 'enterInspection' }
  | { type: 'leaveInspection' }
  | { type: 'submitReport' }
  | { type: 'drinkCoffee' }
  | { type: 'sleep' }
  | { type: 'wake' }
  | { type: 'completeQuest'; questId: string }
  | { type: 'setName'; name: string };
