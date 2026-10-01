'use strict';
/* THE ISLAND'S OWN SYSTEMS — the parts of this game a table cannot say.
 *
 *   Garden   Rafa's twelve plots: plant a seed, wait, harvest the fruit.
 *   Blender  fruit in, cocktails out, at The Driftwood.
 *   Orders   the supply boat at the jetty wants things for the other islands.
 *   Dates    ask somebody to the cove at sunset, and turn up.
 *
 * Water, spoilage, the fridge, the compost bin, the drying rack and your own
 * hunger are the farm around all this, in data/farm.js.
 *
 * All of it keeps its state in G.flags, which the save already carries, and
 * all of it tells time in ISLAND MINUTES — minutes since the first morning —
 * so a mango planted on Tuesday afternoon is ready on Wednesday whatever the
 * clock did overnight. Loaded after data/items.js and before data/acts.js,
 * which is where the buttons that call it are. */

const bag = id => P.inventory.filter(x => x === id).length;
const bagTake = (id, n) => { for (let i = 0; i < n; i++) Item.take(id); };
const qAt = (id, n) => Q.active(id) && G.quests[id].step === n;
/* Bring a job up to step `n` if it is behind — doing a later thing first
   (planting seeds you were given, say) still counts for the earlier steps. */
const qTo = (id, n) => { for (let i = 0; i < 6 && Q.active(id) && G.quests[id].step < n; i++) Q.step(id); };
const islandNow = () => (Math.max(1, G.day) - 1) * 1440 + G.minutes;

/* ---------------- The garden ---------------- */
/* t   island minutes from seed to ripe
   n   how many you pick
   xp  what picking them is worth */
const CROPS = {
  mint:       { t: 45,  n: 3, xp: 3 },
  lime:       { t: 75,  n: 3, xp: 4 },
  strawberry: { t: 100, n: 3, xp: 5 },
  mango:      { t: 180, n: 2, xp: 7 },
  pineapple:  { t: 260, n: 2, xp: 9 },
  coconut:    { t: 420, n: 2, xp: 12 },
};

const Garden = {
  plots() { return (G.flags.garden = G.flags.garden || {}); },
  state(o) { return this.plots()[o.plot] || null; },
  /* A plot is { c, at, g, w, dry, fert, pest, pestAt, bit, ripeAt, dead }:
     the crop, when it went in, how many minutes of GROWING it has had (only
     wet minutes count — see Farm.update()), how wet it is, how long it has
     been bone dry, whether it was composted, whether something is eating it,
     when it ripened, and whether it is past saving. */
  /* 0 bare · 1 seedling · 2 growing · 3 ripe · 4 dead */
  stage(p) {
    if (!p) return 0;
    if (p.dead) return 4;
    const f = p.g / CROPS[p.c].t;
    return f >= 1 ? 3 : f >= .5 ? 2 : 1;
  },
  /* Growing minutes still to go, at the pace it is growing now. */
  left(p) { return Math.max(0, Math.ceil((CROPS[p.c].t - p.g) / (p.fert ? 1.35 : 1))); },
  look(o) {
    const p = this.state(o), s = this.stage(p);
    if (s === 0) return { e: '🟫', name: 'A garden plot' };
    const nm = ITEMS[p.c].n;
    if (s === 4) return { e: '🥀', name: nm + ' — ' + (p.dead === 'rotted' ? 'rotted on the vine' : 'withered') };
    if (p.pest && s < 3) return { e: '🐛', name: nm + ' — something is eating it!' };
    if (s < 3 && p.w <= 0) return { e: '🏜️', name: nm + ' — bone dry' };
    return s === 1 ? { e: '🌱', name: nm + ' — just planted' + (p.w < .25 ? ' (thirsty)' : '') }
      : s === 2 ? { e: '🪴', name: nm + ' — growing' + (p.w < .25 ? ' (thirsty)' : '') }
      : { e: ITEMS[p.c].e, name: nm + ' — ripe!' };
  },
  /* Keep the plots on the ground looking like what is in them. Cheap: fifteen
     objects, only while you are on the island. */
  refresh() {
    if (World.level !== 'island' || !World.objects) return;
    for (const o of World.objects) {
      if (o.kind !== 'plot') continue;
      const l = this.look(o);
      o.e = l.e; o.name = l.name;
    }
  },
  seeds() { return Object.keys(ITEMS).filter(k => ITEMS[k].crop && Item.has(k)); },
  /* What E will do to this plot, for the prompt: so a row of them can be read
     walking past, without opening each one. */
  prompt(o) {
    const p = this.state(o), s = this.stage(p), crop = p && ITEMS[p.c] ? ITEMS[p.c].n.toLowerCase() : '';
    if (s === 4) return 'Clear the dead ' + crop;
    if (s === 3) return 'Pick the ' + crop;
    if (s > 0) return p.pest ? 'Shoo the pest off the ' + crop
      : p.w < .9 ? 'Water the ' + crop + (p.w <= 0 ? ' — bone dry' : '')
      : 'Check the ' + crop;
    return this.seeds().length ? 'Plant something' : 'Look at a bare plot';
  },
  plant(o, seed) {
    const c = ITEMS[seed].crop;
    Item.take(seed);
    /* Planted into damp earth: somebody turning a plot over waters it. */
    this.plots()[o.plot] = { c, at: islandNow(), g: 0, w: .6, dry: 0 };
    Sfx.blip && Sfx.blip();
    FX.burst(P.x, P.y, '🌱', 6);
    UI.toast('🌱', 'Planted <b>' + ITEMS[c].n + '</b>. Keep it watered and it’s ready in about ' + clockDur(CROPS[c].t) + '.');
    qTo('q_garden', 2);
    this.refresh();
  },
  water(o) {
    const p = this.state(o);
    if (!Farm.useCan()) return;
    p.w = 1; p.dry = 0;
    FX.burst(P.x, P.y, '💧', 8, '#4dd4ff');
    UI.toast('💧', 'Watered the <b>' + ITEMS[p.c].n.toLowerCase() + '</b>. ' + Farm.canWords() + '.');
    this.refresh();
  },
  feed(o) {
    const p = this.state(o);
    Item.take('compost');
    p.fert = true;
    FX.burst(P.x, P.y, '🪱', 6);
    UI.toast('🪱', 'Dug compost into the <b>' + ITEMS[p.c].n.toLowerCase() + '</b>. It will grow faster and give more.', 'good');
  },
  shoo(o) {
    const p = this.state(o);
    p.pest = false; p.pestAt = 0;
    FX.burst(P.x, P.y, '🐛', 5);
    UI.toast('🐛', pick(['You flick a caterpillar into the jungle. It will be back. They always come back.', 'A land crab was having lunch. You have a stern word. It leaves, sideways.', 'Aphids. You squish them, apologising to each one.']));
    Player.xp(2);
    this.refresh();
  },
  clear(o) {
    const p = this.state(o);
    delete this.plots()[o.plot];
    Item.give('scraps', true); Item.give('scraps', true);
    UI.toast('🍂', 'Cleared the dead ' + ITEMS[p.c].n.toLowerCase() + '. Two handfuls of scraps for the compost.');
    this.refresh();
  },
  harvest(o) {
    const p = this.state(o);
    const c = CROPS[p.c];
    /* PRIME is the reward for looking after it: composted, never once let
       dry, never nibbled. */
    const prime = p.fert && !p.everDry && !p.bit;
    let n = c.n + (p.fert ? 1 : 0) - (p.bit ? 1 : 0) + (Math.random() < .3 ? 1 : 0) + (prime ? 1 : 0);
    n = Math.max(1, n);
    for (let i = 0; i < n; i++) Item.give(p.c, true);
    /* And the garden starts to feed itself: seed back, and scraps for the bin. */
    const seed = Object.keys(ITEMS).find(k => ITEMS[k].crop === p.c);
    const gotSeed = seed && Math.random() < (p.fert ? .55 : .35);
    if (gotSeed) Item.give(seed, true);
    if (Math.random() < .6) Item.give('scraps', true);
    delete this.plots()[o.plot];
    FX.burst(P.x, P.y, ITEMS[p.c].e, 10);
    UI.toast(ITEMS[p.c].e, (prime ? '🏅 <b>Prime!</b> ' : '') + 'Picked <b>' + n + ' × ' + ITEMS[p.c].n + '</b>'
      + (gotSeed ? ' and saved the seed' : '') + '.', 'gold');
    Player.xp(c.xp + (prime ? 6 : 0));
    if (prime) Ach.get('a_prime');
    G.flags.harvests = (G.flags.harvests || 0) + 1;
    if (G.flags.harvests >= 10) Ach.get('a_green');
    qTo('q_garden', 3);
    this.refresh();
  },
  act(o) {
    Farm.update();
    const p = this.state(o), s = this.stage(p);
    if (s === 4) {
      insp('🥀', 'A garden plot', p.dead === 'rotted' ? 'Rotted' : 'Withered', [p.dead === 'rotted'
        ? 'It was ripe, and nobody picked it, and now the fruit has gone to mush and the wasps have found it.'
        : 'Dry for too long. The leaves crumble when you touch them.', 'At least it will make good compost.'],
        [{ t: 'Clear it for the compost.', to: null, do: () => this.clear(o) }, { t: 'Leave it.', to: null }]);
      return;
    }
    if (s === 3) {
      insp(ITEMS[p.c].e, 'A garden plot', 'Ripe', ['Heavy, sweet and warm from the sun. Ready.',
        p.fert && !p.everDry && !p.bit ? 'Composted and never let dry. This is a prime crop.' : 'Pick it before it goes over — ripe fruit does not wait.'],
        [{ t: 'Pick it all.', to: null, do: () => this.harvest(o) }, { t: 'Leave it a bit longer.', to: null }]);
      return;
    }
    if (s > 0) {
      const lines = [ITEMS[p.c].n + ', coming along. ' + Farm.plotWords(p)];
      if (p.pest) lines.push('Something is chewing the leaves. Shoo it, or it will eat into the harvest.');
      else lines.push(pick(['Watching it will not make it grow faster. You watch it anyway.', 'A gecko is sitting on it, supervising.', 'Rafa used to talk to his plants. You try it. It feels nice.']));
      const ch = [];
      if (p.pest) ch.push({ t: 'Shoo the pest.', to: null, do: () => this.shoo(o) });
      if (p.w < .9) ch.push(Farm.canLeft() ? { t: 'Water it (' + Farm.canWords() + ').', to: null, do: () => this.water(o) }
        : { t: 'Water it — fill the can at the water butt first.', to: null });
      if (!p.fert && Item.has('compost')) ch.push({ t: 'Dig in some compost (' + bag('compost') + ').', to: null, do: () => this.feed(o) });
      ch.push({ t: 'Leave it.', to: null });
      insp(p.pest ? '🐛' : s === 1 ? '🌱' : '🪴', 'A garden plot', p.w <= 0 ? 'Bone dry' : 'Growing', lines, ch);
      return;
    }
    const seeds = this.seeds();
    insp('🟫', 'A garden plot', 'Bare', seeds.length
      ? ['Rich red earth, turned over and ready. What are you planting?']
      : ['Rich red earth, and nothing in it. Mama Coco sells seeds on the Promenade — and ripe crops sometimes give you their seed back.'],
      seeds.map(k => ({ t: 'Plant the ' + ITEMS[k].n.toLowerCase() + ' (' + bag(k) + ').', to: null, do: () => this.plant(o, k) }))
        .concat([{ t: 'Leave it.', to: null }]));
  }
};
/* "About an hour and a half", from island minutes. */
function clockDur(m) {
  m = Math.max(1, Math.round(m));
  if (m < 60) return m + ' minutes';
  const h = Math.floor(m / 60), r = m % 60;
  return h + (h === 1 ? ' hour' : ' hours') + (r >= 15 ? (r >= 45 ? ' and three-quarters' : r >= 25 ? ' and a half' : ' and a quarter') : '');
}

/* ---------------- The blender ---------------- */
const RECIPES = [
  { out: 'mojito', in: { lime: 1, mint: 2 } },
  { out: 'daiquiri', in: { strawberry: 2, lime: 1 } },
  { out: 'sotb', in: { mango: 1, strawberry: 1 } },
  { out: 'colada', in: { pineapple: 1, coconut: 1 } },
  { out: 'sunset', in: { mango: 1, pineapple: 1, lime: 1 } },
];
const Blender = {
  can(r) { return Object.keys(r.in).every(k => bag(k) >= r.in[k]); },
  list(r) { return Object.keys(r.in).map(k => r.in[k] + ' ' + ITEMS[k].e + ' ' + ITEMS[k].n.toLowerCase()).join(' + '); },
  /* What a recipe is still short of, by name. */
  short(r) {
    return Object.keys(r.in).filter(k => bag(k) < r.in[k])
      .map(k => (r.in[k] - bag(k)) + ' more ' + ITEMS[k].e + ' ' + ITEMS[k].n.toLowerCase()).join(', ');
  },
  make(r) {
    for (const k in r.in) bagTake(k, r.in[k]);
    Item.give(r.out, true);
    Sfx.coffee && Sfx.coffee();
    FX.burst(P.x, P.y, ITEMS[r.out].e, 10);
    UI.toast(ITEMS[r.out].e, 'You blend a <b>' + ITEMS[r.out].n + '</b>. It even has a little umbrella.', 'gold');
    Player.xp(6);
    G.flags.blended = (G.flags.blended || 0) + 1;
    if (G.flags.blended >= 10) Ach.get('a_mixer');
    if (Q.active('q_garden') && G.quests.q_garden.step >= 3) Q.complete('q_garden');
    if (qAt('q_critic', 0) && P.inventory.filter(x => ITEMS[x] && ITEMS[x].drink).length >= 3) Q.step('q_critic');
    /* Straight back to the blender while there is fruit for another. */
    if (RECIPES.some(q => this.can(q))) setTimeout(() => { if (!Dialogue.on && G.state === 'play') this.open(true); }, 40);
  },
  open(again) {
    const ok = RECIPES.filter(r => this.can(r)), not = RECIPES.filter(r => !this.can(r));
    const missing = not.length ? 'Not yet: ' + not.map(r => ITEMS[r.out].n + ' — ' + this.short(r)).join(' · ') + '.' : '';
    insp('🍹', 'The blender', 'Rafa’s pride and joy', (again ? [] : [
      'A chrome blender older than you, with a dent where somebody once threw it at a man called Sterling.']).concat(
      ok.length ? ['You have the fruit for something. What are we making?'].concat(missing ? [missing] : []) : ['Rafa’s recipes are taped to the wall. You do not have the fruit for any of them yet.', missing]),
      ok.map(r => ({ t: 'Blend a ' + ITEMS[r.out].n + ' — ' + this.list(r) + '.', to: null, do: () => this.make(r) }))
        .concat([{ t: 'Leave it.', to: null }]));
  }
};

/* ---------------- The supply boat ---------------- */
/* Three orders on the board at a time, for the other islands. A new day tops
   the board back up; a filled order pays its price and a bit of reputation. */
const ORDER_POOL = [
  { who: 'The Coral Resort', e: '🏨', want: { mojito: 2 }, pay: 55 },
  { who: 'A wedding on Isla Perla', e: '💍', want: { daiquiri: 2, sotb: 1 }, pay: 95 },
  { who: 'The fish market on San Tomás', e: '🐟', want: { lime: 6 }, pay: 32 },
  { who: 'A yacht called “Wet Dream”', e: '🛥️', want: { sotb: 2 }, pay: 70 },
  { who: 'Old Pepe’s cousin', e: '👴', want: { mango: 3 }, pay: 34 },
  { who: 'The lighthouse keeper', e: '🗼', want: { coconut: 2, mint: 3 }, pay: 48 },
  { who: 'A hen party on Cayo Rosa', e: '👰', want: { daiquiri: 3 }, pay: 80 },
  { who: 'The monastery on the hill', e: '⛪', want: { strawberry: 4 }, pay: 30 },
  { who: 'A film crew', e: '🎬', want: { colada: 1, mojito: 1 }, pay: 75 },
  { who: 'The governor’s birthday', e: '🎩', want: { sunset: 1 }, pay: 90 },
  { who: 'A nudist retreat (don’t ask)', e: '🌞', want: { pineapple: 2, lime: 2 }, pay: 55 },
  /* What the farm makes. Dried fruit keeps, so it can wait for the right order. */
  { who: 'A sailing school on Cayo Rosa', e: '⛵', want: { dried_mango: 2 }, pay: 50 },
  { who: 'The Coral Resort’s minibars', e: '🏨', want: { coconut_chips: 2 }, pay: 68 },
  { who: 'A hiking club, very serious', e: '🥾', want: { dried_pineapple: 1, dried_strawberry: 2 }, pay: 52 },
  { who: 'The botanical garden on Isla Perla', e: '🌺', want: { compost: 3 }, pay: 30 },
  { who: 'The Coral Resort’s kitchen', e: '🐟', want: { fish: 3 }, pay: 38 },
  { who: 'A beach wedding (the tacos fell through)', e: '💒', want: { fish: 2, lime: 3 }, pay: 45 },
  /* What the workshop makes — data/craft.js. Only once you have found Rafa's
     yard: `need` is the flag that has to be set. */
  { who: 'A boatyard on San Tomás', e: '⚓', want: { plank: 6 }, pay: 48, need: 'workshop' },
  { who: 'The lighthouse, re-rigging', e: '🗼', want: { rope: 4 }, pay: 36, need: 'workshop' },
  { who: 'A potter on Isla Perla', e: '🏺', want: { clay: 6 }, pay: 30, need: 'workshop' },
  { who: 'The governor’s new terrace', e: '🎩', want: { brick: 9 }, pay: 88, need: 'workshop' },
  { who: 'A jeweller on Cayo Rosa', e: '💍', want: { sea_glass: 2 }, pay: 60, need: 'workshop' },
  { who: 'The Coral Resort gift shop', e: '🏨', want: { shell_chime: 2 }, pay: 64, need: 'workshop' },
  { who: 'A tiki bar on Isla Perla', e: '🗿', want: { tiki_mug: 3 }, pay: 72, need: 'workshop' },
  { who: 'A barbecue joint on San Tomás', e: '🔥', want: { charcoal: 6 }, pay: 34, need: 'workshop' },
  { who: 'A ship’s carpenter', e: '⛵', want: { log: 4, nails: 8 }, pay: 50, need: 'workshop' },
];
const Orders = {
  board() {
    if (!G.flags.orders) this.refresh(true);
    return G.flags.orders;
  },
  refresh(force) {
    const now = G.flags.orders || [];
    if (!force && now.length >= 3) return;
    const have = new Set(now.map(o => o.i));
    const pool = ORDER_POOL.map((o, i) => i).filter(i => !have.has(i) && (G.day > 1 || !ORDER_POOL[i].want.sunset) && (!ORDER_POOL[i].need || G.flags[ORDER_POOL[i].need]));
    while (now.length < 3 && pool.length) now.push({ i: pool.splice(Math.floor(Math.random() * pool.length), 1)[0] });
    G.flags.orders = now;
  },
  can(o) { const w = ORDER_POOL[o.i].want; return Object.keys(w).every(k => bag(k) >= w[k]); },
  words(o) { const w = ORDER_POOL[o.i].want; return Object.keys(w).map(k => w[k] + ' × ' + ITEMS[k].n).join(', '); },
  fill(o) {
    const d = ORDER_POOL[o.i];
    for (const k in d.want) bagTake(k, d.want[k]);
    G.flags.orders = G.flags.orders.filter(x => x !== o);
    Player.mod({ money: d.pay, rep: 3 });
    Player.xp(Math.round(d.pay / 3));
    Sfx.cash && Sfx.cash();
    UI.toast('⛵', 'Loaded for <b>' + d.who + '</b>. Teo tucks the cash into your hand and winks.', 'gold');
    G.flags.shipped = (G.flags.shipped || 0) + 1;
    if (G.flags.shipped >= 5) Ach.get('a_cargo');
    if (qAt('q_boat', 1)) Q.complete('q_boat');
  },
  open() {
    const b = this.board();
    if (qAt('q_boat', 0)) Q.step('q_boat');
    insp('📜', 'The order board', 'For the supply boat', [
      b.length ? 'Orders pinned up for Captain Teo to take round the islands:' : 'Nothing pinned up. Teo says there will be more in the morning.']
      .concat(b.map(o => ORDER_POOL[o.i].e + ' ' + ORDER_POOL[o.i].who + ' — ' + this.words(o) + ' · ' + cash(ORDER_POOL[o.i].pay))),
      b.filter(o => this.can(o)).map(o => ({ t: 'Load up ' + ORDER_POOL[o.i].who + ' (' + cash(ORDER_POOL[o.i].pay) + ').', to: null, do: () => this.fill(o) }))
        .concat([{ t: 'Walk away.', to: null }]));
  }
};

/* ---------------- Dates ---------------- */
/* Somebody who likes you enough will say yes to the cove at sunset. The date
   is for TODAY, from 19:00; turn up at the lantern and it happens. */
const DATE_LINES = {
  mari: ['Mari kicks off her sandals and sits with her toes in the water. “Rafa used to say this cove was built for bad decisions.”', 'She leans her head on your shoulder. “I think I’d like to make one.”', 'The lantern flickers. Neither of you notices for quite a while.'],
  kai: ['Kai turns up with two coconuts and a guitar he cannot play. He plays it anyway, badly, grinning the whole time.', '“I’m not usually nervous,” he says, and puts the guitar down, and does not seem nervous at all.', 'The tide comes in round your ankles. Neither of you moves.'],
  jade: ['Jade arrives off-duty, hair down, still smelling of sun cream. “Don’t tell anyone I left the tower.”', 'She challenges you to a race to the rock and back and wins, obviously, and then pulls you under anyway.', 'Afterwards you lie on the warm sand, dripping, watching the first stars come out.'],
  nico: ['Nico turns up late, in a clean shirt that is still creased from the packet, holding two grilled fish on sticks like flowers.',
    'He does not say much. He points out the stars the fishermen steer by, one by one, and names each one after something on the island you both know.',
    'When the lantern gutters he relights it without a word, and then — quietly, looking at the sea — “I don’t do this. For the record.”'],
  amara: ['Amara brings a flask of coffee and a waterproof torch, and makes you promise to look at something before anything else happens.',
    'She wades out to her knees and switches the torch off. The water lights up green-blue around her legs, every ripple glowing. “Bioluminescence,” she whispers. “Plankton. They do this when they’re disturbed.”',
    'She comes back, wet to the thighs, and sits very close. “I’m disturbed,” she says. “Your fault.”'],
  luca: ['Luca brings a blanket, a bottle of something Italian and absolutely no plan.', '“In Napoli we say the sea keeps secrets,” he murmurs. “So — tell me one.”', 'You tell him one. He tells you three. The lantern burns down to a glow.'],
};
const Dates = {
  ask(id, who) {
    G.flags.date = { id, day: G.day };
    UI.objective('Meet ' + who + ' at the lantern in Lovers’ Cove after 19:00.');
    UI.toast('💕', 'A date! <b>' + who + '</b>, the cove lantern, after sunset.', 'gold');
  },
  today(id) { const d = G.flags.date; return !!(d && d.id === id && d.day === G.day); },
  lantern() {
    const d = G.flags.date;
    const m = G.minutes % 1440;
    if (d && d.day === G.day && m >= 1140) {
      const n = NPCS.find(x => x.id === d.id);
      G.flags.date = null;
      G.flags['dated_' + d.id] = (G.flags['dated_' + d.id] || 0) + 1;
      Rel.add(d.id, 3);
      Player.mod({ patience: 40, energy: 20 });
      Ach.get('a_date');
      if (Rel.get(d.id) >= 8) { Ach.get('a_kiss'); G.flags.partner = d.id; }
      if (!Item.has('polaroid')) Item.give('polaroid');
      if (d.id === 'jade' && qAt('q_jade', 1)) Q.complete('q_jade');
      insp(n ? n.face : '💕', n ? n.name : 'Your date', 'Lovers’ Cove · sunset', DATE_LINES[d.id] || ['It is a lovely evening.']);
      return true;
    }
    if (d && d.day === G.day) {
      insp('🏮', 'The cove lantern', 'Waiting', ['It is not sunset yet. Your date said after seven. You fiddle with your hair.']);
      return true;
    }
    return false;
  }
};
