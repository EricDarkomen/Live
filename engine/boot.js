'use strict';
/* ---------------- TimeSystem + main loop ---------------- */
const Game = {
  acc: 0, mmT: 0, secT: 0, frozen: false, paused: false,
  /* A full-screen overlay hides the world entirely, so there is nothing to gain
     from redrawing it — and plenty to lose, since the blurred backdrop then has
     to be re-rasterised every frame. */
  overlayUp() { return !!Combat.E || Panels.on || Comms.on || Arcade.on || G.state === 'ending'; },
  tick(dt) {
    if (this.paused) return;
    FX.update(dt);
    /* The title screen animates on this loop rather than one of its own, for
       the same reason the arcade does — same dt, same 50ms clamp, same stop
       when the tab goes away. It is a no-op the moment the screen is not up. */
    Title.tick(dt);
    Dialogue.tick(dt);
    /* 'cut' is in here because the opening draws the real building behind it:
       a floor of people frozen mid-step under a caption about forty of them
       all saying "I completely understand" is a photograph, not an office. */
    /* 'comms' is in here for the reason 'panel' is: the floor does not stop
       because you are reading your email. Twenty people frozen mid-step behind
       a sheet you can see the edges of is a game that has paused, and this one
       has not. */
    if (G.state === 'play' || G.state === 'dialogue' || G.state === 'panel'
      || G.state === 'comms' || G.state === 'cut') NPCM.update(dt);
    movePlayer(dt);
    /* After the walk and before the camera. A car that is being driven IS the
       player as far as everything downstream is concerned — Cars.update writes
       P.x and P.y — so it has to have moved before Cam.follow reads them, or
       the camera is permanently one frame behind the thing it is following. */
    Cars.update(dt);
    Peds.update(dt);
    /* After the walk and after the cars, because a shot is fired from wherever
       the player ENDED UP this frame — including when "the player" is a car —
       and lands on whoever has already finished moving. Before the camera, for
       the same reason Cars is: what is on the screen this frame should be the
       state this frame, not the state of the last one. */
    readAim();
    Guns.update(dt);
    syncControls();
    Cut.tick(dt);
    /* The opening owns the camera while it is running — it is looking at the
       building rather than following somebody standing still in reception. */
    if (Cine.on) Cine.camera(dt); else Cam.follow(dt);
    Interact.scan();
    Guide.check();
    Phones.tick(dt);
    /* The written-in queue. Beside the phones because it is the same kind of
       thing — work arriving whether you asked for it or not — and separate
       from them because it obeys different rules: no abandon timer, and it
       does not ask whether you are on the premises. See Inbound. */
    Inbound.tick(dt);
    /* A minigame runs on the page's ONE loop rather than a requestAnimationFrame
       of its own: the same dt, the same 50ms clamp, and the same stop when the
       tab goes away. Before the overlay check below, because that is where the
       world stops being drawn — and the arcade is one of the things that stops
       it. */
    if (Arcade.on) Arcade.frame(dt);
    if (G.state === 'play') {
      this.acc += dt * 1000;
      /* A game minute is no longer one length. It is MS_PER_GAME_MIN through
         the working day and a fraction of that once the shift is over — see
         Sky.pace() — so the pace is read INSIDE the loop, on every minute:
         crossing 17:00 has to speed the clock up on the very next tick and not
         on the next frame, or the last minute of the day is charged at the
         evening's rate and the first of the evening at the day's. */
      let pace = Sky.pace();
      while (this.acc >= pace) {
        this.acc -= pace;
        G.minutes++;
        /* Midnight. The day changes here, in the passing of a minute, rather
           than in a button on a report — which is the whole point: nothing
           moves, nothing is rebuilt, and you are wherever you were standing at
           23:59, which by then is usually the car park. */
        if (G.minutes >= 1440) { G.minutes -= 1440; Sky.newDay(); }
        Sky.minute();
        /* The office only happens during office hours. Nobody messages you at
           two in the morning, nothing goes wrong with the printer at two in the
           morning, and you do not get tired at two in the morning — you get
           less tired, which Sky.minute() is doing above. */
        if (Sky.working()) {
          Chat.tick(); Mail.tick(); EventSys.tick();
          if (G.minutes % 7 === 0) Player.mod({ energy: -1 });
        }
        /* AND THE TEXTS, OUTSIDE THAT TEST, which is the whole character of the
           channel rather than an oversight. The chat is the company talking to
           itself and the inbox is the company talking at you; both belong to
           office hours and stop at five with everything else. A text is
           somebody who knows you, and half of what makes the evening an evening
           is that it carries on arriving — Jamie asking whether you are off yet
           at 17:12 only lands if this line is out here. */
        Texts.tick();
        /* The quiet hourly autosave, and OUTSIDE the test above rather than
           inside it, which is where it used to live. An evening was ninety
           seconds of walking to the car park when that was written; it is a
           town and a coast road now, and a player who spends one out there and
           closes the tab was losing all of it back to five o'clock. Throttled
           on real time rather than on the clock, because the clock past five is
           not the clock — see Save.auto(). */
        if (G.minutes % 60 === 0) Save.auto();
        /* Five o'clock, ONCE — and outside the test above, because at exactly
           17:00 the shift is over and Sky.working() is already false. It is a
           line rather than a screen: Report.post() closes the queue, writes the
           day down and says one sentence about it, and the world goes on
           exactly as it was — you might be at your desk, you might be on the
           bypass. The flag stops it being announced again on every minute until
           midnight, and is cleared by Sky.newDay() with the rest of today's. */
        if (G.minutes >= DAY_END && !G.flags.clockedOff) {
          G.flags.clockedOff = true; Report.post(); break;
        }
        pace = Sky.pace();
      }
      UI.hud();
    }
    /* The map, four times a second, and BEFORE the overlay check rather than
       after it: what Atlas draws is the minimap in the corner when there is
       nothing in front of it and the map screen when there is, and the map
       screen is the one case where something has to go on being drawn while
       the world behind it is frozen. The world is not paused — the colleagues
       and the traffic are still moving above this line — so a map that stopped
       when it was opened would be a map of a minute ago. */
    this.mmT -= dt; if (this.mmT <= 0) { this.mmT = .25; Atlas.tick(); }
    this.secT -= dt; if (this.secT <= 0) { this.secT = 1; Hook('second'); }
    if (this.overlayUp()) {
      /* draw one final frame, blur it into the canvas, then stop entirely */
      if (!this.frozen) { this.frozen = true; R.draw(dt); R.freeze(); }
      return;
    }
    this.frozen = false;
    R.draw(dt);
  },
  loop(now) {
    const dt = Math.min(.05, (now - (Game.last || now)) / 1000);
    Game.last = now;
    try { Game.tick(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(Game.loop);
  },
  begin() {
    Title.hide();
    $('#titleScreen').classList.remove('on');
    $('#nameScreen').classList.remove('on');
    $('#lookScreen').classList.remove('on');
    $('#cutscene').classList.remove('on');
    /* The one door into the shift, so it is the one place that puts the
       opening's camera and the opening's stripped-down stage back — whichever
       of the four ways in got here, and whether the opening ran or not. */
    Cine.end();
    $('#game').classList.add('on');
    R.resize(); Cam.snap();
    G.state = 'play';
    UI.hud();
    /* WHERE YOU ACTUALLY ARE. This said "Fourth Floor" in letters across the
       middle of the screen while the player stood in the ground-floor lobby,
       and had done since the lobby stopped being part of floor four and became
       a floor of its own: a leftover from a building with one storey in it.
       The level knows its own name, so it says it, and it will go on being
       right wherever a shift is made to begin.
       The objective is not a leftover — finding the fourth floor is the first
       job the game gives you, and now it is a job with a lift in it. */
    UI.zone((World.def && World.def.name) || GAME.company);
    UI.objective(say('firstObjective'));
    Guide.setObject('playerDesk', say('yourDesk'), 'foundDesk');
    setTimeout(() => UI.toast('🧭', (TOUCH
      ? (Hand.pad === 'dpad'
          ? 'Move with the pad on the ' + Hand.padSide() + '.'
          : 'Put a thumb down anywhere in the bottom-' + Hand.padSide() + ' and push.')
        + ' Tap <span class="kbd">E</span> to interact.'
      : 'Move with <span class="kbd">WASD</span>. Interact with <span class="kbd">E</span>.')
      + ' ' + say('firstTip')), 900);
    setTimeout(() => UI.toast('🛎️', say('phoneTip', { press: TOUCH ? 'tap' : 'press' })), 6000);
    setTimeout(() => { if (!Phones.ringing.length) Phones.ringRandom(); }, 12000);
  }
};

/* ---------------- The opening's camera ----------------
   The building the opening talks about is the building the game is about to
   start in, and the game already has a renderer that draws it — so the shot
   under the words is the real fourth floor, with the real twenty people on it,
   rather than a picture of one. That costs almost nothing: R.draw() is called
   on every frame of the opening already (to a hidden canvas), so all that is
   actually new is who owns the camera and taking the HUD off the screen.

   Two rules make it honest rather than a gimmick:

     nothing is shown until a beat asks for it. The first beat is outside the
     building and this level cannot draw a street, so the screen stays dark
     through it — see the `cam` note on CUT.

     the last shot is the tile the player is standing on, so the closing frame
     of the opening and the opening frame of the shift are the same frame and
     Game.begin()'s Cam.snap() has nothing left to move. */
const Cine = {
  on: false,
  cx: 0, cy: 0,      /* where the camera is being asked to look, in world px */
  dx: 0, dy: 0,      /* the direction the current move came in on */
  rate: .04,
  /* A shot that has finished arriving is a photograph. Creep along the line the
     move came in on so the frame is never quite still — five pixels a second,
     which is under a tile over a long beat and reads as a camera being held
     rather than as a camera moving. */
  CREEP: 5,

  begin() {
    this.on = true;
    document.body.classList.add('cinema');
    R.cinema = true;
    /* The game is switched on so its canvas is drawn and sized; body.cinema is
       what takes the HUD, the controls, the minimap and the rest back off. */
    $('#game').classList.add('on');
    R.resize();
    this.dx = 0; this.dy = 1;
    /* A little north of where the shift begins, so the first beat that does
       name a camera is a move down into reception rather than a cut to a frame
       that was already on the screen. */
    this.cx = P.x; this.cy = P.y - TILE * 5;
    Cam.x = Cam.bound(this.cx - Cam.w / 2, MAPW, Cam.w);
    Cam.y = Cam.bound(this.cy - Cam.h / 2, MAPH, Cam.h);
  },

  /* Tile coordinates, because that is what a level is written in and what the
     editor shows. `secs` is how long the move should take. */
  aim(tx, ty, secs) {
    const x = (tx + .5) * TILE, y = (ty + .5) * TILE;
    const d = Math.hypot(x - this.cx, y - this.cy);
    if (d > 1) { this.dx = (x - this.cx) / d; this.dy = (y - this.cy) / d; }
    this.cx = x; this.cy = y;
    /* The same exponential smoothing Cam.follow uses, with the rate solved for
       the time the beat asked for instead of fixed: 96% of the distance in
       `secs`, still decelerating afterwards. Framerate-independent, and it
       eases out on its own, which is what makes a pan look operated. */
    this.rate = Math.pow(.04, 1 / Math.max(.3, secs));
  },

  camera(dt) {
    this.cx += this.dx * this.CREEP * dt;
    this.cy += this.dy * this.CREEP * dt;
    const k = 1 - Math.pow(this.rate, dt);
    Cam.x = lerp(Cam.x, Cam.bound(this.cx - Cam.w / 2, MAPW, Cam.w), k);
    Cam.y = lerp(Cam.y, Cam.bound(this.cy - Cam.h / 2, MAPH, Cam.h), k);
  },

  /* Idempotent: Game.begin() calls it on every way into the shift, including
     the three that never ran an opening. */
  end() {
    this.on = false;
    R.cinema = false;
    document.body.classList.remove('cinema');
  }
};

/* ---------------- Opening cutscene ----------------
   CUT, the beats, is in data/office.js — including what each one is SHAPED
   like and where the camera goes, because both of those are writing.

   Two things here are worth knowing before changing any of it:

     a press finishes the line before it advances the beat. A typewriter with
     no way past it is a tax on everybody who reads faster than 62 characters a
     second, which is everybody.

     there is always a skip, from the first frame, and it is a button rather
     than something to be discovered. Twelve beats is about ninety seconds, and
     the second time somebody starts a shift they have read all of it. */
const Cut = {
  i: 0, on: false, full: '', typed: 0, typing: false,

  start() {
    this.i = 0; this.on = true; G.state = 'cut';
    $('#nameScreen').classList.remove('on');
    $('#lookScreen').classList.remove('on');
    const el = $('#cutscene');
    /* Written whole rather than toggled: this screen is also the induction page
       (Boot.help), which leaves `plain` behind it, and the beat kinds leave a
       k-* behind them. */
    el.className = 'screen on';
    Cine.begin();
    this.dots();
    this.show();
    el.onclick = () => this.next();
    /* The letterbox closes ON the opening rather than being there when it
       arrives, so the first thing that happens is a camera being set up. */
    requestAnimationFrame(() => { if (this.on) el.classList.add('framed'); });
  },

  show() {
    const c = CUT[this.i] || {}, el = $('#cutscene');
    el.classList.remove('k-scene', 'k-line', 'k-title');
    el.classList.add('k-' + (c.k || 'scene'));
    $('#cutFace').textContent = c.f || '';
    $('#cutLabel').textContent = c.l || '';
    this.full = String(c.t || '');
    /* The finished sentence, invisible, so the caption is already the height it
       will end up and the lower third does not grow a line under the reader. */
    $('#cutGhost').textContent = this.full;
    /* Reduced motion gets the whole line at once: a caret ticking across a
       sentence is motion whatever the stylesheet says, and the text speed
       setting is the one the player already chose for dialogue. */
    this.typed = FX.motion ? 0 : this.full.length;
    this.setTyping(this.typed < this.full.length);
    this.paint();
    /* Re-run the entrance, which is what makes a beat read as a change of shot
       rather than as text being swapped in place. */
    const card = $('#cutCard');
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    /* WHICH BUILDING THIS SHOT IS IN. The opening is a journey — reception,
       four flights, the floor, and back down — and reception stopped being the
       bottom of the fourth-floor grid the day the lobby became a level of its
       own. Every camera after that was still written in one map's coordinates,
       so the whole choreography pointed off the edge of the level it was
       actually drawing and the camera sat clamped in a corner for all
       seventeen beats.
       A beat names its level only when it CHANGES it: the opening starts where
       the shift starts and says so once, going up, and once coming back. That
       keeps sixteen of the seventeen beats free of bookkeeping and means a beat
       inserted between two is on the right floor by default. */
    const want = this.levelAt(this.i);
    if (want && want !== Levels.current) Levels.go(want, 'start', { quiet: true, cinema: true });
    if (c.cam) { el.classList.add('world'); Cine.aim(c.cam[0], c.cam[1], c.len || 2.4); }
    this.dots();
    Sfx.cut();
  },

  /* The nearest `level:` at or before this beat, and the level a shift begins
     on when no beat has named one yet. Read back through the list rather than
     kept as state, so skipping, replaying or jumping to a beat all land on the
     same answer. */
  levelAt(i) {
    for (let j = Math.min(i, CUT.length - 1); j >= 0; j--) if (CUT[j] && CUT[j].level) return CUT[j].level;
    return Levels.first();
  },

  setTyping(v) { this.typing = v; $('#cutscene').classList.toggle('typing', v); },
  paint() { $('#cutText').textContent = this.full.slice(0, Math.floor(this.typed)); },

  tick(dt) {
    if (!this.on || !this.typing) return;
    const before = this.typed;
    this.typed += dt * Dialogue.speed;
    /* One tick every few characters actually revealed, not once a frame: the
       modulo-on-frame version stacked up oscillators. */
    if (Math.floor(this.typed / 3) !== Math.floor(before / 3)) Sfx.type();
    if (this.typed >= this.full.length) { this.typed = this.full.length; this.setTyping(false); }
    this.paint();
  },

  /* A press: finish the line, or move on. */
  next() {
    if (!this.on) return;
    if (this.typing) { this.typed = this.full.length; this.setTyping(false); this.paint(); Sfx.blip(); return; }
    this.i++;
    if (this.i >= CUT.length) { this.finish(); return; }
    this.show();
  },

  skip() {
    if (!this.on) return;
    Sfx.select();
    this.finish(true);
  },

  /* Space and Enter reach the screen whichever of its two jobs it is doing:
     the opening advances, and the induction page Boot.help() borrows it for
     closes. Without this, a press on the help page ran Cut.next() against a
     stale beat index and started the shift from the title screen. */
  press() {
    if (this.on) { this.next(); return; }
    const el = $('#cutscene');
    if (el.classList.contains('on') && el.onclick) el.onclick();
  },

  /* The bars open and the grade lifts BEFORE the shift starts, so the opening
     ends by handing the camera over rather than by cutting to a HUD. `quick` is
     the skip, which is somebody saying get on with it: enough of an exit to
     read as one, not enough to be in the way. Reduced motion gets neither.

     `leaving` is what stops a second press arriving in the gap — Cut.on is
     already false, so press() would otherwise fall through to the induction
     page's handler. */
  leaving: false,
  finish(quick) {
    if (this.leaving) return;
    this.on = false;
    const el = $('#cutscene');
    el.onclick = null;
    el.classList.remove('typing', 'framed');
    const ms = !FX.motion ? 0 : quick ? 220 : 620;
    if (!ms) { el.classList.remove('world'); Game.begin(); return; }
    this.leaving = true;
    el.classList.add('leaving');
    setTimeout(() => {
      this.leaving = false;
      el.classList.remove('leaving', 'world');
      Game.begin();
    }, ms);
  },

  dots() {
    const box = $('#cutDots');
    if (box.children.length !== CUT.length) {
      box.innerHTML = '';
      CUT.forEach(() => box.appendChild(document.createElement('i')));
    }
    for (let n = 0; n < box.children.length; n++) {
      box.children[n].className = n < this.i ? 'done' : n === this.i ? 'now' : '';
    }
  }
};

/* ---------------- A level handed over by the editor ----------------
   editor.html can put the level it is editing into localStorage and open the
   game with `?try=<id>`. This is the whole of the game's side of that, and it
   is deliberately small and deliberately inert: no query string, no key, or a
   key naming a different level, and none of it runs.

   localStorage rather than sessionStorage, because the editor opens the game in
   a NEW TAB and keeps itself and its bench open behind it — and session storage
   belongs to one tab. A stale key costs nothing: it is only ever looked at when
   the URL asks for that exact level, and only the editor writes that URL.

   Why hand the level over at all rather than have the editor open
   `index.html?level=x`: the game loads from data/, so the simple version would
   play the FILE's level while you sit there looking at your edited one — a
   play button that silently ignores your work is worse than no play button.

   What crosses over is what makes a level a level and nothing else: its
   geometry and its objects, plus FURN and ZONES, which decide how everything
   in it is furnished and what the rooms are made of. All three are pure data.
   Writing and code do NOT cross: a dialogue `do()` and a move's `run()` are
   functions, JSON drops them, and rebuilding them would mean evaluating a
   string out of storage — which this project does not do anywhere. So a trial
   is a walk around your level with the file's writing in it, and it says so. */
const Trial = {
  KEY: GAME.id + '.trial',
  on: false,

  /* Present, parseable, and about the level the URL asks for. Anything else is
     a normal shift. */
  want() {
    try {
      const id = new URLSearchParams(location.search).get('try');
      if (!id) return null;
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return (p && p.level && p.level.id === id) ? p : null;
    } catch (_) {
      /* No storage (a file:// origin refuses it outright), or nonsense in it.
         Either way: play the game normally. */
      return null;
    }
  },

  /* The two shared tables are replaced in place rather than reassigned: they
     are top-level `const`s that every reader closes over by name. */
  table(live, next) {
    if (!next) return;
    Object.keys(live).forEach(k => { if (!(k in next)) delete live[k]; });
    Object.keys(next).forEach(k => { live[k] = next[k]; });
  },

  apply(p) {
    this.on = true;
    this.table(FURN, p.furn);
    this.table(ZONES, p.zones);
    const d = p.level;
    const objects = d.objects || [], desks = d.desks || [];
    const def = {};
    Object.keys(d).forEach(k => { if (k !== 'objects' && k !== 'desks') def[k] = d[k]; });
    /* The catalogue wants a furnish() and the editor can only send a list, so
       the list is replayed — exactly what a level created in the editor and
       pasted into data/levels.js would do. Cloned per build, because a level
       is built more than once and `add` keeps what it is given. */
    def.furnish = function () {
      objects.forEach(o => this.add(JSON.parse(JSON.stringify(o))));
      if (desks.length) this.desks = JSON.parse(JSON.stringify(desks));
    };
    LEVELS[d.id] = def;
  },

  /* Straight into the shift. No title, no name, no cutscene: you pressed a
     button in a level editor, and every screen between that and the level is
     one more thing between you and the thing you are checking. */
  begin(p) {
    Player.init('Tester');
    resetRun();
    Game.begin();
    /* AND THEN GO TO THE LEVEL YOU ASKED TO TRY. Game.begin() starts a shift,
       and a shift begins wherever the catalogue says it does — which has been
       the ground-floor lobby since the lobby became a floor of its own. So the
       play button walked you to reception and left you there: the level you had
       been drawing was built, was correct, was in the catalogue, and was two
       floors up. It worked before that only because the level a shift began on
       and the level people edit happened to be the same one.

       `p.entry` has been in the payload since the payload existed and this is
       the line that was supposed to read it. Quiet, because a transition is a
       fade and a zone banner and you have just pressed a button asking to look
       at something. */
    Levels.go(p.level.id, p.entry, { quiet: true });
    UI.zone((LEVELS[p.level.id] || {}).name || p.level.id);
    UI.objective(say('trialObjective', { level: (LEVELS[p.level.id] || {}).name || p.level.id }));
    Guide.clear && Guide.clear();
    setTimeout(() => UI.toast('🧪', say('trialTip')), 700);
  }
};

/* ---------------- Boot ---------------- */
const Boot = {
  init() {
    this.brand();
    R.init(); Sprites.load(); Tiles.load();
    /* Everybody is baked into people.png from their `look:`. Anybody whose
       look has changed in the data since that bake is dressed from the same
       components here instead — see Look.dressCast(). Asynchronous and never
       blocking, and in a build that is up to date it finds nobody and fetches
       nothing. */
    if (typeof Look !== 'undefined') Look.dressCast();
    /* One level is built here — whichever one the catalogue says a shift
       begins on, which is the lobby and has been since the lobby became a
       floor of its own. The rest of the catalogue is built the first time
       somebody goes there, which is what keeps this line the same length
       however many levels the catalogue grows to. */
    Levels.init();
    /* A level the editor handed over, if there is one. Before Levels.start, so
       the trial level is the one that gets built. */
    const trial = Trial.want();
    if (trial) Trial.apply(trial);
    Levels.start(trial ? trial.level.id : Levels.first(), (trial && trial.entry) || 'start');
    NPCM.spawn(); bindInput();
    Arcade.init();
    Track.init();
    Settings.load();
    Player.init('Trainee'); UI.hud();
    Title.init();
    $('#btnNew').onclick = () => { this.goFullscreen(); this.newGame(); };
    $('#btnLoad').onclick = () => { this.goFullscreen(); this.load(); };
    $('#btnHelp').onclick = () => this.help();
    /* Asked again here: two of the three ways in go through this button, and a
       browser that declined the first request often grants a later one. No-ops
       once it has worked. */
    $('#btnName').onclick = () => { this.goFullscreen(); this.acceptName(); };
    /* On the screen from the first frame of the opening, and it stops the
       press reaching the surface behind it — which advances a beat. */
    $('#btnSkip').onclick = e => { e.stopPropagation(); Cut.skip(); };
    $('#btnLookRandom').onclick = () => Look.random();
    $('#btnLookGo').onclick = () => { this.goFullscreen(); Look.accept(); };
    $('#nameInput').addEventListener('keydown', e => { if (e.code === 'Enter') this.acceptName(); e.stopPropagation(); });
    this.refreshLoadButton();
    /* After refreshLoadButton, which is what decides where the selection starts:
       with a shift in progress the default answer is Continue, without one it is
       Start, and Title.sync reads that off the button rather than knowing it. */
    Title.show();
    if (trial) Trial.begin(trial);
    requestAnimationFrame(Game.loop);
  },
  /* A mobile browser spends a third of the phone on its own chrome and this
     game fits its layout to the pixels it is given. Must be requested inside
     the click — the only place a browser grants it — and is allowed to fail
     (a refusal, iOS Safari, a user who said no), so the rejection is
     swallowed. No orientation lock: the game is built for both ways up. */
  goFullscreen() {
    try {
      const el = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const go = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!go) return;
      const r = go.call(el, { navigationUI: 'hide' });
      if (r && r.catch) r.catch(() => {});
      /* No orientation lock. The game is built for both ways up — the mobile
         suite tests portrait and landscape — and deciding which way somebody
         holds their phone is not this button's business. */
    } catch (_) { /* not available: play in the tab */ }
  },
  newGame() {
    Sfx.init();
    /* Don't quietly overwrite a shift somebody is part-way through. */
    if (Save.has() && !confirm(say('overwriteSave'))) return;
    Sfx.select();
    G.state = 'name';
    Title.hide();
    $('#titleScreen').classList.remove('on');
    $('#nameScreen').classList.add('on');
    setTimeout(() => $('#nameInput').focus(), 120);
  },
  acceptName() {
    const v = ($('#nameInput').value || '').trim() || pick(says('defaultNames'));
    Player.init(v.slice(0, 14));
    resetRun();
    Sfx.select();
    /* Section 2 of the form. It brings the wardrobe in itself — nothing has
       been fetched for it up to this point — and hands on to the cutscene. */
    Look.open();
  },
  /* THE NAME ON THE DOOR is GAME in data/game.js, written into the page here
     so a new title never edits markup to be called something else. */
  brand() {
    const set = (sel, v) => { const el = $(sel); if (el && v !== undefined) el.textContent = v; };
    document.title = GAME.title;
    set('#titleLine1', String(GAME.title).toUpperCase());
    set('#titleLine2', String(GAME.sub || '').toUpperCase());
    set('#heroCo', GAME.company);
    const tg = $('#tagline');
    if (tg) tg.innerHTML = esc(say('tagline')) + '<small>' + esc(say('taglineSmall')) + '</small>';
  },
  /* Show what is actually in the save rather than a permanently hopeful button. */
  refreshLoadButton() {
    const b = $('#btnLoad'), n = $('#btnNew'), s = Save.peek();
    if (!s) {
      b.disabled = true; b.textContent = say('noSave');
      b.title = say('noSaveTitle');
      b.classList.remove('primary'); n.classList.add('primary');
      Title.sync();
      return;
    }
    b.disabled = false;
    /* textContent, so no escaping — esc() here would render a literal &amp; */
    b.textContent = say('continueSave', { name: s.name || say('defaultName'), day: s.day || 1, time: clockStr(s.minutes || DAY_START) });
    /* With a shift in progress, continuing is the expected action; starting over
       is the one that throws work away, so it should not look like the default. */
    b.classList.add('primary'); n.classList.remove('primary');
    n.textContent = say('newSave');
    Title.sync();
  },
  load() {
    if (!Save.has()) { Sfx.deny(); return; }
    Sfx.init();
    Title.hide();
    $('#titleScreen').classList.remove('on');
    $('#game').classList.add('on');
    R.resize();
    if (!Save.read()) { $('#game').classList.remove('on'); $('#titleScreen').classList.add('on'); Title.show(); return; }
    G.state = 'play'; Cam.snap();
    /* the objective survives in the save but lives in the DOM, so put it back */
    UI.objective(G.objective || Q.idle());
    UI.hudDirty();
    /* The room you are standing in, then the level, then the company. The last
       of those was the only fallback there was, which on a restored shift that
       was saved on a beach announced the name of an office block over the
       sea. */
    const z = ZONES[World.zoneAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE))];
    UI.zone((z && z.name) || (World.def && World.def.name) || GAME.company);
  },
  /* The induction page borrows the opening's screen, and `plain` is what stops
     it arriving as one: no letterbox, no camera, no typing, no skip — the
     laminated sign this always was, scrolling, because it is very long. */
  help() {
    G.state = 'cut';
    Title.hide();
    $('#titleScreen').classList.remove('on');
    const el = $('#cutscene');
    el.className = 'screen plain on';
    $('#cutLabel').textContent = say('helpLabel');
    $('#cutFace').textContent = '🧭';
    $('#cutGhost').textContent = '';
    $('#cutText').innerHTML =
      '<span class="who">' + say('helpWho') + '</span>'
      + says('helpIntro').join('<br><br>') + '<br><br>'
      + (TOUCH
        ? (Hand.pad === 'dpad'
            ? 'Walk with the pad in the bottom-' + Hand.padSide() + '.'
            : 'Walk by putting a thumb down anywhere in the bottom-' + Hand.padSide() + ' of the screen and pushing — the stick comes to your thumb, and how far you push it is how fast you walk.')
          + ' Tap <b>E</b> to talk to people, inspect objects, and answer ringing phones. Once someone is talking, tap the conversation box to carry on and tap a reply to choose what to say. <b>☰</b> opens your jobs, inventory and the rest. Left-handed, or would rather have a d-pad? <b>☰ · Menu</b> has both.'
        : 'Walk around with <b>WASD</b> or the arrow keys. Press <b>E</b> to talk to people, inspect objects, and answer ringing phones. Press <b>Space</b> to advance dialogue and <b>1–9</b> to choose what to say.') + '<br><br>' +
      says('helpBody').join('<br><br>');
    el.onclick = () => { el.onclick = null; el.classList.remove('on'); $('#titleScreen').classList.add('on'); Title.show(); G.state = 'title'; };
  }
};
addEventListener('DOMContentLoaded', () => Boot.init());
