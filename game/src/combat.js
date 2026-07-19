import { skillById } from './data.js';
import { derivedStats } from './state.js';

const BASE_ATTACK_DMG = 12;
const KI_REGEN_BASE = 12;
const RUSH_BASE_DMG = 8;
const RUSH_MAX_HITS = 5;
export const RUSH_WINDOW_START = 5000;
export const RUSH_WINDOW_END = 6000;
export const PLAYER_ACTIONS_PER_ROUND = 2;
export const ENEMY_ACTIONS_PER_ROUND = 2;

// Enemies can use any skill except the two race-locked transforms (Power Up
// and Ultimate Form are explicitly Saiyan/Human-only in the player's own
// rules, and don't fit generic mooks with no defined race).
const ENEMY_SKILL_IDS = ['kamehameha', 'spiritSphere', 'dragonPunch', 'heal', 'kiRush', 'fierceRush', 'blindness', 'paralyse'];
const ENEMY_SKILL_CHANCE = 0.15;
const ENEMY_ATTACK_CHANCE = 0.5;
const ENEMY_BLOCK_CHANCE = 0.2;

export function createEnemyTrio(level) {
  const base = (28 + level * 4.2) * 2;
  const dmg = 5 + level * 0.7;
  const names = ['Saibaman', 'Raider', 'Henchman'];
  return [0, 1, 2].map((i) => ({
    id: 'e' + i,
    name: names[i],
    seed: i,
    hp: Math.round(base * (0.9 + i * 0.08)),
    maxHp: Math.round(base * (0.9 + i * 0.08)),
    baseDamage: Math.round(dmg * (0.9 + i * 0.1)),
    ki: 0, maxKi: 60,
    blocking: false,
    status: null,
    alive: true,
  }));
}

export function createTrainingDummy() {
  return {
    id: 'dummy', name: 'Training Dummy', seed: 0,
    hp: 100, maxHp: 100, baseDamage: 0,
    ki: 0, maxKi: 60,
    blocking: false, status: null, alive: true,
    practice: true,
  };
}

// `practice: true` drops the player into an infinite-HP, harmless training
// match against the dummy instead of the usual trio -- no win/lose, exit
// whenever via the UI's Exit button.
export function createMatch(character, opts = {}) {
  const stats = derivedStats(character);
  const maxKi = 60;
  return {
    stats,
    player: {
      hp: stats.maxHealth, maxHp: stats.maxHealth,
      ki: maxKi, maxKi,
      blocking: false,
      transformStage: -1, transformBonusPct: 0, transformTurns: 0,
      blonde: false, glow: false,
      status: null,
    },
    enemies: opts.practice ? [createTrainingDummy()] : createEnemyTrio(character.level),
    playerActionsLeft: PLAYER_ACTIONS_PER_ROUND,
    round: 1,
    cooldowns: {},
    finished: false,
    result: null,
    practice: !!opts.practice,
  };
}

function aliveEnemies(m) { return m.enemies.filter((e) => e.alive); }
function firstAliveEnemy(m) { return aliveEnemies(m)[0]; }
function transformMult(match) { return 1 + match.player.transformBonusPct / 100; }
function rollCrit(stats) { return Math.random() < stats.critChance; }

function resolveTarget(match, targetId) {
  return match.enemies.find((e) => e.id === targetId && e.alive) || firstAliveEnemy(match);
}

function dealToEnemy(match, enemy, rawDmg, canCrit) {
  const crit = !!canCrit && rollCrit(match.stats);
  let dmg = rawDmg * transformMult(match);
  if (crit) dmg *= 2;
  if (enemy.blocking) { dmg = Math.max(0, dmg - 10); enemy.blocking = false; }
  dmg = Math.round(dmg);
  if (!enemy.practice) {
    enemy.hp = Math.max(0, enemy.hp - dmg);
    if (enemy.hp <= 0) enemy.alive = false;
  }
  return { dmg, crit, targetId: enemy.id, targetName: enemy.name, targetDead: !enemy.alive };
}

function applyDamageToPlayer(match, dmg) {
  let total = dmg;
  if (match.player.blocking) { total = Math.max(0, total - 10); match.player.blocking = false; }
  total = Math.round(total);
  match.player.hp = Math.max(0, match.player.hp - total);
  if (match.player.hp <= 0) { match.finished = true; match.result = 'lose'; }
  return total;
}

function postPlayerAction(match) { match.playerActionsLeft -= 1; }

function checkWin(match) {
  if (aliveEnemies(match).length === 0) { match.finished = true; match.result = 'win'; }
}

export function playerHasStatus(match) {
  return !!match.player.status;
}

// Consumes one player action while a blind/paralyse status is active --
// mirrors the enemy-status handling below, but for the player's turn.
export function playerSkipDueToStatus(match) {
  const ev = { kind: 'status', actor: 'player', effect: match.player.status.effect };
  match.player.status.turns -= 1;
  if (match.player.status.turns <= 0) match.player.status = null;
  postPlayerAction(match);
  return [ev];
}

export function playerAttack(match, targetId) {
  const target = resolveTarget(match, targetId);
  if (!target) return [];
  const dmg = BASE_ATTACK_DMG * match.stats.damageMult;
  const res = dealToEnemy(match, target, dmg, true);
  const events = [{ kind: 'attack', actor: 'player', ...res }];
  postPlayerAction(match);
  checkWin(match);
  return events;
}

export function playerBlock(match) {
  match.player.blocking = true;
  postPlayerAction(match);
  return [{ kind: 'block', actor: 'player' }];
}

export function canUseSkill(match, character, skillId) {
  const skill = skillById(skillId);
  if (!skill) return false;
  if (skill.id === 'powerUp') {
    if (character.race !== 'saiyan') return false;
    const nextStage = match.player.transformStage + 1;
    if (nextStage >= skill.stages.length) return false;
    return match.player.ki >= skill.stages[nextStage].kiCost;
  }
  if (skill.id === 'ultimateForm') {
    if (character.race !== 'human') return false;
    return match.player.ki >= skill.kiCost;
  }
  if ((match.cooldowns[skillId] || 0) > 0) return false;
  return match.player.ki >= skill.kiCost;
}

export function playerUseSkill(match, character, skillId, targetId) {
  const skill = skillById(skillId);
  if (!skill || !canUseSkill(match, character, skillId)) return [];
  const events = [];

  if (skill.id === 'powerUp') {
    const stageIdx = match.player.transformStage + 1;
    const stage = skill.stages[stageIdx];
    match.player.ki -= stage.kiCost;
    match.player.transformStage = stageIdx;
    match.player.transformBonusPct += stage.bonusPct;
    match.player.transformTurns = stage.turns;
    match.player.blonde = true;
    events.push({ kind: 'transform', actor: 'player', name: stage.name, bonusPct: match.player.transformBonusPct });
  } else if (skill.id === 'ultimateForm') {
    match.player.ki -= skill.kiCost;
    match.player.transformBonusPct += skill.bonusPct;
    match.player.transformTurns = skill.turns;
    match.player.glow = true;
    events.push({ kind: 'transform', actor: 'player', name: 'Ultimate Form', bonusPct: match.player.transformBonusPct });
  } else if (skill.type === 'support') {
    match.player.ki -= skill.kiCost;
    const heal = Math.round(match.player.maxHp * skill.healPct * match.stats.supportMult);
    match.player.hp = Math.min(match.player.maxHp, match.player.hp + heal);
    events.push({ kind: 'heal', actor: 'player', amount: heal });
  } else if (skill.type === 'debuff') {
    match.player.ki -= skill.kiCost;
    const target = resolveTarget(match, targetId);
    if (target) {
      target.status = { effect: skill.effect, turns: skill.duration };
      events.push({ kind: 'debuff', actor: 'player', effect: skill.effect, targetId: target.id, targetName: target.name });
    }
  } else if (skill.aoe) {
    match.player.ki -= skill.kiCost;
    if (skill.cooldown) match.cooldowns[skill.id] = skill.cooldown;
    for (const e of aliveEnemies(match)) {
      const res = dealToEnemy(match, e, skill.damage * match.stats.ultDamageMult, skill.canCrit);
      events.push({ kind: 'skill', actor: 'player', skillId: skill.id, ...res });
    }
  } else if (skill.hits) {
    match.player.ki -= skill.kiCost;
    const target = resolveTarget(match, targetId);
    for (let i = 0; i < skill.hits && target && target.alive; i++) {
      const res = dealToEnemy(match, target, skill.damagePerHit * match.stats.ultDamageMult, skill.canCrit);
      events.push({ kind: 'skill', actor: 'player', skillId: skill.id, ...res });
    }
  } else {
    match.player.ki -= skill.kiCost;
    if (skill.cooldown) match.cooldowns[skill.id] = skill.cooldown;
    const target = resolveTarget(match, targetId);
    if (target) {
      const res = dealToEnemy(match, target, skill.damage * match.stats.ultDamageMult, skill.canCrit);
      events.push({ kind: 'skill', actor: 'player', skillId: skill.id, ...res });
    }
  }

  postPlayerAction(match);
  checkWin(match);
  return events;
}

export function playerResolveRush(match, elapsedMs, targetId) {
  const target = resolveTarget(match, targetId);
  const events = [];
  if (!target) { postPlayerAction(match); return events; }
  const hit = elapsedMs >= RUSH_WINDOW_START && elapsedMs <= RUSH_WINDOW_END;
  const hits = hit ? RUSH_MAX_HITS : 1;
  for (let i = 0; i < hits && target.alive; i++) {
    const res = dealToEnemy(match, target, RUSH_BASE_DMG * match.stats.damageMult, false);
    events.push({ kind: 'rush', actor: 'player', hit, ...res });
  }
  postPlayerAction(match);
  checkWin(match);
  return events;
}

export function playerTurnDone(match) {
  return match.playerActionsLeft <= 0 || match.finished;
}

function enemyAffordableSkills(enemy) {
  return ENEMY_SKILL_IDS.map((id) => skillById(id)).filter((s) => s && enemy.ki >= s.kiCost);
}

function applyEnemySkillToPlayer(match, enemy, skill) {
  enemy.ki -= skill.kiCost;
  const events = [];
  if (skill.type === 'support') {
    const heal = Math.round(enemy.maxHp * skill.healPct);
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    events.push({ kind: 'heal', actor: enemy.id, actorName: enemy.name, amount: heal });
  } else if (skill.type === 'debuff') {
    match.player.status = { effect: skill.effect, turns: skill.duration };
    events.push({ kind: 'debuff', actor: enemy.id, actorName: enemy.name, effect: skill.effect, targetId: 'player', targetName: 'you' });
  } else if (skill.hits) {
    for (let i = 0; i < skill.hits; i++) {
      const dmg = applyDamageToPlayer(match, skill.damagePerHit);
      events.push({ kind: 'skill', actor: enemy.id, actorName: enemy.name, skillId: skill.id, dmg });
      if (match.finished) break;
    }
  } else {
    const dmg = applyDamageToPlayer(match, skill.damage);
    events.push({ kind: 'skill', actor: enemy.id, actorName: enemy.name, skillId: skill.id, dmg });
  }
  return events;
}

// One action for one enemy during the enemy block.
export function runEnemyAction(match, enemy) {
  if (!enemy.alive || match.finished) return [];
  if (enemy.practice) {
    enemy.blocking = true;
    return [{ kind: 'block', actor: enemy.id, actorName: enemy.name }];
  }
  if (enemy.status) {
    const ev = { kind: 'status', actor: enemy.id, actorName: enemy.name, effect: enemy.status.effect };
    enemy.status.turns -= 1;
    if (enemy.status.turns <= 0) enemy.status = null;
    return [ev];
  }
  const roll = Math.random();
  const affordable = roll < ENEMY_SKILL_CHANCE ? enemyAffordableSkills(enemy) : [];
  if (affordable.length > 0) {
    const skill = affordable[Math.floor(Math.random() * affordable.length)];
    return applyEnemySkillToPlayer(match, enemy, skill);
  }
  const events = [];
  if (roll < ENEMY_SKILL_CHANCE + ENEMY_ATTACK_CHANCE) {
    let dmg = enemy.baseDamage;
    const crit = Math.random() < 0.08;
    if (crit) dmg *= 2;
    const res = applyDamageToPlayer(match, dmg);
    events.push({ kind: 'attack', actor: enemy.id, actorName: enemy.name, dmg: res, crit });
  } else if (roll < ENEMY_SKILL_CHANCE + ENEMY_ATTACK_CHANCE + ENEMY_BLOCK_CHANCE) {
    enemy.blocking = true;
    events.push({ kind: 'block', actor: enemy.id, actorName: enemy.name });
  } else {
    const res = applyDamageToPlayer(match, enemy.baseDamage * 1.5);
    events.push({ kind: 'rush', actor: enemy.id, actorName: enemy.name, dmg: res, hit: true });
  }
  return events;
}

export function endRound(match) {
  for (const k of Object.keys(match.cooldowns)) {
    match.cooldowns[k] = Math.max(0, match.cooldowns[k] - 1);
  }
  if (match.player.transformTurns > 0) {
    match.player.transformTurns -= 1;
    if (match.player.transformTurns <= 0) {
      match.player.transformBonusPct = 0;
      match.player.transformStage = -1;
      match.player.blonde = false;
      match.player.glow = false;
    }
  }
  const regen = Math.round(KI_REGEN_BASE * match.stats.kiChargeMult);
  match.player.ki = Math.min(match.player.maxKi, match.player.ki + regen);
  for (const e of match.enemies) {
    if (e.alive) e.ki = Math.min(e.maxKi, e.ki + KI_REGEN_BASE);
  }
  match.round += 1;
  match.playerActionsLeft = PLAYER_ACTIONS_PER_ROUND;
}
