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
  yard: { name: 'Rafa’s Yard', floor: '#b9c0bd', alt: '#b2b9b6', wall: '#8a7a5a', tint: '#c98a4a', tile: 'terrain.grass.summer', wtile: 'wall.stone.pale' },
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
  /* The workshop's things — data/craft.js. A stump is what a felled palm or
     tree becomes until it grows back; a pickup is driftwood, shells or stones
     lying on the ground. */
  stump: { size: 22, ground: [0.5] },
  pickup: { size: 18 },
  site: { size: 26, ground: [0.7, 0.5] },
  workbench: { size: 30, ground: [0.8, 0.5] },
  kiln: { size: 32, ground: [0.7, 0.6] },
  cabana: { size: 44, ground: [0.9, 0.6] },
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
  till: [6, 3, 'market'],
  /* The newcomers' corners: Rosie's truck in the plaza, the end of the jetty
     where Nico lands his catch, and the rocks at the cove Amara studies. */
  truck: [59, 44, 'island'], pier: [121, 48, 'island'], reef: [11, 50, 'island']
};
