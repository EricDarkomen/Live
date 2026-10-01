'use strict';
/* ---------------- Interaction, shops and the panel ---------------- */
const Interact = {
  target: null, kind: null, _label: null,
  scan() {
    if (G.state !== 'play') {
      if (this.target || this._label) { this.target = null; this.kind = null; this._label = null; $('#prompt').classList.remove('on'); }
      return;
    }
    /* Driving, E is the door, unless something furnished `fromCar` (a drive-thru
       window) is alongside, measured from the car. */
    if (Cars.driving) {
      const car = Cars.driving;
      let win = null, wd = TILE * 2.1;
      for (const o of World.objects) {
        if (!o.fdef || !o.fdef.fromCar) continue;
        const d = Math.hypot((o.x + .5) * TILE - car.x, (o.y + .5) * TILE - car.y);
        if (d < wd) { wd = d; win = o; }
      }
      this.target = win || car; this.kind = win ? 'obj' : 'car';
      const label = win ? 'Use ' + this.thing(win.name) : 'Get out of ' + this.thing(car.name);
      if (label !== this._label) {
        this._label = label;
        const el = $('#prompt');
        /* Name the control you have: on a phone it says OUT. */
        el.innerHTML = '<span class="kbd">' + (TOUCH && !win ? 'OUT' : 'E') + '</span> &nbsp;' + esc(label);
        el.classList.add('on'); el.classList.remove('urgent');
      }
      return;
    }
    const REACH = TILE * 1.05;
    let bestObj = null, od = REACH;
    /* Reach is about a tile, so only the 3×3 neighbourhood can match. */
    const ptx = Math.floor(P.x / TILE), pty = Math.floor(P.y / TILE);
    /* Whether you can reach it is surface to surface (Collide.reach), so a big
       thing reaches further; which one wins is still centre distance, or the
       biggest thing nearby would win every tie. Something on a table beats
       the table. */
    const SURFACE = TILE * 0.6;
    const dist = o => Math.hypot((o.x + .5) * TILE - P.x, (o.y + .5) * TILE - P.y)
      - (o.onTable ? 1 : 0);
    for (let ty = pty - 1; ty <= pty + 1; ty++) {
      for (let tx = ptx - 1; tx <= ptx + 1; tx++) {
        const here = World.at(tx, ty);
        for (let i = 0; i < here.length; i++) {
          if (here[i].gone || Collide.reach(here[i]) > SURFACE) continue;
          const d = dist(here[i]);
          if (d < od) { od = d; bestObj = here[i]; }
        }
      }
    }
    let bestNpc = null, nd = REACH;
    for (const n of NPCM.list) {
      const d = Math.hypot(n.x - P.x, n.y - P.y);
      if (d < nd) { nd = d; bestNpc = n; }
    }
    /* A person beats the chair they stand on unless you are clearly closer to it. */
    const PERSON_BIAS = TILE * .36;
    let best = null, kind = null;
    if (bestNpc && (!bestObj || nd <= od + PERSON_BIAS)) { best = bestNpc; kind = 'npc'; }
    else if (bestObj) { best = bestObj; kind = 'obj'; }
    /* Passers-by and cars lose every tie; between them the person wins. */
    const ped = Peds.near(P.x, P.y);
    if (ped && !best) { best = ped; kind = 'ped'; }
    const car = Cars.near(P.x, P.y);
    if (car && !best) { best = car; kind = 'car'; }
    this.target = best; this.kind = kind;
    const label = !best ? null
      : kind === 'npc' ? 'Talk to ' + best.name
      : kind === 'ped' ? 'Talk to ' + best.name
      : kind === 'car' ? (best.canDrive ? 'Get in ' : 'Look at ') + this.thing(best.name)
      : best.ringing ? sayOr('act.answer', 'ANSWER') + ' — ' + best.name
      : (best.kind === 'chair' || best.use === 'playerDesk') ? 'Use ' + best.name
      /* The one piece of street furniture that does something says so. */
      : best.use === 'crossingButton' ? 'Press the button'
      /* Driftwood, shells and stones are picked up. */
      : best.kind === 'pickup' ? 'Pick up ' + best.name
      : this.verb(best);
    if (label === this._label) return;      /* the DOM only when it changes */
    this._label = label;
    const el = $('#prompt');
    if (label) {
      el.innerHTML = '<span class="kbd">E</span> &nbsp;' + esc(label);
      el.classList.add('on');
      el.classList.toggle('urgent', !!(best && best.ringing));
    } else el.classList.remove('on');
  },
  /* What pressing E will do, in a word: a door is gone through and a sign is
     read. An object's own `verb` wins; anything unlisted is inspected. */
  VERBS: { sign: 'Read', board: 'Read', art: 'Look at', mirror: 'Look in', plot: 'Tend',
    wardrobe: 'Open', fridge: 'Open', box: 'Open', bed: 'Use', workbench: 'Use', kiln: 'Use',
    jukebox: 'Use', blender: 'Use', taps: 'Use', till: 'Use', stall: 'Visit', boat: 'Visit',
    shelf: 'Browse', crate: 'Browse', hammock: 'Use', lounger: 'Use', sofa: 'Use', site: 'Check' },
  verb(o) {
    const n = String(o.name || '');
    /* A use with a word of its own for what it needs (PROMPTS, data/acts.js). */
    if (typeof PROMPTS !== 'undefined' && PROMPTS[o.use]) {
      try { const t = PROMPTS[o.use](o); if (t) return t; } catch (e) { /* fall through to the verb */ }
    }
    if (o.kind === 'exit' || o.kind === 'door') {
      return /^(out|in|up|down|back)\b/i.test(n) ? 'Go ' + n.charAt(0).toLowerCase() + n.slice(1) : 'Enter ' + n;
    }
    return (o.verb || this.VERBS[o.kind] || 'Inspect') + ' ' + this.thing(n);
  },
  /* "Read the cocktail board", not "Read The cocktail board". */
  thing(n) { return String(n || '').replace(/^(The|A|An|Your) /, m => m.toLowerCase()); },
  go() {
    if (G.state !== 'play' || !this.target) return;
    if (this.kind === 'npc') { Sfx.select(); Dialogue.openNPC(this.target); return; }
    /* People, cars and objects each fall back to the engine's act if theirs throws. */
    if (this.kind === 'ped') {
      const ped = this.target;
      const fn = Acts[ped.use] || Acts.passerby;
      Sfx.select();
      try { fn(ped); } catch (e) { console.warn(e); Acts.passerby(ped); }
      return;
    }
    if (this.kind === 'car') {
      if (Cars.driving) { Cars.getOut(); return; }
      const car = this.target;
      const fn = Acts[car.use] || Acts.parkedCar;
      Sfx.blip();
      try { fn(car); } catch (e) { console.warn(e); Acts.parkedCar(car); }
      return;
    }
    const o = this.target;
    if (o.ringing) { Sfx.select(); Phones.answer(o); return; }
    const fn = Acts[o.use] || Acts.generic;
    Sfx.blip();
    try { fn(o); } catch (e) { console.warn(e); Acts.generic(o); }
  }
};

/* ---------------- Shop (SHOP is in data/items.js) ---------------- */
const Shop = {
  open(id) {
    this.id = id;
    Panels.open('shop');
  },
  render() {
    const s = SHOP[this.id];
    let h = '<div class="h2">' + s.title + ' — ' + say('shop.pocket', { money: cash(P.money) }) + '</div><p class="empty" style="text-align:left;padding:0 0 12px">' + s.note + '</p><div class="grid">';
    s.stock.forEach(k => {
      const it = ITEMS[k];
      h += '<button class="item" data-buy="' + k + '"><div class="ih"><span class="ie">' + it.e + '</span><span class="it">' + esc(it.n) + '</span><span class="rar ' + it.r + '">' + cash(it.v) + '</span></div><div class="idesc">' + esc(it.d) + '</div>' + (it.eff ? '<div class="ieff">' + Object.keys(it.eff).map(x => '+' + it.eff[x] + ' ' + x).join(' · ') + '</div>' : '') + '</button>';
    });
    return h + '</div>';
  },
  buy(k) {
    const it = ITEMS[k];
    if (P.money < it.v) { Sfx.deny(); UI.toast('💶', say('shop.poor')); return; }
    Player.mod({ money: -it.v }); Item.give(k); Sfx.cash(); Panels.render();
    Hook('bought', k, this.id);
  }
};

/* ---------------- The panel ----------------
   One window for everything you look things up in. On a desktop the sections
   run down a sidebar in four groups, with your own card at the top of it; on
   a phone the sidebar would eat the screen, so ☰ opens a launcher of big tiles
   (Panels.r_home) and a section has a back arrow to it. */
/* The engine's tabs, with the game's own (GAME.tabs) in the Island group.
   `g` is the sidebar group. */
const TAB_GROUPS = [
  { id: 'today', n: 'Today' }, { id: 'you', n: 'You' },
  { id: 'island', n: 'Island' }, { id: 'game', n: 'Game' }
];
const TABS = [
  { id: 'quests', n: 'Jobs', e: '🗂️', g: 'today' },
  { id: 'shift', get n() { return say('tab.shift'); }, e: '💶', g: 'today' },
  { id: 'map', n: 'Map', e: '🗺️', g: 'today' },
  { id: 'inventory', n: 'Inventory', e: '🎒', g: 'you' }, { id: 'skills', n: 'Skills', e: '📈', g: 'you' },
  { id: 'stats', n: 'Profile', e: '🪪', g: 'you' },
  { id: 'ach', n: 'Achievements', e: '🏆', g: 'you' },
  ...(GAME.tabs || []).map(t => Object.assign({ g: 'island' }, t)),
  /* How everybody you have met is doing, and why — engine/mind.js. */
  { id: 'people', n: 'Islanders', e: '🌴', g: 'island' },
  { id: 'settings', n: 'Settings', e: '⚙️', g: 'game' }
];
const Panels = {
  tab: 'quests', on: false,
  /* The phone layout: the launcher instead of the sidebar. The same query the
     stylesheets use for the phone HUD. */
  narrow() { return matchMedia('(max-width:820px),(max-height:520px)').matches; },
  open(tab) {
    this.tab = tab || this.tab;
    /* The launcher is a phone thing; a desktop goes to the first section. */
    if (this.tab === 'home' && !this.narrow()) this.tab = 'quests';
    const first = !this.on;
    if (first) this._returnFocus = document.activeElement;
    this.on = true; G.state = 'panel';
    $('#panel').classList.add('on');
    this.tabs(); this.render(); Sfx.blip();
    /* Focus into the dialog, for the keyboard and screen readers. */
    if (first) setTimeout(() => { const t = $('#pnTabs .tab.on') || $('#pnBody .home-tile') || $('#pnClose'); if (t) t.focus(); }, 20);
  },
  close() {
    if (!this.on) return;
    this.on = false; $('#panel').classList.remove('on');
    if (G.state === 'panel') G.state = 'play';
    const r = this._returnFocus; this._returnFocus = null;
    if (r && r.focus && document.contains(r)) { try { r.focus(); } catch (e) {} }
  },
  /* Go to a section from inside the panel. */
  go(id) { this.tab = id; this.tabs(); this.render(); Sfx.blip(); const b = $('#pnBody'); if (b) b.scrollTop = 0; },
  /* The number on a section, if it has one worth showing: skill points to
     spend, jobs open. `hot` is the ones asking for you. */
  badge(id) {
    if (id === 'skills' && P.skillPoints) return { n: P.skillPoints, hot: true };
    if (id === 'quests') { const n = Q.list().filter(q => !q.done).length; if (n) return { n, hot: false }; }
    return null;
  },
  keyOf(id) {
    if (id === 'settings') return 'Esc';
    const k = Object.keys(PANEL_KEYS).find(k => PANEL_KEYS[k] === id);
    return k ? k.slice(3) : '';
  },
  /* Your card: the face, the level, how far to the next, the takings. */
  who() {
    const xp = clamp(P.xpv / P.xpNext * 100, 0, 100).toFixed(0);
    return '<div class="nv-who"><span class="nv-face" data-portrait="player">' + esc(P.face) + '</span>'
      + '<div class="nv-id"><b>' + esc(P.name) + '</b><span>Lv.' + P.level + ' · ' + esc(RANKS[P.rank].n) + '</span>'
      + '<i class="nv-xp" title="' + P.xpv + ' / ' + P.xpNext + ' XP"><i style="width:' + xp + '%"></i></i></div>'
      + '<div class="nv-cash"><b>💶 ' + cash(P.money) + '</b><span>Day ' + G.day + ' · ' + clockStr(G.minutes) + '</span></div></div>';
  },
  tabs() {
    const box = $('#pnTabs'); box.innerHTML = '';
    const narrow = this.narrow();
    $('#panel').classList.toggle('narrow', narrow);
    const back = $('#pnBack');
    if (back) back.hidden = !(narrow && this.tab !== 'home');
    if (narrow) return;     /* the launcher is in the body */
    box.insertAdjacentHTML('beforeend', this.who());
    TAB_GROUPS.forEach(g => {
      const list = TABS.filter(t => (t.g || 'island') === g.id);
      if (!list.length) return;
      const h = document.createElement('div');
      h.className = 'nv-h'; h.textContent = g.n;
      box.appendChild(h);
      list.forEach(t => {
        const b = document.createElement('button');
        const on = this.tab === t.id;
        b.className = 'tab' + (on ? ' on' : '');
        b.type = 'button'; b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(on));
        const bd = this.badge(t.id), key = this.keyOf(t.id);
        b.title = t.n + (key ? ' (' + key + ')' : '');
        b.innerHTML = '<span class="tab-i" aria-hidden="true">' + t.e + '</span><span class="tab-t">' + esc(t.n) + '</span>'
          + (bd ? '<span class="tab-n' + (bd.hot ? '' : ' cool') + '">' + bd.n + '</span>' : '')
          + (key ? '<span class="tab-k" aria-hidden="true">' + key + '</span>' : '');
        b.onclick = () => this.go(t.id);
        box.appendChild(b);
      });
    });
    Portrait.scan(box);
  },
  render() {
    if (!this.on) return;
    const b = $('#pnBody');
    const tab = TABS.find(t => t.id === this.tab);
    const [ic, nm] = this.tab === 'home' ? ['🌺', 'Menu'] : this.tab === 'shop' ? ['🛍️', 'Shop'] : tab ? [tab.e, tab.n] : ['', ''];
    $('#pnTitle').innerHTML = (ic ? '<span class="pt-i" aria-hidden="true">' + ic + '</span>' : '') + esc(nm);
    $('#panel').classList.toggle('at-home', this.tab === 'home');
    b.innerHTML = tab && tab.panel ? tab.panel() : this['r_' + this.tab] ? this['r_' + this.tab]() : '';
    b.querySelectorAll('[data-item]').forEach(el => el.onclick = () => Item.use(el.dataset.item));
    b.querySelectorAll('[data-uneq]').forEach(el => el.onclick = () => Item.equip(el.dataset.uneq));
    b.querySelectorAll('[data-skill]').forEach(el => {
      el.onclick = () => Sk.buy(el.dataset.branch, el.dataset.skill);
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.click(); } };
    });
    b.querySelectorAll('[data-buy]').forEach(el => el.onclick = () => Shop.buy(el.dataset.buy));
    b.querySelectorAll('[data-act]').forEach(el => el.onclick = () => Menu[el.dataset.act]());
    /* Segmented choices: data-set="setting:value". */
    b.querySelectorAll('[data-set]').forEach(el => el.onclick = () => { const [k, v] = el.dataset.set.split(':'); Menu.set(k, v); });
    /* The volume slider writes as it moves and re-renders nothing, or the drag
       would be cut off under your finger. */
    b.querySelectorAll('input[data-range]').forEach(el => {
      el.oninput = () => { Menu.range(el.dataset.range, +el.value); const o = el.parentElement.querySelector('output'); if (o) o.textContent = el.value + '%'; };
      el.onchange = () => { Settings.save(); Sfx.blip(); };
    });
    b.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => this.go(el.dataset.tab));
    /* "Show me where": data-pin="level:@site" drops your pin there and closes. */
    b.querySelectorAll('[data-pin]').forEach(el => el.onclick = () => {
      const [lv, ref] = el.dataset.pin.split(':');
      this.close();
      Guide.pinAt(lv, ref, el.dataset.pinLabel || '');
    });
    b.querySelectorAll('[data-comms]').forEach(el => el.onclick = () => { this.close(); Comms.toggle(el.dataset.comms || null); });
    /* The map canvas has no size until layout, so it is drawn after the body. */
    if (this.tab === 'map') { Atlas.panel(); const mc = $('#mapCv'); if (mc) mc.onclick = e => { Atlas.click(e); this.render(); }; }
    Portrait.scan(b);   /* live faces on the cards */
  },
  /* The launcher, on a phone: your card, then every section as a tile. */
  r_home() {
    let h = this.who();
    TAB_GROUPS.forEach(g => {
      const list = TABS.filter(t => (t.g || 'island') === g.id);
      if (!list.length) return;
      h += '<div class="nv-h">' + g.n + '</div><div class="home-grid">';
      list.forEach(t => {
        const bd = this.badge(t.id);
        h += '<button class="home-tile" type="button" data-tab="' + t.id + '"><span class="ht-i" aria-hidden="true">' + t.e + '</span>'
          + '<span class="ht-t">' + esc(t.n) + '</span>'
          + (bd ? '<span class="tab-n' + (bd.hot ? '' : ' cool') + '">' + bd.n + '</span>' : '') + '</button>';
      });
      /* Messages sit with today's things: on a phone they are otherwise one small chip. */
      if (g.id === 'today') {
        const n = Comms.total();
        h += '<button class="home-tile" type="button" data-comms=""><span class="ht-i" aria-hidden="true">📨</span><span class="ht-t">Messages</span>'
          + (n ? '<span class="tab-n">' + n + '</span>' : '') + '</button>';
      }
      h += '</div>';
    });
    h += '<div class="home-quick"><button class="btn small" data-act="save">💾 Save</button><button class="btn small" data-act="load">↻ Load</button></div>';
    return h;
  },
  r_shop() { return Shop.render(); },
  r_people() { return Mind.panel(); },
  /* Where you are, the map (Atlas.panel draws it) and a short legend. */
  r_map() {
    const here = World.zoneAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE));
    const level = (World.def && World.def.name) || '';
    const room = (here && ZONES[here] && ZONES[here].name) || '';
    return '<div class="h2">' + esc(level) + (room ? ' · <span class="mp-here">' + esc(room) + '</span>' : '') + '</div>'
      + '<div class="mp-wrap"><canvas id="mapCv"></canvas></div>'
      + '<div class="mp-key">'
      + '<span><i class="mp-you"></i>You</span>'
      + '<span><i class="mp-out"></i>The way out, and where it goes</span>'
      + '<span><i class="mp-pin"></i>What you are looking for</span>'
      + '<span><i class="mp-npc"></i>People</span>'
      + '<span><i class="mp-car"></i>Something you can drive</span>'
      + '<span><i class="mp-ring"></i>A guest waiting at the bar</span>'
      + '<span><i class="mp-flag"></i>' + esc(say(Guide.pinned ? 'pin.keyOn' : 'pin.key', { tap: Guide.pinned ? (TOUCH ? 'tap' : 'click') : (TOUCH ? 'Tap' : 'Click') })) + '</span>'
      + '</div>';
  },
  /* Today: a live tally while the day runs, the report with its rating after
     closing. The rows are Report's. */
  r_shift() {
    const done = !!G.today.clockedOff;
    const head = done
      ? say('shift.after', { time: clockStr(G.minutes) })
      : Sky.working()
        ? say('shift.during', { time: clockStr(G.minutes) })
        : say('shift.before', { time: clockStr(G.minutes) });
    let h = '<div class="h2">' + say('dayBanner', { day: G.day, name: DAYS[(G.day - 1) % 7] || DAYS[0] }) + '</div>'
      + '<p style="color:var(--dim);font-size:13px;margin-bottom:12px">' + esc(head) + '</p>'
      + Report.rows().map(r => '<div class="rep-row"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>').join('');
    if (done) {
      const v = Report.verdict();
      h += '<div class="verdict"><div class="sk" style="font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--dim)">' + say('shift.verdict') + '</div>'
        + '<div class="vt">“' + v[0] + '”</div><div class="vn">*' + v[1] + '</div></div>';
      if (G.today.leaving)
        h += '<p style="margin-top:14px;font-size:13px;color:var(--dim);font-style:italic">' + esc(G.today.leaving) + '</p>';
    } else {
      h += '<p style="margin-top:14px;font-size:13px;color:var(--dim);font-style:italic">'
        + (Sky.working()
          ? say('shift.rating')
          : say('shift.opens', { time: clockStr(DAY_START) })) + '</p>';
    }
    return h;
  },
  r_quests() {
    const list = Q.list();
    if (!list.length) return '<p class="empty">' + say('jobs.none') + '</p>';
    let h = '<div class="h2">Open</div>';
    const open = list.filter(q => !q.done), done = list.filter(q => q.done);
    h += open.length ? open.map(q => this.quest(q)).join('') : '<p class="empty">Nothing open. Suspicious.</p>';
    if (done.length) h += '<div class="h2">Closed</div>' + done.map(q => this.quest(q)).join('');
    return h;
  },
  quest(q) {
    return '<div class="quest' + (q.done ? ' done' : '') + '"><span class="giver">from ' + esc(q.giver) + '</span><h4>' + esc(q.n) + '</h4>' +
      q.steps.map((s, i) => '<div class="step" style="opacity:' + (i <= q.step || q.done ? 1 : .35) + '">' + esc(s) + (i < q.step || q.done ? ' ✔' : '') + '</div>').join('') +
      '<div class="rw">Reward: ' + q.rw.xp + ' XP' + (q.rw.money ? ' · ' + cash(q.rw.money) : '') + (q.rw.item ? ' · ' + ITEMS[q.rw.item].e + ' ' + ITEMS[q.rw.item].n : '') + '</div></div>';
  },
  r_inventory() {
    let h = '<div class="h2">Equipped</div><div class="grid">';
    let any = false;
    for (const slot in P.equipment) {
      const id = P.equipment[slot]; if (!id) continue; any = true;
      const it = ITEMS[id];
      h += '<button class="item" data-uneq="' + id + '"><div class="ih"><span class="ie">' + it.e + '</span><span class="it">' + esc(it.n) + '</span><span class="rar ' + it.r + '">' + sayOr('slot.' + slot, slot) + '</span></div><div class="ieff">' + Object.keys(it.eff || {}).map(k => '+' + it.eff[k] + ' ' + sayOr('stat.' + k, k)).join(' · ') + '</div><div class="idesc">Click to unequip</div></button>';
    }
    if (!any) h += '<p class="empty">Nothing equipped.</p>';
    h += '</div><div class="h2">Carried (' + P.inventory.length + ')</div>';
    if (!P.inventory.length) return h + '<p class="empty">' + say('inv.empty') + '</p>';
    const counts = {};
    P.inventory.forEach(i => counts[i] = (counts[i] || 0) + 1);
    const tap = TOUCH ? 'Tap' : 'Click';
    /* What eating or drinking it does, at a glance. */
    const gives = u => [['food', '🍽️'], ['energy', '⚡'], ['patience', '❤️']]
      .filter(([k]) => u[k]).map(([k, e]) => e + (u[k] > 0 ? '+' : '') + u[k]).join(' ');
    const card = id => {
      const it = ITEMS[id], u = it.use && typeof it.use === 'object' ? it.use : null;
      const how = it.slot ? tap + ' to equip'
        : u && u.food ? tap + ' to eat' + (gives(u) ? ' · ' + gives(u) : '')
        : it.use ? tap + ' to use' + (u && gives(u) ? ' · ' + gives(u) : '')
        : it.quest ? 'Quest item'
        : typeof TOOLS !== 'undefined' && TOOLS[id] ? Gear.left(id) + '/' + TOOLS[id].uses + ' jobs left'
        : tap + ' to examine';
      return '<button class="item" data-item="' + id + '"><div class="ih"><span class="ie">' + it.e + '</span><span class="it">' + esc(it.n) + (counts[id] > 1 ? ' ×' + counts[id] : '') + '</span><span class="rar ' + it.r + '">' + it.r + '</span></div><div class="idesc">' + esc(it.d) + '</div>' +
        (it.eff ? '<div class="ieff">' + Object.keys(it.eff).map(k => '+' + it.eff[k] + ' ' + sayOr('stat.' + k, k)).join(' · ') + '</div>' : '') +
        '<div class="ieff" style="color:var(--dim)">' + how + '</div></button>';
    };
    /* Grouped, so a bag full of driftwood does not bury the lunch. */
    const mats = typeof MATERIALS !== 'undefined' ? MATERIALS : [];
    const tools = typeof TOOLS !== 'undefined' ? TOOLS : {};
    const groups = [['Food & drink', []], ['Tools', []], ['Materials', []], ['Everything else', []]];
    Object.keys(counts).forEach(id => {
      const it = ITEMS[id], u = it.use;
      const g = u && typeof u === 'object' && u.food ? 0 : tools[id] ? 1 : mats.includes(id) ? 2 : 3;
      groups[g][1].push(id);
    });
    const shown = groups.filter(g => g[1].length);
    shown.forEach(([name, ids]) => {
      if (shown.length > 1) h += '<div class="inv-g">' + name + '</div>';
      h += '<div class="grid">' + ids.map(card).join('') + '</div>';
    });
    return h;
  },
  r_skills() {
    const pts = P.skillPoints > 0;
    let h = '<div class="h2">Skill points available: ' + P.skillPoints + '</div>'
      + '<p class="idesc sk-hint">' + (pts
        ? (TOUCH ? 'Tap' : 'Click') + ' a skill to learn its next rank.'
        : 'You earn a point each time you level up.') + '</p><div class="tree">';
    for (const bk in SKILLS) {
      const br = SKILLS[bk];
      h += '<div class="branch"><h4 style="color:' + br.colour + '">' + br.name + '</h4>';
      for (const sk in br.list) {
        const d = br.list[sk], r = Sk.rank(sk);
        const can = pts && r < d.max;
        h += '<div class="skill' + (r >= d.max ? ' maxed' : '') + (can ? ' can' : '') + '" role="button" tabindex="0" aria-label="' + esc(d.n) + ', rank ' + r + ' of ' + d.max + '" data-skill="' + sk + '" data-branch="' + bk + '"><div style="flex:1"><div class="sn">' + esc(d.n) + '</div><div class="idesc" style="margin:2px 0 0">' + esc(d.d) + '</div></div><span class="pips">' + '●'.repeat(r) + '○'.repeat(d.max - r) + '</span></div>';
      }
      h += '</div>';
    }
    return h + '</div>';
  },
  r_ach() {
    const got = Ach.count();
    return '<div class="h2">' + got + ' / ' + Object.keys(ACHS).length + ' unlocked</div>' +
      Object.keys(ACHS).map(k => {
        const a = ACHS[k], has = G.achievements[k];
        return '<div class="ach' + (has ? ' got' : '') + '" style="margin-bottom:8px"><span class="ae">' + a.e + '</span><div><div class="at">' + esc(has ? a.n : '???') + '</div><div class="ad">' + esc(a.d) + '</div></div></div>';
      }).join('');
  },
  r_stats() {
    const s = P.eff || P.stats;
    /* Named by TEXT's `stat.<key>` and `statNote.<key>`. */
    let h = '<div class="h2">' + say('stats.title') + '</div><div class="stat-grid">';
    ['empathy', 'knowledge', 'patience', 'bullshit', 'chaos'].forEach(k => {
      h += '<div class="stat-box"><div class="sk">' + say('stat.' + k) + '</div><div class="sv">' + (s[k] || 0).toFixed(1) + '</div><div class="sn">' + say('statNote.' + k) + '</div></div>';
    });
    /* Lifetime totals, labelled like the day's report. */
    h += '</div><div class="h2">' + say('stats.allTime') + '</div><div class="stat-grid">';
    const t = G.totals;
    Object.keys(t).filter(k => TEXT['report.' + k] && k !== 'money' && k !== 'xp')
      .map(k => [say('report.' + k), t[k] || 0]).concat([[say('stats.rep'), Math.round(P.rep)]]).forEach(([k, v]) => {
      h += '<div class="stat-box"><div class="sk">' + k + '</div><div class="sv">' + v + '</div></div>';
    });
    /* People with no `level` are colleagues; the rest run places elsewhere.
       Where somebody lives shows once you have seen them go home. */
    const box = n => '<div class="stat-box"><div class="sk">' + n.face + ' ' + esc(n.name)
      + '</div><div class="sn">' + Rel.label(G.rel[n.id])
      + (G.flags.sawThemGo && n.home ? '<br><i>' + esc(n.home.where) + '</i>' : '')
      + '</div></div>';
    const known = NPCS.filter(n => G.rel[n.id] !== undefined);
    const staff = known.filter(n => !n.level), town = known.filter(n => n.level);
    h += '</div><div class="h2">' + say('stats.colleagues') + '</div><div class="stat-grid">';
    staff.forEach(n => { h += box(n); });
    if (town.length) {
      h += '</div><div class="h2">' + say('stats.town') + '</div><div class="stat-grid">';
      town.forEach(n => { h += box(n); });
    }
    return h + '</div>';
  },
  /* The tabs a player looks things up in, each with its shortcut, for the help. */
  tabList() {
    const keyOf = id => Object.keys(PANEL_KEYS).find(k => PANEL_KEYS[k] === id);
    return TABS.filter(t => !['map', 'shift', 'settings'].includes(t.id)).map(t => ({ n: t.n, key: keyOf(t.id) }));
  },
  r_settings() {
    /* A row: the words on the left, the control on the right. */
    const row = (label, desc, ctl) => '<div class="setting"><div class="sl">' + label
      + (desc ? '<div class="sd">' + desc + '</div>' : '') + '</div>' + ctl + '</div>';
    /* An on/off switch, which is what these are, rather than a button that says so. */
    const sw = (act, on, label) => '<button class="switch" type="button" role="switch" aria-checked="' + !!on
      + '" aria-label="' + label + '" data-act="' + act + '"><i></i></button>';
    /* A choice of a few: one segment each, the current one lit. */
    const seg = (k, opts, cur, label) => '<div class="seg" role="radiogroup" aria-label="' + label + '">'
      + opts.map(([v, t]) => '<button type="button" role="radio" aria-checked="' + (v === cur) + '" class="' + (v === cur ? 'on' : '')
        + '" data-set="' + k + ':' + v + '">' + t + '</button>').join('') + '</div>';
    const vol = Math.round(Sfx.volume * 100);
    const speed = Dialogue.speed >= 999 ? 'instant' : Dialogue.speed >= 140 ? 'fast' : Dialogue.speed >= 60 ? 'normal' : 'slow';
    const emoji = R.emojiScale <= .9 ? 's' : R.emojiScale >= 1.2 ? 'l' : 'm';
    const k = (key, what) => '<div class="key"><span class="kbd">' + key + '</span><span>' + what + '</span></div>';
    let h = '<div class="set-save">'
      + '<button class="btn" data-act="save">💾 Save</button>'
      + '<button class="btn" data-act="load">↻ Load</button>'
      + '<button class="btn danger" data-act="newgame">🗑️ New game</button>'
      + '<span class="sd">The game also saves itself every hour, and whenever you close or leave the tab, in this browser.</span></div>';
    h += '<div class="h2">Sound</div><div class="set-card">'
      + row('Sound effects', '', sw('sound', Sfx.on, 'Sound effects'))
      + row('Bar music', 'Plays while you serve.', sw('music', Sfx.music, 'Bar music'))
      + row('Volume', '', '<div class="range"><input type="range" min="0" max="100" step="2" value="' + vol + '" data-range="vol" aria-label="Volume"><output>' + vol + '%</output></div>')
      + '</div>';
    h += '<div class="h2">Notifications</div><div class="set-card">'
      + row('Pop-ups', Comms.pop === 'all'
          ? 'Every channel interrupts you, the chat included.'
          : Comms.pop === 'none'
          ? 'Nothing interrupts you. Everything still arrives — the counts on the rail are how you know.'
          : 'Post, texts and anything that needs an answer interrupt you. The chat and the guest log go to the rail quietly.',
        seg('pops', [['all', 'All'], ['needed', 'Needed'], ['none', 'None']], Comms.pop, 'Pop-ups'))
      + '</div>';
    h += '<div class="h2">Display &amp; accessibility</div><div class="set-card">'
      + row('Animation', 'Bobbing, blinking, ringing, ripples.', sw('anim', R.animate, 'Animation'))
      + row('Reduced motion', 'No screen shake, splashes or particles; a still title screen. Follows your system setting by default.', sw('motion', !FX.motion, 'Reduced motion'))
      + row('Emoji size', '', seg('emoji', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], emoji, 'Emoji size'))
      + row('Text speed', 'How fast dialogue types itself out.', seg('speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']], speed, 'Text speed'))
      + '</div>';
    if (TOUCH) {
      h += '<div class="h2">Controls</div><div class="set-card">'
        + row('Movement', 'The stick appears wherever you put your thumb down in the bottom ' + Hand.padSide() + '. The pad is four buttons in a fixed cross.',
          seg('pad', [['stick', '🕹️ Stick'], ['dpad', '✚ Pad']], Hand.pad, 'Movement control'))
        + row('Left-handed layout', 'Mirrors the on-screen controls.', sw('southpaw', Hand.left, 'Left-handed layout'))
        + row('Fullscreen', 'Reclaims the part of the phone the browser keeps for itself. Not offered by every browser.',
          '<button class="btn small" data-act="fullscreen">' + (document.fullscreenElement || document.webkitFullscreenElement ? 'Exit' : 'Enter') + '</button>')
        + '</div>';
      h += '<div class="h2">How to play</div><div class="keys">'
        + k(Hand.pad === 'dpad' ? 'Pad' : 'Stick', 'walk — push further to run')
        + k('E', 'talk, use, pick up, get out')
        + k('⤒', 'jump · dive when swimming')
        + k('☰', 'this menu')
        + k('📨', 'post, texts, chat and the log')
        + k('Drive', Hand.pad === 'dpad' ? 'the pad steers and drives' : 'left stick steers, amber stick is the throttle')
        + '</div>';
    } else {
      h += '<div class="h2">Keys</div><div class="keys">'
        + k('W A S D', 'walk, and drive') + k('Shift', 'hold to run') + k('Space', 'jump · dive when swimming') + k('E', 'talk, use, get out')
        + k('F', 'eat something from your bag') + k('G', 'take it out · Q swaps · R reloads') + k('H', 'horn') + k('1–9', 'choose a reply or a move')
        + this.tabList().filter(t => t.key).map(t => k(t.key.slice(3), t.n.toLowerCase())).join('')
        + k('M', 'post') + k('C', 'island chat') + k('V', 'texts') + k('B', 'the log')
        + k('Esc', 'this menu') + k('F5 / F9', 'quick save / load')
        + '</div>';
    }
    return h;
  }
};
