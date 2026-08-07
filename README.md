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

Import this GitHub repo in Vercel and keep **Root Directory** as the repo root — the
root `vercel.json` installs and builds `client/` and serves `client/dist`.

Add env var:
- `VITE_COLYSEUS_URL` = `wss://YOUR-COLYSEUS-HOST` (must be `wss://` in production)

If you'd rather scope the project to the client, set **Root Directory** to `client`
instead; `client/vercel.json` covers that case (output `dist`).

> A `404: NOT_FOUND` after deploy means Vercel produced no static output — usually a
> Root Directory / output directory mismatch between those two setups.

### 2. Server on Render (recommended)

`render.yaml` deploys from the **repo root** (needed because `server/` imports `shared/`).

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect this GitHub repo
2. Apply the `valuepro-valley-server` service (free plan)
3. After deploy, copy the service URL (e.g. `https://valuepro-valley-server.onrender.com`)
4. In Vercel, set `VITE_COLYSEUS_URL` = `wss://valuepro-valley-server.onrender.com` (same host, `wss://`) and redeploy the client

**Before a demo:** open `https://YOUR-SERVICE.onrender.com/health` in a browser and wait until you see `{"ok":true,...}`. Free instances sleep after ~15 minutes idle; that first wake can take 30–50s. Once healthy, keep a tab open or poke `/health` occasionally so it stays warm during the session.

Other hosts (`Dockerfile` / Fly / Railway) are also wired if you switch later. The server reads `PORT` from the environment and falls back to `2567`.

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
| B | Rest at bunk (the whole party sleeps and advances the day) |
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
