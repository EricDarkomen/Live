'use strict';
/* ---------------- Cars ----------------
   Everything else lives on a tile; a car has a pixel position, an angle and a
   speed, so it gets its own list, update and draw step.
   - The cars: built from a level's `cars:` (data/levels.js) into World.cars,
     which travels with the level, so a car left in the street stays there.
   - Driving: one `drive: true` car at a time. P is moved to the car every
     frame, so camera, minimap, street names and save all just read P.
   - Traffic: a car with a `route:` drives it for ever, keeping left, slowing
     for corners, following, giving way, and recovering when wedged or lost
     (see the note above steerTraffic()).
   Nobody gets hurt: a car always stops for a person, whoever drives it. */
const Cars = {
  /* The car being driven, or null. Not on P, because Save.write serialises P
     and a car there would come back as a detached copy. */
  driving: null,
  /* Zones (streets) driven through since getting in, for the drive achievements. */
  seen: null,
  /* A level's `drives: [{ ach, zones }]` grants `ach` once every zone is driven
     through in one go. */
  /* Held down to sound the horn, and how long it has been held — one press is
     a note, leaning on it is leaning on it. */
  horn: false, hornT: 0,

  /* ---- building ----
     A level's `cars:` entries, tiles to pixels here only. */
  build(list) {
    return (list || []).map((c, i) => {
      /* A model says what a car is; `body` recolours one car, copied so it does not
         repaint the model. One colour, since cars are seen only from above. */
      const base = CARS[c.model] || CARS.saloon;
      const def = c.body ? Object.assign({}, base, { body: c.body }) : base;
      const car = {
        id: 'c' + i, def, model: c.model, name: c.name || 'A car',
        use: c.use || null, canDrive: !!c.drive, traffic: !!c.traffic,
        /* Body-frame velocity: along the nose and sideways. Traffic pulls away from
           rest. */
        fwd: 0, lat: 0, dents: 0, wob: Math.random() * 6.28,
        x: (c.x || 0) * TILE, y: (c.y || 0) * TILE,
        a: this.heading(c.face),
        /* Brake lights, so they can be lit by braking, by traffic slowing for
           a corner and by a collision, without three places drawing them. */
        braking: false, stopped: 0, honkT: 0,
        /* Driver state, present on every car so steerTraffic() needs no tests: time
           stuck, time off-road, reverse left, shunts, and any pull-out and its side. */
        stuck: 0, lost: 0, back: 0, shunt: 0, pull: 0, pullBy: 0, past: null, rerouted: false,
        /* Where it is going: `plot` is the lane ahead, rebuilt each frame and read by
           other cars; `t` is progress down the leg; `off` is its chosen sideways
           offset; `hold` is time held up; `gave` is who it last gave way to (plot()). */
        plot: null, t: 0, off: 0, hold: 0, gave: null, gapTo: Infinity, press: 0, jam: 0,
        /* The indicator, separate from `wheel`: a driver signals before steering
           (signal()). */
        blink: 0, blinkT: 0,
        /* The signal arm holding it, by id (levels rebuild arms), and whether at red
           (Signals.hold()). */
        sig: null, atRed: false,
        /* What is holding it up, published for the car behind. */
        blockedBy: null, wheel: 0,
        /* Service stops: a vehicle with `stops:` pulls up at each (serveStop()). */
        stops: (c.stops || []).map(q => ({ x: q.at[0] * TILE, y: q.at[1] * TILE, secs: q.secs || 6 })),
        stopFor: 0, stopIdx: -1, stopCool: 0, serving: 0
      };
      if (c.route && c.route.length > 1) {
        car.route = c.route.map(p => ({ x: p[0] * TILE, y: p[1] * TILE }));
        car.leg = (c.leg || 0) % car.route.length;
        car.cruise = c.cruise || 150;
        /* Start `along` tiles down the first leg, facing along it, so cars sharing a
           route do not stack. */
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
  /* Compass letter to radians: 0 is east, y grows downwards. */
  heading(face) {
    return face === 'n' ? -Math.PI / 2 : face === 's' ? Math.PI / 2
      : face === 'w' ? Math.PI : 0;
  },
  list() { return World.cars || []; },

  /* ---- the frame ----
     From Game.tick, before the camera: the car moves the player. */
  update(dt) {
    const cars = this.list();
    if (!cars.length) { this.driving = null; return; }
    /* Drop a driven car that is no longer on this level. */
    if (this.driving && cars.indexOf(this.driving) < 0) this.driving = null;
    /* Every plot first, since cars read each other's plots to settle priority;
       otherwise half would decide against last frame's plans. Parked cars get none. */
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
      /* The player is the car while in it. */
      P.x = this.driving.x; P.y = this.driving.y;
      P.moving = Math.abs(this.driving.fwd) > 6;
      zoneCheck();
      const z = World.zoneAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE));
      if (z && this.seen) {
        this.seen.add(z);
        /* A lap (four streets) or the grid (every street), counted per drive. */
        ((World.def && World.def.drives) || []).forEach(d => {
          if (d.zones.every(k => this.seen.has(k))) Ach.get(d.ach);
        });
      }
      if (Sfx.on) Sfx.engine(true, Math.abs(this.driving.fwd) / this.driving.def.top);
      this.hornT = this.horn ? this.hornT + dt : 0;
      if (this.horn && this.hornT < dt * 1.5) { Sfx.horn(); Peds.honk(P.x, P.y); }
    } else if (Sfx.engine) Sfx.engine(false);
  },

  /* Tiles cars stand on this instant, for World.isSolid, rebuilt every frame. */
  sync() {
    const set = World.carTiles || (World.carTiles = new Set());
    set.clear();
    /* The tile the player stands on is never claimed by a car, or standing beside
       one after getting out would trap you inside solid tiles. You may always walk
       off a car; you can never walk onto one. */
    const pr = TILE * .3;
    const ptx0 = Math.floor((P.x - pr) / TILE), ptx1 = Math.floor((P.x + pr) / TILE);
    const pty0 = Math.floor((P.y - pr) / TILE), pty1 = Math.floor((P.y + pr) / TILE);
    const underfoot = (tx, ty) => tx >= ptx0 && tx <= ptx1 && ty >= pty0 && ty <= pty1;
    for (const car of this.list()) {
      /* Not the car you are in. */
      if (car === this.driving) continue;
      /* Tiles recomputed only when the car has moved; most cars are parked. */
      if (car.keyX !== car.x || car.keyY !== car.y || car.keyA !== car.a || !car.keys) {
        car.keyX = car.x; car.keyY = car.y; car.keyA = car.a;
        const keys = car.keys || (car.keys = []);
        const nums = car.nums || (car.nums = []);
        keys.length = 0; nums.length = 0;
        const d = car.def, c = Math.cos(car.a), s = Math.sin(car.a);
        const hl = d.len / 2, hw = d.wid / 2;
        /* Half-extents of the rotated box on each world axis. */
        const rx = Math.abs(c) * hl + Math.abs(s) * hw;
        const ry = Math.abs(s) * hl + Math.abs(c) * hw;
        /* Inset, so a bumper a pixel over a line does not claim the tile. */
        const tx0 = Math.floor((car.x - rx + 5) / TILE), tx1 = Math.floor((car.x + rx - 5) / TILE);
        const ty0 = Math.floor((car.y - ry + 5) / TILE), ty1 = Math.floor((car.y + ry - 5) / TILE);
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          nums.push(tx, ty); keys.push(tx + ',' + ty);
        }
      }
      /* One cheap distance check per car before testing the player per tile. */
      const near = Math.abs(P.x - car.x) < car.def.len + TILE && Math.abs(P.y - car.y) < car.def.len + TILE;
      const keys = car.keys, nums = car.nums;
      for (let i = 0, n = 0; i < keys.length; i++, n += 2) {
        if (near && underfoot(nums[n], nums[n + 1])) continue;
        set.add(keys[i]);
      }
    }
  },

  /* ---- driving ----
     An arcade model: throttle, brake, steering, and a body that slides a little. */
  drive(car, dt) {
    const d = car.def;
    let th = Keys.up - Keys.down, st = Keys.right - Keys.left;
    /* One thumb per job: the left stick steers (x only), the right is throttle
       (up to go, down to brake and reverse; y is down-positive). Either alone
       still does its half; the keys do both. */
    if (Stick.on) st = clamp(Stick.x * 1.5, -1, 1);
    if (Throttle.on) th = clamp(-Throttle.y * 1.3, -1, 1);

    car.braking = false;
    if (th > 0.05) car.fwd += d.acc * th * dt;
    else if (th < -0.05) {
      /* Down brakes while moving forwards and reverses once stopped. */
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

    /* Steering bites only with speed: full lock by a seventh of top speed,
       reversed in reverse, and a little less lock at high speed. */
    const bite = Math.min(1, Math.abs(car.fwd) / (d.top * 0.14));
    const settled = 1 - 0.32 * Math.min(1, Math.abs(car.fwd) / d.top);
    if (st) car.a += st * d.turn * dt * bite * settled * (car.fwd < 0 ? -1 : 1);
    /* Wheel angle for the renderer, eased. */
    car.wheel = lerp(car.wheel || 0, st, Math.min(1, dt * 12));
    /* The driven car indicates from the wheel, with a deadband. Traffic uses
       signal(). */
    car.blink = Math.abs(car.wheel) > 0.34 ? (car.wheel > 0 ? 1 : -1) : 0;

    this.move(car, dt);
  },

  /* Body velocity to world, sideways damped by grip, then tried against the
     world. Shared by driver and traffic. */
  move(car, dt) {
    const d = car.def;
    const c = Math.cos(car.a), s = Math.sin(car.a);
    /* Grip decays sideways velocity; low-grip cars slide longest. */
    car.lat *= Math.exp(-d.grip * dt);
    if (Math.abs(car.lat) < 0.5) car.lat = 0;
    let vx = c * car.fwd - s * car.lat, vy = s * car.fwd + c * car.lat;
    if (!vx && !vy) { car.stopped += dt; return; }

    /* Speed on the way in, for judging an impact after it is stopped. */
    const was = car.fwd, x0 = car.x, y0 = car.y;
    let hit = 0;                       /* 0 clear, 1 along something, 2 into it */
    /* No car may move onto a person, whoever drives. Tested on the step and
       skipped if already on somebody, so either can still move apart. */
    const onP = Collide.carOnPerson(car, car.x, car.y);
    const shut = (x, y) => this.hits(car, x, y) || (!onP && Collide.carOnPerson(car, x, y));
    const nx = car.x + vx * dt, ny = car.y + vy * dt;
    if (!shut(nx, ny)) { car.x = nx; car.y = ny; }
    else if (!shut(nx, car.y)) { car.x = nx; hit = 1; }
    else if (!shut(car.x, ny)) { car.y = ny; hit = 1; }
    else hit = 2;

    /* Rebuild body-frame velocity from the movement actually made, not the one
       asked for: a car held by a wall reads as stopped, so scrapes, prangs and
       the traffic's recovery all see the truth. */
    const ax = (car.x - x0) / dt, ay = (car.y - y0) / dt;
    car.fwd = ax * c + ay * s;
    car.lat = -ax * s + ay * c;
    if (hit === 1) this.scrape(car, 0.8, was);
    else if (hit === 2) this.prang(car, was);
    car.stopped = Math.abs(car.fwd) < 4 ? car.stopped + dt : 0;

    /* Wedged: when every move is refused, depenetrate slowly (Collide.carPush,
       as movePlayer does). Being stuck is never enforced. */
    const out = Collide.carPush(car);
    if (out) {
      const m = Math.hypot(out[0], out[1]) || 1, step = Math.min(m, TILE * 3 * dt);
      car.x += out[0] / m * step; car.y += out[1] / m * step;
    }

    /* Tyre smoke when the back end slides; the driven car only. */
    if (car === this.driving && Math.abs(car.lat) > 46 && FX.motion && chance(0.55)) {
      const bx = car.x - c * d.len * 0.4, by = car.y - s * d.len * 0.4;
      /* Thrown up against FX gravity so the smoke hangs where it was left. */
      FX.parts.push({ x: bx + rnd(-6, 6), y: by + rnd(-6, 6), vx: rnd(-12, 12), vy: rnd(-70, -40),
        life: rnd(.35, .6), t: 0, c: 'rgba(24,26,30,.8)' });
    }
  },

  /* Anything solid at this position (Collide.carFits). */
  hits(car, x, y) { return !Collide.carFits(car, x, y); },

  /* Along something rather than into it. Costs speed and makes a noise; no
     dent, because a scrape down a wall is not an event. */
  scrape(car, keep, was) {
    if (Math.abs(was) > 40 && car === this.driving) { FX.shake(2); Sfx.scrape(); }
    car.fwd *= keep; car.lat *= 0.2;
  },
  /* An impact, judged by the speed before it. */
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
     A car with a `route:` drives it for ever, asking five questions in order:
     - Where am I going: a plot of lane ahead, round corners (plot()).
     - How fast may I take it: the plot's curvature (bend()).
     - What is in the way: measured down the plot as a gap and closing speed
       (scan(), follow()), so cars follow rather than stop and start, move over
       for things clipping the lane, and see people in the whole corridor.
     - Who gets the junction: two plots compared before either car arrives
       (giveWay()).
     - Recovery when it has gone wrong: shuntBack(), relocate(), rejoin().
       tools/carjam.mjs exercises them.
     Nobody gets hurt: a car always stops for a person. */

  /* How a driver thinks. LOOK: seconds of road plotted ahead. HEAD: headway in
     seconds. BRAKE: planned deceleration as a multiple of the car's. ROOM:
     clearance when passing. EDGE: most it shifts within its lane rather than stop. */
  LOOK: 2.4, HEAD: 0.62, BRAKE: 1.6, ROOM: 5, EDGE: TILE * 0.85,
  /* The cap on any offset. An offset shifts the whole plot, so a large one
     swings round with the lane at a corner (hence straight()). */
  MAXOFF: TILE * 1.5,
  /* Resting gaps behind a vehicle and, larger, behind a person. */
  STAND: 13, STANDP: TILE * 1.15,

  /* Whether a pixel is road, from the level's surfaces. */
  onRoad(x, y) {
    return World.surfAt(Math.floor(x / TILE), Math.floor(y / TILE)) === 'tarmac';
  },
  /* Pull up, wait, go. Returns the speed wanted. `stopIdx` remembers the stop
     being served; `stopCool` hides stops just after pulling away so one is not
     served twice. */
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
      /* Slow over the last six tiles, as the lights do, rather than stop dead. */
      car.serving = 1;
      return Math.min(want, Math.max(0, (dist - TILE * 1.1) * 0.8));
    }
    return want;
  },
  /* Whether a vehicle stands at this tile with doors open (for bus-stop NPCs). */
  stoppedAt(tx, ty) {
    for (const car of this.list()) {
      if (car.stopFor <= 0 || car.stopIdx < 0) continue;
      const st = car.stops[car.stopIdx];
      if (Math.hypot(st.x - (tx + .5) * TILE, st.y - (ty + .5) * TILE) < TILE * 3) return car;
    }
    return null;
  },

  /* Whether this car's route is on road at all, cached. A level without
     surfaces must not have every car think it is off-road. */
  routeIsRoad(car) {
    if (car.tarmac === undefined) car.tarmac = car.route.every(p => this.onRoad(p.x, p.y));
    return car.tarmac;
  },

  /* ---- the plot ----
     The lane ahead in half-tile steps, round corners and on to later legs,
     rebuilt every frame. Points are shifted by `car.off`, so the corridor
     everything is measured against moves with the car while it passes things. */
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
      /* No route: a straight line. This is the driven car's plot, which traffic
         reads like any other, so it makes way before you arrive. */
      const step = TILE * 0.5;
      while (s < reach && out.length < 48) {
        s += step;
        out.push({ x: car.x + ca * s, y: car.y + sa * s, s, ux: ca, uy: sa });
      }
      this.bounds(out);
      return out;
    }
    /* Which leg, and how far along it (projected, so a sideways shove is not
       progress). A shoved car may pass several legs at once. */
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

  /* The plot's bounding box, for giveWay()'s cheap pair rejection. */
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
     Curvature from the plot, at every point (a bus can be in two corners). The
     lower of two limits: grip (speed ≤ √(A·r)) and lock (a heading change of
     `dev` needs dev/turn seconds of road). */
  bend(car) {
    const d = car.def, plot = car.plot;
    if (plot.length < 3) return Infinity;
    const A = d.turn * d.top * 0.34;
    /* Measured against the lane, not the car's heading, so a shoved car is not
       slowed to a crawl by a phantom hairpin; heading error is handled in
       steerTraffic(). */
    const ax = plot[1].ux, ay = plot[1].uy;
    let want = Infinity;
    for (let i = 2; i < plot.length; i++) {
      const p = plot[i];
      const dev = Math.acos(clamp(p.ux * ax + p.uy * ay, -1, 1));
      if (dev < 0.13) continue;
      /* Its own length before the turn starts: a bus turns in later. */
      const run = Math.max(TILE * 0.55, p.s - d.len * 0.35);
      want = Math.min(want, Math.sqrt(A * run / dev), d.turn * run / dev);
    }
    return want;
  },

  /* Straight road ahead in pixels, to the end of the plot. Shifts fade and
     pull-outs are refused near corners. */
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
     The indicator, from the plot: a coming corner, moving out or back in, or
     pulling away from a stop. Latched briefly so it reads as a decision. */
  signal(car, dt) {
    const plot = car.plot;
    let want = 0;
    /* A corner about a second ahead (further at speed), not the whole plot. */
    const far = Math.max(TILE * 2.2, Math.abs(car.fwd) * 1.05);
    const ax = plot[1] ? plot[1].ux : Math.cos(car.a), ay = plot[1] ? plot[1].uy : Math.sin(car.a);
    for (let i = 2; i < plot.length; i++) {
      const p = plot[i];
      if (p.s > far) break;
      const cross = ax * p.uy - ay * p.ux, dot = ax * p.ux + ay * p.uy;
      if (Math.abs(Math.atan2(cross, dot)) > 0.45) { want = cross > 0 ? 1 : -1; break; }
    }
    /* Moving over or back: signalled on the rate of offset change, and only for a
       pull-out or a large shift, not every small correction. */
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
     The smaller of the speed it can still stop from within the gap and a
     headway speed (gap over the time it wants to keep). */
  follow(car, gap, lead, stand) {
    const g = gap - (stand === undefined ? this.STAND : stand);
    if (g <= 0) return 0;
    const b = car.def.acc * this.BRAKE;
    const v = Math.max(0, lead || 0);
    return Math.min(Math.sqrt(v * v + 2 * b * g), g / this.HEAD + v);
  },

  /* ---- what is in the way ----
     For each nearby thing, the nearest point on the plot and, in that frame, the
     distance and how deep into the corridor it reaches. Walked in order of
     distance, so something only clipping the lane is moved over for and the scan
     carries on. */
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
      /* The other car's extents in this corridor's frame (a broadside car is its
         length wide). */
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
    /* People, the same way, with no depth test: a car never goes round a person
       on a crossing. */
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
    /* The offset at which none of this is in the way: absolute, starting from
       where it sits. `null` means the lane. */
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

  /* The plot point nearest the obstacle: the only frame in which "in my way"
     means anything, correct on corners where the car's own heading is not. */
  nearest(plot, x, y) {
    let best = plot[0], bd = Infinity;
    for (let i = 0; i < plot.length; i++) {
      const dx = x - plot[i].x, dy = y - plot[i].y, q = dx * dx + dy * dy;
      if (q < bd) { bd = q; best = plot[i]; }
    }
    return best;
  },

  /* Room to sit that far over: on road, and fitting the box at the angle it will
     hold when it gets there. */
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
     Two plots and where they first cross, settled before either arrives. Only
     crossing paths (by the dot product): nose to tail is following, opposite
     lanes are road width. Merges are left to the deadlock rule in
     steerTraffic(), since telling a merge from following fails at the junction.
     The box test skips most pairs. The decision is antisymmetric: exactly one
     of two cars waits. */
  giveWay(car) {
    const mine = car.plot;
    if (!mine || mine.length < 3) return Infinity;
    let best = Infinity;
    for (const other of this.list()) {
      if (other === car) continue;
      /* A car held at a red is not coming, and waiting for one is how a
         junction fills up with cars waiting for each other. */
      if (other.atRed) continue;
      const his = other.plot;
      if (!his || his.length < 3) continue;
      const clear = (car.def.wid + other.def.wid) * 0.5 + TILE * 0.6;
      /* Two streets apart, which almost every pair on a grid is. */
      if (mine.x0 > his.x1 + clear || his.x0 > mine.x1 + clear
        || mine.y0 > his.y1 + clear || his.y0 > mine.y1 + clear) continue;
      let si = -1, sj = 0;
      /* Every point of both, so both cars get the same answer. */
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
      /* Stop far enough back that the whole body is out of the junction: a tile and
         a bit of clearance. */
      best = Math.min(best, si - car.def.len * 0.5 - TILE * 1.3);
    }
    return best;
  },
  /* Whether this car waits: first there goes; otherwise give way to the right;
     nose to nose, the ids. Hysteresis keeps a car that has given way waiting
     until the case is clearly gone; the band only shrinks for the waiter. */
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
    /* Needs a route and a plot. */
    if (!plot || plot.length < 2 || !car.route || car.route.length < 2) return;
    if (car.honkT > 0) car.honkT = Math.max(0, car.honkT - dt);

    /* Off the road on a road route: after a few seconds, re-find its leg. */
    const road = this.routeIsRoad(car);
    const astray = road && !this.onRoad(car.x, car.y);
    car.lost = astray ? car.lost + dt : 0;
    if (!astray) car.rerouted = false;
    else if (car.lost > 2.5 && !car.rerouted) { car.rerouted = true; this.relocate(car); return; }
    /* Half a minute lost: rejoin(). */
    else if (car.lost > 30 && this.rejoin(car)) return;

    /* Reversing out of something. Owns the car until its timer runs out. */
    if (car.back > 0) { this.shuntBack(car, dt); return; }

    const c = Math.cos(car.a), s = Math.sin(car.a);
    /* ---- how fast ----
       Cruise, lowered by every reason to go slower, each a speed rather than a veto. */
    let want = Math.min(car.cruise, this.bend(car));
    if (astray) want = Math.min(want, 52);

    /* A kerb straight ahead. Walking pace, on the grounds that everything that
       goes wrong out here goes wrong at speed. */
    if (road && !astray) {
      const look = d.len * 0.5 + Math.max(TILE * 0.7, Math.abs(car.fwd) * 0.4);
      if (!this.onRoad(car.x + c * look, car.y + s * look)) want = Math.min(want, car.cruise * 0.42);
    }

    /* A bus stop: served, not passed. The queue behind it is ordinary following. */
    if (car.stops.length) want = this.serveStop(car, want, c, s, dt);

    /* The lights (engine/signals.js), through the following model, stopping half a
       tile before the line. */
    const sigD = Signals.hold(car, dt);
    car.atRed = sigD >= 0;
    if (car.atRed) want = Math.min(want, this.follow(car, sigD, 0, TILE * 0.5));

    /* WHAT IS IN THE WAY. */
    const see = this.scan(car);
    car.blockedBy = (see.what && see.what !== 'person') ? see.what : null;
    /* Distance to what holds it up, for the car behind. */
    car.gapTo = see.what ? see.gap : Infinity;
    /* The blocker when it is a vehicle. */
    const other = see.what !== 'person' ? see.what : null;
    if (see.what) {
      want = Math.min(want, this.follow(car, see.gap, see.lead,
        see.what === 'person' ? this.STANDP : this.STAND));
    }
    /* Time held up: the pull-out's clock. */
    car.hold = (see.what && want < car.cruise * 0.45) ? car.hold + dt : 0;

    /* WHO GETS THE JUNCTION. After the lights, because a green light is
       permission and this is only ever about the junctions that have none. */
    if (!car.atRed) {
      const give = this.giveWay(car);
      if (give < Infinity) want = Math.min(want, this.follow(car, give, 0, 0));
    }

    /* ---- sitting off the lane ----
       One number, two reasons: the scan's shift round something clipping the
       corridor, and a pull-out round something that will not move (after a few
       seconds, only into clear road with nothing oncoming, committed for a few
       seconds, never for a person). */
    const run = this.straight(car);
    if (car.pull > 0) car.pull -= dt;
    else if (see.what && see.what !== 'person' && !car.atRed && !astray
             && car.hold > 2.6 && run > d.len * 3.5 && Math.abs(see.what.fwd) < 6) {
      const by = this.roomToPass(car, see.what);
      if (by) { car.pull = 4.2; car.pullBy = clamp(by, -this.MAXOFF, this.MAXOFF); car.past = see.what; }
    }
    if (car.pull > 0 && see.what !== 'person' && !car.atRed
        && (!see.what || see.what === car.past)) want = Math.max(want, 34);
    let off = car.pull > 0 ? car.pullBy
      : (see.sit === null ? 0 : clamp(see.sit, -this.EDGE, this.EDGE));
    if (astray && car.pull <= 0) off = 0;
    /* A pull-out fades out before a corner (see MAXOFF). The small shift does not,
       or cars stop behind parked cars on corners. */
    if (car.pull > 0) off *= clamp(run / (d.len * 3), 0, 1);
    /* Out briskly, back gently. */
    const rate = (Math.abs(off) > Math.abs(car.off) ? TILE * 2.6 : TILE * 0.9) * dt;
    car.off += clamp(off - car.off, -rate, rate);

    /* ---- where to point ----
       Pure pursuit down its plot, with a lookahead that grows with speed and
       vehicle length, so buses do not cut corners. */
    const Ld = Math.max(d.len * 0.62, d.len * 0.34 + Math.abs(car.fwd) * 0.42);
    let tx = plot[plot.length - 1].x, ty = plot[plot.length - 1].y;
    for (let i = 1; i < plot.length; i++) {
      if (plot[i].s >= Ld) { tx = plot[i].x; ty = plot[i].y; break; }
    }
    let err = Math.atan2(ty - car.y, tx - car.x) - car.a;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    /* Steering needs motion, except a stuck car asking to go gets a fifth of lock
       to shuffle round what it is against. */
    const shuffle = want > 6 && Math.abs(car.fwd) < 4 ? 0.22 : 0;
    const bite = Math.max(shuffle, Math.min(1, Math.abs(car.fwd) / (d.top * 0.09)));
    car.a += clamp(err * 2.7, -d.turn, d.turn) * dt * bite;
    car.wheel = clamp(err * 1.6, -1, 1);
    this.signal(car, dt);
    /* And the last word on the speed: a car that is pointing a long way from
       where it means to go slows down until it is not. */
    want = Math.min(want, car.cruise * (1 - Math.min(0.72, Math.abs(err) * 1.3)));

    /* ---- jammed ----
       Two vehicles interlocked, neither able to go forwards: its own clock, since
       the blocker twitches enough to keep `stuck` near zero. An honest queue
       (a red, a bus at a stop) anywhere up the chain is excused. */
    if (this.excused(car) || !other || see.gap > 8 || Math.abs(car.fwd) > 6) car.jam = 0;
    else car.jam += dt;
    if (car.jam > 14) {
      car.jam = 0; car.pull = 0; car.off = 0; car.press = 0;
      car.back = 1.3;
      if (++car.shunt % 3 === 0) this.relocate(car);
      return;
    }

    /* ---- stuck ----
       Asking to go and not going: a kerb, a bollard. Reverse and retry. Counted up
       and down so inching through never triggers it; never for a deliberate stop.
       Touching something that has not moved for five seconds counts as a wedge. */
    const wedged = see.what && see.what !== 'person' && see.gap < 3
      && see.what.stopped > 5 && !see.what.atRed;
    if (car.stopFor > 0 || car.stopCool > 0 || car.serving || car.atRed) car.stuck = 0;
    else if (want > 12 && Math.abs(car.fwd) < 8 && !see.what) car.stuck += dt;
    else if (wedged && car.stopped > 5) car.stuck += dt * 0.7;
    else car.stuck = Math.max(0, car.stuck - dt * 2);
    if (car.stuck > 1.1) {
      /* `off` is kept, so the retry takes a different line. */
      car.stuck = 0; car.pull = 0;
      car.back = 1.0 + (car.shunt % 3) * 0.35;
      if (++car.shunt % 3 === 0) this.relocate(car);
      return;
    }

    /* ---- nobody waits for ever ----
       Merges are not settled by giveWay(), so two cars can each stop for the
       other. A car whose blocker is blocked by it is deadlocked; exactly one goes:
       nearest the join, then give way to the right, then ids. It creeps, silently,
       and stops on contact. */
    const facing = other && !car.atRed && !other.atRed;
    if (facing && other.blockedBy === car && (car.stopped > 1.2 || car.press > 0)
        && !this.yields(car, other, Math.max(0, see.gap), Math.max(0, other.gapTo))) {
      /* Latched for two seconds, or the winner stops being the winner a frame later. */
      car.press = 2;
    }
    /* Fallback: five seconds nose to tail with something not at a red, and it
       creeps. */
    else if (facing && car.stopped > 5 && see.gap < TILE) car.press = 1;
    car.press = Math.max(0, (car.press || 0) - dt);
    if (car.press > 0 && facing && see.gap > -4) want = Math.max(want, 26);

    /* ---- the brake lights ----
       Latched a quarter of a second so they signal rather than flicker. */
    const slowing = car.atRed || want < car.fwd - 8 || (!!see.what && see.gap < TILE * 2.5);
    if (slowing) car.brakeT = 0.28;
    else car.brakeT = Math.max(0, (car.brakeT || 0) - dt);
    car.braking = slowing || car.brakeT > 0;
    if (want > car.fwd) car.fwd = Math.min(want, car.fwd + d.acc * dt);
    else car.fwd = Math.max(want, car.fwd - d.acc * 2.2 * dt);
    if (car.fwd < 1.5 && car.fwd > -1.5) car.fwd = 0;

    /* One quiet horn when held up long enough, never at a red. */
    if (car.braking && !car.atRed && !(car.blockedBy && car.blockedBy.atRed)
        && car.stopped > 2.4 && !car.honkT) { Sfx.horn(); car.honkT = 6; }
  },

  /* Whether the queue has a reason: walk the blocked-by chain (bounded, since a
     ring is a deadlock). */
  excused(car) {
    let c = car;
    for (let n = 0; c && c !== 'person' && n < 6; n++) {
      if (c.atRed || c.stopFor > 0 || c.serving || c.stopCool > 0) return true;
      c = c.blockedBy;
    }
    return false;
  },

  /* Reverse out: off the throttle, back most of a car length, steering at a
     point on its lane behind it so the tail swings in and it ends up pointing
     down the lane. Reverse lights come from the renderer. */
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
  /* Anything immediately behind: the corridor test reversed, over a car length. */
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

  /* The leg it is nearest, by clamped perpendicular distance, excluding legs it
     would have to turn round to drive (the opposite carriageway). */
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
    /* `lost` is kept: it times the whole spell off-road that rejoin() ends. */
    car.leg = best; car.shunt = 0; car.off = 0; car.pull = 0;
  },

  /* The last resort, and the only teleport: a car stranded somewhere no route
     reaches rejoins at the nearest point that fits, facing the right way, and
     only off camera. On camera it keeps driving. */
  rejoin(car) {
    if (Cam.visible(car.x, car.y)) return false;
    const R = car.route, n = R.length;
    const f = R[car.leg], g = R[(car.leg + 1) % n];
    const dx = g.x - f.x, dy = g.y - f.y, L = Math.hypot(dx, dy) || 1;
    const u = clamp(((car.x - f.x) * dx + (car.y - f.y) * dy) / (L * L), 0, 1);
    /* Point along the leg before testing the fit (carFits uses the held angle). */
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

  /* Room to go round: halfway past it, a body's width out; on road, fitting,
     and nothing oncoming. Offside first (we drive on the left). */
  roomToPass(car, block) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    /* The blocker's size in this car's frame. */
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
      /* Nothing coming up the other lane. */
      if (this.oncoming(car, k, u + along * 2)) continue;
      /* How far over, in pixels, so the steering matches the check. */
      return k;
    }
    return 0;
  },
  /* Anything coming up the road this manoeuvre uses, looking further for
     faster vehicles. */
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

  /* The car within reach, for Interact; cars are not on tiles. */
  near(x, y) {
    let best = null, bd = TILE * 1.5;
    for (const car of this.list()) {
      if (!car.use) continue;
      const d = Math.hypot(car.x - x, car.y - y) - car.def.len * 0.28;
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  },
  /* Which controls show: driving adds a throttle stick and relabels the
     action button. */
  showControls() {
    const on = !!this.driving;
    /* Idempotent and called every frame, since `driving` can drop in several
       places; one comparison, no DOM, when unchanged. */
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
  /* Out onto the nearest ground that fits: driver's door, other side, then back. */
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
    /* Doors, further out on both sides, back, front; tested with the walking box. */
    const spots = [];
    for (const r of [d.wid / 2 + 20, d.wid / 2 + 38]) spots.push([-6, -r], [-6, r]);
    for (const r of [d.wid / 2 + 20, d.wid / 2 + 38]) spots.push([d.len * 0.3, -r], [d.len * 0.3, r], [-d.len * 0.3, -r], [-d.len * 0.3, r]);
    spots.push([-d.len / 2 - 20, 0], [d.len / 2 + 20, 0], [-d.len / 2 - 38, 0], [d.len / 2 + 38, 0]);
    /* Best rather than first: the spot with the most ways out, ties by order. */
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
    /* Nowhere at all: stand where the car is; sync()'s rule lets you walk off. */
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
    /* Solid again this frame, before the step out. */
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
  /* Parked: inside a bay drawn in the level's `paint:`, straight within about
     fifteen degrees. */
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
