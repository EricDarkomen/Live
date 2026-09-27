'use strict';
/* THE STREET — the outdoor level the building empties onto, built from rules
 * rather than drawn: data/roads.js lays the roads out, and this file says
 * which roads there are and what stands beside them.
 *
 * It is here so a new game starts with every outdoor system working and
 * exercised — a road network with real junctions, traffic on circuits, a
 * pelican crossing, pedestrians on the footways, street lighting, a car park
 * with a car you can drive, a fire drill's assembly point, and two doors: the
 * office and the shop. Replace it, grow it, or delete it and its <script> tags;
 * nothing in engine/ knows it exists. `street: true` is what makes it the
 * level everybody walks out to at the end of the day (see Levels.street()).
 *
 * THE LAYOUT, in tiles (a tile is a metre):
 *
 *     top ─────────────────────────────┐        a loop of spines off the
 *     │                  bulb          │        high street, a cross street
 *     west          close│             east     between its legs, and a
 *     │                  │             │        cul-de-sac off that — every
 *     ├──────────── mid ─┴─────────────┤        junction a T, which is what
 *     │                                │        faults() insists on
 *  ═══╧════════ high (distributor) ════╧════════
 *        [office]   [car park]   [shop]
 *
 * tools/levelcheck.mjs runs Roads.faults() over `net` on every run. */

const Street = {
  W: 128, H: 96,
  /* Where each road runs: `at` is the CENTRE of the carriageway on the cross
     axis. Moving one moves everything that fronts it. */
  HIGH: 66, TOP: 10, MID: 40, WEST: 34, EAST: 94, CLOSE: 64,

  plan() {
    if (this._plan) return this._plan;
    const W = this.W, g = (cls, at) => Roads.geom({ cls, at });
    const wc = g('spine', this.WEST), ec = g('spine', this.EAST);
    return (this._plan = Roads.net([
      { id: 'high', zone: 'high', cls: 'distributor', axis: 'x', at: this.HIGH, from: 0, to: W - 1 },
      { id: 'west', zone: 'west', cls: 'spine', axis: 'y', at: this.WEST, from: this.TOP, to: this.HIGH },
      { id: 'top', zone: 'top', cls: 'spine', axis: 'x', at: this.TOP, from: wc.c1, to: this.EAST },
      { id: 'east', zone: 'east', cls: 'spine', axis: 'y', at: this.EAST, from: this.TOP, to: this.HIGH },
      { id: 'mid', zone: 'mid', cls: 'access', axis: 'x', at: this.MID, from: wc.c1, to: ec.c2 },
      { id: 'close', zone: 'close', cls: 'cul', axis: 'y', at: this.CLOSE, from: 24, to: this.MID, head: 'bulb', headAt: 'from' }
    ], { w: W, h: this.H }));
  },

  make() {
    const W = this.W, H = this.H;
    const rooms = [], surfaces = [], paint = [], objects = [], cars = [], solids = [];
    const room = (z, x1, y1, x2, y2) => rooms.push({ z, r: [x1, y1, x2, y2] });
    const surf = (s, x1, y1, x2, y2) => surfaces.push({ s, r: [x1, y1, x2, y2] });
    const add = o => objects.push(o);
    const mass = (x1, y1, x2, y2) => solids.push([x1, y1, x2, y2]);

    /* Open ground first, and everything else laid over it. The hem of mass
       round the edge is the rest of the world, and it is THREE tiles deep: two
       would be a run of mass nowhere three thick, which is what a garden wall
       is, and the roof rule would rightly refuse to roof it. */
    room('common', 3, 3, W - 4, H - 4);
    surf('grass', 3, 3, W - 4, H - 4);

    /* THE ROADS, all of them in one call: the paving goes down before any
       carriageway, or the second road's pavement is laid across the first
       road's tarmac at every junction. See the note over Roads.stamp(). */
    const net = this.plan();
    Roads.stamp(net, { rooms, surfaces, paint });
    const high = Roads.byId(net, 'high'), hg = Roads.geom(high);
    const front = hg.b2 + 1;                       /* the first row south of the pavement */

    /* THE BUILDINGS are mass put back into a map that was carved open — see
       furnish(). Each one fronts the high street across a strip of ground. */
    const OFFICE = [22, front + 2, 58, H - 5], SHOP = [98, front + 2, 116, front + 14];
    mass(...OFFICE); mass(...SHOP);
    mass(74, 18, 88, 32);                          /* a block between the loop's legs */
    mass(40, 18, 54, 32);
    /* Two garden walls across the common, crossing: one tile of mass each, and
       walls rather than buildings — the roof rule must leave them bare. */
    mass(4, 48, 26, 48); mass(15, 44, 15, 56);

    const door = (x, name, use, e) => add({ x, y: front + 1, e: e || '🚪', name, kind: 'exit', solid: false, use });
    door(40, 'The office', 'officeDoor');
    door(106, 'The shop', 'shopDoor', '🏪');
    add({ x: OFFICE[0] - 1, y: 82, e: '🚪', name: 'The fire exit', kind: 'exit', solid: false, use: 'fireDoor' });
    add({ x: 12, y: 82, e: '🪧', name: 'Assembly point', kind: 'sign', solid: true, use: 'assemblyPoint' });
    add({ x: 44, y: front, e: '🚏', name: 'The bus stop', kind: 'sign', solid: true, use: 'busStop' });

    /* THE CAR PARK, between the office and the shop, and the crossover that
       joins its tarmac to the high street's — a car you can drive has to be
       able to drive out. */
    room('carpark', 64, front + 2, 92, front + 14);
    surf('tarmac', 64, front + 2, 92, front + 14);
    surf('tarmac', 76, hg.c2 + 1, 80, front + 1);
    [68, 72, 84, 88].forEach((x, i) => cars.push({ x: x + .5, y: front + 5.5, face: 'n',
      model: ['hatch', 'estate', 'small', 'saloon'][i], name: 'A parked car', use: 'parkedCar' }));
    cars.push({ x: 72.5, y: front + 11.5, face: 's', model: 'pool', name: 'The pool car', use: 'poolCar', drive: true });

    /* Street lights, which the network places — staggered, never in a junction
       mouth, a splay or a turning head. */
    Roads.lamps(net).forEach(add);

    /* A few trees on the common, off the roads and their sight lines. */
    const keep = Roads.heads(net).map(h => h.bbox).concat(Roads.splays(net));
    const clear = (x, y) => !keep.some(r => x >= r[0] - 1 && x <= r[2] + 1 && y >= r[1] - 1 && y <= r[3] + 1)
      && !net.links.some(l => { const q = Roads.geom(l);
        return l.axis === 'x' ? (y >= q.b1 - 1 && y <= q.b2 + 1 && x >= l.from - 3 && x <= l.to + 3)
                              : (x >= q.b1 - 1 && x <= q.b2 + 1 && y >= l.from - 3 && y <= l.to + 3); })
      && !solids.some(b => x >= b[0] - 1 && x <= b[2] + 1 && y >= b[1] - 1 && y <= b[3] + 1);
    for (let i = 0; i < 40; i++) {
      const x = 4 + (Roads.hash(i, 7, 31) % (W - 8)), y = 4 + (Roads.hash(i, 11, 37) % (H - 8));
      if (clear(x, y)) add({ x, y, e: '🌳', name: 'A tree', kind: 'tree', solid: true, use: 'tree' });
    }

    /* A PELICAN CROSSING on the high street, outside the office. Each arm is
       a pole on the footway beside the lane it stops, and a stop line across
       that lane a tile short of the crossing. The lanes come off the network,
       so they cannot disagree with where the traffic actually drives. */
    const X1 = 47, X2 = 50;
    const arm = dir => {
      const y = Roads.lane(high, dir), north = y < (hg.c1 + hg.c2 + 1) / 2;
      const x = dir > 0 ? X1 - 1 : X2 + 1;
      return { g: 0, at: [x, north ? hg.c1 - 1 : hg.c2 + 1], go: dir > 0 ? 'e' : 'w', stop: [x, y] };
    };
    const signals = [{ id: 'officecross', kind: 'pelican', over: [X1, hg.c1, X2, hg.c2], arms: [arm(1), arm(-1)] }];

    /* PEDESTRIANS walk the footways. Roads.footfall() gives a ring round a
       street — up one pavement, across the end, back down the other — and no
       leg of it runs along a carriageway, which is the one rule engine/peds.js
       has about a route. */
    const WHO = [['Somebody walking a dog', 1.15], ['Somebody with shopping', .85], ['A jogger', 1.5]];
    const peds = ['mid', 'close'].map((id, i) => {
      const ring = Roads.footfall(net, id, 4 + i * 3);
      return { name: WHO[i][0], speed: WHO[i][1], leg: i % 4, along: 4 + i * 5,
        route: [ring[0], ring[1].concat(3), ring[2], ring[3].concat(2)] };
    });
    const sy = Roads.walk(high, 1);
    peds.push({ name: WHO[2][0], speed: WHO[2][1], leg: 0, along: 6,
      route: [[8.5, sy], [120.5, sy, 2], [8.5, sy, 2]] });
    /* And somebody who uses the crossing: across at the pelican, along the
       far side, and back over at it. Stepping into its box is what presses
       the button — see Signals.crossing(). */
    const ny = Roads.walk(high, -1), cx = (X1 + X2) / 2;
    peds.push({ name: 'Somebody crossing', speed: 1.1, leg: 0, along: 2,
      route: [[28.5, sy], [cx, sy, 1], [cx, ny], [72.5, ny, 3], [cx + 1, ny, 1], [cx + 1, sy]] });

    /* TRAFFIC on circuits. Roads.circuit() puts every point on the left-hand
       lane of its own leg, so a car keeps left all the way round and takes
       each corner where a car that keeps left takes it. Legs in the order
       they are driven; `leg`/`along` spread them round so they do not pull
       away in convoy. */
    const drive = (legs, o) => cars.push(Object.assign({
      x: 0, y: 0, face: 's', use: 'passingCar', traffic: true, route: Roads.circuit(net, legs)
    }, o));
    drive([{ id: 'west', dir: -1 }, { id: 'top', dir: 1 }, { id: 'east', dir: 1 }, { id: 'high', dir: -1 }],
      { model: 'hatch', name: 'A car, passing', cruise: 150, leg: 0, along: 20 });
    drive([{ id: 'high', dir: 1 }, { id: 'east', dir: -1 }, { id: 'mid', dir: -1 }, { id: 'west', dir: 1 }],
      { model: 'small', name: 'A car, passing', cruise: 120, leg: 1, along: 30 });
    drive([{ id: 'high', dir: 1 }, { id: 'east', dir: -1 }, { id: 'top', dir: -1 }, { id: 'west', dir: 1 }],
      { model: 'bus', name: 'The bus', use: 'theBus', cruise: 120, leg: 0, along: 60 });

    const MASS = solids.slice();
    return {
      name: 'The Street',
      street: true,
      indoors: false,
      w: W, h: H,
      net, rooms, surfaces, paint, cars, peds, signals,
      counters: [],
      /* Driving every leg of the loop in one go, and then every road. Zone
         ids, because out here a zone is a street — see engine/cars.js. */
      drives: [
        { ach: 'a_lap', zones: ['high', 'west', 'top', 'east'] },
        { ach: 'a_grid', zones: ['high', 'west', 'top', 'east', 'mid', 'close'] }
      ],
      entries: {
        doors: [40.5, front - .5],
        shop: [106.5, front - .5],
        fire: [OFFICE[0] - 1.5, 82.5],
        start: [40.5, front - .5]
      },
      links: [
        { via: 'officeDoor', to: 'lobby', entry: 'doors' },
        { via: 'shopDoor', to: 'shop', entry: 'door' },
        { via: 'fireDoor', to: 'floor', entry: 'fire' }
      ],
      furnish() {
        /* A room carves floor out of a map that starts solid; a building is
           the opposite, and there is no such thing as an un-room — so the
           ground is carved first and the mass is put back here. */
        for (const [x1, y1, x2, y2] of MASS)
          for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++)
            if (x >= 0 && y >= 0 && x < W && y < H) this.solid[y][x] = 1;
        objects.forEach(o => this.add(Object.assign({}, o)));
      }
    };
  }
};
LEVELS.street = Street.make();
