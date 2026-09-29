'use strict';
/* ---------------- Portraits: faces that are alive ----------------
   The dialogue box used to show a person's head as a CSS window onto their
   sprite sheet — the right face, standing perfectly still, with an
   expression patch laid over it now and then. A photograph of somebody you
   are talking to.

   This draws them instead: the same sprite, the same Faces patches, into a
   small canvas of its own, a dozen times a second. So they breathe (the kit's
   idle frames), they blink (engine/faces.js), they bob while they are
   talking to you, they glance about when they are not, their face follows
   their mood (Mind.face) and whatever you have just said to them (Rel.add),
   and hearts come off them when something lands.

   Three places wear one: the dialogue box, your own face in the corner of
   the HUD — which follows how YOU are doing, tired, hungry or pleased with
   yourself — and every card on the Islanders tab.

   Everything falls back to the emoji it replaced: no sprite, no canvas, no
   change. And it all stands still with Reduced motion, apart from the one
   frame it needs to show who you are talking to. */
const Portrait = {
  live: [], last: 0, FPS: 12,
  /* Two crops of the standing, front-facing frame, in sprite pixels: the head
     alone for the small places, head and shoulders for the dialogue box, and
     the face filling the frame for your own, in the HUD corner — where a head
     with room round it was a small brown smudge low in a pink circle. */
  CROPS: { head: { w: 28, h: 28, top: 2 }, bust: { w: 34, h: 40, top: 0 }, face: { w: 24, h: 24, top: 4 } },

  can(id) { return typeof Sprites !== 'undefined' && !!id && Sprites.has(id); },
  still() { return typeof Juice !== 'undefined' ? Juice.still() : false; },

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
      glance: (typeof R !== 'undefined' ? R.t : 0) + 2 + Math.random() * 4 };
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
    return this.mount(el, 'player', { crop: 'face', scale: 2 });
  },

  /* ---- the loop ---- */
  tick(dt) {
    /* The world's clock stops when a panel covers it (Game.frozen), and the
       blink and the breath both run on it. Keep it moving for the faces. */
    if (typeof Game !== 'undefined' && Game.frozen && typeof R !== 'undefined') R.t += dt;
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
    const t = typeof R !== 'undefined' ? R.t : 0;
    const still = this.still();
    /* Talking: the person in the dialogue box, while their words are typing
       out, nods along a pixel at a time. */
    const talking = p.speaker && typeof Dialogue !== 'undefined' && Dialogue.on && Dialogue.typing;
    /* Their mouth moves while the words come out (Faces.MOUTHS), and the
       head gives the odd nod on the stressed beats rather than bouncing on
       every one. */
    if (talking && !still && typeof Faces !== 'undefined') Faces.talk[p.id] = t + .15;
    const bob = still ? 0 : talking ? (Math.floor(t * 4.5) % 3 === 0 ? 1 : 0) : 0;
    /* Glancing: now and then somebody who is not mid-sentence looks off to
       one side for a moment, which is most of what makes a face read as
       somebody thinking rather than a picture of somebody. */
    if (!still && !talking && t > p.glance && typeof Faces !== 'undefined' && p.id !== 'player') {
      p.glance = t + 3 + Math.random() * 5;
      if (!Faces.timed[p.id]) Faces.flash(p.id, Math.random() < .5 ? 'look-l' : 'look-r', .5 + Math.random() * .4);
    }
    const frame = still ? 0 : Sprites.breath(p.id);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, p.cv.width, p.cv.height);
    c.setTransform(p.k, 0, 0, p.k, 0, 0);
    /* Sprites.draw() puts the frame's top-left at (x - fw/2, y + FOOT - fh);
       this solves for the crop's top-left landing at the canvas origin. */
    const x = cr.w / 2, y = m.fh - Sprites.FOOT - cr.top + bob;
    Sprites.draw(c, p.id, 2, frame, x, y);
  },

  /* ---- your face ----
     How you are doing, on your own face: sleepy when your energy is going,
     glum when you are hungry or your nerve is, and — for a moment — pleased
     with yourself when a tip lands (see Juice's bump). */
  mood() {
    if (typeof Faces === 'undefined' || typeof P === 'undefined' || !P.eneMax) return;
    const food = P.food === undefined ? 100 : P.food;
    const expr = P.energy < P.eneMax * .18 ? 'closing'
      : (food < 20 || P.patience < P.patMax * .3) ? 'sad' : null;
    if (Faces.held.player !== expr) Faces.hold('player', expr);
  },

  /* ---- hearts ----
     Little emoji that rise off a portrait and fade: 💕 when something you
     said landed, 💢 when it did not. Wherever that person's face is on
     screen right now. */
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
