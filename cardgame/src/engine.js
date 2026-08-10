// The authoritative game engine. Only the Host ever calls createMatch/applyIntent
// -- see net.js and main.js. The Guest only sends intents and renders whatever
// redacted snapshot the Host sends back; this makes desync structurally
// impossible since there is exactly one place the simulation actually runs.
//
// Zone model (card-game skill): every card instance lives in exactly one of
// deck/hand/board/discard at a time. Moves are always remove-from-A then
// add-to-B, never a copy.

import {
  cardById, buildDecklistIds, targetKindFor, STARTING_LIFE, STARTING_MANA_CAP,
  MAX_BOARD_CREATURES, MAX_HAND_SIZE,
} from './data.js';

export const PHASES = ['untap', 'draw', 'action', 'end'];
export const PLAYER_KEYS = ['host', 'guest'];

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
function newPlayerState(uidGen, rng) {
  const deck = shuffle(buildDecklistIds(), rng).map((cardId) => ({ uid: uidGen(), cardId }));
  return {
    deck, hand: [], board: [], discard: [],
    life: STARTING_LIFE, mana: 0, manaCap: 0,
  };
}

export function createMatch(seed, { firstPlayer = 'host' } = {}) {
  let nextUid = 1;
  const uidGen = () => `c${nextUid++}`;
  const rng = makeRng(seed);

  const state = {
    seed, rngState: null, // rng is re-derived from seed+draws below; kept simple, not resumable mid-shuffle
    players: { host: newPlayerState(uidGen, rng), guest: newPlayerState(uidGen, rng) },
    active: firstPlayer,
    phase: 'action',
    turnNumber: 1,
    log: [],
    winner: null,
    _rngSeedCounter: seed,
    _nextUid: nextUid,
  };
  state._rng = rng;

  // Opening hands: player going first draws 3, second draws 4 (offsets the
  // tempo advantage of going first -- standard CCG convention).
  drawCards(state, firstPlayer, 3);
  const second = firstPlayer === 'host' ? 'guest' : 'host';
  drawCards(state, second, 4);

  // Turn 1 for the first player: untap/draw already conceptually done by the
  // opening-hand draw above; give them their first mana.
  state.players[firstPlayer].manaCap = 1;
  state.players[firstPlayer].mana = 1;

  return state;
}

function otherKey(key) { return key === 'host' ? 'guest' : 'host'; }

function log(state, msg) { state.log.push(msg); if (state.log.length > 200) state.log.shift(); }

// ---------- draw + reshuffle (card-game skill, Pattern 1) ----------
function drawCards(state, key, n) {
  const p = state.players[key];
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) {
        // deck-out: no cards anywhere left to draw
        state.winner = otherKey(key);
        log(state, `${key} has no cards left to draw and loses.`);
        return;
      }
      p.deck = shuffle(p.discard, state._rng);
      p.discard = [];
      log(state, `${key} reshuffles their discard pile into their deck.`);
    }
    if (p.hand.length >= MAX_HAND_SIZE) {
      const burned = p.deck.pop();
      p.discard.push(burned);
      log(state, `${key}'s hand is full; a drawn card is discarded.`);
      continue;
    }
    p.hand.push(p.deck.pop());
  }
}

// ---------- effect resolution (Pattern 2: effects are data, one interpreter) ----------
function resolveEffect(state, casterKey, effect, ctx) {
  const caster = state.players[casterKey];
  const opponent = state.players[otherKey(casterKey)];
  switch (effect.op) {
    case 'damage': {
      if (effect.target === 'chosen' || effect.target === 'chosenAlly') {
        const owner = effect.target === 'chosenAlly' ? caster : findCreatureOwner(state, ctx.targetUid);
        const creature = owner && owner.board.find((c) => c.uid === ctx.targetUid);
        if (creature) damageCreature(state, owner, creature, effect.amount);
      } else if (effect.target === 'opponentFace') {
        opponent.life -= effect.amount;
      } else if (effect.target === 'allEnemyCreatures') {
        for (const creature of [...opponent.board]) damageCreature(state, opponent, creature, effect.amount);
      }
      break;
    }
    case 'heal': {
      caster.life = Math.min(STARTING_LIFE, caster.life + effect.amount);
      break;
    }
    case 'draw': {
      drawCards(state, casterKey, effect.amount);
      break;
    }
    case 'buff': {
      const creature = caster.board.find((c) => c.uid === ctx.targetUid);
      if (creature) { creature.attack += effect.attack; creature.maxHealth += effect.health; creature.health += effect.health; }
      break;
    }
  }
}

function damageCreature(state, ownerState, creature, amount) {
  creature.health -= amount;
  if (creature.health <= 0) {
    ownerState.board = ownerState.board.filter((c) => c.uid !== creature.uid);
    ownerState.discard.push({ uid: creature.uid, cardId: creature.cardId });
  }
}

function findCreatureOwner(state, uid) {
  if (state.players.host.board.some((c) => c.uid === uid)) return state.players.host;
  if (state.players.guest.board.some((c) => c.uid === uid)) return state.players.guest;
  return null;
}

// ---------- intents: the single entry point for both local and remote actions ----------
export function applyIntent(state, playerKey, intent) {
  if (state.winner) return { ok: false, reason: 'match already over' };
  if (playerKey !== state.active) return { ok: false, reason: 'not your turn' };

  if (intent.type === 'playCard') return playCard(state, playerKey, intent.uid, intent.targetUid);
  if (intent.type === 'attack') return attack(state, playerKey, intent.attackerUid, intent.targetUid);
  if (intent.type === 'endTurn') return endTurn(state);
  return { ok: false, reason: `unknown intent type ${intent.type}` };
}

function playCard(state, playerKey, uid, targetUid) {
  const p = state.players[playerKey];
  const idx = p.hand.findIndex((c) => c.uid === uid);
  if (idx === -1) return { ok: false, reason: 'card not in hand' };
  const inst = p.hand[idx];
  const card = cardById(inst.cardId);
  if (p.mana < card.cost) return { ok: false, reason: 'not enough mana' };

  // Validate targets before committing anything (atomic play -- skill pitfall:
  // "targeting state leaks" if a cancelled play half-applies).
  if (needsTarget(card) && !targetUid) return { ok: false, reason: 'this card needs a target' };
  if (card.type === 'creature' && p.board.length >= MAX_BOARD_CREATURES) return { ok: false, reason: 'board is full' };

  p.hand.splice(idx, 1);
  p.mana -= card.cost;

  if (card.type === 'creature') {
    p.board.push({ uid: inst.uid, cardId: inst.cardId, attack: card.attack, health: card.health, maxHealth: card.health, sick: true, attackedThisTurn: false });
    log(state, `${playerKey} plays ${card.name}.`);
    if (card.onPlay) for (const fx of card.onPlay) resolveEffect(state, playerKey, fx, { targetUid });
  } else {
    p.discard.push({ uid: inst.uid, cardId: inst.cardId });
    log(state, `${playerKey} casts ${card.name}.`);
    for (const fx of card.effects) resolveEffect(state, playerKey, fx, { targetUid });
  }

  checkWin(state);
  return { ok: true };
}

function needsTarget(card) {
  return targetKindFor(card) !== null;
}

function attack(state, playerKey, attackerUid, targetUid) {
  const p = state.players[playerKey];
  const opp = state.players[otherKey(playerKey)];
  const attacker = p.board.find((c) => c.uid === attackerUid);
  if (!attacker) return { ok: false, reason: 'attacker not on your board' };
  if (attacker.sick) return { ok: false, reason: 'this creature is summoning-sick' };
  if (attacker.attackedThisTurn) return { ok: false, reason: 'this creature already attacked this turn' };

  attacker.attackedThisTurn = true;
  if (targetUid === 'face') {
    opp.life -= attacker.attack;
    log(state, `${playerKey}'s ${cardById(attacker.cardId).name} attacks for ${attacker.attack}.`);
  } else {
    const defender = opp.board.find((c) => c.uid === targetUid);
    if (!defender) return { ok: false, reason: 'target creature not found' };
    log(state, `${playerKey}'s ${cardById(attacker.cardId).name} trades with ${cardById(defender.cardId).name}.`);
    damageCreature(state, opp, defender, attacker.attack);
    damageCreature(state, p, attacker, defender.attack);
  }

  checkWin(state);
  return { ok: true };
}

function endTurn(state) {
  const key = state.active;
  const p = state.players[key];

  // end phase: discard down to the hand limit (skill pitfall: no hand limit -> hoarding)
  while (p.hand.length > MAX_HAND_SIZE) p.discard.push(p.hand.pop());

  const next = otherKey(key);
  state.active = next;
  state.turnNumber += 1;

  // untap
  const np = state.players[next];
  for (const creature of np.board) { creature.sick = false; creature.attackedThisTurn = false; }
  np.manaCap = Math.min(STARTING_MANA_CAP, np.manaCap + 1);
  np.mana = np.manaCap;

  // draw
  drawCards(state, next, 1);

  state.phase = 'action';
  log(state, `${next}'s turn (${state.turnNumber}).`);
  checkWin(state);
  return { ok: true };
}

function checkWin(state) {
  if (state.winner) return;
  if (state.players.host.life <= 0) state.winner = 'guest';
  else if (state.players.guest.life <= 0) state.winner = 'host';
}

// ---------- per-viewer redaction: a player only ever sees their own hand's
// card identities and both decks as counts; board/discard/life/mana are public ----------
export function redactStateFor(state, viewerKey) {
  const redactPlayer = (key) => {
    const p = state.players[key];
    const mine = key === viewerKey;
    return {
      deckCount: p.deck.length,
      hand: mine ? p.hand : p.hand.map((c) => ({ uid: c.uid, hidden: true })),
      board: p.board,
      discard: p.discard,
      life: p.life,
      mana: p.mana,
      manaCap: p.manaCap,
    };
  };
  return {
    me: viewerKey,
    active: state.active,
    phase: state.phase,
    turnNumber: state.turnNumber,
    winner: state.winner,
    log: state.log,
    players: { host: redactPlayer('host'), guest: redactPlayer('guest') },
  };
}
