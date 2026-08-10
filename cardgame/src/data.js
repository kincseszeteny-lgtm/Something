// Static card data: every card is plain data + a list of effects, interpreted
// by the resolver in engine.js (one interpreter for every card, not a
// function per card — see the card-game skill, Pattern 2).
//
// effect ops supported by engine.js's resolveEffect: 'damage', 'heal', 'draw', 'buff'.
// effect targets: 'chosen' (any creature, chosen by the caster), 'chosenAlly',
// 'opponentFace', 'allEnemyCreatures', 'self' (the caster's hero).

export const STARTING_LIFE = 20;
export const STARTING_MANA_CAP = 10;
export const MAX_BOARD_CREATURES = 5;
export const MAX_HAND_SIZE = 10;
export const DECK_SIZE = 30;

export const CARDS = [
  // -- creatures --
  { id: 'sparkImp', name: 'Spark Imp', icon: '\u{1F47A}', cost: 1, type: 'creature', attack: 1, health: 2, text: 'A pesky imp crackling with static.' },
  { id: 'shieldNovice', name: 'Shield Novice', icon: '\u{1F6E1}️', cost: 1, type: 'creature', attack: 1, health: 3, text: 'Trained to take the first hit.' },
  { id: 'quickBlade', name: 'Quick Blade', icon: '\u{1F5E1}️', cost: 2, type: 'creature', attack: 3, health: 1, text: 'Fast and fragile.' },
  { id: 'stonehide', name: 'Stonehide Golem', icon: '\u{1F5FF}', cost: 2, type: 'creature', attack: 2, health: 4, text: 'Slow but sturdy.' },
  { id: 'riverSprite', name: 'River Sprite', icon: '\u{1F4A7}', cost: 2, type: 'creature', attack: 2, health: 2, text: 'Draws you a card when it enters play.', onPlay: [{ op: 'draw', amount: 1, target: 'self' }] },
  { id: 'direWolf', name: 'Dire Wolf', icon: '\u{1F43A}', cost: 3, type: 'creature', attack: 4, health: 3, text: 'Hunts as soon as it lands.' },
  { id: 'flameAdept', name: 'Flame Adept', icon: '\u{1F525}', cost: 3, type: 'creature', attack: 3, health: 4, text: 'Channels raw fire.' },
  { id: 'ironSentinel', name: 'Iron Sentinel', icon: '\u{2699}️', cost: 4, type: 'creature', attack: 4, health: 6, text: 'A wall of iron.' },
  { id: 'stormDrake', name: 'Storm Drake', icon: '\u{1F409}', cost: 5, type: 'creature', attack: 6, health: 5, text: 'Commands the sky.' },
  { id: 'ancientTitan', name: 'Ancient Titan', icon: '\u{1F5FB}', cost: 6, type: 'creature', attack: 7, health: 8, text: 'A colossus from a forgotten age.' },

  // -- spells --
  { id: 'firebolt', name: 'Firebolt', icon: '\u{1F525}', cost: 1, type: 'spell', text: 'Deal 3 damage to a creature.', effects: [{ op: 'damage', amount: 3, target: 'chosen' }] },
  { id: 'healingLight', name: 'Healing Light', icon: '\u{2728}', cost: 2, type: 'spell', text: 'Restore 5 life to yourself.', effects: [{ op: 'heal', amount: 5, target: 'self' }] },
  { id: 'reinforce', name: 'Reinforce', icon: '\u{1F4AA}', cost: 2, type: 'spell', text: 'Give a friendly creature +2/+2.', effects: [{ op: 'buff', attack: 2, health: 2, target: 'chosenAlly' }] },
  { id: 'insight', name: 'Insight', icon: '\u{1F4D6}', cost: 2, type: 'spell', text: 'Draw 2 cards.', effects: [{ op: 'draw', amount: 2, target: 'self' }] },
  { id: 'lightningStrike', name: 'Lightning Strike', icon: '\u{26A1}', cost: 3, type: 'spell', text: 'Deal 5 damage straight to your opponent.', effects: [{ op: 'damage', amount: 5, target: 'opponentFace' }] },
  { id: 'frostNova', name: 'Frost Nova', icon: '\u{2744}️', cost: 3, type: 'spell', text: 'Deal 2 damage to all enemy creatures.', effects: [{ op: 'damage', amount: 2, target: 'allEnemyCreatures' }] },
  { id: 'fireball', name: 'Fireball', icon: '\u{2604}️', cost: 4, type: 'spell', text: 'Deal 6 damage to a creature.', effects: [{ op: 'damage', amount: 6, target: 'chosen' }] },
  { id: 'mindShatter', name: 'Mind Shatter', icon: '\u{1F4A5}', cost: 5, type: 'spell', text: 'Deal 10 damage to a creature.', effects: [{ op: 'damage', amount: 10, target: 'chosen' }] },
];

export function cardById(id) {
  const c = CARDS.find((card) => card.id === id);
  if (!c) throw new Error(`Unknown card id: ${id}`);
  return c;
}

// Shared by engine.js (to validate a play) and main.js (to prompt for a
// target in the UI) so the targeting rule for a card is defined exactly once.
// Returns 'any' (any creature on either board), 'ally' (own board only), or
// null (no target needed).
export function targetKindFor(card) {
  const list = card.type === 'creature' ? (card.onPlay || []) : (card.effects || []);
  for (const fx of list) {
    if (fx.op === 'buff') return 'ally';
    if (fx.op === 'damage' && fx.target === 'chosenAlly') return 'ally';
    if (fx.op === 'damage' && fx.target === 'chosen') return 'any';
  }
  return null;
}

// Preset 30-card decklist shared by both players (no deckbuilding/collection
// meta in this pass -- see plan). Weighted toward the cheap end of the curve.
export const DECKLIST = [
  { id: 'sparkImp', count: 2 },
  { id: 'shieldNovice', count: 2 },
  { id: 'firebolt', count: 2 },
  { id: 'quickBlade', count: 2 },
  { id: 'stonehide', count: 2 },
  { id: 'riverSprite', count: 2 },
  { id: 'healingLight', count: 2 },
  { id: 'reinforce', count: 2 },
  { id: 'insight', count: 2 },
  { id: 'direWolf', count: 2 },
  { id: 'flameAdept', count: 2 },
  { id: 'lightningStrike', count: 2 },
  { id: 'frostNova', count: 1 },
  { id: 'ironSentinel', count: 1 },
  { id: 'fireball', count: 1 },
  { id: 'stormDrake', count: 1 },
  { id: 'mindShatter', count: 1 },
  { id: 'ancientTitan', count: 1 },
];

export function buildDecklistIds() {
  const ids = [];
  for (const { id, count } of DECKLIST) for (let i = 0; i < count; i++) ids.push(id);
  return ids;
}
