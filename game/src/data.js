// Static game data: races, attributes, skills.
// Some numbers were not fully specified in the design brief (ki costs for
// Dragon Punch/Heal/Ki Rush, hit counts, transform durations); reasonable
// values were filled in and are called out in README.md.

export const RACES = {
  saiyan: {
    key: 'saiyan',
    name: 'Saiyan',
    transform: 'powerUp',
    desc: 'Proud warrior race. Can awaken the Super Saiyan stages in battle.',
  },
  human: {
    key: 'human',
    name: 'Human',
    transform: 'ultimateForm',
    desc: 'Resourceful earthling. Can unlock a hidden Ultimate Form.',
  },
};

export const ATTRIBUTES = [
  { key: 'strength', label: 'Strength', pct: 5, unit: '% damage', desc: 'Increases all damage dealt.' },
  { key: 'health', label: 'Health', pct: 5, unit: '% max health', desc: 'Increases maximum health.' },
  { key: 'agility', label: 'Agility', pct: 3, unit: '% faster ki charge', desc: 'Charges ki faster each turn.' },
  { key: 'luck', label: 'Luck', pct: 2, unit: '% critical chance', desc: 'Increases chance to land a critical (double damage) hit.' },
  { key: 'ultDamage', label: 'Ult Damage', pct: 4, unit: '% skill damage', desc: 'Increases damage/power of skills.' },
  { key: 'support', label: 'Support', pct: 2, unit: '% support power', desc: 'Increases heal amount and debuff effectiveness.' },
];

export const SKILLS = [
  {
    id: 'kamehameha', name: 'Kamehameha', icon: '\u{1F30A}',
    kiCost: 15, damage: 56, canCrit: true,
    type: 'attack', vfx: 'beam',
    desc: 'A concentrated beam of ki fired with both hands.',
  },
  {
    id: 'spiritSphere', name: 'Spirit Sphere', icon: '\u{1F52E}',
    kiCost: 50, damage: 150, canCrit: true, cooldown: 30, aoe: true,
    type: 'attack', vfx: 'sphere',
    desc: 'A sphere of destructive ki that seeks out every foe on the field.',
  },
  {
    id: 'dragonPunch', name: 'Dragon Punch', icon: '\u{1F409}',
    kiCost: 18, damage: 42, canCrit: true,
    type: 'attack', vfx: 'punch',
    desc: 'A dragon-shaped fist of solid ki, smashing straight through guard.',
  },
  {
    id: 'heal', name: 'Heal', icon: '\u{1F49A}',
    kiCost: 22, healPct: 0.35,
    type: 'support', vfx: 'heal',
    desc: 'Channel ki inward to mend your wounds.',
  },
  {
    id: 'kiRush', name: 'Ki Rush', icon: '✨',
    kiCost: 20, hits: 4, damagePerHit: 10, canCrit: false,
    type: 'attack', vfx: 'multiblast',
    desc: 'A continuous barrage of small ki blasts.',
  },
  {
    id: 'powerUp', name: 'Power Up', icon: '⚡',
    race: 'saiyan', type: 'transform', vfx: 'aura',
    desc: 'Power up through the Super Saiyan stages. Bonuses stack with every stage reached.',
    stages: [
      { name: 'Super Saiyan', kiCost: 15, bonusPct: 10, turns: 4 },
      { name: 'Super Saiyan 2', kiCost: 20, bonusPct: 10, turns: 4 },
      { name: 'Super Saiyan 3', kiCost: 30, bonusPct: 10, turns: 3 },
      { name: 'Super Saiyan God', kiCost: 35, bonusPct: 10, turns: 3 },
    ],
  },
  {
    id: 'ultimateForm', name: 'Ultimate Form', icon: '\u{1F31F}',
    race: 'human', kiCost: 40, bonusPct: 50, turns: 4,
    type: 'transform', vfx: 'glow',
    desc: 'Unlock your hidden potential for a massive boost to every attribute.',
  },
  {
    id: 'fierceRush', name: 'Fierce Rush', icon: '\u{1F4A5}',
    kiCost: 24, damage: 36, canCrit: true,
    type: 'attack', vfx: 'combo',
    desc: 'A relentless melee combo ending in a heavy blow.',
  },
  {
    id: 'blindness', name: 'Blindness', icon: '\u{1F441}',
    kiCost: 12, effect: 'blind', duration: 1,
    type: 'debuff', vfx: 'flash',
    desc: "Blinds the enemy, disabling their next action.",
  },
  {
    id: 'paralyse', name: 'Paralyse', icon: '⚡',
    kiCost: 35, effect: 'paralyse', duration: 2,
    type: 'debuff', vfx: 'shock',
    desc: 'Paralyses the enemy, disabling their actions for 2 turns.',
  },
];

export function skillById(id) {
  return SKILLS.find((s) => s.id === id);
}

export const HAIR_STYLES = ['spiky', 'flame', 'wild', 'bowl', 'mohawk'];

export const APPEARANCE_LIMITS = {
  height: { min: 0.3, max: 0.8 }, // like Xenoverse 2: no extreme sliders
  build: { min: 0.3, max: 0.8 },
};

export const SKIN_COLORS = ['#e8b98a', '#c98a5a', '#8a5a35', '#f0d0b0', '#5a3a2a'];
export const HAIR_COLORS = ['#111111', '#3a2a1a', '#7a1a1a', '#1a3a7a', '#f0f0f0'];
export const GI_COLORS = ['#ff7a1a', '#1a5ada', '#1aada0', '#ada01a', '#7a1aad'];

export const SHOP_ITEMS = [
  { id: 'skillPoint', name: 'Skill Point', cost: 100, currency: 'coins', desc: 'Spend on attribute upgrades.' },
  { id: 'meds', name: 'Med Kit', cost: 50, currency: 'coins', desc: 'Fully restores HP and Ki before your next match.' },
  { id: 'clothes', name: 'Clothes Dye', cost: 100, currency: 'coins', desc: 'Unlock a new gi color.' },
  { id: 'diamond', name: 'Diamond', cost: 100, currency: 'coins', desc: 'Used to upgrade your home.' },
];

export const HUB_UPGRADE_COST_DIAMONDS = 3;
export const MAX_HUB_LEVEL = 5;
export const MAX_LEVEL = 100;
export const XP_PER_KILL = 3;
export const XP_PER_LEVEL = 10;

// Clothing: 'top' and 'bottom' can be worn together; 'onePiece' covers both
// slots at once (equipping it clears top/bottom and vice versa); 'outerwear'
// layers on top of whatever else is worn.
export const CLOTHING_CATEGORIES = [
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'onePiece', label: 'One-Piece' },
  { key: 'outerwear', label: 'Outerwear' },
];

export const CLOTHING_ITEMS = [
  { id: 'tankTop', name: 'Tank Top', slot: 'top', cost: 60, color: '#f0f0f0', desc: 'Sleeveless and simple.' },
  { id: 'trainingShirt', name: 'Training Shirt', slot: 'top', cost: 80, color: '#3a6adf', desc: 'Short-sleeved, built for sparring.' },
  { id: 'battleVest', name: 'Battle Vest', slot: 'top', cost: 90, color: '#d8402a', desc: 'A strapped vest, open at the sides.' },

  { id: 'cargoPants', name: 'Cargo Pants', slot: 'bottom', cost: 70, color: '#3d6a3a', desc: 'Loose-fitting with deep pockets.' },
  { id: 'trainingShorts', name: 'Training Shorts', slot: 'bottom', cost: 55, color: '#26283a', desc: 'Light and easy to move in.' },
  { id: 'combatSkirt', name: 'Combat Skirt', slot: 'bottom', cost: 75, color: '#6a2a8a', desc: 'A pleated skirt, surprisingly practical.' },

  { id: 'battleDress', name: 'Battle Dress', slot: 'onePiece', cost: 140, color: '#8a2a8a', desc: 'A single flowing garment, shoulder to knee.' },
  { id: 'jumpsuit', name: 'Jumpsuit', slot: 'onePiece', cost: 150, color: '#e08a1a', desc: 'A full-body suit with a wide belt.' },

  { id: 'travelCoat', name: 'Travel Coat', slot: 'outerwear', cost: 120, color: '#6a4a2a', desc: 'Long and open-fronted, good for the road.' },
  { id: 'battleJacket', name: 'Battle Jacket', slot: 'outerwear', cost: 130, color: '#1a1a24', desc: 'A short jacket with a stiff collar.' },
];

export function clothingById(id) {
  return CLOTHING_ITEMS.find((c) => c.id === id);
}
