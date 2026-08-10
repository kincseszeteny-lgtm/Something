import { cardById, targetKindFor } from './data.js';
import { createMatch, applyIntent, redactStateFor } from './engine.js';
import {
  createConnection, onOpen, onMessage, onClose, sendMessage,
  createHostOffer, acceptGuestAnswer, createGuestAnswer,
} from './net.js';

const root = document.getElementById('app');

let screen = 'menu'; // menu | connect-host | connect-guest | board | disconnected
let role = null; // 'host' | 'guest'
let conn = null;
let matchState = null; // only meaningful for the host -- the authoritative engine state
let snapshot = null; // the redacted view we actually render, for either role
let hostCode = null;
let guestReplyCode = null;
let statusMessage = '';
let pendingAction = null; // { kind: 'playCard', uid, targetKind } | { kind: 'attack', attackerUid } | null
let actionError = '';

function render() {
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'screen';
  root.appendChild(el);
  if (screen === 'menu') return renderMenu(el);
  if (screen === 'connect-host') return renderConnectHost(el);
  if (screen === 'connect-guest') return renderConnectGuest(el);
  if (screen === 'board') return renderBoard(el);
  if (screen === 'disconnected') return renderDisconnected(el);
}

// ---------- menu ----------
function renderMenu(el) {
  el.innerHTML = `
    <h1 class="logo">Rift Clash</h1>
    <p class="tagline">A two-player card duel. Connect two devices directly — no account, no server.</p>
    <div class="col menu-col">
      <button class="btn wide" id="hostBtn">Host Game</button>
      <button class="btn secondary wide" id="joinBtn">Join Game</button>
    </div>
  `;
  el.querySelector('#hostBtn').onclick = startHostFlow;
  el.querySelector('#joinBtn').onclick = startGuestFlow;
}

// ---------- connection plumbing ----------
function resetConnectionState() {
  if (conn && conn.pc) conn.pc.close();
  conn = null; matchState = null; snapshot = null; hostCode = null; guestReplyCode = null;
  statusMessage = ''; pendingAction = null; actionError = '';
}

function wireConnHandlers() {
  onOpen(conn, () => {
    if (role === 'host') {
      const seed = Math.floor(Math.random() * 0xFFFFFFFF);
      matchState = createMatch(seed, { firstPlayer: 'host' });
      pushHostSnapshot();
      screen = 'board';
    } else {
      statusMessage = 'Connected! Waiting for the game to start…';
    }
    render();
  });
  onMessage(conn, (msg) => {
    if (role === 'host' && msg.type === 'intent') {
      applyIntent(matchState, 'guest', msg.intent);
      pushHostSnapshot();
      render();
    } else if (role === 'guest' && msg.type === 'state') {
      snapshot = msg.snapshot;
      screen = 'board';
      pendingAction = null;
      actionError = '';
      render();
    }
  });
  onClose(conn, () => {
    if (screen === 'board') screen = 'disconnected';
    statusMessage = 'The connection was closed.';
    render();
  });
}

function pushHostSnapshot() {
  snapshot = redactStateFor(matchState, 'host');
  sendMessage(conn, { type: 'state', snapshot: redactStateFor(matchState, 'guest') });
}

function startHostFlow() {
  resetConnectionState();
  role = 'host';
  conn = createConnection('host');
  wireConnHandlers();
  screen = 'connect-host';
  render();
  createHostOffer(conn).then((code) => { hostCode = code; render(); })
    .catch((err) => { statusMessage = err.message; render(); });
}

function startGuestFlow() {
  resetConnectionState();
  role = 'guest';
  conn = createConnection('guest');
  wireConnHandlers();
  screen = 'connect-guest';
  render();
}

function backToMenu() {
  resetConnectionState();
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

// ---------- connect screens ----------
function renderConnectHost(el) {
  el.innerHTML = `
    <h2 class="center">Host Game</h2>
    ${statusMessage ? `<p class="dim center">${statusMessage}</p>` : ''}
    <div class="panel col">
      <div class="dim">Step 1 — send this code to the other player:</div>
      ${hostCode
        ? `<textarea readonly class="code-box" id="hostCodeBox">${hostCode}</textarea>
           <button class="btn secondary" id="copyHostCode">Copy Code</button>`
        : '<div class="dim center">Generating connection code…</div>'}
    </div>
    <div class="panel col">
      <div class="dim">Step 2 — paste the reply code they send back:</div>
      <textarea class="code-box" id="replyInput" placeholder="Paste their reply code here"></textarea>
      <button class="btn wide" id="connectBtn" ${hostCode ? '' : 'disabled'}>Connect</button>
    </div>
    <button class="btn secondary wide" id="backBtn">Cancel</button>
  `;
  const copyBtn = el.querySelector('#copyHostCode');
  if (copyBtn) copyBtn.onclick = () => copyToClipboard(hostCode, copyBtn);
  el.querySelector('#connectBtn').onclick = async () => {
    const code = el.querySelector('#replyInput').value;
    if (!code.trim()) return;
    try {
      await acceptGuestAnswer(conn, code);
      statusMessage = 'Waiting for the connection to open…';
      render();
    } catch (err) {
      statusMessage = err.message;
      render();
    }
  };
  el.querySelector('#backBtn').onclick = backToMenu;
}

function renderConnectGuest(el) {
  el.innerHTML = `
    <h2 class="center">Join Game</h2>
    ${statusMessage ? `<p class="dim center">${statusMessage}</p>` : ''}
    <div class="panel col">
      <div class="dim">Step 1 — paste the host's code:</div>
      <textarea class="code-box" id="hostCodeInput" placeholder="Paste the host's code here">${guestReplyCode ? '' : ''}</textarea>
      <button class="btn wide" id="genBtn" ${guestReplyCode ? 'disabled' : ''}>Generate Join Code</button>
    </div>
    ${guestReplyCode ? `
      <div class="panel col">
        <div class="dim">Step 2 — send this code back to the host:</div>
        <textarea readonly class="code-box" id="replyCodeBox">${guestReplyCode}</textarea>
        <button class="btn secondary" id="copyReplyCode">Copy Code</button>
        <div class="dim center">Waiting for the host to connect…</div>
      </div>` : ''}
    <button class="btn secondary wide" id="backBtn">Cancel</button>
  `;
  const genBtn = el.querySelector('#genBtn');
  if (genBtn) genBtn.onclick = async () => {
    const code = el.querySelector('#hostCodeInput').value;
    if (!code.trim()) return;
    genBtn.disabled = true;
    try {
      guestReplyCode = await createGuestAnswer(conn, code);
      statusMessage = '';
      render();
    } catch (err) {
      statusMessage = err.message;
      genBtn.disabled = false;
    }
  };
  const copyBtn = el.querySelector('#copyReplyCode');
  if (copyBtn) copyBtn.onclick = () => copyToClipboard(guestReplyCode, copyBtn);
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
    pushHostSnapshot();
    render();
  } else {
    sendMessage(conn, { type: 'intent', intent });
    pendingAction = null;
    render(); // optimistic UI clear; the board itself updates when the host's snapshot arrives
  }
}

function cancelPending() { pendingAction = null; actionError = ''; render(); }

function cardMarkup(inst, { clickable, selected } = {}) {
  if (inst.hidden) {
    return `<div class="card card-back"></div>`;
  }
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

function creatureMarkup(creature, { clickable, selected } = {}) {
  const card = cardById(creature.cardId);
  const tags = [];
  if (creature.sick) tags.push('sick');
  if (creature.attackedThisTurn) tags.push('spent');
  return `
    <div class="creature ${clickable ? 'clickable' : ''} ${selected ? 'selected' : ''} ${tags.join(' ')}" data-creature-uid="${creature.uid}">
      <div class="creature-icon">${card.icon}</div>
      <div class="creature-name">${card.name}</div>
      <div class="creature-stats">${creature.attack} / ${creature.health}</div>
    </div>`;
}

function renderBoard(el) {
  const me = snapshot.players[snapshot.me];
  const oppKey = snapshot.me === 'host' ? 'guest' : 'host';
  const opp = snapshot.players[oppKey];
  const isMyTurn = snapshot.active === snapshot.me && !snapshot.winner;

  const attackTargetMode = pendingAction && pendingAction.kind === 'attack';
  const targetKind = pendingAction && pendingAction.kind === 'playCard' ? pendingAction.targetKind : null;

  el.innerHTML = `
    ${snapshot.winner ? `
      <div class="winner-banner">
        <strong>${snapshot.winner === snapshot.me ? 'You win!' : 'You lose.'}</strong>
        <button class="btn secondary small" id="menuBtn">Back to Menu</button>
      </div>` : ''}

    <div class="row between hud">
      <div class="badge">${oppKey === snapshot.me ? '' : 'Opponent'} ❤ ${opp.life} &middot; \u{1F4A0} ${opp.mana}/${opp.manaCap} &middot; deck ${opp.deckCount}</div>
      <div class="badge ${isMyTurn ? 'gold' : ''}">${isMyTurn ? 'Your turn' : "Opponent's turn"} · Turn ${snapshot.turnNumber}</div>
    </div>

    <div class="row wrap opp-hand" id="oppHand">${opp.hand.map((c) => cardMarkup(c)).join('')}</div>

    <div class="board-zone opp-zone" id="oppBoard">
      <div class="zone-target ${attackTargetMode ? 'clickable' : ''}" id="oppFaceTarget">${attackTargetMode ? 'Attack Face' : ''}</div>
      ${opp.board.map((c) => creatureMarkup(c, { clickable: attackTargetMode || targetKind === 'any' })).join('')}
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

    ${pendingAction ? `<div class="dim center prompt">${pendingAction.kind === 'attack' ? 'Choose a target for your attack.' : 'Choose a target for this card.'} <button class="btn secondary small" id="cancelBtn">Cancel</button></div>` : ''}
    ${actionError ? `<div class="dim center error">${actionError}</div>` : ''}

    <div class="row wrap my-hand" id="myHand">${me.hand.map((c) => {
      const card = cardById(c.cardId);
      const affordable = isMyTurn && !pendingAction && me.mana >= card.cost;
      return cardMarkup(c, { clickable: affordable });
    }).join('')}</div>

    <div class="log-box" id="logBox">${snapshot.log.slice().reverse().slice(0, 30).map((l) => `<div>${l}</div>`).join('')}</div>
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
    const faceTarget = el.querySelector('#oppFaceTarget');
    if (faceTarget) faceTarget.onclick = () => submitIntent({ type: 'attack', attackerUid: pendingAction.attackerUid, targetUid: 'face' });
    el.querySelectorAll('#oppBoard [data-creature-uid]').forEach((c) => {
      c.onclick = () => submitIntent({ type: 'attack', attackerUid: pendingAction.attackerUid, targetUid: c.dataset.creatureUid });
    });
  } else if (targetKind) {
    const selector = targetKind === 'ally' ? '#myBoard [data-creature-uid]' : '#myBoard [data-creature-uid], #oppBoard [data-creature-uid]';
    el.querySelectorAll(selector).forEach((c) => {
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
