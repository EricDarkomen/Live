'use strict';
/* ISLA SOLANA — the outdoor level, built from rules rather than drawn.
 *
 * An island a kilometre across: a coastline worked out from a wobbling
 * ellipse, a ring of sand wherever the land meets the sea, a loop of road
 * round the middle, and everything the game is about hung off it.
 *
 *                       jungle · the hidden lagoon
 *        ┌──────────────── Hill Road ────────────────┐
 *        │   garden        plaza      yoga deck       │
 *  cove  Palm Lane                            Coconut Lane      jetty ═══⛵
 *        │                                            │
 *   ═════╧════════════ The Promenade ════════════════╧═════
 *            [The Driftwood]  [Mama Coco's]  [your hut]
 *                    Honeymoon Sands · the surf shack
 *
 * `street: true` makes this the level everybody walks out to when the bar
 * closes; `arrive: true` is where a new game starts — on the jetty, off the
 * boat, with a suitcase and a letter. */

const Island = {
  W: 128, H: 92,
  CX: 62, CY: 46, RX: 55, RY: 40,
  /* Where each road runs: `at` is the centre of the carriageway. */
  FRONT: 60, HILL: 22, WEST: 28, EAST: 96,

  land(x, y) {
    const dx = (x + .5 - this.CX) / this.RX, dy = (y + .5 - this.CY) / this.RY;
    const a = Math.atan2(dy, dx);
    const r = 1 + .06 * Math.sin(a * 3 + 1) + .04 * Math.sin(a * 5 + 2) + .025 * Math.sin(a * 11);
    return dx * dx + dy * dy < r * r;
  },

  plan() {
    if (this._plan) return this._plan;
    const g = (cls, at) => Roads.geom({ cls, at });
    const wc = g('access', this.WEST);
    return (this._plan = Roads.net([
      { id: 'front', zone: 'front', cls: 'spine', axis: 'x', at: this.FRONT, from: 16, to: 108 },
      { id: 'west', zone: 'west', cls: 'access', axis: 'y', at: this.WEST, from: this.HILL, to: this.FRONT },
      { id: 'hill', zone: 'hill', cls: 'access', axis: 'x', at: this.HILL, from: wc.c1, to: this.EAST },
      { id: 'east', zone: 'east', cls: 'access', axis: 'y', at: this.EAST, from: this.HILL, to: this.FRONT }
    ], { w: this.W, h: this.H }));
  },

  make() {
    const W = this.W, H = this.H;
    const rooms = [], surfaces = [], paint = [], objects = [], cars = [], solids = [];
    const room = (z, x1, y1, x2, y2) => rooms.push({ z, r: [x1, y1, x2, y2] });
    const surf = (s, x1, y1, x2, y2) => surfaces.push({ s, r: [x1, y1, x2, y2] });
    const add = o => objects.push(o);
    const mass = (x1, y1, x2, y2) => solids.push([x1, y1, x2, y2]);
    const taken = new Set(), key = (x, y) => x + ',' + y;
    const hard = new Set();
    const put = o => { if (taken.has(key(o.x, o.y))) return false; taken.add(key(o.x, o.y)); if (o.solid) hard.add(key(o.x, o.y)); add(o); return true; };

    /* THE COAST. Distance to the sea, by flood from every wet tile, is what
       decides sand from grass: five tiles of beach all the way round, and the
       whole south shore sand, because that is the beach the bar looks at. */
    const L = [], D = [];
    for (let y = 0; y < H; y++) { L.push([]); D.push([]); for (let x = 0; x < W; x++) { L[y].push(this.land(x, y) && x > 2 && y > 2 && x < W - 3 && y < H - 3); D[y].push(L[y][x] ? 99 : 0); } }
    const q = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!L[y][x]) q.push([x, y]);
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || D[ny][nx] <= D[y][x] + 1) continue;
        D[ny][nx] = D[y][x] + 1; q.push([nx, ny]);
      }
    }
    const zoneOf = (x, y) => {
      if (x >= 50 && x <= 70 && y >= 7 && y <= 17) return 'lagoon';
      const sandy = D[y][x] <= 5 || y >= 76;
      if (sandy) return x <= 24 && y >= 34 && y <= 58 ? 'cove' : y >= 64 ? 'sands' : 'shore';
      if (y < 18) return 'jungle';
      return 'island';
    };
    for (let y = 0; y < H; y++) {
      let run = null;
      const flush = x => { if (run) { room(run.z, run.x, y, x - 1, y); surf(run.s, run.x, y, x - 1, y); run = null; } };
      for (let x = 0; x < W; x++) {
        if (!L[y][x]) { flush(x); continue; }
        const z = zoneOf(x, y), s = (z === 'island' || z === 'jungle') ? 'grass' : 'sand';
        if (run && run.z === z) continue;
        flush(x); run = { z, s, x };
      }
      flush(W);
    }
    /* The sea is everything else: solid, and drawn as water rather than roof. */
    for (let y = 0; y < H; y++) {
      let x0 = -1;
      for (let x = 0; x <= W; x++) {
        const wet = x < W && !L[y][x];
        if (wet && x0 < 0) x0 = x;
        if (!wet && x0 >= 0) { surf('sea', x0, y, x - 1, y); x0 = -1; }
      }
    }

    /* THE ROADS, all in one call — see the note over Roads.stamp(). */
    const net = this.plan();
    Roads.stamp(net, { rooms, surfaces, paint });
    const front = Roads.byId(net, 'front'), fg = Roads.geom(front);
    const row = fg.b2 + 1;                       /* the first row south of the promenade */

    /* THE THREE DOORS ON THE PROMENADE. Each building is mass put back into
       ground the rooms carved open, fronting the road across one strip. */
    /* Their doors are on the SEA side: a beach bar opens onto the beach, and
       from up here the south face is the one you can see. */
    const BAR = [36, row + 1, 54, row + 8], SHOP = [62, row + 1, 72, row + 7], HUT = [80, row + 1, 88, row + 7];
    mass(...BAR); mass(...SHOP); mass(...HUT);
    const door = (x, y, name, use, e) => put({ x, y, e: e || '🚪', name, kind: 'exit', solid: false, use });
    door(45, BAR[3] + 1, 'The Driftwood', 'barDoor', '🍹');
    door(67, SHOP[3] + 1, 'Mama Coco’s', 'marketDoor', '🏪');
    door(84, HUT[3] + 1, 'Your beach hut', 'villaDoor', '🏠');
    put({ x: 43, y: BAR[3] + 1, e: '🪧', name: 'The Driftwood — under new management', kind: 'sign', solid: true, use: 'barSign' });
    put({ x: 48, y: BAR[3] + 1, e: '🏮', name: 'A tiki torch', kind: 'torch', solid: true, use: 'tikiTorch' });
    put({ x: 58, y: fg.b1 - 1, e: '🚏', name: 'The shuttle stop', kind: 'sign', solid: true, use: 'busStop' });

    /* INSIDE THE LOOP. */
    /* The garden: fifteen plots of red earth that were Uncle Rafa's. */
    room('garden', 34, 28, 52, 42);
    surf('track', 35, 29, 50, 38);
    [36, 39, 42, 45, 48].forEach((x, i) => [30, 33, 36].forEach((y, j) => {
      put({ x, y, e: '🟫', name: 'A garden plot', kind: 'plot', solid: true, use: 'plot', plot: 'p' + i + j });
    }));
    put({ x: 51, y: 30, e: '🛢️', name: 'The water butt', kind: 'barrels', solid: true, use: 'waterButt' });
    put({ x: 34, y: 41, e: '🧑‍🌾', name: 'The scarecrow', kind: 'misc', solid: true, use: 'scarecrow' });
    /* Where the garden's leftovers go, and where its surplus keeps. */
    put({ x: 51, y: 40, e: '🪱', name: 'The compost bin', kind: 'barrels', solid: true, use: 'compostBin' });
    put({ x: 44, y: 40, e: '🌞', name: 'The drying rack', kind: 'misc', solid: true, use: 'dryingRack' });
    /* RAFA'S YARD, behind the garden: his workbench, his kiln, his plans, and
       the building sites he pegged out and never got to — data/craft.js. A
       site is `site` (its own id, which is what the save remembers) and
       `proj` (what it becomes, from PROJECTS). */
    room('yard', 34, 44, 52, 50);
    surf('track', 35, 45, 51, 49);
    put({ x: 38, y: 45, e: '🛠️', name: 'Rafa’s workbench', kind: 'workbench', solid: true, use: 'workbench' });
    put({ x: 42, y: 45, e: '🏺', name: 'Rafa’s kiln', kind: 'kiln', solid: true, use: 'kiln' });
    put({ x: 46, y: 45, e: '📐', name: 'Rafa’s plans', kind: 'board', solid: true, use: 'plans' });
    const sites = [];
    const site = (x, y, s, proj, extra) => { sites.push({ site: s, proj }); put(Object.assign({ x, y, e: '🚧', name: 'A building site', kind: 'site', solid: true, use: 'buildSite', site: s, proj }, extra)); };
    site(50, 45, 'oven', 'oven');
    /* A fourth row of plots, `p` + column + 3, the way the first three are named. */
    [36, 39, 42, 45, 48].forEach((x, i) => site(x, 39, 'plot' + i, 'plot', { plot: 'p' + i + '3' }));
    site(52, 31, 'catcher', 'catcher');
    site(52, 40, 'bay', 'bay');
    site(47, 41, 'rack2', 'rack2');
    /* The plaza, and the fountain everybody meets at. */
    room('plaza', 56, 34, 76, 50);
    surf('slab', 56, 34, 76, 50);
    put({ x: 66, y: 42, e: '⛲', name: 'The fountain', kind: 'fountain', solid: true, use: 'fountain' });
    [[60, 38], [72, 38], [60, 46], [72, 46]].forEach(([x, y]) => put({ x, y, e: '🪑', name: 'A bench', kind: 'ironbench', solid: true, use: 'bench' }));
    [[57, 35], [75, 35], [57, 49], [75, 49]].forEach(([x, y]) => put({ x, y, e: '🌺', name: 'Bougainvillea', kind: 'flowers', solid: true, use: 'flowers' }));
    put({ x: 62, y: 36, e: '🍉', name: 'The fruit stall', kind: 'stall', solid: true, use: 'fruitStall' });
    put({ x: 70, y: 36, e: '🍦', name: 'The ice-cream cart', kind: 'stall', solid: true, use: 'iceCream' });
    put({ x: 66, y: 49, e: '📋', name: 'The island noticeboard', kind: 'board', solid: true, use: 'noticeboard' });
    /* Rosie's taco truck, parked where it has been parked for eleven years. */
    put({ x: 57, y: 43, e: '🌮', name: 'Rosie’s Taco Truck', kind: 'stall', solid: true, use: 'tacoTruck' });
    /* The yoga deck, which faces the sunrise and the people doing it. */
    room('yoga', 80, 29, 90, 38);
    surf('boards', 80, 29, 90, 38);
    put({ x: 85, y: 30, e: '🧘', name: 'The yoga mats', kind: 'towel', solid: false, use: 'yogaMats' });
    put({ x: 89, y: 37, e: '🎋', name: 'Wind chimes', kind: 'misc', solid: true, use: 'chimes' });

    /* THE JETTY, where the supply boat ties up and where you came in. */
    room('jetty', 106, 46, 124, 48);
    surf('boards', 106, 46, 124, 48);
    put({ x: 124, y: 47, e: '⛵', name: 'The supply boat', kind: 'boat', solid: true, use: 'supplyBoat' });
    put({ x: 108, y: 45, e: '📜', name: 'The order board', kind: 'board', solid: true, use: 'orderBoard' });
    put({ x: 119, y: 45, e: '🧳', name: 'Your suitcase', kind: 'misc', solid: true, use: 'suitcase' });
    /* Nico's end of the jetty, which he will tell you is not Teo's end. */
    put({ x: 122, y: 46, e: '🐟', name: 'Nico’s fish crate', kind: 'misc', solid: true, use: 'fishCrate' });

    /* LOVERS' COVE — a horseshoe of rock on the west shore and one lantern. */
    surf('rock', 6, 38, 11, 40); surf('rock', 6, 53, 11, 55);
    put({ x: 13, y: 45, e: '🏮', name: 'The cove lantern', kind: 'torch', solid: true, use: 'coveLantern' });
    put({ x: 12, y: 48, e: '🧺', name: 'A picnic blanket', kind: 'towel', solid: false, use: 'picnic' });
    /* Amara's field station: a folding table, a microscope and a lot of jars. */
    put({ x: 13, y: 51, e: '🔬', name: 'Amara’s field station', kind: 'misc', solid: true, use: 'researchKit' });

    /* THE LAGOON, which is not on the tourist map, which is the point. */
    surf('water', 55, 10, 65, 14);
    for (let y = 10; y <= 14; y++) for (let x = 55; x <= 65; x++) solids.push([x, y, x, y]);
    put({ x: 66, y: 12, e: '🪨', name: 'The diving rock', kind: 'rocks', solid: true, use: 'divingRock' });
    put({ x: 54, y: 15, e: '🌸', name: 'A frangipani', kind: 'whiteflowers', solid: true, use: 'flowers' });

    /* HONEYMOON SANDS. Parasols in pairs, a surf shack, a lifeguard. */
    for (let x = 34; x <= 92; x += 7) {
      const y = 78 + ((x / 7) & 1);
      put({ x, y, e: '⛱️', name: 'A parasol', kind: 'parasol', solid: true, use: 'parasol' });
      put({ x: x + 1, y, e: '🩴', name: 'A sun lounger', kind: 'lounger', solid: true, use: 'lounger' });
    }
    put({ x: 92, y: 76, e: '🏄', name: 'The surf shack', kind: 'surf', solid: true, use: 'surfShack' });
    put({ x: 60, y: 76, e: '🛟', name: 'The lifeguard tower', kind: 'tower', solid: true, use: 'lifeguardTower' });
    put({ x: 76, y: 81, e: '🏐', name: 'The volleyball net', kind: 'misc', solid: true, use: 'volleyball' });
    put({ x: 48, y: 82, e: '🏰', name: 'A sandcastle', kind: 'misc', solid: false, use: 'sandcastle' });
    put({ x: 32, y: 81, e: '🔥', name: 'The fire pit', kind: 'torch', solid: true, use: 'firePit' });
    /* Two pitches for cabanas, and a ladder against the bar where the roof leaks. */
    site(44, 81, 'cabana0', 'cabana');
    site(68, 81, 'cabana1', 'cabana');
    site(40, BAR[3] + 1, 'roof', 'roof');

    /* The street lights on the loop — tiki torches after dark would be nicer,
       and the network places these where no torch would be in the way. */
    Roads.lamps(net).forEach(add);

    /* TREES. Palms round the shore and along the lanes; the jungle is jungle. */
    const roadClear = (x, y) => !net.links.some(l => { const g = Roads.geom(l);
      return l.axis === 'x' ? (y >= g.b1 - 1 && y <= g.b2 + 1 && x >= l.from - 2 && x <= l.to + 2)
                            : (x >= g.b1 - 1 && x <= g.b2 + 1 && y >= l.from - 2 && y <= l.to + 2); })
      && !solids.some(b => x >= b[0] - 1 && x <= b[2] + 1 && y >= b[1] - 1 && y <= b[3] + 1)
      && !rooms.some(r => ['garden', 'yard', 'plaza', 'yoga', 'jetty'].includes(r.z) && x >= r.r[0] - 1 && x <= r.r[2] + 1 && y >= r.r[1] - 1 && y <= r.r[3] + 1);
    /* Whether something solid at x,y would wall a neighbouring tile of ground
       in on every side: floor nobody can stand on (Check.connectivity). */
    const open = (x, y) => L[y] && L[y][x] && !hard.has(key(x, y))
      && !solids.some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const seals = (x, y) => N4.some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return open(nx, ny) && !N4.some(([ex, ey]) => (nx + ex !== x || ny + ey !== y) && open(nx + ex, ny + ey));
    });
    /* WHAT THE SEA LEAVES, AND WHAT THE HILLS GIVE UP — data/craft.js. Before
       the trees, so a tree never lands on the only good bit of beach.
       Driftwood at the waterline, shells a little higher, loose stones inland,
       rock outcrops in the jungle and the wild ends of the island, and a clay
       bank at the lagoon. A pickup is not solid: it is on the ground until you
       pick it up, and gone until the tide or the rain brings another. */
    const scatter = (n, salt, where, o) => {
      for (let i = 0, got = 0; i < 4000 && got < n; i++) {
        const x = 4 + (Roads.hash(i, salt, 41) % (W - 8)), y = 4 + (Roads.hash(i, salt + 3, 43) % (H - 8));
        if (!L[y][x] || !roadClear(x, y) || !where(x, y, zoneOf(x, y)) || (o.solid && seals(x, y))) continue;
        if (put(Object.assign({ x, y }, o))) got++;
      }
    };
    const beach = z => z === 'shore' || z === 'cove' || z === 'sands';
    scatter(18, 13, (x, y, z) => beach(z) && D[y][x] <= 2, { e: '🥢', name: 'Driftwood', kind: 'pickup', solid: false, use: 'driftwood' });
    scatter(12, 19, (x, y, z) => beach(z) && D[y][x] <= 4 && D[y][x] >= 2, { e: '🐚', name: 'Shells in the sand', kind: 'pickup', solid: false, use: 'shells' });
    scatter(12, 29, (x, y, z) => (z === 'island' || z === 'jungle') && D[y][x] > 5, { e: '🪨', name: 'Loose stones', kind: 'pickup', solid: false, use: 'stones' });
    scatter(10, 37, (x, y, z) => D[y][x] > 6 && (z === 'jungle' || (z === 'island' && (x < 24 || x > 100))),
      { e: '🪨', name: 'A rock outcrop', kind: 'rocks', solid: true, use: 'outcrop' });
    [[53, 11], [58, 15], [67, 14]].forEach(([x, y]) => put({ x, y, e: '🟤', name: 'The clay bank', kind: 'rocks', solid: true, use: 'clayBank' }));

    for (let i = 0; i < 900; i++) {
      const x = 4 + (Roads.hash(i, 7, 31) % (W - 8)), y = 4 + (Roads.hash(i, 11, 37) % (H - 8));
      if (!L[y][x] || !roadClear(x, y) || seals(x, y)) continue;
      const z = zoneOf(x, y);
      if (z === 'sands' && y > 74) continue;                       /* keep the beach for lying on */
      if (z === 'lagoon' && x >= 53 && x <= 67 && y >= 9 && y <= 15) continue;
      const jungle = z === 'jungle' || z === 'lagoon';
      if (!jungle && Roads.hash(i, 3, 5) % 3) continue;             /* sparse outside the jungle */
      const palm = !jungle || Roads.hash(i, 5, 9) % 2;
      put(palm ? { x, y, e: '🌴', name: 'A palm', kind: 'palm', solid: true, use: 'palm' }
               : { x, y, e: '🌳', name: 'A tree', kind: 'tree', solid: true, use: 'tree' });
    }

    /* PEOPLE WALKING. Round the lanes on the footways, and along the sand. */
    const WHO = [['A tourist with a map', .9], ['Somebody jogging', 1.5], ['A couple, holding hands', .7]];
    const peds = ['west', 'hill'].map((id, i) => {
      const ring = Roads.footfall(net, id, 4 + i * 3);
      return { name: WHO[i * 2][0], speed: WHO[i * 2][1], leg: i % 4, along: 4 + i * 5,
        route: [ring[0], ring[1].concat(3), ring[2], ring[3].concat(2)] };
    });
    const sy = Roads.walk(front, 1);
    peds.push({ name: WHO[1][0], speed: WHO[1][1], leg: 0, along: 6, route: [[18.5, sy], [106.5, sy, 2], [18.5, sy, 2]] });
    peds.push({ name: 'Somebody with a surfboard', speed: 1, leg: 0, along: 2, route: [[34.5, 84.5], [90.5, 84.5, 4], [34.5, 84.5, 3]] });
    peds.push({ name: 'A couple, holding hands', speed: .7, leg: 0, along: 10, route: [[40.5, 75.5], [88.5, 75.5, 5], [40.5, 75.5, 5]] });

    /* TRAFFIC. The island shuttle, a taxi, and a jeep full of people who
       have just discovered the shuttle does not stop at the bar. */
    const drive = (legs, o) => cars.push(Object.assign({
      x: 0, y: 0, face: 's', use: 'passingCar', traffic: true, route: Roads.circuit(net, legs)
    }, o));
    drive([{ id: 'west', dir: -1 }, { id: 'hill', dir: 1 }, { id: 'east', dir: 1 }, { id: 'front', dir: -1 }],
      { model: 'jeep', name: 'A jeep full of tourists', cruise: 130, leg: 0, along: 20 });
    drive([{ id: 'front', dir: 1 }, { id: 'east', dir: -1 }, { id: 'hill', dir: -1 }, { id: 'west', dir: 1 }],
      { model: 'taxi', name: 'The island taxi', cruise: 120, leg: 1, along: 30 });
    drive([{ id: 'front', dir: 1 }, { id: 'east', dir: -1 }, { id: 'hill', dir: -1 }, { id: 'west', dir: 1 }],
      { model: 'bus', name: 'The island shuttle', use: 'theBus', cruise: 110, leg: 0, along: 70 });
    /* Yours: the beach buggy, parked by the hut. */
    cars.push({ x: 91.5, y: 52.5, face: 'n', model: 'buggy', name: 'Your beach buggy', use: 'buggy', drive: true });
    cars.push({ x: 33.5, y: 52.5, face: 'n', model: 'convertible', name: 'Somebody’s convertible', use: 'parkedCar' });

    const MASS = solids.slice();
    return {
      name: 'Isla Solana',
      street: true,
      arrive: true,
      indoors: false,
      w: W, h: H,
      net, rooms, surfaces, paint, cars, peds, signals: [],
      /* Every building site and what it becomes, for Rafa's plans. */
      sites,
      counters: [],
      roofs: [{ m: ['pantile', 'pantile', 'pantile', 'oxblood'], r: [0, 0, W - 1, H - 1] }],
      drives: [
        { ach: 'a_lap', zones: ['front', 'west', 'hill', 'east'] }
      ],
      entries: {
        bar: [45.5, BAR[3] + 1.5],
        market: [67.5, SHOP[3] + 1.5],
        villa: [84.5, HUT[3] + 1.5],
        doors: [45.5, BAR[3] + 1.5],
        start: [118.5, 47.5]
      },
      streetEntry: 'bar',
      links: [
        { via: 'barDoor', to: 'bar', entry: 'door' },
        { via: 'marketDoor', to: 'market', entry: 'door' },
        { via: 'villaDoor', to: 'villa', entry: 'door' }
      ],
      furnish() {
        for (const [x1, y1, x2, y2] of MASS)
          for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++)
            if (x >= 0 && y >= 0 && x < W && y < H) this.solid[y][x] = 1;
        objects.forEach(o => this.add(Object.assign({}, o)));
      }
    };
  }
};
LEVELS.island = Island.make();
