'use strict';
/* ---------------- Arcade: the minigame host ----------------
   The host hands each game (minigames/*.js) one object with everything it
   needs: a canvas, a clock, input, a score and somewhere to put the reward.
   No game knows about another, or about the rest of the game.

   A minigame is a plain object with `id` and `name`; everything else has a default.
     id, name       `id` keys the high score in G.arcade
     icon           one emoji: the badge, the toast, the card
     blurb, goal    two lines for the card in front of the game
     help           { keys: [...], taps: [...] }: both wordings, always
     pads           [{ code, label }]: on-screen buttons, delivered as those keys
     mins           game minutes a round costs (the clock stops while you play)
     par            a good round's score; the payout scales to it
     start(a)       begin a round; reset everything, it is called again for "go again"
     update(a, dt)  advance; dt in seconds
     draw(a, g)     paint in CSS pixels inside a.w × a.h; `g` is already scaled
     input(a, ev)   every press: { kind: 'key'|'point', code, down, x, y }
     hud(a)         -> { l, r }: two short strings over the canvas
     summary(a)     -> [[label, value], …] for the card after a round
     reward(a, r)   -> { xp, money, rep, patience, energy, toast } for r = { win, score }
     stop(a)        let go of anything held

   On `a` the game gets:
     w, h           the canvas in CSS pixels, re-measured on resize
     skill          0-3: the rank in the skill this cabinet names
     t              seconds since the round started
     score, best    this round, and the best ever
     touch          coarse pointer, for the game's own wording
     add(n), held(code), end({ win, note })
     shake(n)       screen shake, honouring reduced motion
     burst/pop      particles and rising text, drawn by the host
     sfx            named sounds, plus `tone` for games where pitch is content
     paint          the shared colours, fonts and drawing helpers

   Games are registered by name in catalogue(): a classic script's globals
   cannot be enumerated. */

const Arcade = {
  games: {}, order: [], on: false, cur: null, api: null,
  /* The CABINETS row being played; null when a game is opened directly. */
  cab: null,
  /* 'idle', 'intro', 'play', 'over'. It makes finish() pay once. */
  phase: 'idle',
  keysDown: null, shakeAmt: 0, parts: [], floats: [],
  dpr: 1, g: null, canvas: null, _bound: false,
  /* pointerId -> the pad code it holds. */
  _padDown: Object.create(null),

  /* ---- the palette and helpers every game draws with ---- */
  paint: {
    /* Literal shorthand: canvas does not resolve var(). */
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
    /* Shrunk to fit rather than run off the card. */
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
  catalogue() { return [MG_HOLD, MG_INBOX, MG_PATCH]; },
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
     Where each game is installed (CABINETS in data/items.js) and what it is
     wired into: data, so the editor can change it. */
  wiring() { return CABINETS; },
  /* Every cabinet on one object; `need` is a G.flag that gates it. */
  cabinets(use) {
    return this.wiring().filter(c => c.use === use && this.has(c.game)
      && (!c.need || G.flags[c.need]));
  },
  cabinet(game, use) {
    return this.wiring().filter(c => c.game === game && (use === undefined || c.use === use))[0] || null;
  },
  /* The player's rank in the cabinet's skill, the one thing a game is told about them. */
  rankOf(c) {
    if (!c || !c.skill) return 0;
    return Sk.rank(c.skill) || 0;
  },
  list() { return this.order.slice(); },
  has(id) { return !!this.games[id]; },
  def(id) { return this.games[id] || null; },

  /* ---- high scores, in G.arcade ---- */
  bag() {
    if (!G.arcade) G.arcade = { best: {}, won: {}, played: 0 };
    if (!G.arcade.best) G.arcade.best = {};
    if (!G.arcade.won) G.arcade.won = {};
    return G.arcade;
  },
  best(id) { return this.bag().best[id] || 0; },
  won(id) { return !!this.bag().won[id]; },
  /* Every game cleared at least once. */
  clearedAll() { return this.order.length > 0 && this.order.every(id => this.won(id)); },

  /* ---- opening and closing ---- */
  open(id, from) {
    const def = this.games[id];
    if (!def) { Sfx.deny(); return false; }
    /* Never over an encounter or an ending, and refused before any state is written. */
    if (Combat.E || G.state === 'ending') { Sfx.deny(); return false; }
    /* The cabinet played from, or the one it is installed in. */
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
    /* Again after the chrome: the pads change the canvas's height. */
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
    /* Hand G.state back only if the arcade still holds it. */
    if (G.state === 'arcade') G.state = 'play';
    Game.last = performance.now();
  },

  /* Nothing held: a key down at the end of a round would start the next mid-press. */
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
    /* pointerdown, so a tap does not wait out the double-tap delay; move and up
       on the window, as a thumb slides off. */
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
    /* A pad press is the key press. Tracked per pointer, or a second finger
       loses the first pad's release and a.held() stays true. */
    const pads = $('#mgPads');
    pads.addEventListener('pointerdown', e => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); Sfx.init();
      /* Captured, so a thumb sliding off still reports its release. */
      if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (_) { } }
      this._padDown[e.pointerId] = b.dataset.code;
      b.classList.add('down');
      this.key({ code: b.dataset.code, down: true });
    });
    const padUp = e => {
      const code = this._padDown[e.pointerId];
      if (code === undefined) return;
      delete this._padDown[e.pointerId];
      /* Release only the buttons no other finger is on. */
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
    /* Its own ratio, not R.dpr, which R.resize() owns. */
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
      /* Handed over, and set again each round: a skill can be bought in between. */
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
      /* Named sounds, so games sound like this game; `tone` for music, where pitch is the content. */
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

  /* One round over: the only place a reward is paid, and only once. */
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
    /* The round's minutes are spent here, once. */
    const mins = def.mins || 0;
    if (mins) G.minutes += mins;
    if (rw.xp) Player.xp(rw.xp);
    if (rw.money || rw.rep || rw.patience || rw.energy) {
      Player.mod({ money: rw.money || 0, rep: rw.rep || 0,
        patience: rw.patience || 0, energy: rw.energy || 0 });
    }
    if (rw.toast) UI.toast(def.icon || '🕹️', rw.toast, a.win ? 'gold' : '');
    /* ---- what the cabinet is wired into ----
       The game says what a round was worth; the cabinet says what winning means:
       a job step, an item, an achievement. Both on the first win only, since
       Q.step() advances and clamps and a cabinet is played again and again. */
    if (firstWin && this.cab) {
      if (this.cab.job) Q.step(this.cab.job);
      if (this.cab.item) Item.give(this.cab.item);
    }
    if (a.win) { a.sfx.win(); a.burst(a.w / 2, a.h / 2, this.paint.good, 26, 320); }
    else a.sfx.lose();
    UI.hud();
    this.chrome();
    this.card('over');
  },

  /* A game that throws must not take the game with it. */
  bail(e) {
    console.error(e);
    this.phase = 'over';
    this.card('over');
    UI.toast('🕹️', say('arcade.crash'), 'bad');
  },

  /* ---- input: Escape and the pads are the host's, the rest the game's ---- */
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
    /* A repeat is the key held, not pressed again. */
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

  /* ---- the frame: driven by Game.tick, so the page keeps one loop ---- */
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

  /* The cards before and after: a name, a line, what it wants, one obvious button. */
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
      /* How it went, not only the score. */
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
    /* Focus the first button, for the keyboard and the focus trap. */
    const first = el.querySelector('button');
    if (first) setTimeout(() => { if (this.on) first.focus(); }, 30);
  }
};
