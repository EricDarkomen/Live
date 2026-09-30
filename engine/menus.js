'use strict';
/* ---------------- Settings buttons, saving, the day's report, endings ---------------- */
const Menu = {
  _done() { Settings.save(); Panels.render(); },
  save() { Save.write(); },
  load() { Save.read(); Panels.close(); },
  newgame() { if (confirm(say('eraseSave'))) { Save.erase(); location.reload(); } },
  sound() { Sfx.on = !Sfx.on; if (Sfx.on) Sfx.init(); else Sfx.holdMusic(false); this._done(); },
  music() { Sfx.music = !Sfx.music; if (!Sfx.music) Sfx.holdMusic(false); this._done(); },
  vol() { Sfx.setVolume(Sfx.volume >= 0.6 ? 0.08 : Sfx.volume + 0.14); this._done(); },
  anim() { R.animate = !R.animate; this._done(); },
  /* Cycles all → needed → none: loudest first, so "make it stop" is one press. */
  pops() {
    const order = ['all', 'needed', 'none'];
    Comms.pop = order[(order.indexOf(Comms.pop) + 1) % order.length];
    /* Said on the channel that always speaks, so the setting shows itself. */
    if (Comms.pop !== 'none') {
      UI.toast('🔔', say(Comms.pop === 'all' ? 'notify.all' : 'notify.needed'));
    }
    this._done();
  },
  motion() { FX.motion = !FX.motion; if (!FX.motion) { FX.parts.length = 0; FX.shakeAmt = 0; } this._done(); },
  emoji() { R.emojiScale = R.emojiScale >= 1.3 ? 0.85 : R.emojiScale + 0.15; R._fontCache.clear(); this._done(); },
  speed() { Dialogue.speed = Dialogue.speed >= 200 ? 30 : Dialogue.speed >= 100 ? 999 : Dialogue.speed + 40; this._done(); },
  /* The segmented choices in Settings: data-set="key:value". */
  set(k, v) {
    if (k === 'pops') {
      if (!['all', 'needed', 'none'].includes(v) || Comms.pop === v) return;
      Comms.pop = v;
      if (v !== 'none') UI.toast('🔔', say(v === 'all' ? 'notify.all' : 'notify.needed'));
    } else if (k === 'speed') Dialogue.speed = { slow: 30, normal: 62, fast: 150, instant: 999 }[v] || 62;
    else if (k === 'emoji') { R.emojiScale = { s: .85, m: 1, l: 1.3 }[v] || 1; R._fontCache.clear(); }
    else if (k === 'pad') { Hand.pad = v === 'dpad' ? 'dpad' : 'stick'; Hand.apply(); }
    else return;
    Sfx.select();
    this._done();
  },
  /* A slider, as it moves. Saved when it is let go. */
  range(k, v) { if (k === 'vol') Sfx.setVolume(clamp(v, 0, 100) / 100); },
  southpaw() { Hand.left = !Hand.left; Hand.apply(); Sfx.select(); this._done(); },
  padstyle() { Hand.pad = Hand.pad === 'dpad' ? 'stick' : 'dpad'; Hand.apply(); Sfx.select(); this._done(); },
  /* Entering must happen inside this click (Boot.goFullscreen). */
  fullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const off = document.exitFullscreen || document.webkitExitFullscreen;
      if (off) { const r = off.call(document); if (r && r.catch) r.catch(() => {}); }
    } else Boot.goFullscreen();
    Sfx.select();
    /* Redrawn once the browser has decided; it may refuse. */
    setTimeout(() => Panels.render(), 220);
  }
};

/* ---------------- Saving ---------------- */
const Save = {
  write(quiet) {
    /* A trial run from the editor must not overwrite the real save. */
    if (Trial.on) return false;
    try {
      /* Evicted levels fold their state into G.levelState as they go; the live
         one has to be asked. */
      Levels.freeze();
      const data = { P: { ...P }, G: { ...G }, v: 2, at: Date.now() };
      delete data.G.activeEvent;      /* holds a function; not serialisable */
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (!quiet) UI.toast('💾', say('saved'), 'good');
      return true;
    } catch (e) { if (!quiet) UI.toast('💾', say('saveFailed'), 'bad'); return false; }
  },
  /* The hourly autosave, throttled on real time: at night a game hour is two
     seconds, and serialising the run that often only warms the phone. */
  AUTO_MIN_MS: 20000,
  auto() {
    const t = performance.now();
    if (this._autoAt !== undefined && t - this._autoAt < this.AUTO_MIN_MS) return false;
    this._autoAt = t;
    return this.write(true);
  },
  has() { return !!this.peek(); },
  /* Blocked storage throws; the page reload that follows must still happen. */
  erase() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing was saved */ } },
  /* The header without applying it, for the title screen. */
  peek() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || !d.P || !d.G) return null;
      return { name: d.P.name, day: d.G.day, minutes: d.G.minutes, level: d.P.level, at: d.at };
    } catch (e) { return null; }
  },
  read() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || !d.P || !d.G) { UI.toast('↻', say('noSaveFound'), 'bad'); return false; }
      /* Fresh defaults first, so the save only overlays what it has. */
      resetRun();
      Object.assign(P, freshPlayer(), d.P); Object.assign(G, d.G);
      /* Items the game no longer defines are dropped. */
      P.inventory = P.inventory.filter(i => ITEMS[i]);
      G.activeEvent = null;
      G.state = 'play';
      /* The saved look is fetched and not waited on: the baked row stands in. */
      if (G.look) Look.apply();
      /* Back onto the saved level and position, with its remembered state. */
      Levels.resume();
      /* Rebake the ground for the saved season before the first frame. */
      Sky.resume();
      Player.recalc(); Cam.snap(); UI.hudDirty(); Guide.restore();
      /* The comms rail is not redrawn every frame; tell it the counts once. */
      Comms.sync();
      UI.toast('↻', say('restored', { day: G.day, time: clockStr(G.minutes) }), 'good');
      return true;
    } catch (e) { console.warn(e); UI.toast('↻', say('saveCorrupt'), 'bad'); return false; }
  }
};

/* Settings live apart from the save file, so they survive a new game. */
const Settings = {
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) { s = null; }
    /* The OS reduced-motion preference is the default. */
    const prefersCalm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    s = s || {};
    Sfx.on = s.sound !== false;
    Sfx.music = s.music !== false;
    Sfx.setVolume(typeof s.volume === 'number' ? s.volume : 0.32);
    R.animate = s.animate !== false;
    FX.motion = typeof s.motion === 'boolean' ? s.motion : !prefersCalm;
    R.emojiScale = typeof s.emojiScale === 'number' ? clamp(s.emojiScale, 0.7, 1.6) : 1;
    Dialogue.speed = typeof s.textSpeed === 'number' ? clamp(s.textSpeed, 20, 999) : 62;
    Hand.left = s.southpaw === true;
    Hand.pad = s.pad === 'dpad' ? 'dpad' : 'stick';
    /* Validated, not trusted: it comes out of localStorage. */
    Comms.pop = ['all', 'needed', 'none'].indexOf(s.pop) >= 0 ? s.pop : 'needed';
    Hand.apply();
  },
  save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        sound: Sfx.on, music: Sfx.music, volume: Sfx.volume, animate: R.animate,
        motion: FX.motion, emojiScale: R.emojiScale, textSpeed: Dialogue.speed,
        southpaw: Hand.left, pad: Hand.pad, pop: Comms.pop
      }));
    } catch (e) { /* private browsing; settings just won't persist */ }
  }
};

/* ---------------- The day's report ----------------
   Closing time is a line, not a screen: the queue closes, the day is written
   down and one toast says so. The report itself is a live page (Panels.r_shift)
   that can be read at any time. */
const Report = {
  /* Today's numbers, labelled by TEXT's `report.*`. Written, owed and covered
     only show when they are not nought. */
  rows() {
    const t = G.todayStats;
    const L = k => say('report.' + k);
    const r = [
      [L('calls'), t.calls || 0],
      [L('satisfied'), t.satisfied || 0],
      [L('angered'), t.angered || 0],
      [L('transfers'), t.transfers || 0]
    ];
    if (t.written) r.push([L('written'), t.written]);
    const owed = Comms.pending();
    if (owed) r.push([L('owed'), owed]);
    if (t.covered) r.push([L('covered'), t.covered]);
    /* Anything else counted today shows if TEXT labels it; XP and money always do. */
    const done = new Set(['calls', 'satisfied', 'angered', 'transfers', 'written', 'covered', 'xp', 'money']);
    const extra = Object.keys(t).filter(k => !done.has(k) && TEXT['report.' + k])
      .map(k => [L(k), t[k] || 0]);
    return r.concat(extra, [[L('xp'), t.xp || 0], [L('money'), cash(t.money || 0)]]);
  },
  /* The day's rating. */
  verdict() {
    const t = G.todayStats, calls = t.calls || 0;
    const v = says('verdicts').map(x => x.split(' | '));
    let vi = 4;
    if (calls >= 12 && P.rep > 40) vi = 0;
    else if (calls >= 8 && P.rep > 15) vi = 1; else if (calls >= 4) vi = 2; else if (calls >= 2) vi = 3;
    return v[vi];
  },
  /* The closing line, drawn once per day so reopening the page keeps it. */
  get LEAVING() { return says('leaving'); },
  /* Closing time. Nothing about the world is touched. */
  post() {
    Sfx.holdMusic(false);
    Phones.clearAll();
    G.today.leaving = pick(this.LEAVING);
    Ach.get('a_first');
    Q.restand();
    UI.toast('🌅', say('dayOver', { where: TOUCH ? '<b>☰ · ' + say('tab.shift') + '</b>' : 'press <span class="kbd">T</span>' }), 'gold');
    Hook('dayEnd', G.day);
    Save.write(true);
    UI.hud();
  }
};

/* ---------------- Endings ----------------
   ENDINGS (data/office.js) rows may carry `when()`; one without is always
   offered. They are offered once the game sets G.flags.finalDone. */
const Endings = {
  available() {
    return Object.keys(ENDINGS).filter(k => {
      const w = ENDINGS[k].when;
      try { return typeof w !== 'function' || !!w(); } catch (e) { console.error('ENDINGS.' + k + '.when', e); return false; }
    });
  },
  offer() {
    G.flags.endingShown = true;
    const opts = this.available();
    Dialogue.say('🌅', say('endings.name'), say('endings.role'), says('endings.pages'),
      opts.map(k => ({ t: ENDINGS[k].t, to: null, do() { Endings.show(k); } })));
  },
  show(k) {
    const e = ENDINGS[k];
    if (!G.endings.includes(k)) G.endings.push(k);
    G.state = 'ending';
    Sfx.holdMusic(false); Sfx.levelup();
    $('#endBody').innerHTML = '<div class="ending-title">' + e.t + '</div>' +
      e.b.map(p => '<p class="ending-text">' + esc(p) + '</p>').join('') +
      '<div class="h2">' + say('final.title') + '</div>' +
      [[say('final.level'), P.level + ' · ' + RANKS[P.rank].n], [say('final.calls'), G.totals.calls], [say('final.days'), G.day],
       [say('final.achs'), Ach.count() + ' / ' + Object.keys(ACHS).length], [say('final.endings'), G.endings.length + ' / ' + Object.keys(ENDINGS).length]]
        .map(([a, b]) => '<div class="rep-row"><span>' + a + '</span><span>' + b + '</span></div>').join('') +
      '<p style="margin-top:16px;color:var(--dim);font-size:13px;font-style:italic">' + say('final.sign') + '</p>';
    $('#ending').classList.add('on');
    Save.write();
  }
};
