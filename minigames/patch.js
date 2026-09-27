'use strict';
/* ---------------- Patch Panel ----------------
   The knot the size of a dog, behind the servers. Somewhere in it one cable is
   not connected to anything and has not been for a long time.

   The THIRD shape, and the one that matters most to the claim: a TURN-BASED
   puzzle. No clock, no reflexes, no update loop worth the name — it advances
   only when you press something. It is written against exactly the same
   interface as a rhythm game, which is the whole reason that interface has a
   separate update() and input() rather than one "tick with the keys in it".

   The board is a spanning tree, so it is always solvable and there is always
   exactly one rotation per cell that is right. That is the classic arrangement
   and it is chosen for one reason: a scrambled tree cannot be generated into an
   unsolvable state, so there is no "give up" button to write and no puzzle a
   player can be trapped in.

   TWO THINGS MAKE IT A PUZZLE RATHER THAN A CHORE, and both were added after
   playing it. A scrambled tree with every cell loose is solvable greedily,
   cell by cell, without a thought in your head — three racks came to about a
   hundred and thirty taps of pure grind. So a quarter of the cells arrive
   BOLTED: already right, and not turnable. They cut the tapping, and more to
   the point they are what you reason outward FROM — a bolted elbow tells you
   what its neighbours have to be, which is the difference between deduction
   and a rake. And because the board only turns one way, overshooting a cell by
   one used to cost three more taps; there is an UNDO on the board now, which
   is the single most irritating thing in this genre fixed for one line. */

const MG_PATCH = {
  id: 'patch',
  name: 'Patch Panel',
  icon: '🔌',
  blurb: 'Steve says it is a network issue. Steve has said that since 2021.',
  goal: 'Turn the loose cables until the rack reaches the panel. Three racks.',
  mins: 8,
  /* The one of the three that was already right. A perfect solve is about 3,500
     and a sloppy one about 2,000, so a good round is here. */
  par: 3000,
  help: {
    keys: ['Click a cable to turn it · arrows and space also work',
      'Overshot? Press Z, or the undo on the rack'],
    taps: ['Tap a cable to turn it', 'Overshot? Tap the undo under the rack']
  },
  pads: [],           /* pointer-first: the board IS the control. */

  /* Bit per side, clockwise from north. Rotating is a rotate-left of four bits,
     which is why the order matters and why nothing here ever names a direction
     twice. */
  N: 1, E: 2, S: 4, W: 8,
  DX: { 1: 0, 2: 1, 4: 0, 8: -1 },
  DY: { 1: -1, 2: 0, 4: 1, 8: 0 },
  OPP: { 1: 4, 2: 8, 4: 1, 8: 2 },
  SIZES: [4, 5, 6],

  start(a) {
    this.rack = 0; this.moves = 0; this.parMoves = 0; this.undone = 0;
    this.last = null; this.shakeCell = null; this.bolts = 0;
    this.rackAt = 0; this.turns = 0; this.rackScores = [];
    this.surge = 0;                 /* the light running down the patched path */
    /* A flag AND a time, not a time alone. `solvedAt = a.t` is falsy on the
       frame the round starts on, so a rack patched before the clock had moved
       read as unpatched and the game never advanced off it. */
    this.solved = false; this.solvedT = 0;
    this.cursor = { x: 0, y: 0 };
    this.spin = [];              /* cells mid-turn, purely for the animation */
    this.build(a);
  },

  /* A randomised depth-first spanning tree over the grid. Every cell ends up on
     it, so every cell is part of the answer and there is no dead furniture on
     the board to waste the player's time. */
  build(a) {
    const n = this.SIZES[this.rack];
    this.n = n;
    const cells = [];
    for (let i = 0; i < n * n; i++) cells.push({ links: 0, off: 0, lit: false, bolt: false });
    const seen = new Uint8Array(n * n);
    const idx = (x, y) => y * n + x;
    const stack = [{ x: 0, y: 0 }];
    seen[0] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const opts = [];
      for (const bit of [1, 2, 4, 8]) {
        const nx = c.x + this.DX[bit], ny = c.y + this.DY[bit];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n || seen[idx(nx, ny)]) continue;
        opts.push({ bit: bit, x: nx, y: ny });
      }
      if (!opts.length) { stack.pop(); continue; }
      const o = pick(opts);
      cells[idx(c.x, c.y)].links |= o.bit;
      cells[idx(o.x, o.y)].links |= this.OPP[o.bit];
      seen[idx(o.x, o.y)] = 1;
      stack.push({ x: o.x, y: o.y });
    }
    /* The rack feeds in at the left of the top row and the panel is at the
       right of the bottom one — the two ends are always the two corners, so a
       player never has to hunt for what they are joining up. */
    this.src = { x: 0, y: 0 };
    this.sink = { x: n - 1, y: n - 1 };

    /* Scramble. The par comes out of it for nothing: a cell turned clockwise k
       times is (4 - k) more turns from being right again, and the board only
       turns one way, so the sum of those IS the shortest way back. It is
       accumulated per cell rather than per pass, because a second pass turns an
       already-turned cell and the two do not add up to either one of them. */
    this.cells = cells;
    let tries = 0;
    do {
      for (const c of cells) {
        const k = ri(0, 3);
        for (let i = 0; i < k; i++) c.links = this.cw(c.links);
        c.off = (c.off + k) % 4;
      }
      tries++;
    } while (this.power() && tries < 6);
    /* A rack that scrambled itself back into a working one has nothing in it to
       do. Vanishingly unlikely and cheap to rule out: turn cells until one of
       them breaks the run. */
    if (this.power()) {
      for (const c of cells) {
        c.links = this.cw(c.links); c.off = (c.off + 1) % 4;
        if (!this.power()) break;
      }
    }
    /* BOLTED. A quarter of the cells, chosen after the scramble and put back to
       right, so they are anchors rather than obstacles: every one of them is a
       fact about its neighbours that you get for free. Never the two ends —
       those are already fixed points and bolting them says nothing — and never
       a cell with one link, because a bolted leaf tells you nothing either. */
    /* A quarter of the rack, plus one per rank of the cabinet's skill. It is
       wired to Troubleshooting, which is exactly the fiction: the better you
       are at this, the more of it you can see is already right without having
       to touch it. */
    const want = Math.round(n * n * 0.24) + (a && a.skill ? a.skill : 0);
    const eligible = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if ((x === this.src.x && y === this.src.y) || (x === this.sink.x && y === this.sink.y)) continue;
      const c = cells[idx(x, y)];
      let arms = 0;
      for (const bit of [1, 2, 4, 8]) if (c.links & bit) arms++;
      if (arms >= 2) eligible.push({ x: x, y: y });
    }
    for (let i = 0; i < want && eligible.length; i++) {
      const pickAt = ri(0, eligible.length - 1);
      const e = eligible.splice(pickAt, 1)[0];
      const c = cells[idx(e.x, e.y)];
      for (let k = (4 - c.off) % 4; k > 0; k--) c.links = this.cw(c.links);
      c.off = 0; c.bolt = true;
    }
    this.bolts = cells.filter(c => c.bolt).length;
    this.parMoves = cells.reduce((s, c) => s + ((4 - c.off) % 4), 0);
    this.rackAt = a && a.t !== undefined ? a.t : 0;
    this.cursor = { x: 0, y: 0 };
    this.spin.length = 0;
    /* Bolting puts cells BACK, so a heavily-bolted small rack can arrive
       already patched. Unbolt and re-scramble one until it is not. */
    let guard = 0;
    while (this.power() && guard++ < 40) {
      const loose = cells.filter(c => !c.bolt);
      const c = loose.length ? loose[ri(0, loose.length - 1)] : cells[1];
      c.links = this.cw(c.links); c.off = (c.off + 1) % 4;
      if (c.bolt) { c.bolt = false; this.bolts--; }
      this.parMoves = cells.reduce((s, x) => s + ((4 - x.off) % 4), 0);
    }
    this.power();
  },
  cw(l) { return ((l << 1) | (l >> 3)) & 15; },
  ccw(l) { return ((l >> 1) | (l << 3)) & 15; },

  /* What is live. A flood from the rack through matching ends — both cells have
     to agree that there is a cable between them, which is the whole puzzle. */
  power() {
    const n = this.n, idx = (x, y) => y * n + x;
    for (const c of this.cells) c.lit = false;
    const q = [this.src];
    this.cells[idx(this.src.x, this.src.y)].lit = true;
    while (q.length) {
      const c = q.pop();
      const here = this.cells[idx(c.x, c.y)];
      for (const bit of [1, 2, 4, 8]) {
        if (!(here.links & bit)) continue;
        const nx = c.x + this.DX[bit], ny = c.y + this.DY[bit];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const there = this.cells[idx(nx, ny)];
        if (there.lit || !(there.links & this.OPP[bit])) continue;
        there.lit = true;
        q.push({ x: nx, y: ny });
      }
    }
    return this.cells[idx(this.sink.x, this.sink.y)].lit;
  },

  input(a, ev) {
    if (this.solved) return;                /* the rack is celebrating; let it */
    if (ev.kind === 'point' && ev.down) {
      /* The undo is ON THE BOARD rather than a declared pad, because this is
         the pointer-first game: its controls belong on the thing you are
         pointing at, exactly as the inbox draws its three verbs. */
      const u = this.undoBox(a);
      if (ev.x >= u.x && ev.x <= u.x + u.w && ev.y >= u.y && ev.y <= u.y + u.h) {
        this.undo(a);
        return;
      }
      const cell = this.cellAt(a, ev.x, ev.y);
      if (cell) { this.cursor = cell; this.turn(a, cell.x, cell.y); }
      return;
    }
    if (ev.kind !== 'key' || !ev.down) return;
    const move = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] }[ev.code];
    if (move) {
      this.cursor.x = clamp(this.cursor.x + move[0], 0, this.n - 1);
      this.cursor.y = clamp(this.cursor.y + move[1], 0, this.n - 1);
      a.sfx.click();
      return;
    }
    if (ev.code === 'KeyZ' || ev.code === 'Backspace') { this.undo(a); return; }
    if (ev.code === 'Space' || ev.code === 'Enter') this.turn(a, this.cursor.x, this.cursor.y);
  },

  /* One turn back the way it came. Not a general undo stack: the board only
     turns clockwise, so the fault this fixes is the specific one of going one
     past — and the fix for that is the cell you just touched, turned back. It
     costs a move like any other turn, because it IS one. */
  undo(a) {
    const at = this.last;
    if (!at) { a.sfx.bad(); return; }
    const c = this.cells[at.y * this.n + at.x];
    if (!c || c.bolt) { a.sfx.bad(); return; }
    c.links = this.ccw(c.links);
    this.moves++; this.undone++;
    this.spin.push({ x: at.x, y: at.y, t: 0, back: true });
    a.sfx.click();
    if (this.power() && !this.solved) {
      this.solved = true; this.solvedT = a.t; this.surge = 1;
      a.sfx.good();
    }
  },

  turn(a, x, y) {
    const c = this.cells[y * this.n + x];
    /* Bolted. It says no rather than silently doing nothing — a control that
       ignores you is indistinguishable from one that is broken. */
    if (c.bolt) { a.sfx.bad(); this.shakeCell = { x: x, y: y, t: 0 }; return; }
    c.links = this.cw(c.links);
    this.moves++;
    this.last = { x: x, y: y };
    this.spin.push({ x: x, y: y, t: 0 });
    a.sfx.click();
    const done = this.power();
    if (done && !this.solved) {
      this.solved = true; this.solvedT = a.t;
      this.surge = 1;
      a.sfx.good();
      const g = this.grid(a);
      a.burst(g.x + g.s * (this.sink.x + .5), g.y + g.s * (this.sink.y + .5), a.paint.good, 22, 240);
    }
  },

  update(a, dt) {
    for (let i = this.spin.length - 1; i >= 0; i--) {
      this.spin[i].t += dt;
      if (this.spin[i].t > .18) this.spin.splice(i, 1);
    }
    if (this.shakeCell) {
      this.shakeCell.t += dt;
      if (this.shakeCell.t > .22) this.shakeCell = null;
    }
    if (this.surge > 0) this.surge = Math.max(0, this.surge - dt * 1.4);
    if (!this.solved || a.t - this.solvedT < .9) return;
    /* Score the rack, then either move up a size or finish. Over par costs a
       little per extra turn and never goes negative — a puzzle that can be
       finished with a negative score is a puzzle nobody finishes twice.

       There is no clock on this game and there should not be: it is the
       turn-based one, and a timer would make it the other two. But a rack
       patched briskly IS worth more than the same rack patched over five
       minutes, so there is a bonus for it rather than a penalty against it —
       the difference between a game that rewards you for being quick and one
       that punishes you for thinking. */
    const spent = a.t - this.rackAt;
    const over = Math.max(0, this.moves - this.parMoves);
    const brisk = Math.round(clamp(1 - spent / (this.parMoves * 2.6), 0, 1) * 180);
    const got = Math.max(220, 1000 - over * 22) + brisk;
    a.add(got);
    this.turns += this.moves;
    this.rackScores.push({ n: this.n, moves: this.moves, par: this.parMoves, got: got });
    a.pop(a.w / 2, a.h * .25, 'RACK ' + (this.rack + 1) + ' PATCHED  +' + got, a.paint.good);
    this.rack++;
    this.solved = false; this.solvedT = 0;
    if (this.rack >= this.SIZES.length) {
      a.end({ win: true,
        note: 'All three racks. Ticket #4471 remains open, because nobody is going to close it.' });
      return;
    }
    this.moves = 0;
    this.last = null;
    this.build(a);
    this.rackAt = a.t;
  },

  summary(a) {
    const par = this.rackScores.reduce((n, r) => n + r.par, 0);
    return [['racks', this.rackScores.length + '/' + this.SIZES.length],
      ['turns', String(this.turns)],
      ['par', String(par)],
      ['turned back', String(this.undone)]];
  },

  hud(a) {
    return { l: 'RACK ' + Math.min(this.rack + 1, this.SIZES.length) + '/' + this.SIZES.length
      + '  ·  ' + this.moves + ' turns' + (this.parMoves ? ' (par ' + this.parMoves + ')' : ''),
      r: 'SCORE ' + a.score };
  },

  /* The undo, under the rack. Measured once so drawing and hit-testing cannot
     disagree about where it is — the same arrangement the inbox's targets have. */
  undoBox(a) {
    const G = this.grid(a);
    const w = Math.min(120, G.w), h = 30;
    return { x: G.x + (G.w - w) / 2, y: Math.min(G.y + G.w + 12, a.h - h - 4), w: w, h: h };
  },

  /* ---- geometry ---- */
  grid(a) {
    const top = 42, bottom = 64;        /* room under the rack for the undo */
    const s = Math.floor(Math.min((a.w - 40) / this.n, (a.h - top - bottom) / this.n));
    const w = s * this.n;
    return { s: s, x: Math.round((a.w - w) / 2), y: Math.round(top + (a.h - top - bottom - w) / 2), w: w };
  },
  cellAt(a, px, py) {
    const g = this.grid(a);
    const x = Math.floor((px - g.x) / g.s), y = Math.floor((py - g.y) / g.s);
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return null;
    return { x: x, y: y };
  },

  draw(a, g) {
    const p = a.paint, G = this.grid(a);
    const bg = g.createLinearGradient(0, 0, 0, a.h);
    bg.addColorStop(0, '#0e1a1a'); bg.addColorStop(1, p.ink);
    g.fillStyle = bg; g.fillRect(0, 0, a.w, a.h);

    p.say(g, 'RACK ' + (this.rack + 1) + ' · ' + this.n + '×' + this.n, a.w / 2, 26,
      { size: 10, font: p.mono, colour: p.dim, align: 'center' });

    /* the cabinet the whole thing sits in */
    p.box(g, G.x - 8, G.y - 8, G.w + 16, G.w + 16, 8, 'rgba(0,0,0,.35)', p.line);
    /* A scrambled cable can point at the wall — that IS the mistake you are
       there to fix — but drawn past the cabinet it reads as the renderer being
       broken rather than the cable. Clipped to the rack. */
    g.save();
    g.beginPath(); g.rect(G.x, G.y, G.w, G.w); g.clip();

    const spinOf = (x, y) => {
      const s = this.spin.find(s => s.x === x && s.y === y);
      if (!s) return 0;
      /* Turning back animates back: the quarter turn is unwound in the other
         direction, so an undo LOOKS like an undo. */
      return (1 - s.t / .18) * (Math.PI / 2) * (s.back ? -1 : 1);
    };

    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) {
      const c = this.cells[y * this.n + x];
      const cx = G.x + G.s * (x + .5), cy = G.y + G.s * (y + .5);
      g.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,.018)' : 'rgba(255,255,255,.04)';
      g.fillRect(G.x + G.s * x, G.y + G.s * y, G.s, G.s);

      const nudge = this.shakeCell && this.shakeCell.x === x && this.shakeCell.y === y
        ? Math.sin(this.shakeCell.t * 70) * (1 - this.shakeCell.t / .22) * 3 : 0;
      g.save();
      g.translate(cx + nudge, cy);
      /* Turning back through the last quarter turn is the only animation on the
         board, and it is what tells you the press registered. */
      g.rotate(-spinOf(x, y));
      const lit = c.lit;
      g.lineCap = 'round';
      g.lineWidth = Math.max(3, G.s * .17);
      /* The whole rack flares green for a moment when it comes good. Without
         it the only thing that changes on the frame you solve it is one small
         box in the corner going from red to green, which on a phone in a lit
         room is not a thing anybody sees. */
      g.strokeStyle = lit ? (this.surge > 0 ? p.good : p.hold) : '#3d4a63';
      if (lit) {
        g.shadowColor = this.surge > 0 ? p.good : p.hold;
        g.shadowBlur = G.s * (.35 + this.surge * .9);
      }
      const reach = G.s / 2;
      for (const bit of [1, 2, 4, 8]) {
        if (!(c.links & bit)) continue;
        g.beginPath(); g.moveTo(0, 0);
        g.lineTo(this.DX[bit] * reach, this.DY[bit] * reach);
        g.stroke();
      }
      g.shadowBlur = 0;
      /* A hub on anything that is not a simple through-cable, so a T and a
         corner are told apart at a glance on a 320px screen. */
      g.fillStyle = lit ? (this.surge > 0 ? p.good : p.hold) : '#4b5a77';
      g.beginPath(); g.arc(0, 0, Math.max(2.5, G.s * .11), 0, 6.284); g.fill();
      /* A bolt through the hub. It has to read at 40px on a phone and it has to
         read as FIXED rather than as decoration, so it is a ring and a cross —
         the head of a screw, which is what it is. */
      if (c.bolt) {
        const r = Math.max(3.5, G.s * .17);
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(0, 0, r, 0, 6.284); g.stroke();
        g.beginPath();
        g.moveTo(-r * .55, -r * .55); g.lineTo(r * .55, r * .55);
        g.moveTo(r * .55, -r * .55); g.lineTo(-r * .55, r * .55);
        g.stroke();
      }
      g.restore();
    }

    g.restore();

    /* the two ends */
    const endBox = (cx, cy, label, colour, on) => {
      const w = G.s * .62;
      p.box(g, cx - w / 2, cy - w / 2, w, w, 4, on ? colour : 'rgba(0,0,0,.5)', colour);
      p.say(g, label, cx, cy + 3, { size: Math.max(8, G.s * .26), weight: '700', font: p.mono,
        colour: on ? p.ink : colour, align: 'center' });
    };
    endBox(G.x + G.s * (this.src.x + .5), G.y + G.s * (this.src.y + .5), 'IN', p.brand, true);
    const done = this.cells[this.sink.y * this.n + this.sink.x].lit;
    endBox(G.x + G.s * (this.sink.x + .5), G.y + G.s * (this.sink.y + .5), 'OUT',
      done ? p.good : p.bad, done);

    /* The undo, on the board. Disabled until there is something to take back,
       and it says which — "turn back" is a different promise from "undo", and
       this one only ever unwinds the cell you last touched. */
    const u = this.undoBox(a);
    const can = !!this.last;
    p.box(g, u.x, u.y, u.w, u.h, 7, can ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)',
      can ? p.line : 'rgba(255,255,255,.08)');
    p.say(g, a.touch ? '↺ turn back' : '↺ turn back  (Z)', u.x + u.w / 2, u.y + u.h / 2 + 4,
      { size: 11, font: p.mono, align: 'center',
        colour: can ? p.dim : 'rgba(255,255,255,.18)' });

    /* Said once, on the first rack: the hint line under the canvas is the first
       thing a short viewport drops, so on a phone this is the only place it can
       be read at all. */
    if (this.rack === 0 && this.moves < 3) {
      p.say(g, a.touch ? 'Tap a cable to turn it · bolted ones will not move'
        : 'Click a cable to turn it · bolted ones will not move',
        a.w / 2, Math.min(u.y + u.h + 18, a.h - 6),
        { size: 11, colour: 'rgba(255,255,255,.34)', align: 'center' });
    }

    /* the cursor, which only a keyboard ever moves */
    if (!a.touch) {
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
      g.strokeRect(G.x + G.s * this.cursor.x + 1, G.y + G.s * this.cursor.y + 1, G.s - 2, G.s - 2);
    }
  },

  reward(a, r) {
    const share = clamp(r.score / this.par, 0, 1.4);
    if (!r.win) {
      return { xp: Math.round(14 * share),
        toast: 'You put the knot back roughly as you found it.' };
    }
    Ach.get('a_patched');
    if (typeof Arcade !== 'undefined' && Arcade.clearedAll()) Ach.get('a_arcade');
    return {
      xp: 45 + Math.round(60 * share),
      money: Math.round(share * 150) / 100,
      rep: 3, patience: 4,
      toast: 'Three racks patched. Steve will explain that it was always a network issue.'
    };
  }
};
