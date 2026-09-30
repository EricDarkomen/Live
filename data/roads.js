'use strict';
/* ---------------- Roads, and the rules they are laid out by ----------------
   A road layout is a graph with rules on it, taken from British highway
   practice at the detail a one-metre tile can show:
   - Hierarchy: a road's class sets its width, markings, lighting and junction
     radii (CLASS). Distributors carry traffic; access roads front houses.
   - A road joins its own class or the one above; nothing hangs off a
     cul-de-sac.
   - No crossroads below a distributor: use a staggered pair of T-junctions.
     faults() reports crossroads and staggers too short to be one.
   - Priority goes up the hierarchy; the minor arm gives way.
   - Kerbs turn through a radius at junctions, larger on bigger roads.
   - A cul-de-sac ends in a turning head: a hammerhead or a bulb.
   - Visibility splays at junction mouths stay clear (splays()).
   Everything is axis-aligned: kerbs, walls and collision are grid-wise, so the
   curve budget goes on junction radii and turning heads.
   No engine names are used: tables and arithmetic run at load time, before
   data/island.js calls them. tools/levelcheck.mjs runs faults(), which catches
   networks the pavement flood fill cannot (roads joined to nothing). */
const Roads = {

  /* ---- the hierarchy ----
     Four classes; everything else here looks them up.

       lanes   carriageway width in tiles (a tile is a metre): 6.0 distributor,
               5.0 spine, 4.8 access. Below 5.5 m no centre line (`centre`).
       foot    footway each side; 2.0 m is the adoptable minimum.
       radius  kerb radius where this is the minor arm (the corner is cut for the
               vehicle turning into it).
       lamp    street-light spacing in tiles, alternating sides (lamps()).
       splay   sight distance along the major road when emerging from this one.
       head    whether a dead end of this class needs a turning head.

     RANK is the ordering; priority, give-way paint and the join rule read it. */
  CLASS: {
    distributor: { lanes: 6, foot: 2, centre: true,  radius: 4, lamp: 22, splay: 28, head: true },
    spine:       { lanes: 5, foot: 2, centre: false, radius: 3, lamp: 26, splay: 22, head: true },
    access:      { lanes: 4, foot: 2, centre: false, radius: 2, lamp: 30, splay: 14, head: true },
    cul:         { lanes: 4, foot: 2, centre: false, radius: 2, lamp: 34, splay: 12, head: true }
  },
  /* Farm tracks are not in the hierarchy: they are private accesses, laid as
     rooms with a `track` surface in data/island.js. */
  /* A cul-de-sac is an access road that dead-ends: same rank. Nothing may come
     off one; faults() checks that by name. */
  RANK: { distributor: 0, spine: 1, access: 2, cul: 2 },

  /* Minimum distance between opposite minor arms for a stagger, not a crossroads. */
  STAGGER: 20,
  /* Minimum spacing between junctions on the same road, by class. */
  SPACING: { distributor: 34, spine: 20, access: 14, cul: 10 },

  /* ---- the dice ----
     The engine's usual stable hash, so a rebuilt level is identical. */
  hash(a, b, salt) {
    let h = 2166136261 ^ (salt || 0);
    h = Math.imul(h ^ a, 16777619); h = Math.imul(h ^ b, 16777619);
    h ^= h >>> 13; h = Math.imul(h, 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  },

  /* ---- a link ----
     One straight road: { id, cls, zone, axis: 'x'|'y', at, from, to,
     head: 'bulb'|'hammer'|null }. `axis` is its direction, `at` the band's centre
     on the cross axis, `from`/`to` the carriageway's inclusive extent. The rest
     derives from the class. A centre, so widening a road does not move one side. */
  link(o) {
    const c = this.CLASS[o.cls];
    if (!c) throw new Error('Roads: no such class ' + o.cls);
    return Object.assign({ head: null, name: null }, o);
  },

  /* The band (b1..b2: pavement to pavement) and carriageway (c1..c2) on the cross
     axis, inclusive tiles. One place for this arithmetic. */
  geom(l) {
    const c = this.CLASS[l.cls];
    const half = c.lanes / 2;
    const c1 = Math.round(l.at - half), c2 = Math.round(l.at + half) - 1;
    return { c1, c2, b1: c1 - c.foot, b2: c2 + c.foot, def: c };
  },

  /* The left-hand lane for travel in `dir`, as a cross-axis coordinate: positive
     travel puts left on the positive cross side. Shared by routes and give-way
     lines so they agree. */
  lane(l, dir) {
    const g = this.geom(l), mid = (g.c1 + g.c2 + 1) / 2;
    return mid + dir * this.CLASS[l.cls].lanes / 4;
  },
  /* The middle of one footway (`side` -1 for north/west, +1 for the other).
     Never a carriageway: pedestrian legs never run along a lane (engine/peds.js). */
  walk(l, side) {
    const g = this.geom(l), c = this.CLASS[l.cls];
    if (!c.foot) return (g.c1 + g.c2 + 1) / 2;
    return side < 0 ? g.b1 + c.foot / 2 : g.b2 + 1 - c.foot / 2;
  },

  /* ---- the net ----
     Links plus their junctions, derived from geometry: a junction is where two
     perpendicular carriageways overlap. Arms are the directions out (a link
     passing through gives two, one ending gives one), which tells a T from a
     crossroads. Priority to the lower rank; between equals, the through road. */
  net(links, bounds) {
    const ls = links.map(l => this.link(l));
    const nodes = [];
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i], b = ls[j];
      if (a.axis === b.axis) continue;
      const along = a.axis === 'x' ? a : b, across = a.axis === 'x' ? b : a;
      const ga = this.geom(along), gc = this.geom(across);
      /* Carriageways must overlap; touching pavements is not a junction. */
      if (across.from > ga.c2 || across.to < ga.c1) continue;
      if (along.from > gc.c2 || along.to < gc.c1) continue;
      /* How many ways out. `>` and `<` rather than `>=`: a road whose end is
         inside the junction stops there and contributes one arm. */
      const arms = [];
      if (along.from < gc.c1) arms.push('w');
      if (along.to > gc.c2) arms.push('e');
      if (across.from < ga.c1) arms.push('n');
      if (across.to > ga.c2) arms.push('s');
      if (arms.length < 3) continue;          /* a road ending on another road's end is a corner, not a junction */
      const thru = l => (l === along) ? (along.from < gc.c1 && along.to > gc.c2)
        : (across.from < ga.c1 && across.to > ga.c2);
      let major = along, minor = across;
      if (this.RANK[across.cls] < this.RANK[along.cls]) { major = across; minor = along; }
      else if (this.RANK[across.cls] === this.RANK[along.cls] && thru(across) && !thru(along)) { major = across; minor = along; }
      nodes.push({
        along, across, major, minor, arms,
        kind: arms.length === 4 ? 'cross' : 'tee',
        /* The mouth: where the carriageways overlap. Corners, give-way and yellows are
           measured from it. */
        x1: gc.c1, x2: gc.c2, y1: ga.c1, y2: ga.c2
      });
    }
    /* Map bounds, so faults() knows a road running off the edge continues. */
    return { links: ls, nodes, w: (bounds && bounds.w) || Infinity, h: (bounds && bounds.h) || Infinity };
  },
  byId(net, id) { return net.links.find(l => l.id === id); },

  /* ---- stamping it onto a level ----
     Pushes onto a level's `rooms`, `surfaces` and `paint`. Later surfaces win, so
     all paving goes down first and every carriageway after, or one road's
     pavement crosses another's carriageway and R.kerbs() draws a step across it. */
  stamp(net, out) {
    const { rooms, surfaces, paint } = out;
    const room = (z, x1, y1, x2, y2) => rooms.push({ z, r: [x1, y1, x2, y2] });
    const surf = (s, x1, y1, x2, y2) => surfaces.push({ s, r: [x1, y1, x2, y2] });
    const box = l => {
      const g = this.geom(l);
      return l.axis === 'x'
        ? [l.from, g.b1, l.to, g.b2]
        : [g.b1, l.from, g.b2, l.to];
    };
    /* One: rooms and paving. A street is its own room so entering it announces its
       name (ZONES in data/world.js). */
    for (const l of net.links) {
      const [x1, y1, x2, y2] = box(l);
      room(l.zone, x1, y1, x2, y2);
      surf('slab', x1, y1, x2, y2);
    }
    /* The turning heads go down with the paving, because a head is a widening
       of the band and the tarmac over it comes in the next pass. */
    const heads = this.heads(net);
    for (const h of heads) for (const r of h.pave) {
      room(h.zone, r[0], r[1], r[2], r[3]);
      surf('slab', r[0], r[1], r[2], r[3]);
    }
    /* Wider paving at junctions, since the kerb radius eats into the footway. */
    for (const n of net.nodes) {
      const r = this.CLASS[n.minor.cls].radius, f = 2;
      /* Only on sides with an arm; a T's fourth side is not a corner. */
      const a = n.arms;
      const p = [a.includes('w') ? n.x1 - r - f : n.x1, a.includes('n') ? n.y1 - r - f : n.y1,
                 a.includes('e') ? n.x2 + r + f : n.x2, a.includes('s') ? n.y2 + r + f : n.y2];
      room(n.major.zone, p[0], p[1], p[2], p[3]);
      surf('slab', p[0], p[1], p[2], p[3]);
    }

    /* TWO: the carriageways, every one of them over the top of all of the
       paving. */
    for (const l of net.links) {
      const g = this.geom(l);
      if (l.axis === 'x') surf('tarmac', l.from, g.c1, l.to, g.c2);
      else surf('tarmac', g.c1, l.from, g.c2, l.to);
    }
    for (const h of heads) for (const r of h.road) surf('tarmac', r[0], r[1], r[2], r[3]);
    /* A bulb's island is grass, with a tree. */
    for (const h of heads) if (h.hole) for (const r of h.hole) surf('grass', r[0], r[1], r[2], r[3]);

    /* Three: corner radii. The arc is centred r tiles back from both kerb lines,
       and the junction side of it becomes carriageway: the r²(1 − π/4) lune. */
    for (const n of net.nodes) {
      const r = this.CLASS[n.minor.cls].radius;
      if (r < 1) continue;
      for (const [sx, sy, wants] of [[-1, -1, 'wn'], [1, -1, 'en'], [-1, 1, 'ws'], [1, 1, 'es']]) {
        /* A corner is where two arms meet: two on a T, four on a crossroads. */
        if (!n.arms.includes(wants[0]) || !n.arms.includes(wants[1])) continue;
        /* The arc centre, r back from both kerb lines. Kerb lines are tile edges (x1
           low, x2 + 1 high), so the cases are not symmetrical. */
        const ox = sx < 0 ? n.x1 - r : n.x2 + 1 + r;
        const oy = sy < 0 ? n.y1 - r : n.y2 + 1 + r;
        for (let dy = 1; dy <= r; dy++) {
          const gy = sy < 0 ? n.y1 - dy : n.y2 + dy;
          let run = 0;
          for (let dx = 1; dx <= r; dx++) {
            const gx = sx < 0 ? n.x1 - dx : n.x2 + dx;
            if (Math.hypot(gx + .5 - ox, gy + .5 - oy) > r) run++;
          }
          if (!run) continue;
          /* The tiles nearest the mouth are the ones outside the arc, so a
             row of the lune is one run against the kerb line. */
          const gx1 = sx < 0 ? n.x1 - run : n.x2 + 1;
          surf('tarmac', gx1, gy, gx1 + run - 1, gy);
        }
      }
    }

    /* Four: paint. Centre lines where wide enough, a give-way line on every minor
       arm meeting a bigger road, and double yellows at distributor junctions. */
    for (const l of net.links) {
      if (!this.CLASS[l.cls].centre) continue;
      const mid = (this.geom(l).c1 + this.geom(l).c2 + 1) / 2;
      if (l.axis === 'x') paint.push({ p: 'dash', a: [l.from, mid], b: [l.to + 1, mid] });
      else paint.push({ p: 'dash', a: [mid, l.from], b: [mid, l.to + 1] });
    }
    for (const n of net.nodes) {
      const mn = n.minor, mj = n.major;
      const gm = this.geom(mj);
      /* The give-way line: one tile back from the major carriageway's edge, across
         the minor arm, on each side it arrives from. */
      const marked = this.RANK[mn.cls] > this.RANK[mj.cls];
      if (!marked) continue;
      if (mn.axis === 'y') {
        const g = this.geom(mn);
        if (mn.from < gm.c1) paint.push({ p: 'line', a: [g.c1, gm.c1 - 1], b: [g.c2 + 1, gm.c1 - 1] });
        if (mn.to > gm.c2) paint.push({ p: 'line', a: [g.c1, gm.c2 + 2], b: [g.c2 + 1, gm.c2 + 2] });
      } else {
        const g = this.geom(mn);
        if (mn.from < gm.c1) paint.push({ p: 'line', a: [gm.c1 - 1, g.c1], b: [gm.c1 - 1, g.c2 + 1] });
        if (mn.to > gm.c2) paint.push({ p: 'line', a: [gm.c2 + 2, g.c1], b: [gm.c2 + 2, g.c2 + 1] });
      }
      /* Yellows only on distributors, where a parked car costs the most, along the
         major road's kerb either side of the mouth, a third of a tile inside each
         kerb line (c1 + .3, c2 + .7). */
      if (this.RANK[mj.cls] > 0) continue;
      const r = this.CLASS[mn.cls].radius + 3;
      const kerbs = [gm.c1 + .3, gm.c2 + .7];
      if (mj.axis === 'x') {
        for (const k of kerbs)
          paint.push({ p: 'yellow', a: [Math.max(mj.from, n.x1 - r), k], b: [Math.min(mj.to + 1, n.x2 + 1 + r), k] });
      } else {
        for (const k of kerbs)
          paint.push({ p: 'yellow', a: [k, Math.max(mj.from, n.y1 - r)], b: [k, Math.min(mj.to + 1, n.y2 + 1 + r)] });
      }
    }
    return out;
  },

  /* ---- turning heads ----
     Chosen off the link's hash so it is stable:
       hammer  a T at the end, two square arms.
       bulb    a circle fifteen metres across, with the paving round it.
     Returns `road` (tarmac), `pave` (the band round it) and `hole` (a bulb's
     island), so lamps(), splays() and the estate builder can ask. */
  heads(net) {
    const out = [];
    /* A disc as one rectangle per row: tiles whose centres are inside radius R. */
    const disc = (cx, cy, R, along) => {
      const rows = [];
      for (let i = -R; i <= R; i++) {
        const w = Math.floor(Math.sqrt(Math.max(0, R * R - i * i)) + .5);
        if (w < 1) continue;
        rows.push(along === 'x'
          ? [Math.round(cx - w), Math.round(cy + i), Math.round(cx + w), Math.round(cy + i)]
          : [Math.round(cx - w), Math.round(cy + i), Math.round(cx + w), Math.round(cy + i)]);
      }
      return rows;
    };
    for (const l of net.links) {
      if (!l.head) continue;
      const g = this.geom(l), c = this.CLASS[l.cls];
      /* Which end: `headAt`, 'to' by default. */
      const at = l.headAt === 'from' ? l.from : l.to;
      const inward = l.headAt === 'from' ? 1 : -1;
      const kind = l.head === true
        ? (this.hash(l.from, l.to, 71) % 2 ? 'hammer' : 'bulb')
        : l.head;
      if (kind === 'bulb') {
        /* A bulb is round: R = 7, fifteen metres across. */
        const R = 7;
        const cx = l.axis === 'x' ? at + inward * (R - 2) : l.at;
        const cy = l.axis === 'x' ? l.at : at + inward * (R - 2);
        out.push({
          link: l, zone: l.zone, kind,
          road: disc(cx, cy, R),
          pave: disc(cx, cy, R + c.foot),
          /* The island in its middle. */
          hole: disc(cx, cy, 2),
          bbox: [Math.round(cx - R - c.foot), Math.round(cy - R - c.foot),
                 Math.round(cx + R + c.foot), Math.round(cy + R + c.foot)],
          centre: [cx, cy]
        });
      } else {
        /* The hammer: the last five metres widened by six each way (sixteen across). */
        const D = 5, ARM = 6;
        const a1 = at + inward * (D - 1), a2 = at;
        const lo = Math.min(a1, a2), hi = Math.max(a1, a2);
        const mk = pad => l.axis === 'x'
          ? [lo - pad, g.c1 - ARM - pad, hi + pad, g.c2 + ARM + pad]
          : [g.c1 - ARM - pad, lo - pad, g.c2 + ARM + pad, hi + pad];
        out.push({ link: l, zone: l.zone, kind, road: [mk(0)], pave: [mk(c.foot)], hole: null,
                   bbox: mk(c.foot),
                   centre: l.axis === 'x' ? [(lo + hi) / 2, l.at] : [l.at, (lo + hi) / 2] });
      }
    }
    return out;
  },

  /* ---- the lighting ----
     At the class's spacing, alternating sides. Never in a junction mouth, a
     splay or on the carriageway. Returned as objects for `furnish()`, with the
     estate lamps' `use:`. */
  lamps(net) {
    /* Nor in a turning head. */
    const out = [], keep = this.splays(net)
      .concat(net.nodes.map(n => [n.x1 - 3, n.y1 - 3, n.x2 + 3, n.y2 + 3]))
      .concat(this.heads(net).map(h => h.bbox));
    const clear = (x, y) => !keep.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);
    for (const l of net.links) {
      const c = this.CLASS[l.cls];
      if (!c.lamp || !c.foot) continue;
      const g = this.geom(l);
      let n = 0;
      for (let t = l.from + Math.floor(c.lamp / 2); t <= l.to; t += c.lamp, n++) {
        /* The column stands on the back of the footway, against the boundary,
           not on the kerb: a lamp on the kerb is a lamp that gets hit. */
        const side = (n % 2) ? g.b2 : g.b1;
        const x = l.axis === 'x' ? t : side, y = l.axis === 'x' ? side : t;
        if (!clear(x, y)) continue;
        out.push({ x, y, e: '💡', name: 'A street light', kind: 'lamp', solid: true, use: 'streetLamp' });
      }
    }
    return out;
  },

  /* ---- the visibility splays ----
     The triangle at a junction mouth that nothing may stand in, as rectangles
     (over-reserving about half, but one comparison each). The estate builder
     checks it before placing houses, walls, hedges or bins. */
  splays(net) {
    const out = [];
    for (const n of net.nodes) {
      const d = this.CLASS[n.minor.cls].splay;
      const gm = this.geom(n.major);
      if (n.major.axis === 'x') {
        /* Back along the major road both ways, in the footway and the ground
           behind it on the side the minor arm comes from. */
        if (n.minor.from < gm.c1) out.push([n.x1 - d, gm.b1 - 3, n.x2 + d, gm.c1 - 1]);
        if (n.minor.to > gm.c2) out.push([n.x1 - d, gm.c2 + 1, n.x2 + d, gm.b2 + 3]);
      } else {
        if (n.minor.from < gm.c1) out.push([gm.b1 - 3, n.y1 - d, gm.c1 - 1, n.y2 + d]);
        if (n.minor.to > gm.c2) out.push([gm.c2 + 1, n.y1 - d, gm.b2 + 3, n.y2 + d]);
      }
    }
    return out;
  },
  /* ---- a circuit ----
     A traffic route round the network, as tile positions for engine/cars.js.
     `legs` is [{ id, dir }] in driving order. Points are on each leg's left-hand
     lane (lane()); a corner is where the outgoing lane meets the incoming one,
     so cars keep left round corners. */
  circuit(net, legs) {
    const pts = [];
    for (let i = 0; i < legs.length; i++) {
      const a = this.byId(net, legs[i].id), b = this.byId(net, legs[(i + 1) % legs.length].id);
      if (!a || !b) throw new Error('Roads.circuit: no such link');
      const la = this.lane(a, legs[i].dir), lb = this.lane(b, legs[(i + 1) % legs.length].dir);
      /* Consecutive legs must turn: a road that changes name without turning is one
         link with two zones. */
      if (a.axis === b.axis) throw new Error('Roads.circuit: two legs on one axis');
      pts.push(a.axis === 'x' ? [lb, la] : [la, lb]);
    }
    /* Start the list at the first leg's beginning, for readability. */
    pts.unshift(pts.pop());
    return pts;
  },

  /* ---- pedestrian loops ----
     One circuit per link: up one footway, across at the end, back down the other.
     Only the crossings are on tarmac, square to the traffic. */
  footfall(net, id, inset) {
    const l = this.byId(net, id);
    const g = this.geom(l), pad = inset || 3;
    let t1 = l.from + pad, t2 = l.to - pad;
    /* Clear of the junction at each end (an access road's ends lie inside the
       spine's carriageway) and clear of any turning head. */
    for (const o of net.links) {
      if (o === l || o.axis === l.axis) continue;
      const go = this.geom(o);
      if (o.from > g.c2 || o.to < g.c1) continue;              /* does not reach this road */
      if (l.from >= go.c1 - 1 && l.from <= go.c2 + 1) t1 = Math.max(t1, go.b2 + 1);
      if (l.to >= go.c1 - 1 && l.to <= go.c2 + 1) t2 = Math.min(t2, go.b1 - 1);
    }
    const along = l.axis === 'x' ? 0 : 1;
    for (const h of this.heads(net)) {
      if (h.link !== l) continue;
      const lo = h.bbox[along], hi = h.bbox[along + 2];
      if (Math.abs(l.from - (h.link.headAt === 'from' ? l.from : l.to)) === 0 && h.link.headAt === 'from') t1 = Math.max(t1, hi + 1);
      else t2 = Math.min(t2, lo - 1);
    }
    const n = this.walk(l, -1), s = this.walk(l, 1);
    const at = (t, k) => l.axis === 'x' ? [t, k] : [k, t];
    return [at(t1, n), at(t2, n), at(t2, s), at(t1, s)];
  },

  /* ---- faults ----
     Whether the layout is one network: the faults that are invisible on screen,
     to the pavement flood fill and to traffic. Called by tools/levelcheck.mjs.
     Each fault is a string; an empty list is a network. */
  faults(net) {
    const bad = [];
    const rank = c => this.RANK[c];

    /* One: it is one network. Links join if their carriageways overlap at all,
       including end to end. */
    const n = net.links.length;
    const up = Array.from({ length: n }, (_, i) => i);
    const find = i => up[i] === i ? i : (up[i] = find(up[i]));
    const join = (i, j) => { const a = find(i), b = find(j); if (a !== b) up[a] = b; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = net.links[i], b = net.links[j];
      const ga = this.geom(a), gb = this.geom(b);
      const hit = a.axis === b.axis
        ? (Math.abs(a.at - b.at) < (this.CLASS[a.cls].lanes + this.CLASS[b.cls].lanes) / 2
           && a.from <= b.to + 1 && b.from <= a.to + 1)
        : (a.axis === 'x'
           ? (b.from <= ga.c2 && b.to >= ga.c1 && a.from <= gb.c2 && a.to >= gb.c1)
           : (a.from <= gb.c2 && a.to >= gb.c1 && b.from <= ga.c2 && b.to >= ga.c1));
      if (hit) join(i, j);
    }
    const roots = new Set(net.links.map((_, i) => find(i)));
    if (roots.size > 1) {
      const groups = {};
      net.links.forEach((l, i) => { (groups[find(i)] = groups[find(i)] || []).push(l.id); });
      bad.push('the carriageway is in ' + roots.size + ' pieces, not one: '
        + Object.values(groups).map(g => '[' + g.join(' ') + ']').join(' '));
    }

    /* Two: a road joins its own class or the one above. */
    for (const j of net.nodes) {
      const d = rank(j.minor.cls) - rank(j.major.cls);
      if (d > 1) bad.push(j.minor.id + ' (' + j.minor.cls + ') joins ' + j.major.id
        + ' (' + j.major.cls + '), which is ' + d + ' steps up the hierarchy — put a road of the class between them in');
    }

    /* Two and a half: nothing comes off a cul-de-sac. */
    for (const j of net.nodes) {
      if (j.major.cls === 'cul') bad.push(j.minor.id + ' comes off ' + j.major.id
        + ', which is a cul-de-sac — nothing hangs off a close');
    }

    /* THREE: NO CROSSROADS BELOW A DISTRIBUTOR. */
    for (const j of net.nodes) {
      if (j.kind !== 'cross') continue;
      if (rank(j.major.cls) === 0 && rank(j.minor.cls) <= 1) continue;   /* two big roads meeting is a junction, and gets lights */
      bad.push('a crossroads where ' + j.minor.id + ' meets ' + j.major.id
        + ' at ' + j.x1 + ',' + j.y1 + ' — stagger it into two T-junctions at least ' + this.STAGGER + ' apart');
    }

    /* Four: a stagger closer than STAGGER is a crossroads. */
    for (const l of net.links) {
      const on = net.nodes.filter(j => j.major === l);
      for (let i = 0; i < on.length; i++) for (let k = i + 1; k < on.length; k++) {
        const a = on[i], b = on[k];
        const gm = this.geom(l);
        /* Which side of the major road the minor arm comes from. */
        const sideOf = j => j.minor.from < gm.c1 ? -1 : 1;
        if (sideOf(a) === sideOf(b)) continue;
        const pos = j => l.axis === 'x' ? (j.x1 + j.x2) / 2 : (j.y1 + j.y2) / 2;
        const gap = Math.abs(pos(a) - pos(b));
        if (gap > 0 && gap < this.STAGGER)
          bad.push(a.minor.id + ' and ' + b.minor.id + ' come out of ' + l.id
            + ' on opposite sides ' + gap.toFixed(0) + ' apart — that is a crossroads with a wobble in it, not a stagger');
      }
    }

    /* FIVE: JUNCTION SPACING on the same side of the same road. */
    for (const l of net.links) {
      const want = this.SPACING[l.cls];
      const on = net.nodes.filter(j => j.major === l)
        .map(j => ({ j, p: l.axis === 'x' ? (j.x1 + j.x2) / 2 : (j.y1 + j.y2) / 2 }))
        .sort((a, b) => a.p - b.p);
      for (let i = 1; i < on.length; i++) {
        const gm = this.geom(l);
        const side = o => o.j.minor.from < gm.c1 ? -1 : 1;
        if (side(on[i]) !== side(on[i - 1])) continue;
        const gap = on[i].p - on[i - 1].p;
        if (gap < want) bad.push(on[i - 1].j.minor.id + ' and ' + on[i].j.minor.id
          + ' are ' + gap.toFixed(0) + ' apart on the same side of ' + l.id
          + ', which wants ' + want);
      }
    }

    /* Six: every dead end whose class needs a head has one. */
    for (const l of net.links) {
      if (!this.CLASS[l.cls].head) continue;
      const g = this.geom(l);
      const span = l.axis === 'x' ? net.w : net.h;
      for (const end of ['from', 'to']) {
        const t = l[end];
        if (l.head && (l.headAt || 'to') === end) continue;
        /* An end in the map's outer two tiles leaves the map; it does not stop (see
           the hem in data/island.js). */
        if (t <= 2 || t >= span - 3) continue;
        const met = net.links.some(o => {
          if (o === l) return false;
          const go = this.geom(o);
          if (o.axis === l.axis) return Math.abs(o.at - l.at) < (this.CLASS[o.cls].lanes + this.CLASS[l.cls].lanes) / 2
            && t >= o.from - 1 && t <= o.to + 1;
          return t >= go.c1 - 1 && t <= go.c2 + 1 && o.from <= g.c2 && o.to >= g.c1;
        });
        if (!met) bad.push(l.id + ' stops dead at ' + end + '=' + t
          + ' with nothing to turn in — give it a head or run it to another road');
      }
    }

    /* Seven: a link is long enough to be one, and a cul-de-sac short enough
       (150 m). */
    for (const l of net.links) {
      const len = l.to - l.from + 1;
      if (len < this.CLASS[l.cls].lanes) bad.push(l.id + ' is ' + len + ' long, which is shorter than it is wide');
      if (l.cls === 'cul' && len > 150) bad.push(l.id + ' is a ' + len + '-tile cul-de-sac — over 150 wants a second way out');
    }
    return bad;
  }
};
