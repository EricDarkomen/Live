'use strict';
/* ---------------- The lights ----------------
   A traffic signal is the first thing in this town that tells somebody to
   stop when there is nothing in front of them.

   Everything else out there is geometry. A car stops because there is a car
   in the way; it gives way because the other one is on its right; a
   pedestrian goes round a bin because the bin is there. All of it is a fact
   about where things are, which is why none of it needed a clock. A red light
   is not a fact about where anything is. It is an instruction, it comes from
   somewhere else, and obeying it means stopping at a painted line in front of
   an empty junction — so it is the one rule out here that has to be told to
   the traffic rather than discovered by it.

   That is the whole reason this is a file. Three things live in it.

   THE CYCLE. Each installation is a little state machine with a clock, and it
   is the same machine for a crossroads and for a crossing — green, amber, all
   red, red-and-amber, green — because in this country they really are the same
   machine wired differently. What changes between them is who asks for the
   road and how long they keep it.

   THE ASPECT, which is what everything else asks for. `Signals.hold(car)` is
   the only question engine/cars.js has to ask: how far in front of you is a
   line you are not allowed over, or nothing. `Signals.crossing()` is the same
   question for somebody on foot. Neither caller knows what a phase is.

   THE DEMAND. These lights are vehicle-actuated and push-button, which is to
   say they do not change for nobody. A junction sitting green to the High
   Street at half past six stays green to the High Street until something comes
   up Cargate Lane and asks; a crossing does nothing at all until somebody
   presses the button. Both matter more here than they would in a real town,
   because this town has fourteen vehicles in it and a fixed cycle would have
   two thirds of them sitting at red for an empty road, which is not a traffic
   system, it is a queue simulator.

   What is deliberately NOT here: any enforcement. Drive the pool car through a
   red and nothing happens to you, because nothing happens to anybody. The
   lights are for the traffic, which obeys them, and for you, which is between
   you and yourself.

   A level declares its lights in `signals:` (data/levels.js) and a level that
   declares none is exactly the level it always was — the same deal `surfaces:`,
   `paint:`, `cars:` and `peds:` get. */
const Signals = {
  /* ---- the timings ----
     Seconds, and all of them the real ones. The amber period on a British
     signal is three seconds whether it is on a motorway slip or outside a
     primary school, and the red-and-amber that comes before the green is about
     two — which is a detail nobody would notice if it were missing and
     everybody notices when it is wrong, because they have been watching it
     from a driving seat since they were seventeen. */
  AMBER: 3,
  /* The gap where every arm is red. It is what stops the tail of one phase
     hitting the nose of the next, and at a junction this size two seconds is
     honest: a car crossing at 150 pixels a second clears six tiles of junction
     in about a second and a quarter. */
  ALLRED: 2,
  REDAMBER: 2,
  /* A junction's MINIMUM green, the window in which a vehicle still coming
     keeps it, and the longest it may hold the road with somebody else waiting.
     Three numbers because a signal in this country is vehicle-actuated and
     that is what vehicle-actuated means: it will not change before the minimum
     however long the queue, it extends while traffic is still arriving, and it
     gives up at the maximum whatever is still arriving. A fixed cycle would be
     one number and would stop the High Street for an empty lane twice a
     minute. */
  GREEN: 8, EXTEND: 4, MAXGREEN: 26,
  /* A crossing's, and these are the numbers that make a pelican a pelican:
     the traffic keeps the road for at least this long after the last one, the
     button does nothing visible for a beat, the man is green for seven, and
     then there are five seconds of flashing amber which are not a phase so
     much as an argument about whether you are still in the road. */
  HOLD: 16, PRESS: 2.5, MAN: 7, FLASH: 5,
  /* How far in front of a stop line a car starts being held by it, and how far
     past it stops being: a signal is a thing you approach and then forget. */
  LOOK: 9, GONE: 0.4,

  /* ---- building ----
     Tiles to pixels here and nowhere else, the way Cars.build and Peds.build
     do it, so the catalogue goes on being written in the units the rest of it
     is written in. */
  build(list) {
    return (list || []).map((s, i) => {
      const inst = {
        id: s.id || ('s' + i), kind: s.kind || 'junction', def: s,
        /* Which group has the road, and where in its sequence it is. A signal
           starts green to whichever group the level says it rests on, because
           that is the state it spends most of its life in and starting it
           anywhere else means every set of lights in town changes once in the
           first ten seconds of a shift for no reason. */
        rest: s.rest || 0, phase: s.rest || 0, mode: 'green', t: 0,
        /* A crossing's own three: whether the button has been pressed, how
           long the traffic has had the road since the last time it had not,
           and the bleeper's own metronome. */
        called: false, held: 999, bleep: 0,
        /* Out of order. Not used by anything in this town yet and it is here
           because the one set of lights Bellhaven already had has been on red
           since March — see the note on it in data/levels.js. */
        stuck: s.stuck || null,
        arms: (s.arms || []).map((a, j) => {
          const [gx, gy] = this.heading(a.go);
          return {
            id: inst_id(i, j), g: a.g || 0,
            /* The pole, which is the thing that is drawn and, at a crossing,
               the thing you press. */
            x: (a.at[0] + .5) * TILE, y: (a.at[1] + .5) * TILE,
            tx: a.at[0], ty: a.at[1],
            /* The direction the traffic this arm holds is TRAVELLING, so the
               head faces back down it. Written as a compass letter in the
               catalogue because every other facing in this game is. */
            gx, gy, go: a.go,
            /* And the line it may not cross, which is a point on the
               carriageway rather than a tile: a stop line is painted across a
               lane and the lane is half a tile off the grid. */
            sx: a.stop[0] * TILE, sy: a.stop[1] * TILE,
            /* How wide a net this arm casts across its own approach. Two lanes
               and a bit, so a car that has been shoved half a lane sideways is
               still stopped by the light it is sitting under. */
            reach: (a.reach || 2.2) * TILE
          };
        })
      };
      /* A crossing's box: the piece of carriageway people walk over, which is
         what the studs are painted round and what nobody may step into while
         the man is red. Inclusive tiles in, pixels out. */
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
     Green, amber, all red, red-and-amber, green. The only decision in the
     whole sequence is taken at the end of the green and it is taken by
     wants(): a phase does not end because its time is up, it ends because its
     time is up AND somebody else is waiting. */
  junctionTick(inst, dt) {
    inst.t += dt;
    const green = inst.def.green || this.GREEN;
    switch (inst.mode) {
      case 'green': {
        /* Nobody else is asking, so there is nothing to decide: a green with no
           demand anywhere else runs until there is some, which is what these
           spend most of the day doing. */
        const next = this.nextGroup(inst);
        if (next === inst.phase) return;
        /* The minimum. However long the other queue is, a phase that has just
           started gets its few seconds — without it a junction with traffic on
           both arms changes every two seconds and nothing ever crosses it. */
        if (inst.t < green) return;
        /* THE GAP. Having served its minimum with somebody waiting, it changes
           at the first break in its own traffic rather than the instant the
           clock runs out, which is the difference between a signal and an egg
           timer: the car eight feet from the line goes, and the one still
           twelve tiles back does not get to hold the other arm up for it.
           Until the maximum, which is what stops a solid stream keeping the
           side road waiting until five. */
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
  /* WHO GETS IT NEXT, and the answer is usually "nobody, stay as you are".
     Round robin from the group that has it, so three arms waiting are served
     in order rather than by whoever asked loudest — then, with nobody waiting
     anywhere, back to the group the junction rests on, which out here is the
     main road. A junction that rests on the side street is a junction that
     stops the High Street at three in the morning for a lane nobody is in. */
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
  /* Is anything asking for this group. Traffic only — a junction is not a
     crossing and does not know there are people — and the car being DRIVEN
     counts, which is the one line that makes sitting at a red in the pool car
     something other than a punishment: the lights are waiting for you the same
     way they wait for the 41. */
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
     Nothing until somebody presses it, then a beat, then the same amber every
     other signal in the country uses, then seven seconds of a green man and a
     bleeper, then the flashing amber — which is the only aspect in this game
     that means "go if you can", and which needs no code at all to be safe,
     because the rule at the top of engine/cars.js has stopped a car for a
     person since long before there was a crossing to do it on. */
  crossingTick(inst, dt) {
    inst.t += dt;
    switch (inst.mode) {
      case 'green':
        inst.held += dt;
        if (inst.called && inst.held >= this.HOLD) { inst.mode = 'wait'; inst.t = 0; }
        return;
      case 'wait':
        /* THE BEAT. A crossing that went amber the instant the button went in
           would be a button that works, and the entire national relationship
           with these things is built on the two and a half seconds in which it
           appears not to. */
        if (inst.t >= this.PRESS) { inst.mode = 'amber'; inst.t = 0; }
        return;
      case 'amber':
        if (inst.t >= this.AMBER) {
          inst.mode = 'man'; inst.t = 0; inst.bleep = 0;
          /* Pressed it and still here. The whole achievement is that the two
             things are the same person: pressing one and walking off is what
             most of this country does with most of these, and it is why the
             next person to arrive at this crossing finds it already counting
             for somebody who left. */
          if (inst.mine && this.nearPole(inst, P.x, P.y)) Ach.get('a_greenman');
          inst.mine = false;
        }
        return;
      case 'man':
        /* The bleeper, twice a second, and only where somebody could hear it.
           It is the one sound in this game that exists to be heard by people
           who cannot see the thing making it. */
        inst.bleep += dt;
        if (inst.bleep >= .5) {
          inst.bleep -= .5;
          if (typeof Cam !== 'undefined' && Cam.visible(inst.arms[0].x, inst.arms[0].y)) Sfx.bleep();
        }
        if (inst.t >= this.MAN) { inst.mode = 'flash'; inst.t = 0; }
        return;
      case 'flash':
        if (inst.t >= this.FLASH) { inst.mode = 'green'; inst.t = 0; inst.called = false; inst.held = 0; }
        return;
    }
  },
  /* Somebody has pressed it. Returns whether that did anything, which is what
     tells the acts whether to say "the WAIT light comes on" or the other
     thing. */
  press(inst) {
    if (!inst || inst.kind !== 'pelican' || inst.stuck) return false;
    if (inst.called || inst.mode !== 'green') return false;
    inst.called = true;
    return true;
  },
  /* The pole within reach, for Interact and for the acts. A crossing's poles
     are its arms' poles: the head that holds the traffic, the man that faces
     across, and the button, all on the same post, because that is what a
     pelican is. */
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
     Four words for the traffic and they are the four on the head. `flash` is a
     fifth and belongs to crossings alone. */
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
  /* Whether the WAIT plate is lit. It comes on with the press and stays on
     until the man does, which is the entire duration of the thing anybody has
     ever complained about. */
  waiting(inst) {
    return !inst.stuck && (inst.mode === 'wait' || inst.mode === 'amber');
  },

  /* ---- what the traffic asks ----
     How far in front of this car is the stop line it is being held at, in
     pixels, or -1 for "nothing is holding you".

     Latched, and that is not an optimisation. A car creeping up to a line
     arrives with a few pixels of it in front and then a few pixels of it
     behind, and a question asked fresh every frame would release it on the
     frame it drifted past — at which point it is a car in the middle of a
     junction on a red with no reason left to stop. So the arm a car is being
     held by is remembered on the car until the light lets it go, which is also
     how a real driver does it: you do not re-derive whether the light applies
     to you, you know you are at it. */
  hold(car, dt) {
    if (!this.list().length) { car.sig = null; return -1; }
    let arm = car.sig ? this.arm(car.sig) : null;
    if (arm) {
      /* Let go the moment it says go — and also if the car has ended up a long
         way from the line it was stopped at, which is a car that has been
         shoved, relocated or driven off by somebody. */
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
  /* May a car with this much road left in front of it go?

     Green goes. Red and red-and-amber do not. Amber is the only interesting
     one and it is the rule off the page of the Highway Code: stop, unless you
     are so close that stopping would mean an emergency stop — which out here
     is a tile and a bit, because that is what this traffic can lose at cruise
     without standing on its nose. Flashing amber goes, and the person still on
     the crossing is handled by the oldest rule in engine/cars.js. */
  go(arm, d) {
    const a = this.aspect(arm);
    if (a === 'green' || a === 'flash') return true;
    if (a === 'amber') return d < TILE * 1.25;
    return false;
  },
  /* Distance from this car to that arm's line, along the direction the arm's
     traffic travels — or -1 if this arm is nothing to do with this car.

     Three tests and they are all about pointing the right way. Facing: within
     sixty degrees of the way the arm's traffic goes, so the westbound head
     never stops an eastbound car sitting beside it. Along: in front, and not
     further off than the approach is long. Across: within a couple of lanes of
     the line's own middle, so the head on the High Street does not stop
     somebody coming up Cargate Lane a tile to the side of it.

     `loose` is for a car already latched to this arm, which is allowed to be
     slightly past the line and pointing slightly wrong — it is stationary, and
     a stationary car's heading wanders by a degree or two as the physics
     settles. */
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
     Is this step allowed. Given where they are and where they are about to be:
     if the step puts them in a crossing's box and the man is not green, it is
     not — and pressing the button is part of arriving at the kerb, so it
     happens here rather than being a second thing a caller has to remember.

     The button is pressed from wherever they stopped rather than from the
     pole, because a pedestrian walked to the pole and pressed it: modelling
     the walk to the post is three more waypoints per person to say a thing
     everybody already assumes.

     Nobody is ever held INSIDE the box. Somebody caught in the road by a
     change of aspect keeps walking, which is what the flashing amber is for
     and what any person does. */
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
  /* Is anybody standing in this crossing. Asked by nothing in the engine — the
     cars stop for people by themselves — and by the acts, which want to know
     whether the thing you just pressed is doing anybody any good. */
  occupied(inst) {
    if (!inst.box) return false;
    if (this.inBox(inst.box, P.x, P.y)) return true;
    for (const p of Peds.list()) if (this.inBox(inst.box, p.x, p.y)) return true;
    return false;
  }
};
/* A stable id for an arm, so a car can hold on to one across a frame without
   holding on to the object — the same reason Cars.driving is not hung off P.
   Levels are rebuilt, and a rebuilt level's arms are new objects. */
function inst_id(i, j) { return 'g' + i + '.' + j; }
