'use strict';
/* CALLHALL — ROADS, AND THE RULES THEY ARE LAID OUT BY.
 *
 * The estate east of Bellhaven was seven parallel stripes of tarmac with
 * nothing joining them to anything. Seven. Each one ten tiles deep, a hundred
 * and eighty long, with a row of semis between it and the next, and not one
 * junction anywhere on the level: you could not drive from Marley Road onto
 * Ashfield Avenue, or from Ashfield Avenue onto Elm Tree Avenue, because there
 * was no piece of road between them. A flood fill of the carriageway came back
 * with SEVEN COMPONENTS, six of them serving a hundred and twelve houses and
 * reachable from nowhere. From above it read as a barcode.
 *
 * Nobody noticed because nothing asks. `levelcheck` floods the walkable floor
 * and the estate passes — you can walk across a pavement and over a verge onto
 * the next street, so every tile is reachable and the level is "one place".
 * The traffic never noticed either, because there was no traffic: a route has
 * to be tarmac all the way round (see `car.tarmac` in engine/cars.js) and there
 * was no circuit on this map long enough to bother putting a car on.
 *
 * So this file is the thing that was missing, and it is deliberately not a
 * second copy of the arithmetic in data/outskirts.js. A ROAD LAYOUT IS A GRAPH
 * WITH RULES ON IT, and the rules are not ours — they are about a century of
 * other people's work, most of it written down after somebody was hurt at a
 * junction. What is encoded here is the shape of that, at the level of detail a
 * map one tile to the metre can actually show:
 *
 *   HIERARCHY. A road is one of four things and its width, its markings, its
 *   lighting and its junction radii all follow from which. A distributor
 *   carries traffic and fronts nothing; an access road fronts houses and
 *   carries only them. See CLASS.
 *
 *   A ROAD JOINS ITS OWN CLASS OR THE ONE ABOVE IT. That is the whole of what
 *   a hierarchy is for: it is what stops a cul-de-sac hanging off a cul-de-sac
 *   hanging off a cul-de-sac, which is how an estate ends up with one way in
 *   and forty houses behind it.
 *
 *   NO CROSSROADS BELOW A DISTRIBUTOR. A four-arm junction is the worst
 *   junction there is — every conflict a T-junction has, twice, plus two it
 *   does not — and the answer everywhere in this country is a STAGGERED PAIR
 *   OF T-JUNCTIONS, offset far enough apart that nobody treats them as one.
 *   faults() reports a crossroads and reports a stagger too short to be one.
 *
 *   PRIORITY GOES UP THE HIERARCHY, and the minor arm is the one that gives
 *   way. That is a fact about paint and about who yields, and both come out of
 *   the same line here.
 *
 *   A KERB TURNS THROUGH A RADIUS. Two rectangles of tarmac crossing is not a
 *   junction, it is a plus sign: the thing that makes a junction read as one is
 *   the corner, where the kerb sweeps out of one road into the other and the
 *   pavement goes round the outside of it. Bigger radius on a bigger road,
 *   because that is what the vehicle that uses it needs to get round.
 *
 *   A CUL-DE-SAC ENDS IN SOMETHING YOU CAN TURN IN. Not a preference: a refuse
 *   lorry reverses about as well as it stops, and no highway authority in the
 *   country will adopt a dead end without a head on it. Two kinds, because both
 *   are everywhere — a hammerhead, which is a T, and a bulb, which is a circle.
 *
 *   AND YOU CAN SEE OUT OF IT. A visibility splay is the triangle at a junction
 *   mouth that nothing may stand in, measured back along the major road from a
 *   driver sitting a couple of metres back in the minor one. splays() is that
 *   list of rectangles, and the estate builder is told to keep its trees, its
 *   walls and its wheelie bins out of them.
 *
 * WHAT IS DELIBERATELY NOT HERE: anything on a diagonal, and anything curved.
 * Every road in this game is an axis-aligned rectangle, and that is not
 * laziness — R.kerbs() derives a kerb from where two surfaces meet, the wall
 * band draws the face of a wall with floor below it, and both of those are
 * grid-wise. A road at thirty degrees would need a kerb renderer, a marking
 * renderer and a collision model none of which exist. The curve budget is spent
 * where it shows: on the junction radii, which are the corners you actually
 * look at, and on the turning heads.
 *
 * Nothing in here names anything from engine/. It is tables and arithmetic, and
 * it runs at load time — which is why it is in data/ and why it comes before
 * data/outskirts.js, the file that calls it.
 */
const Roads = {

  /* ---- THE HIERARCHY -------------------------------------------------------
     Four classes, and everything else in this file is a lookup into this.

       lanes   the carriageway, in tiles. A tile is a metre, so these are the
               real widths: 6.0 m for a distributor with two 3 m lanes, 5.0 m
               for a spine, 4.8 m for an access road — which is under the 5.5 m
               at which this country stops painting a centre line, and is why
               `centre` is false on everything below a distributor. An estate
               road with a white line down the middle of it is a road somebody
               drives at thirty-five.
       foot    the footway either side. 2.0 m is the adoptable minimum for one
               that people actually walk two abreast on; a lane gets none,
               because a farm track has no pavement and never had.
       radius  the kerb radius at a junction where this is the MINOR arm. The
               minor arm decides it, because the corner is cut for the vehicle
               turning INTO the small road, and a 6 m radius on an access road
               is a corner nobody slows down for.
       lamp    the spacing of the street lighting, in tiles. Wider apart on a
               smaller road, and staggered side to side — see lamps().
       splay   how far back along the major road you have to be able to see
               when you are waiting to come out of this one. Twenty-five metres
               is about right for a road people do thirty on; a dozen is plenty
               where they do twenty because the road is four metres wide and
               has cars parked down both sides of it.
       head    whether a dead end of this class has to have a turning head.

     RANK is the hierarchy itself, and it is the only thing in here that
     encodes an ordering: priority, give-way paint and the join rule all read
     it and nothing else. */
  CLASS: {
    distributor: { lanes: 6, foot: 2, centre: true,  radius: 4, lamp: 22, splay: 28, head: true },
    spine:       { lanes: 5, foot: 2, centre: false, radius: 3, lamp: 26, splay: 22, head: true },
    access:      { lanes: 4, foot: 2, centre: false, radius: 2, lamp: 30, splay: 14, head: true },
    cul:         { lanes: 4, foot: 2, centre: false, radius: 2, lamp: 34, splay: 12, head: true }
  },
  /* FOUR CLASSES AND NOT FIVE. There was a `lane` here for the farm tracks and
     it is gone, on the project's own rule that an entry nobody asks for is
     never seen to be wrong — but the reason nothing asked for it is worth the
     line. A farm track is not a road in the hierarchy: it is a private access
     onto one, which is why it has no footway, no markings, no lighting and no
     junction radius, and why its junction with Marley Road is a gap in a hedge
     rather than a mouth. The lane up to the farm and the back lane along the
     bottom of the fields are laid as rooms with a `track` surface in
     data/outskirts.js, which is what they are. Add the class back the day
     something wants a road made of something other than tarmac. */
  /* AND A CUL-DE-SAC IS NOT A RANK OF ITS OWN. It is an access road that
     happens to be a dead end — same width, same lighting, same houses on it,
     and the difference is topological rather than hierarchical. Giving it a
     rank of its own made every close in the estate two steps below the spine
     it comes off and therefore a fault, which is not what anybody means by a
     hierarchy: what the hierarchy actually forbids is a road hanging off a
     cul-de-sac, and that is checked by name in faults() rather than by
     arithmetic. */
  RANK: { distributor: 0, spine: 1, access: 2, cul: 2 },

  /* How far apart two minor arms on opposite sides of the same road have to be
     before they are a stagger rather than a crossroads with a wobble in it.
     Twenty metres, which is about four car lengths — near enough that a driver
     reads them as one junction and far enough that the two right turns do not
     have to happen in the same piece of road. */
  STAGGER: 20,
  /* And how far apart two junctions on the same road may be at all. A
     distributor with a side road every fifteen metres is a distributor that
     has stopped distributing anything. */
  SPACING: { distributor: 34, spine: 20, access: 14, cul: 10 },

  /* ---- the dice ------------------------------------------------------------
     The same hash every derived thing in this engine uses, for the same
     reason: a level is rebuilt whenever it is loaded, and a turning head that
     is a hammerhead on the way in and a bulb on the way out is not a turning
     head. */
  hash(a, b, salt) {
    let h = 2166136261 ^ (salt || 0);
    h = Math.imul(h ^ a, 16777619); h = Math.imul(h ^ b, 16777619);
    h ^= h >>> 13; h = Math.imul(h, 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  },

  /* ---- A LINK --------------------------------------------------------------
     One road, or one straight piece of one:

       { id, cls, zone, axis: 'x'|'y', at, from, to, head: 'bulb'|'hammer'|null }

     `axis` is the way it runs, `at` is the CENTRE of the band on the other
     axis, and `from`/`to` are its extent along `axis` — inclusive, in tiles,
     and of the CARRIAGEWAY rather than of the band, because the carriageway is
     the thing that has to meet the next road's carriageway. Everything else is
     derived from the class.

     `at` is the centre and not an edge on purpose. A road is widened by
     changing its class, and a road that grew from its north edge would move
     every house on its south side when it did. */
  link(o) {
    const c = this.CLASS[o.cls];
    if (!c) throw new Error('Roads: no such class ' + o.cls);
    return Object.assign({ head: null, name: null }, o);
  },

  /* The band and the carriageway, on the cross axis, as inclusive tile
     extents. `b1..b2` is everything the road occupies — pavement, kerb,
     carriageway, kerb, pavement — and `c1..c2` is the part you drive on.
     One place, because eight other functions in this file want it and a
     second copy of this arithmetic is how a kerb ends up half a tile out. */
  geom(l) {
    const c = this.CLASS[l.cls];
    const half = c.lanes / 2;
    const c1 = Math.round(l.at - half), c2 = Math.round(l.at + half) - 1;
    return { c1, c2, b1: c1 - c.foot, b2: c2 + c.foot, def: c };
  },

  /* WHICH SIDE OF THE ROAD A CAR GOING THIS WAY SITS ON, as a cross-axis
     coordinate in tiles-and-a-half. We drive on the left, so travelling in the
     positive direction along an axis puts left on the positive side of the
     cross axis (south when you are going east, east when you are going south)
     and travelling in the negative direction puts it on the other. That one
     sign is the whole of keeping left, and it is here rather than in the
     circuit builder so that a route and the give-way line it stops at cannot
     disagree about which lane is which. */
  lane(l, dir) {
    const g = this.geom(l), mid = (g.c1 + g.c2 + 1) / 2;
    return mid + dir * this.CLASS[l.cls].lanes / 4;
  },
  /* The middle of one footway, which is where somebody on foot walks. `side`
     is -1 for the negative side of the cross axis (north or west) and +1 for
     the other. Never a carriageway coordinate: no leg of a pedestrian route
     may run ALONG a lane — see engine/peds.js. */
  walk(l, side) {
    const g = this.geom(l), c = this.CLASS[l.cls];
    if (!c.foot) return (g.c1 + g.c2 + 1) / 2;
    return side < 0 ? g.b1 + c.foot / 2 : g.b2 + 1 - c.foot / 2;
  },

  /* ---- THE NET -------------------------------------------------------------
     A list of links, plus every junction between them, worked out rather than
     declared. A declared junction is a second statement of something the
     geometry already says, and the two go out of step the first time anybody
     moves a road.

     A junction is where the CARRIAGEWAYS of two links on different axes
     overlap. Its arms are the directions you can leave it in, which is what
     tells a T from a crossroads: a link that carries on past the junction on
     both sides contributes two arms, and one that stops at it contributes one.
     Priority is to the lower RANK, and where two links are the same class the
     one that carries on through it wins — which is what "the through road has
     priority" means when nobody has painted anything. */
  net(links, bounds) {
    const ls = links.map(l => this.link(l));
    const nodes = [];
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i], b = ls[j];
      if (a.axis === b.axis) continue;
      const along = a.axis === 'x' ? a : b, across = a.axis === 'x' ? b : a;
      const ga = this.geom(along), gc = this.geom(across);
      /* The vertical road's carriageway columns have to reach the horizontal
         one's carriageway rows, and the other way about. Touching pavements is
         not a junction; it is two roads that nearly meet, which is the exact
         thing this file exists because of. */
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
        /* The mouth, in tiles: the rectangle where the two carriageways
           actually overlap. Everything about a junction — its corners, its
           give-way line, its yellow lines — is measured off this. */
        x1: gc.c1, x2: gc.c2, y1: ga.c1, y2: ga.c2
      });
    }
    /* The map, so that faults() can tell a road that stops dead from one that
       leaves — Marley Road runs off both edges of this level and arrives
       somewhere on the next, and a dead-end check that does not know where
       the map stops reports both ends of it. */
    return { links: ls, nodes, w: (bounds && bounds.w) || Infinity, h: (bounds && bounds.h) || Infinity };
  },
  byId(net, id) { return net.links.find(l => l.id === id); },

  /* ---- STAMPING IT ONTO A LEVEL -------------------------------------------
     Pushes onto a level's own `rooms`, `surfaces` and `paint` lists. THE ORDER
     MATTERS AND IT IS THE ONE THING IN HERE THAT IS NOT LOCAL: a surface
     declared later wins, so every band's paving goes down first and every
     carriageway on top of all of it. Emit them road by road instead and the
     second road's pavement is laid across the first road's carriageway at
     every junction — which is not a cosmetic fault, because R.kerbs() draws a
     kerb wherever tarmac meets paving and what you get is a six-inch step
     across the middle of a road. That is why the town's own carriageways are
     each one rectangle running the whole width of the map, and this is the
     same rule said once for a generated network. */
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
    /* ONE: the rooms and the paving. A street is a room of its own so that
       crossing into it announces its name — see the note above ZONES in
       data/world.js — and the paving is what the whole band is made of before
       anything is laid over it. */
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
    /* And the corners: a junction's kerb radius eats into the footway, so the
       pavement has to be wider there than the band is, or it goes round the
       outside of the radius and off the edge of the road. Paved here, cut into
       by the tarmac below. */
    for (const n of net.nodes) {
      const r = this.CLASS[n.minor.cls].radius, f = 2;
      /* ON THE SIDES THERE IS AN ARM, and nowhere else. A T-junction is three
         arms and the fourth side of its mouth is not a corner of anything —
         widening it anyway paved a patch of the field on the far side of
         Marley Road at both places the loop comes out onto it, which reads
         from above as a road somebody started and gave up on. */
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
    /* AND THE ISLAND IN A BULB IS PLANTED, not paved. It is the one piece of
       ground in a turning head that no vehicle can reach, which is why there
       is a tree on it — and paved, it read as a bit of the road somebody had
       left out rather than as the thing the road goes round. */
    for (const h of heads) if (h.hole) for (const r of h.hole) surf('grass', r[0], r[1], r[2], r[3]);

    /* THREE: THE CORNER RADII. A kerb does not turn a right angle. It runs
       along the major road, sweeps through an arc into the minor one and runs
       on — so the arc is centred r tiles back from BOTH kerb lines, in the
       footway corner, and the ground on the junction side of it is
       carriageway rather than pavement.

       IT IS A SMALL AMOUNT OF TARMAC AND A LARGE AMOUNT OF DIFFERENCE. The
       lune outside a quarter circle is r²(1 − π/4) — about two tiles at a
       three-metre radius — and that is the whole of what rounding a corner
       takes off it. A first version put the centre half a tile out and in the
       wrong direction and laid a one-tile sliver down the side of the road
       instead, which is not a radius, it is a rut. */
    for (const n of net.nodes) {
      const r = this.CLASS[n.minor.cls].radius;
      if (r < 1) continue;
      for (const [sx, sy, wants] of [[-1, -1, 'wn'], [1, -1, 'en'], [-1, 1, 'ws'], [1, 1, 'es']]) {
        /* A CORNER IS WHERE TWO ARMS MEET, so a T-junction has two of them and
           a crossroads four. Sweeping all four regardless left a radius of
           tarmac on the side of the mouth with no road on it — four stray
           tiles south of Marley Road at each of the loop's two junctions,
           which the flood fill in tools/levelcheck.mjs reports as a piece of
           carriageway reachable from nothing, and which is what they are. */
        if (!n.arms.includes(wants[0]) || !n.arms.includes(wants[1])) continue;
        /* The centre of the arc: r back from the major road's kerb line and r
           back from the minor road's, which is the footway corner. Kerb lines
           are tile EDGES — the low side of the mouth is at x1, the high side
           at x2 + 1 — so the two cases are not symmetrical and cannot be
           written as one. */
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

    /* FOUR: the paint. Centre lines only where the road is wide enough to
       carry one, a give-way line across every minor arm that comes out onto a
       road bigger than itself, and double yellows through the junction mouths
       — because you may not park within ten metres of one, and because a car
       left in the mouth of a junction is the single thing that most stops
       traffic in this game working. */
    for (const l of net.links) {
      if (!this.CLASS[l.cls].centre) continue;
      const mid = (this.geom(l).c1 + this.geom(l).c2 + 1) / 2;
      if (l.axis === 'x') paint.push({ p: 'dash', a: [l.from, mid], b: [l.to + 1, mid] });
      else paint.push({ p: 'dash', a: [mid, l.from], b: [mid, l.to + 1] });
    }
    for (const n of net.nodes) {
      const mn = n.minor, mj = n.major;
      const gm = this.geom(mj);
      /* WHERE THE LINE GOES. One tile back from the major carriageway's own
         edge, across the minor arm, on whichever side of the junction the
         minor road actually comes from — and on both, when it comes from
         both, which is a crossroads and is reported as a fault besides. */
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
      /* And the yellows, along the major road's kerb either side of the mouth.
         Only on the major: a car parked just inside a side road is a nuisance
         and a car parked across its mouth is the junction gone. */
      /* ON A DISTRIBUTOR AND NOWHERE ELSE. Junction protection exists because
         a car left in the mouth of a junction is the junction gone, and that
         is a problem in proportion to what the junction carries. Painted at
         every junction it also read as one: this estate has a side turning
         every twenty metres, so the loop road came out with yellow lines down
         two thirds of its length — which is a thing that exists in some towns
         and is not a thing worth drawing, because what it looks like from
         above is a road with a yellow stripe on it rather than a junction with
         protection at it.

         JUST INSIDE THE KERB, and that is not the same as ON it: the low kerb
         line is the tile EDGE at c1 and the high one the edge at c2 + 1, so
         the paint sits a third of a tile inside each. Written as c1 - .3 and
         c2 + 1.3 it fell a third of a tile the wrong side of both, and the
         southern pair at every junction on Marley Road was painted along the
         back of the footway. */
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

  /* ---- TURNING HEADS ------------------------------------------------------
     A dead end with nothing to turn in is a dead end a refuse lorry reverses
     the length of, which is why no authority in the country will adopt one.
     Both forms are everywhere and both are here, chosen off the link's own
     hash so it is the same head every time the level is built:

       HAMMER, a T at the end of the road. Two arms of tarmac square to it,
       which is the older answer and the one that fits where a circle will not.

       BULB, a circle. The modern answer, and the one that needs fifteen metres
       across it to be any use — so the road widens out into it and the paving
       goes round the outside.

     `road` is the tarmac, `pave` the band round it, and `hole` is the island in
     the middle of a bulb, which is where the tree goes. Returned as data rather
     than stamped directly so that lamps(), splays() and the estate builder can
     all ask where the head is without any of them working it out again. */
  heads(net) {
    const out = [];
    /* A disc, as one rectangle a row: the run of tiles whose centres are
       inside a circle of radius R. Row by row because that is the shape of a
       circle on a grid and because a rectangle a row is what a level's
       `surfaces:` list is made of — the alternative is a tile at a time, which
       is two hundred entries for a turning head. */
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
      /* Which end. A head is declared as 'bulb' or 'hammer' plus which end of
         the link it is on — 'to' by default, because a cul-de-sac runs away
         from the road it comes off. */
      const at = l.headAt === 'from' ? l.from : l.to;
      const inward = l.headAt === 'from' ? 1 : -1;
      const kind = l.head === true
        ? (this.hash(l.from, l.to, 71) % 2 ? 'hammer' : 'bulb')
        : l.head;
      if (kind === 'bulb') {
        /* A BULB IS ROUND, and that is the whole of why it is a bulb. Fifteen
           metres across it, which is what turns a refuse lorry in one
           movement; laid as a SQUARE of tarmac it read from above as a car
           park somebody had put at the end of a road. */
        const R = 7;
        const cx = l.axis === 'x' ? at + inward * (R - 2) : l.at;
        const cy = l.axis === 'x' ? l.at : at + inward * (R - 2);
        out.push({
          link: l, zone: l.zone, kind,
          road: disc(cx, cy, R),
          pave: disc(cx, cy, R + c.foot),
          /* The island, and it is two thirds of the reason a bulb is better
             than a hammerhead to look at: something in the middle of it for
             the road to go round. */
          hole: disc(cx, cy, 2),
          bbox: [Math.round(cx - R - c.foot), Math.round(cy - R - c.foot),
                 Math.round(cx + R + c.foot), Math.round(cy + R + c.foot)],
          centre: [cx, cy]
        });
      } else {
        /* The hammer: the last five metres of the road, widened square to it
           by six each way — sixteen metres across the bar, which is what turns
           a long-wheelbase vehicle in three moves and is the figure every
           adoption standard in the country prints. */
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

  /* ---- THE LIGHTING -------------------------------------------------------
     At the spacing the class says, ALTERNATING SIDES, which is what a lit
     street actually looks like from above and is the cheapest way to light one
     — columns down one side only is a road with a dark stripe along it. Never
     in a junction mouth, never in a visibility splay, and never on the
     carriageway: a lamp post is solid, and a solid thing in a lane is a lane
     with a bollard in it.

     Returned as objects because that is what a level's `furnish()` wants, and
     with the `use:` the estate's own lamps already have, so pressing one says
     what it always said. */
  lamps(net) {
    /* Never in a junction mouth, never in a splay, and never in a turning
       head: the column stands on the back of the footway, and round a bulb the
       back of the footway is eighteen metres from where the straight bit of it
       was. */
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

  /* ---- THE VISIBILITY SPLAYS ----------------------------------------------
     The triangle at a junction mouth that nothing may stand in: a driver two
     and a bit metres back in the minor road has to be able to see along the
     major one far enough to pull out into it. Written down here as rectangles
     rather than triangles, which over-reserves by about half and is the right
     trade — the thing reading this list is a generator deciding where NOT to
     put a tree, and a rectangle is one comparison.

     It is the one rule in this file that constrains something other than a
     road, and it is the reason it is a function anybody can call rather than
     something stamped in: the estate builder asks it before it places a house,
     a garden wall, a hedge or a wheelie bin. */
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
  /* ---- A CIRCUIT ----------------------------------------------------------
     A traffic route round the network, as the list of tile positions
     engine/cars.js wants. `legs` is [{ id, dir }] in the order they are driven
     — the caller says which way round, because which way round a loop the
     traffic goes is a fact about the town and not about the geometry.

     Every point is on the LEFT-HAND LANE of its own leg (see lane()), and the
     corner between two legs is the one point where the two lanes cross: the
     turn is taken at the intersection of the outgoing leg's lane with the
     incoming one's, which is exactly where a car that keeps left goes round a
     corner. Get that wrong and the route cuts the corner across the other
     carriageway, which the traffic then does, at every junction, for ever. */
  circuit(net, legs) {
    const pts = [];
    for (let i = 0; i < legs.length; i++) {
      const a = this.byId(net, legs[i].id), b = this.byId(net, legs[(i + 1) % legs.length].id);
      if (!a || !b) throw new Error('Roads.circuit: no such link');
      const la = this.lane(a, legs[i].dir), lb = this.lane(b, legs[(i + 1) % legs.length].dir);
      /* The corner: along `a`'s own lane as far as `b`'s lane, then `b` takes
         over. Two consecutive legs on the same axis would have no corner, so
         they are not allowed to be — a road that changes name without turning
         is one link with two zones, not two links. */
      if (a.axis === b.axis) throw new Error('Roads.circuit: two legs on one axis');
      pts.push(a.axis === 'x' ? [lb, la] : [la, lb]);
    }
    /* Rotate so the route starts at the first leg's beginning rather than at
       its end, which is only tidiness — a circuit has no start — but makes the
       emitted list read in the order somebody drives it. */
    pts.unshift(pts.pop());
    return pts;
  },

  /* ---- WHAT THE PAVEMENT LOOKS LIKE TO WALK ROUND -------------------------
     One circuit per link: up one footway, across the carriageway at the end,
     back down the other. The crossing legs are the only ones on tarmac and
     they are square to the traffic, which is what engine/peds.js needs — no
     leg ALONG a lane, and nobody stopping on one. */
  footfall(net, id, inset) {
    const l = this.byId(net, id);
    const g = this.geom(l), pad = inset || 3;
    let t1 = l.from + pad, t2 = l.to - pad;
    /* CLEAR OF THE JUNCTION AT EITHER END, which a plain inset is not — and
       this is the one thing in this file that a rule about roads would never
       have thought of, because it is a rule about people.

       An access road's ends are INSIDE the carriageway of the spine it comes
       off: the avenue runs through the leg's footway to reach its lane, which
       is the whole reason a carriageway is one rectangle carried straight
       through (see stamp()). So a corner four tiles in from the end stood in
       the middle of the other road, and the long leg away from it ran three
       tiles along live carriageway before it reached any pavement.
       engine/peds.js has exactly one rule about a route and that is it.

       AND CLEAR OF THE TURNING HEAD, for the same reason with a bigger
       number: a bulb is fifteen metres across and a close's far end is the
       middle of it, so the corner landed on the carriageway of the head. */
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

  /* ---- THE RULES, AS A LIST OF THINGS THAT CAN BE WRONG -------------------
     Everything above lays a network out. This says whether it is one, and it
     is the half that earns the file: the fault it is written for — six
     avenues joined to nothing — is invisible on screen, invisible to the
     flood fill that walks the pavement, and invisible to the traffic because
     there was no traffic. Something has to ask.

     Called by tools/levelcheck.mjs, which is where it stops being a comment.
     Each fault is a string; an empty list is a network. */
  faults(net) {
    const bad = [];
    const rank = c => this.RANK[c];

    /* ONE: IT IS ONE NETWORK. The whole point. Two links are joined if their
       carriageways overlap at all — which includes end to end on the same
       axis, because a road that changes name is still a road. */
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

    /* TWO: A ROAD JOINS ITS OWN CLASS OR THE ONE ABOVE IT. What a hierarchy is
       for. A cul-de-sac off a cul-de-sac is forty houses behind one way in. */
    for (const j of net.nodes) {
      const d = rank(j.minor.cls) - rank(j.major.cls);
      if (d > 1) bad.push(j.minor.id + ' (' + j.minor.cls + ') joins ' + j.major.id
        + ' (' + j.major.cls + '), which is ' + d + ' steps up the hierarchy — put a road of the class between them in');
    }

    /* TWO AND A HALF: AND NOTHING COMES OFF A CUL-DE-SAC. The rule the ranks
       cannot state, now that a close ranks with the access road it is a dead
       end of. A road off a close is the thing the hierarchy exists to stop:
       forty houses behind one junction, and the bin lorry reversing past all
       of them when somebody parks across it. */
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

    /* FOUR: AND A STAGGER HAS TO BE ONE. Two minor arms on opposite sides of
       the same road, closer together than STAGGER, is a crossroads that has
       been nudged rather than staggered — and reads as one to everybody
       driving through it. */
    for (const l of net.links) {
      const on = net.nodes.filter(j => j.major === l);
      for (let i = 0; i < on.length; i++) for (let k = i + 1; k < on.length; k++) {
        const a = on[i], b = on[k];
        const gm = this.geom(l);
        /* Which side of the major road the minor arm comes from. The minor's
           own axis IS the major's cross axis — they are perpendicular — so
           this one comparison answers it whichever way round the pair is. */
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

    /* SIX: EVERY DEAD END HAS SOMETHING TO TURN IN. An end of a link that no
       other link reaches, on a class that says it needs a head, and no head
       declared on it. This is the one that would be caught by a refuse lorry
       and by nothing else. */
    for (const l of net.links) {
      if (!this.CLASS[l.cls].head) continue;
      const g = this.geom(l);
      const span = l.axis === 'x' ? net.w : net.h;
      for (const end of ['from', 'to']) {
        const t = l[end];
        if (l.head && (l.headAt || 'to') === end) continue;
        /* A ROAD THAT LEAVES IS NOT A ROAD THAT STOPS. Marley Road runs off
           both edges of this level and arrives on the next one; the outermost
           two tiles of a map are the rest of the world (see the hem in
           data/island.js), so an end in them is an end that carries on. */
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

    /* SEVEN: A LINK IS LONG ENOUGH TO BE ONE, and a cul-de-sac is short enough
       to be one. A hundred and fifty metres is where this country stops
       calling it a cul-de-sac and starts asking for a second way out. */
    for (const l of net.links) {
      const len = l.to - l.from + 1;
      if (len < this.CLASS[l.cls].lanes) bad.push(l.id + ' is ' + len + ' long, which is shorter than it is wide');
      if (l.cls === 'cul' && len > 150) bad.push(l.id + ' is a ' + len + '-tile cul-de-sac — over 150 wants a second way out');
    }
    return bad;
  }
};
