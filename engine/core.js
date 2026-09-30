'use strict';
/* Utilities and the constants everything else is measured against. */

const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const chance = p => Math.random() < p;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/* THE ENGINE'S WORDS ARE DATA. `say('key', { n: 3 })` reads TEXT in
   data/game.js: a list is picked from, and {n} is filled in. A key that is not
   there is logged once and says nothing, rather than showing the player a key
   name — and the `content` suite fails on it, so it does not stay missing. */
const say = (key, vars) => {
  let t = typeof TEXT !== 'undefined' ? TEXT[key] : undefined;
  if (Array.isArray(t)) t = pick(t);
  if (typeof t !== 'string') {
    (say.missing = say.missing || new Set()).has(key) || (say.missing.add(key), console.warn('TEXT has no ' + key));
    return '';
  }
  return vars ? t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : t;
};
/* The same, but ALL of it, in order — for text that is a sequence of pages
   or paragraphs rather than a list to pick one from. */
const says = (key, vars) => {
  const t = typeof TEXT !== 'undefined' ? TEXT[key] : undefined;
  if (t === undefined) { say(key); return []; }
  return (Array.isArray(t) ? t : [t]).map(x => vars ? String(x).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : x);
};
/* A line cut down to n characters with an ellipsis on the end — counted in
   characters rather than UTF-16 units, so an emoji is never cut in half and
   shown to the player as a replacement character. */
const clip = (s, n) => {
  s = String(s);
  if (s.length <= n) return s;
  const a = Array.from(s);
  return a.length <= n ? s : a.slice(0, n - 1).join('') + '…';
};
/* An amount of money, in the game's own currency. */
const cash = n => GAME.currency + Math.abs(n).toFixed(2);
/* Game code on an engine event — HOOKS in data/game.js. Optional, and a hook
   that throws is logged rather than allowed to take the engine down with it. */
const Hook = (name, ...a) => {
  const f = typeof HOOKS !== 'undefined' && HOOKS[name];
  if (typeof f !== 'function') return undefined;
  try { return f(...a); } catch (e) { console.error('HOOKS.' + name, e); return undefined; }
};

/* 32 because the LPC art is a 32-pixel style. The only place the scale lives:
   every world distance is written as a fraction of TILE. Sprite-space sizes
   (feet, shadows, SEAT) are not — a person is the same size on any floor. */
const TILE = 32;
/* The dimensions of the level currently loaded, NOT of the office. They are
   `let` because the building is no longer the only place you can stand: every
   level declares its own size and Levels.go() writes them here as it swaps one
   for another. Everything that culls, clamps or scales to the map — the
   renderer's viewport window, the camera bounds, the minimap, the walk clamp —
   reads these by bare name and so follows the swap without knowing levels
   exist at all. Seeded with the office's size so a build that never calls the
   loader still measures the floor it is standing on. */
let MAPW = 64, MAPH = 44;
/* The working day, in minutes. A game may set its own on GAME.hours. */
const DAY_START = (typeof GAME !== 'undefined' && GAME.hours) ? GAME.hours[0] : 540;
const DAY_END = (typeof GAME !== 'undefined' && GAME.hours) ? GAME.hours[1] : 1020;
/* Visitors' side of the security counter, clear of it by a whole tile: the
   collision box is 26px tall, so a spawn on a tile boundary lands you in the
   tile above — which was inside Ron's desk once the counter became solid. */
const SPAWN = { x: 31.5 * TILE, y: 41.5 * TILE };
/* Seat height in sprite space, not tile space. Without it a sitter is drawn
   through the chair rather than on it. */
const SEAT = 5;
const MS_PER_GAME_MIN = 430;                     // pace of a working day
const TURN_LIMIT = 18;                           // ordinary callers give up eventually; bosses never do
const SAVE_KEY = GAME.id + '_v1', SETTINGS_KEY = GAME.id + '_settings_v1';
/* Picks the on-screen controls and whether instructions read in taps or keys.
   Read once — a device does not grow a keyboard halfway through a shift. */
const TOUCH = matchMedia('(pointer:coarse)').matches;
