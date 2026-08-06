# ValuePro Valley — Asset Contract

Drop replacement art into `client/public/assets/` using these names and sizes. The MVP ships with generated placeholder textures from `BootScene` until you add files and wire them in `BootScene.preload()`.

## Current tileset (wired)

Cozy RPG TopDown 16×16 by **Lakiiah** — see `client/public/assets/tiles/CREDIT.txt`.

| File | Use |
|---|---|
| `tiles/ground.png` | Grass, path, dirt, trees, bushes, rocks, flowers |
| `tiles/house.png` | Houses, sign, crate, barrel, fences |

Drawn at **2×** (16→32) to match world `TILE`.

## Player sprites

Custom player (not a coworker). Provide male + female variants:

| File | Layout |
|---|---|
| `player_female.png` | 4-direction walk, 4 frames each. Frame **32×32**. Order: down, left, right, up. |
| `player_male.png` | Same layout |

Co-op tint/colour variants can come later (`player_female_0..3`).

## NPC sprites (coworkers)

**Support:** `npc_maillene.png`, `npc_al.png`, `npc_sudhir.png`, `npc_david.png`, `npc_savi.png`, `npc_gabe.png`  
**R&D:** `npc_stewart.png`, `npc_zach.png`, `npc_kat.png`, `npc_rica.png`, `npc_elaine.png`, `npc_ed.png`

Prefer 32×32 idle (walk optional).
## Buildings / interiors

| File | Notes |
|---|---|
| `big_house_ext.png` | Exterior ~96×64 |
| `interior_template.png` | Reusable inspection room tiles |
| `big_house_foyer.png` / `kitchen` / `hall` / `attic` | Optional per-floor art |

## Monsters (wired for combat)

Free packs under `client/public/assets/enemies/`:

| Pack | Files | Use |
|---|---|---|
| Dark Fantasy Bat (with VFX) | `bat/Bat-IdleFly.png`, `Bat-Hurt.png`, `Bat-Attack2.png` | Scope-Creep Bat idle / hurt / attack |
| Flying Forest Enemy3 | `forest/Enemy3-Idle.png`, `Enemy3-Hit.png`, `Enemy3-AttackSmashStart.png`, `Enemy3-AttackSmashLoop.png` | Slime / beetle / attic boss (tinted + scaled) |

All sheets are **64×64** frames. See `enemies/CREDIT.txt`.

Optional replacements can keep the same filenames/frame size.

## UI

| File | Notes |
|---|---|
| `ui_dialogue.png` | 9-slice dialogue frame |
| `ui_heart.png` | 10×10 or 16×16 |
| `ui_panel.png` | Job/quest panel frame |
| `ui_tools.png` | Hoe, watercan, seeds, sword icons |

## Wiring

In `BootScene.preload()`:

```ts
this.load.spritesheet('player_0', '/assets/player_0.png', { frameWidth: 32, frameHeight: 32 });
// …
```

Then swap `circle` placeholders in `TownScene` / `InspectionScene` for sprites.
