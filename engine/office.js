'use strict';
/* ---------------- What the office says to you ----------------
   THREE SENDERS, THREE CHANNELS, and they used to be two and a half. The chat
   and the inbox each had a push() that ended in UI.toast, so a yoghurt thread
   and a password expiry arrived as the same grey line in the same box as a
   phone being abandoned — and the only way back to either was a tab in a
   ten-tab portal. Both post to their own channel now (see engine/comms.js) and
   the texts are the new one: the channel that follows you off the premises,
   which is the whole reason it exists. */
const Chat = {
  push(ch, who, face, msg) {
    Comms.post('chat', {
      /* The CHANNEL is the thread — twenty people talk in #general and it is
         one conversation, not twenty. The person is on the message. */
      thread: ch, from: who, face, body: msg,
      alert: '<b>' + esc(ch) + '</b> ' + esc(this.gist(msg))
    });
  },
  /* The alert is one line at 11.5px in a 160px band, so it carries the start of
     what was said rather than all of it. The whole message is in the channel,
     which is the arrangement that lets this be short. */
  gist(m) { return m.length > 44 ? m.slice(0, 43) + '…' : m; },
  tick() {
    CHAT_SCRIPT.forEach((c, i) => {
      if (!G.chatSent) G.chatSent = {};
      if (!G.chatSent[i] && G.minutes >= c.t) { G.chatSent[i] = true; this.push(c.c, c.who, c.f, c.m); }
    });
  }
};
const Mail = {
  push(from, s, b, extra) {
    return Comms.post('mail', Object.assign({
      /* An inbox threads by who wrote to you, which is what makes the fourth
         "RE: RE: RE: Printer" from All Staff sit with the other three instead
         of arriving as a fourth stranger. */
      thread: from, from, subj: s, body: b, alert: esc(s)
    }, extra || {}));
  },
  tick() {
    MAIL_SCRIPT.forEach((m, i) => {
      if (!G.mailSent) G.mailSent = {};
      if (!G.mailSent[i] && G.minutes >= m.t) { G.mailSent[i] = true; this.push(m.from, m.s, m.b); }
    });
  }
};
/* ---------------- Texts ----------------
   THE CHANNEL THAT FOLLOWS YOU OUT OF THE BUILDING, and that is not a
   decoration on top of the other two — it is the one piece of this that could
   only exist now the game is not a room.

   The phones are the premises: Phones.live() is the clock AND Levels.onSite(),
   because a queue is a place as much as an hour and off the premises the floor
   covers it. The chat is the premises too, in practice — nobody reads #general
   from a beach. A text is the opposite of both. It arrives wherever you are, it
   does not care what the rota says, and answering one is a thing you can do
   standing in a car park on the far side of the island. So the texts tick
   everywhere and the day's script is written on that understanding: the ones
   that land after five are the ones that are about your evening.

   `mine` on an item is what puts a bubble on the right. A text thread is the
   only channel in this game with two sides to it. */
const Texts = {
  push(who, face, msg, extra) {
    return Comms.post('text', Object.assign({
      thread: who, from: who, face, body: msg,
      alert: esc(Chat.gist(msg))
    }, extra || {}));
  },
  /* Your half of it. Posted rather than faked at render time, so a reply you
     sent is in the record the same way theirs is — and a save carries it. */
  mine(who, msg) {
    const it = Comms.post('text', { thread: who, from: 'You', face: '🙂', body: msg, mine: true, r: true });
    return it;
  },
  tick() {
    TEXT_SCRIPT.forEach((m, i) => {
      if (!G.textSent) G.textSent = {};
      if (!G.textSent[i] && G.minutes >= m.t) { G.textSent[i] = true; this.push(m.who, m.f, m.m); }
    });
  }
};

/* ---------------- The written-in queue ----------------
   WORK THAT ARRIVES IN WRITING. A phone rings on the fourth floor and stops
   ringing when you leave the building; an email does not, which is the joke
   this whole channel is built on and also the mechanic.

   So INBOUND (data/callers.js) is the other half of the workload: a complaint
   that came in as an email, a text from somebody who got your number off a
   previous call, a form somebody typed into a box at two in the morning. Each
   lands in its channel with an `enc` on it, and the message sits there being
   unanswered until you open it and write back — which is Combat, on the same
   turn-based terms as a call, because a turn-based exchange of replies is
   closer to what email IS than it ever was to a phone call.

   THE RATE IS DELIBERATELY SLOWER THAN THE PHONES and there is no abandon
   timer. A caller gives up after forty-two seconds; an email waits. That is
   the difference in the fiction and it is the difference in the pressure: the
   phones are the thing happening to you now, and the inbox is the thing that
   will still be there. What it costs to ignore one is reputation at the end of
   the shift (see Report), not a phone going quiet in front of you. */
const Inbound = {
  timer: 0,
  /* Written-in work does not stop at the door and does not stop at five, but
     it does need the shift to have started: a new starter's first morning
     should not open with four unanswered complaints. */
  live() { return !!G.flags.onTheFloor && G.state === 'play'; },
  tick(dt) {
    if (!this.live()) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    /* Long, and longer once there is a backlog. Four unanswered things in the
       inbox is already a queue; a fifth arriving on top of it is noise rather
       than pressure. */
    this.timer = rnd(70, 130) + Comms.pending() * 45;
    if (Comms.pending() >= 4) return;
    this.arrive();
  },
  arrive(force) {
    const pool = (typeof INBOUND === 'undefined' ? [] : INBOUND)
      .filter(c => force ? c.id === force : !G.flags['wrote_' + c.id]);
    if (!pool.length) return null;
    let c = null, r = Math.random() * pool.reduce((s, x) => s + (x.w || 1), 0);
    for (const x of pool) { r -= (x.w || 1); if (r <= 0) { c = x; break; } }
    c = c || pool[0];
    /* One of each per shift. They are written pieces rather than a deck of
       stats — the same reason a boss is not a caller — so a second copy of one
       reads as the game repeating itself rather than as a busy inbox. */
    G.flags['wrote_' + c.id] = true;
    const enc = { inbound: c.id };
    if (c.ch === 'text') return Texts.push(c.from, c.face, c.body, { enc, k: 'bad', alert: esc(c.subj) });
    return Mail.push(c.from, c.subj, c.body, { enc, k: 'bad', face: c.face });
  }
};

/* ---------------- Phone ringing ----------------
   WHOSE QUEUE IT IS. Two questions, and for a year they were the same one:
   the shift was running, therefore the phones were yours, because every level
   in the game was a floor of this office and there was nowhere else you could
   possibly be. That stopped being true the day there was an island out there.

   A queue is a place as much as it is an hour. It is yours while the clock says
   so AND while you are somewhere it can reach you — which is the building, all
   four floors of it, including the one under the archive. Off the premises the
   floor covers it: nineteen other people are wearing headsets and the rota does
   not have your name against the whole of it. So nothing new rings, nothing
   counts towards being abandoned, and the phones that were ringing as you left
   are COVERED rather than lost. Walking out is not free — it is still a shift
   you are not doing — but it costs you the calls you would have taken, not
   reputation for the ones somebody else did.

   Which leaves the cost exactly where it belongs: in the building, with the
   phone ringing eight feet away and you deciding to look at something else. */
const ABANDON_AFTER = 42;   /* seconds a caller will hold before giving up */
const Phones = {
  ringing: [],
  /* THE QUEUE IS LIVE: three facts, and everything that pressures the player
     about phones asks this and nothing else.

     The clock is in the shift — Sky.working(). You are somewhere it can reach
     you — Levels.onSite(), which is the building rather than the desk. And you
     have started at all: `onTheFloor` is set the first time you stand on the
     floor the phones are on (see Levels.go), because a shift begins in the
     lobby and nobody is on a rota they have not walked onto yet. */
  live() { return !!G.flags.onTheFloor && Sky.working() && Levels.onSite(); },
  tick(dt) {
    if (G.flags.phonesDown || G.state !== 'play') return;
    /* NOT YOUR QUEUE, and the two ways that can be true end differently.
       AT FIVE the queue closes. It is the one promise this building keeps, and
       until the clock ran past seventeen hundred there was no way to keep it —
       the day simply ended. A phone still ringing at 02:00 is not atmosphere,
       it is a shift nobody clocked out of. Nothing is holding, so nothing is
       handed over: the phones simply stop.
       OFF THE PREMISES, mid-shift, whoever is holding is still holding — and
       somebody on the floor picks them up. That is cover(), and it is the whole
       of the difference. */
    if (!this.live()) {
      /* Only ONE of the ways to fail that test is a handover. Off the premises
         mid-shift, somebody holding is still somebody holding and the floor
         takes them — cover(), which says so. The queue closing at five, or a
         first morning that has not reached the floor yet, is not a handover:
         there is nobody to hand to and nothing to say. */
      if (this.ringing.length) {
        if (Sky.working() && !Levels.onSite()) this.cover(); else this.clearAll();
      }
      return;
    }
    this.timer = (this.timer || 0) - dt;
    if (this.timer <= 0) {
      this.timer = rnd(7, 16);
      if (this.ringing.length < 3) this.ringRandom();
    }
    for (let i = this.ringing.length - 1; i >= 0; i--) {
      const p = this.ringing[i];
      p.ringT = (p.ringT || 0) + dt;
      p.waited = (p.waited || 0) + dt;
      /* Only audible on the level the phone is on. It keeps ringing while you
         are elsewhere in the building — in the lobby, upstairs, down the ladder
         — and keeps counting towards being abandoned, which is the cost of
         being anywhere but at the desk while the queue is yours. But a desk
         phone on the fourth floor cannot be heard from the stairwell, and
         without this it was heard from anywhere whose map happened to put those
         tile coordinates on screen. Beyond the front doors it does not ring at
         all any more: see cover() and the note at the top of this section. */
      if (p.ringT > 1.6) { p.ringT = 0; if (p.lvl === World.level && Cam.visible(p.x, p.y)) Sfx.ring(); }
      /* A phone that rings forever is scenery. Let callers give up, so that
         ignoring the queue is a choice with a cost rather than a free option. */
      if (p.waited > ABANDON_AFTER) {
        p.ringing = false; p.waited = 0;
        this.ringing.splice(i, 1);
        count('abandoned');
        Player.mod({ rep: -1 });
        /* SAY WHY, when the why is not in front of you. On the call floor this
           is a phone you watched ring out and the old lines are exactly right.
           Somewhere else in the building it is a phone you never heard, and a
           point of reputation going for no visible reason reads as the game
           being arbitrary rather than as the rule it is — in the building, on
           shift, the queue is yours. Out of the building it never gets here at
           all; the floor covers it. See cover(). */
        UI.toast('🚶', say(p.lvl !== World.level ? 'queue.abandonedAway' : 'queue.abandoned'), 'bad');
      }
    }
  },
  waiting() { return this.ringing.length; },
  /* SOMEBODY ELSE TAKES THEM. Called the moment the shift is still running and
     you are no longer in the building: the phones stop, the queue empties, and
     nobody is charged for it. Counted, because it is a real number about a day
     — how many calls the floor took that were nominally yours — and because the
     shift figures should be able to say so out loud rather than quietly showing
     a smaller tally than a day spent at the desk.

     Not a toast per phone. It is one line, said once, for however many were
     ringing as the door shut behind you. */
  cover() {
    const n = this.ringing.length;
    this.clearAll();
    count('covered', n);
    UI.toast('💃', say(n === 1 ? 'queue.coveredOne' : 'queue.covered', { n }));
  },
  /* A PHONE ON THE CALL FLOOR, wherever you happen to be standing on the
     premises. This used to read World.objects — the level you are on — which
     was the same thing as the call floor for as long as the call floor was the
     game. Once the building had four storeys it quietly meant something else:
     stand in the lobby, or on five, or down the ladder, and nothing could ring
     at all, because there are no desk phones on those floors. The queue froze
     the moment you left the room. Which made a rule written two commits ago —
     in the building, the queue is still yours — true only of the calls that
     happened to be ringing as you went through the door.

     So it rings where the phones are: the hub, whichever level that is, asked
     for by reference through Levels.objectsOn() so that the phone rung while
     you are downstairs is the same object you walk up to. Never built on
     demand for this — an unvisited hub simply has no queue yet, and the hub is
     pinned in the cache from the first time you stand on it. */
  ringRandom(hot) {
    const objs = Levels.objectsOn(Levels.hub());
    if (!objs) return;
    const phones = objs.filter(o => o.kind === 'phone' && !o.ringing);
    if (!phones.length) return;
    const p = pick(phones);
    p.ringing = true; p.hot = !!hot; p.ringT = 0; p.waited = 0; p.lvl = Levels.hub(); this.ringing.push(p);
  },
  answer(p) {
    p.ringing = false; p.waited = 0; this.ringing = this.ringing.filter(x => x !== p);
    Combat.startCall(p.hot);
  },
  clearAll() { this.ringing.forEach(p => { p.ringing = false; p.waited = 0; }); this.ringing = []; }
};

/* ---------------- The Manager appears ---------------- */

/* ---------------- Random events ---------------- */
const EventSys = {
  tick() {
    if (G.state !== 'play') return;
    /* THESE ARE THINGS THAT HAPPEN ON THE FLOOR. The printer, the fire alarm
       that is always a test, the pizza, the two people with lanyards walking
       slowly — every one of them is an event you are told about because you are
       standing in the room it happened in. Announced to somebody halfway up the
       coast road they are not atmosphere, they are a phone buzzing about a
       building you have left. They wait: the cooldown is not spent out here, so
       walking back in does not set off four of them at once. */
    if (!Levels.onSite()) return;
    if (G.minutes < DAY_START + 30) return;
    G.eventCooldown -= 1;
    if (G.eventCooldown > 0) return;
    G.eventCooldown = ri(38, 70);
    const ev = pick(EVENTS);
    G.activeEvent = ev;
    UI.toast(ev.e, '<b>' + ev.t + '</b> — ' + ev.d, 'bad');
    try { ev.go(); } catch (e) { }
    G.todayStats.events = (G.todayStats.events || 0) + 1;
  }
};
