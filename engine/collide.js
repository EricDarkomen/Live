'use strict';
/* ---------------- Collision ----------------
   Three shapes and one rule.

   FEET decide where you can stand: a small box on the ground (shoes for a
   person, the body for a car), tested against walls and against other things'
   feet at their drawn size, never bigger than their tile. So everything once
   walkable stays walkable.

   BODIES decide what you can reach: a capsule on the feet, measured surface
   to surface, so a big thing is reachable from further away than a small one.

   DEPENETRATION: anything already inside something gets the shortest way out.
   Being stuck is a state collision ends, not one it enforces.

   World.isSolid() is still the tile answer for pathfinding, waypoint checks
   and the editor's flood fill; the fine shapes are always inside it. */
const Collide = {
  /* A person, in pixels. The feet sit a little below the sprite's anchor, as
     you stand in your tile and your head overlaps the one above. */
  FEET_RX: TILE * 0.30, FEET_RY: 7.4, FEET_OY: 2.2,
  BODY_R: TILE * 0.30,

  /* Off the map, a wall, or a bare stretch of counter (waist height, not wall). */
  wall(tx, ty) {
    return tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH || !!World.solid[ty][tx]
      || World.blocked.has(tx + ',' + ty);
  },

  /* ---- an object's own shapes ----
     Worked out once and cached on the object. FURN's `ground` overrides, in
     fractions of a tile, where the drawn size lies about the footprint (a
     lamppost is a post). */
  foot(o) {
    if (o._foot !== undefined) return o._foot;
    const f = o.fdef || FURN[o.kind] || {};
    if (!o.solid) return (o._foot = null);
    let rx, ry;
    if (f.ground) {
      rx = TILE * f.ground[0] / 2;
      ry = TILE * (f.ground.length > 1 ? f.ground[1] : f.ground[0]) / 2;
    } else if (f.mount === 'wall') {
      /* A slab against the wall it hangs on, so you can walk along in front. */
      const s = o.wallSide;
      const d = TILE * 0.30;
      if (s === 'n' || s === 's') return (o._foot = { ox: 0, oy: (s === 'n' ? -1 : 1) * (TILE - d) / 2, rx: TILE / 2, ry: d / 2 });
      if (s === 'w' || s === 'e') return (o._foot = { ox: (s === 'w' ? -1 : 1) * (TILE - d) / 2, oy: 0, rx: d / 2, ry: TILE / 2 });
      rx = ry = TILE / 2;
    } else {
      /* The whole tile: on a worktop it is the unit under it that stops you,
         and anything else opts in to a smaller footprint through `ground`. */
      rx = ry = TILE / 2;
    }
    /* Clamped to the tile: the scans below only look at the tiles a box
       touches, which is only right while no footprint leaves its own. */
    return (o._foot = {
      ox: 0, oy: 0,
      rx: Math.min(TILE / 2, Math.max(3, rx)), ry: Math.min(TILE / 2, Math.max(3, ry))
    });
  },
  footBox(o) {
    const f = this.foot(o);
    if (!f) return null;
    return { x: (o.x + .5) * TILE + f.ox, y: (o.y + .5) * TILE + f.oy, rx: f.rx, ry: f.ry };
  },
  /* Body radius for reach: bigger than the feet, never smaller than a hand. */
  bodyR(o) {
    const f = o.fdef || FURN[o.kind] || {};
    return Math.max(TILE * 0.22, Math.min(TILE * 0.6, (f.size || TILE) * 0.5));
  },

  /* ---- the tests: boxes as (x, y, rx, ry) in world pixels ---- */
  tiles(x, y, rx, ry) {
    const tx0 = Math.floor((x - rx) / TILE), tx1 = Math.floor((x + rx - 0.01) / TILE);
    const ty0 = Math.floor((y - ry) / TILE), ty1 = Math.floor((y + ry - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) if (this.wall(tx, ty)) return true;
    }
    return false;
  },
  /* Furniture on the tiles the box touches; `hit` returns true to stop. */
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
  /* Cars as the rotated boxes they are; `ignore` is the one you are in. A
     bounding-circle test first throws out almost every car for two subtractions. */
  cars(x, y, rx, ry, ignore, hit) {
    const list = World.cars || [];
    const rr = Math.hypot(rx, ry);
    for (let i = 0; i < list.length; i++) {
      const car = list[i];
      if (car === ignore) continue;
      const reach = rr + this.hull(car).fr;
      const qx = x - car.x, qy = y - car.y;
      if (qx * qx + qy * qy > reach * reach) continue;
      /* The box in the car's frame, grown by its half-extents on the car's axes. */
      const c = Math.cos(car.a), s = Math.sin(car.a);
      const u = qx * c + qy * s, v = -qx * s + qy * c;
      const gu = car.def.len / 2 + Math.abs(c) * rx + Math.abs(s) * ry;
      const gv = car.def.wid / 2 + Math.abs(s) * rx + Math.abs(c) * ry;
      if (Math.abs(u) < gu && Math.abs(v) < gv) {
        if (hit(car, u, v, gu, gv, c, s)) return true;
      }
    }
    return false;
  },

  /* Can a foot box be here? */
  free(x, y, rx, ry, opts) {
    opts = opts || {};
    if (this.tiles(x, y, rx, ry)) return false;
    if (this.objects(x, y, rx, ry, () => true)) return false;
    if (!opts.noCars && this.cars(x, y, rx, ry, opts.ignore, () => true)) return false;
    return true;
  },

  /* The way out of everything this box is inside, or null. Pushes are summed,
     which is what gets something out of a corner. */
  pushOut(x, y, rx, ry, opts) {
    opts = opts || {};
    let px = 0, py = 0;
    const tx0 = Math.floor((x - rx) / TILE), tx1 = Math.floor((x + rx - 0.01) / TILE);
    const ty0 = Math.floor((y - ry) / TILE), ty1 = Math.floor((y + ry - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.wall(tx, ty)) continue;
        const p = this.mtv(x, y, rx, ry, (tx + .5) * TILE, (ty + .5) * TILE, TILE / 2, TILE / 2);
        px += p[0]; py += p[1];
      }
    }
    this.objects(x, y, rx, ry, b => {
      const p = this.mtv(x, y, rx, ry, b.x, b.y, b.rx, b.ry);
      px += p[0]; py += p[1];
      return false;
    });
    /* Out of a car along its own axes, not the map's. */
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
  /* The shortest push separating two boxes: along the axis of least overlap. */
  mtv(ax, ay, arx, ary, bx, by, brx, bry) {
    const ox = arx + brx - Math.abs(ax - bx);
    const oy = ary + bry - Math.abs(ay - by);
    if (ox <= 0 || oy <= 0) return [0, 0];
    if (ox < oy) return [ax < bx ? -ox : ox, 0];
    return [0, ay < by ? -oy : oy];
  },

  /* ---- people ---- */
  walk(x, y, opts) { return this.free(x, y + this.FEET_OY, this.FEET_RX, this.FEET_RY, opts); },
  unstick(x, y, opts) { return this.pushOut(x, y + this.FEET_OY, this.FEET_RX, this.FEET_RY, opts); },

  /* ---- reach: surface to surface ---- */
  gap(ax, ay, ar, bx, by, br) {
    return Math.hypot(ax - bx, ay - by) - ar - br;
  },
  /* The player to an object, in pixels; negative is touching. */
  reach(o) {
    return this.gap(P.x, P.y, this.BODY_R, (o.x + .5) * TILE, (o.y + .5) * TILE, this.bodyR(o));
  },

  /* ---- cars ----
     A car's feet are its whole rectangle at its own angle. carFits() and
     carPush() are one walk, carHits(), so they can never disagree about where
     a car is. */

  /* Separating axes for two rotated rectangles: null if apart, else the
     shortest vector pushing A out of B. Axis-aligned boxes are angle zero. */
  obb(ax, ay, ac, as, al, aw, bx, by, bc, bs, bl, bw) {
    const dx = ax - bx, dy = ay - by;
    let best = Infinity, px = 0, py = 0;
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

  /* A model's rectangle, a pixel and a half inside the paintwork so cars can
     stand bumper to bumper, and its full radius. Cached on the model. */
  hull(car) {
    const d = car.def;
    if (d.hl === undefined) {
      d.hl = Math.max(4, d.len / 2 - 1.5);
      d.hw = Math.max(4, d.wid / 2 - 1.5);
      d.hr = Math.hypot(d.hl, d.hw);
      d.fr = Math.hypot(d.len / 2, d.wid / 2);
    }
    return d;
  },

  /* Everything the car's rectangle would be inside at (x, y). With `push`, the
     ways out are summed into it; without, it stops at the first hit. */
  carHits(car, x, y, push) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    const h = this.hull(car), hl = h.hl, hw = h.hw;
    /* The bounding box only picks the tiles to ask about. */
    const rx = Math.abs(c) * hl + Math.abs(s) * hw;
    const ry = Math.abs(s) * hl + Math.abs(c) * hw;
    const tx0 = Math.floor((x - rx) / TILE), tx1 = Math.floor((x + rx) / TILE);
    const ty0 = Math.floor((y - ry) / TILE), ty1 = Math.floor((y + ry) / TILE);
    let any = false;
    const add = p => {
      if (!p) return false;
      if (!push) return true;
      any = true; push[0] += p[0]; push[1] += p[1];
      return false;
    };
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.wall(tx, ty)
          && add(this.obb(x, y, c, s, hl, hw, (tx + .5) * TILE, (ty + .5) * TILE, 1, 0, TILE / 2, TILE / 2))) return true;
      }
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const here = World.at(tx, ty);
        for (let i = 0; i < here.length; i++) {
          const b = this.footBox(here[i]);
          if (b && add(this.obb(x, y, c, s, hl, hw, b.x, b.y, 1, 0, b.rx, b.ry))) return true;
        }
      }
    }
    const list = World.cars || [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === car) continue;
      const oh = this.hull(o);
      const dx = o.x - x, dy = o.y - y, reach = h.hr + oh.hr;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (add(this.obb(x, y, c, s, hl, hw, o.x, o.y, Math.cos(o.a), Math.sin(o.a), oh.hl, oh.hw))) return true;
    }
    return any;
  },
  carFits(car, x, y) { return !this.carHits(car, x, y); },
  /* Which way is out for a car wedged in something. */
  carPush(car) {
    const p = [0, 0];
    if (!this.carHits(car, car.x, car.y, p)) return null;
    return (p[0] || p[1]) ? p : null;
  },

  /* The one thing a car may never be inside: somebody on foot. engine/cars.js
     slows and steers for people; this is the floor under it, so failing to do
     either means stopping against them, not going through. */
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
    if (!Cars.driving && hit(P.x, P.y)) return true;
    for (const n of NPCM.list) if (hit(n.x, n.y)) return true;
    for (const p of Peds.list()) if (hit(p.x, p.y)) return true;
    return false;
  }
};
