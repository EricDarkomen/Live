'use strict';
/* ---------------- The level being edited ----------------
   One level as plain data. A level's furniture is a furnish() with loops, so
   loading builds it once with the real builder and captures the result. The
   doc hands World a definition of data/levels.js's shape, World.build() and
   R.draw() do the rest, so the preview is the game. A procedural furnish()
   flattens on the way in, which is why Emit exports geometry and furniture
   separately. */

const Doc = {
  /* Fields World.build() and the renderer derive; never captured back. */
  DERIVED: ['id', 'wob', 'fdef', 'mount', 'art', 'noEmoji', 'wallSide',
    'onTable', 'onTop', 'onCounter',
    /* A signal post's arm: made by World.build() from `signals`, and circular
       (arm to installation to arm), which JSON cannot clone. */
    'arm',
    /* The cached collision footprint, derived like `fdef` and `wallSide`. */
    '_foot'],

  id: null,
  name: '', w: 0, h: 0, indoors: true, hub: false,
  rooms: [], doors: [], counters: [], entries: {}, links: [],
  objects: [], desks: [],
  /* Carried, not edited: surfaces, roofs, paint, cars, peds and signals. Cloned
     on load, passed to the builder for the preview, and written back by Emit. */
  surfaces: [], roofs: [], paint: [], cars: [], peds: [], signals: [],
  /* The NPC schedule waypoints from data/world.js, edited on the hub (where the
     schedules are); empty elsewhere. */
  waypoints: {},

  /* The state this level was loaded in, for the change list. */
  base: null,
  /* What furnish() did to the map (buildings as mass): captured by load(),
     never edited, not in state(). */
  mass: [], carved: [],
  /* Filled by HIST, mixed in at the foot of this file. */
  undoStack: [], redoStack: [],

  /* ---- loading ---- */

  /* Build a level for real and capture the result. World is left holding this
     level, which is what the editor wants anyway. */
  load(id) {
    const def = LEVELS[id];
    if (!def) return false;

    /* What the furnish did to the map. Rooms carve floor from solid; houses put
       mass back, which only the level's furnish does. Captured by comparing a
       build without the furnish (the baseline) to the real one, always, since a
       composed level's furnish runs its parts' through closures. Cheap: 9ms for
       the largest level. */
    World.build(Object.assign({}, def, { furnish() {} }));
    const base = World.solid.map(r => r.slice());
    World.build(def);

    /* Kept out of state(): captured, never edited, and too large to snapshot per
       undo step. Only load() sets it. */
    this.mass = []; this.carved = [];
    for (let y = 0; y < base.length; y++) {
      for (let x = 0; x < base[y].length; x++) {
        if (World.solid[y][x] && !base[y][x]) this.mass.push([x, y]);
        else if (!World.solid[y][x] && base[y][x]) this.carved.push([x, y]);
      }
    }

    this.id = id;
    this.name = def.name || id;
    this.w = def.w; this.h = def.h;
    this.indoors = def.indoors !== false;
    this.hub = !!def.hub;
    /* Cloned, not referenced. LEVELS.office.rooms IS ROOM_DEFS — editing the
       doc in place would edit data/world.js's own array and every other reader
       of it. */
    this.rooms = clone(def.rooms || []);
    this.doors = clone(def.doors || []);
    this.counters = clone(def.counters || []);
    this.entries = clone(def.entries || {});
    this.links = clone(def.links || []);
    this.surfaces = clone(def.surfaces || []);
    this.roofs = clone(def.roofs || []);
    this.paint = clone(def.paint || []);
    this.cars = clone(def.cars || []);
    this.peds = clone(def.peds || []);
    this.signals = clone(def.signals || []);

    /* World.build() adds objects before furnish(); regenerated each build, so they
       are skipped, or every rebuild doubles them. */
    const skip = this.preface();
    /* `_k` is a stable identity for the change list (undo snapshots by value, so
       a move is otherwise indistinguishable from delete and add). Never emitted. */
    this.objects = World.objects.slice(skip).map((o, i) => {
      const d = this.strip(o);
      d._k = 'b' + i;
      return d;
    });
    this.nextKey = 0;
    this.desks = clone(World.desks || []);
    this.waypoints = def.hub ? clone(WP) : {};

    this.rebase();
    return true;
  },
  /* The built object a doc object became: the doc's index plus the preface is
     the build order exactly. */
  built(i) { return World.objects[this.preface() + i] || null; },

  /* How many objects World.build() puts before the furniture: one per door and
     one post per signal arm, counted off what World built. */
  preface() {
    return this.doors.length
      + ((World.signals || []).reduce((n, inst) => n + (inst.arms || []).length, 0));
  },

  /* An object as it was written, without what the build worked out about it. */
  strip(o) {
    const out = {};
    for (const k in o) if (this.DERIVED.indexOf(k) < 0) out[k] = clone(o[k]);
    return out;
  },

  /* ---- what the builder is given ---- */

  /* A definition in data/levels.js's shape: furnish() replays the captured list
     and restores `desks` for the renderer. */
  def() {
    const objects = this.objects, desks = this.desks;
    const mass = this.mass || [], carved = this.carved || [];
    return {
      id: this.id, name: this.name, w: this.w, h: this.h,
      indoors: this.indoors, hub: this.hub,
      rooms: this.rooms, doors: this.doors, counters: this.counters,
      entries: this.entries, links: this.links,
      surfaces: this.surfaces, roofs: this.roofs, paint: this.paint, cars: this.cars, peds: this.peds,
      signals: this.signals,
      furnish() {
        /* Mass before objects, as the levels do, so wall detection sees it. */
        mass.forEach(t => { this.solid[t[1]][t[0]] = 1; });
        carved.forEach(t => { this.solid[t[1]][t[0]] = 0; });
        objects.forEach(o => {
          const c = clone(o);
          delete c._k;                 /* the editor's bookkeeping, not the game's */
          this.add(c);
        });
        this.desks = clone(desks);
      }
    };
  },
  /* Rebuild from the doc, and refresh the panel, in one place. */
  rebuild() {
    World.build(this.def());
    /* Re-index Things (palette, job targets, placements) on every rebuild. */
    Things.build();
    Check.run();
    if (Side.live) Side.refresh();
    return this;
  },

  /* ---- undo ---- */

  /* The doc as plain data: small enough to snapshot per edit. */
  state() {
    return clone({
      name: this.name, w: this.w, h: this.h, indoors: this.indoors, hub: this.hub,
      rooms: this.rooms, doors: this.doors, counters: this.counters,
      entries: this.entries, links: this.links,
      surfaces: this.surfaces, roofs: this.roofs, paint: this.paint, cars: this.cars, peds: this.peds,
      signals: this.signals,
      objects: this.objects, desks: this.desks, waypoints: this.waypoints
    });
  },
  restore(s) {
    Object.keys(s).forEach(k => this[k] = clone(s[k]));
  },
  /* mark / undo / redo / rebase / changed come from HIST — the same undo the
     job and dialogue documents get, written once. */

  /* ---- editing ----
     Each of these marks, mutates and rebuilds; nothing else writes the arrays. */

  addObject(o) {
    this.mark('place ' + (o.name || o.kind));
    o._k = 'n' + (this.nextKey++);
    this.objects.push(o);
    this.rebuild();
    return o;
  },
  /* Objects are addressed by their index in the doc's own list, which is also
     their build order and therefore stable between rebuilds. */
  removeObject(i) {
    const o = this.objects[i];
    if (!o) return false;
    this.mark('delete ' + (o.name || o.kind));
    this.objects.splice(i, 1);
    this.rebuild();
    return true;
  },
  moveObject(i, x, y) {
    const o = this.objects[i];
    if (!o || (o.x === x && o.y === y)) return false;
    this.mark('move ' + (o.name || o.kind));
    o.x = x; o.y = y;
    this.rebuild();
    return true;
  },
  setObject(i, k, v) {
    const o = this.objects[i];
    if (!o) return false;
    this.mark('edit ' + (o.name || o.kind));
    if (v === null || v === undefined || v === '') delete o[k];
    else o[k] = v;
    this.rebuild();
    return true;
  },

  addRoom(z, x1, y1, x2, y2) {
    this.mark('draw ' + ((ZONES[z] || {}).name || z));
    this.rooms.push({ z: z, r: [x1, y1, x2, y2] });
    this.rebuild();
  },
  removeRoom(i) {
    const rm = this.rooms[i];
    if (!rm) return false;
    this.mark('delete ' + ((ZONES[rm.z] || {}).name || rm.z));
    this.rooms.splice(i, 1);
    this.rebuild();
    return true;
  },
  setRoomZone(i, z) {
    const rm = this.rooms[i];
    if (!rm || rm.z === z) return false;
    this.mark('rezone');
    rm.z = z;
    this.rebuild();
    return true;
  },
  /* Which room owns a tile. Last wins, because that is what World.build() does
     — it paints the rooms in order, so a later one overwrites an earlier. */
  roomAt(x, y) {
    let hit = -1;
    this.rooms.forEach((rm, i) => {
      const [x1, y1, x2, y2] = rm.r;
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) hit = i;
    });
    return hit;
  },

  doorAt(x, y) { return this.doors.findIndex(d => d.x === x && d.y === y); },
  addDoor(x, y, z, name, locked) {
    this.mark('place door');
    const d = { x: x, y: y, z: z, name: name || (ZONES[z] || {}).name || 'Door' };
    if (locked) d.locked = locked;
    this.doors.push(d);
    this.rebuild();
    return d;
  },
  removeDoor(i) {
    if (!this.doors[i]) return false;
    this.mark('delete door');
    this.doors.splice(i, 1);
    this.rebuild();
    return true;
  },
  setDoor(i, k, v) {
    const d = this.doors[i];
    if (!d) return false;
    this.mark('edit door');
    if (v === null || v === undefined || v === '') delete d[k];
    else d[k] = v;
    this.rebuild();
    return true;
  },

  addCounter(x, y, w, label) {
    this.mark('draw counter');
    this.counters.push({ x: x, y: y, w: w, label: label || 'COUNTER' });
    this.rebuild();
  },
  removeCounter(i) {
    if (!this.counters[i]) return false;
    this.mark('delete counter');
    this.counters.splice(i, 1);
    this.rebuild();
    return true;
  },
  counterAt(x, y) {
    return this.counters.findIndex(t => y === t.y && x >= t.x && x < t.x + t.w);
  },

  /* Entries are in tiles and may be fractional; placed at the tile centre. */
  setEntry(name, tx, ty) {
    this.mark('move entry ' + name);
    this.entries[name] = [tx + 0.5, ty + 0.5];
    this.rebuild();
  },
  addEntry(name, tx, ty) {
    this.mark('add entry ' + name);
    this.entries[name] = [tx + 0.5, ty + 0.5];
    this.rebuild();
  },
  removeEntry(name) {
    if (!(name in this.entries)) return false;
    this.mark('delete entry ' + name);
    delete this.entries[name];
    this.rebuild();
    return true;
  },

  /* Waypoints are whole tiles. */
  setWaypoint(name, tx, ty) {
    this.mark('move ' + name);
    this.waypoints[name] = [tx, ty];
    this.rebuild();
  },
  addWaypoint(name, tx, ty) {
    this.mark('add waypoint ' + name);
    this.waypoints[name] = [tx, ty];
    this.rebuild();
  },
  removeWaypoint(name) {
    if (!(name in this.waypoints)) return false;
    this.mark('delete waypoint ' + name);
    delete this.waypoints[name];
    this.rebuild();
    return true;
  },
  waypointAt(x, y) {
    for (const k in this.waypoints) {
      const w = this.waypoints[k];
      if (w[0] === x && w[1] === y) return k;
    }
    return null;
  },

  setSize(w, h) {
    if (w === this.w && h === this.h) return false;
    this.mark('resize');
    this.w = w; this.h = h;
    this.rebuild();
    return true;
  },
  setFlag(k, v) {
    this.mark('set ' + k);
    this[k] = v;
    this.rebuild();
  },

  /* ---- reading ---- */

  /* Every doc object standing on a tile, newest last — which is the order they
     are drawn in, so the last one is the one on top. */
  objectsAt(x, y) {
    const out = [];
    this.objects.forEach((o, i) => { if (o.x === x && o.y === y) out.push({ i: i, o: o }); });
    return out;
  },
  entryAt(x, y) {
    for (const k in this.entries) {
      const e = this.entries[k];
      if (Math.floor(e[0]) === x && Math.floor(e[1]) === y) return k;
    }
    return null;
  }
};

Object.assign(Doc, HIST);
