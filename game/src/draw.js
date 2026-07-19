// Pixel-art character rendering: shapes are drawn algorithmically onto a
// tiny low-resolution canvas, outlined, then scaled up with nearest-
// neighbor sampling so edges stay crisp and blocky (classic retro-sprite
// technique) rather than smooth vector shapes.

const GRID_W = 32;
const GRID_H = 48;
const BASE_PX = 150 / GRID_H; // keeps final on-screen size consistent with the previous, smaller grid

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + amt, g + amt, b + amt);
}

function makeOutlined(w, h, drawFn) {
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  drawFn(src.getContext('2d'));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const [dx, dy] of offsets) octx.drawImage(src, dx, dy);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = '#0a0a12';
  octx.fillRect(0, 0, w, h);
  octx.globalCompositeOperation = 'source-over';
  octx.drawImage(src, 0, 0);
  return out;
}

function drawHair(ctx, style, color, cx, topY) {
  const hi = shade(color, 45);
  ctx.fillStyle = color;
  if (style === 'spiky') {
    ctx.fillRect(cx - 7, topY + 3, 14, 4);
    const spikes = [[-7, 3, -10, -3], [-3, 2, -5, -6], [1, 1, 1, -7], [4, 2, 7, -5], [7, 3, 11, -2]];
    for (const [x1, y1, x2, y2] of spikes) {
      ctx.beginPath();
      ctx.moveTo(cx + x1, topY + y1 + 3);
      ctx.lineTo(cx + x2, topY + y2 + 3);
      ctx.lineTo(cx + x1 + 3, topY + y1 + 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = hi;
    ctx.fillRect(cx - 6, topY + 3, 3, 2);
    ctx.beginPath(); ctx.moveTo(cx + 1, topY + 1); ctx.lineTo(cx + 1, topY - 6); ctx.lineTo(cx + 2, topY + 1); ctx.fill();
  } else if (style === 'flame') {
    ctx.fillRect(cx - 7, topY + 4, 14, 3);
    const tips = [[-7, -1], [-4, -9], [-1, -4], [2, -10], [5, -5], [7, -1]];
    for (const [tx, th] of tips) {
      ctx.beginPath();
      ctx.moveTo(cx + tx - 2, topY + 4);
      ctx.lineTo(cx + tx, topY + th);
      ctx.lineTo(cx + tx + 2, topY + 4);
      ctx.fill();
    }
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.moveTo(cx + 1, topY + 3); ctx.lineTo(cx + 2, topY - 9); ctx.lineTo(cx + 3, topY + 3); ctx.fill();
  } else if (style === 'wild') {
    ctx.fillRect(cx - 7, topY + 3, 14, 4);
    const tufts = [[-9, -6], [-5, -10], [0, -8], [5, -10], [9, -5]];
    for (const [tx, th] of tufts) {
      ctx.beginPath();
      ctx.moveTo(cx + tx - 3, topY + 4);
      ctx.lineTo(cx + tx + 3, topY + th);
      ctx.lineTo(cx + tx + 4, topY + 4);
      ctx.fill();
    }
    ctx.fillStyle = hi;
    ctx.fillRect(cx - 6, topY + 3, 3, 2);
  } else if (style === 'mohawk') {
    ctx.fillRect(cx - 7, topY + 4, 14, 3);
    ctx.beginPath();
    ctx.moveTo(cx - 3, topY + 4); ctx.lineTo(cx, topY - 9); ctx.lineTo(cx + 3, topY + 4);
    ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.moveTo(cx - 1, topY + 3); ctx.lineTo(cx, topY - 8); ctx.lineTo(cx + 1, topY + 3); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(cx, topY + 4, 8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillRect(cx - 8, topY + 3, 16, 4);
    ctx.fillStyle = hi;
    ctx.fillRect(cx - 7, topY + 3, 4, 2);
  }
}

function drawCharLowRes(ctx, opt) {
  const {
    skin, hair, hairStyle, gi, undershirt = '#1a2a4a', wrist = '#20243a',
    pants = '#262a3e', bootColor = '#14141c', bootCuff = '#33364a', buckle = '#d8c04a',
    bob = 0,
  } = opt;
  const giHi = shade(gi, 45);
  const giLo = shade(gi, -45);
  const skinLo = shade(skin, -30);
  const cx = 16, headY = 13 + bob;

  // legs
  ctx.fillStyle = pants;
  ctx.fillRect(cx - 6, 36 + bob, 3, 6);
  ctx.fillRect(cx + 3, 36 + bob, 3, 6);
  ctx.fillStyle = shade(pants, -25);
  ctx.fillRect(cx - 6, 36 + bob, 1, 6);
  ctx.fillRect(cx + 5, 36 + bob, 1, 6);

  // boot cuffs + boots
  ctx.fillStyle = bootCuff;
  ctx.fillRect(cx - 7, 41 + bob, 5, 2);
  ctx.fillRect(cx + 2, 41 + bob, 5, 2);
  ctx.fillStyle = bootColor;
  ctx.fillRect(cx - 7, 43 + bob, 5, 3);
  ctx.fillRect(cx + 2, 43 + bob, 5, 3);
  ctx.fillStyle = shade(bootColor, 25);
  ctx.fillRect(cx - 7, 45 + bob, 5, 1);
  ctx.fillRect(cx + 2, 45 + bob, 5, 1);

  // upper arms (sleeves)
  ctx.fillStyle = gi;
  ctx.fillRect(cx - 13, 22 + bob, 5, 9);
  ctx.fillRect(cx + 8, 22 + bob, 5, 9);
  ctx.fillStyle = giLo;
  ctx.fillRect(cx - 13, 22 + bob, 2, 9);
  ctx.fillRect(cx + 11, 22 + bob, 2, 9);

  // forearms (skin) + wristbands
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 13, 31 + bob, 5, 6);
  ctx.fillRect(cx + 8, 31 + bob, 5, 6);
  ctx.fillStyle = wrist;
  ctx.fillRect(cx - 13, 33 + bob, 5, 2);
  ctx.fillRect(cx + 8, 33 + bob, 5, 2);
  // hands
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 12, 37 + bob, 4, 4);
  ctx.fillRect(cx + 8, 37 + bob, 4, 4);
  ctx.fillStyle = skinLo;
  ctx.fillRect(cx - 12, 40 + bob, 4, 1);
  ctx.fillRect(cx + 8, 40 + bob, 4, 1);

  // torso (shoulders + waist taper) with highlight/shadow shading
  ctx.fillStyle = gi;
  ctx.fillRect(cx - 9, 22 + bob, 18, 6);
  ctx.fillRect(cx - 7, 28 + bob, 14, 6);
  ctx.fillStyle = giHi;
  ctx.fillRect(cx - 9, 22 + bob, 3, 6);
  ctx.fillRect(cx - 7, 28 + bob, 2, 6);
  ctx.fillStyle = giLo;
  ctx.fillRect(cx + 5, 22 + bob, 4, 6);
  ctx.fillRect(cx + 4, 28 + bob, 3, 6);

  // undershirt V
  ctx.fillStyle = undershirt;
  ctx.beginPath();
  ctx.moveTo(cx - 3, 22 + bob); ctx.lineTo(cx + 3, 22 + bob); ctx.lineTo(cx, 29 + bob);
  ctx.fill();

  // belt + buckle
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(cx - 9, 34 + bob, 18, 3);
  ctx.fillStyle = buckle;
  ctx.fillRect(cx - 2, 34 + bob, 4, 3);

  // neck
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 3, 19 + bob, 6, 3);

  // head with subtle cheek shading
  ctx.beginPath();
  ctx.arc(cx, headY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skinLo;
  ctx.beginPath();
  ctx.arc(cx + 3, headY + 2, 5, -0.4, 1.6);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx - 1, headY, 6.3, 0, Math.PI * 2);
  ctx.fill();

  // eyebrows
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(cx - 5, headY - 3, 3, 1);
  ctx.fillRect(cx + 2, headY - 3, 3, 1);
  // eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - 5, headY - 1, 3, 2);
  ctx.fillRect(cx + 2, headY - 1, 3, 2);
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(cx - 4, headY - 1, 1, 2);
  ctx.fillRect(cx + 3, headY - 1, 1, 2);
  // mouth
  ctx.fillStyle = skinLo;
  ctx.fillRect(cx - 1, headY + 4, 2, 1);

  drawHair(ctx, hairStyle, hair, cx, headY - 7);
}

function idleBob() {
  return Math.floor(Date.now() / 500) % 2;
}

export function drawCharacter(ctx, x, y, appearance, opts = {}) {
  const heightMult = 0.8 + (appearance.height ?? 0.5) * 0.4;
  const buildMult = 0.85 + (appearance.build ?? 0.5) * 0.3;
  const scale = (opts.scale || 1) * BASE_PX * heightMult;
  const xScale = buildMult;
  const flip = opts.flip ? -1 : 1;

  if (opts.glow) {
    ctx.save();
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(x, y - GRID_H * scale * 0.4, GRID_W * scale * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = opts.glow + '33';
    ctx.fill();
    ctx.restore();
  }

  const sprite = makeOutlined(GRID_W, GRID_H, (c) => drawCharLowRes(c, {
    skin: appearance.skinColor,
    hair: opts.blonde ? '#ffe94d' : appearance.hairColor,
    hairStyle: appearance.hairStyle,
    gi: appearance.giColor,
    bob: idleBob(),
  }));

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.scale(flip * xScale, 1);
  ctx.drawImage(sprite, 0, 0, GRID_W, GRID_H, -GRID_W * scale / 2, -GRID_H * scale, GRID_W * scale, GRID_H * scale);
  ctx.restore();
}

const ENEMY_PALETTES = [
  { skin: '#c9895a', hair: '#3a1a1a', gi: '#5a1a1a', hairStyle: 'spiky' },
  { skin: '#8a6a5a', hair: '#1a1a1a', gi: '#3a3a4a', hairStyle: 'wild' },
  { skin: '#a05aa0', hair: '#2a0a2a', gi: '#4a1a6a', hairStyle: 'mohawk' },
  { skin: '#5a8a6a', hair: '#0a2a1a', gi: '#1a4a2a', hairStyle: 'bowl' },
];

export function drawEnemy(ctx, x, y, seed, scale = 1) {
  const pal = ENEMY_PALETTES[seed % ENEMY_PALETTES.length];
  drawCharacter(ctx, x, y, {
    skinColor: pal.skin, hairColor: pal.hair, hairStyle: pal.hairStyle, giColor: pal.gi,
  }, { scale, flip: true });
}

// --- Hub pixel-art icons ---

const HOUSE_PALETTES = [
  { wall: '#8a6a4a', roof: '#5a3a2a' },
  { wall: '#8a6a4a', roof: '#5a3a2a' },
  { wall: '#b08860', roof: '#7a4a2a' },
  { wall: '#b08860', roof: '#7a4a2a' },
  { wall: '#d8b888', roof: '#8a3a2a' },
  { wall: '#c8c8d0', roof: '#3a4a8a' },
];

function drawHouseIcon(ctx, tier) {
  const p = HOUSE_PALETTES[Math.min(tier, HOUSE_PALETTES.length - 1)];
  const roofLo = shade(p.roof, -30);
  const wallLo = shade(p.wall, -25);
  const cx = 10;
  ctx.fillStyle = p.roof;
  ctx.beginPath(); ctx.moveTo(cx - 9, 12); ctx.lineTo(cx, 2); ctx.lineTo(cx + 9, 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = roofLo;
  ctx.beginPath(); ctx.moveTo(cx, 2); ctx.lineTo(cx + 9, 12); ctx.lineTo(cx + 6, 12); ctx.lineTo(cx, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = p.wall;
  ctx.fillRect(cx - 7, 12, 14, 10);
  ctx.fillStyle = wallLo;
  ctx.fillRect(cx + 3, 12, 4, 10);
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(cx - 2, 17, 4, 5);
  ctx.fillStyle = tier >= 1 ? '#8ad0e8' : '#4a3a2a';
  ctx.fillRect(cx - 6, 14, 3, 3);
  if (tier >= 3) ctx.fillRect(cx + 3, 14, 3, 3);
  if (tier >= 2) {
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(cx + 4, 2, 3, 10);
    ctx.fillStyle = shade('#5a5a5a', 25);
    ctx.fillRect(cx + 4, 2, 3, 2);
  }
  if (tier >= 5) { ctx.fillStyle = roofLo; ctx.fillRect(cx - 1, 0, 2, 3); }
}

function drawDummyIcon(ctx) {
  const cx = 7;
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(cx - 2, 14, 4, 11);
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(cx - 6, 8, 12, 2);
  ctx.fillStyle = '#c9a76a';
  ctx.beginPath(); ctx.ellipse(cx, 8, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade('#c9a76a', -25);
  ctx.beginPath(); ctx.ellipse(cx + 2, 9, 3, 6, 0, -0.5, 2); ctx.fill();
  ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 4, 4); ctx.lineTo(cx - 4, 13); ctx.stroke();
  ctx.fillStyle = '#e04030';
  ctx.beginPath(); ctx.arc(cx, 7, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0f0f0';
  ctx.beginPath(); ctx.arc(cx, 7, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e04030';
  ctx.beginPath(); ctx.arc(cx, 7, 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8c060';
  ctx.fillRect(cx - 3, 0, 1, 3); ctx.fillRect(cx, -1, 1, 4); ctx.fillRect(cx + 2, 0, 1, 3);
}

function drawShopIcon(ctx) {
  const cx = 11;
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(cx - 9, 8, 18, 10);
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(cx - 9, 8, 18, 2);
  const stripeColors = ['#d8402a', '#f0e0c0'];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = stripeColors[i % 2];
    ctx.beginPath();
    ctx.moveTo(cx - 9 + i * 3, 2); ctx.lineTo(cx - 9 + (i + 1) * 3, 2);
    ctx.lineTo(cx - 9 + (i + 1) * 3 - 1, 7); ctx.lineTo(cx - 9 + i * 3 + 1, 7);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#4a2a15';
  ctx.fillRect(cx - 9, 0, 18, 3);
  ctx.fillStyle = '#e8d090';
  ctx.fillRect(cx - 4, 11, 8, 4);
  ctx.fillStyle = '#8a6020';
  ctx.fillRect(cx - 4, 11, 8, 1);
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(cx - 7, 9, 5, 5);
  ctx.fillStyle = '#8ad0e8';
  ctx.fillRect(cx - 6, 10, 3, 3);
}

function drawCropsIcon(ctx, ready) {
  ctx.fillStyle = '#5a3f2a';
  ctx.fillRect(0, 10, 24, 6);
  ctx.fillStyle = '#4a3220';
  for (let x = 1; x < 24; x += 4) ctx.fillRect(x, 10, 2, 6);
  const positions = [3, 8, 13, 18];
  for (const px of positions) {
    if (ready) {
      ctx.fillStyle = '#d8b830';
      ctx.fillRect(px, 3, 2, 8);
      ctx.fillStyle = '#f0d860';
      ctx.beginPath(); ctx.arc(px + 1, 3, 3, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#3a7a3a';
      ctx.beginPath();
      ctx.moveTo(px + 1, 10); ctx.lineTo(px - 1, 5); ctx.lineTo(px + 1, 7); ctx.lineTo(px + 3, 4); ctx.lineTo(px + 1, 8);
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawPortalIcon(ctx, t) {
  const cx = 11;
  ctx.fillStyle = '#6a6a78';
  ctx.fillRect(cx - 9, 6, 4, 20);
  ctx.fillRect(cx + 5, 6, 4, 20);
  ctx.beginPath();
  ctx.moveTo(cx - 9, 6); ctx.quadraticCurveTo(cx, -6, cx + 9, 6);
  ctx.lineTo(cx + 9, 10); ctx.quadraticCurveTo(cx, -1, cx - 9, 10);
  ctx.closePath(); ctx.fillStyle = '#6a6a78'; ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, 17, 6, 10, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#0a1a3a';
  ctx.fillRect(cx - 8, 6, 16, 24);
  ctx.translate(cx, 17);
  const spiralColors = ['#3a6adf', '#6a3adf', '#8a5aff'];
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = spiralColors[i];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 3 + i * 2.2, t + i * 0.9, t + i * 0.9 + 4.2);
    ctx.stroke();
  }
  ctx.restore();
}

const HUB_ICON_SPECS = {
  house: { w: 20, h: 24, draw: (c, opts) => drawHouseIcon(c, opts.tier || 0) },
  dummy: { w: 14, h: 25, draw: (c) => drawDummyIcon(c) },
  shop: { w: 22, h: 20, draw: (c) => drawShopIcon(c) },
  crops: { w: 24, h: 16, draw: (c, opts) => drawCropsIcon(c, !!opts.ready) },
  portal: { w: 22, h: 28, draw: (c, opts) => drawPortalIcon(c, opts.t || 0) },
};

export function drawHubIcon(ctx, type, x, y, scale, opts = {}) {
  const spec = HUB_ICON_SPECS[type];
  if (!spec) return;
  const sprite = makeOutlined(spec.w, spec.h, (c) => spec.draw(c, opts));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.drawImage(sprite, 0, 0, spec.w, spec.h, -spec.w * scale / 2, -spec.h * scale, spec.w * scale, spec.h * scale);
  ctx.restore();
}

let grassTileCache = null;
function getGrassTile() {
  if (grassTileCache) return grassTileCache;
  const t = document.createElement('canvas'); t.width = 16; t.height = 16;
  const c = t.getContext('2d');
  c.fillStyle = '#2e5a3a';
  c.fillRect(0, 0, 16, 16);
  const blades = [[2, 3], [3, 9], [8, 2], [10, 11], [13, 5], [5, 13], [14, 14], [1, 12]];
  c.fillStyle = '#356848';
  for (const [x, y] of blades) c.fillRect(x, y, 2, 2);
  c.fillStyle = '#274a33';
  for (const [x, y] of blades) c.fillRect(x + 3, y + 3, 1, 1);
  grassTileCache = t;
  return t;
}

export function drawHubGround(ctx, size) {
  ctx.fillStyle = ctx.createPattern(getGrassTile(), 'repeat');
  ctx.fillRect(0, 0, size, size);
}

export function drawHubPath(ctx, fromX, fromY, toX, toY, width = 26) {
  ctx.save();
  ctx.strokeStyle = '#6a5238';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.strokeStyle = '#7a624a';
  ctx.lineWidth = width - 8;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();
}

export function drawHubFence(ctx, inset, size) {
  const postW = 6, gap = 12, postH = 14;
  const drawPost = (x, y, vertical) => {
    ctx.fillStyle = '#8a6a45';
    if (vertical) ctx.fillRect(x, y, postW, postH); else ctx.fillRect(x, y, postH, postW);
    ctx.fillStyle = '#5a3f28';
    if (vertical) ctx.fillRect(x, y + postH - 3, postW, 3); else ctx.fillRect(x + postH - 3, y, 3, postW);
  };
  ctx.strokeStyle = '#6a4a30';
  ctx.lineWidth = 3;
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  for (let x = inset; x < size - inset - postW; x += postW + gap) {
    drawPost(x, inset - postW / 2, false);
    drawPost(x, size - inset - postW / 2, false);
  }
  for (let y = inset; y < size - inset - postW; y += postW + gap) {
    drawPost(inset - postW / 2, y, true);
    drawPost(size - inset - postW / 2, y, true);
  }
}

// --- Combat FX ---

export class FxLayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.texts = [];
    this.flash = 0;
    this.shake = 0;
    this.running = false;
    this.onTick = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  burst(x, y, color, count = 24) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 1, color, size: 2 + Math.random() * 4,
      });
    }
    this.flash = Math.min(1, this.flash + 0.5);
  }

  damageText(x, y, text, color = '#fff') {
    this.texts.push({ x, y, text, color, life: 1 });
  }

  shakeScreen(amount = 8) {
    this.shake = Math.max(this.shake, amount);
  }

  tick() {
    const { ctx, canvas } = this;
    if (this.onTick) this.onTick();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.025;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.texts = this.texts.filter((t) => t.life > 0);
    for (const t of this.texts) {
      t.y -= 1.2; t.life -= 0.018;
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.flash -= 0.06;
    }

    if (this.shake > 0) {
      const dx = (Math.random() - 0.5) * this.shake;
      const dy = (Math.random() - 0.5) * this.shake;
      canvas.style.transform = `translate(${dx}px, ${dy}px)`;
      this.shake *= 0.85;
      if (this.shake < 0.3) { this.shake = 0; canvas.style.transform = ''; }
    }
  }
}
