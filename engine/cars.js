'use strict';
/* ---------------- Cars ----------------
   The one thing on the map that is not on the map. Everything else in this
   engine lives on a tile: the furniture is keyed by tile, the walls are a grid,
   collision asks World.isSolid(tx, ty) and a colleague walks from one tile
   centre to the next. A car is at a PIXEL, at an ANGLE, at a SPEED, and
   sometimes with the player inside it — so it gets its own list, its own
   update and its own three lines in the draw order, and nothing else has to
   learn what it is.

   Three things live here.

   THE CARS THEMSELVES. Built from a level's `cars:` list (data/levels.js) into
   World.cars, which travels with the level the way its objects and its walls
   do: leave the pool car in the middle of Fenn Street, walk into the building,
   come back out, and it is still in the middle of Fenn Street.

   DRIVING. One car at a time, and only one that says `drive: true`. The player
   is moved to wherever the car is on every frame rather than being carried by
   it — which is why the camera, the minimap, the street names and the save all
   keep working without knowing anybody is driving: they all read P.x and P.y,
   and P.x and P.y are the car.

   TRAFFIC. A car with a `route:` drives itself round it for ever, keeping
   left, slowing for corners and stopping for whatever is in front of it —
   which is usually the player, parked across both lanes, having got out. It
   also reads the tarmac under its own route, so it steers away from a kerb
   rather than up one, reverses out of the things a route cannot know about,
   gives way to the right where two of them want the same junction, and goes
   round anything parked that is never going to move. See the note above
   steerTraffic().

   What is deliberately NOT here: anybody gets hurt. A car in this game stops
   for a person, always, whoever is driving it. The comedy out there is a
   twenty-two-space car park with forty staff in it, not a pavement. */
const Cars = {
  /* The car the player is sitting in, or null. Kept here rather than on P
     because P is what Save.write serialises: a car hung off it would go into
     localStorage as a detached copy of itself and come back as an object that
     looks like a car, is not in World.cars, and cannot be got out of. */
  driving: null,
  /* Which streets have been driven through since getting in. Emptied on the
     way in, so the achievements below are a drive rather than a lifetime.
     Zone ids, because a zone out here IS a street — see the note above ZONES
     in data/world.js. */
  seen: null,
  /* DRIVES are the level's: `drives: [{ ach, zones }]` on a level definition
     grants `ach` once every zone in `zones` has been driven through in one
     go. Zone ids, because a zone out here is a street. */
  /* Held down to sound the horn, and how long it has been held — one press is
     a note, leaning on it is leaning on it. */
  horn: false, hornT: 0,

  /* ---- building ----
     A level's own `cars:` entries turned into cars. Tile positions become
     pixels here and nowhere else, so the catalogue can go on being written in
     tiles like `entries:` and `rooms:` are. */
  build(list) {
    return (list || []).map((c, i) => {
      /* A model says what a car IS; `body` lets one car be that model in a
         different colour, which is the difference between seven models and
         seven cars. Copied rather than written through, or one silver estate
         would repaint every estate in the game.

         There was a `roof` beside it and there is not now: a vehicle is one
         colour from directly above, which is the only angle this game has of
         one. See the note over CARS in data/world.js. */
      const base = CARS[c.model] || CARS.saloon;
      const def = c.body ? Object.assign({}, base, { body: c.body }) : base;
      const car = {
        id: 'c' + i, def, model: c.model, name: c.name || 'A car',
        use: c.use || null, canDrive: !!c.drive, traffic: !!c.traffic,
        /* Body-frame velocity: how fast it is going along its own nose, and
           how fast it is sliding sideways. Both start at nothing, including
           for traffic — a car pulls away rather than appearing at speed. */
        fwd: 0, lat: 0, dents: 0, wob: Math.random() * 6.28,
        x: (c.x || 0) * TILE, y: (c.y || 0) * TILE,
        a: this.heading(c.face),
        /* Brake lights, so they can be lit by braking, by traffic slowing for
           a corner and by a collision, without three places drawing them. */
        braking: false, stopped: 0, honkT: 0,
        /* What a driver is in the middle of. All nothing here, so a parked car
           carries the same fields as a moving one and steerTraffic() never has
           to test whether a car has been driven yet: how long it has been
           stuck with nothing in front of it, how long it has been off the
           road, how long it has left of a reverse, how many shunts it has had
           at the same thing, and how long it has left of going round something
           and on which side. See the note above steerTraffic(). */
        stuck: 0, lost: 0, back: 0, shunt: 0, pull: 0, pullBy: 0, past: null, rerouted: false,
        /* AND WHERE IT IS GOING, which is the new half of all of this. `plot`
           is the piece of lane in front of it, rebuilt every frame and read by
           the cars around it as well as by itself; `t` is how far down its
           current leg it has got; `off` is how far to one side of its own lane
           it has decided to sit, which is what going round a parked car
           actually is; `hold` is how long it has been held up by something;
           and `gave` is who it last gave way to, so that two cars either side
           of a decision do not swap it sixty times a second. See plot(). */
        plot: null, t: 0, off: 0, hold: 0, gave: null, gapTo: Infinity, press: 0, jam: 0,
        /* And which way it is about to go, for the amber on the corner of it.
           Separate from `wheel`, which is where the steering actually is: a
           driver signals BEFORE the wheel moves, which is the entire point of
           signalling. See signal(). */
        blink: 0, blinkT: 0,
        /* What is holding it up, published for the car behind: the give-way
           rule is the only thing out there that needs to know what somebody
           ELSE can see. */
        blockedBy: null, wheel: 0,
        /* SERVICE. A vehicle with `stops:` pulls up at each of them, waits,
           and goes — see the note over serveStop(). Everything else on this
           network has an empty list and never looks at any of it. */
        stops: (c.stops || []).map(q => ({ x: q.at[0] * TILE, y: q.at[1] * TILE, secs: q.secs || 6 })),
        stopFor: 0, stopIdx: -1, stopCool: 0, serving: 0
      };
      if (c.route && c.route.length > 1) {
        car.route = c.route.map(p => ({ x: p[0] * TILE, y: p[1] * TILE }));
        car.leg = (c.leg || 0) % car.route.length;
        car.cruise = c.cruise || 150;
        /* Put it `along` tiles down its opening leg and pointed along it, so
           four cars written into one route do not all start on top of each
           other at the same corner. */
        const from = car.route[car.leg], to = car.route[(car.leg + 1) % car.route.length];
        const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const t = Math.min(0.96, ((c.along || 0) * TILE) / d);
        car.x = from.x + (to.x - from.x) * t;
        car.y = from.y + (to.y - from.y) * t;
        car.a = Math.atan2(to.y - from.y, to.x - from.x);
      }
      return car;
    });
  },
  /* Compass to radians, because a car in a bay is written as facing north and
     not as facing -1.5707963. 0 is east and y grows downwards, which is what
     every other angle in this engine means. */
  heading(face) {
    return face === 'n' ? -Math.PI / 2 : face === 's' ? Math.PI / 2
      : face === 'w' ? Math.PI : 0;
  },
  list() { return World.cars || []; },

  /* ---- the frame ----
     Called once from Game.tick, before the camera follows anything: the car is
     where the player is, so it has to have moved before the camera asks. */
  update(dt) {
    const cars = this.list();
    if (!cars.length) { this.driving = null; return; }
    /* A car the level swapped out from under us. Cannot currently happen — you
       cannot reach a door from a driving seat — but a dangling reference here
       would be a camera following a car on a level nobody is on. */
    if (this.driving && cars.indexOf(this.driving) < 0) this.driving = null;
    /* EVERYBODY'S PLAN, BEFORE ANYBODY DRIVES. A car's plot is read by the
       cars around it as much as by itself — who gets a junction is a question
       about two of them — so every plot has to exist before the first car
       steers. Without this pass, half the town would be settling priority
       against this frame's idea of where the other one was going and half
       against last frame's, which is a rule that is right about half the time
       and is therefore not a rule. Parked cars get none: they are obstacles,
       not drivers, and an obstacle has no future. */
    if (G.state === 'play') {
      for (const car of cars) {
        if (car.traffic || car === this.driving) this.plot(car);
        else car.plot = null;
      }
    }
    if (G.state === 'play' && this.driving) this.drive(this.driving, dt);
    for (const car of cars) {
      if (car === this.driving) continue;
      if (car.traffic && G.state === 'play') this.steerTraffic(car, dt);
      this.move(car, dt);
    }
    this.sync();
    this.showControls();
    if (this.driving) {
      /* The player IS the car while they are in it. Everything that follows
         the player — the camera, the minimap dot, the street name, the save —
         follows this and needed no changing. */
      P.x = this.driving.x; P.y = this.driving.y;
      P.moving = Math.abs(this.driving.fwd) > 6;
      if (typeof zoneCheck === 'function') zoneCheck();
      const z = World.zoneAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE));
      if (z && this.seen) {
        this.seen.add(z);
        /* Two of these, and they are not the same shape. A LAP is the original
           block: four streets, back where you started. The GRID is every
           street on the map, which cannot be done as one circuit and has to be
           driven as a route somebody worked out. Both are emptied by getting
           in rather than kept for ever, so each is a drive and not a diary. */
        ((World.def && World.def.drives) || []).forEach(d => {
          if (d.zones.every(k => this.seen.has(k))) Ach.get(d.ach);
        });
      }
      if (Sfx.on) Sfx.engine(true, Math.abs(this.driving.fwd) / this.driving.def.top);
      this.hornT = this.horn ? this.hornT + dt : 0;
      if (this.horn && this.hornT < dt * 1.5) { Sfx.horn(); Peds.honk(P.x, P.y); }
    } else if (Sfx.engine) Sfx.engine(false);
  },

  /* Which tiles the cars are standing on this instant, for World.isSolid — see
     the note there. Rebuilt whole every frame rather than diffed: it is a
     dozen cars covering four tiles each, and a set that is rebuilt cannot go
     stale in a way nobody notices. */
  sync() {
    const set = World.carTiles || (World.carTiles = new Set());
    set.clear();
    /* The ground the player is standing on, which no car may claim.
       Without this, getting out was a trap. The collision box is 19px across
       and a tile is 32, so standing beside a car your box reaches into the
       tile the car is on — and a tile a car is on is solid, so every direction
       is blocked, and a walking step is 1.8px, which is smaller than the
       overlap, so no number of steps ever gets you out of it. You could not
       move again for the rest of the shift.
       Stated as a rule rather than patched at the door: a car never takes the
       ground out from under somebody who is already standing on it. You got
       out of it, or it drove into you, and either way you are allowed to walk
       away from it. It cannot help you walk INTO one — those tiles are solid
       until you are already on them, which you cannot be. */
    const pr = TILE * .3;
    const ptx0 = Math.floor((P.x - pr) / TILE), ptx1 = Math.floor((P.x + pr) / TILE);
    const pty0 = Math.floor((P.y - pr) / TILE), pty1 = Math.floor((P.y + pr) / TILE);
    const underfoot = (tx, ty) => tx >= ptx0 && tx <= ptx1 && ty >= pty0 && ty <= pty1;
    for (const car of this.list()) {
      /* Not the car you are in. Walking out of your own car would otherwise be
         walking out into a solid tile, which puts you back where you started
         for ever. */
      if (car === this.driving) continue;
      /* WHICH TILES, worked out only when the car has actually moved. Fifty of
         the sixty vehicles on this map are parked and have been parked since
         the level was built; rebuilding their corners, flooring them into tiles
         and BUILDING A STRING PER TILE sixty times a second is most of the cost
         of a function whose answer has not changed since Tuesday. The keys are
         kept beside the tile numbers that produced them so the rule below can
         still be applied to each one without any of them being built again. */
      if (car.keyX !== car.x || car.keyY !== car.y || car.keyA !== car.a || !car.keys) {
        car.keyX = car.x; car.keyY = car.y; car.keyA = car.a;
        const keys = car.keys || (car.keys = []);
        const nums = car.nums || (car.nums = []);
        keys.length = 0; nums.length = 0;
        const d = car.def, c = Math.cos(car.a), s = Math.sin(car.a);
        const hl = d.len / 2, hw = d.wid / 2;
        /* The extent of the rotated rectangle, which for a box is the two
           half-extents projected onto each world axis — the same four numbers
           the four corners used to be looped over to find. */
        const rx = Math.abs(c) * hl + Math.abs(s) * hw;
        const ry = Math.abs(s) * hl + Math.abs(c) * hw;
        /* Inset slightly: a car whose bumper is a pixel over a tile line has
           not really taken that tile, and claiming it makes a parked car a tile
           wider than it looks. */
        const tx0 = Math.floor((car.x - rx + 5) / TILE), tx1 = Math.floor((car.x + rx - 5) / TILE);
        const ty0 = Math.floor((car.y - ry + 5) / TILE), ty1 = Math.floor((car.y + ry - 5) / TILE);
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          nums.push(tx, ty); keys.push(tx + ',' + ty);
        }
      }
      /* And the player is one person in a town, so ask once per car whether
         they could possibly be standing on any of it rather than once per
         tile. Nearly always they are half a map away and this is one compare. */
      const near = Math.abs(P.x - car.x) < car.def.len + TILE && Math.abs(P.y - car.y) < car.def.len + TILE;
      const keys = car.keys, nums = car.nums;
      for (let i = 0, n = 0; i < keys.length; i++, n += 2) {
        if (near && underfoot(nums[n], nums[n + 1])) continue;
        set.add(keys[i]);
      }
    }
  },

  /* ---- driving ----
     Throttle, brake and steering, in that order, and a body that carries on
     going the way it was going. It is an arcade model on purpose: the front
     wheels turn the car, the car slides a little when the back end is asked to
     do something sudden, and none of it is a simulation of a differential. */
  drive(car, dt) {
    const d = car.def;
    let th = Keys.up - Keys.down, st = Keys.right - Keys.left;
    /* ONE THUMB PER JOB. The left stick steers and only steers — its x, and
       nothing else — and the right one is the throttle: push it up to go, pull
       it down to brake and then reverse. Its y is positive downwards and
       forward is up, hence the sign.
       This used to be one stick doing both, and it could not work: steering
       meant pushing sideways, pushing sideways took the forward component out
       of the same vector, less speed meant less bite (see the taper below), so
       the harder you asked it to turn the less it turned. Either stick alone
       still does its own half, and the keys still do both, so nothing that
       worked before has stopped working. */
    if (Stick.on) st = clamp(Stick.x * 1.5, -1, 1);
    if (Throttle.on) th = clamp(-Throttle.y * 1.3, -1, 1);

    car.braking = false;
    if (th > 0.05) car.fwd += d.acc * th * dt;
    else if (th < -0.05) {
      /* Down is the brake while you are going forwards and reverse once you
         have stopped, which is one pedal doing two things and is what everybody
         expects from a car in a game. */
      if (car.fwd > 8) { car.fwd -= d.acc * 2.6 * -th * dt; car.braking = true; }
      else car.fwd += d.acc * 0.7 * th * dt;
    } else {
      /* Off the throttle it slows on its own, and comes to an actual stop
         rather than creeping for ever at a hundredth of a pixel. */
      const drop = 46 * dt;
      car.fwd = Math.abs(car.fwd) <= drop ? 0 : car.fwd - Math.sign(car.fwd) * drop;
    }
    car.fwd -= car.fwd * 0.55 * dt;
    car.fwd = clamp(car.fwd, -d.top * 0.42, d.top);

    /* Steering does nothing at a standstill, because it does nothing at a
       standstill: the front wheels turn, and turning them turns the car only
       if the car is going somewhere. Full lock by about a seventh of top speed
       — low enough that manoeuvring in a bay is steering rather than shunting
       — and reversed when reversing, which is the whole of why parking is
       harder than driving.
       And a little LESS lock the faster it is going, which is the opposite of
       what this used to do and is what a car does: full lock at seventy is not
       a turn, it is an incident. */
    const bite = Math.min(1, Math.abs(car.fwd) / (d.top * 0.14));
    const settled = 1 - 0.32 * Math.min(1, Math.abs(car.fwd) / d.top);
    if (st) car.a += st * d.turn * dt * bite * settled * (car.fwd < 0 ? -1 : 1);
    /* Where the front wheels are pointing, for the renderer. Eased rather than
       snapped, because a wheel that reaches full lock in one frame reads as a
       glitch and a wheel that takes a fifth of a second reads as steering. */
    car.wheel = lerp(car.wheel || 0, st, Math.min(1, dt * 12));
    /* And the amber follows it, because the person steering is the one deciding
       and there is nothing to predict. A little deadband, so that holding a
       gentle line down Bellhaven Road is not a car indicating for four hundred
       metres. The traffic plans its own — see signal(). */
    car.blink = Math.abs(car.wheel) > 0.34 ? (car.wheel > 0 ? 1 : -1) : 0;

    this.move(car, dt);
  },

  /* Where a car ends up this frame: the body-frame velocity turned into a
     world one, the sideways part of it damped by how much grip the thing has,
     and the result tried against the world. Shared by the one being driven and
     the ones driving themselves, so they cannot disagree about what a wall is. */
  move(car, dt) {
    const d = car.def;
    const c = Math.cos(car.a), s = Math.sin(car.a);
    /* Grip is what stops a car being a train. The lateral component decays
       towards nothing every frame; what survives is the slide, and it survives
       longest on the cars with the lowest number. */
    car.lat *= Math.exp(-d.grip * dt);
    if (Math.abs(car.lat) < 0.5) car.lat = 0;
    let vx = c * car.fwd - s * car.lat, vy = s * car.fwd + c * car.lat;
    if (!vx && !vy) { car.stopped += dt; return; }

    /* What it was doing on the way in. Kept, because everything below is about
       what happened to it and by then there is no speed left to judge it by. */
    const was = car.fwd, x0 = car.x, y0 = car.y;
    let hit = 0;                       /* 0 clear, 1 along something, 2 into it */
    /* AND THE ONE THING NO CAR MAY MOVE ONTO, whoever is driving it. The rule
       at the top of this file is that a car stops for a person, and until now
       that rule lived entirely in the traffic's own idea of what was in front
       of it — which meant it did not apply to the car you are sitting in at
       all, and applied to the others only as well as their look-ahead worked.
       This is the floor under it: the body, against the people, on the step.
       Tested on the STEP and not on the position, and skipped outright if the
       car is already on somebody, so that a person who has ended up against a
       stationary car can still walk out from under it and the car can still be
       driven off them. Being stuck is not a thing this engine enforces. */
    const onP = Collide.carOnPerson(car, car.x, car.y);
    const shut = (x, y) => this.hits(car, x, y) || (!onP && Collide.carOnPerson(car, x, y));
    const nx = car.x + vx * dt, ny = car.y + vy * dt;
    if (!shut(nx, ny)) { car.x = nx; car.y = ny; }
    else if (!shut(nx, car.y)) { car.x = nx; hit = 1; }
    else if (!shut(car.x, ny)) { car.y = ny; hit = 1; }
    else hit = 2;

    /* Back out of the movement it ACTUALLY MADE into the body frame, so that
       next frame's heading change slides the car instead of teleporting its
       momentum. This is the whole of the handling model: everything above
       decides where the nose points, and this decides how much the rest of it
       agrees.
       Actually made, and not what it asked for. That distinction used to be
       missing — this line read `vx * c + vy * s`, the velocity it WANTED —
       and it was quietly the worst thing in this file. A refused move put the
       speed it was refused at straight back into car.fwd, so a car held
       against a wall was a car doing thirty that was not going anywhere: it
       never read as stopped, the scrape and the prang below never took a penny
       off it, prang() fired at full speed every frame for as long as you leant
       on the throttle, and the traffic could not tell being wedged against a
       kerb from waiting behind a bus. Everything downstream of this is better
       for it, and the whole of the recovery logic in steerTraffic() depends on
       it being true. */
    const ax = (car.x - x0) / dt, ay = (car.y - y0) / dt;
    car.fwd = ax * c + ay * s;
    car.lat = -ax * s + ay * c;
    if (hit === 1) this.scrape(car, 0.8, was);
    else if (hit === 2) this.prang(car, was);
    car.stopped = Math.abs(car.fwd) < 4 ? car.stopped + dt : 0;

    /* WEDGED. Everything above can only refuse a move, and refusing every move
       is exactly what a car inside something gets: hit a wall at an angle where
       neither axis on its own clears it, or have another car creep into you,
       and every candidate is rejected — including the ones going the right way.
       It could not be driven again. Ever.
       So ask which way is OUT and shuffle that way. Not a special case for
       walls or for cars but the same depenetration everything that moves in
       this game now gets (see Collide.pushOut, and the same three lines at the
       end of movePlayer): being stuck is a state the collision system has to
       end, not one it is allowed to enforce. Slowly, so that leaning on a wall
       is a car resting against a wall rather than a car being pushed off it. */
    const out = Collide.carPush(car);
    if (out) {
      const m = Math.hypot(out[0], out[1]) || 1, step = Math.min(m, TILE * 3 * dt);
      car.x += out[0] / m * step; car.y += out[1] / m * step;
    }

    /* Rubber, off the back wheels, when the back end is going somewhere the
       front end did not ask it to. Only the car being driven leaves any: four
       traffic cars taking the same corner all day would be a permanent cloud,
       and the point of it is feedback to the person doing the steering. */
    if (car === this.driving && Math.abs(car.lat) > 46 && FX.motion && chance(0.55)) {
      const bx = car.x - c * d.len * 0.4, by = car.y - s * d.len * 0.4;
      /* Thrown gently upwards because FX.update pulls everything down at
         260px/s²: over the half-second these live, the two cancel and the
         smoke sits where the tyre left it instead of raining off the car. */
      FX.parts.push({ x: bx + rnd(-6, 6), y: by + rnd(-6, 6), vx: rnd(-12, 12), vy: rnd(-70, -40),
        life: rnd(.35, .6), t: 0, c: 'rgba(24,26,30,.8)' });
    }
  },

  /* A wall, a lamppost, a wheelie bin or another car, at this position. Six
     points rather than four: a car is nearly two tiles long and two corners on
     the same side can straddle a bollard between them. */
  hits(car, x, y) { return !Collide.carFits(car, x, y); },

  /* Along something rather than into it. Costs speed and makes a noise; no
     dent, because a scrape down a wall is not an event. */
  scrape(car, keep, was) {
    if (Math.abs(was) > 40 && car === this.driving) { FX.shake(2); Sfx.scrape(); }
    car.fwd *= keep; car.lat *= 0.2;
  },
  /* Into something. The speed it WAS doing decides whether this is a nudge or
     the sort of thing that gets mentioned at a team meeting — passed in, since
     by the time this is called the car has already been stopped dead by the
     thing it hit and its own speed would say every collision was a nudge. */
  prang(car, was) {
    const v = Math.abs(was);
    car.fwd = -was * 0.18; car.lat = 0;
    if (v < 26) return;
    if (car === this.driving) {
      FX.shake(Math.min(9, v / 22));
      Sfx.thud(v / car.def.top);
      if (v > 110 && ++car.dents === 1) {
        UI.toast('🚗', say('car.crash'), 'bad');
        count('bullshit');
      }
    } else Sfx.thud(0.4);
  },

  /* ---- traffic ----
     A car with a `route:` drives itself round it for ever. What follows is the
     whole of what one of them knows, and it is five questions asked in this
     order, because the order is the design.

       WHERE AM I GOING. A short piece of lane, plotted ahead of the car every
       frame, round however many corners the horizon reaches — see plot(). It
       is the only new idea in here and everything else is a consequence of it:
       a driver who has a PATH can be asked about corners, about what is in the
       way, and about who gets there first, and a driver who has only a
       waypoint and a heading can be asked about none of the three.

       HOW FAST MAY I TAKE IT. The corner, read off that plot as curvature —
       see bend().

       WHAT IS IN THE WAY. Measured down the plot rather than off the nose, and
       answered with a GAP and a CLOSING SPEED rather than with a yes — see
       scan() and follow().

       WHO GETS THE JUNCTION. Decided by comparing two plots before either car
       arrives, rather than discovered nose to nose four seconds after both of
       them have stopped — see giveWay().

       AND WHAT TO DO WHEN ALL OF THAT HAS ALREADY GONE WRONG: off the road,
       wedged, or beached on a footway a block from its own route. See
       shuntBack(), relocate() and rejoin(). They are meant to be dead code and
       they are the reason tools/carjam.mjs exists.

     WHAT WAS WRONG WITH THE OLD ONE, because every line below is an answer to
     something that was visible from the pavement.

     IT STOPPED DEAD FOR MOVING TRAFFIC. The entire speed rule for anything in
     front of it was `if (block) want = 0`. A car that caught a slower one
     braked to a standstill, sat there for four seconds, crept forward at twenty
     pixels a second until it was moving — at which point the thing in front was
     out of range and it floored it again. Every queue in this town was that,
     sixty times a second. It is a following model now: a gap, a closing speed,
     and a speed it can still stop from. Cars fall in behind each other and stay
     there.

     IT QUEUED BEHIND PARKED CARS IT COULD SEE PAST. Twenty-seven cars are
     parked at kerbs on this map, each of them a tile off its lane centre; a car
     is thirty-five pixels wide and a tile is thirty-two, so "is it within a
     tile of my nose" said yes to every one of them. The whole of Bellhaven Road
     used to stop for a hatchback that was not in the road. What matters is how
     far into the corridor something reaches, and a few pixels is a thing you
     move over for, not a thing you stop for.

     IT COULD NOT SEE PEOPLE IT WAS ABOUT TO HIT. The check was one POINT a
     stopping distance in front of the bumper. Anybody between the bumper and
     that point — which is exactly where somebody stepping off a kerb is — was
     not there at all. It is a corridor now, and there is a floor under it in
     engine/collide.js: a car may not move onto a person, whoever is driving.

     IT FOUND OUT ABOUT JUNCTIONS BY ARRIVING AT ONE. Priority was settled after
     two cars had already stopped facing each other, by a four-second timer and
     a rule about which was on the right. It is settled before either of them
     gets there now, by looking at where both are going to be.

     AND IT COULD NOT REVERSE OUT OF THE ONE THING IT MOST NEEDED TO. The stuck
     detector only counted a car with NOTHING in front of it, on the grounds
     that something in front is a reason to be stopped. So a car that had crept
     into the back of a parked one and could not move reported the parked car as
     its reason, for ever. There was one doing that in the harness for
     twenty-six seconds of every run.

     What is deliberately NOT here: anybody gets hurt. A car in this game stops
     for a person, always, whoever is driving it. */

  /* How a driver out here thinks, in numbers.

     LOOK is how many seconds of road it plots in front of itself, and it is the
     single number that decides whether this traffic looks like it is paying
     attention. HEAD is the headway it keeps behind the car in front, in
     seconds. BRAKE is the deceleration it is willing to PLAN for, as a multiple
     of what the car can do — less than one would be a driver who never quite
     stops, and much more is one who brakes like a video game. ROOM is the
     clearance it leaves at the side of something it is passing, and EDGE is how
     far it will shift within its own lane to avoid stopping for something that
     is only clipping it. */
  LOOK: 2.4, HEAD: 0.62, BRAKE: 1.6, ROOM: 5, EDGE: TILE * 0.85,
  /* And the hard ceiling on it, which a pull-out is allowed to reach and a
     shift is not. An offset is a sideways displacement of the WHOLE plot, and
     a plot goes round corners: sit two tiles off your lane on the approach to
     a right-angle and the same two tiles are measured in a different direction
     the moment the lane turns, so the line you are chasing swings through
     ninety degrees and takes you with it. One did exactly that at the corner of
     Aldergate Rise — it offered to overtake a stopped car across the mouth of
     the junction, where the offside is "clear road" because a junction is road
     in every direction, committed to seventy pixels of it, and drove onto the
     footway outside the flats. Hence this, and hence straight() below. */
  MAXOFF: TILE * 1.5,
  /* And the gap it comes to rest at: behind a vehicle, and behind a person. The
     second is bigger on purpose. Everybody stops further back from a person. */
  STAND: 13, STANDP: TILE * 1.15,

  /* Is this pixel road? The surfaces are declared for the renderer's benefit
     and they are the only description of the road network anybody has written
     down; reading one costs an array lookup and gives every driver out there
     the one fact they were missing. */
  onRoad(x, y) {
    return World.surfAt(Math.floor(x / TILE), Math.floor(y / TILE)) === 'tarmac';
  },
  /* Pulling up, waiting, and going again. Returns the speed the vehicle
     should be asking for, which is the only thing it changes.

     `stopIdx` is which stop it is at, and it is remembered rather than
     recomputed so that a bus sitting at one for six seconds does not spend
     those six seconds rediscovering it. `stopCool` is the second or two after
     pulling away during which every stop is invisible to it — without that a
     bus leaves a stop at walking pace, is still within reach of it, and serves
     it again for ever. */
  serveStop(car, want, c, s, dt) {
    if (car.stopFor > 0) {
      car.stopFor -= dt;
      if (car.stopFor <= 0) { car.stopFor = 0; car.stopIdx = -1; car.stopCool = 2.2; }
      return 0;
    }
    car.serving = 0;
    if (car.stopCool > 0) { car.stopCool -= dt; car.serving = 0; return want; }
    for (let i = 0; i < car.stops.length; i++) {
      const st = car.stops[i];
      const dx = st.x - car.x, dy = st.y - car.y;
      /* Along its own nose, so a stop on the far carriageway — or one it has
         already gone past — is not one it is approaching. */
      const ahead = dx * c + dy * s;
      const dist = Math.hypot(dx, dy);
      if (dist > TILE * 6 || ahead < -TILE * 0.6) continue;
      if (dist < TILE * 1.3 || ahead < 0) { car.stopFor = st.secs; car.stopIdx = i; car.serving = 0; return 0; }
      /* Slow over the last six tiles rather than standing on the brakes at the
         pole, which is what a bus does and what a bus looks like. The ramp is
         the same shape as the one the lights use and for the same reason: a
         vehicle brought to a halt over the last few metres arrives at a stop,
         and one that reads a boolean and sets its speed to nothing arrives at
         the stop by emergency-braking on top of it. */
      car.serving = 1;
      return Math.min(want, Math.max(0, (dist - TILE * 1.1) * 0.8));
    }
    return want;
  },
  /* Is a vehicle standing at this tile with its doors open — asked by
     engine/npc.js, which has six people at a bus stop who would otherwise
     have to evaporate. */
  stoppedAt(tx, ty) {
    for (const car of this.list()) {
      if (car.stopFor <= 0 || car.stopIdx < 0) continue;
      const st = car.stops[car.stopIdx];
      if (Math.hypot(st.x - (tx + .5) * TILE, st.y - (ty + .5) * TILE) < TILE * 3) return car;
    }
    return null;
  },

  /* Is this car's route drawn on road AT ALL? Asked once per car and
     remembered. Nothing above should start second-guessing a route on a level
     that declares no surfaces: every probe would come back "off the road",
     every car would spend the day reversing, and a level that declares none is
     supposed to be exactly the level it always was. */
  routeIsRoad(car) {
    if (car.tarmac === undefined) car.tarmac = car.route.every(p => this.onRoad(p.x, p.y));
    return car.tarmac;
  },

  /* ---- the plot ----
     WHERE THIS CAR IS ABOUT TO BE: its own position, and then its own lane, in
     half-tile steps, for as far ahead as it could possibly need — round
     corners, across junctions, and on to the next leg of the route without
     anybody having to notice that the route has legs.

     It is rebuilt every frame and it is read by four things, one of which is
     other cars. That is the point of it being a list of points rather than a
     pair of waypoints: a corner is a fact about a path, an obstruction is a
     fact about a path, and who gets a junction is a fact about two of them.

     THE LANE, MOVED OVER. Each point is shifted sideways by `car.off`, which is
     how far off its lane this driver has decided to sit — see the shift in
     steerTraffic(). Doing it here rather than at the steering is what makes
     going round a parked car work at all: the corridor everything else is
     measured against moves with the car, so the thing being passed stops being
     reported as in the way the moment it is not. */
  plot(car) {
    const out = car.plot || (car.plot = []);
    out.length = 0;
    const d = car.def;
    const reach = Math.max(TILE * 2.6, d.len * 0.8 + Math.abs(car.fwd) * this.LOOK);
    let px = car.x, py = car.y, s = 0;
    const ca = Math.cos(car.a), sa = Math.sin(car.a);
    out.push({ x: px, y: py, s: 0, ux: ca, uy: sa });
    const R = car.route, n = R ? R.length : 0;
    if (n < 2) {
      /* No route, so whatever it is doing it is doing in a straight line. The
         car being DRIVEN is what this is for, and the traffic reads its plot
         exactly as it reads another driver's — which is the whole of why they
         start getting out of your way before you arrive rather than after. */
      const step = TILE * 0.5;
      while (s < reach && out.length < 48) {
        s += step;
        out.push({ x: car.x + ca * s, y: car.y + sa * s, s, ux: ca, uy: sa });
      }
      this.bounds(out);
      return out;
    }
    /* WHICH LEG IT IS ON, and how far down it, measured along the leg rather
       than as the crow flies so that being pushed a foot off the lane does not
       read as progress. Maintained here because the plot is the first thing
       that asks and everything else reads the answer off `car.t`. A car that
       has been shoved may be past the end of more than one leg at once, which
       is what the guard is for. */
    for (let spin = n; ; ) {
      const f = R[car.leg], g = R[(car.leg + 1) % n];
      const dx = g.x - f.x, dy = g.y - f.y, L2 = dx * dx + dy * dy || 1;
      const t = ((car.x - f.x) * dx + (car.y - f.y) * dy) / L2;
      if (t < 1 || spin-- <= 0) { car.t = clamp(t, 0, 1); break; }
      car.leg = (car.leg + 1) % n;
    }
    let leg = car.leg;
    let f = R[leg], g = R[(leg + 1) % n];
    let L = Math.hypot(g.x - f.x, g.y - f.y) || 1;
    let along = car.t * L;
    const step = TILE * 0.5;
    while (s < reach && out.length < 48) {
      along += step;
      for (let spin = n + 1; along > L && spin-- > 0; ) {
        along -= L;
        leg = (leg + 1) % n;
        f = R[leg]; g = R[(leg + 1) % n];
        L = Math.hypot(g.x - f.x, g.y - f.y) || 1;
      }
      const ux = (g.x - f.x) / L, uy = (g.y - f.y) / L;
      const x = f.x + ux * along - uy * car.off;
      const y = f.y + uy * along + ux * car.off;
      s += Math.hypot(x - px, y - py);
      out.push({ x, y, s, ux, uy });
      px = x; py = y;
    }
    this.bounds(out);
    return out;
  },

  /* The box round a plot, hung on the list itself. It exists for giveWay(),
     which is the one thing in here that compares a whole path against a whole
     path: sixteen vehicles is a hundred and twenty pairs and each pair is two
     lists of thirty points, which is the only arithmetic in this file big
     enough to be worth not doing. Almost every pair in a town laid out on a
     grid is two streets apart, and two rectangles say so in four comparisons. */
  bounds(plot) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < plot.length; i++) {
      const p = plot[i];
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    plot.x0 = x0; plot.y0 = y0; plot.x1 = x1; plot.y1 = y1;
  },

  /* ---- how fast round what is coming ----
     Read off the plot as CURVATURE — how many radians of turn there are between
     here and a point down the road, over how far — rather than guessed at from
     the distance to the next waypoint, which is what this used to do and is why
     a bus took a right-angle at half cruise and finished it on the wrong side
     of the road.

     Two limits and the answer is the smaller. GRIP: a bend of radius r may be
     taken at the square root of A times r and no faster, where A is what this
     vehicle will stand sideways. LOCK: the wheel only turns so fast, so a
     heading change of `dev` radians needs dev/turn seconds of road, and
     anything quicker than that arrives at the corner still pointing at the
     wall. Asked of every point on the plot rather than of one, because a bus is
     long enough to be in two corners at once. */
  bend(car) {
    const d = car.def, plot = car.plot;
    if (plot.length < 3) return Infinity;
    const A = d.turn * d.top * 0.34;
    /* Measured against the LANE at the car rather than against the car's own
       heading, which is what it was and which was quietly a second rule: a car
       that had been shoved sideways was pointing a long way from its lane, read
       that as a hairpin two feet in front of it, and asked for about eleven
       pixels a second — so it crawled back onto the road over half a minute
       instead of driving back onto it, and the recovery harness got worse the
       better the cornering got. How far a car is from pointing where it means
       to go is a real reason to slow down and it is handled at the end of
       steerTraffic(), where it has a floor under it. This is about the ROAD. */
    const ax = plot[1].ux, ay = plot[1].uy;
    let want = Infinity;
    for (let i = 2; i < plot.length; i++) {
      const p = plot[i];
      const dev = Math.acos(clamp(p.ux * ax + p.uy * ay, -1, 1));
      if (dev < 0.13) continue;
      /* Its own length of road before the turn has to have started: a bus
         begins a corner from further back than a hatchback, and the difference
         between them is a bus. */
      const run = Math.max(TILE * 0.55, p.s - d.len * 0.35);
      want = Math.min(want, Math.sqrt(A * run / dev), d.turn * run / dev);
    }
    return want;
  },

  /* HOW MUCH STRAIGHT ROAD IS IN FRONT OF IT, in pixels, up to the end of the
     plot. Asked by the two rules that move a car sideways, because both of them
     are about sitting somewhere other than on the lane and neither of them
     means it round a corner: a shift is faded out as a corner comes up and a
     pull-out is not begun at all within a few car lengths of one. */
  straight(car) {
    const plot = car.plot;
    if (!plot || plot.length < 3) return 0;
    const ux = plot[1].ux, uy = plot[1].uy;
    for (let i = 2; i < plot.length; i++) {
      if (plot[i].ux * ux + plot[i].uy * uy < 0.94) return plot[i].s;
    }
    return plot[plot.length - 1].s;
  },

  /* ---- what it is about to do ----
     The amber on the corner of the car, and it is the one thing out here that
     exists entirely for somebody else to read.

     It used to be taken from `wheel`, which is where the steering actually IS,
     so every vehicle in town signalled DURING its turn. That is not what an
     indicator is for. A driver signals before the wheel moves, far enough back
     that the car behind can do something about it, and the reason this can now
     be done properly is the plot: a corner two seconds up the road is a fact
     this driver already has, and it did not before.

     Three things get signalled, and they are the three things a driver on this
     map actually does: a corner that is coming, moving out or back in across
     the lane, and pulling away from a stop. Latched for the better part of a
     second once it is on, because an indicator that goes off between two blinks
     reads as a fault rather than as a decision. */
  signal(car, dt) {
    const plot = car.plot;
    let want = 0;
    /* A corner, a second or so ahead — which is to say further ahead at speed,
       exactly as a driver's arm is. Deliberately shorter than it could be: this
       has the whole plot to read and could signal nine tiles out, and a car
       that indicates nine tiles before a junction is a car whose indicator is
       on half the time, which tells the driver behind nothing at all. */
    const far = Math.max(TILE * 2.2, Math.abs(car.fwd) * 1.05);
    const ax = plot[1] ? plot[1].ux : Math.cos(car.a), ay = plot[1] ? plot[1].uy : Math.sin(car.a);
    for (let i = 2; i < plot.length; i++) {
      const p = plot[i];
      if (p.s > far) break;
      const cross = ax * p.uy - ay * p.ux, dot = ax * p.ux + ay * p.uy;
      if (Math.abs(Math.atan2(cross, dot)) > 0.45) { want = cross > 0 ? 1 : -1; break; }
    }
    /* Moving over, or coming back. How fast the lane offset is CHANGING rather
       than how big it is — sitting a foot off your lane is not a manoeuvre and
       getting there is — and only when there is a manoeuvre to signal: this
       traffic is permanently making six-inch corrections round the cars parked
       on every kerb in town, and indicating for each of them would be a town of
       cars with a fault. Either it is committed to going round something, or it
       is a good half-lane out. */
    if (!want) {
      const was = car.wasOff === undefined ? car.off : car.wasOff;
      const shift = (car.off - was) / dt;
      if (Math.abs(shift) > TILE * 1.2 && (car.pull > 0 || Math.abs(car.off) > TILE * 0.45)) {
        want = shift > 0 ? 1 : -1;
      }
    }
    car.wasOff = car.off;
    /* And pulling out from a stop, which is the one the bus stop's own act
       claims about the 41 and which used to be true by accident. */
    if (!want && car.stopCool > 0) want = 1;

    if (want) { car.blink = want; car.blinkT = 0.7; }
    else if ((car.blinkT -= dt) <= 0) { car.blink = 0; car.blinkT = 0; }
  },

  /* ---- how fast with this much road in front ----
     Two numbers and the smaller wins. The first is the speed this car could
     still slow to whatever is in front of it from, inside the gap it has, which
     is what stops it hitting anything. The second is a HEADWAY — the gap over
     the time it wants to keep — which is what makes it sit at a sensible
     distance behind rather than at the closest distance that is survivable.

     This is what replaced `want = 0`, and it is the difference between traffic
     and a row of cars having a nervous breakdown. */
  follow(car, gap, lead, stand) {
    const g = gap - (stand === undefined ? this.STAND : stand);
    if (g <= 0) return 0;
    const b = car.def.acc * this.BRAKE;
    const v = Math.max(0, lead || 0);
    return Math.min(Math.sqrt(v * v + 2 * b * g), g / this.HEAD + v);
  },

  /* ---- what is in the way ----
     For everything near enough to matter, find the point on the plot it is
     nearest to and ask, in THAT point's frame, whether this car's body would be
     inside it if the car were there. The answer comes back as a DISTANCE and a
     DEPTH — how far away the thing is, and how far into the corridor it reaches
     — because a car six inches into your lane and a car lying across it are not
     the same event, and only one of them is a thing you stop for.

     Sorted by distance and then walked in order, so that a car which is only
     clipping the corridor is moved over for and the scan carries on past it to
     whatever is behind it. That is a driver going round a parked car without
     lifting off, which is what everybody does and what nothing out here did. */
  scan(car) {
    const d = car.def, plot = car.plot;
    const out = { gap: Infinity, lead: 0, what: null, sit: null };
    if (!plot || plot.length < 2) return out;
    const far = plot[plot.length - 1].s;
    const half = d.wid * 0.5;
    const found = [];
    for (const o of this.list()) {
      if (o === car) continue;
      const rr = far + d.len * 0.5 + o.def.len * 0.5 + TILE;
      const qx = o.x - car.x, qy = o.y - car.y;
      if (qx * qx + qy * qy > rr * rr) continue;
      const p = this.nearest(plot, o.x, o.y);
      const dx = o.x - p.x, dy = o.y - p.y;
      const u = dx * p.ux + dy * p.uy;
      if (p.s + u <= 0) continue;
      /* THE OTHER CAR IN THIS PATH'S FRAME. Its extent along the corridor and
         its extent across it, which for anything lying at an angle are neither
         its length nor its width but a mixture of the two. Measured this way
         round everywhere in this file since the day a car abandoned broadside
         across a lane — which is its own LENGTH wide to anybody coming up
         behind it — was measured as a car's width and the town queued behind it
         until five. */
      const oc = Math.cos(o.a), os = Math.sin(o.a);
      const e1 = oc * p.ux + os * p.uy, e2 = oc * p.uy - os * p.ux;
      const along = Math.abs(e1) * o.def.len * 0.5 + Math.abs(e2) * o.def.wid * 0.5;
      const across = Math.abs(e2) * o.def.len * 0.5 + Math.abs(e1) * o.def.wid * 0.5;
      const v = -dx * p.uy + dy * p.ux;
      const pen = half + across + this.ROOM - Math.abs(v);
      if (pen <= 0) continue;
      found.push({ o, p, gap: p.s + u - d.len * 0.5 - along,
        pen, side: v > 0 ? -1 : 1, lead: o.fwd * e1, person: false });
    }
    /* And the people, in the same corridor and by the same walk. There is no
       depth test on this one and there never will be: a car goes round a parked
       car and it does not go round somebody on a crossing. */
    const r = Collide.PERSON_R;
    const person = (x, y) => {
      const qx = x - car.x, qy = y - car.y;
      if (qx * qx + qy * qy > (far + d.len) * (far + d.len)) return;
      const p = this.nearest(plot, x, y);
      const dx = x - p.x, dy = y - p.y;
      const u = dx * p.ux + dy * p.uy;
      if (p.s + u <= 0) return;
      if (Math.abs(-dx * p.uy + dy * p.ux) > half + r + TILE * 0.28) return;
      found.push({ o: null, p, gap: p.s + u - d.len * 0.5 - r,
        pen: Infinity, side: 1, lead: 0, person: true });
    };
    if (!this.driving) person(P.x, P.y);
    for (const nn of NPCM.list) person(nn.x, nn.y);
    for (const pp of Peds.list()) person(pp.x, pp.y);
    if (!found.length) return out;

    found.sort((a, b) => a.gap - b.gap);
    /* Where this driver would have to be sitting, across the lane, for none of
       this to be in the way. It starts where it is sitting now and is moved by
       each thing it can get past, which is why it is an ABSOLUTE offset and not
       a correction: a correction that came back as nothing would leave a car
       parked half a lane over for the rest of the shift, having forgotten what
       it moved over for. Nothing in the way is `null`, and null means the lane. */
    let sit = car.off;
    for (const h of found) {
      if (h.person) { out.gap = h.gap; out.lead = 0; out.what = 'person'; break; }
      /* Only clipping, and there is room to sit that far over: shift, and go on
         looking at whatever is beyond it. */
      const k = sit + h.side * (h.pen + 2);
      if (Math.abs(k) <= this.EDGE && this.roomBeside(car, h, k)) { sit = k; out.sit = k; continue; }
      out.gap = h.gap; out.lead = h.lead; out.what = h.o;
      break;
    }
    return out;
  },

  /* THE POINT ON THE PLOT THIS THING IS NEAREST TO, which is where the car is
     going to pass it and therefore the only frame in which "is it in my way"
     means anything.

     This is not the obvious way round and the obvious way round was wrong. The
     first version walked the plot in order and took the first sample at which
     the car's body would be level with the obstacle, measured along THAT
     sample's direction — which is fine on a straight and nonsense on a corner,
     because sample zero's direction is the car's own heading and a car halfway
     round a right-angle is pointing at neither of the two roads it is on. A bus
     at the mouth of Aldergate Rise, pointing north-east, decided that a car
     parked on the north kerb of the road it was TURNING ONTO was off to its
     right, tried to move left to clear it, found that took it past the width of
     a lane, gave up and stopped — with, by the end, three vehicles behind it.
     Nearest is the answer, because the corridor is the path and not the nose. */
  nearest(plot, x, y) {
    let best = plot[0], bd = Infinity;
    for (let i = 0; i < plot.length; i++) {
      const dx = x - plot[i].x, dy = y - plot[i].y, q = dx * dx + dy * dy;
      if (q < bd) { bd = q; best = plot[i]; }
    }
    return best;
  },

  /* IS THERE ROOM TO SIT THAT FAR OVER — asked of the two things that can stop
     there being. The road, because a car may not leave it to get round
     something; and everything else on the road, tested with the same box the
     driving is tested with. Probed where the car would BE beside the obstacle
     rather than where it is now, because that is the bit that has to fit.

     The angle is borrowed for the length of the test, the way rejoin() borrows
     it: carFits() asks about the rectangle at the angle the car is holding, and
     the angle that matters here is the one it will be holding when it gets
     there. */
  roomBeside(car, h, k) {
    const p = h.p, shift = k - car.off;
    const x = p.x - p.uy * shift, y = p.y + p.ux * shift;
    if (this.routeIsRoad(car) && !this.onRoad(x, y)) return false;
    const held = car.a;
    car.a = Math.atan2(p.uy, p.ux);
    const fits = Collide.carFits(car, x, y);
    car.a = held;
    return fits;
  },

  /* ---- who gets the junction ----
     Two plots, and the first place they cross. Everything about this is meant
     to happen BEFORE either car arrives: the old rule was a four-second timer
     that fired once two cars had already stopped facing each other, which is
     not priority, it is an apology.

     Only genuinely CROSSING paths are settled here, and the dot product is what
     says so. Two cars nose to tail in the same lane, or passing in opposite
     ones, are not a junction — they are the following model and the width of
     the road respectively.

     The third case, two lanes MERGING into one, has been tried here twice and
     taken out twice, and the second attempt is worth recording because it
     looked right. Half the junctions on this map join rather than cross: the 41
     comes down Marlow Street and turns west into Corven Way and the 12 comes up
     Marlow Street and turns west into Corven Way, and settling that before they
     arrive is obviously better than settling it nose to nose. The trouble is
     that a car FOLLOWING another down the same lane is the same geometry, and
     the rule that tells them apart — has the other vehicle already ARRIVED at
     the point where the paths join — is right about the pair and wrong about
     the junction, because at a junction the car already in it is exactly the
     one you must give way to. Taking it out cost two seconds on the control and
     bought back four vehicles' worth of legs on the scenario that leaves four
     cars across junction mouths. A merge is settled by the deadlock rule at the
     bottom of steerTraffic() instead, which is a worse-looking answer — two
     buses do come to a stop facing each other first — and is an answer.

     Skipping the pairs is also what keeps this cheap: almost every pair on this
     map is thrown out by the box test before the loop runs at all.

     The decision itself is antisymmetric by construction, which is the only
     property that matters: whatever two cars conclude, exactly one of them must
     conclude that it is waiting. Both waiting is slow and survivable; both
     going is a crash. */
  giveWay(car) {
    const mine = car.plot;
    if (!mine || mine.length < 3) return Infinity;
    let best = Infinity;
    for (const other of this.list()) {
      if (other === car) continue;
      const his = other.plot;
      if (!his || his.length < 3) continue;
      const clear = (car.def.wid + other.def.wid) * 0.5 + TILE * 0.6;
      /* Two streets apart, which almost every pair on a grid is. */
      if (mine.x0 > his.x1 + clear || his.x0 > mine.x1 + clear
        || mine.y0 > his.y1 + clear || his.y0 > mine.y1 + clear) continue;
      let si = -1, sj = 0;
      /* EVERY point of each, and it was worth trying every other one: the pair
         of numbers this comes back with has to be the same pair whichever of
         the two cars is asking, or the two of them reach opposite conclusions
         about who is waiting and both wait. Sampling one path coarsely and the
         other finely is exactly how to make that happen, and it cost a car a
         ninety-four-second hold in the harness. The box test above is where the
         work is saved; this loop runs for the handful of pairs that survive it. */
      for (let i = 1; i < mine.length && si < 0; i++) {
        for (let j = 1; j < his.length; j++) {
          const dx = his[j].x - mine[i].x, dy = his[j].y - mine[i].y;
          if (dx * dx + dy * dy > clear * clear) continue;
          if (Math.abs(mine[i].ux * his[j].ux + mine[i].uy * his[j].uy) > 0.72) continue;
          si = mine[i].s; sj = his[j].s;
          break;
        }
      }
      if (si < 0) continue;
      /* Already in it. A car that stops in the middle of a junction to give way
         is worse than either car going. */
      if (si < car.def.len * 0.6) continue;
      if (!this.yields(car, other, si, sj)) continue;
      /* STOPPED FAR ENOUGH BACK TO BE OUT OF THE WAY, which is not the same as
         stopped before the point. A vehicle that pulls up with its nose a few
         pixels short of where the two paths meet has its whole body across the
         mouth of the junction, and the car it is giving way to cannot take what
         it has been given: the 41 did exactly that to the 12 at Corven Way
         every lap — correctly deciding the 12 had the crossing, and standing in
         it while the 12 waited. A tile and a bit of clearance is the difference
         between giving way and being in the way. */
      best = Math.min(best, si - car.def.len * 0.5 - TILE * 1.3);
    }
    return best;
  },
  /* Does THIS car wait? Whoever gets there first goes, and where neither of
     them clearly does it is the rule on the sign: give way to the right. Nose
     to nose, where neither is to the other's right, the ids decide, because
     something has to and a coin lands differently every frame.

     The hysteresis is not a nicety. Two cars sitting either side of the
     boundary swap decisions sixty times a second and neither of them ever
     moves; once a car has given way to somebody it goes on giving way until the
     case for it is clearly gone. Note that the band can only ever SHRINK for
     the car already waiting, which is what keeps the pair of them from both
     deciding to go. */
  yields(car, other, si, sj) {
    const floor = v => Math.max(Math.abs(v), 24);
    const mine = si / floor(car.fwd), his = sj / floor(other.fwd);
    const band = car.gave === other.id ? 0.12 : 0.4;
    let give;
    if (mine > his + band) give = true;
    else if (his > mine + band) give = false;
    else {
      const c = Math.cos(car.a), s = Math.sin(car.a);
      const dx = other.x - car.x, dy = other.y - car.y;
      const onMyRight = (-dx * s + dy * c) > TILE * 0.4;
      const onHisRight = (dx * Math.sin(other.a) - dy * Math.cos(other.a)) > TILE * 0.4;
      give = onMyRight !== onHisRight ? onMyRight : car.id > other.id;
    }
    if (give) car.gave = other.id;
    else if (car.gave === other.id) car.gave = null;
    return give;
  },

  steerTraffic(car, dt) {
    const d = car.def, plot = car.plot;
    /* A route and a plot, or there is nothing here to do. Everything below
       reads both, and `traffic: true` with no `route:` in a catalogue is a
       typo rather than a vehicle. */
    if (!plot || plot.length < 2 || !car.route || car.route.length < 2) return;
    if (car.honkT > 0) car.honkT = Math.max(0, car.honkT - dt);

    /* Off the road, on a route that is a road. Not an emergency on its own —
       half a wheel over a kerb at a junction is a Tuesday — but a car that has
       been off it for a few seconds is a car whose idea of which leg it is on
       is no longer worth anything. */
    const road = this.routeIsRoad(car);
    const astray = road && !this.onRoad(car.x, car.y);
    car.lost = astray ? car.lost + dt : 0;
    if (!astray) car.rerouted = false;
    else if (car.lost > 2.5 && !car.rerouted) { car.rerouted = true; this.relocate(car); return; }
    /* Half a minute of it, and it has not been shoved off its lane — it has
       been shoved somewhere a lane cannot get it back from. See rejoin(). */
    else if (car.lost > 30 && this.rejoin(car)) return;

    /* Reversing out of something. Owns the car until its timer runs out. */
    if (car.back > 0) { this.shuntBack(car, dt); return; }

    const c = Math.cos(car.a), s = Math.sin(car.a);
    /* ---- how fast ----
       Its own cruise, and then every reason to be going slower than that, each
       of them a speed rather than a veto. The smallest wins, and because they
       are all speeds rather than flags the car arrives at each of them by
       slowing down for it instead of by stopping on top of it. */
    let want = Math.min(car.cruise, this.bend(car));
    if (astray) want = Math.min(want, 52);

    /* A kerb straight ahead. Walking pace, on the grounds that everything that
       goes wrong out here goes wrong at speed. */
    if (road && !astray) {
      const look = d.len * 0.5 + Math.max(TILE * 0.7, Math.abs(car.fwd) * 0.4);
      if (!this.onRoad(car.x + c * look, car.y + s * look)) want = Math.min(want, car.cruise * 0.42);
    }

    /* THE BUS STOP. A route point a vehicle SERVES rather than passes, and the
       only thing out here that stops on purpose. Nothing below suppresses the
       queue behind it, deliberately: a car held up by a stopped bus is a car
       held up by a stopped bus, and the rules below know exactly what to do
       about one. It is the most realistic traffic this town has. */
    if (car.stops.length) want = this.serveStop(car, want, c, s, dt);

    /* WHAT IS IN THE WAY. */
    const see = this.scan(car);
    car.blockedBy = (see.what && see.what !== 'person') ? see.what : null;
    /* How far off the thing holding it up is, published for the car that thing
       is holding up. The give-way rule below is the only thing out here that
       needs to know what somebody ELSE can see. */
    car.gapTo = see.what ? see.gap : Infinity;
    /* The thing in front, when it is a vehicle rather than somebody on foot.
       Three rules below take a different view of the two and every one of them
       would otherwise have to say so twice. */
    const other = see.what !== 'person' ? see.what : null;
    if (see.what) {
      want = Math.min(want, this.follow(car, see.gap, see.lead,
        see.what === 'person' ? this.STANDP : this.STAND));
    }
    /* How long it has been held up by whatever that is. The clock the pull-out
       below runs on, and the only thing in here that has to know the difference
       between a queue and an obstruction. */
    car.hold = (see.what && want < car.cruise * 0.45) ? car.hold + dt : 0;

    /* WHO GETS THE JUNCTION. */
    const give = this.giveWay(car);
    if (give < Infinity) want = Math.min(want, this.follow(car, give, 0, 0));

    /* ---- sitting off the lane ----
       Two reasons a car sits off its own lane, and they are the same number.
       The first is the shift the scan has just asked for, which is a driver
       moving over for something that is clipping the corridor — a parked car
       with its nearside wheels on the line, which is most of the parked cars on
       this map. The second is a PULL-OUT, which is the whole manoeuvre: after a
       few seconds behind something that is plainly never going to move, and
       only where the offside is clear road the car actually fits in with
       nothing coming the other way, it goes round. Committed to for a few
       seconds, because a pull-out reconsidered every frame is a car twitching
       at a kerb — and never, ever, for a person. */
    const run = this.straight(car);
    if (car.pull > 0) car.pull -= dt;
    else if (see.what && see.what !== 'person' && !astray
             && car.hold > 2.6 && run > d.len * 3.5 && Math.abs(see.what.fwd) < 6) {
      const by = this.roomToPass(car, see.what);
      if (by) { car.pull = 4.2; car.pullBy = clamp(by, -this.MAXOFF, this.MAXOFF); car.past = see.what; }
    }
    if (car.pull > 0 && see.what !== 'person'
        && (!see.what || see.what === car.past)) want = Math.max(want, 34);
    let off = car.pull > 0 ? car.pullBy
      : (see.sit === null ? 0 : clamp(see.sit, -this.EDGE, this.EDGE));
    if (astray && car.pull <= 0) off = 0;
    /* A PULL-OUT is faded out as a corner comes up, for the reason given over
       MAXOFF: a whole lane's worth of offset that survives into a turn is a
       whole lane's worth of offset applied in a direction nobody asked for.
       The ordinary shift is not faded, and must not be: it is a fraction of a
       lane, it is what gets a car past the cars parked on the corner of every
       street on this map, and taking it away at corners left one at the mouth
       of Aldergate Rise with a parked hatchback seven pixels into its corridor,
       stopped, for the rest of the shift, with three buses behind it. */
    if (car.pull > 0) off *= clamp(run / (d.len * 3), 0, 1);
    /* Out briskly and back gently. A car that returns to its lane as fast as it
       left it is a car swerving; one that drifts back over a couple of seconds
       is a car that went round something. */
    const rate = (Math.abs(off) > Math.abs(car.off) ? TILE * 2.6 : TILE * 0.9) * dt;
    car.off += clamp(off - car.off, -rate, rate);

    /* ---- where to point ----
       Pure pursuit down its own plot: aim at the point a lookahead in front of
       it and turn towards that. The lookahead grows with the speed AND with the
       car, because a bus that aims where a hatchback aims turns in too early
       and puts its back wheels over the kerb — which is exactly what the flat
       tile-and-a-bit this used to use did to the 41A at every corner in town. */
    const Ld = Math.max(d.len * 0.62, d.len * 0.34 + Math.abs(car.fwd) * 0.42);
    let tx = plot[plot.length - 1].x, ty = plot[plot.length - 1].y;
    for (let i = 1; i < plot.length; i++) {
      if (plot[i].s >= Ld) { tx = plot[i].x; ty = plot[i].y; break; }
    }
    let err = Math.atan2(ty - car.y, tx - car.x) - car.a;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    /* The front wheels turn the car only while the car is going somewhere. That
       is true of the one being driven and has never been true out here: a
       traffic car could pirouette at a standstill, and one wedged against a
       kerb did, all afternoon, at sixty frames a second.
       WITH ONE EXCEPTION, and it is the one case where a stationary driver
       really does turn the wheel: asking to go and not going. Corven Way is six
       tiles wide with an estate parked on the south kerb, and a bus is wide
       enough that the lane centre puts four pixels of it through the estate's
       flank — so the 41A has to sit half a metre north of its lane to get past,
       it can only get there by steering, and steering needs it to be moving,
       and it could not move because it was against the estate. It stood there
       for a hundred and sixteen seconds of a hundred and eighty, reversing and
       trying again on exactly the same line. A fifth of full lock is a driver
       shuffling round something, and it only ever applies to a driver who is
       already stuck. */
    const shuffle = want > 6 && Math.abs(car.fwd) < 4 ? 0.22 : 0;
    const bite = Math.max(shuffle, Math.min(1, Math.abs(car.fwd) / (d.top * 0.09)));
    car.a += clamp(err * 2.7, -d.turn, d.turn) * dt * bite;
    car.wheel = clamp(err * 1.6, -1, 1);
    this.signal(car, dt);
    /* And the last word on the speed: a car that is pointing a long way from
       where it means to go slows down until it is not. */
    want = Math.min(want, car.cruise * (1 - Math.min(0.72, Math.abs(err) * 1.3)));

    /* ---- jammed ----
       The other kind of stuck, and the one that needed its own clock. `stuck`
       below is a car that is asking to go and not going with nothing in front
       of it; this is two vehicles that have got themselves interlocked — nose
       into flank at a junction mouth, which is what two buses a hundred and
       forty pixels long do at the corner of Marlow Street and Corven Way if
       they arrive together — and neither of them can move forwards, so neither
       of them is ever going to discover that it could move backwards.

       It is deliberately a separate number and not another clause on `stuck`,
       because `stuck` is counted down twice as fast as it is counted up (so
       that inching through a tight junction never triggers it) and this is the
       case where the thing in front twitches just often enough to keep the
       count at nought point three for ever. It did, for forty seconds, every
       run.

       What it must not do is reverse out of an honest queue, so the whole chain
       in front is asked first: anybody waiting behind a red light or behind a
       bus at a stop is waiting for a reason, however long it takes, and the
       reason belongs to whoever is at the front of the queue. */
    if (this.excused(car) || !other || see.gap > 8 || Math.abs(car.fwd) > 6) car.jam = 0;
    else car.jam += dt;
    if (car.jam > 14) {
      car.jam = 0; car.pull = 0; car.off = 0; car.press = 0;
      car.back = 1.3;
      if (++car.shunt % 3 === 0) this.relocate(car);
      return;
    }

    /* ---- stuck ----
       Which is not being held up: it is asking to go, and it is not going. That
       can only be something the route does not know about — a kerb, a bollard,
       the corner of a bus shelter — and the answer to all of them is the one a
       person uses, which is reverse and try again. Counted up and down rather
       than latched, so a car inching through a tight junction never triggers
       it, and never at all for a vehicle that is stopped on purpose.

       The second clause is the one the old version did not have, and it cost a
       car twenty-six seconds of every harness run. It only ever counted a car
       with NOTHING in front of it, on the grounds that something in front is a
       reason to be stopped — so a car that had crept into the back of a parked
       one and could not move reported the parked car as its reason and never
       reversed. Touching something that has not moved in five seconds is not a
       queue, it is a wedge. */
    const wedged = see.what && see.what !== 'person' && see.gap < 3
      && see.what.stopped > 5;
    if (car.stopFor > 0 || car.stopCool > 0 || car.serving) car.stuck = 0;
    else if (want > 12 && Math.abs(car.fwd) < 8 && !see.what) car.stuck += dt;
    else if (wedged && car.stopped > 5) car.stuck += dt * 0.7;
    else car.stuck = Math.max(0, car.stuck - dt * 2);
    if (car.stuck > 1.1) {
      /* `off` is deliberately KEPT. It is this driver's answer to whatever it
         is stuck against — sit a foot to the right of the lane and the thing
         goes past — and throwing it away on the way into the reverse is what
         made the reverse pointless: the car backed off, came forward on exactly
         the line that had just failed, and stuck again. Round and round. */
      car.stuck = 0; car.pull = 0;
      car.back = 1.0 + (car.shunt % 3) * 0.35;
      if (++car.shunt % 3 === 0) this.relocate(car);
      return;
    }

    /* ---- nobody waits for ever ----
       The junction rule above settles CROSSING paths before anybody arrives.
       What it deliberately does not settle is two cars MERGING — two lanes that
       become one, which on this map is every second corner, because four
       circuits share nine junctions and half of them join rather than cross.
       Two vehicles arriving at one of those are each in the other's corridor
       and each perfectly correctly stops for the other, for ever: the 41 coming
       down Marlow and the 12 coming up it both turn west into Corven Way at the
       same mouth, and they sat there looking at each other for the whole of a
       three-minute harness run with a queue of four behind them.

       So: a car whose own blocker is blocked by IT is in a deadlock, and a
       deadlock needs exactly one of the two to go. Which one is the same
       antisymmetric question the junction asks, asked of the two gaps instead
       of two arrival times — nearest the join goes, and where that is a tie it
       is give way to the right and then the ids, because something has to
       decide and a coin lands differently every frame.
       It creeps rather than drives: slowly enough that touching the thing in
       front is silent (see prang()), and not at all once it is touching. */
    const facing = !!other;
    if (facing && other.blockedBy === car && (car.stopped > 1.2 || car.press > 0)
        && !this.yields(car, other, Math.max(0, see.gap), Math.max(0, other.gapTo))) {
      /* LATCHED, and the latch is the whole of whether this works. Without it
         the winner accelerates, stops being stopped, stops being the winner on
         the very next frame, brakes, comes to rest and starts again: half a
         tile in half a minute, which is not a car going and is not a deadlock
         breaking either. Two seconds of going is a car going. */
      car.press = 2;
    }
    /* And the same thing again with no cleverness in it at all, for whatever
       gets past the rule above: five seconds nose to tail with something that
       is not at a red, and somebody creeps. */
    else if (facing && car.stopped > 5 && see.gap < TILE) car.press = 1;
    car.press = Math.max(0, (car.press || 0) - dt);
    if (car.press > 0 && facing && see.gap > -4) want = Math.max(want, 26);

    /* ---- the brake lights ----
       Latched for a quarter of a second, because they are not a readout of the
       speed, they are a signal to the driver behind — and a signal that goes on
       and off four times a second is not one. A car easing along behind a bus
       is constantly a hair either side of the speed it wants, and every one of
       those crossings used to be a flash of red. */
    const slowing = want < car.fwd - 8 || (!!see.what && see.gap < TILE * 2.5);
    if (slowing) car.brakeT = 0.28;
    else car.brakeT = Math.max(0, (car.brakeT || 0) - dt);
    car.braking = slowing || car.brakeT > 0;
    if (want > car.fwd) car.fwd = Math.min(want, car.fwd + d.acc * dt);
    else car.fwd = Math.max(want, car.fwd - d.acc * 2.2 * dt);
    if (car.fwd < 1.5 && car.fwd > -1.5) car.fwd = 0;

    /* Held up for long enough to have an opinion about it. Once, quietly, and
       then it waits like everybody else — and never at a red, because nobody
       sounds the horn at a traffic light. They sound it at the car in front of
       them a second after the light has changed, which is a different game. */
    if (car.braking && car.stopped > 2.4 && !car.honkT) { Sfx.horn(); car.honkT = 6; }
  },

  /* IS THERE A REASON FOR THIS QUEUE. Walked up the chain of who is blocked by
     whom rather than asked of this car alone, because the reason a car is
     standing still is almost never a fact about that car: three vehicles at a
     red are three vehicles going nowhere for an excellent reason and only the
     first of them is the one the light is talking to. Bounded, because a ring
     of cars each blocked by the next is exactly the deadlock the rules above
     exist to break and is not something to hang a loop on. */
  excused(car) {
    let c = car;
    for (let n = 0; c && c !== 'person' && n < 6; n++) {
      if (c.stopFor > 0 || c.serving || c.stopCool > 0) return true;
      c = c.blockedBy;
    }
    return false;
  },

  /* Reversing out of it. Not a special case for kerbs but the manoeuvre any
     driver uses when forwards has stopped being a direction: off the throttle,
     back the better part of a car's length, tail swung towards where the lane
     is. The reverse lights come on for nothing, because the renderer has lit
     the back pair below four miles an hour backwards since the day it was
     written.
     Aiming the TAIL is the trick. The heading it wants is the opposite of the
     way it is about to travel, so steering at a point on its own lane BEHIND
     it swings the nose off whatever it is against and leaves the car pointing
     down its own lane when it stops — which is a three-point turn done in two,
     and is why it usually only takes one go. */
  shuntBack(car, dt) {
    const d = car.def, R = car.route, n = R.length;
    car.back -= dt;
    car.braking = false;
    /* Something behind it, and it stops. The rule at the top of this file is
       about people and it does not stop being about people in reverse. */
    if (this.behind(car)) { car.back = 0; car.fwd = 0; return; }
    const f = R[car.leg], g = R[(car.leg + 1) % n];
    const dx = g.x - f.x, dy = g.y - f.y, L = Math.hypot(dx, dy) || 1;
    const along = (car.t || 0) * L - TILE * 1.6;
    const ux = dx / L, uy = dy / L;
    const gx = f.x + ux * along - uy * car.off, gy = f.y + uy * along + ux * car.off;
    let err = Math.atan2(car.y - gy, car.x - gx) - car.a;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    car.a += clamp(err * 1.6, -d.turn, d.turn) * dt;
    car.wheel = clamp(-err, -1, 1);
    car.fwd = Math.max(-d.top * 0.15, car.fwd - d.acc * 1.2 * dt);
  },
  /* Anything immediately behind it, which is the same geometry as the corridor
     above done backwards and over a much shorter distance: a reverse is a car's
     length, not a plan. */
  behind(car) {
    const d = car.def, c = -Math.cos(car.a), s = -Math.sin(car.a);
    const reach = d.len * 0.55 + TILE * 1.1, half = d.wid * 0.5 + 6;
    const at = (x, y, r) => {
      const dx = x - car.x, dy = y - car.y;
      const u = dx * c + dy * s;
      return u > 0 && u < reach + r && Math.abs(-dx * s + dy * c) < half + r;
    };
    for (const o of this.list()) {
      if (o === car) continue;
      if (at(o.x, o.y, Math.max(o.def.len, o.def.wid) * 0.5)) return o;
    }
    if (!this.driving && at(P.x, P.y, TILE * 0.4)) return 'person';
    for (const nn of NPCM.list) if (at(nn.x, nn.y, TILE * 0.4)) return 'person';
    for (const pp of Peds.list()) if (at(pp.x, pp.y, TILE * 0.4)) return 'person';
    return null;
  },

  /* Which leg of its own route is it actually nearest? Perpendicular distance
     to each leg, clamped to the ends so a car level with the middle of one is
     not judged by how far it is from that leg's corner.
     With one condition that is the whole value of the function: a leg it would
     have to turn round to drive is not the leg it is on, however near it
     looks. The two carriageways of a street are eight feet apart and point in
     opposite directions, and a car that picks the wrong one of them rejoins
     the traffic head-on — which is a worse outcome than the pavement it is
     being got off. */
  relocate(car) {
    const R = car.route, n = R.length;
    let best = car.leg, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const f = R[i], g = R[(i + 1) % n];
      const dx = g.x - f.x, dy = g.y - f.y, L2 = dx * dx + dy * dy || 1;
      const u = clamp(((car.x - f.x) * dx + (car.y - f.y) * dy) / L2, 0, 1);
      const px = f.x + dx * u, py = f.y + dy * u;
      const facing = Math.cos(Math.atan2(dy, dx) - car.a);
      const dist = Math.hypot(car.x - px, car.y - py) + (facing < 0 ? TILE * 8 : 0);
      if (dist < bd) { bd = dist; best = i; }
    }
    /* `lost` is deliberately NOT reset. It is the clock on this whole spell off
       the road, and rejoin() below is the end of it — a car that re-read its
       route every few seconds and started the clock again each time would
       shunt against the same wall until the building fell down. */
    car.leg = best; car.shunt = 0; car.off = 0; car.pull = 0;
  },

  /* THE LAST RESORT, and the only thing in this file that moves a car rather
     than driving one. A car can be left somewhere no route will get it back
     from: shoved through a gap, round a corner, and up onto a footway with a
     block of shops between it and every leg it owns. It is not stuck — it is
     driving, slowly, steering for its lane like a sensible car — but what it
     is driving round is a pedestrian precinct and it is never going to arrive.
     So after half a minute of that it gives up and rejoins its route at the
     nearest point on it that it fits, facing the right way, AND ONLY WHERE
     NOBODY IS LOOKING. Off camera that is a car that was not there when you
     looked, which is what every car you are not looking at is; on camera it is
     a car vanishing, which is a bug. Until it is off camera it keeps driving,
     so the worst this can ever look like from inside the game is a lost
     driver — and the worst it can look like from outside is a car that got
     itself back on the road while you were somewhere else. */
  rejoin(car) {
    if (typeof Cam !== 'undefined' && Cam.visible && Cam.visible(car.x, car.y)) return false;
    const R = car.route, n = R.length;
    const f = R[car.leg], g = R[(car.leg + 1) % n];
    const dx = g.x - f.x, dy = g.y - f.y, L = Math.hypot(dx, dy) || 1;
    const u = clamp(((car.x - f.x) * dx + (car.y - f.y) * dy) / (L * L), 0, 1);
    /* Pointed along the leg BEFORE anything is asked about fitting: carFits
       tests the box at the angle the car is holding, and the angle it is
       holding is whatever it was doing on the pavement. */
    const held = car.a;
    car.a = Math.atan2(dy, dx);
    for (const shift of [0, -TILE * 3, TILE * 3, -TILE * 6, TILE * 6]) {
      const uu = clamp(u + shift / L, 0, 1);
      const px = f.x + dx * uu, py = f.y + dy * uu;
      if (!Collide.carFits(car, px, py)) continue;
      car.x = px; car.y = py; car.fwd = 0; car.lat = 0;
      car.lost = 0; car.stuck = 0; car.back = 0; car.shunt = 0; car.pull = 0;
      car.off = 0; car.gave = null; car.rerouted = false;
      return true;
    }
    /* Its own lane occupied along its whole length is a lane with the traffic
       on it. It goes back to driving and asks again next frame. */
    car.a = held;
    return false;
  },

  /* Is there room to go round the thing in front? Where the car would BE
     halfway past it — a car's length beyond, a body's width to the side — and
     three questions asked of that spot: is it road, does the car fit in it, and
     is anything coming the other way. The offside first, because that is the
     side you overtake on in a country that drives on the left, and the nearside
     only if the offside will not have it. */
  roomToPass(car, block) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    /* HOW BIG THE THING IN FRONT IS IN THIS CAR'S FRAME, which is not the same
       as how big it is. A car lying broadside across a lane is its own LENGTH
       wide to somebody coming up behind it and its own width long. */
    const rel = block.a - car.a;
    const cr = Math.abs(Math.cos(rel)), sr = Math.abs(Math.sin(rel));
    const across = cr * block.def.wid / 2 + sr * block.def.len / 2;
    const along = cr * block.def.len / 2 + sr * block.def.wid / 2;
    const u = car.def.len * 0.5 + along * 1.8;
    for (const side of [1, -1]) {
      const k = side * (car.def.wid * 0.5 + across + 8);
      const px = car.x + c * u - s * k, py = car.y + s * u + c * k;
      if (this.routeIsRoad(car) && !this.onRoad(px, py)) continue;
      if (!Collide.carFits(car, px, py)) continue;
      /* AND NOTHING COMING. A pull-out that only asks whether the offside is
         empty NOW is a pull-out into whatever is on its way up the other lane,
         and the other lane is where everything on this network comes from. This
         is the one check the old version did not have, and it did not have it
         because nothing overtook anything until the day something did. */
      if (this.oncoming(car, k, u + along * 2)) continue;
      /* HOW FAR OVER, in pixels, and not merely which way. This used to answer
         a side and the manoeuvre used to go a flat tile and a half, which are
         two different numbers about the same thing — so a car would check that
         it fitted two tiles out, steer one and a half, and drive into the thing
         it had just proved it could get round. */
      return k;
    }
    return 0;
  },
  /* Anything on its way up the piece of road this manoeuvre is about to use.
     Its own speed is what decides how far up the road to look: a taxi doing a
     hundred and sixty is four car lengths further on by the time the pull-out
     is over than one sitting at a stop line. */
  oncoming(car, k, dist) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    for (const o of this.list()) {
      if (o === car || (!o.traffic && o !== this.driving)) continue;
      if (Math.cos(o.a) * c + Math.sin(o.a) * s > -0.4) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const u = dx * c + dy * s;
      if (u < 0 || u > dist + Math.abs(o.fwd) * 3.2) continue;
      if (Math.abs(-dx * s + dy * c - k) > (car.def.wid + o.def.wid) * 0.5 + TILE * 0.5) continue;
      return true;
    }
    return false;
  },

  /* ---- getting in and out ---- */

  /* The car within reach, for Interact. Cars are not World.objects — they are
     not on a tile and cannot be in byTile — so the interaction scan asks here
     as a third question alongside the furniture and the colleagues. */
  near(x, y) {
    let best = null, bd = TILE * 1.5;
    for (const car of this.list()) {
      if (!car.use) continue;
      const d = Math.hypot(car.x - x, car.y - y) - car.def.len * 0.28;
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  },
  /* Which controls are on screen. The whole of the difference between walking
     and driving, as far as the phone is concerned: a second stick appears in
     the other corner for the throttle, and the button that has always been
     there says what it does now instead of which key it is. Called from both
     ends of getting in and out so there is one place that can be wrong. */
  showControls() {
    const on = !!this.driving;
    /* Idempotent, because update() calls it every frame. That is deliberate:
       there are three other places that can drop `driving` — a level swapping
       out from under it, a cache eviction, a save being loaded — and a control
       layout that is only corrected by the two polite exits is a layout that
       eventually shows a throttle to somebody on foot. Checked against the
       last value so the common case is one comparison and no DOM. */
    if (this._shown === on) return;
    this._shown = on;
    document.body.classList.toggle('driving', on);
    const e = $('#touchE');
    if (e) e.textContent = on ? 'OUT' : 'E';
  },
  take(car) {
    if (!car || !car.canDrive || this.driving) return false;
    this.driving = car;
    this.seen = new Set();
    car.fwd = car.lat = 0;
    Keys.up = Keys.down = Keys.left = Keys.right = 0;
    releaseSticks();
    this.showControls();
    Sfx.door();
    Ach.get('a_drive');
    UI.toast('🚗', TOUCH
      ? 'Two sticks: the <b>left</b> one steers, the <b>amber</b> one on the right is the throttle — push it up to go, pull it down to brake and then reverse. Tap <span class="kbd">OUT</span> to get out.'
      : '<span class="kbd">W</span> to go, <span class="kbd">S</span> to brake and then reverse, <span class="kbd">A</span>/<span class="kbd">D</span> to steer. <span class="kbd">H</span> is the horn. <span class="kbd">E</span> to get out.');
    return true;
  },
  /* Out, onto the nearest bit of ground that will have you. The driver's door
     first, because that is the door you are sitting against; then the other
     side, then the back — a car pulled up hard against a wall still has to be
     gettable out of, or the game has a hole in it. */
  getOut() {
    const car = this.driving;
    if (!car) return false;
    if (Math.abs(car.fwd) > 34) {
      Sfx.deny();
      UI.toast('🚗', say('car.tooFast'));
      return false;
    }
    const c = Math.cos(car.a), s = Math.sin(car.a);
    const d = car.def;
    /* Both doors first, then further out on both sides, then the back, then
       the front. Ordered by where a person would actually get out, and gone
       through until one of them FITS — which is the whole point of testing it
       with the same box the walking does rather than with the one tile the
       middle of them lands in. A spot whose centre is clear but whose elbow is
       in a wing mirror is not a spot. */
    const spots = [];
    for (const r of [d.wid / 2 + 20, d.wid / 2 + 38]) spots.push([-6, -r], [-6, r]);
    for (const r of [d.wid / 2 + 20, d.wid / 2 + 38]) spots.push([d.len * 0.3, -r], [d.len * 0.3, r], [-d.len * 0.3, -r], [-d.len * 0.3, r]);
    spots.push([-d.len / 2 - 20, 0], [d.len / 2 + 20, 0], [-d.len / 2 - 38, 0], [d.len / 2 + 38, 0]);
    /* Best rather than first. A spot that FITS can still be a slot between the
       car and a trolley with one way out of it; a spot you can step away from
       in three directions is a pavement. Scored by how many ways out it has,
       with the order above as the tie-break, so the driver's door still wins
       when both are equally open. */
    let put = null, best = -1;
    for (const [u, v] of spots) {
      const px = car.x + u * c - v * s, py = car.y + u * s + v * c;
      if (!playerFits(px, py)) continue;
      let room = 0;
      for (const [ax, ay] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) {
        if (playerFits(px + ax, py + ay)) room++;
      }
      if (room > best) { best = room; put = [px, py]; }
      if (best === 4) break;
    }
    /* Nowhere at all — wedged between a wall and another car. You still get
       out, standing where the car is, and the rule in sync() above is what
       makes that recoverable rather than the same trap by another route. */
    car.fwd = car.lat = 0;
    this.driving = null;
    this.parked(car);
    if (put) { P.x = put[0]; P.y = put[1]; }
    P.dir = 2; P.moving = false;
    Keys.up = Keys.down = Keys.left = Keys.right = 0;
    releaseSticks();
    this.showControls();
    Sfx.door();
    if (Sfx.engine) Sfx.engine(false);
    /* Now that nobody is in it, it is a solid object again — this frame,
       rather than next, or the step out lands in a car that has not yet
       remembered it is one. */
    this.sync();
    return true;
  },
  /* Out with no ceremony and no moving anybody: the level is going away. */
  getOutQuietly() {
    if (!this.driving) return;
    this.driving.fwd = this.driving.lat = 0;
    this.driving = null;
    releaseSticks();
    this.showControls();
    if (Sfx.engine) Sfx.engine(false);
  },
  /* Did that count as parking it? Asked of the paint rather than of a list of
     bays kept in here: a level draws its bays in `paint:` and this reads the
     same rectangles, so a car park somebody redraws is a car park this agrees
     with. Straight, too, within about fifteen degrees — a car left across two
     bays at an angle is exactly what this building already has one of. */
  parked(car) {
    if (!car.canDrive) return;
    const banks = (World.def && World.def.paint || []).filter(p => p.p === 'bays');
    const tx = car.x / TILE, ty = car.y / TILE;
    for (const b of banks) {
      const [x1, y1, x2, y2] = b.r;
      if (tx < x1 || tx > x2 + 1 || ty < y1 || ty > y2 + 1) continue;
      /* Nose up the bay: the open side says which way the car came in, so the
         way it should be pointing is the opposite of it. */
      const want = this.heading(b.open === 's' ? 'n' : b.open === 'n' ? 's' : b.open === 'e' ? 'w' : 'e');
      let err = car.a - want;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      if (Math.abs(err) < 0.26) {
        Ach.get('a_parked');
        UI.toast('🅿️', say('car.parked'), 'good');
      }
      return;
    }
  }
};
