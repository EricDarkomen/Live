'use strict';
/* ---------------- Pedestrians ----------------
   The people on the street, who are not the people in the building.

   NPCM is twenty colleagues with schedules, relationships, conversations,
   errands and a grudge about a doorway. That is the right amount of machinery
   for the fourth floor, where you will speak to all of them by Thursday, and
   far too much for somebody walking past the Greggs. So this is the other kind
   of person, and it is deliberately the same shape as engine/cars.js rather
   than a second copy of engine/npc.js: a list on the level, a route to walk, a
   handful of numbers, and one line in the draw order.

   They exist because a town with nine cars and nobody in it is a car park with
   shops painted on it. The traffic already stops for people — that rule was
   written before there were any — so the moment there are pedestrians the
   crossings start working, cars queue behind somebody dithering at a kerb, and
   the street has something in it that is not made of metal.

   Three rules keep them honest:

   THEY STAY ON THE PAVEMENT, except where their route crosses a road — at the
   zebra where there is one and straight over, clear of a junction, where there
   is not, because that is where the routes are drawn. No leg of a route ever
   runs ALONG a carriageway. And nobody pauses on tarmac: a pedestrian standing
   in a live lane would hold the traffic up for ever, and the traffic is polite
   enough to let them.

   NOBODY GETS HURT. Same rule as the cars, and this is the other half of it:
   a car stops for a person. Drive at one and it is the car that gives way.

   THEY ARE NOT THE CAST. A pedestrian has no schedule, no memory and no name
   of their own — they are "somebody with a Greggs bag" — and pressing E on one
   gets you a stranger's half-sentence rather than a conversation. */
const Peds = {
  /* ---- building ----
     A level's `peds:` list turned into people. Tiles to pixels here, as with
     the cars, so the catalogue stays written in the units the rest of it is. */
  build(list) {
    return (list || []).map((p, i) => {
      const route = (p.route || []).map(q => ({ x: q[0] * TILE, y: q[1] * TILE, wait: q[2] || 0 }));
      const ped = {
        id: 'p' + i, name: p.name || 'Somebody', use: p.use || 'passerby',
        /* Which row of the cast sheet they are drawn with. The people who work
           in this building are upstairs and the people on this street are not
           them — but there is exactly one set of composited character rows in
           the atlas, and forty more would be forty more rows of PNG for people
           you will never speak to. So a pedestrian borrows a face, and the
           writing does the rest: the acts out here are all strangers you half
           recognise from the lift, which is what somebody who works in a
           different office in the same building actually is. */
        sprite: p.sprite || (NPCS[0] || {}).id || 'player',
        speed: (p.speed || 1.15) * TILE,
        route, leg: 0, wait: 0,
        /* WHICH WAY ROUND THE LOOP. A route is a ring of pavement and this is
           the direction it is being walked in, so turning round is a sign flip
           and nothing else — the same waypoints in the other order, for ever.
           See turnBack(), which is the one thing that ever changes it. */
        way: 1,
        x: 0, y: 0, dir: 2, step: 0, walking: true,
        /* How far round the last thing in the way they committed to going, and
           how long they are holding it — see walk(). An ANGLE rather than a
           side, because how far round something you have to go depends on the
           something: a lamppost is a lean and a skip is most of a right angle,
           and one fixed angle for both is what leaves somebody leaning on the
           skip. */
        dodge: 0, turn: 0,
        /* The closest they have got to the waypoint they are walking to, and
           how long it has been since that improved. The backstop: see walk(). */
        near: Infinity, stuck: 0,
        /* Said out loud, and for how long. Only ever when something happens to
           them — see honk() — because a street of people muttering on a timer
           is a street nobody can read. */
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

  /* How far round a thing a dodge goes, and how long it is held for. Wide
     enough to be sideways rather than a nudge forwards — the first version of
     this turned 0.95 radians, which still has most of a step's worth of
     forward in it, so somebody already pressed against a lamppost stayed
     pressed against it while politely trying both sides — and held long
     enough to actually clear something a tile across at walking pace. */
  DODGE_A: 1.05, DODGE_T: 0.9,
  /* And the LADDER, which is the half that was missing. One angle answers one
     question — "is there room to lean round this" — and a bin, a lamppost and
     a bollard all say yes to it. A skip on a two-tile footway says no on both
     sides, and the old pickSide, having only that one angle, still had to
     return a side: it returned the shut one and committed to it for the better
     part of a second, then did it again, and again. So try the lean, then most
     of a right angle, then very nearly a full one, which is a person stepping
     off the kerb — and only when all three are shut on both sides is the way
     ahead actually shut. */
  DODGE_LADDER: [1.05, 1.6, 2.1],
  /* How long somebody may fail to get any closer to where they are going
     before it stops being a dodge and starts being a pocket. Longer than a
     dodge is held for, and shorter than anybody watching would need to notice
     that a man on the phone has not moved. */
  STUCK_T: 3,

  /* Which waypoint they are walking TO, which depends on which way round the
     loop they are going. */
  target(ped) { const n = ped.route.length; return ped.route[((ped.leg + ped.way) % n + n) % n]; },

  /* TURN ROUND AND WALK BACK. The backstop, and it is deliberately not the
     plan: the plan is the dodge ladder, which gets round anything that is an
     obstruction. This is for the case that is not an obstruction at all — a
     stretch of pavement that is SHUT, because two things were put on a
     two-tile footway with less than a person's width of anything between them.
     There was one, outside the unit that is always being refitted, and a man
     stood in it on the phone for the rest of the shift.
     A route is a ring, so this costs one sign: the same waypoints in the other
     order, which is a person who has found the way blocked going back the way
     they came. It cannot fail, it cannot strand anybody, and it works for a
     blockage nobody has thought of yet. */
  turnBack(ped) {
    ped.way = -ped.way;
    ped.dodge = 0; ped.stuck = 0; ped.near = Infinity;
  },

  walk(ped, dt) {
    const R = ped.route, n = R.length;
    if (!n) return;
    /* Standing still on purpose: looking in a window, reading a phone, waiting
       for whoever they are meeting. Never on a road — see the note above. */
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
    /* GETTING NOWHERE. Not a collision — a collision is one frame, and this is
       the shape of a whole minute: somebody who has not closed on their next
       waypoint at all for three seconds is not walking round something, they
       are standing in a pocket. Measured against the CLOSEST they have got
       rather than against last frame's distance, or a dodge that legitimately
       takes them sideways for most of a second reads as the same fault. */
    if (dist < ped.near - 1) { ped.near = dist; ped.stuck = 0; }
    else if ((ped.stuck += dt) > this.STUCK_T) { this.turnBack(ped); return; }
    dx /= dist; dy /= dist;
    const sp = ped.speed * dt;
    const rot = a => { const c = Math.cos(a), s = Math.sin(a); return [dx * c - dy * s, dx * s + dy * c]; };

    /* GOING ROUND THINGS. A pavement has a lamppost on it, a bench, a bin, a
       car parked half across it — and the whole difficulty is that a
       pedestrian who only reacts once they are TOUCHING the thing has already
       lost. They are flush against it by then, and every direction with any
       forward in it is blocked, so they test one side, test the other, find
       both shut and stand there for the rest of the shift. Four of them did
       exactly that against four different lampposts.

       So look a stride ahead, while there is still room to turn: if the way is
       going to be shut, pick a side NOW and COMMIT to it for the better part
       of a second. Not reconsidered each frame — a dodge reconsidered every
       frame is a dodge that never happens, because the frame after it they are
       aiming at the waypoint again. It is how somebody walks round a bin: not
       by testing it, but by deciding a couple of paces early. */
    if (ped.dodge > 0) ped.dodge -= dt;
    else {
      const look = TILE * 1.1;
      if (!Collide.walk(ped.x + dx * look, ped.y + dy * look)) {
        /* How far round, not just which way round — and zero for "there is no
           way round", which is a fact the old one could not express and so
           never reported. */
        ped.turn = this.pickTurn(ped, dx, dy, look);
        if (!ped.turn) { this.turnBack(ped); return; }
        ped.dodge = this.DODGE_T;
      }
    }
    let hx = dx, hy = dy;
    if (ped.dodge > 0) { const h = rot(ped.turn); hx = h[0]; hy = h[1]; }

    let nx = ped.x + hx * sp, ny = ped.y + hy * sp;
    if (!Collide.walk(nx, ny)) {
      /* Already up against it — spawned there, or something moved into them,
         or a car parked across the pavement while they were mid-stride. Widen
         the turn until it clears, chosen side first and then the other, and
         the wide end of the ladder leans BACK off the obstacle, which is the
         one thing the old version could not do and the only thing that gets
         somebody off a thing they are flush against. */
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
        /* Boxed in on every side. Stand still rather than vibrate against it,
           and let the depenetration in Collide push them clear if they are
           inside something — the same rule the player and the cars get. */
        ped.walking = false;
        const out = Collide.unstick(ped.x, ped.y);
        if (out) {
          const m = Math.hypot(out[0], out[1]) || 1, step = Math.min(m, TILE * 2 * dt);
          ped.x += out[0] / m * step; ped.y += out[1] / m * step;
        }
        return;
      }
    }
    /* THE KERB. The last thing checked before the step is taken, because this
       is the only rule out here that is about the step rather than about the
       ground: everything above asks whether somebody CAN be at (nx, ny), and
       this asks whether they may go there yet.

       It is tested on the step and not on the position, so nobody is ever held
       INSIDE a crossing. Somebody caught in the road by the man going out
       keeps walking, which is what a person does and what the flashing amber
       is for — and the cars have stopped for anybody in front of them since
       before there were any people out here to stop for.

       Pressing the button is part of arriving at the kerb rather than a second
       thing to remember: see Signals.crossing(). Stopping here freezes the
       "getting nowhere" backstop above, or three seconds into a red man
       everybody at the kerb turns round and walks home. */
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

  /* HOW FAR ROUND, and which way, as a signed angle off the heading — or 0 for
     "there is no way round this", which is the answer that matters and the one
     the old version had no way of giving. It scored both sides at a single
     angle and returned a side no matter what, so a stretch of pavement that
     was shut came back as a confident lean into the thing shutting it.

     The ladder is walked from the narrowest angle out: the first rung where
     either side is open wins, because getting round a lamppost by leaning is a
     person and getting round a lamppost by turning ninety degrees is not. A
     side with a wall in it is not a side. Between two that both work at the
     same angle, take the one that keeps them off the road — somebody who steps
     into a live lane to get round a bin is somebody the traffic then has to
     stop for, and the traffic is polite enough that they would get away with
     it. Between two that are equally good, choose the same way every time: a
     pedestrian who picks a side at random picks a different one next lap and
     reads as broken rather than as a person. */
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

  /* Somebody sounded a horn near them. The one thing on this street that gets
     a reaction out of a stranger, and the reaction is a look and a remark
     rather than anything at all happening — which is both funnier and the
     entire British response to being honked at. */
  honk(x, y) {
    for (const ped of this.list()) {
      if (Math.hypot(ped.x - x, ped.y - y) > TILE * 5) continue;
      if (ped.sayT > 0) continue;
      ped.say = pick(['Alright.', 'Yes, thank you.', 'I saw you.', '…', 'Mate.']);
      ped.sayT = 2.2;
    }
  },

  /* The one within reach, for Interact — the same third question the cars get,
     and for the same reason: they are not on a tile and cannot be in byTile. */
  near(x, y) {
    let best = null, bd = TILE * 1.15;
    for (const ped of this.list()) {
      const d = Math.hypot(ped.x - x, ped.y - y);
      if (d < bd) { bd = d; best = ped; }
    }
    return best;
  }
};
