'use strict';
/* ---------------- World: the loaded level ----------------
   The builder, and the map it built last. Definitions (ZONES, FURN, WP…) are
   in data/world.js; a level picks which. World is always whichever level is
   loaded, so its readers never need to know levels exist: Levels.go() swaps
   the contents and engine/levels.js keeps the rest.

   Every grid is one typed buffer with a subarray view per row, so
   `grid[y][x]` reads as it always did. EDGE is the row a shifted furnish
   writes to when it draws off the top or bottom of the map. */
const EDGE = new Uint8Array(4096);
function rows(buf) {
  const out = new Array(MAPH);
  for (let y = 0; y < MAPH; y++) out[y] = buf.subarray(y * MAPW, (y + 1) * MAPW);
  return out;
}

const World = {
  level: null, def: null,
  solid: null, zone: null, seed: null, surf: null, objects: [], byTile: new Map(),
  /* The world as a part's furnish sees it from its own corner (composeLevel):
     add() offsets, and solid rows start at the part's left edge. A write past
     a typed array's end is dropped, which is what drawing past the edge should do. */
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
    MAPW = def.w; MAPH = def.h;
    this.objects = []; this.byTile = new Map();
    /* Derived, and reset, or a level inherits the last one's desks. */
    this.desks = []; this.worktops = []; this.tables = []; this.doorways = [];
    this.openings = new Set();
    this.blocked = new Set();
    /* Tiles under a car, refilled by Cars.sync() every frame; see isSolid(). */
    this.carTiles = new Set();
    /* About five bytes a tile: walls, zone (index into zoneName), surface
       (index into surfName), plus a float seed for texture noise. */
    const N = MAPW * MAPH;
    this._solid = new Uint8Array(N).fill(1);
    this._zone = new Uint16Array(N);
    this._surf = new Uint8Array(N);
    this._seed = new Float32Array(N);
    for (let i = 0; i < N; i++) this._seed[i] = Math.random();
    this.solid = rows(this._solid);
    this.zone = rows(this._zone);
    this.surf = rows(this._surf);
    this.seed = rows(this._seed);
    /* Index 0 is "none", so `!World.zone[y][x]` still means no zone. */
    this.zoneName = [null]; this._zoneId = new Map();
    this.surfName = [null]; this._surfId = new Map();
    (def.rooms || []).forEach(rm => {
      const [x1, y1, x2, y2] = rm.r;
      const z = this.zid(rm.z);
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) { this.solid[y][x] = 0; this.zone[y][x] = z; }
    });
    /* What the ground is made of where it differs from its room. Art only. */
    (def.surfaces || []).forEach(sf => {
      const [x1, y1, x2, y2] = sf.r;
      for (let y = Math.max(0, y1); y <= Math.min(MAPH - 1, y2); y++)
        for (let x = Math.max(0, x1); x <= Math.min(MAPW - 1, x2); x++) this.surf[y][x] = this.sid(sf.s);
    });
    /* Cars, people and signals are at pixels, not on tiles, and keep their
       state with the level. */
    this.cars = def.cars ? Cars.build(def.cars) : [];
    this.peds = def.peds ? Peds.build(def.peds) : [];
    this.signals = def.signals ? Signals.build(def.signals) : [];
    (def.doors || []).forEach(d => {
      this.solid[d.y][d.x] = 0;
      /* A door on a tile no room covered cut a hole in a wall: an opening. */
      if (!this.zone[d.y][d.x]) this.openings.add(d.x + ',' + d.y);
      this.zone[d.y][d.x] = this.zone[d.y][d.x] || this.zid(d.z);
      this.add({ x: d.x, y: d.y, e: d.locked ? '🔐' : '🚪', name: d.name, kind: 'door', solid: false, use: d.locked ? 'lockedDoor' : 'door', locked: d.locked || null });
    });
    /* Each signal arm's post is solid, pressable furniture. Added before
       furnish(), so a level can still put something next to one. */
    this.signals.forEach(inst => inst.arms.forEach(arm => {
      this.add({
        x: arm.tx, y: arm.ty, e: '🚦', kind: 'signal', solid: true, noEmoji: true,
        name: inst.kind === 'pelican' ? 'The crossing' : 'The lights',
        use: inst.kind === 'pelican' ? 'crossingButton' : 'trafficLights',
        arm   /* what the renderer draws and the act reads */
      });
    }));
    def.furnish.call(this);
    this.buildSwim();
    this.computeAO();
    this.buildDoorways();
    this.buildFurniture();
    return this;
  },
  /* Water you can swim in: the lagoon, and the sea out to SWIM_REACH tiles
     from the nearest ground you can stand on. Collide lets the player (and only
     the player) through it; engine/moves.js does the swimming. */
  SWIM_REACH: 6,
  buildSwim() {
    const N = MAPW * MAPH, d = new Int16Array(N).fill(-1), q = [];
    const wet = (x, y) => { const s = this.surfAt(x, y); return s === 'sea' || s === 'water'; };
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      if (!this.solid[y][x] && !wet(x, y)) { d[y * MAPW + x] = 0; q.push(y * MAPW + x); }
    }
    this._swim = new Uint8Array(N);
    let any = false;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % MAPW, y = (i - x) / MAPW;
      if (d[i] >= this.SWIM_REACH) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * MAPW + nx;
        if (nx < 0 || ny < 0 || nx >= MAPW || ny >= MAPH || d[j] >= 0 || !wet(nx, ny)) continue;
        d[j] = d[i] + 1; this._swim[j] = 1; any = true; q.push(j);
      }
    }
    this.swim = any ? rows(this._swim) : null;
  },
  /* An opening cut through a wall run, rather than floor a room covers. */
  isOpening(x, y) { return !!this.openings && this.openings.has(x + ',' + y); },

  /* Outdoors means daylight, no ceiling lights, and sky beyond the walls. */
  indoors() { return !this.def || this.def.indoors !== false; },
  /* How each object is furnished: which wall it hangs on, which worktop it
     stands on, where tables and counters run. Art, except World.blocked. */
  buildFurniture() {
    const at = (x, y) => (x < 0 || y < 0 || x >= MAPW || y >= MAPH) ? 1 : this.solid[y][x];
    this.worktops = []; this.tables = [];
    /* Copied: the renderer annotates these, and the catalogue outlives the build. */
    this.counters = (this.def.counters || []).map(t => Object.assign({}, t));
    const onCounter = (x, y) => this.counters.some(t => y === t.y && x >= t.x && x < t.x + t.w);

    this.objects.forEach(o => {
      if (onCounter(o.x, o.y)) o.onCounter = true;
      /* The kind's defaults, with the object's own `furn` on top. */
      const f = o.fdef = Object.assign({}, FURN[o.kind], o.furn);
      o.mount = f.mount || null;
      o.art = f.art || null;
      if (f.drawn || f.art) o.noEmoji = true;
      /* Art that only draws a front needs its back to a wall. */
      if (f.sprite && f.frontOnly && at(o.x, o.y + 1) && !at(o.x, o.y - 1)) f.sprite = null;
      /* Against which wall: north reads best, then the sides, then south.
         In open floor it stays on the floor. */
      if (f.mount === 'wall') {
        const side = at(o.x, o.y - 1) ? 'n' : at(o.x - 1, o.y) ? 'w'
          : at(o.x + 1, o.y) ? 'e' : at(o.x, o.y + 1) ? 's' : null;
        o.wallSide = side;
        if (!side) o.mount = null;
      }
    });

    /* Surface things on a row group into one worktop, bridging a tile only
       where something stands on it. Table tiles are surfaces too, so they are
       marked first. */
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

    /* Contiguous table tiles on a row are one drawn table. */
    const tabs = this.objects.filter(o => o.kind === 'table').sort((a, b) => a.y - b.y || a.x - b.x);
    let cur = null;
    tabs.forEach(o => {
      if (cur && o.y === cur.y && o.x === cur.x + cur.w) cur.w++;
      else { cur = { x: o.x, y: o.y, w: 1 }; this.tables.push(cur); }
    });

    /* Bare counter and worktop go in World.blocked (waist height, not wall);
       a tile with an object on it keeps that object's own `solid`. */
    this.blocked = new Set();
    const fill = t => {
      for (let i = 0; i < t.w; i++)
        if (!this.at(t.x + i, t.y).length) this.blocked.add((t.x + i) + ',' + t.y);
    };
    this.counters.forEach(fill);
    this.worktops.forEach(fill);
  },
  /* Each doorway's axis and facing, for the renderer to build into the wall. */
  buildDoorways() {
    const at = (x, y) => (x < 0 || y < 0 || x >= MAPW || y >= MAPH) ? 1 : this.solid[y][x];
    this.doorways = [];
    const isDoor = o => o.kind === 'door' || o.kind === 'exit';
    /* Probe past the opening: a two-tile doorway's neighbour is its other half. */
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
      /* A door in a solid wall faces the side you can stand on. */
      let face = 1;
      if (o.solid) {
        if (axis === 'h') face = !at(o.x, o.y + 1) ? 1 : -1;
        else face = !at(o.x + 1, o.y) ? 1 : -1;
      }
      /* `shop`: a frontage door leading out through a link gets its own leaf. */
      this.doorways.push({ x: o.x, y: o.y, axis, face, into: this.behind(o),
        locked: !!o.locked, solid: !!o.solid, kind: o.kind, shop: !!o.via });
      o.noEmoji = true;
    });
  },
  /* The zone on the far side of a doorway into another level, painted in the
     gap so you never look through an open door at brick: the room its link's
     entry stands in, or that level's first room. Null for anything else. */
  behind(o) {
    const via = o.via || o.use;
    const links = (this.def && this.def.links) || [];
    const link = links.find(l => l.via === via);
    const def = link ? LEVELS[link.to] : null;
    if (!def || !def.rooms || !def.rooms.length) return null;
    const at = (def.entries || {})[link.entry];
    if (at) {
      const tx = Math.floor(at[0]), ty = Math.floor(at[1]);
      const rm = def.rooms.find(r => tx >= r.r[0] && ty >= r.r[1] && tx <= r.r[2] && ty <= r.r[3]);
      if (rm) return rm.z;
    }
    return def.rooms[0].z;
  },
  /* Per open tile, which sides touch a wall: the contact shadows. */
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
    if (this.blocked && this.blocked.has(tx + ',' + ty)) return true;
    /* Parked cars block through the question every walker already asks; a
       live set, so the editor's floor-plan checks never see them. */
    if (this.carTiles && this.carTiles.has(tx + ',' + ty)) return true;
    return this.at(tx, ty).some(o => o.solid);
  },
  /* Ground you can see and cannot stand on (a river): a SURFACE marked `open`
     is still solid but drawn as ground, never as a wall. */
  open(tx, ty) {
    const s = this.surfAt(tx, ty);
    return !!(s && SURFACES[s] && SURFACES[s].open);
  },
  /* The tile's surface, or null for "whatever the zone says". */
  surfAt(tx, ty) {
    if (!this.surf || tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return null;
    return this.surfName[this.surf[ty][tx]] || null;
  },
  /* A zone or surface name as its index, registered on first sight. */
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
  /* Furniture is content: each level's furnish() in data/levels.js, called with World as `this`. */
};
