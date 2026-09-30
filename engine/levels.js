'use strict';
/* ---------------- Level loading and streaming ----------------
   World holds the loaded level; this holds the rest and moves the player.
   Levels are built lazily, kept once built (BUDGET besides the pinned hub,
   least recently used dropped first, their state captured as they go), and
   a level's neighbours are prefetched in idle time so a door never waits.
   Nothing outside names a destination: an act says take('hatch') and the
   links in data/levels.js say where that goes. */
const Levels = {
  /* Built levels kept besides the pinned hub. */
  BUDGET: 2,
  cache: new Map(),
  /* Least recently used first. */
  order: [],
  /* Neighbours offered to the prefetcher since arriving; see prefetch(). */
  offered: new Set(),
  current: null,
  /* A transition in flight; a second must not start on top of it. */
  moving: false,

  /* Every World field that belongs to the map. Swapping levels assigns this
     list across, so anything left off leaks from the previous level: the
     name tables behind the zone and surface grids, and the cars, people and
     signals, which keep their state with their level. */
  FIELDS: ['def', 'level', 'solid', 'zone', 'seed', 'surf', 'ao', 'objects', 'byTile',
    'zoneName', 'surfName',
    'doorways', 'openings', 'desks', 'worktops', 'tables', 'counters', 'blocked',
    'cars', 'carTiles', 'peds', 'swim',
    'signals'],

  /* Object fields that change after a build and must survive eviction. */
  MUT: ['ringing', 'waited', 'hot', 'locked', 'st'],

  init() {
    for (const id in LEVELS) LEVELS[id].id = id;
    this.cache.clear(); this.order = []; this.current = null; this.moving = false;
    this.offered = new Set();
    this._hub = undefined;
  },
  def(id) { return LEVELS[id] || null; },
  /* Somewhere work can reach you (`site` in data/levels.js); with
     Sky.working(), whether the queue is yours. */
  onSite(id) {
    const d = this.def(id === undefined ? World.level : id);
    return !!(d && d.site);
  },
  /* Where a part sits inside the level composed from it, or null. */
  partOf(id) {
    if (!this._parts) {
      this._parts = new Map();
      for (const k in LEVELS) ((LEVELS[k] || {}).parts || []).forEach(p => this._parts.set(p.of, { level: k, at: p.at }));
    }
    return this._parts.get(id) || null;
  },
  ids() { return Object.keys(LEVELS); },
  /* The level flagged `hub` (the people and the phones), or the first. */
  hub() {
    if (this._hub === undefined)
      this._hub = this.ids().find(id => (this.def(id) || {}).hub) || this.ids()[0];
    return this._hub;
  },
  /* The level flagged `street`: where the crowd walks out to at closing,
     through its `streetEntry` (default `doors`). Null is fine. */
  street() {
    if (this._street === undefined)
      this._street = this.ids().find(id => (this.def(id) || {}).street) || null;
    return this._street;
  },
  /* The live objects of a level you are not on (the same arrays World reads
     when it is loaded), or null if it has not been built. */
  objectsOn(id) {
    if (id === this.current) return World.objects;
    const rec = this.cache.get(id);
    return rec ? rec.objects : null;
  },

  /* ---- the cache ---- */

  snapshot() {
    const r = {};
    this.FIELDS.forEach(k => r[k] = World[k]);
    r.w = MAPW; r.h = MAPH;
    return r;
  },
  apply(rec) {
    this.FIELDS.forEach(k => World[k] = rec[k]);
    MAPW = rec.w; MAPH = rec.h;
  },
  /* Build a level into a record without disturbing the one on screen. */
  build(id) {
    const def = this.def(id);
    if (!def) return null;
    const live = World.level ? this.snapshot() : null;
    World.build(def);
    const rec = this.snapshot();
    const keep = this.state[id];
    if (keep) this.reapply(rec, keep);
    if (live) this.apply(live);
    return rec;
  },
  /* A level's record, built on first ask. Never trims: `current` is not yet
     updated here, so it could evict the level being loaded. */
  ensure(id) {
    let rec = this.cache.get(id);
    if (!rec) {
      rec = this.build(id);
      if (!rec) return null;
      this.cache.set(id, rec);
    }
    this.touch(id);
    return rec;
  },
  built(id) { return this.cache.has(id); },
  touch(id) {
    this.order = this.order.filter(x => x !== id);
    this.order.push(id);
  },
  /* Drop the least recently used, keeping the hub and the one on screen. */
  trim() {
    const droppable = this.order.filter(id =>
      id !== this.current && !(this.def(id) || {}).hub);
    while (droppable.length > this.BUDGET) {
      const id = droppable.shift();
      const rec = this.cache.get(id);
      if (rec) this.state[id] = this.capture(rec);
      this.cache.delete(id);
      this.order = this.order.filter(x => x !== id);
    }
  },

  /* ---- what a level remembers ----
     Keyed by level and object id, both stable because furnish() adds in a
     fixed order. In G, so it is saved. */
  get state() { return G.levelState; },
  capture(rec) {
    const out = {};
    (rec.objects || []).forEach(o => {
      let bag = null;
      this.MUT.forEach(k => {
        if (o[k] === undefined || o[k] === null || o[k] === false) return;
        (bag = bag || {})[k] = o[k];
      });
      if (bag) out[o.id] = bag;
    });
    return out;
  },
  reapply(rec, keep) {
    const byId = new Map((rec.objects || []).map(o => [o.id, o]));
    for (const id in keep) {
      const o = byId.get(id);
      if (o) Object.assign(o, keep[id]);
    }
  },
  /* Before a save: fold in the live level too. */
  freeze() {
    const rec = this.cache.get(this.current);
    if (rec) this.state[this.current] = this.capture(rec);
  },

  /* ---- going somewhere ---- */

  /* The one way the player changes level: to `entry` in the destination's
     entries, else `start`, else its first. */
  go(id, entry, opts) {
    opts = opts || {};
    const def = this.def(id);
    if (!def || this.moving) return false;
    const entries = def.entries || {};
    const at = entries[entry] || entries.start || Object.values(entries)[0];
    if (!at) { console.warn('level ' + id + ' has no entry points at all'); return false; }

    const swap = () => {
      /* A rebuild reassigns World's arrays; fold them back into the record. */
      if (this.current && this.cache.has(this.current)) this.cache.set(this.current, this.snapshot());
      this.apply(this.ensure(id));
      this.current = id;
      G.level = id;
      this.trim();

      P.x = at[0] * TILE; P.y = at[1] * TILE;
      P.vx = P.vy = 0; P.moving = false;
      releaseSticks();
      /* Arriving is on foot, and nothing fired is still in the air. */
      Cars.getOutQuietly();
      Guns.clear();

      NPCM.enter(id);
      Guide.onLevel();
      Q.restand();
      /* On the rota from the first real arrival on the hub; the opening's
         camera (`cinema`) does not count. */
      if (id === this.hub() && !opts.cinema) G.flags.onTheFloor = true;
      R.levelChanged();
      Cam.snap();

      /* movePlayer names the room on its next frame. */
      G.lastZone = null;
      if (!opts.quiet) Sfx.door();
      this.offered = new Set();
      this.prefetch();
    };

    if (opts.quiet) { swap(); return true; }
    this.transition(swap);
    return true;
  },

  /* Follow the link for this `use` handler; data/levels.js names where. */
  take(via, opts) {
    const link = ((World.def && World.def.links) || []).find(l => l.via === via);
    if (!link) return false;
    return this.go(link.to, link.entry, opts);
  },
  /* The link for this handler here, if any. */
  links(via) {
    return ((World.def && World.def.links) || []).find(l => l.via === via) || null;
  },

  /* The first link towards another level, breadth-first: how the tracker
     points at a door when its target is elsewhere. */
  route(toId, fromId) {
    fromId = fromId || this.current;
    if (!fromId || fromId === toId || !this.def(toId)) return null;
    const seen = new Set([fromId]);
    const queue = [];
    ((this.def(fromId) || {}).links || []).forEach(l => {
      if (seen.has(l.to)) return;
      seen.add(l.to); queue.push({ first: l, at: l.to });
    });
    while (queue.length) {
      const n = queue.shift();
      if (n.at === toId) return n.first;
      ((this.def(n.at) || {}).links || []).forEach(l => {
        if (seen.has(l.to)) return;
        seen.add(l.to); queue.push({ first: n.first, at: l.to });
      });
    }
    return null;
  },
  /* Which built level has an object with this `use`. */
  whereIs(use) {
    if (World.objects.some(o => o.use === use)) return this.current;
    for (const [id, rec] of this.cache) {
      if (id !== this.current && rec.objects.some(o => o.use === use)) return id;
    }
    return null;
  },

  /* ---- streaming ----
     One neighbour per idle slot, only while the cache has room for it, and each
     offered once per arrival: otherwise the build evicts another neighbour that
     is then unbuilt again, and the loop never ends. */
  prefetch() {
    if (this.room() <= 0) return;
    const next = ((World.def && World.def.links) || [])
      .map(l => l.to).find(id => this.def(id) && !this.built(id) && !this.offered.has(id));
    if (!next) return;
    const idle = window.requestIdleCallback || (fn => setTimeout(() => fn(), 220));
    const from = this.current;
    idle(() => {
      /* Walked on since the offer: the arrival made its own. */
      if (this.current !== from) return;
      /* Marked first, so one that fails to build is not offered forever. */
      this.offered.add(next);
      if (!this.built(next) && this.room() > 0) { this.ensure(next); this.trim(); }
      this.prefetch();
    });
  },
  /* Room for one more level without evicting one. */
  room() {
    return this.BUDGET - this.order.filter(id =>
      id !== this.current && !(this.def(id) || {}).hub).length;
  },

  /* A short fade hides the cut; reduced motion gets the swap alone. */
  transition(swap) {
    const el = $('#fade');
    if (!el || !FX.motion) { swap(); return; }
    this.moving = true;
    el.classList.add('on');
    setTimeout(() => {
      try { swap(); } finally {
        el.classList.remove('on');
        this.moving = false;
      }
    }, 190);
  },

  /* ---- boot and save ----
     Where a run begins: the level flagged `arrive`, else the hub. */
  first() {
    return this.ids().find(id => (this.def(id) || {}).arrive)
      || this.ids().find(id => (this.def(id) || {}).hub) || this.ids()[0];
  },
  start(id, entry) {
    this.cache.clear(); this.order = []; this.current = null; this.moving = false;
    this.offered = new Set();
    return this.go(id || this.first(), entry || 'start', { quiet: true });
  },
  /* Back onto the saved level, at the saved position if a person still fits
     there (the level data may have changed under the save), else the entry. */
  resume() {
    const id = this.def(G.level) ? G.level : this.first();
    const x = P.x, y = P.y;
    this.start(id, 'start');
    if (playerFits(x, y)) { P.x = x; P.y = y; }
    Cam.snap();
  }
};

/* ---------------- The lift ----------------
   Which button the car was last sent to ('G', '4'…; FLOORS maps buttons to
   floors). Taking the stairs does not move it, as in life. */
const Lifts = {
  floor: 'G',
  at() { return this.floor; },
  send(button) { if (button) this.floor = button; }
};
