'use strict';
const Menu = {
  _done() { Settings.save(); Panels.render(); },
  save() { Save.write(); },
  load() { Save.read(); Panels.close(); },
  newgame() { if (confirm(say('eraseSave'))) { localStorage.removeItem(SAVE_KEY); location.reload(); } },
  sound() { Sfx.on = !Sfx.on; if (Sfx.on) Sfx.init(); else Sfx.holdMusic(false); this._done(); },
  music() { Sfx.music = !Sfx.music; if (!Sfx.music) Sfx.holdMusic(false); this._done(); },
  vol() { Sfx.setVolume(Sfx.volume >= 0.6 ? 0.08 : Sfx.volume + 0.14); this._done(); },
  anim() { R.animate = !R.animate; this._done(); },
  /* Cycles rather than toggles, because there are three of them and a phone's
     settings row has space for one button. Ordered loudest to quietest, so
     somebody who came here to make it stop gets there in one press. */
  pops() {
    const order = ['all', 'needed', 'none'];
    Comms.pop = order[(order.indexOf(Comms.pop) + 1) % order.length];
    /* Said out loud on the channel that is always allowed to speak, so the
       setting demonstrates itself — including 'none', where the silence IS the
       answer and the count on the rail is what is left. */
    if (Comms.pop !== 'none') {
      UI.toast('🔔', say(Comms.pop === 'all' ? 'notify.all' : 'notify.needed'));
    }
    this._done();
  },
  motion() { FX.motion = !FX.motion; if (!FX.motion) { FX.parts.length = 0; FX.shakeAmt = 0; } this._done(); },
  emoji() { R.emojiScale = R.emojiScale >= 1.3 ? 0.85 : R.emojiScale + 0.15; R._fontCache.clear(); this._done(); },
  speed() { Dialogue.speed = Dialogue.speed >= 200 ? 30 : Dialogue.speed >= 100 ? 999 : Dialogue.speed + 40; this._done(); },
  southpaw() { Hand.left = !Hand.left; Hand.apply(); Sfx.select(); this._done(); },
  padstyle() { Hand.pad = Hand.pad === 'dpad' ? 'stick' : 'dpad'; Hand.apply(); Sfx.select(); this._done(); },
  /* Entering has to happen inside this click — see Boot.goFullscreen. Leaving
     does not, but it belongs on the same button. */
  fullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const off = document.exitFullscreen || document.webkitExitFullscreen;
      if (off) { const r = off.call(document); if (r && r.catch) r.catch(() => {}); }
    } else Boot.goFullscreen();
    Sfx.select();
    /* The state only changes once the browser says so, and it may refuse. */
    setTimeout(() => Panels.render(), 220);
  }
};

/* ---------------- SaveSystem ---------------- */
const Save = {
  write(quiet) {
    /* A trial is somebody checking a level in the editor, and the hourly
       autosave would quietly overwrite the shift they actually have. */
    if (typeof Trial !== 'undefined' && Trial.on) return false;
    try {
      /* Fold the level you are standing on into G.levelState first. The evicted
         levels put themselves there on the way out; the live one has never been
         asked, and without this the save records every level's state except the
         one the player has actually been changing. */
      Levels.freeze();
      const data = { P: { ...P }, G: { ...G }, v: 2, at: Date.now() };
      delete data.G.activeEvent;      /* holds a function; not serialisable */
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (!quiet) UI.toast('💾', say('saved'), 'good');
      return true;
    } catch (e) { if (!quiet) UI.toast('💾', say('saveFailed'), 'bad'); return false; }
  },
  /* THE AUTOSAVE, which is the hourly one and is not the same call as a save
     somebody asked for. Two reasons it is its own function rather than a
     `write(true)` at the call site:

     It runs on the WHOLE clock now, not only the shift. The evening used to be
     ninety seconds of walking to a car park and there was nothing out there to
     lose; it is a town, a coast road and an island, and an evening spent in it
     was an evening no save was ever written of — close the tab at eleven and
     you were back at five.

     And a game hour is not one length any more. At MS_PER_GAME_MIN a working
     hour is twenty-six seconds of real time, which is what this has always
     cost; in the small hours, at a twelfth of that pace, "every hour" is every
     two seconds, and a JSON serialisation of the whole run every two seconds is
     a phone getting warm for nothing. So the floor is real time, and it is set
     a shade UNDER the working hour rather than at it: at exactly twenty-six
     seconds, a frame's hitch either side of the boundary would start silently
     dropping the day's own autosaves, which are the ones that have always
     happened. The day is unchanged; the night is written down about as often
     as an afternoon is. */
  AUTO_MIN_MS: 20000,
  auto() {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this._autoAt !== undefined && t - this._autoAt < this.AUTO_MIN_MS) return false;
    this._autoAt = t;
    return this.write(true);
  },
  has() { return !!this.peek(); },
  /* Read the header without applying it — used by the title screen. */
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
      /* Start from pristine defaults so a save written by an older build cannot
         leave new fields undefined and take the game down mid-frame. */
      resetRun();
      Object.assign(P, d.P); Object.assign(G, d.G);
      G.totals = Object.assign(freshTotals(), G.totals || {});
      G.todayStats = G.todayStats || {}; G.flags = G.flags || {}; G.quests = G.quests || {};
      G.achievements = G.achievements || {}; G.rel = G.rel || {}; G.callers = G.callers || {};
      G.endings = G.endings || [];
      G.minds = G.minds && typeof G.minds === 'object' ? G.minds : {};
      G.discovered = G.discovered || {}; G.chatSent = G.chatSent || {};
      G.mailSent = G.mailSent || {}; G.textSent = G.textSent || {};
      /* A SAVE WRITTEN BEFORE THE CHANNELS EXISTED carried G.chat and G.mail —
         two flat lists and two counters. They are read back into the channels
         that replaced them rather than dropped, because a shift restored at
         four o'clock with an empty inbox is a shift that has lost half its
         afternoon. Everything else that used to go into the toast box is not
         recoverable and is not pretended to be: there was no history kept of
         it, which is the fault this whole arrangement exists to fix.
         Anything unrecognised is left alone — the channel list is allowed to
         grow, and an old save must not take the new ones out. */
      G.comms = Object.assign({ mail: [], text: [], chat: [], log: [], calls: [] }, G.comms || {});
      CHANNELS.forEach(c => { if (!Array.isArray(G.comms[c.id])) G.comms[c.id] = []; });
      if (Array.isArray(d.G.mail) && !G.comms.mail.length) {
        d.G.mail.forEach(m => G.comms.mail.push({ ch: 'mail', id: 'mail:old' + (++Comms.seq),
          t: m.t, r: true, face: '✉️', thread: m.from, from: m.from, subj: m.s, body: m.b, k: '' }));
      }
      if (Array.isArray(d.G.chat) && !G.comms.chat.length) {
        d.G.chat.forEach(m => G.comms.chat.push({ ch: 'chat', id: 'chat:old' + (++Comms.seq),
          t: m.t, r: true, face: m.face, thread: m.ch, from: m.who, body: m.msg, k: '' }));
      }
      delete G.chat; delete G.mail; delete G.unread; delete G.unreadMail;
      P.equipment = Object.assign(emptyKit(), P.equipment || {});
      P.inventory = Array.isArray(P.inventory) ? P.inventory.filter(i => ITEMS[i]) : [];
      P.skills = P.skills || {};
      G.activeEvent = null;
      G.state = 'play';
      /* The face the shift was saved with. Its components are fetched here if
         it is not the default the build baked — and deliberately not waited
         on: until they arrive the player is the baked row, which is a person
         rather than a hole. A save written before the creator existed has no
         `look` and simply keeps that row. */
      if (G.look) Look.apply();
      /* Back onto the level the shift was saved on, with what that level
         remembered reapplied as it is rebuilt. After the assign above, so
         G.level and G.levelState are the saved ones and not the defaults
         resetRun() just put there — and it restores the saved position rather
         than the entry point, because you are where you were standing, not at
         the door you last came through. */
      Levels.resume();
      /* The season the save was written in decides what the ground outside is
         made of, and the ground is baked. Say so before the first frame, or a
         shift loaded in December is played on August's grass until something
         else happens to invalidate the tiles. */
      Sky.resume();
      Player.recalc(); Cam.snap(); UI.hudDirty(); Guide.restore();
      /* The rail is the one piece of HUD that is not rewritten every frame, so
         a restored shift has to be told its counts once. */
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
    /* Respect the operating system's reduced-motion preference by default. */
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
    /* How much of the office is allowed to interrupt you. Validated against
       the three it can be rather than trusted: this comes out of
       localStorage, and an unrecognised value would silently mean "pops(),
       default branch" for ever. */
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

/* ---------------- End of shift report ----------------
   FIVE O'CLOCK USED TO BE A DOOR SLAMMING. The minute the clock reached it the
   world froze, a full-screen performance summary went up over whatever you were
   doing, and the only thing on it you could press said "Clock out". If you were
   at your desk that was a summary. If you were halfway round a roundabout in a
   pool car — which the game has allowed for some time now — it was the game
   taking the wheel off you to show you a spreadsheet.

   The clock stopped being a curtain in engine/sky.js, for the same reason and
   in the same words: the shift ending is not the day ending. This is the other
   half of that. Five o'clock is now a LINE, not a screen. The queue closes, the
   toast says so, the figures are written, and nothing is taken away from you —
   and the report itself moves to where every other piece of this company's
   paperwork already lives, the portal, where it can be read at five past, or at
   nine that evening, or never.

   Which has a second effect worth having: the page is live. It is today's
   figures whenever you open it, so a shift is something you can check at half
   eleven rather than a verdict delivered once, after everything it describes is
   already over. See Panels.r_shift(). */
const Report = {
  /* Today's numbers, in the order a person would read them. Today's, not the
     lifetime totals — reading them off G.totals made every day after the first
     look like a triumph.

     `covered` is the newest row and it is here rather than in the middle,
     beside the other call figures, because of what it says: these are the calls
     the floor took while you were out of the building. A day spent driving is a
     day with a small tally, and this is the line that explains why rather than
     letting the player think the queue simply went quiet. It is omitted when it
     is nought, because on a day spent at the desk it is not a fact about
     anything. */
  rows() {
    const t = G.todayStats;
    /* The labels are TEXT's `report.*`, so a game renames what it counts
       without touching the arithmetic. */
    const L = k => say('report.' + k);
    const r = [
      [L('calls'), t.calls || 0],
      [L('satisfied'), t.satisfied || 0],
      [L('angered'), t.angered || 0],
      [L('transfers'), t.transfers || 0]
    ];
    /* ANSWERED IN WRITING, and it is a subset of the line above rather than a
       second one beside it — an email you replied to is a contact handled and
       is counted in `calls` like everything else. Said separately because it
       is the one kind of work in this building that followed you off the
       premises, which is a fact about the day and not about the tally. Omitted
       at nought, like the cover line: on a day spent entirely on the phones it
       is not a fact about anything.
       And the OTHER half of it — what is still sitting there — because a shift
       that ended with four unanswered complaints in the inbox should say so on
       the page that grades it. */
    if (t.written) r.push([L('written'), t.written]);
    const owed = typeof Comms !== 'undefined' ? Comms.pending() : 0;
    if (owed) r.push([L('owed'), owed]);
    if (t.covered) r.push([L('covered'), t.covered]);
    /* Everything else `count()` has been asked to tally today, labelled by
       `report.<stat>` — a stat with no label is not shown, which is how a game
       decides what its report is about. XP and money always are. */
    const done = new Set(['calls', 'satisfied', 'angered', 'transfers', 'written', 'covered', 'xp', 'money']);
    const extra = Object.keys(t).filter(k => !done.has(k) && typeof TEXT !== 'undefined' && TEXT['report.' + k])
      .map(k => [L(k), t[k] || 0]);
    return r.concat(extra, [[L('xp'), t.xp || 0], [L('money'), cash(t.money || 0)]]);
  },
  /* The rating, which is the joke, and the footnote, which is the joke's
     second half. Not shown before five: a verdict on a shift that is still
     running is the one thing this company has never actually done. */
  verdict() {
    const t = G.todayStats, calls = t.calls || 0;
    const v = says('verdicts').map(x => x.split(' | '));
    let vi = 4;
    if (calls >= 12 && P.rep > 40) vi = 0;
    else if (calls >= 8 && P.rep > 15) vi = 1; else if (calls >= 4) vi = 2; else if (calls >= 2) vi = 3;
    return v[vi];
  },
  /* What the evening says on the way out. Drawn once per clock-out rather than
     on every render, so opening the page twice does not reshuffle the world
     behind it — it is a thing that happened, not a slot machine. */
  get LEAVING() { return says('leaving'); },
  /* CLOCKING OFF. What used to be spread across show() and next() and a button
     nobody chose to press: the queue closes, the day is written down, and one
     line goes into the notification log. The world is not touched. You are
     standing where you were standing at 16:59, doing whatever you were doing,
     and the evening is already yours — see the note over Sky.pace(). */
  post() {
    Sfx.holdMusic(false);
    Phones.clearAll();
    G.flags.leaving = pick(this.LEAVING);
    Ach.get('a_first');
    Q.restand();
    UI.toast('🌅', say('dayOver', { where: TOUCH ? '<b>☰ · ' + (TEXT['tab.shift'] ? say('tab.shift') : 'Shift') + '</b>' : 'press <span class="kbd">T</span>' }), 'gold');
    Hook('dayEnd', G.day);
    Save.write(true);
    UI.hud();
  }
};

/* ---------------- Endings ---------------- */
/* ENDINGS, the text of them, is in data/office.js. */
const Endings = {
  /* WHICH ENDINGS ARE ON OFFER is each ENDINGS row's own business: a row may
     carry `when()` — a function of the game's state — and one without is
     always offered. The engine offers them once `G.flags.finalDone` is set,
     which is the game's to set, from whatever its last act is. */
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
