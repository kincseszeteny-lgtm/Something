# Dragon Bell

A browser-based, DBZ-inspired turn-based fighter/RPG. Vanilla HTML/CSS/JS,
no build step, no external dependencies — open `index.html` through a
static server (ES modules need `http://`, not `file://`):

```bash
cd game
python3 -m http.server 8080
# open http://localhost:8080
```

Progress autosaves to `localStorage`.

## What's implemented (vertical slice)

- Title screen → character creation (Saiyan/Human, name, gender, skin/hair/gi
  color, hairstyle, height/build sliders clamped to a Xenoverse-2-like limited
  range) → hub → skill select → full turn-based match → win/lose → XP/leveling
  → attribute upgrades → coin shop.
- Turn-based combat: 3 player actions per round (Attack/Block/Skill/Rush)
  followed by 3 enemy actions (one per trio member), ki regen each round,
  blocking, critical hits from Luck, status effects (blind/paralyse).
- All 10 skills from the brief, including the 4-stage stacking Super Saiyan
  transformation (Saiyan-only, hair turns blonde) and Ultimate Form
  (Human-only, character glows), plus AoE (Spirit Sphere), multi-hit (Ki
  Rush), heal, and debuffs (Blindness/Paralyse).
- Rush minigame: press Rush, then Strike inside the 5s–6s window for a full
  5-hit combo; miss the window and you land a single weak hit.
- XP (3/kill, 10 XP/level, capped at level 100), skill points, coins, a
  6-attribute upgrade system, and a coin shop (skill points, med kits, gi
  color unlocks, diamonds for a 5-tier home upgrade).
- Enemies (a trio) scale with player level so matches get harder as you
  progress, per the brief.

## What's intentionally out of scope for this pass

- **Art**: there are no illustrated sprites — characters are drawn
  procedurally on `<canvas>` (colored shapes in a DBZ-ish palette). "Fancy"
  skill animations are CSS/canvas VFX (particle bursts, screen shake, flash,
  floating damage numbers), not hand-animated frames.
- **Hub**: currently a menu screen (Portal / Attributes / Shop buttons), not
  a free-roam walk-around space. The brief asked for something you can "go
  around and interact with" — that's a meaningfully bigger feature (a real
  2D/3D explorable scene) and was left for a follow-up pass.
- Only 1 enemy trio "biome" exists (reskinned by level/scaling); no curated
  per-level enemy roster across all 100 levels.
- Clothes/cosmetics are a single gi-color unlock, not a full outfit system.

## Assumptions filled in (not fully specified in the brief)

- Dragon Punch ki cost: 18. Heal ki cost: 22, heals 35% of max HP. Ki Rush:
  20 ki, 4 hits of 10 damage.
- Rush (basic barrage): 8 damage/hit, up to 5 hits on a successful timing
  window, scaled by Strength.
- Basic Attack: 12 damage, can crit. Block: absorbs 10 damage off the next
  incoming hit.
- "1 upgrade point = 15% more damage/heal etc." in the brief conflicts with
  the explicit per-attribute percentages listed right below it (5%, 5%, 3%,
  2%, 4%, 2%) — implemented the explicit per-attribute numbers, since they're
  unambiguous and the 15% line reads like an imprecise summary.
- Enemy trio stats scale off player level: `hp ≈ 28 + level*4.2`,
  `damage ≈ 5 + level*0.7` (slight variance per enemy).
- Shop prices beyond skill points (100 coins, as specified) are placeholders:
  med kit 50, gi color 100, diamond 100. Match rewards: 3 XP per kill,
  40–90ish coins on a win (scales slightly with level).
