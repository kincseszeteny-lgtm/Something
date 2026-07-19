import {
  RACES, ATTRIBUTES, SKILLS, skillById, HAIR_STYLES, APPEARANCE_LIMITS,
  SKIN_COLORS, HAIR_COLORS, GI_COLORS, SHOP_ITEMS, HUB_UPGRADE_COST_DIAMONDS,
  MAX_HUB_LEVEL, MAX_LEVEL, XP_PER_LEVEL,
} from './data.js';
import {
  newCharacter, newSaveState, saveGame, loadCharacter, derivedStats,
  upgradeAttribute, addXP,
} from './state.js';
import {
  createMatch, playerAttack, playerBlock, playerUseSkill, canUseSkill,
  playerResolveRush, playerTurnDone, runEnemyAction, endRound,
  RUSH_WINDOW_START, RUSH_WINDOW_END,
} from './combat.js';
import { drawCharacter, drawEnemy, FxLayer } from './draw.js';

const root = document.getElementById('app');

const HUB_NAMES = ['Run-down Shack', 'Small Hut', 'Modest House', 'Cozy Home', 'Fine Estate', 'Fortress'];
const ENEMY_XS = [250, 325, 400];
const HUB_EMOJI = ['\u{1F3DA}\u{FE0F}', '\u{1F6D6}', '\u{1F3E0}', '\u{1F3E1}', '\u{1F3D8}\u{FE0F}', '\u{1F3F0}'];

const state = newSaveState();
let fx = null;
let matchTargetId = null;
let useMedsThisMatch = false;
let equipSelection = [];
let rushTimer = null;
let rushStartedAt = 0;
let inputLocked = false;

function init() {
  const saved = loadCharacter();
  if (saved) {
    state.character = saved;
    state.screen = 'hub';
  }
  render();
}

function go(screen) {
  state.screen = screen;
  render();
}

function render() {
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'screen';
  root.appendChild(el);
  switch (state.screen) {
    case 'title': return renderTitle(el);
    case 'create': return renderCreate(el);
    case 'hub': return renderHub(el);
    case 'skillSelect': return renderSkillSelect(el);
    case 'match': return renderMatch(el);
    case 'result': return renderResult(el);
    case 'stats': return renderStats(el);
    case 'shop': return renderShop(el);
    default: return renderTitle(el);
  }
}

// ---------- TITLE ----------
function renderTitle(el) {
  const hasSave = !!loadCharacter();
  el.innerHTML = `
    <h1 class="title-logo">DRAGON BELL</h1>
    <p class="title-tagline">let's see what's coming...</p>
    <div class="col" style="margin-top:40px">
      ${hasSave ? '<button class="btn wide" id="continueBtn">Continue</button>' : ''}
      <button class="btn ${hasSave ? 'secondary' : ''} wide" id="newBtn">New Game</button>
    </div>
  `;
  el.querySelector('#newBtn').onclick = () => {
    if (hasSave && !confirm('Starting a new game will erase your current save. Continue?')) return;
    state.character = newCharacter();
    go('create');
  };
  if (hasSave) {
    el.querySelector('#continueBtn').onclick = () => { state.character = loadCharacter(); go('hub'); };
  }
}

// ---------- CHARACTER CREATION ----------
function renderCreate(el) {
  const c = state.character;
  el.innerHTML = `
    <h2 class="center">Create Your Warrior</h2>
    <canvas id="charCanvas" width="200" height="240" style="margin:0 auto;display:block"></canvas>

    <div class="panel">
      <div class="dim" style="margin-bottom:8px">Race</div>
      <div class="row">
        <div class="pick-card ${c.race === 'saiyan' ? 'selected' : ''}" data-race="saiyan">
          <div class="emoji">\u{1F44A}</div><div>Saiyan</div>
          <div class="dim">Super Saiyan transformations</div>
        </div>
        <div class="pick-card ${c.race === 'human' ? 'selected' : ''}" data-race="human">
          <div class="emoji">\u{1F9CD}</div><div>Human</div>
          <div class="dim">Ultimate Form power</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="dim" style="margin-bottom:8px">Name</div>
      <input type="text" id="nameInput" maxlength="16" placeholder="Enter name" value="${c.name}" />
      <div class="row" style="margin-top:10px">
        <button class="btn ${c.gender === 'male' ? '' : 'secondary'} grow small" data-gender="male">Male</button>
        <button class="btn ${c.gender === 'female' ? '' : 'secondary'} grow small" data-gender="female">Female</button>
      </div>
    </div>

    <div class="panel col">
      <div class="dim">Skin Tone</div>
      <div class="swatch-row" id="skinRow">
        ${SKIN_COLORS.map((col) => `<div class="swatch ${c.appearance.skinColor === col ? 'selected' : ''}" style="background:${col}" data-skin="${col}"></div>`).join('')}
      </div>
      <div class="dim">Hair Color</div>
      <div class="swatch-row" id="hairRow">
        ${HAIR_COLORS.map((col) => `<div class="swatch ${c.appearance.hairColor === col ? 'selected' : ''}" style="background:${col}" data-hair="${col}"></div>`).join('')}
      </div>
      <div class="dim">Gi Color</div>
      <div class="swatch-row" id="giRow">
        ${GI_COLORS.map((col) => `<div class="swatch ${c.appearance.giColor === col ? 'selected' : ''}" style="background:${col}" data-gi="${col}"></div>`).join('')}
      </div>
      <div class="dim">Hairstyle</div>
      <div class="row wrap" id="hairStyleRow">
        ${HAIR_STYLES.map((s) => `<button class="btn small ${c.appearance.hairStyle === s ? '' : 'secondary'}" data-hairstyle="${s}">${s}</button>`).join('')}
      </div>
      <div class="dim">Height</div>
      <input type="range" id="heightRange" min="${APPEARANCE_LIMITS.height.min * 100}" max="${APPEARANCE_LIMITS.height.max * 100}" value="${c.appearance.height * 100}" />
      <div class="dim">Build</div>
      <input type="range" id="buildRange" min="${APPEARANCE_LIMITS.build.min * 100}" max="${APPEARANCE_LIMITS.build.max * 100}" value="${c.appearance.build * 100}" />
    </div>

    <button class="btn wide" id="confirmBtn" ${c.race && c.name.trim() ? '' : 'disabled'}>Begin Journey</button>
  `;

  const preview = () => drawCharacter(document.getElementById('charCanvas').getContext('2d'), 100, 220, c.appearance, {});
  const redrawAll = () => { preview(); };

  el.querySelectorAll('[data-race]').forEach((n) => n.onclick = () => { c.race = n.dataset.race; renderCreate(el); });
  el.querySelector('#nameInput').oninput = (e) => {
    c.name = e.target.value;
    el.querySelector('#confirmBtn').disabled = !(c.race && c.name.trim());
  };
  el.querySelectorAll('[data-gender]').forEach((n) => n.onclick = () => { c.gender = n.dataset.gender; renderCreate(el); });
  el.querySelectorAll('[data-skin]').forEach((n) => n.onclick = () => { c.appearance.skinColor = n.dataset.skin; renderCreate(el); });
  el.querySelectorAll('[data-hair]').forEach((n) => n.onclick = () => { c.appearance.hairColor = n.dataset.hair; renderCreate(el); });
  el.querySelectorAll('[data-gi]').forEach((n) => n.onclick = () => { c.appearance.giColor = n.dataset.gi; renderCreate(el); });
  el.querySelectorAll('[data-hairstyle]').forEach((n) => n.onclick = () => { c.appearance.hairStyle = n.dataset.hairstyle; renderCreate(el); });
  el.querySelector('#heightRange').oninput = (e) => { c.appearance.height = e.target.value / 100; preview(); };
  el.querySelector('#buildRange').oninput = (e) => { c.appearance.build = e.target.value / 100; preview(); };

  el.querySelector('#confirmBtn').onclick = () => {
    if (!c.race || !c.name.trim()) return;
    c.unlockedGiColors = [c.appearance.giColor];
    saveGame(state);
    go('hub');
  };

  redrawAll();
}

// ---------- HUB ----------
function renderHub(el) {
  const c = state.character;
  const hubIdx = Math.min(c.hubLevel, HUB_NAMES.length - 1);
  const xpPct = Math.round((c.xp / XP_PER_LEVEL) * 100);
  el.innerHTML = `
    <div class="row between">
      <div><strong>${c.name}</strong> <span class="dim">${RACES[c.race].name}</span></div>
      <div class="badge gold">Lv ${c.level}${c.level >= MAX_LEVEL ? ' MAX' : ''}</div>
    </div>
    <div class="bar-outer"><div class="bar-inner xp" style="width:${xpPct}%"></div><div class="bar-label">${c.xp}/${XP_PER_LEVEL} XP</div></div>

    <div class="hub-scene">
      <div class="hub-badge">${HUB_NAMES[hubIdx]}</div>
      <div class="hub-house">${HUB_EMOJI[hubIdx]}</div>
    </div>

    <canvas id="hubCharCanvas" width="160" height="200" style="margin:0 auto;display:block"></canvas>

    <div class="row wrap" style="justify-content:center">
      <span class="badge gold">\u{1FA99} ${c.coins} coins</span>
      <span class="badge blue">\u{1F48E} ${c.diamonds} diamonds</span>
      <span class="badge">⭐ ${c.skillPoints} skill pts</span>
      <span class="badge">\u{1F9F0} ${c.meds} med kits</span>
    </div>

    <button class="btn wide" id="portalBtn">\u{1F300} Enter Portal</button>
    <div class="row">
      <button class="btn secondary grow" id="statsBtn">Attributes</button>
      <button class="btn secondary grow" id="shopBtn">Shop</button>
    </div>
    ${c.diamonds >= HUB_UPGRADE_COST_DIAMONDS && c.hubLevel < MAX_HUB_LEVEL ? `<button class="btn blue wide" id="upgradeHubBtn">Upgrade Home (${HUB_UPGRADE_COST_DIAMONDS} \u{1F48E})</button>` : ''}
  `;
  drawCharacter(document.getElementById('hubCharCanvas').getContext('2d'), 80, 180, c.appearance, {});

  el.querySelector('#portalBtn').onclick = () => { equipSelection = []; useMedsThisMatch = false; go('skillSelect'); };
  el.querySelector('#statsBtn').onclick = () => go('stats');
  el.querySelector('#shopBtn').onclick = () => go('shop');
  const upBtn = el.querySelector('#upgradeHubBtn');
  if (upBtn) upBtn.onclick = () => {
    if (c.diamonds < HUB_UPGRADE_COST_DIAMONDS || c.hubLevel >= MAX_HUB_LEVEL) return;
    c.diamonds -= HUB_UPGRADE_COST_DIAMONDS;
    c.hubLevel += 1;
    saveGame(state);
    renderHub(el);
  };
}

// ---------- STATS ----------
function renderStats(el) {
  const c = state.character;
  const stats = derivedStats(c);
  el.innerHTML = `
    <div class="row between"><h2>Attributes</h2><div class="badge gold">${c.skillPoints} points</div></div>
    <div class="stat-list">
      ${ATTRIBUTES.map((a) => `
        <div class="stat-row">
          <div class="name">${a.label}<div class="dim">${a.pct}${a.unit} / point</div></div>
          <div class="pts">${c.attributes[a.key]}</div>
          <button class="btn small" data-up="${a.key}" ${c.skillPoints > 0 ? '' : 'disabled'}>+</button>
        </div>
      `).join('')}
    </div>
    <div class="panel dim">
      Max Health ${stats.maxHealth} &middot; Damage x${stats.damageMult.toFixed(2)} &middot;
      Crit ${Math.round(stats.critChance * 100)}% &middot; Ki charge x${stats.kiChargeMult.toFixed(2)} &middot;
      Skill dmg x${stats.ultDamageMult.toFixed(2)} &middot; Support x${stats.supportMult.toFixed(2)}
    </div>
    <button class="btn secondary wide" id="backBtn">Back to Hub</button>
  `;
  el.querySelectorAll('[data-up]').forEach((btn) => btn.onclick = () => {
    upgradeAttribute(c, btn.dataset.up);
    saveGame(state);
    renderStats(el);
  });
  el.querySelector('#backBtn').onclick = () => go('hub');
}

// ---------- SHOP ----------
function renderShop(el) {
  const c = state.character;
  el.innerHTML = `
    <div class="row between"><h2>Shop</h2><div class="badge gold">${c.coins} coins</div></div>
    <div class="shop-grid">
      ${SHOP_ITEMS.map((item) => `
        <div class="panel row between">
          <div>
            <strong>${item.name}</strong>
            <div class="dim">${item.desc}</div>
          </div>
          <button class="btn small" data-buy="${item.id}" ${c.coins >= item.cost ? '' : 'disabled'}>${item.cost} \u{1FA99}</button>
        </div>
      `).join('')}
    </div>
    <button class="btn secondary wide" id="backBtn">Back to Hub</button>
  `;
  el.querySelectorAll('[data-buy]').forEach((btn) => btn.onclick = () => {
    const item = SHOP_ITEMS.find((i) => i.id === btn.dataset.buy);
    if (!item || c.coins < item.cost) return;
    c.coins -= item.cost;
    if (item.id === 'skillPoint') c.skillPoints += 1;
    else if (item.id === 'meds') c.meds += 1;
    else if (item.id === 'diamond') c.diamonds += 1;
    else if (item.id === 'clothes') {
      const unowned = GI_COLORS.find((g) => !c.unlockedGiColors.includes(g));
      if (unowned) { c.unlockedGiColors.push(unowned); c.appearance.giColor = unowned; }
    }
    saveGame(state);
    renderShop(el);
  });
  el.querySelector('#backBtn').onclick = () => go('hub');
}

// ---------- SKILL SELECT ----------
function renderSkillSelect(el) {
  const c = state.character;
  el.innerHTML = `
    <h2 class="center">Choose 4 Skills</h2>
    <div class="dim center">${equipSelection.length}/4 selected</div>
    <div class="col" id="skillList">
      ${SKILLS.map((s) => {
        const locked = s.race && s.race !== c.race;
        const selected = equipSelection.includes(s.id);
        return `
          <div class="skill-card ${selected ? 'selected' : ''} ${locked ? 'disabled' : ''}" data-skill="${s.id}">
            <div class="icon">${s.icon}</div>
            <div class="info">
              <div class="name">${s.name} ${locked ? `<span class="dim">(${s.race} only)</span>` : ''}</div>
              <div class="meta">${s.desc}</div>
              <div class="meta">${skillMetaLine(s)}</div>
            </div>
          </div>`;
      }).join('')}
    </div>
    ${c.meds > 0 ? `
      <label class="row panel">
        <input type="checkbox" id="medsCheck" ${useMedsThisMatch ? 'checked' : ''} />
        <span>Use a Med Kit (${c.meds} left) to start this match with full Ki</span>
      </label>` : ''}
    <div class="row">
      <button class="btn secondary grow" id="backBtn">Back</button>
      <button class="btn grow" id="fightBtn" ${equipSelection.length === 4 ? '' : 'disabled'}>Fight!</button>
    </div>
  `;
  el.querySelectorAll('[data-skill]').forEach((card) => card.onclick = () => {
    const id = card.dataset.skill;
    const skill = skillById(id);
    if (skill.race && skill.race !== c.race) return;
    if (equipSelection.includes(id)) {
      equipSelection = equipSelection.filter((s) => s !== id);
    } else if (equipSelection.length < 4) {
      equipSelection.push(id);
    }
    renderSkillSelect(el);
  });
  const medsCheck = el.querySelector('#medsCheck');
  if (medsCheck) medsCheck.onchange = (e) => { useMedsThisMatch = e.target.checked; };
  el.querySelector('#backBtn').onclick = () => go('hub');
  el.querySelector('#fightBtn').onclick = () => {
    if (equipSelection.length !== 4) return;
    c.equippedSkills = [...equipSelection];
    startMatch();
  };
}

function skillMetaLine(s) {
  if (s.id === 'powerUp') return `Ki: ${s.stages.map((st) => st.kiCost).join('/')} · +${s.stages[0].bonusPct}% per stage · Saiyan only`;
  if (s.id === 'ultimateForm') return `Ki: ${s.kiCost} · +${s.bonusPct}% all stats · Human only`;
  const parts = [`Ki: ${s.kiCost}`];
  if (s.damage) parts.push(`Dmg: ${s.damage}`);
  if (s.damagePerHit) parts.push(`${s.hits}x ${s.damagePerHit} dmg`);
  if (s.healPct) parts.push(`Heal: ${Math.round(s.healPct * 100)}% HP`);
  if (s.aoe) parts.push('Area');
  if (s.cooldown) parts.push(`CD: ${s.cooldown}s`);
  if (s.effect) parts.push(`${s.effect} ${s.duration} turn(s)`);
  return parts.join(' · ');
}

// ---------- MATCH ----------
let match = null;
let arenaCtx = null;

function startMatch() {
  const c = state.character;
  match = createMatch(c);
  if (useMedsThisMatch && c.meds > 0) {
    c.meds -= 1;
    match.player.ki = match.player.maxKi;
  }
  matchTargetId = match.enemies[0].id;
  inputLocked = false;
  go('match');
}

function renderMatch(el) {
  const c = state.character;
  el.innerHTML = `
    <div class="row between"><strong>${c.name}</strong><span class="dim">Round ${match.round}</span></div>
    <div class="bar-outer"><div class="bar-inner hp" id="playerHpBar" style="width:${pct(match.player.hp, match.player.maxHp)}%"></div><div class="bar-label" id="playerHpLabel">${match.player.hp}/${match.player.maxHp}</div></div>
    <div class="bar-outer"><div class="bar-inner ki" id="playerKiBar" style="width:${pct(match.player.ki, match.player.maxKi)}%"></div><div class="bar-label" id="playerKiLabel">Ki ${match.player.ki}/${match.player.maxKi}</div></div>

    <div class="arena">
      <canvas id="arenaCanvas" width="440" height="260"></canvas>
      <canvas id="fxCanvas" width="440" height="260"></canvas>
    </div>

    <div class="row wrap" id="enemyBars">
      ${match.enemies.map((e, i) => `
        <div class="grow enemy-bar-block" data-enemybtn="${e.id}" style="cursor:pointer;${matchTargetId === e.id ? 'outline:2px solid var(--gold);border-radius:6px' : ''}">
          <div class="name">${e.name} ${e.status ? '(' + e.status.effect + ')' : ''}</div>
          <div class="bar-outer" style="height:10px"><div class="bar-inner hp" style="width:${e.alive ? pct(e.hp, e.maxHp) : 0}%"></div></div>
        </div>
      `).join('')}
    </div>

    <div id="actionArea"></div>

    <div class="log-box" id="logBox"></div>
  `;

  const arenaCanvas = document.getElementById('arenaCanvas');
  arenaCtx = arenaCanvas.getContext('2d');
  const fxCanvas = document.getElementById('fxCanvas');
  if (!fx || fx.canvas !== fxCanvas) { fx = new FxLayer(fxCanvas); fx.onTick = () => drawArena(); fx.start(); }
  drawArena();

  el.querySelectorAll('[data-enemybtn]').forEach((b) => b.onclick = () => {
    if (inputLocked) return;
    const e = match.enemies.find((x) => x.id === b.dataset.enemybtn);
    if (e && e.alive) { matchTargetId = e.id; renderMatch(el); }
  });

  renderActionArea();
  renderLog();
}

function pct(v, max) { return Math.max(0, Math.min(100, Math.round((v / max) * 100))); }

function drawArena() {
  if (!arenaCtx) return;
  arenaCtx.clearRect(0, 0, 440, 260);
  const c = state.character;
  drawCharacter(arenaCtx, 80, 225, c.appearance, { blonde: match.player.blonde, glow: match.player.glow ? '#fff9c0' : null, scale: 0.85 });
  const xs = ENEMY_XS;
  match.enemies.forEach((e, i) => {
    if (!e.alive) return;
    drawEnemy(arenaCtx, xs[i], 220, e.seed, 0.6);
  });
}

function renderActionArea() {
  const area = document.getElementById('actionArea');
  if (!area) return;
  const disabled = inputLocked || match.finished;
  area.innerHTML = `
    <div class="action-grid">
      <button class="btn" id="atkBtn" ${disabled ? 'disabled' : ''}>Attack</button>
      <button class="btn secondary" id="blockBtn" ${disabled ? 'disabled' : ''}>Block</button>
      <button class="btn blue" id="skillBtn" ${disabled ? 'disabled' : ''}>Skill</button>
      <button class="btn danger" id="rushBtn" ${disabled ? 'disabled' : ''}>Rush</button>
    </div>
    <div class="dim center" style="margin-top:6px">Actions left this turn: ${match.playerActionsLeft}</div>
  `;
  area.querySelector('#atkBtn').onclick = () => doAction(() => playerAttack(match, matchTargetId));
  area.querySelector('#blockBtn').onclick = () => doAction(() => playerBlock(match));
  area.querySelector('#skillBtn').onclick = () => renderSkillMenu();
  area.querySelector('#rushBtn').onclick = () => startRush();
}

function renderSkillMenu() {
  const area = document.getElementById('actionArea');
  const c = state.character;
  area.innerHTML = `
    <div class="col">
      ${c.equippedSkills.map((id) => {
        const s = skillById(id);
        const ok = canUseSkill(match, c, id);
        return `<button class="btn ${ok ? 'blue' : 'secondary'} wide" data-useskill="${id}" ${ok ? '' : 'disabled'}>${s.icon} ${s.name} <span class="dim">(${skillMetaLine(s)})</span></button>`;
      }).join('')}
      <button class="btn secondary wide" id="cancelSkillBtn">Cancel</button>
    </div>
  `;
  area.querySelectorAll('[data-useskill]').forEach((btn) => btn.onclick = () => {
    const id = btn.dataset.useskill;
    doAction(() => playerUseSkill(match, c, id, matchTargetId));
  });
  area.querySelector('#cancelSkillBtn').onclick = () => renderActionArea();
}

function startRush() {
  const area = document.getElementById('actionArea');
  rushStartedAt = performance.now();
  area.innerHTML = `
    <div class="col">
      <div class="dim center">Strike between the 5s-6s mark!</div>
      <div class="rush-bar">
        <div class="window" style="left:${(RUSH_WINDOW_START / 7000) * 100}%;width:${((RUSH_WINDOW_END - RUSH_WINDOW_START) / 7000) * 100}%"></div>
        <div class="sweep" id="rushSweep" style="left:0%"></div>
      </div>
      <button class="btn danger wide" id="strikeBtn">STRIKE!</button>
    </div>
  `;
  const sweep = document.getElementById('rushSweep');
  clearInterval(rushTimer);
  rushTimer = setInterval(() => {
    const elapsed = performance.now() - rushStartedAt;
    const p = Math.min(100, (elapsed / 7000) * 100);
    if (sweep) sweep.style.left = p + '%';
    if (elapsed >= 7000) resolveRush();
  }, 30);
  document.getElementById('strikeBtn').onclick = () => resolveRush();
}

function resolveRush() {
  clearInterval(rushTimer);
  rushTimer = null;
  const elapsed = performance.now() - rushStartedAt;
  doAction(() => playerResolveRush(match, elapsed, matchTargetId));
}

function doAction(fn) {
  if (inputLocked || match.finished) return;
  inputLocked = true;
  const events = fn() || [];
  playEvents(events, () => {
    updateBars();
    if (match.finished) {
      inputLocked = false;
      setTimeout(finishMatch, 500);
      return;
    }
    if (playerTurnDone(match)) {
      runEnemyBlock();
    } else {
      inputLocked = false;
      renderActionArea();
    }
  });
}

function runEnemyBlock() {
  const alive = match.enemies.filter((e) => e.alive);
  let i = 0;
  const step = () => {
    if (i >= alive.length || match.finished) {
      endRound(match);
      updateBars();
      if (match.finished) { setTimeout(finishMatch, 500); return; }
      inputLocked = false;
      renderActionArea();
      const el = document.getElementById('enemyBars');
      if (el) renderMatchLite();
      return;
    }
    const enemy = alive[i];
    i += 1;
    const events = runEnemyAction(match, enemy);
    playEvents(events, () => { updateBars(); step(); });
  };
  step();
}

function renderMatchLite() {
  render();
}

function playEvents(events, cb) {
  if (!events || events.length === 0) { cb(); return; }
  let idx = 0;
  const next = () => {
    if (idx >= events.length) { cb(); return; }
    const ev = events[idx];
    idx += 1;
    animateEvent(ev);
    setTimeout(next, 420);
  };
  next();
}

function positionFor(actor) {
  if (actor === 'player') return { x: 80, y: 160 };
  const idx = match.enemies.findIndex((e) => e.id === actor);
  return { x: ENEMY_XS[Math.max(0, idx)], y: 170 };
}

function animateEvent(ev) {
  drawArena();
  const isPlayerActor = ev.actor === 'player';
  const targetPos = ev.targetId ? positionFor(ev.targetId) : positionFor(isPlayerActor ? (ev.actor === 'player' ? 'e0' : 'player') : 'player');

  if (ev.kind === 'attack' || ev.kind === 'skill' || ev.kind === 'rush') {
    const color = ev.crit ? '#ffe94d' : (isPlayerActor ? '#ff7a1a' : '#ff3a3a');
    fx.burst(targetPos.x, targetPos.y, color, ev.crit ? 40 : 22);
    fx.damageText(targetPos.x, targetPos.y - 20, (ev.crit ? 'CRIT! ' : '') + '-' + ev.dmg, color);
    fx.shakeScreen(ev.crit ? 14 : 8);
    logMsg(`${actorLabel(ev.actor)} hits ${ev.targetName || 'you'} for ${ev.dmg}${ev.crit ? ' (CRITICAL!)' : ''}`);
  } else if (ev.kind === 'block') {
    logMsg(`${actorLabel(ev.actor)} blocks.`);
  } else if (ev.kind === 'heal') {
    const p = positionFor('player');
    fx.burst(p.x, p.y, '#38d67a', 26);
    fx.damageText(p.x, p.y - 20, '+' + ev.amount, '#38d67a');
    logMsg(`You heal for ${ev.amount}.`);
  } else if (ev.kind === 'transform') {
    const p = positionFor('player');
    fx.burst(p.x, p.y, '#ffe94d', 50);
    fx.shakeScreen(16);
    fx.damageText(p.x, p.y - 30, ev.name + '!', '#ffe94d');
    logMsg(`You transform: ${ev.name}! (+${ev.bonusPct}% total)`);
  } else if (ev.kind === 'debuff') {
    fx.burst(targetPos.x, targetPos.y, '#7a1aad', 20);
    fx.damageText(targetPos.x, targetPos.y - 20, ev.effect, '#c07aff');
    logMsg(`${ev.targetName} is ${ev.effect}ed.`);
  } else if (ev.kind === 'status') {
    logMsg(`${ev.actorName} is ${ev.effect}ed and cannot act.`);
  }
  updateBars();
}

function actorLabel(actor) {
  if (actor === 'player') return 'You';
  const e = match.enemies.find((x) => x.id === actor);
  return e ? e.name : actor;
}

const matchLogLines = [];
function logMsg(msg) {
  matchLogLines.push(msg);
  if (matchLogLines.length > 40) matchLogLines.shift();
  renderLog();
}

function renderLog() {
  const box = document.getElementById('logBox');
  if (!box) return;
  box.innerHTML = matchLogLines.slice().reverse().map((l) => `<div>${l}</div>`).join('');
}

function updateBars() {
  const hpBar = document.getElementById('playerHpBar');
  const hpLabel = document.getElementById('playerHpLabel');
  const kiBar = document.getElementById('playerKiBar');
  const kiLabel = document.getElementById('playerKiLabel');
  if (hpBar) hpBar.style.width = pct(match.player.hp, match.player.maxHp) + '%';
  if (hpLabel) hpLabel.textContent = `${match.player.hp}/${match.player.maxHp}`;
  if (kiBar) kiBar.style.width = pct(match.player.ki, match.player.maxKi) + '%';
  if (kiLabel) kiLabel.textContent = `Ki ${match.player.ki}/${match.player.maxKi}`;
  match.enemies.forEach((e) => {
    const block = document.querySelector(`[data-enemybtn="${e.id}"]`);
    if (block) {
      const innerBar = block.querySelector('.bar-inner');
      if (innerBar) innerBar.style.width = (e.alive ? pct(e.hp, e.maxHp) : 0) + '%';
      const nameDiv = block.querySelector('.name');
      if (nameDiv) nameDiv.textContent = `${e.name} ${e.status ? '(' + e.status.effect + ')' : ''}${!e.alive ? ' [DEFEATED]' : ''}`;
    }
  });
  drawArena();
}

// ---------- RESULT ----------
let lastRewards = null;
function finishMatch() {
  const c = state.character;
  const kills = match.enemies.filter((e) => !e.alive).length;
  const xpGained = kills * 3;
  const levelsGained = addXP(c, xpGained);
  let coinsGained = 0;
  if (match.result === 'win') {
    coinsGained = 40 + c.level * 2 + Math.floor(Math.random() * 30);
    c.coins += coinsGained;
  }
  saveGame(state);
  lastRewards = { kills, xpGained, levelsGained, coinsGained, result: match.result };
  matchLogLines.length = 0;
  go('result');
}

function renderResult(el) {
  const r = lastRewards;
  el.innerHTML = `
    <div style="margin-top:60px" class="center">
      <h1 style="color:${r.result === 'win' ? 'var(--success)' : 'var(--danger)'}">${r.result === 'win' ? 'VICTORY!' : 'DEFEATED...'}</h1>
      ${r.result === 'lose' ? '<p class="dim">You were teleported back home to recover.</p>' : ''}
      <div class="panel col" style="text-align:left;margin-top:20px">
        <div>Enemies defeated: ${r.kills}/3</div>
        <div>XP gained: ${r.xpGained}</div>
        ${r.levelsGained > 0 ? `<div class="badge gold">LEVEL UP! +${r.levelsGained} level(s), +${r.levelsGained} skill point(s)</div>` : ''}
        ${r.coinsGained > 0 ? `<div>Coins earned: ${r.coinsGained} \u{1FA99}</div>` : ''}
      </div>
      <button class="btn wide" id="homeBtn" style="margin-top:20px">Return to Hub</button>
    </div>
  `;
  el.querySelector('#homeBtn').onclick = () => go('hub');
}

init();
