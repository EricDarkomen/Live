'use strict';
/* ---------------- Encounters: serving a guest, turn by turn ----------------
   Pick a move, they reply; their guard and patience and your nerve move. The
   same mechanics serve a guest at the bar (`call`), a letter (`mail`) and a
   text (`text`): each channel only owns its words and its opening sound, so
   the card never claims to be something it is not. */

/* Between a boss's phases you get a breather, or only a maxed build survives. */
const PHASE_HEAL = 0.30, PHASE_ENERGY = 0.20;

/* A channel's words are TEXT's `<channel>.*`. */
const encChannel = (k, title, ring) => ({
  get what() { return say(k + '.what'); }, get end() { return say(k + '.end'); },
  title,
  get said() { return say(k + '.said'); }, get wrote() { return say(k + '.wrote'); },
  pat: n => say(k + '.pat', { n }),
  note: () => say(k + '.note'),
  ring
});
const writtenAt = k => E => say(k + '.title', { time: clockStr(E.since || G.minutes) });
const CHANNELS_CB = {
  call: encChannel('call', E => say('call.title', { n: ri(1, 9) }),
    () => { Sfx.ring(); setTimeout(() => { if (Combat.E) Sfx.holdMusic(true); }, 1200); }),
  mail: encChannel('mail', writtenAt('mail'), () => Sfx.mail()),
  text: encChannel('text', writtenAt('text'), () => Sfx.text())
};

const Combat = {
  E: null, turn: 1, busy: false,
  startCall(hot) {
    /* The first encounter of a game is the gentle `first: true` row, once. */
    const first = CALLERS.find(c => c.first);
    if (G.totals.calls === 0 && first) {
      return this.begin({
        caller: first.id, name: first.name, face: first.face, sub: say('call.re', { issue: pick(first.issues) }),
        frus: first.frus, maxFrus: first.frus, cpat: first.pat, maxCpat: first.pat, agg: first.agg, boss: null,
        lines: first
      });
    }
    /* `mystery: 'flag'` keeps a caller out of the draw until that flag is set. */
    const pool = CALLERS.filter(c => !c.first && (!c.mystery || G.flags[c.mystery]));
    if (!pool.length) return;
    let c = null, r = Math.random() * pool.reduce((s, x) => s + x.w, 0);
    for (const x of pool) { r -= x.w; if (r <= 0) { c = x; break; } }
    c = c || pool[0];
    const dayScale = 1 + (G.day - 1) * 0.12 + (G.minutes > 840 ? 0.15 : 0);
    this.begin({
      caller: c.id, name: c.name, face: c.face, sub: say('call.re', { issue: pick(c.issues) }),
      frus: Math.round(c.frus * dayScale * (hot ? 1.3 : 1)), maxFrus: Math.round(c.frus * dayScale * (hot ? 1.3 : 1)),
      cpat: c.pat, maxCpat: c.pat, agg: c.agg * (hot ? 1.4 : 1), lines: c, boss: null
    });
  },
  /* Written work: the same begin(); the item says which piece and when. */
  startInbound(item) {
    const c = INBOUND.find(x => x.id === item.enc.inbound);
    if (!c) return;
    this.begin({
      caller: 'in_' + c.id, ch: c.ch || 'mail', name: c.name, face: c.face,
      sub: c.issue, since: item.t, inbound: c.id,
      frus: c.frus, maxFrus: c.frus, cpat: c.pat, maxCpat: c.pat, agg: c.agg,
      lines: c.lines, boss: null
    });
  },
  startBoss(key) {
    const b = BOSSES[key];
    this.bossKey = key; this.bossPhase = 0;
    const ph = b.phases[0];
    this.begin({
      caller: 'boss', name: ph.n, face: b.face, sub: b.sub, boss: key,
      frus: ph.frus, maxFrus: ph.frus, cpat: 999, maxCpat: 999, agg: ph.agg,
      lines: { open: [ph.lines[0]], mid: ph.lines, hot: ph.lines, win: ['...'] }
    });
  },
  begin(E) {
    this.E = E; this.turn = 1; this.busy = false; this.over = false; this.onlyBS = true;
    /* Reading them: chemistry, lines used and how stale, needs matched. */
    E.rap = 0; E.used = {}; E.wear = {}; E.matched = 0; E.landed = false;
    /* How this kind of guest has gone today (G.callers, −3..3) opens the next
       up to 18% easier or harder. */
    const mem = E.boss ? 0 : (G.callers[E.caller] || 0);
    if (mem) {
      E.agg = Math.max(1, E.agg * (1 - mem * .06));
      E.frus = Math.max(8, Math.round(E.frus * (1 - mem * .05)));
      E.maxFrus = E.frus;
    }
    /* Their starting pressure, and turns answered off the point or to no effect. */
    E.base = E.agg; E.miss = 0; E.stall = 0;
    /* The channel (a guest unless said otherwise) and the whole transcript,
       which end() posts to the guests channel. */
    E.ch = E.ch || 'call';
    E.script = [];
    const W = this.words(E);
    this.shiftNeed(E, true);
    G.state = 'combat';
    const cb = $('#combat');
    cb.className = 'on ch-' + E.ch;
    cb.setAttribute('aria-label', E.boss ? 'Encounter' : W.what);
    $('#cbTitle').textContent = E.boss ? 'ENCOUNTER · ' + BOSSES[E.boss].title : W.title(E);
    $('#cbLog').innerHTML = '';
    W.ring();
    $('#cbHold').textContent = W.note();
    this.line(pick(E.lines.open), 'say');
    if (mem >= 2) this.log(say('enc.memGood'));
    else if (mem <= -2) this.log(say('enc.memBad'));
    this.refresh();
  },
  /* The channel's words; an unknown channel reads as a guest. */
  words(E) { return CHANNELS_CB[(E && E.ch) || 'call'] || CHANNELS_CB.call; },
  line(txt, cls) { $('#cbLine').innerHTML = '<span class="' + (cls || 'say') + '">' + esc(txt) + '</span>'; },
  /* What they want next. A CALLERS/INBOUND row's `needs` weights the draw, and
     a need's `next` (data/callers.js) is what it tends to lead to. */
  needBias(E) {
    const all = Object.keys(NEEDS), own = (E.lines && E.lines.needs) || [];
    const pool = own.filter(n => NEEDS[n]);
    return pool.length ? pool : all;
  },
  nextNeeds(n) {
    const nx = (NEEDS[n] && NEEDS[n].next || []).filter(k => NEEDS[k]);
    return nx.length ? nx : Object.keys(NEEDS);
  },
  shiftNeed(E, force) {
    const pool = this.needBias(E);
    let n;
    /* Usually following on from the last want, sometimes their own leaning. */
    if (!force && E.need && chance(.65)) {
      const on = this.nextNeeds(E.need).filter(x => pool.includes(x));
      n = on.length ? pick(on) : pick(pool);
    } else n = pick(pool);
    /* Rarely the same want twice running. */
    for (let i = 0; i < 3 && n === E.need && !force; i++) n = pick(pool);
    E.need = n;
    E.tell = pick(TELLS[n] || TELLS[Object.keys(TELLS)[0]] || ['…']);
  },
  /* The card shows the last 30 lines; E.script keeps them all. */
  log(t) {
    if (this.E) this.E.script.push(t);
    const d = document.createElement('div'); d.textContent = t;
    const l = $('#cbLog'); l.appendChild(d); l.scrollTop = l.scrollHeight;
    while (l.children.length > 30) l.firstChild.remove();
  },
  refresh() {
    const E = this.E; if (!E) return;
    $('#cbFace').textContent = E.face; $('#cbName').textContent = E.name; $('#cbIssue').textContent = E.sub;
    $('#cbTimer').textContent = 'TURN ' + this.turn;
    const meter = (id, pct, label) => {
      const el = $(id); el.style.width = clamp(pct, 0, 100) + '%';
      if (el.parentElement) {
        el.parentElement.setAttribute('aria-valuenow', String(Math.round(clamp(pct, 0, 100))));
        el.parentElement.setAttribute('aria-valuetext', label);
      }
    };
    meter('#cbFrus', E.frus / E.maxFrus * 100, Math.max(0, Math.round(E.frus)) + ' guard');
    $('#cbFrusV').textContent = Math.max(0, Math.round(E.frus));
    meter('#cbCPat', E.cpat / E.maxCpat * 100, E.cpat > 900 ? 'all the time in the world'
      : this.words(E).pat(Math.max(0, Math.round(E.cpat))));
    $('#cbCPatV').textContent = E.cpat > 900 ? '∞' : Math.max(0, Math.round(E.cpat));
    meter('#cbYou', P.patience / P.patMax * 100, Math.round(P.patience) + ' nerve left');
    $('#cbYouV').textContent = Math.round(P.patience);
    meter('#cbRap', E.rap || 0, Math.round(E.rap || 0) + ' chemistry');
    $('#cbRapV').textContent = Math.round(E.rap || 0);

    /* The tell, as a want; "still" once it has been missed twice. */
    const tellBox = $('#cbTell');
    if (E.tell && NEEDS[E.need]) {
      tellBox.innerHTML = NEEDS[E.need].e + ' <span class="tt">' + esc(E.tell) + '</span> '
        + '<span class="tw">· ' + (E.miss >= 2 ? 'still wants ' : 'wants ') + esc(NEEDS[E.need].n) + '</span>';
    } else tellBox.innerHTML = '';

    const box = $('#cbMoves'); box.innerHTML = '';
    let key = 0;
    MOVES.forEach(m => {
      if (m.need && !Sk.rank(m.need)) return;
      if (m.show && !m.show(E)) return;
      key++;
      const b = document.createElement('button'); b.className = 'move'; b.type = 'button';
      const cost = [];
      if (m.cost.pat) cost.push('−' + m.cost.pat + '❤️');
      if (m.cost.ene) cost.push('−' + m.cost.ene + '⚡');
      const uses = (E.used && E.used[m.id]) || 0;
      /* The badge shows staleness, which fades, not lifetime use. */
      const stale = (E.wear && E.wear[m.id]) || 0;
      if (stale >= 0.8) b.classList.add('worn');
      if (m.id === 'land') b.classList.add('primary');
      b.innerHTML = '<span class="mc">' + cost.join(' ') + '</span>' +
        (stale >= 0.8 ? '<span class="mw">heard it · ' + uses + '×</span>' : '') +
        '<div class="mn">' + (key < 10 ? '<span class="mk">' + key + '</span>' : '') + m.e + ' ' + esc(m.n) + '</div>' +
        '<div class="md">' + esc(m.d) + '</div>';
      b.disabled = !!(this.busy || (m.cost.ene && P.energy < m.cost.ene));
      if (m.cost.ene && P.energy < m.cost.ene) b.title = say('enc.noEnergy');
      b.onclick = () => this.play(m);
      box.appendChild(b);
    });
    UI.hud();
  },
  play(m) {
    /* Each step of a turn is on a timer and re-reads this.E: the encounter may
       have ended in between. */
    if (this.busy || !this.E) return;
    const E = this.E; this.busy = true; Sfx.select();
    if (m.id !== 'bs') this.onlyBS = false;
    if (m.cost.pat) P.patience = Math.max(1, P.patience - m.cost.pat);
    if (m.cost.ene) P.energy = Math.max(0, P.energy - m.cost.ene);
    const r = m.run(E);
    if (r.stat) { P.stats[r.stat] = (P.stats[r.stat] || 0) + 0.25; }
    /* A turn that moved nothing: they notice (customerTurn). */
    if (r.dmg > 0 || r.dmg >= 900) E.stall = 0; else E.stall = Math.min(3, E.stall + 1);

    /* Matching their want and repeating yourself only apply to moves that
       try to move things along; the enders (999) and self-care are untouched. */
    const serves = m.serves || [];
    const match = serves.includes(E.need);
    const uses = E.used[m.id] || 0;
    const worn = E.wear[m.id] || 0;
    E.used[m.id] = uses + 1;
    E.wear[m.id] = worn + 1;
    E.lastMatch = false;
    let note = '';
    if (r.dmg > 0 && r.dmg < 900) {
      /* A repeated line lands softer; staleness fades, so rotate. */
      if (worn) r.dmg *= Math.max(0.34, Math.pow(0.72, worn));
      if (match) {
        r.dmg *= 1.65;
        E.rap = clamp(E.rap + 20 + P.eff.empathy, 0, 100);
        E.matched++; E.lastMatch = true;
        note = ' — that was what they wanted.';
        FX.float(P.x, P.y - 34, '💕 chemistry', '#b48cff');
        /* Understood, they calm down for good, though never entirely. */
        E.miss = 0;
        E.agg = Math.max(E.base * .78, E.agg - E.base * .08);
      } else if (serves.length) {
        r.dmg *= 0.65;
        E.rap = Math.max(0, E.rap - 8);
        note = ' — not what they were after.';
        /* Answered off the point twice, they get louder. */
        E.miss++;
        if (E.miss >= 2) E.agg = Math.min(E.base * 1.5, E.agg + E.base * .13);
      }
    }
    E.frus -= r.dmg;
    this.line(this.words(E).wrote + r.txt + note, 'nar');
    this.log((r.dmg >= 900 ? '[END] ' : r.dmg >= 0 ? '−' + Math.round(r.dmg) + ' guard · ' : '+' + Math.round(-r.dmg) + ' guard · ')
      + m.n + (match ? '  ✓ ' + NEEDS[E.need].n : '') + (uses ? '  (heard it ' + uses + '×)' : ''));
    if (r.dmg > 0 && r.dmg < 900) FX.burst(P.x, P.y - 20, '💬', 4);
    this.refresh();
    setTimeout(() => {
      if (r.win) return this.end('win');
      if (r.transfer) return this.end('transfer');
      if (r.fail) return this.end('angered');
      if (E.frus <= 0) return this.phaseOrWin();
      this.customerTurn();
    }, 900);
  },
  customerTurn() {
    const E = this.E; if (!E) return;
    /* Their patience: being understood buys time, turns that go nowhere
       cost it, never below two a turn. */
    if (!E.boss) {
      let drain = ri(5, 11) - (E.lastMatch ? 3 : 0) + Math.min(6, (E.stall || 0) * 2);
      E.cpat -= Math.max(2, drain);
    }
    const hot = E.frus > E.maxFrus * 0.6;
    const said = pick(hot ? E.lines.hot : E.lines.mid);
    let dmg = E.agg * (0.8 + clamp(E.frus / E.maxFrus, 0, 1)) * (1 - (Sk.effects().calm || 0));
    /* `soft` on a CALLERS row; `resist: { skill, per }` on a BOSSES row. */
    if (E.lines && E.lines.soft) dmg *= E.lines.soft;
    const res = E.boss && BOSSES[E.boss] && BOSSES[E.boss].resist;
    if (res) dmg *= (1 - Sk.rank(res.skill) * res.per);
    dmg = Math.max(1, dmg + rnd(-2, 2));
    P.patience = Math.max(0, P.patience - dmg);
    this.line(said, 'say');
    this.log(this.words(E).said + said + '  (−' + Math.round(dmg) + ' nerve)');
    this.hit(Math.round(dmg));
    FX.shake(Math.min(6, dmg / 3));
    E.frus += E.boss ? 3 : 1.5;
    /* Met, they move to the next want; missed twice, they keep asking. */
    if (E.lastMatch || (E.miss < 2 && chance(.3))) this.shiftNeed(E);
    else E.tell = pick(TELLS[E.need] || TELLS.heard);
    /* Staleness fades while you are talking about something else. */
    for (const k in E.wear) { E.wear[k] *= 0.62; if (E.wear[k] < 0.2) delete E.wear[k]; }
    this.turn++; this.busy = false;
    this.refresh();
    if (P.patience <= 0) return this.end('broken');
    if (E.cpat <= 0) return this.end('hangup');
    /* Only ordinary guests give up on a long encounter. */
    if (!E.boss && this.turn > TURN_LIMIT) return this.end('hangup');
  },
  /* The nerve lost, flashed on your meter. */
  hit(n) {
    const bar = $('#cbYou'); if (!bar) return;
    const wrap = bar.closest('.bar-row');
    if (wrap) {
      const f = document.createElement('span');
      f.className = 'cb-dmg'; f.textContent = '−' + n;
      wrap.appendChild(f);
      setTimeout(() => f.remove(), 900);
    }
    const cb = $('#combat');
    if (cb) { cb.classList.remove('struck'); void cb.offsetWidth; cb.classList.add('struck'); }
    if (P.patience > 0 && P.patience <= P.patMax * 0.25) $('#combat').classList.add('critical');
    else $('#combat').classList.remove('critical');
  },
  phaseOrWin() {
    const E = this.E; if (!E) return;
    if (E.boss) {
      const b = BOSSES[E.boss];
      this.bossPhase++;
      if (this.bossPhase < b.phases.length) {
        const ph = b.phases[this.bossPhase];
        E.name = ph.n; E.frus = ph.frus; E.maxFrus = ph.frus; E.agg = ph.agg;
        E.lines = { open: [ph.lines[0]], mid: ph.lines, hot: ph.lines, win: ['...'] };
        const heal = Math.round(P.patMax * PHASE_HEAL), gas = Math.round(P.eneMax * PHASE_ENERGY);
        P.patience = clamp(P.patience + heal, 0, P.patMax);
        P.energy = clamp(P.energy + gas, 0, P.eneMax);
        $('#combat').classList.remove('critical');
        this.line(b.breather || '— ' + ph.n + ' —', 'nar');
        this.log('PHASE: ' + ph.n + '  (+' + heal + ' nerve, +' + gas + ' energy)');
        Sfx.bad(); FX.shake(10); UI.flash('#ff5f56', .35);
        this.busy = false; this.refresh(); return;
      }
      return this.end('win');
    }
    return this.end('win');
  },
  end(how) {
    /* Pays out once: E stays set until the summary is dismissed. */
    const E = this.E; if (!E || this.over) return;
    this.over = true; this.busy = true;
    Sfx.holdMusic(false);
    /* You come away wearing it on your face. */
    Faces.flash('player', how === 'win' ? 'happy' : how === 'broken' ? 'shame'
      : how === 'transfer' ? 'eyeroll' : 'sad', 7);
    count('calls');
    /* Written work is also counted as itself. */
    if (E.ch !== 'call') count('written');
    let xp = 0, money = 0, rep = 0, msg = '';
    if (how === 'win') {
      xp = 30 + Math.round(E.maxFrus / 3) + (E.boss ? 180 : 0) + (Sk.effects().winXp || 0);
      money = E.boss ? 12 : 1.1 + Math.random();
      /* HOOKS.tips: whatever the game says makes a guest pay more. */
      if (!E.boss) money *= Hook('tips', E) || 1;
      rep = E.boss ? 15 : 4; count('satisfied');
      msg = E.boss ? '' : pick(E.lines.win);
      /* Won by reading them pays more than won by grinding. */
      const rap = Math.round(E.rap || 0);
      if (rap >= 40) {
        const bonus = Math.round(rap / 2) + (E.landed ? 40 : 0);
        xp += bonus; rep += E.landed ? 6 : 3;
        UI.toast('💕', say(E.landed ? 'enc.landed' : 'enc.rapport', { xp: bonus }), 'gold');
        if (E.landed) { P.stats.empathy += 1; Ach.get('a_landed'); }
      }
      /* HOOKS.callWon, for the game's own reactions. */
      if (!E.boss) Hook('callWon', E);
      if (P.patience > P.patMax * 0.5) Ach.get('a_adult');
      if (this.onlyBS && this.turn > 2) Ach.get('a_bs');
      Sfx.levelup();
    } else if (how === 'transfer') { xp = 12; money = .5; rep = -1; msg = say('enc.transfer'); }
    else if (how === 'hangup') { xp = 8; rep = -2; count('angered'); msg = say('enc.hangup'); }
    else if (how === 'angered') { xp = 5; rep = -4; count('angered'); msg = say('enc.angered'); }
    else if (how === 'broken') {
      xp = 5; rep = -2; count('angered');
      msg = say('enc.broken');
    }
    if (E.boss && how === 'win') this.bossWin(E);
    else if (E.boss) this.bossLost(E, how);
    /* What the next one of these opens like; a transfer teaches nothing. */
    if (!E.boss) {
      const d = how === 'win' ? 1 : how === 'transfer' ? 0 : -1;
      if (d) G.callers[E.caller] = clamp((G.callers[E.caller] || 0) + d, -3, 3);
    }
    Player.xp(xp); if (money) Player.mod({ money }); if (rep) Player.mod({ rep });
    /* The transcript, posted now that the outcome is known. */
    Comms.post('calls', {
      thread: E.name,
      from: E.name,
      face: E.face,
      subj: E.name + ' · ' + (how === 'win' ? 'resolved' : how === 'transfer' ? 'transferred'
        : how === 'hangup' ? 'gave up' : how === 'angered' ? 'went badly' : 'you stopped'),
      k: how === 'win' ? 'good' : how === 'transfer' ? '' : 'bad',
      meta: CHANNELS_CB[E.ch].what + ' · ' + this.turn + ' turns · chemistry '
        + Math.round(E.rap || 0) + ' · +' + xp + ' XP'
        + (money ? ' · +' + cash(money) : ''),
      lines: E.script.slice(),
      alert: esc(E.name) + ' · ' + (how === 'win' ? 'resolved' : how === 'hangup' ? 'gave up' : how)
    });
    const after = () => {
      $('#combat').classList.remove('on');
      this.E = null; if (G.state === 'combat') G.state = 'play';
      UI.hud();
    };
    if (msg) {
      this.line(msg, 'say');
      $('#cbMoves').innerHTML = '';
      const b = document.createElement('button');
      b.className = 'btn primary cb-end'; b.style.gridColumn = '1/-1';
      const reward = '+' + xp + ' XP' + (money ? ' · +' + cash(money) : '');
      b.innerHTML = '<span class="ce-t">' + this.words(E).end + '</span><span class="ce-r">' + reward + '</span>';
      b.onclick = () => { after(); this.postBoss(); };
      $('#cbMoves').appendChild(b);
    } else { after(); this.postBoss(); }
  },
  /* Beating a boss is its BOSSES row, every field optional:
       win     the G.flag it sets        ach     an achievement
       quest   a job it completes        pay     { xp, money, rep }
       rel     { npcId: n }              count   { stat: n } today's figures
       skillXp { skill, per, t }         XP per rank of a skill, with a toast ({xp})
       lost    the toast when you walk away   after { face, name, role, pages }, said once
     HOOKS.bossWon(key, E) runs last. */
  bossWin(E) {
    const key = E.boss, b = BOSSES[key] || {};
    if (b.win) G.flags[b.win] = true;
    if (b.ach) Ach.get(b.ach);
    if (b.quest) Q.complete(b.quest);
    const pay = b.pay || {};
    if (pay.xp) Player.xp(pay.xp);
    if (pay.money || pay.rep) Player.mod({ money: pay.money || 0, rep: pay.rep || 0 });
    Object.entries(b.rel || {}).forEach(([id, n]) => Rel.add(id, n));
    Object.entries(b.count || {}).forEach(([k, n]) => count(k, n));
    if (b.skillXp) {
      const m = Sk.rank(b.skillXp.skill);
      if (m) {
        Player.xp(m * b.skillXp.per);
        if (b.skillXp.t) UI.toast('🧘', fill(b.skillXp.t, { xp: m * b.skillXp.per }), 'gold');
      }
    }
    Hook('bossWon', key, E);
  },
  /* A boss walked away from can be taken up again later. */
  bossLost(E, how) {
    const b = BOSSES[E.boss];
    if (b && b.lost) setTimeout(() => UI.toast(b.face, b.lost, 'bad'), 400);
  },
  postBoss() {
    if (G.flags.finalDone && !G.flags.endingShown) { setTimeout(() => Endings.offer(), 600); return; }
    /* One `after` at a time, in table order; the rest wait for the next boss. */
    for (const [key, b] of Object.entries(BOSSES)) {
      if (!b.after || !b.win || !G.flags[b.win] || G.flags[key + 'After']) continue;
      G.flags[key + 'After'] = true;
      const a = b.after;
      setTimeout(() => Dialogue.say(a.face || b.face, a.name, a.role || '', a.pages, null), 500);
      return;
    }
  }
};
