'use strict';
/* ---------------- What the day says to you ----------------
   Chat, mail and texts each post to their own channel (engine/comms.js).
   Chat and mail tick in working hours; texts follow you everywhere, so the
   ones scripted after closing are about your evening. */

/* Post every scripted line whose time has come, once a day each. */
function scripted(list, sent, push) {
  list.forEach((m, i) => { if (!sent[i] && G.minutes >= m.t) { sent[i] = true; push(m); } });
}

const Chat = {
  /* The channel is the thread; the person is on the message. */
  push(ch, who, face, msg) {
    Comms.post('chat', {
      thread: ch, from: who, face, body: msg,
      alert: '<b>' + esc(ch) + '</b> ' + esc(this.gist(msg))
    });
  },
  /* The alert is one short line; the whole message is in the channel. */
  gist(m) { return clip(m, 44); },
  tick() { scripted(CHAT_SCRIPT, G.chatSent, c => this.push(c.c, c.who, c.f, c.m)); }
};
const Mail = {
  /* An inbox threads by sender. */
  push(from, s, b, extra) {
    return Comms.post('mail', Object.assign({
      thread: from, from, subj: s, body: b, alert: esc(s)
    }, extra || {}));
  },
  tick() { scripted(MAIL_SCRIPT, G.mailSent, m => this.push(m.from, m.s, m.b)); }
};
/* Texts: the one channel with two sides; `mine` puts a bubble on the right. */
const Texts = {
  push(who, face, msg, extra) {
    return Comms.post('text', Object.assign({
      thread: who, from: who, face, body: msg,
      alert: esc(Chat.gist(msg))
    }, extra || {}));
  },
  /* Your half, posted like theirs so a save carries it. */
  mine(who, msg) {
    return Comms.post('text', { thread: who, from: 'You', face: '🙂', body: msg, mine: true, r: true });
  },
  tick() { scripted(TEXT_SCRIPT, G.textSent, m => this.push(m.who, m.f, m.m)); }
};

/* ---------------- Work that arrives in writing ----------------
   INBOUND (data/callers.js): a message with an `enc` on it that waits until you
   open it and reply, which is Combat on the same terms as a guest. Slower than
   the bells and never abandoned: it costs you at the end of the day (Report),
   not in front of you. */
const Inbound = {
  timer: 0,
  /* It follows you everywhere, but not before your first morning on the floor. */
  live() { return !!G.flags.onTheFloor && G.state === 'play'; },
  tick(dt) {
    if (!this.live()) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    /* Slower still with a backlog; four waiting is already a queue. */
    this.timer = rnd(70, 130) + Comms.pending() * 45;
    if (Comms.pending() >= 4) return;
    this.arrive();
  },
  arrive(force) {
    const pool = INBOUND.filter(c => force ? c.id === force : !G.flags['wrote_' + c.id]);
    if (!pool.length) return null;
    let c = null, r = Math.random() * pool.reduce((s, x) => s + (x.w || 1), 0);
    for (const x of pool) { r -= (x.w || 1); if (r <= 0) { c = x; break; } }
    c = c || pool[0];
    /* Each is a written piece, so each comes once. */
    G.flags['wrote_' + c.id] = true;
    const enc = { inbound: c.id };
    if (c.ch === 'text') return Texts.push(c.from, c.face, c.body, { enc, k: 'bad', alert: esc(c.subj) });
    return Mail.push(c.from, c.subj, c.body, { enc, k: 'bad', face: c.face });
  }
};

/* ---------------- The bells ----------------
   The queue is yours while the clock says so and you are somewhere it can
   reach you (Levels.onSite()). Leave mid-shift and whoever is waiting is
   covered by the floor rather than lost; at closing the bells simply stop. */
const ABANDON_AFTER = 42;   /* seconds a guest waits before giving up */
const Phones = {
  ringing: [],
  /* In working hours, on site, and after your first arrival on the hub. */
  live() { return !!G.flags.onTheFloor && Sky.working() && Levels.onSite(); },
  tick(dt) {
    if (G.today.phonesDown || G.state !== 'play') return;
    if (!this.live()) {
      /* Off site mid-shift is a handover; anything else just stops. */
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
      /* Heard only on its own level and on screen; it waits either way. */
      if (p.ringT > 1.6) { p.ringT = 0; if (p.lvl === World.level && Cam.visible(p.x, p.y)) Sfx.ring(); }
      /* Guests give up, so ignoring the queue has a cost. */
      if (p.waited > ABANDON_AFTER) {
        p.ringing = false; p.waited = 0;
        this.ringing.splice(i, 1);
        count('abandoned');
        Player.mod({ rep: -1 });
        /* Say why when it happened out of sight. */
        UI.toast('🚶', say(p.lvl !== World.level ? 'queue.abandonedAway' : 'queue.abandoned'), 'bad');
      }
    }
  },
  waiting() { return this.ringing.length; },
  /* Somebody else takes them: counted for the report, said once. */
  cover() {
    const n = this.ringing.length;
    this.clearAll();
    count('covered', n);
    UI.toast('💃', say(n === 1 ? 'queue.coveredOne' : 'queue.covered', { n }));
  },
  /* Rings on the hub wherever you are on site, through the live object so it
     is the same one you walk up to. An unvisited hub has no queue yet. */
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

/* ---------------- Happenings ----------------
   EVENTS on site, in working hours. The cooldown is not spent off site, so
   walking back in does not set off several at once. */
const EventSys = {
  tick() {
    if (G.state !== 'play') return;
    if (!Levels.onSite()) return;
    if (G.minutes < DAY_START + 30) return;
    G.eventCooldown -= 1;
    if (G.eventCooldown > 0) return;
    G.eventCooldown = ri(38, 70);
    const ev = pick(EVENTS);
    G.activeEvent = ev;
    UI.toast(ev.e, '<b>' + ev.t + '</b> — ' + ev.d, 'bad');
    try { ev.go(); } catch (e) { console.error('EVENTS.' + ev.id, e); }
    G.todayStats.events = (G.todayStats.events || 0) + 1;
  }
};
