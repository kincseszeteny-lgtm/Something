// The authoritative Poopyhead engine. Only the Host ever calls
// createMatch/applyIntent -- every other player sends intents over their
// DataChannel and renders the redacted snapshot the Host sends back, so no
// player's view can desync and nobody can see a hidden card.
//
// Rules implemented here (see README for the full write-up):
// - 1 French deck (52 + 2 jokers) under 5 players, 2 decks at 5+.
// - Deal: 3 face-down, 3 face-up on top of them, 3 in hand.
// - Hand must always hold 3 DIFFERENT ranks: draw from the deck until it
//   does (drawing only happens while it holds 2 or fewer distinct ranks).
// - Play equal-or-higher than the pile's effective top, else pick the pile
//   up. Any number of copies of one rank can be played together from hand.
// - Specials: 2 resets, 4 skips, 7 mirrors, 10 burns, J locks to
//   lower-or-Jack, Joker is wild (becomes a chosen rank, powers included).
// - Four of the same rank in a row burns the pile. After any burn the turn
//   passes on normally.
// - Hand empty + deck empty -> play face-up cards, one per turn; then
//   face-down cards blind, one per turn. A blind card that doesn't beat the
//   pile is picked up together with the pile.
// - Out of cards = safe. The last player still holding cards is the
//   Poopyhead.

import { buildDecks, canPlayRank, RANKS, VALUE, SUITS, SWAP_SECONDS } from './data.js';

const FACE_DOWN_COUNT = 3;
const FACE_UP_COUNT = 3;
const HAND_COUNT = 3;
const DISTINCT_RANKS_REQUIRED = 3;
const BURN_RUN_LENGTH = 4;

// ---------- seeded RNG (mulberry32) so a match is reproducible from its seed ----------
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- match setup ----------
export function createMatch(seed, playerIds, names = {}) {
  const rng = makeRng(seed);
  let nextUid = 1;
  const drawPile = shuffle(buildDecks(playerIds.length), rng)
    .map((c) => ({ uid: `c${nextUid++}`, rank: c.rank, suit: c.suit }));

  const players = {};
  for (const id of playerIds) {
    players[id] = {
      name: names[id] || id,
      hand: [], faceUp: [], faceDown: [],
      out: false,
    };
  }

  const state = {
    seed,
    playerOrder: [...playerIds],
    players,
    drawPile,
    pile: [],
    burnedCount: 0,
    phase: 'swap', // 'swap' (pre-game card trading) | 'play'
    swapEndsAt: Date.now() + SWAP_SECONDS * 1000,
    ready: {}, // playerId -> true once they've locked in their swaps
    active: null, // decided by the lowest card once the swap window closes
    turnNumber: 1,
    pendingJoker: null, // { playerId, card } -- a blind-flipped joker awaiting a rank choice
    finishedOrder: [], // ids in the order they went out (safe)
    poopyhead: null, // set when the game ends
    log: [],
    _rng: rng,
  };

  // Deal the way a table dealer would: one card to each player per pass.
  for (let i = 0; i < FACE_DOWN_COUNT; i++) for (const id of playerIds) players[id].faceDown.push(drawPile.pop());
  for (let i = 0; i < FACE_UP_COUNT; i++) for (const id of playerIds) players[id].faceUp.push(drawPile.pop());
  for (let i = 0; i < HAND_COUNT; i++) for (const id of playerIds) players[id].hand.push(drawPile.pop());

  // The 3-different-ranks rule applies from the deal onward.
  for (const id of playerIds) topUpHand(state, id);

  log(state, `Swap your cards — ${SWAP_SECONDS} seconds!`);
  return state;
}

// ---------- pre-game swap phase ----------
function swapCard(state, id, handUid, faceUpUid) {
  if (state.ready[id]) return { ok: false, reason: "you're already ready — no more swapping" };
  const p = state.players[id];
  const h = p.hand.findIndex((c) => c.uid === handUid);
  const f = p.faceUp.findIndex((c) => c.uid === faceUpUid);
  if (h === -1 || f === -1) return { ok: false, reason: 'those are not your cards to swap' };
  const tmp = p.hand[h];
  p.hand[h] = p.faceUp[f];
  p.faceUp[f] = tmp;
  return { ok: true };
}

function setReady(state, id) {
  state.ready[id] = true;
  return { ok: true };
}

export function everyoneReady(state) {
  return state.playerOrder.every((id) => state.ready[id]);
}

// Lowest card in hand starts. Jokers are wild, so they don't count as a
// "smallest card"; ties break by suit order, then by seat order.
function lowestCardHolder(state) {
  let best = null;
  for (const id of state.playerOrder) {
    for (const c of state.players[id].hand) {
      if (c.rank === 'JOKER') continue;
      const value = VALUE[c.rank];
      const suit = SUITS.indexOf(c.suit);
      if (!best || value < best.value || (value === best.value && suit < best.suit)) {
        best = { id, value, suit, card: c };
      }
    }
  }
  return best;
}

// Closes the swap window and begins play. The host calls this when the timer
// runs out or everyone is ready.
export function finishSwap(state) {
  if (state.phase !== 'swap') return { ok: false, reason: 'the swap window is already closed' };
  state.phase = 'play';
  state.swapEndsAt = null;

  // A swap can leave a hand short of 3 distinct ranks, so re-apply the draw
  // rule before anyone plays.
  for (const id of state.playerOrder) topUpHand(state, id);

  const best = lowestCardHolder(state);
  state.active = best ? best.id : state.playerOrder[0];
  const label = best ? `${best.card.rank}${best.card.suit}` : 'no low card';
  log(state, `${state.players[state.active].name} has the lowest card (${label}) and starts.`);
  return { ok: true };
}

function log(state, msg) { state.log.push(msg); if (state.log.length > 300) state.log.shift(); }

function distinctRanks(hand) { return new Set(hand.map((c) => c.rank)).size; }

function topUpHand(state, id) {
  const p = state.players[id];
  while (state.drawPile.length > 0 && distinctRanks(p.hand) < DISTINCT_RANKS_REQUIRED) {
    p.hand.push(state.drawPile.pop());
  }
}

// A joker on the pile counts as its chosen rank from the moment it lands.
function resolvedRank(card) { return card.rank === 'JOKER' ? card.chosenRank : card.rank; }

// The pile's effective top rank: walk down through 7s (each 7 mirrors
// whatever is underneath it). null = empty pile. A pile of nothing but 7s
// counts as a 7.
export function effectiveTopRank(pile) {
  for (let i = pile.length - 1; i >= 0; i--) {
    const r = resolvedRank(pile[i]);
    if (r !== '7') return r;
  }
  return pile.length > 0 ? '7' : null;
}

// Which zone the player must play from right now.
export function currentSource(state, id) {
  const p = state.players[id];
  if (p.hand.length > 0) return 'hand';
  if (p.faceUp.length > 0) return 'faceUp';
  if (p.faceDown.length > 0) return 'faceDown';
  return null; // out of cards
}

function hasLegalPlay(state, id) {
  const source = currentSource(state, id);
  if (source === 'faceDown') return true; // a blind flip is always attemptable
  const cards = state.players[id][source] || [];
  const eff = effectiveTopRank(state.pile);
  return cards.some((c) => canPlayRank(eff, c.rank));
}

function alivePlayers(state) {
  return state.playerOrder.filter((id) => !state.players[id].out);
}

function advanceTurn(state, skips = 0) {
  const order = state.playerOrder;
  let idx = order.indexOf(state.active);
  let steps = 1 + skips;
  while (steps > 0) {
    for (let guard = 0; guard < order.length; guard++) {
      idx = (idx + 1) % order.length;
      if (!state.players[order[idx]].out) break;
    }
    steps -= 1;
  }
  state.active = order[idx];
  state.turnNumber += 1;
}

function totalCards(p) { return p.hand.length + p.faceUp.length + p.faceDown.length; }

function checkOutAndGameEnd(state, id) {
  const p = state.players[id];
  if (!p.out && totalCards(p) === 0 && state.drawPile.length === 0) {
    p.out = true;
    state.finishedOrder.push(id);
    log(state, `${p.name} is out of cards — safe! 🎉`);
  }
  const alive = alivePlayers(state);
  if (alive.length === 1 && !state.poopyhead) {
    state.poopyhead = alive[0];
    log(state, `${state.players[alive[0]].name} is the POOPYHEAD! 💩`);
  }
}

// Moves played cards onto the pile and applies effects. Returns the number
// of players to skip. Burns clear the pile; the turn passes on normally
// either way.
function settlePlay(state, id, cards, jokerRank) {
  const p = state.players[id];
  for (const card of cards) {
    if (card.rank === 'JOKER') card.chosenRank = jokerRank;
    state.pile.push(card);
  }
  const playedAs = resolvedRank(cards[0]);
  const label = cards.length > 1 ? `${cards.length}x ${playedAs}` : playedAs;
  log(state, `${p.name} plays ${label}${cards[0].rank === 'JOKER' ? ' (Joker)' : ''}.`);

  let burned = false;
  if (playedAs === '10') {
    burned = true;
  } else if (state.pile.length >= BURN_RUN_LENGTH) {
    const top = state.pile.slice(-BURN_RUN_LENGTH);
    burned = top.every((c) => resolvedRank(c) === resolvedRank(top[0]));
  }
  if (burned) {
    state.burnedCount += state.pile.length;
    state.pile = [];
    log(state, `The pile burns! 🔥`);
  }

  return playedAs === '4' ? cards.length : 0;
}

// ---------- intents ----------
export function applyIntent(state, playerKey, intent) {
  if (state.poopyhead) return { ok: false, reason: 'the game is over' };

  // During the swap window nobody has a turn -- everyone trades at once.
  if (state.phase === 'swap') {
    if (intent.type === 'swapCard') return swapCard(state, playerKey, intent.handUid, intent.faceUpUid);
    if (intent.type === 'ready') return setReady(state, playerKey);
    return { ok: false, reason: 'the game has not started yet' };
  }

  if (state.pendingJoker) {
    if (playerKey !== state.pendingJoker.playerId) return { ok: false, reason: 'waiting for the flipped Joker to be chosen' };
    if (intent.type !== 'chooseJokerRank') return { ok: false, reason: 'you must choose a rank for your flipped Joker' };
    return chooseJokerRank(state, playerKey, intent.rank);
  }
  if (playerKey !== state.active) return { ok: false, reason: 'not your turn' };
  if (state.players[playerKey].out) return { ok: false, reason: 'you are already out' };

  if (intent.type === 'playCards') return playCards(state, playerKey, intent.uids, intent.jokerRank);
  if (intent.type === 'playBlindIndex') {
    // Face-down uids are redacted from every snapshot (they're blind even to
    // their owner), so clients identify a flip by position, not uid.
    const card = state.players[playerKey].faceDown[intent.index];
    if (!card) return { ok: false, reason: 'that face-down card is not there' };
    return playBlind(state, playerKey, card.uid);
  }
  if (intent.type === 'pickUp') return pickUp(state, playerKey);
  return { ok: false, reason: `unknown intent type ${intent.type}` };
}

function playCards(state, id, uids, jokerRank) {
  const p = state.players[id];
  const source = currentSource(state, id);
  if (source !== 'hand' && source !== 'faceUp') return { ok: false, reason: 'you must flip a face-down card now' };
  if (!Array.isArray(uids) || uids.length === 0) return { ok: false, reason: 'no cards chosen' };
  if (source === 'faceUp' && uids.length !== 1) return { ok: false, reason: 'face-up cards go down one per turn' };

  const zone = p[source];
  const cards = uids.map((uid) => zone.find((c) => c.uid === uid));
  if (cards.some((c) => !c)) return { ok: false, reason: 'card not available to play' };
  if (new Set(uids).size !== uids.length) return { ok: false, reason: 'duplicate card' };
  if (new Set(cards.map((c) => c.rank)).size !== 1) return { ok: false, reason: 'all cards played together must be the same rank' };

  const rank = cards[0].rank;
  if (rank === 'JOKER') {
    if (!RANKS.includes(jokerRank)) return { ok: false, reason: 'choose what rank the Joker becomes' };
  }
  if (!canPlayRank(effectiveTopRank(state.pile), rank)) return { ok: false, reason: 'that card is not high enough' };

  p[source] = zone.filter((c) => !uids.includes(c.uid));
  const skips = settlePlay(state, id, cards, jokerRank);
  topUpHand(state, id);
  checkOutAndGameEnd(state, id);
  if (!state.poopyhead) advanceTurn(state, skips);
  return { ok: true };
}

function playBlind(state, id, uid) {
  const p = state.players[id];
  if (currentSource(state, id) !== 'faceDown') return { ok: false, reason: 'you still have other cards to play' };
  const card = p.faceDown.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: 'that face-down card is not yours to flip' };

  p.faceDown = p.faceDown.filter((c) => c.uid !== uid);

  if (card.rank === 'JOKER') {
    // A blind joker needs its rank chosen before the turn can settle.
    state.pendingJoker = { playerId: id, card };
    log(state, `${p.name} flips a Joker!`);
    return { ok: true };
  }

  const eff = effectiveTopRank(state.pile);
  log(state, `${p.name} flips ${card.rank}${card.suit || ''}.`);
  if (!canPlayRank(eff, card.rank)) {
    p.hand.push(card, ...state.pile);
    state.pile = [];
    log(state, `It doesn't beat the pile — ${p.name} picks everything up.`);
    advanceTurn(state, 0);
    return { ok: true };
  }

  const skips = settlePlay(state, id, [card]);
  checkOutAndGameEnd(state, id);
  if (!state.poopyhead) advanceTurn(state, skips);
  return { ok: true };
}

function chooseJokerRank(state, id, rank) {
  if (!RANKS.includes(rank)) return { ok: false, reason: 'choose a real rank for the Joker' };
  const { card } = state.pendingJoker;
  state.pendingJoker = null;
  const skips = settlePlay(state, id, [card], rank);
  checkOutAndGameEnd(state, id);
  if (!state.poopyhead) advanceTurn(state, skips);
  return { ok: true };
}

function pickUp(state, id) {
  const p = state.players[id];
  if (state.pile.length === 0) return { ok: false, reason: 'there is nothing to pick up' };
  const source = currentSource(state, id);
  if (source === 'faceDown') return { ok: false, reason: 'flip a face-down card instead' };
  if (hasLegalPlay(state, id)) return { ok: false, reason: 'you have a playable card — you must play' };

  p.hand.push(...state.pile);
  state.pile = [];
  log(state, `${p.name} can't play and picks up the pile.`);
  advanceTurn(state, 0);
  return { ok: true };
}

// ---------- per-viewer redaction ----------
// Hands are private to their owner. Face-down cards are private to EVERYONE,
// including their owner (they're played blind). Face-up cards, the pile, and
// counts are public.
export function redactStateFor(state, viewerKey) {
  const players = {};
  for (const id of state.playerOrder) {
    const p = state.players[id];
    const mine = id === viewerKey;
    players[id] = {
      name: p.name,
      hand: mine ? p.hand : p.hand.map((c) => ({ uid: c.uid, hidden: true })),
      faceUp: p.faceUp,
      faceDownCount: p.faceDown.length,
      out: p.out,
      ready: !!state.ready[id],
    };
  }
  return {
    me: viewerKey,
    playerOrder: state.playerOrder,
    players,
    phase: state.phase,
    // Sent as a duration, not a timestamp: the host's clock and a guest's
    // clock don't agree, so each client counts down from when it received
    // this rather than from a wall-clock deadline it can't trust.
    swapMsLeft: state.phase === 'swap' ? Math.max(0, state.swapEndsAt - Date.now()) : 0,
    drawCount: state.drawPile.length,
    pile: state.pile,
    effective: effectiveTopRank(state.pile),
    burnedCount: state.burnedCount,
    active: state.active,
    turnNumber: state.turnNumber,
    pendingJoker: state.pendingJoker ? { playerId: state.pendingJoker.playerId } : null,
    finishedOrder: state.finishedOrder,
    poopyhead: state.poopyhead,
    source: state.players[viewerKey] ? currentSource(state, viewerKey) : null,
    canPickUp: state.players[viewerKey]
      ? (state.active === viewerKey && !state.pendingJoker && state.pile.length > 0
         && currentSource(state, viewerKey) !== 'faceDown' && !state.players[viewerKey].out
         && !hasLegalPlay(state, viewerKey))
      : false,
    log: state.log,
  };
}
