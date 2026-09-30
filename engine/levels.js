'use strict';
/* ---------------- Level loading and streaming ----------------
   World holds one map — whichever level is loaded. This holds the rest of them,
   decides when to build one and when to throw it away, and moves the player
   between them.

   Three ideas, and they are the whole file:

   A level is BUILT LAZILY. Nothing but the fourth floor exists when the game
   starts; the basement is built the first time somebody lifts the hatch. That
   is what keeps boot the same length it has always been however many levels the
   catalogue grows to.

   A built level is KEPT. Re-entering one is a reference assignment, not a
   rebuild, so walking in and out of a door costs nothing and — much more
   importantly — the level is still in the state you left it. The cache is
   bounded (BUDGET) because an unbounded cache is not a cache, and the hub is
   pinned because it is the level with twenty colleagues and a queue of phones
   on it and it is never the right thing to evict.

   Neighbours are PREFETCHED while nothing is happening. Once you are standing
   somewhere, whatever is one door away gets built during an idle slot, so the
   transition itself never has to wait for one. This is the streaming: it is not
   chunks of an open world, because the maps here are a few thousand tiles and
   the honest unit is the room, but the shape is the same — build ahead of the
   player, keep what is close, drop what is far.

   Nothing outside this file names a destination. An act says take('hatch') and
   the link table in data/levels.js says where the hatch goes, which is also
   what lets route() work out which door to point at for somewhere two levels
   away. */
const Levels = {
  /* Built levels kept besides the pinned hub. Two is enough to make a there-
     and-back-again free while keeping the ceiling on memory obvious. */
  BUDGET: 2,
  cache: new Map(),
  /* Least-recently-used first. Which one to drop when the budget is exceeded. */
  order: [],
  /* Which neighbours the prefetcher has already offered to build since the
     player arrived where they are. Cleared on every arrival — see prefetch(),
     which is also where the reason it has to exist at all is written down. */
  offered: new Set(),
  current: null,
  /* Set while a transition is in flight, so a second one cannot start on top of
     it — two overlapping transitions leave the player on one level with the
     other level's arrival point. */
  moving: false,

  /* Every field of World that belongs to the map rather than to the builder.
     Swapping levels is assigning this list across, which is why it has to be
     complete: anything left off is silently retained from the previous level,
     and a stale `desks` draws the fourth floor's workstations on the road. */
  FIELDS: ['def', 'level', 'solid', 'zone', 'seed', 'surf', 'ao', 'objects', 'byTile',
    /* AND THE NAMES BEHIND THE ZONE AND SURFACE GRIDS. Those grids hold an
       index per tile rather than a string — see the note over the buffers in
       World.build() — and an index means nothing without the table it indexes.
       Left off this list, a level swapped in would read its own tiles through
       the PREVIOUS level's table and come out painted in somebody else's
       rooms, which is precisely the class of fault the note above this list
       describes: anything left off is silently retained. */
    'zoneName', 'surfName',
    'doorways', 'openings', 'desks', 'worktops', 'tables', 'counters', 'blocked',
    /* The cars are the map's, not the driver's: leave the pool car in the
       middle of Fenn Street, walk into the building and come back out, and it
       is still in the middle of Fenn Street. `carTiles` travels with them for
       the same reason `blocked` does — it is what the level's own collision
       reads, and a stale one from the last level is a set of invisible cars. */
    'cars', 'carTiles', 'peds'],

  /* Object fields that a level's own state may change after it is built, and
     that therefore have to survive being evicted and rebuilt. Everything else
     about an object is derived from the definition and comes back identical. */
  MUT: ['ringing', 'waited', 'hot', 'locked', 'st'],

  init() {
    /* The catalogue is keyed by id, so the id need not be written twice — and
       cannot disagree with itself. */
    for (const id in LEVELS) LEVELS[id].id = id;
    this.cache.clear(); this.order = []; this.current = null; this.moving = false;
    this.offered = new Set();
    this._hub = undefined;
  },
  def(id) { return LEVELS[id] || null; },
  /* ARE WE AT WORK. Asked of the catalogue, like first() and hub, because it is
     a fact about the building rather than about whoever is standing in it — and
     because the alternative is a list of four level ids written down in
     engine/, which is the thing this file exists to stop.

     It is the other half of Sky.working(). The clock says whether the shift is
     running; this says whether you are anywhere it can reach you. Both have to
     be true before the queue is yours, and until the island was built only one
     of them could ever be false. See `site` in data/levels.js. */
  onSite(id) {
    const d = this.def(id === undefined ? World.level : id);
    return !!(d && d.site);
  },
  /* The level definitions, in catalogue order. */
  ids() { return Object.keys(LEVELS); },
  /* THE FLOOR WITH THE PEOPLE AND THE PHONES ON IT. Asked of the catalogue,
     like first() and onSite() — and written here once because it was written
     out longhand in seven places in engine/npc.js and one in engine/office.js,
     every one of them the same find with the same fallback. Cached: the
     catalogue does not change while a tab is open. */
  hub() {
    if (this._hub === undefined)
      this._hub = this.ids().find(id => (this.def(id) || {}).hub) || this.ids()[0];
    return this._hub;
  },
  /* THE STREET THE BUILDING EMPTIES ONTO: the level flagged `street: true`.
     It is where the crowd walks out to at the end of the day — through the
     entry named by that level's `streetEntry` (default `doors`) — and where a
     shop's way out leads. No such level is a game in which nobody goes home
     on foot, which is a perfectly good game. */
  street() {
    if (this._street === undefined)
      this._street = this.ids().find(id => (this.def(id) || {}).street) || null;
    return this._street;
  },
  /* WHAT IS STANDING ON A LEVEL THAT IS NOT THE ONE YOU ARE ON. The arrays in
     a cached record are the same arrays World reads when that level is loaded
     — see apply() — so this is a reference to the real thing rather than a
     copy of it, and a phone rung through here is the same phone you walk up to
     later. Null for a level nobody has built yet, deliberately: this is for
     things that happen to a level in the background, and none of them is worth
     building a map for. The hub is pinned, so the one caller that matters
     never gets a null after the first visit. */
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
  /* Build a level into a record WITHOUT disturbing the one on screen. World is
     the only thing that can build, so it is borrowed and handed back — which is
     what lets prefetch run while the player is standing somewhere else. */
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
  /* The record for a level, building it if this is the first time anybody has
     asked. Every path to a level goes through here. */
  /* Deliberately does NOT trim. Trimming here evicts by a `current` that has
     not been updated yet, so with a tight budget the level being loaded is
     thrown out of the cache between being built and being stood on — it still
     draws, because the record is applied either way, but it is no longer the
     cache's and every change made on it is dropped on the way out. Both callers
     trim once they have finished moving. */
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
  /* Drop the least recently used, keeping the hub and whatever is on screen.
     What a level remembers is captured first, so coming back to an evicted one
     is indistinguishable from coming back to a cached one. */
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
     Keyed by level id and by object id, both of which are stable: `furnish` is
     a fixed sequence of add() calls, so the tenth object built is the tenth
     object built every time. Lives in G, so it goes into the save with
     everything else and a restored shift finds the basement as it was left. */
  get state() {
    if (!G.levelState) G.levelState = {};
    return G.levelState;
  },
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
  /* Called before writing a save: fold the live level's state in, so the record
     in G is current for every level and not just the evicted ones. */
  freeze() {
    const rec = this.cache.get(this.current);
    if (rec) this.state[this.current] = this.capture(rec);
  },

  /* ---- going somewhere ---- */

  /* The one way the player changes level. `entry` names an arrival point in the
     destination's own `entries`; anything unnamed lands on `start`, and a level
     with neither is a level nobody can reach, which is a data error rather than
     something to paper over at runtime. */
  go(id, entry, opts) {
    opts = opts || {};
    const def = this.def(id);
    if (!def || this.moving) return false;
    /* Named entry, then the conventional one, then whatever the level declares
       first. The last fallback matters more than it looks: resume() asks for
       'start' on a level that may only have a 'ladder', and without it a shift
       saved in the basement reloads standing on the fourth floor — silently,
       because a level that refuses to load leaves the previous one on screen
       and nothing about that reads as an error. */
    const entries = def.entries || {};
    const at = entries[entry] || entries.start || Object.values(entries)[0];
    if (!at) { console.warn('level ' + id + ' has no entry points at all'); return false; }

    const swap = () => {
      /* Fold the live level back into its own record before letting go of it.
         The arrays are shared by reference so mutation is already visible, but
         a rebuild reassigns them, and this is the one line that makes that
         case safe rather than subtly wrong. */
      if (this.current && this.cache.has(this.current)) this.cache.set(this.current, this.snapshot());
      this.apply(this.ensure(id));
      this.current = id;
      G.level = id;
      /* Now that `current` says where the player is, it is safe to drop the
         level furthest from them. */
      this.trim();

      P.x = at[0] * TILE; P.y = at[1] * TILE;
      P.vx = P.vy = 0; P.moving = false;
      releaseSticks();
      /* You cannot drive through a door, so arriving anywhere is arriving on
         foot. Belt and braces — nothing can currently change level from behind
         a wheel — but a driver still holding a car on a level that is no longer
         loaded is the kind of state that only shows itself as the camera
         following something that is not there. */
      if (typeof Cars !== 'undefined') Cars.getOutQuietly();
      /* And nothing is still in the air. A dart is a thing in a room, and the
         room has just been swapped out from under it — kept, it would arrive
         on the next level mid-flight, at the same pixel, having travelled
         through a door it could not fit through. */
      if (typeof Guns !== 'undefined') Guns.clear();

      /* Presence: who is standing on this level, which phones can be heard
         ringing, and a minimap that is of this map rather than the last one. */
      NPCM.enter(id);
      Guide.onLevel();
      /* And what the tracker says you are doing, which is a different answer in
         the building and out of it — see Q.restand(), which leaves a job or an
         act's own instruction exactly where it is. */
      Q.restand();
      /* ON THE ROTA. The first time you set foot on the floor the phones are
         on, and permanently thereafter. It is one flag and it exists because
         of the opening: a shift begins in the lobby, the queue is the whole
         building's, and between those two facts a player who had not yet found
         the lift was losing reputation to a floor they had never seen. Nobody
         is on the rota before their first morning on the floor. Read by
         Phones.live(); cleared with everything else by resetRun(). */
      /* …but not when the OPENING is the thing that moved. `cinema` is a shot,
         not an arrival: the camera goes up ahead of the player and comes back
         down, and a player who has not yet found the lift must not come out of
         the cutscene already on the rota, losing reputation to a floor they
         have never stood on. That is the whole reason this flag exists. */
      if (id === this.hub() && !opts.cinema) G.flags.onTheFloor = true;
      R.levelChanged();
      Cam.snap();

      /* Forget which room you were in and let movePlayer notice you are
         somewhere new on its next frame. It already owns naming the room,
         awarding the fifteen for a room you have not been in before and
         checking whether that was the last one — and one rule in one place
         beats a second copy here that has to be kept in step with it. */
      G.lastZone = null;
      if (!opts.quiet) Sfx.door();
      /* Whatever is one door from here, built while nothing is happening. A
         fresh arrival is a fresh offer: the cache is not what it was last time
         this level was stood on. */
      this.offered = new Set();
      this.prefetch();
    };

    if (opts.quiet) { swap(); return true; }
    this.transition(swap);
    return true;
  },

  /* Follow a way out by the `use` handler of the thing you took. The act never
     names a destination — data/levels.js does — so moving a level, renaming it
     or putting a second door onto it is a change to the catalogue and to
     nothing else. */
  take(via, opts) {
    const link = ((World.def && World.def.links) || []).find(l => l.via === via);
    if (!link) return false;
    return this.go(link.to, link.entry, opts);
  },
  /* Is there a way out of here by this handler at all — for an act that wants
     to offer the choice only when it leads somewhere. */
  links(via) {
    return ((World.def && World.def.links) || []).find(l => l.via === via) || null;
  },

  /* The first link to take to get from one level to another, breadth-first over
     the link graph. What makes a job whose target is on another level pointable
     at: the tracker cannot pin the thing itself, but it can pin the door. */
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
  /* Which level an object with this `use` is on. Only built levels can answer —
     an unbuilt one would have to be built to be searched, and building every
     level to find out where the printer is defeats the point of building them
     lazily. In practice the neighbours are built, because prefetch built them
     the moment you arrived. */
  whereIs(use) {
    if (World.objects.some(o => o.use === use)) return this.current;
    for (const [id, rec] of this.cache) {
      if (id !== this.current && rec.objects.some(o => o.use === use)) return id;
    }
    return null;
  },

  /* ---- streaming ----
     One neighbour per idle slot. Splitting them up matters: building two levels
     back to back inside one callback is a frame the player watches go by, and
     the whole point of doing it early is that nobody ever sees it happen.

     TWO RULES, and both of them are about the cache rather than about the
     levels. A prefetcher that ignores either one does not stream, it thrashes.

     BUILD ONLY WHAT THE CACHE CAN KEEP. The budget is two besides the hub and
     the level on screen, and the street has twenty-two ways off it. Building a
     third neighbour does not cache a third neighbour: it makes trim() throw the
     first one away, and the work is not saved for later, it is simply lost.

     AND OFFER EACH NEIGHBOUR ONCE. Those two together is the whole of the
     fault this pair of rules was written for. The old loop took its list of
     unbuilt neighbours, built one, trimmed, and asked again — and the ask
     found, every time, that the level the trim had just evicted was unbuilt
     again. It never terminated. On the fourth floor that was three small rooms
     going round and round and nobody noticed for a year; outside, where the
     road east now leads to a hundred and forty-seven thousand tiles, it was
     the outskirts rebuilt ELEVEN TIMES A SECOND, for as long as you stood in
     the town, which is two seconds of building in every twenty and a frame
     lost every few — and it looked exactly like what it was reported as: the
     driving going to pieces. Nothing in the driving was wrong. */
  prefetch() {
    if (this.room() <= 0) return;
    const next = ((World.def && World.def.links) || [])
      .map(l => l.to).find(id => this.def(id) && !this.built(id) && !this.offered.has(id));
    if (!next) return;
    const idle = window.requestIdleCallback || (fn => setTimeout(() => fn(), 220));
    const from = this.current;
    idle(() => {
      /* An idle slot is long enough to walk through a door in. If one was
         walked through, this offer was made on behalf of a level that is no
         longer on screen — and the arrival has already made its own. */
      if (this.current !== from) return;
      /* Marked before it is built and not after, so that a level which fails to
         build is not offered again on the next pass for ever. */
      this.offered.add(next);
      /* Asked again rather than trusted: both answers were taken before the
         wait, and a level can have been built or evicted since. */
      if (!this.built(next) && this.room() > 0) { this.ensure(next); this.trim(); }
      this.prefetch();
    });
  },
  /* How much room is left for one more level: the budget, less whatever is
     already cached that is neither the level on screen nor the pinned hub —
     which is exactly the list trim() evicts from, and so exactly the question
     "would building one more immediately cost us one we have". */
  room() {
    return this.BUDGET - this.order.filter(id =>
      id !== this.current && !(this.def(id) || {}).hub).length;
  },

  /* ---- the curtain ----
     A build that is already cached takes no time at all, so this is not hiding
     a stall — it is hiding the cut. Walking through a door and being somewhere
     else on the same frame reads as a glitch rather than as travel. Reduced
     motion gets the swap with no fade, which is the same thing without the
     part that moves. */
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
     resetRun() and a restored save both come through here, so there is one
     definition of "the game is on a level" and it cannot be half-done. */
  /* WHERE A SHIFT BEGINS, asked of the catalogue rather than written down in
     two places in engine/. It was a hard-coded 'office' in boot.js and in
     state.js, which was true for as long as the building was one floor and
     stopped being true the day the lobby became the ground floor. Same shape
     as `hub`, and for the same reason: it is a fact about the building. */
  first() {
    return this.ids().find(id => (this.def(id) || {}).arrive)
      || this.ids().find(id => (this.def(id) || {}).hub) || this.ids()[0];
  },
  start(id, entry) {
    this.cache.clear(); this.order = []; this.current = null; this.moving = false;
    this.offered = new Set();
    return this.go(id || this.first(), entry || 'start', { quiet: true });
  },
  /* Put a restored save back on the level it was saved on. The position comes
     from the save rather than from the entry point — you are where you were
     standing, not at the door. */
  resume() {
    const id = this.def(G.level) ? G.level : this.first();
    const x = P.x, y = P.y;
    this.start(id, 'start');
    /* WHERE YOU WERE STANDING, IF IT IS STILL SOMEWHERE TO STAND. A save holds
       a position on a level, and a level can be rebuilt underneath it — the
       town is a part of an island now, at an offset, which puts every outdoor
       position in every save written before that in the sea. Rather than a
       migration for that one change, the general rule: a restored position that
       is not somewhere a person fits is not restored, and you come back through
       the door instead. It costs one collision test and it is right for every
       change of this kind, including the next one. */
    if (playerFits(x, y)) { P.x = x; P.y = y; }
    Cam.snap();
  }
};

/* ---------------- The lift ----------------
   Which floor the car is on, and nothing else. It is four lines and it earns
   them: the light over every set of lift doors in this building reads this, the
   indicator beside them reads this, and what it says is true — press 5 and the
   car is on 5, and the man waiting on the ground floor can see that it is.

   `at()` is the BUTTON, not the level id, because that is what is written on a
   lift: FLOORS in data/world.js is the one table that knows which is which, and
   it is the same table the act reads. Nothing here knows what a floor IS.

   It starts on G because a lift left overnight is on the ground floor, which is
   where the last person out of the building left it. */
const Lifts = {
  floor: 'G',
  /* What the light over the doors says, and what the indicator beside them
     reads out. It is the BUTTON — 'G', '4', '5' — and not a level id, because
     that is what is written on a lift. FLOORS in data/world.js is the one table
     that knows which button is which floor, and nothing in here knows what a
     floor is. */
  at() { return this.floor; },
  /* Called by Acts.lift() the instant a button is pressed, so the car has moved
     before the doors have opened — which is the correct order, and is also the
     only order this game can draw.

     Arriving on a floor by the STAIRS does not call it, and that is the whole
     reason this is a variable rather than a lookup: walk up, and the light over
     the doors still says where the last person left it. */
  send(button) { if (button) this.floor = button; }
};
