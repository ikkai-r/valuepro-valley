# ValuePro Valley

Co-op browser game for 2–4 coworkers. Gift NPCs for friendship hearts, take Help Wanted inspections (Undertale-style dodge fights), and restore the Big House by finishing every job.

## Run locally

```bash
# install once
npm run install:all

# terminal 1 — Colyseus server
npm run dev:server

# terminal 2 — Phaser client
npm run dev:client
```

Open http://localhost:5173 — **CREATE**, share the room code, friends **JOIN**.

## Deploy (Vercel client + hosted Colyseus)

Vercel only serves the **client**. The Colyseus WebSocket **server** needs a separate host (Railway, Render, Fly.io, etc.).

### 1. Client on Vercel

1. Import this GitHub repo in Vercel.
2. Set **Root Directory** to `client`.
3. Build command: `npm run build` (uses `client/vercel.json`).
4. Add env var:
   - `VITE_COLYSEUS_URL` = `wss://YOUR-COLyseus-HOST` (must be `wss://` in production)

### 2. Server elsewhere

Deploy `server/` with Node, expose port `2567` (or whatever your host maps), and enable WebSockets. Point `VITE_COLYSEUS_URL` at that public `wss://` URL.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move |
| 1–6 | Select gift (hotbar) |
| Space | Attack (town / fight) |
| E | Interact (NPCs, Help Wanted, cafe coffee, submit report) |
| J | Help Wanted job board |
| Q | Job progress |
| C | Friendship hearts (town) / drink coffee (your fight turn) |
| G | Gift nearest NPC |
| H | Cycle gift item |
| B | Rest at bunk (majority advances day) |
| L / X | Leave inspection |

## Layout

```
valuepro-valley/
  client/     Vite + Phaser 3  → Vercel
  server/     Colyseus room    → Railway/Render/Fly
  shared/     jobs, NPCs, constants
  ASSETS.md   art drop-in contract
```

Snapshots save under `server/.snapshots/<ROOMCODE>.json`.

## Art credit

Tiles: [Cozy RPG Tileset — Lakiiah](https://lakiah.itch.io/) (`client/public/assets/tiles/`).
Enemy packs: MonoPixelArt Dark Fantasy / Flying Forest free samples.
