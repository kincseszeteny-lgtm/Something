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
