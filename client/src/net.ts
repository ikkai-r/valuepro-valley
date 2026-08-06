import type { Room } from 'colyseus.js';
import type { PlayerGender } from '@shared/types';

export type ValleyRoom = Room;

let room: ValleyRoom | null = null;
let sessionId = '';
let playerName = '';
let playerGender: PlayerGender = 'female';

export function setRoom(r: ValleyRoom | null) {
  room = r;
  sessionId = r?.sessionId || '';
}

export function getRoom() {
  return room;
}

export function getSessionId() {
  return sessionId;
}

export function setPlayerName(name: string) {
  playerName = name.slice(0, 16);
}

export function getPlayerName() {
  return playerName;
}

export function setPlayerGender(gender: PlayerGender) {
  playerGender = gender === 'male' ? 'male' : 'female';
}

export function getPlayerGender(): PlayerGender {
  return playerGender;
}

export function sendInput(payload: Record<string, unknown>) {
  room?.send('input', payload);
}
