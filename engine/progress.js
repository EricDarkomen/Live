'use strict';
/* ---------------- The player: stats, inventory, skills, people, jobs ---------------- */
const Player = {
  init(name) {
    Object.assign(P, freshPlayer(), { name });
    if (RANKS[0].face) P.face = RANKS[0].face;
    Item.give('headset0', true); Item.equip('headset0', true);
    this.recalc(); P.patience = P.patMax; P.energy = P.eneMax;
  },
  /* Stats from base, worn items and skill ranks (SKILLS `eff`). An item's
     patience also raises the maximum; its energy is the energy maximum. */
  recalc() {
    const eq = {}, sk = Sk.effects();
    Object.values(P.equipment).forEach(id => {
      if (id && ITEMS[id] && ITEMS[id].eff) for (const k in ITEMS[id].eff) eq[k] = (eq[k] || 0) + ITEMS[id].eff[k];
    });
    const stat = k => P.stats[k] + (eq[k] || 0) + (sk[k] || 0);
    P.eff = {
      empathy: stat('empathy'), knowledge: stat('knowledge'), bullshit: stat('bullshit'), chaos: stat('chaos'),
      patience: P.stats.patience + (eq.patience || 0)
    };
    P.patMax = 100 + (sk.patMax || 0) + (eq.patience || 0);
    P.eneMax = 100 + (eq.energy || 0) + (sk.eneMax || 0);
    P.patience = clamp(P.patience, 0, P.patMax); P.energy = clamp(P.energy, 0, P.eneMax);
  },
  xp(n) {
    if (n <= 0) return;
    P.xpv += n; G.todayStats.xp = (G.todayStats.xp || 0) + n;
    UI.float('+' + n + ' XP', '#4da3ff'); Sfx.xp();
    while (P.xpv >= P.xpNext) {
      P.xpv -= P.xpNext; P.level++; P.xpNext = Math.round(P.xpNext * 1.35 + 25);
      P.skillPoints++; Sfx.levelup(); FX.burst(P.x, P.y, '⭐', 16, '#ffb347'); FX.shake(5);
      UI.toast('⭐', say('levelUp', { level: P.level }), 'gold');
      const nr = RANKS.filter(r => r.lv <= P.level).length - 1;
      if (nr > P.rank) {
        P.rank = nr; P.face = RANKS[P.rank].face || P.face;
        UI.toast(RANKS[P.rank].e, say('promoted', { rank: RANKS[P.rank].n }), 'gold');
      }
      this.recalc();
    }
    UI.hud();
  },
  mod(o) {
    if (o.patience) { P.patience = clamp(P.patience + o.patience, 0, P.patMax); UI.float((o.patience > 0 ? '+' : '') + Math.round(o.patience) + ' ❤️', o.patience > 0 ? '#5ad48a' : '#ff5f56'); }
    if (o.energy) { P.energy = clamp(P.energy + o.energy, 0, P.eneMax); UI.float((o.energy > 0 ? '+' : '') + Math.round(o.energy) + ' ⚡', o.energy > 0 ? '#ffb347' : '#ff5f56'); }
    if (o.money) { P.money = Math.max(0, P.money + o.money); if (o.money > 0) G.todayStats.money = (G.todayStats.money || 0) + o.money; UI.float((o.money > 0 ? '+' : '−') + cash(o.money), o.money > 0 ? '#ffb347' : '#ff5f56'); if (o.money > 0) Sfx.cash(); }
    if (o.rep) { P.rep = clamp(P.rep + o.rep, -50, 120); if (P.rep >= 100) Ach.get('a_legend'); }
    if (P.patience <= 0) this.burnout();
    UI.hud();
  },
  burnout() {
    P.patience = Math.round(P.patMax * 0.35);
    UI.toast('🫠', say('burnout'), 'bad');
    /* Recover at WP.burnout if the game names one on this level. */
    const w = WP.burnout;
    if (w && (!w[2] || w[2] === Levels.current)) { P.x = (w[0] + .5) * TILE; P.y = (w[1] + .5) * TILE; }
    G.minutes += 12; count('toiletMin', 12); FX.shake(8);
  }
};

/* ---------------- Inventory ---------------- */
const Item = {
  give(id, quiet) {
    if (!ITEMS[id]) return;
    P.inventory.push(id);
    /* An item with `gun:` is the gun itself: getting it loads it. */
    if (ITEMS[id].gun) Guns.give(ITEMS[id].gun);
    if (!quiet) { UI.toast(ITEMS[id].e, say('obtained', { item: ITEMS[id].n }), 'gold'); FX.burst(P.x, P.y, ITEMS[id].e, 6); }
  },
  has(id) { return P.inventory.includes(id); },
  take(id) { const i = P.inventory.indexOf(id); if (i >= 0) P.inventory.splice(i, 1); },
  equip(id, quiet) {
    const it = ITEMS[id]; if (!it || !it.slot) return;
    const prev = P.equipment[it.slot];
    if (prev === id) {
      /* Unequipping hands the item back. */
      P.equipment[it.slot] = null; P.inventory.push(id); Player.recalc();
      if (!quiet) { UI.toast(it.e, say('unequipped', { item: it.n })); Sfx.blip(); }
      Panels.render(); UI.hud(); return;
    }
    if (prev) P.inventory.push(prev);
    this.take(id); P.equipment[it.slot] = id; Player.recalc();
    if (!quiet) { UI.toast(it.e, say('equipped', { item: it.n })); Sfx.select(); }
    Panels.render(); UI.hud();
  },
  use(id) {
    const it = ITEMS[id]; if (!it) return;
    if (it.slot) return this.equip(id);
    /* Using a gun takes it out (and picks it); it is not consumed. */
    if (it.gun) {
      if (!Guns.select(it.gun)) return;
      Panels.close();
      Guns.arm(true);
      return;
    }
    if (!it.use) { UI.toast(it.e, say('useNothing')); return; }
    /* `use` is data, { energy, patience, money, rep, food, minutes, stats: {},
       count: {}, ach, flag, sfx, t }, or the name of a function in `Uses`. */
    const fn = typeof it.use === 'string' && Uses[it.use];
    if (typeof it.use === 'string' && !fn) { UI.toast(it.e, say('useNothing')); return; }
    this.take(id);
    if (fn) fn(it); else this.consume(it);
    Panels.render(); UI.hud();
  },
  consume(it) {
    const u = it.use;
    if (u.minutes) G.minutes += u.minutes;
    const m = {}; ['energy', 'patience', 'money', 'rep'].forEach(k => { if (u[k]) m[k] = u[k]; });
    Player.mod(m);
    if (u.food) Hunger.eat(u.food);   /* data/farm.js */
    Object.entries(u.stats || {}).forEach(([k, n]) => { P.stats[k] = (P.stats[k] || 0) + n; });
    Object.entries(u.count || {}).forEach(([k, n]) => count(k, n));
    if (u.flag) G.flags[u.flag] = true;
    if (u.ach) Ach.get(u.ach);
    if (u.sfx && Sfx[u.sfx]) Sfx[u.sfx]();
    if (u.t) UI.toast(it.e, u.t, u.cls || '');
  },
  count() { return P.inventory.length; }
};

/* ---------------- Skills ---------------- */
const Sk = {
  rank(id) { return P.skills[id] || 0; },
  /* What every skill's ranks add up to, by effect. */
  effects() {
    const out = {};
    for (const b in SKILLS) for (const id in SKILLS[b].list) {
      const r = this.rank(id), eff = SKILLS[b].list[id].eff;
      if (r && eff) for (const k in eff) out[k] = (out[k] || 0) + eff[k] * r;
    }
    return out;
  },
  grant(n) { P.skillPoints += n; UI.toast('🌳', say('skillPoint', { n }), 'gold'); },
  buy(branch, id) {
    const def = SKILLS[branch].list[id];
    if (P.skillPoints <= 0) { Sfx.deny(); UI.toast('🚫', say('noSkillPoints')); return; }
    if (this.rank(id) >= def.max) { Sfx.deny(); return; }
    P.skills[id] = this.rank(id) + 1; P.skillPoints--;
    Sfx.levelup(); Player.recalc(); Panels.render(); UI.hud();
    UI.toast('🌳', say('skillRank', { skill: def.n, rank: P.skills[id] }), 'gold');
  }
};

/* ---------------- Relationships ---------------- */
const Rel = {
  add(id, n) {
    G.rel[id] = clamp((G.rel[id] || 0) + n, -10, 10);
    if (n > 0) FX.float(P.x, P.y - 40, '♥ ' + (NPCS.find(x => x.id === id) || {}).name, '#ff9ec7');
    /* It shows on their face for a moment, and in hearts off their portrait. */
    if (n) Faces.flash(id, n > 0 ? 'happy' : 'sad', 2.4);
    if (n) Portrait.burst(id, n > 0 ? '💕' : '💢', n > 0 ? 3 + Math.min(4, n) : 3);
  },
  get(id) { return G.rel[id] || 0; },
  label(v) { const l = says('relLabels'); return l[v >= 8 ? 0 : v >= 5 ? 1 : v >= 2 ? 2 : v >= 0 ? 3 : v >= -3 ? 4 : 5]; }
};

/* ---------------- Quests ---------------- */
const Q = {
  /* The objective line when no job is open, picked by the clock and by
     whether you are on site. */
  IDLE: {
    get desk() { return say('idle.desk'); },
    get out() { return say('idle.out'); },
    get off() { return say('idle.off'); }
  },
  idle() {
    if (!Sky.working()) return this.IDLE.off;
    return Levels.onSite() ? this.IDLE.desk : this.IDLE.out;
  },
  /* Restore the standing line, but never over an act's own instruction. */
  restand() {
    if (!G.objective || Object.keys(this.IDLE).some(k => this.IDLE[k] === G.objective))
      UI.objective(this.idle());
  },
  start(id) {
    if (G.quests[id]) return;
    G.quests[id] = { step: 0, done: false, out: null };
    UI.toast('❗', say('newJob', { job: QUESTS[id].n }), 'gold');
    UI.objective(QUESTS[id].steps[0]);
    /* The pin is easy to miss: said once. */
    if (!G.flags.sawTracker) {
      G.flags.sawTracker = true;
      UI.toast('📍', say('trackerTip', { press: TOUCH ? 'Tap' : 'Click' }));
    }
  },
  active(id) { return G.quests[id] && !G.quests[id].done; },
  complete2(id) { return G.quests[id] && G.quests[id].done; },
  step(id) {
    if (!this.active(id)) return;
    const q = G.quests[id];
    q.step = Math.min(q.step + 1, QUESTS[id].steps.length - 1);
    UI.toast('📌', QUESTS[id].n + ' — ' + QUESTS[id].steps[q.step]);
    UI.objective(QUESTS[id].steps[q.step]);
  },
  complete(id, outcome) {
    if (!this.active(id)) return;
    const q = G.quests[id]; q.done = true; q.out = outcome || 'done';
    const rw = QUESTS[id].rw;
    Player.xp(rw.xp); if (rw.money) Player.mod({ money: rw.money }); if (rw.item) Item.give(rw.item);
    Player.mod({ rep: 8 });
    UI.toast('✅', 'Completed: <b>' + QUESTS[id].n + '</b>', 'good');
    FX.burst(P.x, P.y, '⭐', 14, '#ffb347');
    const next = Object.keys(G.quests).find(k => !G.quests[k].done);
    UI.objective(next ? QUESTS[next].steps[G.quests[next].step] : this.idle());
  },
  list() { return Object.keys(G.quests).map(k => ({ id: k, ...QUESTS[k], ...G.quests[k] })); }
};

/* ---------------- The job tracker ----------------
   The objective and the open jobs. One job is followed at a time, and its
   current step's target (a person followed live, an object or a waypoint)
   gets the guide's pin and arrow. All state is in G, so a save keeps it. */
const Track = {
  _sig: null,
  init() {
    /* pointerdown, so a tap does not wait out the double-tap delay; the click
       handler swallows the ghost click after a tap and serves the keyboard,
       told apart by time. */
    const tap = (sel, fn) => {
      const el = $(sel); if (!el) return;
      let pointered = 0;
      el.addEventListener('pointerdown', e => {
        if (!fn(e)) return;
        pointered = Date.now();
        e.preventDefault(); Sfx.init();
      });
      el.addEventListener('click', e => {
        e.preventDefault();
        if (Date.now() - pointered > 700) fn(e);
      });
    };
    tap('#tkFold', () => { G.tkFold = !G.tkFold; this._sig = null; Sfx.blip(); return true; });
    tap('#tkTitles', () => { G.tkTitles = !G.tkTitles; this._sig = null; Sfx.blip(); return true; });
    tap('#gdMain', () => { this.show(!this.open); Sfx.blip(); return true; });
    tap('#tkList', e => {
      const b = e.target && e.target.closest ? e.target.closest('[data-tk]') : null;
      if (!b) return false;
      if (b.dataset.tk === 'all') { this.show(false); Panels.open('quests'); return true; }
      this.follow(b.dataset.q);
      this.show(false);
      return true;
    });
    /* Anywhere else closes the list. */
    document.addEventListener('pointerdown', e => {
      if (this.open && !(e.target.closest && e.target.closest('#guide'))) this.show(false);
    }, true);
    const g = $('#guide');
    if (g) {
      g.addEventListener('pointerenter', () => { this.hover = true; this.wake(); });
      g.addEventListener('pointerleave', () => { this.hover = false; });
    }
    this.measure();
    /* --hud-h is measured, not guessed: safe areas, rows and wrapping vary. */
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => this.measure());
      ['#hudTop', '#hudTL', '#hudTR'].forEach(s => { const el = $(s); if (el) ro.observe(el); });
    }
    addEventListener('resize', () => this.measure());
  },
  measure() {
    const bar = $('#hudTop'), right = $('#hudTR'), s = document.documentElement.style;
    if (!bar) return;
    /* Zero on a desktop, where the stylesheet's fallback stands. */
    const h = bar.getBoundingClientRect().height;
    if (h) s.setProperty('--hud-h', Math.round(h) + 'px');
    if (right) s.setProperty('--hudr-h', Math.round(right.getBoundingClientRect().height) + 'px');
  },
  /* Follow a job; following the one already followed lets go. */
  follow(id, quiet) {
    const prev = G.track;
    if (id && prev === id) id = null;
    G.track = id || null;
    this._sig = null;
    /* Letting go on purpose stops the next new job being picked up. */
    if (!quiet) G.trackOff = !id;
    if (quiet) return;
    Sfx.select();
    if (!id) {
      if (prev && QUESTS[prev]) UI.toast('📍', say('track.stop', { job: esc(QUESTS[prev].n) }));
      return;
    }
    if (!QUESTS[id]) return;
    const t = this.target(id);
    UI.toast('📍', say(t ? 'track.on' : 'track.noFix', { job: esc(QUESTS[id].n) }));
  },
  /* Where the current step of a job points, if anywhere. */
  target(id) {
    const q = QUESTS[id], st = G.quests[id];
    if (!q || !st || st.done || !q.track) return null;
    return q.track[st.step] || null;
  },
  /* Point the guide at the followed job; false if nothing is followed. */
  aim() {
    if (Guide.sticky) Guide.clear();
    const id = G.track;
    if (!id || !Q.active(id)) return false;
    return Guide.aim(this.target(id));
  },
  /* ---- the guide ----
     One line: the followed step (or the objective), which way and how far, and
     progress dots. It adopts new jobs unless you let go on purpose, fades while
     you walk, ticks finished steps off and glows for new jobs. */
  open: false, hover: false, _last: null, _known: null, _farAt: 0, _changed: 0,
  show(on) {
    this.open = !!on;
    const list = $('#tkList'), main = $('#gdMain'), g = $('#guide');
    if (list) list.hidden = !this.open;
    if (main) main.setAttribute('aria-expanded', String(this.open));
    if (g) g.classList.toggle('open', this.open);
    this.wake();
  },
  wake() { this._changed = performance.now(); const g = $('#guide'); if (g) g.classList.remove('quiet'); },
  flash(kind) {
    const g = $('#guide');
    if (!g) return;
    g.classList.remove('done', 'fresh'); void g.offsetWidth; g.classList.add(kind);
    setTimeout(() => g.classList.remove(kind), 1400);
    this.wake();
  },
  /* Once a frame from UI.hud(): the list is rebuilt only when it changes. */
  sync() {
    const open = Q.list().filter(q => !q.done);
    if (G.track && !Q.active(G.track)) this.follow(null, true);
    /* Follow the newest job if nothing is followed; after a load, the first. */
    const ids = open.map(q => q.id);
    if (this._known === null) {
      this._known = new Set(ids);
      if (!G.track && !G.trackOff && ids.length) this.follow(ids[0], true);
    } else {
      const fresh = ids.filter(i => !this._known.has(i));
      if (fresh.length) {
        fresh.forEach(i => this._known.add(i));
        if (!G.track && !G.trackOff) { this.follow(fresh[fresh.length - 1], true); this.flash('fresh'); }
      }
    }
    const sig = [G.objective, G.track, open.map(q => q.id + q.step).join(',')].join('|');
    if (sig !== this._sig) {
      this._sig = sig;
      /* A step of the followed job done: tick it off. */
      const cur = G.track && G.quests[G.track] ? { id: G.track, step: G.quests[G.track].step } : null;
      if (cur && this._last && this._last.id === cur.id && cur.step > this._last.step) this.flash('done');
      this._last = cur;
      this.render(open);
      /* Nothing to point at: back to your own desk if that is still owed. */
      if (!this.aim() && Guide.tx === null) Guide.setObject('playerDesk', say('yourDesk'), 'foundDesk');
    }
    this.point();
  },
  /* Which way, and how far. */
  point() {
    const now = performance.now();
    if (now - this._farAt < 350) return;
    this._farAt = now;
    const far = $('#gdFar'), arrow = $('#gdArrow'), g = $('#guide');
    if (!far || !arrow || !g) return;
    const on = Guide.tx !== null && G.state !== 'title';
    g.classList.toggle('aimed', on);
    if (on) {
      const n = Guide.steps();
      far.textContent = n <= 1 ? 'here' : n + (n === 1 ? ' step' : ' steps');
      const a = Math.atan2((Guide.ty + .5) * TILE - P.y, (Guide.tx + .5) * TILE - P.x);
      arrow.style.transform = 'rotate(' + (a * 180 / Math.PI).toFixed(0) + 'deg)';
      g.classList.toggle('near', n <= 3);
    } else { far.textContent = ''; arrow.style.transform = ''; g.classList.remove('near'); }
    /* Fade while walking, when nothing is new and nobody is looking. */
    const idle = now - this._changed > 6000;
    g.classList.toggle('quiet', idle && !!P.moving && !this.hover && !this.open);
  },
  render(open) {
    const box = $('#tkList'), el = $('#tracker');
    if (!box || !el) return;
    const id = G.track && Q.active(G.track) ? G.track : null;
    const q = id && QUESTS[id], st = id && G.quests[id];
    const lbl = $('#tkLbl'), step = $('#gdStep'), dots = $('#gdDots'), n = $('#tkCount');
    if (q) {
      lbl.textContent = q.n;
      step.textContent = q.steps[st.step] || '';
      dots.innerHTML = q.steps.map((_, i) => '<i class="' + (i < st.step ? 'd' : i === st.step ? 'c' : '') + '"></i>').join('');
    } else {
      lbl.textContent = open.length ? 'Next' : 'Free time';
      step.textContent = G.objective || say('jobs.none');
      dots.innerHTML = '';
    }
    /* How many more, as a quiet +2. */
    const more = open.length - (q ? 1 : 0);
    n.textContent = more > 0 ? '+' + more : '';
    n.setAttribute('aria-label', open.length === 1 ? '1 open job' : open.length + ' open jobs');
    el.classList.toggle('none', !open.length);
    box.innerHTML = (open.length ? open.map(j => {
      const on = G.track === j.id;
      return '<button class="gd-row' + (on ? ' on' : '') + '" type="button" data-tk="pin" data-q="' + j.id + '" aria-pressed="' + on + '">'
        + '<span class="gd-pin" aria-hidden="true">' + (on ? '📍' : '○') + '</span>'
        + '<span class="gd-rt"><b>' + esc(j.n) + '</b><span>' + esc(j.steps[j.step]) + '</span></span>'
        + '<i>' + (j.step + 1) + '/' + j.steps.length + '</i></button>';
    }).join('') : '<p class="gd-empty">' + say('jobs.none') + '</p>')
      + '<button class="gd-all" type="button" data-tk="all">All jobs' + (TOUCH ? '' : ' · J') + '</button>';
  }
};

/* ---------------- Achievements ---------------- */
const Ach = {
  get(id) {
    if (G.achievements[id] || !ACHS[id]) return;
    G.achievements[id] = true;
    UI.toast(ACHS[id].e, 'Achievement: <b>' + ACHS[id].n + '</b>', 'gold');
    FX.burst(P.x, P.y, '🏆', 10, '#ffb347'); Sfx.levelup();
  },
  count() { return Object.keys(G.achievements).length; }
};
