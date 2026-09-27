'use strict';
/* ---------------- Interaction ---------------- */
const Interact = {
  target: null, kind: null, _label: null,
  scan() {
    if (G.state !== 'play') {
      if (this.target || this._label) { this.target = null; this.kind = null; this._label = null; $('#prompt').classList.remove('on'); }
      return;
    }
    /* From a driving seat there is almost always exactly one thing to interact
       with and it is the door handle. Tested before anything else, and before
       the reach: a car stopped beside a lamppost still offers the way out of
       itself.
       The exception is anything furnished `fromCar` — a drive-thru window, and
       whatever else somebody points at a lane one day. Those are the things
       you are meant to reach WITHOUT getting out, so while one is alongside it
       takes the key off the door. Measured from the car rather than from the
       player, which are the same point while driving but only by accident. */
    if (Cars.driving) {
      const car = Cars.driving;
      let win = null, wd = TILE * 2.1;
      for (const o of World.objects) {
        if (!o.fdef || !o.fdef.fromCar) continue;
        const d = Math.hypot((o.x + .5) * TILE - car.x, (o.y + .5) * TILE - car.y);
        if (d < wd) { wd = d; win = o; }
      }
      this.target = win || car; this.kind = win ? 'obj' : 'car';
      const label = win ? 'Use ' + win.name : 'Get out of ' + car.name;
      if (label !== this._label) {
        this._label = label;
        const el = $('#prompt');
        /* The chip names the control you actually have. On a phone that
           button says OUT while you are driving (see Cars.showControls), and
           a prompt telling you to press a key that is not on screen is a
           prompt telling you nothing. */
        el.innerHTML = '<span class="kbd">' + (TOUCH && !win ? 'OUT' : 'E') + '</span> &nbsp;' + esc(label);
        el.classList.add('on'); el.classList.remove('urgent');
      }
      return;
    }
    const REACH = TILE * 1.05;
    let bestObj = null, od = REACH;
    /* Objects sit on integer tiles and the reach is about one tile, so only the
       3×3 neighbourhood can ever match — no need to measure all 230 of them. */
    const ptx = Math.floor(P.x / TILE), pty = Math.floor(P.y / TILE);
    /* TWO QUESTIONS, and they are not the same question, which is the whole of
       why this is two lines rather than one.

       CAN I REACH IT is surface to surface: the gap between your body and the
       thing's, each of them as big as it is drawn (see Collide.reach()). That
       is why a copier can be reached from a step further back than a mug can,
       and it is the same capsule that any physical event between two things
       standing on a floor would use. Never tighter than the old whole-tile
       reach for anything, so nothing that could be pressed has stopped being
       pressable.

       WHICH ONE is still the distance between tile centres, unchanged — and it
       has to be, for two reasons. A size-aware ranking hands every tie to the
       biggest thing in the neighbourhood, which quietly made the stationery
       cupboard unpressable because the copier next to it is bigger. And this
       number is compared against `nd` below, which is a distance between
       centres; ranking one in surface gaps and the other in centres is not a
       comparison at all.

       A thing on a table beats the table, as a person beats their chair: same
       tile means the same distance to the pixel, and the tie went to whichever
       was pushed first — the table. You were offered the formica. */
    const SURFACE = TILE * 0.6;
    const dist = o => Math.hypot((o.x + .5) * TILE - P.x, (o.y + .5) * TILE - P.y)
      - (o.onTable ? 1 : 0);
    for (let ty = pty - 1; ty <= pty + 1; ty++) {
      for (let tx = ptx - 1; tx <= ptx + 1; tx++) {
        const here = World.at(tx, ty);
        for (let i = 0; i < here.length; i++) {
          if (Collide.reach(here[i]) > SURFACE) continue;
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
    /* A person beats the furniture they are sitting in. Colleagues stand on the
       chair tile at their desk, so on raw distance the chair — measured from the
       tile centre, and found first — would win the tie and you would offer to
       sit on Dave. A person only loses to something you are clearly closer to. */
    const PERSON_BIAS = TILE * .36;
    let best = null, kind = null;
    if (bestNpc && (!bestObj || nd <= od + PERSON_BIAS)) { best = bestNpc; kind = 'npc'; }
    else if (bestObj) { best = bestObj; kind = 'obj'; }
    /* And the two things that are neither furniture nor colleagues: somebody
       walking past, and a car. Neither is on a tile, so neither can be in
       byTile, and both are a further question rather than a special case
       inside the first two. Both lose every tie — a car parked over a drain
       should still offer you the drain, and a colleague standing beside one is
       still a colleague — and between themselves the person wins, because a
       person does. */
    const ped = Peds.near(P.x, P.y);
    if (ped && !best) { best = ped; kind = 'ped'; }
    const car = Cars.near(P.x, P.y);
    if (car && !best) { best = car; kind = 'car'; }
    this.target = best; this.kind = kind;
    const label = !best ? null
      : kind === 'npc' ? 'Talk to ' + best.name
      : kind === 'ped' ? 'Talk to ' + best.name
      : kind === 'car' ? 'Look at ' + best.name
      : best.ringing ? (TEXT['act.answer'] ? say('act.answer') : 'ANSWER') + ' — ' + best.name
      : (best.kind === 'chair' || best.use === 'playerDesk') ? 'Use ' + best.name
      /* A push button is the one piece of street furniture out there that
         DOES something, so it says so. "Inspect the crossing" is what you do
         to a bollard. */
      : best.use === 'crossingButton' ? 'Press the button'
      : 'Inspect ' + best.name;
    if (label === this._label) return;      /* only touch the DOM when it changes */
    this._label = label;
    const el = $('#prompt');
    if (label) {
      el.innerHTML = '<span class="kbd">E</span> &nbsp;' + esc(label);
      el.classList.add('on');
      el.classList.toggle('urgent', !!(best && best.ringing));
    } else el.classList.remove('on');
  },
  go() {
    if (G.state !== 'play' || !this.target) return;
    if (this.kind === 'npc') { Sfx.select(); Dialogue.openNPC(this.target); return; }
    /* From inside, E is the door. From outside it is whatever the car's own
       `use` says, exactly as it is for a filing cabinet — which is what lets
       one car offer to be got into and the next six explain why they will not
       be, in data/acts.js, where the writing lives. */
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

/* ---------------- Shop ---------------- */
/* SHOP, the stock list, is in data/items.js. */
const Shop = {
  open(id) {
    this.id = id;
    Panels.open('shop');
  },
  render() {
    const s = SHOP[this.id || 'vending'];
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
    /* A job that advances on buying something is HOOKS.bought in data/game.js. */
    Hook('bought', k, this.id);
  }
};

/* ---------------- Panels / UIManager ---------------- */
const TABS = [
  /* The map is first, and it is the only tab in here that is about the world
     rather than about the employee: everything else on this row is a thing the
     company would like you to fill in. It is here at all because the panel is
     the one piece of UI a phone can reach — the key-hint row is a menu button
     on a touch screen and the minimap is not drawn there at all — so a map
     that lived anywhere else would be a map only a desktop has. */
  { id: 'map', n: 'Map', e: '🗺️' },
  /* The shift page, which used to be a screen that arrived at five whether you
     were at a desk or on a dual carriageway. It is a tab now, and a live one:
     today's figures whenever you ask for them. See Report in engine/menus.js. */
  { id: 'shift', get n() { return TEXT['tab.shift'] ? say('tab.shift') : 'Shift'; }, e: '💶' },
  { id: 'quests', n: 'Jobs', e: '🗂️' }, { id: 'inventory', n: 'Inventory', e: '🎒' }, { id: 'skills', n: 'Skills', e: '📈' },
  /* CHAT AND EMAIL USED TO BE TWO OF THESE and they are not administration.
     A portal tab is where you go to look something up about yourself — your
     jobs, your kit, your skills, your figures. An inbox is a place you WORK,
     and putting it behind the eighth of ten tabs in a self-service portal is
     what made reading it feel like filing a form. They are two of the five
     channels in the comms console now (engine/comms.js), which takes this
     strip from ten tabs to eight on a screen that has room for about four. */
  { id: 'ach', n: 'Achievements', e: '🏆' },
  { id: 'stats', n: 'Profile', e: '🪪' }, { id: 'settings', n: 'Menu', e: '⚙️' }
];
const Panels = {
  tab: 'quests', on: false,
  open(tab) {
    if (tab === 'shop') { this.tab = 'shop'; } else this.tab = tab || this.tab;
    const first = !this.on;
    if (first) this._returnFocus = document.activeElement;
    this.on = true; G.state = 'panel';
    $('#panel').classList.add('on');
    this.tabs(); this.render(); Sfx.blip();
    /* move focus into the dialog so the keyboard and screen readers follow it */
    if (first) setTimeout(() => { const t = $('#pnTabs .tab.on') || $('#pnClose'); if (t) t.focus(); }, 20);
  },
  close() {
    if (!this.on) return;
    this.on = false; $('#panel').classList.remove('on');
    if (G.state === 'panel') G.state = 'play';
    const r = this._returnFocus; this._returnFocus = null;
    if (r && r.focus && document.contains(r)) { try { r.focus(); } catch (e) {} }
  },
  tabs() {
    const box = $('#pnTabs'); box.innerHTML = '';
    TABS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'tab' + (this.tab === t.id ? ' on' : '');
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(this.tab === t.id));
      let n = 0;
      if (t.id === 'skills') n = P.skillPoints;
      b.title = t.n + (n ? ' (' + n + ')' : '');
      b.innerHTML = '<span class="tab-i" aria-hidden="true">' + t.e + '</span><span class="tab-t">' + esc(t.n) + '</span>'
        + (n ? '<span class="tab-n">' + n + '</span>' : '');
      b.onclick = () => { this.tab = t.id; this.tabs(); this.render(); Sfx.blip(); };
      box.appendChild(b);
    });
    /* On a phone the tabs are one sideways-scrolling row, and this function
       rebuilds it from scratch on every switch — which resets that scroll. Put
       the selected tab back where the player can see it. Harmless on a desktop,
       where the row wraps and nothing is ever out of view. */
    const cur = box.querySelector('.tab.on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  },
  render() {
    if (!this.on) return;
    const b = $('#pnBody');
    /* The portal's own name is the least useful thing in a header that has one
       line on a phone, and the dialog is labelled with it anyway. */
    $('#pnTitle').textContent = (TOUCH ? '' : 'Employee self-service portal · ')
      + P.name + ' · ' + RANKS[P.rank].n;
    b.innerHTML = this['r_' + this.tab] ? this['r_' + this.tab]() : '';
    b.querySelectorAll('[data-item]').forEach(el => el.onclick = () => Item.use(el.dataset.item));
    b.querySelectorAll('[data-uneq]').forEach(el => el.onclick = () => Item.equip(el.dataset.uneq));
    b.querySelectorAll('[data-skill]').forEach(el => el.onclick = () => Sk.buy(el.dataset.branch, el.dataset.skill));
    b.querySelectorAll('[data-buy]').forEach(el => el.onclick = () => Shop.buy(el.dataset.buy));
    b.querySelectorAll('[data-act]').forEach(el => el.onclick = () => Menu[el.dataset.act]());
    /* The map is a canvas rather than a list, so it is drawn rather than
       written — and it is drawn AFTER the body, because a canvas has no size
       until the layout has happened. From then on the loop keeps it up to date
       four times a second; see Atlas.tick(). */
    if (this.tab === 'map') Atlas.panel();
  },
  r_shop() { return Shop.render(); },
  /* WHERE YOU ARE, WHAT IT IS CALLED, AND THE WAY OUT OF IT. The canvas is
     sized by the stylesheet and drawn by Atlas.panel(); everything here is the
     furniture round it. The line under the map is the legend, and it is short
     on purpose: a legend that has to be read is a map that has failed. */
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
      + '</div>';
  },
  /* TODAY, AND WHETHER IT IS OVER YET. One page, two moods: during the shift it
     is a tally with the clock at the top of it, and after five it is the report
     that used to be thrown across the screen — the same figures, plus the
     rating and whatever the evening said on the way out.

     The rows come from Report so there is exactly one list of what a day is
     made of, and the counters they read are today's. */
  r_shift() {
    const done = !!G.flags.clockedOff;
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
      if (G.flags.leaving)
        h += '<p style="margin-top:14px;font-size:13px;color:var(--dim);font-style:italic">' + esc(G.flags.leaving) + '</p>';
    } else {
      /* What the page is for while the day is still in front of you: not a
         verdict, a clock. */
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
      h += '<button class="item" data-uneq="' + id + '"><div class="ih"><span class="ie">' + it.e + '</span><span class="it">' + esc(it.n) + '</span><span class="rar ' + it.r + '">' + (TEXT['slot.' + slot] ? say('slot.' + slot) : slot) + '</span></div><div class="ieff">' + Object.keys(it.eff || {}).map(k => '+' + it.eff[k] + ' ' + (TEXT['stat.' + k] ? say('stat.' + k) : k)).join(' · ') + '</div><div class="idesc">Click to unequip</div></button>';
    }
    if (!any) h += '<p class="empty">Nothing equipped.</p>';
    h += '</div><div class="h2">Carried (' + P.inventory.length + ')</div>';
    if (!P.inventory.length) return h + '<p class="empty">' + say('inv.empty') + '</p>';
    const counts = {};
    P.inventory.forEach(i => counts[i] = (counts[i] || 0) + 1);
    h += '<div class="grid">';
    Object.keys(counts).forEach(id => {
      const it = ITEMS[id];
      h += '<button class="item" data-item="' + id + '"><div class="ih"><span class="ie">' + it.e + '</span><span class="it">' + esc(it.n) + (counts[id] > 1 ? ' ×' + counts[id] : '') + '</span><span class="rar ' + it.r + '">' + it.r + '</span></div><div class="idesc">' + esc(it.d) + '</div>' +
        (it.eff ? '<div class="ieff">' + Object.keys(it.eff).map(k => '+' + it.eff[k] + ' ' + (TEXT['stat.' + k] ? say('stat.' + k) : k)).join(' · ') + '</div>' : '') +
        '<div class="ieff" style="color:var(--dim)">' + (it.slot ? 'Click to equip' : it.use ? 'Click to use' : it.quest ? 'Quest item' : 'Click to examine') + '</div></button>';
    });
    return h + '</div>';
  },
  r_skills() {
    let h = '<div class="h2">Skill points available: ' + P.skillPoints + '</div><div class="tree">';
    for (const bk in SKILLS) {
      const br = SKILLS[bk];
      h += '<div class="branch"><h4 style="color:' + br.colour + '">' + br.name + '</h4>';
      for (const sk in br.list) {
        const d = br.list[sk], r = Sk.rank(sk);
        h += '<div class="skill' + (r >= d.max ? ' maxed' : '') + '" data-skill="' + sk + '" data-branch="' + bk + '"><div style="flex:1"><div class="sn">' + esc(d.n) + '</div><div class="idesc" style="margin:2px 0 0">' + esc(d.d) + '</div></div><span class="pips">' + '●'.repeat(r) + '○'.repeat(d.max - r) + '</span></div>';
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
    /* The five stats are keyed in code; what they are CALLED is TEXT's
       `stat.<key>` and `statNote.<key>`. */
    let h = '<div class="h2">' + say('stats.title') + '</div><div class="stat-grid">';
    ['empathy', 'knowledge', 'patience', 'bullshit', 'chaos'].forEach(k => {
      h += '<div class="stat-box"><div class="sk">' + say('stat.' + k) + '</div><div class="sv">' + (s[k] || 0).toFixed(1) + '</div><div class="sn">' + say('statNote.' + k) + '</div></div>';
    });
    /* ALL TIME, and it always was: these come off G.totals, which is the
       lifetime tally, and the heading said "Today" — so a profile opened on
       day four reported four days of coffee as this morning's. Today has a page
       of its own now and it is the one above. */
    h += '</div><div class="h2">' + say('stats.allTime') + '</div><div class="stat-grid">';
    const t = G.totals;
    /* Same labels as the day's report, and the same rule: a tally with no
       `report.<stat>` in TEXT is not shown. */
    Object.keys(t).filter(k => TEXT['report.' + k] && k !== 'money' && k !== 'xp')
      .map(k => [say('report.' + k), t[k] || 0]).concat([[say('stats.rep'), Math.round(P.rep)]]).forEach(([k, v]) => {
      h += '<div class="stat-box"><div class="sk">' + k + '</div><div class="sv">' + v + '</div></div>';
    });
    /* TWO LISTS, because they are two different things. A colleague is
       somebody on the fourth floor; a person whose def names a `level` runs a
       shop on a street outside and is not your colleague, however well the two
       of you are getting on. Filing Pat under Colleagues would be the panel
       telling you something about your job that is not true. */
    /* Where somebody lives, under how they feel about you, and only once you
       have actually watched them go — `home.where` is a fact about a person
       and this panel is not a staff directory you were handed on day one. */
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
  r_settings() {
    const t = (on) => on ? 'On' : 'Off';
    return '<div class="h2">Your game</div>' +
      '<div class="setting"><div class="sl">Save<div class="sd">Writes to this browser only.</div></div><button class="btn small" data-act="save">💾 Save</button></div>' +
      '<div class="setting"><div class="sl">Load<div class="sd">Restore your last save.</div></div><button class="btn small" data-act="load">↻ Load</button></div>' +
      '<div class="setting"><div class="sl">New game<div class="sd">Erases everything and starts again.</div></div><button class="btn small" data-act="newgame">🗑️ New game</button></div>' +
      '<div class="h2">Audio</div>' +
      '<div class="setting"><div class="sl">Sound effects</div><button class="btn small" data-act="sound" aria-pressed="' + !!Sfx.on + '">' + t(Sfx.on) + '</button></div>' +
      '<div class="setting"><div class="sl">Bar music<div class="sd">Plays while you serve.</div></div><button class="btn small" data-act="music" aria-pressed="' + !!Sfx.music + '">' + t(Sfx.music) + '</button></div>' +
      '<div class="setting"><div class="sl">Volume</div><button class="btn small" data-act="vol">' + Math.round(Sfx.volume * 100) + '%</button></div>' +
      '<div class="h2">Notifications</div>' +
      '<div class="setting"><div class="sl">Pop-ups<div class="sd">'
        + (Comms.pop === 'all'
          ? 'Every channel interrupts you, the chat included.'
          : Comms.pop === 'none'
          ? 'Nothing interrupts you. Everything still arrives — the counts on the rail are how you know.'
          : 'Post, texts and anything that needs an answer interrupt you. The chat and the guest log go to the rail quietly. Several at once fold into one line.')
        + '</div></div><button class="btn small" data-act="pops">'
        + (Comms.pop === 'all' ? '🔔 Everything' : Comms.pop === 'none' ? '🔇 Nothing' : '🔔 What needs you')
        + '</button></div>' +
      '<div class="h2">Display &amp; accessibility</div>' +
      '<div class="setting"><div class="sl">Animation<div class="sd">Bobbing, blinking, ringing.</div></div><button class="btn small" data-act="anim" aria-pressed="' + !!R.animate + '">' + t(R.animate) + '</button></div>' +
      '<div class="setting"><div class="sl">Reduced motion<div class="sd">Stills the title screen, and disables screen shake and particles in the game. Follows your system setting by default.</div></div><button class="btn small" data-act="motion" aria-pressed="' + !FX.motion + '">' + t(!FX.motion) + '</button></div>' +
      '<div class="setting"><div class="sl">Emoji size</div><button class="btn small" data-act="emoji">' + Math.round(R.emojiScale * 100) + '%</button></div>' +
      '<div class="setting"><div class="sl">Text speed<div class="sd">How fast dialogue types itself out.</div></div><button class="btn small" data-act="speed">' + (Dialogue.speed >= 999 ? 'Instant' : Dialogue.speed >= 140 ? 'Fast' : Dialogue.speed >= 60 ? 'Normal' : 'Slow') + '</button></div>' +
      '<div class="h2">Controls</div>' +
      (TOUCH
        ? '<div class="setting"><div class="sl">Movement control<div class="sd">The stick appears wherever you put your thumb down in the bottom ' + Hand.padSide() + ', and steers by how far you push it. The pad is four buttons in a fixed cross.</div></div>' +
          '<button class="btn small" data-act="padstyle">' + (Hand.pad === 'dpad' ? '✚ D-pad' : '🕹️ Stick') + '</button></div>' +
          '<div class="setting"><div class="sl">Left-handed layout<div class="sd">Mirrors the on-screen controls: ' + Hand.padName() + ' on the right, <span class="kbd">E</span> and <span class="kbd">☰</span> on the left.</div></div>' +
          '<button class="btn small" data-act="southpaw" aria-pressed="' + !!Hand.left + '">' + t(Hand.left) + '</button></div>' +
          '<div class="setting"><div class="sl">Fullscreen<div class="sd">Reclaims the third of the phone the browser keeps for itself. Not offered by every browser.</div></div>' +
          '<button class="btn small" data-act="fullscreen">' + (document.fullscreenElement || document.webkitFullscreenElement ? 'Exit' : 'Enter') + '</button></div>'
        : '') +
      '<p class="idesc" style="font-size:13px;font-style:normal;line-height:1.7">' +
      (TOUCH
        ? (Hand.pad === 'dpad' ? 'Pad' : 'Stick') + ', bottom ' + Hand.padSide() + ' — move &nbsp; <span class="kbd">E</span> — interact<br>' +
          'Driving: ' + (Hand.pad === 'dpad'
            ? 'the pad steers with left and right and drives with up and down'
            : 'the ' + Hand.padSide() + ' stick steers, the amber one on the ' + Hand.btnSide() + ' is the throttle')
            + ' &nbsp; <span class="kbd">OUT</span> — get out<br>' +
          'Tap the conversation box — advance dialogue &nbsp; tap a reply — choose it<br>' +
          'Tap a move — at the bar, and in messages<br>' +
          '<span class="kbd">☰</span> — jobs, inventory, skills, profile, achievements &nbsp; the 📨 chip under the bar — post, texts, chat, the log and every guest<br>' +
          'The game saves itself, and <span class="kbd">☰</span> · Menu has Save and Load.'
        : '<span class="kbd">W A S D</span> / arrows — move, and drive &nbsp; <span class="kbd">E</span> — interact, and get out &nbsp; <span class="kbd">H</span> — horn &nbsp; <span class="kbd">Space</span> — advance dialogue<br>' +
          '<span class="kbd">↑ ↓</span> then <span class="kbd">Enter</span>, or <span class="kbd">1–9</span> — dialogue choices &nbsp; <span class="kbd">1–9</span> — moves at the bar<br>' +
          '<span class="kbd">J</span> jobs &nbsp; <span class="kbd">I</span> inventory &nbsp; <span class="kbd">K</span> skills &nbsp; <span class="kbd">P</span> profile &nbsp; <span class="kbd">L</span> achievements<br>' +
          '<span class="kbd">M</span> post &nbsp; <span class="kbd">C</span> chat &nbsp; <span class="kbd">V</span> texts &nbsp; <span class="kbd">B</span> the log — or the rail in the corner, which is all five channels<br>' +
          '<span class="kbd">Esc</span> menu &nbsp; <span class="kbd">F5</span> quick save &nbsp; <span class="kbd">F9</span> quick load') + '</p>';
  }
};
