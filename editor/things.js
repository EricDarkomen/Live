'use strict';
/* ---------------- The kind of thing an object is ----------------
   An object lives in three files and nothing joins them:
     data/levels.js  where it is: tile, name, emoji, `kind`, `use`
     data/world.js   how it is furnished: FURN[kind] (mount, size, sprite)
     data/acts.js    what it does: one entry per `use:`
   A `use` with no act does nothing; a kind with no FURN entry keeps the
   default; a missing sprite falls back to emoji. This document is that join:
   one row per kind, with its furnishing, acts and every placement. */

const Things = {
  id: null,
  /* The FURN entry being edited, as plain data — it already is plain data,
     which is why the whole table round-trips. */
  furn: null,
  base: null, undoStack: [], redoStack: [],

  /* ---- the catalogue ----
     Kinds FURN furnishes and label-only kinds; both are legitimate. */
  index: new Map(),
  /* Every `use:` handler and its level, from the same walk (doors' handlers
     are acts too). */
  uses: new Map(),
  /* One walk of the building, read by everything that needs it. */
  build() {
    const map = new Map();
    const uses = new Map();
    const put = (kind) => {
      if (!map.has(kind)) map.set(kind, { kind: kind, places: [], uses: new Set(), emoji: '' });
      return map.get(kind);
    };
    Object.keys(FURN).forEach(put);
    const live = World.level ? Levels.snapshot() : null;
    Levels.ids().forEach(id => {
      const def = LEVELS[id];
      if (!def) return;
      /* The open level from the doc, others from the catalogue. Doors come from the
         door table, so the open level's are taken from its definition. */
      let objs;
      if (id === Doc.id) objs = Doc.objects;
      else { World.build(def); objs = World.objects; }
      (id === Doc.id ? Doc.doors : []).forEach(d => {
        const u = d.locked ? 'lockedDoor' : 'door';
        if (!uses.has(u)) uses.set(u, id);
      });
      objs.forEach((o, i) => {
        if (o.use && !uses.has(o.use)) uses.set(o.use, id);
        /* Doors are not a placeable kind, but their handlers count. */
        if (!o.kind || o.kind === 'door') return;
        const e = put(o.kind);
        /* `i` indexes the source list; for the open level Doc.built(i) is the built
           object. */
        e.places.push({ level: id, i: i, x: o.x, y: o.y, name: o.name,
          e: o.e, solid: !!o.solid, use: o.use || null });
        if (o.use) e.uses.add(o.use);
        if (!e.emoji && o.e) e.emoji = o.e;
      });
    });
    if (live) Levels.apply(live);
    this.index = map;
    this.uses = uses;
    Palette.collect(map, uses);
    return map;
  },
  ids() { return Array.from(this.index.keys()).sort(); },
  entry(kind) { return this.index.get(kind === undefined ? this.id : kind) || null; },

  /* ---- the document ---- */
  load(id) {
    if (!this.index.size) this.build();
    if (!this.index.has(id)) return false;
    this.id = id;
    this.furn = clone(FURN[id] || null);
    this.rebase();
    return true;
  },
  state() { return clone({ id: this.id, furn: this.furn }); },
  restore(s) { this.id = s.id; this.furn = clone(s.furn); },
  /* What data/world.js has for this kind, as a state. `rebuild()` writes the
     working copy into FURN, so the live table is not the thing to measure
     "changed" against — see HIST.resume(). */
  pristineState() {
    const t = this.pristine || FURN;
    return clone({ id: this.id, furn: t[this.id] || null });
  },
  /* Writes into the live FURN, since the builder reads nothing else; the
     original is kept for Revert. */
  pristine: null,
  keep() { if (!this.pristine) this.pristine = clone(FURN); },
  rebuild() {
    this.keep();
    if (this.id) {
      if (this.furn) FURN[this.id] = clone(this.furn);
      else delete FURN[this.id];
    }
    /* Rebuild so sizes and mounts (cached as `o.fdef`) take effect, whatever
       mode is showing. */
    Doc.rebuild();
    ThingCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },
  restore_all() {
    if (!this.pristine) return;
    Object.keys(FURN).forEach(k => { if (!(k in this.pristine)) delete FURN[k]; });
    Object.keys(this.pristine).forEach(k => { FURN[k] = clone(this.pristine[k]); });
  },

  /* ---- editing ---- */
  set(k, v) {
    this.mark('edit ' + this.id);
    if (!this.furn) this.furn = {};
    if (v === '' || v === null || v === undefined) delete this.furn[k];
    else this.furn[k] = v;
    if (!Object.keys(this.furn).length) this.furn = null;
    this.rebuild();
  },
  /* A kind with no entry keeps the old 27px-on-the-floor default, which is a
     decision rather than a gap — so adding and removing an entry are both
     first-class, and the panel says which state you are in. */
  furnish() {
    this.mark('furnish ' + this.id);
    this.furn = this.furn || { size: 24 };
    this.rebuild();
  },
  unfurnish() {
    this.mark('unfurnish ' + this.id);
    this.furn = null;
    this.rebuild();
  },
  /* Which act is behind a `use`, and its source. Acts is loaded, so this is the
     function itself rather than a guess about a file. */
  act(use) {
    const fn = Acts[use];
    return typeof fn === 'function' ? String(fn) : null;
  }
};
Object.assign(Things, HIST);

/* ---------------- What is wrong with a kind ----------------
   All three joins, checked together. */

const ThingCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    Things.ids().forEach(k => this.per.set(k, this.one(k)));
    this.faults = this.per.get(Things.id) || [];
    return this;
  },

  one(kind) {
    const e = Things.entry(kind);
    const out = [];
    if (!e) return out;
    const fault = (level, msg, extra) => out.push(Object.assign({ level: level, msg: msg, kind: kind }, extra || {}));
    const furn = kind === Things.id ? Things.furn : FURN[kind];

    /* THE ACT. A `use` with no handler is a thing you walk up to, are offered,
       press — and nothing happens. Interact.go() looks it up by name. */
    Array.from(e.uses).forEach(u => {
      if (typeof Acts[u] !== 'function') {
        fault('error', 'Objects of this kind have `use: ' + Emit.str(u) + '` and there is no '
          + 'Acts.' + u + '. Pressing E on one does nothing at all — Interact.go() looks the '
          + 'handler up by name and finds nothing to call.', { use: u });
      }
    });

    /* THE FURNISHING. */
    if (furn) {
      if (furn.sprite && !(Tiles.rects && Tiles.rects[furn.sprite])) {
        fault('error', 'It draws the sprite “' + furn.sprite + '”, and no sheet in the atlas has '
          + 'a rectangle by that name. Tiles.draw() returns false and it falls back to the emoji, '
          + 'which looks exactly like a decision.', { field: 'sprite' });
      }
      if (furn.mount && ['wall', 'surface'].indexOf(furn.mount) < 0) {
        fault('error', '`mount` is “' + furn.mount + '”. World.buildFurniture() knows `wall` and '
          + '`surface`; anything else is the floor.', { field: 'mount' });
      }
      if (furn.size !== undefined && (typeof furn.size !== 'number' || furn.size < 6 || furn.size > 64)) {
        fault('warn', 'A size of ' + furn.size + 'px is outside anything else on this list. '
          + 'A 27px sofa beside a 58px person was the single thing that most made the two art '
          + 'styles argue with each other.', { field: 'size' });
      }
      /* A wall-mounted kind needs a wall, else the builder drops it to the floor.
         Only answerable on the built level (Doc.id). Asked via Check.stranded(),
         since an object's `furn:` can override its kind. */
      if (furn.mount === 'wall') {
        const stranded = e.places.filter(pl =>
          pl.level === Doc.id && Check.stranded(Doc.built(pl.i)));
        if (stranded.length) {
          fault('warn', stranded.length + ' of these on this level want a wall and have none, so '
            + 'they are lying on the floor.', { tiles: stranded.map(pl => [pl.x, pl.y]) });
        }
      }
    } else if (e.places.length) {
      fault('warn', 'No FURN entry, so every one of these is the old 27px-on-the-floor default. '
        + 'That is opt-in by design and often right — it is only worth knowing it was a choice.');
    }

    if (!e.places.length) {
      fault('warn', 'Nothing anywhere in the building is of this kind, so this FURN entry is '
        + 'never read.');
    }
    return out;
  },

  /* Acts no object names: unreachable writing. */
  orphanActs() {
    const used = new Set();
    Things.index.forEach(e => e.uses.forEach(u => used.add(u)));
    /* Excluding `generic` (Interact's fallback) and `_helpers` called by other
       acts. */
    return Object.keys(Acts).filter(k => !used.has(k) && k !== 'generic' && k[0] !== '_');
  }
};
Object.assign(ThingCheck, FAULTS);
