'use strict';
/* ---------------- Portraits: faces that are alive ----------------
   A person's sprite and Faces patches drawn into a small canvas a dozen
   times a second: they breathe, blink, nod while talking, glance about, and
   wear their mood (Mind.face) and your last words (Rel.add), with hearts when
   something lands. Used in the dialogue box, your HUD corner (your own mood)
   and the Islanders cards. No sprite means the emoji; Reduced motion holds
   one still frame. */
const Portrait = {
  live: [], last: 0, FPS: 12,
  /* Crops of the front-facing stand frame, in sprite pixels: head, head and
     shoulders, and your HUD head set a little lower. */
  CROPS: { head: { w: 28, h: 28, top: 2 }, bust: { w: 34, h: 40, top: 0 }, hud: { w: 28, h: 28, top: 5 } },

  can(id) { return !!id && Sprites.has(id); },
  still() { return Juice.still(); },

  /* Put a live portrait of `id` into `el`, replacing whatever was in it. */
  mount(el, id, opts) {
    opts = opts || {};
    if (!el || !this.can(id)) return false;
    const crop = this.CROPS[opts.crop || 'head'], s = opts.scale || 2;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.width = Math.round(crop.w * s * dpr); cv.height = Math.round(crop.h * s * dpr);
    cv.style.width = crop.w * s + 'px'; cv.style.height = crop.h * s + 'px';
    cv.className = 'portrait';
    cv.setAttribute('aria-hidden', 'true');
    el.textContent = '';
    el.appendChild(cv);
    el.classList.add('live');
    el.dataset.who = id;
    const p = { el, cv, c: cv.getContext('2d'), id, crop, k: s * dpr, speaker: !!opts.speaker,
      glance: R.t + 2 + Math.random() * 4 };
    this.live = this.live.filter(q => q.el !== el);
    this.live.push(p);
    this.draw(p, 0);
    return true;
  },
  /* Every `[data-portrait]` placeholder in a freshly written panel. */
  scan(root) {
    if (!root) return;
    root.querySelectorAll('[data-portrait]').forEach(el => this.mount(el, el.dataset.portrait, { crop: 'head', scale: 2 }));
  },
  /* Your own face, in the HUD. True once it is up, so ui.js stops writing
     the emoji over it. */
  hud() {
    const el = document.getElementById('hFace');
    if (!el) return false;
    if (this.live.some(p => p.el === el && p.id === 'player')) return true;
    return this.mount(el, 'player', { crop: 'hud', scale: 1.5 });
  },

  /* ---- the loop ---- */
  tick(dt) {
    /* A panel stops the world's clock (Game.frozen); faces keep theirs. */
    if (Game.frozen) R.t += dt;
    this.last += dt;
    if (this.last < 1 / this.FPS) return;
    const step = this.last; this.last = 0;
    this.mood();
    this.live = this.live.filter(p => p.el.isConnected && p.el.contains(p.cv));
    for (const p of this.live) if (p.el.offsetParent !== null) this.draw(p, step);
  },
  draw(p, dt) {
    const r = Sprites.at(p.id);
    if (!r) return;
    const m = r.sheet, c = p.c, cr = p.crop;
    const t = R.t;
    const still = this.still();
    /* The speaker nods a pixel at a time while their words type out. */
    const talking = p.speaker && Dialogue.on && Dialogue.typing;
    /* Their mouth moves (Faces.MOUTHS), with the odd nod on a stressed beat. */
    if (talking && !still) Faces.talk[p.id] = t + .15;
    const bob = still ? 0 : talking ? (Math.floor(t * 4.5) % 3 === 0 ? 1 : 0) : 0;
    /* Now and then someone not speaking glances aside: the difference between a
       face thinking and a picture of one. */
    if (!still && !talking && t > p.glance && p.id !== 'player') {
      p.glance = t + 3 + Math.random() * 5;
      if (!Faces.timed[p.id]) Faces.flash(p.id, Math.random() < .5 ? 'look-l' : 'look-r', .5 + Math.random() * .4);
    }
    const frame = still ? 0 : Sprites.breath(p.id);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, p.cv.width, p.cv.height);
    c.setTransform(p.k, 0, 0, p.k, 0, 0);
    /* Solve for the crop's top-left landing at the origin, as Sprites.draw() places frames. */
    const x = cr.w / 2, y = m.fh - Sprites.FOOT - cr.top + bob;
    Sprites.draw(c, p.id, 2, frame, x, y);
  },

  /* ---- your face ----
     Sleepy when your energy goes, glum when hungry or out of nerve, and briefly
     pleased when a tip lands (Juice). */
  mood() {
    if (!P.eneMax) return;
    const food = P.food;
    const expr = P.energy < P.eneMax * .18 ? 'closing'
      : (food < 20 || P.patience < P.patMax * .3) ? 'sad' : null;
    if (Faces.held.player !== expr) Faces.hold('player', expr);
  },

  /* ---- hearts: 💕 or 💢 rising off that person's portrait, wherever it is ---- */
  burst(id, e, n) {
    if (this.still()) return;
    for (const p of this.live) {
      if (p.id !== id || p.el.offsetParent === null) continue;
      const b = p.el.getBoundingClientRect();
      for (let i = 0; i < (n || 4); i++) {
        const s = document.createElement('span');
        s.className = 'heart-pop';
        s.textContent = e;
        s.style.left = (b.left + b.width * (.25 + Math.random() * .5)) + 'px';
        s.style.top = (b.top + b.height * .35) + 'px';
        s.style.setProperty('--dx', (Math.random() * 40 - 20).toFixed(0) + 'px');
        s.style.animationDelay = (i * .09).toFixed(2) + 's';
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 1600);
      }
    }
  }
};
(function loop() {
  let was = performance.now();
  const f = now => {
    const dt = Math.min(.1, (now - was) / 1000); was = now;
    try { Portrait.tick(dt); } catch (e) { /* a portrait is never worth a crash */ }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
})();
