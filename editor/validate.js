'use strict';
/* ---------------- What is wrong with this level ----------------
   The faults you cannot see: a sealed room looks like a room, a waypoint in a
   sink looks like a sink. The flood fill runs on every edit. The `levels` and
   `systems` suites assert the same invariants as a backstop. */

const Check = {
  /* Last result, for the overlay and the panel. */
  open: 0, reachable: 0,
  marooned: [], faults: [], tiles: new Map(),

  run() {
    this.marooned = []; this.faults = []; this.tiles = new Map();
    this.connectivity();
    this.entries();
    this.waypoints();
    this.reach();
    this.mounts();
    this.windows();
    this.links();
    this.tables();
    this.bounds();
    return this;
  },

  /* A fault, and the tiles to paint. `level` is 'error' for something that is
     broken now and 'warn' for something that will bite later. */
  fault(level, msg, tiles, extra) {
    const f = Object.assign({ level: level, msg: msg, tiles: tiles || [] }, extra || {});
    this.faults.push(f);
    (f.tiles || []).forEach(t => {
      const k = t[0] + ',' + t[1];
      /* An error outranks a warning on a tile that has both. */
      if (level === 'error' || !this.tiles.has(k)) this.tiles.set(k, level);
    });
    return f;
  },

  /* ---- connectivity ----
     How many separate pieces the walkable floor is in; a level is one. A piece
     with no arrival point is floor nobody can reach; two pieces with arrival
     points are a sealed room. (Reachability from any entry misses a sealed
     room that has its own entry.) */
  connectivity() {
    const walk = (x, y) => x >= 0 && y >= 0 && x < MAPW && y < MAPH && !World.isSolid(x, y);
    const owner = new Map();
    const parts = [];

    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      if (!walk(x, y) || owner.has(x + ',' + y)) continue;
      const part = { tiles: [], entries: [] };
      const idx = parts.length;
      const queue = [[x, y]];
      owner.set(x + ',' + y, idx);
      while (queue.length) {
        const [cx, cy] = queue.pop();
        part.tiles.push([cx, cy]);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
          if (owner.has(k) || !walk(nx, ny)) return;
          owner.set(k, idx); queue.push([nx, ny]);
        });
      }
      parts.push(part);
    }

    for (const k in Doc.entries) {
      const e = Doc.entries[k];
      const at = owner.get(Math.floor(e[0]) + ',' + Math.floor(e[1]));
      if (at !== undefined) parts[at].entries.push(k);
    }

    const landed = parts.filter(p => p.entries.length);
    const orphans = parts.filter(p => !p.entries.length);

    /* Everything you can stand on having arrived legitimately. The object reach
       check is asked against this rather than against the whole floor. */
    this.reachSet = new Set();
    landed.forEach(p => p.tiles.forEach(t => this.reachSet.add(t[0] + ',' + t[1])));
    this.open = parts.reduce((n, p) => n + p.tiles.length, 0);
    this.reachable = this.reachSet.size;
    this.marooned = [];
    orphans.forEach(p => p.tiles.forEach(t => this.marooned.push(t)));
    this.parts = parts;

    if (!landed.length) {
      this.fault('error', 'No arrival point lands on walkable floor, so nothing on this level '
        + 'can be reached at all.', []);
      return;
    }
    if (this.marooned.length) {
      this.fault('error', this.marooned.length + ' walkable '
        + (this.marooned.length === 1 ? 'tile is' : 'tiles are')
        + ' cut off — floor nobody can ever stand on.', this.marooned);
    }
    if (landed.length > 1) {
      /* Name them by their arrival points, because that is what you will
         recognise: "start and hatch are not connected" is the whole diagnosis. */
      this.fault('error', 'This level is in ' + landed.length + ' separate pieces you cannot '
        + 'walk between (' + landed.map(p => p.entries.join('/')).join(' · ') + ').',
        landed.slice(1).reduce((a, p) => a.concat(p.tiles), []));
    }
  },
  walkableAndReached(x, y) {
    return this.reachSet && this.reachSet.has(x + ',' + y);
  },

  /* ---- arrival points ----
     A level that will not load leaves the previous one on screen, silently. */
  entries() {
    const names = Object.keys(Doc.entries);
    if (!names.length) {
      this.fault('error', 'This level declares no entry points. go() would refuse to load it.', []);
      return;
    }
    names.forEach(k => {
      const e = Doc.entries[k];
      const x = Math.floor(e[0]), y = Math.floor(e[1]);
      if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) {
        this.fault('error', 'Entry “' + k + '” is off the map.', []);
      } else if (World.isSolid(x, y)) {
        this.fault('error', 'Entry “' + k + '” is inside something solid.', [[x, y]]);
      }
    });
  },

  /* ---- waypoints ----
     A waypoint must be floor, on the same piece as everybody else, not on the
     object itself. */
  waypoints() {
    /* A waypoint is [x, y] on the hub and [x, y, level] elsewhere (WP in
       data/world.js); only this level's are checked here. */
    const here = Doc.id || (Levels.ids && Levels.ids().find(id => (Levels.def(id) || {}).hub)) || 'office';
    for (const k in Doc.waypoints) {
      const w = Doc.waypoints[k];
      if (w[2] && w[2] !== here) continue;
      const x = w[0], y = w[1];
      if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) {
        this.fault('error', 'Waypoint “' + k + '” is off the map.', []);
        continue;
      }
      if (World.isSolid(x, y)) {
        this.fault('error', 'Waypoint “' + k + '” is inside something solid — anyone sent there '
          + 'walks into it until the stuck timer fires.', [[x, y]], { wp: k });
      } else if (!this.walkableAndReached(x, y)) {
        this.fault('error', 'Waypoint “' + k + '” is on floor nobody can walk to.', [[x, y]], { wp: k });
      }
    }
  },

  /* ---- can you get to the things ----
     An object with no reachable floor beside it is an act nobody reads. */
  reach() {
    const standable = o => {
      const sides = [[o.x, o.y - 1], [o.x, o.y + 1], [o.x - 1, o.y], [o.x + 1, o.y]];
      /* You can stand on a non-solid object's own tile, so it counts too. */
      if (!o.solid) sides.push([o.x, o.y]);
      return sides.some(([x, y]) => this.walkableAndReached(x, y));
    };
    /* By handler: a shop's door and its sign share a `use`, so one reachable is
       enough. */
    const reachable = new Set();
    Doc.objects.forEach(o => { if (o.use && standable(o)) reachable.add(o.use); });
    Doc.objects.forEach((o, i) => {
      if (!o.use || reachable.has(o.use)) return;
      this.fault('error',
        '“' + (o.name || o.kind) + '” cannot be reached — no tile beside it that anyone can stand on.',
        [[o.x, o.y]], { obj: i });
    });
  },

  /* ---- things on walls ----
     World.build() drops a wall-mounted object with no wall to the floor,
     silently. Exempt: `sign` and `board` (R.wallArt() gives them a stand) and
     `pigeon`. */
  FREESTANDING: ['sign', 'board', 'pigeon'],
  /* Asked of the built object: an object's `furn:` overrides its kind. */
  stranded(built) {
    if (!built || this.FREESTANDING.indexOf(built.kind) >= 0) return false;
    return (built.fdef || {}).mount === 'wall' && !built.wallSide;
  },
  mounts() {
    Doc.objects.forEach((o, i) => {
      if (!this.stranded(Doc.built(i))) return;
      this.fault('warn', '“' + (o.name || o.kind) + '” wants a wall and has none, so it is on the floor.',
        [[o.x, o.y]], { obj: i });
    });
  },

  /* ---- a window has to have somewhere to look ----
     Two tiles through its wall: a room there makes it an interior window. */
  windows() {
    const step = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
    Doc.objects.forEach((o, i) => {
      if (o.kind !== 'window') return;
      const d = step[(Doc.built(i) || {}).wallSide];
      if (!d) return;
      const bx = o.x + d[0] * 2, by = o.y + d[1] * 2;
      if (bx < 0 || by < 0 || bx >= MAPW || by >= MAPH) return;
      if (World.zoneAt(bx, by) && !World.solid[by][bx]) {
        this.fault('warn', '“' + (o.name || o.kind) + '” looks into '
          + ((ZONES[World.zoneAt(bx, by)] || {}).name || 'another room') + ', not outside.',
          [[o.x, o.y], [bx, by]], { obj: i });
      }
    });
  },

  /* ---- the link table ----
     Nothing outside data/levels.js names a destination, so a typo here is a door
     that silently does nothing rather than an error anybody sees. */
  links() {
    Doc.links.forEach(l => {
      const dest = LEVELS[l.to];
      if (!dest) {
        this.fault('error', 'Link “' + l.via + '” goes to “' + l.to + '”, which is not a level.', []);
        return;
      }
      if (l.entry && !(dest.entries || {})[l.entry]) {
        this.fault('error', 'Link “' + l.via + '” arrives at “' + l.entry
          + '”, which ' + l.to + ' does not declare.', []);
      }
      /* Three ways a link is taken: an object whose handler is the link, an object
         naming it with `via:`, or an act calling Levels.take() (the Greggs). */
      if (Doc.objects.some(o => o.use === l.via || o.via === l.via)) return;
      if (Writing.calls('Levels', 'take').some(c => c.id === l.via)) return;
      /* And the lift, whose act takes links listed in FLOORS (data/world.js). */
      if (FLOORS.some(f => f.via === l.via)
        && Doc.objects.some(o => o.use === 'lift')) return;
      this.fault('warn', 'Link “' + l.via + '” has no object on this level with that `use` or '
        + '`via`, and nothing in the writing calls Levels.take(' + Emit.str(l.via) + '), '
        + 'so there is no way to take it.', []);
    });
    /* No check the other way ("looks like an exit, has no link"): the lift is
       exactly that on purpose. */
  },

  /* ---- a table you can still read ----
     The last tile of each `use` on a table stays clear, or its act is hidden. */
  tables() {
    const byUse = new Map();
    Doc.objects.forEach(o => {
      if (o.kind !== 'table' || !o.use) return;
      if (!byUse.has(o.use)) byUse.set(o.use, []);
      byUse.get(o.use).push(o);
    });
    byUse.forEach((list, use) => {
      const clear = list.some(t => !Doc.objects.some(o =>
        o !== t && o.x === t.x && o.y === t.y && o.kind !== 'table'));
      if (!clear) this.fault('warn', 'Every tile of “' + (list[0].name || use)
        + '” has something on it, so the table itself can never be inspected.',
        list.map(t => [t.x, t.y]));
    });
  },

  /* ---- inside the map ---- */
  bounds() {
    const off = [];
    Doc.objects.forEach(o => {
      if (o.x < 0 || o.y < 0 || o.x >= Doc.w || o.y >= Doc.h) off.push(o.name || o.kind);
    });
    if (off.length) this.fault('error', off.length + ' object'
      + (off.length === 1 ? '' : 's') + ' outside the map: ' + off.slice(0, 4).join(', ')
      + (off.length > 4 ? '…' : ''), []);

    Doc.rooms.forEach(rm => {
      const [x1, y1, x2, y2] = rm.r;
      /* A room touching the map edge has no wall there. Indoors only: streets run
         off the map on purpose. */
      if (Doc.indoors && (x1 < 1 || y1 < 1 || x2 > Doc.w - 2 || y2 > Doc.h - 2))
        this.fault('warn', ((ZONES[rm.z] || {}).name || rm.z)
          + ' reaches the edge of the map, so it has no boundary wall.', []);
    });
    Doc.doors.forEach(d => {
      if (d.x < 0 || d.y < 0 || d.x >= Doc.w || d.y >= Doc.h)
        this.fault('error', 'A door is off the map.', []);
    });
  }
};
/* errors() comes from FAULTS — the same count the other four checkers report.
   There is no `per` here: a level is checked one at a time and there is no list
   of them to badge. */
Object.assign(Check, FAULTS);
