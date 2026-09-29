'use strict';
/* The building blocks of Isla Solana: zones and their colours, what the
 * ground is made of, the vehicles, the furniture catalogue and the waypoints
 * NPC schedules steer by. engine/world.js turns these into a map; nothing here
 * is code.
 */

/* `surf`/`wsurf` are what a room's floor and walls are made of, and `tile`/
   `wtile` name the kit sprite. Baked once — see R.floorTile(). */
const ZONES = {
  /* The Driftwood — the beach bar you have just inherited. */
  barroom: { name: 'The Driftwood', floor: '#8a6a48', alt: '#836444', wall: '#e8dcc4', tint: '#ffb347', tile: 'floor.wood', wtile: 'wall.stone.pale', work: true, base: true },
  deck: { name: 'The Deck', floor: '#a07a52', alt: '#98734d', wall: '#e8dcc4', tint: '#ff7eb6', tile: 'floor.wood', wtile: 'wall.stone.pale' },
  /* Home. */
  hut: { name: 'Your Beach Hut', floor: '#b8876a', alt: '#b08064', wall: '#f1e6d2', tint: '#ffb347', surf: 'tile', tile: 'floor.tile', wtile: 'wall.stone.pale' },
  shopfloor: { name: 'Mama Coco’s', floor: '#9b7b5a', alt: '#947556', wall: '#f0dcc0', tint: '#5ad48a', tile: 'floor.herring', wtile: 'wall.stone.pale' },
  /* Outdoors. */
  island: { name: 'Isla Solana', floor: '#b9c0bd', alt: '#b2b9b6', wall: '#8a7a5a', tint: '#5ad48a', tile: 'terrain.grass.summer', wtile: 'wall.stone.pale' },
  shore: { name: 'The Shore', floor: '#e6dcc4', alt: '#e0d6be', wall: '#8a7a5a', tint: '#ffd27f', tile: 'terrain.sand', wtile: 'wall.stone.pale' },
  sands: { name: 'Honeymoon Sands', floor: '#e6dcc4', alt: '#e0d6be', wall: '#8a7a5a', tint: '#ff7eb6', tile: 'terrain.sand', wtile: 'wall.stone.pale' },
  cove: { name: 'Lovers’ Cove', floor: '#e6dcc4', alt: '#e0d6be', wall: '#8a7a5a', tint: '#ff5f8f', tile: 'terrain.sand', wtile: 'wall.stone.pale' },
  jungle: { name: 'The Jungle', floor: '#a9b8a4', alt: '#a2b19d', wall: '#8a7a5a', tint: '#3fbf6a', tile: 'terrain.grass.summer', wtile: 'wall.stone.pale' },
  lagoon: { name: 'The Hidden Lagoon', floor: '#e6dcc4', alt: '#e0d6be', wall: '#8a7a5a', tint: '#4dd4ff', tile: 'terrain.sand', wtile: 'wall.stone.pale' },
  garden: { name: 'The Garden', floor: '#b9c0bd', alt: '#b2b9b6', wall: '#8a7a5a', tint: '#5ad48a', tile: 'terrain.grass.summer', wtile: 'wall.stone.pale' },
  plaza: { name: 'The Plaza', floor: '#d9d2c2', alt: '#d2cbbb', wall: '#8a7a5a', tint: '#ffb347', surf: 'stone', tile: 'floor.diamond', wtile: 'wall.stone.pale' },
  yoga: { name: 'The Yoga Deck', floor: '#a07a52', alt: '#98734d', wall: '#8a7a5a', tint: '#b48cff', tile: 'floor.wood', wtile: 'wall.stone.pale' },
  jetty: { name: 'The Jetty', floor: '#a07a52', alt: '#98734d', wall: '#8a7a5a', tint: '#4dd4ff', tile: 'floor.wood', wtile: 'wall.stone.pale' },
  /* The road loop — each road a zone, so walking onto it says its name. */
  front: { name: 'The Promenade', floor: '#d9d2c2', alt: '#d2cbbb', wall: '#8a7a5a', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.stone.pale' },
  west: { name: 'Palm Lane', floor: '#d9d2c2', alt: '#d2cbbb', wall: '#8a7a5a', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.stone.pale' },
  east: { name: 'Coconut Lane', floor: '#d9d2c2', alt: '#d2cbbb', wall: '#8a7a5a', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.stone.pale' },
  hill: { name: 'Hill Road', floor: '#d9d2c2', alt: '#d2cbbb', wall: '#8a7a5a', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.stone.pale' },
};

/* What a tile is MADE of, where that is not what its zone is made of. A level
   declares rectangles of these in `surfaces:`; R.floorTile() reads one in
   preference to the zone's own floor, and R.kerbs() draws an edge wherever
   two different ones meet. `floor`/`alt` are tints the kit tile is multiplied
   through; `map` is the flat colour the minimap paints. `open` is ground you
   can see and cannot stand on. */
const SURFACES = {
  tarmac: { tile: 'terrain.road', floor: '#b6b0a6', alt: '#b6b0a6', map: '#3a3632' },
  slab: { tile: 'terrain.slab', floor: '#e2dccd', alt: '#dcd6c7', map: '#b9ae98' },
  grass: { tiles: { spring: 'terrain.grass.summer', summer: 'terrain.grass.summer', autumn: 'terrain.grass.summer', winter: 'terrain.grass.summer' }, floor: '#c6d2b0', alt: '#bfcba9', soft: true, map: '#5d8a3a' },
  water: { tile: 'terrain.water', floor: '#b8fff4', alt: '#b8fff4', lift: '#1aa0a0', map: '#2ab3b0', open: true },
  sea: { tile: 'terrain.sea', floor: '#9fe8ff', alt: '#9fe8ff', lift: '#1a8fb0', map: '#1f8fc0', open: true },
  sand: { tile: 'terrain.sand', floor: '#f4e6c4', alt: '#f0e2bf', map: '#e8cf94', soft: true },
  rock: { surf: 'rock', floor: '#9a8f86', alt: '#948980', map: '#7a7068', open: true },
  boards: { tile: 'floor.wood', floor: '#c8a070', alt: '#c09868', map: '#a0784c' },
  track: { tile: 'terrain.ballast', floor: '#d8c8a4', alt: '#d2c29e', map: '#b8a47c', soft: true },
  steps: { tile: 'terrain.steps', floor: '#e2dccd', alt: '#e2dccd', map: '#b9ae98' },
};

/* No lift on this island — everything is one storey and a hammock. The lift
   act reads FLOORS, and an empty list is a building with no lift in it. */
const FLOORS = [];

/* WHAT OFFERS A WAY OUT, where it is not the obvious thing. Read by
   Atlas.waysOut(). Nothing here offers more than one. */
const EXITS = [];

/* The vehicles, keyed by `model` on a car in a level's own `cars:` list.
     len/wid   the body, in pixels. A person is 58px tall on the same floor.
     top       top speed, px/s. Walking is 110.
     acc/grip/turn   handling.
     body      paint, which the sheet's base vehicle is multiplied by.
     shape     which silhouette off art/sprites/cars.png — car, van, taxi, bus. */
const CARS = {
  /* Yours. It came with the bar, it has no doors, and it smells of coconut. */
  buggy: { len: 72, wid: 34, top: 250, acc: 210, grip: 6.4, turn: 3.0, body: '#ff9f43' },
  jeep: { len: 84, wid: 37, top: 230, acc: 170, grip: 5.8, turn: 2.6, body: '#3fae7a' },
  convertible: { len: 82, wid: 35, top: 275, acc: 200, grip: 6.0, turn: 2.7, body: '#ff5f8f' },
  cabrio: { len: 80, wid: 35, top: 255, acc: 185, grip: 6.1, turn: 2.8, body: '#f7f1e3' },
  taxi: { len: 84, wid: 35, top: 230, acc: 165, grip: 5.5, turn: 2.5, body: '#c9a227', shape: 'taxi' },
  van: { len: 105, wid: 39, top: 210, acc: 120, grip: 4.4, turn: 2.0, body: '#7ed6df', shape: 'van' },
  /* The island shuttle. It goes round. That is all it does. */
  bus: { len: 144, wid: 42, top: 175, acc: 95, grip: 3.6, turn: 1.9, body: '#e056fd', shape: 'bus' }
};

/* How each kind of object is furnished, keyed by `kind`.
     mount 'wall'    — hung on the face of the wall it stands against
     mount 'surface' — stood on a worktop
     size            — emoji size
     sprite/sprites  — a kit sprite instead of the emoji
     ground          — the floor it really takes up, [w] or [w, d], in tiles */
const FURN = {
  poster: { mount: 'wall', size: 22, art: 'poster' },
  board: { mount: 'wall', size: 21, art: 'board' },
  window: { mount: 'wall', size: 25, art: 'window' },
  sign: { mount: 'wall', size: 18, art: 'sign', ground: [0.36] },
  clock: { mount: 'wall', size: 19, sprite: 'wall.clock' },
  mirror: { mount: 'wall', size: 20, sprite: 'wall.mirror' },
  tv: { mount: 'wall', size: 25, sprite: 'wall.tv' },
  art: { mount: 'wall', size: 22, sprite: 'wall.art.beach' },
  sail: { mount: 'wall', size: 22, sprite: 'wall.art.sail' },
  bottles: { mount: 'wall', size: 20 },
  sink: { mount: 'surface', size: 17, sprite: 'obj.sink' },
  misc: { mount: 'surface', size: 17 },
  taps: { mount: 'surface', size: 20 },
  till: { mount: 'surface', size: 18 },
  blender: { mount: 'surface', size: 18 },
  cake: { mount: 'surface', size: 18, sprite: 'obj.cake' },
  sofa: { size: 38, sprite: 'obj.sofa' },
  beanbag: { size: 30, sprite: 'obj.ottoman' },
  fridge: { size: 29, sprite: 'obj.fridge' },
  cab: { size: 26, sprite: 'obj.cabinet' },
  shelf: { size: 26, sprite: 'obj.bookcase' },
  table: { drawn: true },
  bin: { size: 20, sprite: 'obj.bin', ground: [0.62] },
  plant: { size: 24, sprite: 'obj.planter', ground: [0.62] },
  box: { size: 22, sprite: 'obj.boxes' },
  chair: { sprite: 'obj.chair' },
  bench: { size: 30, sprite: 'obj.bench', ground: [0.86, 0.4] },
  ironbench: { size: 30, sprite: 'obj.bench.iron', ground: [0.86, 0.4] },
  lamp: { size: 34, sprite: 'obj.lamppost', ground: [0.34] },
  tree: { size: 34, ground: [0.34], sprites: { spring: 'obj.tree.summer', summer: 'obj.tree.summer', autumn: 'obj.tree.summer', winter: 'obj.tree.summer' } },
  palm: { size: 46, ground: [0.3] },
  fountain: { size: 46, sprite: 'obj.fountain', ground: [0.68, 0.5] },
  barrels: { size: 32, sprite: 'obj.barrels', ground: [0.82, 0.58] },
  crate: { size: 24, sprite: 'obj.crate', ground: [0.68] },
  trough: { size: 30, sprite: 'obj.trough', ground: [0.8, 0.46] },
  fence: { size: 30, sprite: 'obj.fence', ground: [0.96, 0.26] },
  railing: { size: 30, sprite: 'obj.railing', ground: [0.96, 0.22] },
  flowers: { size: 26, sprite: 'obj.flowers.red' },
  whiteflowers: { size: 26, sprite: 'obj.flowers.white' },
  parasol: { size: 38, ground: [0.3] },
  lounger: { size: 28, sprite: 'obj.bench', ground: [0.8, 0.4] },
  towel: { size: 24 },
  plot: { size: 24 },
  boat: { size: 54, ground: [0.9, 0.6] },
  torch: { size: 26, ground: [0.3] },
  bed: { size: 40, ground: [0.9, 0.7] },
  wardrobe: { size: 30, sprite: 'obj.cabinet' },
  surf: { size: 30, ground: [0.4] },
  hammock: { size: 34, ground: [0.9, 0.4] },
  stall: { size: 32, ground: [0.9, 0.6] },
  tower: { size: 40, ground: [0.7, 0.6] },
  jukebox: { size: 30, sprite: 'obj.vend' },
  rocks: { size: 30, ground: [0.7, 0.5] },
  shopsign: { mount: 'wall', size: 24, sprite: 'sign.board' },
  shop: { mount: 'wall', size: 27, high: 1.78 },
};

/* SHARED FLOOR PLANS. A level may name these instead of carrying its own. */
const ROOM_DEFS = [];
const DOOR_DEFS = [];

/* NAMED SPOTS USED BY NPC SCHEDULES — [x, y, level]. Whole tiles, all FLOOR.
   Nobody here changes level on foot (there is no lift), so a schedule only
   names spots on its own person's level; trips elsewhere are `out:` windows.
   `burnout` is the engine's: where you go to recover when your nerve runs out. */
const WP = {
  jukebox: [19, 4, 'bar'], deck: [27, 8, 'bar'], rail: [30, 5, 'bar'], barTable: [8, 10, 'bar'],
  hammock: [29, 11, 'bar'], burnout: [28, 11, 'bar'],
  fountain: [66, 45, 'island'], garden: [44, 42, 'island'], yoga: [85, 34, 'island'],
  sands: [60, 79, 'island'], jetty: [112, 47, 'island'], cove: [15, 46, 'island'],
  lagoon: [60, 16, 'island'], surfshack: [89, 77, 'island'], stall: [62, 38, 'island'],
  till: [6, 3, 'market']
};

/* ---- A LEVEL BUILT OUT OF PARTS -------------------------------------------
   A level may say it is made of other levels, stamped in at an offset:

     parts: [ { of: 'town', at: [44, 177] }, { of: 'outskirts', at: [168, 40] } ]

   which is how the town and the twenty minutes of country east of it became
   one island rather than two levels with a signpost between them — see
   data/island.js. Everything here is translation and concatenation: what comes
   out is an ordinary level definition, and the builder that reads it is the
   builder that always read it. Neither part knows it has been moved, and
   nothing downstream of this line knows there was ever more than one of them.

   IT IS DONE HERE, at the bottom of the definitions, rather than in
   engine/world.js — because a composed level has to BE a level from the moment
   the catalogue has it. Levels.go() reads a level's arrival points before it
   builds anything, the editor lists them, and tools/levelcheck.mjs checks every
   link against them; all three would be reading half a level if this waited for
   the builder.

   WHAT CANNOT BE TRANSLATED FROM OUT HERE is `furnish()`, which is the one
   thing about a level that is code rather than a table: the town's adds two
   hundred objects at coordinates it works out itself, and the outskirts' puts
   two thousand pieces of mass back into the map. So a part's furnish is called
   with a `this` that is the world seen from the part's own corner — see
   World.shifted() in engine/world.js, which is ten lines and makes the other
   eight hundred somebody else's problem. */
function composeLevel(def) {
  if (!def.parts || !def.parts.length || def.composed) return def;
  const out = Object.assign({}, def);
  /* `parts` is KEPT rather than dropped, because what a level is made of is a
     fact about it and not a step in making it: Levels.partOf() reads it to
     answer "where is the town inside the island", which is the question
     anything written in a part's own coordinates has to ask. `composed` is what
     stops this running twice. */
  out.composed = true;
  const ids = def.parts.map(p => p.of);
  /* The translation, one shape at a time and explicitly, because nothing
     generic can tell an [x, y] from a [w, h]. */
  const R = (r, dx, dy) => [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
  const P = (p, dx, dy) => (p.length > 2 ? [p[0] + dx, p[1] + dy, p[2]] : [p[0] + dx, p[1] + dy]);
  ['rooms', 'surfaces', 'roofs', 'paint', 'doors', 'cars', 'peds', 'signals', 'counters']
    .forEach(f => out[f] = (def[f] || []).slice());
  out.entries = Object.assign({}, def.entries);
  out.links = (def.links || []).slice();
  const furnishes = [];

  for (const part of def.parts) {
    const src = LEVELS[part.of];
    if (!src) { console.warn('level ' + def.id + ' names a part that is not there: ' + part.of); continue; }
    const dx = part.at[0], dy = part.at[1];
    (src.rooms || []).forEach(o => out.rooms.push(Object.assign({}, o, { r: R(o.r, dx, dy) })));
    (src.surfaces || []).forEach(o => out.surfaces.push(Object.assign({}, o, { r: R(o.r, dx, dy) })));
    (src.roofs || []).forEach(o => out.roofs.push(Object.assign({}, o, { r: R(o.r, dx, dy) })));
    (src.counters || []).forEach(o => out.counters.push(o.r ? Object.assign({}, o, { r: R(o.r, dx, dy) }) : o));
    (src.doors || []).forEach(o => out.doors.push(Object.assign({}, o, { x: o.x + dx, y: o.y + dy })));
    /* A marking is a line between two points, a rectangle, or a word at a
       point, and those three are the whole of `paint`. */
    (src.paint || []).forEach(o => {
      const m = Object.assign({}, o);
      if (o.a) m.a = P(o.a, dx, dy);
      if (o.b) m.b = P(o.b, dx, dy);
      if (o.r) m.r = R(o.r, dx, dy);
      if (o.at) m.at = P(o.at, dx, dy);
      out.paint.push(m);
    });
    /* A car is a tile, a route and a list of stops; a person is a route. */
    (src.cars || []).forEach(o => out.cars.push(Object.assign({}, o, {
      x: (o.x || 0) + dx, y: (o.y || 0) + dy,
      route: o.route && o.route.map(p => P(p, dx, dy)),
      stops: o.stops && o.stops.map(q => Object.assign({}, q, { at: P(q.at, dx, dy) }))
    })));
    (src.peds || []).forEach(o => out.peds.push(Object.assign({}, o, {
      route: o.route && o.route.map(p => P(p, dx, dy))
    })));
    /* A signal is a post at a tile, a stop line at a point on a lane, and — on
       a crossing — the piece of carriageway people walk over. */
    (src.signals || []).forEach(inst => out.signals.push(Object.assign({}, inst, {
      over: inst.over && R(inst.over, dx, dy),
      arms: inst.arms.map(a => Object.assign({}, a, { at: P(a.at, dx, dy), stop: P(a.stop, dx, dy) }))
    })));
    /* An arrival point keeps its NAME, which is the whole reason a shop's link
       back to `entry: 'greggs'` still lands on the Greggs doorway without the
       shop being told anything at all. The composed level's own win a clash,
       because the level is the thing being built. */
    for (const k in (src.entries || {})) if (!(k in out.entries)) out.entries[k] = P(src.entries[k], dx, dy);
    /* AND A PART'S WAYS OUT COME WITH IT — except the ones that led somewhere
       that is now here. The road east out of the town and the road west back
       into it were a link each; one map later they are a road. */
    (src.links || []).forEach(l => {
      if (l.to === def.id || ids.indexOf(l.to) >= 0) return;
      if (out.links.some(k => k.via === l.via)) return;
      out.links.push(l);
    });
    if (src.furnish) furnishes.push({ f: src.furnish, dx, dy });
  }

  const own = def.furnish;
  out.furnish = function () {
    /* The parts first, in the order they are declared, and then the level's
       own — which is what lets an island lay a coast round two places that were
       drawn without one. */
    for (const p of furnishes) p.f.call(World.shifted(this, p.dx, p.dy));
    if (own) own.call(this);
  };
  return out;
}
