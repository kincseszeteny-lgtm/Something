import { canPlayRank, isRedSuit, RANKS, VALUE, MAX_PLAYERS } from './data.js';
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
let actionError = '';

// -- board interaction state --
let selectedUids = []; // hand cards currently selected (all one rank)
let jokerPrompt = null; // { uids } -- a joker play from hand/faceUp awaiting its rank choice

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
    <h1 class="logo">Poopyhead</h1>
    <p class="tagline">The classic card game — don't be the last one holding cards! Up to 8 players across 8 devices, no account, no server.</p>
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
  statusMessage = ''; actionError = ''; selectedUids = []; jokerPrompt = null;
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

  onOpen(seat.conn, () => {
    seat.connected = true; seat.error = '';
    // Ask for the guest's name instead of only trusting their unprompted
    // hello: a message sent in the same instant a channel opens can race
    // the other side's setup, and a seat stuck nameless all game is worth
    // the second, explicitly-requested hello.
    sendMessage(seat.conn, { type: 'whoAreYou' });
    render();
  });
  onClose(seat.conn, () => {
    seat.connected = false;
    if (screen === 'board' && matchState && !matchState.players[seat.playerId]?.out) {
      statusMessage = `${seat.name || seat.playerId} disconnected.`;
    }
    render();
  });
  onMessage(seat.conn, (msg) => {
    if (msg.type === 'hello') {
      seat.name = (msg.name || '').trim() || seat.playerId;
      // A hello can arrive after the host already started the match (the
      // host clicked Start in the instant between the channel opening and
      // the guest's name landing) -- patch the live match so the player
      // isn't stuck as "Player N" all game.
      if (matchState && matchState.players[seat.playerId]) {
        matchState.players[seat.playerId].name = seat.name;
        broadcastSnapshots();
      }
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
    <p class="dim center">Invite up to 7 more players, then start whenever you're ready. 5+ players are dealt from two decks.</p>
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
    if (msg.type === 'whoAreYou') {
      sendMessage(guestConn, { type: 'hello', name: myName.trim() });
    } else if (msg.type === 'state') {
      snapshot = msg.snapshot;
      screen = 'board';
      selectedUids = selectedUids.filter((uid) => snapshot.players[snapshot.me].hand.some((c) => c.uid === uid));
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
  selectedUids = [];
  jokerPrompt = null;
  if (role === 'host') {
    const res = applyIntent(matchState, 'host', intent);
    if (!res.ok) { actionError = res.reason; render(); return; }
    broadcastSnapshots();
    render();
  } else {
    sendMessage(guestConn, { type: 'intent', intent });
    render(); // the board itself updates when the host's snapshot arrives
  }
}

const RANK_LABEL = { JOKER: '🃏' };
function rankLabel(rank) { return RANK_LABEL[rank] || rank; }

function pcardMarkup(card, { clickable = false, selected = false, mini = false } = {}) {
  if (card.hidden || card.facedown) {
    return `<div class="pcard pcard-back ${mini ? 'mini' : ''} ${clickable ? 'clickable' : ''}" ${card.uid ? `data-uid="${card.uid}"` : ''}></div>`;
  }
  const joker = card.rank === 'JOKER';
  const red = joker ? false : isRedSuit(card.suit);
  const chosen = joker && card.chosenRank ? `<div class="pcard-chosen">= ${card.chosenRank}</div>` : '';
  return `
    <div class="pcard ${red ? 'red' : ''} ${joker ? 'joker' : ''} ${mini ? 'mini' : ''} ${clickable ? 'clickable' : ''} ${selected ? 'selected' : ''}" data-uid="${card.uid}">
      <div class="pcard-rank">${rankLabel(card.rank)}</div>
      <div class="pcard-suit">${joker ? 'JOKER' : card.suit}</div>
      ${chosen}
    </div>`;
}

function sortedHand(hand) {
  return [...hand].sort((a, b) => (VALUE[a.rank] || 15) - (VALUE[b.rank] || 15));
}

function jokerChooserMarkup(title) {
  return `
    <div class="panel col joker-chooser">
      <strong>${title}</strong>
      <div class="row wrap">${RANKS.map((r) => `<button class="btn small secondary" data-joker-rank="${r}">${r}</button>`).join('')}</div>
    </div>`;
}

// Seats spread around the top arc of the oval table, in turn order starting
// from the seat to my left. Returns {x, y} as percentages of the table box.
function seatPositions(n) {
  const positions = [];
  const startDeg = 205, endDeg = -25; // sweep over the top of the oval
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const rad = ((startDeg + (endDeg - startDeg) * t) * Math.PI) / 180;
    positions.push({
      x: 50 + 42 * Math.cos(rad),
      y: 42 - 32 * Math.sin(rad),
    });
  }
  return positions;
}

function renderBoard(el) {
  el.classList.add('board-screen');
  const me = snapshot.players[snapshot.me];
  // seat everyone around the table in real turn order, starting at my left
  const myIdx = snapshot.playerOrder.indexOf(snapshot.me);
  const opponentIds = [...snapshot.playerOrder.slice(myIdx + 1), ...snapshot.playerOrder.slice(0, myIdx)];
  const over = !!snapshot.poopyhead;
  const isMyTurn = snapshot.active === snapshot.me && !over && !me.out && !snapshot.pendingJoker;
  const myPendingJoker = snapshot.pendingJoker && snapshot.pendingJoker.playerId === snapshot.me;
  const eff = snapshot.effective;
  const source = snapshot.source;

  const selectedRank = selectedUids.length > 0
    ? me.hand.find((c) => c.uid === selectedUids[0])?.rank
    : null;

  const pileTop = snapshot.pile.slice(-3);
  const seatPos = seatPositions(opponentIds.length);

  el.innerHTML = `
    ${over ? `
      <div class="winner-banner">
        <strong>${snapshot.poopyhead === snapshot.me ? 'You are the POOPYHEAD! 💩' : `${esc(snapshot.players[snapshot.poopyhead].name)} is the POOPYHEAD! 💩`}</strong>
        <button class="btn secondary small" id="menuBtn">Back to Menu</button>
      </div>` : ''}
    ${!over && me.out ? '<div class="winner-banner"><strong>You\'re safe! 🎉 Watching the rest fight it out…</strong></div>' : ''}
    ${statusMessage ? `<div class="dim center error">${esc(statusMessage)}</div>` : ''}

    <div class="row between hud">
      <div class="badge ${isMyTurn ? 'gold' : ''}">${over ? 'Game over' : isMyTurn ? 'Your turn' : snapshot.pendingJoker ? `${esc(snapshot.players[snapshot.pendingJoker.playerId].name)} chooses a Joker…` : `${esc(snapshot.players[snapshot.active].name)}'s turn`}</div>
      <div class="badge">Burned ${snapshot.burnedCount} 🔥</div>
    </div>

    <div class="table-wrap">
      <div class="table-felt"></div>

      <div class="opp-row" id="oppRow">
        ${opponentIds.map((id, i) => {
          const opp = snapshot.players[id];
          const pos = seatPos[i];
          return `
            <div class="opp-panel seat ${opp.out ? 'safe' : ''} ${snapshot.active === id && !over ? 'active' : ''}"
                 style="left:${pos.x.toFixed(1)}%;top:${pos.y.toFixed(1)}%">
              ${!opp.out && opp.hand.length > 0 ? `
                <div class="seat-hand">
                  ${Array.from({ length: Math.min(opp.hand.length, 8) }, () => '<div class="pcard pcard-back back-sm"></div>').join('')}
                  ${opp.hand.length > 8 ? `<span class="seat-hand-more">${opp.hand.length}</span>` : ''}
                </div>` : ''}
              <div class="opp-name">${esc(opp.name)}${opp.out ? ' 🎉' : ''}</div>
              ${opp.out ? '<div class="dim">Safe</div>' : `
                <div class="dim seat-counts">hand ${opp.hand.length} · hidden ${opp.faceDownCount}</div>
                <div class="opp-table">${opp.faceUp.map((c) => pcardMarkup(c, { mini: true })).join('') || '<span class="dim">—</span>'}</div>
              `}
            </div>`;
        }).join('')}
      </div>

      <div class="table-center pile-area">
        <div class="center-row">
          <div class="deck-stack" title="Draw deck">
            ${snapshot.drawCount > 0
              ? `<div class="pcard pcard-back mini"></div><div class="pcard pcard-back mini"></div><span class="deck-count">${snapshot.drawCount}</span>`
              : '<div class="pcard pcard-empty mini">deck</div>'}
          </div>
          <div class="pile-stack">
            ${snapshot.pile.length === 0 ? '<div class="pcard pcard-empty">empty</div>' : pileTop.map((c) => pcardMarkup(c)).join('')}
          </div>
        </div>
        <div class="pile-caption">
          ${snapshot.pile.length === 0 ? 'Play anything.' : `${snapshot.pile.length} card${snapshot.pile.length > 1 ? 's' : ''} — counts as <strong>${eff === '2' ? 'reset' : esc(String(eff))}</strong>${eff === 'J' ? ' (lower only!)' : ''}`}
        </div>
      </div>

      ${!me.out ? `
        <div class="my-table seat my-seat ${isMyTurn ? 'active' : ''}">
          <div class="opp-name">${esc(me.name)} (you)</div>
          <div class="row" style="gap:4px;justify-content:center">
            ${me.faceUp.map((c) => pcardMarkup(c, { mini: true, clickable: isMyTurn && source === 'faceUp' && canPlayRank(eff, c.rank) })).join('')}
            ${Array.from({ length: me.faceDownCount }, (_, i) => `<div class="pcard pcard-back mini ${isMyTurn && source === 'faceDown' ? 'clickable' : ''}" data-blind-index="${i}"></div>`).join('')}
          </div>
          ${source === 'faceUp' ? '<div class="dim seat-hintline">play a table card</div>' : source === 'faceDown' ? '<div class="dim seat-hintline">flip one blind!</div>' : ''}
        </div>` : `
        <div class="my-table seat my-seat safe"><div class="opp-name">${esc(me.name)} 🎉</div><div class="dim">Safe</div></div>`}
    </div>

    ${myPendingJoker ? jokerChooserMarkup('You flipped a Joker! What does it become?') : ''}
    ${jokerPrompt ? jokerChooserMarkup('What does your Joker become?') : ''}

    ${actionError ? `<div class="dim center error">${esc(actionError)}</div>` : ''}

    ${!me.out && source === 'hand' ? `
      <div class="row between hud">
        <div class="dim">Your hand (${me.hand.length})</div>
        <div class="row">
          ${snapshot.canPickUp && isMyTurn ? '<button class="btn danger small" id="pickUpBtn">Pick Up Pile</button>' : ''}
          ${selectedUids.length > 0 ? `<button class="btn small" id="playBtn">Play ${selectedUids.length > 1 ? selectedUids.length + 'x ' : ''}${rankLabel(selectedRank)}</button>` : ''}
        </div>
      </div>
      <div class="row wrap my-hand" id="myHand">
        ${sortedHand(me.hand).map((c) => pcardMarkup(c, {
          clickable: isMyTurn && !jokerPrompt,
          selected: selectedUids.includes(c.uid),
        })).join('')}
      </div>` : ''}
    ${!me.out && source === 'faceUp' && snapshot.canPickUp && isMyTurn ? '<button class="btn danger wide" id="pickUpBtn">No playable table card — Pick Up Pile</button>' : ''}

    <div class="log-box" id="logBox">${snapshot.log.slice().reverse().slice(0, 30).map((l) => `<div>${esc(l)}</div>`).join('')}</div>
  `;

  const menuBtn = el.querySelector('#menuBtn');
  if (menuBtn) menuBtn.onclick = backToMenu;

  const pickUpBtn = el.querySelector('#pickUpBtn');
  if (pickUpBtn) pickUpBtn.onclick = () => submitIntent({ type: 'pickUp' });

  // hand selection: click selects that rank; clicking more of the same rank
  // adds them; a different rank starts a fresh selection
  el.querySelectorAll('#myHand .pcard.clickable').forEach((cardEl) => {
    cardEl.onclick = () => {
      const uid = cardEl.dataset.uid;
      const card = me.hand.find((c) => c.uid === uid);
      if (!card) return;
      if (selectedUids.includes(uid)) {
        selectedUids = selectedUids.filter((u) => u !== uid);
      } else if (selectedRank && card.rank === selectedRank) {
        selectedUids.push(uid);
      } else {
        selectedUids = [uid];
      }
      render();
    };
  });

  const playBtn = el.querySelector('#playBtn');
  if (playBtn) playBtn.onclick = () => {
    if (selectedUids.length === 0) return;
    if (selectedRank === 'JOKER') { jokerPrompt = { uids: [...selectedUids] }; render(); return; }
    submitIntent({ type: 'playCards', uids: [...selectedUids] });
  };

  // face-up plays (one per turn)
  if (isMyTurn && source === 'faceUp') {
    el.querySelectorAll('.my-table .pcard.clickable').forEach((cardEl) => {
      cardEl.onclick = () => {
        const uid = cardEl.dataset.uid;
        const card = me.faceUp.find((c) => c.uid === uid);
        if (!card) return;
        if (card.rank === 'JOKER') { jokerPrompt = { uids: [uid] }; render(); return; }
        submitIntent({ type: 'playCards', uids: [uid] });
      };
    });
  }

  // blind face-down flips: the UI only knows a count, so map the clicked
  // back's position onto the real card host-side via a position-less pick --
  // the host resolves by uid, so ask it for the uids via the snapshot? Face-
  // down uids are hidden; instead the intent carries an index and the host
  // picks that card. See 'playBlindIndex' translation below.
  if (isMyTurn && source === 'faceDown') {
    el.querySelectorAll('[data-blind-index]').forEach((backEl) => {
      backEl.onclick = () => submitIntent({ type: 'playBlindIndex', index: Number(backEl.dataset.blindIndex) });
    });
  }

  // joker rank choosers
  el.querySelectorAll('[data-joker-rank]').forEach((btn) => {
    btn.onclick = () => {
      const rank = btn.dataset.jokerRank;
      if (myPendingJoker) { submitIntent({ type: 'chooseJokerRank', rank }); return; }
      if (jokerPrompt) {
        const uids = jokerPrompt.uids;
        jokerPrompt = null;
        submitIntent({ type: 'playCards', uids, jokerRank: rank });
      }
    };
  });
}

render();
