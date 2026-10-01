'use strict';
/* ---------------- Input ---------------- */
/* Panel shortcuts: the engine's, and each GAME.tabs entry's `key`. */
const PANEL_KEYS = Object.assign({ KeyN: 'map', KeyI: 'inventory', KeyJ: 'quests', KeyK: 'skills', KeyP: 'stats', KeyL: 'ach', KeyT: 'shift', KeyU: 'people' },
  Object.fromEntries((GAME.tabs || []).filter(t => t.key).map(t => [t.key, t.id])));
const Keys = { up: 0, down: 0, left: 0, right: 0, run: 0 };
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
/* The arrows as the right hand while something is out: they aim and fire,
   while WASD keeps walking. Separate from Keys because both are held at once. */
const Aimer = { up: 0, down: 0, left: 0, right: 0 };
const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
/* The pointer in world pixels, updated per move; `seen` once it has moved at all. */
const Mouse = { x: 0, y: 0, down: false, seen: false };

function bindInput() {
  addEventListener('keydown', e => {
    Sfx.init();
    /* Dialogue first: the movement keys double as choice navigation. */
    if (Dialogue.on) {
      if (/^Digit[1-9]$/.test(e.code)) { e.preventDefault(); Dialogue.choose(+e.code.slice(5) - 1); return; }
      if (Dialogue.avail && Dialogue.avail.length) {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); Dialogue.move(-1); return; }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); Dialogue.move(1); return; }
        /* A held key never picks a reply: holding Space to hurry the words along
           would otherwise answer for you the moment they finish. */
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); if (!e.repeat) Dialogue.choose(Dialogue.sel); return; }
      }
      /* E opened the conversation, so E carries it on, as it does on a phone. */
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); if (!(e.repeat && e.code === 'KeyE')) Dialogue.advance(); return; }
      if (e.code === 'Escape') { e.preventDefault(); Dialogue.close(); return; }
      return;
    }
    /* A minigame owns the keyboard outright, Escape included. */
    if (Arcade.on) { e.preventDefault(); Arcade.key({ code: e.code, down: true }); return; }
    /* The title screen: W/S and the arrows walk the menu, Enter picks. */
    if (G.state === 'title') {
      const k = KEYMAP[e.code];
      if (k === 'up' || k === 'left') { e.preventDefault(); Title.move(-1); return; }
      if (k === 'down' || k === 'right') { e.preventDefault(); Title.move(1); return; }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); Title.activate(); return; }
    }
    /* Armed, the arrows aim and fire (Robotron's arrangement); unarmed they walk as ever. */
    if (ARROWS[e.code] && Guns.can() && Guns.armed) {
      Aimer[ARROWS[e.code]] = 1; e.preventDefault(); return;
    }
    if (KEYMAP[e.code]) { Keys[KEYMAP[e.code]] = 1; e.preventDefault(); return; }
    /* Shift runs, held. */
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { Keys.run = 1; return; }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (G.state === 'name') { Boot.acceptName(); return; }
      /* The creator takes Enter/Space as "that will do", outside its selects. */
      if (G.state === 'look') { Boot.goFullscreen(); Look.accept(); return; }
      if (G.state === 'cut') { Cut.press(); return; }
      /* Space jumps (or, in the water, dives); Enter and E interact. */
      if (G.state === 'play') { if (!e.repeat) { if (e.code === 'Space') Moves.jump(); else Interact.go(); } return; }
      return;
    }
    if (G.state === 'combat') {
      if (/^Digit[1-9]$/.test(e.code)) { const b = $('#cbMoves').children[+e.code.slice(5) - 1]; if (b && !b.disabled) b.click(); }
      return;
    }
    if (e.code === 'F5') { e.preventDefault(); Save.write(); return; }
    if (e.code === 'F9') { e.preventDefault(); if (Save.has()) { Save.read(); Panels.close(); } else Sfx.deny(); return; }
    if (e.code === 'Escape') {
      /* Esc skips the opening. */
      if (G.state === 'cut' && Cut.on) { Cut.skip(); return; }
      /* Esc leaves the help page, which borrows the opening's screen. */
      if (G.state === 'cut') { Cut.press(); return; }
      /* Esc closes the comms console first, then the panel, else opens the menu. */
      if (Comms.on) Comms.close();
      else if (Panels.on) Panels.close(); else if (G.state === 'play') Panels.open('settings');
      return;
    }
    if (G.state !== 'play' && !Panels.on && !Comms.on) return;
    /* Not on a held key: the press that ends a conversation must not start the next. */
    if (e.code === 'KeyE') { if (!Panels.on && !e.repeat) Interact.go(); return; }
    /* G takes it out and puts it away; on a phone, letting go of the stick does that. */
    if (e.code === 'KeyG') { if (!Panels.on && Guns.any()) { Guns.toggle(); if (!Guns.armed) Sfx.blip(); } else if (!Panels.on) Sfx.deny(); return; }
    if (e.code === 'KeyF') { if (!Panels.on && !Comms.on && G.state === 'play' && !e.repeat) Item.snack(); return; }
    if (e.code === 'KeyR') { if (!Panels.on && Guns.armed && !Guns.reload()) Sfx.deny(); return; }
    if (e.code === 'KeyQ') { if (!Panels.on && Guns.armed) Guns.next(); return; }
    /* The horn, held while driving. */
    if (e.code === 'KeyH') { if (Cars.driving) Cars.horn = true; return; }
    /* N is the map (M was the post long before there was a map); the other
       channels have their own letters. */
    const chan = { KeyM: 'mail', KeyC: 'chat', KeyV: 'text', KeyB: 'log' };
    if (chan[e.code]) {
      if (Panels.on) Panels.close();
      Comms.toggle(chan[e.code]);
      return;
    }
    if (Comms.on) return;      /* the panel keys do not reach through the console */
    const map = PANEL_KEYS;
    if (map[e.code]) { if (Panels.on && Panels.tab === map[e.code]) Panels.close(); else Panels.open(map[e.code]); }
  });
  /* Keep Tab inside the open modal. */
  addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const modal = Panels.on ? $('#panel')
      : Comms.on ? $('#inbox')
      : Arcade.on ? $('#arcade')
      : Combat.E ? $('#combat')
      : G.state === 'ending' ? $('#ending')
      : Dialogue.on ? $('#dialogue') : null;
    if (!modal) return;
    const f = Array.from(modal.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'))
      .filter(el => el.offsetWidth || el.offsetHeight);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, true);

  addEventListener('keyup', e => {
    /* Releases matter to a minigame's a.held(). */
    if (Arcade.on) { Arcade.key({ code: e.code, down: false }); return; }
    if (e.code === 'KeyH') Cars.horn = false;
    if (ARROWS[e.code]) Aimer[ARROWS[e.code]] = 0;
    if (KEYMAP[e.code]) Keys[KEYMAP[e.code]] = 0;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') Keys.run = 0;
  });
  addEventListener('blur', () => {
    Keys.up = Keys.down = Keys.left = Keys.right = Keys.run = 0;
    Aimer.up = Aimer.down = Aimer.left = Aimer.right = 0;
    Cars.horn = false; Guns.trigger(false); releaseSticks();
  });

  /* Leaving the tab stops the clock, drops held keys and hushes the music. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      /* A phone may never come back to this tab: keep the run as it stands. */
      saveOnLeave();
      Game.paused = true;
      Keys.up = Keys.down = Keys.left = Keys.right = Keys.run = 0;
      Aimer.up = Aimer.down = Aimer.left = Aimer.right = 0;
      Guns.trigger(false);
      releaseSticks();
      Sfx.holdMusic(false);
      if (Sfx.ctx && Sfx.ctx.state === 'running') Sfx.ctx.suspend().catch(() => {});
    } else {
      Game.paused = false;
      Game.last = performance.now();   /* no fast-forward on return */
      if (Sfx.ctx && Sfx.ctx.state === 'suspended') Sfx.ctx.resume().catch(() => {});
      if (Combat.E && Sfx.music) Sfx.holdMusic(true);
    }
  });

  /* Closing the tab or the browser saves too, not only the hourly autosave. */
  addEventListener('pagehide', saveOnLeave);

  $('#keyhints').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    /* The hint row holds panel tabs and comms channels. */
    if (b.dataset.comms) { Panels.close(); return Comms.toggle(b.dataset.comms); }
    Panels.open(b.dataset.panel === 'settings' ? 'settings' : b.dataset.panel);
  });
  /* The minimap opens the map screen. */
  const mmb = $('#minimapBtn');
  if (mmb) mmb.onclick = () => { if (Panels.on && Panels.tab === 'map') Panels.close(); else Panels.open('map'); };
  $('#pnClose').onclick = () => Panels.close();
  $('#pnBack').onclick = () => Panels.go('home');
  /* Turning a phone round can swap the sidebar for the launcher. */
  addEventListener('resize', () => { if (Panels.on) { if (Panels.tab === 'home' && !Panels.narrow()) Panels.tab = 'quests'; Panels.tabs(); Panels.render(); } });
  $('#panel').addEventListener('click', e => { if (e.target.id === 'panel') Panels.close(); });
  $('#endAgain').onclick = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
  $('#endTitle').onclick = () => location.reload();
  $('#dialogue').addEventListener('click', e => { if (!e.target.closest('.choice')) Dialogue.advance(); });

  /* The comms band, rail and console bind their own listeners (engine/comms.js). */
  Comms.bind();

  /* ---- the mouse: the other stick on a desktop ----
     Where it points is the aim and its button the trigger, only while something
     is out. The arrows are asked first, so the two never fight; release is bound
     to the window, as the sticks' is. */
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    Mouse.seen = true;
    const r = R.cv.getBoundingClientRect();
    Mouse.x = Cam.x + (e.clientX - r.left);
    Mouse.y = Cam.y + (e.clientY - r.top);
  }, { passive: true });
  R.cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    if (!Guns.armed || !Guns.can()) return;
    e.preventDefault(); Sfx.init();
    Mouse.down = true;
  });
  addEventListener('pointerup', e => { if (e.pointerType !== 'touch') Mouse.down = false; });
  addEventListener('pointercancel', () => { Mouse.down = false; });
  /* No context menu on the canvas while armed. */
  R.cv.addEventListener('contextmenu', e => { if (Guns.armed) e.preventDefault(); });

  /* touch */
  if (TOUCH) {
    $('#touch').classList.add('on');
    const hint = document.querySelector('.cut-hint');
    if (hint) hint.textContent = 'Tap to continue';
    /* No Esc key on a phone, and no room for the long title. */
    $('#pnClose').textContent = 'Close';

    /* A touch that starts just outside a zone pans the fixed layout, so the
       document cancels touchmove unless a scrollable ancestor could use it.
       Not touch-action:none on body: that also kills the panel's scrolling. */
    const scrollableUnder = el => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.nodeName)) return true;
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
        if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
      }
      return false;
    };
    let dragMayScroll = false;
    addEventListener('touchstart', e => { dragMayScroll = scrollableUnder(e.target); }, { passive: true });
    addEventListener('touchmove', e => {
      /* Two fingers is a pinch; nothing here is worth zooming. */
      if (e.touches.length > 1 || !dragMayScroll) { if (e.cancelable) e.preventDefault(); }
    }, { passive: false });

    /* pointerdown: one listener for touch, mouse and pen, and a release off the
       button still reports. */
    document.querySelectorAll('.dpad button').forEach(b => {
      const d = b.dataset.dir;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); Sfx.init(); Keys[d] = 1;
        /* Keep this finger's move and up wherever it wanders. */
        if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (_) { /* stale pointer */ } }
      });
      const off = e => { e.preventDefault(); Keys[d] = 0; };
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('click', e => e.preventDefault());
    });
    /* A short tap you can feel, where vibration exists. */
    const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* ignore */ } };
    const act = e => {
      e.preventDefault(); Sfx.init(); buzz(9);
      if (Dialogue.on) {
        /* On touch, E takes the highlighted choice. */
        if (Dialogue.avail && Dialogue.avail.length && !Dialogue.typing) Dialogue.choose(Dialogue.sel);
        else Dialogue.advance();
      } else if (G.state === 'play') Interact.go();
    };
    /* pointerdown, so E does not wait out the double-tap delay; click swallows the ghost. */
    $('#touchE').addEventListener('pointerdown', act);
    $('#touchE').addEventListener('click', e => e.preventDefault());
    const menu = e => {
      e.preventDefault(); Sfx.init(); buzz(9);
      if (Panels.on) Panels.close(); else if (G.state === 'play') Panels.open('home');
    };
    /* Jump, or dive in the water. */
    $('#touchJ').addEventListener('pointerdown', e => {
      e.preventDefault(); Sfx.init(); buzz(9);
      if (G.state === 'play') Moves.jump();
    });
    $('#touchJ').addEventListener('click', e => e.preventDefault());
    $('#touchMenu').addEventListener('pointerdown', menu);
    $('#touchMenu').addEventListener('click', e => e.preventDefault());

    /* The sticks last and guarded: if one throws on an unknown browser, E, ☰ and
       the d-pad must still work. */
    try { Stick.init(); Throttle.init(); Aim.init(); } catch (err) {
      console.warn('thumbstick unavailable, falling back to the d-pad', err);
      Hand.pad = 'dpad'; Hand.apply();
    }
  }
}

/* Only from somewhere a save can resume: play, or a panel or the console over it. */
function saveOnLeave() {
  if ((typeof Trial !== 'undefined' && Trial.on) || !['play', 'panel', 'comms', 'dialogue'].includes(G.state) || Combat.E || Arcade.on) return;
  Save.write(true);
}

/* ---------------- Movement ---------------- */

/* How much faster a run is than a walk. */
const RUN_SPEED = 1.45;

/* Can the player's feet be here? Walking, getting out of a car and the unstick
   below all ask this one question (the shape is Collide.walk()). */
function playerFits(nx, ny) { return Collide.walk(nx, ny, { swim: true }); }

function movePlayer(dt) {
  /* Whatever takes the world away takes the controls too: let go of the sticks. */
  if (G.state !== 'play') { P.moving = false; if (Stick.id !== null || Throttle.id !== null) releaseSticks(); return; }
  /* Driving, Cars owns the controls and moves P. */
  if (Cars.driving) return;
  let dx = (Keys.right - Keys.left), dy = (Keys.down - Keys.up);
  if (dx && dy) { dx *= .707; dy *= .707; }
  /* The stick wins while held; its vector already carries the speed. */
  if (Stick.on) { dx = Stick.x; dy = Stick.y; }
  const tired = P.energy < 25 ? .72 : 1;
  /* Carrying something, you walk 12% slower. */
  const held = Guns.armed ? .88 : 1;
  /* Swimming is slower than walking (engine/moves.js). */
  const wet = P.swim ? Moves.SWIM_SPEED : 1;
  P.moving = !!(dx || dy);
  /* Running: Shift on a keyboard, the stick pushed right out on a phone. Not
     with something in your hand, in the water, or when you are worn out. */
  P.fast = P.moving && (Stick.on ? Math.hypot(dx, dy) > 0.86 : !!Keys.run) && !Guns.armed && !P.swim && P.energy >= 25;
  const sp = TILE * 3.45 * (P.fast ? RUN_SPEED : 1) * tired * held * wet * dt;
  if (P.moving) {
    P.dir = Sprites.dirOf(dx, dy);
    P.bob += dt * 9;
    /* Footsteps on land; the water makes its own noise. In the air, none. */
    if (!P.swim && !P.jz && (!P._stepT || (P._stepT -= dt) <= 0)) { P._stepT = .34; if (Sfx.on) Sfx.step(); }
  }
  const free = (nx, ny) => {
    if (!playerFits(nx, ny)) return false;
    /* People are soft: blocked only by a move that brings you closer, so you can
       always step out of somebody who ended up on you. Colleagues and passers-by alike. */
    const near = o => {
      const d = Math.hypot(o.x - nx, o.y - ny);
      return d < TILE * .5 && d <= Math.hypot(o.x - P.x, o.y - P.y);
    };
    return !NPCM.list.some(near) && !Peds.list().some(near);
  };
  /* The walk cycle advances with ground covered, about a step and a half a tile. */
  const was = { x: P.x, y: P.y };
  if (dx && free(P.x + dx * sp, P.y)) P.x += dx * sp;
  if (dy && free(P.x, P.y + dy * sp)) P.y += dy * sp;
  /* Inside something anyway, you are eased out rather than held there. */
  const out = Collide.unstick(P.x, P.y, { swim: true });
  if (out) {
    const m = Math.hypot(out[0], out[1]) || 1, step = Math.min(m, TILE * 2.4 * dt);
    P.x += out[0] / m * step; P.y += out[1] / m * step;
  }
  P.step = (P.step || 0) + Math.hypot(P.x - was.x, P.y - was.y) / TILE * 2.6;
  P.x = clamp(P.x, 20, MAPW * TILE - 20); P.y = clamp(P.y, 20, MAPH * TILE - 20);

  zoneCheck();
}

/* ---------------- Aiming ----------------
   Once a frame: the aim stick, then the arrows, then the mouse, whichever is
   in use, handed to Guns as a direction and a trigger. */
function readAim() {
  if (!Guns.can()) { Guns.trigger(false); return; }
  /* The aim stick: a bearing and a trigger in one gesture. */
  if (Aim.on) { Guns.point(Aim.x, Aim.y); return; }
  const ax = (Aimer.right - Aimer.left), ay = (Aimer.down - Aimer.up);
  if (ax || ay) { Guns.point(ax, ay); return; }
  /* The mouse aims continuously while armed (walking changes the bearing too)
     and fires on its own button. */
  if (Mouse.seen && Guns.armed) Guns.at(Mouse.x, Mouse.y);
  Guns.trigger(Mouse.down && Guns.armed);
}

/* Which room or street you are in, and what arriving somewhere new is worth:
   one rule for walking and driving alike. */
function zoneCheck() {
  const z = World.zoneAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE));
  if (!z || z === G.lastZone) return;
  G.lastZone = z; UI.zone(ZONES[z].name);
  if (!G.discovered[z]) {
    G.discovered[z] = true; Player.xp(15);
    if (Object.keys(ZONES).every(k => G.discovered[k])) Ach.get('a_allthree');
  }
  /* HOOKS.zoneEnter, for the game's own reactions. */
  Hook('zoneEnter', z);
}
