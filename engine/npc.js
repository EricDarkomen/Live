'use strict';
/* ---------------- Nav: the shortest way there ---------------- */
/* One sweep per destination, cached, and everyone going there steps downhill
   on it. A field is a step count per tile, so reading it is four lookups.
   People share a dozen destinations, so each is swept once, and the field
   also gives walking distance (the compass counts it down). Thrown away when
   World builds a new floor plan. */
const Nav = {
  fields: new Map(), grid: null, level: null, stamp: -1,
  /* Enough for a desk each plus the shared destinations, and eviction is
     least-recently-asked, so the handful in use every frame stay put. */
  LIMIT: 64,
  /* People standing still are part of the map. `mask` is one byte a tile,
     rebuilt when it changes:
       1  a colleague at their spot: passable at +6, so people go round rather
          than squeeze past.
       2  you, standing still: passable at +14. Where there is a way round they
          take it; where not, they come and wait rather than give up.
     Weighted tiles make the sweep Dijkstra rather than breadth-first. */
  mask: null, sig: '', COST: [0, 6, 14],
  /* From NPCM once things settle, not every frame. */
  setDynamic(sig, block, slow) {
    if (sig === this.sig) return;
    this.sig = sig;
    if (!World.solid) return;
    const m = new Uint8Array(MAPW * MAPH);
    for (const k of slow) { const [x, y] = k.split(',');
      if (x >= 0 && y >= 0 && x < MAPW && y < MAPH) m[y * MAPW + +x] = 1; }
    for (const k of block) { const [x, y] = k.split(',');
      if (x >= 0 && y >= 0 && x < MAPW && y < MAPH) m[y * MAPW + +x] = 2; }
    this.mask = m;
    /* Only the people-aware routes go stale (the compass's plain ones ignore
       people). Marked stale, not deleted, and refreshed a few per frame (BUDGET),
       so somebody sitting down never rebuilds every route in one frame. */
    this.gen++;
  },
  /* The crowd generation routes should reflect, and this frame's rebuild budget
     (reset by tick()). */
  gen: 0, budget: 0, BUDGET: 5,
  tick() { this.budget = this.BUDGET; },
  /* Can a route to here be had this frame: already built, or room to build. */
  ready(tx, ty) { this.fresh(); return this.budget > 0 || this.fields.has(tx + ',' + ty); },
  /* Enough cached routes for everybody on the level: a desk each, the shared
     spots and spare. 16-bit fields are ~23KB on the island. */
  limit() { return Math.max(this.LIMIT, NPCM.list.length * 2 + 24); },
  /* World.build() makes a new solid[] each time, so identity is the test; the
     object count catches unlocked doors and moved objects. */
  fresh() {
    const stamp = World.objects ? World.objects.length : -1;
    if (this.grid === World.solid && this.level === World.level && this.stamp === stamp) return;
    this.grid = World.solid; this.level = World.level; this.stamp = stamp;
    this.fields.clear();
    this.pass = null;
  },
  /* Which squares can be stood on, one byte a tile, built once per floor plan
     (World.isSolid() is too slow to ask per square per sweep). Only cars move;
     they are laid over a copy at sweep time. */
  pass: null, _open: null,
  passable() {
    if (this.pass) return this.pass;
    const w = MAPW, h = MAPH, p = new Uint8Array(w * h);
    const hasBlocked = World.blocked && World.blocked.size;
    for (let y = 0; y < h; y++) {
      const row = World.solid[y];
      for (let x = 0; x < w; x++) {
        if (row && row[x]) continue;
        if (hasBlocked && World.blocked.has(x + ',' + y)) continue;
        const here = World.at(x, y);
        let solid = false;
        for (let i = 0; i < here.length; i++) if (here[i].solid) { solid = true; break; }
        if (!solid) p[y * w + x] = 1;
      }
    }
    return (this.pass = p);
  },
  /* The passable grid with this instant's cars stood on it. */
  openNow() {
    const p = this.passable();
    const cars = World.carTiles;
    if (!cars || !cars.size) return p;
    if (!this._open || this._open.length !== p.length) this._open = new Uint8Array(p.length);
    const o = this._open;
    o.set(p);
    for (const k of cars) {
      const c = k.indexOf(','), x = +k.slice(0, c), y = +k.slice(c + 1);
      if (x >= 0 && y >= 0 && x < MAPW && y < MAPH) o[y * MAPW + x] = 0;
    }
    return o;
  },
  clear() { this.fields.clear(); this.grid = null; this.pass = null; },
  /* `plain` ignores people: the compass wants walking distance, not traffic. */
  field(tx, ty, plain) {
    if (!World.solid) return null;
    this.fresh();
    const k = (plain ? 'p:' : '') + tx + ',' + ty;
    let hit = this.fields.get(k);
    /* Stale: rebuilt if the frame has budget, else answered from a moment ago. */
    if (hit && !plain && hit.gen !== this.gen && this.budget > 0) {
      this.budget--;
      hit = this.build(tx, ty, plain); hit.gen = this.gen;
    }
    /* Re-inserting keeps the Map ordered by last use, so eviction is LRU. */
    if (hit) { this.fields.delete(k); this.fields.set(k, hit); return hit; }
    const f = this.build(tx, ty, plain);
    f.gen = this.gen; this.budget--;
    const cap = this.limit();
    while (this.fields.size >= cap) this.fields.delete(this.fields.keys().next().value);
    this.fields.set(k, f);
    return f;
  },
  /* The most squares a sweep may expand. Dijkstra takes the nearest first, so a
     capped field is a disc round the destination. 40000 is several times the
     longest walk on any level, so today it never bites. A capped field is
     marked `partial` (see `far === null` in walk()): unswept and unreachable
     are both -1 but mean opposite things. */
  CAP: 40000,
  /* The sweep as a bucket queue (Dial's algorithm): step costs are 1, 7 or 15,
     so sixteen lists by cost modulo sixteen replace a heap. The lists are
     typed arrays reused across sweeps. Same distances, a fraction of the time. */
  _node: null, _next: null, _head: new Int32Array(16),
  build(tx, ty, plain) {
    const w = MAPW, h = MAPH, N = w * h;
    /* 16 bits a square; no route comes near 32,000 steps. */
    const d = new Int16Array(N).fill(-1);
    const m = plain ? null : this.mask, COST = this.COST;
    const open = this.openNow();
    /* Every square can be offered from each of its four sides, plus the four
       seeds: that is the most the lists can ever hold at once. */
    const cap = N * 4 + 8;
    if (!this._node || this._node.length < cap) { this._node = new Int32Array(cap); this._next = new Int32Array(cap); }
    const node = this._node, next = this._next, head = this._head;
    head.fill(-1);
    let used = 0, pending = 0;
    const push = (c, i) => { const b = c & 15; node[used] = i; next[used] = head[b]; head[b] = used++; pending++; };
    const seed = (x, y, c) => {
      if (x < 0 || y < 0 || x >= w || y >= h || !open[y * w + x]) return false;
      push(c, y * w + x); return true;
    };
    /* A waypoint can be on a solid object (the printer): seed the squares around
       it, so "go to" means "stand at". */
    let cur = 0;
    if (!seed(tx, ty, 0)) { seed(tx - 1, ty, 1); seed(tx + 1, ty, 1); seed(tx, ty - 1, 1); seed(tx, ty + 1, 1); cur = 1; }
    let taken = 0;
    for (; pending > 0; cur++) {
      const b = cur & 15;
      while (head[b] !== -1) {
        const k = head[b]; head[b] = next[k]; pending--;
        const i = node[k];
        if (d[i] !== -1) continue;
        if (cur > 32000) { d.partial = true; return d; }
        d[i] = cur;
        if (++taken >= this.CAP) { d.partial = true; return d; }
        const x = i % w;
        /* Left, right, up, down — unrolled, because this is the inner loop of
           the whole of the island's walking. */
        let j;
        if (x > 0 && open[j = i - 1] && d[j] === -1) push(cur + 1 + (m ? COST[m[j]] : 0), j);
        if (x < w - 1 && open[j = i + 1] && d[j] === -1) push(cur + 1 + (m ? COST[m[j]] : 0), j);
        if (i >= w && open[j = i - w] && d[j] === -1) push(cur + 1 + (m ? COST[m[j]] : 0), j);
        if (i < N - w && open[j = i + w] && d[j] === -1) push(cur + 1 + (m ? COST[m[j]] : 0), j);
      }
    }
    return d;
  },
  at(f, x, y) { return (!f || x < 0 || y < 0 || x >= MAPW || y >= MAPH) ? -1 : f[y * MAPW + x]; },
  /* Steps from one tile to another, or null when there is no way at all — a
     locked door between the two, or a tile nobody can stand on. */
  steps(fx, fy, tx, ty, plain) {
    const v = this.at(this.field(tx, ty, plain), fx, fy);
    return v < 0 ? null : v;
  },
  /* Whether this destination's sweep was capped before reaching here: a long
     walk (set off), not a locked door (wait). */
  partial(tx, ty, plain) {
    const f = this.field(tx, ty, plain);
    return !!(f && f.partial);
  },
  /* The next tile: downhill on the field, diagonally only when both corner
     tiles are open. `cost` adds a price per tile (someone in the way) but only
     chooses among closer tiles, so it can never send anybody backwards. */
  next(fx, fy, tx, ty, cost) {
    const f = this.field(tx, ty);
    if (!f) return null;
    const here = this.at(f, fx, fy);
    if (here <= 0) return null;
    let bx = 0, by = 0, best = Infinity;
    const open = (x, y) => this.at(f, x, y) >= 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const x = fx + ox, y = fy + oy, v = this.at(f, x, y);
      if (v < 0 || v >= here) continue;
      if (ox && oy && !(open(x, fy) && open(fx, y))) continue;
      const c = v + (cost ? cost(x, y) : 0);
      if (c >= best) continue;
      best = c; bx = ox; by = oy;
    }
    return (bx || by) ? [fx + bx, fy + by] : null;
  }
};

/* ---------------- NPCManager ---------------- */
const NPCM = {
  /* `list` is who is on your level (drawing, collision, talking, minimap);
     `all` is the roster (jobs, relationships, the rolodex). */
  list: [], all: [],
  /* Seconds since load: the floor's reaction clock, not G.minutes, which events
     can jump. */
  now: 0, busyTiles: new Set(), stillTiles: new Map(), boss: null, lastEvent: null, dynAt: 0, stillFor: 0,
  /* Set while an evacuation is running — see THE DRILL. Cleared with the
     roster, so a new shift never starts halfway through somebody else's. */
  drill: null,
  pvx: 0, pvy: 0,
  spawn() {
    this.drill = null; this.lastEvent = null;
    /* A new roster: feelings survive in G.minds, plans do not. */
    Mind.reset();
    this.all = NPCS.map(def => {
      const t = this.traits(def);
      return {
        def, id: def.id, name: def.name, face: def.face, role: def.role, t,
        /* Their level, the hub unless the def says otherwise. */
        level: def.level || Levels.hub(),
        x: (def.desk[0] + .5) * TILE, y: (def.desk[1] + .5) * TILE,
        step: 0, speed: TILE * t.pace, bob: rnd(0, 6.3),
        /* Facing at their spot: 2 faces the camera; `dir:` in data/npcs.js overrides. */
        dir: def.dir === undefined ? 2 : def.dir,
        say: '', sayT: 0, nextSay: rnd(6, 22), stunTimer: 0, dest: 'desk', destKey: '', stuck: 0,
        /* Claimed square, conversation partner, gaze and chat cooldown: where they are,
           not who they are, so unsaved. */
        post: null, walking: false, chat: null, chatCool: rnd(5, 40), callOut: null,
        /* Drill stage and its two squares (assembly and return). Unsaved. */
        drill: null,
        /* Gone home. Unsaved, and set at spawn from the clock by homeSnap(). */
        away: false,
        lookAt: null, lookT: 0, idleT: rnd(2, 9), evade: 0, evadeX: 0, evadeY: 0,
        /* Steering: held heading, next tile, best distance so far and time since it
           improved. Progress, not last frame's movement, decides a walk is hopeless. */
        hx: 0, hy: 1, next: null, nextFrom: '', best: 1e9, noProg: 0, gaveUp: null,
        /* Where they decided to go, when they set off, when they got there and
           how long they mean to stay. See destTile. */
        errand: null,
        /* Standing somewhere on purpose, rather than merely being near it. */
        parked: false, waitDoor: 0, holdWant: null, holdFor: 0, lastAim: 'desk', retry: 0,
        queued: 0, waitingFor: null, wayBack: null, wayFor: 0, squeeze: 0,
        /* When they left on an errand and which window it was for (the clock may
           close it on the way). `leaving` is the same for leaving a shop at closing.
           See runErrands(). Unsaved. */
        outAt: null, outFor: null, leaving: 0,
        /* The pavement square they are crossing town towards, when watched (see
           runErrands()). */
        outward: null,
        /* When they stepped out of the front doors on the way home, or 0 when
           they are not on their way anywhere. See runHome()'s second leg. */
        homeward: 0
      };
    });
    this.byId = new Map(this.all.map(n => [n.id, n]));
    this.enter(World.level);
    /* Then put them the right side of the working day. */
    this.homeSnap();
  },
  /* Where everybody should be, immediately, with no walking: for a jumped clock
     (a fresh roster, a load at 2am). runHome() walks people instead. */
  homeSnap() {
    const after = !Sky.staffed();
    this._wasAfter = after;
    /* Far enough in the past that nobody is waiting on the stagger: the stagger
       is for a shift that ends while you are standing in it. */
    this._homeAt = this.now - 200;
    this._homeSpots = null; this._homeRec = null; this._homeDoor = null;
    const hub = Levels.hub();
    this.all.forEach(n => {
      /* An `out:` window is asked first, before `away`: a save loaded in the
         evening finds people where they are. */
      const out = this.errandFor(n);
      /* Their own hours, not the building's — see offDuty(). */
      if (!out && this.offDuty(n)) { n.away = true; n.level = 'away'; n.callOut = null; n.homeward = 0; return; }
      if (!out && !n.away) return;
      n.away = false; n.homeward = 0;
      if (out) {
        n.level = out.level;
        n.x = (out.tile[0] + .5) * TILE; n.y = (out.tile[1] + .5) * TILE;
        if (out.face !== undefined) n.dir = out.face;
      } else {
        n.level = n.def.level || hub;
        n.x = (n.def.desk[0] + .5) * TILE; n.y = (n.def.desk[1] + .5) * TILE;
        if (n.def.dir !== undefined) n.dir = n.def.dir;
      }
      n.callOut = null; n.post = null; n.errand = null; n.next = null; n.walking = false;
      n.destKey = ''; n.best = 1e9; n.noProg = 0; n.gaveUp = null;
      /* Nobody is half way to anywhere after the clock has jumped. */
      n.outAt = null; n.outFor = null; n.leaving = 0; n.outward = null;
    });
    this.refresh();
  },
  /* A stable number from a string, for per-person variety that never changes. */
  hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  /* How this person moves, as five numbers from their id's hash (stable,
     varied, free). A def's `traits:` can override. */
  traits(def) {
    const h = this.hash(def.id);
    const bit = n => ((h >>> (n * 5)) & 31) / 31;
    return Object.assign({
      pace: 1 + bit(0) * .5,              /* tiles a second: an amble to a walk */
      social: .15 + bit(1) * .75,         /* how readily they start a conversation */
      restless: bit(2),                   /* whether standing still stays still */
      drift: Math.round(-3 + bit(3) * 9), /* minutes ahead of the timetable, or behind it */
      /* Tiles before they look up; at least E's reach, so anyone you can talk to has
         noticed you. */
      notice: 1.15 + bit(4) * .95
    }, def.traits || {});
  },
  /* Facing with hysteresis: at exactly 45° the dominant axis flips on rounding
     noise, so the current axis holds until the other wins by half again. */
  face(n, dx, dy) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (!ax && !ay) return n.dir;
    const sideways = n.dir === 1 || n.dir === 3;
    if (sideways ? ax * 1.5 >= ay : ay * 1.5 >= ax) {
      return sideways ? (dx < 0 ? 1 : 3) : (dy < 0 ? 0 : 2);
    }
    return Sprites.dirOf(dx, dy);
  },
  /* Recompute presence for a level. Called by Levels.go(); a filter once per
     transition rather than a filter every frame in five hot paths. */
  enter(level) {
    this.list = this.all.filter(n => n.level === (level || Levels.hub()));
    /* Conversations, claimed spots and doorway grudges are about a floor plan and
       are dropped on a level change. A drill survives (runDrill() re-aims). */
    this.all.forEach(n => {
      this.hangUp(n); n.post = null; n.gaveUp = null; n.destKey = ''; n.callOut = null;
      n.errand = null; this.repath(n);
    });
  },
  /* By id, indexed with the roster. */
  byId: new Map(),
  get(id) { return this.byId.get(id) || this.all.find(n => n.id === id); },
  /* Who is near a point, from a grid of two-tile cells rebuilt once a frame, so
     proximity questions check a handful of cells rather than the level. */
  CELL: 2, cells: new Map(),
  grid() {
    const c = this.cells, S = TILE * this.CELL;
    c.clear();
    for (const n of this.list) {
      const k = Math.floor(n.y / S) * 4096 + Math.floor(n.x / S);
      const a = c.get(k);
      if (a) a.push(n); else c.set(k, [n]);
    }
  },
  near(x, y, r) {
    const S = TILE * this.CELL, cr = Math.ceil(r / S);
    const cx = Math.floor(x / S), cy = Math.floor(y / S), out = [];
    for (let yy = cy - cr; yy <= cy + cr; yy++) for (let xx = cx - cr; xx <= cx + cr; xx++) {
      const a = this.cells.get(yy * 4096 + xx);
      if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
    }
    return out;
  },
  /* Whether this colleague is on your level. */
  here(id) { return this.list.some(n => n.id === id); },
  /* Where the timetable says to be. `drift` is how many minutes early or late
     this person runs, so breaks do not all start in the same frame. */
  scheduled(n) {
    const sch = n.def.schedule || [];
    const now = G.minutes + (n.t ? n.t.drift : 0);
    let d = 'desk';
    for (const [t, where] of sch) if (now >= t) d = where;
    return d;
  },
  /* The writer's intended stay, in real seconds: the gap to the next entry. */
  slotSecs(n) {
    const sch = n.def.schedule || [];
    const now = G.minutes + (n.t ? n.t.drift : 0);
    let start = DAY_START, end = DAY_END;
    for (let i = 0; i < sch.length; i++) {
      if (now >= sch[i][0]) { start = sch[i][0]; end = i + 1 < sch.length ? sch[i + 1][0] : DAY_END; }
    }
    return (end - start) * MS_PER_GAME_MIN / 1000;
  },
  /* Where somebody is actually going. The timetable is in game minutes (430ms)
     and walks take real seconds, so a literal reading has people turning back
     in doorways. Setting off is a commitment: they go, arrive, and stay the
     shorter of the slot and their patience before the timetable speaks again.
     Going back to the desk is not an errand and can be interrupted. */
  destTile(n) {
    /* Out of the building outranks the timetable, which describes a floor they
       are not on. During an `out:` window they are at the errand: their own tile,
       no waypoint, and the facing data/npcs.js gives (runErrands()). */
    const out = this.errandFor(n);
    if (out && n.level === out.level) {
      n.errand = null; n.callOut = null; n.holdWant = null;
      n.dest = 'out';
      if (out.face !== undefined) n.dir = out.face;
      return out.tile;
    }
    /* Called away by watchFloor() (see REACT), until expiry. Names a waypoint or a
       bare square, since the drill sends people off the building's map. */
    if (n.callOut) {
      const at = n.callOut.tile || WP[n.callOut.wp];
      if (this.now < n.callOut.until && at) {
        n.errand = null; n.dest = n.callOut.wp || 'assembly'; return at;
      }
      n.callOut = null;
    }
    let want = this.scheduled(n);
    /* Another floor: a waypoint may name a level. Not a lift simulation: walk to
       the lift, stand at it, be on the other floor. */
    const commuting = this.commute(n, want);
    if (commuting) return commuting;
    const e = n.errand;
    /* Outranked: a duty or an emergency cuts an errand short (engine/mind.js). */
    if (e && Mind.preempt(n, e)) n.errand = null;
    else if (e) {
      /* Still on the way. The timetable can say what it likes. */
      if (!e.arrived && this.now - e.began < 90) return this.aim(n, e.wp);
      /* Done when they have dwelt long enough and the day has moved on; if the
         timetable still wants them here they stay. */
      const done = e.arrived && this.now - e.arrived >= e.dwell;
      if (!done && this.now - e.began < 90) return this.aim(n, e.wp);
      n.errand = null;
      /* Given up on without getting there is a step skipped, not a step done:
         nobody gets better at surfing by failing to reach the sea. */
      if (e.mind) Mind.done(n, !e.arrived);
    }
    /* "Your own spot": the mind gets a say, after any errand has finished. */
    let minded = false;
    /* Asked whatever the timetable says, because a duty or an emergency
       outranks a timetabled break; Mind.want() declines anything that does
       not. 'desk' is a real answer — a step behind their own counter. */
    const w = Mind.want(n, want);
    if (w === 'desk') want = 'desk';
    else if (w && WP[w]) { want = w; minded = true; }
    if (want !== 'desk' && WP[want]) {
      /* A short pause before acting on a new want, so the whole floor does not rise
         in the same frame. */
      /* The next step of something already under way is not a new decision,
         and gets no pause for thought. */
      if (n.holdWant !== want) { n.holdWant = want; n.holdFor = this.now + (minded ? rnd(0, 1.2) : rnd(1, 11)); }
      if (this.now < n.holdFor) return this.aim(n, n.lastAim || 'desk');
      /* Cleared once they set off. */
      n.holdWant = null;
      const tag = minded ? Mind.errandTag(n) : null;
      n.errand = { wp: want, began: this.now, arrived: 0, mind: minded,
        pid: tag ? tag.pid : 0, step: tag ? tag.step : 0,
        /* Long enough to be worth the walk; a mind's errand lasts as its step says. */
        dwell: tag ? tag.dwell : clamp(this.slotSecs(n), 7, 26) };
      return this.aim(n, want);
    }
    return this.aim(n, want);
  },
  /* The off-camera half of commuting: people not on your level change floors
     directly, once a frame, as their day says. Guards follow runHome()'s order:
     a drill beats the timetable, going home beats a drill, an `out:` window
     beats everything. */
  runCommutes() {
    if (this.drill) return;
    let moved = false;
    for (const n of this.all) {
      /* On your floor: they walk to the lift themselves, and you see them do
         it. See commute(), off the schedule handler. */
      if (n.level === World.level) continue;
      if (n.homeward || n.away || n.outward || n.leaving) continue;
      if (this.errandFor(n) || this.onErrand(n)) continue;
      const want = this.scheduled(n);
      if (!want || want === 'desk' || !WP[want]) continue;
      const to = this.wpLevel(want);
      if (to === n.level) continue;
      const there = Levels.ensure(to);
      const spot = there && (this.doorSide(there, 'lift') || this.doorSide(there, 'stairs'));
      if (!spot) continue;
      this.stepThrough(n, to, spot);
      moved = true;
    }
    if (moved) this.refresh();
  },
  /* A waypoint's level; two elements means the hub. */
  wpLevel(name) {
    const w = WP[name];
    return (w && w[2]) || (Levels.hub());
  },
  /* Going up: the square to aim at while between floors, or null once on the
     right one. Walk to the lift (or stairs if no lift); arriving there puts
     them on the target floor beside its lift. A floor with no way off: nobody
     sets off. The sixty-second backstop moves anybody blocked from the lift. */
  commute(n, want) {
    if (!want || want === 'desk' || !WP[want]) return null;
    const to = this.wpLevel(want);
    if (to === n.level) { n.lift = null; return null; }
    const here = Levels.ensure(n.level), there = Levels.ensure(to);
    if (!here || !there) return null;
    const call = this.doorSide(here, 'lift') || this.doorSide(here, 'stairs');
    const out = this.doorSide(there, 'lift') || this.doorSide(there, 'stairs');
    if (!call || !out) return null;
    if (!n.lift || n.lift.to !== to) n.lift = { to, since: this.now };
    const close = Math.hypot((call[0] + .5) * TILE - n.x, (call[1] + .5) * TILE - n.y) < TILE * 1.1;
    if (close || this.now - n.lift.since > 60) {
      n.lift = null;
      this.stepThrough(n, to, out);
      this.refresh();
      return null;
    }
    n.dest = n.lastAim = 'lift';
    return call;
  },
  /* Resolve a destination name to the square it means, and record it. */
  aim(n, where) {
    n.dest = n.lastAim = where;
    if (where === 'desk') return [n.def.desk[0], n.def.desk[1]];
    const w = WP[where];
    return w ? w : [n.def.desk[0], n.def.desk[1]];
  },
  /* A doorway square: standing in one blocks everybody behind. */
  inDoorway(x, y) {
    if (World.isOpening(x, y)) return true;
    return World.at(x, y).some(o => o.kind === 'door' || o.kind === 'exit' || o.kind === 'hatch');
  },
  /* A doorway holds one person: occupied or free, nothing cleverer (a timed
     hold and same-direction sharing both jammed worse). A door still passes
     two people a second. The second loop orders the queue: the nearer arrival
     has it, ties by id, so both reach the same answer. */
  /* The door's direction is deliberately not tracked: a turnstile measured
     worse (tools/doorjam.mjs), since a reserved door idles whenever its flow
     stalls. What clears jams is below: whoever stands where someone is leaving
     a doorway steps aside, nobody waits long inside one, and a person facing a
     wall of people edges out sideways. */
  doorClear(n, x, y) {
    for (const o of this.list) {
      if (o === n) continue;
      if (Math.floor(o.x / TILE) === x && Math.floor(o.y / TILE) === y) return false;
    }
    /* You in the doorway block it, unless this person already waited for you and
       is edging past. */
    if (!(n.squeeze > 0) && G.state === 'play'
      && Math.floor(P.x / TILE) === x && Math.floor(P.y / TILE) === y) return false;
    const cx = (x + .5) * TILE, cy = (y + .5) * TILE;
    const mine = Math.hypot(cx - n.x, cy - n.y);
    for (const o of this.list) {
      if (o === n || !o.walking || !o.next) continue;
      if (o.next[0] !== x || o.next[1] !== y) continue;
      const theirs = Math.hypot(cx - o.x, cy - o.y);
      if (theirs < mine - 2 || (Math.abs(theirs - mine) <= 2 && this.hash(o.id) < this.hash(n.id))) return false;
    }
    return true;
  },
  /* Which square to stand on: a destination is a place in the room, claimed a
     square at a time from the tiles around it. A desk is exactly itself. */
  post(n, dx, dy) {
    if (n.post) return n.post;
    if (n.dest === 'desk') return (n.post = [dx, dy]);
    /* On a drill the square is exactly itself: the queue for the door is the
       point, and the car park squares are already individual. */
    if (n.drill) return (n.post = [dx, dy]);
    /* An errand's tile is exactly itself too: the table places people on purpose
       (who sits where); the chair search below would reseat them. */
    if (n.dest === 'out') return (n.post = [dx, dy]);
    const taken = new Set();
    for (const o of this.list) if (o !== n && o.post) taken.add(o.post[0] + ',' + o.post[1]);
    /* The square they just gave up on is skipped for this one pick. */
    if (n.gaveUp) { taken.add(n.gaveUp); n.gaveUp = null; }
    const f = Nav.field(dx, dy);
    /* A free chair within a couple of squares first; sitting is most of a break. */
    const chair = this.freeChair(n, dx, dy, taken, f);
    if (chair) return (n.post = chair);
    /* Outward a shell at a time, nearest the destination first. */
    const cx = n.x / TILE - .5, cy = n.y / TILE - .5;
    for (let ring = 0; ring <= 3; ring++) {
      const cells = [];
      for (let oy = -ring; oy <= ring; oy++) for (let ox = -ring; ox <= ring; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring) continue;
        const x = dx + ox, y = dy + oy;
        if (World.isSolid(x, y) || taken.has(x + ',' + y) || this.inDoorway(x, y)) continue;
        /* Connected to the destination, per its field, not merely near it. */
        if (f && Nav.at(f, x, y) < 0) continue;
        cells.push([x, y]);
      }
      if (!cells.length) continue;
      /* Within a shell, the side they are arriving from, so rooms fill from the door. */
      cells.sort((a, b) => (Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
        || (this.hash(n.id + a) % 8) - (this.hash(n.id + b) % 8));
      return (n.post = cells[0]);
    }
    /* Nothing free within three squares: stand where you are. */
    const hx = Math.floor(n.x / TILE), hy = Math.floor(n.y / TILE);
    if (!World.isSolid(hx, hy) && !taken.has(hx + ',' + hy) && !this.inDoorway(hx, hy)) return (n.post = [hx, hy]);
    return (n.post = [dx, dy]);
  },
  /* The nearest unclaimed, reachable chair within three squares. */
  freeChair(n, dx, dy, taken, f) {
    let best = null, bd = 9;
    for (const o of World.objects) {
      if (o.kind !== 'chair' || o.solid) continue;
      const d = Math.max(Math.abs(o.x - dx), Math.abs(o.y - dy));
      if (d > 3 || d >= bd) continue;
      if (taken.has(o.x + ',' + o.y) || World.isSolid(o.x, o.y)) continue;
      if (f && Nav.at(f, o.x, o.y) < 0) continue;
      /* Never a desk chair: that is somebody's desk. */
      if (o.deskId || o.use === 'playerDesk') continue;
      best = [o.x, o.y]; bd = d;
    }
    return best;
  },
  /* How the floor reacts to an event is the EVENTS row's `crowd:`:
       { look: 'wp' }         heads turn to a waypoint for `secs`
       { go: 'wp', haste }    everybody goes there and returns after `secs`
       { evacuate: true }     the fire drill: out to the level one door away with
                              an `assemblyPoint` object on it
     An unknown waypoint is ignored. */
  get REACT() { const o = {}; EVENTS.forEach(e => { if (e.crowd) o[e.id] = e.crowd; }); return o; },

  watchFloor() {
    const ev = G.activeEvent;
    if (ev === this.lastEvent) return;
    this.lastEvent = ev;
    const r = ev && this.REACT[ev.id];
    if (!r) return;
    const until = this.now + r.secs;
    if (r.evacuate) return this.startDrill(until, r.haste || 1);
    for (const n of this.list) {
      if (r.go && WP[r.go]) { n.callOut = { wp: r.go, until, haste: r.haste || 1 }; this.hangUp(n); }
      if (r.look && WP[r.look]) {
        const w = WP[r.look];
        /* Not in unison. Twenty heads turning on the same frame is a chorus
           line, not a room noticing something. */
        n.lookAt = { x: (w[0] + .5) * TILE, y: (w[1] + .5) * TILE };
        n.lookT = r.secs * rnd(.6, 1.35);
      }
    }
  },

  /* ---------------- The drill ----------------
     Leave the building, stand in the car park, come back. Three states:
       'out'  crossing to the way out, aimed at the door itself (a queue is
              right); outside on reaching it.
       'at'   on their own car-park square by the assembly point, handed out in
              roster order.
       'in'   back through the door they left by.
     Nothing names a level or tile: the exit is the link table's row
     (data/levels.js, as Levels.take() uses) and the squares surround wherever
     the assembly point stands. The target must be one door away. Anybody who
     never reaches the door stands down where they are. */

  /* The free square in front of a door (a door is in the wall and cannot be
     stood in): north, south, then either side. */
  doorSide(rec, use) {
    /* The way out is `use: 'exit'`, or any object with `kind: 'exit'` whose use
       does something else (the Driftwood's `barOut`). */
    const list = rec.objects || [];
    const o = list.find(x => x.use === use) || (use === 'exit' ? list.find(x => x.kind === 'exit') : null);
    if (!o) return null;
    const free = (x, y) => x >= 0 && y >= 0 && x < rec.w && y < rec.h
      && !rec.solid[y][x] && rec.zone[y][x];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]])
      if (free(o.x + dx, o.y + dy)) return [o.x + dx, o.y + dy];
    return null;
  },
  /* Squares for a crowd round a point, nearest first in a fixed order, never on
     anything solid. Not Nav, which only knows the loaded level; plain rings
     suit open tarmac. */
  crowdSpots(rec, tx, ty, count) {
    const out = [], seen = new Set();
    const free = (x, y) => {
      if (x < 0 || y < 0 || x >= rec.w || y >= rec.h) return false;
      if (rec.solid[y][x] || !rec.zone[y][x]) return false;
      if (rec.blocked && rec.blocked.has(x + ',' + y)) return false;
      if (rec.carTiles && rec.carTiles.has(x + ',' + y)) return false;
      const here = rec.byTile ? (rec.byTile.get(x + ',' + y) || []) : [];
      return !here.some(o => o.solid);
    };
    for (let ring = 1; out.length < count && ring <= 9; ring++) {
      for (let oy = -ring; oy <= ring && out.length < count; oy++) {
        for (let ox = -ring; ox <= ring && out.length < count; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring) continue;
          const x = tx + ox, y = ty + oy, k = x + ',' + y;
          if (seen.has(k) || !free(x, y)) continue;
          seen.add(k); out.push([x, y]);
        }
      }
    }
    return out;
  },
  /* Where an evacuation goes, from the catalogue: from the hub to the level one
     door away with an assembly point, and back by that level's link home. Null
     (no drill) if anything is missing. */
  drillPlan() {
    const home = Levels.hub();
    const homeRec = Levels.ensure(home);
    if (!homeRec) return null;
    for (const l of ((Levels.def(home) || {}).links || [])) {
      const rec = Levels.ensure(l.to);
      if (!rec) continue;
      const sign = (rec.objects || []).find(o => o.use === 'assemblyPoint');
      if (!sign) continue;
      const back = ((Levels.def(l.to) || {}).links || []).find(b => b.to === home);
      const out = this.doorSide(homeRec, l.via);
      const home2 = back && this.doorSide(rec, back.via);
      if (!out || !home2) continue;
      return { home, homeRec, to: l.to, rec, out, back: home2, sign: [sign.x, sign.y] };
    }
    return null;
  },
  startDrill(until, haste) {
    const plan = this.drillPlan();
    if (!plan) return;
    const crowd = this.all.filter(n => n.level === plan.home);
    if (!crowd.length) return;
    /* Both crowds laid out now, while both levels are built: car-park squares and
       lobby squares to come back to. */
    const spots = this.crowdSpots(plan.rec, plan.sign[0], plan.sign[1], crowd.length);
    const seats = this.crowdSpots(plan.homeRec, plan.out[0], plan.out[1], crowd.length);
    plan.until = until; plan.haste = haste; plan.began = this.now;
    this.drill = plan;
    crowd.forEach((n, i) => {
      n.drill = { phase: 'out', i: i,
        spot: spots[i % spots.length] || plan.sign,
        seat: seats[i % seats.length] || plan.out };
      n.post = null; n.errand = null; n.callOut = null; n.gaveUp = null;
      this.hangUp(n);
    });
  },
  /* Moved by the drill through a door, perhaps onto an unloaded floor; the walk
     in progress is dropped. */
  stepThrough(n, level, tile, face) {
    n.level = level;
    n.x = (tile[0] + .5) * TILE; n.y = (tile[1] + .5) * TILE;
    /* Facing on arrival, when given (0 up, 1 left, 2 down, 3 right). Errands pass
       one; the drill does not. */
    if (face !== undefined) n.dir = face;
    n.post = null; n.next = null; n.walking = false; n.errand = null;
    n.destKey = ''; n.best = 1e9; n.noProg = 0; n.gaveUp = null;
    this.hangUp(n);
  },
  /* Presence again, WITHOUT the reset enter() does: one person has walked
     through a door and everybody else is exactly where they were. */
  refresh() { this.list = this.all.filter(n => n.level === (World.level || Levels.hub())); },
  runDrill() {
    const d = this.drill;
    if (!d) return;
    const over = this.now > d.until;
    /* Whoever you are talking to is not going anywhere until you have finished
       — the same rule the walk keeps, and for the same reason. */
    const talkingTo = (Dialogue.on && Dialogue.npc && Dialogue.npc.id) || null;
    let moved = false;
    const reached = (n, t) => Math.hypot((t[0] + .5) * TILE - n.x, (t[1] + .5) * TILE - n.y) < TILE * 1.1;
    /* `all` rather than `list`: half of them are standing on a level nobody is
       looking at, which is the entire point of a floor that empties. */
    for (const n of this.all) {
      const k = n.drill;
      if (!k) continue;
      /* Whoever you are talking to stays put but keeps their phase, and sets off
         once you have finished. */
      const busy = n.id === talkingTo;
      if (k.phase === 'out') {
        /* Stood down before they even got out of the door. */
        if (over) { n.drill = null; n.callOut = null; continue; }
        if (busy) continue;
        if (n.level !== World.level) {
          /* Off screen they are not walked, but come out of the door one at a time, so
             the car park fills rather than populating at once. */
          if (this.now < d.began + k.i * .8) continue;
          const at = World.level === d.to ? d.back : k.spot;
          this.stepThrough(n, d.to, at); k.phase = 'at'; moved = true; continue;
        }
        n.callOut = { tile: d.out, until: this.now + 2, haste: d.haste };
        if (reached(n, d.out)) { this.stepThrough(n, d.to, k.spot); k.phase = 'at'; moved = true; }
      } else if (k.phase === 'at') {
        if (!busy) n.callOut = { tile: k.spot, until: this.now + 2, haste: 1 };
        /* Going back in has a deadline: after twice the length of the tarmac they are
           through the door wherever they are. */
        if (over) { k.phase = 'in'; k.since = this.now; k.by = this.now + 45; }
      } else {
        if (busy) continue;
        if (n.level !== World.level) {
          /* Likewise back through the lobby one at a time when you can see it. */
          if (this.now < k.since + k.i * .8) continue;
          const at = World.level === d.home ? d.out : k.seat;
          this.stepThrough(n, d.home, at); n.drill = null; n.callOut = null; moved = true; continue;
        }
        n.callOut = { tile: d.back, until: this.now + 2, haste: d.haste };
        if (reached(n, d.back) || this.now > k.by) {
          this.stepThrough(n, d.home, k.seat); n.drill = null; n.callOut = null; moved = true;
        }
      }
    }
    if (moved) this.refresh();
    if (over && !this.all.some(n => n.drill)) this.drill = null;
  },

  /* ---------------- Going home ----------------
     At the end of the day they leave; next morning they come back. The drill's
     primitives do it: doorSide() finds the doors, `callOut` walks somebody to a
     square, and `n.level` decides who is on screen. `away` is a level not in the
     catalogue, so everything asking where they are gets "not here". */
  /* `stays: true` on an NPC keeps them in the building after hours. */
  /* Built once per roster: offDuty() reads it for everybody every frame.
     Still an array for .includes() readers; the roster check picks up editor
     changes. */
  get HOME_STAY() {
    if (this._stayFor !== NPCS || this._stayLen !== NPCS.length) {
      this._stayFor = NPCS; this._stayLen = NPCS.length;
      this._stay = NPCS.filter(n => n.stays).map(n => n.id);
      this._staySet = new Set(this._stay);
    }
    return this._stay;
  },
  stays(n) { this.HOME_STAY; return this._staySet.has(n.id); },
  /* Whether this person is done for the day. A def's `hours: [from, to]` (minutes,
     wrapping midnight) gives its own; otherwise the office's day. HOME_STAY
     overrides. */
  offDuty(n) {
    if (this.stays(n)) return false;
    const h = n.def.hours;
    if (!h) return !Sky.staffed();
    const m = Sky.m();
    return h[0] <= h[1] ? (m < h[0] || m >= h[1]) : (m < h[0] && m >= h[1]);
  },
  /* Whose turn it is to walk out, in real seconds since the tide turned: stable
     per person (same people first and last), leaving spread far wider than
     arriving. Shared by runHome() and runErrands() so both halves agree. */
  leaveDue(n, off) {
    const order = (this.hash(n.id) % 13) * (off ? 3.2 : .3);
    /* The floor turns at one instant and _homeAt is that instant. Anybody on
       their own hours turns on their own, so they keep their own. */
    if (n.def.hours) return (n._offAt === undefined ? this.now : n._offAt) + order;
    return (this._homeAt === undefined ? this.now : this._homeAt) + order;
  },
  runHome() {
    /* An evacuation outranks the end of a shift, and they can overlap: the
       alarm can go at ten to five. Whoever is in a drill is in a drill. */
    if (this.drill) return;
    /* When the tide turned, in real seconds, since walking is real time. */
    const after = !Sky.staffed();
    if (after !== this._wasAfter) {
      this._wasAfter = after; this._homeAt = this.now; this._homeSpots = null;
    }
    if (this._homeAt === undefined) this._homeAt = this.now;
    /* Nothing to do on almost every frame; checked before any lookups. */
    if (!this.all.some(n => this.offDuty(n) !== !!n.away)) return;

    const hub = Levels.hub();
    const rec = Levels.ensure(hub);
    if (!rec) return;
    /* The door, and a square each round it (crowdSpots()), so the lobby drains
       instead of knotting on one door tile. Reaching your square counts as gone.
       Cached per level record. */
    if (this._homeRec !== rec || !this._homeSpots) {
      this._homeRec = rec;
      this._homeDoor = this.doorSide(rec, 'exit');
      this._homeSpots = this._homeDoor
        ? this.crowdSpots(rec, this._homeDoor[0], this._homeDoor[1], this.all.length) : null;
    }
    const door = this._homeDoor;
    if (!door) return;
    const spots = this._homeSpots && this._homeSpots.length ? this._homeSpots : [door];

    const talkingTo = (Dialogue.on && Dialogue.npc && Dialogue.npc.id) || null;
    const reached = (n, t) => Math.hypot((t[0] + .5) * TILE - n.x, (t[1] + .5) * TILE - n.y) < TILE * 1.1;
    /* Whether the player can see this person: their level and the camera. */
    const onScreen = n => n.level === World.level
      && Cam.visible(n.x, n.y);
    let moved = false;
    for (const n of this.all) {
      if (this.stays(n)) continue;
      const off = this.offDuty(n);
      /* An evening outranks going home: somebody with a window open goes out
         (runErrands()), and goes home from there at closing time. */
      if (off && this.errandFor(n)) continue;
      /* Leaving is spread over about forty seconds so it can be watched from the
         car park; arriving is tighter. */
      if (n.def.hours) { if (off !== n._offWas) { n._offWas = off; n._offAt = this.now; } }
      const due = this.leaveDue(n, off);
      if (this.now < due) continue;
      if (off) {
        if (n.away) continue;
        /* Not while you are talking to them; they go when you finish. */
        if (n.id === talkingTo) continue;
        /* Two deadlines. Walks are real seconds and the evening is not, so they give
           up the walk, but only off camera: nobody vanishes in view. Forty seconds is
           the in-view backstop for somebody wedged. */
        const gone = () => { n.level = 'away'; n.away = true; n.callOut = null; n.homeward = 0; this.hangUp(n); moved = true; };
        /* ---- the second half of going home ----
           A def's `home:` is a spot on the street and a way of getting there. Leaving
           is two legs: out through the lobby, then across the street in their own
           direction, gone on arrival. The drill's machinery; no `home:` means the
           front doors and then nothing. */
        if (n.homeward) {
          /* Leg two: to a bus stop, a car or a door, with the same two deadlines. */
          const h = n.def.home;
          const at = h && h.at && this.townTile(h.at, h.part);
          if (!at) { gone(); continue; }
          n.callOut = { tile: at, until: this.now + 2, haste: 1.35 };
          const arrived = reached(n, at);
          /* Waiting for the bus: while watched, they stand at the stop until a bus
             serves it. Off camera the deadlines take them. */
          if (arrived && h.bus && onScreen(n)) {
            if (Cars.stoppedAt(at[0], at[1])) gone();
            continue;
          }
          if (arrived || (this.now > n.homeward + 20 && !onScreen(n)) || this.now > n.homeward + 60) gone();
          continue;
        }
        if (n.level !== hub) {
          /* Someone not on the hub (the basement, a shopkeeper closing) just goes, once
             nobody is looking. */
          if (!onScreen(n) || this.now > due + 40) gone();
          continue;
        }
        const spot = spots[this.hash(n.id) % spots.length] || door;
        n.post = null; n.errand = null;
        /* Faster than they came in. Everybody walks faster at five. */
        n.callOut = { tile: spot, until: this.now + 2, haste: 1.5 };
        if (reached(n, spot) || (this.now > due + 16 && !onScreen(n)) || this.now > due + 40) {
          /* Out of the door: onto the street for leg two, or gone. */
          const h = n.def.home;
          const street = h && h.at && this.streetSpot(n);
          if (street) {
            this.stepThrough(n, Levels.street(), street); n.homeward = this.now; moved = true;
            /* You saw them go, which unlocks where they live in the profile panel. */
            if (World.level === Levels.street()) G.flags.sawThemGo = true;
          } else gone();
        }
      } else if (n.away) {
        /* Back through the lobby one at a time, then the timetable walks them to
           their desks. Somebody whose workplace is elsewhere simply appears behind
           their counter. */
        const home = n.def.level || hub;
        if (home === hub) this.stepThrough(n, hub, door);
        else this.stepThrough(n, home, n.def.desk, n.def.dir);
        n.away = false; n.homeward = 0; moved = true;
      } else if (n.level !== (n.def.level || hub) && !this.onErrand(n) && !this.errandFor(n)) {
        /* On duty and stranded outside (the morning overtook a walk): back to work,
           off camera, with the forty-second in-view backstop. */
        if (!onScreen(n) || this.now > due + 40) {
          n.homeward = 0; n.callOut = null; n.outward = null;
          const back = n.def.level || hub;
          if (back === hub) this.stepThrough(n, hub, door);
          else this.stepThrough(n, back, n.def.desk, n.def.dir);
          moved = true;
        }
      }
    }
    if (moved) this.refresh();
  },

  /* A home is a tile of Bellhaven as drawn, translated to the island by the
     town's offset (Levels.partOf()). */
  townTile(at, part) {
    const p = part && Levels.partOf(part);
    return p ? [at[0] + p.at[0], at[1] + p.at[1]] : at;
  },
  /* Where on the street somebody comes out: a square each before the office's
     doors (crowdSpots()). Null when the street will not build. */
  streetSpot(n) {
    const st = Levels.street(), sd = st && Levels.def(st);
    const rec = st && Levels.ensure(st);
    if (!rec) return null;
    const e = (sd.entries || {})[sd.streetEntry || 'doors'];
    const door = e ? [Math.floor(e[0]), Math.floor(e[1])] : null;
    if (!door) return null;
    if (this._streetRec !== rec) {
      this._streetRec = rec;
      this._streetSpots = this.crowdSpots(rec, door[0], door[1], this.all.length);
    }
    const spots = this._streetSpots && this._streetSpots.length ? this._streetSpots : [door];
    return spots[this.hash(n.id) % spots.length] || door;
  },

  /* ---- out of the building, and back ----
     `out:` on a def (data/npcs.js, see OUT there) sends somebody to a named tile
     on a named level between two times. Shares runHome()'s rules: a drill and
     going home outrank it; nobody leaves mid-conversation; nobody vanishes in
     view. Off camera they are simply there; on camera they walk to the door and
     step through. No walk along the street: only leaving and arriving are seen. */
  /* The windows in somebody's day, always as a list; a def may write one object. */
  NO_WINDOWS: [],
  windows(n) {
    const o = n.def.out;
    if (!o) return this.NO_WINDOWS;
    if (Array.isArray(o)) return o;
    /* Wrapped once per person: errandFor() runs for everybody every frame. */
    return n._windows || (n._windows = [o]);
  },
  errandFor(n) {
    if (!n.def.out) return null;
    const m = Sky.m();
    /* Windows may wrap midnight. First match: overlaps are a table error, and the
       table is checked. */
    for (const o of this.windows(n))
      if (o.from <= o.to ? (m >= o.from && m < o.to) : (m >= o.from || m < o.to)) return o;
    return null;
  },
  /* Whether they are standing in any window's room. */
  onErrand(n) {
    for (const o of this.windows(n)) if (o.level === n.level) return true;
    return false;
  },
  /* A window's own `lines:` replace theirs while they are in it. */
  linesFor(n) {
    const o = this.errandFor(n);
    if (o && o.lines && o.lines.length && n.level === o.level) return o.lines;
    /* Otherwise their mood's lines, when worth mentioning (Mind.think()). */
    return Mind.lines(n) || n.def.lines;
  },
  /* The way out of a non-office room: the square before its door and the
     pavement beyond, found by following the level's link back to the street.
     One-deep cache. */
  _ways: new Map(),
  wayOut(id) {
    if (this._ways.has(id)) return this._ways.get(id);
    let v = null;
    const def = Levels.def(id);
    const st = Levels.street();
    const link = st && def && (def.links || []).find(l => l.to === st);
    if (link) {
      const rec = Levels.ensure(id);
      const tile = rec && this.doorSide(rec, link.via);
      const e = ((Levels.def(st) || {}).entries || {})[link.entry];
      if (tile && e) v = {
        tile, street: [Math.floor(e[0]), Math.floor(e[1])],
        /* A square each at the door, as at the front doors, so a group leaving a room
           does not knot on one tile. Reaching yours counts. Capped at how many the
           table ever puts in this room, so nobody walks away from the door to a far
           corner. */
        spots: this.crowdSpots(rec, tile[0], tile[1], this.roomFor(id))
      };
    }
    this._ways.set(id, v);
    return v;
  },
  /* How many the table puts in one room at once, at least four. */
  roomFor(id) {
    let k = 0;
    for (const n of this.all) for (const o of this.windows(n)) if (o.level === id) k++;
    return Math.max(4, k);
  },
  /* Which of them is this person's. Stable, so the same people are always
     nearest the door. */
  waySpot(way, n) {
    const sp = way.spots && way.spots.length ? way.spots : [way.tile];
    return sp[this.hash(n.id) % sp.length] || way.tile;
  },
  runErrands() {
    if (this.drill) return;
    /* Cheap first: somebody needs moving if a window is open and they are not in
       it, or closed and they still are. `away` people count: an evening can open
       after they have gone home. */
    if (!this.all.some(n => {
      if (!n.def.out) return false;
      /* Anybody already walking out is always work. */
      if (n.outAt !== null && n.outAt !== undefined) return true;
      if (n.leaving || n.outward) return true;
      const want = this.errandFor(n);
      return want ? n.level !== want.level : (!n.away && this.onErrand(n));
    })) return;

    const hub = Levels.hub();
    const rec = Levels.ensure(hub);
    if (!rec) return;
    /* A square each at the doors, for runHome()'s reason. */
    if (this._outRec !== rec) {
      this._outRec = rec;
      this._outDoor = this.doorSide(rec, 'exit');
      this._outSpots = this._outDoor
        ? this.crowdSpots(rec, this._outDoor[0], this._outDoor[1], this.all.length) : null;
    }
    const door = this._outDoor;
    if (!door) return;
    const spots = this._outSpots && this._outSpots.length ? this._outSpots : [door];
    const talkingTo = (Dialogue.on && Dialogue.npc && Dialogue.npc.id) || null;
    const reached = (n, t) => Math.hypot((t[0] + .5) * TILE - n.x, (t[1] + .5) * TILE - n.y) < TILE * 1.4;
    const onScreen = n => n.level === World.level
      && Cam.visible(n.x, n.y);
    let moved = false;
    for (const n of this.all) {
      if (!n.def.out) continue;
      if (n.id === talkingTo) continue;
      /* Setting off is a commitment, as in destTile(): a window that shuts while
         they are in the corridor does not turn them round. The forty-second
         backstop still applies. */
      const open = this.errandFor(n);
      const want = open || (n.outAt === null || n.outAt === undefined ? null : n.outFor);
      const there = !!want && n.level === want.level;
      if (want && !there) {
        /* Gone home and due out: they are simply there, since they are nowhere to be
           walked from. */
        if (n.away) {
          n.away = false; n.homeward = 0; n.outAt = null; n.outFor = null; n.outward = null;
          this.stepThrough(n, want.level, want.tile, want.face); moved = true; continue;
        }
        /* ---- across the town ----
           When the player is on the street, people going out come through the front
           doors and walk up it to their destination's door, with the same deadlines
           as going home. Otherwise they are simply there. If the window shuts
           mid-walk, runHome()'s second leg takes over. */
        if (n.outward) {
          if (!open) {
            n.outward = null; n.outAt = null; n.outFor = null; n.callOut = null;
            /* Off duty: go home from here. On duty: back to work. */
            if (this.offDuty(n)) n.homeward = this.now;
            else {
              const back = n.def.level || hub;
              if (back === hub) this.stepThrough(n, hub, door);
              else this.stepThrough(n, back, n.def.desk, n.def.dir);
            }
            moved = true;
            continue;
          }
          n.callOut = { tile: n.outward, until: this.now + 2, haste: 1.35 };
          /* A short lead: gone a few strides after leaving the frame, since the evening
             clock runs fast and the rest of the walk is unwatched. */
          if (reached(n, n.outward) || (this.now > n.outAt + 8 && !onScreen(n))
              || this.now > n.outAt + 30) {
            n.outward = null; n.outAt = null; n.outFor = null; n.callOut = null;
            this.stepThrough(n, want.level, want.tile, want.face); moved = true;
          }
          continue;
        }
        /* On the way out: off camera they are simply there; in view they walk to a
           door. Any room has its own door (wayOut()). */
        /* Crossing town is checked before the off-camera shortcut, since from the
           car park the office is never on camera. In turn, by leaveDue(). */
        const across = open && n.level === hub && World.level === Levels.street()
          && this.wayOut(want.level);
        if (across) {
          /* Wait for your turn rather than falling through to the instant shortcut. */
          if (this.now < this.leaveDue(n, this.offDuty(n))) continue;
          const street = this.streetSpot(n);
          if (street) {
            this.stepThrough(n, Levels.street(), street);
            n.outward = across.street; n.outAt = this.now; n.outFor = want; moved = true;
            /* Out of those doors in front of you is how you find out where
               somebody goes, whether where they go is home or the Arms. */
            G.flags.sawThemGo = true;
            continue;
          }
        }
        if (!onScreen(n)) { n.outAt = null; n.outFor = null; this.stepThrough(n, want.level, want.tile, want.face); moved = true; continue; }
        const way = n.level === hub ? null : this.wayOut(n.level);
        const leave = n.level === hub
          ? (spots[this.hash(n.id) % spots.length] || door) : (way && this.waySpot(way, n));
        if (!leave) { n.outAt = null; n.outFor = null; this.stepThrough(n, want.level, want.tile, want.face); moved = true; continue; }
        if (n.outAt === undefined || n.outAt === null) n.outAt = this.now;
        n.outFor = want;
        n.post = null; n.errand = null;
        n.callOut = { tile: leave, until: this.now + 2, haste: 1.2 };
        /* The in-view backstop for somebody wedged. The off-camera case is caught
           above. */
        if (reached(n, leave) || this.now > n.outAt + 40) {
          n.callOut = null;
          n.outAt = null; n.outFor = null;
          /* If the window has closed by the time they reach the door, they do not go:
             arriving to turn round is worse than not setting off. Off camera none of
             this applies. */
          if (open) { this.stepThrough(n, want.level, want.tile, want.face); moved = true; }
        }
      } else if (!want && this.onErrand(n)) {
        /* ---- it is over ----
           Two endings, one walk to the door:
           - Back to work: through the lobby, and the timetable walks them to their
             desk; a shopkeeper simply reappears behind their own counter.
           - Closing time: off duty, they go home from here, onto the pavement where
             runHome()'s second leg takes them.
           In view, either way, they walk out. */
        const off = this.offDuty(n);
        const exit = onScreen(n) ? this.wayOut(n.level) : null;
        if (exit) {
          if (!n.leaving) n.leaving = this.now;
          n.outAt = null; n.outFor = null; n.post = null; n.errand = null;
          /* Faster on the way home than on the way back to work, which is the
             one thing everybody in this game agrees about. */
          const spot = this.waySpot(exit, n);
          n.callOut = { tile: spot, until: this.now + 2, haste: off ? 1.35 : 1 };
          /* The backstop only, and no off-camera deadline beside it: going off
             camera is caught by the line above and takes them immediately. */
          if (!reached(n, spot) && this.now < n.leaving + 40) continue;
          n.leaving = 0; n.callOut = null;
          if (off) {
            this.stepThrough(n, Levels.street(), exit.street);
            n.homeward = this.now; moved = true;
            /* You saw them leave: the same discovery as the car park at five. */
            G.flags.sawThemGo = true;
            continue;
          }
        }
        n.outAt = null; n.outFor = null; n.leaving = 0;
        if (off) {
          n.callOut = null;
          n.level = 'away'; n.away = true; n.homeward = 0; this.hangUp(n); moved = true;
          continue;
        }
        const back = n.def.level || hub;
        if (back === hub) this.stepThrough(n, hub, door);
        else this.stepThrough(n, back, n.def.desk, n.def.dir);
        moved = true;
      } else if (!want) { n.outAt = null; n.outFor = null; n.leaving = 0; n.outward = null; }
    }
    if (moved) this.refresh();
  },

  /* Hand the routes the people, three times a second. A colleague standing is a
     square to go round; you standing still are a costly square, so people see a
     blocked doorway before setting off. */
  dynamics() {
    if (this.now < this.dynAt) return;
    const dt = this.now - this.dynAt + .34;
    this.dynAt = this.now + .34;
    const slow = [], block = [];
    for (const n of this.list) if (!n.walking) slow.push(Math.floor(n.x / TILE) + ',' + Math.floor(n.y / TILE));
    if (G.state === 'play') {
      this.stillFor = P.moving ? 0 : this.stillFor + dt;
      const k = Math.floor(P.x / TILE) + ',' + Math.floor(P.y / TILE);
      /* Stopped, you are worth a long detour; walking, a colleague's price, so
         people approaching do not walk into you. */
      if (this.stillFor > .35) block.push(k); else slow.push(k);
    } else this.stillFor = 0;
    Nav.setDynamic(block.join('|') + '#' + slow.join('|'), block, slow);
  },
  /* Whether the manager is standing over this person where it matters (desks
     and the main floor, not the break room). */
  lookBusy(n) {
    const b = this.boss;
    if (!b || b === n || Math.hypot(b.x - n.x, b.y - n.y) >= TILE * 3.4) return false;
    /* `work: true` on a ZONES row is the open floor where it matters. */
    return n.dest === 'desk' || !!(ZONES[World.zoneAt(Math.floor(n.x / TILE), Math.floor(n.y / TILE))] || {}).work;
  },
  update(dt) {
    this.now += dt;
    Nav.tick();
    /* Which way you are going, so somebody can tell being walked into from
       being walked past. */
    this.pvx = P.x - (this.pxWas === undefined ? P.x : this.pxWas);
    this.pvy = P.y - (this.pyWas === undefined ? P.y : this.pyWas);
    this.pxWas = P.x; this.pyWas = P.y;
    this.watchFloor();
    /* Before the walk, since the drill moves people between levels; home time
       after it, since it stands down for one. */
    this.runDrill();
    this.runHome();
    /* After home time, which outranks it: somebody who has gone home has not
       nipped out to the shops, whatever the table says. */
    this.runErrands();
    /* After both, which outrank it. */
    this.runCommutes();
    this.dynamics();
    /* After everything with a claim on where somebody is, and before the walk
       that reads what the mind decided. */
    this.grid();
    Mind.update(dt);
    /* Tile keys of everybody standing still, rebuilt each frame for the walk. */
    this.busyTiles.clear(); this.stillTiles.clear();
    for (const n of this.list) if (!n.walking) {
      const k = Math.floor(n.x / TILE) + ',' + Math.floor(n.y / TILE);
      this.busyTiles.add(k); this.stillTiles.set(k, n);
    }
    if (G.state === 'play') {
      const k = Math.floor(P.x / TILE) + ',' + Math.floor(P.y / TILE);
      this.busyTiles.add(k);
      /* You only once stopped. */
      if (!P.moving) this.stillTiles.set(k, P);
    }
    /* The one colleague everybody looks busy for: `boss: true` in NPCS. */
    this.boss = this.list.find(x => x.def && x.def.boss) || null;
    /* Whoever you are talking to stands still until you finish; everybody else
       keeps moving. */
    const talkingTo = (Dialogue.on && Dialogue.npc && Dialogue.npc.id) || null;
    const playing = G.state === 'play';
    this.list.forEach(n => {
      n.bob += dt * 3.2;
      if (n.sayT > 0) n.sayT -= dt;
      if (n.lookT > 0) n.lookT -= dt;
      if (n.chatCool > 0) n.chatCool -= dt;
      /* Edging past you lasts until they are past, not on a timer that would expire
         as soon as they moved. */
      if (n.squeeze > 0) {
        if (G.state === 'play' && Math.hypot(P.x - n.x, P.y - n.y) < TILE * 1.3) n.squeeze = 1.2;
        else n.squeeze -= dt;
      }

      if (talkingTo && n.id === talkingTo) {
        /* Being spoken to: stop, break off any other chat, and face you. */
        n.walking = false; this.hangUp(n);
        n.dir = this.face(n, P.x - n.x, P.y - n.y);
        return;
      }
      if (n.stunTimer > 0) { n.stunTimer -= dt; n.walking = false; return; }

      const [dx, dy] = this.destTile(n);
      const key = n.dest + ':' + dx + ',' + dy;
      /* The timetable moved them on: drop the claimed square and stop talking. */
      if (key !== n.destKey) { n.destKey = key; n.post = null; this.hangUp(n); this.repath(n); }

      /* Waited long enough for the door: look again. */
      if (n.retry && this.now > n.retry) { n.retry = 0; n.post = null; this.repath(n); }
      const [tx, ty] = this.post(n, dx, dy);
      const cx = n.x / TILE - .5, cy = n.y / TILE - .5;
      /* Arriving is looser than leaving, so a nudge does not restart the walk; and
         being in the square with no further progress to its centre counts too
         (a ringed square holds people off its middle). */
      const near = Math.hypot(tx - cx, ty - cy);
      const onPost = Math.floor(n.x / TILE) === tx && Math.floor(n.y / TILE) === ty;
      /* Parked is a decision: kept until the square changes or they are shoved most
         of a square off it. */
      if (n.parked && (near > 1.05 || (!onPost && near > .8))) n.parked = false;
      const there = n.parked || near <= (n.walking ? .34 : .62) || (onPost && n.noProg > 1.5);
      if (!there) this.walk(n, dt, tx, ty);
      else {
        if (n.walking) this.repath(n);
        n.walking = false; n.parked = true; n.waitDoor = 0;
        /* Clear `waitingFor` on arrival, or makeWay and holdOn keep reading a stale
           queue. */
        n.waitingFor = null;
        /* Arrived: the errand's dwell clock starts. */
        if (n.errand && !n.errand.arrived) n.errand.arrived = this.now;
        this.makeWay(n, playing);
        this.nestle(n, dt, tx, ty);
        this.settle(n, dt, dx, dy, playing);
      }

      this.chatter(n, dt, playing, talkingTo);

      /* The one-liners, not while chatting, and depending where they stand
         (linesFor()). */
      n.nextSay -= dt;
      const said = this.linesFor(n);
      if (n.nextSay <= 0 && said) {
        n.nextSay = rnd(14, 40);
        if (!n.chat && Cam.visible(n.x, n.y) && chance(.6)) { n.say = pick(said); n.sayT = 4.2; }
      }
    });
  },
  /* One step of the walk. Aim at the middle of the next tile on the way, lean
     away from anybody too close, and take what is left. */
  walk(n, dt, tx, ty) {
    this.hangUp(n);
    n.walking = true;
    /* A route not built yet this frame waits its turn; progress is not charged. */
    if (!Nav.ready(tx, ty)) return;
    const fx = Math.floor(n.x / TILE), fy = Math.floor(n.y / TILE);
    /* Progress in steps left to walk (from the field), not frames moved (a
       sideways shuffle moves) nor straight-line distance (routes often lead away
       first). */
    const far = Nav.steps(fx, fy, tx, ty);
    /* No way there right now (somebody in the only door): wait. Unless the field
       was capped short of here (Nav.CAP): then walk straight at it. */
    if (far === null && Nav.mask && !Nav.partial(tx, ty)) return this.waitOut(n);
    const d = far === null ? Math.hypot(tx - (n.x / TILE - .5), ty - (n.y / TILE - .5)) : far;
    if (d < n.best - .1) { n.best = d; n.noProg = 0; } else n.noProg += dt;
    /* The next tile is decided once per tile entered, then held, so moving people
       do not swing the walker about. It only picks among closer tiles. */
    const from = fx + ',' + fy;
    if (n.nextFrom !== from) {
      n.nextFrom = from;
      /* Both local terms are under a step, so they never argue with the routes
         (which already price standing people): a nudge round somebody in the next
         square, and a per-person dislike of certain squares so a crowd fans out
         across a corridor instead of walking in single file. */
      n.next = Nav.next(fx, fy, tx, ty, (x, y) =>
        (this.busyTiles.has(x + ',' + y) ? 2.5 : 0) + (this.hash(n.id + ':' + x + ',' + y) % 64) / 100);
    }
    const step = n.next;
    /* Waiting for somebody to come through a door: standing, held for the whole
       wait so they do not flicker. */
    if (n.waitDoor > 0) {
      n.waitDoor -= dt; n.walking = false;
      /* Waiting one's turn is not failing to progress. */
      n.noProg = Math.max(0, n.noProg - dt);
      return;
    }
    /* Somebody stands in the next square and the route still goes through them:
       there is no way round, so wait. It propagates, and a queue forms down the
       corridor. holdOn() decides how long. */
    const who = step && this.stillTiles.get(step[0] + ',' + step[1]);
    /* Queueing is not the walk failing. */
    if (who) n.noProg = Math.max(0, n.noProg - dt);
    /* Twenty seconds queueing drops the errand. */
    if (n.queued > 20) {
      n.queued = 0; n.errand = null; n.post = null; n.holdWant = null;
      this.repath(n); n.walking = false;
      return;
    }
    /* Waiting for you long enough: edge past. Set here and refreshed while you
       stay, since the waiting branch is skipped once the wait is spent. */
    if (who === P && n.queued > 2) n.squeeze = 1.2;
    /* You in a doorway cannot wait: everybody on both sides is behind you. makeWay
       moves colleagues first; failing that, squeeze out sideways, a beat sooner. */
    if (who && who !== P && n.queued > 1.5 && this.inDoorway(fx, fy)) n.squeeze = 1.2;
    /* Head-on at a door: somebody is in it and you are on the square they are
       coming out onto. Nobody's destination is a doorway, so they are leaving;
       step aside and retry in a few seconds. The second half covers them having
       stopped in the doorway, after a moment's grace. Never from inside a doorway
       yourself. */
    if (step && this.inDoorway(step[0], step[1]) && !this.inDoorway(fx, fy)) {
      const o = this.list.find(o => o !== n && Math.floor(o.x / TILE) === step[0]
        && Math.floor(o.y / TILE) === step[1]);
      if (o && ((o.next && o.next[0] === fx && o.next[1] === fy) || (o === who && n.queued > .8))) {
        n.queued = 0;
        return this.waitOut(n, true);
      }
    }
    if (who && this.holdOn(n, who)) {
      /* Counted every frame, including the hold below. */
      n.queued += dt; n.walking = false;
      n.waitingFor = who === P ? 'player' : who.id;
      n.dir = this.face(n, (step[0] + .5) * TILE - n.x, (step[1] + .5) * TILE - n.y);
      /* If it is you in the way, they look at you. It is the only way to tell
         from the screen that you are the reason nothing is happening. */
      if (who === P) { n.lookAt = P; n.lookT = Math.max(n.lookT, 1.2); }
      /* Hold their own square while waiting, so a queue is spaced a square apart. */
      this.nestle(n, dt, fx, fy);
      return;
    }
    n.waitingFor = null;
    /* The door is clear but the room behind is packed: somebody at the front of a
       queue into a doorway may be unable to step without closing a gap, which
       canGo refuses. After a third of a second stuck with a doorway as the next
       square, squeeze through. Narrow on purpose: handed to everybody it would
       turn collision off for the crowd. */
    if (step && n.stuck > .35 && this.inDoorway(step[0], step[1])
      && this.doorClear(n, step[0], step[1])) n.squeeze = Math.max(n.squeeze, 1.2);
    if (step && this.inDoorway(step[0], step[1]) && !this.doorClear(n, step[0], step[1])) {
      n.walking = false; n.waitDoor = .2;
      n.noProg = Math.max(0, n.noProg - dt);
      n.dir = this.face(n, (step[0] + .5) * TILE - n.x, (step[1] + .5) * TILE - n.y);
      return;
    }
    /* No next tile: either the last stretch across the destination tile, or a
       destination the sweep never reached. Walk straight at it either way. */
    const ax = step ? (step[0] + .5) * TILE : (tx + .5) * TILE;
    const ay = step ? (step[1] + .5) * TILE : (ty + .5) * TILE;
    let vx = ax - n.x, vy = ay - n.y;
    const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
    const gx = vx, gy = vy;
    const [sx, sy] = this.separate(n);
    vx += sx * .8; vy += sy * .8;
    if (n.evade > 0) { n.evade -= dt; vx += n.evadeX * .8; vy += n.evadeY * .8; }
    /* Give way, never backwards: separation that would reverse the walk is folded
       towards the goal. */
    if (vx * gx + vy * gy < .2) { vx = vx * .35 + gx * .9; vy = vy * .35 + gy * .9; }
    const l2 = Math.hypot(vx, vy) || 1; vx /= l2; vy /= l2;
    /* Turn towards the heading over about a fifth of a second, to smooth jitter. */
    const turn = 1 - Math.pow(.004, dt);
    n.hx += (vx - n.hx) * turn; n.hy += (vy - n.hy) * turn;
    const hl = Math.hypot(n.hx, n.hy) || 1;
    vx = n.hx / hl; vy = n.hy / hl;

    /* Ease into the last square and slow behind someone standing; not both at
       once, and only close to the target, or crowds crawl. */
    /* And how they are feeling: somebody exhausted drags their feet, and
       somebody inspired has a spring in them. See Mind.pace(). */
    let pace = n.speed * (n.callOut ? n.callOut.haste : 1) * Mind.pace(n);
    const eu = Math.hypot(tx - (n.x / TILE - .5), ty - (n.y / TILE - .5));
    if (eu < .9) pace *= clamp(.5 + eu * .55, .5, 1);
    else if (step && this.busyTiles.has(step[0] + ',' + step[1])) pace *= .72;
    const sp = pace * dt;
    const mx = vx * sp, my = vy * sp;
    const was = { x: n.x, y: n.y };
    if (this.canGo(n, mx, my)) { n.x += mx; n.y += my; }
    else {
      /* Slide along the dominant axis first, so a partition squeeze keeps going
         forward. */
      const order = Math.abs(mx) >= Math.abs(my) ? [[mx, 0], [0, my]] : [[0, my], [mx, 0]];
      for (const [ox, oy] of order) if ((ox || oy) && this.canGo(n, ox, oy)) { n.x += ox; n.y += oy; break; }
    }
    const wx = n.x - was.x, wy = n.y - was.y;
    if (wx || wy) {
      n.stuck = 0;
      /* Not while edging past somebody: the whole point is that it takes a few
         steps and they are not starting the wait again for each one. */
      if (!(n.squeeze > 0)) n.queued = 0;
      n.step += Math.hypot(wx, wy) / TILE * 2.6;
      /* Facing from the held heading, not the last sub-pixel step. */
      n.dir = this.face(n, n.hx, n.hy);
    } else {
      n.stuck += dt;
      /* Blocked by a person (walls are routed round): step to your own right for
         half a second. Everybody keeping right passes without the doorway dance. */
      if (n.evade <= 0 && n.stuck > .45) {
        const rx = -vy, ry = vx;
        const ok = this.canGo(n, rx * TILE * .3, ry * TILE * .3);
        n.evadeX = ok ? rx : -rx; n.evadeY = ok ? ry : -ry; n.evade = .6;
      }
      /* Not moving at all is not progress, whatever the field says: a crowd
         jostling moves the step count enough to keep resetting noProg. After three
         seconds stuck, noProg runs at twice the rate so the walk can fail. */
      if (n.stuck > 3) n.noProg += dt * 2;
    }
    /* And whether or not this frame moved them, has the walk as a whole given
       up on itself. */
    if (n.noProg > 2.5) this.giveUp(n, tx, ty, d);
  },
  /* A walk that has stopped getting anywhere. Near enough: claim the square
     they are on. Otherwise: pick another square, avoiding the one abandoned.
     Out of sight and still nothing: the teleport, rarely needed. */
  giveUp(n, tx, ty, d) {
    /* Near enough is being in the destination's room, not a radius. */
    const hx = Math.floor(n.x / TILE), hy = Math.floor(n.y / TILE);
    /* Except in a drill: they keep going; the drill's deadline is the backstop. */
    if (!n.drill && (d <= 3 || World.zoneAt(hx, hy) === World.zoneAt(tx, ty))) {   /* d is steps left */
      const spot = this.freeSpotNear(n);
      if (spot) { n.post = spot; this.repath(n); return; }
    }
    if (n.noProg > 6) {
      n.gaveUp = n.post ? n.post.join(',') : null;
      n.post = null; this.repath(n);
      return;
    }
    if (n.noProg > 14 && !Cam.visible(n.x, n.y)) {
      n.x = (tx + .5) * TILE; n.y = (ty + .5) * TILE; this.repath(n);
    }
  },
  /* Somebody is waiting on your square: take another. And somebody you walk
     into steps aside. They keep the new square. */
  /* Sitting down, as the renderer means it: stopped on a chair. */
  seated(n) {
    return !n.walking && !!Sprites.seatedAt(Math.floor(n.x / TILE), Math.floor(n.y / TILE));
  },
  makeWay(n, playing) {
    /* Nobody seated stands up for you; a chair is walked round. */
    if (this.seated(n)) return;
    /* And they step back once whoever it was has gone past, or they drift across
       the room one polite step at a time. */
    if (n.wayBack && this.now > n.wayFor) {
      const [bx, by] = n.wayBack, k = bx + ',' + by;
      const free = !this.stillTiles.has(k)
        && !this.list.some(o => o !== n && o.post && o.post[0] === bx && o.post[1] === by);
      n.post = free ? n.wayBack : n.post;
      n.wayBack = null;
      if (free) { this.repath(n); return; }
    }
    if (this.now < n.wayFor) return;
    let asked = this.list.some(o => o.waitingFor === n.id);
    /* For you, only when walking into them. */
    if (!asked && playing && P.moving) {
      const dx = n.x - P.x, dy = n.y - P.y, d = Math.hypot(dx, dy);
      if (d < TILE * .8 && (this.pvx * dx + this.pvy * dy) > 0) asked = true;
    }
    if (!asked) return;
    const spot = this.freeSpotNear(n, true);
    if (spot) {
      if (!n.wayBack) n.wayBack = n.post;
      n.post = spot; this.repath(n);
      n.wayFor = this.now + rnd(2.5, 4.5);
    }
  },
  /* How long to wait for whoever is in the next square. Every wait is bounded,
     since no pairwise rule can see a ring of people waiting for each other. */
  holdOn(n, who) {
    if (who === P) {
      /* You: one person edges past after a couple of seconds; the head of a queue
         holds the line (the twenty-second errand drop drains it). */
      return this.list.some(o => o !== n && o.waitingFor === n.id) || n.queued < 2.5;
    }
    /* Inside a doorway yourself, never long: both queues are behind you. */
    if (this.inDoorway(Math.floor(n.x / TILE), Math.floor(n.y / TILE))) return n.queued < 1.5;
    /* A pair waiting for each other: short wait. */
    if (who.waitingFor === n.id) return n.queued < 2.5;
    /* Long wait only for a queue with a front; otherwise short. */
    return n.queued < (who.waitingFor && this.hasFront(who) ? 25 : 2.5);
  },
  /* Whether this queue has a front: walk the waiting-for chain to somebody
     waiting for nobody. A cycle anywhere in the chain, or a chain longer than
     the floor, is no front. Walked each time: a handful of hops. */
  hasFront(who) {
    const seen = new Set();
    for (let c = who, i = 0; i < 24; i++) {
      if (!c || c === P) return false;
      if (seen.has(c)) return false;                     /* round in a circle */
      seen.add(c);
      if (!c.waitingFor) return true;                    /* somebody is about to move */
      if (c.waitingFor === 'player') return true;        /* and you are a person, who moves */
      c = this.list.find(o => o.id === c.waitingFor);
    }
    return false;
  },
  /* Nowhere to go yet: stand somewhere out of the way (not a doorway, not on
     anybody) and retry in a few seconds. */
  waitOut(n, clear) {
    n.walking = false;
    if (!n.parked) {
      /* `clear` means the square they are on is the problem — they are in the
         way of a door — so anywhere but here. */
      const spot = this.freeSpotNear(n, clear);
      if (spot) { n.post = spot; n.parked = true; this.repath(n); n.parked = true; }
    }
    n.retry = this.now + rnd(1.5, 4);
  },
  /* Forget the walk in progress; called when the target changes. */
  repath(n) {
    n.best = 1e9; n.noProg = 0; n.stuck = 0; n.evade = 0; n.next = null; n.nextFrom = '';
    n.parked = false; n.waitDoor = 0;
  },
  /* The nearest square to somebody that they can stand on and nobody has
     claimed — theirs first, then the ring around it. */
  freeSpotNear(n, notHere) {
    const hx = Math.floor(n.x / TILE), hy = Math.floor(n.y / TILE);
    const ring = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [ox, oy] of ring) {
      if (notHere && !ox && !oy) continue;
      const x = hx + ox, y = hy + oy;
      if (World.isSolid(x, y) || this.inDoorway(x, y)) continue;
      if (this.list.some(o => o !== n && o.post && o.post[0] === x && o.post[1] === y)) continue;
      return [x, y];
    }
    return null;
  },
  /* On their square but off its centre: ease into the middle, a few pixels a
     second, into free space only. */
  nestle(n, dt, tx, ty) {
    const ax = (tx + .5) * TILE - n.x, ay = (ty + .5) * TILE - n.y;
    const d = Math.hypot(ax, ay);
    if (d < 1.2) return;
    const sp = Math.min(d, TILE * .5 * dt);
    const mx = ax / d * sp, my = ay / d * sp;
    if (this.canGo(n, mx, my)) { n.x += mx; n.y += my; }
  },
  /* Lean away from anybody too close, so people walking together drift apart. */
  separate(n) {
    let sx = 0, sy = 0;
    const R = TILE * .7;
    for (const o of this.near(n.x, n.y, R)) {
      if (o === n) continue;
      const dx = n.x - o.x, dy = n.y - o.y, d = Math.hypot(dx, dy);
      if (d > R || d < .001) continue;
      const w = (R - d) / R;
      sx += dx / d * w; sy += dy / d * w;
    }
    /* Not while edging past you; the lean would undo the squeeze. */
    if (G.state === 'play' && !(n.squeeze > 0)) {
      const dx = n.x - P.x, dy = n.y - P.y, d = Math.hypot(dx, dy);
      /* You get more room than a colleague. */
      if (d < R * 1.15 && d > .001) { const w = (R * 1.15 - d) / R * 1.5; sx += dx / d * w; sy += dy / d * w; }
    }
    return [sx, sy];
  },
  /* Arrived. What somebody does while they are not going anywhere, which is
     most of the day and was, until now, absolutely nothing. */
  settle(n, dt, dx, dy, playing) {
    /* Notice you. Everybody looks up when you are right beside them; how far
       away that starts is the one trait you can actually see. */
    if (playing && !n.chat) {
      const d = Math.hypot(P.x - n.x, P.y - n.y);
      /* How far away they notice you and how long they watch, by relationship: the
         one place a relationship shows without a panel. */
      const rel = Rel.get(n.id);
      if (d < TILE * (n.t.notice + clamp(rel, -3, 6) * .18)) {
        n.lookAt = P; n.lookT = Math.max(n.lookT, .9 + Math.max(0, rel) * .12);
      }
      /* A phone that has been ringing for a while. Everybody looks at it. This
         is a call centre, so nobody answers it. */
      else if (n.lookT <= 0 && Phones.ringing.length && chance(dt * .3)) {
        const ph = Phones.ringing.find(q => q.lvl === n.level
          && Math.hypot((q.x + .5) * TILE - n.x, (q.y + .5) * TILE - n.y) < TILE * 5);
        if (ph) { n.lookAt = { x: (ph.x + .5) * TILE, y: (ph.y + .5) * TILE }; n.lookT = rnd(1, 2.4); }
      }
    }

    /* Facing, by what holds attention: their partner, what they looked up at,
       their destination, else the room. */
    const partner = n.chat && this.get(n.chat.with);
    if (partner) n.dir = this.face(n, partner.x - n.x, partner.y - n.y);
    /* The manager is standing over them. Whatever they were looking at, they
       are now looking at their screen. */
    else if (n.dest === 'desk' && this.lookBusy(n)) n.dir = 0;
    else if (n.lookT > 0 && n.lookAt) n.dir = this.face(n, n.lookAt.x - n.x, n.lookAt.y - n.y);
    /* At a desk they face the monitor (0), unless `dir:` says otherwise (a
       counter faces the room). */
    else if (n.dest === 'desk') n.dir = n.def.dir === undefined ? 0 : n.def.dir;
    else if (n.post && (n.post[0] !== dx || n.post[1] !== dy)) n.dir = this.face(n, dx - n.post[0], dy - n.post[1]);

    /* The restless shift a square now and then; the still stay still. A step to a
       visible square, not a new decision. */
    n.idleT -= dt;
    if (n.idleT <= 0) {
      /* Every couple of minutes for the restless. */
      n.idleT = rnd(14, 40);
      if (!n.chat && n.dest !== 'desk' && !this.seated(n) && chance(n.t.restless * .35)) {
        const spot = this.shuffleSpot(n, dx, dy);
        if (spot) { n.post = spot; this.repath(n); }
      }
    }
  },
  /* One square over: free, unclaimed, adjacent, still near what they came for. */
  shuffleSpot(n, dx, dy) {
    const hx = Math.floor(n.x / TILE), hy = Math.floor(n.y / TILE);
    const f = Nav.field(dx, dy);
    const out = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const x = hx + ox, y = hy + oy;
      if (World.isSolid(x, y) || this.inDoorway(x, y)) continue;
      /* How far from where they were sent: three squares for a waypoint, one for an
         errand's exact tile. */
      if (Math.max(Math.abs(x - dx), Math.abs(y - dy)) > (n.dest === 'out' ? 1 : 3)) continue;
      if (f && Nav.at(f, x, y) < 0) continue;
      if (this.list.some(o => o !== n && o.post && o.post[0] === x && o.post[1] === y)) continue;
      out.push([x, y]);
    }
    return out.length ? pick(out) : null;
  },
  /* Two people near each other long enough start talking, in their own lines.
     The host owns the timing and passes turns; only one is mid-sentence. */
  chatter(n, dt, playing, talkingTo) {
    if (n.chat) {
      const o = this.get(n.chat.with);
      /* It ends when the other one leaves, is spoken to, or is no longer there
         at all. Both halves are torn down together — see hangUp. */
      if (!o || !o.chat || o.chat.with !== n.id || o.walking || n.walking
        || o.stunTimer > 0 || o.id === talkingTo) return this.hangUp(n);
      /* And it stops dead when the manager comes past. */
      if (this.lookBusy(n)) return this.hangUp(n);
      if (!n.chat.host) return;
      n.chat.t -= dt;
      if (n.chat.t > 0) return;
      if (n.chat.turns <= 0) return this.hangUp(n);
      /* One voice at a time nearby: wait a second if someone else is mid-sentence
         (not the partner). */
      if (this.near(n.x, n.y, TILE * 3.4).some(x => x !== n && x !== o && x.sayT > 1.2
        && Math.hypot(x.x - n.x, x.y - n.y) < TILE * 3.4)) { n.chat.t = rnd(.8, 1.6); return; }
      n.chat.turns--;
      n.chat.t = rnd(3.2, 5);
      const who = n.chat.lead ? n : o;
      n.chat.lead = !n.chat.lead;
      /* What they have between them is what the room has, so two people who
         are both in the pub talk about the pub. See linesFor(). */
      const said = this.linesFor(who);
      if (said && said.length) {
        who.say = pick(said); who.sayT = 3.4;
        /* They have just said something. Not twice. */
        who.nextSay = Math.max(who.nextSay, rnd(18, 45));
        Mind.chatLine(who.id);
      }
      return;
    }
    if (!playing || n.walking || n.chatCool > 0 || n.stunTimer > 0) return;
    if (this.lookBusy(n)) return;
    const mine = this.linesFor(n);
    if (!mine || !mine.length) return;
    /* Lonelier people start more conversations. See engine/mind.js. */
    const lonely = G.minds && G.minds[n.id]
      ? 1 + (100 - G.minds[n.id].needs.social) / 100 : 1;
    if (!chance(dt * n.t.social * .55 * lonely)) return;
    /* With the one they like best in reach, never a rival. */
    let o = null, pull = -Infinity;
    for (const x of this.near(n.x, n.y, TILE * 2.6)) {
      if (x === n || x.walking || x.chat || x.chatCool > 0 || x.stunTimer > 0 || x.id === talkingTo) continue;
      if (Math.hypot(x.x - n.x, x.y - n.y) >= TILE * 2.6) continue;
      const lines = this.linesFor(x);
      if (!lines || !lines.length) continue;
      if (!Mind.canChat(n.id, x.id)) continue;
      const v = Mind.chatPull(n.id, x.id);
      if (v > pull) { pull = v; o = x; }
    }
    if (!o) return;
    n.chat = { with: o.id, host: true, t: .5, turns: ri(2, 5), lead: true };
    o.chat = { with: n.id, host: false, t: 0, turns: 0, lead: false };
    Mind.chatStart(n.id, o.id);
    /* Cooldowns long and varied per pair. */
    n.chatCool = rnd(45, 130); o.chatCool = rnd(45, 130);
  },
  hangUp(n) {
    if (!n.chat) return;
    const o = this.get(n.chat.with);
    n.chat = null;
    if (o && o.chat && o.chat.with === n.id) o.chat = null;
  },
  canGo(n, dx, dy) {
    const nx = n.x + dx, ny = n.y + dy, r = TILE * .27;
    const pts = [[nx - r, ny - r], [nx + r, ny - r], [nx - r, ny + r], [nx + r, ny + r]];
    if (pts.some(([px, py]) => World.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)))) return false;
    /* Colleagues pass through neither you nor each other. The test is "would this
       step keep us at least as far apart", so an existing overlap can separate. */
    if (G.state === 'play') {
      /* You get more room, unless they waited for you and are squeezing past. */
      const d = Math.hypot(nx - P.x, ny - P.y);
      /* Squeezing through a doorway means getting closer before further, so the
         squeeze room is a shoulder's width. */
      const room = n.squeeze > 0 ? TILE * .18 : TILE * .55;
      if (d < room && d <= Math.hypot(n.x - P.x, n.y - P.y)) return false;
    }
    for (const o of this.near(nx, ny, TILE * .5)) {
      if (o === n) continue;
      const d = Math.hypot(nx - o.x, ny - o.y);
      /* Tighter than half a tile, so two people a tile apart can be passed between;
         tighter still when edging out of a doorway. */
      if (d < (n.squeeze > 0 ? TILE * .24 : TILE * .42) && d <= Math.hypot(n.x - o.x, n.y - o.y)) return false;
    }
    return true;
  },
  /* Somewhere to stand near a point, off the player's tile: for people placed
     from outside the walk (the manager appearing). */
  standNear(wx, wy) {
    const cx = Math.floor(wx / TILE), cy = Math.floor(wy / TILE);
    const ring = [[0, 0], [0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, 2], [1, 2], [-1, 2],
                  [2, 0], [-2, 0], [0, -1], [2, 1], [-2, 1]];
    for (const [ox, oy] of ring) {
      const x = cx + ox, y = cy + oy;
      if (World.isSolid(x, y)) continue;
      const px = (x + .5) * TILE, py = (y + .5) * TILE;
      if (G.state !== 'title' && Math.hypot(px - P.x, py - P.y) < TILE * .8) continue;
      return [px, py];
    }
    return [wx, wy];
  },
  nearest(x, y, max) {
    let best = null, bd = max;
    this.list.forEach(n => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } });
    return best;
  }
};

/* The waypoint: a pin when the target is on screen, a compass arrow round the
   player when not. */
const Guide = {
  tx: null, ty: null, label: '', flag: null,
  /* A colleague target: the pin walks with them. */
  npc: null,
  /* A one-shot pin clears on arrival; a tracked job's stays until the step moves
     on or you untrack it. */
  sticky: false,
  /* `flag` is the G.flags key that records arrival, so the guide knows not to
     come back after a save is reloaded. */
  set(tx, ty, label, flag) {
    this.tx = tx; this.ty = ty; this.label = label || ''; this.flag = flag || null;
    this.npc = null; this.sticky = false; this.pinned = false;
  },
  /* Your own pin, dropped on the map: it outranks a job's target until you get
     there or lift it, and then the job's comes back. */
  pinned: false,
  pin(tx, ty, label) {
    this.set(tx, ty, label, null);
    this.pinned = true;
    UI.toast('📍', say('pin.on', { where: esc(label) }));
  },
  unpin() {
    if (!this.pinned) return;
    this.clear();
    Track._sig = null;
  },
  /* By the object's `use`, not coordinates. */
  setObject(use, label, flag) {
    if (flag && G.flags[flag]) return false;
    const o = World.objects.find(x => x.use === use);
    if (o) { this.set(o.x, o.y, label, flag); this._want = null; return true; }
    /* On another level: point at the way there. Asked again from check() until
       that level is built, since a fresh run builds its neighbours in idle time. */
    this._want = { use, label, flag };
    return this.aimAcross(Levels.whereIs(use), label);
  },
  /* A tracked job's target: object, colleague or waypoint. False when it cannot
     be resolved, and the tracker stays pinless. */
  aim(t) {
    if (!t) return false;
    if (t.npc) {
      const n = NPCM.get(t.npc);
      if (!n) return false;
      if (!NPCM.here(t.npc)) return this.aimAcross(n.level, n.name);
      this.set(Math.floor(n.x / TILE), Math.floor(n.y / TILE), n.name, null);
      this.npc = t.npc; this.sticky = true;
      return true;
    }
    if (t.obj) {
      const o = World.objects.find(x => x.use === t.obj);
      if (!o) return this.aimAcross(Levels.whereIs(t.obj), null);
      this.set(o.x, o.y, o.name, null); this.sticky = true;
      return true;
    }
    /* Waypoints are named spots on the floor plan of the building, so one only
       means anything while you are in the building. */
    if (t.wp && WP[t.wp]) {
      if (Levels.current !== Levels.hub()) return this.aimAcross(Levels.hub(), t.label || null);
      this.set(WP[t.wp][0], WP[t.wp][1], t.label || 'this way', null); this.sticky = true;
      return true;
    }
    return false;
  },
  /* Target on another level: pin the way out that leads towards it. */
  aimAcross(levelId, what) {
    if (!levelId || levelId === Levels.current) return false;
    const link = Levels.route(levelId);
    if (!link) return false;
    /* `via || use`, World.behind()'s rule: shopfronts keep their shop's handler and
       name the link with `via`. */
    let door = World.objects.find(x => (x.via || x.use) === link.via);
    /* One object with several ways out (a lift, a stairwell) names no link: find
       it through EXITS in data/world.js. */
    if (!door) {
      const ex = EXITS.find(e => (e.vias || []).includes(link.via));
      if (ex) door = World.objects.find(x => x.kind === ex.kind);
    }
    if (!door) return false;
    this.set(door.x, door.y, what ? what + ' — this way' : door.name, null);
    this.sticky = true;
    return true;
  },
  /* Distance in walking steps (Nav), falling back to the straight line when
     there is no route. */
  steps() {
    if (this.tx === null) return 0;
    const s = Nav.steps(Math.floor(P.x / TILE), Math.floor(P.y / TILE), this.tx, this.ty, true);
    return s === null
      ? Math.round(Math.hypot((this.tx + .5) * TILE - P.x, (this.ty + .5) * TILE - P.y) / TILE) : s;
  },
  clear() { this._want = null; this.pinned = false; this.tx = this.ty = null; this.label = ''; this.flag = null; this.npc = null; this.sticky = false; },
  on() { return this.tx !== null && G.state === 'play'; },
  /* Arriving clears a one-shot pin; a tracked job's pin stays over the person. */
  check() {
    if (this.tx === null && this._want && G.state === 'play' && (this._wantT = (this._wantT || 0) + 1) % 30 === 0) {
      const w = this._want; this.setObject(w.use, w.label, w.flag);
    }
    if (this.npc) {
      const n = NPCM.get(this.npc);
      if (n) { this.tx = Math.floor(n.x / TILE); this.ty = Math.floor(n.y / TILE); }
    }
    if (this.tx === null || this.sticky) return;
    if (Math.hypot((this.tx + .5) * TILE - P.x, (this.ty + .5) * TILE - P.y) < TILE * 1.4) {
      if (this.flag) G.flags[this.flag] = true;
      if (this.pinned) UI.toast('📍', say('pin.here', { where: esc(this.label) }), 'good');
      const was = this.pinned;
      this.clear(); Sfx.select();
      if (was) Track._sig = null;
    }
  },
  /* Called after a save is restored: put the pin back if it is still owed. A
     tracked job comes first — it is the one the player asked for. */
  restore() {
    this.clear();
    if (Track.aim()) return;
    this.setObject('playerDesk', say('yourDesk'), 'foundDesk');
  },
  /* On a new level, re-resolve the pin: its tile coordinates meant the old map. */
  onLevel() { this.restore(); }
};

/* ---------------- Camera ---------------- */
const Cam = {
  x: 0, y: 0, w: 800, h: 600,
  /* Follow the player, clamped to the map, or centred when the map is smaller
     than the view. */
  bound(v, span, view) {
    /* Flush with the map edge; no overscan into nothing. */
    const lo = 0, hi = span * TILE - view;
    if (hi <= lo) return hi / 2;
    return clamp(v, lo, hi);
  },
  follow(dt) {
    const tx = P.x - this.w / 2, ty = P.y - this.h / 2;
    const k = 1 - Math.pow(0.0015, dt);
    this.x = lerp(this.x, this.bound(tx, MAPW, this.w), k);
    this.y = lerp(this.y, this.bound(ty, MAPH, this.h), k);
  },
  snap() {
    this.x = this.bound(P.x - this.w / 2, MAPW, this.w);
    this.y = this.bound(P.y - this.h / 2, MAPH, this.h);
  },
  visible(wx, wy) { return wx > this.x - 60 && wx < this.x + this.w + 60 && wy > this.y - 60 && wy < this.y + this.h + 60; }
};
