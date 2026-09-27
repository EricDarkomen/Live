'use strict';
/* ---------------- The kind of thing an object is ----------------
   An object in this game is three things in three files and nothing says so.

     data/levels.js   WHERE it is: a tile, a name, an emoji, a `kind`, a `use`.
     data/world.js    HOW IT IS FURNISHED: FURN[kind] — what it hangs on, how
                      big it is, which sprite draws it instead of the emoji.
     data/acts.js     WHAT IT DOES: one entry per `use:`, and the object never
                      names the act's file and the act never names the object.

   Every one of those joins is a string matched by nobody. A `use` with no act
   is a thing you press that does nothing at all; a `kind` with no FURN entry
   silently keeps the old 27px-on-the-floor default; a `sprite` naming a rect
   that is not in the atlas falls back to the emoji, which looks like a choice.

   This document is that join, made visible: one row per kind, and the panel
   holds the furnishing, the acts and every placement of it in the building. The
   level editor moves one object; this one changes what a hundred of them are. */

const Things = {
  id: null,
  /* The FURN entry being edited, as plain data — it already is plain data,
     which is why the whole table round-trips. */
  furn: null,
  base: null, undoStack: [], redoStack: [],

  /* ---- the catalogue ----
     Every kind the game knows: the ones FURN furnishes and the ones that are
     only ever a label on an object. Both are legitimate — anything not in FURN
     keeps the old default, which is opt-in by design — so both are listed, and
     which is which is a fact the panel states rather than a fault. */
  index: new Map(),
  /* Every `use:` handler in the building, and which level it is on. Collected
     on this walk because it is the same walk, and kept apart from the kinds
     index because it answers a different question: a handler is an entry in
     data/acts.js, and the four on the doors are acts like any other even though
     a door is not something the object tool places. */
  uses: new Map(),
  /* ONE walk of the building, and everything that needs to know what is in it
     reads the result. There used to be two — this one and the object palette's
     — built at different moments from different sources, so the palette's idea
     of which handlers exist was the catalogue's at boot while this one was the
     document's now. That is the sort of disagreement nothing reports: the job
     editor simply refused to offer a target you had just placed. */
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
      /* The level that is OPEN is read from the doc; every other from the
         catalogue. Same rule the job checks follow, and for the same reason: an
         object you have just placed with a `use` nothing handles should be
         reported now rather than after you have exported it. Doors are the door
         table's rather than furnish()'s, so the doc has none of them and the
         catalogue's are re-made by World.build() on every rebuild — which is
         why the open level's are taken from the definition instead. */
      let objs;
      if (id === Doc.id) objs = Doc.objects;
      else { World.build(def); objs = World.objects; }
      (id === Doc.id ? Doc.doors : []).forEach(d => {
        const u = d.locked ? 'lockedDoor' : 'door';
        if (!uses.has(u)) uses.set(u, id);
      });
      objs.forEach((o, i) => {
        if (o.use && !uses.has(o.use)) uses.set(o.use, id);
        /* A `door` row in the kinds index would list every opening in the
           building under a kind FURN has never heard of, and the object tool
           has no business placing one — that is what the door tool is for. Its
           handler is still an act, which is why `uses` is taken above. */
        if (!o.kind || o.kind === 'door') return;
        const e = put(o.kind);
        /* `i` is the index in whichever list this came from, which for the open
           level is the doc's own — so Doc.built(i) is the object the builder
           made of it. Meaningless on any other level, and only ever read
           alongside `level === Doc.id`. */
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
  /* The preview is the map, and the map is built from FURN — so unlike every
     other document here this one DOES write back, into the live table, because
     there is nowhere else for `World.buildFurniture()` to read it from. The
     original is kept so Revert is a real revert. */
  pristine: null,
  keep() { if (!this.pristine) this.pristine = clone(FURN); },
  rebuild() {
    this.keep();
    if (this.id) {
      if (this.furn) FURN[this.id] = clone(this.furn);
      else delete FURN[this.id];
    }
    /* Rebuilding the level is what makes a size or a mount visible: `o.fdef` is
       cached per object at build time, so nothing changes until it is built.
       Always, whichever mode is showing — the map is not on screen in this one
       but the checks read it, and coming back to Levels must not be the moment
       a change made here first appears. */
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
    const fn = typeof Acts !== 'undefined' && Acts[use];
    return typeof fn === 'function' ? String(fn) : null;
  }
};
Object.assign(Things, HIST);

/* ---------------- What is wrong with a kind ----------------
   All three joins, checked from the middle. Nothing else in the project looks
   at them together: the level check knows an object cannot be reached, the
   `systems` suite knows a wall-mounted thing has a wall, and neither knows
   whether pressing it does anything. */

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
      if (typeof Acts === 'undefined' || typeof Acts[u] !== 'function') {
        fault('error', 'Objects of this kind have `use: ' + Emit.str(u) + '` and there is no '
          + 'Acts.' + u + '. Pressing E on one does nothing at all — Interact.go() looks the '
          + 'handler up by name and finds nothing to call.', { use: u });
      }
    });

    /* THE FURNISHING. */
    if (furn) {
      if (furn.sprite && !(typeof Tiles !== 'undefined' && Tiles.rects && Tiles.rects[furn.sprite])) {
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
      /* A wall-mounted kind needs a wall on one of four sides, and the builder
         quietly drops it to the floor when there is none — a poster lying in
         the middle of the carpet. Only answerable on the level that is BUILT,
         which is the level document's, not `Levels.current`: the editor never
         calls Levels.go(), so `current` is null the whole time this page is
         open and a check written against it silently never fires. This one did.

         The question goes to Check.stranded() rather than to `furn.mount` here,
         because `furn:` on an object overrules its kind — the fire extinguisher
         propping the fire door is deliberately off the wall, and asking the
         kind alone reports the shipped game as broken. */
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

  /* The other direction, across the whole table: an act nobody can reach. Every
     handler in data/acts.js that no object names — writing that has been done
     and cannot be got to, which is the same fault as an unreachable dialogue
     node and just as invisible. */
  orphanActs() {
    if (typeof Acts === 'undefined') return [];
    const used = new Set();
    Things.index.forEach(e => e.uses.forEach(u => used.add(u)));
    /* Two exclusions, both because the codebase already says so rather than
       because they happened to fire. `generic` is the fallback Interact reaches
       for when an object has no act of its own; and a leading underscore is how
       data/acts.js marks a helper that another act calls — nine of them, and
       every one would otherwise be reported as unreachable writing when it is
       the opposite. What is left is a list worth reading. */
    return Object.keys(Acts).filter(k => !used.has(k) && k !== 'generic' && k[0] !== '_');
  }
};
Object.assign(ThingCheck, FAULTS);
