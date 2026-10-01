'use strict';
/* ---------------- Gamepads ----------------
   A controller is treated as a keyboard that happens to have sticks. Buttons
   press the keys the game already listens for (synthetic KeyboardEvents, so
   every screen keeps its one set of rules); the left stick walks with the
   phone stick's analogue feel and steers the car; the right stick aims; and
   over a panel, the console or a serve, the d-pad moves focus from button to
   button and A presses it. Standard mapping only — which is every pad a
   browser recognises.

     A      interact · talk · choose · press        B      back · close
     X      jump · dive · carry on talking           Y      the map
     LB     eat something                            RB     run (held)
     LT     take it out · put it away                Start  the menu
     Back   your jobs                                LB/RB in a panel: the sections */
const Pad = {
  on: false,          /* the left stick is pushed, in play */
  drive: null,        /* the same stick behind a wheel: { x, y } */
  x: 0, y: 0,         /* its vector, dead zone taken out, length 0..1 */
  used: false,        /* a pad has been touched this session: the prompts say A */
  DEAD: .24,
  _prev: {}, _rep: {}, _held: {},

  init() {
    if (!navigator.getGamepads) return;
    addEventListener('gamepadconnected', e => {
      if (e.gamepad && e.gamepad.mapping !== 'standard') return;
      UI.toast('🎮', say('pad.on'), 'tip');
    });
    addEventListener('gamepaddisconnected', () => { this.release(); });
    const loop = () => { try { this.poll(); } catch (err) { console.warn(err); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  },

  /* The first standard pad with anything to say. */
  pad() {
    const all = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of all) if (g && g.connected && g.mapping === 'standard') return g;
    return null;
  },

  key(code, down) {
    dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
  },
  tap(code) { this.key(code, true); this.key(code, false); },

  /* The overlay that owns the screen, if it is one made of buttons. */
  modal() {
    return Panels.on ? $('#panel')
      : Comms.on ? $('#inbox')
      : Combat.E ? $('#combat')
      : G.state === 'ending' ? $('#ending')
      : null;
  },

  /* Spatial focus: the nearest button in the direction pressed. */
  nav(dir) {
    const m = this.modal(); if (!m) return false;
    const els = Array.from(m.querySelectorAll('button:not([disabled]),[tabindex="0"],input,select'))
      .filter(el => el.offsetWidth || el.offsetHeight);
    if (!els.length) return true;
    document.body.classList.add('pad-nav');
    const cur = els.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { els[0].focus(); return true; }
    const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    const [ux, uy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dx * ux + dy * uy, across = Math.abs(dx * uy) + Math.abs(dy * ux);
      if (along <= 2) continue;
      const score = along + across * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) { best.focus(); if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); Sfx.blip(); }
    return true;
  },

  /* A on a screen of buttons presses the focused one; otherwise it is Enter. */
  press() {
    const m = this.modal(), f = document.activeElement;
    if (m && f && m.contains(f) && f !== document.body) { f.click(); return; }
    /* A serve with nothing focused yet: start on the first move. */
    if (Combat.E) { const b = $('#cbMoves button:not([disabled])'); if (b) { document.body.classList.add('pad-nav'); b.focus(); } return; }
    this.tap('Enter');
  },

  /* Panels: the previous or next section. */
  section(d) {
    /* The sidebar's order; on a phone the launcher counts as the first. */
    const list = (Panels.narrow() ? [{ id: 'home' }] : []).concat(TABS);
    const i = list.findIndex(t => t.id === Panels.tab);
    const t = list[((i < 0 ? 0 : i) + d + list.length) % list.length];
    if (t) Panels.go(t.id);
  },

  release() {
    this.on = false; this.x = this.y = 0;
    for (const code in this._held) if (this._held[code]) this.key(code, false);
    this._held = {};
    Aimer.up = Aimer.down = Aimer.left = Aimer.right = 0;
  },
  /* A key held for as long as the button is. */
  hold(code, on) {
    if (!!this._held[code] === on) return;
    this._held[code] = on;
    this.key(code, on);
  },
  /* Edge-triggered with auto-repeat, for moving through menus with a stick. */
  repeat(name, on, fn) {
    const t = performance.now();
    if (!on) { this._rep[name] = 0; return; }
    if (!this._rep[name]) { this._rep[name] = t + 380; fn(); }
    else if (t >= this._rep[name]) { this._rep[name] = t + 120; fn(); }
  },

  poll() {
    const g = this.pad();
    if (!g) { if (this.on || Object.keys(this._held).length) this.release(); return; }
    const b = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > .5));
    const was = this._prev, now = {};
    for (let i = 0; i < g.buttons.length; i++) now[i] = b(i);
    const down = i => now[i] && !was[i];
    this._prev = now;
    if (Object.values(now).some(Boolean)) this.used = true;

    /* Sticks, dead zone removed and rescaled so a light push is a slow walk. */
    const stick = (ax, ay) => {
      let x = g.axes[ax] || 0, y = g.axes[ay] || 0;
      const m = Math.hypot(x, y);
      if (m < this.DEAD) return [0, 0];
      const k = Math.min(1, (m - this.DEAD) / (1 - this.DEAD)) / m;
      return [x * k, y * k];
    };
    const [lx, ly] = stick(0, 1), [rx, ry] = stick(2, 3);
    if (lx || ly || rx || ry) this.used = true;

    const modal = this.modal();
    const play = G.state === 'play' && !modal && !Arcade.on;

    /* The d-pad and, off the world, the left stick: one set of four directions. */
    const dirs = {
      up: now[12] || (!play && ly < -.6), down: now[13] || (!play && ly > .6),
      left: now[14] || (!play && lx < -.6), right: now[15] || (!play && lx > .6)
    };
    const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    for (const d in dirs) {
      if (modal) { this.hold(ARROW[d], false); this.repeat(d, dirs[d], () => this.nav(d)); }
      else if (Dialogue.on || G.state === 'title' || Comms.on) { this.hold(ARROW[d], false); this.repeat(d, dirs[d], () => this.tap(ARROW[d])); }
      /* In play and in the arcade the d-pad is the arrow keys, held. */
      else this.hold(ARROW[d], !!dirs[d] && (now[12 + ['up', 'down', 'left', 'right'].indexOf(d)] || Arcade.on));
    }

    /* Walking: analogue, in play only. Driving reads the same stick (Cars.drive). */
    this.on = play && !Cars.driving && !!(lx || ly);
    this.x = this.on ? lx : 0; this.y = this.on ? ly : 0;
    this.drive = play && Cars.driving && (lx || ly) ? { x: lx, y: ly } : null;

    /* The right stick aims while something is out (the arrows' job on a keyboard). */
    if (play && Guns.armed) {
      Aimer.left = rx < -.4 ? 1 : 0; Aimer.right = rx > .4 ? 1 : 0;
      Aimer.up = ry < -.4 ? 1 : 0; Aimer.down = ry > .4 ? 1 : 0;
    }

    /* Run, held. */
    this.hold('ShiftLeft', play && now[5]);

    if (down(0)) this.press();                                   /* A */
    if (down(1)) { if (!play) this.tap('Escape'); }              /* B */
    if (down(2)) this.tap('Space');                              /* X */
    if (down(3)) this.tap('KeyN');                               /* Y */
    if (down(9)) this.tap('Escape');                             /* Start */
    if (down(8)) this.tap('KeyJ');                               /* Back */
    if (Panels.on) { if (down(4)) this.section(-1); if (down(5)) this.section(1); }
    else {
      if (down(4) && play) this.tap('KeyF');                     /* LB: eat */
      if (down(6) && play) this.tap('KeyG');                     /* LT: take it out */
    }
  }
};

/* A mouse or a key puts the focus rings back to the browser's own rules. */
addEventListener('pointerdown', () => document.body.classList.remove('pad-nav'), true);
