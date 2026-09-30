'use strict';
/* ---------------- What a room is made of ----------------
   A zone is nine fields in ZONES (data/world.js), and how every level looks:
   the renderer bakes a floor and wall per zone.
     name          what the HUD calls the room
     floor / alt   the two floor shades, alternating per tile
     wall          the wall colour
     tint          the minimap and room chip
     surf / wsurf  a procedural texture the renderer knows by name
     tile / wtile  an atlas rect, which wins over surf
   An unknown `surf` falls back to carpet and a missing `tile` to the texture,
   both silently. This document writes into the live ZONES, and R.rebake()
   drops the cached bitmaps so the change shows. */

const Zones = {
  id: null,
  /* The ZONES entry being edited, as plain data — it already is plain data,
     which is why the whole table round-trips. */
  z: null,
  base: null, undoStack: [], redoStack: [],

  /* The procedural surfaces the renderer knows; keep in step with render.js. */
  SURF: ['stone', 'vinyl', 'tile', 'raised', 'concrete'],
  WSURF: ['tile', 'block'],
  FIELDS: ['name', 'floor', 'alt', 'wall', 'tint', 'surf', 'wsurf', 'tile', 'wtile'],

  /* ---- what a floor or a wall can be made of ----
     Atlas rects that tile: square at tile size, anchored flat, not an object or
     door. Names with `wall` as a word are walls; everything else is a floor. */
  tileable(n) {
    if (!Tiles.rects) return false;
    const r = Tiles.rects[n];
    if (!r || r[2] !== r[3] || r[2] !== TILE) return false;
    if ((Tiles.anchors || {})[n] !== 'flat') return false;
    return !/^(obj|door)\./.test(n);
  },
  isWall(n) { return /(^|\.)wall(\.|$)/.test(n); },
  /* The rects on offer for a surface; the zone's current value is always
     included so it can be put back. */
  materials(where) {
    if (!Tiles.rects) return [];
    const wall = where === 'wall';
    const out = Object.keys(Tiles.rects)
      .filter(n => this.tileable(n) && this.isWall(n) === wall).sort();
    const has = this.z && this.z[wall ? 'wtile' : 'tile'];
    if (has && out.indexOf(has) < 0) out.unshift(has);
    return out;
  },

  /* ---- what one of them looks like ----
     Baked by R.floorTile() itself, via a temporary `__swatch` zone keyed per
     candidate and removed in `finally` (exports walk ZONES). rebuild() clears
     the bake cache on every edit. */
  swatch(where, patch, key) {
    if (!this.z) return null;
    const id = '__swatch:' + where + ':' + key;
    ZONES[id] = Object.assign({}, this.z, patch);
    try {
      return where === 'wall' ? R.wallTile(id, 1) : R.floorTile(id, 1);
    } catch (_) {
      return null;
    } finally {
      delete ZONES[id];
    }
  },
  /* The same bitmap for a zone that really exists, which is what the room
     inspector over in the level editor shows. No scratch entry: the renderer
     is being asked about a room the game has. */
  tileOf(where, id) {
    if (!ZONES[id]) return null;
    try { return where === 'wall' ? R.wallTile(id, 1) : R.floorTile(id, 1); } catch (_) { return null; }
  },

  ids() { return Object.keys(ZONES); },
  entry(id) { return ZONES[id === undefined ? this.id : id] || null; },

  load(id) {
    if (!ZONES[id]) return false;
    this.id = id;
    this.z = clone(ZONES[id]);
    this.rebase();
    return true;
  },
  state() { return clone({ id: this.id, z: this.z }); },
  restore(s) { this.id = s.id; this.z = clone(s.z); },
  /* What data/world.js has for this room, as a state — the live ZONES is
     written back to by rebuild(). See HIST.resume(). */
  pristineState() {
    const t = this.pristine || ZONES;
    return t[this.id] ? clone({ id: this.id, z: t[this.id] }) : null;
  },

  /* The original table, so Revert is a real revert. The whole table, because
     ZONES is one table and every level is built from it — the same arrangement
     the object editor has with FURN. */
  pristine: null,
  keep() { if (!this.pristine) this.pristine = clone(ZONES); },
  restore_all() {
    if (!this.pristine) return;
    Object.keys(ZONES).forEach(k => { if (!(k in this.pristine)) delete ZONES[k]; });
    Object.keys(this.pristine).forEach(k => { ZONES[k] = clone(this.pristine[k]); });
    R.rebake();
  },

  rebuild() {
    this.keep();
    if (this.id) {
      if (this.z) ZONES[this.id] = clone(this.z);
      else delete ZONES[this.id];
    }
    /* The colour only reaches the screen through a baked bitmap, and those are
       cached for the life of the page. Throwing them away is what makes an edit
       visible at all. */
    R.rebake();
    /* And the level is rebuilt because zone assignment, the AO pass and the
       wall tints are all worked out at build time. */
    Doc.rebuild();
    ZoneCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },

  set(k, v) {
    const p = {};
    p[k] = v;
    this.setAll('edit ' + k, p);
  },
  /* Several fields, one undo step. Choosing a procedural surface clears the
     atlas rect that would override it. */
  setAll(label, patch) {
    this.mark(label);
    Object.keys(patch).forEach(k => {
      const v = patch[k];
      if (v === null || v === undefined || v === '') delete this.z[k];
      else this.z[k] = v;
    });
    this.rebuild();
  },

  /* Where each zone is used across levels (the open one from the document). */
  usage() {
    const map = new Map();
    this.ids().forEach(z => map.set(z, []));
    Levels.ids().forEach(lid => {
      const def = LEVELS[lid];
      if (!def) return;
      const rooms = lid === Doc.id ? Doc.rooms : (def.rooms || []);
      rooms.forEach(rm => {
        if (!map.has(rm.z)) map.set(rm.z, []);
        const [x1, y1, x2, y2] = rm.r;
        map.get(rm.z).push({ level: lid, tiles: (x2 - x1 + 1) * (y2 - y1 + 1) });
      });
    });
    return map;
  },
};
Object.assign(Zones, HIST);

/* ---------------- Making and unmaking a zone ---------------- */
const ZonesMake = {
  create() {
    Ask.form('A new kind of room', [
      { k: 'id', label: 'id', value: '', hint: 'how ZONES keys it, e.g. canteen' },
      { k: 'name', label: 'called', value: '', hint: 'what the HUD says you are standing in' },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (ZONES[id]) { Side.say('There is already a zone called ' + id + '.'); return; }
      Zones.keep();
      /* Started from the main floor rather than from black, so a new room reads
         as a room the moment it exists and the work is adjusting it. */
      ZONES[id] = Object.assign({}, ZONES.main, { name: v.name || id });
      Mode.openSubject(id);
      Side.say('Created ' + id + '. Paint it onto a level with the room tool.');
    });
  },
  drop() {
    const id = Zones.id;
    const others = Zones.ids().filter(x => x !== id);
    if (!others.length) { Side.say('This is the only zone there is.'); return; }
    const used = (Zones.usage().get(id) || []);
    Ask.confirm('Delete ' + (Zones.z.name || id) + '?',
      used.length
        ? used.length + ' room(s) are painted with it. They would be left naming a zone that does '
          + 'not exist, which the check reports and the renderer draws as bare default.'
        : 'Nothing is painted with it. data/world.js is untouched, so a reload brings it back.',
      'Delete it').then(yes => {
      if (!yes) return;
      Zones.keep();
      delete ZONES[id];
      Zones.forget(id);
      R.rebake();
      Mode.openSubject(others[0]);
      Side.say('Deleted ' + id + ' from this tab.');
    });
  }
};

/* ---------------- What is wrong with a zone ----------------
   Three string joins, and whether the room can be seen at all. */
const ZoneCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    const use = Zones.usage();
    Zones.ids().forEach(id => this.per.set(id, this.one(id, use)));
    this.faults = (this.per.get(Zones.id) || []).concat(this.missing(use));
    return this;
  },

  /* A colour canvas can use: an unparseable fillStyle is silently ignored. */
  colour(v) { return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()); },
  /* How light a colour is, 0..1, for the contrast check below. */
  lum(hex) {
    const h = String(hex).replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = parseInt(n, 16);
    if (!isFinite(v)) return 0;
    return (((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114) / 255;
  },

  one(id, use) {
    const live = id === Zones.id;
    const z = live ? Zones.z : ZONES[id];
    const out = [];
    const fault = (level, msg, extra) => out.push(Object.assign({ level, msg, zone: id }, extra || {}));
    if (!z) return out;

    if (!String(z.name || '').trim()) {
      fault('error', 'No name. The HUD says which room you are standing in and would say nothing.',
        { field: 'name' });
    }
    ['floor', 'alt', 'wall', 'tint'].forEach(k => {
      if (z[k] === undefined) {
        fault('error', 'No `' + k + '` colour.', { field: k });
      } else if (!this.colour(z[k])) {
        fault('error', '`' + k + '` is ' + JSON.stringify(z[k]) + ', which is not a colour canvas '
          + 'can parse — it ignores it silently and keeps whatever was set before, so the room is '
          + 'painted in another room’s.', { field: k });
      }
    });

    /* A wall the same value as its floor loses the edge of the room. The
       drywall lift is deliberately small because these colours are dark on
       purpose, which is exactly why the two can end up too close. */
    if (this.colour(z.floor) && this.colour(z.wall)) {
      const d = Math.abs(this.lum(z.floor) - this.lum(z.wall));
      if (d < 0.045) {
        fault('warn', 'The wall is within ' + d.toFixed(3) + ' of the floor in brightness, so the '
          + 'edge of the room disappears. These colours are dark on purpose, which is what makes '
          + 'this easy to do.', { field: 'wall' });
      }
    }

    if (z.surf !== undefined && Zones.SURF.indexOf(z.surf) < 0) {
      fault('error', '`surf: ' + JSON.stringify(z.surf) + '` is not a texture R.floorTile() knows ('
        + Zones.SURF.join(', ') + '), so it falls through to plain carpet — which looks like a '
        + 'decision.', { field: 'surf' });
    }
    if (z.wsurf !== undefined && Zones.WSURF.indexOf(z.wsurf) < 0) {
      fault('error', '`wsurf: ' + JSON.stringify(z.wsurf) + '` is not a texture R.wallTile() knows ('
        + Zones.WSURF.join(', ') + '), so the wall is drawn flat.', { field: 'wsurf' });
    }
    /* The atlas is the other half of the same question: a named rect that is
       not in it falls back to the procedural surface, silently. */
    [['tile', 'floor'], ['wtile', 'wall']].forEach(([k, what]) => {
      if (z[k] === undefined) return;
      if (!Tiles.rects) return;   /* opened without art/ */
      if (!Tiles.rects[z[k]]) {
        fault('error', '`' + k + ': ' + JSON.stringify(z[k]) + '` is not a rect in the atlas, so '
          + 'the ' + what + ' quietly falls back to the drawn one.', { field: k });
      }
    });

    const used = (use || Zones.usage()).get(id) || [];
    if (!used.length) {
      fault('warn', 'No room on any level is painted with this zone, so nobody will ever see it.');
    }
    return out;
  },

  /* The other direction: a room painted with a zone that is not in ZONES. The
     renderer has nothing to look up and the room comes out as bare default. */
  missing(use) {
    const out = [];
    (use || Zones.usage()).forEach((rooms, id) => {
      if (ZONES[id] || !rooms.length) return;
      out.push({ level: 'error', zone: null,
        msg: 'Rooms on ' + Array.from(new Set(rooms.map(r => r.level))).join(', ')
          + ' are painted with “' + id + '”, and ZONES has no such entry.' });
    });
    return out;
  },
};
Object.assign(ZoneCheck, FAULTS);
