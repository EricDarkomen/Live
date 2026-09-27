'use strict';
/* ---------------- The sky: the clock past five, the light, the weather ----
   Until now the game had eight hours in it. The clock started at 09:00, ran to
   17:00, and at 17:00 the world was taken away, the report went up, and
   dismissing it put you back at the security desk on a new day with full
   patience — which is to say the shift did not end, it CUT. You were moved and
   the world was rebuilt around you, and the one thing a game about a job should
   never do is take the evening off you.

   So the clock does not stop any more. It runs 00:00 to 24:00 and rolls over at
   midnight, the report is a report on the shift rather than a curtain, and
   clocking out leaves you standing exactly where you were standing at 16:59,
   in a building that is going dark. The day changes at midnight, like a day.

   Three things live here, because they are three faces of the same fact:

     THE CLOCK BEYOND THE SHIFT. pace() is how long a game minute lasts, and it
     is not one number: the working day is the pace it always was, and the
     evening and the small hours go faster, because they do. Sixteen hours at
     the shift's pace is seven minutes of real time spent walking round an empty
     office, which is not a feature.

     THE LIGHT. sunPos() puts the sun somewhere, grade() says what that does to
     everything on screen, and R.draw() paints it. The sun's own hours come from
     the season, so a winter shift ends in the dark and a summer one does not —
     which is the whole reason anybody in this country notices what month it is.

     THE WEATHER. One state on G, so a save carries it. It picks itself from the
     season each morning, drifts during the day, dims the light, wets the road
     and falls past the camera.

   And the season is what the LPC terrain sheets are for: the same crop, four
   times, and the grass verge outside the building is green, then gold, then
   under snow, without a line of the level changing. See SURFACES in
   data/world.js and R.floorTile(). */

const Sky = {

  /* ---- the year ----
     A fortnight a season, so a player who sticks with it sees all four inside a
     normal run and the ground under the office changes colour while they are
     not looking. Day 1 is an autumn Monday: this is a call centre in a business
     park in October, which is the only time of year it has ever been. */
  SEASON_DAYS: 14,
  SEASONS: ['autumn', 'winter', 'spring', 'summer'],

  season() {
    const d = Math.max(1, G.day | 0);
    return this.SEASONS[Math.floor((d - 1) / this.SEASON_DAYS) % this.SEASONS.length];
  },
  seasonName() { const s = this.season(); return s[0].toUpperCase() + s.slice(1); },

  /* When the sun is up, per season, in minutes past midnight. British
     latitudes, rounded to something a person would say out loud. The winter
     pair is the point of the whole table: the sun sets at 16:05 and the shift
     has fifty-five minutes left to run, so you leave in the dark, which is the
     single most accurate thing this game says about working indoors. */
  SUN: {
    spring: { rise: 380, set: 1200 },   /* 06:20 → 20:00 */
    summer: { rise: 290, set: 1280 },   /* 04:50 → 21:20 */
    autumn: { rise: 430, set: 1090 },   /* 07:10 → 18:10 */
    winter: { rise: 485, set: 965 }     /* 08:05 → 16:05 */
  },
  sun() { return this.SUN[this.season()] || this.SUN.autumn; },

  /* ---- the clock ----
     Minutes past midnight, always, and G.minutes is kept inside 0..1439 by the
     rollover in Game.tick. Everything below reads this rather than G.minutes
     directly so that "half past four" means the same thing to all of it. */
  m() { const v = G.minutes % 1440; return v < 0 ? v + 1440 : v; },
  /* Inside the shift. The one question acts ask — `G.minutes >= DAY_END` used
     to answer it and cannot any more, because at 03:00 that is false and you
     are still not at work. */
  working() { const m = this.m(); return m >= DAY_START && m < DAY_END; },
  /* Clocked off and not yet clocked ON — which is a different thing from having
     clocked off, and the difference is the whole reason this exists: at 23:00
     the shift is behind you and at 03:00 it is in front of you, and one or two
     lines of writing care which. */
  smallHours() { return this.m() < DAY_START; },
  /* WHEN THE BUILDING HAS PEOPLE IN IT, which is not the same question as when
     the phones are on and is the one engine/npc.js asks. Nobody arrives at
     09:00: they arrive between quarter past eight and nine, and by the time the
     first call lands the floor is already full and somebody has already been
     to the kettle. Leaving is on the hour, because leaving always is. */
  STAFF_EARLY: 45,
  staffed() { const m = this.m(); return m >= DAY_START - this.STAFF_EARLY && m < DAY_END; },

  /* How long a game minute lasts, in ms. The working day is MS_PER_GAME_MIN and
     always was; everything after it is compressed, on the grounds that an
     evening goes faster than an afternoon and the small hours are gone before
     you have decided anything about them, which is the one genuinely true thing
     anybody knows about time.

     The whole of 17:00 → 09:00 comes to about a minute and a half of real time
     at these rates: long enough to walk out to the car park and see the
     streetlights come on, short enough that nobody is stuck watching it. */
  pace() {
    const m = this.m();
    if (this.working()) return MS_PER_GAME_MIN;
    /* The hour after five is the slowest of the compressed ones, and that is
       not a taste decision: it is the hour the floor empties in, and the floor
       empties by WALKING, which happens in real seconds and cannot be sped up
       to match a clock that has been. Run this hour at the evening's later rate
       and the last four people are still crossing the office at half nine. */
    if (m >= DAY_END && m < DAY_END + 60) return MS_PER_GAME_MIN / 1.5;
    if (m >= DAY_END && m < 1380) return MS_PER_GAME_MIN / 4;        /* 18:00 → 23:00 */
    if (m >= 1380 || m < 420) return MS_PER_GAME_MIN / 12;           /* 23:00 → 07:00 */
    return MS_PER_GAME_MIN / 4;                                      /* 07:00 → 09:00 */
  },

  /* Where the sun is, −1 (solar midnight) through 0 (the horizon) to 1 (noon).
     Continuous across sunrise and sunset because both halves are sine arcs
     pinned to the same two instants — a discontinuity here is a frame where the
     whole screen changes brightness, and you would see it every single day. */
  sunPos(m) {
    if (m === undefined) m = this.m();
    const { rise, set } = this.sun();
    const day = Math.max(1, set - rise);
    if (m >= rise && m <= set) return Math.sin(Math.PI * (m - rise) / day);
    const night = Math.max(1, 1440 - day);
    const since = m < rise ? (m + 1440 - set) : (m - set);
    return -Math.sin(Math.PI * since / night);
  },

  /* Is the sun down. Asked by the writing rather than by the renderer — a line
     about stepping out of a building says something different in December. */
  dark() { return this.sunPos() < 0.02; },

  /* ---- the weather ----
     `dim` is added to the light's own alpha, `col` is what the grade is dragged
     towards, `wet` is how much water ends up on the road, `fall` is what comes
     down and `rate` how much of it. Nothing here is a special case anywhere
     else: the renderer reads these five fields and knows no weather by name. */
  KINDS: {
    clear:    { n: 'Clear',     e: '☀️',  dim: 0,   col: '#ffffff', wet: 0,  fall: null,   rate: 0 },
    fair:     { n: 'Fair',      e: '🌤️', dim: .03, col: '#eef3fb', wet: 0,  fall: null,   rate: 0 },
    cloud:    { n: 'Cloudy',    e: '⛅',  dim: .09, col: '#c3ccda', wet: 0,  fall: null,   rate: 0 },
    grey:     { n: 'Overcast',  e: '☁️',  dim: .17, col: '#9aa4b4', wet: 0,  fall: null,   rate: 0 },
    drizzle:  { n: 'Drizzle',   e: '🌦️', dim: .21, col: '#8f9cae', wet: .55, fall: 'rain',  rate: .4 },
    rain:     { n: 'Rain',      e: '🌧️', dim: .28, col: '#7d8a9d', wet: 1,  fall: 'rain',  rate: 1 },
    downpour: { n: 'Downpour',  e: '⛈️',  dim: .40, col: '#5f6b7d', wet: 1,  fall: 'rain',  rate: 2.1, storm: true },
    fog:      { n: 'Fog',       e: '🌫️', dim: .22, col: '#aeb6c0', wet: .25, fall: null,   rate: 0, fog: .62 },
    sleet:    { n: 'Sleet',     e: '🌨️', dim: .30, col: '#8b96a8', wet: 1,  fall: 'sleet', rate: 1.2 },
    snow:     { n: 'Snow',      e: '❄️',  dim: .14, col: '#d7e2ee', wet: 0,  fall: 'snow',  rate: 1, lay: 1 }
  },
  /* What each season is likely to throw at you, as a bag to draw from. Written
     as repeats rather than weights because a bag is what it is, and because
     counting the entries is how you check it says what you meant: this country
     is overcast about a third of the time whatever the month, and the only
     season that gets a clear day worth the name is one of them. */
  BAGS: {
    spring: ['fair', 'cloud', 'cloud', 'grey', 'grey', 'drizzle', 'drizzle', 'rain', 'clear', 'fog'],
    summer: ['clear', 'clear', 'fair', 'fair', 'cloud', 'cloud', 'grey', 'rain', 'downpour', 'fair'],
    autumn: ['grey', 'grey', 'cloud', 'drizzle', 'drizzle', 'rain', 'rain', 'downpour', 'fog', 'fair'],
    winter: ['grey', 'grey', 'cloud', 'fog', 'sleet', 'sleet', 'rain', 'snow', 'snow', 'fair']
  },

  /* The live weather. Kept on G so that {...G} in Save.write carries it without
     Save knowing what weather is, exactly as the arcade's scores are:

       k     which of KINDS it is
       t     the minute it next reconsiders itself
       w     how wet the ground is, 0..1, which lags the rain by design — a road
             does not dry the instant it stops
       l     how much snow is lying, same idea and much slower
       f     how much fog there is, same idea again — it rolls in over the best
             part of an hour and takes longer than that to lift
       flash storm lightning, in seconds, counted down by the renderer */
  state() {
    if (!G.wx || !this.KINDS[G.wx.k]) G.wx = { k: 'grey', t: 0, w: 0, l: 0, f: 0, flash: 0 };
    /* A save written before fog had a depth of its own carries no `f`. Start it
       wherever the weather it was saved in belongs, so loading into a foggy
       morning is foggy rather than a minute of clear air that then closes in. */
    if (G.wx.f === undefined) G.wx.f = this.KINDS[G.wx.k].fog || 0;
    return G.wx;
  },
  kind() { return this.KINDS[this.state().k] || this.KINDS.grey; },
  wet() { return this.state().w || 0; },
  lying() { return this.state().l || 0; },
  /* How thick the fog is NOW, which is not the same as how thick the weather
     says it should be. Everything that draws fog asks this rather than
     kind().fog — that number is the target it is heading for. */
  fog() { return this.state().f || 0; },
  label() { const k = this.kind(); return k.e + ' ' + k.n; },

  /* Pick something new out of the season's bag. `soft` keeps it near what it
     already is — an overcast morning turns to drizzle, not to a clear sky —
     which is what makes a day feel like one day rather than ten. */
  roll(soft) {
    const st = this.state();
    const bag = this.BAGS[this.season()] || this.BAGS.autumn;
    let k = pick(bag);
    if (soft) {
      /* Two draws, keep the one closer to what is already happening. Cheap, and
         it does the job: a downpour is far more likely to become rain than to
         become a clear sky, without a transition table nobody would read. */
      const b = pick(bag);
      const d = x => Math.abs((this.KINDS[x] || this.KINDS.grey).dim - this.kind().dim);
      if (d(b) < d(k)) k = b;
    }
    st.k = k;
    /* Weather changes its mind every couple of hours, give or take. */
    st.t = this.m() + ri(70, 210);
  },

  /* ---- the day ----
     Called from Game.tick the moment the clock crosses midnight. This is what
     Report.next() used to do, minus the two things it should never have done:
     it does not move the player and it does not refill them. You are wherever
     you are and you are as tired as you are; the night below is what mends
     that, an hour at a time, because you slept. */
  newDay() {
    G.day++;
    const wasSeason = this._season;
    G.todayStats = {}; G.chatSent = {}; G.mailSent = {}; G.textSent = {}; G.eventCooldown = 8;
    G.flags.calls1 = true;
    /* Flags that describe today rather than the save. Leaving these set is how
       yesterday's briefing turns up in tomorrow's meeting room. `clockedOff` is
       the one that matters most: it is what stops five o'clock being announced
       again on every tick until midnight, and a day that started with it still
       set would never announce it at all. It is also what the shift page reads
       to decide whether the day it is showing is over — see Panels.r_shift() —
       so `leaving` goes with it, being the line that day ended on. */
    ['queueTriedToday', 'briefingToday', 'leftAtFive', 'clockedOff', 'leaving', 'coffeeBroken',
     'phonesDown', 'itDown', 'looClosed', 'audit', 'rodent', 'newSystem',
     'consultants', 'wifiDown', 'kettleDead', 'pigeonInside'].forEach(k => { delete G.flags[k]; });
    Phones.clearAll();
    this.roll(false);
    /* A season turning changes what the ground is made of, and the ground is
       baked. Throw the tiles and the minimap away or the verge outside stays
       the colour it was in August until something else happens to invalidate
       them, which might be never. */
    this._season = this.season();
    if (wasSeason && wasSeason !== this._season) {
      R.rebake(); R.levelChanged();
      setTimeout(() => UI.toast(this.kind().e, say('season', { season: this.seasonName().toLowerCase() }), 'gold'), 1200);
    }
    Save.write(true);
    UI.hud();
  },

  /* One game minute. Everything that happens per minute of the clock and is
     about the sky rather than about the office. */
  minute() {
    const st = this.state();
    const k = this.kind();
    const m = this.m();
    if (this._season === undefined) this._season = this.season();
    /* Time to think again — or the stored minute is one the clock will never
       reach, which is what a save written before this field existed, or one
       written across a midnight, looks like from here. Either way, reroll:
       the longest interval roll() ever sets is 210 minutes. */
    if (m >= st.t || st.t - m > 240) this.roll(true);
    /* Water on the ground follows the rain up quickly and down slowly, which is
       the whole difference between a wet road and a rainy one. */
    const target = k.wet || 0;
    st.w = target > st.w ? Math.min(target, st.w + .03) : Math.max(0, st.w - .006);
    const lay = (k.lay || 0);
    st.l = lay > st.l ? Math.min(1, st.l + .004) : Math.max(0, st.l - (this.season() === 'winter' ? .0015 : .006));
    /* And the fog, which used to be the one part of the weather with no depth
       to it at all: it was read straight off the KIND, so it arrived at full
       strength on the minute the weather changed its mind and was gone just as
       flatly an hour later. Fog does not do that. It comes down over the best
       part of an hour and it takes longer than that to lift, which is why it
       is still there at eleven when it was supposed to burn off at nine. */
    const fg = k.fog || 0;
    st.f = fg > st.f ? Math.min(fg, st.f + .022) : Math.max(0, st.f - .009);
    /* THE NIGHT. What Report.next() used to hand back in one lump at 09:00, paid
       out across the hours you were asleep instead — so a player who stays up
       walking round town starts the next shift short, which is correct, and is
       also the only punishment this game has ever been able to justify. */
    if (m >= 1380 || m < 420) {
      P.patience = Math.min(P.patMax, P.patience + P.patMax / 300);
      P.energy = Math.min(P.eneMax, P.energy + P.eneMax / 260);
    }
    if (k.storm && chance(.02)) st.flash = .42;
    /* Nine o'clock. The day was announced by Report.next() while a day started
       when a report was dismissed; it starts when the shift does now, which is
       both later and correct — nobody announces Tuesday at midnight. */
    if (m === DAY_START) {
      UI.zone(say('dayBanner', { day: G.day, name: DAYS[(G.day - 1) % 7] || DAYS[0] }));
      Q.restand();
      UI.toast('🌅', say('dayStart', { day: G.day, weather: this.label(), line: say('dayLines') }), 'gold');
      Save.write(true);
    }
  },

  /* A save has just been applied, or the game has just started. Everything here
     is derived state that is not in the save and must not be left over from
     whatever was on screen before: which season the baked tiles were baked for,
     and a weather state for a save written before there was one. */
  resume() {
    const st = this.state();
    if (!st.k || st.t === undefined) this.roll(false);
    const was = this._season;
    this._season = this.season();
    if (was !== this._season) { R.rebake(); R.levelChanged(); }
    /* The clock has jumped rather than run, so the floor has to be put on the
       right side of five o'clock rather than walked there. */
    if (typeof NPCM !== 'undefined' && NPCM.all && NPCM.all.length) NPCM.homeSnap();
  },

  /* ---- the light ----
     Stops along the sun's own arc. Each is a MULTIPLY colour and how much of it
     to apply: the frame is drawn as it always was and then this is laid over
     the whole viewport, so nothing that draws has to know what time it is. The
     numbers were picked by looking at the office at each of them. */
  STOPS: [
    [-1.00, [0x2b, 0x33, 0x58], .78],   /* the small hours: blue, and dark */
    [-0.30, [0x33, 0x3c, 0x66], .70],
    [-0.10, [0x4a, 0x44, 0x72], .55],
    [-0.02, [0x7a, 0x55, 0x70], .38],   /* civil twilight, and it is purple */
    [ 0.03, [0xc9, 0x8a, 0x5a], .30],   /* the sun on the horizon */
    [ 0.15, [0xe8, 0xbb, 0x8a], .16],   /* the golden hour, which lasts ten minutes */
    [ 0.40, [0xf4, 0xf0, 0xea], .05],
    [ 1.00, [0xff, 0xff, 0xff], .00]    /* noon in June, and nothing at all */
  ],

  /* The grade for right now: a colour to multiply the frame by and how much of
     it. `indoors` softens the lot, because the strip lights are on a timer that
     nobody has ever found and the fourth floor never goes fully dark — but it
     does go gloomy, and at three in the morning it should.

     Weather is folded in here rather than drawn separately: an overcast day is
     not rain drawn on top of a sunny one, it is a different colour of daylight,
     and the moment you treat it as a layer it looks like a layer. */
  grade(indoors) {
    const s = this.sunPos(), S = this.STOPS;
    let i = 0;
    while (i < S.length - 2 && s > S[i + 1][0]) i++;
    const a = S[i], b = S[i + 1];
    const t = clamp((s - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
    /* A stop is [where the sun is, the multiply colour, how much of it] — so
       the colour is [1] and the strength is [2], and reading them as [2] and
       [3] gets you rgb(NaN,NaN,NaN), which canvas does not reject: it ignores
       the assignment and keeps whatever fillStyle was set last, so the grade
       silently paints the previous draw call's colour over the whole screen. */
    const col = [0, 1, 2].map(j => Math.round(lerp(a[1][j], b[1][j], t)));
    let alpha = lerp(a[2], b[2], t);

    const k = this.kind();
    if (k.dim) {
      /* Cloud does two things at once and they pull opposite ways: it takes the
         light out of the day and it takes the colour out of the light. Dragging
         the multiply towards the weather's own grey does the second; adding
         `dim` does the first, scaled by how high the sun is, because a downpour
         at midnight is not darker than midnight. */
      const day = clamp(s * 2 + .35, 0, 1);
      const wc = k.col, wr = parseInt(wc.slice(1, 3), 16), wg = parseInt(wc.slice(3, 5), 16), wb = parseInt(wc.slice(5, 7), 16);
      const mix = clamp(k.dim * 2.2, 0, .85);
      col[0] = Math.round(lerp(col[0], wr, mix));
      col[1] = Math.round(lerp(col[1], wg, mix));
      col[2] = Math.round(lerp(col[2], wb, mix));
      alpha = alpha + k.dim * day;
    }
    if (indoors) {
      /* Half of it, and capped: the building has its own light and the point
         indoors is that the windows go dark, not that the room does. */
      alpha = Math.min(alpha * .5, .38);
      col[0] = Math.round(lerp(col[0], 255, .28));
      col[1] = Math.round(lerp(col[1], 255, .28));
      col[2] = Math.round(lerp(col[2], 255, .28));
    }
    return { col: 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')', a: clamp(alpha, 0, .86) };
  },

  /* Is it dark enough for the lamps to be on. Streetlights come on at dusk and
     go off at dawn and are not clever about it, which is exactly right. */
  lampsOn() { return this.sunPos() < 0.06 || this.kind().dim > .34; },

  /* What the sky looks like THROUGH A WINDOW, top colour and bottom colour.
     One place, so the office window on the fourth floor and anything else that
     ever looks out of one can never disagree about what the weather is. */
  windowSky() {
    const s = this.sunPos(), k = this.kind();
    let top, bot;
    if (s < -0.22) { top = '#0d1330'; bot = '#1b2444'; }
    else if (s < 0.0) { top = '#2c2b52'; bot = '#6a4a5c'; }
    else if (s < 0.14) { top = '#5d6f9e'; bot = '#d99a63'; }
    else { top = '#7fa6d4'; bot = '#cfe0f2'; }
    if (k.dim > .12) {
      const g = x => R.shade(x, -k.dim * .5);
      top = g(top); bot = g(bot);
    }
    return { top, bot, lit: s < 0.06 };
  }
};
