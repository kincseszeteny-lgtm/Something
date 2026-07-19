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
- Turn-based combat: 2 player actions per round (Attack/Block/Skill/Rush)
  followed by 2 enemy actions (randomly picked from the alive trio each
  round, so no one enemy is guaranteed to act), ki regen each round,
  blocking, critical hits from Luck, status effects (blind/paralyse). Your
  ki starts full (60/60) at the start of every match.
- Enemies now have all 10 skills available (except the two race-locked
  transforms, Power Up and Ultimate Form — those are explicitly
  Saiyan/Human-only in the player's own rules and don't fit generic mooks
  with no defined race) but use them rarely: each enemy has its own ki
  pool that starts empty and regens each round, and even when affordable
  there's only a 15% chance per turn they'll reach for a skill instead of
  attack/block/rush. If they land Blindness or Paralyse on you, your next
  turn(s) show a forced "you cannot act" skip instead of the usual action
  buttons — mirroring how it already worked when you land those on them.
  Enemy trio HP is doubled from the original scaling to compensate for
  the extra pressure they can now put on you.
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
- **Walkable hub**: a real top-down scene (not a menu) you move around with
  a d-pad or arrow/WASD keys, inside a bounded playable area with a fence
  boundary — laid out to match the hand-drawn map: House (top), Training
  Dummy (top-left), Shop (left wall), Crops (mid-right), Portal (bottom).
  Walk within range of something and tap it to open a contextual panel:
  - **House**: upgrade your home (diamonds), same 5-tier progression as
    before, now tied to the walkable icon instead of a button.
  - **Training Dummy**: either a quick one-off practice hit (real
    stats/crit chance, no match needed), or **Enter Training Match** to
    drop into an actual fight against the dummy — infinite HP (it's
    never reduced, not just a big number, so it can never die), all 10
    skills unlocked regardless of your chosen 4-skill loadout, and an
    **Exit Training** button always visible so you can leave the instant
    you're done, at any point, even mid-animation. No win/lose, no
    XP/coins — it's a sandbox, not a real match. The dummy never attacks
    back (always "blocks" harmlessly on its turn) so nothing here can
    hurt you either.
  - **Shop**: opens the existing shop screen.
  - **Crops**: a small idle mechanic — plant on character creation, ready
    to harvest for coins after a timer, then auto-replants.
  - **Portal**: opens skill select → a match, same as before.
  Attributes (not part of the hand-drawn map) stays a fixed button below
  the scene since it has no natural physical location in the hub.

## Art style

Characters are genuine pixel art, not smooth vector shapes: each one is
drawn algorithmically onto a tiny 22x30 low-resolution canvas, outlined
(black silhouette dilated 1px), then scaled up with nearest-neighbor
sampling so edges stay crisp and blocky — the same technique behind
real retro sprites, aiming for a chibi GBA-era look (Dragon Ball Advanced
Adventure/Buu's Fury). Idle characters have a subtle 2-frame bob. "Fancy"
skill animations are still canvas VFX (particle bursts, screen shake,
flash, floating damage numbers) layered on top, not hand-animated frames.
See `drawCharLowRes` / `makeOutlined` in `src/draw.js`.

The hub scene uses the same technique for its structures — House (with
6 visual tiers matching upgrade level), Training Dummy, Shop, Crops
(distinct growing/ready sprites), and Portal (an animated swirling
vortex) are all hand-coded low-res pixel icons, not emoji, outlined and
scaled up the same way. The ground is a tiled pixel grass texture with
dirt paths radiating from a central point to every location, and a
wooden post-and-rail fence around the boundary. See `HUB_ICON_SPECS` /
`drawHubGround` / `drawHubFence` in `src/draw.js`.

The hub also has decorative trees, bushes, rocks, and flower patches
(`HUB_DECORATIONS` in `src/main.js`) plus a village well at the path
convergence point, and real depth: every ground object (structures,
decorations, the player) gets a soft drop shadow, and the whole scene
is drawn in y-sorted order each frame (`drawHubScene`'s `sortables`
list) so things lower on screen correctly draw in front of things
higher up — the player visibly walks behind a tree they're above and
in front of one they're below, instead of everything being flat.

Matches get one of 3 pixel-art battle backgrounds, picked randomly each
time you fight: **Desert** (sun, clouds, rolling dunes, cacti), **Forest**
(cliffs on both sides, a cascading waterfall and pool, layered pine
trees), and **Ocean** (you're standing on the water — wave-streaked
blue bands, a distant island, no land in sight). Each is drawn once at
110x65 onto an offscreen canvas and cached (`drawBattleBackground` in
`src/draw.js`), then scaled up with nearest-neighbor every frame — cheap
even though the arena redraws constantly for the idle-bob animation.

## Character customization

Saiyan characters get a tail — a small curled shape at the hip, colored
to match hair (as in the source material), drawn behind the torso/arm so
it reads as attached rather than floating. Gender is no longer a label
with no effect: female characters get a visibly narrower waist taper and
a small eyelash detail; male characters keep the original proportions.
Both are handled in `drawCharLowRes` (`src/draw.js`) via `race`/`gender`
options threaded through from character creation, the hub, and the
arena.

## Wardrobe

A new **Wardrobe** screen (button next to Attributes in the hub) sells
and equips real clothing across all four requested categories — Tops
(Tank Top, Training Shirt, Battle Vest), Bottoms (Cargo Pants, Training
Shorts, Combat Skirt), One-Piece (Battle Dress, Jumpsuit), and Outerwear
(Travel Coat, Battle Jacket) — 10 items total, each with its own pixel
art, not a palette swap of the same shape. Tops/Bottoms can be worn
together; equipping a One-Piece clears both (and vice versa); Outerwear
is a separate layer on top of whatever else is worn and doesn't conflict
with anything. Shape actually changes per item — skirts flare and leave
calves bare, the dress covers down to the knee with its own hemline, tank
tops leave arms bare, jackets/coats show a bit of what's underneath
through an open front — this isn't just recoloring the base gi. Buy with
coins in the Wardrobe screen, and the equipped result is visible
everywhere the character renders (creation preview, hub, arena).
Old saves from before this feature don't have `equipment`/`ownedClothing`
fields — `loadCharacter` backfills sensible defaults so they don't crash.

## What's intentionally out of scope for this pass
- Only 1 enemy trio "biome" exists (reskinned by level/scaling); no curated
  per-level enemy roster across all 100 levels.

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
- Crops (new, not in the original brief — added because the hub sketch
  included it): 90-second grow timer, 20–40 coins per harvest, placeholder
  values since nothing was specified.
- Enemy skill-use odds (15% per turn when affordable) and enemy ki pool
  (starts at 0, regens like the player's) are both judgment calls to hit
  "use them but not frequently" — not specified numerically in the brief.
- Wardrobe item costs (55–150 coins) and which specific garments exist in
  each category are new, not specified beyond the four category names.
