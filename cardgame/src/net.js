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
const ICE_GATHER_TIMEOUT_MS = 4000;

export function createConnection(role) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  return { pc, dc: null, role, handlers: { open: [], message: [], close: [] } };
}

export function onOpen(conn, cb) { conn.handlers.open.push(cb); }
export function onMessage(conn, cb) { conn.handlers.message.push(cb); }
export function onClose(conn, cb) { conn.handlers.close.push(cb); }

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

function waitForIceGathering(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') finish(); };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
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
