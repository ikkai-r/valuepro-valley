import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { ValleyRoom } from './rooms/ValleyRoom.js';
import { ROOM_NAME } from '../../shared/src/index.js';

const port = Number(process.env.PORT || 2567);
const app = express();
app.use(cors());
app.get('/health', (_req, res) => res.json({ ok: true, game: 'ValuePro Valley' }));

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, ValleyRoom);

gameServer.listen(port);
console.log(`ValuePro Valley server listening on ws://localhost:${port}`);
