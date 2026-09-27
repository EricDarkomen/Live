'use strict';
/* ---------------- Collision ----------------
   What can be where, and what to do about it when something already is not.

   This engine has always had exactly one answer to "can I go there": is the
   TILE solid. That is the right question for a wall, because a wall is made of
   tiles, and the wrong question for everything else. A wheelie bin drawn 20
   pixels across took a 32-pixel square out of the world; a lamppost with an
   eight-pixel post took the same; and a car two tiles long could not thread a
   gap it visibly fitted through. It also has no answer at all to "I am already
   inside something" — every candidate move is rejected, including the ones
   heading out — which is how a car wedged against a wall at an angle became a
   car nobody could move again.

   So: three shapes and one rule.

   FEET are what decide where you can stand. A small box on the GROUND — a
   person's is about the size of their shoes, a car's is its body — tested
   against walls (which really are tiles) and against other things' feet, which
   are the size of the thing that is DRAWN and not of the square it stands in.
   Strictly smaller than the tile, always: every footprint here is a subset of
   the tile it used to claim, so nothing that was walkable has stopped being
   walkable and nothing reachable has become unreachable. That is deliberate —
   it is what lets this go in without re-verifying every route in the building.

   BODIES are what decide what you can touch. A capsule standing on the feet,
   with a radius that also comes from the drawn size, and the reach for an
   event — an interaction now, a shove or a swing later — is measured surface
   to surface rather than centre to centre. Which is why you can reach a copier
   from further away than a mug: it is bigger.

   And DEPENETRATION, which is the rule the old one was missing. If something
   is already overlapping something else, this returns the shortest way out and
   the mover applies it. Being stuck is a state the collision system is
   responsible for ending, not a state it is allowed to enforce.

   WHAT THIS DOES NOT TOUCH. World.isSolid is exactly what it was, and remains
   the answer for everything that thinks in tiles: colleagues' pathfinding, the
   waypoint checks, and the editor's flood fill. Two questions, two answers, on
   purpose — a route planned on tiles is still a route a walker can follow,
   because the fine shape is always inside the coarse one. */
const Collide = {
  /* A person, in pixels. The feet are wider than they are deep and sit a
     little BELOW the point the sprite is anchored at, because you stand in the
     tile you are on and your head may overlap the one above.

     These are, to the pixel, the box walking has always used. Deliberately:
     the point of this file is to change what counts as an obstacle, not how
     big anybody is, and keeping the shape identical is what makes the whole
     change provably one-way — every footprint below is smaller than the tile
     it replaced, so ground that was walkable stays walkable and no route in
     the building can have quietly closed.
     The body is the capsule the reach is measured from, and it is a separate
     number because reaching for something is not standing on it. */
  FEET_RX: TILE * 0.30, FEET_RY: 7.4, FEET_OY: 2.2,
  BODY_R: TILE * 0.30,

  /* ---- an object's own shapes ----
     Worked out once per object and hung on it, because `fdef` is already the
     merged answer to "how is this furnished" and this is one more thing that
     follows from it. See FURN in data/world.js: `ground` is the override, in
     fractions of a tile, for the things whose drawn size lies about their
     footprint — a lamppost is a post, not a bollard the width of the pavement. */
  foot(o) {
    if (o._foot !== undefined) return o._foot;
    const f = o.fdef || FURN[o.kind] || {};
    /* Nothing you can walk into is nothing to collide with. */
    if (!o.solid) return (o._foot = null);
    let rx, ry;
    if (f.ground) {
      rx = TILE * f.ground[0] / 2;
      ry = TILE * (f.ground.length > 1 ? f.ground[1] : f.ground[0]) / 2;
    } else if (f.mount === 'wall') {
      /* Flat against the wall it hangs on, and the wall is the tile next door.
         A slab rather than a square: you can walk along in front of a
         noticeboard, which you could not before and always should have been
         able to. Pushed to the wall side so the free half is the side you
         approach from. */
      const s = o.wallSide;
      const d = TILE * 0.30;
      if (s === 'n' || s === 's') return (o._foot = { ox: 0, oy: (s === 'n' ? -1 : 1) * (TILE - d) / 2, rx: TILE / 2, ry: d / 2 });
      if (s === 'w' || s === 'e') return (o._foot = { ox: (s === 'w' ? -1 : 1) * (TILE - d) / 2, oy: 0, rx: d / 2, ry: TILE / 2 });
      rx = ry = TILE / 2;
    } else if (f.mount === 'surface' || o.onTable || o.onCounter) {
      /* Standing on a worktop, a counter or a table. What stops you is the run
         it is standing on, which is waist height and is the whole tile — the
         kettle is not the obstacle, the kitchen unit under it is. */
      rx = ry = TILE / 2;
    } else {
      /* THE DEFAULT IS THE WHOLE TILE, exactly as it has always been. `ground`
         is opt-in, kind by kind, in data/world.js, and that is deliberate:
         shrinking everything to its drawn size at a stroke would quietly let
         you stand half inside two hundred pieces of office furniture that were
         drawn to fill their square anyway. The things that needed it are the
         ones you can see are wrong — a lamppost, a bollard, a bin — and they
         are named there rather than guessed at here. */
      rx = ry = TILE / 2;
    }
    /* CLAMPED TO THE TILE, and that is not a formality. Every branch above
       already lands inside the square the object stands in — `ground` is
       documented as never bigger than a whole tile and the wall mounts are a
       slab pushed against one edge — and the scans below now DEPEND on it:
       they look at the tiles a box touches and no further, which is three times
       less work than the ring of neighbours they used to walk, and is only
       correct while no footprint leans out of its own tile. So it cannot. */
    return (o._foot = {
      ox: 0, oy: 0,
      rx: Math.min(TILE / 2, Math.max(3, rx)), ry: Math.min(TILE / 2, Math.max(3, ry))
    });
  },
  /* Where that footprint actually is, in world pixels. */
  footBox(o) {
    const f = this.foot(o);
    if (!f) return null;
    return { x: (o.x + .5) * TILE + f.ox, y: (o.y + .5) * TILE + f.oy, rx: f.rx, ry: f.ry };
  },
  /* The radius of an object's body, for reach. Bigger than its feet, because
     what you are reaching for is the whole thing rather than the bit of it
     touching the floor, and never smaller than a hand's width or a drawing pin
     would be unreachable. */
  bodyR(o) {
    const f = o.fdef || FURN[o.kind] || {};
    return Math.max(TILE * 0.22, Math.min(TILE * 0.6, (f.size || TILE) * 0.5));
  },

  /* ---- the tests ----
     Everything below takes a box as (x, y, rx, ry) in world pixels, because
     that is what a foot is, and because two boxes are a comparison rather than
     a solver. */

  /* Walls, and the waist-height runs of counter that are not walls but stop
     you all the same. Exact rather than sampled: a foot box is smaller than a
     tile, so it covers at most two tiles in each direction and asking all of
     them is cheaper than deciding which corners to trust. */
  tiles(x, y, rx, ry) {
    const tx0 = Math.floor((x - rx) / TILE), tx1 = Math.floor((x + rx - 0.01) / TILE);
    const ty0 = Math.floor((y - ry) / TILE), ty1 = Math.floor((y + ry - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return true;
        if (World.solid[ty][tx]) return true;
        if (World.blocked && World.blocked.has(tx + ',' + ty)) return true;
      }
    }
    return false;
  },
  /* The furniture, at the size it is drawn. Only the objects on the tiles the
     box actually touches can matter — every footprint is inside its own tile,
     which foot() above now guarantees rather than merely manages — so this is
     a walk of those tiles and not of the ring around them. It used to take the
     ring, which for a person's feet is nine tiles instead of one and for a bus
     is forty-nine instead of fifteen, and every one of them is a string built
     and a map looked up. */
  objects(x, y, rx, ry, hit) {
    const tx0 = Math.floor((x - rx) / TILE), tx1 = Math.floor((x + rx) / TILE);
    const ty0 = Math.floor((y - ry) / TILE), ty1 = Math.floor((y + ry) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const here = World.at(tx, ty);
        for (let i = 0; i < here.length; i++) {
          const b = this.footBox(here[i]);
          if (!b) continue;
          if (Math.abs(b.x - x) < b.rx + rx && Math.abs(b.y - y) < b.ry + ry) {
            if (hit(b, here[i])) return true;
          }
        }
      }
    }
    return false;
  },
  /* Cars, as the boxes they are rather than as the tiles they happen to cover.
     `ignore` is the one you are inside.

     THE CIRCLE FIRST, which is not an optimisation so much as an omission being
     corrected. Every step every person on this map takes comes through here —
     and a pedestrian takes several, because going round a lamppost is a ladder
     of candidate angles each of which is a separate question — and each one of
     them used to do the full rotated-box arithmetic against all sixty vehicles
     in the town, including the twenty-seven parked on the other side of the
     railway. Two subtractions and a compare throw out fifty-nine of them.
     It was two thirds of the entire per-frame cost of the street. */
  cars(x, y, rx, ry, ignore, hit) {
    const list = World.cars || [];
    const rr = Math.hypot(rx, ry);
    for (let i = 0; i < list.length; i++) {
      const car = list[i];
      if (car === ignore) continue;
      const reach = rr + this.hull(car).fr;
      const qx = x - car.x, qy = y - car.y;
      if (qx * qx + qy * qy > reach * reach) continue;
      /* The box in the car's own frame, grown by the box's own half-extents
         projected onto the car's axes — the standard cheap OBB-vs-AABB. */
      const c = Math.cos(car.a), s = Math.sin(car.a);
      const dx = x - car.x, dy = y - car.y;
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      const gu = car.def.len / 2 + Math.abs(c) * rx + Math.abs(s) * ry;
      const gv = car.def.wid / 2 + Math.abs(s) * rx + Math.abs(c) * ry;
      if (Math.abs(u) < gu && Math.abs(v) < gv) {
        if (hit(car, u, v, gu, gv, c, s)) return true;
      }
    }
    return false;
  },

  /* Can a foot box be here? The one question walking asks. */
  free(x, y, rx, ry, opts) {
    opts = opts || {};
    if (this.tiles(x, y, rx, ry)) return false;
    if (this.objects(x, y, rx, ry, () => true)) return false;
    if (!opts.noCars && this.cars(x, y, rx, ry, opts.ignore, () => true)) return false;
    return true;
  },

  /* The shortest way OUT of everything this box is currently inside, as a
     vector, or null if it is inside nothing. This is the half the old system
     did not have, and the half that makes being stuck impossible: whatever
     went wrong — a car parked on you, a spawn inside a wall, a wedge at an
     angle no axis-separated step could undo — the way out is a direction, and
     a direction can be applied.

     The smallest push per obstacle, summed. Summing rather than taking the
     largest is what gets a thing out of a CORNER: two walls each push it one
     way and the diagonal is the way out of both. */
  pushOut(x, y, rx, ry, opts) {
    opts = opts || {};
    let px = 0, py = 0;
    /* Out of solid tiles. */
    const tx0 = Math.floor((x - rx) / TILE), tx1 = Math.floor((x + rx - 0.01) / TILE);
    const ty0 = Math.floor((y - ry) / TILE), ty1 = Math.floor((y + ry - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const bad = (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) || World.solid[ty][tx]
          || (World.blocked && World.blocked.has(tx + ',' + ty));
        if (!bad) continue;
        const p = this.mtv(x, y, rx, ry, (tx + .5) * TILE, (ty + .5) * TILE, TILE / 2, TILE / 2);
        px += p[0]; py += p[1];
      }
    }
    /* Out of furniture. */
    this.objects(x, y, rx, ry, b => {
      const p = this.mtv(x, y, rx, ry, b.x, b.y, b.rx, b.ry);
      px += p[0]; py += p[1];
      return false;
    });
    /* Out of cars, along the car's own axes — pushed sideways out of a car you
       are lying against rather than along the map's grid. */
    if (!opts.noCars) {
      this.cars(x, y, rx, ry, opts.ignore, (car, u, v, gu, gv, c, s) => {
        const ou = gu - Math.abs(u), ov = gv - Math.abs(v);
        let du = 0, dv = 0;
        if (ou < ov) du = (u < 0 ? -ou : ou); else dv = (v < 0 ? -ov : ov);
        px += du * c - dv * s;
        py += du * s + dv * c;
        return false;
      });
    }
    if (!px && !py) return null;
    return [px, py];
  },
  /* The shortest push that separates two boxes: along whichever axis they
     overlap least. */
  mtv(ax, ay, arx, ary, bx, by, brx, bry) {
    const ox = arx + brx - Math.abs(ax - bx);
    const oy = ary + bry - Math.abs(ay - by);
    if (ox <= 0 || oy <= 0) return [0, 0];
    if (ox < oy) return [ax < bx ? -ox : ox, 0];
    return [0, ay < by ? -oy : oy];
  },

  /* ---- people ----
     Two calls, so that nothing outside has to know how big a person is. */
  walk(x, y, opts) { return this.free(x, y + this.FEET_OY, this.FEET_RX, this.FEET_RY, opts); },
  unstick(x, y, opts) { return this.pushOut(x, y + this.FEET_OY, this.FEET_RX, this.FEET_RY, opts); },

  /* ---- events ----
     Surface to surface, not centre to centre. A capsule reach: how far apart
     two BODIES are once their own sizes are taken off, which is what makes
     reaching a copier from a step further back than a mug correct rather than
     generous. Everything that is a physical interaction between two things
     standing on the floor is this function — an E press today, and whatever a
     shove or a swing turns out to be. */
  gap(ax, ay, ar, bx, by, br) {
    return Math.hypot(ax - bx, ay - by) - ar - br;
  },
  /* The gap between the player and an object, in pixels; negative is touching. */
  reach(o) {
    return this.gap(P.x, P.y, this.BODY_R, (o.x + .5) * TILE, (o.y + .5) * TILE, this.bodyR(o));
  },

  /* ---- cars ----
     A car's feet are its body: the whole rectangle is on the ground, at
     whatever angle it happens to be holding. It is the only thing in this game
     that is not square to the world, and for a long time that fact was papered
     over twice, differently, in two functions that had to agree and did not.

     carFits() SAMPLED THE OUTLINE. Ten points round the rectangle, tested one
     at a time, on the hope that nothing on this map is small enough to sit
     between two samples twenty-eight pixels apart. A bollard is.

     carPush() GAVE UP ON THE RECTANGLE ALTOGETHER and used the axis-aligned box
     drawn AROUND it. The box round a bus at forty-five degrees is half as big
     again as the bus, so it reported overlaps with things the bus was nowhere
     near — and because the push is applied every frame and the drive is applied
     every frame, the two cancelled exactly. The 41A stood at the corner of
     Aldergate Rise with its engine reading sixty-four and its position not
     changing in the third decimal place, for the rest of the shift, being
     shoved backwards by a lamppost it was four feet clear of. Three of the
     stalls in the traffic harness were that, and none of them was a traffic
     bug: they were two functions that could not agree where a bus was.

     So: ONE SHAPE, ONE WALK, TWO CALLERS. carHits() below is the walk, and the
     shape is the rectangle. carFits() asks it whether the list is empty and it
     stops at the first thing; carPush() asks it for the shortest way out of
     everything on the list and it sums them. They cannot disagree about where a
     car is, because they are the same function. */

  /* The overlap between two rotated rectangles, as the shortest vector that
     pushes A out of B — or null if they are apart, which is the same question
     and is why one function answers both.

     Separating axes: A's two and B's two. Project both half-extents onto each,
     and a gap on any one of the four is a gap; with no gap anywhere, the
     smallest overlap among them is the way out. An axis-aligned box is a
     rotated one with its angle set to nothing, so tiles and furniture come
     through here as well and there is exactly one piece of geometry in this
     file rather than three. */
  obb(ax, ay, ac, as, al, aw, bx, by, bc, bs, bl, bw) {
    const dx = ax - bx, dy = ay - by;
    let best = Infinity, px = 0, py = 0;
    /* How far a box with axes (c, s) and (-s, c) reaches along a unit axis. */
    const half = (ux, uy, c, s, hl, hw) =>
      Math.abs(ux * c + uy * s) * hl + Math.abs(uy * c - ux * s) * hw;
    const axis = (ux, uy) => {
      const d = dx * ux + dy * uy;
      const o = half(ux, uy, ac, as, al, aw) + half(ux, uy, bc, bs, bl, bw) - Math.abs(d);
      if (o <= 0) return false;
      if (o < best) { best = o; const g = d < 0 ? -1 : 1; px = ux * g; py = uy * g; }
      return true;
    };
    if (!axis(ac, as) || !axis(-as, ac) || !axis(bc, bs) || !axis(-bs, bc)) return null;
    return [px * best, py * best];
  },

  /* A car's rectangle, a pixel and a half inside the paintwork on every side.
     The skin is what lets two cars stand bumper to bumper without each of them
     pushing the other away for ever, and it is small enough that the gap it
     leaves is invisible.

     WORKED OUT ONCE PER MODEL and hung on the model, which is the difference
     between this costing nothing and this costing two thirds of the collision
     system. It used to return the two numbers as an array, and carFits() asks
     it of every other vehicle on the map every time anything moves: sixty
     throwaway arrays per test, twenty-eight tests a frame, sixteen hundred
     allocations a second for two numbers that depend on nothing but the length
     and width of a model out of the table in data/world.js. The rectangle of a
     saloon is the same rectangle it was last frame. */
  hull(car) {
    const d = car.def;
    if (d.hl === undefined) {
      d.hl = Math.max(4, d.len / 2 - 1.5);
      d.hw = Math.max(4, d.wid / 2 - 1.5);
      d.hr = Math.hypot(d.hl, d.hw);
      /* And the radius of the vehicle at its FULL size, for the callers that
         test the paintwork rather than the skinned rectangle. */
      d.fr = Math.hypot(d.len / 2, d.wid / 2);
    }
    return d;
  },

  /* Everything a car's rectangle is inside, if the car were at (x, y). With
     `push`, the shortest way out of each of them is summed into it and the walk
     goes all the way round — summing rather than taking the largest is what
     gets a car out of a CORNER, where two walls each push it one way and the
     diagonal is the way out of both. Without, it stops at the first thing,
     because "does it fit" only ever needed one. */
  carHits(car, x, y, push) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    const h = this.hull(car), hl = h.hl, hw = h.hw;
    /* The tiles the rectangle can possibly reach: the box around it. Used to
       decide WHAT TO ASK ABOUT and never to decide the answer, which is the
       whole of the difference between this and what carPush used to do. */
    const rx = Math.abs(c) * hl + Math.abs(s) * hw;
    const ry = Math.abs(s) * hl + Math.abs(c) * hw;
    const tx0 = Math.floor((x - rx) / TILE), tx1 = Math.floor((x + rx) / TILE);
    const ty0 = Math.floor((y - ry) / TILE), ty1 = Math.floor((y + ry) / TILE);
    let any = false;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const bad = tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH || World.solid[ty][tx]
          || (World.blocked && World.blocked.has(tx + ',' + ty));
        if (!bad) continue;
        const p = this.obb(x, y, c, s, hl, hw, (tx + .5) * TILE, (ty + .5) * TILE, 1, 0, TILE / 2, TILE / 2);
        if (!p) continue;
        if (!push) return true;
        any = true; push[0] += p[0]; push[1] += p[1];
      }
    }
    /* The furniture, at its drawn size, over exactly the tiles the rectangle
       reaches. See the note over objects(): a footprint cannot leave its own
       tile, so the ring of neighbours this used to walk was forty-nine map
       lookups per test for a bus, of which thirty-four could never match. */
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const here = World.at(tx, ty);
        for (let i = 0; i < here.length; i++) {
          const b = this.footBox(here[i]);
          if (!b) continue;
          const p = this.obb(x, y, c, s, hl, hw, b.x, b.y, 1, 0, b.rx, b.ry);
          if (!p) continue;
          if (!push) return true;
          any = true; push[0] += p[0]; push[1] += p[1];
        }
      }
    }
    /* And the other cars, as the rectangles THEY are rather than as boxes drawn
       round them. This is what a car lying broadside across a lane used to be
       invisible to — it was measured by its width whichever way round it was
       lying — and it is why two vehicles now stop touching instead of parking
       twenty pixels inside one another. */
    const list = World.cars || [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === car) continue;
      const oh = this.hull(o);
      const dx = o.x - x, dy = o.y - y, reach = h.hr + oh.hr;
      if (dx * dx + dy * dy > reach * reach) continue;
      const p = this.obb(x, y, c, s, hl, hw, o.x, o.y, Math.cos(o.a), Math.sin(o.a), oh.hl, oh.hw);
      if (!p) continue;
      if (!push) return true;
      any = true; push[0] += p[0]; push[1] += p[1];
    }
    return any;
  },
  carFits(car, x, y) { return !this.carHits(car, x, y); },
  /* Which way is out, for a car that is inside something. Same rule as for a
     person and for the same reason: a car wedged at an angle used to be a car
     nobody could move again, because every axis-separated step was rejected
     including the ones going the right way. */
  carPush(car) {
    const p = [0, 0];
    if (!this.carHits(car, car.x, car.y, p)) return null;
    return (p[0] || p[1]) ? p : null;
  },

  /* ---- and the one thing a car may never be inside ----
     Somebody on foot. Cars have stopped for people since long before there were
     any people out there to stop for, and that rule lives in engine/cars.js
     where the driving is — but a rule about SLOWING DOWN is only ever as good
     as the thing that spotted them, and for a year the thing that spotted them
     was a single point a stopping distance in front of the bumper. A point is
     not a car. Somebody standing between the bumper and that point was not
     there at all, which is exactly where a person stepping off a kerb in front
     of a moving car is.

     So this is the floor under it: the rectangle, against the people, asked of
     the position the car is about to be in. It does not slow anything down and
     it does not steer — engine/cars.js does both, earlier and better. It is
     what makes the outcome of failing to do either of them a car that stops
     against somebody rather than a car that goes through them. */
  PERSON_R: TILE * 0.26,
  carOnPerson(car, x, y) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    const h = this.hull(car), hl = h.hl, hw = h.hw;
    const r = this.PERSON_R, rr = h.hr + r;
    const hit = (px, py) => {
      const dx = px - x, dy = py - y;
      if (dx * dx + dy * dy > rr * rr) return false;
      return Math.abs(dx * c + dy * s) < hl + r && Math.abs(dy * c - dx * s) < hw + r;
    };
    if (typeof Cars !== 'undefined' && !Cars.driving && hit(P.x, P.y)) return true;
    if (typeof NPCM !== 'undefined') for (const n of NPCM.list) if (hit(n.x, n.y)) return true;
    if (typeof Peds !== 'undefined') for (const p of Peds.list()) if (hit(p.x, p.y)) return true;
    return false;
  }
};
