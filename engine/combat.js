'use strict';
/* ---------------- CombatSystem: customer service ---------------- */
/* Between phases the player gets a breather. Without it a multi-phase fight is
   a pure damage race that only a maxed-out build can survive. */
const PHASE_HEAL = 0.30, PHASE_ENERGY = 0.20;

/* ---------------- THE THREE CHANNELS AN ENCOUNTER CAN ARRIVE ON ----------
   THE ENGINE WAS ALWAYS ONE TURN OF WRITING AT A TIME. Pick a reply, they
   reply, their frustration moves, your patience moves. That is a correspondence
   with a stopwatch on it — and for two years it was dressed exclusively as a
   phone call, because a phone call was the only thing in the game.

   So none of the mechanics change here. What changes is what the card SAYS it
   is, and the wording is load-bearing rather than cosmetic: "Incoming call ·
   queue position 4" over an email is a lie the player can read, and "♪ hold
   music" under a text message is worse than no line at all. A written exchange
   has no hold music, nothing is ringing, nobody is waiting on the line, and
   what runs out is not their patience with holding but their patience with
   being replied to badly.

   Each channel therefore owns six strings and one sound, and nothing else in
   this file asks which channel it is. `pat` in particular: on the phone that
   meter is how long they will hold, and in writing it is how many more replies
   they will read before this becomes somebody else's problem. Same number,
   honest label. */
const CHANNELS_CB = {
  call: {
    get what() { return say('call.what'); }, get end() { return say('call.end'); },
    title: E => say('call.title', { n: ri(1, 9) }),
    get said() { return say('call.said'); }, get wrote() { return say('call.wrote'); },
    pat: n => say('call.pat', { n }),
    note: () => say('call.note'),
    ring: () => { Sfx.ring(); setTimeout(() => { if (Combat.E) Sfx.holdMusic(true); }, 1200); }
  },
  mail: {
    get what() { return say('mail.what'); }, get end() { return say('mail.end'); },
    title: E => say('mail.title', { time: clockStr(E.since || G.minutes) }),
    get said() { return say('mail.said'); }, get wrote() { return say('mail.wrote'); },
    pat: n => say('mail.pat', { n }),
    note: () => say('mail.note'),
    ring: () => { Sfx.tone(760, .07, 'sine', .22); Sfx.tone(570, .09, 'sine', .16, .07); }
  },
  text: {
    get what() { return say('text.what'); }, get end() { return say('text.end'); },
    title: E => say('text.title', { time: clockStr(E.since || G.minutes) }),
    get said() { return say('text.said'); }, get wrote() { return say('text.wrote'); },
    pat: n => say('text.pat', { n }),
    note: () => say('text.note'),
    ring: () => { Sfx.tone(1180, .05, 'sine', .2); Sfx.tone(1480, .07, 'sine', .16, .05); }
  }
};

const Combat = {
  E: null, turn: 1, busy: false,
  startCall(hot) {
    /* The very first encounter of a game is the gentle one: the CALLERS row
       marked `first: true`, if there is one. It is never drawn again. */
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
  /* AN ENCOUNTER THAT ARRIVED IN WRITING. Same begin(), same moves, same
     meters — the channel is a property of the encounter and every mechanic
     below is deliberately blind to it. What the item carries is which piece of
     writing it is (`enc.inbound`) and when it landed, which is what lets the
     card say how long it has been sitting there. */
  startInbound(item) {
    const c = (typeof INBOUND === 'undefined' ? [] : INBOUND).find(x => x.id === item.enc.inbound);
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
    /* Per-call state for reading the caller: what they want, what they are
       giving away, how much of you has got through, and which lines they have
       already heard from you today. */
    E.rap = 0; E.used = {}; E.wear = {}; E.matched = 0; E.landed = false;
    /* What the day has taught you about this kind of call. Nine of them come
       through in a shift and every one used to open exactly like the last: the
       elderly caller at 16:40 was the elderly caller at 09:20, whatever you had
       learned in between. A run of these going well now opens the next one a
       little easier, and a run of them going badly opens it harder — at most
       eighteen per cent either way, which is a call you have got the measure
       of rather than a call that has been turned off. Cleared with the run, and
       carried by a save like everything else in G. */
    const mem = E.boss ? 0 : ((G.callers || {})[E.caller] || 0);
    if (mem) {
      E.agg = Math.max(1, E.agg * (1 - mem * .06));
      E.frus = Math.max(8, Math.round(E.frus * (1 - mem * .05)));
      E.maxFrus = E.frus;
    }
    /* How hard they came in, how many turns running you have answered a
       question they were not asking, and how many have gone nowhere at all.
       All three drive the call now; `agg` used to be a constant per caller,
       which made every call the same shape whatever you did in it. */
    E.base = E.agg; E.miss = 0; E.stall = 0;
    /* WHICH CHANNEL, AND THE TRANSCRIPT IT KEEPS. `ch` defaults to the phone,
       so every existing caller and every boss is a call without saying so.
       `script` is the other half of the combat log: the card's own log element
       is wiped when the card closes, so for two years the one part of this
       game with a turn-by-turn record of what you said left no record at all
       once you pressed End call. It is posted to the calls channel by end(). */
    E.ch = E.ch || 'call';
    E.script = [];
    const W = this.words(E);
    this.shiftNeed(E, true);
    G.state = 'combat';
    const cb = $('#combat');
    /* The channel as a class, so combat.css can dress the card as a thread
       rather than a call without anything in here knowing how. */
    cb.className = 'on ch-' + E.ch;
    cb.setAttribute('aria-label', E.boss ? 'Encounter' : W.what);
    $('#cbTitle').textContent = E.boss ? 'ENCOUNTER · ' + BOSSES[E.boss].title : W.title(E);
    $('#cbLog').innerHTML = '';
    W.ring();
    $('#cbHold').textContent = W.note();
    this.line(pick(E.lines.open), 'say');
    /* Said in the log rather than in their mouth: it is a fact about you, not
       about them. They have never rung before. You have taken this call before. */
    if (mem >= 2) this.log(say('enc.memGood'));
    else if (mem <= -2) this.log(say('enc.memBad'));
    this.refresh();
  },
  /* The one place the channel is looked up. Falls back to the phone rather
     than to nothing: an encounter with a channel this build has never heard of
     should be a call, not a card with no words on it. */
  words(E) { return CHANNELS_CB[(E && E.ch) || 'call'] || CHANNELS_CB.call; },
  line(txt, cls) { $('#cbLine').innerHTML = '<span class="' + (cls || 'say') + '">' + esc(txt) + '</span>'; },
  /* Pick what they want next. Certain callers lean a certain way — the elderly
     caller who rang partly for the company, the technical one who wants an
     answer and not a hug — so the roll is weighted rather than uniform, and the
     same caller type now plays consistently instead of surprising you. */
  /* A CALLERS (or INBOUND) row may list `needs:` — the ones this caller leans
     towards, repeated for weight — and a need may name what tends to come
     `next` (both in data/callers.js). Without either, every need in NEEDS is
     equally likely. Ids that are not in NEEDS are ignored. */
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
    /* Most of the time the next want follows from the last one; the rest of the
       time it is whatever this caller leans towards, which keeps them from
       becoming a sequence you can recite. */
    if (!force && E.need && chance(.65)) {
      const on = this.nextNeeds(E.need).filter(x => pool.includes(x));
      n = on.length ? pick(on) : pick(pool);
    } else n = pick(pool);
    /* Never repeat the same need twice running unless the caller is one of the
       single-minded ones — two identical turns reads as the tell being broken. */
    for (let i = 0; i < 3 && n === E.need && !force; i++) n = pick(pool);
    E.need = n;
    E.tell = pick(TELLS[n] || TELLS[Object.keys(TELLS)[0]] || ['…']);
  },
  /* Two destinations, one call. The element is the live transcript beside the
     moves and is capped at thirty because that is what fits; E.script is the
     WHOLE thing and is what survives the card, so a forty-turn boss is still
     forty lines in the calls channel afterwards. */
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

    /* The tell. Named as a want rather than a mechanic — "they want a straight
       answer" is the same information as need:'answer' and reads like a person. */
    const tellBox = $('#cbTell');
    if (E.tell && NEEDS[E.need]) {
      /* "still" when they have been asking for the same thing for two turns and
         not getting it. The tell already changed wording; this says it is the
         same want underneath, which is the difference between a caller being
         random and a caller being ignored. */
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
      /* How much of this one they have already heard today. Objective, so it
         belongs on the button; whether it suits them is for you to work out. */
      const uses = (E.used && E.used[m.id]) || 0;
      /* The badge reports staleness now, not lifetime use: it has to tell you
         whether saying it again would work, which is the decision in front of
         you. A move you last used six turns ago is fresh again. */
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
    /* Every step of a turn is separated from the next by a timer, and each one
       re-reads this.E rather than closing over it. If the call has ended in the
       meantime the caller is gone, so there is nothing left to act on — bail
       instead of dereferencing null. */
    if (this.busy || !this.E) return;
    const E = this.E; this.busy = true; Sfx.select();
    if (m.id !== 'bs') this.onlyBS = false;
    if (m.cost.pat) P.patience = Math.max(1, P.patience - m.cost.pat);
    if (m.cost.ene) P.energy = Math.max(0, P.energy - m.cost.ene);
    const r = m.run(E);
    if (r.stat) { P.stats[r.stat] = (P.stats[r.stat] || 0) + 0.25; }
    /* A turn that moved nothing: a backfire, or two minutes of hold music. They
       are still holding, and they are counting — see customerTurn. */
    if (r.dmg > 0 || r.dmg >= 900) E.stall = 0; else E.stall = Math.min(3, E.stall + 1);

    /* Reading them, and repeating yourself. Both only apply to a move that is
       actually trying to move the call along — the enders (999) and the
       self-care moves are left exactly as they were. */
    const serves = m.serves || [];
    const match = serves.includes(E.need);
    const uses = E.used[m.id] || 0;
    const worn = E.wear[m.id] || 0;
    E.used[m.id] = uses + 1;
    E.wear[m.id] = worn + 1;
    E.lastMatch = false;
    let note = '';
    if (r.dmg > 0 && r.dmg < 900) {
      /* Say the same thing twice running and they hear it becoming a script.
         Staleness fades between uses (see customerTurn), so the answer is to
         rotate rather than to burn each move once and be left with nothing —
         a boss has 170 frustration and there are only seven basic replies. */
      if (worn) r.dmg *= Math.max(0.34, Math.pow(0.72, worn));
      if (match) {
        r.dmg *= 1.65;
        E.rap = clamp(E.rap + 20 + P.eff.empathy, 0, 100);
        E.matched++; E.lastMatch = true;
        note = ' — that was what they wanted.';
        FX.float(P.x, P.y - 34, '💕 chemistry', '#b48cff');
        /* Somebody who is being understood calms down, and stays calmer for
           the rest of the call than they started it. Never all the way: they
           still rang up about something. */
        E.miss = 0;
        E.agg = Math.max(E.base * .78, E.agg - E.base * .08);
      } else if (serves.length) {
        r.dmg *= 0.65;
        E.rap = Math.max(0, E.rap - 8);
        note = ' — not what they were after.';
        /* And somebody being answered off the point gets louder about it. Two
           turns of grace first, because one misread is a guess and everybody
           gets one. */
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
    /* How long they will keep holding, which used to be a flat roll and so was
       the one part of a call you could not affect at all. Being understood buys
       time; a turn that went nowhere costs it, and three of those in a row cost
       a lot, because what a person on hold is actually measuring is whether
       anything is happening. Never below two: no single turn ends a call. */
    if (!E.boss) {
      let drain = ri(5, 11) - (E.lastMatch ? 3 : 0) + Math.min(6, (E.stall || 0) * 2);
      E.cpat -= Math.max(2, drain);
    }
    const hot = E.frus > E.maxFrus * 0.6;
    const said = pick(hot ? E.lines.hot : E.lines.mid);
    let dmg = E.agg * (0.8 + clamp(E.frus / E.maxFrus, 0, 1)) * (1 - Sk.rank('deesc') * 0.13);
    /* A caller may hit softer (`soft` on its CALLERS row), and a boss may be
       resisted by a skill (`resist: { skill, per }` on its BOSSES row). */
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
    /* They move on. Getting it right settles that need and they raise the next
       one; getting it wrong mostly leaves them asking for the same thing again,
       which is the call telling you to read the tell rather than the buttons.
       And once you have missed it twice they stop changing the subject at all:
       a person who is not being heard says the same thing again, in different
       words, until somebody hears it. */
    if (E.lastMatch || (E.miss < 2 && chance(.3))) this.shiftNeed(E);
    else E.tell = pick(TELLS[E.need] || TELLS.heard);
    /* Staleness fades while you are talking about something else. */
    for (const k in E.wear) { E.wear[k] *= 0.62; if (E.wear[k] < 0.2) delete E.wear[k]; }
    this.turn++; this.busy = false;
    this.refresh();
    if (P.patience <= 0) return this.end('broken');
    if (E.cpat <= 0) return this.end('hangup');
    /* Bosses have no queue timer — the fight ends when one of you gives way.
       Only ordinary callers give up on you for taking too long. */
    if (!E.boss && this.turn > TURN_LIMIT) return this.end('hangup');
  },
  /* red flash + floating number on the player's meter when patience is taken */
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
        /* the breather */
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
    /* A call pays out exactly once. E is not cleared until the player dismisses
       the summary, so E alone cannot tell us whether we have already settled up
       — without this flag a second end() would award the XP, money, reputation
       and boss flag all over again. */
    const E = this.E; if (!E || this.over) return;
    this.over = true; this.busy = true;
    Sfx.holdMusic(false);
    /* You come off a call wearing it. The world is not being drawn while the
       overlay is up, so this does not start counting down until the summary is
       dismissed and you are back on the floor — which is exactly when there is
       anybody to see it. */
    if (typeof Faces !== 'undefined') {
      Faces.flash('player', how === 'win' ? 'happy' : how === 'broken' ? 'shame'
        : how === 'transfer' ? 'eyeroll' : 'sad', 7);
    }
    count('calls');
    /* Written-in work is counted as itself as well as as a contact handled.
       Both numbers are true and they are different facts: the shift report
       wants "you handled nineteen things" and "four of them were in writing",
       and a single tally cannot say the second one. */
    if (E.ch !== 'call') count('written');
    let xp = 0, money = 0, rep = 0, msg = '';
    if (how === 'win') {
      xp = 30 + Math.round(E.maxFrus / 3) + (E.boss ? 180 : 0) + Sk.rank('persuade') * 8;
      money = E.boss ? 12 : 1.1 + Math.random();
      /* A bar stocked from your own fridge this morning tips better — see
         STOCK in data/farm.js. */
      if (!E.boss && typeof Farm !== 'undefined' && Farm.tipMult) money *= Farm.tipMult();
      rep = E.boss ? 15 : 4; count('satisfied');
      msg = E.boss ? '' : pick(E.lines.win);
      /* A call won by reading them pays more than a call won by grinding the
         bar down, which is the entire argument of this game. */
      const rap = Math.round(E.rap || 0);
      if (rap >= 40) {
        const bonus = Math.round(rap / 2) + (E.landed ? 40 : 0);
        xp += bonus; rep += E.landed ? 6 : 3;
        UI.toast('💕', say(E.landed ? 'enc.landed' : 'enc.rapport', { xp: bonus }), 'gold');
        if (E.landed) { P.stats.empathy += 1; Ach.get('a_landed'); }
      }
      /* Anything a game wants to happen on a won encounter — a job that
         advances on good calls, say — is HOOKS.callWon in data/game.js. Keep
         it one-way and flagged, or a good afternoon walks a job tracker off
         the end of its own job. */
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
    /* Only an actual win counts as beating a boss. Being broken, hung up on,
       or transferring the encounter away must not award the flag. */
    if (E.boss && how === 'win') this.bossWin(E);
    else if (E.boss) this.bossLost(E, how);
    /* And this is what the next one of these opens like — see begin(). A
       transfer teaches nothing, which is exactly what a transfer is. */
    if (!E.boss) {
      const d = how === 'win' ? 1 : how === 'transfer' ? 0 : -1;
      G.callers = G.callers || {};
      if (d) G.callers[E.caller] = clamp((G.callers[E.caller] || 0) + d, -3, 3);
    }
    Player.xp(xp); if (money) Player.mod({ money }); if (rep) Player.mod({ rep });
    /* THE RECORD, which is the whole reason the calls channel exists. One item
       per encounter, carrying the transcript the card kept — so "what did I
       actually say to that man" is a question with an answer for the rest of
       the shift instead of being wiped with the card. Posted here rather than
       in after(): end() is the moment the outcome is known, and a player who
       closes the tab on the summary has still had the call. */
    Comms.post('calls', {
      thread: E.name,
      from: E.name,
      face: E.face,
      subj: E.name + ' · ' + (how === 'win' ? 'resolved' : how === 'transfer' ? 'transferred'
        : how === 'hangup' ? 'gave up' : how === 'angered' ? 'went badly' : 'you stopped'),
      k: how === 'win' ? 'good' : how === 'transfer' ? '' : 'bad',
      /* The one-line header of the record: which channel, how long it took,
         how well you read them, what it paid. */
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
      /* Its own class: the generic .btn primary is a full-width slab sized for
         a settings row. Label and reward are separate elements so the reward
         can drop to its own line rather than wrapping mid-figure. */
      b.className = 'btn primary cb-end'; b.style.gridColumn = '1/-1';
      const reward = '+' + xp + ' XP' + (money ? ' · +' + cash(money) : '');
      b.innerHTML = '<span class="ce-t">' + this.words(E).end + '</span><span class="ce-r">' + reward + '</span>';
      b.onclick = () => { after(); this.postBoss(); };
      $('#cbMoves').appendChild(b);
    } else { after(); this.postBoss(); }
  },
  /* WHAT BEATING A BOSS DOES is its BOSSES row, not code here. Every field is
     optional:
       win     the G.flag it sets (the one field every boss has)
       ach     an achievement      quest   a job it completes
       pay     { xp, money, rep }  rel     { npcId: n } relationship changes
       count   { stat: n } today's figures
       skillXp { skill, per, t }   XP per rank of a skill, with a toast ({xp})
       lost    the toast when you walk away from it
       after   { face, name, role, pages } — said once, after it is beaten
     HOOKS.bossWon(key, E) runs last, for anything a row cannot say. */
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
        if (b.skillXp.t) UI.toast('🧘', b.skillXp.t.replace('{xp}', m * b.skillXp.per), 'gold');
      }
    }
    Hook('bossWon', key, E);
  },
  /* You can walk away from an encounter and come back to it later. */
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
