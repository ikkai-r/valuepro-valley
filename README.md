# ValuePro Valley

Co-op browser game for 2–4 coworkers. Gift NPCs for friendship hearts, take ValuePro job-board inspections (Undertale-style dodge fights), and restore the Big House.

## Run

```bash
# install once
npm run install:all

# terminal 1 — Colyseus server
npm run dev:server

# terminal 2 — Phaser client
npm run dev:client
```

Open http://localhost:5173 — **CREATE**, share the room code, friends **JOIN**.

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move |
| 1 / 2 | Sword / Gift tool |
| 3–6 | Select gift item (also switches to Gift) |
| Space | Attack (sword) or gift nearest NPC (gift tool) |
| E | Interact (NPCs, Jobs, Quests, submit report) |
| J | Help Wanted job board |
| Q | Quest log |
| C | Friendship hearts |
| G | Gift nearest NPC |
| H | Cycle gift item |
| B | Rest at your bunk (majority advances day) |
| L | Leave inspection |

## Layout

```
valuepro-valley/
  client/     Vite + Phaser 3
  server/     Colyseus room + JSON snapshots
  shared/     jobs, NPCs, quests, constants
  ASSETS.md   art drop-in contract
```

Snapshots save under `server/.snapshots/<ROOMCODE>.json` so a room code can resume quest progress.

## Art credit

Tiles: [Cozy RPG Tileset — Lakiiah](https://lakiah.itch.io/) (`client/public/assets/tiles/`).
