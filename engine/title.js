'use strict';
/* ---------------- The title screen ----------------
   A sunset over the sea, drawn live: a sky that drifts through the last hour of
   the day, a sun sinking into a sea that glitters, palms leaning in from the
   edges, a few birds going home. Over it, the name, the menu, and the beach
   board — sea temperature, time till sunset, and how many couples are on the
   sand — which counts down while you stand there reading it, because the best
   part of the day does not wait for anybody.

   Everything here runs on the page's ONE loop, for the same reason the arcade
   does: same dt, same clamp, same stop when the tab goes away. Title.tick is a
   no-op the instant the screen is not showing, which is most of the game. */
const Title = {
  cv: null, ctx: null, on: false, motion: true,
  w: 0, h: 0, dpr: 1, t: 0,
  birds: [], glints: [], next: 0,
  menu: [], sel: 0,
  /* The beach board: sea temperature, seconds to sunset, couples on the sand. */
  sea: 28, left: 300, couples: 2, grow: 0,

  init() {
    this.cv = $('#titleFx');
    if (!this.cv) return;
    this.ctx = this.cv.getContext('2d');
    const menu = $('#titleMenu');
    this.menu = menu ? Array.prototype.slice.call(menu.children) : [];
    /* The mouse and the arrow keys share one cursor, so Enter starts what is
       under the hand. */
    this.menu.forEach((b, i) => {
      b.addEventListener('pointerenter', () => this.point(i));
      b.addEventListener('focus', () => this.point(i));
    });
    this.ticker();
    this.resize();
    addEventListener('resize', () => this.resize());
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this.resize());
    this.paintBoard();
  },
  resize() {
    if (!this.cv) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.glints = [];
    for (let i = 0; i < Math.round(w / 9); i++) this.glints.push({ x: Math.random(), y: Math.random(), p: Math.random() * 6.28, s: rnd(.6, 1.6) });
    if (!this.motion) this.draw();
  },
  spawn() {
    const left = chance(.5);
    this.birds.push({ x: left ? -30 : this.w + 30, y: rnd(.12, .38) * this.h, v: rnd(26, 46) * (left ? 1 : -1), f: Math.random() * 6, s: rnd(.7, 1.3) });
  },
  /* A palm, as a silhouette: a curved trunk and a crown of drooping fronds. */
  palm(x, base, lean, size) {
    const c = this.ctx, top = { x: x + lean * size * .55, y: base - size };
    c.strokeStyle = '#1a0d1f'; c.lineCap = 'round';
    c.lineWidth = size * .055;
    c.beginPath(); c.moveTo(x, base);
    c.quadraticCurveTo(x + lean * size * .05, base - size * .5, top.x, top.y); c.stroke();
    const sway = this.motion ? Math.sin(this.t * .9 + x) * .06 : 0;
    c.fillStyle = '#1a0d1f';
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * .52 + sway, len = size * (.42 + (k % 2) * .08);
      const ex = top.x + Math.cos(a) * len, ey = top.y + Math.sin(a) * len * .55 + len * .35;
      c.beginPath(); c.moveTo(top.x, top.y);
      c.quadraticCurveTo(top.x + Math.cos(a) * len * .6, top.y + Math.sin(a) * len * .6 - size * .06, ex, ey);
      c.quadraticCurveTo(top.x + Math.cos(a) * len * .55, top.y + Math.sin(a) * len * .5 + size * .03, top.x, top.y);
      c.fill();
    }
  },
  draw() {
    const c = this.ctx; if (!c) return;
    const w = this.w, h = this.h, hz = h * .62;
    /* The sky, drifting from gold towards violet and back over a minute. */
    const k = (Math.sin(this.t * .1) + 1) / 2;
    const sky = c.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, k > .5 ? '#2a1446' : '#3a1850');
    sky.addColorStop(.45, '#b33a6b');
    sky.addColorStop(.8, '#ff7a59');
    sky.addColorStop(1, '#ffc46b');
    c.fillStyle = sky; c.fillRect(0, 0, w, hz);
    /* The sun, banded like an old postcard, sitting on the horizon. */
    const r = Math.min(w, h) * .2, sx = w * .5, sy = hz - r * .35 + (this.motion ? Math.sin(this.t * .05) * 4 : 0);
    const glow = c.createRadialGradient(sx, sy, r * .6, sx, sy, r * 3);
    glow.addColorStop(0, 'rgba(255,190,110,.55)'); glow.addColorStop(1, 'rgba(255,120,90,0)');
    c.fillStyle = glow; c.fillRect(0, 0, w, hz);
    c.save(); c.beginPath(); c.rect(0, 0, w, hz); c.clip();
    const sun = c.createLinearGradient(0, sy - r, 0, sy + r);
    sun.addColorStop(0, '#fff1a8'); sun.addColorStop(1, '#ff6f61');
    c.fillStyle = sun; c.beginPath(); c.arc(sx, sy, r, 0, 6.2832); c.fill();
    c.fillStyle = '#b33a6b';
    for (let i = 0; i < 5; i++) {
      const y = sy + r * (.1 + i * .2), th = 2 + i * 2.2;
      c.globalAlpha = .55; c.fillRect(sx - r, y, r * 2, th);
    }
    c.globalAlpha = 1; c.restore();
    /* The sea. */
    const sea = c.createLinearGradient(0, hz, 0, h);
    sea.addColorStop(0, '#6b2d63'); sea.addColorStop(.4, '#2c1a4a'); sea.addColorStop(1, '#120b24');
    c.fillStyle = sea; c.fillRect(0, hz, w, h - hz);
    /* The sun's road across the water, and the glitter either side of it. */
    for (let i = 0; i < 26; i++) {
      const y = hz + 4 + i * i * .55, spread = r * (1.1 - i * .015) * (1 + i * .05);
      const a = .55 - i * .018;
      if (a <= 0 || y > h) break;
      const wob = this.motion ? Math.sin(this.t * 2 + i) * 6 : 0;
      c.fillStyle = 'rgba(255,190,120,' + a + ')';
      c.fillRect(sx - spread / 2 + wob, y, spread * (.55 + (i % 3) * .15), 2);
    }
    for (const g of this.glints) {
      const y = hz + 6 + g.y * (h - hz - 6), a = (Math.sin(this.t * 2.4 * g.s + g.p) + 1) / 2;
      c.fillStyle = 'rgba(255,214,170,' + (a * .35 * (1 - g.y)) + ')';
      c.fillRect(g.x * w, y, 3 + g.s * 3, 1);
    }
    /* Birds, going home. */
    c.strokeStyle = '#2a1030'; c.lineWidth = 1.6;
    for (const b of this.birds) {
      const f = Math.sin(b.f) * 4 * b.s, s = 7 * b.s;
      c.beginPath(); c.moveTo(b.x - s, b.y - f); c.quadraticCurveTo(b.x - s / 2, b.y - 3, b.x, b.y);
      c.quadraticCurveTo(b.x + s / 2, b.y - 3, b.x + s, b.y - f); c.stroke();
    }
    /* A strip of beach, and the palms leaning in from both sides. */
    c.fillStyle = '#1a0d1f';
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * .9); c.quadraticCurveTo(w * .2, h * .86, w * .38, h * .95); c.lineTo(w * .38, h); c.fill();
    c.beginPath(); c.moveTo(w, h); c.lineTo(w, h * .88); c.quadraticCurveTo(w * .8, h * .85, w * .64, h * .96); c.lineTo(w * .64, h); c.fill();
    const s = Math.min(h * .55, w * .5);
    this.palm(w * .06, h * .93, 1, s);
    this.palm(w * .16, h * .92, .6, s * .72);
    this.palm(w * .95, h * .92, -1, s * .95);
    this.palm(w * .86, h * .93, -.5, s * .62);
  },
  tick(dt) {
    if (!this.on) return;
    if (!this.motion) return;
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0) { this.next = rnd(2.5, 6); if (this.birds.length < 7) this.spawn(); }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.x += b.v * dt; b.f += dt * 7; b.y += Math.sin(this.t + i) * dt * 3;
      if (b.x < -60 || b.x > this.w + 60) this.birds.splice(i, 1);
    }
    this.draw();
    /* The board. The sun keeps going down whether you press anything or not. */
    this.left = Math.max(0, this.left - dt);
    this.grow -= dt;
    if (this.grow <= 0) { this.grow = rnd(4, 8); this.couples = Math.min(99, this.couples + 1); this.sea = chance(.5) ? 28 : 29; }
    this.paintBoard();
  },
  paintBoard() {
    const w = $('#boardWaiting'), h = $('#boardHeld'), a = $('#boardAgents'), n = $('#boardNote');
    if (!w) return;
    w.textContent = this.sea + '°';
    const m = Math.floor(this.left / 60), s = Math.floor(this.left % 60);
    h.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    h.className = 'cell-n ' + (this.left < 60 ? 'warn' : '');
    a.textContent = this.couples;
    n.textContent = say('board.' + (this.left <= 0 ? 0 : this.left < 60 ? 1 : this.couples > 12 ? 2 : this.couples > 6 ? 3 : 4));
  },
  /* The strip along the bottom, moving. Built here rather than written into
     the page twice, because a seamless loop needs the same list end to end. */
  get LINES() { return says('ticker'); },
  ticker() {
    const run = $('#tickerRun'); if (!run) return;
    const one = this.LINES.map(l => '<span class="tk-item">' + esc(l) + '</span>').join('');
    run.innerHTML = one + one;
  },
  point(i) {
    if (i < 0 || i >= this.menu.length) return;
    this.sel = i;
    this.menu.forEach((b, k) => b.classList.toggle('sel', k === i));
  },
  move(d) {
    if (!this.menu.length) return;
    let i = this.sel;
    for (let n = 0; n < this.menu.length; n++) {
      i = (i + d + this.menu.length) % this.menu.length;
      if (!this.menu[i].disabled) break;
    }
    this.point(i);
    try { this.menu[i].focus({ preventScroll: true }); } catch (e) { this.menu[i].focus(); }
    Sfx.blip();
  },
  activate() {
    const b = this.menu[this.sel];
    if (!b || b.disabled) { Sfx.deny(); return; }
    b.click();
  },
  /* With a game in progress the primary button is Continue; Boot decides
     which by moving `.primary`, so this reads it back. */
  sync() {
    const i = this.menu.findIndex(b => b.classList.contains('primary'));
    this.point(i < 0 ? 0 : i);
  },
  show() {
    this.on = true;
    this.motion = FX.motion !== false;
    document.body.classList.toggle('calm-title', !this.motion);
    this.resize();
    this.sync();
    if (!this.birds.length) for (let i = 0; i < 3; i++) { this.spawn(); this.birds[i].x = rnd(.1, .9) * this.w; }
    if (!this.motion) { this.draw(); this.paintBoard(); }
  },
  hide() { this.on = false; }
};
