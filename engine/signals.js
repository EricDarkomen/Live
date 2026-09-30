'use strict';
/* ---------------- The lights ----------------
   Everything else on the street stops for something that is there; a red
   light is an instruction, so it is told to the traffic here.
   - The cycle: each installation is a state machine (green, amber, all red,
     red-and-amber, green), the same for a junction and a crossing; only who
     asks for the road and for how long differs.
   - The aspect: `Signals.hold(car)` answers cars.js (how far to a line you may
     not cross, or nothing), `Signals.crossing()` answers pedestrians. Neither
     caller knows about phases.
   - Demand: vehicle-actuated and push-button, so nothing changes for nobody.
   No enforcement: running a red costs the player nothing.
   A level declares `signals:` (data/levels.js); one without is unchanged. */
const Signals = {
  /* ---- the timings ----
     Seconds, and the real British ones: 3s amber, about 2s red-and-amber. */
  AMBER: 3,
  /* All-red clearance; a car at cruise clears the junction in about 1.25s. */
  ALLRED: 2,
  REDAMBER: 2,
  /* A junction's minimum green, the gap-out window while traffic still
     arrives, and the maximum held with somebody else waiting. */
  GREEN: 8, EXTEND: 4, MAXGREEN: 26,
  /* A pelican crossing: traffic's minimum after the last walk, the beat after
     a press, the green man, then flashing amber. */
  HOLD: 16, PRESS: 2.5, MAN: 7, FLASH: 5,
  /* How far before a stop line a car is held, and how far past it is released. */
  LOOK: 9, GONE: 0.4,

  /* ---- building ----
     Tiles to pixels here, as Cars.build and Peds.build do. */
  build(list) {
    return (list || []).map((s, i) => {
      const inst = {
        id: s.id || ('s' + i), kind: s.kind || 'junction', def: s,
        /* Which group has the road, and where in its sequence. Starts green to the
           level's rest group, so nothing changes in the first seconds of a shift. */
        rest: s.rest || 0, phase: s.rest || 0, mode: 'green', t: 0,
        /* A crossing's button, time since traffic last lost the road, and bleep clock. */
        called: false, held: 999, bleep: 0,
        /* Out of order: a stuck aspect (see its note in data/levels.js). */
        stuck: s.stuck || null,
        arms: (s.arms || []).map((a, j) => {
          const [gx, gy] = this.heading(a.go);
          return {
            id: inst_id(i, j), g: a.g || 0,
            /* The pole, which is the thing that is drawn and, at a crossing,
               the thing you press. */
            x: (a.at[0] + .5) * TILE, y: (a.at[1] + .5) * TILE,
            tx: a.at[0], ty: a.at[1],
            /* The direction the held traffic travels (a compass letter), so the head
               faces back down it. */
            gx, gy, go: a.go,
            /* The stop line, a point on the carriageway (lanes are half a tile off-grid). */
            sx: a.stop[0] * TILE, sy: a.stop[1] * TILE,
            /* Width of the approach this arm holds: a car shoved half a lane is still held. */
            reach: (a.reach || 2.2) * TILE
          };
        })
      };
      /* A crossing's box, the carriageway people walk over. Inclusive tiles in,
         pixels out. */
      if (s.over) {
        const [x1, y1, x2, y2] = s.over;
        inst.box = { x1: x1 * TILE, y1: y1 * TILE, x2: (x2 + 1) * TILE, y2: (y2 + 1) * TILE };
      }
      /* How many groups this installation has, counted off the arms rather
         than declared, because declaring it is one more thing to get wrong. */
      inst.groups = inst.arms.reduce((n, a) => Math.max(n, a.g + 1), 1);
      inst.arms.forEach(a => { a.inst = inst; });
      return inst;
    });
  },
  heading(go) {
    return go === 'n' ? [0, -1] : go === 's' ? [0, 1] : go === 'w' ? [-1, 0] : [1, 0];
  },
  list() { return World.signals || []; },

  /* ---- the frame ---- */
  update(dt) {
    const list = this.list();
    if (!list.length) return;
    if (G.state !== 'play') return;
    for (const inst of list) {
      if (inst.stuck) continue;
      if (inst.kind === 'pelican') this.crossingTick(inst, dt);
      else this.junctionTick(inst, dt);
    }
  },

  /* ---- a junction ----
     A phase ends when its time is up and somebody else is waiting (wants()). */
  junctionTick(inst, dt) {
    inst.t += dt;
    const green = inst.def.green || this.GREEN;
    switch (inst.mode) {
      case 'green': {
        /* Nobody else asking: stay green. */
        const next = this.nextGroup(inst);
        if (next === inst.phase) return;
        /* The minimum, however long the other queue. */
        if (inst.t < green) return;
        /* Gap-out: change at the first break in this phase's traffic rather than the
           moment the clock allows, until the maximum. */
        if (inst.t < this.MAXGREEN && this.closing(inst, inst.phase)) return;
        inst.next = next; inst.mode = 'amber'; inst.t = 0;
        return;
      }
      case 'amber':
        if (inst.t >= this.AMBER) { inst.mode = 'allred'; inst.t = 0; }
        return;
      case 'allred':
        if (inst.t >= this.ALLRED) { inst.mode = 'redamber'; inst.t = 0; }
        return;
      case 'redamber':
        if (inst.t >= this.REDAMBER) { inst.phase = inst.next; inst.mode = 'green'; inst.t = 0; }
        return;
    }
  },
  /* Who next: round robin from the current group; with nobody waiting, back to
     the rest group (the main road). */
  nextGroup(inst) {
    for (let k = 1; k < inst.groups; k++) {
      const g = (inst.phase + k) % inst.groups;
      if (this.wants(inst, g)) return g;
    }
    if (inst.phase !== inst.rest && !this.wants(inst, inst.phase)) return inst.rest;
    return inst.phase;
  },
  /* Is anything about to cross on this group — the extension, and the same
     question as wants() asked over a much shorter distance. */
  closing(inst, g) {
    for (const arm of inst.arms) {
      if (arm.g !== g) continue;
      for (const car of Cars.list()) {
        if (!car.traffic && car !== Cars.driving) continue;
        const d = this.approaching(arm, car);
        if (d >= 0 && d < TILE * this.EXTEND) return true;
      }
    }
    return false;
  },
  /* Whether traffic (including the car being driven) is asking for this group.
     A junction does not know about people. */
  wants(inst, g) {
    for (const arm of inst.arms) {
      if (arm.g !== g) continue;
      for (const car of Cars.list()) {
        if (!car.traffic && car !== Cars.driving) continue;
        if (this.approaching(arm, car) >= 0) return true;
      }
    }
    return false;
  },

  /* ---- a crossing ----
     Nothing until pressed, then a beat, amber, the green man with a bleeper,
     then flashing amber. That is safe without code: cars already stop for people. */
  crossingTick(inst, dt) {
    inst.t += dt;
    switch (inst.mode) {
      case 'green':
        inst.held += dt;
        if (inst.called && inst.held >= this.HOLD) { inst.mode = 'wait'; inst.t = 0; }
        return;
      case 'wait':
        /* The beat before amber. */
        if (inst.t >= this.PRESS) { inst.mode = 'amber'; inst.t = 0; }
        return;
      case 'amber':
        if (inst.t >= this.AMBER) {
          inst.mode = 'man'; inst.t = 0; inst.bleep = 0;
          /* Pressed it and stayed for the green man. */
          if (inst.mine && this.nearPole(inst, P.x, P.y)) Ach.get('a_greenman');
          inst.mine = false;
        }
        return;
      case 'man':
        /* The bleeper, twice a second, only when on screen. */
        inst.bleep += dt;
        if (inst.bleep >= .5) {
          inst.bleep -= .5;
          if (Cam.visible(inst.arms[0].x, inst.arms[0].y)) Sfx.bleep();
        }
        if (inst.t >= this.MAN) { inst.mode = 'flash'; inst.t = 0; }
        return;
      case 'flash':
        if (inst.t >= this.FLASH) { inst.mode = 'green'; inst.t = 0; inst.called = false; inst.held = 0; }
        return;
    }
  },
  /* A press. Returns whether it changed anything, for the acts' wording. */
  press(inst) {
    if (!inst || inst.kind !== 'pelican' || inst.stuck) return false;
    if (inst.called || inst.mode !== 'green') return false;
    inst.called = true;
    return true;
  },
  /* The pole within reach, for Interact and the acts. A crossing's head,
     man and button share one post. */
  nearPole(inst, x, y) {
    return inst.arms.some(a => Math.hypot(a.x - x, a.y - y) < TILE * 3.5);
  },
  buttonNear(x, y) {
    let best = null, bd = TILE * 1.6;
    for (const inst of this.list()) {
      if (inst.kind !== 'pelican') continue;
      for (const arm of inst.arms) {
        const d = Math.hypot(arm.x - x, arm.y - y);
        if (d < bd) { bd = d; best = inst; }
      }
    }
    return best;
  },

  /* ---- what an arm is showing ----
     green, amber, red, redamber; `flash` for crossings only. */
  aspect(arm) {
    const inst = arm.inst;
    if (inst.stuck) return inst.stuck;
    if (inst.kind === 'pelican') {
      return inst.mode === 'amber' ? 'amber'
        : inst.mode === 'man' ? 'red'
        : inst.mode === 'flash' ? 'flash' : 'green';
    }
    if (inst.mode === 'green') return arm.g === inst.phase ? 'green' : 'red';
    if (inst.mode === 'amber') return arm.g === inst.phase ? 'amber' : 'red';
    if (inst.mode === 'redamber') return arm.g === inst.next ? 'redamber' : 'red';
    return 'red';
  },
  /* And what the man is doing, which is the other face of the same pole. */
  man(inst) {
    if (inst.stuck) return 'red';
    return inst.mode === 'man' ? 'green' : inst.mode === 'flash' ? 'flash' : 'red';
  },
  /* Whether WAIT is lit: from the press until the man. */
  waiting(inst) {
    return !inst.stuck && (inst.mode === 'wait' || inst.mode === 'amber');
  },

  /* ---- what the traffic asks ----
     Pixels to the stop line this car is held at, or -1. Latched on the car until
     released, or a car creeping over the line would be freed mid-junction. */
  hold(car, dt) {
    if (!this.list().length) { car.sig = null; return -1; }
    let arm = car.sig ? this.arm(car.sig) : null;
    if (arm) {
      /* Release on go, or when the car is far from the line (shoved or driven off). */
      const d = this.approaching(arm, car, true);
      if (this.go(arm, d) || d < -TILE * 1.5 || d > TILE * this.LOOK * 1.6) { car.sig = null; arm = null; }
      else return Math.max(0, d);
    }
    for (const inst of this.list()) {
      for (const a of inst.arms) {
        const d = this.approaching(a, car);
        if (d < 0) continue;
        if (this.go(a, d)) continue;
        car.sig = a.id;
        return d;
      }
    }
    return -1;
  },
  /* May a car this far from the line go? Green and flashing amber go; red and
     red-and-amber do not; amber goes only if too close to stop (a tile and a bit). */
  go(arm, d) {
    const a = this.aspect(arm);
    if (a === 'green' || a === 'flash') return true;
    if (a === 'amber') return d < TILE * 1.25;
    return false;
  },
  /* Distance to this arm's line along its traffic's direction, or -1 if the arm
     does not apply: facing within 60°, in front and within the approach, and
     within a couple of lanes across. `loose` tolerates a latched car slightly
     past the line or off heading. */
  approaching(arm, car, loose) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    if (c * arm.gx + s * arm.gy < (loose ? 0.2 : 0.5)) return -1;
    const dx = arm.sx - car.x, dy = arm.sy - car.y;
    const along = dx * arm.gx + dy * arm.gy;
    const across = Math.abs(dx * -arm.gy + dy * arm.gx);
    if (across > arm.reach) return -1;
    if (along > TILE * this.LOOK) return -1;
    if (!loose && along < -TILE * this.GONE) return -1;
    return along;
  },
  arm(id) {
    for (const inst of this.list()) for (const a of inst.arms) if (a.id === id) return a;
    return null;
  },

  /* ---- what somebody on foot asks ----
     Whether this step may be taken: not into a crossing's box unless the man is
     green. Arriving presses the button, from wherever they stopped. Nobody is
     held inside the box. */
  crossing(x, y, nx, ny) {
    for (const inst of this.list()) {
      if (!inst.box || inst.kind !== 'pelican') continue;
      const b = inst.box;
      if (this.inBox(b, x, y)) continue;
      if (!this.inBox(b, nx, ny)) continue;
      if (this.man(inst) !== 'red') return null;
      this.press(inst);
      return inst;
    }
    return null;
  },
  inBox(b, x, y) { return x >= b.x1 && x < b.x2 && y >= b.y1 && y < b.y2; },
  /* Whether anybody is in the crossing; for the acts. */
  occupied(inst) {
    if (!inst.box) return false;
    if (this.inBox(inst.box, P.x, P.y)) return true;
    for (const p of Peds.list()) if (this.inBox(inst.box, p.x, p.y)) return true;
    return false;
  }
};
/* A stable arm id to latch across frames, since levels rebuild their arms. */
function inst_id(i, j) { return 'g' + i + '.' + j; }
