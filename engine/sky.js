'use strict';
/* ---------------- The sky: the clock, the light, the weather ----
   The clock runs round the day and rolls over at midnight; outside working
   hours a game minute is shorter (pace()). sunPos() puts the sun somewhere,
   grade() says what that does to the frame, and R.draw() paints it. The
   weather is one state on G, so a save carries it: it is drawn from the
   season's bag, drifts, dims the light, wets the ground and falls past the
   camera. Seasons swap the LPC terrain crops (SURFACES, R.floorTile()). */

const Sky = {

  /* ---- the year: SEASON_DAYS a season, unless GAME.seasons names its own ---- */
  SEASON_DAYS: 14,
  SEASONS: ['autumn', 'winter', 'spring', 'summer'],

  season() {
    const d = Math.max(1, G.day | 0);
    const S = GAME.seasons || this.SEASONS;
    return S[Math.floor((d - 1) / this.SEASON_DAYS) % S.length];
  },
  seasonName() { const s = this.season(); return s[0].toUpperCase() + s.slice(1); },

  /* Sunrise and sunset per season, in minutes, unless GAME.sun fixes them. */
  SUN: {
    spring: { rise: 380, set: 1200 },   /* 06:20 → 20:00 */
    summer: { rise: 290, set: 1280 },   /* 04:50 → 21:20 */
    autumn: { rise: 430, set: 1090 },   /* 07:10 → 18:10 */
    winter: { rise: 485, set: 965 }     /* 08:05 → 16:05 */
  },
  sun() { return GAME.sun || this.SUN[this.season()] || this.SUN.autumn; },

  /* Minutes past midnight: everything reads this rather than G.minutes. */
  m() { const v = G.minutes % 1440; return v < 0 ? v + 1440 : v; },
  /* Inside working hours. */
  working() { const m = this.m(); return m >= DAY_START && m < DAY_END; },
  /* After midnight and before work. */
  smallHours() { return this.m() < DAY_START; },
  /* When people are about: they drift in before the day starts. */
  STAFF_EARLY: 45,
  staffed() { const m = this.m(); return m >= DAY_START - this.STAFF_EARLY && m < DAY_END; },

  /* Real ms per game minute: the working day at MS_PER_GAME_MIN, the rest
     compressed so a night passes in about a minute and a half. */
  pace() {
    const m = this.m();
    if (this.working()) return MS_PER_GAME_MIN;
    /* The hour after closing is slowest: people leave on foot, in real time. */
    if (m >= DAY_END && m < DAY_END + 60) return MS_PER_GAME_MIN / 1.5;
    if (m >= DAY_END && m < 1380) return MS_PER_GAME_MIN / 4;        /* 18:00 → 23:00 */
    if (m >= 1380 || m < 420) return MS_PER_GAME_MIN / 12;           /* 23:00 → 07:00 */
    return MS_PER_GAME_MIN / 4;                                      /* 07:00 → 09:00 */
  },

  /* −1 at solar midnight, 0 on the horizon, 1 at noon. Two sine arcs pinned
     to sunrise and sunset, so the light never jumps. */
  sunPos(m) {
    if (m === undefined) m = this.m();
    const { rise, set } = this.sun();
    const day = Math.max(1, set - rise);
    if (m >= rise && m <= set) return Math.sin(Math.PI * (m - rise) / day);
    const night = Math.max(1, 1440 - day);
    const since = m < rise ? (m + 1440 - set) : (m - set);
    return -Math.sin(Math.PI * since / night);
  },

  /* Is the sun down: for the writing, not the renderer. */
  dark() { return this.sunPos() < 0.02; },

  /* ---- the weather ----
     `dim` darkens, `col` is the grey the light is pulled towards, `wet` how
     much water reaches the ground, `fall` what comes down and `rate` how much.
     The renderer reads these fields and knows no weather by name. */
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
  /* Each season's weather as a bag to draw from (GAME.weather overrides). */
  BAGS: {
    spring: ['fair', 'cloud', 'cloud', 'grey', 'grey', 'drizzle', 'drizzle', 'rain', 'clear', 'fog'],
    summer: ['clear', 'clear', 'fair', 'fair', 'cloud', 'cloud', 'grey', 'rain', 'downpour', 'fair'],
    autumn: ['grey', 'grey', 'cloud', 'drizzle', 'drizzle', 'rain', 'rain', 'downpour', 'fog', 'fair'],
    winter: ['grey', 'grey', 'cloud', 'fog', 'sleet', 'sleet', 'rain', 'snow', 'snow', 'fair']
  },

  /* The live weather on G.wx:
       k     which of KINDS
       t     the minute it next reconsiders
       w     how wet the ground is, 0..1; lags the rain, as a road does
       l     how much snow is lying, slower still
       f     how thick the fog is, rolling in and lifting over an hour or more
       flash storm lightning, seconds, counted down by the renderer */
  state() {
    if (!this.KINDS[G.wx.k]) G.wx = { k: 'grey', t: 0, w: 0, l: 0, f: 0, flash: 0 };
    return G.wx;
  },
  kind() { return this.KINDS[this.state().k] || this.KINDS.grey; },
  wet() { return this.state().w || 0; },
  lying() { return this.state().l || 0; },
  /* The fog now; kind().fog is only where it is heading. */
  fog() { return this.state().f || 0; },
  label() { const k = this.kind(); return k.e + ' ' + k.n; },

  /* Draw new weather. `soft` keeps it near the current one (the closer of two
     draws), so a day drifts rather than lurches. */
  roll(soft) {
    const st = this.state();
    const bag = GAME.weather || this.BAGS[this.season()] || this.BAGS.autumn;
    let k = pick(bag);
    if (soft) {
      const b = pick(bag);
      const d = x => Math.abs((this.KINDS[x] || this.KINDS.grey).dim - this.kind().dim);
      if (d(b) < d(k)) k = b;
    }
    st.k = k;
    st.t = this.m() + ri(70, 210);
  },

  /* Midnight, from Game.tick. Nobody is moved or refilled: sleep does that. */
  newDay() {
    G.day++;
    const wasSeason = this._season;
    G.todayStats = {}; G.today = {}; G.chatSent = {}; G.mailSent = {}; G.textSent = {}; G.eventCooldown = 8;
    G.flags.calls1 = true;
    Phones.clearAll();
    this.roll(false);
    /* A new season changes the baked ground and the minimap. */
    this._season = this.season();
    if (wasSeason && wasSeason !== this._season) {
      R.rebake(); R.levelChanged();
      setTimeout(() => UI.toast(this.kind().e, say('season', { season: this.seasonName().toLowerCase() }), 'gold'), 1200);
    }
    Save.write(true);
    UI.hud();
  },

  /* One game minute, for the sky. */
  minute() {
    const st = this.state();
    const k = this.kind();
    const m = this.m();
    if (this._season === undefined) this._season = this.season();
    /* Due, or a reconsider time across midnight (roll() never sets one 240 out). */
    if (m >= st.t || st.t - m > 240) this.roll(true);
    /* Ground water, snow and fog each follow the weather up faster than down. */
    const target = k.wet || 0;
    st.w = target > st.w ? Math.min(target, st.w + .03) : Math.max(0, st.w - .006);
    const lay = (k.lay || 0);
    st.l = lay > st.l ? Math.min(1, st.l + .004) : Math.max(0, st.l - (this.season() === 'winter' ? .0015 : .006));
    const fg = k.fog || 0;
    st.f = fg > st.f ? Math.min(fg, st.f + .022) : Math.max(0, st.f - .009);
    /* Asleep or not, the night mends patience and energy an hour at a time. */
    if (m >= 1380 || m < 420) {
      P.patience = Math.min(P.patMax, P.patience + P.patMax / 300);
      P.energy = Math.min(P.eneMax, P.energy + P.eneMax / 260);
    }
    if (k.storm && chance(.02)) st.flash = .42;
    /* The day is announced when work starts, not at midnight. */
    if (m === DAY_START) {
      UI.zone(say('dayBanner', { day: G.day, name: DAYS[(G.day - 1) % 7] || DAYS[0] }));
      Q.restand();
      UI.toast('🌅', say('dayStart', { day: G.day, weather: this.label(), line: say('dayLines') }), 'gold');
      Save.write(true);
    }
  },

  /* After a load or a new run: re-derive what the save does not carry. */
  resume() {
    const was = this._season;
    this._season = this.season();
    if (was !== this._season) { R.rebake(); R.levelChanged(); }
    /* The clock jumped rather than ran: put people where the hour says. */
    if (NPCM.all.length) NPCM.homeSnap();
  },

  /* ---- the light ----
     Stops along the sun's arc: a multiply colour and how much of it, laid over
     the finished frame so nothing that draws has to know the time. */
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

  /* The grade now. Weather is folded in as a different colour of daylight
     rather than a layer on top; `indoors` softens it all. */
  grade(indoors) {
    const s = this.sunPos(), S = this.STOPS;
    let i = 0;
    while (i < S.length - 2 && s > S[i + 1][0]) i++;
    const a = S[i], b = S[i + 1];
    const t = clamp((s - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
    const col = [0, 1, 2].map(j => Math.round(lerp(a[1][j], b[1][j], t)));
    let alpha = lerp(a[2], b[2], t);

    const k = this.kind();
    if (k.dim) {
      /* Cloud greys the light (mix) and dims it (dim), the dimming scaled by
         the sun: a downpour at midnight is no darker than midnight. */
      const day = clamp(s * 2 + .35, 0, 1);
      const wc = k.col, wr = parseInt(wc.slice(1, 3), 16), wg = parseInt(wc.slice(3, 5), 16), wb = parseInt(wc.slice(5, 7), 16);
      const mix = clamp(k.dim * 2.2, 0, .85);
      col[0] = Math.round(lerp(col[0], wr, mix));
      col[1] = Math.round(lerp(col[1], wg, mix));
      col[2] = Math.round(lerp(col[2], wb, mix));
      alpha = alpha + k.dim * day;
    }
    if (indoors) {
      /* Indoors the windows go dark, not the room. */
      alpha = Math.min(alpha * .5, .38);
      col[0] = Math.round(lerp(col[0], 255, .28));
      col[1] = Math.round(lerp(col[1], 255, .28));
      col[2] = Math.round(lerp(col[2], 255, .28));
    }
    return { col: 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')', a: clamp(alpha, 0, .86) };
  },

  /* Streetlights: on at dusk, off at dawn. */
  lampsOn() { return this.sunPos() < 0.06 || this.kind().dim > .34; },

  /* The sky through a window, top and bottom colour. */
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
