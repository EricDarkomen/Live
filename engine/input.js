'use strict';
/* ---------------- Input ---------------- */
const Keys = { up: 0, down: 0, left: 0, right: 0 };
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
/* The right hand, on a keyboard. The same four arrows, read as a bearing
   instead of as a walk, and only while something is out — see the keydown
   handler. Kept as its own set rather than as a flag on Keys because the two
   are pressed at the same time and mean different things: W and Left is
   walking one way and firing the other, which is the whole point. */
const Aimer = { up: 0, down: 0, left: 0, right: 0 };
const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
/* Where the pointer is, in WORLD pixels, and whether its button is down. World
   rather than screen because that is the question being asked — the camera
   moves under a mouse that has not — and it is worked out once per move rather
   than once per frame. `seen` because a keyboard-only player has never moved
   one and aiming at (0, 0) is aiming at the top-left corner of the map. */
const Mouse = { x: 0, y: 0, down: false, seen: false };

function bindInput() {
  addEventListener('keydown', e => {
    Sfx.init();
    /* Dialogue owns the keyboard while it is open — including the movement keys,
       which double as choice navigation. It must therefore be tested first. */
    if (Dialogue.on) {
      if (/^Digit[1-9]$/.test(e.code)) { e.preventDefault(); Dialogue.choose(+e.code.slice(5) - 1); return; }
      if (Dialogue.avail && Dialogue.avail.length) {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); Dialogue.move(-1); return; }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); Dialogue.move(1); return; }
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); Dialogue.choose(Dialogue.sel); return; }
      }
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); Dialogue.advance(); return; }
      if (e.code === 'Escape') { e.preventDefault(); Dialogue.close(); return; }
      return;
    }
    /* A minigame owns the keyboard outright while it is open — including the
       movement keys, which several of them use — so it is tested before the
       KEYMAP, for the same reason Dialogue is tested before everything. Escape
       is the arcade's own; it never reaches the settings panel from here. */
    if (Arcade.on) { e.preventDefault(); Arcade.key({ code: e.code, down: true }); return; }
    /* The title screen owns the movement keys too, and has to be tested before
       the KEYMAP for it — W/S and the arrows walk the menu there, and there is
       nobody on the fourth floor to walk. It used to be mouse-only: three
       buttons and one key, Enter, which always started a new shift whatever the
       save file said. */
    if (G.state === 'title') {
      const k = KEYMAP[e.code];
      if (k === 'up' || k === 'left') { e.preventDefault(); Title.move(-1); return; }
      if (k === 'down' || k === 'right') { e.preventDefault(); Title.move(1); return; }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); Title.activate(); return; }
    }
    /* THE OTHER STICK, ON A KEYBOARD. Armed, the arrows stop being a second
       set of movement keys and become the right hand: they aim, and they fire
       where they point, which is Robotron's arrangement and the reason a
       twin-stick game has ever worked without two thumbs. WASD keeps walking
       you about, and unarmed the arrows are exactly what they always were —
       nobody's muscle memory is taken away, it is only borrowed while there is
       something in your hand. */
    if (ARROWS[e.code] && Guns.can() && Guns.armed) {
      Aimer[ARROWS[e.code]] = 1; e.preventDefault(); return;
    }
    if (KEYMAP[e.code]) { Keys[KEYMAP[e.code]] = 1; e.preventDefault(); return; }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (G.state === 'name') { Boot.acceptName(); return; }
      /* The creator takes Enter/Space as "that will do" — the same as every
         other screen between the title and the shift. Without it a keyboard
         player reaches section 2 of the form and the game stops dead, which is
         exactly what it did to the desktop suite. The selects handle their own
         keys; this only fires when focus is not in one. */
      if (G.state === 'look') { Boot.goFullscreen(); Look.accept(); return; }
      if (G.state === 'cut') { Cut.press(); return; }
      if (G.state === 'play') { Interact.go(); return; }
      return;
    }
    if (G.state === 'combat') {
      if (/^Digit[1-9]$/.test(e.code)) { const b = $('#cbMoves').children[+e.code.slice(5) - 1]; if (b && !b.disabled) b.click(); }
      return;
    }
    if (e.code === 'F5') { e.preventDefault(); Save.write(); return; }
    if (e.code === 'F9') { e.preventDefault(); if (Save.has()) { Save.read(); Panels.close(); } else Sfx.deny(); return; }
    if (e.code === 'Escape') {
      /* Esc is "get me out of this", and during the opening the thing to get
         out of is the opening. The button is the discoverable one; this is the
         one somebody who has seen it eleven times will actually press. */
      if (G.state === 'cut' && Cut.on) { Cut.skip(); return; }
      /* The console is asked first because it is the thing most likely to be
         open: five channels, opened by a chip, a key, a tab or a tapped alert.
         Escape is "get me out of this", and out of the console is the floor. */
      if (Comms.on) Comms.close();
      else if (Panels.on) Panels.close(); else if (G.state === 'play') Panels.open('settings');
      return;
    }
    if (G.state !== 'play' && !Panels.on && !Comms.on) return;
    if (e.code === 'KeyE') { if (!Panels.on) Interact.go(); return; }
    /* Out, and away again. The one control on the keyboard that has no
       equivalent on a phone, where letting go of the stick IS putting it away
       — a phone has no spare corner for a holster button and does not need
       one. */
    if (e.code === 'KeyG') { if (!Panels.on && Guns.any()) { Guns.toggle(); if (!Guns.armed) Sfx.blip(); } else if (!Panels.on) Sfx.deny(); return; }
    if (e.code === 'KeyR') { if (!Panels.on && Guns.armed && !Guns.reload()) Sfx.deny(); return; }
    if (e.code === 'KeyQ') { if (!Panels.on && Guns.armed) Guns.next(); return; }
    /* The horn, and only while you are in something that has one. Held rather
       than pressed — Cars.update sounds it once on the way down and leaves it
       leaning on it after that. */
    if (e.code === 'KeyH') { if (Cars.driving) Cars.horn = true; return; }
    /* N for the map, and not M, which has been the email since there was an
       email: a key somebody has been pressing for a year is not free just
       because another game would put a map on it. C and M therefore still open
       the chat and the inbox — they simply open them in the console that owns
       them now rather than in the portal they used to be tabs of, which is the
       same key doing the same thing in a better place.
       V and B are the two channels that did not exist to have keys: texts, and
       the log every toast in the game now writes into. */
    const chan = { KeyM: 'mail', KeyC: 'chat', KeyV: 'text', KeyB: 'log' };
    if (chan[e.code]) {
      if (Panels.on) Panels.close();
      Comms.toggle(chan[e.code]);
      return;
    }
    if (Comms.on) return;      /* the panel keys do not reach through the console */
    const map = { KeyN: 'map', KeyI: 'inventory', KeyJ: 'quests', KeyK: 'skills', KeyP: 'stats', KeyL: 'ach', KeyT: 'shift', KeyU: 'people', KeyO: 'farm', KeyY: 'workshop' };
    if (map[e.code]) { if (Panels.on && Panels.tab === map[e.code]) Panels.close(); else Panels.open(map[e.code]); }
  });
  /* Keep Tab inside whichever modal is open, rather than letting focus escape
     into the buttons of the frozen world behind it. */
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
    /* The release matters here in a way it does not elsewhere: a game asking
       a.held() gets a key that is never let go of otherwise. */
    if (Arcade.on) { Arcade.key({ code: e.code, down: false }); return; }
    if (e.code === 'KeyH') Cars.horn = false;
    if (ARROWS[e.code]) Aimer[ARROWS[e.code]] = 0;
    if (KEYMAP[e.code]) Keys[KEYMAP[e.code]] = 0;
  });
  addEventListener('blur', () => {
    Keys.up = Keys.down = Keys.left = Keys.right = 0;
    Aimer.up = Aimer.down = Aimer.left = Aimer.right = 0;
    Cars.horn = false; Guns.trigger(false); releaseSticks();
  });

  /* Leaving the tab should not cost you the shift: stop the clock, drop the
     held keys, and hush the hold music until you come back. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Game.paused = true;
      Keys.up = Keys.down = Keys.left = Keys.right = 0;
      Aimer.up = Aimer.down = Aimer.left = Aimer.right = 0;
      Guns.trigger(false);
      releaseSticks();
      Sfx.holdMusic(false);
      if (Sfx.ctx && Sfx.ctx.state === 'running') Sfx.ctx.suspend().catch(() => {});
    } else {
      Game.paused = false;
      Game.last = performance.now();   /* don't fast-forward the world on return */
      if (Sfx.ctx && Sfx.ctx.state === 'suspended') Sfx.ctx.resume().catch(() => {});
      if (Combat.E && Sfx.music) Sfx.holdMusic(true);
    }
  });

  $('#keyhints').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    /* Two kinds of hint in one row now: a portal tab and a comms channel. The
       row is the desktop's only written statement of what the keyboard can
       reach, so the console belongs in it — the rail in the corner says what
       is WAITING, which is a different question. */
    if (b.dataset.comms) { Panels.close(); return Comms.toggle(b.dataset.comms); }
    Panels.open(b.dataset.panel === 'settings' ? 'settings' : b.dataset.panel);
  });
  /* The minimap opens the map. It is the one control on this HUD that is
     discovered by looking at the thing it is about, and on a desktop it is the
     only thing that says the map screen exists at all. */
  const mmb = $('#minimapBtn');
  if (mmb) mmb.onclick = () => { if (Panels.on && Panels.tab === 'map') Panels.close(); else Panels.open('map'); };
  $('#pnClose').onclick = () => Panels.close();
  $('#panel').addEventListener('click', e => { if (e.target.id === 'panel') Panels.close(); });
  $('#endAgain').onclick = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
  $('#endTitle').onclick = () => location.reload();
  $('#dialogue').addEventListener('click', e => { if (!e.target.closest('.choice')) Dialogue.advance(); });

  /* The comms band, the rail and the console bind their own listeners — the
     band holds an alert while a pointer is on it, the chips open a channel,
     and a tapped alert opens the channel it came from AT the thing it named.
     All of it is in engine/comms.js beside the model it is a view of, rather
     than here: there used to be nine listeners in this file keeping a
     notification box open while somebody read it, and none of them made sense
     without the box. */
  Comms.bind();

  /* ---- the mouse, which is the other stick on a desktop ----
     A pointer is a bearing that is already on the screen: where it is IS where
     you are aiming, and the button is the trigger. Nothing here does anything
     until something is out, so a click on the office is the nothing it has
     always been — and the arrows and the mouse do not fight, because readAim()
     asks them in a fixed order and the arrows are asked first: press one and
     the mouse stops being consulted until you let go of it.

     Bound to the window rather than to the canvas for the release, for the
     reason the sticks are: a button let go of over the HUD, the tracker or the
     edge of the screen is still a button let go of, and a trigger that misses
     its own release empties the magazine into a wall. */
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
  /* A held right-click is not a second trigger and a context menu over a
     firefight is nobody's idea of a control, but the canvas is the one surface
     you are allowed to drag on, so only the canvas's own menu goes. */
  R.cv.addEventListener('contextmenu', e => { if (Guns.armed) e.preventDefault(); });

  /* touch */
  if (TOUCH) {
    $('#touch').classList.add('on');
    const hint = document.querySelector('.cut-hint');
    if (hint) hint.textContent = 'Tap to continue';
    /* No Esc key on a phone, and the header it sits in has three lines' worth
       of title to fit into one. */
    $('#pnClose').textContent = 'Close';

    /* touch-action only covers a gesture that STARTS on the element declaring
       it, and a thumb landing just outside the stick zone was panning the whole
       fixed layout — which reads as the UI vanishing. Killed at the document,
       decided once per touch because the answer cannot change mid-drag. Do not
       replace this with touch-action:none on body: the effective value is the
       intersection up the ancestor chain, which kills the panel sheet and the
       tab strip. Exemption is "has a scrollable ancestor", not a selector list
       that would rot the first time somebody adds one. */
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
      /* Two fingers is a pinch, and there is nothing here worth zooming. */
      if (e.touches.length > 1 || !dragMayScroll) { if (e.cancelable) e.preventDefault(); }
    }, { passive: false });

    /* pointerdown, not touchstart/click: one set of listeners covers touch,
       mouse and pen, and a pointer released off the edge of a button still
       reports the release. */
    document.querySelectorAll('.dpad button').forEach(b => {
      const d = b.dataset.dir;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); Sfx.init(); Keys[d] = 1;
        /* Keep receiving the move/up for this finger wherever it wanders. */
        if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (_) { /* stale pointer */ } }
      });
      const off = e => { e.preventDefault(); Keys[d] = 0; };
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('click', e => e.preventDefault());
    });
    /* A tap you can feel. Short enough not to be a buzz — it is confirmation
       that the button took, on a control with no travel and no click. Absent on
       iOS and on most desktops, hence the guard. */
    const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* ignore */ } };
    const act = e => {
      e.preventDefault(); Sfx.init(); buzz(9);
      if (Dialogue.on) {
        /* on touch, tapping E takes the highlighted choice when there is one */
        if (Dialogue.avail && Dialogue.avail.length && !Dialogue.typing) Dialogue.choose(Dialogue.sel);
        else Dialogue.advance();
      } else if (G.state === 'play') Interact.go();
    };
    /* `pointerdown`, not `click`: a tap is not ruled out as the start of a
       double-tap for 300ms, and the E button is pressed more than anything
       else in the game. The click handler only exists to swallow the ghost. */
    $('#touchE').addEventListener('pointerdown', act);
    $('#touchE').addEventListener('click', e => e.preventDefault());
    const menu = e => {
      e.preventDefault(); Sfx.init(); buzz(9);
      if (Panels.on) Panels.close(); else if (G.state === 'play') Panels.open('quests');
    };
    $('#touchMenu').addEventListener('pointerdown', menu);
    $('#touchMenu').addEventListener('click', e => e.preventDefault());

    /* Last, and guarded. The stick is the newest and least essential of these:
       if it throws on some browser this file has never met, that must cost you
       the stick and not E, ☰ and the d-pad along with it — which is what
       happens when it is wired first and takes the rest of the block down. */
    try { Stick.init(); Throttle.init(); Aim.init(); } catch (err) {
      console.warn('thumbstick unavailable, falling back to the d-pad', err);
      Hand.pad = 'dpad'; Hand.apply();
    }
  }
}

/* ---------------- Movement ---------------- */

/* Can the player's feet be here? Its own function because three things need to
   agree about it: walking, which asks it of every step; getting out of a car,
   which asks it of every candidate doorstep; and the unstick below. They used
   to disagree — getting out tested the one tile the middle of you landed in,
   which is not the same question, and the answer being wrong put you down half
   inside a car with every direction blocked and a step too small to escape it.
   One shape, one answer, every caller.

   The shape itself, and what counts as being in the way, is engine/collide.js:
   a small box on the GROUND against walls, worktops, the drawn size of the
   furniture and the actual boxes of the cars — rather than against whole tiles,
   which is what used to make a bin the size of a phone box. */
function playerFits(nx, ny) { return Collide.walk(nx, ny); }

function movePlayer(dt) {
  /* Anything that takes the world away — a conversation, a panel, a call —
     also takes the controls off the screen, so a stick still being held is a
     stick whose finger has nothing under it. Let go of it here rather than in
     each of the four things that can open. */
  if (G.state !== 'play') { P.moving = false; if (Stick.id !== null || Throttle.id !== null) releaseSticks(); return; }
  /* Behind a wheel the same keys and the same thumb mean something else
     entirely, and Cars owns them — including moving P to wherever the car has
     got to, which is what keeps the camera, the minimap and the street names
     working without any of them knowing. */
  if (Cars.driving) return;
  let dx = (Keys.right - Keys.left), dy = (Keys.down - Keys.up);
  if (dx && dy) { dx *= .707; dy *= .707; }
  /* The stick wins while it is held. Its vector is already a unit direction
     scaled by how hard it is pushed, so the speed below needs no special case:
     a nudge walks, a full push is the keyboard's own pace. */
  if (Stick.on) { dx = Stick.x; dy = Stick.y; }
  const tired = P.energy < 25 ? .72 : 1;
  /* Something in your hands is something you walk with rather than run with.
     Twelve per cent, which is not a penalty anybody would notice as a number
     and is exactly enough to feel the difference between crossing the floor
     and crossing it with a foam dart blaster out. */
  const held = (typeof Guns !== 'undefined' && Guns.armed) ? .88 : 1;
  const sp = TILE * 3.45 * tired * held * dt;
  P.moving = !!(dx || dy);
  /* Run is chosen by the size of the movement vector, not a button, so the
     animation cannot disagree with the pace. An arrow key is a whole unit, so
     the desktop always runs — which it always has. */
  P.fast = P.moving && Math.hypot(dx, dy) > 0.86 && !(typeof Guns !== 'undefined' && Guns.armed);
  if (P.moving) {
    P.dir = Sprites.dirOf(dx, dy);
    P.bob += dt * 9;
    if (!P._stepT || (P._stepT -= dt) <= 0) { P._stepT = .34; if (Sfx.on) Sfx.step(); }
  }
  const free = (nx, ny) => {
    if (!playerFits(nx, ny)) return false;
    /* If somebody has ended up standing on you, you can still walk out of them —
       a move is only blocked when it would not increase the separation. */
    /* People are soft: you cannot walk through one, but if somebody has ended
       up standing on you the move is only blocked when it would not increase
       the separation. Both lists, because a stranger on the pavement is as
       much a person to bump into as a colleague at a printer. */
    const near = o => {
      const d = Math.hypot(o.x - nx, o.y - ny);
      return d < TILE * .5 && d <= Math.hypot(o.x - P.x, o.y - P.y);
    };
    return !NPCM.list.some(near) && !Peds.list().some(near);
  };
  /* The walk cycle is advanced by ground covered rather than by a clock, so
     the feet keep up with the floor at any speed and nobody scurries. A
     colleague ambling at a third of your pace was running the same cycle you
     do. 2.6 frames to the tile is about a step and a half, which is a walk. */
  const was = { x: P.x, y: P.y };
  if (dx && free(P.x + dx * sp, P.y)) P.x += dx * sp;
  if (dy && free(P.x, P.y + dy * sp)) P.y += dy * sp;
  /* And if you are inside something anyway — a car parked on you, a door shut
     through you, whatever went wrong — the collision system's job is to get
     you out of it rather than to hold you there. Eased rather than snapped, so
     it reads as being nudged clear and not as being teleported. */
  const out = Collide.unstick(P.x, P.y);
  if (out) {
    const m = Math.hypot(out[0], out[1]) || 1, step = Math.min(m, TILE * 2.4 * dt);
    P.x += out[0] / m * step; P.y += out[1] / m * step;
  }
  P.step = (P.step || 0) + Math.hypot(P.x - was.x, P.y - was.y) / TILE * 2.6;
  P.x = clamp(P.x, 20, MAPW * TILE - 20); P.y = clamp(P.y, 20, MAPH * TILE - 20);

  zoneCheck();
}

/* ---------------- Aiming ----------------

   The right hand, whichever hand it turns out to be. One function, called once
   a frame from the loop, that asks the three controls in the order of "which
   one is the player actually using" — a thumb on the stick beats the arrow
   keys beats where the mouse happens to be sitting — and hands the answer to
   Guns as a direction and a trigger.

   It is written this way round because the three are not modes. Nobody chooses
   between a stick and a mouse; a device has what it has, and a desk with both
   should let you pick up either without telling anything. */
function readAim() {
  if (typeof Guns === 'undefined') return;
  if (!Guns.can()) { Guns.trigger(false); return; }
  /* A thumb on the aim stick: a bearing and a trigger in one gesture. */
  if (Aim.on) { Guns.point(Aim.x, Aim.y); return; }
  const ax = (Aimer.right - Aimer.left), ay = (Aimer.down - Aimer.up);
  if (ax || ay) { Guns.point(ax, ay); return; }
  /* Otherwise the mouse, which aims continuously while something is out — the
     bearing changes when the player walks, not only when the mouse moves — and
     fires on its own button. */
  if (Mouse.seen && Guns.armed) Guns.at(Mouse.x, Mouse.y);
  Guns.trigger(Mouse.down && Guns.armed);
}

/* Which room — or which street — the player is standing in, and what that is
   worth the first time. Its own function because there are two ways to be
   somewhere now: walking there, and driving there. One rule in one place, so
   the fifteen for a room you have not been in cannot be awarded twice or the
   name of a street announced only when you arrive on foot. */
function zoneCheck() {
  const z = World.zoneAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE));
  if (!z || z === G.lastZone) return;
  G.lastZone = z; UI.zone(ZONES[z].name);
  if (!G.discovered[z]) {
    G.discovered[z] = true; Player.xp(15);
    if (Object.keys(ZONES).every(k => G.discovered[k])) Ach.get('a_allthree');
  }
  /* Anything a game wants to happen on walking into a room for the first time
     or the fiftieth — a tutorial line, a pin on the one box that matters — is
     HOOKS.zoneEnter in data/game.js. */
  Hook('zoneEnter', z);
}
