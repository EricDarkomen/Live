'use strict';
/* ---------------- Hold Music Hero ----------------
   Call 000001 has been on hold since 2009, and the headset is still hanging
   by the terminal. A four-lane rhythm game: the real-time shape, where a frame
   late is a miss. Two kinds of note: a tap, and a hold that breaks if let go
   early, which turns four lanes into a hand position.
   Written against engine/arcade.js's interface only: canvas, dt, presses and
   score arrive on `a`. The four pads send the same key codes a keyboard does,
   so there is one input path. */

const MG_HOLD = {
  id: 'holdmusic',
  name: 'Sunset Set',
  icon: '🎧',
  blurb: 'Luca’s decks, a deck full of people, and one steel-drum loop you absolutely must not drop.',
  goal: 'Keep the dance floor going to the end of the track.',
  mins: 12,
  /* Measured: reward() divides by par and caps at 1.4, so par is a good run
     (about 90% of taps and most holds). An expert run hits the cap. */
  par: 22000,
  help: {
    keys: ['D F J K or 1–4 to play a lane', 'A long note has to be HELD to the end of it'],
    taps: ['Tap the four pads under the lanes', 'A long note has to be HELD to the end of it']
  },
  pads: [
    { code: 'KeyD', label: '◆', aria: 'Lane one' },
    { code: 'KeyF', label: '◆', aria: 'Lane two' },
    { code: 'KeyJ', label: '◆', aria: 'Lane three' },
    { code: 'KeyK', label: '◆', aria: 'Lane four' }
  ],

  /* A key code to a lane. Two rows of it, because a keyboard player expects the
     home row and a numeric player expects the numbers, and neither is wrong. */
  LANE: { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 },
  /* A minor scale (it is Greensleeves). Each note indexes it, so hitting notes
     plays the tune and a miss leaves a hole in it. */
  SCALE: [220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00,
    493.88, 523.25, 587.33, 659.25, 698.46, 783.99, 880.00],
  COLOUR: ['#4da3ff', '#b48cff', '#ffb347', '#5ad48a'],
  /* Judgement windows in seconds, and what each is worth. Generous at the far
     end on purpose: this is a joke about hold music, not a test. */
  WINDOW: [[0.075, 'PERFECT', 200, 2], [0.135, 'GOOD', 110, 1], [0.215, 'LATE', 45, 0]],
  /* Stress Resistance widens the timing windows a tenth per rank (about a frame
     and a half): felt, never decisive. */
  windows(a) {
    const k = 1 + (a.skill || 0) * 0.10;
    return this.WINDOW.map(w => [w[0] * k, w[1], w[2], w[3]]);
  },

  start(a) {
    this.notes = this.chart();
    /* The last note's TAIL, not its head: a four-beat hold at the end of the
       chart would otherwise still be running when the round was declared over. */
    this.songEnd = this.notes.reduce((m, n) => Math.max(m, n.t + (n.len || 0)), 8) + 2.4;
    this.combo = 0; this.bestCombo = 0; this.hits = 0; this.misses = 0;
    this.perfect = 0; this.line = 100; this.next = 0;
    this.holds = 0; this.kept = 0; this.dropped = 0;
    this.live = [null, null, null, null];   /* the hold each lane is carrying */
    this.bar = -1;                  /* which bar the backing has played */
    this.flash = [0, 0, 0, 0];      /* per-lane receptor glow, decaying */
    this.press = [0, 0, 0, 0];      /* per-lane pad depression */
    this.judge = null;              /* the word in the middle of the screen */
    this.pulse = 0;
  },

  /* Generated, not written, so it cannot be memorised. The lane walks rather
     than jumps, and density climbs with the bar. */
  chart() {
    const out = [];
    const beat = 0.6, first = 2.3, bars = 20;
    let lane = ri(0, 3);
    /* The pitch follows the lane, plus a slow drift: moving right moves the tune
       up. */
    let step = 4;
    /* Which lane is busy holding, and until when. A tap under your own held
       finger is not a phrase, it is a mistake — so a lane carrying a hold is
       skipped for the length of it. */
    const busy = [0, 0, 0, 0];
    for (let b = 0; b < bars; b++) {
      const heat = b / bars;
      for (let s = 0; s < 8; s++) {
        const onBeat = s % 2 === 0;
        const t = first + (b * 4 + s * 0.5) * beat;
        /* A HOLD, on a bar line, once the tune has got going. Long enough to
           be a decision (two to four beats) and never so dense that both hands
           are pinned. */
        if (onBeat && s === 0 && b >= 4 && chance(0.34)) {
          const free = [0, 1, 2, 3].filter(L => busy[L] <= t);
          if (free.length > 1) {
            const L = pick(free);
            const len = pick([2, 2, 3, 4]) * beat;
            step = clamp(step + (L - lane), 0, this.SCALE.length - 1);
            lane = L;
            busy[L] = t + len + beat * 0.5;
            out.push({ lane: L, t: t, len: len, done: false, p: step });
            continue;
          }
        }
        const p = onBeat ? 0.70 + heat * 0.26 : 0.06 + heat * 0.40;
        if (!chance(p)) continue;
        const open = [0, 1, 2, 3].filter(L => busy[L] <= t);
        if (!open.length) continue;
        const was = lane;
        /* Still a walk, but never onto the lane a finger is already on. */
        let want = clamp(lane + pick([-1, -1, 0, 1, 1]), 0, 3);
        if (open.indexOf(want) < 0) want = open.reduce((a, L) =>
          Math.abs(L - want) < Math.abs(a - want) ? L : a, open[0]);
        lane = want;
        step = clamp(step + (lane - was) + (onBeat ? 0 : pick([-1, 0, 1])), 0, this.SCALE.length - 1);
        out.push({ lane: lane, t: t, len: 0, done: false, p: step });
        /* Chords only on a beat once the tune has settled, a third apart. */
        if (onBeat && heat > 0.5 && chance(0.15)) {
          const other = open.filter(L => L !== lane);
          if (other.length) {
            out.push({ lane: pick(other), t: t, len: 0, done: false,
              p: clamp(step + 2, 0, this.SCALE.length - 1) });
          }
        }
      }
    }
    out.sort((x, y) => x.t - y.t);
    return out;
  },

  input(a, ev) {
    if (ev.kind !== 'key') return;
    const lane = this.LANE[ev.code];
    if (lane === undefined) return;
    if (!ev.down) {
      /* Letting go is a move here, not the absence of one. A hold released
         before its end is dropped, and that is the whole of what a hold asks. */
      const h = this.live[lane];
      if (h && a.t < h.t + h.len - 0.09) this.drop(a, lane, h);
      return;
    }
    this.flash[lane] = 1; this.press[lane] = 1;
    this.strike(a, lane);
  },

  /* The nearest unjudged note in the lane within the window. Mashing is not
     punished beyond losing the note. */
  strike(a, lane) {
    let found = null, gap = 9;
    for (let i = this.next; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - a.t > 0.3) break;
      if (n.done || n.lane !== lane) continue;
      const d = Math.abs(n.t - a.t);
      if (d < gap) { gap = d; found = n; }
    }
    const win = this.windows(a);
    if (!found || gap > win[2][0]) { a.sfx.click(); return; }
    const w = win.find(x => gap <= x[0]) || win[2];
    found.done = true;
    this.hits++;
    if (w[1] === 'PERFECT') this.perfect++;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    /* Every ten in a row adds half; capped at 4x. */
    const mult = Math.min(4, 1 + Math.floor(this.combo / 10) * 0.5);
    a.add(Math.round(w[2] * mult));
    const grade = win.indexOf(w);
    this.line = clamp(this.line + [2, 1, 0][grade], 0, 100);
    this.judge = { t: 0, s: w[1], c: [a.paint.good, a.paint.brand, a.paint.dim][grade] };
    this.pulse = 1;
    /* The note's own pitch, not the lane's. A late one is flatter and quieter,
       so the tune tells you how you are doing before the word does. */
    const pitch = this.SCALE[found.p === undefined ? 7 : found.p];
    a.sfx.tone(pitch * (grade === 2 ? 0.985 : 1), grade === 0 ? .3 : .2,
      'triangle', grade === 0 ? .26 : grade === 1 ? .2 : .13);
    if (grade === 0) a.sfx.tone(pitch * 2, .12, 'sine', .07, .01);
    if (w[1] === 'PERFECT') a.burst(this.laneX(a, lane), this.hitY(a), this.COLOUR[lane], 8, 150);
    /* A hold is not finished by being struck — it has only started. It stays
       live in its lane until the key comes up or the tail runs out. */
    if (found.len > 0) {
      found.live = true; found.tick = a.t;
      this.live[lane] = found;
      this.holds++;
    }
  },

  /* Let go too early. Costs the combo, because keeping it is the point. */
  drop(a, lane, h) {
    h.live = false; h.broke = true;
    this.live[lane] = null;
    this.dropped++;
    this.combo = 0;
    this.line = clamp(this.line - 5, 0, 100);
    this.judge = { t: 0, s: 'DROPPED', c: a.paint.bad };
    a.shake(3); a.sfx.bad();
  },
  /* Kept to the end of the tail. */
  keep(a, lane, h) {
    h.live = false; h.kept = true;
    this.live[lane] = null;
    this.kept++;
    const mult = Math.min(4, 1 + Math.floor(this.combo / 10) * 0.5);
    a.add(Math.round(160 * mult));
    this.line = clamp(this.line + 3, 0, 100);
    this.judge = { t: 0, s: 'HELD', c: a.paint.good };
    this.pulse = 1;
    a.burst(this.laneX(a, lane), this.hitY(a), this.COLOUR[lane], 12, 180);
    a.sfx.tone(this.SCALE[h.p === undefined ? 7 : h.p] * 2, .16, 'triangle', .16);
  },

  update(a, dt) {
    /* A bass note every bar, so there is a pulse before the first note. */
    const bar = Math.floor((a.t - 2.3) / 2.4);
    if (bar !== this.bar && a.t > 0.5) {
      this.bar = bar;
      if (a.t < this.songEnd - 0.2) {
        a.sfx.tone(110 * (bar % 4 === 2 ? 1.335 : 1), .34, 'sine', .1);
        this.pulse = Math.max(this.pulse, .5);
      }
    }
    /* Notes past the last window are missed; `next` only moves forward. `done` is
       about a hold's head. */
    while (this.next < this.notes.length && this.notes[this.next].t < a.t - this.windows(a)[2][0]) {
      const n = this.notes[this.next];
      if (!n.done) {
        this.misses++; this.combo = 0;
        this.line = clamp(this.line - 7, 0, 100);
        this.judge = { t: 0, s: 'MISSED', c: a.paint.bad };
        a.shake(3); a.sfx.bad();
      }
      this.next++;
    }

    /* Live holds: score every quarter second, a soft note while held, and the end
       (kept to the tail, or released early). Releases are in input(); this also
       catches keys never released and vanished pointers. */
    for (let i = 0; i < 4; i++) {
      const h = this.live[i];
      if (!h) continue;
      const done = a.t >= h.t + h.len;
      const holding = a.held(['KeyD', 'KeyF', 'KeyJ', 'KeyK'][i])
        || a.held(['Digit1', 'Digit2', 'Digit3', 'Digit4'][i]);
      if (done) { this.keep(a, i, h); continue; }
      if (!holding) { this.drop(a, i, h); continue; }
      this.flash[i] = Math.max(this.flash[i], .55);
      while (a.t - h.tick > 0.25) {
        h.tick += 0.25;
        const mult = Math.min(4, 1 + Math.floor(this.combo / 10) * 0.5);
        a.add(Math.round(22 * mult));
        a.sfx.tone(this.SCALE[h.p === undefined ? 7 : h.p], .1, 'sine', .07);
      }
    }
    for (let i = 0; i < 4; i++) {
      this.flash[i] = Math.max(0, this.flash[i] - dt * 4);
      this.press[i] = a.held(['KeyD', 'KeyF', 'KeyJ', 'KeyK'][i])
        || a.held(['Digit1', 'Digit2', 'Digit3', 'Digit4'][i])
        ? 1 : Math.max(0, this.press[i] - dt * 8);
    }
    if (this.judge) { this.judge.t += dt; if (this.judge.t > .7) this.judge = null; }
    this.pulse = Math.max(0, this.pulse - dt * 3);

    if (this.line <= 0) {
      return a.end({ win: false, note: 'They hung up. After sixteen years. Because of you.' });
    }
    if (a.t >= this.songEnd) {
      const acc = this.notes.length ? this.hits / this.notes.length : 0;
      a.add(Math.round(this.bestCombo * 12 + acc * 1200));
      a.end({ win: true,
        note: acc > .95 ? 'The line goes quiet. Somewhere, a call that started in 2009 is finally over.'
          : 'The tune ends. The call does not. But you kept them on.' });
    }
  },

  summary(a) {
    const acc = this.notes.length ? this.hits / this.notes.length : 0;
    return [['notes', this.hits + '/' + this.notes.length],
      ['accuracy', Math.round(acc * 100) + '%'],
      ['held', this.kept + '/' + this.holds],
      ['best run', String(this.bestCombo)]];
  },

  hud(a) {
    const left = Math.max(0, this.songEnd - a.t);
    return { l: 'COMBO ' + this.combo + (this.combo >= 10 ? ' ×' + Math.min(4, 1 + Math.floor(this.combo / 10) * .5) : ''),
      r: 'SCORE ' + a.score + '  ·  ' + left.toFixed(0) + 's' };
  },

  /* ---- geometry, all of it derived from the canvas rather than written down,
     because the same board has to work at 320px and at 900 ---- */
  board(a) {
    const w = Math.min(a.w - 16, 420);
    return { x: (a.w - w) / 2, w: w, lw: w / 4 };
  },
  laneX(a, i) { const b = this.board(a); return b.x + b.lw * (i + .5); },
  /* The header band is reserved; notes falling through the patience meter read
     as a fault. */
  TOP: 40,
  hitY(a) { return a.h - clamp(a.h * 0.14, 44, 92); },
  /* A note's lead time scales with the field height, so speed reads the same on
     a desktop and a landscape phone. */
  lead(a) { return clamp((this.hitY(a) - this.TOP) / 300, 0.85, 1.55); },

  draw(a, g) {
    const p = a.paint, b = this.board(a), hy = this.hitY(a), top = this.TOP;
    const speed = (hy - top) / this.lead(a);

    /* The room behind the lanes, breathing on the beat so that the board is
       never a flat rectangle. */
    const bg = g.createLinearGradient(0, 0, 0, a.h);
    bg.addColorStop(0, '#0b1420'); bg.addColorStop(1, p.ink);
    g.fillStyle = bg; g.fillRect(0, 0, a.w, a.h);

    /* Everything that moves is clipped to the playfield. The header above it
       carries the one number that decides the round and must stay readable. */
    g.save();
    g.beginPath(); g.rect(b.x, top, b.w, a.h - top); g.clip();
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(b.x, top, b.w, a.h - top);
    if (this.pulse > 0) p.glow(g, a.w / 2, hy, a.w * .7, p.brand, this.pulse * .12);

    /* A beat line every 0.6s, scrolling with the chart. Without it the lanes
       read as static in the gaps, and the gaps are where a player is trying to
       find the tempo. */
    const beat = 0.6;
    for (let k = Math.floor(a.t / beat); ; k++) {
      const y = hy - (k * beat - a.t) * speed;
      if (y < top) break;
      g.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.04)';
      g.fillRect(b.x, y, b.w, 1);
    }

    for (let i = 0; i < 4; i++) {
      const x = b.x + b.lw * i;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.012)' : 'rgba(255,255,255,.034)';
      g.fillRect(x, top, b.lw, a.h - top);
      if (this.flash[i] > 0) {
        g.save(); g.globalAlpha = this.flash[i] * .3;
        const lg = g.createLinearGradient(0, hy - 200, 0, hy);
        lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, this.COLOUR[i]);
        g.fillStyle = lg; g.fillRect(x, hy - 200, b.lw, 200); g.restore();
      }
      if (i) {
        g.fillStyle = 'rgba(255,255,255,.07)';
        g.fillRect(Math.round(x), top, 1, a.h - top);
      }
    }

    /* the hit line, glowing, because it is the only place on the board where
       anything is ever true */
    g.save();
    g.shadowColor = 'rgba(255,255,255,.5)'; g.shadowBlur = 8;
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillRect(b.x, hy - 1, b.w, 2);
    g.restore();

    const nh = 18;
    /* A tail runs up from its head, clamped at the line, so a played hold is
       visibly eaten. */
    const tail = (n, alpha) => {
      const x = b.x + b.lw * n.lane + 5, w = b.lw - 10;
      const tailTop = hy - (n.t + n.len - a.t) * speed;
      const bottom = Math.min(hy - (n.t - a.t) * speed, hy);
      if (bottom <= top || tailTop > hy + nh) return;
      g.save();
      g.globalAlpha = alpha;
      p.box(g, x + 4, Math.max(tailTop, top), w - 8,
        Math.max(2, bottom - Math.max(tailTop, top)), 5,
        n.live ? '#fff' : this.COLOUR[n.lane]);
      g.restore();
      if (n.live) p.glow(g, x + w / 2, hy, 34, this.COLOUR[n.lane], .45);
    };

    /* Live holds first, from `this.live`, since `next` has already passed them. */
    for (let i = 0; i < 4; i++) if (this.live[i]) tail(this.live[i], .95);

    /* Then everything still to come, from the back forward so the nearest is
       on top. */
    for (let i = this.notes.length - 1; i >= this.next; i--) {
      const n = this.notes[i];
      if (n.broke) continue;
      const y = hy - (n.t - a.t) * speed;
      const x = b.x + b.lw * n.lane + 5, w = b.lw - 10;
      if (n.len > 0 && !n.live) tail(n, .5);
      if (n.done) continue;
      if (y < top - nh || y > hy + nh) continue;
      p.glow(g, x + w / 2, y, 28, this.COLOUR[n.lane], .26);
      p.box(g, x, y - nh / 2, w, nh, 6, this.COLOUR[n.lane]);
      g.save(); g.globalAlpha = .55;
      p.box(g, x + 3, y - nh / 2 + 3, w - 6, 4, 2, '#fff');
      g.restore();
    }
    g.restore();

    /* The receptors sit ON the clip edge, so they are drawn after it. Bright
       even at rest: a pad you cannot see is a lane you cannot aim at. */
    const LETTER = ['D', 'F', 'J', 'K'];
    for (let i = 0; i < 4; i++) {
      const x = b.x + b.lw * i + 6, w = b.lw - 12;
      const lit = Math.max(this.flash[i], this.press[i]);
      const dy = this.press[i] * 2;
      if (lit > 0) p.glow(g, x + w / 2, hy + dy, 38, this.COLOUR[i], lit * .6);
      p.box(g, x, hy - 12 + dy, w, 24, 7,
        lit > 0 ? this.COLOUR[i] : 'rgba(255,255,255,.05)', this.COLOUR[i]);
      if (!a.touch) {
        p.say(g, LETTER[i], x + w / 2, hy + 4 + dy, { size: 11, weight: '700',
          font: p.mono, align: 'center', colour: lit > 0 ? p.ink : this.COLOUR[i] });
      }
    }

    /* the caller's patience with all this */
    const bw = Math.min(a.w - 32, 320);
    p.bar(g, (a.w - bw) / 2, 12, bw, 8, this.line / 100,
      this.line > 50 ? p.good : this.line > 22 ? p.hold : p.bad);
    p.say(g, 'THE DRIFTWOOD · SUNSET SET', a.w / 2, 34,
      { size: 9, font: p.mono, colour: this.line > 22 ? p.dim : p.bad, align: 'center' });

    /* the judgement, and the combo under it */
    /* Sized to the field, not written down: at 26px over a 170px landscape
       playfield the word covers the notes it is describing. */
    const field = hy - top, mid = top + field * .42;
    const js = clamp(field * .07, 14, 26);
    if (this.judge) {
      const k = clamp(1 - this.judge.t / .7, 0, 1);
      p.say(g, this.judge.s, a.w / 2, mid, {
        size: js + (1 - k) * 6, weight: '700', colour: this.judge.c, align: 'center', alpha: k
      });
    }
    if (this.combo >= 5) {
      p.say(g, this.combo, a.w / 2, mid + js * 1.7, {
        size: js * 1.3, weight: '700', font: p.mono, colour: 'rgba(255,255,255,.16)', align: 'center'
      });
    }
  },

  reward(a, r) {
    const share = clamp(r.score / this.par, 0, 1.4);
    if (!r.win) {
      return { xp: Math.round(18 * share), energy: -6,
        toast: 'The beat got away from you. Luca takes over, graciously.' };
    }
    /* Named literally so the editor's reward check can see it. */
    Ach.get('a_holdmusic');
    if (share >= 1 && Arcade.clearedAll()) Ach.get('a_arcade');
    return {
      xp: 40 + Math.round(70 * share),
      money: Math.round(share * 240) / 100,
      patience: 6, energy: -8,
      toast: 'The whole deck is dancing. Somebody is crying happily. Luca is impressed.'
    };
  }
};
