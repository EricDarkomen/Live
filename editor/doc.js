'use strict';
/* ---------------- The level being edited ----------------
   One level, in the only form that can be edited: plain data. The catalogue in
   data/levels.js is not that — a level's furniture is a `furnish()` function
   with loops and comments in it — so loading a level here means BUILDING it
   once with the real builder and capturing what came out.

   That is the whole trick, and it is why the preview is trustworthy: the doc
   hands World a level definition of exactly the shape data/levels.js hands it,
   World.build() does the identical work (walls, doorways, worktops, AO), and
   R.draw() draws it with no idea an editor exists. What you see is what the
   player gets, because it is the same code.

   The cost is that a procedural furnish() flattens on the way in — office's
   thirty-two desks arrive as ninety-odd separate objects rather than as the
   two loops that made them. That is fine to EDIT and wrong to write back
   wholesale, which is why Emit treats geometry (perfectly round-trippable) and
   furniture (not) as two different exports. */

const Doc = {
  /* Fields World.build() and the renderer derive for themselves. Captured
     objects must not carry them back in: `id` is assigned by add() in build
     order, and a stale `wallSide` or `fdef` would be a lie the moment anything
     moved. */
  DERIVED: ['id', 'wob', 'fdef', 'mount', 'art', 'noEmoji', 'wallSide',
    'onTable', 'onTop', 'onCounter',
    /* The arm a signal post is carrying. Derived twice over: the post itself
       is made by World.build() out of `signals` and never by furnish(), and
       the arm it is handed points back at its installation, which points back
       at the arm. clone() is JSON and JSON does not do circles, so capturing
       one threw on the way in and took the whole town with it — the only
       level in the game with lights on it was the only level this editor
       could not open. */
    'arm',
    /* The cached collision footprint. Worked out from `fdef` and `wallSide`,
       both of which are already on this list and for the same reason: it is an
       answer, not a fact about the object, and an answer written back into
       data/levels.js is one that cannot be corrected. */
    '_foot'],

  id: null,
  name: '', w: 0, h: 0, indoors: true, hub: false,
  rooms: [], doors: [], counters: [], entries: {}, links: [],
  objects: [], desks: [],
  /* CARRIED, NOT EDITED. Six tables a level may declare that this editor has
     no tools for: what the ground is made of, what the buildings are roofed in,
     the paint on the road, the cars parked on it, the people walking about, and
     the traffic signals. They are cloned in on load, handed back to the builder so
     the preview is the real level, and written out again by Emit — because the
     one thing worse than not being able to edit something is quietly deleting
     it on the way past. Give one of them a tab one day and it comes out of
     this comment and into the file proper. */
  surfaces: [], roofs: [], paint: [], cars: [], peds: [], signals: [],
  /* The NPC schedule waypoints from data/world.js. Global rather than per-level
     because the schedules are: WP is one table and the colleagues who walk it
     all work on the hub, so that is the level it is edited on. Empty everywhere
     else, which is also what stops a second level offering to move the
     office's furniture around. */
  waypoints: {},

  /* The state this level was loaded in, for the change list. */
  base: null,
  /* What the level's own furnish() did to the MAP rather than to the objects —
     the buildings, which are not rooms and cannot be. Captured by load(), never
     edited, and deliberately not part of state(): see load(). */
  mass: [], carved: [],
  /* Filled by HIST, mixed in at the foot of this file. */
  undoStack: [], redoStack: [],

  /* ---- loading ---- */

  /* Build a level for real and capture the result. World is left holding this
     level, which is what the editor wants anyway. */
  load(id) {
    const def = LEVELS[id];
    if (!def) return false;

    /* WHAT THE FURNISH DID TO THE MAP, and it is not always nothing.
       A room carves walkable floor out of a map that starts solid; a HOUSE is
       the opposite — mass standing in the middle of a garden — and there is no
       such thing as an un-room. So the outdoor levels put that mass back in
       their own furnish(), which is the only place with the map in front of it.
       Capture the objects and not that, and the doc rebuilds a town with every
       building missing: eleven thousand tiles of it on the outskirts, and the
       six shopfronts that were leaning on those walls lose the wall and fall
       back to the floor. The preview is the game's own renderer, so a preview
       of a map the game would never build is the one thing this must not be.

       Baseline FIRST, so this costs one extra build rather than two — and
       UNCONDITIONALLY, rather than only on a level whose furnish names `solid`
       in its own source. That test was the first version and it was wrong about
       the island: a composed level's furnish runs its parts' furnishes through
       closures, so its own source is a seven-line `for` loop that mentions
       nothing, while the town inside it puts back eleven thousand tiles of
       building. A guess that cannot see into a closure is a guess that is
       silently wrong on exactly the levels this exists for.

       It is affordable, which is why there is no guess: a build with the
       furnish taken out is 9ms on the largest level in the game and 16ms for
       all twenty-six of them together. Measured, not assumed. */
    World.build(Object.assign({}, def, { furnish() {} }));
    const base = World.solid.map(r => r.slice());
    World.build(def);

    /* Kept OUT of state(): it is captured, never edited, and every undo mark
       snapshots the document by value — eleven thousand pairs per step is a
       tool that stutters. load() is the only thing that sets it, and load() is
       what every way into a subject goes through. */
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

    /* World.build() adds objects of its own BEFORE calling furnish(), so the
       furniture is everything after them. They are regenerated from the
       tables they came from on every build and must not be captured as
       furniture, or every rebuild doubles them. */
    const skip = this.preface();
    /* `_k` is a stable identity for the change list, and the ONLY reason it
       exists: the doc is snapshotted by value for undo, so without it there is
       no way to tell "this object moved" from "one was deleted and another
       added". Never emitted, and stripped on the way into World. */
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
  /* The built object a doc object became. World.build() adds its own objects
     BEFORE calling furnish() — see preface() — and the doc's furnish() replays
     this list in order, so the doc's own index IS the build order, exactly.
     Searching World.objects for something on the same tile with the same name
     is a guess that two objects on one tile get wrong, and it is a walk of
     three hundred objects per question where this is an array index. */
  built(i) { return World.objects[this.preface() + i] || null; },

  /* How many objects World.build() puts in front of the furniture: one per
     door, and one post per signal arm. Both are made from a table rather than
     by furnish() — see the note over `skip` in load() — and both have to be
     counted, because the doc's own index into its furniture IS this many
     places along World.objects and a town with seven posts in it was seven
     objects out. Read off the built signals rather than off `this.signals`,
     because an installation's arms are what World made of it. */
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

  /* A level definition of the same shape as an entry in data/levels.js. The
     furnish() is the flat replay of the captured list, and it restores `desks`
     as well: the renderer draws a desk surface and a partition from that list,
     and a level that lost it would preview as thirty-two floating monitors. */
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
        /* Before the objects, because that is the order the levels that do this
           do it in — and because buildFurniture() works out which wall a thing
           is against after furnish() returns, so a wall put back afterwards is
           a wall nothing is standing on. */
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
  /* Rebuild the map from the doc. Everything that edits goes through here, so
     there is one definition of "the preview is current" — and the panel is
     refreshed from HERE rather than by each caller, because a caller that
     forgot leaves the Check tab describing a level that no longer exists. */
  rebuild() {
    World.build(this.def());
    /* The building changed, so the index over it is stale — and it is what the
       object palette, the job editor's target list and the object editor's
       placements all read. Re-walked here rather than by each caller, for the
       same reason the panel is: a caller that forgets leaves another tab
       describing a level that no longer exists. Two of the three levels are
       rebuilt to do it, which is a fraction of a millisecond against the eleven
       this method already costs. */
    Things.build();
    Check.run();
    if (Side.live) Side.refresh();
    return this;
  },

  /* ---- undo ---- */

  /* Everything the doc is, as plain data. Small enough (a few hundred objects)
     that snapshotting the lot per edit is cheaper to reason about than a
     journal of reversible operations, and cannot drift out of step with one. */
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
     Each of these marks, mutates and rebuilds. Nothing else may write to the
     arrays: an edit that skips rebuild() leaves the preview describing a level
     that no longer exists, which is the one bug a live editor must not have. */

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

  /* Entries are in TILES and may be fractional — the loader multiplies by TILE.
     Placed at the centre of the tile clicked, which is what every hand-written
     entry in the catalogue already does. */
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

  /* Waypoints are whole tiles, not fractional like entries: NPC movement is
     greedy rather than pathfound, so one is a square somebody walks at until
     they are close enough, and half a tile of precision would be a lie. */
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
