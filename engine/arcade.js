'use strict';
/* ---------------- Arcade: the minigame library ----------------

   Three games ship with it and none of them knows about the others, about the
   office, or about how it gets onto the screen. That is the whole point: this
   file is the HOST, `minigames/*.js` are the GUESTS, and everything a guest
   needs from the game — a canvas, a clock, an input stream, a score, somewhere
   to put the reward — arrives through one object it is handed. A fourth game is
   a new file and two lines here; it is not a change to the engine.

   ---- THE CONTRACT ----

   A minigame is a plain object with an `id` and a `name`. Every other field is
   optional and this file has a default for it, which is what makes the shortest
   possible game about fifteen lines long.

     id, name       what it is called. `id` keys the high score in G.arcade.
     icon           one emoji: the badge, the toast, the card.
     blurb, goal    two lines of prose for the card in front of the game.
     help           { keys: [...], taps: [...] } — BOTH wordings, because touch
                    and keyboard are both first-class here and any new
                    instruction text needs both (see CLAUDE.md, Conventions).
     pads           [{ code, label }] — the on-screen buttons the host puts up
                    for a coarse pointer. They are delivered to input() as the
                    key they name, so a game is written once against key codes
                    and gets a thumb for free.
     mins           minutes of the shift a round costs. The clock is stopped
                    while you play; this is what having played cost you.
     par            the score a good round reaches. The payout is scaled to it,
                    so a game tunes its own reward by saying how hard it is.
     start(a)       begin a round. Reset EVERYTHING — this is called again for
                    "go again" and must not carry state across.
     update(a, dt)  advance. dt is seconds, clamped by the main loop.
     draw(a, g)     paint. `g` is already scaled for the display, so draw in CSS
                    pixels inside a.w × a.h and never think about the ratio.
     input(a, ev)   every press: { kind:'key'|'point', code, down, x, y }.
     hud(a)         -> { l, r }: two short strings for the bar above the canvas.
     summary(a)     -> [[label, value], …] for the card AFTER a round. A score
                    on its own is the one thing a player can learn nothing from,
                    and all three of these already knew their own accuracy,
                    streak or turns against par and were not showing it.
     reward(a, r)   -> { xp, money, rep, patience, energy, toast } for a
                    finished round, `r` being { win, score }.
     stop(a)        let go of anything held. Optional.

   ---- WHAT THE GAME GETS BACK, on `a` ----

     w, h           the canvas, in CSS pixels. Re-measured on every resize.
     skill          0-3: the rank the player has in the skill THIS CABINET
                    declares. A game spends it on something felt — a wider
                    window, a longer read, one more cable already bolted. It is
                    handed over rather than looked up, so a minigame still
                    never touches Sk, P or G.
     t              seconds since THIS round started.
     score, best    this round, and the best ever recorded for this game.
     touch          coarse pointer, so a game can word its own on-canvas text.
     add(n)         add to the score.
     held(code)     is that key down right now.
     end(res)       finish the round: { win, note }.
     shake(n)       screen shake, honouring the reduced-motion setting.
     burst/pop      particles and rising text, drawn by the host over the game.
     sfx            a small sound palette, wired through to Sfx — plus `tone`,
                    which is the one deliberate hole in "named sounds only",
                    because in a game about music the pitch IS the content.
     paint          the colours, fonts and drawing helpers all three games
                    share, so the library reads as one system rather than as
                    three demos that happen to be in the same folder.

   ---- WHY REGISTRATION IS BY HAND ----

   A classic script's top-level `const` goes to the global lexical scope, which
   cannot be enumerated at all — `window.MG_HOLD` is undefined while bare
   `MG_HOLD` works. So there is no crawl available even in principle, and a
   declared list is honest about what has been looked at; editor/writing.js
   declares its roots for exactly the same reason. catalogue() names the three
   with `typeof` guards, so a copy of the game opened without minigames/ is a
   game with no arcade in it rather than a page that fails to boot — the same
   arrangement atlasSheets() has with the sprite manifest.

   Nothing here runs until somebody presses a button. The only cost of the
   library to a shift that never opens it is one const. */

const Arcade = {
  games: {}, order: [], on: false, cur: null, api: null,
  /* Which CABINET is being played — the row in data/items.js that says where
     this game is installed and what it is wired into. Null when a game is
     opened directly, which is what the suite does and what a fourth game does
     before anybody has installed it anywhere. */
  cab: null,
  /* 'idle' before anything is open, then 'intro' (the card in front of the
     game), 'play', and 'over' (the card after it). The phase is what makes
     finish() idempotent, which is the bug Combat.end() shipped with once:
     called twice, it paid out twice. */
  phase: 'idle',
  keysDown: null, shakeAmt: 0, parts: [], floats: [],
  dpr: 1, g: null, canvas: null, _bound: false,
  /* pointerId -> the pad code that pointer is holding. See mount(). */
  _padDown: Object.create(null),

  /* ---- the palette and the six helpers every game draws with ---- */
  paint: {
    /* Canvas does not resolve var(), and silently keeps the last font it could
       parse — so these are literal shorthand, like the engine's own. */
    ui: '"Trebuchet MS","Segoe UI",Tahoma,sans-serif',
    mono: 'ui-monospace,"Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace',
    ink: '#0d1117', ink2: '#151b25', panel: '#1b2230', panel2: '#222b3b',
    line: '#33405a', text: '#dfe6f2', dim: '#8d9bb5', brand: '#4da3ff',
    hold: '#ffb347', good: '#5ad48a', bad: '#ff5f56', purple: '#b48cff',
    box(g, x, y, w, h, r, fill, stroke) {
      g.beginPath(); g.roundRect(x, y, w, h, r === undefined ? 8 : r);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    },
    say(g, s, x, y, o) {
      o = o || {};
      g.font = (o.weight || '') + ' ' + (o.size || 14) + 'px ' + (o.font || this.ui);
      g.fillStyle = o.colour || this.text;
      g.textAlign = o.align || 'left';
      g.textBaseline = o.base || 'alphabetic';
      if (o.alpha !== undefined) { g.save(); g.globalAlpha = o.alpha; }
      g.fillText(s, x, y);
      if (o.alpha !== undefined) g.restore();
    },
    /* Shrink until it fits rather than letting it run off the card. Every one
       of these games has a phone-width box with a sentence in it. */
    fit(g, s, max, size, o) {
      o = o || {};
      let px = size;
      for (; px > 8; px--) {
        g.font = (o.weight || '') + ' ' + px + 'px ' + (o.font || this.ui);
        if (g.measureText(s).width <= max) break;
      }
      return px;
    },
    glow(g, x, y, r, colour, alpha) {
      const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
      grd.addColorStop(0, colour); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.globalAlpha = alpha === undefined ? .5 : alpha;
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.284); g.fill(); g.restore();
    },
    bar(g, x, y, w, h, pct, colour) {
      this.box(g, x, y, w, h, h / 2, 'rgba(0,0,0,.35)', this.line);
      const p = clamp(pct, 0, 1);
      if (p > 0) this.box(g, x + 1, y + 1, Math.max(h - 2, (w - 2) * p), h - 2, (h - 2) / 2, colour);
    }
  },

  /* ---- the catalogue ---- */
  /* Declared, not crawled — see the header. `typeof` rather than a try/catch
     because a bare name that was never declared is a ReferenceError at parse
     of the expression, and this has to survive a copy of the game with no
     minigames/ folder in it. */
  catalogue() {
    const out = [];
    if (typeof MG_HOLD !== 'undefined') out.push(MG_HOLD);
    if (typeof MG_INBOX !== 'undefined') out.push(MG_INBOX);
    if (typeof MG_PATCH !== 'undefined') out.push(MG_PATCH);
    return out;
  },
  register(def) {
    if (!def || !def.id || !def.name) return false;
    if (!this.games[def.id]) this.order.push(def.id);
    this.games[def.id] = def;
    return true;
  },
  init() {
    this.catalogue().forEach(g => this.register(g));
    this.keysDown = Object.create(null);
    return this.order.length;
  },

  /* ---- the cabinets ----
     Where the games are installed. A table rather than four hand-written
     dialogue choices, because a binding written in code is one the editor can
     describe and never change — and being able to put a game on an object,
     take it off again and say what it is wired into is the whole point of
     having a library rather than three special cases.

     `typeof` guarded like everything else here: a copy of the page without
     data/items.js has an arcade with no cabinets rather than a boot error. */
  wiring() { return typeof CABINETS !== 'undefined' && Array.isArray(CABINETS) ? CABINETS : []; },
  /* Every cabinet on one object, gates applied. `need` is a G.flag, so a game
     can be installed on something before the player is allowed to see it. */
  cabinets(use) {
    return this.wiring().filter(c => c.use === use && this.has(c.game)
      && (!c.need || G.flags[c.need]));
  },
  cabinet(game, use) {
    return this.wiring().filter(c => c.game === game && (use === undefined || c.use === use))[0] || null;
  },
  /* The rank the player has in a cabinet's skill, which is the one number a
     game is given about the person playing it. Flattened out of SKILLS'
     branches, because a skill id is unique across all four. */
  rankOf(c) {
    if (!c || !c.skill || typeof Sk === 'undefined') return 0;
    return Sk.rank(c.skill) || 0;
  },
  list() { return this.order.slice(); },
  has(id) { return !!this.games[id]; },
  def(id) { return this.games[id] || null; },

  /* ---- the high scores ---- */
  /* G.arcade is plain data, so {...G} in Save.write carries it and resetRun
     clears it — the two halves of every other run-scoped field in this game. */
  bag() {
    if (!G.arcade) G.arcade = { best: {}, won: {}, played: 0 };
    if (!G.arcade.best) G.arcade.best = {};
    if (!G.arcade.won) G.arcade.won = {};
    return G.arcade;
  },
  best(id) { return this.bag().best[id] || 0; },
  won(id) { return !!this.bag().won[id]; },
  /* Every game cleared at least once. The one thing no single game can know. */
  clearedAll() { return this.order.length > 0 && this.order.every(id => this.won(id)); },

  /* ---- opening and closing ---- */
  open(id, from) {
    const def = this.games[id];
    if (!def) { if (typeof Sfx !== 'undefined') Sfx.deny(); return false; }
    /* Never over a call, and never over an ending. Both are the game proper
       asking for the screen, and a minigame is by definition optional. Refused
       BEFORE anything is written down: an open that does not happen must leave
       no state behind it. Five o'clock is no longer on this list, because five
       o'clock no longer asks for the screen — see Report.post(). */
    if (Combat.E || G.state === 'ending') { Sfx.deny(); return false; }
    /* The cabinet it is being played FROM. Passed in by the reply that offered
       it, and looked up otherwise — so opening a game by id alone still gets
       whatever it is wired into rather than nothing. */
    this.cab = from || this.cabinet(id);
    Dialogue.close(); Panels.close();
    this.cur = def; this.on = true;
    G.state = 'arcade';
    this.mount();
    $('#arcade').classList.add('on');
    this.resize();
    this.reset();
    this.phase = 'intro';
    this.chrome();
    /* Again, after the chrome: the pads are built from what the game declared,
       and a row of pads that appears AFTER the canvas was measured is a canvas
       that thinks it is sixty pixels taller than it is for the whole round. */
    this.resize();
    this.card('intro');
    Sfx.init(); Sfx.select();
    return true;
  },
  close() {
    if (!this.on) return;
    this.letGo();
    if (this.phase === 'play') this.finish({ win: false, note: say('arcade.quit') });
    if (this.cur && this.cur.stop) { try { this.cur.stop(this.api); } catch (e) { console.error(e); } }
    this.on = false; this.cur = null; this.cab = null; this.phase = 'idle';
    this.parts.length = 0; this.floats.length = 0; this.shakeAmt = 0;
    const el = $('#arcade'); if (el) el.classList.remove('on');
    /* Never leave the world in a state nothing plays in — and never take one
       back off something that claimed it while the round was running. A call
       and an ending both own G.state, so only an arcade that still holds it is
       handed back. (Five o'clock used to be on that list. It is a notification
       now and owns nothing; see Report.post().) */
    if (G.state === 'arcade') G.state = 'play';
    Game.last = performance.now();     /* don't fast-forward the office on the way out */
  },

  /* Nothing is held any more. Called on the way out and at the start of every
     round: a key still down when a round ends is a key the next round starts
     with, and a game that asks a.held() would begin mid-press. */
  letGo() {
    for (const k in this.keysDown) delete this.keysDown[k];
    for (const id in this._padDown) delete this._padDown[id];
    const pads = $('#mgPads');
    if (pads) pads.querySelectorAll('button.down').forEach(b => b.classList.remove('down'));
  },

  /* ---- the DOM, found once ---- */
  mount() {
    if (this.canvas) return;
    this.canvas = $('#mgView');
    if (!this.canvas) return;
    this.g = this.canvas.getContext('2d');
    if (this._bound) return;
    this._bound = true;
    const pt = (e, down) => {
      const r = this.canvas.getBoundingClientRect();
      this.point({ kind: 'point', down: down, code: 'Pointer',
        x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId });
    };
    /* pointerdown rather than click, like every other button in this game: a
       tap should not wait out the 300ms it takes to rule out a double-tap. The
       move and up are on the window because a thumb slides off a canvas. */
    this.canvas.addEventListener('pointerdown', e => {
      if (!this.on) return;
      e.preventDefault(); Sfx.init();
      this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
      pt(e, true);
    });
    addEventListener('pointermove', e => { if (this.on && this.phase === 'play') pt(e, null); });
    addEventListener('pointerup', e => { if (this.on) pt(e, false); });
    addEventListener('resize', () => { if (this.on) this.resize(); });
    $('#mgQuit').addEventListener('click', () => this.close());
    /* The pads are the touch half of the key contract: a pad press IS the key
       press, so a game never learns that a thumb exists.

       Tracked PER POINTER, which is not a nicety. A single held code meant the
       second of two fingers overwrote the first, and the first pad's key-up was
       then never delivered at all — so a.held() reported it down for the rest
       of the round. Nothing noticed while every game was taps; the first note
       you have to hold makes it the whole game. */
    const pads = $('#mgPads');
    pads.addEventListener('pointerdown', e => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); Sfx.init();
      /* Captured, so a thumb that slides off the button still reports its
         release to the element that started the press. */
      if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (_) { /* fine */ } }
      this._padDown[e.pointerId] = b.dataset.code;
      b.classList.add('down');
      this.key({ code: b.dataset.code, down: true });
    });
    const padUp = e => {
      const code = this._padDown[e.pointerId];
      if (code === undefined) return;
      delete this._padDown[e.pointerId];
      /* Only the buttons no OTHER finger is still on. */
      const still = Object.keys(this._padDown).map(k => this._padDown[k]);
      pads.querySelectorAll('button.down').forEach(b => {
        if (still.indexOf(b.dataset.code) < 0) b.classList.remove('down');
      });
      this.key({ code: code, down: false });
    };
    addEventListener('pointerup', padUp);
    addEventListener('pointercancel', padUp);
    $('#mgCard').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'play') this.play();
      else if (b.dataset.act === 'leave') this.close();
    });
  },

  resize() {
    if (!this.canvas) return;
    const box = this.canvas.parentElement.getBoundingClientRect();
    /* Its own ratio, deliberately not R.dpr: R.resize() sizes the world canvas
       from that field and a value left over from somewhere else grows it on
       every resize until the tab falls over. */
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(120, Math.round(box.width)), h = Math.max(120, Math.round(box.height));
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.api) { this.api.w = w; this.api.h = h; }
    if (this.on && this.cur && this.cur.resized) { try { this.cur.resized(this.api); } catch (e) { console.error(e); } }
  },

  /* ---- the api handed to a game ---- */
  makeApi() {
    const A = this;
    const box = this.canvas ? this.canvas.getBoundingClientRect() : { width: 320, height: 320 };
    return {
      w: Math.round(box.width) || 320, h: Math.round(box.height) || 320,
      t: 0, dt: 0, score: 0, best: 0, win: false, note: '',
      touch: TOUCH, paint: this.paint,
      /* Handed over rather than looked up. Set again in reset(), because a
         skill can be bought between one round and the next. */
      skill: this.rankOf(this.cab),
      add(n) { this.score = Math.max(0, this.score + n); return this.score; },
      held(code) { return !!A.keysDown[code]; },
      end(res) { A.finish(res || {}); },
      shake(n) { if (FX.motion) A.shakeAmt = Math.min(16, A.shakeAmt + n); },
      burst(x, y, colour, n, spread) {
        if (!FX.motion) return;
        for (let i = 0; i < (n || 10); i++) {
          const a = rnd(0, 6.284), s = rnd(40, spread || 190);
          A.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
            life: rnd(.35, .85), t: 0, c: colour, r: rnd(1.5, 3.5) });
        }
      },
      pop(x, y, text, colour) { A.floats.push({ x: x, y: y, text: text, c: colour || '#fff', t: 0, life: .85 }); },
      /* Deliberately a handful of named sounds rather than a synthesiser: a
         game asking for 740Hz is a game that sounds like nothing else in this
         building. `tone` is the one hole in that and it is on purpose: a rhythm
         game about hold music in which every note is the same four blips is a
         rhythm game with no music in it. Anything reaching for it should be
         able to say why none of the names below will do. */
      sfx: {
        tone(freq, dur, type, vol, delay) {
          Sfx.tone(freq, dur === undefined ? .12 : dur, type || 'triangle',
            vol === undefined ? .2 : vol, delay || 0);
        },
        good() { Sfx.tone(880, .06, 'triangle', .24); Sfx.tone(1175, .08, 'triangle', .18, .045); },
        bad() { Sfx.tone(180, .16, 'sawtooth', .22, 0, -50); },
        click() { Sfx.tone(ri(620, 760), .03, 'square', .12); },
        win() { [523, 659, 784, 1047].forEach((f, i) => Sfx.tone(f, .15, 'triangle', .26, i * .08)); },
        lose() { Sfx.tone(320, .22, 'sawtooth', .22); Sfx.tone(220, .34, 'sawtooth', .2, .16); }
      }
    };
  },

  reset() {
    if (!this.api) this.api = this.makeApi();
    const a = this.api;
    a.t = 0; a.dt = 0; a.score = 0; a.win = false; a.note = '';
    a.best = this.best(this.cur.id);
    a.skill = this.rankOf(this.cab);
    this.parts.length = 0; this.floats.length = 0; this.shakeAmt = 0;
    this._paid = false;
    this.letGo();
    if (this.cur.start) { try { this.cur.start(a); } catch (e) { this.bail(e); } }
  },
  play() {
    if (!this.on) return;
    this.reset();
    this.phase = 'play';
    this.card(null);
    this.chrome();
    this.resize();
    Sfx.init(); Sfx.select();
  },

  /* One round is over. The only place a reward is ever paid, and it refuses to
     do it twice — Combat.end() shipped without that guard once and a second
     call handed out the XP, the money and the reputation all over again. */
  finish(res) {
    if (this.phase !== 'play') return;
    this.phase = 'over';
    this.letGo();
    const a = this.api, def = this.cur;
    a.win = !!res.win;
    a.note = res.note || '';
    if (typeof res.score === 'number') a.score = res.score;
    a.score = Math.max(0, Math.round(a.score));
    const bag = this.bag();
    a.newBest = a.score > this.best(def.id);
    if (a.newBest) bag.best[def.id] = a.score;
    a.best = bag.best[def.id] || 0;
    bag.played = (bag.played || 0) + 1;
    const firstWin = a.win && !bag.won[def.id];
    if (a.win) bag.won[def.id] = true;

    let rw = {};
    if (def.reward && !this._paid) {
      try { rw = def.reward(a, { win: a.win, score: a.score }) || {}; } catch (e) { console.error(e); rw = {}; }
    }
    this._paid = true;
    /* The clock is stopped while you play, so a round costs its minutes here,
       once, at the end. Past 17:00 the next tick clocks you off where you sit,
       which is exactly what happens if you spend the end of the shift playing
       games: the queue closes without you and nobody comes to find you. */
    const mins = def.mins || 0;
    if (mins) G.minutes += mins;
    if (rw.xp) Player.xp(rw.xp);
    if (rw.money || rw.rep || rw.patience || rw.energy) {
      Player.mod({ money: rw.money || 0, rep: rw.rep || 0,
        patience: rw.patience || 0, energy: rw.energy || 0 });
    }
    if (rw.toast) UI.toast(def.icon || '🕹️', rw.toast, a.win ? 'gold' : '');
    /* ---- what the CABINET is wired into ----
       The game says what a round was worth; the cabinet says what winning it
       means to the rest of the shift. Both are paid here, in the one place any
       of it is paid, and both only on a win.

       BOTH are first-win only, and the job is the one that matters. Q.step
       advances by one and clamps, so a hook on every win walks the tracker off
       the end of its own job — and an arcade cabinet is the most walk-back-to
       thing in the building. Every job hook in this game is one-way for the
       same reason; this one is no different for being data.

       `firstWin` is read BEFORE the flag above is written, or it is never
       first. */
    if (firstWin && this.cab) {
      if (this.cab.job && typeof Q !== 'undefined') Q.step(this.cab.job);
      if (this.cab.item && typeof Item !== 'undefined') Item.give(this.cab.item);
    }
    if (a.win) { a.sfx.win(); a.burst(a.w / 2, a.h / 2, this.paint.good, 26, 320); }
    else a.sfx.lose();
    UI.hud();
    this.chrome();
    this.card('over');
  },

  /* A game that throws must not take the shift with it. */
  bail(e) {
    console.error(e);
    this.phase = 'over';
    this.card('over');
    UI.toast('🕹️', say('arcade.crash'), 'bad');
  },

  /* ---- input ---- */
  /* Escape and the pads are the host's; everything else is the game's. */
  key(e) {
    if (!this.on) return;
    const code = e.code;
    if (e.down === false) {
      delete this.keysDown[code];
      if (this.cur && this.cur.input && this.phase === 'play') {
        try { this.cur.input(this.api, { kind: 'key', code: code, down: false }); } catch (err) { this.bail(err); }
      }
      return;
    }
    if (code === 'Escape') { this.close(); return; }
    if (this.phase !== 'play') {
      if (code === 'Enter' || code === 'Space') { this.play(); return; }
      return;
    }
    /* A repeat is the key being held, not pressed again: a rhythm game read one
       held key as forty perfect hits. */
    if (this.keysDown[code]) return;
    this.keysDown[code] = 1;
    if (this.cur && this.cur.input) {
      try { this.cur.input(this.api, { kind: 'key', code: code, down: true }); } catch (err) { this.bail(err); }
    }
  },
  point(ev) {
    if (!this.on || this.phase !== 'play') return;
    if (this.cur && this.cur.input) {
      try { this.cur.input(this.api, ev); } catch (err) { this.bail(err); }
    }
  },

  /* ---- the frame ----
     Driven by Game.tick rather than a requestAnimationFrame of its own, so the
     page keeps ONE loop: the same dt, the same clamp, the same pause when the
     tab goes away. */
  frame(dt) {
    if (!this.on || !this.cur) return;
    const a = this.api;
    if (this.phase === 'play') {
      a.dt = dt; a.t += dt;
      if (this.cur.update) { try { this.cur.update(a, dt); } catch (e) { this.bail(e); } }
      if (this.cur.hud) this.hudLine();
    }
    this.shakeAmt *= Math.pow(.02, dt);
    if (this.shakeAmt < .2) this.shakeAmt = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
      if (p.t > p.life) this.parts.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t += dt; f.y -= 40 * dt;
      if (f.t > f.life) this.floats.splice(i, 1);
    }
    this.render();
  },
  render() {
    const g = this.g, a = this.api;
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, a.w, a.h);
    g.fillStyle = this.paint.ink; g.fillRect(0, 0, a.w, a.h);
    g.save();
    if (this.shakeAmt) g.translate(rnd(-this.shakeAmt, this.shakeAmt), rnd(-this.shakeAmt, this.shakeAmt));
    if (this.cur.draw) { try { this.cur.draw(a, g); } catch (e) { this.bail(e); g.restore(); return; } }
    for (const p of this.parts) {
      g.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
      g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.284); g.fill();
    }
    g.globalAlpha = 1;
    for (const f of this.floats) {
      const k = clamp(1 - f.t / f.life, 0, 1);
      this.paint.say(g, f.text, f.x, f.y, { size: 15, weight: '700', colour: f.c, align: 'center', alpha: k });
    }
    g.restore();
  },

  /* ---- the chrome around the canvas ---- */
  chrome() {
    const def = this.cur; if (!def) return;
    $('#mgTitle').textContent = (def.icon ? def.icon + ' ' : '') + def.name;
    $('#mgBadge').textContent = this.phase === 'play' ? 'PLAYING'
      : this.phase === 'over' ? (this.api.win ? 'CLEARED' : 'OVER') : 'ARCADE';
    const pads = $('#mgPads');
    pads.innerHTML = '';
    (def.pads || []).forEach(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.code = p.code; b.textContent = p.label;
      b.setAttribute('aria-label', p.aria || p.label);
      pads.appendChild(b);
    });
    pads.classList.toggle('none', !(def.pads || []).length);
    const help = def.help || {};
    const lines = (TOUCH ? help.taps : help.keys) || [];
    $('#mgHint').innerHTML = lines.map(esc).join(' · ');
    this.hudLine();
  },
  hudLine() {
    const def = this.cur; if (!def) return;
    let h = { l: '', r: '' };
    if (def.hud) { try { h = def.hud(this.api) || h; } catch (e) { console.error(e); } }
    const l = $('#mgHudL'), r = $('#mgHudR');
    if (l && l.textContent !== (h.l || '')) l.textContent = h.l || '';
    const right = h.r !== undefined ? h.r : ('SCORE ' + this.api.score);
    if (r && r.textContent !== right) r.textContent = right;
  },

  /* The card in front of the game, before and after. Both are the same shape on
     purpose: a name, a line about it, what it wants from you, and one button
     that is obviously the one to press. */
  card(which) {
    const el = $('#mgCard'), def = this.cur;
    if (!el || !def) return;
    if (!which) { el.classList.remove('on'); el.innerHTML = ''; return; }
    const a = this.api;
    const help = def.help || {};
    const lines = (TOUCH ? help.taps : help.keys) || [];
    let h = '';
    if (which === 'intro') {
      h += '<div class="mg-k">' + esc(def.icon || '🕹️') + '</div>';
      h += '<h3>' + esc(def.name) + '</h3>';
      if (def.blurb) h += '<p class="mg-blurb">' + esc(def.blurb) + '</p>';
      if (def.goal) h += '<p class="mg-goal">' + esc(def.goal) + '</p>';
      if (lines.length) h += '<ul class="mg-help">' + lines.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>';
      const bits = [];
      if (this.best(def.id)) bits.push('Best ' + this.best(def.id));
      if (this.won(def.id)) bits.push('Cleared');
      if (def.mins) bits.push(say('arcade.mins', { n: def.mins }));
      if (bits.length) h += '<p class="mg-meta">' + esc(bits.join(' · ')) + '</p>';
      h += '<div class="mg-btns"><button class="btn primary" data-act="play">Play</button>'
        + '<button class="btn" data-act="leave">Not now</button></div>';
    } else {
      h += '<div class="mg-k">' + (a.win ? '🏆' : '💤') + '</div>';
      h += '<h3>' + esc(say(a.win ? 'arcade.won' : 'arcade.lost')) + '</h3>';
      if (a.note) h += '<p class="mg-blurb">' + esc(a.note) + '</p>';
      h += '<p class="mg-score">' + a.score + '<small>' + esc(a.newBest ? 'a personal best'
        : 'best ' + this.best(def.id)) + '</small></p>';
      /* How it went, not only what it came to. */
      let rows = [];
      if (def.summary) { try { rows = def.summary(a) || []; } catch (e) { console.error(e); } }
      if (rows.length) {
        h += '<dl class="mg-sum">' + rows.map(r =>
          '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl>';
      }
      h += '<div class="mg-btns"><button class="btn primary" data-act="play">Go again</button>'
        + '<button class="btn" data-act="leave">' + esc(say('arcade.leave')) + '</button></div>';
    }
    el.innerHTML = h;
    el.classList.add('on');
    /* The keyboard needs somewhere to be, and the modal's focus trap needs the
       first thing in it to be worth landing on. */
    const first = el.querySelector('button');
    if (first) setTimeout(() => { if (this.on) first.focus(); }, 30);
  }
};
