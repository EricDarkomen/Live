'use strict';
/* ---------------- World / map ---------------- */
/* The builder, and the map it has most recently built. The definitions it
   builds FROM — ZONES, FURN, ROOM_DEFS, DOOR_DEFS, WP — are in data/world.js,
   and which set of them to use is a level, from data/levels.js.

   World is deliberately still one map rather than a collection of them: it is
   whichever level is loaded, so every reader — the renderer, collision, the
   minimap, Interact, the test suite — asks the same questions of the same
   object it always did and never has to know that levels exist. Levels.go()
   swaps the contents underneath it; engine/levels.js keeps the ones it is not
   currently showing. */
/* ONE ROW OF A FLAT GRID, AS A VIEW. Every grid the builder makes is one
   typed buffer; this hangs a subarray off it per row so that `grid[y][x]`
   still means what it has always meant. A view is a window onto the buffer,
   not a copy: writing through it writes the buffer. */
/* Somewhere for a part to write when it is drawing past the top or the bottom
   of the map it has been stamped into. A row that goes nowhere is kinder than
   a bounds test in the inner loop of somebody else's furnish. */
const EDGE = new Uint8Array(4096);
function rows(buf) {
  const out = new Array(MAPH);
  for (let y = 0; y < MAPH; y++) out[y] = buf.subarray(y * MAPW, (y + 1) * MAPW);
  return out;
}

const World = {
  /* The id of the loaded level, and the definition it was built from. Anything
     that has to behave differently in the basement than on the fourth floor
     reads these — Phones does, because a phone only rings where there are
     phones to ring. */
  level: null, def: null,
  solid: null, zone: null, seed: null, surf: null, objects: [], byTile: new Map(),
  /* THE SAME WORLD, SEEN FROM SOMEWHERE ELSE. A part's furnish is handed this
     instead of World: `add()` moves what it is given, and `solid` is the real
     grid with every row starting at the part's own left-hand edge, which a
     typed array gives for nothing — `subarray(dx)` is a view, and a write past
     the end of a typed array is dropped rather than thrown, which is exactly
     what a part drawing over the edge of itself should do. Everything else it
     might reach for is the real World, inherited. */
  shifted(world, dx, dy) {
    if (!dx && !dy) return world;
    const view = Object.create(world);
    view.add = o => world.add(Object.assign({}, o, { x: o.x + dx, y: o.y + dy }));
    const rowCache = [];
    view.solid = new Proxy({}, {
      get(_, k) {
        const y = (+k) + dy;
        if (!(y >= 0 && y < MAPH)) return EDGE;
        return rowCache[y] || (rowCache[y] = world.solid[y].subarray(dx));
      }
    });
    return view;
  },
  build(def) {
    this.def = def; this.level = def.id;
    /* The live dimensions of the map, which is what MAPW/MAPH mean. Set before
       anything below reads them: every loop in this file is bounded by them. */
    MAPW = def.w; MAPH = def.h;
    this.objects = []; this.byTile = new Map();
    /* Everything derived. Reset rather than left over, or a level with no desks
       in it draws the previous level's desks on its floor. */
    this.desks = []; this.worktops = []; this.tables = []; this.doorways = [];
    this.openings = new Set();
    this.blocked = new Set();
    /* Which tiles a car is standing on. Filled by Cars.sync() every frame while
       the game is running and left empty everywhere else — see isSolid(), and
       the note there about why a car is not built into the map. */
    this.carTiles = new Set();
    /* THE GRIDS, and what they are made of is the only thing about them that
       has changed. They were four arrays of arrays of boxed numbers, strings
       and nulls, which V8 stores at about ten bytes a tile EACH — fine for
       sixty-four by forty-four, and fifty-odd megabytes for a map a kilometre
       across, which is the size this engine is being asked to reach.

       One flat typed buffer per grid now, with a SUBARRAY PER ROW hung off it,
       so every reader in the engine and the editor still says
       `World.solid[y][x]` and gets the same answer at the same cost. That is
       the whole trick and it is why this is a storage change rather than a
       rewrite: `solid[y]` is a Uint8Array view onto row y of one buffer.

       Four bytes a tile all told — one for the walls, one for the contact
       shadows, two for the zone, one for the surface — plus four for the
       per-tile noise, against about fifty before. See zid()/sid() for the two
       that hold names: a zone is an index into a table of its own, so a tile
       costs two bytes instead of a pointer. */
    const N = MAPW * MAPH;
    this._solid = new Uint8Array(N).fill(1);
    this._zone = new Uint16Array(N);
    this._surf = new Uint8Array(N);
    /* Float32 rather than double: the value is a texture seed thresholded at a
       couple of decimal places and never arithmetic, so the extra four bytes a
       tile bought nothing. Filled in the same row-major order it always was, so
       the same tile gets the same number. */
    this._seed = new Float32Array(N);
    for (let i = 0; i < N; i++) this._seed[i] = Math.random();
    this.solid = rows(this._solid);
    this.zone = rows(this._zone);
    this.surf = rows(this._surf);
    this.seed = rows(this._seed);
    /* The names behind those indices. Index 0 is "none" in both, which is what
       makes every `!World.zone[y][x]` test in the engine go on working without
       being told anything. */
    this.zoneName = [null]; this._zoneId = new Map();
    this.surfName = [null]; this._surfId = new Map();
    (def.rooms || []).forEach(rm => {
      const [x1, y1, x2, y2] = rm.r;
      const z = this.zid(rm.z);
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) { this.solid[y][x] = 0; this.zone[y][x] = z; }
    });
    /* What the ground is MADE of, where that differs from what its room is made
       of — the tarmac over the middle of a street, laid on after the rooms
       because it crosses them. Art and nothing else: it is not consulted by
       isSolid(), it does not open or close a tile, and a level that declares
       none is exactly the level it always was. */
    (def.surfaces || []).forEach(sf => {
      const [x1, y1, x2, y2] = sf.r;
      for (let y = Math.max(0, y1); y <= Math.min(MAPH - 1, y2); y++)
        for (let x = Math.max(0, x1); x <= Math.min(MAPW - 1, x2); x++) this.surf[y][x] = this.sid(sf.s);
    });
    /* The cars, if this level has any. Built here rather than in furnish()
       because a car is not an object on a tile: it is at a pixel, at an angle,
       possibly moving, and possibly with the player inside it. Cars.build turns
       the catalogue's tile positions into that; on a page that never loaded
       engine/cars.js — the editor's, before it was taught about them — the
       level simply has no cars in it and everything else works. */
    this.cars = (typeof Cars !== 'undefined' && def.cars) ? Cars.build(def.cars) : [];
    /* And the people on the street, which are the same kind of thing as the
       cars and for the same reason: at a pixel, walking, and not the twenty
       colleagues in NPCM — see engine/peds.js. */
    this.peds = (typeof Peds !== 'undefined' && def.peds) ? Peds.build(def.peds) : [];
    /* And the lights, which are the third thing on this map that is not on a
       tile — a signal is a pole at a tile and a stop line at a point on a lane,
       and the lane is half a tile off the grid. Built here with the cars and
       the people because it has state that has to travel with the level: walk
       into the building while the crossing is bleeping and come back out, and
       it is where it was, not back at the start of its cycle. */
    this.signals = (typeof Signals !== 'undefined' && def.signals) ? Signals.build(def.signals) : [];
    (def.doors || []).forEach(d => {
      this.solid[d.y][d.x] = 0;
      /* Whether this door is a HOLE CUT IN A WALL or a leaf standing on floor a
         room already covers is known here and nowhere else, and it is the same
         fact as `|| d.z` below: a tile with no zone yet had no room over it, so
         the door is what opened it. Kept, because the renderer asks it of the
         two tiles either side of a doorway in a wall run — the one above an
         opening is its head and is finished like the room it leads to, and the
         one below an opening is NOT the room above it and must not be. */
      if (!this.zone[d.y][d.x]) this.openings.add(d.x + ',' + d.y);
      this.zone[d.y][d.x] = this.zone[d.y][d.x] || this.zid(d.z);
      this.add({ x: d.x, y: d.y, e: d.locked ? '🔐' : '🚪', name: d.name, kind: 'door', solid: false, use: d.locked ? 'lockedDoor' : 'door', locked: d.locked || null });
    });
    /* THE POLES. A signal's arms declare where its posts stand, and a post on
       a pavement is furniture: it is on a tile, it is solid, you walk round it
       and you can press it. So they are added here rather than written out a
       second time in furnish() — one declaration, and nothing can drift out of
       step with the lights it is carrying. Before furnish(), so a level is
       still free to put something next to one. */
    this.signals.forEach(inst => inst.arms.forEach(arm => {
      this.add({
        x: arm.tx, y: arm.ty, e: '🚦', kind: 'signal', solid: true, noEmoji: true,
        name: inst.kind === 'pelican' ? 'The crossing' : 'The lights',
        use: inst.kind === 'pelican' ? 'crossingButton' : 'trafficLights',
        /* The back-reference, and it is what the renderer draws from and what
           the act reads. An arm knows its installation, so one field is the
           whole of the link. */
        arm
      });
    }));
    def.furnish.call(this);
    this.computeAO();
    this.buildDoorways();
    this.buildFurniture();
    return this;
  },
  /* Is this tile an opening cut through a wall run rather than floor a room
     covers? Only `def.doors` can be one — a hatch or a lift is an object that
     stands on a floor a room already has, and answering yes for those would
     make a wall above one stop belonging to the room it is in. */
  isOpening(x, y) { return !!this.openings && this.openings.has(x + ',' + y); },

  /* Is there a sky over this one. Everything outdoors is decided from this
     single flag: no ceiling lights, daylight instead of strip lighting, and the
     void beyond the walls painted as sky rather than left black. */
  indoors() { return !this.def || this.def.indoors !== false; },
  /* Work out once, here, how each object is furnished: which wall it hangs on,
     which worktop it stands on, and where the tables and counters run. All of
     it is art — nothing below touches World.solid, so what is walkable and
     what you can interact with are exactly what they were. */
  buildFurniture() {
    const at = (x, y) => (x < 0 || y < 0 || x >= MAPW || y >= MAPH) ? 1 : this.solid[y][x];
    this.worktops = []; this.tables = [];
    /* Where the front desks are is a fact about a particular level, not about
       furnishing in general, so it comes from the level definition. Copied
       rather than referenced: the renderer is free to annotate these and must
       not write through to the catalogue, which outlives the build. */
    this.counters = (this.def.counters || []).map(t => Object.assign({}, t));
    const onCounter = (x, y) => this.counters.some(t => y === t.y && x >= t.x && x < t.x + t.w);

    this.objects.forEach(o => {
      if (onCounter(o.x, o.y)) o.onCounter = true;
      /* The kind says how this sort of thing is normally furnished; the object
         gets the last word. Merged once, here, so the renderer never has to ask
         the question twice. */
      const f = o.fdef = Object.assign({}, FURN[o.kind], o.furn);
      o.mount = f.mount || null;
      o.art = f.art || null;
      if (f.drawn || f.art) o.noEmoji = true;
      /* The kit only draws fronts, so a cupboard needs its back to a wall
         behind it. The cabinet and trophy shelf are against the SOUTH wall,
         which put their doors flat against the plaster: those keep the emoji. */
      if (f.sprite && (f.sprite === 'obj.cabinet' || f.sprite === 'obj.shelf')
          && at(o.x, o.y + 1) && !at(o.x, o.y - 1)) f.sprite = null;
      /* Which wall is it against? North reads best — you see the whole face of
         it — so prefer that, then the sides, then the wall below. Something
         standing in open floor keeps mount null and stays on the floor rather
         than being hung on a wall two tiles away that it never touched. */
      if (f.mount === 'wall') {
        const side = at(o.x, o.y - 1) ? 'n' : at(o.x - 1, o.y) ? 'w'
          : at(o.x + 1, o.y) ? 'e' : at(o.x, o.y + 1) ? 's' : null;
        o.wallSide = side;
        if (!side) o.mount = null;
      }
    });

    /* Group surface-mounted things into runs along a row, so the kettle, the
       washing up and the biscuit tin are one counter rather than three objects
       on squares of carpet. A run bridges a tile ONLY when something stands on
       it: bridging any gap read the four spaced-out training modules as one
       bench with holes in it, and once bare stretches became solid those holes
       sealed off the front of the room. */
    /* A table is a surface too: standing on a table tile is derived, like
       sitting. Must run BEFORE the worktops are grouped, or a jug on the
       meeting table gets a one-tile kitchen counter of its own. */
    const tabTiles = new Set(this.objects.filter(o => o.kind === 'table').map(o => o.x + ',' + o.y));
    this.objects.forEach(o => {
      if (o.kind !== 'table' && tabTiles.has(o.x + ',' + o.y)) o.onTable = true;
    });

    const surfaces = this.objects.filter(o => o.mount === 'surface' && !o.onTable);
    const rows = new Map();
    surfaces.forEach(o => {
      const k = o.y;
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(o);
    });
    rows.forEach((list, y) => {
      list.sort((a, b) => a.x - b.x);
      let run = [list[0]];
      const flush = () => {
        const x0 = run[0].x, x1 = run[run.length - 1].x;
        this.worktops.push({ x: x0, y, w: x1 - x0 + 1 });
        run.forEach(o => o.onTop = true);
      };
      for (let i = 1; i < list.length; i++) {
        const prev = run[run.length - 1].x, gap = list[i].x - prev;
        const bridged = gap === 1 || (gap === 2 && this.at(prev + 1, y).length > 0);
        if (bridged) run.push(list[i]);
        else { flush(); run = [list[i]]; }
      }
      flush();
    });

    /* Tables are drawn, not emoji. Contiguous table tiles on a row are one
       table — the long table in Meeting Room 2 is four of them. */
    const tabs = this.objects.filter(o => o.kind === 'table').sort((a, b) => a.y - b.y || a.x - b.x);
    let cur = null;
    tabs.forEach(o => {
      if (cur && o.y === cur.y && o.x === cur.x + cur.w) cur.w++;
      else { cur = { x: o.x, y: o.y, w: 1 }; this.tables.push(cur); }
    });

    /* Everything above this line is art; this is not. Bare stretches of a
       counter or worktop go in World.blocked, which isSolid() consults — NOT
       World.solid, which means *wall* to the renderer and would grow one on the
       worktop. Tiles carrying an object are left alone: that object's own
       `solid` still decides, which keeps the red tray and the cake walkable. */
    this.blocked = new Set();
    const fill = t => {
      for (let i = 0; i < t.w; i++)
        if (!this.at(t.x + i, t.y).length) this.blocked.add((t.x + i) + ',' + t.y);
    };
    this.counters.forEach(fill);
    this.worktops.forEach(fill);
  },
  /* A door is walkable floor punched through a wall run; the doorway is art
     only. Work out each opening's axis once here so the renderer can build it
     into the wall — jambs, threshold, and a leaf on the hinge side. */
  buildDoorways() {
    const at = (x, y) => (x < 0 || y < 0 || x >= MAPW || y >= MAPH) ? 1 : this.solid[y][x];
    this.doorways = [];
    /* 'loo' is NOT a door. The cubicles are toilets, and treating them as
       doorways drew a door leaf lying on its side across each one and
       suppressed the toilet underneath — the room had no toilets in it. They
       get proper stalls from R.cubicles() instead. */
    const isDoor = o => o.kind === 'door' || o.kind === 'exit';
    /* Probe PAST the opening. A two-tile doorway's neighbour is its other
       half, not a jamb; reading it as floor gave the corridor and main-floor
       doors the wrong axis and drew them lying on their side. */
    const doorTiles = new Set(this.objects.filter(isDoor).map(o => o.x + ',' + o.y));
    const jamb = (x, y, dx, dy) => {
      let cx = x + dx, cy = y + dy;
      while (doorTiles.has(cx + ',' + cy)) { cx += dx; cy += dy; }
      return at(cx, cy);
    };
    this.objects.forEach(o => {
      if (!isDoor(o)) return;
      const lr = jamb(o.x, o.y, -1, 0) && jamb(o.x, o.y, 1, 0);
      const ud = jamb(o.x, o.y, 0, -1) && jamb(o.x, o.y, 0, 1);
      /* 'h' = jambs to the left and right, so you walk through it vertically. */
      const axis = lr && !ud ? 'h' : (ud && !lr ? 'v' : (lr ? 'h' : 'v'));
      /* For a door set into a solid wall, the leaf faces whichever side you can
         actually stand on. */
      let face = 1;
      if (o.solid) {
        if (axis === 'h') face = !at(o.x, o.y + 1) ? 1 : -1;
        else face = !at(o.x + 1, o.y) ? 1 : -1;
      }
      /* `shop` is the one thing a frontage door has that an internal one does
         not: a `via`, naming the link it takes you out through. Every shop,
         pub, flat and cathedral entrance on the street has one; the way OUT of
         those, on the inside, does not. It is carried here so R.kitDoor() can
         hang a different leaf on the two — see the note there about twenty
         copies of one sticker lying across a pavement. */
      this.doorways.push({ x: o.x, y: o.y, axis, face, into: this.behind(o),
        locked: !!o.locked, solid: !!o.solid, kind: o.kind, shop: !!o.via });
      /* The drawn doorway replaces the emoji; two doors on one tile is worse
         than none. The object itself stays exactly as it was, so interaction,
         the minimap and every Act are untouched. */
      o.noEmoji = true;
    });
  },
  /* WHAT IS ON THE OTHER SIDE OF IT, as a zone.

     A doorway cut into wall MASS — the front doors of this building, and every
     shopfront on the parade — is not an opening anything walks through: the
     room behind it is a different level and the tile the leaf hangs on is a
     foot of brick. Drawn as it stood, you looked through an open door at a
     wall, which is the one thing a door must never show you.

     So ask the catalogue. `via` names a link, or the handler does its own
     naming where a way out and its link are the same word; the link names a
     level and an entry; the entry stands somewhere, and somewhere is in a room
     with a floor. That zone is what R.thresholds() paints in the gap. Answered
     once per build rather than once per frame, and null for every doorway that
     leads nowhere in particular — a cupboard, a fire escape, the hatch — which
     is exactly the set that should go on showing what it always showed. */
  behind(o) {
    const via = o.via || o.use;
    const links = (this.def && this.def.links) || [];
    const link = links.find(l => l.via === via);
    const def = link && typeof LEVELS !== 'undefined' ? LEVELS[link.to] : null;
    if (!def || !def.rooms || !def.rooms.length) return null;
    /* The room the arrival point stands in, which is the floor you would see
       first. A level whose entry has drifted off its own rooms still has a
       first room, and the first room of a shop is the shop. */
    const at = (def.entries || {})[link.entry];
    if (at) {
      const tx = Math.floor(at[0]), ty = Math.floor(at[1]);
      const rm = def.rooms.find(r => tx >= r.r[0] && ty >= r.r[1] && tx <= r.r[2] && ty <= r.r[3]);
      if (rm) return rm.z;
    }
    return def.rooms[0].z;
  },
  /* Precompute, per open tile, which sides touch a wall. Used to lay a contact
     shadow along those edges — the cheapest way to stop the floor and the walls
     looking like two unrelated flat colours. */
  computeAO() {
    this._ao = new Uint8Array(MAPW * MAPH);
    this.ao = rows(this._ao);
    for (let y = 0; y < MAPH; y++) {
      for (let x = 0; x < MAPW; x++) {
        if (this.solid[y][x] || !this.zone[y][x]) { this.ao[y][x] = 0; continue; }
        let m = 0;
        if (y > 0 && this.solid[y - 1][x]) m |= 1;
        if (y < MAPH - 1 && this.solid[y + 1][x]) m |= 2;
        if (x > 0 && this.solid[y][x - 1]) m |= 4;
        if (x < MAPW - 1 && this.solid[y][x + 1]) m |= 8;
        this.ao[y][x] = m;
      }
    }
  },
  add(o) {
    o.id = 'o' + this.objects.length;
    o.wob = Math.random() * 6.28;
    this.objects.push(o);
    const k = o.x + ',' + o.y;
    if (!this.byTile.has(k)) this.byTile.set(k, []);
    this.byTile.get(k).push(o);
    return o;
  },
  at(x, y) { return this.byTile.get(x + ',' + y) || []; },
  isSolid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return true;
    if (this.solid[ty][tx]) return true;
    /* The bare stretches of counter and worktop — see buildFurniture(). Kept
       out of World.solid on purpose: solid means wall, and these are waist
       height. */
    if (this.blocked && this.blocked.has(tx + ',' + ty)) return true;
    /* Whatever a car is standing on this instant. Here rather than baked into
       the map at build time, because a car moves and the map does not: this is
       the one question every walker already asks — the player, a colleague on
       an errand, the pathfinder behind them — so putting the answer here is
       what makes a parked car something you go round instead of through,
       without any of them learning what a car is.
       It is also why it is a live set filled by Cars.sync() rather than
       something build() writes: the editor builds levels too, and a car parked
       across the only gap in a wall is not a fault in the FLOOR PLAN, which is
       what the editor's connectivity check is asking about. */
    if (this.carTiles && this.carTiles.has(tx + ',' + ty)) return true;
    return this.at(tx, ty).some(o => o.solid);
  },
  /* GROUND YOU CAN SEE AND CANNOT STAND ON.

     Everything solid in this game is a wall or a building: the renderer gives
     it a face where a floor can see it and a roof where none can, and for a
     year that was the whole truth, because the only solid thing outdoors was
     the back of a parade. Then the map got a river and a railway, and both of
     them are ground — you can look straight at them, you can drive over them
     on a bridge, and neither is the roof of anything.

     So a SURFACE may say `open`, and a tile carrying one is drawn as what it
     is made of and skipped by the wall pass entirely. Nothing else changes:
     it is still solid, isSolid() has not been touched, and you can no more
     walk into the river than you could walk into the car park wall. What it
     costs is one lookup per tile in three loops that already do one, and a
     level that declares no open surface is exactly the level it always was. */
  open(tx, ty) {
    const s = this.surfAt(tx, ty);
    return !!(s && SURFACES[s] && SURFACES[s].open);
  },
  /* What this tile is made of, which is not always what its room is made of.
     Null means "whatever the zone says", which is every tile of every level
     that does not declare a surface. */
  surfAt(tx, ty) {
    if (!this.surf || tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return null;
    return this.surfName[this.surf[ty][tx]] || null;
  },
  /* A NAME, AS AN INDEX. Both tables start with a null at 0, so a tile with no
     zone and a tile with no surface both read as 0 — which is falsy, which is
     exactly what `null` was, and is why every truthiness test in the engine
     went on working when the strings became numbers. Registered on the way in
     and never removed: a level has a dozen zones and five surfaces. */
  zid(name) {
    if (!name) return 0;
    let i = this._zoneId.get(name);
    if (i === undefined) { i = this.zoneName.length; this.zoneName.push(name); this._zoneId.set(name, i); }
    return i;
  },
  sid(name) {
    if (!name) return 0;
    let i = this._surfId.get(name);
    if (i === undefined) { i = this.surfName.length; this.surfName.push(name); this._surfId.set(name, i); }
    return i;
  },
  zoneAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return null;
    return this.zoneName[this.zone[ty][tx]] || null;
  },
  /* The furniture itself is content, and lives with the rest of the content:
     each level's `furnish` in data/levels.js, called above with World as `this`
     so it still says `this.add(o)` and still records `this.desks`. It is here
     for the same reason Acts is in data/acts.js — it is one entry per object
     and it is where the writing is, not where the engine is. */
};
