'use strict';
/* ---------------- Global state ----------------
   P is the player, G is the run. Both are plain data, so Save.write() carries
   every field without knowing what it is for. */
const emptyKit = () => Object.fromEntries(GAME.slots.map(s => [s, null]));
function freshPlayer() {
  return {
    name: 'Trainee', face: '🧑‍💻',
    level: 1, xpv: 0, xpNext: 100, rank: 0,
    patience: 100, patMax: 100, energy: 100, eneMax: 100, food: 100,
    money: 0, rep: 0,
    stats: { empathy: 2, knowledge: 2, patience: 2, bullshit: 1, chaos: 1 },
    skills: {}, skillPoints: 1,
    inventory: [], equipment: emptyKit(),
    /* `dir` is a sprite row: 2 faces the camera. */
    x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, dir: 2, moving: false, bob: 0,
    buffs: []
  };
}
const P = freshPlayer();

function freshTotals() {
  return { calls: 0, coffee: 0, toiletMin: 0, printer: 0, angered: 0, satisfied: 0, transfers: 0, bullshit: 0, written: 0 };
}
/* Everything a new run starts from, in one place: a field missing here is how
   one run haunts the next. */
function freshRun() {
  return {
    day: 1, minutes: DAY_START,
    flags: {}, quests: {}, achievements: {}, rel: {},
    minds: {},                                  /* islanders' needs and moods: engine/mind.js */
    todayStats: {}, today: {}, totals: freshTotals(),   /* today: state that ends at midnight */
    comms: { mail: [], text: [], chat: [], log: [], calls: [] },   /* engine/comms.js */
    chatSent: {}, mailSent: {}, textSent: {},
    callers: {},                                /* how each kind of guest opens, −3 to +3 */
    eventCooldown: 6, activeEvent: null, discovered: {}, endings: [],
    lastZone: null, objective: '',
    track: null, trackOff: false, tkShut: {}, tkFold: false, tkTitles: false,   /* the job tracker */
    arcade: { best: {}, won: {}, played: 0 },
    wx: { k: 'grey', t: 0, w: 0, l: 0, f: 0, flash: 0 },                  /* engine/sky.js */
    guns: { have: [], gun: null, ammo: {}, hit: {} },               /* engine/guns.js */
    look: null,                                 /* the character creator's picks */
    levelState: {}
  };
}
const G = Object.assign({ state: 'title' }, freshRun());

function clockStr(m) {
  const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60);
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/* Bump a counter in the lifetime tally and today's together, so the day's
   report and the profile never drift apart. */
function count(key, n = 1) {
  G.totals[key] = (G.totals[key] || 0) + n;
  G.todayStats[key] = (G.todayStats[key] || 0) + n;
}
function resetRun() {
  Object.assign(G, freshRun());
  G.state = 'play';
  Mind.reset();
  Comms.hush();
  Guns.clear();
  /* Rolled after G.day is back to 1: the season comes from the day. */
  Sky.roll(false);
  Sky.resume();
  Sprites.uncompose('player');
  G.level = Levels.first();
  Phones.clearAll();
  /* Before the roster: NPCM.spawn() asks which level it is populating. */
  Levels.start(Levels.first(), 'start');
  NPCM.spawn();
}

/* Canvas font stacks: literal shorthand, because canvas does not resolve var()
   and silently keeps the old font when it cannot parse the new one. */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","EmojiOne Color",sans-serif';
const NAME_FONT = '600 11px ui-monospace,"Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace';
const BUBBLE_FONT = '12px "Trebuchet MS","Segoe UI",Tahoma,sans-serif';
const FLOAT_FONT = '700 15px "Trebuchet MS","Segoe UI",Tahoma,sans-serif';
/* A family, not a shorthand: the map sizes each name to the place it names. */
const MAP_FAMILY = '"Trebuchet MS","Segoe UI",Tahoma,sans-serif';
/* Road lettering, before R.roadPaint() stretches it tall. */
const ROAD_FONT = '700 13px "Trebuchet MS","Segoe UI",Tahoma,sans-serif';
