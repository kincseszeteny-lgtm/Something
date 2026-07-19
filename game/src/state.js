import { RACES, ATTRIBUTES, SKILLS, MAX_LEVEL, XP_PER_LEVEL } from './data.js';

const SAVE_KEY = 'dragonbell_save_v1';

export function newCharacter() {
  return {
    name: '',
    race: null, // 'saiyan' | 'human'
    gender: 'male',
    appearance: {
      skinColor: '#e8b98a',
      hairColor: '#111111',
      hairStyle: 'spiky',
      giColor: '#ff7a1a',
      height: 0.5,
      build: 0.5,
    },
    level: 1,
    xp: 0,
    coins: 0,
    diamonds: 0,
    skillPoints: 0,
    hubLevel: 0,
    meds: 0,
    unlockedGiColors: ['#ff7a1a'],
    attributes: { strength: 0, health: 0, agility: 0, luck: 0, ultDamage: 0, support: 0 },
    equippedSkills: [],
  };
}

export function newSaveState() {
  return {
    screen: 'title',
    character: newCharacter(),
    match: null,
    pendingLevelUps: 0,
  };
}

export function saveGame(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ character: state.character }));
}

export function loadCharacter() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.character || null;
  } catch {
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function derivedStats(character) {
  const a = character.attributes;
  const baseHP = 100;
  const maxHealth = Math.round(baseHP * (1 + a.health * 0.05));
  return {
    maxHealth,
    damageMult: 1 + a.strength * 0.05,
    kiChargeMult: 1 + a.agility * 0.03,
    critChance: Math.min(0.75, 0.05 + a.luck * 0.02),
    ultDamageMult: 1 + a.ultDamage * 0.04,
    supportMult: 1 + a.support * 0.02,
  };
}

export function totalAttributePoints(character) {
  return Object.values(character.attributes).reduce((a, b) => a + b, 0);
}

export function upgradeAttribute(character, key) {
  if (character.skillPoints <= 0) return false;
  if (!(key in character.attributes)) return false;
  character.attributes[key] += 1;
  character.skillPoints -= 1;
  return true;
}

// Applies XP, handles level-ups (cap at MAX_LEVEL), returns number of levels gained.
export function addXP(character, amount) {
  if (character.level >= MAX_LEVEL) return 0;
  character.xp += amount;
  let levelsGained = 0;
  while (character.xp >= XP_PER_LEVEL && character.level < MAX_LEVEL) {
    character.xp -= XP_PER_LEVEL;
    character.level += 1;
    character.skillPoints += 1;
    levelsGained += 1;
  }
  if (character.level >= MAX_LEVEL) character.xp = 0;
  return levelsGained;
}

export function raceInfo(character) {
  return RACES[character.race];
}
