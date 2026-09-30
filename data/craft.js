'use strict';
/* THE WORKSHOP — gathering, woodcutting, mining, crafting and building.
 *
 * Rafa did not only grow things. Behind the garden is his yard: a workbench,
 * a kiln, and a board of plans he never got round to. This is everything that
 * turns the island itself into materials, and materials into things:
 *
 *   Gathering    by hand. Driftwood and shells wash up on every beach, loose
 *                stones lie about inland, palms drop fronds, jungle trees
 *                have vines to strip, and the lagoon has a clay bank.
 *   Woodcutting  with an axe. Fell a palm or a jungle tree for timber; it
 *                leaves a stump that grows back in a couple of days.
 *   Mining       with a pickaxe. Rock outcrops in the jungle and the hills
 *                give stone, and now and then iron ore or clay.
 *   Crafting     at the workbench (planks, rope, nails, tools, goods) and the
 *                kiln (charcoal, bricks, iron, tiki mugs — on a timer).
 *   Building     at the building sites marked 🚧 round the island, from
 *                Rafa's plans: more garden, a rain catcher, a second compost
 *                bay, a bigger drying rack, a brick oven, the bar roof, and
 *                beach cabanas that rent to tourists.
 *
 * Every trade levels with practice (TRADES): a higher level is a quicker job,
 * less tiring, with a better chance of a bonus find. Tools wear out.
 *
 * Like the farm, everything keeps its state in G.flags, which the save
 * carries, and tells time in island minutes (islandNow() in data/garden.js).
 * The objects themselves are placed by data/island.js; pressing E on them
 * lands in data/acts.js, which hands straight on to here. */

/* ---------------- The trades ---------------- */
const TRADES = {
  gather: { n: 'Beachcombing', e: '🐚', d: 'Picking up what the island leaves lying about.' },
  wood: { n: 'Woodcutting', e: '🪓', d: 'Felling palms and jungle trees for timber.' },
  mine: { n: 'Mining', e: '⛏️', d: 'Breaking rock for stone, clay and iron ore.' },
  craft: { n: 'Craftsmanship', e: '🛠️', d: 'The workbench, the kiln, and building from Rafa’s plans.' },
};
const TRADE_MAX = 10;
/* Experience for a level: 15·(L−1)² — level 2 at 15, level 5 at 240, 10 at 1215. */
const tradeXp = L => 15 * (L - 1) * (L - 1);

/* ---------------- Tools ----------------
   kind   what job it does · tier   iron beats stone · uses   before it breaks */
const TOOLS = {
  stone_axe: { kind: 'axe', tier: 1, uses: 30 },
  iron_axe: { kind: 'axe', tier: 2, uses: 90 },
  stone_pick: { kind: 'pick', tier: 1, uses: 30 },
  iron_pick: { kind: 'pick', tier: 2, uses: 90 },
};

/* ---------------- What the island gives ----------------
   trade    which trade it trains · tool   needed to do it at all
   mins     island minutes it takes · energy   what it costs you
   uses     how many times before it is spent · regrow   minutes until it is back
   gives    [item, min, max] — the first is the main yield
   extra    [item, chance] — rolled once each, a lucky find
   hide     a pickup: gone from the ground until it comes back */
const NODES = {
  driftwood: { n: 'Driftwood', trade: 'gather', mins: 3, energy: 2, uses: 1, regrow: 600, xp: 3, hide: true,
    gives: [['sticks', 1, 2]], extra: [['shells', .3], ['sea_glass', .05]] },
  shells: { n: 'Shells', trade: 'gather', mins: 4, energy: 2, uses: 1, regrow: 720, xp: 3, hide: true,
    gives: [['shells', 1, 3]], extra: [['sea_glass', .14]] },
  stones: { n: 'Loose stones', trade: 'gather', mins: 3, energy: 3, uses: 1, regrow: 900, xp: 3, hide: true,
    gives: [['stone', 1, 2]], extra: [['ore', .04]] },
  claybank: { n: 'The clay bank', trade: 'gather', mins: 8, energy: 6, uses: 3, regrow: 600, xp: 5,
    gives: [['clay', 1, 2]], extra: [['stone', .3]] },
  frond: { n: 'Palm fronds', trade: 'gather', mins: 4, energy: 3, uses: 2, regrow: 720, xp: 2,
    gives: [['frond', 1, 1]], extra: [] },
  vines: { n: 'Vines', trade: 'gather', mins: 5, energy: 3, uses: 2, regrow: 720, xp: 3,
    gives: [['fibre', 1, 2]], extra: [] },
  chop_palm: { n: 'A palm', trade: 'wood', tool: 'axe', mins: 15, energy: 10, uses: 1, regrow: 2880, xp: 10, fell: true,
    gives: [['log', 1, 2], ['frond', 1, 2]], extra: [['coconut', .3]] },
  chop_tree: { n: 'A jungle tree', trade: 'wood', tool: 'axe', mins: 20, energy: 12, uses: 1, regrow: 3600, xp: 14, fell: true,
    gives: [['log', 2, 3], ['fibre', 0, 1]], extra: [] },
  outcrop: { n: 'A rock outcrop', trade: 'mine', tool: 'pick', mins: 15, energy: 12, uses: 4, regrow: 1440, xp: 12,
    gives: [['stone', 2, 3]], extra: [['ore', .28], ['clay', .12], ['sea_glass', .02]] },
};
/* Which node an object's `use` is, for the refresh below. */
const NODE_OF_USE = { driftwood: 'driftwood', shells: 'shells', stones: 'stones', clayBank: 'claybank', outcrop: 'outcrop' };

/* ---------------- The workbench ----------------
   cat   which drawer it is in · n   how many you make · lvl   Craftsmanship
   needed · mins   how long it takes */
const WORKBENCH = [
  { out: 'plank', n: 2, in: { log: 1 }, cat: 'mat', mins: 10, xp: 5 },
  { out: 'rope', n: 1, in: { fibre: 3 }, cat: 'mat', mins: 8, xp: 4 },
  { out: 'rope', n: 1, in: { frond: 3 }, cat: 'mat', mins: 10, xp: 4 },
  { out: 'nails', n: 8, in: { iron: 1 }, cat: 'mat', mins: 10, xp: 6, lvl: 2 },
  { out: 'stone_axe', n: 1, in: { sticks: 2, stone: 2, rope: 1 }, cat: 'tool', mins: 15, xp: 10 },
  { out: 'stone_pick', n: 1, in: { sticks: 2, stone: 3, rope: 1 }, cat: 'tool', mins: 15, xp: 10 },
  { out: 'iron_axe', n: 1, in: { plank: 1, iron: 2, rope: 1 }, cat: 'tool', mins: 25, xp: 18, lvl: 3 },
  { out: 'iron_pick', n: 1, in: { plank: 1, iron: 3, rope: 1 }, cat: 'tool', mins: 25, xp: 18, lvl: 3 },
  { out: 'shell_chime', n: 1, in: { shells: 4, rope: 1, sticks: 1 }, cat: 'goods', mins: 15, xp: 8 },
];
const BENCH_CATS = { mat: 'Materials', tool: 'Tools', goods: 'Things to sell' };

/* ---------------- The kiln ----------------
   Two batches at a time, on a timer — it keeps firing whatever the weather. */
const KILN = {
  slots: 2,
  recipes: [
    { out: 'charcoal', n: 2, in: { log: 1 }, t: 45, xp: 5 },
    { out: 'brick', n: 3, in: { clay: 2, charcoal: 1 }, t: 60, xp: 8 },
    { out: 'tiki_mug', n: 1, in: { clay: 2, sticks: 1 }, t: 50, xp: 8 },
    { out: 'iron', n: 1, in: { ore: 2, charcoal: 2 }, t: 90, xp: 12, lvl: 2 },
  ]
};

/* ---------------- The brick oven (once it is built) ---------------- */
const OVEN = [
  { out: 'grilled_fish', in: { fish: 1, lime: 1, sticks: 1 } },
  { out: 'coconut_bread', in: { coconut: 1, sticks: 1 } },
  { out: 'grilled_fish', in: { fish: 1, charcoal: 1 } },
];

/* ---------------- Rafa's plans ----------------
   What each building site can become. `cost` is taken when you build;
   `lvl` is the Craftsmanship it needs; `mins` how long it takes. What it
   becomes on the ground is `as` — the object's new look and handler. */
const PROJECTS = {
  plot: { n: 'A new garden plot', e: '🟫', cost: { sticks: 4, stone: 4 }, lvl: 1, mins: 30,
    d: 'Clear the scrub, edge it with stones, and turn the earth over. One more plot for Rafa’s garden.',
    as: { kind: 'plot', use: 'plot', e: '🟫', name: 'A garden plot' } },
  catcher: { n: 'A rain catcher', e: '☔', cost: { plank: 4, frond: 4, rope: 2 }, lvl: 2, mins: 45,
    d: 'A frond-thatched funnel over the water butt. The butt holds twice as much and fills twice as fast in the rain.',
    as: { kind: 'misc', use: 'rainCatcher', e: '☔', name: 'The rain catcher' } },
  bay: { n: 'A second compost bay', e: '🪱', cost: { plank: 6, nails: 8 }, lvl: 2, mins: 40,
    d: 'Another slatted box beside the first. Two more batches of compost on the go at once.',
    as: { kind: 'barrels', use: 'compostBin', e: '🪱', name: 'The second compost bay' } },
  rack2: { n: 'A bigger drying rack', e: '🌞', cost: { plank: 4, rope: 2, sticks: 4 }, lvl: 2, mins: 40,
    d: 'A second mesh frame in the sun. Three more things drying at once.',
    as: { kind: 'misc', use: 'dryingRack', e: '🌞', name: 'The second drying rack' } },
  oven: { n: 'A brick oven', e: '🧱', cost: { brick: 12, stone: 6, iron: 1 }, lvl: 3, mins: 90,
    d: 'A domed wood-fired oven in the yard. Grill Nico’s fish, bake coconut bread — food that fills you and does not go off.',
    as: { kind: 'kiln', use: 'oven', e: '🍞', name: 'The brick oven' } },
  cabana: { n: 'A beach cabana', e: '🛖', cost: { log: 6, frond: 8, rope: 3, plank: 4 }, lvl: 3, mins: 120,
    d: 'A thatched shade on Honeymoon Sands with two loungers under it. Tourists rent it by the day.',
    as: { kind: 'cabana', use: 'cabana', e: '🛖', name: 'Your beach cabana' } },
  roof: { n: 'Fix The Driftwood’s roof', e: '🪜', cost: { plank: 10, nails: 16, frond: 8 }, lvl: 4, mins: 150,
    d: 'New battens and fresh thatch over the leak Rafa kept a bucket under for nine years. Guests who are not being dripped on tip better.',
    as: { kind: 'misc', use: 'roofLadder', e: '🪜', name: 'Rafa’s ladder' } },
};
/* What a cabana pays each morning, and how much more a guest tips under a roof
   that does not leak. */
const CABANA_RENT = 18, ROOF_TIPS = 1.15;

const roll = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const costWords = inp => Object.keys(inp).map(k => inp[k] + ' ' + ITEMS[k].e).join(' + ');
const canPay = inp => Object.keys(inp).every(k => bag(k) >= inp[k]);
const pay = inp => { for (const k in inp) bagTake(k, inp[k]); };

/* ---------------- Tools you carry ----------------
   Gear rather than Tools: editor/tools.js is `Tools`, and the editor loads
   this file into the same page — two consts of one name and it will not boot. */
const Gear = {
  wear() { return (G.flags.wear = G.flags.wear || {}); },
  /* The best one of a kind in your bag, or null. */
  best(kind) {
    let best = null;
    for (const id in TOOLS) if (TOOLS[id].kind === kind && Item.has(id) && (!best || TOOLS[id].tier > TOOLS[best].tier)) best = id;
    if (best && this.wear()[best] === undefined) this.wear()[best] = TOOLS[best].uses;
    return best;
  },
  left(id) { const w = this.wear()[id]; return w === undefined ? TOOLS[id].uses : w; },
  use(id) {
    const w = this.wear();
    w[id] = this.left(id) - 1;
    if (w[id] <= 0) {
      Item.take(id); delete w[id];
      Sfx.deny && Sfx.deny();
      UI.toast(ITEMS[id].e, 'Your <b>' + ITEMS[id].n + '</b> has had it. The head flies off into a bush. Make another at the workbench.', 'bad');
    } else if (w[id] === 5) UI.toast(ITEMS[id].e, 'Your ' + ITEMS[id].n.toLowerCase() + ' is wobbling. Five more jobs, maybe.');
  },
  words(kind) { return kind === 'axe' ? 'an axe' : 'a pickaxe'; }
};

const Craft = {
  later(f) { setTimeout(f, 40); },

  /* ---- trades ---- */
  xp(tr) { const t = G.flags.trades || {}; return t[tr] || 0; },
  level(tr) { const x = this.xp(tr); let L = 1; while (L < TRADE_MAX && x >= tradeXp(L + 1)) L++; return L; },
  train(tr, n) {
    const t = (G.flags.trades = G.flags.trades || {});
    const was = this.level(tr);
    t[tr] = (t[tr] || 0) + n;
    const now = this.level(tr);
    if (now > was) {
      UI.toast(TRADES[tr].e, '<b>' + TRADES[tr].n + '</b> is now level ' + now + '. Quicker, and less tiring.', 'gold');
      FX.burst(P.x, P.y, '⭐', 10, '#ffb347');
      if (Object.keys(TRADES).every(k => this.level(k) >= 3)) Ach.get('a_trades');
    }
  },

  /* ---- the state of one node ----
     Keyed by what is being done to which tile, so a palm can be stripped of
     fronds and felled on separate clocks. `n` is how many times it has been
     used since `at`; once `regrow` minutes have passed since then it is whole
     again. Nothing is kept for a node nobody has touched. */
  nodes() { return (G.flags.nodes = G.flags.nodes || {}); },
  key(o, type) { return type + ':' + o.x + ',' + o.y; },
  left(o, type) {
    const N = NODES[type], s = this.nodes()[this.key(o, type)];
    if (!s) return N.uses;
    if (islandNow() - s.at >= N.regrow) { delete this.nodes()[this.key(o, type)]; return N.uses; }
    return Math.max(0, N.uses - s.n);
  },
  back(o, type) { const s = this.nodes()[this.key(o, type)]; return s ? Math.max(1, NODES[type].regrow - (islandNow() - s.at)) : 0; },
  spend(o, type) {
    const k = this.key(o, type), s = this.nodes()[k];
    this.nodes()[k] = { n: (s ? s.n : 0) + 1, at: islandNow() };
  },
  felled(o) { return this.left(o, o.use === 'palm' ? 'chop_palm' : 'chop_tree') <= 0; },

  /* ---- doing the work ---- */
  work(o, type) {
    const N = NODES[type];
    this.intro();
    if (this.left(o, type) <= 0) { UI.toast('🤷', 'Nothing more to get here for now. Come back in ' + clockDur(this.back(o, type)) + '.'); return; }
    const tool = N.tool ? Gear.best(N.tool) : null;
    if (N.tool && !tool) { Sfx.deny && Sfx.deny(); UI.toast('🛠️', 'You need ' + Gear.words(N.tool) + ' for that. Make one at Rafa’s workbench, behind the garden.'); return; }
    const lvl = this.level(N.trade), tier = tool ? TOOLS[tool].tier : 0;
    const energy = Math.max(1, Math.round(N.energy * (1 - lvl * .04) * (tier === 2 ? .8 : 1)));
    if (P.energy < energy) { Sfx.deny && Sfx.deny(); UI.toast('😮‍💨', 'You are too worn out for that. Eat something, have a coffee, or sleep on it.', 'bad'); return; }
    G.minutes += Math.max(1, Math.round(N.mins * (1 - lvl * .05) * (tier === 2 ? .7 : 1)));
    Player.mod({ energy: -energy });
    /* The haul: the main yield, better with a better tool and, now and then,
       with practice; then whatever else turns up. */
    const got = {};
    const add = (id, n) => { if (n > 0) got[id] = (got[id] || 0) + n; };
    N.gives.forEach(([id, a, b], i) => add(id, roll(a, b) + (i === 0 && tier === 2 ? 1 : 0) + (i === 0 && chance(lvl * .05) ? 1 : 0)));
    N.extra.forEach(([id, p]) => { if (chance(p * (1 + lvl * .08) * (tier === 2 ? 1.3 : 1))) add(id, 1); });
    for (const id in got) for (let i = 0; i < got[id]; i++) Item.give(id, true);
    this.spend(o, type);
    if (tool) Gear.use(tool);
    this.train(N.trade, N.xp);
    Player.xp(Math.ceil(N.xp / 2));
    const first = Object.keys(got)[0];
    FX.burst(P.x, P.y, first ? ITEMS[first].e : '✨', N.fell ? 12 : 6);
    if (N.fell && FX.shake) FX.shake(5);
    Sfx.blip && Sfx.blip();
    const words = Object.keys(got).map(k => got[k] + ' × ' + ITEMS[k].n).join(', ');
    UI.toast(first ? ITEMS[first].e : '🤷', (N.fell ? '<b>Timber!</b> ' : '') + (words ? 'Got ' + words + '.' : 'Nothing worth keeping this time.'), words ? 'gold' : '');
    /* The achievements and the job. */
    if (N.fell) Ach.get('a_timber');
    if (got.ore) Ach.get('a_ore');
    if (got.sea_glass) Ach.get('a_glass');
    if (bag('sticks') >= 2 && bag('stone') >= 2) qTo('q_build', 1);
    if (N.fell) qTo('q_build', 3);
    this.refresh();
  },

  /* ---- keeping the ground looking like its state ----
     Cheap: one pass over the island's objects a second, and it only changes an
     object when what it should look like has changed. */
  refresh() {
    if (typeof World === 'undefined' || World.level !== 'island' || !World.objects) return;
    for (const o of World.objects) {
      if (o.use === 'palm' || o.use === 'tree') {
        const down = this.felled(o);
        if (down && !o.was) {
          o.was = { kind: o.kind, e: o.e, name: o.name, fdef: o.fdef };
          o.kind = 'stump'; o.e = '🪵'; o.name = 'A stump';
          o.fdef = Object.assign({}, FURN.stump);
          delete o._foot;           /* Collide caches the footprint on the object */
        } else if (!down && o.was) {
          Object.assign(o, o.was); delete o.was; delete o._foot;
        }
        continue;
      }
      const type = NODE_OF_USE[o.use];
      if (!type) continue;
      const left = this.left(o, type);
      if (NODES[type].hide) o.gone = left <= 0;
      else if (type === 'outcrop') o.name = left > 0 ? 'A rock outcrop' : 'A rock outcrop, picked clean';
      else if (type === 'claybank') o.name = left > 0 ? 'The clay bank' : 'The clay bank, dug out';
    }
    Build.refresh();
  },

  /* ---- the job that introduces all this ---- */
  intro() {
    if (G.quests && !G.quests.q_build) Q.start('q_build');
    G.flags.workshop = true;
  },

  /* ---- the clock: rent, and Mari's nudge on the second morning ---- */
  update() {
    if (typeof G === 'undefined' || !G.flags || G.state === 'title' || G.state === 'name') return;
    if (G.day >= 2 && !G.flags.workshop && G.minutes % 1440 >= DAY_START) {
      this.intro();
      UI.toast('💃', 'Mari: “Rafa’s yard is behind the garden — his workbench, his kiln, and a board of plans he never finished. The shore is covered in driftwood. Just saying.”');
    }
    if (G.flags.rentDay !== G.day) {
      const had = G.flags.rentDay !== undefined;
      G.flags.rentDay = G.day;
      const built = Build.built(), n = Object.keys(built).filter(k => k.startsWith('cabana') && built[k] < G.day).length;
      if (had && n) {
        Player.mod({ money: CABANA_RENT * n, rep: n });
        UI.toast('🛖', 'Your cabana' + (n > 1 ? 's were' : ' was') + ' rented out on Honeymoon Sands today: <b>' + cash(CABANA_RENT * n) + '</b>.', 'gold');
      }
    }
  },

  /* ---------------- The workbench ---------------- */
  bench() {
    this.intro();
    const lvl = this.level('craft');
    insp('🛠️', 'Rafa’s workbench', 'Craftsmanship ' + lvl, [
      'A scarred bench with a vice, a saw missing three teeth, a coffee tin of bent nails, and RAFA carved into the leg in letters a foot high.',
      'What are you making?'],
      Object.keys(BENCH_CATS).map(c => {
        const ready = WORKBENCH.filter(r => r.cat === c && this.benchOk(r)).length;
        return { t: BENCH_CATS[c] + '…' + (ready ? ' (' + ready + ' you can make)' : ''), to: null, do: () => this.later(() => this.benchMenu(c)) };
      }).concat([
        { t: 'Look at Rafa’s plans.', to: null, do: () => this.later(() => Build.plans()) },
        { t: 'Leave it.', to: null }]));
  },
  benchOk(r) { return canPay(r.in) && this.level('craft') >= (r.lvl || 1) && !(TOOLS[r.out] && Item.has(r.out)); },
  benchMenu(cat) {
    const lvl = this.level('craft');
    const list = WORKBENCH.filter(r => r.cat === cat);
    const lines = [list.map(r => ITEMS[r.out].e + ' ' + ITEMS[r.out].n + (r.n > 1 ? ' ×' + r.n : '') + ' — ' + costWords(r.in)
      + ((r.lvl || 1) > lvl ? ' (Craftsmanship ' + r.lvl + ')' : '')).join(' · ')];
    if (cat === 'tool') lines.push('An axe fells trees, a pickaxe breaks rock. Iron lasts three times as long and works faster. You can only carry one of each.');
    insp('🛠️', 'Rafa’s workbench', BENCH_CATS[cat], lines,
      list.filter(r => this.benchOk(r)).map(r => ({
        t: 'Make ' + (r.n > 1 ? r.n + ' × ' : '') + ITEMS[r.out].n.toLowerCase() + ' — ' + costWords(r.in) + '.', to: null, do: () => this.make(r, cat)
      })).concat([{ t: 'Back.', to: null, do: () => this.later(() => this.bench()) }, { t: 'Leave it.', to: null }]));
  },
  make(r, cat) {
    pay(r.in);
    for (let i = 0; i < r.n; i++) Item.give(r.out, true);
    if (TOOLS[r.out]) Gear.wear()[r.out] = TOOLS[r.out].uses;
    G.minutes += Math.max(2, Math.round(r.mins * (1 - this.level('craft') * .05)));
    this.train('craft', r.xp);
    Player.xp(3);
    Sfx.blip && Sfx.blip();
    FX.burst(P.x, P.y, ITEMS[r.out].e, 8);
    UI.toast(ITEMS[r.out].e, 'Made ' + (r.n > 1 ? r.n + ' × ' : 'a ') + '<b>' + ITEMS[r.out].n + '</b>.', 'gold');
    G.flags.crafted = (G.flags.crafted || 0) + 1;
    if (TOOLS[r.out]) qTo('q_build', 2);
    /* Straight back to the same drawer: making six planks is six presses, not
       eighteen. */
    this.later(() => this.benchMenu(cat));
  },

  /* ---------------- The kiln ---------------- */
  kiln() {
    this.intro();
    const now = islandNow(), k = (G.flags.kiln = G.flags.kiln || []);
    const ready = k.filter(x => x.done <= now), lvl = this.level('craft');
    const lines = ['A squat clay dome with a chimney, still black from Rafa’s last firing. Charcoal from timber, bricks and mugs from clay, and — if you know what you are doing — iron from ore.',
      k.length ? k.map(x => x.n + ' × ' + ITEMS[x.out].n + (x.done <= now ? ', done.' : ', ' + clockDur(x.done - now) + ' to go.')).join(' ') : 'It is cold. A lizard lives in the chimney and would like it to stay that way.',
      KILN.recipes.map(r => ITEMS[r.out].e + ' ' + r.n + ' × ' + ITEMS[r.out].n + ' — ' + costWords(r.in) + ', ' + clockDur(r.t) + ((r.lvl || 1) > lvl ? ' (Craftsmanship ' + r.lvl + ')' : '')).join(' · ')];
    const ch = [];
    if (ready.length) ch.push({ t: 'Take out what’s fired (' + ready.length + ').', to: null, do: () => {
      G.flags.kiln = k.filter(x => x.done > now);
      ready.forEach(x => { for (let i = 0; i < x.n; i++) Item.give(x.out, true); this.train('craft', x.xp || 6); });
      Player.xp(4 * ready.length);
      UI.toast('🏺', 'Out of the kiln: ' + ready.map(x => x.n + ' × ' + ITEMS[x.out].n).join(', ') + '.', 'gold');
    } });
    if (k.length < KILN.slots) KILN.recipes.filter(r => canPay(r.in) && lvl >= (r.lvl || 1)).forEach(r => ch.push({
      t: 'Fire ' + r.n + ' × ' + ITEMS[r.out].n.toLowerCase() + ' — ' + costWords(r.in) + ', ' + clockDur(r.t * (1 - lvl * .04)) + '.', to: null, do: () => {
        pay(r.in);
        const t = Math.round(r.t * (1 - lvl * .04));
        k.push({ out: r.out, n: r.n, xp: r.xp, t, done: now + t });
        G.minutes += 5;
        UI.toast('🔥', 'The kiln roars. ' + ITEMS[r.out].n + ' in about ' + clockDur(t) + '.');
      } }));
    ch.push({ t: 'Leave it.', to: null });
    insp('🏺', 'Rafa’s kiln', k.length + '/' + KILN.slots + ' firing', lines, ch);
  },

  /* ---------------- The brick oven ---------------- */
  oven() {
    const ok = OVEN.filter(r => canPay(r.in));
    insp('🍞', 'The brick oven', 'Yours, and warm', ['The dome ticks as it heats. It smells of woodsmoke and, faintly, of everything that has ever been cooked in it, which is not much yet.',
      'Recipes: ' + OVEN.map(r => ITEMS[r.out].n + ' (' + costWords(r.in) + ')').join(' · ')],
      ok.map(r => ({ t: 'Cook ' + ITEMS[r.out].n.toLowerCase() + ' — ' + costWords(r.in) + '.', to: null, do: () => {
        pay(r.in); Item.give(r.out, true); G.minutes += 15;
        this.train('craft', 4); Player.xp(3);
        FX.burst(P.x, P.y, ITEMS[r.out].e, 8);
        UI.toast(ITEMS[r.out].e, 'Out of the oven: <b>' + ITEMS[r.out].n + '</b>. It will keep.', 'gold');
      } })).concat([{ t: 'Leave it.', to: null }]));
  },

  /* ---------------- The Workshop tab ---------------- */
  panel() {
    this.update();
    const now = islandNow();
    const bar = (v, cls) => '<span class="mb' + (cls ? ' ' + cls : '') + '"><i style="width:' + Math.round(clamp(v, 0, 100)) + '%"></i></span>';
    let h = '<div class="h2">Trades</div><div class="farm-sum">';
    for (const tr in TRADES) {
      const L = this.level(tr), x = this.xp(tr);
      const lo = tradeXp(L), hi = tradeXp(L + 1);
      h += '<div class="fs" title="' + esc(TRADES[tr].d) + '"><span>' + TRADES[tr].e + ' ' + esc(TRADES[tr].n) + '</span><b>Level ' + L + (L >= TRADE_MAX ? ' · master' : '') + '</b>'
        + bar(L >= TRADE_MAX ? 100 : (x - lo) / (hi - lo) * 100, 'grow') + '</div>';
    }
    h += '</div>';
    /* Tools. */
    const tools = Object.keys(TOOLS).filter(id => Item.has(id));
    h += '<div class="h2">Tools</div><div class="farm-prod">' + (tools.length ? tools.map(id => {
      const l = Gear.left(id);
      return '<div class="fst"><b>' + ITEMS[id].e + ' ' + esc(ITEMS[id].n) + '</b><span>' + l + '/' + TOOLS[id].uses + ' jobs left</span>' + bar(l / TOOLS[id].uses * 100, l <= 5 ? 'bad' : '') + '</div>';
    }).join('') : '<div class="fst"><b>🤲 Just your hands</b><span>Make an axe and a pickaxe at Rafa’s workbench, in the yard behind the garden: 2 🥢 + 2–3 🪨 + 1 🪢.</span></div>') + '</div>';
    /* Materials. */
    const mats = MATERIALS.filter(id => bag(id));
    h += '<div class="h2">Materials</div>' + (mats.length
      ? '<div class="ws-mats">' + mats.map(id => '<div class="wm" title="' + esc(ITEMS[id].d) + '"><span class="fe">' + ITEMS[id].e + '</span><b>' + bag(id) + '</b><span>' + esc(ITEMS[id].n) + '</span></div>').join('') + '</div>'
      : '<p class="idesc">Nothing yet. Driftwood and shells wash up on every beach; loose stones lie about inland; palms have fronds and jungle trees have vines.</p>');
    /* The kiln. */
    const k = G.flags.kiln || [];
    h += '<div class="h2">Production</div><div class="farm-prod"><div class="fst"><b>🏺 Rafa’s kiln</b><span>' + k.length + '/' + KILN.slots + ' firing</span>'
      + k.map(x => { const t = x.t || KILN.recipes.find(q => q.out === x.out).t; return '<div class="fq">' + ITEMS[x.out].e + ' ' + x.n + ' × ' + esc(ITEMS[x.out].n) + ' · ' + (x.done <= now ? '✅ ready' : '⏳ ' + clockDur(x.done - now)) + bar(clamp(1 - (x.done - now) / t, 0, 1) * 100, 'grow') + '</div>'; }).join('') + '</div>';
    const cab = Object.keys(Build.built()).filter(s => s.startsWith('cabana')).length;
    if (cab) h += '<div class="fst"><b>🛖 Beach cabanas</b><span>' + cab + ' built · ' + cash(CABANA_RENT * cab) + ' a day in rent, paid each morning</span></div>';
    h += '</div>';
    /* Rafa's plans. */
    h += '<div class="h2">Rafa’s plans</div><div class="farm-prod">';
    for (const p in PROJECTS) {
      const P2 = PROJECTS[p], sites = Build.sites(p), done = sites.filter(s => Build.has(s)).length;
      const lvlOk = this.level('craft') >= P2.lvl;
      h += '<div class="fst"><b>' + P2.e + ' ' + esc(P2.n) + (sites.length > 1 ? ' · ' + done + '/' + sites.length : '') + '</b>'
        + '<span>' + esc(P2.d) + '</span>'
        + '<div class="fq">' + (done >= sites.length ? '✅ Built' : costWords(P2.cost) + (lvlOk ? '' : ' · <i>needs Craftsmanship ' + P2.lvl + '</i>')) + '</div></div>';
    }
    h += '</div><p class="idesc farm-key">Look for the 🚧 building sites: in the garden, in the yard, on the Promenade by the bar, and on Honeymoon Sands. Every job takes time and energy — eat, and sleep. Tools wear out. Wind chimes, tiki mugs and sea glass sell to Teo at the supply boat, or better, to an order.</p>';
    return h;
  }
};
/* The things this is all made of, in the order the Workshop tab lists them. */
const MATERIALS = ['sticks', 'frond', 'fibre', 'stone', 'shells', 'clay', 'log', 'ore', 'plank', 'rope', 'charcoal', 'brick', 'iron', 'nails', 'sea_glass', 'shell_chime', 'tiki_mug'];

/* ---------------- Building ---------------- */
const Build = {
  built() { return (G.flags.built = G.flags.built || {}); },
  has(site) { return typeof G !== 'undefined' && !!(G.flags && G.flags.built && G.flags.built[site] !== undefined); },
  /* Every site of a project, from the objects the island was built with — so
     the plans know about a site you have not walked past yet. */
  sites(proj) {
    const def = typeof LEVELS !== 'undefined' && LEVELS.island;
    if (!this._sites && def && def.sites) this._sites = def.sites;
    return (this._sites || []).filter(s => s.proj === proj).map(s => s.site);
  },
  refresh() {
    if (typeof World === 'undefined' || World.level !== 'island' || !World.objects) return;
    for (const o of World.objects) {
      if (!o.site || o.builtAs) continue;
      /* Unbuilt, a site says what it is going to be. */
      if (!this.has(o.site)) { const n = PROJECTS[o.proj].n.replace(/^A /, ''); o.name = 'A building site — ' + n[0].toLowerCase() + n.slice(1); continue; }
      const as = PROJECTS[o.proj].as;
      o.builtAs = o.proj;
      Object.assign(o, as);
      o.fdef = Object.assign({}, FURN[as.kind]);
      o.mount = null;
      delete o._foot;
    }
    if (typeof Garden !== 'undefined') Garden.refresh();
  },
  act(o) {
    Craft.intro();
    if (this.has(o.site)) { this.refresh(); if (Acts[o.use] && o.use !== 'buildSite') Acts[o.use](o); return; }
    const p = PROJECTS[o.proj], lvl = Craft.level('craft');
    const have = Object.keys(p.cost).map(k => ITEMS[k].e + ' ' + Math.min(bag(k), p.cost[k]) + '/' + p.cost[k] + ' ' + ITEMS[k].n.toLowerCase()).join(' · ');
    const lvlOk = lvl >= p.lvl, ok = lvlOk && canPay(p.cost);
    insp('🚧', 'A building site', p.n, [
      'Pegs, string, and one of Rafa’s sketches weighted down with a stone. ' + p.d,
      'You need: ' + have + '. About ' + clockDur(p.mins) + ' of work.' + (lvlOk ? '' : ' It needs Craftsmanship ' + p.lvl + ' — you are ' + lvl + '. Make things at the workbench and the kiln to get there.')],
      (ok ? [{ t: 'Build it (' + clockDur(p.mins) + ').', to: null, do: () => this.build(o) }] : []).concat([{ t: 'Leave it for now.', to: null }]));
  },
  build(o) {
    const p = PROJECTS[o.proj];
    if (P.energy < 15) { Sfx.deny && Sfx.deny(); UI.toast('😮‍💨', 'You are too tired to build anything today. Eat, or sleep on it.', 'bad'); return; }
    pay(p.cost);
    G.minutes += Math.round(p.mins * (1 - Craft.level('craft') * .04));
    Player.mod({ energy: -15 });
    this.built()[o.site] = G.day;
    Craft.train('craft', 20 + p.lvl * 10);
    Player.xp(15 + p.lvl * 10);
    Player.mod({ rep: 2 });
    FX.burst(P.x, P.y, p.e, 16); FX.shake && FX.shake(4);
    Sfx.cash && Sfx.cash();
    this.refresh();
    UI.toast(p.e, 'Built: <b>' + p.n + '</b>. ' + ({
      plot: 'One more plot for the garden.', catcher: 'The water butt holds twice as much now.', bay: 'Two more batches of compost at once.',
      rack2: 'Three more things drying at once.', oven: 'Time to cook something.', cabana: 'Tourists will be renting it by tomorrow.',
      roof: 'No more bucket. Mari cried a little. She will deny it.' }[o.proj] || ''), 'gold');
    Ach.get('a_builder');
    const all = this.sites('cabana');
    if (all.length && all.every(s => this.has(s))) Ach.get('a_landlord');
    if (o.proj === 'roof') Rel.add('mari', 2);
    if (Q.active('q_build')) Q.complete('q_build');
  },
  /* The board in the yard: every plan, and where its site is. */
  plans() {
    Craft.intro();
    const lvl = Craft.level('craft');
    const where = { plot: 'the bottom of the garden', catcher: 'beside the water butt', bay: 'beside the compost bin', rack2: 'in the garden, by the drying rack',
      oven: 'here in the yard', cabana: 'Honeymoon Sands', roof: 'the Promenade, at the side of The Driftwood' };
    insp('📐', 'Rafa’s plans', 'Pinned up and curling', ['Sketches on the backs of receipts, drawn with a carpenter’s pencil and a great deal of optimism. The sites are pegged out with string.']
      .concat(Object.keys(PROJECTS).map(k => {
        const p = PROJECTS[k], s = this.sites(k), d = s.filter(x => this.has(x)).length;
        return p.e + ' ' + p.n + ' — ' + (d >= s.length ? 'built.' : costWords(p.cost) + (lvl >= p.lvl ? '' : ' · Craftsmanship ' + p.lvl) + ' · at ' + where[k] + (s.length > 1 ? ' (' + d + '/' + s.length + ' built)' : '') + '.');
      })));
  },
  /* The two buildings that do their work without being pressed. */
  catcher() {
    Farm.update();
    insp('☔', 'The rain catcher', 'Thatched and funnelled', ['A cone of palm fronds on a frame over the water butt, with a bamboo spout. Rain that used to miss the butt now does not.',
      'The butt holds ' + Farm.buttCap() + ' cans’ worth now, and fills twice as fast when it rains.']);
  },
  cabana() {
    insp('🛖', 'Your beach cabana', 'For rent', ['A thatched shade on four driftwood posts, two loungers, and a hand-painted sign: RENT ME — ' + cash(CABANA_RENT) + ' A DAY — ASK AT THE DRIFTWOOD.',
      'It pays its rent every morning. Somebody has left a paperback and a very specific sunburn outline on the left lounger.'],
      [{ t: 'Lie in the shade for a bit.', to: null, do() { Player.mod({ patience: 16, energy: 4 }); G.minutes += 20; } }, { t: 'Leave it.', to: null }]);
  },
  roof() {
    insp('🪜', 'Rafa’s ladder', 'Against The Driftwood', ['Up there is a roof that no longer leaks: new battens, fresh thatch, and not one bucket.',
      'Guests tip better when they are not being dripped on — ×' + ROOF_TIPS + ', every day.']);
  }
};

/* ---------------- Teo buys what you make ----------------
   Orders pay best, but orders come three at a time. The boat will take
   crafted goods and sea glass off your hands at two-thirds of what they are
   worth, so a good week at the kiln is never a bag full of mugs. */
/* Only what is made to sell — never the planks and bricks you are saving up. */
const GOODS = ['shell_chime', 'tiki_mug', 'sea_glass'];
Craft.goodsValue = () => GOODS.reduce((a, id) => a + bag(id) * Math.round(ITEMS[id].v * .66 * 100) / 100, 0);
Craft.sellGoods = () => {
  const pay = Math.round(Craft.goodsValue() * 100) / 100;
  if (!pay) return;
  const words = GOODS.filter(id => bag(id)).map(id => bag(id) + ' × ' + ITEMS[id].n).join(', ');
  GOODS.forEach(id => bagTake(id, bag(id)));
  Player.mod({ money: pay, rep: 1 });
  Sfx.cash && Sfx.cash();
  UI.toast('⛵', 'Teo loads ' + words + ' and counts out <b>' + cash(pay) + '</b>. “For the market on San Tomás. Don’t tell Nico what I got for it.”', 'gold');
};

/* The stump of anything you felled. */
Craft.stump = function (o) {
  const type = o.use === 'palm' ? 'chop_palm' : 'chop_tree';
  insp('🪵', 'A stump', 'Growing back', ['What is left of ' + (o.use === 'palm' ? 'a palm' : 'a jungle tree') + '. Already there is a green shoot coming out of the side.',
    'It will be a proper tree again in about ' + clockDur(this.back(o, type)) + '. The island is not in a hurry.']);
};

/* How much more a guest tips under a roof that does not leak — wrapping the
   farm's stocked-bar bonus in data/farm.js. */
{
  const base = Farm.tipMult;
  Farm.tipMult = () => base() * (Build.has('roof') ? ROOF_TIPS : 1);
}
