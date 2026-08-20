// Static card data for Poopyhead: standard French decks plus the shared
// play-legality rule. Both engine.js (to validate a play) and main.js (to
// show which cards are playable) import canPlayRank, so the special-card
// rules are defined exactly once.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

// 5 or more players -> two decks, otherwise one.
export const TWO_DECK_THRESHOLD = 5;

export const SUITS = ['♠', '♥', '♦', '♣']; // spades hearts diamonds clubs
export const RED_SUITS = ['♥', '♦'];

// Normal ordering, low to high. JOKER is handled separately (wild).
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const VALUE = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };

export const JOKERS_PER_DECK = 2;

export const SPECIAL_TEXT = {
  2: 'Plays on anything and resets the pile — the next player can play any card.',
  4: 'Skips the next player. No special placement power — like any normal card it can only go on 4 or lower.',
  7: 'Mirror: the pile keeps the value of whatever is underneath it. Plays on anything.',
  10: 'Burns the whole pile out of the game. Plays on anything.',
  J: 'Locks the pile: the next play must be LOWER than a Jack (or another Jack).',
  JOKER: 'Wild: plays on anything, and becomes any rank you choose — with that rank\'s powers.',
};

export function deckCountFor(playerCount) {
  return playerCount >= TWO_DECK_THRESHOLD ? 2 : 1;
}

// Returns plain {rank, suit} descriptors; the engine assigns uids.
export function buildDecks(playerCount) {
  const cards = [];
  for (let d = 0; d < deckCountFor(playerCount); d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
    for (let j = 0; j < JOKERS_PER_DECK; j++) cards.push({ rank: 'JOKER', suit: null });
  }
  return cards;
}

// The one legality rule. `effectiveRank` is the pile's resolved top rank
// (null for an empty pile; 7s already resolved down to what they mirror;
// jokers already resolved to their chosen rank), `rank` is what the player
// wants to play (a joker plays as 'JOKER' here — always legal; its chosen
// rank matters only after it lands).
export function canPlayRank(effectiveRank, rank) {
  if (rank === '2' || rank === '7' || rank === '10' || rank === 'JOKER') return true;
  if (!effectiveRank || effectiveRank === '2') return true; // empty pile, or a 2 reset it
  if (effectiveRank === '7') return VALUE[rank] >= VALUE['7']; // a pile of nothing but 7s counts as a 7
  if (effectiveRank === 'J') return VALUE[rank] <= VALUE['J']; // Jack inverts: only lower or another Jack
  return VALUE[rank] >= VALUE[effectiveRank];
}

export function isRedSuit(suit) {
  return RED_SUITS.includes(suit);
}
