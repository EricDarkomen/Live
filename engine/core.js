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
const fill = (t, vars) => vars ? String(t).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : t;
/* The engine's words are data: TEXT in data/game.js. A list is picked from and
   {n} is filled in. A missing key is logged once and says nothing. */
const say = (key, vars) => {
  let t = TEXT[key];
  if (Array.isArray(t)) t = pick(t);
  if (typeof t !== 'string') {
    (say.missing = say.missing || new Set()).has(key) || (say.missing.add(key), console.warn('TEXT has no ' + key));
    return '';
  }
  return fill(t, vars);
};
/* All of it, in order: pages or paragraphs rather than a list to pick from. */
const says = (key, vars) => {
  const t = TEXT[key];
  if (t === undefined) { say(key); return []; }
  return (Array.isArray(t) ? t : [t]).map(x => fill(x, vars));
};
/* Cut to n characters, counted by code point so an emoji is never halved. */
const clip = (s, n) => {
  s = String(s);
  if (s.length <= n) return s;
  const a = Array.from(s);
  return a.length <= n ? s : a.slice(0, n - 1).join('') + '…';
};
const cash = n => GAME.currency + Math.abs(n).toFixed(2);
/* Game code on an engine event (HOOKS in data/game.js). Every hook is
   optional; one that throws is logged rather than taking the engine down. */
const Hook = (name, ...a) => {
  const f = HOOKS[name];
  if (typeof f !== 'function') return undefined;
  try { return f(...a); } catch (e) { console.error('HOOKS.' + name, e); return undefined; }
};

/* The LPC art is a 32px style; every world distance is a fraction of TILE.
   Sprite-space sizes (feet, shadows, SEAT) are not. */
const TILE = 32;
/* Size of the loaded level. Levels.go() rewrites these on every swap, and
   everything that culls or clamps to the map reads them by bare name. */
let MAPW = 64, MAPH = 44;
/* The working day, in minutes: GAME.hours, or nine to five. */
const DAY_START = GAME.hours ? GAME.hours[0] : 540;
const DAY_END = GAME.hours ? GAME.hours[1] : 1020;
/* Where the player stands before the first level is loaded. */
const SPAWN = { x: 31.5 * TILE, y: 41.5 * TILE };
/* Seat height in sprite space, so a sitter is drawn on the chair, not through it. */
const SEAT = 5;
const MS_PER_GAME_MIN = 430;                     // pace of the working day
const TURN_LIMIT = 18;                           // ordinary guests give up eventually; bosses never do
const SAVE_KEY = GAME.id + '_v1', SETTINGS_KEY = GAME.id + '_settings_v1';
/* Touch controls and tap/press wording. Read once. */
const TOUCH = matchMedia('(pointer:coarse)').matches;
