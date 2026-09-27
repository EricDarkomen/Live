'use strict';
/* ---------------- Title: the wallboard ----------------
   The title screen used to be a heading, a tagline and three buttons on a
   gradient. What follows is the same three buttons on the floor they belong to.

   Every call centre has a wallboard: a screen bolted above the desks showing
   how many people are holding, how long the oldest one has been holding, and
   how many of you are free to do anything about it. It is the first thing you
   see when you walk in and the last thing you look at before you leave. So the
   title screen IS one — and because it is live, it gets worse while you stand
   there reading it. Sitting on the menu is the joke: the queue you have not
   started answering yet is growing, and the number of people available to
   answer it is going to be zero long before you press anything.

   Behind it, a switchboard. A drifting grid of extensions with calls routing
   across it — each pulse runs a few hops and lands, and the busier the board
   says it is, the more of them are in the air. It is the queue, drawn.

   Everything here runs on the page's ONE loop, for the same reason the arcade
   does: same dt, same clamp, same stop when the tab goes away. Title.tick is a
   no-op the instant the screen is not showing, which is most of the game. */
const Title = {
  cv: null, ctx: null, on: false, motion: true,
  w: 0, h: 0, dpr: 1, t: 0,
  gap: 46, cols: 0, rows: 0, off: 0,
  pulses: [], next: 0,
  menu: [], sel: 0,
  /* The board. `waiting` is calls holding, `held` is the oldest of them in
     seconds, `agents` is how many of your colleagues are not already on a call.
     They start where the fiction starts — three holding at 08:57, one person
     free, and that person is about to not be. */
  waiting: 3, held: 37, agents: 1, grow: 0, flip: 0,

  init() {
    this.cv = $('#titleFx');
    if (!this.cv) return;
    this.ctx = this.cv.getContext('2d');
    const menu = $('#titleMenu');
    this.menu = menu ? Array.prototype.slice.call(menu.children) : [];
    /* A pointer over a button and the keyboard's idea of where it is are the
       same cursor. Without this, moving the mouse then pressing Enter starts
       whatever the arrow keys last pointed at, which is not what was under the
       hand. `focus` is in here because Tab has to move the marker too. */
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

  /* ---- the switchboard ---- */
  resize() {
    if (!this.cv) return;
    /* The backdrop is abstract and full of soft glow, so it is drawn at device
       resolution up to 2x and no further: past that it is a lot of fill rate
       for a difference nobody can see on a dot grid. */
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth || innerWidth, h = this.cv.clientHeight || innerHeight;
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.gap = w < 560 ? 38 : 46;
    this.cols = Math.ceil(w / this.gap) + 2;
    this.rows = Math.ceil(h / this.gap) + 2;
    if (!this.motion) this.draw();
  },

  /* A pulse is a call being routed: it starts at an extension, runs a few hops
     along the grid turning at junctions, and lands. `hops` is small on purpose
     — a line that crosses the whole screen reads as a laser, and four to nine
     segments reads as a call finding somebody. */
  spawn() {
    const amber = chance(.24);
    this.pulses.push({
      pts: [{ x: ri(0, this.cols), y: ri(0, this.rows) }],
      dir: ri(0, 3), prog: 0, hop: 0, hops: ri(4, 9),
      speed: rnd(2.1, 4.0), amber, land: -1
    });
  },
  step(p, dt) {
    if (p.land >= 0) { p.land += dt; return; }
    p.prog += p.speed * dt;
    while (p.prog >= 1) {
      p.prog -= 1;
      const h = p.pts[p.pts.length - 1];
      const n = { x: h.x + [1, 0, -1, 0][p.dir], y: h.y + [0, 1, 0, -1][p.dir] };
      /* Off the field is the end of the call rather than a wrap. Wrapping the
         index space was the first version and every wrapped trail jumped the
         width of the screen in one frame, which looks like a bug because it is
         indistinguishable from one. */
      if (n.x < -1 || n.y < -1 || n.x > this.cols + 1 || n.y > this.rows + 1) { p.land = 0; p.prog = 0; return; }
      p.pts.push(n);
      if (p.pts.length > 7) p.pts.shift();
      p.hop++;
      if (p.hop >= p.hops) { p.land = 0; p.prog = 0; return; }
      if (chance(.34)) p.dir = (p.dir + (chance(.5) ? 1 : 3)) % 4;
    }
  },
  node(i, j) { return { x: i * this.gap + this.off - this.gap, y: j * this.gap + this.off * .62 - this.gap }; },

  draw() {
    const c = this.ctx; if (!c) return;
    c.clearRect(0, 0, this.w, this.h);

    /* The strip light. One very wide, very faint amber wash crossing the top of
       the board every twenty seconds or so — it is what stops the backdrop
       reading as a flat colour with dots on it. */
    const sx = ((this.t * .052) % 1.5 - .25) * this.w;
    const lamp = c.createRadialGradient(sx, this.h * .16, 0, sx, this.h * .16, this.h * .95);
    lamp.addColorStop(0, 'rgba(255,179,71,.055)');
    lamp.addColorStop(1, 'rgba(255,179,71,0)');
    c.fillStyle = lamp; c.fillRect(0, 0, this.w, this.h);

    /* The extensions. */
    c.fillStyle = 'rgba(125,165,225,.17)';
    for (let j = 0; j <= this.rows; j++) {
      for (let i = 0; i <= this.cols; i++) {
        const n = this.node(i, j);
        c.fillRect(n.x - 1, n.y - 1, 2, 2);
      }
    }

    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const p of this.pulses) {
      const hue = p.amber ? '255,179,71' : '77,163,255';
      /* The trail, tail first, each segment dimmer than the one in front of it.
         Drawn as separate strokes rather than one path because a gradient along
         a polyline that turns corners is a stroke per segment anyway. */
      for (let k = 1; k < p.pts.length; k++) {
        const a = this.node(p.pts[k - 1].x, p.pts[k - 1].y);
        const b = this.node(p.pts[k].x, p.pts[k].y);
        c.strokeStyle = 'rgba(' + hue + ',' + (.05 + .3 * (k / p.pts.length)) + ')';
        c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
      const h = p.pts[p.pts.length - 1], hn = this.node(h.x, h.y);
      if (p.land < 0) {
        /* The head, between the last extension and the next one along. */
        const nx = h.x + [1, 0, -1, 0][p.dir], ny = h.y + [0, 1, 0, -1][p.dir];
        const t = this.node(nx, ny);
        const x = lerp(hn.x, t.x, p.prog), y = lerp(hn.y, t.y, p.prog);
        c.strokeStyle = 'rgba(' + hue + ',.5)'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(hn.x, hn.y); c.lineTo(x, y); c.stroke();
        const g = c.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, 'rgba(' + hue + ',.85)');
        g.addColorStop(1, 'rgba(' + hue + ',0)');
        c.fillStyle = g; c.fillRect(x - 9, y - 9, 18, 18);
      } else {
        /* It landed. Somebody's phone is ringing. */
        const k = Math.min(1, p.land / .55);
        c.strokeStyle = 'rgba(' + hue + ',' + (.5 * (1 - k)) + ')';
        c.lineWidth = 1.2;
        c.beginPath(); c.arc(hn.x, hn.y, 3 + k * 17, 0, 6.2832); c.stroke();
      }
    }
  },

  tick(dt) {
    if (!this.on) return;
    if (!this.motion) return;
    this.t += dt;

    /* The field drifts. Slowly, and diagonally, so the grid never reads as a
       thing that has stopped. */
    this.off = (this.off + dt * 4.4) % this.gap;

    /* Calls in the air track the queue on the board: three holding is a quiet
       morning, twenty is the switchboard lit up like a runway. */
    this.next -= dt;
    if (this.next <= 0) {
      this.next = clamp(.95 - this.waiting * .04, .2, .95) * rnd(.6, 1.4);
      if (this.pulses.length < 26) this.spawn();
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      this.step(p, dt);
      if (p.land > .55) this.pulses.splice(i, 1);
    }
    this.draw();

    /* The board. The oldest call ages in real time because it is a clock; the
       queue grows on its own because nobody is answering it; and the count of
       colleagues free to help goes to nought and mostly stays there, which is
       the single most accurate thing in this game. */
    this.held += dt;
    this.grow -= dt;
    if (this.grow <= 0) { this.grow = rnd(3.4, 5.6); this.waiting = Math.min(99, this.waiting + 1); }
    this.flip -= dt;
    if (this.flip <= 0) { this.flip = rnd(4, 11); this.agents = this.t > 10 ? (chance(.22) ? 1 : 0) : 1; }
    this.paintBoard();
  },

  /* ---- the numbers ---- */
  /* Written straight into the DOM rather than drawn on the canvas: they are
     text, and text that a browser lays out is text that stays sharp, wraps on a
     phone and can be read out if anybody ever asks it to. */
  paintBoard() {
    const w = $('#boardWaiting'), h = $('#boardHeld'), a = $('#boardAgents'), n = $('#boardNote');
    if (!w) return;
    w.textContent = this.waiting;
    w.className = 'cell-n ' + (this.waiting > 12 ? 'bad' : this.waiting > 5 ? 'warn' : '');
    const m = Math.floor(this.held / 60), s = Math.floor(this.held % 60);
    h.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    h.className = 'cell-n ' + (this.held > 300 ? 'bad' : this.held > 120 ? 'warn' : '');
    a.textContent = this.agents;
    a.className = 'cell-n ' + (this.agents ? '' : 'bad');
    n.textContent =
      say('board.' + (this.waiting > 24 ? 4 : this.waiting > 14 ? 3 : this.waiting > 8 ? 2 : this.waiting > 4 ? 1 : 0));
  },

  /* ---- the ticker ----
     The noticeboard by the lift, moving. Built here rather than written into
     the page twice, because a seamless loop needs the same list end to end and
     two hand-kept copies drift apart the first time somebody edits one. */
  get LINES() { return says('ticker'); },
  ticker() {
    const run = $('#tickerRun'); if (!run) return;
    const one = this.LINES.map(l => '<span class="tk-item">' + esc(l) + '</span>').join('');
    /* Twice, end to end: the animation slides exactly half the width and
       restarts, so the join is never on screen. */
    run.innerHTML = one + one;
  },

  /* ---- the menu ---- */
  /* The title screen was mouse-only: three buttons, and a keyboard that could
     do exactly one thing to them — Enter, which always started a new shift,
     including over the top of a save. Now it is a menu you can walk. */
  point(i) {
    if (i < 0 || i >= this.menu.length) return;
    this.sel = i;
    this.menu.forEach((b, k) => b.classList.toggle('sel', k === i));
  },
  move(d) {
    if (!this.menu.length) return;
    let i = this.sel;
    /* Step over anything disabled — "No saved shift" is a label, not a stop. */
    for (let n = 0; n < this.menu.length; n++) {
      i = (i + d + this.menu.length) % this.menu.length;
      if (!this.menu[i].disabled) break;
    }
    this.point(i);
    /* preventScroll, because focusing a button near the bottom of a short
       screen otherwise scrolls the title out from under the title. */
    try { this.menu[i].focus({ preventScroll: true }); } catch (e) { this.menu[i].focus(); }
    Sfx.blip();
  },
  activate() {
    const b = this.menu[this.sel];
    if (!b || b.disabled) { Sfx.deny(); return; }
    b.click();
  },
  /* The default answer is whatever the buttons themselves say it is: with a
     shift in progress that is Continue, without one it is Start. Boot decides
     which by moving `.primary`, so this reads it back rather than repeating the
     rule in a second place. */
  sync() {
    const i = this.menu.findIndex(b => b.classList.contains('primary'));
    this.point(i < 0 ? 0 : i);
  },

  /* A board that is already busy when you arrive. Spawning from empty and
     waiting means the first two seconds of the game are a dot grid with nothing
     happening on it, which is the one impression this screen cannot afford. */
  warm(n) {
    for (let i = 0; i < n; i++) {
      this.spawn();
      /* Run it forward a random fraction of a second at the frame rate it
         would have had, so each one arrives part-way along its own route
         rather than all of them starting together at their first extension. */
      const p = this.pulses[this.pulses.length - 1];
      for (let k = ri(4, 44); k > 0; k--) this.step(p, 1 / 30);
    }
  },
  show() {
    this.on = true;
    this.motion = FX.motion !== false;
    document.body.classList.toggle('calm-title', !this.motion);
    this.resize();
    this.sync();
    if (!this.pulses.length) this.warm(this.motion ? 9 : 7);
    /* A still frame rather than an empty box when motion is off: the same grid
       with the same calls on it, holding still. */
    if (!this.motion) { this.draw(); this.paintBoard(); }
  },
  hide() { this.on = false; }
};
