'use strict';
/* ---------------- The crafting screens ----------------
   Rafa's workbench, his kiln and the brick oven, each as a screen in the panel
   rather than a line of text in a dialogue box: every recipe is a card that
   says what it makes, how long it takes, what it takes with how much of each
   you have, what you are short of and where that comes from, and has a button
   to make it (or to make as many as you can afford). The kiln shows its two
   slots with how long each has left.

   Opened at the thing itself it is for making; opened from the Workshop tab
   (`away`) it is the recipe book — the same cards, read-only, with a button
   that pins where to go. The doing is Craft's (data/craft.js). */
const STATIONS = {
  bench: { n: 'Rafa’s workbench', short: 'Workbench', e: '🛠️', use: 'workbench',
    d: 'A scarred bench with a vice, a saw missing three teeth, and RAFA carved into the leg.' },
  kiln: { n: 'Rafa’s kiln', short: 'Kiln', e: '🏺', use: 'kiln',
    d: 'A squat clay dome, still black from Rafa’s last firing. It keeps going whatever the weather.' },
  oven: { n: 'The brick oven', short: 'Brick oven', e: '🍞', use: 'oven',
    d: 'Your own domed oven in the yard. Food from it fills you up and does not go off.' }
};
/* Where each thing comes from, for "short of" on a card. */
const SOURCES = {
  sticks: 'driftwood on the beaches', shells: 'shells in the sand', stone: 'loose stones inland, or an outcrop',
  clay: 'the clay bank', frond: 'under the palms', fibre: 'vines in the jungle', log: 'felling a palm or a jungle tree',
  ore: 'rock outcrops, with a pickaxe', plank: 'the workbench', rope: 'the workbench', nails: 'the workbench',
  charcoal: 'the kiln', brick: 'the kiln', iron: 'the kiln', tiki_mug: 'the kiln',
  fish: 'Nico, down at the jetty', lime: 'the garden', coconut: 'the garden, or a palm you fell'
};
/* What a tool is for, on its card. */
const TOOL_USE = { axe: 'Fells palms and jungle trees', pick: 'Breaks rock outcrops for stone, clay and ore' };
/* At most this many in one press of "Make ×N". */
const BATCH_MAX = 10;

const Station = {
  id: 'bench', cat: 'all', away: false, flash: null, _sig: null,

  open(id, away) {
    if (!STATIONS[id]) return;
    if (id !== this.id) this.cat = 'all';
    this.id = id; this.away = !!away; this.flash = null;
    if (Panels.on && Panels.tab === 'station') { Panels.render(); const b = $('#pnBody'); if (b) b.scrollTop = 0; }
    else Panels.open('station');
  },
  /* The stations you have: the oven once it is built. */
  list() {
    const oven = typeof Build !== 'undefined' && Build.sites('oven').some(s => Build.has(s));
    return Object.keys(STATIONS).filter(id => id !== 'oven' || oven);
  },
  recipes(id) { return id === 'bench' ? WORKBENCH : id === 'kiln' ? KILN.recipes : OVEN; },
  /* How many recipes you could start this minute. */
  ready(id) {
    if (id === 'bench') return WORKBENCH.filter(r => Craft.benchOk(r)).length;
    if (id === 'kiln') {
      const free = Craft.kilnLoad().length < KILN.slots, lvl = Craft.level('craft');
      return Craft.kilnReady().length + (free ? KILN.recipes.filter(r => canPay(r.in) && lvl >= (r.lvl || 1)).length : 0);
    }
    return OVEN.filter(r => canPay(r.in)).length;
  },
  blurb(id) {
    return { bench: 'Planks, rope, nails, tools', kiln: 'Charcoal, bricks, mugs, iron', oven: 'Food that keeps' }[id];
  },
  /* How many times over you can afford it. */
  times(r) { return Math.min(BATCH_MAX, ...Object.keys(r.in).map(k => Math.floor(bag(k) / r.in[k]))); },
  mins(r) { return this.id === 'bench' ? Craft.benchMins(r) : this.id === 'kiln' ? Craft.kilnMins(r) : 15; },
  /* Why a recipe cannot be made now, or null. */
  why(r) {
    const lvl = Craft.level('craft');
    if (lvl < (r.lvl || 1)) return { lock: true, t: '🔒 Needs Craftsmanship ' + r.lvl + ' — you are ' + lvl };
    if (this.id === 'bench' && TOOLS[r.out] && Item.has(r.out)) return { t: 'You carry one already · ' + Gear.left(r.out) + '/' + TOOLS[r.out].uses + ' jobs left' };
    const short = Object.keys(r.in).filter(k => bag(k) < r.in[k]);
    if (short.length) return { t: 'Short of ' + short.map(k => (r.in[k] - bag(k)) + ' ' + ITEMS[k].e + ' ' + esc(ITEMS[k].n.toLowerCase())
      + (SOURCES[k] ? ' <i>(' + SOURCES[k] + ')</i>' : '')).join(', ') };
    if (this.id === 'kiln' && Craft.kilnLoad().length >= KILN.slots) return { t: 'Both slots are firing. Wait for one, then take it out.' };
    return null;
  },

  title() { const s = STATIONS[this.id]; return [s.e, this.away ? s.short + ' recipes' : s.n]; },

  render() {
    const st = STATIONS[this.id], lvl = Craft.level('craft');
    const x = Craft.xp('craft'), lo = tradeXp(lvl), hi = tradeXp(lvl + 1);
    const pct = lvl >= TRADE_MAX ? 100 : clamp((x - lo) / (hi - lo) * 100, 0, 100);
    let h = '';
    /* From the Workshop: the way back, the other stations, and where to go. */
    if (this.away) {
      h += '<div class="st-away"><button class="btn small" type="button" data-st-back>‹ Workshop</button>'
        + '<div class="seg" role="radiogroup" aria-label="Recipes for">' + this.list().map(id => '<button type="button" role="radio" aria-checked="' + (id === this.id) + '" class="'
          + (id === this.id ? 'on' : '') + '" data-station="' + id + '">' + STATIONS[id].e + ' ' + esc(STATIONS[id].short) + '</button>').join('') + '</div>'
        + '<button class="btn small" type="button" data-st-where>📍 Show me where</button></div>';
    }
    h += '<div class="st-hero"><span class="st-e" aria-hidden="true">' + st.e + '</span>'
      + '<div class="st-id"><b>' + esc(st.n) + '</b><span>' + esc(st.d) + '</span></div>'
      + '<div class="st-lv" title="' + x + ' Craftsmanship XP"><span>🛠️ Craftsmanship <b>' + lvl + '</b>' + (lvl >= TRADE_MAX ? ' · master' : '') + '</span>'
      + '<span class="mb grow"><i style="width:' + Math.round(pct) + '%"></i></span>'
      + '<span class="st-clock">🕐 ' + clockStr(G.minutes) + (this.away ? '' : ' · each job takes time') + '</span></div></div>';
    if (this.flash) h += '<div class="st-flash" role="status">' + this.flash + '</div>';
    if (this.id === 'kiln') h += this.slots();
    let list = this.recipes(this.id).map((r, i) => [r, i]);
    if (this.id === 'bench') {
      const cats = [['all', 'All']].concat(Object.keys(BENCH_CATS).map(c => [c, BENCH_CATS[c]]));
      h += '<div class="st-cats" role="tablist" aria-label="Drawers">' + cats.map(([c, n]) => {
        const k = WORKBENCH.filter(r => (c === 'all' || r.cat === c) && Craft.benchOk(r)).length;
        return '<button type="button" role="tab" aria-selected="' + (this.cat === c) + '" class="st-cat' + (this.cat === c ? ' on' : '') + '" data-st-cat="' + c + '">'
          + esc(n) + (k ? ' <span class="tab-n' + (this.cat === c ? '' : ' cool') + '">' + k + '</span>' : '') + '</button>';
      }).join('') + '</div>';
      if (this.cat !== 'all') list = list.filter(([r]) => r.cat === this.cat);
    }
    h += '<div class="st-grid">' + list.map(([r, i]) => this.card(r, i)).join('') + '</div>';
    if (this.id === 'bench' && (this.cat === 'all' || this.cat === 'tool'))
      h += '<p class="idesc st-note">An axe fells trees, a pickaxe breaks rock. Iron lasts three times as long and works faster. You carry one of each.</p>';
    this._sig = this.sig();
    return h;
  },
  /* The kiln's two slots: what is in, how long it has, and a button to empty it. */
  slots() {
    const now = islandNow(), k = Craft.kilnLoad(), ready = Craft.kilnReady();
    let h = '<div class="st-slots">';
    for (let i = 0; i < KILN.slots; i++) {
      const x = k[i];
      if (!x) { h += '<div class="st-slot idle"><span class="ss-e">🔥</span><div><b>Empty</b><span>' + (this.away ? 'Nothing firing.' : 'Fire something below.') + '</span></div></div>'; continue; }
      const t = x.t || (KILN.recipes.find(q => q.out === x.out) || { t: 60 }).t, done = x.done <= now;
      h += '<div class="st-slot' + (done ? ' done' : '') + '"><span class="ss-e">' + ITEMS[x.out].e + '</span><div><b>' + x.n + ' × ' + esc(ITEMS[x.out].n) + '</b>'
        + '<span>' + (done ? '✅ Ready to take out' : '⏳ ' + clockDur(x.done - now) + ' to go') + '</span>'
        + '<span class="mb grow"><i style="width:' + Math.round(clamp(1 - (x.done - now) / t, 0, 1) * 100) + '%"></i></span></div></div>';
    }
    h += '</div>';
    if (ready.length && !this.away) h += '<button class="btn primary st-take" type="button" data-st-take>🧺 Take out what’s fired (' + ready.map(x => x.n + ' × ' + esc(ITEMS[x.out].n.toLowerCase())).join(', ') + ')</button>';
    return h;
  },
  card(r, i) {
    const it = ITEMS[r.out], n = r.n || 1, why = this.why(r), m = this.mins(r);
    const tag = this.id === 'bench' ? BENCH_CATS[r.cat] : this.id === 'kiln' ? 'Fired' : 'Cooked';
    const u = it.use && typeof it.use === 'object' ? it.use : null;
    const gives = u ? [['food', '🍽️'], ['energy', '⚡'], ['patience', '❤️']].filter(([k]) => u[k]).map(([k, e]) => e + '+' + u[k]).join(' ') : '';
    const what = gives ? 'Eat it for ' + gives : '';
    /* Two ways to the same thing (rope from vines, rope from fronds): say which. */
    const twins = this.recipes(this.id).filter(q => q.out === r.out);
    const odd = Object.keys(r.in).find(k => !twins.every(q => q.in[k])) || Object.keys(r.in)[0];
    const from = twins.length > 1 ? ' <span class="rc-from">' + (Object.keys(r.in)[0] === odd ? 'from ' : 'with ') + esc(ITEMS[odd].n.toLowerCase()) + '</span>' : '';
    const has = bag(r.out);
    let act = '';
    if (this.away) act = '<span class="rc-at">Made at ' + esc(STATIONS[this.id].n) + '</span>';
    else if (!why) {
      const verb = this.id === 'bench' ? 'Make' : this.id === 'kiln' ? 'Fire' : 'Cook';
      act = '<button class="btn small primary" type="button" data-craft="' + i + '" data-times="1">' + verb + ' · ' + clockDur(m) + '</button>';
      const t = this.id === 'bench' && !TOOLS[r.out] ? this.times(r) : 1;
      if (t > 1) act += '<button class="btn small" type="button" data-craft="' + i + '" data-times="' + t + '">' + verb + ' ×' + t + ' · ' + clockDur(m * t) + '</button>';
    }
    return '<div class="rc' + (why ? why.lock ? ' locked' : ' short' : ' ok') + '" data-rc="' + i + '">'
      + '<div class="rc-h"><span class="rc-e" aria-hidden="true">' + it.e + '</span>'
      + '<div class="rc-n"><b>' + esc(it.n) + (n > 1 ? ' <em>×' + n + '</em>' : '') + from + '</b>'
      + '<span class="rc-m"><span>⏱ ' + clockDur(m) + '</span>' + (r.xp ? '<span>+' + r.xp + ' craft XP</span>' : '') + (has ? '<span>you have ' + has + '</span>' : '') + '</span></div>'
      + '<span class="rc-tag">' + esc(tag) + '</span></div>'
      + '<p class="rc-d">' + esc(it.d) + '</p>'
      + (what ? '<p class="rc-w">' + what + '</p>' : '')
      + costChips(r.in)
      + (why ? '<p class="rc-why">' + why.t + '</p>' : '')
      + (act ? '<div class="rc-act">' + act + '</div>' : '')
      + '</div>';
  },

  /* The panel's body is fresh HTML each render: the buttons are wired here,
     and the one you pressed keeps the focus, so making six planks from the
     keyboard is six presses of Enter. */
  bind(b) {
    b.querySelectorAll('[data-craft]').forEach(el => el.onclick = () => this.do(+el.dataset.craft, +el.dataset.times || 1));
    b.querySelectorAll('[data-st-cat]').forEach(el => el.onclick = () => { this.cat = el.dataset.stCat; this.flash = null; Sfx.blip(); Panels.render(); this.refocus('[data-st-cat="' + this.cat + '"]'); });
    b.querySelectorAll('[data-st-take]').forEach(el => el.onclick = () => this.take());
    b.querySelectorAll('[data-st-back]').forEach(el => el.onclick = () => Panels.go('workshop'));
    b.querySelectorAll('[data-st-where]').forEach(el => el.onclick = () => {
      const s = STATIONS[this.id];
      Panels.close();
      Guide.pinAt('island', '#' + s.use, s.n);
    });
  },
  refocus(sel, fallback) {
    const b = $('#pnBody'); if (!b) return;
    const el = b.querySelector(sel) || (fallback && b.querySelector(fallback)) || b.querySelector('[data-craft]');
    if (el) try { el.focus({ preventScroll: true }); } catch (e) {}
  },
  do(i, times) {
    if (this.away) return;
    const r = this.recipes(this.id)[i]; if (!r) return;
    const it = ITEMS[r.out];
    let made = 0;
    if (this.id === 'bench') {
      /* Timed one by one: a level gained halfway makes the rest quicker. */
      let spent = 0;
      for (let k = 0; k < times; k++) { const t = Craft.benchMins(r); if (!Craft.make(r)) break; made++; spent += t; }
      if (made) this.flash = '✨ Made ' + (r.n * made > 1 ? r.n * made + ' × ' : 'a ') + '<b>' + esc(it.n) + '</b> · ' + clockDur(spent)
        + (TOOLS[r.out] ? ' · ' + TOOL_USE[TOOLS[r.out].kind].toLowerCase() : '');
    } else if (this.id === 'kiln') {
      if (Craft.fire(r)) { made = 1; this.flash = '🔥 The kiln roars: ' + r.n + ' × <b>' + esc(it.n) + '</b> in about ' + clockDur(Craft.kilnMins(r)) + '.'; }
    } else if (Craft.cook(r)) { made = 1; this.flash = it.e + ' Out of the oven: <b>' + esc(it.n) + '</b>. It will keep.'; }
    if (!made) { Sfx.deny(); return; }
    Sfx.cash ? Sfx.cash() : Sfx.blip();
    UI.hudDirty && UI.hudDirty();
    Panels.render();
    this.refocus('[data-craft="' + i + '"][data-times="' + times + '"]', '[data-craft="' + i + '"]');
    this.pulse(i);
  },
  take() {
    const out = Craft.takeOut();
    if (!out.length) { Sfx.deny(); return; }
    this.flash = '🧺 Out of the kiln: ' + out.map(x => x.n + ' × <b>' + esc(ITEMS[x.out].n) + '</b>').join(', ') + '.';
    Sfx.cash ? Sfx.cash() : Sfx.blip();
    Panels.render();
    this.refocus('[data-craft]', '.btn');
  },
  /* The card you just made from gives a little hop. */
  pulse(i) {
    const c = document.querySelector('#pnBody [data-rc="' + i + '"]');
    if (c) { c.classList.remove('made'); void c.offsetWidth; c.classList.add('made'); }
  },
  /* What the screen shows that the clock can change: the kiln's minutes. */
  sig() { return this.id + '|' + clockStr(G.minutes) + '|' + Craft.kilnLoad().map(x => x.done).join(','); },
  /* Once a second (Hook 'second'): redrawn only if the kiln has moved on, so
     the focus is not knocked about for nothing. */
  tick() {
    if (!Panels.on || Panels.tab !== 'station' || this.id !== 'kiln') return;
    if (this.sig() === this._sig) return;
    this.flash = null;    /* "in about 46 minutes" is not true any more */
    const f = document.activeElement, sel = f && f.dataset && f.dataset.craft !== undefined ? '[data-craft="' + f.dataset.craft + '"]' : null;
    Panels.render();
    if (sel) this.refocus(sel);
  }
};
