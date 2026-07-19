// Procedurally drawn 2D characters + combat VFX. No external art assets —
// stylized vector shapes in a DBZ-ish palette, animated for impact.

export function drawCharacter(ctx, x, y, appearance, opts = {}) {
  const { height = 0.5, build = 0.5, skinColor, hairColor, hairStyle, giColor } = appearance;
  const scale = opts.scale || 1;
  const flip = opts.flip ? -1 : 1;
  const glow = opts.glow;
  const blonde = opts.blonde;
  const h = (80 + height * 60) * scale;
  const w = (40 + build * 30) * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);

  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 30 * scale;
    ctx.beginPath();
    ctx.arc(0, -h * 0.55, w * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = glow + '33';
    ctx.fill();
    ctx.restore();
  }

  // legs
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(-w * 0.28, -h * 0.05, w * 0.22, h * 0.45);
  ctx.fillRect(w * 0.06, -h * 0.05, w * 0.22, h * 0.45);

  // torso (gi)
  ctx.fillStyle = giColor;
  ctx.beginPath();
  ctx.moveTo(-w * 0.32, -h * 0.55);
  ctx.lineTo(w * 0.32, -h * 0.55);
  ctx.lineTo(w * 0.28, -h * 0.02);
  ctx.lineTo(-w * 0.28, -h * 0.02);
  ctx.closePath();
  ctx.fill();

  // belt
  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(-w * 0.3, -h * 0.1, w * 0.6, h * 0.05);

  // arms
  ctx.fillStyle = giColor;
  ctx.fillRect(-w * 0.48, -h * 0.52, w * 0.16, h * 0.32);
  ctx.fillRect(w * 0.32, -h * 0.52, w * 0.16, h * 0.32);
  ctx.fillStyle = skinColor;
  ctx.fillRect(-w * 0.48, -h * 0.24, w * 0.16, h * 0.1);
  ctx.fillRect(w * 0.32, -h * 0.24, w * 0.16, h * 0.1);

  // neck + head
  ctx.fillStyle = skinColor;
  ctx.fillRect(-w * 0.08, -h * 0.62, w * 0.16, h * 0.08);
  ctx.beginPath();
  ctx.arc(0, -h * 0.72, w * 0.26, 0, Math.PI * 2);
  ctx.fill();

  // hair
  ctx.fillStyle = blonde ? '#ffe94d' : hairColor;
  drawHair(ctx, hairStyle, w, h);

  ctx.restore();
}

function drawHair(ctx, style, w, h) {
  const cx = 0, cy = -h * 0.72, r = w * 0.28;
  ctx.beginPath();
  if (style === 'flame' || style === 'spiky') {
    const spikes = style === 'flame' ? 7 : 5;
    for (let i = 0; i <= spikes; i++) {
      const a = Math.PI + (i / spikes) * Math.PI;
      const px = cx + Math.cos(a) * r * 1.1;
      const py = cy + Math.sin(a) * r * 1.1;
      const tipLen = style === 'flame' ? r * (1.4 + (i % 2) * 0.6) : r * 1.2;
      const tx = cx + Math.cos(a) * tipLen;
      const ty = cy + Math.sin(a) * tipLen - r * 0.6;
      if (i === 0) ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.lineTo(px, py);
    }
  } else if (style === 'wild') {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5 - r);
    }
  } else if (style === 'mohawk') {
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx, cy - r * 2.2);
    ctx.lineTo(cx + r, cy);
  } else {
    // bowl
    ctx.arc(cx, cy, r * 1.05, Math.PI, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawEnemy(ctx, x, y, seed, scale = 1) {
  const skin = ['#c9895a', '#8a6a5a', '#a05aa0', '#5a8a6a'][seed % 4];
  const gi = ['#3a3a4a', '#5a1a1a', '#1a1a5a'][seed % 3];
  drawCharacter(ctx, x, y, {
    skinColor: skin, hairColor: '#1a1a1a', hairStyle: ['spiky', 'wild', 'mohawk'][seed % 3],
    giColor: gi, height: 0.4 + (seed % 3) * 0.1, build: 0.4 + (seed % 2) * 0.15,
  }, { scale });
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
