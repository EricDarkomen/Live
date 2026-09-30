'use strict';
/* ---------------- Nav: the shortest way there ---------------- */
/* One breadth-first sweep per destination, kept, and everybody walking to that
   destination steps downhill on the result. A field is a step count per tile —
   how many moves from here to there — so reading it is four array lookups and
   nothing walks a path of its own.

   Why a field rather than a path each: twenty people share about a dozen
   destinations between them (a desk each, and then the kettle, the printer, the
   loo, Meeting Room 2), so the expensive half is done once for the kettle
   rather than once for each of the five people going to it. It also answers the
   other question we had no answer to — HOW FAR IS THAT, in steps you have to
   walk rather than as the crow flies through four partitions — which is what
   the compass arrow now counts down.

   The floor plan changes only when a level is built, so the cache is thrown
   away when World hands out a new one and never validated tile by tile. */
const Nav = {
  fields: new Map(), grid: null, level: null, stamp: -1,
  /* Enough for a desk each plus the shared destinations, and eviction is
     least-recently-asked, so the handful in use every frame stay put. */
  LIMIT: 64,
  /* PEOPLE WHO ARE NOT MOVING ARE PART OF THE MAP.

     This is the thing that was missing, and everything that went wrong when you
     stood in a doorway follows from not having it. The sweep knew about walls
     and knew nothing about anybody standing still, so a person in the only door
     into the break room was, to every route on the floor, thin air: fifteen
     people walked at the door, arrived at the same square, and stayed there
     shoving, because as far as the map was concerned the way was clear and they
     simply had not got there yet.

     `mask` is that map, one byte a tile, rebuilt when it changes:

       1  a colleague standing at their spot: passable, at the price of six
          squares of walking, which is the difference between going round
          somebody and squeezing past them.

       2  YOU, standing still: passable at fourteen, which is most of the way
          across the floor. Where there is any way round at all they take it —
          they walk round you in a corridor without either of you noticing —
          and where there is not, the route still exists, so they come to the
          door and WAIT there rather than pretending the room does not exist.
          Being a wall was the other extreme and read as the whole floor
          quietly deciding not to have lunch.

     Weighted tiles mean the sweep is Dijkstra rather than breadth-first. Same
     shape, same result where nothing is in the way, and about as fast at this
     size — a floor is under three thousand squares. */
  mask: null, sig: '', COST: [0, 6, 14],
  /* Told by NPCM once things have settled, not every frame: rebuilding the
     routes is cheap but not free, and a crowd shuffling about would otherwise
     rebuild them sixty times a second. */
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
    /* Only the routes that account for people go stale — the compass's own
       field ignores them by definition. They are MARKED stale rather than
       thrown away, and field() refreshes them a few a frame (see BUDGET).

       This used to delete them all, and the note here said that was cheaper
       than being clever: at nine people it was. At sixty it meant every route
       on the level rebuilt in the same frame whenever anybody sat down — a
       thirty-millisecond hitch three times a second — and past sixty the
       cache itself could not hold everybody's desk, and routes were being
       rebuilt six thousand times a second. A route a frame or two behind the
       traffic is invisible; a frame that takes a tenth of a second is not. */
    this.gen++;
  },
  /* Which generation of the crowd the routes should account for, and how many
     stale ones may be rebuilt this frame — reset by tick(), once a frame. */
  gen: 0, budget: 0, BUDGET: 5,
  tick() { this.budget = this.BUDGET; },
  /* Can a route to here be had this frame: already built, or room to build. */
  ready(tx, ty) { this.fresh(); return this.budget > 0 || this.fields.has(tx + ',' + ty); },
  /* ENOUGH ROUTES FOR EVERYBODY ON THE LEVEL: a desk each, the shared spots,
     and room to spare. Fixed at sixty-four it was a wall — the sixty-first person's
     desk evicted somebody else's, whose walk evicted another's, and the cache
     spent the frame rebuilding itself. Sixteen-bit routes are 23KB each on the
     island, so even three hundred people is a few megabytes. */
  limit() { return Math.max(this.LIMIT, NPCM.list.length * 2 + 24); },
  /* World.build() assigns a NEW solid[] every time, so identity is the whole
     test: no equal-by-value comparison of three thousand tiles, and no flag for
     anyone to forget to set. The object count catches a door being unlocked or
     a level remembering that the trolley has been moved. */
  fresh() {
    const stamp = World.objects ? World.objects.length : -1;
    if (this.grid === World.solid && this.level === World.level && this.stamp === stamp) return;
    this.grid = World.solid; this.level = World.level; this.stamp = stamp;
    this.fields.clear();
    this.pass = null;
  },
  /* WHICH SQUARES CAN BE STOOD ON, asked once per floor plan instead of five
     times per square per sweep.

     World.isSolid() is the right question and a slow way to ask it a hundred
     thousand times: it builds two strings for the set lookups and walks the
     objects on the tile, so on the island — eleven thousand squares — the sweep
     spent two thirds of its five milliseconds asking whether the sand was sand.
     Every one of those answers is fixed until fresh() says the plan changed
     (nothing flips `solid` on an object at runtime; a new level or a new object
     is a new stamp), so it is one byte a tile, built on first use.

     The one live part is the cars, which move, and which isSolid() reads from a
     set Cars.sync() refills. They are laid over a copy at sweep time — a few
     dozen squares — exactly as the old sweep saw them. */
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
  /* `plain` ignores who is standing where. The compass wants to tell you how
     far you have to walk, not how busy the corridor is this second, and a
     number that jumped by six every time somebody stopped in it would be
     worse than no number. */
  field(tx, ty, plain) {
    if (!World.solid) return null;
    this.fresh();
    const k = (plain ? 'p:' : '') + tx + ',' + ty;
    let hit = this.fields.get(k);
    /* Stale — the crowd has moved since it was built. Rebuilt if this frame
       still has room for it; otherwise it answers with the traffic of a moment
       ago, and gets its turn next frame. */
    if (hit && !plain && hit.gen !== this.gen && this.budget > 0) {
      this.budget--;
      hit = this.build(tx, ty, plain); hit.gen = this.gen;
    }
    /* Re-inserting moves the key to the end of a Map's insertion order, which
       is what makes the eviction below least-recently-asked rather than
       oldest-built — the kettle must not be evicted at 11:00 by twenty desks. */
    if (hit) { this.fields.delete(k); this.fields.set(k, hit); return hit; }
    const f = this.build(tx, ty, plain);
    f.gen = this.gen; this.budget--;
    const cap = this.limit();
    while (this.fields.size >= cap) this.fields.delete(this.fields.keys().next().value);
    this.fields.set(k, f);
    return f;
  },
  /* HOW FAR A SWEEP IS ALLOWED TO GO, in tiles actually expanded.

     A field is a step count per tile and the sweep that makes one is a
     Dijkstra over every square somebody could reach. On a floor of three
     thousand squares that is nothing. On a map a kilometre across it is a
     million squares swept and four megabytes held — per destination, and
     LIMIT keeps forty-eight of them — because a colleague decided to go and
     put the kettle on.

     So the sweep stops after this many squares. It stops at the cheapest ones
     first, which is what Dijkstra does, so what it keeps is a disc of the
     nearest floor to the destination and what it throws away is the far half
     of a town nobody is walking in from. Forty thousand squares is a hundred
     and thirteen on a side: three times the longest walk on the biggest level
     in this game, so every field on every level in it today comes out complete
     and this number changes nothing at all. It is a ceiling, not a budget.

     A field that hit the ceiling is marked `partial`, and that matters to
     exactly one reader — see `far === null` in walk(). Unreachable and
     not-swept-yet look identical in the array and mean opposite things: one is
     a locked door, the other is a long way off. */
  CAP: 40000,
  /* THE SWEEP, as a bucket queue rather than a heap.

     Every step here costs 1, 7 or 15 — a plain square, a square with a
     colleague in it, a square with you in it — and a Dijkstra whose edges are
     small whole numbers does not need a heap at all: keep one list per cost
     modulo sixteen and take them in order (Dial's algorithm). Nothing is
     compared, nothing is sifted, and the lists live in two typed arrays that are
     allocated once per map size and reused by every sweep after. The distances
     are the heap's distances exactly; what changes is that it stopped being
     the most expensive thing an islander did on the way to the bar.

     Measured on the island (128×92): 5.2ms a field before, a fraction of a
     millisecond after — which is the difference between a crowd changing its
     mind in one frame and a crowd changing its mind in a hitch. */
  _node: null, _next: null, _head: new Int32Array(16),
  build(tx, ty, plain) {
    const w = MAPW, h = MAPH, N = w * h;
    /* Sixteen bits a square: half the memory, and no route on any map in this
       game comes within a factor of ten of 32,000 steps. A sweep that ever got
       there stops and says so, the way the square cap does. */
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
    /* A waypoint can be ON something — the printer is a solid object and the
       spot in front of it is where you actually stand. Seed the four squares
       around it instead, so "go to the printer" means "go and stand at it"
       rather than "walk into it until the stuck timer fires". */
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
  /* Did the sweep for this destination run out of ceiling before it got here.
     "No route" and "not swept this far" are the same -1 in the array and the
     opposite thing on the floor: one is a locked door and is a reason to stand
     and wait, the other is a long walk and is a reason to set off. */
  partial(tx, ty, plain) {
    const f = this.field(tx, ty, plain);
    return !!(f && f.partial);
  },
  /* The next tile on the way. Downhill on the field, and diagonally where that
     is genuinely shorter — the sweep is four-connected, so a diagonal neighbour
     two steps closer is a corner being cut honestly rather than a shortcut
     through a desk. Both tiles it passes between have to be open, or people
     walk through the corner of the partition.

     `cost` is an optional extra price per tile, which is how somebody standing
     in the way becomes a reason to go round rather than a reason to stop. It
     can only pick between tiles that are already closer than this one, so no
     cost can send anybody backwards or into a loop. */
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
  /* `list` is who is standing on the level you are standing on, and `all` is
     the roster. Everything about presence — drawing, collision, who you are
     near enough to talk to, the dots on the minimap — reads `list`, and so
     none of it had to learn that levels exist: walking down the ladder empties
     the list and the office carries on existing without being drawn into the
     basement at the coordinates its colleagues occupy upstairs. Anything about
     a person rather than their whereabouts — a job that names them, a
     relationship, the rolodex — reads `all`. */
  list: [], all: [],
  /* Seconds since the page loaded, which is the clock the floor's own reactions
     run on. NOT G.minutes: an event that adds eleven minutes to the shift would
     end an evacuation before anybody had stood up. */
  now: 0, busyTiles: new Set(), stillTiles: new Map(), boss: null, lastEvent: null, dynAt: 0, stillFor: 0,
  /* Set while an evacuation is running — see THE DRILL. Cleared with the
     roster, so a new shift never starts halfway through somebody else's. */
  drill: null,
  pvx: 0, pvy: 0,
  spawn() {
    this.drill = null; this.lastEvent = null;
    /* A new roster is new people standing in new places. What they feel is in
       G.minds and survives; what they were about to do about it does not. */
    Mind.reset();
    this.all = NPCS.map(def => {
      const t = this.traits(def);
      return {
        def, id: def.id, name: def.name, face: def.face, role: def.role, t,
        /* Everybody works on the fourth floor. It is a call centre; that is the
           whole premise. Written down anyway, because the moment one person does
           not, every reader of `list` is already correct. */
        level: def.level || Levels.hub(),
        x: (def.desk[0] + .5) * TILE, y: (def.desk[1] + .5) * TILE,
        step: 0, speed: TILE * t.pace, bob: rnd(0, 6.3),
        /* Which way they stand when they are where they belong. Two on the
           fourth floor means facing the camera; a def may say otherwise, and
           the people behind counters in Bellhaven do — see `dir:` in
           data/npcs.js. */
        dir: def.dir === undefined ? 2 : def.dir,
        say: '', sayT: 0, nextSay: rnd(6, 22), stunTimer: 0, dest: 'desk', destKey: '', stuck: 0,
        /* The square of carpet they have claimed, who they are talking to,
           what they are looking at and for how long, and when they may next
           strike up a conversation. All of it is where they are and what they
           are doing rather than who they are, so none of it is saved: a
           reloaded shift puts everybody at their desk and the day starts. */
        post: null, walking: false, chat: null, chatCool: rnd(5, 40), callOut: null,
        /* Which part of an evacuation they are in, and the two squares it has
           given them: one in the car park and one to come back to. Not saved,
           like everything else here about where somebody is standing — a
           reloaded shift starts with the whole floor at its desks. */
        drill: null,
        /* Gone home. Not saved either, for the same reason — but unlike the
           rest of it, it is not simply false at spawn: a roster built at two in
           the morning starts with everybody already away, or a reloaded night
           shift begins with twenty people at their desks and then empties
           itself in front of you. */
        away: false,
        lookAt: null, lookT: 0, idleT: rnd(2, 9), evade: 0, evadeX: 0, evadeY: 0,
        /* The steering: the heading actually being held, the tile being crossed
           to, and how the walk is going — closest they have been to where they
           are going, and how long since that improved. Progress is what decides
           whether a walk is finished or hopeless; `stuck` only ever knew about
           the last frame, and somebody shuffling sideways for ever was, frame
           by frame, moving perfectly well. */
        hx: 0, hy: 1, next: null, nextFrom: '', best: 1e9, noProg: 0, gaveUp: null,
        /* Where they decided to go, when they set off, when they got there and
           how long they mean to stay. See destTile. */
        errand: null,
        /* Standing somewhere on purpose, rather than merely being near it. */
        parked: false, waitDoor: 0, holdWant: null, holdFor: 0, lastAim: 'desk', retry: 0,
        queued: 0, waitingFor: null, wayBack: null, wayFor: 0, squeeze: 0,
        /* When they set off for the door on an errand, and which window they
           set off FOR — because the clock can close it while they are still in
           the corridor and they are going anyway. Null when they are not on
           one. `leaving` is the same clock for the other direction: walking out
           of a shop at closing time. See runErrands(). Not saved, like
           everything else here about where somebody is standing. */
        outAt: null, outFor: null, leaving: 0,
        /* And the square of pavement they are crossing the town towards, when
           somebody is out there to watch them do it. Null the rest of the time,
           which is nearly all of it. See ACROSS THE TOWN in runErrands(). */
        outward: null,
        /* When they stepped out of the front doors on the way home, or 0 when
           they are not on their way anywhere. See runHome()'s second leg. */
        homeward: 0
      };
    });
    this.byId = new Map(this.all.map(n => [n.id, n]));
    this.enter(World.level);
    /* And then put them on the right side of five o'clock. A fresh roster is
       always built at its desks; whether that is where anybody should be
       depends on the clock, which spawn() has no business knowing about. */
    this.homeSnap();
  },
  /* WHERE EVERYBODY SHOULD BE, IMMEDIATELY, with nobody walking to get there.
     Called when the clock has JUMPED rather than run — a fresh roster, or a
     save loaded at two in the morning — because runHome() below moves people
     by walking them, and a building that empties itself over thirty seconds in
     front of somebody who has just pressed Load is not an empty building, it is
     a bug they are watching happen. */
  homeSnap() {
    const after = !Sky.staffed();
    this._wasAfter = after;
    /* Far enough in the past that nobody is waiting on the stagger: the stagger
       is for a shift that ends while you are standing in it. */
    this._homeAt = this.now - 200;
    this._homeSpots = null; this._homeRec = null; this._homeDoor = null;
    const hub = Levels.hub();
    this.all.forEach(n => {
      /* If the clock says they are out, they are OUT, and that is asked before
         anything else — an evening outranks the end of a shift here for the
         same reason it does in runHome(), and a save loaded at half seven
         should find whoever is in the Arms in the Arms.

         It is asked before `away` as well, which it was not. A fresh roster is
         always built at its desks with nobody away, so the window below the
         old early-out could never fire on one: loading at ten past twelve put
         Karen at her desk and then walked her to the door, which is the exact
         thing the note under it says it is there to prevent. */
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
  /* A stable number from a string. Used for the traits below and for which way
     round somebody joins a queue — anything that has to differ per person, not
     change between sessions, and cost the writing nothing. */
  hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  /* How this person moves through a building, as five numbers.

     Derived from the id rather than written into data/npcs.js on purpose: the
     editor rewrites that file from a fixed list of fields, so a trait typed
     into it would be silently dropped the first time somebody saved a person
     from the Talk tab. A hash is stable across sessions, different for each
     person, and costs the writing nothing — and a def may still overrule any
     of it with `traits:` if one ever wants to. */
  traits(def) {
    const h = this.hash(def.id);
    const bit = n => ((h >>> (n * 5)) & 31) / 31;
    return Object.assign({
      pace: 1 + bit(0) * .5,              /* tiles a second: an amble to a walk */
      social: .15 + bit(1) * .75,         /* how readily they start a conversation */
      restless: bit(2),                   /* whether standing still stays still */
      drift: Math.round(-3 + bit(3) * 9), /* minutes ahead of the timetable, or behind it */
      /* How close you get before they look up, in tiles. The floor of it is the
         reach of E — 1.05 tiles, engine/panels.js — so anybody you are close
         enough to talk to has already noticed you, whoever they are. */
      notice: 1.15 + bit(4) * .95
    }, def.traits || {});
  },
  /* Which way to face, given a direction to face in. Sprites.dirOf takes the
     dominant axis, and a walk of exactly 45° — which is most of them, since the
     field is happy to go diagonally — has no dominant axis: |dx| and |dy| trade
     places on floating-point noise and the sprite flips between facing sideways
     and facing down every single frame. That was the jitter.

     So the axis being faced now keeps it until the other one wins by half
     again, and only the sign changes freely. Turning a corner still reads
     immediately; walking a diagonal picks a face and holds it. */
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
    /* Nobody carries a conversation, a claimed spot or a grudge against a
       doorway across a level change: all three are about a floor plan that is
       no longer loaded. A drill is the one thing that survives, because it is
       not about a floor plan at all — it is about which floor these people are
       standing on; runDrill() re-aims them on the next frame. */
    this.all.forEach(n => {
      this.hangUp(n); n.post = null; n.gaveUp = null; n.destKey = ''; n.callOut = null;
      n.errand = null; this.repath(n);
    });
  },
  /* By id, from an index built with the roster — asked every frame by every
     conversation and every mind, which a search of the roster was fine for at
     nine people and is not at ninety. */
  byId: new Map(),
  get(id) { return this.byId.get(id) || this.all.find(n => n.id === id); },
  /* WHO IS NEAR A POINT, from a grid of two-tile cells rebuilt once a frame.
     Everything that asks "is anybody within arm's length" — leaning apart,
     not walking through each other, who to strike up a conversation with —
     used to ask it of the whole level, for every walker, every frame: a
     hundred and fifty walkers on a level of two hundred and fifty is forty
     thousand distances a frame, nearly all of them to people across the
     island. Now it asks the handful of cells round the point. */
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
  /* Is this colleague on the level you are on. A job that points at somebody
     upstairs wants the way upstairs, not their desk coordinates applied to the
     floor you are on. */
  here(id) { return this.list.some(n => n.id === id); },
  /* Where the timetable says to be. `drift` is the minutes this person is ahead
     of it or behind it, which is the whole reason twenty people no longer stand
     up for their break in the same frame. */
  /* Where the timetable says to be, in its own words. `drift` is the minutes
     this person is ahead of it or behind it, which is why twenty people no
     longer stand up for their break in the same frame. */
  scheduled(n) {
    const sch = n.def.schedule || [];
    const now = G.minutes + (n.t ? n.t.drift : 0);
    let d = 'desk';
    for (const [t, where] of sch) if (now >= t) d = where;
    return d;
  },
  /* How long the writer meant somebody to be there, in real seconds: the gap to
     the next entry in their day. A game minute is 430ms, which is the whole
     problem below. */
  slotSecs(n) {
    const sch = n.def.schedule || [];
    const now = G.minutes + (n.t ? n.t.drift : 0);
    let start = DAY_START, end = DAY_END;
    for (let i = 0; i < sch.length; i++) {
      if (now >= sch[i][0]) { start = sch[i][0]; end = i + 1 < sch.length ? sch[i + 1][0] : DAY_END; }
    }
    return (end - start) * MS_PER_GAME_MIN / 1000;
  },
  /* WHERE SOMEBODY IS ACTUALLY GOING.

     The timetable proposes and an errand disposes, because the timetable is
     written in game minutes and the building is crossed in real ones. A game
     minute is 430ms: Dave's coffee at 10:15 is fifteen game minutes, which is
     six and a half seconds, and the walk from his desk to the break room is
     nearer thirty. Read literally — which is what this did — he sets off, gets
     as far as the break room door, is told his coffee break ended while he was
     in the corridor, and turns round and walks back. Seventeen of the twenty
     have a slot too short to reach, so the floor was mostly people reversing in
     doorways, all day, and it read exactly as badly as it sounds.

     So: setting off somewhere is a commitment. They go, they arrive, they stay
     long enough for it to have been worth going — the shorter of what the
     writer wrote and their own patience for standing about — and only then does
     the timetable get a say again. Nothing in data/npcs.js changes, and what it
     says now happens: Dave has a coffee at quarter past ten.

     A desk is not an errand. Going back to your desk is what you do when there
     is nothing else, and it can be interrupted by anything. */
  destTile(n) {
    /* OUT OF THE BUILDING, which outranks the timetable for the plainest
       possible reason: the timetable is a floor plan of the FOURTH FLOOR, and
       somebody standing in a nail bar on the High Street is not on it.

       Without this they keep their office schedule while they are out, and
       every part of that is wrong. `dest` stays 'desk', so the facing rule
       below points them at a monitor that is not there and three colleagues
       sit with their backs to a room whose entire joke is being seen. And at
       noon the timetable hands them a break-room waypoint, so somebody sitting
       in a shop fifteen tiles wide is holding an errand to tile [8,22] of a
       different map — which the routing cannot reach and therefore never
       resolves, which is a bug that happens to look like nothing.

       So while the errand window is open they are AT the errand, full stop:
       their own tile, no schedule, no waypoint, and the facing that
       data/npcs.js asked for. See runErrands() and `out:` over there. */
    const out = this.errandFor(n);
    if (out && n.level === out.level) {
      n.errand = null; n.callOut = null; n.holdWant = null;
      n.dest = 'out';
      if (out.face !== undefined) n.dir = out.face;
      return out.tile;
    }
    /* Called away. An override on everything, with an expiry on it, set by
       watchFloor() when something happens to the building — see REACT.

       A call-out names either a waypoint or a bare square, and it has to be
       able to name a square: a waypoint is a spot on the floor plan of the
       BUILDING (see WP in data/world.js), and the drill below sends people to
       a corner of the car park, which is a different map and has none. */
    if (n.callOut) {
      const at = n.callOut.tile || WP[n.callOut.wp];
      if (this.now < n.callOut.until && at) {
        n.errand = null; n.dest = n.callOut.wp || 'assembly'; return at;
      }
      n.callOut = null;
    }
    let want = this.scheduled(n);
    /* ANOTHER FLOOR. A waypoint may say which level it is on — see WP in
       data/world.js — and three people's days now name one that is not the
       floor they are standing on: the two who work in Management, and the man
       on the fourth floor who goes up to see them twice a day.

       This is the whole of what that costs. It is deliberately NOT a simulation
       of a lift: it is somebody walking to the lift, standing at it, and then
       being on the floor they were going to, which is what watching a colleague
       use a lift actually looks like from where you are sitting. */
    const commuting = this.commute(n, want);
    if (commuting) return commuting;
    const e = n.errand;
    /* OUTRANKED. An errand is a commitment against the timetable, not against
       everything: a coffee is cut short to open the bar on time, and a
       bartender about to faint does not finish carrying the glasses first.
       The mind knows the priorities — see THE AGENDA in engine/mind.js. */
    if (e && Mind.preempt(n, e)) n.errand = null;
    else if (e) {
      /* Still on the way. The timetable can say what it likes. */
      if (!e.arrived && this.now - e.began < 90) return this.aim(n, e.wp);
      /* Been and stood there. It is over when they have had their moment AND
         the day has moved on; if the timetable still wants them here they stay,
         which is what a lunch break is. */
      const done = e.arrived && this.now - e.arrived >= e.dwell;
      if (!done && this.now - e.began < 90) return this.aim(n, e.wp);
      n.errand = null;
      /* Given up on without getting there is a step skipped, not a step done:
         nobody gets better at surfing by failing to reach the sea. */
      if (e.mind) Mind.done(n, !e.arrived);
    }
    /* THE DAY SAYS "YOUR OWN SPOT", which is most of the day — and so the
       mind gets a say. Asked here, after the errand above has had its chance
       to finish, so an errand the mind made and has just been ended is not
       immediately made again. See engine/mind.js. */
    let minded = false;
    /* Asked whatever the timetable says, because a duty or an emergency
       outranks a timetabled break; Mind.want() declines anything that does
       not. 'desk' is a real answer — a step behind their own counter. */
    const w = Mind.want(n, want);
    if (w === 'desk') want = 'desk';
    else if (w && WP[w]) { want = w; minded = true; }
    if (want !== 'desk' && WP[want]) {
      /* Not the instant the clock says so. Nobody stands up mid-sentence
         because it has become half past: they finish the thing they are doing
         and then they go. Without the wait the timetable's entries — which
         cluster, because a day has a shape — took the whole floor out of their
         chairs on the same frame, and twenty people crossing the office at once
         is a fire drill, not a Tuesday. */
      /* The next step of something already under way is not a new decision,
         and gets no pause for thought. */
      if (n.holdWant !== want) { n.holdWant = want; n.holdFor = this.now + (minded ? rnd(0, 1.2) : rnd(1, 11)); }
      if (this.now < n.holdFor) return this.aim(n, n.lastAim || 'desk');
      /* Forgotten once they have set off, so the next time the day asks them to
         go there they take a moment about it again rather than leaping up. */
      n.holdWant = null;
      const tag = minded ? Mind.errandTag(n) : null;
      n.errand = { wp: want, began: this.now, arrived: 0, mind: minded,
        pid: tag ? tag.pid : 0, step: tag ? tag.step : 0,
        /* Long enough to have been worth the walk, short enough that a quick
           one reads as a quick one. One the mind made lasts as long as its
           step says — shorter, the better they are at it. */
        dwell: tag ? tag.dwell : clamp(this.slotSecs(n), 7, 26) };
      return this.aim(n, want);
    }
    return this.aim(n, want);
  },
  /* THE OTHER HALF OF THE LIFT, and it is the half that does the work.

     commute() above is what you WATCH: somebody on the floor you are standing
     on, whose day wants them on another one, walking to the lift and then not
     being there any more. It runs out of the walk, and the walk only runs for
     people on the loaded level — which is correct for everything else in this
     file and is exactly wrong for this one thing, because the whole point of a
     person who works upstairs is that they are upstairs.

     So this is the same journey for everybody who is NOT on your floor, done
     without the walk, once a frame, off camera. It is not a shortcut: you
     cannot see them, there is nothing to draw, and a colleague who took three
     minutes to cross a landing you were not looking at would be a colleague who
     is late for reasons nobody can ever observe. Nigel is on the fourth floor
     at eleven because his day says he is on the fourth floor at eleven.

     The guards are runHome's, in runHome's order and for runHome's reasons: a
     drill outranks a timetable, going home outranks a drill in the other
     direction, and an `out:` window — a man in a kebab shop — outranks the lot.
     Anybody the guards catch is somebody whose level is already being decided
     by something with a better claim on it. */
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
  /* WHICH FLOOR A WAYPOINT IS ON. A two-element waypoint means the hub, which
     is the state every one of them was already in, so nothing had to be
     rewritten to give three of them a third element. */
  wpLevel(name) {
    const w = WP[name];
    return (w && w[2]) || (Levels.hub());
  },
  /* GOING UP.

     Returns the square to aim at while somebody is between floors, or null when
     they are on the right one and the day can carry on as it always did.

     Walk to the lift on the floor you are on; when you are at it, you are on
     the floor you were going to, beside its lift. The stairs are the fallback
     and not a choice: if a floor has no lift on it this uses whatever stair it
     has, which is the correct behaviour for a building and is also what stops
     this ever stranding anybody. If neither end has either — a floor with no
     way off it, which no floor in this building has — nobody sets off, and the
     schedule falls through to the aim() it always had.

     THE SIXTY SECONDS is the backstop rather than the mechanism. Somebody who
     cannot get to the lift because you are standing in the doorway of it should
     still end up where their day says they are, and a colleague stuck against a
     lift door for a whole shift is a worse bug than one who appears upstairs
     slightly early. */
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
  /* Is this square a way through rather than a place to be. Standing in a
     doorway stops everybody behind you getting in — which during a fire drill
     is the whole floor, queueing in the lobby behind one person who found a
     free square and stopped on it. Bev has a line about this. */
  inDoorway(x, y) {
    if (World.isOpening(x, y)) return true;
    return World.at(x, y).some(o => o.kind === 'door' || o.kind === 'exit' || o.kind === 'hatch');
  },
  /* Which square to actually stand on. Five people sent to `coffee` were sent
     to the same square of lino, where they spent the break shoving each other
     off it; a destination is a place in the room, so it is claimed one square
     at a time from the tiles around it.

     A desk is the exception and is exactly itself: it is a chair with a name on
     it, the renderer seats whoever stops on it, and two people cannot want the
     same one. */
  /* A doorway is one square wide and holds ONE person. Not a timer, not a
     token, not a rule about which way everybody is going: the square either has
     somebody in it or it does not, and if it does you wait for it.

     Both cleverer versions of this failed in opposite directions. A three
     second hold on the door halved the way into the break room and left two
     thirds of the floor in the corridor. Letting people going the same way
     share it meant that the moment you stepped out of a doorway the eight
     people who had been waiting for you all walked into it at once and jammed
     — which is the same heap as before, just delayed by however long you stood
     there. Occupancy is the honest test and it is the fastest one: a person
     crosses a square in under a second, so a door still passes two people a
     second, which is a door.

     The second loop is the queue's order. Two people arriving together would
     otherwise both find it empty on the same frame and both step in; the one
     nearer has it, and a tie goes to whoever's name says so, so both of them
     reach the same answer without either having to ask. */
  /* WHICH WAY THE DOOR IS GOING is deliberately not a thing this knows.

     The obvious fix for two crowds meeting in one doorway is a turnstile: the
     first person through claims the direction, everybody going that way follows
     them, the other side waits, and the door turns over after a run of five so
     nobody starves. It was written, and it was measured against the jam it was
     meant to fix — twelve people shuttling both ways through a single door for
     three minutes, twenty runs of it, which is tools/doorjam.mjs — and it made
     things WORSE, by a quarter: 430 crossings without it, 295 with, and the
     longer the run of five the worse it got. A reserved door is an idle door:
     the moment the flow it is holding for stalls on itself — and a crowd at a
     doorway stalls constantly — the reserve is a shut door with nobody in it
     and somebody the other side who could have walked through.

     What actually clears the jam is not deciding whose turn it is. It is that
     the person IN the doorway is nobody's obstacle to be waited out: whoever is
     stood on the square they are coming out onto steps aside, they never wait
     long from inside a doorway themselves, and if the room beyond is solid
     people they turn sideways and edge out. All three are below, and none of
     them has to count anybody. */
  doorClear(n, x, y) {
    for (const o of this.list) {
      if (o === n) continue;
      if (Math.floor(o.x / TILE) === x && Math.floor(o.y / TILE) === y) return false;
    }
    /* You in the doorway stop it being free — unless this is somebody who has
       already waited for you and is edging past, which is the one case where
       two people are in a doorway on purpose. */
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
  post(n, dx, dy) {
    if (n.post) return n.post;
    if (n.dest === 'desk') return (n.post = [dx, dy]);
    /* On a drill the square IS the destination and it is exactly itself, the
       same as a desk is: on the way out everybody is aimed at the one door and
       a queue for it is what an evacuation looks like, and in the car park
       everybody already has a square of their own. Spreading either of them
       around the target would put half the floor in the lobby waiting for a
       door nobody was walking to. */
    if (n.drill) return (n.post = [dx, dy]);
    /* AND AN ERRAND'S TILE IS EXACTLY ITSELF, for the same reason and one more.
       destTile() says of a window that they are AT it, full stop — their own
       tile, no schedule, no waypoint — and the table writes those tiles on
       purpose: who is in which chair, who has their back to the door, who is
       fourth in the queue. The chair rule below is written for a break room
       with eight empty chairs round a table and it would go and sit somebody in
       the nearest one it could find, which in the Bellhaven Arms put Dave in
       Sarah's seat from three squares away and Sarah on the floor beside it. */
    if (n.dest === 'out') return (n.post = [dx, dy]);
    const taken = new Set();
    for (const o of this.list) if (o !== n && o.post) taken.add(o.post[0] + ',' + o.post[1]);
    /* The square they just walked away from because they could not get to it.
       One pick only: it is off the list for this choice and available again
       the next time anybody looks, including them. */
    if (n.gaveUp) { taken.add(n.gaveUp); n.gaveUp = null; }
    const f = Nav.field(dx, dy);
    /* A chair first, if there is a free one within a couple of squares of where
       they were sent. Every break table, the meeting room and the training room
       have them, the renderer already seats anybody who stops on one, and it
       was drawing twelve people standing bolt upright round a table with eight
       empty chairs at it. Sitting down is most of what a break is. */
    const chair = this.freeChair(n, dx, dy, taken, f);
    if (chair) return (n.post = chair);
    /* Outwards a shell at a time, so nearest to the thing they came for always
       wins. Three shells is forty-eight squares, which is more people than work
       here. Which square within a shell is the interesting half — see below. */
    const cx = n.x / TILE - .5, cy = n.y / TILE - .5;
    for (let ring = 0; ring <= 3; ring++) {
      const cells = [];
      for (let oy = -ring; oy <= ring; oy++) for (let ox = -ring; ox <= ring; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== ring) continue;
        const x = dx + ox, y = dy + oy;
        if (World.isSolid(x, y) || taken.has(x + ',' + y) || this.inDoorway(x, y)) continue;
        /* Connected to the destination, not merely near it: the tile the other
           side of the break room wall is one square from the kettle and a walk
           round three corridors away from it. One field answers this for every
           candidate, which is why the destination's is the one asked. */
        if (f && Nav.at(f, x, y) < 0) continue;
        cells.push([x, y]);
      }
      if (!cells.length) continue;
      /* Of the free squares this close to the thing they came for, the one on
         the side they are arriving from. A spot chosen without regard to that
         is a spot on the far side of everybody already standing there, and the
         last four people into a busy break room spent the whole of lunch trying
         to cross it — each of them walking into the backs of the people who got
         there first, giving up, and choosing another square behind them.

         Rooms fill from the door now, which is also how a room fills. */
      cells.sort((a, b) => (Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
        || (this.hash(n.id + a) % 8) - (this.hash(n.id + b) % 8));
      return (n.post = cells[0]);
    }
    /* Nothing free for three squares in any direction, which means the room is
       full — a fire drill, or lunch. Stand where you are rather than joining a
       scrum on a tile somebody else has already claimed. */
    const hx = Math.floor(n.x / TILE), hy = Math.floor(n.y / TILE);
    if (!World.isSolid(hx, hy) && !taken.has(hx + ',' + hy) && !this.inDoorway(hx, hy)) return (n.post = [hx, hy]);
    return (n.post = [dx, dy]);
  },
  /* The nearest chair to a destination that nobody has claimed and everybody
     can reach. Three squares: that reaches the far side of both break tables
     and the back row of the training room, and stops well short of the next
     room along. */
  freeChair(n, dx, dy, taken, f) {
    let best = null, bd = 9;
    for (const o of World.objects) {
      if (o.kind !== 'chair' || o.solid) continue;
      const d = Math.max(Math.abs(o.x - dx), Math.abs(o.y - dy));
      if (d > 3 || d >= bd) continue;
      if (taken.has(o.x + ',' + o.y) || World.isSolid(o.x, o.y)) continue;
      if (f && Nav.at(f, o.x, o.y) < 0) continue;
      /* Not the one you sit at all day. A desk chair is somebody's desk, and
         the only person who should ever be in it is the person whose name is
         on the monitor. */
      if (o.deskId || o.use === 'playerDesk') continue;
      best = [o.x, o.y]; bd = d;
    }
    return best;
  },
  /* What the floor does when something happens to it, keyed by the event id in
     data/office.js. The writing already says what the room does — thirty-one
     adults are now running, nobody moves for the test, everybody stands in the
     car park for eleven minutes — and this is that happening on the floor
     rather than only in the toast that announces it.

     Reading ids out of the content is a coupling and a deliberately loose one:
     an event not named here simply gets no reaction, and one that is renamed or
     deleted quietly stops having one. Nothing in this table can fail. */
  /* HOW THE FLOOR REACTS TO AN EVENT is the EVENTS row's `crowd:` —
       { look: 'wp' }        heads turn towards a waypoint for `secs`
       { go: 'wp', haste }   everybody goes there, and comes back after `secs`
       { evacuate: true }    the fire drill: out to the level one door away
                             with an `assemblyPoint` object standing on it
     Nothing in it can fail: a waypoint that is not in WP is ignored. */
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

  /* ---------------- THE DRILL ----------------
     What the floor does when the alarm is not a test: it leaves the building,
     stands in the car park, and comes back up. Three states, and a person is
     in exactly one of them.

       'out'  crossing the floor to the way out. Aimed at the door ITSELF
              rather than at a square near it, because everybody is going
              through the one door and a queue for it is what that looks like
              — see post(). They are outside the moment they reach it.
       'at'   standing on their own square of the car park, by the assembly
              point. Handed out once, in roster order, so that a crowd is a
              crowd and not a heap on one paving slab.
       'in'   it is over: back to the door they came out of, and upstairs.

     NOTHING HERE NAMES A LEVEL OR A TILE. The way out is the link table's —
     the same `via`/`to`/`entry` row in data/levels.js that Levels.take() reads
     when YOU press E on that door — and where people stand is wherever the
     assembly point sign is standing. Move the sign in the editor and the drill
     moves with it; put the car park somewhere else entirely and this does not
     change. The one thing it insists on is that the place they evacuate to is
     one door away, which is what a fire exit is.

     A person who never reaches the door — stuck behind the one colleague who
     has parked in it, or simply too far away when it ends — stands down where
     they are and goes back to their day. That is a drill as well. */

  /* The free square in front of a door, because a door is set into the
     boundary wall and nobody can stand IN one: the way out of the fourth floor
     and the way back into it are both scenery on a wall, exactly as they are
     for the player. North first, then south, then either side — the office's
     doors are in the bottom wall and the car park's in the top one, and
     neither of those is a fact worth writing down twice. */
  doorSide(rec, use) {
    /* The way out is asked for as 'exit', which is what the office's front
       doors were used for. A level whose way out does something else when
       pressed — the Driftwood's door is `use: 'barOut'`, because pressing it
       takes you to the Promenade — still says what it IS with `kind: 'exit'`.
       Without that second look runHome() and runErrands() found no door on
       the hub and gave up every frame: nobody went home at closing, came back
       in the morning, or went out to yoga or the sunset unless a load snapped
       them there. */
    const list = rec.objects || [];
    const o = list.find(x => x.use === use) || (use === 'exit' ? list.find(x => x.kind === 'exit') : null);
    if (!o) return null;
    const free = (x, y) => x >= 0 && y >= 0 && x < rec.w && y < rec.h
      && !rec.solid[y][x] && rec.zone[y][x];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]])
      if (free(o.x + dx, o.y + dy)) return [o.x + dx, o.y + dy];
    return null;
  },
  /* Squares for a crowd to stand on around a point, nearest first and in a
     fixed order, so the same person gets the same square every time and nobody
     is ever sent to a wall, a parked car or a stack of pallets.

     Deliberately NOT Nav: this is asked about a level that is usually not the
     one loaded — the whole floor is upstairs when the drill starts — and Nav
     answers about the map World is holding. Rings off the sign are enough for
     an open piece of tarmac, which is what an assembly point is. */
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
  /* Where this evacuation goes, worked out from the catalogue rather than
     written down: the floor with the people on it is the hub, the place they
     go is whichever level one door away has an assembly point standing in it,
     and the way back is that level's own link home. Returns null — and so no
     drill at all, rather than a broken one — if any of that is missing. */
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
    /* Both crowds laid out now, while the levels are certainly built: one in
       the car park to stand in, one in the lobby to come back to. Arriving
       twenty people on one square is a scrum that sorts itself out over about
       four seconds of shoving, in full view. */
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
  /* Moved by the drill rather than by walking: through a door, onto a floor
     that may not even be loaded. Everything about the walk they were in the
     middle of is dropped, because it was about a map they are no longer on. */
  stepThrough(n, level, tile, face) {
    n.level = level;
    n.x = (tile[0] + .5) * TILE; n.y = (tile[1] + .5) * TILE;
    /* Which way they are pointing when they get there, where the caller cares.
       0 up, 1 left, 2 down, 3 right — the order of `dirs` on the sheet. A
       drill does not care and does not pass one; an errand does, because who
       has their back to the door is the whole of some of these jokes. */
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
      /* Whoever you are talking to stays where they are — but the clock does
         not stop for a conversation. They change phase with everybody else and
         set off the moment you have finished, rather than being the one person
         left standing in a car park because you said hello to them at the
         wrong moment. */
      const busy = n.id === talkingTo;
      if (k.phase === 'out') {
        /* Stood down before they even got out of the door. */
        if (over) { n.drill = null; n.callOut = null; continue; }
        if (busy) continue;
        if (n.level !== World.level) {
          /* Their floor is not the one on screen, so nobody watches them cross
             it — but somebody may well be watching the door at the other end.
             One at a time, and through the door rather than straight onto the
             tarmac, so that standing in the car park when the alarm goes is
             twenty people coming out of a building and not twenty people
             appearing at once in a car park. */
          if (this.now < d.began + k.i * .8) continue;
          const at = World.level === d.to ? d.back : k.spot;
          this.stepThrough(n, d.to, at); k.phase = 'at'; moved = true; continue;
        }
        n.callOut = { tile: d.out, until: this.now + 2, haste: d.haste };
        if (reached(n, d.out)) { this.stepThrough(n, d.to, k.spot); k.phase = 'at'; moved = true; }
      } else if (k.phase === 'at') {
        if (!busy) n.callOut = { tile: k.spot, until: this.now + 2, haste: 1 };
        /* Going back in is given a deadline the way going out is not. Somebody
           who never made it out simply stands down where they are and the day
           carries on; somebody who never makes it back IN is a colleague left
           standing in a car park for the rest of the shift, which is a bug
           whatever caused it. Long enough to walk the length of the tarmac
           twice, and then they are through the door wherever they are — you do
           not watch people arrive at their own desks. */
        if (over) { k.phase = 'in'; k.since = this.now; k.by = this.now + 45; }
      } else {
        if (busy) continue;
        if (n.level !== World.level) {
          /* The same courtesy in reverse: if the floor is what is on screen,
             they come back IN through the lobby doors, one at a time, and walk
             to their desks from there like people. */
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

  /* ---------------- GOING HOME ----------------
     The floor used to be full at every hour the game had, because the game had
     eight of them and all eight were office hours. It has twenty-four now, and
     twenty people at their desks at three in the morning is not atmosphere: it
     is a shift nobody clocked out of.

     So at five they go, and between quarter past eight and nine they come back.
     It is the drill's shape without the drill's round trip — a call-out to the
     front doors, and then off the map — and it is built out of the drill's own
     three primitives, which is why it is a page rather than a system:
     doorSide() finds the square in front of the doors, `callOut` walks somebody
     to a square, and `n.level` decides who is standing on the floor you are
     looking at.

     `away` is a level that is not in the catalogue, deliberately. Everything
     that asks where somebody is gets an honest "not here": refresh() drops them
     from the floor, here() says no, and Guide.aimAcross() finds no route to it
     and leaves the tracker pinless rather than pointing at a door that does not
     lead to Bev's house.

     TWO PEOPLE DO NOT GO. Ron is on the desk and Bev has been here since six
     and will be here at six tomorrow — the report has been saying so at the end
     of every shift since before there was an evening to say it in. An empty
     building is a set; an empty building with two people still in it is this
     building. */
  /* `stays: true` on an NPC keeps them in the building after hours. */
  /* Built once per roster rather than on every read: offDuty() asks it for
     every person every frame, and a filter of the whole cast inside a loop
     over the whole cast was the single dearest thing on a busy island. Still
     an array, because a few readers use .includes() on it; the roster check
     keeps it right if the editor adds somebody. */
  get HOME_STAY() {
    if (this._stayFor !== NPCS || this._stayLen !== NPCS.length) {
      this._stayFor = NPCS; this._stayLen = NPCS.length;
      this._stay = NPCS.filter(n => n.stays).map(n => n.id);
      this._staySet = new Set(this._stay);
    }
    return this._stay;
  },
  stays(n) { this.HOME_STAY; return this._staySet.has(n.id); },
  /* IS THIS PERSON DONE FOR THE DAY.
     It used to be one question with one answer — Sky.staffed(), the fourth
     floor's own hours — because everybody in the roster worked on the fourth
     floor. They do not now: a launderette is open eight till seven and a
     working men's club does not start until noon, and neither of them cares
     what a call centre does at five.

     So a def may carry `hours: [from, to]`, minutes past midnight, wrapping
     over midnight the way `out:` does. Saying nothing still means the office's
     day, which is what twenty of the twenty-one say. HOME_STAY still overrules
     everything: Ron and Bev are in that building whatever the clock does. */
  offDuty(n) {
    if (this.stays(n)) return false;
    const h = n.def.hours;
    if (!h) return !Sky.staffed();
    const m = Sky.m();
    return h[0] <= h[1] ? (m < h[0] || m >= h[1]) : (m < h[0] && m >= h[1]);
  },
  /* WHOSE TURN IT IS TO WALK OUT, in real seconds since the tide turned.
     Stable per person, so the same people are always first out of the door and
     the same people are always last, which is the single most true thing about
     an office at five o'clock — and going is spread far wider than coming back,
     which is not symmetry gone wrong: leaving is twenty separate decisions and
     arriving is a car park draining into a lobby.

     Read by runHome() and by the walk across the town in runErrands(), because
     those are two halves of one exodus and an order they disagreed about would
     be twenty people leaving in one order and arriving in another. */
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
    /* When the tide turned, in real SECONDS. It has to be real seconds and not
       game minutes for the same reason the drill's clock is: what this is
       pacing is people walking across an office, and walking happens in real
       time whatever the clock outside is doing. */
    const after = !Sky.staffed();
    if (after !== this._wasAfter) {
      this._wasAfter = after; this._homeAt = this.now; this._homeSpots = null;
    }
    if (this._homeAt === undefined) this._homeAt = this.now;
    /* Nothing to do, which is almost every frame of almost every shift: either
       everybody who should be here is, or everybody who has gone has. Checked
       BEFORE the level and the door are looked up, because those are a scan of
       a few hundred objects and this is twenty-one boolean comparisons. */
    if (!this.all.some(n => this.offDuty(n) !== !!n.away)) return;

    const hub = Levels.hub();
    const rec = Levels.ensure(hub);
    if (!rec) return;
    /* The door, and A SQUARE EACH around it. The second half is the drill's
       answer to the drill's own problem: one door tile holds one person, and
       twenty people all steering for the same one is not a queue, it is a knot
       — five of them never got within reach of it and stood in the lobby all
       night. crowdSpots() rings the doors with real, free, stable squares, so
       everybody is walking somewhere slightly different and the lobby drains
       instead of seizing. Reaching YOUR square is close enough to the doors to
       have gone through them.

       Cached against the level record rather than recomputed: this runs every
       frame and doorSide() reads every object on the floor. */
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
    /* Can the player actually see this person right now. Both halves matter:
       Cam.visible answers about the level currently on screen, so without the
       level test it says yes to somebody standing at the same coordinates two
       floors up. */
    const onScreen = n => n.level === World.level
      && Cam.visible(n.x, n.y);
    let moved = false;
    for (const n of this.all) {
      if (this.stays(n)) continue;
      /* Stable per person, so the same people are always first out of the door
         and the same people are always last, which is the single most true
         thing about an office at five o'clock.

         Going is spread wider than coming back, and that is not symmetry gone
         wrong: leaving is a decision each of them makes separately, and
         arriving is a car park emptying into a lobby. */
      const off = this.offDuty(n);
      /* AN EVENING OUTRANKS GOING HOME, which is the whole of what an evening
         is. Five o'clock used to be the last thing that ever happened to
         anybody: the doors, the street, their own direction, gone — and a town
         with fourteen rooms in it went dark at the exact hour a town starts.

         Somebody with a window open at five is not going home. They are going
         OUT, and runErrands() below walks them to these same front doors and
         through them to a pub, a club, a bookmaker's or a kebab shop; when it
         shuts, they go home FROM there, which is the other half and is down in
         runErrands() under CLOSING TIME. Nobody with an empty evening notices
         any of this. */
      if (off && this.errandFor(n)) continue;
      /* HOW LONG AN OFFICE TAKES TO EMPTY. Stable per person, so the same
         people are always first out of the door and the same people are always
         last, which is the single most true thing about an office at five
         o'clock.

         Leaving used to be spread over six seconds, which was fine while the
         only thing on the other side of the front doors was a level called
         'away': the whole exodus was over before anybody could have got down
         four floors to look at it. There is a car park out there now — so by
         the time you were through the doors the building would already be
         empty, and the one moment the town most wanted would have happened
         without you. Five o'clock no longer stops the player moving at all
         (see Report.post()), which makes the length of this the only thing
         deciding whether the exodus can be watched.

         Forty seconds instead, which is also simply truer: nobody has ever
         seen an office empty in twenty. Arriving is still tight, because that
         is a car park draining into a lobby rather than twenty separate
         decisions. */
      if (n.def.hours) { if (off !== n._offWas) { n._offWas = off; n._offAt = this.now; } }
      const due = this.leaveDue(n, off);
      if (this.now < due) continue;
      if (off) {
        if (n.away) continue;
        /* Not while you are talking to them. Nobody walks out mid-sentence —
           and the clock does not stop for it either, so they go the moment you
           have finished. */
        if (n.id === talkingTo) continue;
        /* THE DEADLINE, and it is two deadlines, because the honest one is not
           a time at all.

           Walking is in real seconds and the evening is not: twenty people
           crossing thirty tiles at forty pixels a second is half a minute each,
           and half a minute after five o'clock is already twenty past six.
           Waiting for all twenty to physically reach the lobby left the last of
           them still walking at half nine.

           So they give up on the walk — but never where you can see them do it.
           Somebody blinking out of existence in front of you is worse than
           anything the wait costs, and the moment they are off camera it costs
           nothing at all, because what happens to people after they leave a
           room you are in is exactly nothing. The forty-second one is the
           backstop for the case that beats the first: a colleague wedged in a
           doorway in full view is not a person going home, it is a bug you are
           standing and watching. */
        const gone = () => { n.level = 'away'; n.away = true; n.callOut = null; n.homeward = 0; this.hangUp(n); moved = true; };
        /* ---- THE SECOND HALF OF GOING HOME ----------------------------
           Everybody who goes home goes home SOMEWHERE, and until now the
           somewhere was a level called 'away' that is not in the catalogue.
           That was the honest answer while the only room in the game was the
           fourth floor: what happens to people after they leave a room you are
           in is exactly nothing.

           There is a town out there now, and standing in it at five past five
           and watching nothing come out of that building was the one moment
           the whole map stopped being convincing. So a def carries a `home:`
           — a spot on the street and a way of getting to it — and leaving is
           two legs rather than one: out through the lobby, then across the car
           park and off in their own direction, and gone when they get there.

           The machinery is the drill's, and the drill is what proves it works:
           startDrill() has been walking this entire floor out onto `outside`
           since long before this. Somebody with no `home:` behaves exactly as
           everybody did before — the front doors and then nothing. */
        if (n.homeward) {
          /* Leg two. They are on the street, walking to a bus stop or a car or
             a door above a shop, and the same two deadlines apply: give up off
             camera, and give up in view only when standing and watching it has
             become worse than the blink. */
          const h = n.def.home;
          const at = h && h.at && this.townTile(h.at, h.part);
          if (!at) { gone(); continue; }
          n.callOut = { tile: at, until: this.now + 2, haste: 1.35 };
          const arrived = reached(n, at);
          /* WAITING FOR THE 41. Somebody whose way home is a bus does not
             vanish on reaching a bus stop — they stand at it, which is what a
             bus stop is, and they go when the bus comes and not before.

             Only while you are watching. Off camera the deadlines below take
             them, because a person you cannot see standing at a stop for
             ninety seconds is a person who caught it, and nobody was ever
             going to be told otherwise. */
          if (arrived && h.bus && onScreen(n)) {
            if (Cars.stoppedAt(at[0], at[1])) gone();
            continue;
          }
          if (arrived || (this.now > n.homeward + 20 && !onScreen(n)) || this.now > n.homeward + 60) gone();
          continue;
        }
        if (n.level !== hub) {
          /* Somebody in the basement cannot walk to the office's front doors,
             so they are simply not there any more — once nobody is looking.
             Same for a shopkeeper closing up: a launderette shutting is one
             person turning a sign round, not a walk across a car park. */
          if (!onScreen(n) || this.now > due + 40) gone();
          continue;
        }
        const spot = spots[this.hash(n.id) % spots.length] || door;
        n.post = null; n.errand = null;
        /* Faster than they came in. Everybody walks faster at five. */
        n.callOut = { tile: spot, until: this.now + 2, haste: 1.5 };
        if (reached(n, spot) || (this.now > due + 16 && !onScreen(n)) || this.now > due + 40) {
          /* Out of the door. If they have somewhere to be, they are on the
             street now and leg two takes over; if they have not, they are
             simply gone, which is what this has always done. */
          const h = n.def.home;
          const street = h && h.at && this.streetSpot(n);
          if (street) {
            this.stepThrough(n, Levels.street(), street); n.homeward = this.now; moved = true;
            /* You were there when they came out. The profile panel only tells
               you where anybody lives once this is true, because that is when
               you found out: by standing in a car park at five past five and
               watching, rather than by being handed a directory. */
            if (World.level === Levels.street()) G.flags.sawThemGo = true;
          } else gone();
        }
      } else if (n.away) {
        /* Back in through the lobby, one at a time, and they walk to their
           desks from there like people — the schedule takes over the moment
           they are standing on the floor again.

           Unless the building they work in is not this one. Somebody who opens
           a launderette does not arrive through the lobby of a call centre;
           they are simply behind their counter, which is what opening up looks
           like from the street. */
        const home = n.def.level || hub;
        if (home === hub) this.stepThrough(n, hub, door);
        else this.stepThrough(n, home, n.def.desk, n.def.dir);
        n.away = false; n.homeward = 0; moved = true;
      } else if (n.level !== (n.def.level || hub) && !this.onErrand(n) && !this.errandFor(n)) {
        /* ON DUTY AND NOWHERE THEY ARE MEANT TO BE, which was the one gap
           between the two branches above. `away` is how somebody who has gone
           home comes back, and somebody the morning caught out on the street —
           halfway across the town on an errand, or halfway home from one, when
           a clock that runs at twelve times the day's rate overtook the walk —
           is not away. Nothing here had anything to say about them, so they
           stood on that pavement through the whole of the next shift.

           Off camera, as everything of this kind is; the forty seconds is the
           backstop for the case where you are standing looking at them. */
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

  /* WHERE ON THE STREET SOMEBODY COMES OUT. A square each in front of the
     office's own doors, from the same crowdSpots() that keeps twenty people
     leaving at once from arriving at one tile in a knot — worked out here
     rather than written into each person's `home:`, because it is a fact about
     the building's front door and not about any of them. Null when the street
     will not build, and then going home is what it always was. */
  /* A HOME IS A TILE ON THE TOWN, and the town is no longer a map of its own:
     it is a part of the island, at an offset. Written in data/npcs.js as the
     bus stop, the bay, the door above the parade — all of them tiles of
     Bellhaven, which is the frame somebody drawing that data is looking at —
     and translated here, once, rather than twenty-five times by hand into
     numbers nobody could check against anything. See Levels.partOf(). */
  townTile(at, part) {
    const p = part && Levels.partOf(part);
    return p ? [at[0] + p.at[0], at[1] + p.at[1]] : at;
  },
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

  /* ---- OUT OF THE BUILDING, AND BACK ----------------------------------
     The other reason somebody is not at their desk, and the one the office
     never had: they have gone out. Not home — out, to a named tile on a named
     level, between two times, and back afterwards.

     It exists because the street was built and then furnished with strangers.
     There are twenty-one people in this game with faces, expressions, moods
     and dialogue of their own, and the shops behind that street were filled
     with emoji standing on furniture — so a nail bar on the High Street had
     three anonymous heads in it when what it obviously wanted was three
     colleagues who would all rather you had not come in.

     A TABLE, not a special case: `out:` on a def in data/npcs.js says where
     and when, and this is the whole of the engine's half. See the note above
     OUT in that file.

     Modelled on runHome() directly above and sharing its rules, because they
     are the same problem — somebody who should not be standing where they are
     standing — and the rules are what stop it looking like a bug:

       an evacuation and five o'clock both outrank an errand;
       nobody leaves in the middle of a sentence you are having with them;
       and nobody EVER blinks out of existence in front of you. Off camera
       it costs nothing, which is the whole trick, and on camera on the hub
       they walk to the door like people and step through it there.

     What it deliberately does NOT do is walk them along the street. There is
     no route from the fourth floor to a nail bar four levels away that any of
     the pathing here could hold, and there does not need to be one: what a
     player can observe is that Karen left, and that Karen is in there. The bit
     in between is the bit nobody ever watches. */
  /* THE WINDOWS IN SOMEBODY'S DAY, always as a list, because a day has more
     than one hole in it. `out:` was a single window for as long as every
     window in the table was lunch, and lunch is one window; a person who has a
     bacon roll at twenty past eight, a nail bar at one and the Bellhaven Arms
     from ten past five is three, and writing three people to say that was
     never going to be the answer. A def may still write one object and mean
     exactly what it always meant. */
  NO_WINDOWS: [],
  windows(n) {
    const o = n.def.out;
    if (!o) return this.NO_WINDOWS;
    if (Array.isArray(o)) return o;
    /* Wrapped once per person rather than once per frame: this is read by
       errandFor(), and errandFor() is read by destTile() for everybody on the
       floor sixty times a second. */
    return n._windows || (n._windows = [o]);
  },
  errandFor(n) {
    if (!n.def.out) return null;
    const m = Sky.m();
    /* Written the obvious way round and read the wrapping way, so a window
       that crosses midnight — a kebab shop, which is most of what a kebab shop
       is — needs no second entry. First match rather than best: two windows
       that overlap are a mistake in the table, and the table is checked. */
    for (const o of this.windows(n))
      if (o.from <= o.to ? (m >= o.from && m < o.to) : (m >= o.from || m < o.to)) return o;
    return null;
  },
  /* Is this person standing somewhere only an errand would have put them?
     Asked instead of comparing against the one window's level, because there
     is more than one window now and they are in different rooms. */
  onErrand(n) {
    for (const o of this.windows(n)) if (o.level === n.level) return true;
    return false;
  },
  /* WHAT SOMEBODY SAYS WHERE THEY ARE. A window may carry its own `lines:`,
     and while they are standing in it those are what they say instead of their
     own — because six colleagues in a pub at half five are not still talking
     about the printer, and if they were, the pub would not have been worth
     walking to. */
  linesFor(n) {
    const o = this.errandFor(n);
    if (o && o.lines && o.lines.length && n.level === o.level) return o.lines;
    /* And what kind of day they are having, in their own words, when it is a
       day worth mentioning — see Mind.think(), which decides it a few times a
       minute rather than on every line. */
    return Mind.lines(n) || n.def.lines;
  },
  /* THE WAY OUT OF A ROOM THAT IS NOT THE OFFICE: the square in front of its
     own door, and the square of pavement on the other side of it. Both are
     read out of the catalogue rather than written down anywhere — a shop that
     moves takes its own doorway with it — by following the level's link back
     to the street and the entry that link lands on. One-deep cache, which is
     all it needs: it is consulted while ONE person is being watched leaving
     ONE room at closing time. */
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
        /* A SQUARE EACH, which is the front doors' rule and is needed here for
           the front doors' reason: one doorway tile holds one person. Three
           colleagues leaving a nail bar seventeen tiles wide all steered for
           the same square, one of them got it, and the other two stood in the
           chairs for the whole of the afternoon — the walk parks somebody on
           the free square it can claim near where they are going, which was
           never within reach of the tile itself, so only the backstop ever
           freed them. Reaching YOUR square is close enough to the door to have
           gone through it.

           AS MANY AS COULD BE IN THE ROOM and no more. crowdSpots() rings
           outward, so asking for twenty-six of them in a shop fifteen tiles
           wide hands the twenty-sixth a square at the back of it — and walking
           AWAY from a door and then vanishing is a worse thing to watch than
           the knot this is here to prevent. The table knows how many people
           this room can hold: it is how many windows name it. */
        spots: this.crowdSpots(rec, tile[0], tile[1], this.roomFor(id))
      };
    }
    this._ways.set(id, v);
    return v;
  },
  /* How many people the table can put in one room at once. Counted rather
     than guessed, and never fewer than four so a room with one visitor still
     has somewhere to stand when the player is in the doorway. */
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
    /* Cheap first, as runHome() does: nothing to do on almost every frame.
       Somebody needs moving if a window is open and they are not standing in
       it, or no window is open and they are still standing in one. `away` is
       no longer a reason to skip them — an evening is a window that opens
       AFTER they have gone home, and coming back out is the whole of it. */
    if (!this.all.some(n => {
      if (!n.def.out) return false;
      /* Anybody already walking out is work to do whatever the clock says —
         see the commitment below, which is the whole reason this cannot ask
         about the current minute alone. */
      if (n.outAt !== null && n.outAt !== undefined) return true;
      if (n.leaving || n.outward) return true;
      const want = this.errandFor(n);
      return want ? n.level !== want.level : (!n.away && this.onErrand(n));
    })) return;

    const hub = Levels.hub();
    const rec = Levels.ensure(hub);
    if (!rec) return;
    /* A SQUARE EACH at the doors, for runHome()'s reason and not a new one:
       three people out of the same room at the same minute all steering for
       one door tile is not a queue, it is a knot, and Karen, Sarah and Gary go
       to lunch together whether or not any of them would say so. */
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
      /* SETTING OFF IS A COMMITMENT, which is the rule destTile() already
         keeps about the timetable, for exactly the reason it keeps it: the
         window is written in game minutes and the office is crossed in real
         ones. Watched, the walk from a desk to the front doors is fifteen or
         twenty seconds and a lunch hour is twenty-six, so a window that shut
         while somebody was still in the corridor used to turn them round in it
         — and the one person you were actually watching was the one person who
         never once got to go. They go. The forty-second backstop below is
         still the outside edge of it. */
      const open = this.errandFor(n);
      const want = open || (n.outAt === null || n.outAt === undefined ? null : n.outFor);
      const there = !!want && n.level === want.level;
      if (want && !there) {
        /* ALREADY GONE, AND COMING BACK OUT. Somebody who went home at five and
           is due in the club at seven is not standing on any floor to be walked
           off: they are nowhere, and a walk to the front doors has nothing to
           set off from. So they are simply there — which is what every trip
           made off camera has always been, and this is the one where off camera
           is the entire map. */
        if (n.away) {
          n.away = false; n.homeward = 0; n.outAt = null; n.outFor = null; n.outward = null;
          this.stepThrough(n, want.level, want.tile, want.face); moved = true; continue;
        }
        /* ---- ACROSS THE TOWN ----------------------------------------------
           Leg two, and it exists for one scene. At five o'clock ten of the
           twenty are going somewhere rather than home, and until this they
           left the fourth floor and arrived in a pub without ever having been
           on the street in between — which was right while nobody could
           possibly be watching both ends, and wrong the moment there was a car
           park to stand in at five past five. Half the exodus stopped coming
           out of the building.

           So when the player is on the street, they come out of the doors like
           everybody else and walk up it, to the pavement outside the place they
           are going, and go in there. It is the same walk as going home — the
           same map, the same deadlines, the same giving up off camera — and
           the same reason: what is worth paying for is the bit somebody can
           see. When nobody is out there this never runs and they are simply
           in the shop, which is what every trip made off camera has always
           been.

           If the window shuts while they are still walking it, they are on a
           street at the end of the day with nowhere to be, and going home is
           exactly what that is: runHome's own second leg takes them. */
        if (n.outward) {
          if (!open) {
            n.outward = null; n.outAt = null; n.outFor = null; n.callOut = null;
            /* Off duty they are on a street at the end of the day with nowhere
               to be, and going home is exactly what that is: runHome's own
               second leg takes them. On duty they are on a street in the middle
               of a shift, which is a different problem with the same shape, and
               they go back to work. */
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
          /* A SHORT LEAD, and shorter than going home's. What is worth watching
             is somebody coming out of that building and setting off up the High
             Street; the sixty tiles after that are the bit nobody watches, and
             every second spent on them is charged at the evening's clock, which
             is running at four times the day's. Walk it out in full and the
             last of them reaches the pub at half eleven and it has shut. So
             they are gone a few strides after they leave the frame — which is
             also what happens to anybody you watch walk off up a road. */
          if (reached(n, n.outward) || (this.now > n.outAt + 8 && !onScreen(n))
              || this.now > n.outAt + 30) {
            n.outward = null; n.outAt = null; n.outFor = null; n.callOut = null;
            this.stepThrough(n, want.level, want.tile, want.face); moved = true;
          }
          continue;
        }
        /* On the way out. Off camera they are simply there, which is the whole
           trick and costs nothing; in view they walk to a door and go through
           it there.

           WHICH DOOR is no longer only the office's. It was, because every
           window in the table started on the fourth floor and ended on the
           fourth floor; a launderette has a door too, and Pat leaving hers for
           the post office at one o'clock in front of somebody standing in it is
           the same bug as anybody blinking out of anywhere. wayOut() gives any
           room on the street its own, out of the catalogue. */
        /* Setting off across it. Asked BEFORE the off-camera shortcut below,
           because somebody on the fourth floor is never on camera to a player
           standing in the car park and the walk that is worth watching starts
           at the front doors rather than at a desk: crossing the office is the
           invisible half and is skipped, exactly as it always was.

           In their own turn, in the same order as the people going home, from
           the same table — see leaveDue(). At five that is a building emptying
           over forty seconds; at lunch the tide turned hours ago and three
           people who go to the nail bar together go together. */
        const across = open && n.level === hub && World.level === Levels.street()
          && this.wayOut(want.level);
        if (across) {
          /* And they WAIT for their turn rather than being let past it. This
             is a `continue` and not a condition on `across` for the reason the
             whole scene exists: falling past it lands on the off-camera
             shortcut below, which is instant, so every one of them was in the
             pub within four seconds of five o'clock and the doors they were
             supposed to come out of stayed shut. */
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
        /* The backstop that home time keeps, and for its reason: the walk is in
           real seconds and lunch is not, so a colleague wedged in a doorway in
           full view is not a person going to lunch, it is a bug you are stood
           watching. The off-camera deadline it used to have alongside this can
           no longer fire — going off camera is caught a few lines above and
           takes them immediately. */
        if (reached(n, leave) || this.now > n.outAt + 40) {
          n.callOut = null;
          n.outAt = null; n.outFor = null;
          /* AND THE CLOCK MAY HAVE BEATEN THEM TO IT, in which case they do not
             go: arriving somewhere as it shuts and turning round in its doorway
             is a worse thing to have watched than not setting off. Which is the
             honest edge of all of this and is worth writing down. Watched, a
             walk across this floor is fifteen seconds and Bev's is thirty-five;
             a window is between nineteen and thirty real seconds during the
             shift and a great deal less in the compressed hours, so somebody
             far enough from the doors at a fast enough hour can set off, walk
             the whole way, and be too late. Off camera — which is very nearly
             always, since this asks whether they are in the VIEWPORT and not
             whether you are on the same floor — none of it happens at all: they
             are simply there. It degrades to somebody who nearly went out, and
             an office is full of those. */
          if (open) { this.stepThrough(n, want.level, want.tile, want.face); moved = true; }
        }
      } else if (!want && this.onErrand(n)) {
        /* ---- IT IS OVER, ONE WAY OR THE OTHER -----------------------------
           Two endings, and the same walk to the same door serves both.

           BACK TO WORK is the one this always had. Through the lobby, exactly
           as somebody arriving in the morning does, so the timetable picks them
           up and walks them to their own desk. Not always the lobby of a call
           centre, since the six people who do not work in one go out too:
           somebody whose own building is a launderette comes back to her own
           counter, because reopening is one person turning a sign round and not
           a walk through anybody's reception.

           CLOSING TIME is the new one, and it is where an evening ends. Until
           this, the only way out of a window was back to the fourth floor,
           which was right while every window in the table was lunch and is
           nonsense at half ten at night: it walked somebody out of a pub,
           across a town and into an empty building, so that five o'clock could
           then send them home from it. Somebody off duty goes home from HERE —
           onto the pavement outside the door they are standing at, where
           runHome()'s second leg takes them the rest of the way, to the stop,
           to a car, to a door beside the post office. Which means the last you
           ever see of anybody is the same whether they have just left a
           building or a bar. runHome() can reach them at all only because the
           window that was holding it off has this minute closed.

           And in view they WALK OUT, either way. That is not a flourish: it
           used to be a wait — they stood in the shop until you looked away,
           because nothing here could walk somebody out of one — so standing in
           the nail bar all afternoon kept Karen in it all afternoon, and cost
           her the post office at half two as well. */
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
            /* You were there when they went. Which is the same discovery as
               standing in the car park at five past five and is allowed to
               unlock the same line in the profile panel: you found out where
               somebody lives by being in the room they left. */
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

  /* Hand the routes the people. Three times a second rather than sixty: a crowd
     shuffling about would otherwise rebuild every route on the floor every
     frame, and none of this changes fast enough to notice.

     A colleague standing somewhere is a square worth going round. YOU standing
     somewhere, once you have actually stopped, are a square nobody can cross —
     which is the whole point: with you in the only doorway the break room comes
     back unreachable, and fifteen people who would otherwise walk into your
     back and shove find that out before they set off. Move, and it is a door
     again within a third of a second. */
  dynamics() {
    if (this.now < this.dynAt) return;
    const dt = this.now - this.dynAt + .34;
    this.dynAt = this.now + .34;
    const slow = [], block = [];
    for (const n of this.list) if (!n.walking) slow.push(Math.floor(n.x / TILE) + ',' + Math.floor(n.y / TILE));
    if (G.state === 'play') {
      this.stillFor = P.moving ? 0 : this.stillFor + dt;
      const k = Math.floor(P.x / TILE) + ',' + Math.floor(P.y / TILE);
      /* Standing still you are worth going a long way round; walking you are
         worth going round the way a colleague is, because you will probably not
         be there by the time they arrive. Being in the map ONLY when stopped
         was why somebody walking towards you would keep coming until they were
         nose to nose with you: while you were moving there was nothing in the
         map to go round. */
      if (this.stillFor > .35) block.push(k); else slow.push(k);
    } else this.stillFor = 0;
    Nav.setDynamic(block.join('|') + '#' + slow.join('|'), block, slow);
  },
  /* Is the manager standing over this person right now, somewhere it matters.
     At a desk or anywhere on the main floor it matters; in the break room at
     lunch it does not, and everybody in this building knows the difference. */
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
    /* Before the walk, not after it: a drill moves people between levels, and
       who is standing on this one is what the whole of the walk below reads.
       Home time is the same kind of thing and goes in the same place — and
       after the drill, because it stands down for one. */
    this.runDrill();
    this.runHome();
    /* After home time, which outranks it: somebody who has gone home has not
       nipped out to the shops, whatever the table says. */
    this.runErrands();
    /* And after those, because both of them outrank it: somebody who has gone
       home has not gone upstairs, and somebody in the pub is not due back on
       the fifth floor until the window shuts. */
    this.runCommutes();
    this.dynamics();
    /* After everything with a claim on where somebody is, and before the walk
       that reads what the mind decided. */
    this.grid();
    Mind.update(dt);
    /* Where everybody who is standing still is standing, once per frame, as
       tile keys. The walk below prices these up so a knot of people is walked
       round rather than into — and nothing else reads it, so it is rebuilt
       rather than maintained. */
    this.busyTiles.clear(); this.stillTiles.clear();
    for (const n of this.list) if (!n.walking) {
      const k = Math.floor(n.x / TILE) + ',' + Math.floor(n.y / TILE);
      this.busyTiles.add(k); this.stillTiles.set(k, n);
    }
    if (G.state === 'play') {
      const k = Math.floor(P.x / TILE) + ',' + Math.floor(P.y / TILE);
      this.busyTiles.add(k);
      /* Only when you have actually stopped: waiting behind somebody who is
         walking is waiting for nothing, and they are gone next frame anyway. */
      if (!P.moving) this.stillTiles.set(k, P);
    }
    /* The one colleague everybody looks busy for: `boss: true` in NPCS. */
    this.boss = this.list.find(x => x.def && x.def.boss) || null;
    /* Whoever you are talking to stands still until you have finished. They
       used to keep walking their schedule mid-sentence and simply leave, which
       reads as a bug even when the dialogue carries on perfectly well. The rest
       of the floor keeps moving — the office does not stop for a chat. */
    const talkingTo = (Dialogue.on && Dialogue.npc && Dialogue.npc.id) || null;
    const playing = G.state === 'play';
    this.list.forEach(n => {
      n.bob += dt * 3.2;
      if (n.sayT > 0) n.sayT -= dt;
      if (n.lookT > 0) n.lookT -= dt;
      if (n.chatCool > 0) n.chatCool -= dt;
      /* Edging past you lasts until they are past you. Ticking it down on a
         timer meant the squeeze expired the instant it started working: they
         inched forward, that counted as movement, the wait reset, and the whole
         negotiation began again — about a fiftieth of a square at a time. */
      if (n.squeeze > 0) {
        if (G.state === 'play' && Math.hypot(P.x - n.x, P.y - n.y) < TILE * 1.3) n.squeeze = 1.2;
        else n.squeeze -= dt;
      }

      if (talkingTo && n.id === talkingTo) {
        /* Being spoken to. They stop, they break off whatever they were saying
           to somebody else, and they look at you: a colleague who answers a
           question with their back to you is the single most obvious tell that
           nobody is home behind the sprite. */
        n.walking = false; this.hangUp(n);
        n.dir = this.face(n, P.x - n.x, P.y - n.y);
        return;
      }
      if (n.stunTimer > 0) { n.stunTimer -= dt; n.walking = false; return; }

      const [dx, dy] = this.destTile(n);
      const key = n.dest + ':' + dx + ',' + dy;
      /* The timetable has moved them on. Give up the square of carpet, and stop
         talking — you can be mid-sentence when it gets to half past, and that
         is what an office sounds like. */
      if (key !== n.destKey) { n.destKey = key; n.post = null; this.hangUp(n); this.repath(n); }

      /* Long enough waiting for the door to clear: have another look. If it is
         still blocked they will be back here in a moment, having lost nothing
         but a glance down the corridor. */
      if (n.retry && this.now > n.retry) { n.retry = 0; n.post = null; this.repath(n); }
      const [tx, ty] = this.post(n, dx, dy);
      const cx = n.x / TILE - .5, cy = n.y / TILE - .5;
      /* Arriving is closer than leaving: a settled person who is nudged half a
         square by somebody squeezing past does not set off walking again, which
         used to flick the walk cycle on and off where a room was busy.

         And standing IN the square, having stopped getting any closer to the
         middle of it, is arriving too. A person whose square is ringed by other
         people is held off its centre by the very act of everyone giving each
         other room: they were within a foot of where they were going and spent
         the rest of lunch being pushed off it and walking back. */
      const near = Math.hypot(tx - cx, ty - cy);
      const onPost = Math.floor(n.x / TILE) === tx && Math.floor(n.y / TILE) === ty;
      /* Parked is a decision, not a distance. Somebody who has stopped
         somewhere stays stopped until the square changes under them or they are
         shoved the better part of a square off it — not because a colleague
         squeezed past and the arithmetic briefly said they were half an inch
         too far away. That reading is what had people setting off again the
         instant they arrived. */
      if (n.parked && (near > 1.05 || (!onPost && near > .8))) n.parked = false;
      const there = n.parked || near <= (n.walking ? .34 : .62) || (onPost && n.noProg > 1.5);
      if (!there) this.walk(n, dt, tx, ty);
      else {
        if (n.walking) this.repath(n);
        n.walking = false; n.parked = true; n.waitDoor = 0;
        /* AND THEY ARE NOT WAITING FOR ANYBODY ANY MORE. `waitingFor` is set
           and cleared inside the walk, and somebody who has arrived does not
           go through the walk again — so the last person they queued behind on
           the way here stayed written on them for the rest of the day. Two
           readers believe it: makeWay, which has them stepping aside for a
           walk that finished ten minutes ago, and holdOn, which reads a
           standing person carrying a stale one as the middle of a queue and
           makes whoever is behind them hold the line for twenty-five seconds
           in front of somebody who is never going to move. */
        n.waitingFor = null;
        /* Got there. From here the errand is a thing that happened rather than
           a thing being attempted, and the clock on standing about starts. */
        if (n.errand && !n.errand.arrived) n.errand.arrived = this.now;
        this.makeWay(n, playing);
        this.nestle(n, dt, tx, ty);
        this.settle(n, dt, dx, dy, playing);
      }

      this.chatter(n, dt, playing, talkingTo);

      /* The one-liners. Unchanged in what they are and when they fire, except
         that somebody already talking to a colleague does not also mutter to
         themselves over the top of it — and that what they have to say now
         depends on where they are standing. See linesFor(). */
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
    /* A route not built yet, on a frame that has already built its share,
       waits its turn: one frame of standing is invisible, and forty people
       all choosing somewhere new at half past used to be a frame that took
       forty milliseconds. Progress is not charged for the wait. */
    if (!Nav.ready(tx, ty)) return;
    const fx = Math.floor(n.x / TILE), fy = Math.floor(n.y / TILE);
    /* Is this walk actually getting anywhere, in STEPS LEFT TO WALK rather than
       as the crow flies.

       Two mistakes, one after the other. `stuck` counted frames in which
       nothing moved at all, and somebody shuffling sideways round a crowded
       break room moves perfectly well on every one of them while getting no
       closer to anything for half a minute. Straight-line distance fixed that
       and introduced a worse one: the way out of a room is often in the
       opposite direction to where you are going, so anybody walking up the
       floor to reach a door was, by that measure, going backwards, and a long
       enough corridor would have had them abandon a perfectly good walk in the
       middle of it. The field already knows the real answer and it is one
       array lookup. */
    const far = Nav.steps(fx, fy, tx, ty);
    /* There is no way there at all right now — somebody is standing in the only
       door. Not a reason to walk at it: a reason to wait.

       Unless the sweep simply has not come this far. A field is capped at forty
       thousand squares — see Nav.CAP — and beyond that edge every tile reads
       -1, exactly as a tile behind a locked door does. Waiting there would be
       standing still because the kettle is a long way off. Walk towards it on
       the straight line below until the field has something to say. */
    if (far === null && Nav.mask && !Nav.partial(tx, ty)) return this.waitOut(n);
    const d = far === null ? Math.hypot(tx - (n.x / TILE - .5), ty - (n.y / TILE - .5)) : far;
    if (d < n.best - .1) { n.best = d; n.noProg = 0; } else n.noProg += dt;
    /* Which tile to cross to, decided ONCE per tile entered and then held.
       Somebody standing in the next square is a reason to go round them, worth
       about two and a half steps of detour — but the people in the way move,
       and re-asking every frame meant the answer changed under a walker
       mid-stride and swung them about. It can only ever choose between tiles
       already closer than this one, so it cannot send anybody backwards, in a
       circle, or through a wall. */
    const from = fx + ',' + fy;
    /* Decided once per square entered and then held. Re-asking when somebody
       walks into the chosen square sounds obviously right and is not: the
       routes already price people standing still, so the answer would flip
       between "the square beside you looks better from here" and "this one
       looks better from there" — and in a crowded room, where the chosen square
       is somebody else half the time, it cost a third of the floor their lunch.
       The map does the going-round; this only has to follow it. */
    if (n.nextFrom !== from) {
      n.nextFrom = from;
      /* The second term is a lane. Twenty people walking the same corridor to
         the same room have the same field in front of them and, without this,
         take the identical squares in the identical order and arrive as one
         lump. A fixed dislike of particular squares, different for each person
         and worth well under a step, breaks that tie differently for each of
         them: the same crowd fans out across the width of the corridor and
         reads as people going the same way rather than a queue of one file. */
      /* Both terms are worth less than a single step, deliberately. The routes
         themselves now price people standing still — six squares for a
         colleague, fourteen for you — and that is a global cost every square
         agrees on. A big LOCAL penalty on top of it fights the route: with you
         on the one square into the break room, the square beside you looked
         cheaper from here and the route looked cheaper from there, and somebody
         crossed between the two for the rest of the afternoon. So: a nudge to
         step around somebody where it costs nothing, a per-person dislike of
         particular squares so a crowd fans out across a corridor, and no
         opinion strong enough to argue with the map. */
      n.next = Nav.next(fx, fy, tx, ty, (x, y) =>
        (this.busyTiles.has(x + ',' + y) ? 2.5 : 0) + (this.hash(n.id + ':' + x + ',' + y) % 64) / 100);
    }
    const step = n.next;
    /* Waiting for somebody to come the other way through a door. Standing, not
       shuffling: a queue at a door is people standing behind each other, and a
       walk cycle running on the spot is the tell that nothing is really being
       simulated. Held for its whole duration rather than re-asked every frame,
       or they flicker between standing and walking sixty times a second. */
    if (n.waitDoor > 0) {
      n.waitDoor -= dt; n.walking = false;
      /* Waiting your turn is not failing to get anywhere: without this, a busy
         door would eventually convince somebody that the walk was hopeless and
         send them to stand somewhere else. */
      n.noProg = Math.max(0, n.noProg - dt);
      return;
    }
    /* SOMEBODY IS STANDING IN THE NEXT SQUARE, SO WAIT.

       This is the queue, and it is the piece that was missing. The route knows
       about people standing still and prices them at six squares — so if it
       still wants to go through one, there is no way round worth taking, and
       walking into their back is not going to produce one. Stop and wait.

       It propagates, which is the point: the first person waits for you, the
       second waits for the first, and a line forms back down the corridor
       instead of everybody arriving at the same square and shoving. That was
       the mob. Nobody was ever waiting for anybody. How long they wait, and
       for whom, is holdOn below. */
    const who = step && this.stillTiles.get(step[0] + ',' + step[1]);
    /* Somebody in the way, whether or not we are still prepared to wait for
       them, is not the walk failing — it is the walk queueing. Six people gave
       up three steps from the fire escape door and stood in the lobby for the
       whole drill because the clock on a hopeless walk kept running while they
       were second in a queue. */
    if (who) n.noProg = Math.max(0, n.noProg - dt);
    /* Twenty seconds of queueing for a door somebody is standing in is long
       enough to decide you did not want a coffee that much. The errand is
       dropped and the day moves on — which is what stops the entire floor
       accumulating in one corridor while you read a poster. */
    if (n.queued > 20) {
      n.queued = 0; n.errand = null; n.post = null; n.holdWant = null;
      this.repath(n); n.walking = false;
      return;
    }
    /* Waiting for YOU, and it has gone on long enough: they are going to edge
       past. Set outside the branch below and refreshed while you are still
       there, because once the wait is spent they stop taking that branch at all
       — and a squeeze that expires the moment it is needed is a person walking
       up to you, deciding to get past, and then not. */
    if (who === P && n.queued > 2) n.squeeze = 1.2;
    /* AND YOU ARE THE ONE IN THE DOORWAY.

       Then you cannot wait, whoever is in front of you and however good their
       reason: everybody on both sides of the wall is behind you, and the one
       thing that has to happen is that the door stops having a person in it.
       Colleagues get out of the way first — makeWay is asked the moment
       somebody waits on their square — but a break room with twenty people in
       it is a room where there is nowhere for the person by the door to step
       to, and the answer to that cannot be for the door to stay corked for the
       rest of lunch.

       So: the same breathing-in they do to get past you, a beat sooner. It is
       what somebody actually does coming out of a doorway into a busy room —
       they turn sideways and go — and it is the only move that always exists.
       See `squeeze` in canGo. */
    if (who && who !== P && n.queued > 1.5 && this.inDoorway(fx, fy)) n.squeeze = 1.2;
    /* HEAD-ON AT THE DOOR: SOMEBODY IS IN IT AND YOU ARE STANDING ON THE
       SQUARE THEY ARE COMING OUT ONTO.

       This is the jam, and waiting is what causes it. Nobody's destination is
       ever a doorway — post() and every fallback that hands out a square refuse
       to give one — so a colleague in a doorway is a colleague trying to get
       out of one, and when the way out is the square you are queueing on, the
       two of you are a cork: they cannot leave the door, so the door never
       clears, so nobody behind either of you moves. Both of you waiting
       politely is exactly how it lasts until the end of the break.

       So step out of the mouth of the door and try again in a few seconds. It
       is what people do at a door somebody is coming through, and it costs the
       walk nothing — the square was never theirs, it was on the way to one.

       The second half is the same thing where they have given up and stopped in
       the doorway rather than aiming at you. A moment first, because a doorway
       is somewhere people pause for a frame on their way through, and a
       corridor that scatters every time somebody hesitates is not a corridor.

       Not from inside a doorway yourself — backing out of one door into another
       helps nobody, and the pair of them can sort it out with the squeeze
       above. */
    if (step && this.inDoorway(step[0], step[1]) && !this.inDoorway(fx, fy)) {
      const o = this.list.find(o => o !== n && Math.floor(o.x / TILE) === step[0]
        && Math.floor(o.y / TILE) === step[1]);
      if (o && ((o.next && o.next[0] === fx && o.next[1] === fy) || (o === who && n.queued > .8))) {
        n.queued = 0;
        return this.waitOut(n, true);
      }
    }
    if (who && this.holdOn(n, who)) {
      /* Counted every frame. It used to set the quarter-second hold below as
         well, which returns before this line — so waiting for twenty seconds
         put about one and a half on the clock, nobody ever reached the point of
         edging past, and a person in a doorway was a wall after all. */
      n.queued += dt; n.walking = false;
      n.waitingFor = who === P ? 'player' : who.id;
      n.dir = this.face(n, (step[0] + .5) * TILE - n.x, (step[1] + .5) * TILE - n.y);
      /* If it is you in the way, they look at you. It is the only way to tell
         from the screen that you are the reason nothing is happening. */
      if (who === P) { n.lookAt = P; n.lookT = Math.max(n.lookT, 1.2); }
      /* And they hold their own square while they wait rather than pressing up
         against the back of the person in front, so a queue is a line of people
         one square apart instead of a heap with a direction. */
      this.nestle(n, dt, fx, fy);
      return;
    }
    n.waitingFor = null;
    /* THE DOOR IS CLEAR AND THE ROOM BEHIND YOU IS NOT.

       doorClear() promises that somebody facing a wall of people turns sideways
       and edges out of a doorway, and they do — `squeeze` is handed out from
       inside one. Nobody ever handed it out to the person trying to get INTO
       one, and that is the person the whole queue is behind.

       What it looks like from the floor: ten people converge on the square
       outside a doorway, pack in until every gap is the shoulder's width canGo
       allows, and then the one at the front — walking, with the doorway empty
       and its turn to use it — cannot take a single step, because every
       direction closes the gap with somebody and canGo refuses a step that
       closes any gap with anybody. The door stayed empty for ninety-two per
       cent of a three-minute run with twelve people queueing to use it.

       So the same breathing-in, on the same terms, a square earlier: they have
       been trying and failing to move for a third of a second, the square they
       want is a doorway, and it is theirs to take. Narrow on purpose — handed
       to everybody who is held up, it is not a person edging through a gap, it
       is a crowd with its collision turned off, and they all end up standing on
       the same square. */
    if (step && n.stuck > .35 && this.inDoorway(step[0], step[1])
      && this.doorClear(n, step[0], step[1])) n.squeeze = Math.max(n.squeeze, 1.2);
    if (step && this.inDoorway(step[0], step[1]) && !this.doorClear(n, step[0], step[1])) {
      n.walking = false; n.waitDoor = .2;
      n.noProg = Math.max(0, n.noProg - dt);
      n.dir = this.face(n, (step[0] + .5) * TILE - n.x, (step[1] + .5) * TILE - n.y);
      return;
    }
    /* No next tile means one of two things and the same answer does for both:
       the last stretch across the destination tile itself, and a destination
       the sweep never reached — somebody standing inside a desk, or a way that
       is walled off — where walking straight at it is what this always did. */
    const ax = step ? (step[0] + .5) * TILE : (tx + .5) * TILE;
    const ay = step ? (step[1] + .5) * TILE : (ty + .5) * TILE;
    let vx = ax - n.x, vy = ay - n.y;
    const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
    const gx = vx, gy = vy;
    const [sx, sy] = this.separate(n);
    vx += sx * .8; vy += sy * .8;
    if (n.evade > 0) { n.evade -= dt; vx += n.evadeX * .8; vy += n.evadeY * .8; }
    /* Give way, but never walk backwards to do it. Twelve people converging on
       one break room push each other about hard enough that the sum of the
       shoves can point the wrong way down the corridor, and somebody who has
       been pushed out of the room walks back in, and is pushed out again, for
       the whole of lunch. Anything that would reverse the walk is folded back
       towards where they were going: they still slide round each other, they
       just do it while making progress. */
    if (vx * gx + vy * gy < .2) { vx = vx * .35 + gx * .9; vy = vy * .35 + gy * .9; }
    const l2 = Math.hypot(vx, vy) || 1; vx /= l2; vy /= l2;
    /* Turn towards it rather than snapping to it. Everything above — the next
       tile, who is in the way, which side to squeeze past — can change between
       one frame and the next, and applied raw that is a person twitching. A
       fifth of a second of turn takes all of it out and costs about a fifth of
       a tile of accuracy, which no wall is close enough to mind. */
    const turn = 1 - Math.pow(.004, dt);
    n.hx += (vx - n.hx) * turn; n.hy += (vy - n.hy) * turn;
    const hl = Math.hypot(n.hx, n.hy) || 1;
    vx = n.hx / hl; vy = n.hy / hl;

    /* Easing in, and not barging: somebody arriving slows into the last square
       rather than stopping dead on it, and somebody walking up behind a person
       who is standing still slows down instead of shoving.

       Not both at once, and neither of them far from the target. Compounded —
       and measured in steps rather than in distance, which meant the whole last
       square — they multiplied out to a fifth of walking pace across a crowded
       room, and twenty people crawling the last stretch is twenty people
       arriving in a heap. */
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
      /* Slide along whichever axis was doing most of the work first, so
         somebody squeezing past a partition keeps going forwards rather than
         setting off sideways down the room. */
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
      /* Which way they are facing, from the held heading rather than from the
         last frame's step: the step is a fraction of a pixel and squeezing past
         a desk makes it point sideways for a moment, which used to turn them. */
      n.dir = this.face(n, n.hx, n.hy);
    } else {
      n.stuck += dt;
      /* Blocked by a person rather than a wall — the walls are already routed
         around. Step to your OWN RIGHT, always, and commit to it for half a
         second.

         Which side used to be a coin toss, and a coin toss is how two people
         end up doing the little dance in a doorway: both of them step the same
         way, block each other again, and roll again. Everybody keeping right is
         the rule actual corridors run on — two people walking into each other
         both step right and pass, without either of them having to know that
         the other one exists. */
      if (n.evade <= 0 && n.stuck > .45) {
        const rx = -vy, ry = vx;
        const ok = this.canGo(n, rx * TILE * .3, ry * TILE * .3);
        n.evadeX = ok ? rx : -rx; n.evadeY = ok ? ry : -ry; n.evade = .6;
      }
      /* AND NOT MOVING AT ALL IS NOT PROGRESS, whatever the field says.

         `noProg` is measured in steps left to walk, which is the right measure
         and has one property nobody accounted for: it is a number about a map
         with PEOPLE in it. Eight of them shuffling round a doorway move the
         count up and down by a step or two a second, and every new low resets
         the clock — so somebody wedged in the middle of them, who has not moved
         a pixel in nine and a half seconds, reads frame after frame as a walk
         that is getting somewhere. It is not. It is a person who cannot move,
         and the clock that would have given the walk up and sent them round
         another way never starts.

         Half a second of that is a stumble and is what `evade` above is for.
         Three seconds is the walk failing, and then the two clocks are made to
         agree. Twice the ordinary rate, which nets out against the queueing
         credit above at about a second to the give-up threshold either way —
         and a second rather than never is the whole of the difference. */
      if (n.stuck > 3) n.noProg += dt * 2;
    }
    /* And whether or not this frame moved them, has the walk as a whole given
       up on itself. */
    if (n.noProg > 2.5) this.giveUp(n, tx, ty, d);
  },
  /* A walk that has stopped getting anywhere.

     Near enough: somebody two squares from where they were going, held up by
     people, has arrived as far as anyone watching is concerned. They take the
     square they are standing on — which is what a person does — and it becomes
     theirs, so nobody walks into it either.

     Not near enough: give the square up and take another, remembering the one
     just abandoned so the same jam is not chosen again a second later.

     And still nothing, out of sight: the last resort, which is the teleport
     this always had and which almost never fires now. */
  giveUp(n, tx, ty, d) {
    /* "Near enough" is the room, not a radius. Somebody who has got into the
       break room and cannot cross it because the break room is full of people
       is not stuck — they are in the break room, which is where they were
       going, and they should stand still and be in it. Measuring this in tiles
       instead was what kept the last few arrivals walking into backs for the
       whole of lunch. */
    const hx = Math.floor(n.x / TILE), hy = Math.floor(n.y / TILE);
    /* AN EVACUATION IS NOT SOMEWHERE YOU CAN BE NEAR ENOUGH TO. "Near enough is
       the room" is right for a coffee and wrong for a door you are leaving
       through, and outdoors it is wrong by a whole car park: a zone out there
       is a street, so the first stall on the way back to the building parked
       four people forty feet from it, for good, standing in a car park they had
       already been told to leave. They keep going instead — the noProg branch
       below is the recovery, and the drill's own deadline is the backstop. */
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
  /* SOMEBODY IS WAITING FOR YOU. MOVE.

     The last thing missing, and the one that turns every remaining jam back
     into people. Anyone who has stopped somewhere can be standing exactly where
     somebody else has to walk, and until now the answer was for the other
     person to wait — for ever, if the spot was in a corridor a square wide.
     A fire drill ended with Bev parked in the one lane into the stairwell and
     seven colleagues queueing behind her in perfect order for the whole of it.

     So: if anybody is waiting on the square you are standing on, take a
     different one. Same for you walking into somebody — they get out of your
     way rather than making you go round, which is the difference between a
     crowd and a set of bollards.

     They keep the new square. Where they stand is not the point; that they are
     in the break room is. */
  /* Sitting down, as the renderer means it: stopped on a chair. */
  seated(n) {
    return !n.walking && !!Sprites.seatedAt(Math.floor(n.x / TILE), Math.floor(n.y / TILE));
  },
  makeWay(n, playing) {
    /* Nobody stands up for you. They are sitting down — at a break table, in
       the meeting room, in the Good Chair — and a chair is not in anybody's
       way: you walk round it, as you would. Getting up because somebody came
       near was the single least human thing on this floor. */
    if (this.seated(n)) return;
    /* And back again, once whoever it was has gone past. Stepping aside has to
       be a step aside: without the way back they take the new square as theirs,
       get asked again by the next person, take another, and by the end of lunch
       have been shuffled across the room by a series of individually reasonable
       decisions. That is the arriving-then-wandering-off this had before, back
       by a different road. */
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
    /* And for you, only when you are actually walking INTO them rather than
       past them or round them: near, moving, and moving towards. Standing next
       to somebody is not a request for them to move. */
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
  /* How long to wait for whoever is in the next square, which depends entirely
     on whether they are ever going to move.

     YOU: indefinitely. You are a person, you are going somewhere, and walking
     into your back would not make you go there faster.

     Somebody waiting in a queue: indefinitely as well, because the queue clears
     from the front — unless they are waiting for US, which is two people being
     polite at each other for the rest of the shift. That one is settled by
     name, so exactly one of the two gives up and squeezes past.

     Somebody who has arrived and is standing at their spot: three seconds, and
     then squeeze past them. They are not going anywhere at all, and a colleague
     standing between you and the kettle is not a reason to give up on tea. */
  holdOn(n, who) {
    /* Two and a half seconds for anybody, and then edge past them.

       It used to be "wait for the player indefinitely", on the grounds that you
       are going somewhere and walking into your back will not help. True, and
       it made three squares of the building — a doorway and the square either
       side of it — into a wall whenever you stood on one, because two people
       cannot be in a one-square gap at once. Nobody would put up with that in a
       corridor; they wait a moment, and then they edge past you, and everybody
       pretends not to notice. See `squeeze` in canGo.

       That second rule started out cleverer — wait for as long as they are
       waiting for somebody who is not you, because a queue clears from the
       front — with a tie-break for two people politely waiting for each other.
       It handled two. Nine people at a break room door wait in a ring, A for B
       for C for A, and no pairwise rule sees it: they stood in the corridor
       mouth for the rest of lunch being immaculately polite. A bounded wait
       cannot deadlock however many people are in the knot, and two and a half
       seconds is still long enough that an ordinary queue never reaches it. */
    /* You: a couple of seconds, then edge past — see `squeeze` in canGo.
       A colleague: six, which is long enough that a queue always clears from
       the front before anybody in it gives up, and short enough that a ring of
       people politely waiting for each other cannot last. Bounded, because no
       pairwise politeness rule can see a ring of nine. */
    if (who === P) {
      /* ONE person edges past you after a couple of seconds. A QUEUE waits.
         Somebody getting on with their day squeezes by and you barely notice;
         twelve people doing it one after another is a scrum going through you,
         and the difference between the two is whether anybody is queueing
         behind them. The head of a queue holds the line — and the twenty
         seconds that drops an errand drains it if you stay put. */
      return this.list.some(o => o !== n && o.waitingFor === n.id) || n.queued < 2.5;
    }
    /* Behind somebody who is themselves waiting, this is a queue and queues
       clear from the front, so hold the line. Behind somebody who has simply
       stopped somewhere, two and a half seconds and then go round them.

       Neither is unbounded. A ring of people politely waiting for each other
       cannot be seen by any rule that only looks at one pair, so the long wait
       is long rather than infinite, and the twenty seconds that drops the
       errand entirely sits behind it as a backstop. */
    /* Never long from inside the doorway itself. The queue behind the person in
       front of you is one queue; the two queues behind YOU are both of them,
       and they are not moving until you are out of the door. */
    if (this.inDoorway(Math.floor(n.x / TILE), Math.floor(n.y / TILE))) return n.queued < 1.5;
    /* Unless it is YOU they are waiting for. Two people waiting for each other
       is not a queue with a front to clear, it is a face-off, and the long wait
       turns it into half a minute of nothing. The pair is all this can see —
       a ring of nine is still the bounded wait's problem — but a pair at a
       doorway is the one that happens every lunchtime. */
    if (who.waitingFor === n.id) return n.queued < 2.5;
    /* AND A RING IS NOT A QUEUE, which is the whole of why the long wait is
       ever wrong. A queue has a FRONT: follow the chain of who is waiting for
       whom and it ends at somebody who is waiting for nobody, who is about to
       move, and holding the line behind them is exactly right. Follow it in a
       ring — nine people round a break room door, each politely waiting for
       the next — and it comes back round to you. There is no front, nothing is
       about to move, and every one of them settles in for twenty-five seconds.
       Half a minute of an entire floor standing still, which is what it looked
       like: the longest frozen stretch in the doorway harness was thirty
       seconds, and every second of it was people being immaculately polite.

       So the long wait is for a queue with a front, and a ring gets the short
       one. Pairs were already caught above; this is the same question asked of
       the whole knot rather than of the person in front. */
    return n.queued < (who.waitingFor && this.hasFront(who) ? 25 : 2.5);
  },
  /* IS THERE A FRONT TO THIS QUEUE.

     The long wait is only ever justified by one thing: that somewhere ahead of
     you is a person who is waiting for nobody, who is therefore about to move,
     and whose moving will move everybody between the two of you. So ask that
     exact question — walk the chain of who is waiting for whom and see what it
     ends at.

     A person waiting for nobody is a front, and the line clears.

     A CIRCLE is not. Asking only whether the ring comes back round to YOU is
     not enough and was the first version of this: three people at a doorway
     waiting for each other, and a fourth waiting for one of the three, whose
     chain never reaches a front and never reaches itself either. There is
     nothing about to move in front of any of the four of them. Seen as a
     cycle anywhere in the chain, all four take the short wait and one of them
     edges past.

     And a chain longer than the floor is not a front either — it cannot
     happen with twenty people, and returning "no front" is the safe answer to
     a question this has run out of patience with. Walked rather than
     remembered because it changes every frame; a handful of hops, asked only
     of somebody already standing still with a person in front of them. */
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
  /* Nowhere to go for the moment. Stand somewhere out of the way — not in a
     doorway, not on top of anybody — and try again in a few seconds.

     This is what fifteen people did instead of piling into the back of somebody
     standing in the break room door. It is also just what people do: you get to
     the corridor, you see the door is blocked, and you wait, near it, until it
     is not. */
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
  /* Forget everything about the walk in progress: where it was going, how well
     it was going, and which way it was leaning. Called whenever the target
     changes under it. */
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
  /* Standing on your own square but not in the middle of it, because that is
     where the crowd let them stop. Ease into the middle: a few pixels a second,
     no walk cycle, and only ever into space nobody else is in. Twenty people
     each ending up on the centre of their own square is a room that reads as
     people standing about; twenty people stopped wherever the shoving left them
     is a heap. */
  nestle(n, dt, tx, ty) {
    const ax = (tx + .5) * TILE - n.x, ay = (ty + .5) * TILE - n.y;
    const d = Math.hypot(ax, ay);
    if (d < 1.2) return;
    const sp = Math.min(d, TILE * .5 * dt);
    const mx = ax / d * sp, my = ay / d * sp;
    if (this.canGo(n, mx, my)) { n.x += mx; n.y += my; }
  },
  /* Lean away from anybody standing too close. Not collision — that is canGo —
     but the reason two people walking the same corridor drift apart instead of
     grinding along each other for the length of it. */
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
    /* Somebody edging past you in a doorway has decided to be close to you.
       Leaning away from you at the same time is the two halves of one person
       disagreeing, and the lean wins, so they hover at arm's length for ever. */
    if (G.state === 'play' && !(n.squeeze > 0)) {
      const dx = n.x - P.x, dy = n.y - P.y, d = Math.hypot(dx, dy);
      /* You get more room than a colleague does. You are the one being walked
         around, and being clipped by somebody on their way to the printer is
         read as the game shoving you. */
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
      /* How far away they look up from, and how long they hold it. Somebody
         fond of you notices you a square earlier and watches you go past;
         somebody who has told a colleague about you barely raises their head.
         It is the only place in the game where a relationship is visible
         without opening a panel or saying a word. */
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

    /* Which way they are facing, in order of what would actually hold somebody's
       attention: the person they are talking to, whatever they just looked up
       at, the thing they came over here for, and failing all of that the room. */
    const partner = n.chat && this.get(n.chat.with);
    if (partner) n.dir = this.face(n, partner.x - n.x, partner.y - n.y);
    /* The manager is standing over them. Whatever they were looking at, they
       are now looking at their screen. */
    else if (n.dest === 'desk' && this.lookBusy(n)) n.dir = 0;
    else if (n.lookT > 0 && n.lookAt) n.dir = this.face(n, n.lookAt.x - n.x, n.lookAt.y - n.y);
    /* A colleague at a desk faces the monitor, which is away from you. That
       was written as a bare 0 because for a long time everybody in the game
       had a desk; somebody whose `desk` is a spot behind a counter in a shop
       faces the room instead, and says so with `dir:`. */
    else if (n.dest === 'desk') n.dir = n.def.dir === undefined ? 0 : n.def.dir;
    else if (n.post && (n.post[0] !== dx || n.post[1] !== dy)) n.dir = this.face(n, dx - n.post[0], dy - n.post[1]);

    /* Standing somewhere is not standing on one tile for four hours. The
       restless shift along the counter now and then; the still stay still.

       A step, not a decision: this used to drop the claimed square and ask for
       a new one from scratch, which in a full room could hand somebody a spot
       on the far side of everybody and send them back into the scrum they had
       just got out of. Shuffling is a square you can see from where you are. */
    n.idleT -= dt;
    if (n.idleT <= 0) {
      /* Once every couple of minutes for the restless, and never for the still.
         It was ten times that, which across twenty people is somebody shifting
         about every three seconds somewhere in the room — not a room of people,
         a room of fidgeting. */
      n.idleT = rnd(14, 40);
      if (!n.chat && n.dest !== 'desk' && !this.seated(n) && chance(n.t.restless * .35)) {
        const spot = this.shuffleSpot(n, dx, dy);
        if (spot) { n.post = spot; this.repath(n); }
      }
    }
  },
  /* One square over: free, unclaimed, next to where they already are, and still
     within reach of the thing they came for. Anything further is not a shuffle,
     it is a journey, and a room full of people is no place for one. */
  shuffleSpot(n, dx, dy) {
    const hx = Math.floor(n.x / TILE), hy = Math.floor(n.y / TILE);
    const f = Nav.field(dx, dy);
    const out = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const x = hx + ox, y = hy + oy;
      if (World.isSolid(x, y) || this.inDoorway(x, y)) continue;
      /* How far they are allowed to end up from where they were sent. Three
         squares is right for a waypoint, which names a part of a room — the
         kettle, the printer, the fax table — and wrong for an errand, which
         names a tile: standing at the bar and standing three squares into the
         middle of the pub are not the same thing, and in this table which tile
         somebody is on is frequently the whole joke. So they still shift about,
         because a room of statues is not a room, and they do it on a shorter
         lead. */
      if (Math.max(Math.abs(x - dx), Math.abs(y - dy)) > (n.dest === 'out' ? 1 : 3)) continue;
      if (f && Nav.at(f, x, y) < 0) continue;
      if (this.list.some(o => o !== n && o.post && o.post[0] === x && o.post[1] === y)) continue;
      out.push([x, y]);
    }
    return out.length ? pick(out) : null;
  },
  /* Two people standing near each other for long enough start talking, in their
     own words — the one-liners each person already has. The pair is one
     conversation with a host and a guest: the host owns the timing and hands
     the turn back and forth, and the guest is along for it, which is why only
     one of them is ever mid-sentence. */
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
      /* One voice at a time in a small room. Three pairs talking at once put
         three bubbles over each other and none of them could be read, which is
         worse than a quiet break room — so a beat waits a second when somebody
         else nearby is mid-sentence. Not the person we are talking TO: they
         have just spoken, and waiting for them is waiting for ever. */
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
    /* WHO WITH: the one they like best out of whoever is in reach, rather than
       whoever happens to come first in the roster — and never somebody they
       cannot stand. Standing next to a rival is a thought, not a chat. */
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
    /* Long enough that the same two are not still at it when you come back
       from the loo, and different enough per pair that the room does not fall
       silent all at once. */
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
    /* Colleagues do not walk through you, and no longer through each other
       either. Both tests are "would this step keep us as close as we already
       are" rather than a flat radius: a flat radius means two people who have
       ended up overlapping — a spawn, a teleport, you walking into somebody —
       can never move apart again, and the pair stand there for the rest of the
       shift. Being allowed out of an overlap is what unsticks it. */
    if (G.state === 'play') {
      /* How much room you get. Normally rather more than a colleague, because
         being clipped by somebody on their way to the printer reads as the game
         shoving you. But somebody who has waited for you in a doorway and got
         nowhere gets to breathe in and edge past instead — which is what a
         person does, and is the difference between a doorway and a wall. */
      const d = Math.hypot(nx - P.x, ny - P.y);
      /* Squeezing has to actually get past, and "no step that fails to increase
         the distance" cannot: crossing a doorway somebody is standing in means
         getting closer before getting further away, so at anything but a
         shoulder's width they stop at arm's length and stay there for ever.
         A fifth of a square is a shoulder's width. */
      const room = n.squeeze > 0 ? TILE * .18 : TILE * .55;
      if (d < room && d <= Math.hypot(n.x - P.x, n.y - P.y)) return false;
    }
    for (const o of this.near(nx, ny, TILE * .5)) {
      if (o === n) continue;
      const d = Math.hypot(nx - o.x, ny - o.y);
      /* Tighter than the half tile a person occupies, deliberately. Two people
         standing a tile apart leave a gap of exactly one tile, and at half a
         tile each nobody can ever pass between them — the break room fills up
         with a wall of colleagues and everyone still in the corridor stays
         there. Turning sideways to get past somebody is a thing people do.

         And tighter again for somebody edging out of a doorway, for the same
         reason it is tighter for somebody edging past you: a shoulder's width
         is the difference between a busy room you can get into and a room whose
         doorway has a person wedged in it. */
      if (d < (n.squeeze > 0 ? TILE * .24 : TILE * .42) && d <= Math.hypot(n.x - o.x, n.y - o.y)) return false;
    }
    return true;
  },
  /* Somewhere to stand near a point: the first free tile round it that is not
     the one the player is on. Used by anything that puts a person on the floor
     from outside the walk — the manager appearing behind you, which used to
     land him wherever the arithmetic said and drew him standing inside a desk
     about a third of the time. */
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

/* The waypoint. Thirty-two identical desks and no minimap on a phone, so
   "find your desk" needs to be a direction to walk in: a pin when the target
   is on screen, a compass arrow orbiting the player when it is not. */
const Guide = {
  tx: null, ty: null, label: '', flag: null,
  /* Set when the target is a colleague: they walk their own schedule, so the
     pin has to walk with them rather than mark where they were standing when
     you asked. */
  npc: null,
  /* A one-shot pin clears itself the moment you arrive. A tracked job's pin does
     not: you chose it, and it stands until the step moves on or you untrack it. */
  sticky: false,
  /* `flag` is the G.flags key that records arrival, so the guide knows not to
     come back after a save is reloaded. */
  set(tx, ty, label, flag) {
    this.tx = tx; this.ty = ty; this.label = label || ''; this.flag = flag || null;
    this.npc = null; this.sticky = false;
  },
  /* Point at a world object by its `use` handler — the player's desk would move
     if the floor plan were ever rearranged, and a hard-coded (25,26) would not. */
  setObject(use, label, flag) {
    if (flag && G.flags[flag]) return false;
    const o = World.objects.find(x => x.use === use);
    if (o) this.set(o.x, o.y, label, flag);
    return !!o;
  },
  /* A tracked job's target: an object, a colleague or a floor waypoint. Returns
     false when the target cannot be resolved, which is the caller's cue to leave
     the tracker pinless rather than to point at nothing in particular. */
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
  /* The target is somewhere else entirely. The pin cannot be put on it, but it
     can be put on the door out of here that leads towards it — which is the
     honest answer to "where is that" when the answer is "not on this floor",
     and better than the tracker going blank the moment you step outside. */
  aimAcross(levelId, what) {
    if (!levelId || levelId === Levels.current) return false;
    const link = Levels.route(levelId);
    if (!link) return false;
    /* `via || use`, which is World.behind()'s rule and has to be this one's
       too. A way out names its link one of two ways: the hatch and the front
       doors ARE the link and say so with their handler, and every shopfront on
       the parade keeps the shop's own handler — one shop, one act, whether you
       press E on the door or on the sign over it — and names the link with
       `via`. Asking for `use` alone found none of the fourteen, so a job
       pointing into any shop on that street pinned nothing at all. */
    let door = World.objects.find(x => (x.via || x.use) === link.via);
    /* ONE OBJECT, SEVERAL WAYS OUT, which is the case the line above cannot
       cover however it is written: a lift is four buttons and one lift, and a
       stairwell is up, down and all the way down and out. Neither names the
       link it is about to take, because neither knows which one you are going
       to press — and that is exactly what EXITS in data/world.js has been for
       since the map screen needed to draw a lift.

       The map read it. This did not. So on the first morning of every shift —
       standing in the lobby, where a shift now begins, with a job whose target
       is a floor up — the tracker pinned nothing at all, which is the one
       moment it exists for. Found by the `prog` suite in test/, three weeks
       after the lobby became the arrival floor and the day the suite was run
       again. */
    if (!door) {
      const ex = EXITS.find(e => (e.vias || []).includes(link.via));
      if (ex) door = World.objects.find(x => x.kind === ex.kind);
    }
    if (!door) return false;
    this.set(door.x, door.y, what ? what + ' — this way' : door.name, null);
    this.sticky = true;
    return true;
  },
  /* How far away it is, in steps you have to walk rather than as the crow
     flies. The compass arrow used to divide the straight-line distance by the
     tile size and call it a number, which on this floor plan is a lie by a
     factor of three: the archive is eleven tiles away through a wall and forty
     round the corridor. Nav answers the real question, and falls back to the
     old guess for a target with no way to it at all — a pin the other side of
     a locked door still deserves a number. */
  steps() {
    if (this.tx === null) return 0;
    const s = Nav.steps(Math.floor(P.x / TILE), Math.floor(P.y / TILE), this.tx, this.ty, true);
    return s === null
      ? Math.round(Math.hypot((this.tx + .5) * TILE - P.x, (this.ty + .5) * TILE - P.y) / TILE) : s;
  },
  clear() { this.tx = this.ty = null; this.label = ''; this.flag = null; this.npc = null; this.sticky = false; },
  on() { return this.tx !== null && G.state === 'play'; },
  /* Arriving is enough — you should not have to interact with the thing to stop
     being pointed at it. A tracked job is the exception: the pin over the person
     you are walking to is what tells you which of twenty colleagues they are, so
     it stays put once you get there. */
  check() {
    if (this.npc) {
      const n = NPCM.get(this.npc);
      if (n) { this.tx = Math.floor(n.x / TILE); this.ty = Math.floor(n.y / TILE); }
    }
    if (this.tx === null || this.sticky) return;
    if (Math.hypot((this.tx + .5) * TILE - P.x, (this.ty + .5) * TILE - P.y) < TILE * 1.4) {
      if (this.flag) G.flags[this.flag] = true;
      this.clear(); Sfx.select();
    }
  },
  /* Called after a save is restored: put the pin back if it is still owed. A
     tracked job comes first — it is the one the player asked for. */
  restore() {
    this.clear();
    if (Track.aim()) return;
    this.setObject('playerDesk', say('yourDesk'), 'foundDesk');
  },
  /* Called on arriving somewhere new. The same question as after a restore —
     what is owed, and where is it from here — asked against a different map,
     which is why it cannot simply be left alone: the pin was holding tile
     coordinates that mean somewhere else now. */
  onLevel() { this.restore(); }
};

/* ---------------- Camera ---------------- */
const Cam = {
  x: 0, y: 0, w: 800, h: 600,
  /* Follow the player, but never past the edge of the map — and when the map is
     SMALLER than the window, centre it instead. The fourth floor is 2048px wide
     and no screen has ever been that big, so the clamp was only ever asked the
     easy question; a level of a dozen tiles asks the other one, and the old
     bounds crossed over (a minimum above the maximum), which pinned the whole
     map into the top-left corner with the rest of the window left as void. */
  bound(v, span, view) {
    /* Flush with the edge of the map, not forty pixels past it. That overscan
       showed a strip of nothing down the side of the frame: no ground, no
       kerb, no wetness, no lamplight — and, in the rain, drops falling against
       a flat slab with nothing behind them, which reads as a gap in the shower
       rather than as the end of the map. There is nothing out there to look
       at, so the camera no longer goes and looks at it.

       A map SMALLER than the window still has to sit somewhere: centre it, as
       it always did, because a minimum above a maximum pins the whole thing
       into the corner and leaves the rest of the window as void. */
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
