'use strict';
/* Isometric canvas renderer, camera and world-space effects. */

const TW = 64, TH = 32;
const R = {
  cv: null, cx: null, dpr: 1, w: 0, h: 0,
  cam: { x: 0, y: 0, z: 1 },
  floats: [], puffs: [], gulls: [], leaving: [],
  hover: null, t: 0,

  init(cv) {
    this.cv = cv; this.cx = cv.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
    const c = this.iso(N / 2 + 1.5, N / 2 + 1.5);
    this.cam.x = c.x; this.cam.y = c.y;
    this.cam.z = Math.min(1.6, Math.max(0.8, innerWidth / 520));
  },
  resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = this.w * this.dpr; this.cv.height = this.h * this.dpr;
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
  },

  iso(x, y) { return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 }; },
  toScreen(wx, wy) { return { x: (wx - this.cam.x) * this.cam.z + this.w / 2, y: (wy - this.cam.y) * this.cam.z + this.h / 2 }; },
  toWorld(sx, sy) { return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y }; },
  tileAt(sx, sy) {
    const w = this.toWorld(sx, sy);
    const a = w.x / (TW / 2), b = (w.y + 6) / (TH / 2);
    return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
  },
  clampCam() {
    const c = this.iso(N / 2, N / 2), r = N * TW / 2;
    this.cam.x = Math.max(c.x - r * 0.7, Math.min(c.x + r * 0.7, this.cam.x));
    this.cam.y = Math.max(c.y - r * 0.45, Math.min(c.y + r * 0.6, this.cam.y));
    this.cam.z = Math.max(0.5, Math.min(2.6, this.cam.z));
  },

  /* boat slots sit at the end of the pier, bottom-left of the island */
  boatPos(i) { const b = this.iso(N + 0.6, N + 0.6); return { x: b.x + (i - 1) * 120, y: b.y + Math.abs(i - 1) * -14 }; },

  float(x, y, msg, o = {}) {
    const p = this.iso(x + 0.5, y + 0.5);
    this.floats.push({ x: p.x, y: p.y - 30 - (o.dy || 0), msg, life: 1.4, bad: o.bad });
  },
  puff(x, y, dust) {
    const p = this.iso(x + 0.5, y + 0.5);
    for (let i = 0; i < 7; i++)
      this.puffs.push({ x: p.x, y: p.y - 10, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, life: 1, r: 6 + Math.random() * 8, dust });
  },
  gull(x, y, done) {
    const p = this.iso(x + 0.5, y + 0.5);
    const fromLeft = Math.random() < 0.5;
    this.gulls.push({ tx: p.x, ty: p.y, x: p.x + (fromLeft ? -700 : 700), y: p.y - 260, dir: fromLeft ? 1 : -1, dropped: false, done, drop: null });
  },

  /* ---------- drawing primitives ---------- */
  diamond(cx, cy, w, h) {
    const c = this.cx;
    c.beginPath();
    c.moveTo(cx, cy - h / 2); c.lineTo(cx + w / 2, cy); c.lineTo(cx, cy + h / 2); c.lineTo(cx - w / 2, cy); c.closePath();
  },
  /* Emoji are rasterised once to a bitmap and blitted: faster on phones, and
     some browsers draw big colour glyphs washed out when filled as text. */
  emojiCache: {},
  glyph(e) {
    let g = this.emojiCache[e];
    if (!g) {
      g = this.emojiCache[e] = document.createElement('canvas');
      g.width = g.height = 128;
      const c = g.getContext('2d');
      c.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(e, 64, 70);
    }
    return g;
  },
  emoji(e, x, y, size, alpha = 1) {
    const c = this.cx, k = size * 1.28;
    c.globalAlpha = alpha;
    c.drawImage(this.glyph(e), x - k / 2, y - k / 2, k, k);
    c.globalAlpha = 1;
  },
  bubble(x, y, e, pulse) {
    const c = this.cx, s = 1 + (pulse ? Math.sin(this.t * 6) * 0.06 : 0);
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(0, 3, 15, 15, 0, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill();
    c.beginPath(); c.moveTo(-5, 12); c.lineTo(0, 20); c.lineTo(5, 12); c.fill();
    c.restore();
    this.emoji(e, x, y + 1, 17);
  },
  bar(x, y, frac) {
    const c = this.cx;
    c.fillStyle = 'rgba(0,0,0,.45)'; this.rr(x - 17, y - 3, 34, 6, 3); c.fill();
    c.fillStyle = '#ffd32a'; this.rr(x - 16, y - 2, 32 * frac, 4, 2); c.fill();
  },
  rr(x, y, w, h, r) {
    const c = this.cx; r = Math.min(r, w / 2, h / 2); if (w <= 0) { c.beginPath(); return; }
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  },
  box(cx, cy, w, h, ht, top, left, right) {
    const c = this.cx;
    c.fillStyle = left; c.beginPath();
    c.moveTo(cx - w / 2, cy); c.lineTo(cx, cy + h / 2); c.lineTo(cx, cy + h / 2 - ht); c.lineTo(cx - w / 2, cy - ht); c.fill();
    c.fillStyle = right; c.beginPath();
    c.moveTo(cx + w / 2, cy); c.lineTo(cx, cy + h / 2); c.lineTo(cx, cy + h / 2 - ht); c.lineTo(cx + w / 2, cy - ht); c.fill();
    c.fillStyle = top; this.diamond(cx, cy - ht, w, h); c.fill();
  },

  /* ---------- frame ---------- */
  draw(dt, mode) {
    this.t += dt;
    const c = this.cx, s = G.s;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // sea
    const g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#2ec4e8'); g.addColorStop(1, '#1289c9');
    c.fillStyle = g; c.fillRect(0, 0, this.w, this.h);

    c.save();
    c.translate(this.w / 2, this.h / 2); c.scale(this.cam.z, this.cam.z); c.translate(-this.cam.x, -this.cam.y);

    // sparkles on the water
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const wx = ((i * 197) % 1400) - 700 + Math.sin(this.t * 0.5 + i) * 12, wy = ((i * 131) % 1000) - 150;
      const a = (Math.sin(this.t * 1.5 + i * 2) + 1) / 2;
      c.globalAlpha = a * 0.6;
      c.beginPath(); c.moveTo(wx - 8, wy); c.quadraticCurveTo(wx, wy - 4, wx + 8, wy); c.stroke();
    }
    c.globalAlpha = 1;

    // shallow-water ring, then sand, then grass
    for (let y = -1; y <= N; y++) for (let x = -1; x <= N; x++) {
      if (isLand(x, y)) continue;
      if (isLand(x + 1, y) || isLand(x - 1, y) || isLand(x, y + 1) || isLand(x, y - 1) || isLand(x + 1, y + 1) || isLand(x - 1, y - 1)) {
        const p = this.iso(x + 0.5, y + 0.5);
        c.fillStyle = 'rgba(160,240,255,.45)'; this.diamond(p.x, p.y + 3, TW * 1.35, TH * 1.35); c.fill();
      }
    }
    // pier: planks from the island's southern tip down to the boats
    {
      let k = N - 1; while (k > 0 && !isLand(k, k)) k--;
      const a = this.iso(k + 0.5, k + 0.5), b = this.boatPos(1);
      for (let yy = a.y; yy < b.y - 10; yy += 9) {
        c.fillStyle = '#6b4226'; c.fillRect(a.x - 20, yy + 2, 40, 8);
        c.fillStyle = ((yy - a.y) / 9) & 1 ? '#c69c6d' : '#b98b5a'; c.fillRect(a.x - 20, yy, 40, 7);
      }
      c.fillStyle = '#6b4226';
      for (let yy = a.y + 20; yy < b.y; yy += 36) { c.fillRect(a.x - 23, yy, 5, 16); c.fillRect(a.x + 18, yy, 5, 16); }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!isLand(x, y)) continue;
      const p = this.iso(x + 0.5, y + 0.5), own = G.owned(x, y);
      const edge = !isLand(x + 1, y) || !isLand(x - 1, y) || !isLand(x, y + 1) || !isLand(x, y - 1);
      this.box(p.x, p.y, TW, TH, 6, edge ? '#f7dc9c' : ((x + y) & 1 ? '#7bd65b' : '#72cc52'), '#d9b26f', '#c89b58');
      if (!edge) { c.fillStyle = (x + y) & 1 ? '#7bd65b' : '#72cc52'; this.diamond(p.x, p.y - 6, TW, TH); c.fill(); }
      if (edge) { c.fillStyle = '#f7dc9c'; this.diamond(p.x, p.y - 6, TW, TH); c.fill(); }
      if (!own) { c.fillStyle = 'rgba(20,40,60,.38)'; this.diamond(p.x, p.y - 6, TW + 1, TH + 1); c.fill(); }
      if (mode && mode.place && own && !G.tile(x, y)) {
        c.fillStyle = 'rgba(255,255,255,' + (0.18 + Math.sin(this.t * 5) * 0.08) + ')';
        this.diamond(p.x, p.y - 6, TW - 6, TH - 3); c.fill();
      }
    }
    if (this.hover && G.owned(this.hover.x, this.hover.y)) {
      const p = this.iso(this.hover.x + 0.5, this.hover.y + 0.5);
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; this.diamond(p.x, p.y - 6, TW - 4, TH - 2); c.stroke();
    }

    // objects, back to front
    for (let d = 0; d < N * 2; d++) for (let x = 0; x <= d; x++) {
      const y = d - x; if (x >= N || y >= N) continue;
      const o = G.tile(x, y); if (!o) continue;
      this.drawObj(x, y, o, G.owned(x, y));
    }

    // land-for-sale signs
    for (const [k, e] of Object.entries(EXPAND)) {
      if (s.land[k]) continue;
      const [cx, cy] = k.split(',').map(Number);
      const p = this.signPos(cx, cy);
      const ok = s.lvl >= e.lvl;
      c.fillStyle = '#7a4a26'; c.fillRect(p.x - 2, p.y - 6, 4, 22);
      c.fillStyle = ok ? '#ffe08a' : '#d7d7d7'; this.rr(p.x - 34, p.y - 30, 68, 30, 7); c.fill();
      c.strokeStyle = '#7a4a26'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#4a2a10'; c.font = 'bold 12px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ok ? '🪙 ' + e.cost : '🔒 Lv ' + e.lvl, p.x, p.y - 15);
    }

    // boats
    s.orders.forEach((o, i) => {
      const b = this.boatPos(i);
      const left = o.arrive - now();
      const off = left > 0 ? Math.min(1, left / 15000) * 520 : 0;
      const bx = b.x + (i - 1) * off * 0.3, by = b.y + off * 0.8 + Math.sin(this.t * 2 + i) * 3;
      c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(bx, by + 16, 30, 8, 0, 0, 7); c.fill();
      this.emoji(o.boat, bx, by, 46);
      if (left <= 0) this.bubble(bx + 22, by - 40, G.canFill(o) ? '✅' : CUSTOMERS[o.who].f, G.canFill(o));
    });
    for (const L of this.leaving) {
      L.t += dt;
      this.emoji(L.boat, L.x + (L.x > this.boatPos(1).x ? 1 : -1) * L.t * 60, L.y + L.t * 120, 46, Math.max(0, 1 - L.t / 2));
    }
    this.leaving = this.leaving.filter(L => L.t < 2);

    // puffs
    for (const p of this.puffs) {
      p.life -= dt * 0.9; p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.97;
      c.fillStyle = p.dust ? 'rgba(210,180,130,' + p.life * 0.7 + ')' : 'rgba(160,220,90,' + p.life * 0.6 + ')';
      c.beginPath(); c.arc(p.x, p.y, p.r * (1.6 - p.life * 0.6), 0, 7); c.fill();
    }
    this.puffs = this.puffs.filter(p => p.life > 0);

    // gulls
    for (const b of this.gulls) {
      b.x += b.dir * 260 * dt;
      if (!b.dropped && (b.dir > 0 ? b.x >= b.tx : b.x <= b.tx)) { b.dropped = true; b.drop = { x: b.x, y: b.y }; }
      if (b.drop) {
        b.drop.y += 420 * dt;
        this.emoji('💧', b.drop.x, b.drop.y, 14);
        if (b.drop.y >= b.ty - 6) { b.drop = null; b.done(); }
      }
      c.save(); c.translate(b.x, b.y + Math.sin(this.t * 8) * 4); c.scale(-b.dir, 1);
      this.emoji('🐦', 0, 0, 30); c.restore();
    }
    this.gulls = this.gulls.filter(b => Math.abs(b.x - b.tx) < 900);

    // floating text
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const f of this.floats) {
      f.life -= dt; f.y -= 30 * dt;
      c.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
      c.font = 'bold 16px system-ui,"Apple Color Emoji","Noto Color Emoji",sans-serif';
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(f.msg, f.x, f.y);
      c.fillStyle = f.bad ? '#ffb4b4' : '#fff'; c.fillText(f.msg, f.x, f.y);
    }
    c.globalAlpha = 1;
    this.floats = this.floats.filter(f => f.life > 0);

    c.restore();
  },

  signPos(cx, cy) {
    // the owned-land tile nearest the chunk middle
    let best = null, bd = 1e9;
    for (let y = cy * CHUNK; y < cy * CHUNK + CHUNK; y++) for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
      if (!isLand(x, y)) continue;
      const d = Math.hypot(x - (cx * CHUNK + 2.5), y - (cy * CHUNK + 2.5));
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best ? this.iso(best.x + 0.5, best.y + 0.5) : this.iso(cx * CHUNK + 3, cy * CHUNK + 3);
  },

  drawObj(x, y, o, own) {
    const c = this.cx, p = this.iso(x + 0.5, y + 0.5), gy = p.y - 6, t = this.t;
    if (o.k === 'field') {
      this.box(p.x, gy + 2, TW - 8, TH - 4, 3, '#8a5a35', '#6d4527', '#7a4d2c');
      c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        c.beginPath(); c.moveTo(p.x - 11 + i * 9, gy + 4.5 + i * 4.5); c.lineTo(p.x + 11 + i * 9, gy - 6.5 + i * 4.5); c.stroke();
      }
      if (o.crop) {
        const left = G.cropLeft(o), frac = 1 - left / (CROPS[o.crop].t * 1000);
        if (left > 0) {
          const e = frac < 0.5 ? '🌱' : ITEMS[o.crop].e, sz = frac < 0.5 ? 14 + frac * 10 : 12 + frac * 10;
          for (const [dx, dy] of [[-10, -2], [10, -2], [0, 4], [0, -8]]) this.emoji(e, p.x + dx, gy + dy - 4, sz);
          if (this.hover && this.hover.x === x && this.hover.y === y) this.bar(p.x, gy + 16, frac);
        } else {
          for (const [dx, dy] of [[-10, -2], [10, -2], [0, 4], [0, -8]])
            this.emoji(ITEMS[o.crop].e, p.x + dx, gy + dy - 6 + Math.sin(t * 4 + dx) * 1.5, 22);
          c.fillStyle = 'rgba(255,255,160,' + (0.25 + Math.sin(t * 5) * 0.15) + ')';
          this.diamond(p.x, gy + 2, TW - 10, TH - 6); c.fill();
        }
      }
    } else if (o.k === 'pen') {
      const A = ANIMALS[o.a];
      c.fillStyle = '#9be27a'; this.diamond(p.x, gy, TW - 6, TH - 3); c.fill();
      // fence
      c.strokeStyle = '#a0703f'; c.lineWidth = 2.5;
      this.diamond(p.x, gy - 5, TW - 8, TH - 4); c.stroke();
      c.beginPath();
      for (const [fx, fy] of [[-28, 0], [0, -14], [28, 0], [0, 14], [-14, -7], [14, -7], [-14, 7], [14, 7]]) { c.moveTo(p.x + fx, gy + fy); c.lineTo(p.x + fx, gy + fy - 8); }
      c.stroke();
      const hop = o.fed && !G.isReady(o) ? Math.abs(Math.sin(t * 5 + x)) * 4 : Math.abs(Math.sin(t * 1.5 + x)) * 2;
      const wander = Math.sin(t * 0.7 + x * 3) * 8;
      c.save(); c.translate(p.x + wander, gy - 10 - hop); if (Math.cos(t * 0.7 + x * 3) < 0) c.scale(-1, 1);
      this.emoji(A.e, 0, 0, 30); c.restore();
      if (G.isReady(o)) this.bubble(p.x + 16, gy - 44, ITEMS[A.gives].e, true);
      else if (!o.fed && own) this.bubble(p.x + 16, gy - 44, ITEMS[A.eats].e, false);
      else if (o.fed) this.bar(p.x, gy + 16, 1 - G.penLeft(o) / (A.t * 1000));
    } else if (o.k === 'fac') {
      const F = FACTORIES[o.id];
      this.box(p.x, gy + 4, TW - 12, TH - 6, 30, '#f5e6c8', '#d6b98c', '#e8d0a6');
      // roof
      c.fillStyle = F.roof;
      c.beginPath(); c.moveTo(p.x - 30, gy - 24); c.lineTo(p.x, gy - 50); c.lineTo(p.x + 30, gy - 24); c.lineTo(p.x, gy - 10); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,.15)'; c.beginPath(); c.moveTo(p.x, gy - 50); c.lineTo(p.x + 30, gy - 24); c.lineTo(p.x, gy - 10); c.closePath(); c.fill();
      // door
      c.fillStyle = '#7a4a26'; c.fillRect(p.x - 12, gy + 2, 8, 12);
      this.emoji(F.e, p.x + 13, gy - 6, 16);
      if (o.q.length && o.q[0].end > now()) {
        // chimney smoke
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.6 + i / 3) % 1;
          c.fillStyle = 'rgba(255,255,255,' + (0.6 - k * 0.6) + ')';
          c.beginPath(); c.arc(p.x + 10 + k * 10, gy - 52 - k * 30, 4 + k * 8, 0, 7); c.fill();
        }
        const r = F.recipes[o.q[0].r];
        this.bar(p.x, gy + 20, 1 - (o.q[0].end - now()) / (r.t * 1000));
      }
      if (G.isReady(o)) {
        const j = o.q.find(q => q.end <= now());
        this.bubble(p.x, gy - 66, ITEMS[F.recipes[j.r].out].e, true);
      }
    } else if (o.k === 'decor') {
      const D = DECOR[o.id];
      c.fillStyle = 'rgba(0,0,0,.15)'; c.beginPath(); c.ellipse(p.x, gy + 2, 16, 7, 0, 0, 7); c.fill();
      const sway = o.id === 'palm' ? Math.sin(t * 1.2 + x) * 0.05 : 0;
      c.save(); c.translate(p.x, gy); c.rotate(sway);
      this.emoji(D.e, 0, -18, o.id === 'palm' ? 44 : 34); c.restore();
    } else if (o.k === 'junk') {
      const J = JUNK[o.id];
      const wob = o.id === 'poop' ? Math.sin(t * 3 + x * 2) * 1.5 : 0;
      this.emoji(J.e, p.x, gy - 10 + wob, o.id === 'rock' ? 30 : 26);
      if (o.id === 'poop' && own) {
        // stink lines
        c.strokeStyle = 'rgba(120,170,40,.7)'; c.lineWidth = 1.5;
        for (let i = -1; i <= 1; i++) {
          const k = (t * 0.8 + i * 0.3) % 1;
          c.globalAlpha = 1 - k;
          c.beginPath(); c.moveTo(p.x + i * 7, gy - 24 - k * 14);
          c.quadraticCurveTo(p.x + i * 7 + 4, gy - 30 - k * 14, p.x + i * 7, gy - 36 - k * 14); c.stroke();
        }
        c.globalAlpha = 1;
      }
    }
  }
};
