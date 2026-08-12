import { cardById, targetKindFor, MAX_PLAYERS } from './data.js';
import { createMatch, applyIntent, redactStateFor } from './engine.js';
import {
  createConnection, onOpen, onMessage, onClose, sendMessage,
  createHostOffer, acceptGuestAnswer, createGuestAnswer,
} from './net.js';

const root = document.getElementById('app');

let screen = 'menu'; // menu | host-lobby | guest-connect | guest-lobby | board | disconnected
let role = null; // 'host' | 'guest'
let myName = localStorage.getItem('riftclash_name') || '';

// -- host-only state --
let seats = []; // [{ playerId, conn, code, connected, name, error }]
let matchState = null; // the one authoritative engine state, only ever touched on the host

// -- guest-only state --
let guestConn = null;
let guestCode = null;

let snapshot = null; // the redacted view we render, on either role
let statusMessage = '';
let pendingAction = null; // { kind: 'playCard', uid, targetKind } | { kind: 'attack', attackerUid } | null
let actionError = '';

// Player names are user-typed (and a guest's name arrives over the wire from
// their browser, not ours) but get interpolated straight into innerHTML
// templates below, so they must be escaped -- otherwise a name like
// "<img src=x onerror=...>" would execute in every player's page.
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(str) { return String(str ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]); }

function render() {
  // A render can be forced by a background event unrelated to whatever the
  // user is doing right now -- e.g. one lobby seat finishing its WebRTC
  // handshake while the host is still mid-paste of a *different* seat's
  // reply code. Since render() below rebuilds the whole screen from
  // scratch, that paste would otherwise be silently wiped. Snapshot every
  // editable field by id before rebuilding and restore it after.
  const preserved = {};
  root.querySelectorAll('textarea[id], input[id]').forEach((f) => { preserved[f.id] = f.value; });

  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'screen';
  root.appendChild(el);
  if (screen === 'menu') renderMenu(el);
  else if (screen === 'host-lobby') renderHostLobby(el);
  else if (screen === 'guest-connect') renderGuestConnect(el);
  else if (screen === 'guest-lobby') renderGuestLobby(el);
  else if (screen === 'board') renderBoard(el);
  else if (screen === 'disconnected') renderDisconnected(el);

  root.querySelectorAll('textarea[id], input[id]').forEach((f) => {
    if (!f.readOnly && f.id in preserved) f.value = preserved[f.id];
  });
}

// ---------- menu ----------
function renderMenu(el) {
  const hasName = myName.trim().length > 0;
  el.innerHTML = `
    <h1 class="logo">Rift Clash</h1>
    <p class="tagline">A free-for-all card duel, up to 8 players across 8 devices — no account, no server.</p>
    <div class="panel col">
      <div class="dim">Your name</div>
      <input type="text" id="nameInput" maxlength="20" placeholder="Enter your name" value="${esc(myName)}" />
    </div>
    <div class="col menu-col">
      <button class="btn wide" id="hostBtn" ${hasName ? '' : 'disabled'}>Host Game</button>
      <button class="btn secondary wide" id="joinBtn" ${hasName ? '' : 'disabled'}>Join Game</button>
      ${hasName ? '' : '<div class="dim center">Enter a name to continue.</div>'}
    </div>
  `;
  const nameInput = el.querySelector('#nameInput');
  const hostBtn = el.querySelector('#hostBtn');
  const joinBtn = el.querySelector('#joinBtn');
  nameInput.oninput = () => {
    myName = nameInput.value;
    localStorage.setItem('riftclash_name', myName);
    const ok = myName.trim().length > 0;
    hostBtn.disabled = !ok;
    joinBtn.disabled = !ok;
  };
  hostBtn.onclick = startHostFlow;
  joinBtn.onclick = startGuestFlow;
}

// ---------- shared teardown ----------
function resetAll() {
  for (const seat of seats) if (seat.conn && seat.conn.pc) seat.conn.pc.close();
  if (guestConn && guestConn.pc) guestConn.pc.close();
  seats = []; matchState = null; snapshot = null; guestConn = null; guestCode = null;
  statusMessage = ''; pendingAction = null; actionError = '';
}

function backToMenu() {
  resetAll();
  role = null;
  screen = 'menu';
  render();
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1200);
  });
}

// ---------- host: invite seats ----------
function startHostFlow() {
  resetAll();
  role = 'host';
  screen = 'host-lobby';
  render();
}

function invitePlayer() {
  if (seats.length >= MAX_PLAYERS - 1) return;
  const seatIndex = seats.length + 2; // host is player 1
  const seat = { playerId: `p${seatIndex}`, conn: createConnection('host-seat'), code: null, connected: false, name: '', error: '' };
  seats.push(seat);

  onOpen(seat.conn, () => { seat.connected = true; seat.error = ''; render(); });
  onClose(seat.conn, () => {
    seat.connected = false;
    if (screen === 'board' && matchState && !matchState.players[seat.playerId]?.eliminated) {
      statusMessage = `${seat.name || seat.playerId} disconnected.`;
    }
    render();
  });
  onMessage(seat.conn, (msg) => {
    if (msg.type === 'hello') {
      seat.name = (msg.name || '').trim() || seat.playerId;
      render();
    } else if (msg.type === 'intent' && matchState) {
      applyIntent(matchState, seat.playerId, msg.intent);
      broadcastSnapshots();
      render();
    }
  });

  render();
  createHostOffer(seat.conn).then((code) => { seat.code = code; render(); })
    .catch((err) => { seat.error = err.message; render(); });
}

function connectSeat(seat, replyCode, onDone) {
  acceptGuestAnswer(seat.conn, replyCode).then(() => onDone(null)).catch((err) => onDone(err.message));
}

function renderHostLobby(el) {
  const connectedCount = 1 + seats.filter((s) => s.connected).length;
  el.innerHTML = `
    <h2 class="center">Host Game</h2>
    <p class="dim center">Invite up to 7 more players, then start whenever you're ready.</p>
    <div class="panel row between"><strong>${esc(myName)} (Host)</strong><span class="badge gold">Ready</span></div>
    <div class="col" id="seatList"></div>
    <button class="btn secondary wide" id="inviteBtn" ${seats.length >= MAX_PLAYERS - 1 ? 'disabled' : ''}>Invite Player (${seats.length}/${MAX_PLAYERS - 1})</button>
    <button class="btn wide" id="startBtn" ${connectedCount >= 2 ? '' : 'disabled'}>Start Game (${connectedCount} players)</button>
    <button class="btn secondary wide" id="backBtn">Cancel</button>
  `;
  const seatList = el.querySelector('#seatList');
  seats.forEach((seat, i) => {
    const box = document.createElement('div');
    box.className = 'panel col';
    const seatLabel = esc(seat.name || `Player ${i + 2}`);
    if (seat.connected) {
      box.innerHTML = `<div class="row between"><strong>${seatLabel}</strong><span class="badge gold">Connected</span></div>`;
    } else if (!seat.code) {
      box.innerHTML = `<div class="row between"><strong>${seatLabel}</strong><span class="dim">Generating code…</span></div>`;
    } else {
      box.innerHTML = `
        <div class="row between"><strong>${seatLabel}</strong><span class="dim">Waiting to connect</span></div>
        <div class="dim">Step 1 — send this code to them:</div>
        <textarea readonly class="code-box" id="code${i}">${seat.code}</textarea>
        <button class="btn secondary small" id="copy${i}">Copy Code</button>
        <div class="dim">Step 2 — paste the reply code they send back:</div>
        <textarea class="code-box" id="reply${i}" placeholder="Paste their reply code here"></textarea>
        <button class="btn small" id="connect${i}">Connect</button>
        ${seat.error ? `<div class="error">${seat.error}</div>` : ''}
      `;
    }
    seatList.appendChild(box);
    const copyBtn = box.querySelector(`#copy${i}`);
    if (copyBtn) copyBtn.onclick = () => copyToClipboard(seat.code, copyBtn);
    const connectBtn = box.querySelector(`#connect${i}`);
    if (connectBtn) connectBtn.onclick = () => {
      const code = box.querySelector(`#reply${i}`).value;
      if (!code.trim()) return;
      connectSeat(seat, code, (err) => { seat.error = err || ''; render(); });
    };
  });

  el.querySelector('#inviteBtn').onclick = invitePlayer;
  el.querySelector('#startBtn').onclick = startMatch;
  el.querySelector('#backBtn').onclick = backToMenu;
}

function startMatch() {
  const connectedSeats = seats.filter((s) => s.connected);
  for (const s of seats) if (!s.connected && s.conn && s.conn.pc) s.conn.pc.close();
  seats = connectedSeats;

  const playerIds = ['host', ...seats.map((s) => s.playerId)];
  const names = { host: myName.trim() || 'Host' };
  seats.forEach((s, i) => { names[s.playerId] = s.name || `Player ${i + 2}`; });

  const seed = Math.floor(Math.random() * 0xFFFFFFFF);
  matchState = createMatch(seed, playerIds, names);
  broadcastSnapshots();
  screen = 'board';
  render();
}

function broadcastSnapshots() {
  snapshot = redactStateFor(matchState, 'host');
  for (const seat of seats) sendMessage(seat.conn, { type: 'state', snapshot: redactStateFor(matchState, seat.playerId) });
}

// ---------- guest ----------
function startGuestFlow() {
  resetAll();
  role = 'guest';
  guestConn = createConnection('guest');
  onOpen(guestConn, () => {
    sendMessage(guestConn, { type: 'hello', name: myName.trim() });
    screen = 'guest-lobby'; statusMessage = ''; render();
  });
  onMessage(guestConn, (msg) => {
    if (msg.type === 'state') {
      snapshot = msg.snapshot;
      screen = 'board';
      pendingAction = null;
      actionError = '';
      render();
    }
  });
  onClose(guestConn, () => {
    if (screen === 'board') screen = 'disconnected';
    statusMessage = 'The connection to the host was closed.';
    render();
  });
  screen = 'guest-connect';
  render();
}

function renderGuestConnect(el) {
  el.innerHTML = `
    <h2 class="center">Join Game</h2>
    <p class="dim center">Joining as <strong>${esc(myName)}</strong></p>
    ${statusMessage ? `<p class="dim center">${statusMessage}</p>` : ''}
    <div class="panel col">
      <div class="dim">Step 1 — paste the host's code:</div>
      <textarea class="code-box" id="hostCodeInput" placeholder="Paste the host's code here"></textarea>
      <button class="btn wide" id="genBtn">Generate Join Code</button>
    </div>
    ${guestCode ? `
      <div class="panel col">
        <div class="dim">Step 2 — send this code back to the host:</div>
        <textarea readonly class="code-box" id="replyCodeBox">${guestCode}</textarea>
        <button class="btn secondary" id="copyReplyCode">Copy Code</button>
        <div class="dim center">Waiting for the host to connect…</div>
      </div>` : ''}
    <button class="btn secondary wide" id="backBtn">Cancel</button>
  `;
  const genBtn = el.querySelector('#genBtn');
  genBtn.onclick = async () => {
    const code = el.querySelector('#hostCodeInput').value;
    if (!code.trim()) return;
    genBtn.disabled = true;
    try {
      guestCode = await createGuestAnswer(guestConn, code);
      render();
    } catch (err) {
      statusMessage = err.message;
      genBtn.disabled = false;
    }
  };
  const copyBtn = el.querySelector('#copyReplyCode');
  if (copyBtn) copyBtn.onclick = () => copyToClipboard(guestCode, copyBtn);
  el.querySelector('#backBtn').onclick = backToMenu;
}

function renderGuestLobby(el) {
  el.innerHTML = `
    <div class="center" style="margin-top:60px">
      <h2>Connected!</h2>
      <p class="dim">Waiting for the host to start the game…</p>
      <button class="btn secondary wide" id="backBtn" style="margin-top:16px">Cancel</button>
    </div>
  `;
  el.querySelector('#backBtn').onclick = backToMenu;
}

function renderDisconnected(el) {
  el.innerHTML = `
    <div class="center" style="margin-top:60px">
      <h2>Disconnected</h2>
      <p class="dim">${statusMessage}</p>
      <button class="btn wide" id="menuBtn" style="margin-top:16px">Back to Menu</button>
    </div>
  `;
  el.querySelector('#menuBtn').onclick = backToMenu;
}

// ---------- board ----------
function submitIntent(intent) {
  actionError = '';
  if (role === 'host') {
    const res = applyIntent(matchState, 'host', intent);
    if (!res.ok) { actionError = res.reason; pendingAction = null; render(); return; }
    pendingAction = null;
    broadcastSnapshots();
    render();
  } else {
    sendMessage(guestConn, { type: 'intent', intent });
    pendingAction = null;
    render(); // optimistic UI clear; the board itself updates when the host's snapshot arrives
  }
}

function cancelPending() { pendingAction = null; actionError = ''; render(); }

function cardMarkup(inst, { clickable, selected } = {}) {
  if (inst.hidden) return `<div class="card card-back"></div>`;
  const card = cardById(inst.cardId);
  const statLine = card.type === 'creature' ? `<div class="card-stats">${card.attack} / ${card.health}</div>` : '';
  return `
    <div class="card ${card.type} ${clickable ? 'clickable' : ''} ${selected ? 'selected' : ''}" data-card-uid="${inst.uid}">
      <div class="card-cost">${card.cost}</div>
      <div class="card-icon">${card.icon}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-text">${card.text}</div>
      ${statLine}
    </div>`;
}

function creatureMarkup(creature, { clickable, selected, mini } = {}) {
  const card = cardById(creature.cardId);
  const tags = [];
  if (creature.sick) tags.push('sick');
  if (creature.attackedThisTurn) tags.push('spent');
  if (mini) tags.push('mini');
  return `
    <div class="creature ${clickable ? 'clickable' : ''} ${selected ? 'selected' : ''} ${tags.join(' ')}" data-creature-uid="${creature.uid}">
      <div class="creature-icon">${card.icon}</div>
      <div class="creature-name">${card.name}</div>
      <div class="creature-stats">${creature.attack} / ${creature.health}</div>
    </div>`;
}

function renderBoard(el) {
  const me = snapshot.players[snapshot.me];
  const opponentIds = snapshot.playerOrder.filter((id) => id !== snapshot.me);
  const isMyTurn = snapshot.active === snapshot.me && !snapshot.winner && !me.eliminated;

  const attackTargetMode = pendingAction && pendingAction.kind === 'attack';
  const targetKind = pendingAction && pendingAction.kind === 'playCard' ? pendingAction.targetKind : null;
  const oppCreatureClickable = attackTargetMode || targetKind === 'any';
  const oppFaceClickable = attackTargetMode || targetKind === 'face';

  el.innerHTML = `
    ${snapshot.winner ? `
      <div class="winner-banner">
        <strong>${snapshot.winner === 'draw' ? 'Draw — everyone was eliminated.' : snapshot.winner === snapshot.me ? 'You win!' : `${esc(snapshot.players[snapshot.winner].name)} wins!`}</strong>
        <button class="btn secondary small" id="menuBtn">Back to Menu</button>
      </div>` : ''}
    ${!snapshot.winner && me.eliminated ? '<div class="winner-banner"><strong>You have been eliminated — spectating.</strong></div>' : ''}

    <div class="row between hud">
      <div class="badge ${isMyTurn ? 'gold' : ''}">${isMyTurn ? 'Your turn' : `${esc(snapshot.players[snapshot.active].name)}'s turn`} · Turn ${snapshot.turnNumber}</div>
    </div>

    <div class="opp-row" id="oppRow">
      ${opponentIds.map((id) => {
        const opp = snapshot.players[id];
        if (opp.eliminated) {
          return `<div class="opp-panel eliminated"><div class="opp-name">${esc(opp.name)}</div><div class="dim">Eliminated</div></div>`;
        }
        return `
          <div class="opp-panel" data-player-id="${id}">
            <div class="opp-name">${esc(opp.name)}${snapshot.active === id ? ' \u{1F551}' : ''}</div>
            <div class="opp-face-target ${oppFaceClickable ? 'clickable' : ''}" data-target-player="${id}">
              ❤ ${opp.life} &middot; \u{1F4A0} ${opp.mana}/${opp.manaCap}
            </div>
            <div class="dim">deck ${opp.deckCount} &middot; hand ${opp.hand.length}</div>
            <div class="opp-board">${opp.board.map((c) => creatureMarkup(c, { clickable: oppCreatureClickable, mini: true })).join('')}</div>
          </div>`;
      }).join('')}
    </div>

    <div class="board-zone my-zone" id="myBoard">
      ${me.board.map((c) => {
        const eligible = isMyTurn && !pendingAction && !c.sick && !c.attackedThisTurn;
        const targetable = targetKind === 'ally' || targetKind === 'any';
        return creatureMarkup(c, { clickable: eligible || targetable, selected: pendingAction && pendingAction.attackerUid === c.uid });
      }).join('')}
    </div>

    <div class="row between hud">
      <div class="badge">You ❤ ${me.life} &middot; \u{1F4A0} ${me.mana}/${me.manaCap} &middot; deck ${me.deckCount}</div>
      ${isMyTurn ? '<button class="btn small" id="endTurnBtn">End Turn</button>' : ''}
    </div>

    ${pendingAction ? `<div class="dim center prompt">${pendingAction.kind === 'attack' ? 'Choose an opponent (or one of their creatures) to attack.' : 'Choose a target for this card.'} <button class="btn secondary small" id="cancelBtn">Cancel</button></div>` : ''}
    ${actionError ? `<div class="dim center error">${actionError}</div>` : ''}

    <div class="row wrap my-hand" id="myHand">${me.hand.map((c) => {
      const card = cardById(c.cardId);
      const affordable = isMyTurn && !pendingAction && me.mana >= card.cost;
      return cardMarkup(c, { clickable: affordable });
    }).join('')}</div>

    <div class="log-box" id="logBox">${snapshot.log.slice().reverse().slice(0, 30).map((l) => `<div>${esc(l)}</div>`).join('')}</div>
  `;

  const menuBtn = el.querySelector('#menuBtn');
  if (menuBtn) menuBtn.onclick = backToMenu;

  const endTurnBtn = el.querySelector('#endTurnBtn');
  if (endTurnBtn) endTurnBtn.onclick = () => submitIntent({ type: 'endTurn' });

  const cancelBtn = el.querySelector('#cancelBtn');
  if (cancelBtn) cancelBtn.onclick = cancelPending;

  el.querySelectorAll('#myHand [data-card-uid]').forEach((cardEl) => {
    if (!isMyTurn || pendingAction) return;
    cardEl.onclick = () => {
      const uid = cardEl.dataset.cardUid;
      const inst = me.hand.find((c) => c.uid === uid);
      const card = cardById(inst.cardId);
      if (me.mana < card.cost) return;
      const kind = targetKindFor(card);
      if (!kind) { submitIntent({ type: 'playCard', uid }); return; }
      pendingAction = { kind: 'playCard', uid, targetKind: kind };
      render();
    };
  });

  if (attackTargetMode) {
    el.querySelectorAll('.opp-face-target.clickable').forEach((z) => {
      z.onclick = () => submitIntent({ type: 'attack', attackerUid: pendingAction.attackerUid, targetPlayerId: z.dataset.targetPlayer, targetUid: 'face' });
    });
    el.querySelectorAll('.opp-board [data-creature-uid]').forEach((c) => {
      c.onclick = () => {
        const panel = c.closest('.opp-panel');
        submitIntent({ type: 'attack', attackerUid: pendingAction.attackerUid, targetPlayerId: panel.dataset.playerId, targetUid: c.dataset.creatureUid });
      };
    });
  } else if (targetKind === 'face') {
    el.querySelectorAll('.opp-face-target.clickable').forEach((z) => {
      z.onclick = () => submitIntent({ type: 'playCard', uid: pendingAction.uid, targetPlayerId: z.dataset.targetPlayer });
    });
  } else if (targetKind === 'any') {
    el.querySelectorAll('#myBoard [data-creature-uid], .opp-board [data-creature-uid]').forEach((c) => {
      c.onclick = () => submitIntent({ type: 'playCard', uid: pendingAction.uid, targetUid: c.dataset.creatureUid });
    });
  } else if (targetKind === 'ally') {
    el.querySelectorAll('#myBoard [data-creature-uid]').forEach((c) => {
      c.onclick = () => submitIntent({ type: 'playCard', uid: pendingAction.uid, targetUid: c.dataset.creatureUid });
    });
  } else if (isMyTurn && !pendingAction) {
    el.querySelectorAll('#myBoard [data-creature-uid]').forEach((c) => {
      const creature = me.board.find((cr) => cr.uid === c.dataset.creatureUid);
      if (!creature || creature.sick || creature.attackedThisTurn) return;
      c.onclick = () => { pendingAction = { kind: 'attack', attackerUid: creature.uid }; render(); };
    });
  }
}

render();
