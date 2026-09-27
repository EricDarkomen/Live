'use strict';
/* The building blocks: zones and their colours, what the ground is made of,
 * the lift's buttons, the vehicles, the furniture catalogue and the waypoints
 * NPC schedules steer by. engine/world.js turns these into a map; nothing here
 * is code.
 */

/* `surf`/`wsurf` are what a room's floor and walls are made of, and `tile`/
   `wtile` name the kit sprite. The difference between thirteen rooms and one
   room in thirteen colours. Baked once — see R.floorTile(). */
const ZONES = {
  floor: { name: 'The Floor', floor: '#2f3a4d', alt: '#2a3445', wall: '#1a212e', tint: '#4da3ff', tile: 'floor.carpet', wtile: 'wall.drywall', work: true, base: true },
  kitchen: { name: 'The Kitchen', floor: '#3b3728', alt: '#353124', wall: '#231f16', tint: '#ffb347', surf: 'vinyl', tile: 'floor.wood', wtile: 'wall.drywall', kitchen: true },
  washroom: { name: 'The Washroom', floor: '#26363f', alt: '#223039', wall: '#6e7c82', tint: '#4da3ff', surf: 'tile', wsurf: 'tile', tile: 'floor.tile', wtile: 'loo.wall', washroom: true },
  meeting: { name: 'The Meeting Room', floor: '#2d3346', alt: '#282e3f', wall: '#191e2b', tint: '#b48cff', tile: 'floor.carpet.dim', wtile: 'wall.drywall' },
  landing: { name: 'The Landing', floor: '#303a48', alt: '#2b3441', wall: '#1a212d', tint: '#4da3ff', surf: 'stone', tile: 'floor.diamond', wtile: 'wall.drywall' },
  lobby: { name: 'Reception', floor: '#333c4a', alt: '#2e3643', wall: '#1c2330', tint: '#4da3ff', surf: 'stone', tile: 'floor.diamond', wtile: 'wall.drywall' },
  shopfloor: { name: 'The Shop', floor: '#4a4136', alt: '#453c32', wall: '#2b241d', tint: '#ffb347', surf: 'vinyl', tile: 'floor.tile', wtile: 'wall.drywall' },
  common: { name: 'The Common', floor: '#47503f', alt: '#424b3b', wall: '#34372f', tint: '#5ad48a', tile: 'terrain.grass.autumn', wtile: 'wall.stone' },
  carpark: { name: 'The Car Park', floor: '#4a4e56', alt: '#45494f', wall: '#33373d', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.brick' },
  high: { name: 'High Street', floor: '#4a4e56', alt: '#45494f', wall: '#33373d', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.brick' },
  west: { name: 'West Road', floor: '#4a4e56', alt: '#45494f', wall: '#33373d', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.brick' },
  top: { name: 'Top Road', floor: '#4a4e56', alt: '#45494f', wall: '#33373d', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.brick' },
  east: { name: 'East Road', floor: '#4a4e56', alt: '#45494f', wall: '#33373d', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.brick' },
  mid: { name: 'Middle Street', floor: '#4a4e56', alt: '#45494f', wall: '#33373d', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.brick' },
  close: { name: 'The Close', floor: '#4a4e56', alt: '#45494f', wall: '#33373d', tint: '#9fb3c8', surf: 'concrete', wsurf: 'block', tile: 'terrain.slab', wtile: 'wall.brick' },
};

/* What a tile is MADE of, where that is not what its zone is made of. A level
   declares rectangles of these in `surfaces:` and World.build() paints them
   into World.surf; R.floorTile() reads one in preference to the zone's own
   floor, and R.kerbs() draws a kerb along every edge where one meets ground of
   a different surface. Nothing else knows: the zone still says where you are,
   the room still says what is walkable, and a tile with no surface over it is
   exactly what it always was.

   `floor` and `alt` are TINTS, not colours — the kit tile is multiplied
   through them, same as a zone's are, so the number written here is lighter
   than what ends up on screen and is picked by looking at the result. `map` is
   the one colour that is a colour: the minimap paints flat rectangles with no
   texture to tint, so it needs to be told. */
const SURFACES = {
  tarmac: { tile: 'terrain.road', floor: '#a6acb5', alt: '#a6acb5', map: '#2c2f38' },
  slab: { tile: 'terrain.slab', floor: '#4a4e56', alt: '#45494f', map: '#565b64' },
  track: { tile: 'terrain.ballast', floor: '#8d7f68', alt: '#877963', map: '#5f5340', soft: true },
  grass: { tiles: { spring: 'terrain.grass.spring', summer: 'terrain.grass.summer', autumn: 'terrain.grass.autumn', winter: 'terrain.grass.winter' }, floor: '#b9c0bd', alt: '#b2b9b6', soft: true, maps: { spring: '#4a6a34', summer: '#3f5c2c', autumn: '#6b5a2a', winter: '#b9cdd4' }, map: '#4a6a34' },
  water: { tile: 'terrain.water', floor: '#495c54', alt: '#495c54', map: '#22383a', open: true },
  sea: { tile: 'terrain.sea', floor: '#657d8c', alt: '#657d8c', map: '#1b3446', open: true },
  sand: { tile: 'terrain.sand', floor: '#c8c2b2', alt: '#c2bcac', map: '#9e8f6b', soft: true },
  rock: { surf: 'rock', floor: '#6e7076', alt: '#686a70', map: '#4a4e56', open: true },
  rail: { tile: 'terrain.ballast', floor: '#74787c', alt: '#6e7276', map: '#33302b', open: true },
  steps: { tile: 'terrain.steps', floor: '#c2c8d0', alt: '#c2c8d0', map: '#6a717b' },
  stair: { tile: 'terrain.stair', floor: '#b8bec8', alt: '#b8bec8', map: '#50565f' },
};

/* THE BUILDING, VERTICALLY — what is behind the buttons in the lift car.
 *
 *   b     what is written on the button
 *   via   the LINK to take, exactly as every other way out of a room does it —
 *         the link table in data/levels.js is still the only thing that says
 *         where anything goes, so a floor that moves moves in one place
 *   name  what the directory calls it
 *   key   a flag on G.flags without which the button lights and nothing happens
 *   dead  a button that is not connected to anything, with the reason
 *
 * A button whose `via` resolves to no link on the level you are standing on is
 * the floor you are already on, and is drawn as such. That is why there is no
 * "which floor am I on" field: the link table already knows. The engine's
 * `lift` act (engine/acts.js) reads this and nothing else. */
const FLOORS = [
  { b: '1', via: 'liftTo1', name: 'The Floor' },
  { b: 'G', via: 'liftToG', name: 'Reception' }
];

/* WHAT OFFERS A WAY OUT, where it is not the obvious thing.
   A link is a `via`, and the thing you press to take it is nearly always the
   object that names it — a door with `use: 'shopOut'` on it offers the link
   called 'shopOut', and the map finds that on its own with no
   help from anybody. These two are the exceptions, and they are exceptions for
   the same reason: one piece of furniture that offers SEVERAL links at once. A
   lift is four buttons and one lift, which is what FLOORS above already says;
   a stairwell is up, down, and all the way down and out.
   Read by Atlas.waysOut() and by nothing else — the acts have always worked
   this out for themselves, and this is what lets a map say where the lift
   goes without the map knowing what a lift is. */
const EXITS = [
  { kind: 'lift', vias: FLOORS.map(f => f.via).filter(Boolean) },
  { kind: 'stairs', vias: ['stairsUp', 'stairsDown', 'fireExit'] }
];

/* The cars. One entry per model, keyed by `model` on a car in a level's own
   `cars:` list — the same arrangement as FURN below, and for the same reason:
   what a hatchback IS belongs in one place, and which hatchback is parked in
   bay 9 belongs to the level.

     len/wid   the body, in pixels. A person is 58px tall on the same floor.
     top       top speed, px/s. Walking is TILE * 3.45, which is 110.
     acc       how briskly it gets there, px/s².
     grip      how much it refuses to slide sideways, per second. Lower slides.
     turn      radians/s at speed, before the speed taper in Cars.drive().
     body      its paint, which the sheet's base vehicle is multiplied by.

   Handling numbers, not personality: a car that is slow because it is a
   twenty-year-old pool car is slow HERE, in one number, and reads as itself
   without anything in engine/cars.js knowing which car it is. */
/* `shape` names an entry in R.CARSHAPES and decides the silhouette: a bus is
   not a long car and a van is not a wide one, and drawing all three from one
   outline was why the 41 read as a saloon somebody had stretched. Saying
   nothing means `car`, which is five of the eight. (It said seven of the nine
   for a long time, and there have been eight models and never nine.)

   It also decides WHICH VEHICLE off art/sprites/cars.png gets drawn, which is
   why the taxi has one of its own: the sheet painted a taxi, chequers and roof
   sign and all, and a shape is how a model asks for it. That is also the one
   shape whose paint does not come from `body` below — see `livery` there.

   THERE WAS A `roof` AND A `trim` HERE and there is neither now. Both were
   read by the drawn body and by nothing else, and the drawn body has gone —
   see the note over R.carArt(). A vehicle is one colour from up here, which is
   what the sheet is tinted by; the roof reads darker than the bonnet because
   the artist shaded it that way, not because a second colour is named. If
   two-tone ever comes back it wants a mask on the sheet rather than a hex in
   this table, and thirty-eight level entries would have to say what they mean
   again. `trim` had already been dead once — it sat on every entry here for
   months being read by nothing — so this is the second time and the rule is
   the atlas's: an entry nobody asks for is never seen to be wrong.

   `sign` is the one detail of this kind left, and it stays because the writing
   committed to it: the pool car's magnetic door sign that has slid, described
   in its own comment below. `roofSign` went with the rest — the sheet's taxi
   has one painted on it. */
const CARS = {
  /* The pool car. The only one in the county with a magnetic door sign that
     has slid, and the only one in this car park you are allowed to move. */
  pool:  { len: 84, wid: 35, top: 232, acc: 150, grip: 5.5, turn: 2.5, body: '#b9bec4', sign: true },
  hatch: { len: 78, wid: 34, top: 265, acc: 190, grip: 6.2, turn: 2.9, body: '#7d2f34' },
  estate:{ len: 93, wid: 36, top: 245, acc: 160, grip: 5.2, turn: 2.3, body: '#2f4a6b' },
  van:   { len: 105, wid: 39, top: 210, acc: 120, grip: 4.4, turn: 2.0, body: '#d8d5cc', shape: 'van' },
  /* Traffic. Ordinary cars in ordinary colours, so that what goes past the
     Greggs is not obviously the same car eight times. */
  saloon:{ len: 84, wid: 35, top: 220, acc: 150, grip: 5.5, turn: 2.4, body: '#3f5a44' },
  taxi:  { len: 84, wid: 35, top: 230, acc: 165, grip: 5.5, turn: 2.5, body: '#c9a227', shape: 'taxi' },
  small: { len: 69, wid: 33, top: 250, acc: 200, grip: 6.5, turn: 3.1, body: '#5a5f8a' },
  /* The 41A. Long enough that it has to slow right down for a corner and take
     the whole width of the junction to get round one, which is the point of
     having one on the network at all — and it does not stop at the bus stop,
     which is the thing the bus stop has said about the 41A since long before
     there was a road for it to not stop on. */
  bus:   { len: 144, wid: 42, top: 175, acc: 95, grip: 3.6, turn: 1.9, body: '#8d3a3f', shape: 'bus' }
};

/* How each kind of object is furnished, keyed by `kind`.

     mount 'wall'    — hung on the face of the wall it stands against
     mount 'surface' — stood on a worktop, which is drawn under it
     (default)       — standing on the floor

   `size` is the emoji size; `art` names a shape the renderer draws instead, for
   the things whose emoji is worse than nothing. Anything not listed keeps the
   old 27px on the floor, so adding a kind is opt-in.

   An object may overrule its kind with its own `furn:`, merged over this and
   cached as o.fdef. That is the point, not a loophole: no rule keyed on `kind`
   can know which fire extinguisher is propping the fire door open.

   `ground` is how much FLOOR a solid one of these actually takes up, in
   fractions of a tile — [width] or [width, depth] — and it is read by
   engine/collide.js and by nothing else. Everything gets a footprint the size
   it is DRAWN rather than the whole square it stands in, worked out from
   `size`; this is the override for the ones whose drawn size lies about their
   feet. A lamppost is three metres of nothing on top of a post you could get a
   shopping trolley past, and for a year it took the same square out of the
   pavement as a skip. Nothing here is ever bigger than a whole tile: every
   footprint is a subset of what the tile model already claimed, so this can
   only ever open the world up, never close a route. */
const FURN = {
  poster: { mount: 'wall', size: 22, art: 'poster' },
  board: { mount: 'wall', size: 21, art: 'board' },
  chart: { mount: 'wall', size: 21, art: 'chart' },
  window: { mount: 'wall', size: 25, art: 'window' },
  screen: { mount: 'wall', size: 17, art: 'screen' },
  roll: { mount: 'wall', size: 16, art: 'roll' },
  sign: { mount: 'wall', size: 18, art: 'sign', ground: [0.36] },
  clock: { mount: 'wall', size: 19, sprite: 'wall.clock' },
  mirror: { mount: 'wall', size: 20, sprite: 'wall.mirror' },
  view: { mount: 'wall', size: 26 },
  dryer: { mount: 'wall', size: 17, art: 'dryer' },
  fire: { mount: 'wall', size: 19 },
  graf: { mount: 'wall', size: 20, art: 'graf' },
  aircon: { mount: 'wall', size: 19 },
  therm: { mount: 'wall', size: 15 },
  tv: { mount: 'wall', size: 25, sprite: 'wall.tv' },
  pigeon: { mount: 'wall', size: 16 },
  module: { mount: 'surface', size: 16 },
  proj: { mount: 'surface', size: 19 },
  flip: { size: 22 },
  card: { size: 17 },
  kettle: { mount: 'surface', size: 17 },
  tin: { mount: 'surface', size: 16 },
  sink: { mount: 'surface', size: 17, sprite: 'obj.sink' },
  micro: { mount: 'surface', size: 18 },
  jug: { mount: 'surface', size: 16 },
  biscuits: { mount: 'surface', size: 15 },
  confphone: { mount: 'surface', size: 17 },
  tray: { mount: 'surface', size: 15 },
  mugs: { mount: 'surface', size: 16, sprite: 'obj.mug' },
  paper: { mount: 'surface', size: 15, sprite: 'obj.paper' },
  cake: { mount: 'surface', size: 18, sprite: 'obj.cake' },
  coffee: { size: 20, sprite: 'obj.coffee' },
  misc: { mount: 'surface', size: 17 },
  sofa: { size: 38, sprite: 'obj.sofa' },
  beanbag: { size: 30, sprite: 'obj.ottoman' },
  bike: { size: 42 },
  vend: { size: 31, sprite: 'obj.vend' },
  fridge: { size: 29, sprite: 'obj.fridge' },
  server: { size: 28 },
  cab: { size: 26, sprite: 'obj.cabinet' },
  cooler: { size: 24, sprite: 'obj.cooler' },
  printer: { size: 24, sprite: 'obj.printer' },
  booth: { size: 25 },
  trolley: { size: 26, sprite: 'obj.trolley' },
  step: { size: 23 },
  oldpc: { size: 22 },
  spread: { size: 22 },
  heap: { size: 20 },
  recep: { size: 19 },
  lift: { size: 34, art: 'lift', ground: [0.86, 0.34] },
  stairs: { size: 32, sprite: 'terrain.stair', ground: [0.86, 0.6] },
  pigeonholes: { mount: 'wall', size: 26, sprite: 'wall.pigeonholes' },
  deskbig: { size: 40, sprite: 'obj.desk.office', ground: [0.94, 0.62] },
  woodcounter: { size: 30, sprite: 'obj.counter.wood', ground: [0.94, 0.5] },
  table: { drawn: true },
  loo: { size: 24, sprite: 'loo.pan', art: 'loo' },
  bin: { size: 20, sprite: 'obj.bin', ground: [0.62] },
  pc: { size: 20, sprite: 'obj.laptop' },
  plant: { size: 24, sprite: 'obj.planter', ground: [0.62] },
  box: { size: 22, sprite: 'obj.boxes' },
  cupboard: { size: 26, sprite: 'obj.cabinet' },
  chair: { sprite: 'obj.chair' },
  book: { size: 20, sprite: 'obj.shelf' },
  bench: { size: 30, sprite: 'obj.bench', ground: [0.86, 0.4] },
  barrier: { size: 26, ground: [0.8, 0.34] },
  puddle: { size: 22 },
  shop: { mount: 'wall', size: 27, high: 1.78 },
  shopwin: { mount: 'wall', size: 20, high: 1.5, tones: ['shop.win.maroon', 'shop.win.cream', 'shop.win.gold', 'shop.win.slate'] },
  lamp: { size: 34, sprite: 'obj.lamppost', ground: [0.34] },
  shopsign: { mount: 'wall', size: 24, sprite: 'sign.board' },
  drain: { size: 20, sprite: 'obj.drain' },
  tree: { size: 34, ground: [0.34], sprites: { spring: 'obj.tree.spring', summer: 'obj.tree.summer', autumn: 'obj.tree.autumn', winter: 'obj.tree.winter' } },
  roadsign: { size: 24, sprite: 'sign.giveway', ground: [0.28] },
  tyres: { size: 26, sprite: 'obj.tyres', ground: [0.72, 0.5] },
  recycling: { size: 24, sprite: 'obj.recycling', ground: [0.55] },
  cone: { size: 20, sprite: 'obj.cone', ground: [0.5] },
  manhole: { size: 20, sprite: 'obj.manhole' },
  shoptrolley: { size: 26, sprite: 'obj.shoptrolley', ground: [0.7, 0.5] },
  drivethru: { mount: 'wall', size: 26, art: 'sign', fromCar: true },
  fountain: { size: 46, sprite: 'obj.fountain', ground: [0.68, 0.5] },
  barrels: { size: 32, sprite: 'obj.barrels', ground: [0.82, 0.58] },
  crate: { size: 24, sprite: 'obj.crate', ground: [0.68] },
  trough: { size: 30, sprite: 'obj.trough', ground: [0.8, 0.46] },
  fence: { size: 30, sprite: 'obj.fence', ground: [0.96, 0.26] },
  noentry: { size: 24, sprite: 'sign.noentry', ground: [0.28] },
  signals: { size: 34, sprite: 'sign.signals', ground: [0.24] },
  signal: { size: 34, drawn: true, ground: [0.26] },
  railing: { size: 30, sprite: 'obj.railing', ground: [0.96, 0.22] },
  postbox: { size: 28, sprite: 'obj.postbox', ground: [0.5] },
  ironbin: { size: 26, sprite: 'obj.bin.iron', ground: [0.62] },
  streetclock: { size: 34, sprite: 'obj.streetclock', ground: [0.3] },
  gothicwin: { mount: 'wall', size: 30, sprite: 'wall.window.stone', high: 1.9 },
  flowers: { size: 26, sprite: 'obj.flowers.white' },
};

/* SHARED FLOOR PLANS. A level may name these in its catalogue entry
   (`rooms: ROOM_DEFS, doors: DOOR_DEFS`) instead of carrying its own, and the
   editor writes them back here when it does — that is why they are declared
   before data/levels.js is loaded. The starter's levels all carry their own. */
const ROOM_DEFS = [];
const DOOR_DEFS = [];

/* NAMED SPOTS USED BY NPC SCHEDULES — [x, y, level]. Whole tiles, and every one
   must be FLOOR: NPC movement is greedy rather than pathfound, so a waypoint on
   a solid tile has everybody sent there shuffling into it until the stuck
   timer gives up. `burnout` is the engine's: where you go to recover when your
   patience runs out (see Player.burnout()). */
const WP = {
  kitchen: [35, 5, 'floor'], meeting: [9, 25, 'floor'],
  washroom: [34, 15, 'floor'], burnout: [35, 16, 'floor'],
  printer: [27, 3, 'floor'], landing: [23, 25, 'floor'],
  recep: [7, 3, 'lobby'], lobbyDoor: [11, 9, 'lobby'], till: [6, 3, 'shop']
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
