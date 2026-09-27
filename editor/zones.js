'use strict';
/* ---------------- What a room is made of ----------------
   A zone is the difference between a corridor and a break room, and it is nine
   fields in `ZONES` (data/world.js). Everything about how a level LOOKS comes
   from here: the level editor paints zones onto tiles, and the renderer bakes a
   floor and a wall bitmap per zone and draws nothing else.

   Which is why a different game needs this mode more than it needs any other.
   You can lay out a new building with the level editor and it will still be
   this office, in these thirteen greys, until the zones change.

     name          what the HUD calls the room you are standing in
     floor / alt   the two floor shades, alternating per tile
     wall          the wall colour, tinted per room
     tint          the minimap and the room chip
     surf / wsurf  a PROCEDURAL texture the renderer knows by name
     tile / wtile  a named rect in the world atlas, which wins over surf

   Two of those are strings matched by nobody. A `surf` the renderer has never
   heard of falls through to plain carpet; a `tile` that is not in the atlas
   falls back to the procedural one. Both look like decisions.

   THIS DOCUMENT WRITES BACK INTO ZONES, and it is the only one besides the
   object editor that does. There is nowhere else for R.floorTile() to read a
   colour from — and because the renderer BAKES each combination once and keeps
   it, writing the table is not enough on its own: R.rebake() has to throw the
   cached bitmaps away or the map goes on showing the old colour for ever. */

const Zones = {
  id: null,
  /* The ZONES entry being edited, as plain data — it already is plain data,
     which is why the whole table round-trips. */
  z: null,
  base: null, undoStack: [], redoStack: [],

  /* What the renderer actually knows. Anything else is silently the default,
     which is the fault this mode exists to make visible. Read off render.js's
     own switch statements — if a case is added there it belongs here too. */
  SURF: ['stone', 'vinyl', 'tile', 'raised', 'concrete'],
  WSURF: ['tile', 'block'],
  FIELDS: ['name', 'floor', 'alt', 'wall', 'tint', 'surf', 'wsurf', 'tile', 'wtile'],

  /* ---- what a floor or a wall can be made of ----
     Two answers per surface, and `tile`/`wtile` win over `surf`/`wsurf`: a rect
     in the world atlas, or a texture the renderer draws itself. The atlas half
     used to be offered as every name beginning `wall.`, which is four framed
     pictures, a mirror and a television — none of which tiles — while
     `loo.wall`, the one glazed brick in the game and the wall of an actual
     room, was not on the list at all. The toilets could not be repainted and
     every other room could be papered in a photograph of a beach.

     So it is asked of the ATLAS rather than of the name:

       SQUARE, and the size of a tile. A poster is 39×31 and a fire door 39×87;
         a surface is 32×32 because it is laid edge to edge.
       ANCHORED FLAT. `wall`-anchored art hangs on the face of a wall and
         `floor`-anchored art stands on the ground — both are things IN a room
         rather than what the room is made of.
       NOT an object and not a door, which are square and flat often enough
         (`obj.mug`, `obj.laptop`) to be worth saying.

     One name test then decides which of the two lists it is in, and it is the
     only part of this that reads a name at all: a wall is anything with `wall`
     as a word in it, because that is what the atlas calls one at either end,
     and everything else that tiles is a floor. A sheet imported on the Art tab
     naming a tile `grass` is offered as a floor, which is the useful way to be
     wrong. */
  tileable(n) {
    if (typeof Tiles === 'undefined' || !Tiles.rects) return false;
    const r = Tiles.rects[n];
    if (!r || r[2] !== r[3] || r[2] !== TILE) return false;
    if ((Tiles.anchors || {})[n] !== 'flat') return false;
    return !/^(obj|door)\./.test(n);
  },
  isWall(n) { return /(^|\.)wall(\.|$)/.test(n); },
  /* The atlas rects on offer for one surface of the open zone. Whatever the
     zone already names is on its list even when nothing else would have put it
     there: a value you cannot see is a value you cannot put back, which is how
     `loo.wall` came to be uneditable in the first place. */
  materials(where) {
    if (typeof Tiles === 'undefined' || !Tiles.rects) return [];
    const wall = where === 'wall';
    const out = Object.keys(Tiles.rects)
      .filter(n => this.tileable(n) && this.isWall(n) === wall).sort();
    const has = this.z && this.z[wall ? 'wtile' : 'tile'];
    if (has && out.indexOf(has) < 0) out.unshift(has);
    return out;
  },

  /* ---- what one of them looks like ----
     Baked by the RENDERER, not drawn again here: R.floorTile() is the only
     thing that knows the kit is multiplied through the room's own colours, and
     a swatch painted any other way is a picture of a decision you are not
     making. So a candidate is previewed by being a zone for as long as the bake
     takes — one scratch entry, keyed per candidate so the bake cache tells them
     apart, and removed in a `finally` because every export walks ZONES and a
     `__swatch` left in it is a line written into data/world.js.

     Nothing has to invalidate these: rebuild() throws the whole bake cache away
     on every edit, which is the same reason it has to. */
  swatch(where, patch, key) {
    if (typeof R === 'undefined' || !this.z) return null;
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
    if (typeof R === 'undefined' || !ZONES[id]) return null;
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
  /* Several fields, one intent, one undo step. Choosing a drawn surface while
     the zone names a rect in the atlas is choosing something you would never
     see — the atlas wins in R.floorTile() — so the art goes with it, in the
     same edit rather than as a second one you have to know to make. */
  setAll(label, patch) {
    this.mark(label);
    Object.keys(patch).forEach(k => {
      const v = patch[k];
      if (v === null || v === undefined || v === '') delete this.z[k];
      else this.z[k] = v;
    });
    this.rebuild();
  },

  /* Where each zone is used, so the list can say which rooms are actually
     painted with it and the check can spot one nothing uses. Walked across
     every level, with the OPEN one read from the document — the same rule the
     job and object checks follow. */
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
   Three of these are the same shape as every other join in this project: a
   string in one file that has to exist somewhere else, checked by nobody. The
   fourth is about whether you can see the room at all. */
const ZoneCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    const use = Zones.usage();
    Zones.ids().forEach(id => this.per.set(id, this.one(id, use)));
    this.faults = (this.per.get(Zones.id) || []).concat(this.missing(use));
    return this;
  },

  /* A colour the renderer can actually use. It hands these straight to canvas
     as a fillStyle, where an unparseable value is silently ignored and the
     previous colour is kept — which paints one room in another's floor. */
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
      if (typeof Tiles === 'undefined' || !Tiles.rects) return;   /* opened without art/ */
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
