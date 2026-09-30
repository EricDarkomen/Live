'use strict';
/* ---------------- Pedestrians ----------------
   People on the street: the same shape as engine/cars.js, not a second NPCM.
   A list on the level, a route to walk, a few numbers, one line in the draw
   order. They give the crossings something to do and the cars something to
   stop for.
   - They stay on the pavement, crossing roads only where their route does,
     and never pause on tarmac (a live lane would hold traffic for ever).
   - Nobody gets hurt: a car always gives way to a person.
   - They are not the cast: no schedule, memory or name, and E gets a
     stranger's half-sentence. */
const Peds = {
  /* ---- building ----
     A level's `peds:` list, tiles to pixels, as with the cars. */
  build(list) {
    return (list || []).map((p, i) => {
      const route = (p.route || []).map(q => ({ x: q[0] * TILE, y: q[1] * TILE, wait: q[2] || 0 }));
      const ped = {
        id: 'p' + i, name: p.name || 'Somebody', use: p.use || 'passerby',
        /* The cast sheet's rows are borrowed: a pedestrian wears a colleague's face,
           rather than adding rows of PNG for strangers. */
        sprite: p.sprite || (NPCS[0] || {}).id || 'player',
        speed: (p.speed || 1.15) * TILE,
        route, leg: 0, wait: 0,
        /* Direction round the route's ring; turning round is a sign flip (turnBack()). */
        way: 1,
        x: 0, y: 0, dir: 2, step: 0, walking: true,
        /* The committed dodge: signed angle round the obstacle and how long it is
           held (walk()). An angle, since a lamppost needs a lean and a skip a right
           angle. */
        dodge: 0, turn: 0,
        /* Closest approach to the current waypoint and time since it improved: the
           stuck backstop (walk()). */
        near: Infinity, stuck: 0,
        /* A remark and how long it shows; only when something happens (honk()). */
        say: '', sayT: 0
      };
      if (route.length) {
        const from = route[(p.leg || 0) % route.length];
        const to = route[((p.leg || 0) + 1) % route.length];
        ped.leg = (p.leg || 0) % route.length;
        const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const t = Math.min(0.95, ((p.along || 0) * TILE) / d);
        ped.x = from.x + (to.x - from.x) * t;
        ped.y = from.y + (to.y - from.y) * t;
      }
      return ped;
    });
  },
  list() { return World.peds || []; },

  /* ---- the frame ---- */
  update(dt) {
    const list = this.list();
    if (!list.length) return;
    for (const ped of list) {
      if (ped.sayT > 0) ped.sayT -= dt;
      if (G.state !== 'play') continue;
      this.walk(ped, dt);
    }
  },

  /* A dodge's first angle and hold: wide enough to be sideways, long enough to
     clear a tile at walking pace. */
  DODGE_A: 1.05, DODGE_T: 0.9,
  /* The ladder of angles tried in turn: a lean, most of a right angle, then a
     step off the kerb. Only when all are shut both sides is the way shut. */
  DODGE_LADDER: [1.05, 1.6, 2.1],
  /* Seconds without progress before it is a pocket rather than a dodge. */
  STUCK_T: 3,

  /* Which waypoint they are walking TO, which depends on which way round the
     loop they are going. */
  target(ped) { const n = ped.route.length; return ped.route[((ped.leg + ped.way) % n + n) % n]; },

  /* The backstop for a pavement that is shut, not merely obstructed: walk the
     ring the other way. It cannot fail or strand anybody. */
  turnBack(ped) {
    ped.way = -ped.way;
    ped.dodge = 0; ped.stuck = 0; ped.near = Infinity;
  },

  walk(ped, dt) {
    const R = ped.route, n = R.length;
    if (!n) return;
    /* Standing on purpose: a shop window, a phone. Never on a road. */
    if (ped.wait > 0) {
      ped.wait -= dt;
      ped.walking = false;
      return;
    }
    const to = this.target(ped);
    let dx = to.x - ped.x, dy = to.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      ped.leg = ((ped.leg + ped.way) % n + n) % n;
      ped.dodge = 0; ped.near = Infinity; ped.stuck = 0;
      /* The waypoint's own pause, and only where it is safe to take one. */
      if (to.wait && World.surfAt(Math.floor(ped.x / TILE), Math.floor(ped.y / TILE)) !== 'tarmac') {
        ped.wait = to.wait;
      }
      return;
    }
    /* No progress: nothing closer than their best for STUCK_T seconds. Measured
       against the best, so a sideways dodge does not count as stuck. */
    if (dist < ped.near - 1) { ped.near = dist; ped.stuck = 0; }
    else if ((ped.stuck += dt) > this.STUCK_T) { this.turnBack(ped); return; }
    dx /= dist; dy /= dist;
    const sp = ped.speed * dt;
    const rot = a => { const c = Math.cos(a), s = Math.sin(a); return [dx * c - dy * s, dx * s + dy * c]; };

    /* Look a stride ahead and commit to a side early; a dodge re-decided every
       frame never happens, and one begun at contact is already boxed in. */
    if (ped.dodge > 0) ped.dodge -= dt;
    else {
      const look = TILE * 1.1;
      if (!Collide.walk(ped.x + dx * look, ped.y + dy * look)) {
        /* Signed turn, or 0 for no way round. */
        ped.turn = this.pickTurn(ped, dx, dy, look);
        if (!ped.turn) { this.turnBack(ped); return; }
        ped.dodge = this.DODGE_T;
      }
    }
    let hx = dx, hy = dy;
    if (ped.dodge > 0) { const h = rot(ped.turn); hx = h[0]; hy = h[1]; }

    let nx = ped.x + hx * sp, ny = ped.y + hy * sp;
    if (!Collide.walk(nx, ny)) {
      /* Already flush against it: widen the turn, chosen side first, until it
         clears. The ladder's wide end leans back off the obstacle. */
      const s = ped.turn >= 0 ? 1 : -1;
      let got = false;
      for (const a of [s * this.DODGE_A, s * 1.6, s * 2.2, -s * this.DODGE_A, -s * 1.6, -s * 2.2]) {
        const h = rot(a);
        const tx = ped.x + h[0] * sp, ty = ped.y + h[1] * sp;
        if (!Collide.walk(tx, ty)) continue;
        nx = tx; ny = ty; hx = h[0]; hy = h[1];
        ped.turn = a; ped.dodge = this.DODGE_T;
        got = true; break;
      }
      if (!got) {
        /* Boxed in: stand still and let Collide's depenetration push them clear. */
        ped.walking = false;
        const out = Collide.unstick(ped.x, ped.y);
        if (out) {
          const m = Math.hypot(out[0], out[1]) || 1, step = Math.min(m, TILE * 2 * dt);
          ped.x += out[0] / m * step; ped.y += out[1] / m * step;
        }
        return;
      }
    }
    /* The kerb: whether they may take this step, tested on the step so nobody is
       held inside a crossing (somebody caught mid-road keeps walking). Arriving
       presses the button (Signals.crossing()). Waiting freezes the stuck timer. */
    if (Signals.crossing(ped.x, ped.y, nx, ny)) {
      ped.walking = false; ped.stuck = 0;
      ped.dir = Sprites.dirOf(hx, hy);
      return;
    }
    ped.x = nx; ped.y = ny;
    ped.walking = true;
    ped.dir = Sprites.dirOf(hx, hy);
    ped.step += sp / TILE * 2.6;
  },

  /* Signed turn off the heading, or 0 for no way round. The ladder goes from
     narrowest out; the first rung with an open side wins. Ties go to the side
     away from the road, then always the same side, so a pedestrian is
     consistent lap to lap. */
  pickTurn(ped, dx, dy, look) {
    const score = a => {
      const c = Math.cos(a), s = Math.sin(a);
      const px = ped.x + (dx * c - dy * s) * look, py = ped.y + (dx * s + dy * c) * look;
      if (!Collide.walk(px, py)) return -1;
      return World.surfAt(Math.floor(px / TILE), Math.floor(py / TILE)) === 'tarmac' ? 1 : 2;
    };
    const first = ((ped.id.charCodeAt(1) || 0) & 1) ? 1 : -1;
    for (const w of this.DODGE_LADDER) {
      const a = score(first * w), b = score(-first * w);
      if (a < 0 && b < 0) continue;
      return (a >= b ? first : -first) * w;
    }
    return 0;
  },

  /* A horn nearby: a look and a remark. */
  honk(x, y) {
    for (const ped of this.list()) {
      if (Math.hypot(ped.x - x, ped.y - y) > TILE * 5) continue;
      if (ped.sayT > 0) continue;
      ped.say = pick(['Alright.', 'Yes, thank you.', 'I saw you.', '…', 'Mate.']);
      ped.sayT = 2.2;
    }
  },

  /* The one within reach, for Interact; they are not on a tile. */
  near(x, y) {
    let best = null, bd = TILE * 1.15;
    for (const ped of this.list()) {
      const d = Math.hypot(ped.x - x, ped.y - y);
      if (d < bd) { bd = d; best = ped; }
    }
    return best;
  }
};
