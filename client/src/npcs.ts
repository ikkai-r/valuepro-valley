import Phaser from 'phaser';
import { NPCS } from '@shared/index';

export function npcTextureKey(npcId: string) {
  return `npc_${npcId}`;
}

export function preloadNpcSheets(scene: Phaser.Scene) {
  for (const npc of NPCS) {
    scene.load.image(npcTextureKey(npc.id), `/assets/npcs/${npc.id}.png`);
  }
}
