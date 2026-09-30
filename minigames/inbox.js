'use strict';
/* ---------------- Inbox Zero ----------------
   Your own workstation, and the folder that has never once been empty.

   The SECOND shape: a decision game. There is no dexterity in it at all — every
   press is one of three, and the difficulty is entirely in reading a subject
   line faster than the timer under it drains. It shares the interface with a
   four-lane rhythm game and a grid puzzle, which is the claim the library
   exists to make.

   The rule the player has to work out for themselves is the joke: nothing here
   is ever ANSWERED, it is sorted. Three verbs, and only one of them involves
   doing any work.

   AND IT TEACHES, which it did not. A round is thirty cards and two wrong ones
   cost four of the twelve escalations, so somebody who has not yet worked the
   rule out loses in about seven cards — having been told nothing at any point
   about why. That is a game you can only learn by losing at it repeatedly and
   guessing what changed. So a wrong sort now HOLDS the card: it names the verb
   it wanted and the tell that gave it away, for three quarters of a second,
   which is long enough to read six words and not long enough to be a
   punishment on top of the punishment. */

const MG_INBOX = {
  id: 'inbox',
  name: 'All Booked',
  icon: '📅',
  blurb: 'The Driftwood inbox. Bookings, staff, and a lot of people trying to sell you things.',
  goal: 'Sort thirty before the mess piles up.',
  mins: 10,
  /* Measured, like the others: a good round — a couple wrong out of thirty —
     scores about this. Perfect is 11,280 and caps at the 1.4 the reward
     clamps to. */
  par: 7500,
  help: {
    keys: ['◀ bin · ▲ book · ▶ pass to Mari', 'A real booking gets booked. Staff notes go to Mari. Everything else goes in the bin.'],
    taps: ['Tap BIN, BOOK or MARI', 'A real booking gets booked. Staff notes go to Mari. Everything else goes in the bin.']
  },
  pads: [
    { code: 'ArrowLeft', label: '🗑 Bin', aria: 'Bin this message' },
    { code: 'ArrowUp', label: '📅 Book', aria: 'Book this in' },
    { code: 'ArrowRight', label: '💃 Mari', aria: 'Pass this to Mari' }
  ],

  /* Three verbs, and the key and pad that mean each. */
  ACT: { ArrowLeft: 'bin', ArrowUp: 'reply', ArrowRight: 'dave' },
  LABEL: { bin: 'BINNED', reply: 'BOOKED', dave: 'TO MARI' },
  VERB: { bin: 'BIN', reply: 'BOOK', dave: 'MARI' },
  /* One line per kind, shown on the card when you get one wrong. The rules of
     the game, given a card at a time and only when they are wanted — which is
     the only moment anybody reads a rule. */
  WHY: {
    reply: 'a real guest who wants a table',
    dave: 'somebody on the island — Mari will deal with it',
    bin: 'nobody you have ever met, selling something'
  },
  TARGET: 30,
  CEILING: 12,           /* escalations you can carry before somebody notices */

  /* The deck. Each kind carries its own tell, and the tells are the whole
     tutorial: a customer says what they bought, a phish says click here, and
     internal post says "all staff" and means nothing to anybody. */
  /* The deck. Each kind carries its own tell, and the tells are the whole
     tutorial: a customer says what they bought, a phish says click here, and
     internal post says "all staff" and means nothing to anybody.

     Thirty are sorted in a round and each kind is drawn about ten times, so a
     seven-line list showed the same subject three times a game and the round
     became a memory test rather than a reading one. Eighteen each, and a
     subject already used this round is not offered again. */
  DECK: {
    reply: {
      from: ['priya.and.tom@', 'the.okafors@', 'honeymoon.2026@', 'j.mcbride@', 'sunseekers.club@',
        'w.hargreaves@', 'hen.do.kerry@', 'the.brennans@', 'a.nkemelu@', 'yoga.retreat@'],
      subj: ['Table for 6 at sunset on Friday?',
        'Can we book the deck for a proposal?? (SECRET)',
        'Hen party of 12 — do you do pink drinks',
        'Anniversary dinner, somewhere romantic please',
        'Birthday drinks for my wife, Saturday 8pm',
        'Do you take bookings for the fire pit?',
        'Wedding afterparty — 40 guests, June',
        'Honeymoon! Any chance of the snug?',
        'Group of 8 surfers, very thirsty, Tuesday',
        'Can we reserve two stools at the bar?',
        'Is Luca DJing on Friday? Booking if yes',
        'Retirement party for Pepe (surprise)',
        'Sunset table for two, first date, help',
        'Book us in for cocktail class please',
        'Our yacht arrives Thursday, table for 10',
        'Vow renewal on the beach — drinks after?',
        'Can you do a mojito tower for 20',
        'Returning guests! Same table as last year?']
    },
    dave: {
      from: ['mari@', 'luca.dj@', 'kai.surf@', 'teo.boat@', 'mamacoco@',
        'jade.lifeguard@', 'pepe@', 'rafa@', 'the.driftwood@', 'island.council@'],
      subj: ['Mari: we are OUT of limes. Again.',
        'Luca: new playlist, very sexy, you will see',
        'Kai: left my board on the deck lol',
        'Teo: boat is late, fish is early',
        'Mama Coco: I know what you did last night',
        'Jade: can I store sun cream in your fridge',
        'Pepe: my chair. Please.',
        'Rafa: postcard from Bali, wish you were here',
        'Council: bin day is Tuesday. It was always Tuesday.',
        'Mari: who put a flamingo on the roof',
        'Luca: the jukebox is jealous of me',
        'Kai: are you coming surfing or what',
        'Mari: rota for next week (you are on every day)',
        'Teo: I need the forty euros Rafa owed me',
        'Jade: somebody fell asleep on lounger 4',
        'Mama Coco: mangoes half price, tell nobody',
        'Pepe: I have a story. It is long.',
        'Council: please stop the conga at 2am']
    },
    bin: {
      from: ['no-reply@', 'sterling.resorts@', 'winner@', 'crypto.beach@', 'timeshare.deals@',
        'ceo.office@', 'free.cruise@', 'bitc0in.bar@', 'account-team@', 'influencer.pr@'],
      subj: ['URGENT: sell your bar in 24 hours',
        'Sterling Resorts: an offer you cannot refuse',
        'You have WON a free cruise (pay postage)',
        'Timeshare opportunity: own 1/52 of a condo',
        'Invoice attached (invoice.pdf.exe)',
        'Crypto for beach bars — the future of rum',
        'Congratulations you have been selected',
        'Collab? 12 followers, want free drinks forever',
        'Your domain driftwood.bar is expiring (it is not)',
        'Buy 10,000 paper umbrellas, special price',
        'ACTION REQUIRED: verify your cocktail licence',
        'Sterling Resorts: let’s circle back on your shack',
        'Hot singles in your area (the area is an island)',
        'Your parcel could not be delivered (no parcel exists)',
        'Payroll update — reconfirm your bank details',
        'FINAL NOTICE regarding your yacht (no yacht)',
        'Document shared with you: “FREE RUM.xlsm”',
        'We noticed a problem. Confirm everything.']
    }
  },

  start(a) {
    this.done = 0; this.right = 0; this.wrong = 0; this.timedOut = 0;
    this.combo = 0; this.bestCombo = 0; this.esc = 0;
    this.card = null; this.fly = null; this.shownAt = 0;
    this.seen = {};                 /* subjects already used this round */
    this.lastKind = null; this.sameRun = 0;
    this.deal(a);
  },

  /* One email. Kinds are drawn rather than cycled, but never three of a kind in
     a row: a run of the same answer teaches the wrong lesson entirely. */
  deal(a) {
    const kinds = ['reply', 'reply', 'dave', 'bin', 'bin', 'dave'];
    let k = pick(kinds);
    for (let i = 0; i < 4 && k === this.lastKind && this.sameRun >= 2; i++) k = pick(kinds);
    this.sameRun = k === this.lastKind ? (this.sameRun || 0) + 1 : 1;
    this.lastKind = k;
    const d = this.DECK[k];
    /* Never the same subject twice in one round: thirty cards out of three
       lists is enough draws that a repeat is likely, and a repeat turns a
       reading game into a memory game. The pool cannot run dry — eighteen each
       against about ten draws each — but the fallback is there because a
       shorter deck one day would otherwise loop for ever. */
    const fresh = d.subj.filter(x => !this.seen[x]);
    const subj = pick(fresh.length ? fresh : d.subj);
    this.seen[subj] = 1;
    /* The limit shortens as the pile goes down, which is the only thing that
       makes the last ten different from the first ten — and the cabinet's
       skill adds a third of a second per rank on top, which at rank 3 is
       nearly a whole card's worth of reading back. Weaponised Email is the one
       it is wired to, which is the joke: the skill for writing them turns out
       to be the skill for not having to. */
    const limit = Math.max(1.55, 4.4 - this.done * 0.095) + (a.skill || 0) * 0.33;
    this.card = { kind: k, from: pick(d.from), subj: subj, limit: limit, left: limit };
    this.shownAt = a.t;
  },

  input(a, ev) {
    if (this.fly) return;                       /* one card is already leaving */
    if (ev.kind === 'key' && ev.down && this.ACT[ev.code]) return this.sort(a, this.ACT[ev.code]);
    /* The three targets are drawn on the canvas, so they can be pressed as well
       as keyed — a pointer is first-class here, not a fallback. */
    if (ev.kind === 'point' && ev.down) {
      const hit = this.targetAt(a, ev.x, ev.y);
      if (hit) this.sort(a, hit);
    }
  },

  sort(a, verb) {
    const c = this.card; if (!c) return;
    const ok = verb === c.kind;
    this.done++;
    if (ok) {
      this.right++; this.combo++;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      const mult = Math.min(3, 1 + Math.floor(this.combo / 5) * 0.5);
      /* Reading it quickly is worth something, but only a little: this is a
         game about being right, and rewarding haste over accuracy would teach
         the player to guess. */
      const speed = clamp(1 - (a.t - this.shownAt) / c.limit, 0, 1);
      a.add(Math.round((90 + speed * 60) * mult));
      this.esc = Math.max(0, this.esc - 1);
      a.sfx.good();
      a.pop(a.w / 2, a.h * .30, '+' + this.LABEL[verb], a.paint.good);
    } else {
      this.wrong++; this.combo = 0; this.esc += 2;
      a.add(-60);
      a.shake(5); a.sfx.bad();
      a.pop(a.w / 2, a.h * .30, 'ESCALATED', a.paint.bad);
    }
    /* A right answer flies out at once; a wrong one is HELD, with what it
       wanted written on it. The card is the only place that can say so — by
       the time it has gone you are reading the next one. */
    this.fly = { verb: verb, ok: ok, t: 0, hold: ok ? 0 : this.TEACH,
      want: c.kind, why: this.WHY[c.kind] };
  },
  /* How long a wrong card stays up. Long enough to read six words, short
     enough not to be a second punishment. */
  TEACH: 0.95,

  update(a, dt) {
    if (this.fly) {
      this.fly.t += dt;
      if (this.fly.hold > 0) { this.fly.hold -= dt; this.fly.t = 0; return; }
      if (this.fly.t > .22) {
        this.fly = null;
        if (this.esc >= this.CEILING) {
          return a.end({ win: false, score: a.score,
            note: 'Mari has seen the state of the inbox.' });
        }
        if (this.done >= this.TARGET) {
          a.add(this.bestCombo * 25 + Math.max(0, this.CEILING - this.esc) * 40);
          return a.end({ win: true, score: a.score,
            note: this.wrong === 0 ? 'Thirty sorted, not one wrong. The book is full and the bin is fuller.'
              : 'The book is full. The bin is fuller.' });
        }
        this.deal(a);
      }
      return;
    }
    const c = this.card; if (!c) return;
    c.left -= dt;
    if (c.left <= 0) {
      /* Running out is its own outcome and is worse than being wrong once, but
         cheaper than being wrong twice: doing nothing is a decision here. */
      this.done++; this.timedOut++; this.combo = 0; this.esc += 1;
      a.sfx.bad(); a.shake(3);
      a.pop(a.w / 2, a.h * .30, 'LEFT UNREAD', a.paint.hold);
      this.fly = { verb: null, ok: false, t: 0, hold: this.TEACH,
        want: c.kind, why: this.WHY[c.kind] };
    }
  },

  summary(a) {
    return [['sorted', this.right + '/' + this.TARGET],
      ['wrong', String(this.wrong)],
      ['unread', String(this.timedOut)],
      ['best run', String(this.bestCombo)]];
  },

  hud(a) {
    return { l: 'SORTED ' + this.done + '/' + this.TARGET + (this.combo >= 3 ? '  ·  ×' + this.combo : ''),
      r: 'SCORE ' + a.score };
  },

  /* ---- the three targets, measured once so drawing and hit-testing can never
     disagree about where they are ---- */
  /* Empty on a coarse pointer: the declared pads are already under the thumb,
     and drawing the same three verbs on the canvas as well cost the card sixty
     pixels to say a thing that was said directly below it. A mouse has no pads,
     so there they are the control and they carry the arrow keys with them. */
  targets(a) {
    if (a.touch) return [];
    const pad = 8, n = 3;
    const h = clamp(a.h * .16, 42, 62);
    const w = (a.w - pad * (n + 1)) / n;
    const y = a.h - h - pad;
    return [
      { verb: 'bin', label: a.touch ? 'BIN' : '◀ BIN', x: pad, y: y, w: w, h: h, c: a.paint.bad },
      { verb: 'reply', label: a.touch ? 'BOOK' : '▲ BOOK', x: pad * 2 + w, y: y, w: w, h: h, c: a.paint.good },
      { verb: 'dave', label: a.touch ? 'MARI' : '▶ MARI', x: pad * 3 + w * 2, y: y, w: w, h: h, c: a.paint.brand }
    ];
  },
  targetAt(a, x, y) {
    const t = this.targets(a).find(t => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
    return t ? t.verb : null;
  },

  draw(a, g) {
    const p = a.paint, c = this.card;
    const bg = g.createLinearGradient(0, 0, 0, a.h);
    bg.addColorStop(0, '#101725'); bg.addColorStop(1, p.ink);
    g.fillStyle = bg; g.fillRect(0, 0, a.w, a.h);

    /* the escalation meter, along the very top — the thing that ends the round */
    const ew = a.w - 24;
    p.bar(g, 12, 10, ew, 7, this.esc / this.CEILING,
      this.esc >= this.CEILING - 3 ? p.bad : this.esc > 4 ? p.hold : p.line);
    p.say(g, 'PILE-UP ' + this.esc + '/' + this.CEILING, 12, 30,
      { size: 9, font: p.mono, colour: this.esc > 4 ? p.hold : p.dim });
    p.say(g, (this.TARGET - this.done) + ' LEFT', a.w - 12, 30,
      { size: 9, font: p.mono, colour: p.dim, align: 'right' });

    const tg = this.targets(a);
    const top = 44, bottom = tg.length ? tg[0].y - 12 : a.h - 12;
    /* The stack behind the card, so the pile has a visible depth to it. */
    const cw = Math.min(a.w - 28, 400), cx = (a.w - cw) / 2;
    const chH = clamp(bottom - top - 16, 84, 250), cy = top + (bottom - top - chH) / 2;
    for (let i = 2; i >= 1; i--) {
      p.box(g, cx + i * 5, cy - i * 5, cw - i * 10, chH, 10, 'rgba(255,255,255,.03)', 'rgba(255,255,255,.06)');
    }

    if (c) {
      /* The card slides out the way it was sorted, which is the only feedback
         that says WHICH of the three you actually pressed. */
      let dx = 0, dy = 0, al = 1;
      const teaching = this.fly && this.fly.hold > 0;
      if (this.fly && !teaching) {
        const k = clamp(this.fly.t / .22, 0, 1), e = k * k;
        al = 1 - k;
        if (this.fly.verb === 'bin') dx = -e * a.w;
        else if (this.fly.verb === 'dave') dx = e * a.w;
        else if (this.fly.verb === 'reply') dy = -e * a.h;
        else dy = e * 40;
      }
      g.save(); g.globalAlpha = al; g.translate(dx, dy);
      p.box(g, cx, cy, cw, chH, 10, p.panel, this.fly && !this.fly.ok ? p.bad : p.line);
      /* the unread dot, because every one of these has one */
      g.fillStyle = p.brand; g.beginPath(); g.arc(cx + 18, cy + 22, 4, 0, 6.284); g.fill();
      const inner = cw - 46;
      p.say(g, c.from, cx + 30, cy + 26, { size: 11, font: p.mono, colour: p.dim });
      const size = p.fit(g, c.subj, inner, 17, { weight: '600' });
      p.say(g, c.subj, cx + 30, cy + 52, { size: size, weight: '600', colour: p.text });
      if (teaching) {
        /* What it wanted, and why — over the bottom of the card it belongs to,
           because a correction anywhere else is a correction about nothing. */
        const col = this.fly.want === 'reply' ? p.good
          : this.fly.want === 'dave' ? p.brand : p.bad;
        const yy = cy + chH - 40;
        p.box(g, cx + 12, yy, cw - 24, 30, 6, 'rgba(0,0,0,.45)', col);
        const label = '→ ' + this.VERB[this.fly.want];
        p.say(g, label, cx + 22, yy + 20, { size: 13, weight: '700', font: p.mono, colour: col });
        g.font = '700 13px ' + p.mono;
        const lx = cx + 26 + g.measureText(label).width;
        const size = p.fit(g, this.fly.why, cw - 40 - (lx - cx), 12);
        p.say(g, this.fly.why, lx, yy + 20, { size: size, colour: 'rgba(255,255,255,.62)' });
      } else {
        /* Only when the card has the room. In landscape it is 90px tall and
           this line lands through the subject, which is what is being read. */
        if (chH > 118) {
          p.say(g, a.touch ? 'Sort it. Do not read it.' : 'Sort it with ◀ ▲ ▶. Do not read it.',
            cx + 30, cy + chH - 26, { size: 11, colour: 'rgba(255,255,255,.28)' });
        }
        /* the timer, along the bottom edge of the card itself */
        const k = clamp(c.left / c.limit, 0, 1);
        p.bar(g, cx + 14, cy + chH - 14, cw - 28, 6, k, k > .45 ? p.brand : k > .2 ? p.hold : p.bad);
      }
      g.restore();
    }

    /* the three targets */
    for (const t of tg) {
      /* While it is teaching, the lit target is the one it WANTED — pointing at
         the answer rather than at the mistake. */
      const armed = this.fly && (this.fly.hold > 0 ? this.fly.want === t.verb
        : this.fly.verb === t.verb);
      p.box(g, t.x, t.y, t.w, t.h, 8, armed ? t.c : 'rgba(255,255,255,.04)', armed ? '#fff' : t.c);
      const size = p.fit(g, t.label, t.w - 12, 12, { weight: '700', font: p.mono });
      p.say(g, t.label, t.x + t.w / 2, t.y + t.h / 2 + 4,
        { size: size, weight: '700', font: p.mono, colour: armed ? p.ink : t.c, align: 'center' });
    }
  },

  reward(a, r) {
    const share = clamp(r.score / this.par, 0, 1.4);
    if (!r.win) {
      return { xp: Math.round(16 * share), patience: -4,
        toast: 'The inbox won. Mari takes your phone off you.' };
    }
    Ach.get('a_inboxzero');
    if (this.wrong === 0 && this.timedOut === 0) Ach.get('a_nothingread');
    if (Arcade.clearedAll()) Ach.get('a_arcade');
    return {
      xp: 35 + Math.round(65 * share),
      money: Math.round(share * 180) / 100,
      rep: 2, energy: -6,
      toast: 'All booked. Every table, every sunset, every stool.'
    };
  }
};
