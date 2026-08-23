// Serverless WebRTC: two devices connect directly over a DataChannel with no
// game server. Signaling (the one-time SDP exchange needed before a direct
// connection can open) has no server either -- it's done by hand, as short
// text codes the players copy to each other through any channel they like.
//
// We use non-trickle ICE: wait for candidate gathering to finish (or time
// out) before encoding the SDP, so all the connection info fits in a single
// code and no live signaling channel is needed. A public STUN server resolves
// each device's public address; there is no TURN relay, so very restrictive
// (symmetric) NATs may fail to connect directly -- an accepted tradeoff of
// going fully serverless.

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const ICE_GATHER_TIMEOUT_MS = 4000; // backstop when no candidates arrive at all
const ICE_QUIET_MS = 900; // stop once candidates stop arriving

export function createConnection(role) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const conn = { pc, dc: null, role, handlers: { open: [], message: [], close: [], failure: [] } };
  // A connection that can't be established otherwise just sits there looking
  // like it's still trying, so surface it instead of hanging silently.
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') conn.handlers.failure.forEach((cb) => cb());
  });
  return conn;
}

export function onOpen(conn, cb) { conn.handlers.open.push(cb); }
export function onMessage(conn, cb) { conn.handlers.message.push(cb); }
export function onClose(conn, cb) { conn.handlers.close.push(cb); }
export function onFailure(conn, cb) { conn.handlers.failure.push(cb); }

export function sendMessage(conn, obj) {
  if (!conn.dc || conn.dc.readyState !== 'open') return;
  conn.dc.send(JSON.stringify(obj));
}

function wireDataChannel(conn, dc) {
  conn.dc = dc;
  dc.onopen = () => conn.handlers.open.forEach((cb) => cb());
  dc.onclose = () => conn.handlers.close.forEach((cb) => cb());
  dc.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    conn.handlers.message.forEach((cb) => cb(msg));
  };
}

// Wait for enough ICE candidates to build a connection code, then stop.
//
// Gathering only reports "complete" once every configured server has answered
// or timed out, so when a STUN server is unreachable -- a captive network, a
// firewall, no internet on a hotspot -- it never completes and the old
// fixed timeout burned its full budget on every single invite. Since the host
// generates codes one seat at a time, that dead time multiplied by the number
// of players.
//
// Local (host) candidates arrive within milliseconds and are all a LAN or
// hotspot game needs; a STUN reflexive candidate, when one is coming, follows
// close behind. So: finish as soon as gathering genuinely completes, else once
// candidates stop arriving for a quiet moment, with the old timeout kept only
// as a backstop for the case where nothing arrives at all.
function waitForIceGathering(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    let quiet = null;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(quiet);
      clearTimeout(backstop);
      pc.removeEventListener('icegatheringstatechange', onGatheringState);
      pc.removeEventListener('icecandidate', onCandidate);
      resolve();
    };

    const onGatheringState = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const onCandidate = (e) => {
      if (!e.candidate) { finish(); return; } // null candidate = nothing more is coming
      clearTimeout(quiet);
      quiet = setTimeout(finish, ICE_QUIET_MS);
    };

    const backstop = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', onGatheringState);
    pc.addEventListener('icecandidate', onCandidate);
  });
}

function encodeDescription(desc) {
  return btoa(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
}

function decodeDescription(code) {
  try {
    return JSON.parse(atob(code.trim()));
  } catch {
    throw new Error('That connection code looks invalid or was cut off.');
  }
}

// ---------- Host side ----------
export async function createHostOffer(conn) {
  const dc = conn.pc.createDataChannel('cardgame');
  wireDataChannel(conn, dc);
  const offer = await conn.pc.createOffer();
  await conn.pc.setLocalDescription(offer);
  await waitForIceGathering(conn.pc);
  return encodeDescription(conn.pc.localDescription);
}

export async function acceptGuestAnswer(conn, answerCode) {
  const desc = decodeDescription(answerCode);
  if (desc.type !== 'answer') throw new Error('That looks like a host code, not a join code.');
  await conn.pc.setRemoteDescription(desc);
}

// ---------- Guest side ----------
export async function createGuestAnswer(conn, offerCode) {
  const desc = decodeDescription(offerCode);
  if (desc.type !== 'offer') throw new Error('That looks like a join code, not a host code.');
  conn.pc.ondatachannel = (e) => wireDataChannel(conn, e.channel);
  await conn.pc.setRemoteDescription(desc);
  const answer = await conn.pc.createAnswer();
  await conn.pc.setLocalDescription(answer);
  await waitForIceGathering(conn.pc);
  return encodeDescription(conn.pc.localDescription);
}
