'use strict';
/* State, rules and saving. Everything time-based stores absolute timestamps,
   so crops keep growing while the phone is in your pocket. */

const N = 18, CHUNK = 6;
const SAVE_KEY = 'bumbay.v1';
const now = () => Date.now();
const pick = a => a[Math.floor(Math.random() * a.length)];

/* Deterministic island outline. */
function isLand(x, y) {
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2;
  const a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
  return r < 7.7 + 1.1 * Math.sin(a * 3 + 1) + 0.7 * Math.sin(a * 5 + 2);
}
const chunkOf = (x, y) => Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK);

const G = {
  s: null,
  events: [],          // {type, ...} consumed by the UI each frame

  emit(type, o = {}) { this.events.push(Object.assign({ type }, o)); },

  fresh() {
    const s = {
      v: 1, coins: 60, gold: 3, xp: 0, lvl: 1,
      inv: { beans: 3, corn: 4 },
      land: { '1,1': true },
      tiles: {},       // "x,y" -> object
      stats: {},
      quest: 0,
      orders: [],
      nextGull: now() + 25000,
      sound: true,
      started: now()
    };
    const put = (x, y, o) => { s.tiles[x + ',' + y] = o; };
    put(7, 7, { k: 'field', crop: 'beans', at: now() - 25000 });
    put(8, 7, { k: 'field', crop: 'beans', at: now() - 25000 });
    put(7, 8, { k: 'field', crop: 'corn', at: now() - 10000 });
    put(8, 8, { k: 'field' });
    put(10, 7, { k: 'pen', a: 'chicken' });
    put(6, 10, { k: 'decor', id: 'palm' });
    put(10, 10, { k: 'junk', id: 'poop' });
    put(6, 6, { k: 'junk', id: 'poop' });
    put(11, 9, { k: 'junk', id: 'poop' });
    put(9, 11, { k: 'junk', id: 'rock' });
    put(11, 6, { k: 'junk', id: 'bush' });
    put(6, 8, { k: 'junk', id: 'sock' });
    // scatter junk on land you don't own yet
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!isLand(x, y) || chunkOf(x, y) === '1,1') continue;
      const r = Math.random();
      if (r < 0.10) put(x, y, { k: 'junk', id: 'rock' });
      else if (r < 0.22) put(x, y, { k: 'junk', id: 'bush' });
      else if (r < 0.26) put(x, y, { k: 'decor', id: 'palm', wild: true });
    }
    this.s = s;
    for (let i = 0; i < 3; i++) s.orders.push(this.newOrder(now() + i * 4000));
    return s;
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { this.s = JSON.parse(raw); return true; }
    } catch (e) { /* private mode etc. */ }
    return false;
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch (e) {} },
  wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },

  /* ---------- helpers ---------- */
  tile(x, y) { return this.s.tiles[x + ',' + y]; },
  owned(x, y) { return isLand(x, y) && !!this.s.land[chunkOf(x, y)]; },
  have(k) { return this.s.inv[k] || 0; },
  add(k, n = 1) { this.s.inv[k] = this.have(k) + n; if (this.s.inv[k] <= 0) delete this.s.inv[k]; },
  stat(k, n = 1) { this.s.stats[k] = (this.s.stats[k] || 0) + n; this.checkQuest(); },
  xpFor(l) { return Math.round(14 * Math.pow(l, 1.55)); },
  joy() {
    let j = 0;
    for (const o of Object.values(this.s.tiles)) if (o.k === 'decor' && !o.wild) j += DECOR[o.id].joy;
    return j;
  },
  bonus() { return Math.min(this.joy(), 60) / 100; },
  count(k, id) {
    let c = 0;
    for (const o of Object.values(this.s.tiles))
      if (o.k === k && (id == null || o.a === id || o.id === id)) c++;
    return c;
  },
  fieldCost() { return 10 + 6 * this.count('field'); },
  animalCost(a) { return Math.round(ANIMALS[a].cost * Math.pow(1.35, this.count('pen', a))); },

  spend(c) {
    if (this.s.coins < c) { this.emit('toast', { msg: pick(SKINT) }); this.emit('sfx', { s: 'nope' }); return false; }
    this.s.coins -= c; return true;
  },
  spendGold(c) {
    if (this.s.gold < c) { this.emit('toast', { msg: 'Not enough ✨💩 Golden Nuggets. Scoop more poop.' }); this.emit('sfx', { s: 'nope' }); return false; }
    this.s.gold -= c; return true;
  },
  gainXp(n, x, y) {
    const s = this.s;
    s.xp += n;
    while (s.xp >= this.xpFor(s.lvl)) {
      s.xp -= this.xpFor(s.lvl); s.lvl++; s.gold += 2;
      this.emit('levelup', { lvl: s.lvl });
    }
    if (x != null) this.emit('float', { x, y, msg: '+' + n + ' ⭐', dy: 18 });
  },
  gainCoins(n, x, y) {
    this.s.coins += n;
    if (x != null) this.emit('float', { x, y, msg: '+' + n + ' 🪙' });
  },

  /* ---------- timers ---------- */
  cropLeft(o) { return o.crop ? Math.max(0, o.at + CROPS[o.crop].t * 1000 - now()) : 0; },
  penLeft(o) { return o.fed ? Math.max(0, o.fed + ANIMALS[o.a].t * 1000 - now()) : 0; },
  isReady(o) {
    if (!o) return false;
    if (o.k === 'field') return !!o.crop && this.cropLeft(o) === 0;
    if (o.k === 'pen') return !!o.fed && this.penLeft(o) === 0;
    if (o.k === 'fac') return o.q.some(j => j.end <= now());
    return false;
  },

  /* ---------- actions on tiles ---------- */
  harvest(x, y) {
    const o = this.tile(x, y);
    if (!o || o.k !== 'field' || !this.isReady(o)) return false;
    const c = o.crop, n = 2;
    this.add(c, n);
    o.crop = null; o.at = 0;
    this.emit('float', { x, y, msg: '+' + n + ' ' + ITEMS[c].e });
    this.gainXp(CROPS[c].xp, x, y);
    this.emit('sfx', { s: (c === 'beans' || c === 'cabbage') && Math.random() < 0.5 ? 'fart' : 'pop' });
    if ((c === 'beans' || c === 'cabbage') && Math.random() < 0.35) this.emit('puff', { x, y });
    this.stat('harvest');
    return true;
  },

  plant(x, y, crop) {
    const o = this.tile(x, y);
    if (!o || o.k !== 'field' || o.crop) return false;
    const c = CROPS[crop];
    if (!this.spend(c.cost)) return false;
    o.crop = crop; o.at = now();
    this.emit('float', { x, y, msg: '-' + c.cost + ' 🪙', bad: true });
    this.emit('sfx', { s: 'plant' });
    this.stat('plant');
    return true;
  },

  clearJunk(x, y) {
    const o = this.tile(x, y);
    if (!o || o.k !== 'junk') return false;
    const j = JUNK[o.id];
    if (j.cost && !this.spend(j.cost)) return false;
    delete this.s.tiles[x + ',' + y];
    if (j.coins) this.gainCoins(j.coins, x, y);
    this.gainXp(j.xp, x, y);
    if (o.id === 'poop') {
      this.stat('poop');
      this.emit('sfx', { s: 'splat' });
      if (Math.random() < 0.18) { this.s.gold++; this.emit('float', { x, y, msg: '+1 ✨💩 GOLDEN!', dy: 36 }); this.emit('sfx', { s: 'coin' }); }
    } else this.emit('sfx', { s: 'pop' });
    return true;
  },

  tapPen(x, y) {
    const o = this.tile(x, y), A = ANIMALS[o.a];
    if (this.isReady(o)) {
      this.add(A.gives, 1); o.fed = 0;
      this.emit('float', { x, y, msg: '+1 ' + ITEMS[A.gives].e });
      this.emit('toast', { msg: A.e + ' ' + pick(A.line) });
      this.gainXp(A.xp, x, y);
      this.emit('sfx', { s: o.a === 'pig' ? 'fart' : 'pop' });
      if (o.a === 'pig') this.emit('puff', { x, y });
      this.stat(A.gives);
      return 'collected';
    }
    if (o.fed) return 'busy';
    if (this.have(A.eats) < 1) {
      this.emit('toast', { msg: A.e + ' wants 1 ' + ITEMS[A.eats].e + ' ' + ITEMS[A.eats].n + '. It’s giving you a look.' });
      this.emit('sfx', { s: 'nope' });
      return 'hungry';
    }
    this.add(A.eats, -1); o.fed = now();
    this.emit('float', { x, y, msg: '-1 ' + ITEMS[A.eats].e, bad: true });
    this.emit('sfx', { s: 'munch' });
    return 'fed';
  },

  skipPen(x, y) {
    const o = this.tile(x, y);
    if (!o.fed || !this.spendGold(1)) return false;
    o.fed = now() - ANIMALS[o.a].t * 1000; return true;
  },
  skipCrop(x, y) {
    const o = this.tile(x, y);
    if (!o.crop || !this.spendGold(1)) return false;
    o.at = now() - CROPS[o.crop].t * 1000; return true;
  },

  /* ---------- factories ---------- */
  facCollect(x, y) {
    const o = this.tile(x, y), F = FACTORIES[o.id];
    let got = 0;
    o.q = o.q.filter(j => {
      if (j.end > now()) return true;
      const r = F.recipes[j.r];
      this.add(r.out, 1); got++;
      this.emit('float', { x, y, msg: '+1 ' + ITEMS[r.out].e, dy: got * 16 });
      this.gainXp(r.xp);
      this.stat('make_' + r.out);
      return false;
    });
    if (got) this.emit('sfx', { s: o.id === 'windco' ? 'fart' : 'coin' });
    return got;
  },
  facMake(x, y, ri) {
    const o = this.tile(x, y), r = FACTORIES[o.id].recipes[ri];
    if (o.q.length >= 3) { this.emit('toast', { msg: 'Queue’s full. The machine is sweating.' }); return false; }
    for (const [k, n] of Object.entries(r.in)) if (this.have(k) < n) {
      this.emit('toast', { msg: 'Need ' + n + ' ' + ITEMS[k].e + ' ' + ITEMS[k].n + '.' }); this.emit('sfx', { s: 'nope' }); return false;
    }
    for (const [k, n] of Object.entries(r.in)) this.add(k, -n);
    const last = o.q.length ? o.q[o.q.length - 1].end : 0;
    o.q.push({ r: ri, end: Math.max(now(), last) + r.t * 1000 });
    this.emit('sfx', { s: 'plant' });
    return true;
  },
  facSkip(x, y) {
    const o = this.tile(x, y);
    if (!o.q.length || !this.spendGold(1)) return false;
    const cut = o.q[0].end - now();
    if (cut > 0) o.q.forEach(j => { j.end -= cut; });
    return true;
  },

  /* ---------- building ---------- */
  canPlace(x, y) { return this.owned(x, y) && !this.tile(x, y); },
  place(x, y, what) {
    if (!this.canPlace(x, y)) return false;
    const [cat, id] = what.split(':');
    let cost, obj;
    if (cat === 'field') { cost = this.fieldCost(); obj = { k: 'field' }; }
    else if (cat === 'animal') { cost = this.animalCost(id); obj = { k: 'pen', a: id }; }
    else if (cat === 'fac') { cost = FACTORIES[id].cost; obj = { k: 'fac', id, q: [] }; }
    else if (cat === 'decor') { cost = DECOR[id].cost; obj = { k: 'decor', id }; }
    if (!this.spend(cost)) return false;
    this.s.tiles[x + ',' + y] = obj;
    this.emit('float', { x, y, msg: '-' + cost + ' 🪙', bad: true });
    this.emit('sfx', { s: 'build' });
    this.emit('puff', { x, y, dust: true });
    this.gainXp(Math.max(1, Math.round(cost / 25)), x, y);
    if (cat === 'fac') this.stat('build_' + id);
    if (cat === 'decor') this.stat('decor');
    return true;
  },
  /* Sell a placed thing back for half. Wild palms are free to chop. */
  remove(x, y) {
    const o = this.tile(x, y);
    if (!o || o.k === 'junk') return false;
    let back = 0;
    if (o.k === 'decor' && !o.wild) back = Math.floor(DECOR[o.id].cost / 2);
    if (o.k === 'fac') back = Math.floor(FACTORIES[o.id].cost / 2);
    if (o.k === 'pen') back = Math.floor(ANIMALS[o.a].cost / 2);
    if (o.k === 'field') back = 3;
    delete this.s.tiles[x + ',' + y];
    if (back) this.gainCoins(back, x, y);
    this.emit('sfx', { s: 'pop' });
    this.emit('puff', { x, y, dust: true });
    return true;
  },

  buyLand(key) {
    const e = EXPAND[key];
    if (!e || this.s.land[key]) return false;
    if (this.s.lvl < e.lvl) { this.emit('toast', { msg: 'Reach level ' + e.lvl + ' first. The crab has rules.' }); this.emit('sfx', { s: 'nope' }); return false; }
    if (!this.spend(e.cost)) return false;
    this.s.land[key] = true;
    this.emit('sfx', { s: 'level' });
    this.emit('toast', { msg: '🏝️ New land! It has rocks. And probably poop.' });
    this.gainXp(Math.round(e.cost / 20));
    this.stat('land');
    return true;
  },

  /* ---------- orders ---------- */
  producible() {
    const s = this.s, out = [];
    for (const [k, c] of Object.entries(CROPS)) if (c.lvl <= s.lvl) out.push(k);
    for (const a of Object.keys(ANIMALS)) if (this.count('pen', a)) out.push(ANIMALS[a].gives);
    for (const [id, F] of Object.entries(FACTORIES)) if (this.count('fac', id))
      F.recipes.forEach(r => { if (Object.keys(r.in).every(k => out.includes(k))) out.push(r.out); });
    return out;
  },
  newOrder(arrive) {
    const s = this.s, pool = this.producible();
    const kinds = Math.min(pool.length, 1 + Math.floor(Math.random() * Math.min(3, 1 + s.lvl / 2)));
    const items = {};
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    // favour the fancier stuff a bit
    shuffled.sort((a, b) => (ITEMS[b].sell - ITEMS[a].sell) * (Math.random() - 0.3));
    for (let i = 0; i < kinds; i++) {
      const k = shuffled[i], v = ITEMS[k].sell;
      items[k] = Math.max(1, Math.round((2 + Math.random() * (2 + s.lvl * 0.6)) * Math.min(1, 6 / v)));
    }
    let value = 0;
    for (const [k, n] of Object.entries(items)) value += ITEMS[k].sell * n;
    const who = Math.floor(Math.random() * CUSTOMERS.length);
    return {
      who, items, arrive,
      coins: Math.round(value * 1.7) + 5,
      xp: Math.max(3, Math.round(value / 3)),
      line: pick(CUSTOMERS[who].say),
      boat: pick(['⛵', '🚤', '🛶', '🚢', '⛴️', '🛥️'])
    };
  },
  canFill(o) { return o.arrive <= now() && Object.entries(o.items).every(([k, n]) => this.have(k) >= n); },
  fill(i) {
    const o = this.s.orders[i];
    if (!this.canFill(o)) return false;
    for (const [k, n] of Object.entries(o.items)) this.add(k, -n);
    const coins = Math.round(o.coins * (1 + this.bonus()));
    this.gainCoins(coins);
    this.gainXp(o.xp);
    this.emit('toast', { msg: CUSTOMERS[o.who].f + ' “Cheers!” +' + coins + ' 🪙 +' + o.xp + ' ⭐' });
    this.emit('sfx', { s: 'coin' });
    this.emit('boatleave', { i, boat: o.boat });
    this.s.orders[i] = this.newOrder(now() + 15000);
    this.stat('order');
    return true;
  },
  skip(i) {
    this.s.orders[i] = this.newOrder(now() + 45000);
    this.emit('boatleave', { i, boat: '💨' });
    this.emit('sfx', { s: 'fart' });
  },

  sell(k) {
    if (this.have(k) < 1) return false;
    this.add(k, -1);
    this.gainCoins(ITEMS[k].sell);
    this.emit('sfx', { s: 'coin' });
    return true;
  },

  /* ---------- quests ---------- */
  quest() {
    const i = this.s.quest;
    if (i < QUESTS.length) return QUESTS[i];
    // endless tail
    const n = 5 + 5 * (i - QUESTS.length);
    return { k: 'order', n: (this.s.stats._tailBase || 0) + n, t: 'Ship ' + n + ' more orders', say: 'You finished my list. Now keep the bay fed, or else.', r: { coins: 150, xp: 40, gold: 2 }, tail: true };
  },
  questProgress() {
    const q = this.quest(), have = this.s.stats[q.k] || 0;
    return { q, have: Math.min(have, q.n), done: have >= q.n };
  },
  checkQuest() {
    if (this.questProgress().done && !this.s.questReady) { this.s.questReady = true; this.emit('questdone'); }
  },
  claimQuest() {
    const { q, done } = this.questProgress();
    if (!done) return false;
    const r = q.r;
    if (r.coins) this.gainCoins(r.coins);
    if (r.gold) this.s.gold += r.gold;
    if (r.xp) this.gainXp(r.xp);
    this.s.quest++;
    this.s.questReady = false;
    if (this.s.quest >= QUESTS.length) this.s.stats._tailBase = this.s.stats.order || 0;
    // quests keyed on counters restart counting where relevant
    this.emit('sfx', { s: 'level' });
    this.checkQuest();
    return true;
  },

  /* ---------- world tick ---------- */
  tick() {
    const s = this.s;
    if (now() > s.nextGull) {
      s.nextGull = now() + 35000 + Math.random() * 50000;
      const spots = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (this.canPlace(x, y)) spots.push([x, y]);
      if (spots.length) {
        const [x, y] = pick(spots);
        this.emit('gull', { x, y });
      }
    }
  },
  gullDrop(x, y) {
    if (!this.canPlace(x, y)) return;
    this.s.tiles[x + ',' + y] = { k: 'junk', id: Math.random() < 0.85 ? 'poop' : 'sock' };
    this.emit('sfx', { s: 'splat' });
    this.emit('toast', { msg: '🐦 ' + pick(GULL_LINES) });
  }
};

const fmt = ms => {
  const t = Math.ceil(ms / 1000);
  if (t < 60) return t + 's';
  const m = Math.floor(t / 60), s = t % 60;
  return m < 60 ? m + 'm' + (s ? ' ' + s + 's' : '') : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
};
