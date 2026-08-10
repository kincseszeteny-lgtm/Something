// The authoritative game engine. Only the Host ever calls createMatch/applyIntent
// -- see net.js and main.js. Every other player only sends intents and renders
// whatever redacted snapshot the Host sends back; this makes desync structurally
// impossible since there is exactly one place the simulation actually runs.
//
// Free-for-all: 2-8 players in a fixed turn order, everyone playing the same
// preset deck, last player with life remaining wins. Zone model (card-game
// skill): every card instance lives in exactly one of deck/hand/board/discard
// at a time. Moves are always remove-from-A then add-to-B, never a copy.

import {
  cardById, buildDecklistIds, targetKindFor, STARTING_LIFE, STARTING_MANA_CAP,
  MAX_BOARD_CREATURES, MAX_HAND_SIZE,
} from './data.js';

export const PHASES = ['untap', 'draw', 'action', 'end'];
const OPENING_HAND = 4;

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
function newPlayerState(name, uidGen, rng) {
  const deck = shuffle(buildDecklistIds(), rng).map((cardId) => ({ uid: uidGen(), cardId }));
  return {
    name, deck, hand: [], board: [], discard: [],
    life: STARTING_LIFE, mana: 0, manaCap: 0, eliminated: false,
  };
}

// playerIds: ordered array of 2-8 ids, first entry acts first. names: {id: displayName}.
export function createMatch(seed, playerIds, names = {}) {
  let nextUid = 1;
  const uidGen = () => `c${nextUid++}`;
  const rng = makeRng(seed);

  const players = {};
  for (const id of playerIds) players[id] = newPlayerState(names[id] || id, uidGen, rng);

  const state = {
    seed,
    playerOrder: [...playerIds],
    players,
    active: playerIds[0],
    phase: 'action',
    turnNumber: 1,
    log: [],
    winner: null,
    _rng: rng,
  };

  for (const id of playerIds) drawCards(state, id, OPENING_HAND);

  // First active player gets their first mana; everyone else gets theirs on
  // their own first untap, inside endTurn.
  state.players[state.active].manaCap = 1;
  state.players[state.active].mana = 1;

  return state;
}

function log(state, msg) { state.log.push(msg); if (state.log.length > 300) state.log.shift(); }

function otherPlayerIds(state, key) { return state.playerOrder.filter((id) => id !== key); }

function nextAlivePlayer(state, fromId) {
  const order = state.playerOrder;
  const idx = order.indexOf(fromId);
  for (let step = 1; step <= order.length; step++) {
    const cand = order[(idx + step) % order.length];
    if (!state.players[cand].eliminated) return cand;
  }
  return fromId;
}

// ---------- draw + reshuffle (card-game skill, Pattern 1) ----------
function drawCards(state, key, n) {
  const p = state.players[key];
  if (p.eliminated) return;
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) {
        // deck-out: nothing left to draw anywhere. Force elimination via the
        // normal life<=0 path so there's exactly one place eliminations happen.
        p.life = 0;
        log(state, `${p.name} has no cards left to draw.`);
        return;
      }
      p.deck = shuffle(p.discard, state._rng);
      p.discard = [];
      log(state, `${p.name} reshuffles their discard pile into their deck.`);
    }
    if (p.hand.length >= MAX_HAND_SIZE) {
      const burned = p.deck.pop();
      p.discard.push(burned);
      log(state, `${p.name}'s hand is full; a drawn card is discarded.`);
      continue;
    }
    p.hand.push(p.deck.pop());
  }
}

// ---------- effect resolution (Pattern 2: effects are data, one interpreter) ----------
function resolveEffect(state, casterKey, effect, ctx) {
  const caster = state.players[casterKey];
  switch (effect.op) {
    case 'damage': {
      if (effect.target === 'chosen') {
        const owner = findCreatureOwner(state, ctx.targetUid);
        const creature = owner && owner.playerState.board.find((c) => c.uid === ctx.targetUid);
        if (creature) damageCreature(state, owner.playerState, creature, effect.amount);
      } else if (effect.target === 'chosenAlly') {
        const creature = caster.board.find((c) => c.uid === ctx.targetUid);
        if (creature) damageCreature(state, caster, creature, effect.amount);
      } else if (effect.target === 'chosenFace') {
        const target = state.players[ctx.targetPlayerId];
        if (target && !target.eliminated && ctx.targetPlayerId !== casterKey) target.life -= effect.amount;
      } else if (effect.target === 'allEnemyCreatures') {
        for (const id of otherPlayerIds(state, casterKey)) {
          const opp = state.players[id];
          for (const creature of [...opp.board]) damageCreature(state, opp, creature, effect.amount);
        }
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
  for (const id of state.playerOrder) {
    if (state.players[id].board.some((c) => c.uid === uid)) return { id, playerState: state.players[id] };
  }
  return null;
}

// ---------- intents: the single entry point for both local and remote actions ----------
export function applyIntent(state, playerKey, intent) {
  if (state.winner) return { ok: false, reason: 'match already over' };
  if (playerKey !== state.active) return { ok: false, reason: 'not your turn' };
  if (state.players[playerKey].eliminated) return { ok: false, reason: 'you have been eliminated' };

  if (intent.type === 'playCard') return playCard(state, playerKey, intent.uid, intent.targetUid, intent.targetPlayerId);
  if (intent.type === 'attack') return attack(state, playerKey, intent.attackerUid, intent.targetPlayerId, intent.targetUid);
  if (intent.type === 'endTurn') return endTurn(state);
  return { ok: false, reason: `unknown intent type ${intent.type}` };
}

function playCard(state, playerKey, uid, targetUid, targetPlayerId) {
  const p = state.players[playerKey];
  const idx = p.hand.findIndex((c) => c.uid === uid);
  if (idx === -1) return { ok: false, reason: 'card not in hand' };
  const inst = p.hand[idx];
  const card = cardById(inst.cardId);
  if (p.mana < card.cost) return { ok: false, reason: 'not enough mana' };

  // Validate targets before committing anything (atomic play -- skill pitfall:
  // "targeting state leaks" if a cancelled play half-applies).
  const kind = targetKindFor(card);
  if (kind === 'face' && (!targetPlayerId || !state.players[targetPlayerId] || state.players[targetPlayerId].eliminated || targetPlayerId === playerKey)) {
    return { ok: false, reason: 'choose a valid opponent to target' };
  }
  if ((kind === 'any' || kind === 'ally') && !targetUid) return { ok: false, reason: 'this card needs a target' };
  if (card.type === 'creature' && p.board.length >= MAX_BOARD_CREATURES) return { ok: false, reason: 'board is full' };

  p.hand.splice(idx, 1);
  p.mana -= card.cost;

  if (card.type === 'creature') {
    p.board.push({ uid: inst.uid, cardId: inst.cardId, attack: card.attack, health: card.health, maxHealth: card.health, sick: true, attackedThisTurn: false });
    log(state, `${p.name} plays ${card.name}.`);
    if (card.onPlay) for (const fx of card.onPlay) resolveEffect(state, playerKey, fx, { targetUid, targetPlayerId });
  } else {
    p.discard.push({ uid: inst.uid, cardId: inst.cardId });
    log(state, `${p.name} casts ${card.name}.`);
    for (const fx of card.effects) resolveEffect(state, playerKey, fx, { targetUid, targetPlayerId });
  }

  checkWin(state);
  return { ok: true };
}

function attack(state, playerKey, attackerUid, targetPlayerId, targetUid) {
  const p = state.players[playerKey];
  if (!targetPlayerId || targetPlayerId === playerKey) return { ok: false, reason: 'choose an opponent to attack' };
  const opp = state.players[targetPlayerId];
  if (!opp || opp.eliminated) return { ok: false, reason: 'that player is not a valid target' };

  const attacker = p.board.find((c) => c.uid === attackerUid);
  if (!attacker) return { ok: false, reason: 'attacker not on your board' };
  if (attacker.sick) return { ok: false, reason: 'this creature is summoning-sick' };
  if (attacker.attackedThisTurn) return { ok: false, reason: 'this creature already attacked this turn' };

  attacker.attackedThisTurn = true;
  if (targetUid === 'face') {
    opp.life -= attacker.attack;
    log(state, `${p.name}'s ${cardById(attacker.cardId).name} attacks ${opp.name} for ${attacker.attack}.`);
  } else {
    const defender = opp.board.find((c) => c.uid === targetUid);
    if (!defender) return { ok: false, reason: 'target creature not found' };
    log(state, `${p.name}'s ${cardById(attacker.cardId).name} trades with ${opp.name}'s ${cardById(defender.cardId).name}.`);
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

  const next = nextAlivePlayer(state, key);
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
  log(state, `${np.name}'s turn (${state.turnNumber}).`);
  checkWin(state);
  return { ok: true };
}

function checkWin(state) {
  if (state.winner) return;
  for (const id of state.playerOrder) {
    const p = state.players[id];
    if (!p.eliminated && p.life <= 0) {
      p.eliminated = true;
      p.life = 0;
      for (const c of p.board) p.discard.push({ uid: c.uid, cardId: c.cardId });
      p.board = [];
      log(state, `${p.name} is eliminated!`);
    }
  }
  const alive = state.playerOrder.filter((id) => !state.players[id].eliminated);
  if (alive.length === 1) { state.winner = alive[0]; log(state, `${state.players[alive[0]].name} wins the match!`); }
  else if (alive.length === 0) { state.winner = 'draw'; log(state, 'Everyone was eliminated -- a draw.'); }
}

// ---------- per-viewer redaction: a player only ever sees their own hand's
// card identities; every other hand is a count of face-down placeholders.
// Boards/discards/life/mana are public. ----------
export function redactStateFor(state, viewerKey) {
  const redactPlayer = (key) => {
    const p = state.players[key];
    const mine = key === viewerKey;
    return {
      name: p.name,
      deckCount: p.deck.length,
      hand: mine ? p.hand : p.hand.map((c) => ({ uid: c.uid, hidden: true })),
      board: p.board,
      discard: p.discard,
      life: p.life,
      mana: p.mana,
      manaCap: p.manaCap,
      eliminated: p.eliminated,
    };
  };
  const players = {};
  for (const id of state.playerOrder) players[id] = redactPlayer(id);
  return {
    me: viewerKey,
    playerOrder: state.playerOrder,
    active: state.active,
    phase: state.phase,
    turnNumber: state.turnNumber,
    winner: state.winner,
    log: state.log,
    players,
  };
}
