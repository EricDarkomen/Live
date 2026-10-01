'use strict';
/* ---------------- The main loop ---------------- */
const Game = {
  acc: 0, mmT: 0, secT: 0, frozen: false, paused: false,
  /* An overlay hides the world, so it is drawn once, blurred, and left. */
  overlayUp() { return !!Combat.E || Panels.on || Comms.on || Arcade.on || G.state === 'ending'; },
  tick(dt) {
    if (this.paused) return;
    FX.update(dt);
    /* The title animates on this loop, as the arcade does; a no-op once it is gone. */
    Title.tick(dt);
    Dialogue.tick(dt);
    /* The world keeps moving behind panels, the comms console and the opening. */
    if (G.state === 'play' || G.state === 'dialogue' || G.state === 'panel'
      || G.state === 'comms' || G.state === 'cut') NPCM.update(dt);
    movePlayer(dt);
    Moves.update(dt);
    UI.quiet(dt);
    /* The car moves P, so it goes after the walk and before the camera. */
    /* Signals before cars, which obey them this frame. */
    Signals.update(dt);
    Cars.update(dt);
    Peds.update(dt);
    /* Shots fire from where the player ended up and land on whoever has moved. */
    readAim();
    Guns.update(dt);
    syncControls();
    Cut.tick(dt);
    /* The opening owns the camera while it runs. */
    if (Cine.on) Cine.camera(dt); else Cam.follow(dt);
    Interact.scan();
    Guide.check();
    Phones.tick(dt);
    /* Written work arrives beside the bells, on its own rules (Inbound). */
    Inbound.tick(dt);
    /* Minigames run on this loop, before the overlay check that stops the world. */
    if (Arcade.on) Arcade.frame(dt);
    if (G.state === 'play') {
      this.acc += dt * 1000;
      /* The pace is re-read every minute: crossing closing time changes it mid-frame. */
      let pace = Sky.pace();
      while (this.acc >= pace) {
        this.acc -= pace;
        G.minutes++;
        /* Midnight: a new day, with nobody moved. */
        if (G.minutes >= 1440) { G.minutes -= 1440; Sky.newDay(); }
        Sky.minute();
        /* Chat, mail, happenings and tiredness belong to working hours. */
        if (Sky.working()) {
          Chat.tick(); Mail.tick(); EventSys.tick();
          if (G.minutes % 7 === 0) Player.mod({ energy: -1 });
        }
        /* Texts arrive at any hour. */
        Texts.tick();
        /* The hourly autosave, throttled on real time (Save.auto()). */
        if (G.minutes % 60 === 0) Save.auto();
        /* Closing time, once a day (G.today.clockedOff). */
        if (G.minutes >= DAY_END && !G.today.clockedOff) {
          G.today.clockedOff = true; Report.post(); break;
        }
        pace = Sky.pace();
      }
      UI.hud();
    }
    /* The map four times a second, before the overlay check: the map screen is
       the one thing drawn while the world is covered. */
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
    /* The one door into play: it puts the opening's camera and stage back. */
    Cine.end();
    $('#game').classList.add('on');
    R.resize(); Cam.snap();
    G.state = 'play';
    UI.hud();
    /* Say where you actually are. */
    UI.zone((World.def && World.def.name) || GAME.company);
    UI.objective(say('firstObjective'));
    Guide.setObject('playerDesk', say('yourDesk'), 'foundDesk');
    setTimeout(() => UI.toast('🧭', (TOUCH
      ? (Hand.pad === 'dpad'
          ? 'Move with the pad on the ' + Hand.padSide() + '.'
          : 'Put a thumb down anywhere in the bottom-' + Hand.padSide() + ' and push — all the way to run.')
        + ' Tap <span class="kbd">E</span> to interact, <span class="kbd">JUMP</span> to jump.'
      : 'Move with <span class="kbd">WASD</span>, hold <span class="kbd">Shift</span> to run. Interact with <span class="kbd">E</span>, jump with <span class="kbd">Space</span>.')
      + ' ' + say('firstTip'), 'tip'), 900);
    setTimeout(() => UI.toast('🛎️', say('phoneTip', { press: TOUCH ? 'tap' : 'press' }), 'tip'), 14000);
    setTimeout(() => { if (!Phones.ringing.length) Phones.ringRandom(); }, 12000);
  }
};

/* ---------------- The opening's camera ----------------
   The opening is filmed on the real level with the real people, by owning
   the camera and hiding the HUD: nothing is shown until a beat asks for it,
   and every move is eased like Cam.follow. */
const Cine = {
  on: false,
  cx: 0, cy: 0,      /* where the camera is being asked to look, in world px */
  dx: 0, dy: 0,      /* the direction the current move came in on */
  rate: .04,
  /* A finished shot creeps a few pixels a second along its move, so it is never a still. */
  CREEP: 5,

  begin() {
    this.on = true;
    document.body.classList.add('cinema');
    R.cinema = true;
    /* The game canvas is on; body.cinema hides the HUD and controls. */
    $('#game').classList.add('on');
    R.resize();
    this.dx = 0; this.dy = 1;
    /* Start a little north, so the first named shot is a move, not a cut. */
    this.cx = P.x; this.cy = P.y - TILE * 5;
    Cam.x = Cam.bound(this.cx - Cam.w / 2, MAPW, Cam.w);
    Cam.y = Cam.bound(this.cy - Cam.h / 2, MAPH, Cam.h);
  },

  /* In tiles; `secs` is how long the move takes. */
  aim(tx, ty, secs) {
    const x = (tx + .5) * TILE, y = (ty + .5) * TILE;
    const d = Math.hypot(x - this.cx, y - this.cy);
    if (d > 1) { this.dx = (x - this.cx) / d; this.dy = (y - this.cy) / d; }
    this.cx = x; this.cy = y;
    /* Cam.follow's smoothing, solved to cover 96% of the distance in `secs`. */
    this.rate = Math.pow(.04, 1 / Math.max(.3, secs));
  },

  camera(dt) {
    this.cx += this.dx * this.CREEP * dt;
    this.cy += this.dy * this.CREEP * dt;
    const k = 1 - Math.pow(this.rate, dt);
    Cam.x = lerp(Cam.x, Cam.bound(this.cx - Cam.w / 2, MAPW, Cam.w), k);
    Cam.y = lerp(Cam.y, Cam.bound(this.cy - Cam.h / 2, MAPH, Cam.h), k);
  },

  /* Idempotent: every way into play calls it. */
  end() {
    this.on = false;
    R.cinema = false;
    document.body.classList.remove('cinema');
  }
};

/* ---------------- The opening ----------------
   CUT (data/office.js) holds the beats, their shapes and cameras. A press
   finishes the line before advancing, and Skip is on screen from the first frame. */
const Cut = {
  i: 0, on: false, full: '', typed: 0, typing: false,

  start() {
    this.i = 0; this.on = true; G.state = 'cut';
    $('#nameScreen').classList.remove('on');
    $('#lookScreen').classList.remove('on');
    const el = $('#cutscene');
    /* Written whole: the help page and the beat kinds leave classes behind. */
    el.className = 'screen on';
    Cine.begin();
    this.dots();
    this.show();
    el.onclick = () => this.next();
    /* The letterbox closes on the opening, so it starts with a camera being set up. */
    requestAnimationFrame(() => { if (this.on) el.classList.add('framed'); });
  },

  show() {
    const c = CUT[this.i] || {}, el = $('#cutscene');
    el.classList.remove('k-scene', 'k-line', 'k-title');
    el.classList.add('k-' + (c.k || 'scene'));
    $('#cutFace').textContent = c.f || '';
    $('#cutLabel').textContent = c.l || '';
    this.full = String(c.t || '');
    /* The finished sentence, invisible, so the caption never grows under the reader. */
    $('#cutGhost').textContent = this.full;
    /* Reduced motion gets the whole line at once. */
    this.typed = FX.motion ? 0 : this.full.length;
    this.setTyping(this.typed < this.full.length);
    this.paint();
    /* Re-run the entrance, so a beat reads as a new shot. */
    const card = $('#cutCard');
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    /* Which level a shot is on: a beat names `level:` only when it changes, and
       the level is switched quietly under the letterbox. */
    const want = this.levelAt(this.i);
    if (want && want !== Levels.current) Levels.go(want, 'start', { quiet: true, cinema: true });
    if (c.cam) { el.classList.add('world'); Cine.aim(c.cam[0], c.cam[1], c.len || 2.4); }
    this.dots();
    Sfx.cut();
  },

  /* The nearest `level:` at or before this beat, else where play begins; read
     back each time so skipping and replaying agree. */
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
    /* A tick every third character revealed. */
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

  /* Space and Enter serve both jobs of this screen: the opening and the help page. */
  press() {
    if (this.on) { this.next(); return; }
    const el = $('#cutscene');
    if (el.classList.contains('on') && el.onclick) el.onclick();
  },

  /* The bars open before play starts, so the opening hands the camera over.
     `quick` is Skip; reduced motion gets neither. `leaving` stops a second press
     in the gap falling through to the help page's handler. */
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

/* ---------------- Trying a level from the editor ----------------
   editor.html stores the level it is editing and opens `?try=<id>`. Only that
   exact id, with a stored payload, runs a trial. localStorage because the game
   opens in a new tab. What crosses is data only (the level, FURN, ZONES):
   functions do not survive JSON and nothing here evaluates strings, so a trial
   walks your level with the file's writing in it. */
const Trial = {
  KEY: GAME.id + '.trial',
  on: false,

  /* Present, parseable, and for the level the URL names; else a normal game. */
  want() {
    try {
      const id = new URLSearchParams(location.search).get('try');
      if (!id) return null;
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return (p && p.level && p.level.id === id) ? p : null;
    } catch (_) {
      /* No storage (file://) or nonsense in it: play normally. */
      return null;
    }
  },

  /* Replaced in place: they are consts every reader closes over. */
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
    /* The catalogue wants a furnish(); the editor sends a list, so it is replayed,
       cloned per build. */
    def.furnish = function () {
      objects.forEach(o => this.add(JSON.parse(JSON.stringify(o))));
      if (desks.length) this.desks = JSON.parse(JSON.stringify(desks));
    };
    LEVELS[d.id] = def;
  },

  /* Straight into play: no title, name or opening, then to the level being tried. */
  begin(p) {
    Player.init('Tester');
    resetRun();
    Game.begin();
    Levels.go(p.level.id, p.entry, { quiet: true });
    UI.zone((LEVELS[p.level.id] || {}).name || p.level.id);
    UI.objective(say('trialObjective', { level: (LEVELS[p.level.id] || {}).name || p.level.id }));
    Guide.clear();
    setTimeout(() => UI.toast('🧪', say('trialTip')), 700);
  }
};

/* ---------------- Boot ---------------- */
const Boot = {
  init() {
    this.brand();
    R.init(); Sprites.load(); Tiles.load();
    /* Anybody whose look changed since the bake is dressed from components (async). */
    Look.dressCast();
    /* Only the starting level is built now; the rest on first visit. */
    Levels.init();
    /* A trial level is applied before the first build. */
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
    /* Asked again: a browser that refused once often grants later. */
    $('#btnName').onclick = () => { this.goFullscreen(); this.acceptName(); };
    /* Skip must not let the press reach the opening behind it. */
    $('#btnSkip').onclick = e => { e.stopPropagation(); Cut.skip(); };
    $('#btnLookRandom').onclick = () => Look.random();
    $('#btnLookGo').onclick = () => { this.goFullscreen(); Look.accept(); };
    $('#nameInput').addEventListener('keydown', e => { if (e.code === 'Enter') this.acceptName(); e.stopPropagation(); });
    this.refreshLoadButton();
    /* After refreshLoadButton, which decides whether Continue or Start is primary. */
    Title.show();
    if (trial) Trial.begin(trial);
    requestAnimationFrame(Game.loop);
  },
  /* Fullscreen reclaims the phone's browser chrome. Only grantable inside a
     click, and allowed to fail. No orientation lock: both ways up are supported. */
  goFullscreen() {
    try {
      const el = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const go = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!go) return;
      const r = go.call(el, { navigationUI: 'hide' });
      if (r && r.catch) r.catch(() => {});
    } catch (_) { /* not available: play in the tab */ }
  },
  newGame() {
    Sfx.init();
    /* Never quietly overwrite a game in progress. */
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
    /* The character creator, then the opening. */
    Look.open();
  },
  /* The title and tagline come from GAME and TEXT, so a new game never edits markup. */
  brand() {
    const set = (sel, v) => { const el = $(sel); if (el && v !== undefined) el.textContent = v; };
    document.title = GAME.title;
    set('#titleLine1', String(GAME.title).toUpperCase());
    set('#titleLine2', String(GAME.sub || '').toUpperCase());
    set('#heroCo', GAME.company);
    const tg = $('#tagline');
    if (tg) tg.innerHTML = esc(say('tagline')) + '<small>' + esc(say('taglineSmall')) + '</small>';
  },
  /* The Continue button says what is in the save. */
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
    /* textContent, so no escaping */
    b.textContent = say('continueSave', { name: s.name || say('defaultName'), day: s.day || 1, time: clockStr(s.minutes || DAY_START) });
    /* With a save, continuing is the default and starting over is not. */
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
    /* The objective is saved but lives in the DOM. */
    UI.objective(G.objective || Q.idle());
    UI.hudDirty();
    /* The room, else the level, else the company. */
    const z = ZONES[World.zoneAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE))];
    UI.zone((z && z.name) || (World.def && World.def.name) || GAME.company);
  },
  /* The help page borrows the opening's screen, plain: no letterbox, camera or typing. */
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
        : 'Walk around with <b>WASD</b> or the arrow keys, and hold <b>Shift</b> to run. Press <b>E</b> to talk to people, inspect objects, and answer ringing phones. Press <b>Space</b> to advance dialogue and <b>1–9</b> to choose what to say.') + '<br><br>' +
      says('helpBody').join('<br><br>');
    el.onclick = () => { el.onclick = null; el.classList.remove('on'); $('#titleScreen').classList.add('on'); Title.show(); G.state = 'title'; };
  }
};
addEventListener('DOMContentLoaded', () => Boot.init());
