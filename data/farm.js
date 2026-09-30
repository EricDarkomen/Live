'use strict';
/* THE FARM — what keeps the island fed, and the bar in limes.
 *
 * data/garden.js is the plots, the blender and the boat. This is everything
 * around them that makes it a thing to manage rather than a thing to wait for,
 * in the spirit of Oxygen Not Included and Stardew Valley:
 *
 *   Water    plots dry out (faster in the sun, not at all in the rain) and a
 *            crop only grows while it is wet. The water butt fills with rain;
 *            Rafa's can holds six waterings. A dry week is a rationing week.
 *   Pests    something turns up to eat the leaves now and then. Shoo it, or
 *            it eats into the harvest. The scarecrow helps. A bit.
 *   Larder   fresh fruit goes soft. The bar fridge slows it right down —
 *            when it is not sulking — and what spoils becomes scraps.
 *   Stations the compost bin turns scraps into compost, and compost into
 *            faster, bigger crops; the drying rack turns fruit that would
 *            spoil into dried fruit that never will, when the sun is out.
 *   Hunger   you have to eat. Your own fruit will do.
 *   The bar  Mari stocks the bar from the fridge when she opens up. A stocked
 *            bar tips better; an empty fridge is a long day for everybody.
 *
 * Everything keeps its state in G.flags (and P.food), which the save carries,
 * and everything tells time in island minutes — see islandNow() in
 * data/garden.js — caught up in one step whenever it is asked, so a night
 * slept through is a night that happened to the garden too. */

/* How long fresh things keep, in island minutes (a day is 1440). */
const PERISH = { mint: 1440, strawberry: 2000, mango: 2800, lime: 4300, pineapple: 4300, coconut: 8600, fish: 1300 };
/* In the fridge everything keeps this many times longer. */
const FRIDGE_SLOW = 4, FRIDGE_CAP = 30;
/* How much of a plot's water goes a minute, by the sky. At the sunny rate a
   watered plot lasts a little under four hours. */
const DRY_RATE = { sun: .0045, cloud: .0033, grey: .0026 };
/* Bone dry for this long and a crop is gone; ripe and unpicked this long and
   it rots where it hangs. */
const WITHER_AFTER = 300, ROT_AFTER = 720;
/* Chance a minute that a growing plot gets visitors. */
const PEST_RATE = .0009;
/* The stations. */
/* `slots` grows when you build a second bay, and the rack's when you build a
   second rack — see PROJECTS in data/craft.js. */
const COMPOST = { in: 3, t: 90, get slots() { return 3 + (Build.has('bay') ? 2 : 0); } };
const RACK = {
  get slots() { return 3 + (Build.has('rack2') ? 3 : 0); },
  recipes: [
    { in: 'mango', out: 'dried_mango', t: 120 },
    { in: 'pineapple', out: 'dried_pineapple', t: 150 },
    { in: 'coconut', out: 'coconut_chips', t: 180 },
    { in: 'strawberry', out: 'dried_strawberry', t: 90 }
  ]
};
/* The bar takes four pieces of fruit to stock, limes and mint first. A stocked
   bar's guests tip this much more. */
const STOCK = { need: 4, prefer: ['lime', 'mint'], tips: 1.6 };
/* Hunger: points a minute — a full stomach lasts a whole island day. */
const HUNGER_RATE = 100 / 1440;

const Farm = {
  /* ---- the clock ---- */
  update() {
    if (!G.flags || G.state === 'title' || G.state === 'name') return;
    const now = islandNow(), last = G.flags.farmAt;
    G.flags.farmAt = now;
    /* The first minute of a new game: Rafa's can is full, and Mari has left
       you something to eat, because she is nicer than she lets on. */
    if (last === undefined || last === null) {
      if (!G.flags.farmStarted) {
        G.flags.farmStarted = true; G.flags.can = 6;
        Item.give('empanada', true); Item.give('empanada', true);
      }
      return;
    }
    if (now < last) return;
    const dt = Math.min(now - last, 1440 * 3);
    if (dt <= 0) return;
    const k = Sky.kind(), raining = !!k.fall;
    const rate = raining ? 0 : (k.dim < .05 ? DRY_RATE.sun : k.dim < .15 ? DRY_RATE.cloud : DRY_RATE.grey) * (Sky.dark() ? .5 : 1);
    this.plots(now, dt, raining, rate);
    this.water(dt, raining);
    Larder.update(now, dt);
    Stations.update(now, dt, raining);
    Hunger.update(dt);
    /* The fridge sulks, now and then — once a day it decides whether today is
       the day. Mari has been hitting it on the left for six years. */
    if (G.flags.fridgeDay !== G.day) {
      G.flags.fridgeDay = G.day;
      if (G.day > 1 && Math.random() < .18) {
        G.flags.fridgeBroken = true;
        if (World.level === 'bar') UI.toast('🧊', 'The fridge has stopped humming. It is sulking again.', 'bad');
      }
    }
  },
  plots(now, dt, raining, rate) {
    const scare = 1 - .35;   /* the scarecrow, who is cool rather than scary */
    for (const id in Garden.plots()) {
      const p = Garden.fix(Garden.plots()[id]);
      if (!p || p.dead) continue;
      const T = CROPS[p.c].t;
      let wet;
      if (raining) { p.w = 1; wet = dt; }
      else { wet = rate ? Math.min(dt, p.w / rate) : dt; p.w = Math.max(0, p.w - rate * dt); }
      if (p.g < T) {
        p.g = Math.min(T, p.g + wet * (p.fert ? 1.35 : 1) * (p.pest ? .5 : 1));
        if (p.g >= T) p.ripeAt = now;
        const dryMins = dt - wet;
        if (dryMins > 0) {
          p.dry = (p.dry || 0) + dryMins; p.everDry = true;
          if (p.dry > WITHER_AFTER) p.dead = 'withered';
        } else p.dry = 0;
        if (!p.pest && !p.dead && Math.random() < 1 - Math.pow(1 - PEST_RATE * scare, dt)) { p.pest = true; p.pestAt = now; }
        if (p.pest && now - p.pestAt > 240) p.bit = true;
      } else if (now - (p.ripeAt || now) > ROT_AFTER) p.dead = 'rotted';
    }
  },
  /* ---- water ---- */
  water(dt, raining) {
    const cap = this.buttCap(), b = G.flags.butt === undefined ? 30 : G.flags.butt;
    G.flags.butt = Math.min(cap, b + dt * (raining ? .2 * (cap > 30 ? 2 : 1) : 1 / 60));
  },
  /* Thirty cans' worth, or sixty once the rain catcher is up (data/craft.js). */
  buttCap() { return 30 + (Build.has('catcher') ? 30 : 0); },
  canLeft() { return G.flags.can || 0; },
  canWords() { const n = this.canLeft(); return n ? n + ' left in the can' : 'the can is empty'; },
  useCan() {
    if (!this.canLeft()) { Sfx.deny && Sfx.deny(); UI.toast('🪣', 'The can is empty. Fill it at the water butt.'); return false; }
    G.flags.can--;
    return true;
  },
  butt() {
    this.update();
    const b = Math.floor(Math.min(this.buttCap(), G.flags.butt === undefined ? 30 : G.flags.butt)), can = this.canLeft();
    const want = 6 - can, take = Math.min(want, b);
    insp('🛢️', 'The water butt', b ? b + ' cans’ worth left' : 'Empty', [
      'Rafa rigged it to the gutters. It fills when it rains, and trickles in from the hill the rest of the time.',
      b ? 'Rafa’s watering can is hanging on the side. ' + (can ? 'It has ' + can + ' waterings in it.' : 'It is empty.')
        : 'Nothing but a puddle and a very disappointed frog. Wait for rain, or ration what you have.'],
      (take > 0 ? [{ t: 'Fill the can (' + (can + take) + '/6).', to: null, do() { G.flags.butt -= take; G.flags.can = can + take; Sfx.blip && Sfx.blip(); UI.toast('🪣', 'The can is full: six waterings.'); } }] : [])
        .concat([{ t: 'Leave it.', to: null }]));
  },
  plotWords(p) {
    const w = p.w <= 0 ? 'Bone dry — it has stopped growing.' : p.w < .25 ? 'Thirsty.' : p.w < .6 ? 'Damp.' : 'Well watered.';
    return w + ' About ' + clockDur(Garden.left(p)) + ' of growing to go' + (p.fert ? ', composted.' : '.');
  },

  /* ---- the Farm tab ---- */
  panel() {
    this.update();
    const now = islandNow();
    const bar = (v, cls) => '<span class="mb' + (cls ? ' ' + cls : '') + '"><i style="width:' + Math.round(clamp(v, 0, 100)) + '%"></i></span>';
    const butt = Math.floor(G.flags.butt === undefined ? 30 : G.flags.butt), cap = this.buttCap();
    const food = Hunger.get();
    const stocked = G.flags.stocked === G.day;
    let h = '<div class="h2">The farm</div><div class="farm-sum">'
      + '<div class="fs"><span>🛢️ Water butt</span><b>' + butt + '/' + cap + '</b>' + bar(butt / cap * 100, butt < 8 ? 'bad' : butt < 15 ? 'mid' : '') + '</div>'
      + '<div class="fs"><span>🪣 Watering can</span><b>' + this.canLeft() + '/6</b>' + bar(this.canLeft() / 6 * 100, this.canLeft() ? '' : 'bad') + '</div>'
      + '<div class="fs"><span>🍽️ You</span><b>' + Hunger.word() + '</b>' + bar(food, food < 25 ? 'bad' : food < 50 ? 'mid' : '') + '</div>'
      + '<div class="fs"><span>🍹 The bar today</span><b>' + (stocked ? 'Stocked · tips ×' + STOCK.tips : G.flags.stocked === -G.day ? 'Ran dry' : 'Not stocked yet') + '</b></div>'
      + '</div>';
    /* The plots, as a grid you can read at a glance. */
    h += '<div class="h2">Rafa’s garden</div><div class="farm-plots">';
    const ids = [];
    /* Row by row, as they lie in the ground: `p` + column + row. */
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) ids.push('p' + i + j);
    /* And the fourth row, the plots you build yourself — data/craft.js. */
    for (let i = 0; i < 5; i++) if (Build.has('plot' + i)) ids.push('p' + i + '3');
    ids.forEach(id => {
      const p = Garden.plots()[id], s = Garden.stage(p);
      const l = Garden.look({ plot: id });
      let sub = 'Bare';
      if (s === 4) sub = p.dead === 'rotted' ? 'Rotted' : 'Withered';
      else if (s === 3) sub = 'Ripe!';
      else if (s > 0) sub = p.w <= 0 ? 'Dry — not growing' : clockDur(Garden.left(p));
      const flags = s > 0 && s < 4 ? (p.pest ? '🐛' : '') + (p.fert ? '🪱' : '') + (s < 3 && p.w < .25 ? '💧' : '') : '';
      h += '<div class="fp s' + s + '" title="' + esc(l.name) + '"><span class="fe">' + l.e + '</span>'
        + '<span class="fn">' + (s ? esc(ITEMS[p.c].n) : '—') + '</span><span class="fsub">' + esc(sub) + ' ' + flags + '</span>'
        + (s > 0 && s < 3 ? bar(p.g / CROPS[p.c].t * 100, 'grow') + bar(p.w * 100, 'water') : '') + '</div>';
    });
    h += '</div><p class="idesc farm-key">🌱 growth · 💧 water · 🐛 pests (shoo them) · 🪱 composted. Crops only grow while wet; dry too long and they wither. Ripe fruit left too long rots.</p>';
    /* Production. */
    h += '<div class="h2">Production</div><div class="farm-prod">';
    const bin = G.flags.bin || [];
    h += '<div class="fst"><b>🪱 Compost bin</b><span>' + bin.length + '/' + COMPOST.slots + ' batches · ' + COMPOST.in + ' scraps each</span>'
      + bin.map(x => '<div class="fq">' + (x.done <= now ? '✅ Compost ready' : '⏳ ' + clockDur(x.done - now)) + bar(clamp(1 - (x.done - now) / COMPOST.t, 0, 1) * 100, 'grow') + '</div>').join('') + '</div>';
    const rack = G.flags.rack || [];
    h += '<div class="fst"><b>🌞 Drying rack</b><span>' + rack.length + '/' + RACK.slots + ' · dries in the sun, not the rain</span>'
      + rack.map(x => { const r = RACK.recipes.find(q => q.out === x.out); return '<div class="fq">' + ITEMS[x.out].e + ' ' + esc(ITEMS[x.out].n) + ' · ' + (x.left <= 0 ? '✅ ready' : '⏳ ' + clockDur(x.left)) + bar(clamp(1 - x.left / r.t, 0, 1) * 100, 'grow') + '</div>'; }).join('') + '</div>';
    h += '</div>';
    /* Stores: what you are carrying that will go off, and the fridge. */
    const soon = Larder.soonest(now);
    const fr = G.flags.fridge || {}, fcount = Larder.fridgeCount();
    h += '<div class="h2">Stores</div><div class="farm-prod">'
      + '<div class="fst"><b>🎒 Fresh in your bag</b>' + (soon.length ? soon.map(x => '<div class="fq">' + ITEMS[x.id].e + ' ' + x.n + ' × ' + esc(ITEMS[x.id].n) + ' <i>' + (x.mins < 180 ? '⚠️ ' : '') + 'turns in ' + clockDur(x.mins) + '</i></div>').join('') : '<span>Nothing that will go off.</span>') + '</div>'
      + '<div class="fst"><b>🧊 The bar fridge</b><span>' + fcount + '/' + FRIDGE_CAP + (G.flags.fridgeBroken ? ' · ⚠️ sulking — give it a kick' : ' · humming') + '</span>'
      + Object.keys(fr).filter(k => fr[k].length).map(k => '<div class="fq">' + ITEMS[k].e + ' ' + fr[k].length + ' × ' + esc(ITEMS[k].n) + '</div>').join('') + '</div>'
      + '</div>';
    return h;
  }
};

/* ---------------- The larder: freshness and the fridge ---------------- */
const Larder = {
  /* Your bag: for each perishable, a sorted list of the minute each piece
     turns. The bag itself is just a list of ids, so this is reconciled with it
     rather than attached to it — whatever you used, you used the oldest first
     (which is what anybody with a fruit bowl does), and anything that arrived
     without a date on it arrived fresh. */
  bagDates() { return (G.flags.fresh = G.flags.fresh || {}); },
  sync(now) {
    const f = this.bagDates();
    for (const id in PERISH) {
      const arr = f[id] || (f[id] = []);
      const c = bag(id);
      while (arr.length > c) arr.shift();
      while (arr.length < c) arr.push(now + PERISH[id]);
      arr.sort((a, b) => a - b);
    }
  },
  update(now, dt) {
    this.sync(now);
    const f = this.bagDates(), gone = {};
    for (const id in PERISH) {
      const arr = f[id];
      while (arr.length && arr[0] <= now) {
        arr.shift(); Item.take(id); Item.give('scraps', true);
        gone[id] = (gone[id] || 0) + 1;
      }
    }
    const lost = Object.keys(gone);
    if (lost.length) UI.toast('🍂', 'Gone soft in your bag: ' + lost.map(k => gone[k] + ' × ' + ITEMS[k].n).join(', ') + '. Into the scraps.', 'bad');
    /* The fridge keeps its own, slower clock. */
    const slow = G.flags.fridgeBroken ? 1 : FRIDGE_SLOW;
    G.flags.fclock = (G.flags.fclock || 0) + dt / slow;
    const fr = G.flags.fridge || {};
    for (const id in fr) {
      while (fr[id].length && fr[id][0] <= G.flags.fclock) { fr[id].shift(); G.flags.fscraps = (G.flags.fscraps || 0) + 1; }
    }
  },
  /* What in your bag goes off first, for the Farm tab. */
  soonest(now) {
    const f = this.bagDates(), out = [];
    for (const id in PERISH) if (f[id] && f[id].length) out.push({ id, n: f[id].length, mins: Math.max(1, f[id][0] - now) });
    return out.sort((a, b) => a.mins - b.mins);
  },
  fridgeCount() { const fr = G.flags.fridge || {}; return Object.values(fr).reduce((a, x) => a + x.length, 0); },
  /* In, at the fridge's pace: the time a piece had left is stretched by the
     fridge and counted on its clock. Out, the other way. */
  put(id) {
    const now = islandNow(), f = this.bagDates()[id] || [];
    const fr = (G.flags.fridge = G.flags.fridge || {}), arr = fr[id] || (fr[id] = []);
    const exp = f.length ? f.pop() : now + (PERISH[id] || 1e7);   /* the freshest goes in */
    Item.take(id);
    arr.push((G.flags.fclock || 0) + Math.max(1, exp - now));
    arr.sort((a, b) => a - b);
  },
  take(id) {
    const fr = G.flags.fridge || {}, arr = fr[id];
    if (!arr || !arr.length) return;
    const left = arr.shift() - (G.flags.fclock || 0);
    Item.give(id, true);
    const f = this.bagDates(), b = f[id] || (f[id] = []);
    b.push(islandNow() + Math.max(1, left)); b.sort((a, c) => a - c);
  },
  /* Anything that spoils, and the cocktails — the fridge is the bar's. */
  storable(id) { return !!(PERISH[id] || (ITEMS[id] && ITEMS[id].drink)); },
  open() {
    Farm.update();
    const bagIds = [...new Set(P.inventory.filter(x => this.storable(x)))];
    const fr = G.flags.fridge || {}, inside = Object.keys(fr).filter(k => fr[k].length);
    const n = this.fridgeCount(), room = FRIDGE_CAP - n;
    const lines = [G.flags.fridgeBroken
      ? 'The fridge is silent and faintly warm. It is sulking. Things in it are going off at the normal rate.'
      : 'The fridge hums. Things keep ' + FRIDGE_SLOW + ' times longer in here — and Mari stocks the bar from it every morning.',
      inside.length ? 'Inside: ' + inside.map(k => fr[k].length + ' × ' + ITEMS[k].n).join(', ') + '.' : 'It is empty apart from a lemon of uncertain age.'];
    if (G.flags.fscraps) { lines.push('You clear out ' + G.flags.fscraps + ' thing' + (G.flags.fscraps > 1 ? 's' : '') + ' that went off in here. Scraps for the bin.'); for (let i = 0; i < G.flags.fscraps; i++) Item.give('scraps', true); G.flags.fscraps = 0; }
    const ch = [];
    if (G.flags.fridgeBroken) ch.push({ t: 'Hit it on the left, like Mari does.', to: null, do() { G.flags.fridgeBroken = false; FX.shake && FX.shake(4); UI.toast('🧊', 'THUNK. It shudders, and hums. Good fridge.', 'good'); Player.xp(3); } });
    if (bagIds.length && room > 0) ch.push({ t: 'Put everything fresh in (' + Math.min(room, P.inventory.filter(x => this.storable(x)).length) + ').', to: null, do: () => {
      let left = room;
      for (const id of P.inventory.filter(x => this.storable(x))) { if (left-- <= 0) break; this.put(id); }
      UI.toast('🧊', 'Fridge stocked. ' + this.fridgeCount() + '/' + FRIDGE_CAP + '.');
    } });
    inside.slice(0, 5).forEach(k => ch.push({ t: 'Take out ' + ITEMS[k].e + ' ' + ITEMS[k].n.toLowerCase() + ' (' + fr[k].length + ').', to: null, do: () => { const c = fr[k].length; for (let i = 0; i < c; i++) this.take(k); UI.toast(ITEMS[k].e, 'Took out ' + c + ' × ' + ITEMS[k].n + '.'); } }));
    ch.push({ t: 'Close it.', to: null });
    insp('🧊', 'The bar fridge', G.flags.fridgeBroken ? 'Sulking' : n + '/' + FRIDGE_CAP, lines, ch);
  },
  /* ---- Mama Coco buys ---- */
  /* Fresh fruit you are carrying, at a little over half what it is worth —
     she has to sell it on, and she has told you so. */
  sellable() { return P.inventory.filter(x => PERISH[x]); },
  sellValue() { return this.sellable().reduce((a, x) => a + Math.round(ITEMS[x].v * .6 * 100) / 100, 0); },
  sellToCoco() {
    const list = this.sellable();
    if (!list.length) return;
    const pay = Math.round(this.sellValue() * 100) / 100;
    list.forEach(x => Item.take(x));
    Player.mod({ money: pay, rep: 1 });
    UI.toast('👵', 'Mama Coco weighs it all, tuts, and pays you <b>' + cash(pay) + '</b>.', 'gold');
    Mind.train('coco', 'business', 3); Mind.event('coco', 'talked');
  }
};

/* ---------------- Production ---------------- */
const Stations = {
  update(now, dt, raining) {
    /* The rack only dries in the sun. Rain stops the clock; it does not undo it. */
    if (!raining) for (const x of G.flags.rack || []) x.left = Math.max(0, x.left - dt);
  },
  bin() {
    Farm.update();
    const now = islandNow(), b = (G.flags.bin = G.flags.bin || []);
    const ready = b.filter(x => x.done <= now);
    const scraps = bag('scraps');
    const lines = ['A wooden box of rotting things, humming with contented worms. ' + COMPOST.in + ' scraps make a batch; a batch takes about ' + clockDur(COMPOST.t) + '.',
      b.length ? b.map(x => x.done <= now ? 'A batch of compost, ready.' : 'A batch rotting down: ' + clockDur(x.done - now) + ' to go.').join(' ') : 'Nothing in it but a very fat worm.'];
    const ch = [];
    if (ready.length) ch.push({ t: 'Dig out the compost (' + ready.length + ').', to: null, do() {
      G.flags.bin = b.filter(x => x.done > now);
      for (let i = 0; i < ready.length; i++) Item.give('compost', true);
      UI.toast('🪱', 'Dug out <b>' + ready.length + ' × Compost</b>. Your plots will love it.', 'gold');
      Player.xp(4 * ready.length); Ach.get('a_compost');
    } });
    if (scraps >= COMPOST.in && b.length < COMPOST.slots) ch.push({ t: 'Tip in ' + COMPOST.in + ' scraps (' + scraps + ').', to: null, do() {
      bagTake('scraps', COMPOST.in); b.push({ done: now + COMPOST.t });
      UI.toast('🍂', 'In it goes. The worms cheer, silently.');
    } });
    ch.push({ t: 'Leave it.', to: null });
    insp('🪱', 'The compost bin', b.length + '/' + COMPOST.slots + ' batches', lines, ch);
  },
  rack() {
    Farm.update();
    const r = (G.flags.rack = G.flags.rack || []);
    const ready = r.filter(x => x.left <= 0);
    const lines = ['A frame of fine mesh in full sun. Fruit laid out here dries into something that keeps for ever — while the sun is out.',
      r.length ? r.map(x => ITEMS[x.out].n + (x.left <= 0 ? ', ready.' : ', ' + clockDur(x.left) + ' of sun to go.')).join(' ') : 'It is empty. A gecko is sunbathing on it.'];
    if (Sky.kind().fall) lines.push('It is raining. Nothing is drying.');
    const ch = [];
    if (ready.length) ch.push({ t: 'Take down what’s dry (' + ready.length + ').', to: null, do() {
      G.flags.rack = r.filter(x => x.left > 0);
      ready.forEach(x => Item.give(x.out, true));
      UI.toast('🌞', 'Took down ' + ready.map(x => ITEMS[x.out].n).join(', ') + '.', 'gold');
      Player.xp(5 * ready.length); Ach.get('a_dried');
    } });
    if (r.length < RACK.slots) RACK.recipes.filter(q => Item.has(q.in)).forEach(q => ch.push({
      t: 'Lay out a ' + ITEMS[q.in].n.toLowerCase() + ' (' + bag(q.in) + ') → ' + ITEMS[q.out].n + ', ' + clockDur(q.t) + '.', to: null, do() {
        Item.take(q.in); r.push({ out: q.out, left: q.t });
        UI.toast(ITEMS[q.out].e, 'Laid out to dry. ' + clockDur(q.t) + ' of good sun.');
      } }));
    ch.push({ t: 'Leave it.', to: null });
    insp('🌞', 'The drying rack', r.length + '/' + RACK.slots, lines, ch);
  }
};

/* ---------------- Hunger ---------------- */
const Hunger = {
  get() { return P.food; },
  word() {
    const f = this.get();
    return f >= 70 ? 'Full' : f >= 45 ? 'Peckish' : f >= 25 ? 'Hungry' : f > 0 ? 'Starving' : 'Faint';
  },
  eat(n) {
    P.food = clamp(this.get() + n, 0, 100);
    UI.float('+' + Math.round(n) + ' 🍽️', '#5ad48a');
    G.flags.hungerWarn = 0;
  },
  /* An empty stomach costs you: energy runs down twice as fast when you are
     hungry, and your nerve starts to go when there is nothing left at all.
     You will not die of it. You will be very bad at flirting. */
  update(dt) {
    const was = this.get();
    P.food = Math.max(0, was - dt * HUNGER_RATE);
    if (P.food < 25) P.energy = Math.max(0, P.energy - dt / 7);
    if (P.food <= 0) P.patience = Math.max(1, P.patience - dt * .15);
    const warn = P.food <= 0 ? 3 : P.food < 10 ? 2 : P.food < 25 ? 1 : 0;
    if (warn > (G.flags.hungerWarn || 0)) {
      G.flags.hungerWarn = warn;
      UI.toast('🍽️', ['', 'Your stomach rumbles. Eat something — fruit from the garden, or one of Mama Coco’s empanadas.', 'You are starving. Your energy is draining fast.', 'Faint with hunger. Your nerve is going. EAT.'][warn], 'bad');
    }
    UI.hud();
  }
};

/* ---------------- What islanders do to the farm ----------------
   A routine step may name one of these as `act:` (see data/minds.js); the
   mind runs it when the step is done. The one that matters: Mari stocking
   the bar from the fridge when she opens up. */
const NPC_ACTS = {
  stockBar(n) {
    G.flags.stockRun = G.flags.stockRun || 0;
    const fr = G.flags.fridge || {};
    let got = 0;
    const takeFrom = id => { if (fr[id] && fr[id].length && got < STOCK.need) { fr[id].shift(); got++; return true; } return false; };
    for (const id of STOCK.prefer) { takeFrom(id); takeFrom(id); }
    for (const id of Object.keys(PERISH)) while (got < STOCK.need && takeFrom(id));
    const ok = got >= STOCK.need - 1;
    G.flags.stocked = ok ? G.day : -G.day;
    G.flags.stockRun = ok ? G.flags.stockRun + 1 : 0;
    if (G.flags.stockRun >= 3) Ach.get('a_stocked');
    Mind.add('mari', ok ? 'stocked' : 'nostock');
    const here = n && n.level === World.level && Cam.visible(n.x, n.y);
    if (here) { n.say = ok ? pick(['Fridge is FULL. I could kiss you.', 'Limes! Actual limes!']) : pick(['No limes. NO LIMES.', 'Who emptied my fridge? Nobody. Nobody filled it.']); n.sayT = 3.6; }
    else if (G.rel.mari !== undefined) UI.toast('💃', ok ? 'Mari stocked the bar from your fridge. Tips will be better today.' : 'Mari opened up to an empty fridge. No fruit for the bar today.', ok ? 'good' : 'bad');
  }
};
/* Nico lands the morning catch: his crate and Rosie's fish tacos are open for
   the day. See `landCatch` in his routine. */
NPC_ACTS.landCatch = n => {
  G.flags.catchDay = G.day;
  if (n && n.level === World.level && Cam.visible(n.x, n.y)) { n.say = pick(['Good catch. Don’t tell Teo.', 'Snapper. Fat ones.']); n.sayT = 3.4; }
};
/* Rosie's lunch rush: everybody on the island within a walk of the plaza has
   had a taco, and is the better for it. */
NPC_ACTS.lunchRush = n => {
  for (const o of NPCM.all) {
    if (o.level !== 'island' || o.id === 'rosie' || o.away) continue;
    const m = Mind.of(o.id);
    m.needs.thirst = Math.min(100, m.needs.thirst + 25);
    m.needs.social = Math.min(100, m.needs.social + 10);
    Mind.add(o.id, 'tacos');
  }
  Mind.train('rosie', 'cooking', 6);
  if (n && n.level === World.level && Cam.visible(n.x, n.y)) { n.say = pick(['¡A COMER!', 'Tacos! Get them while I still like you!']); n.sayT = 3.6; }
};
/* How much more a guest tips today: a bar stocked this morning, under a roof
   that does not leak (ROOF_TIPS, data/craft.js). */
Farm.tipMult = () => (G.flags.stocked === G.day ? STOCK.tips : 1) * (Build.has('roof') ? ROOF_TIPS : 1);
