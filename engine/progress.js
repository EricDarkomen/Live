'use strict';
/* ---------------- Player ---------------- */
const Player = {
  init(name) {
    P.name = name; P.level = 1; P.xpv = 0; P.xpNext = 100; P.rank = 0;
    if (typeof RANKS !== 'undefined' && RANKS[0] && RANKS[0].face) P.face = RANKS[0].face;
    P.patience = 100; P.energy = 100; P.money = 0; P.rep = 0; P.food = 100;
    P.stats = { empathy: 2, knowledge: 2, patience: 2, bullshit: 1, chaos: 1 };
    P.skills = {}; P.skillPoints = 1; P.inventory = []; P.equipment = { headset: null, trinket: null, mug: null };
    P.x = SPAWN.x; P.y = SPAWN.y; P.buffs = [];
    Item.give('headset0', true); Item.equip('headset0', true);
    this.recalc(); P.patience = P.patMax; P.energy = P.eneMax;
  },
  recalc() {
    const eq = {};
    Object.values(P.equipment).forEach(id => {
      if (id && ITEMS[id] && ITEMS[id].eff) for (const k in ITEMS[id].eff) eq[k] = (eq[k] || 0) + ITEMS[id].eff[k];
    });
    P.eff = {
      empathy: P.stats.empathy + (eq.empathy || 0) + Sk.rank('empathy') * 2,
      knowledge: P.stats.knowledge + (eq.knowledge || 0) + Sk.rank('product') * 2 + Sk.rank('system'),
      bullshit: P.stats.bullshit + (eq.bullshit || 0) + Sk.rank('corp') * 2,
      chaos: P.stats.chaos + (eq.chaos || 0) + Sk.rank('sarcasm'),
      patience: P.stats.patience + (eq.patience || 0)
    };
    P.patMax = 100 + Sk.rank('stress') * 8 + (eq.patience || 0);
    P.eneMax = 100 + (eq.energy || 0) + Sk.rank('caffeine') * 5;
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
    /* Somewhere to go and recover, if the game has named one: WP.burnout, on
       the level you are standing on. Otherwise you recover where you are. */
    const w = typeof WP !== 'undefined' && WP.burnout;
    if (w && (!w[2] || w[2] === Levels.current)) { P.x = (w[0] + .5) * TILE; P.y = (w[1] + .5) * TILE; }
    G.minutes += 12; count('toiletMin', 12); FX.shake(8);
  }
};

/* ---------------- Inventory ---------------- */
const Item = {
  give(id, quiet) {
    if (!ITEMS[id]) return;
    P.inventory.push(id);
    /* An item carrying a `gun:` is one of the three things in the away-day box,
       and the thing in your pocket and the thing in your hands are the same
       object — so arriving with it is also loading it. See data/items.js. */
    if (ITEMS[id].gun && typeof Guns !== 'undefined') Guns.give(ITEMS[id].gun);
    if (!quiet) { UI.toast(ITEMS[id].e, say('obtained', { item: ITEMS[id].n }), 'gold'); FX.burst(P.x, P.y, ITEMS[id].e, 6); }
  },
  has(id) { return P.inventory.includes(id); },
  take(id) { const i = P.inventory.indexOf(id); if (i >= 0) P.inventory.splice(i, 1); },
  equip(id, quiet) {
    const it = ITEMS[id]; if (!it || !it.slot) return;
    const prev = P.equipment[it.slot];
    if (prev === id) {
      /* unequipping must hand the item back, not delete it */
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
    /* Using a gun is taking it out, which is also how you choose between the
       three of them without learning that Q exists. It is not consumed and it
       does not leave the inventory: it is a thing you are holding. */
    if (it.gun && typeof Guns !== 'undefined') {
      if (!Guns.select(it.gun)) return;
      Panels.close();
      Guns.arm(true);
      return;
    }
    if (!it.use) { UI.toast(it.e, say('useNothing')); return; }
    /* A consumable says what it does, as data:
         use: { energy, patience, money, minutes, stats: {}, count: {}, ach, flag, t }
       and a `use` that is a STRING names a function in `Uses` (data/items.js),
       for anything a table cannot say. */
    const fn = typeof it.use === 'string' && typeof Uses !== 'undefined' && Uses[it.use];
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
    /* Food fills your stomach — see Hunger in data/farm.js. */
    if (u.food && typeof Hunger !== 'undefined') Hunger.eat(u.food);
    Object.entries(u.stats || {}).forEach(([k, n]) => { P.stats[k] = (P.stats[k] || 0) + n; });
    Object.entries(u.count || {}).forEach(([k, n]) => count(k, n));
    if (u.flag) G.flags[u.flag] = true;
    if (u.ach) Ach.get(u.ach);
    if (u.sfx && Sfx[u.sfx]) Sfx[u.sfx]();
    if (u.t) UI.toast(it.e, u.t, u.cls || '');
  },
  count() { return P.inventory.length; }
};

/* Bespoke item code is `Uses` in data/items.js — see Item.use(). */

/* ---------------- Skills ---------------- */
const Sk = {
  rank(id) { return P.skills[id] || 0; },
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
    /* And it shows. Usually this is called from inside a conversation, so the
       face in the box is the face of the person you have just said the thing
       to — a couple of seconds of it, over whatever they were holding, and
       then back to how they are with you generally. */
    if (typeof Faces !== 'undefined' && n) Faces.flash(id, n > 0 ? 'happy' : 'sad', 2.4);
    /* And hearts off their portrait, wherever it is on screen. */
    if (typeof Portrait !== 'undefined' && n) Portrait.burst(id, n > 0 ? '💕' : '💢', n > 0 ? 3 + Math.min(4, n) : 3);
  },
  get(id) { return G.rel[id] || 0; },
  label(v) { const l = says('relLabels'); return l[v >= 8 ? 0 : v >= 5 ? 1 : v >= 2 ? 2 : v >= 0 ? 3 : v >= -3 ? 4 : 5]; }
};

/* ---------------- Quests ---------------- */
const Q = {
  /* THE STANDING INSTRUCTION: what the objective line says when there is no job
     open. It was one sentence — "Answer phones. Survive until 17:00." — and for
     as long as the game was one building that was the whole truth of it. Read
     on the sea wall at half four it is the game telling the player they are
     doing the wrong thing, which they are not: the queue is the building's, and
     out here there is a town, a coast road and an island to be on.

     So it is three sentences and the right one is picked from the same two
     facts the queue itself is picked from — the clock and where you are. See
     Levels.onSite() and Phones.live(). */
  IDLE: {
    get desk() { return say('idle.desk'); },
    get out() { return say('idle.out'); },
    get off() { return say('idle.off'); }
  },
  idle() {
    if (!Sky.working()) return this.IDLE.off;
    return Levels.onSite() ? this.IDLE.desk : this.IDLE.out;
  },
  /* Put the standing instruction back, and ONLY the standing instruction: an
     act that has asked for something specific — find the fourth floor, find
     your desk — owns the line until it is done with it, and walking through a
     door must not quietly take that off the player. Called on arrival at a
     level, when the shift opens, and when it closes. */
  restand() {
    if (!G.objective || Object.keys(this.IDLE).some(k => this.IDLE[k] === G.objective))
      UI.objective(this.idle());
  },
  start(id) {
    if (G.quests[id]) return;
    G.quests[id] = { step: 0, done: false, out: null };
    UI.toast('❗', say('newJob', { job: QUESTS[id].n }), 'gold');
    UI.objective(QUESTS[id].steps[0]);
    /* Said once, the first time there is anything to track. The pin is a 26px
       button in the corner of a box: nobody finds it by looking. */
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
   The HUD box that says what you are doing: the objective, then every open job
   under it. All of its state lives in G, so a folded tracker and a followed job
   are still folded and still followed after a save.

   One job at a time can be TRACKED, which hands the same pin and compass arrow
   that finding your desk gets to whatever the current step of that job points
   at — a colleague, an object, or a room. A colleague is followed live: they
   walk their own schedule, and a pin on where Dave was standing an hour ago is
   worse than no pin. */
const Track = {
  _sig: null,
  init() {
    /* pointerdown, not click: a tap is not ruled out as the start of a
       double-tap for 300ms. The click handler exists to swallow the ghost that
       follows a tap — and, when no pointer has been anywhere near, to be the
       keyboard's way in, since a button activated with Enter or Space fires a
       click and nothing else. Told apart by time, not by the event: a
       touch-synthesised click is indistinguishable from a keyboard one in every
       field that looked promising. */
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
    tap('#tkList', e => {
      const b = e.target && e.target.closest ? e.target.closest('[data-tk]') : null;
      if (!b) return false;
      if (b.dataset.tk === 'pin') this.follow(b.dataset.q);
      else {
        G.tkShut = G.tkShut || {};
        G.tkShut[b.dataset.q] = !G.tkShut[b.dataset.q];
        this._sig = null; Sfx.blip();
      }
      return true;
    });
    this.measure();
    /* The bar's height is not a number anybody can write down — it depends on
       the safe-area inset, on whether a queue row is showing and on how the
       type has wrapped — and everything parked below it hangs off --hud-h. So
       it is measured off the bar rather than guessed at. The old guess was 180. */
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => this.measure());
      ['#hudTop', '#hudTL', '#hudTR'].forEach(s => { const el = $(s); if (el) ro.observe(el); });
    }
    addEventListener('resize', () => this.measure());
  },
  measure() {
    const bar = $('#hudTop'), right = $('#hudTR'), s = document.documentElement.style;
    if (!bar) return;
    /* Zero on a desktop, where the wrapper is a click-through anchor and the two
       cards inside it are in the corners: nothing hangs off it there, so the
       stylesheet's fallback stands. */
    const h = bar.getBoundingClientRect().height;
    if (h) s.setProperty('--hud-h', Math.round(h) + 'px');
    if (right) s.setProperty('--hudr-h', Math.round(right.getBoundingClientRect().height) + 'px');
  },
  /* Follow a job, or let go of the one being followed. Tapping the pin of the
     job already being tracked is how you stop. */
  follow(id, quiet) {
    const prev = G.track;
    if (id && prev === id) id = null;
    G.track = id || null;
    this._sig = null;
    if (quiet) return;
    Sfx.select();
    /* Tapping a tracked job's own pin again is the untrack gesture, and it used
       to say nothing — the pin's colour was the only confirmation, easy to miss
       on a card already busy with colour. Both halves of the toggle get a toast
       now, not just the half that starts something. */
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
  /* Hand the waypoint to the tracked job. Also the answer to "is anything being
     tracked" for Guide.restore(), which asks before putting the desk pin back. */
  aim() {
    if (Guide.sticky) Guide.clear();
    const id = G.track;
    if (!id || !Q.active(id)) return false;
    return Guide.aim(this.target(id));
  },
  /* Called from UI.hud(), so once a frame. A rebuild of a list that changes
     twice an hour, sixty times a second, is how a phone gets warm — so nothing
     happens unless what the box would say has actually changed. */
  sync() {
    const open = Q.list().filter(q => !q.done);
    if (G.track && !Q.active(G.track)) this.follow(null, true);
    const sig = [G.objective, G.track, G.tkFold ? 1 : 0, G.tkTitles ? 1 : 0,
      open.map(q => q.id + q.step + ((G.tkShut || {})[q.id] ? 's' : '')).join(',')].join('|');
    if (sig === this._sig) return;
    this._sig = sig;
    this.render(open);
    /* Untracking, or a step with nowhere to go, hands the pin back to whatever
       was owed before — which on the first morning is still your own desk. */
    if (!this.aim() && Guide.tx === null) Guide.setObject('playerDesk', say('yourDesk'), 'foundDesk');
  },
  render(open) {
    const box = $('#tkList'), el = $('#tracker');
    if (!box || !el) return;
    el.classList.toggle('folded', !!G.tkFold);
    el.classList.toggle('titles', !!G.tkTitles);
    $('#tkFold').setAttribute('aria-expanded', String(!G.tkFold));
    /* The number alone: the header is 180px on a phone and two of the words in
       it were "job" and "s". The label says what it is counting. */
    const n = $('#tkCount');
    n.textContent = open.length ? String(open.length) : '';
    n.setAttribute('aria-label', open.length === 1 ? '1 open job' : open.length + ' open jobs');
    /* Folded, the header is the entire box, so it carries the one line worth
       keeping: what you are following, or failing that what you are doing.
       Unfolded it is a category label sitting above the objective line AND the
       job list below it, so "Jobs" is both shorter and more accurate than
       "Objective" ever was — which matters at this width: mono capitals at
       .2em tracking made the nine letters of "OBJECTIVE" the reason the label
       was truncating to "OBJ…" beside its own count. */
    $('#tkLbl').textContent = G.tkFold
      ? (G.track && QUESTS[G.track] ? '📍 ' + QUESTS[G.track].n : (G.objective || 'Jobs'))
      : 'Jobs';
    if (!open.length) {
      box.innerHTML = '<p class="tk-empty">' + say('jobs.none') + '</p>';
      return;
    }
    box.innerHTML = open.map(q => {
      const shut = (G.tkShut || {})[q.id], on = G.track === q.id;
      return '<div class="tk-q' + (on ? ' on' : '') + (shut ? ' shut' : '') + '">'
        + '<button class="tk-title" type="button" data-tk="fold" data-q="' + q.id + '" aria-expanded="' + !shut + '">'
        + '<span class="tk-nm"><b>' + esc(q.n) + '</b><i>' + (q.step + 1) + '/' + q.steps.length + '</i></span>'
        + '<span class="tk-step">' + esc(q.steps[q.step]) + '</span></button>'
        + '<button class="tk-pin" type="button" data-tk="pin" data-q="' + q.id + '" aria-pressed="' + on + '"'
        + ' aria-label="' + (on ? 'Stop following ' : 'Follow ') + esc(q.n) + '">📍</button></div>';
    }).join('');
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
