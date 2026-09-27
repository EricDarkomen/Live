'use strict';
/* ---------------- Comms: the traffic, and the five places it lands ----------
   THE OFFICE TALKS TO YOU IN FIVE VOICES AND THEY WERE ALL ONE STREAM.

   A yoghurt thread, a password expiry, a phone abandoned on a floor you are not
   on, an achievement, twelve minutes lost to a Greggs — every one of them was
   `UI.toast(emoji, sentence)` into a single fixed-height scrollback, in one
   typeface, in one colour, in one order, with no way to ask "what was that
   email" other than scrolling the whole afternoon back. The scrollback WAS the
   archive, which is the fault underneath every other fault here: a notification
   is a tap on the shoulder and an archive is a place, and one element cannot be
   both. It was a stack of unrelated facts sorted by nothing but when they
   happened.

   So there are two things now, and the split is the whole design.

   THE RECORD is this file's channels. Five of them, each one genuinely the
   thing it says: mail is an inbox with senders and subjects, texts are threads
   with somebody, the chat is channels, the log is a ledger of what happened,
   and calls is a transcript per call. Each keeps its own history at its own
   cap, counts its own unread, and is READ in the shape it belongs in — see
   Comms.render(). A channel is not a filter over one list; it is its own list.

   THE ALERT is a pointer INTO the record and nothing else. One line, typed by
   channel, at most two of them on a phone, gone in five seconds, and tapping
   one opens the channel it came from at the item it named. It carries no
   history at all, because the history is a tap away — which is what lets it be
   two lines high on a phone instead of a quarter of the screen.

   WHAT IS SPACE-MANAGED, AND HOW. Nothing here grows with traffic. The alert
   band's maximum height is maxAlerts() rows and a gap, so the tracker parked
   beside it can never be pushed anywhere by a busy minute — and that number is
   read off the same media query the stylesheet reserves the space with, or the
   two would eventually disagree about how many rows fit. The rail is five
   fixed chips on a desktop and ONE on a phone (`#cmOne`, the same total
   unread behind one tap target) because five 32px chips do not fit the 160px
   the band has on a 320px screen and pretending otherwise is how a control
   ends up half off the side. Both are in the markup at once and sync() writes
   both, or a hidden count eventually disagrees with a visible one.

   WHERE IT LIVES. G.comms is five arrays of plain data, so {...G} in
   Save.write carries the whole day's traffic without Save knowing what a
   channel is, and resetRun() empties it or a new starter arrives holding
   somebody else's inbox. */

const CHANNELS = [
  /* `cap` is what a day of this channel is worth keeping. A chat channel says
     more in a shift than an inbox does, and a call transcript is forty lines
     rather than one, which is why these are not the same number.

     `pop` IS THE ANTI-SPAM RULE AND IT IS PER CHANNEL, because the five are not
     equally worth interrupting you for. Measured over one shift, the first
     version of this raised 166 alerts and 111 of them were the chat — a
     yoghurt thread, one pop-up per line, six of them inside a single game
     minute. The record was right and the alert was wrong: the band had been
     made small and capped, which fixed the FOOTPRINT and did nothing about the
     FREQUENCY, and a small pop-up every four seconds is still a pop-up every
     four seconds.

     The question that sorts them is not severity, it is WHO IT IS FOR.
       'always' — somebody is addressing you and is waiting. Mail and texts.
       'never'  — atmosphere, or something you have just been looking at
                  anyway. The chat is twenty people about a yoghurt; the call
                  log is a call you pressed End on two seconds ago.
       'always' on the log as well, because that is where the game answers
                  what you just DID — a coffee, a level, a skill bought — and
                  an acknowledgement of your own press is not spam.
     Anything silent still counts on the rail, which is the whole reason the
     rail exists. */
  { id: 'mail',  n: 'Post',   e: '💌', cap: 60,  read: 'thread', pop: 'always',
    get empty() { return say('empty.mail'); } },
  { id: 'text',  n: 'Texts',  e: '📱', cap: 90,  read: 'thread', pop: 'always',
    get empty() { return say('empty.text'); } },
  { id: 'chat',  n: 'Chat',   e: '💬', cap: 140, read: 'thread', pop: 'never',
    get empty() { return say('empty.chat'); } },
  /* The log is the one channel with no list beside it, and that is not an
     omission — a ledger has no items to choose between, it has an order. On a
     phone it therefore gets the whole width rather than a list you tap into,
     which is the shape a log actually wants. */
  { id: 'log',   n: 'Log',    e: '📋', cap: 160, read: 'ledger', pop: 'always',
    get empty() { return say('empty.log'); } },
  { id: 'calls', n: 'Guests', e: '🍹', cap: 40,  read: 'thread', pop: 'never',
    get empty() { return say('empty.calls'); } }
];
const CH = {}; CHANNELS.forEach(c => CH[c.id] = c);

/* HOW MANY ALERTS STAND AT ONCE, READ OFF THE STYLESHEET.
   Two on a phone and three on a desktop, and the number is declared exactly
   once — as `--alert-n` in css/comms.css, where the band's own max-height is
   computed from it. This reads it back rather than restating it.

   It was `TOUCH ? 2 : 3` for about an hour, and that is wrong twice over.
   TOUCH is read once at boot from `pointer:coarse`, which is the right
   question for "does this device have a keyboard" and the wrong one for "how
   much room is there": a small laptop window is a fine pointer at 700px and
   gets the phone's band, which would then be allowed three rows in a space
   reserved for two — the same trap the editor's bar documents at length about
   hiding a control on `pointer:coarse` alone. And a phone turned on its side
   crosses the max-height half of that query without the pointer changing at
   all.

   Reading the custom property is what makes the cap and the reservation the
   same fact rather than two numbers that agree today. The fallback is the
   desktop's, for a browser that will not tell us. */
const maxAlerts = () => {
  const n = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--alert-n'), 10);
  return n > 0 ? n : 3;
};
/* How long an alert stands before it retires itself. Hovering one holds it —
   somebody reading it is not somebody who has finished with it. */
const ALERT_MS = 5200;
/* THE FLOOR BETWEEN POP-UPS, IN REAL SECONDS, and it is the measurement that
   forced it that makes this the important number in the file.

   A per-channel rule and a per-channel fold took a shift from 166 alerts to 27
   — and at REAL pace that was still nineteen of them in the first minute of
   play, one every three seconds. The reason is the clock: a game minute is
   MS_PER_GAME_MIN, 430 milliseconds, so the whole day's correspondence — the
   inbox, the texts, the events, every one of them correctly timed across eight
   hours — arrives inside about three and a half real minutes. At that
   compression ANY per-item pop-up is a stream, however well sorted, and no
   amount of policy fixes it. The thing being rationed has to be measured in
   the player's seconds rather than in the game's minutes.

   So arrivals inside the floor are QUEUED rather than dropped, and come out as
   one digest per channel — "3 new" — which is why this costs nothing: the
   record already has all of it and the fold already knew how to say so. Nine
   seconds is about twenty-one game minutes, so the busiest morning in the
   script cannot produce more than a handful. */
const MIN_GAP_MS = 9000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const Comms = {
  on: false, ch: 'mail', sel: null, seq: 0, _alerts: [], _hold: null,
  /* HOW MUCH THE PLAYER WANTS INTERRUPTING, which is the one part of this that
     is genuinely a preference rather than a design question:
       'all'    every channel pops, chat included — for somebody who wants the
                office in their face, and what the first version did to
                everybody whether they wanted it or not.
       'needed' the `pop` rule on each channel. The default.
       'none'   nothing pops at all. The rail still counts, so nothing is lost
                — which is exactly what makes this a safe setting to offer
                rather than a way to miss your own inbox.
     Lives in Settings beside the sound and the motion, so it survives a new
     game like every other preference. */
  pop: 'needed',
  /* When the last row went up, and what is waiting behind the floor. `_q` is
     one bucket per channel holding a count and the newest item, because that
     is exactly what a digest row needs to say. */
  _lastRow: -1e9, _q: {}, _qT: null,

  /* Whether this one is worth a row over the game. */
  pops(item) {
    if (this.pop === 'none') return false;
    if (this.pop === 'all') return true;
    /* A message with an `enc` on it is somebody waiting on an answer from you,
       which outranks the channel it came in on — and there is no channel where
       one of those should arrive silently. */
    if (item.enc) return true;
    return (CH[item.ch] || {}).pop !== 'never';
  },

  /* ---------------- the record ---------------- */
  store(ch) {
    if (!G.comms) G.comms = {};
    if (!Array.isArray(G.comms[ch])) G.comms[ch] = [];
    return G.comms[ch];
  },
  /* ONE ENTRY POINT. Everything that has something to say comes through here,
     which is what makes the channel a property of the message rather than a
     decision taken at the call site by whoever happened to be writing it. */
  post(ch, it) {
    if (!CH[ch]) ch = 'log';
    const box = this.store(ch);
    const item = Object.assign({
      ch, id: ch + ':' + (++this.seq), t: G.minutes, r: false,
      face: CH[ch].e, from: '', subj: '', body: '', k: ''
    }, it || {});
    /* A thread is what a channel groups by, and each one groups by a different
       thing: an inbox by who wrote to you, a chat by which channel it was in,
       a call by the call. Defaulted here rather than at every call site. */
    if (!item.thread) item.thread = item.from || CH[ch].n;
    box.push(item);
    while (box.length > CH[ch].cap) box.shift();
    this.alert(item);
    this.sync();
    /* Repainted only while somebody is looking at it — the console is not open
       for most of a shift and rebuilding it per message would be work nobody
       can see. */
    if (this.on) this.render();
    return item;
  },
  /* Nothing in flight across a new shift: a digest from yesterday arriving
     ten seconds into today is a pop-up about a game that no longer exists. */
  hush() {
    clearTimeout(this._qT); this._qT = null; this._q = {};
    this._alerts.slice().forEach(a => this.retire(a));
  },
  unread(ch) { return this.store(ch).filter(it => !it.r).length; },
  total() { return CHANNELS.reduce((n, c) => n + this.unread(c.id), 0); },
  /* Marking read is per CHANNEL rather than per item, because opening a
     channel is reading it: the unread count is "is there anything in here I
     have not looked at", not a per-message receipt. */
  markRead(ch) { this.store(ch).forEach(it => it.r = true); this.sync(); },

  /* ---------------- the alert band ---------------- */
  /* ONE LINE, TYPED, AND A WAY IN. The type is the channel, so a text does not
     look like an achievement and neither looks like a phone being abandoned —
     which was the entire problem with a stream in one colour. The sound is the
     channel's too, for the same reason: you can tell what arrived without
     looking at it, which is the only kind of notification worth having while
     both thumbs are on a stick. */
  alert(item) {
    const band = $('#alerts'); if (!band) return;
    if (!this.pops(item)) return;
    /* ONE STANDING ALERT PER CHANNEL, and this is the rule that actually stops
       a burst. A second thing arriving on a channel that already has a row
       does not get a row of its own — it is folded into the one that is there,
       which becomes "✉️ 3 new". So the ceiling is one row per channel rather
       than one row per message, nothing already on screen moves when it
       happens, and the sound does not fire again: a chime every four seconds
       IS the spam, whatever the rows are doing. */
    const live = this._alerts.find(a => a.dataset.ch === item.ch && !a.classList.contains('gone'));
    if (live) return this.restack(live, item);
    /* THE FLOOR, and the one thing allowed through it: something waiting on an
       answer from you. An unanswered complaint is the only kind of arrival in
       this game with a cost attached to ignoring it, so it interrupts now and
       queues behind nothing. Everything else waits its turn. */
    const t = now();
    if (!item.enc && t - this._lastRow < MIN_GAP_MS) return this.queue(item);
    return this.raise(item);
  },
  /* Behind the floor. Counted per channel so the digest can name one, and the
     timer is armed once rather than per arrival — forty things inside one gap
     is one flush, not forty.

     NOT `hold`, which is already taken by the pointer handler that holds an
     alert open while somebody is reading it — and that one is declared LOWER
     in this literal, so it silently won and every queued notification was
     dropped rather than delayed. The second name collision on this object in
     one sitting, after `row`, and neither throws: a duplicate key in an object
     literal is legal JavaScript and the last one quietly wins. The `comms`
     suite reads this file for repeats now, because reasoning about it clearly
     does not work. */
  queue(item) {
    const q = this._q[item.ch] || (this._q[item.ch] = { n: 0, last: null });
    q.n++; q.last = item;
    if (this._qT) return;
    this._qT = setTimeout(() => this.flush(), Math.max(60, MIN_GAP_MS - (now() - this._lastRow)));
  },
  /* One channel per flush, newest first, and re-armed if others are still
     waiting — so three channels going off inside one gap come out as three
     rows nine seconds apart rather than three rows at once fighting over a
     band that holds two. */
  flush() {
    this._qT = null;
    const chs = Object.keys(this._q).filter(c => this._q[c].n);
    if (!chs.length) return;
    chs.sort((a, b) => this._q[b].last.t - this._q[a].last.t);
    const ch = chs[0], q = this._q[ch];
    const item = q.last, n = q.n;
    q.n = 0; q.last = null;
    const el = this.raise(item);
    /* The count the digest stands for. `raise()` has just made a row of one, so
       the rest is told to it the same way a live fold would be. */
    if (el && n > 1) { el._n = n - 1; this.restack(el, item); }
    if (chs.length > 1) this._qT = setTimeout(() => this.flush(), MIN_GAP_MS);
  },
  /* The row itself. Split out of alert() so the floor, the queue and the flush
     all put one up the same way.

     NOT `row`, which is already taken by the LIST row this console draws in
     its left pane — and a method quietly replacing another on the same object
     is the same fault `const Panels` documents on the editor's side panel,
     with none of the parse error that makes that one obvious. It took the
     whole band out: `render()` called `this.row(thread)`, got an alert builder,
     and every alert after it threw. */
  raise(item) {
    const band = $('#alerts'); if (!band) return null;
    this._lastRow = now();
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'alert ch-' + item.ch + (item.k ? ' ' + item.k : '');
    d.dataset.ch = item.ch; d.dataset.id = item.id;
    /* The channel's name is the label rather than part of the sentence: it is
       the same six characters every time and belongs in the gutter where the
       eye can skip it, not in the middle of the line where it costs words. */
    d.innerHTML = '<span class="a-e" aria-hidden="true">' + (item.face || CH[item.ch].e) + '</span>'
      + '<span class="a-t">' + (item.from ? '<b>' + esc(item.from) + '</b> ' : '')
      + (item.alert || item.subj || item.body || '') + '</span>';
    d.setAttribute('aria-label', CH[item.ch].n + ': '
      + (item.from ? item.from + ' — ' : '') + this.plain(item.alert || item.subj || item.body));
    band.appendChild(d);
    this._alerts.push(d);
    /* The cap is what gives the band a height. The oldest goes rather than the
       newest being refused: the thing that just happened is the thing worth
       showing. */
    while (this._alerts.length > maxAlerts()) this.retire(this._alerts[0]);
    d._out = setTimeout(() => this.retire(d), ALERT_MS);
    this.sound(item);
    return d;
  },
  /* Fold a new arrival into the row already standing for its channel. The text
     becomes the newest line, so a glance is still current rather than stuck on
     whatever came first, and the count says how much is behind it. The timer
     restarts, because the row is describing something that just happened. */
  restack(el, item) {
    el._n = (el._n || 1) + 1;
    el.dataset.id = item.id;
    const line = this.plain(item.alert || item.subj || item.body);
    el.querySelector('.a-e').textContent = item.face || CH[item.ch].e;
    el.querySelector('.a-t').innerHTML = '<b>' + el._n + ' new</b> ' + esc(
      clip(line, 40));
    el.setAttribute('aria-label', CH[item.ch].n + ': ' + el._n + ' new, latest — ' + line);
    el.classList.remove('folded'); void el.offsetWidth; el.classList.add('folded');
    clearTimeout(el._out);
    if (this._hold !== el) el._out = setTimeout(() => this.retire(el), ALERT_MS);
    return el;
  },
  retire(d) {
    if (!d) return;
    const i = this._alerts.indexOf(d);
    if (i >= 0) this._alerts.splice(i, 1);
    clearTimeout(d._out);
    if (this._hold === d) this._hold = null;
    /* PINNED WHERE IT STOOD, THEN TAKEN OUT OF THE LAYOUT. `.gone` is absolute
       (see css/comms.css for why that is not merely a nicety), and an absolute
       child with no offset of its own snaps to the corner of the band — so the
       row it was occupying is read off it first. Read before the class goes on,
       while it is still in flow and offsetTop still means something. */
    d.style.top = d.offsetTop + 'px';
    d.classList.add('gone');
    /* Removed after the fade rather than on it. Nothing in the band moves when
       it goes, because it is already out of the flex line. */
    setTimeout(() => d.remove(), 280);
    /* A channel whose row has just gone may have arrivals still behind the
       floor with no timer left to bring them out — the fold path returns
       before queue() is ever reached while a row stands, so the queue can be
       non-empty with nothing armed. */
    if (!this._qT && Object.keys(this._q).some(c => this._q[c].n)) {
      this._qT = setTimeout(() => this.flush(), Math.max(60, MIN_GAP_MS - (now() - this._lastRow)));
    }
  },
  /* Held while a pointer is on it. An alert is one line and five seconds, which
     is not long for somebody who has just looked down at it. */
  hold(d, on) {
    if (!d) return;
    if (on) { this._hold = d; clearTimeout(d._out); }
    else if (this._hold === d) { this._hold = null; d._out = setTimeout(() => this.retire(d), 1800); }
  },
  sound(item) {
    if (item.k === 'gold') return Sfx.notify();
    if (item.k === 'bad') return Sfx.bad();
    if (item.ch === 'text') return Sfx.tone(1180, .05, 'sine', .2), Sfx.tone(1480, .07, 'sine', .16, .05);
    if (item.ch === 'mail') return Sfx.tone(760, .07, 'sine', .22), Sfx.tone(570, .09, 'sine', .16, .07);
    Sfx.blip();
  },
  /* An aria-label is text, and half of what arrives here carries <b> in it
     because the line it replaced was innerHTML. Stripped rather than escaped:
     a screen reader reading out a bold tag is worse than one reading the
     sentence without it. */
  plain(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ''); },

  /* ---------------- the rail ---------------- */
  /* FIVE CHIPS ON A DESKTOP, ONE ON A PHONE, and both are written every time.
     The stylesheet decides which is showing; if only the visible one were
     written, the other would be carrying a count from ten minutes ago the
     moment somebody turned their phone on its side. */
  sync() {
    const rail = $('#chRail');
    if (rail) CHANNELS.forEach(c => {
      const b = rail.querySelector('[data-ch="' + c.id + '"]'); if (!b) return;
      const n = this.unread(c.id);
      b.querySelector('.chip-n').textContent = n ? (n > 99 ? '99+' : String(n)) : '';
      b.classList.toggle('lit', !!n);
      b.setAttribute('aria-label', c.n + (n ? ' · ' + n + ' unread' : ''));
      b.title = c.n + (n ? ' · ' + n + ' unread' : '');
    });
    const one = $('#cmOne');
    if (one) {
      const n = this.total();
      one.querySelector('.chip-n').textContent = n ? (n > 99 ? '99+' : String(n)) : '';
      one.classList.toggle('lit', !!n);
      /* The face is whichever channel has the newest unread thing in it, so the
         one chip a phone gets still says WHAT is waiting rather than only that
         something is. */
      const hot = CHANNELS.map(c => this.store(c.id).filter(it => !it.r).pop())
        .filter(Boolean).sort((a, b) => a.t - b.t).pop();
      one.querySelector('.chip-e').textContent = hot ? CH[hot.ch].e : '📨';
      one.setAttribute('aria-label', n ? 'Comms · ' + n + ' unread' : 'Comms');
      one.title = n ? 'Comms · ' + n + ' unread' : 'Comms';
    }
  },

  /* ---------------- the console ---------------- */
  open(ch, id) {
    if (ch && CH[ch]) this.ch = ch;
    if (id !== undefined) this.sel = id; else this.sel = null;
    const first = !this.on;
    if (first) this._returnFocus = document.activeElement;
    this.on = true; G.state = 'comms';
    $('#inbox').classList.add('on');
    /* On a phone the reader is the whole width and the list is behind it, so
       arriving has to land on one of them: the list, unless something named an
       item — a tapped alert is a request for that message, not for the list it
       is in. */
    this.wide = !!this.sel;
    this.markRead(this.ch);
    this.render(); Sfx.blip();
    if (first) setTimeout(() => { const t = $('#cmTabs .cm-tab.on') || $('#cmClose'); if (t) t.focus(); }, 20);
  },
  close() {
    if (!this.on) return;
    this.on = false; $('#inbox').classList.remove('on');
    if (G.state === 'comms') G.state = 'play';
    const r = this._returnFocus; this._returnFocus = null;
    if (r && r.focus && document.contains(r)) { try { r.focus(); } catch (e) {} }
  },
  toggle(ch) {
    if (this.on && (!ch || this.ch === ch)) this.close(); else this.open(ch || this.ch);
  },
  go(ch, id) { this.open(ch, id); },

  /* Threads, newest activity first. A channel's history is flat and in time
     order — which is what the log wants and what a reader does not: an inbox
     is senders, a phone is conversations, and a chat is channels. */
  threads(ch) {
    const map = new Map();
    this.store(ch).forEach(it => {
      const key = it.thread || '·';
      if (!map.has(key)) map.set(key, { key, items: [], face: it.face, unread: 0 });
      const th = map.get(key);
      th.items.push(it); th.face = it.face || th.face;
      if (!it.r) th.unread++;
    });
    const out = [...map.values()];
    out.forEach(th => th.last = th.items[th.items.length - 1]);
    return out.sort((a, b) => b.last.t - a.last.t);
  },

  render() {
    if (!this.on) return;
    const c = CH[this.ch];
    $('#cmTitle').textContent = TOUCH ? c.n : 'Comms · ' + c.n;
    $('#inbox').className = 'on ch-' + this.ch + (c.read === 'ledger' ? ' ledger' : '')
      + (this.wide ? ' reading' : '');
    this.tabs();
    const list = $('#cmList'), read = $('#cmRead');
    if (c.read === 'ledger') { list.innerHTML = ''; read.innerHTML = this.ledger(); this.foot(); return; }
    const ths = this.threads(this.ch);
    if (!ths.length) {
      list.innerHTML = '<p class="cm-empty">' + esc(c.empty) + '</p>';
      read.innerHTML = '<p class="cm-empty">' + esc(c.empty) + '</p>';
      this.foot(); return;
    }
    /* A selection that no longer exists — a thread aged out from under the
       cap — falls back to the newest rather than to a blank reader. */
    let cur = ths.find(t => t.key === this.sel) || null;
    if (!cur && this.sel) cur = ths.find(t => t.items.some(i => i.id === this.sel));
    if (!cur) cur = ths[0];
    this.sel = cur.key;
    list.innerHTML = ths.map(th => this.row(th, th === cur)).join('');
    list.querySelectorAll('[data-th]').forEach(el => el.onclick = () => {
      this.sel = el.dataset.th; this.wide = true; Sfx.blip(); this.render();
    });
    read.innerHTML = this.thread(cur);
    read.querySelectorAll('[data-enc]').forEach(el => el.onclick = () => this.answer(el.dataset.enc));
    read.scrollTop = this.ch === 'mail' ? 0 : read.scrollHeight;
    this.foot();
  },
  tabs() {
    const box = $('#cmTabs'); box.innerHTML = '';
    CHANNELS.forEach(c => {
      const n = this.unread(c.id);
      const b = document.createElement('button');
      b.className = 'cm-tab' + (this.ch === c.id ? ' on' : '') + (n ? ' lit' : '');
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(this.ch === c.id));
      b.innerHTML = '<span class="t-i" aria-hidden="true">' + c.e + '</span>'
        + '<span class="t-n">' + esc(c.n) + '</span>'
        + (n ? '<span class="t-c">' + (n > 99 ? '99+' : n) + '</span>' : '');
      b.title = c.n + (n ? ' · ' + n + ' unread' : '');
      b.onclick = () => {
        this.ch = c.id; this.sel = null; this.wide = false;
        this.markRead(c.id); Sfx.blip(); this.render();
      };
      box.appendChild(b);
    });
    const cur = box.querySelector('.cm-tab.on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  },
  /* THE WAY BACK, which only a phone needs and which a phone must have. With
     the reader over the list there is otherwise no route from a message to the
     inbox it is in short of closing the whole console and opening it again. */
  foot() {
    const f = $('#cmFoot'); if (!f) return;
    const c = CH[this.ch];
    const n = this.store(this.ch).length;
    f.innerHTML = (c.read === 'ledger' ? ''
      : '<button class="btn small cm-back" id="cmBack" type="button">◂ ' + esc(c.n) + '</button>')
      + '<span class="cm-count">' + n + ' ' + (n === 1 ? 'item' : 'items') + ' · kept to ' + c.cap + '</span>';
    const b = $('#cmBack');
    if (b) b.onclick = () => { this.wide = false; Sfx.blip(); this.render(); };
  },
  row(th, sel) {
    const last = th.last;
    return '<button class="cm-row' + (sel ? ' on' : '') + (th.unread ? ' new' : '') + '" type="button" data-th="'
      + esc(th.key) + '">'
      + '<span class="r-e" aria-hidden="true">' + (th.face || CH[this.ch].e) + '</span>'
      + '<span class="r-b"><span class="r-h"><b>' + esc(this.who(th.key)) + '</b>'
      + '<i>' + clockStr(last.t) + '</i></span>'
      + '<span class="r-s">' + esc(this.gist(last)) + '</span></span>'
      + (th.items.length > 1 ? '<span class="r-n">' + th.items.length + '</span>' : '')
      + '</button>';
  },
  /* An address is not a name. "Facilities <terry@callhall.co.uk>" is the right
     thing to have in the header of the message and the wrong thing to put in a
     130px list row on a phone, so the row gets the part a person would say. */
  who(s) { return String(s).replace(/\s*<[^>]*>\s*/, '').trim() || String(s); },
  gist(it) {
    const s = this.plain(it.subj || it.body || '');
    return clip(s, 90);
  },

  /* ---------------- each channel, read as itself ---------------- */
  thread(th) {
    if (this.ch === 'mail') return this.mail(th);
    if (this.ch === 'calls') return this.call(th);
    return this.talk(th);
  },
  /* AN INBOX IS HEADERS AND A BODY. Newest at the top, each with the full
     address the list row dropped, and the body in the shape it was written in
     — mail in this building is written in paragraphs and quoted replies, and
     collapsing those to one line is what made the inbox unreadable in the
     panel it used to live in. */
  mail(th) {
    return th.items.slice().reverse().map(it =>
      '<article class="cm-mail">'
      + '<header><h4>' + esc(it.subj || '(no subject)') + '</h4>'
      + '<div class="m-from">' + esc(it.from) + '</div>'
      + '<div class="m-when">' + clockStr(it.t) + (it.enc ? ' · needs an answer' : '') + '</div></header>'
      + '<div class="m-body">' + esc(it.body).replace(/\n/g, '<br>') + '</div>'
      + this.answerBtn(it) + '</article>').join('');
  },
  /* A TEXT IS A BUBBLE AND A CHAT IS A CHANNEL, and both are the same walk:
     oldest first, because that is the order a conversation happened in, with
     yours on the right. The chat keeps the name over every message (twenty
     people talk in #general) and a text drops it after the first (there are
     two of you). */
  talk(th) {
    let last = null;
    return '<div class="cm-talk">' + th.items.map(it => {
      const mine = !!it.mine;
      const head = this.ch === 'chat' || (!mine && it.from !== last);
      last = mine ? last : it.from;
      return '<div class="bub' + (mine ? ' me' : '') + '">'
        + (head ? '<div class="b-who">' + (this.ch === 'chat' ? '<span class="b-e" aria-hidden="true">'
            + (it.face || '🧑') + '</span>' : '') + esc(this.who(it.from || 'You'))
            + ' <i>' + clockStr(it.t) + '</i></div>' : '')
        + '<div class="b-t">' + esc(it.body).replace(/\n/g, '<br>') + '</div>'
        + this.answerBtn(it) + '</div>';
    }).join('') + '</div>';
  },
  /* A CALL IS A TRANSCRIPT. One entry per call, and the entry is the log the
     call kept while it was happening — which used to be thrown away with the
     card the moment you pressed End call, so the one part of this game with a
     turn-by-turn record of what you said left no record at all. */
  call(th) {
    return th.items.slice().reverse().map(it =>
      '<article class="cm-call ' + esc(it.k || '') + '">'
      + '<header><h4>' + esc(it.subj || it.from) + '</h4>'
      + '<div class="m-when">' + clockStr(it.t) + ' · ' + esc(it.meta || '') + '</div></header>'
      + '<ol class="c-lines">' + (it.lines || []).map(l => '<li>' + esc(l) + '</li>').join('')
      + '</ol></article>').join('');
  },
  /* THE LEDGER. No senders, no threads, no reader — a time-ordered list of what
     happened, newest at the top, each row carrying its own severity. It is the
     only channel where the whole day at a glance is the point, which is why it
     is also the only one with nothing to tap. */
  ledger() {
    const items = this.store('log');
    if (!items.length) return '<p class="cm-empty">' + esc(CH.log.empty) + '</p>';
    let day = null, h = '<div class="cm-ledger">';
    items.slice().reverse().forEach(it => {
      const hour = clockStr(it.t).slice(0, 2) + ':00';
      if (hour !== day) { day = hour; h += '<div class="l-hour">' + hour + '</div>'; }
      h += '<div class="l-row ' + esc(it.k || '') + '"><span class="l-t">' + clockStr(it.t) + '</span>'
        + '<span class="l-e" aria-hidden="true">' + (it.face || '·') + '</span>'
        + '<span class="l-b">' + (it.body || '') + '</span></div>';
    });
    return h + '</div>';
  },

  /* ---------------- answering one ---------------- */
  /* An item carrying an `enc` is a message somebody is waiting on, and the
     button is how it becomes a turn-based exchange. Written as the reply you
     would actually send rather than as "start encounter", which is the same
     call the arcade's cabinets make about their own replies. */
  answerBtn(it) {
    if (!it.enc || it.answered) return '';
    return '<button class="btn primary cm-answer" type="button" data-enc="' + esc(it.id) + '">'
      + say(it.ch === 'text' ? 'comms.reply' : 'comms.writeBack') + '</button>';
  },
  answer(id) {
    const it = this.store(this.ch).find(x => x.id === id);
    if (!it || !it.enc || it.answered) return Sfx.deny();
    it.answered = true;
    this.close();
    Combat.startInbound(it);
  },

  /* Whatever is waiting on an answer. Read by the HUD, which says so: an email
     that needs a reply is a queue as much as a ringing phone is, and it was the
     one kind of work in this building that nothing on the screen mentioned. */
  pending() {
    let n = 0;
    ['mail', 'text'].forEach(ch => this.store(ch).forEach(it => { if (it.enc && !it.answered) n++; }));
    return n;
  },

  /* ---------------- bindings ---------------- */
  bind() {
    const rail = $('#chRail');
    if (rail) rail.addEventListener('click', e => {
      const b = e.target.closest('[data-ch]'); if (!b) return;
      this.toggle(b.dataset.ch);
    });
    const one = $('#cmOne');
    /* pointerdown, with the click behind it to swallow the ghost — the same
       arrangement every other thing you tap in this game has. */
    if (one) {
      one.addEventListener('pointerdown', e => { e.preventDefault(); Sfx.init(); this.toggle(); });
      one.addEventListener('click', e => e.preventDefault());
    }
    /* An alert is a way in. Tapping one opens its channel at the thing it was
       telling you about, which is the whole difference between a notification
       and a sentence that has scrolled past. */
    const band = $('#alerts');
    if (band) {
      band.addEventListener('click', e => {
        const a = e.target.closest('.alert'); if (!a) return;
        const it = this.store(a.dataset.ch).find(x => x.id === a.dataset.id);
        this.retire(a);
        /* A folded alert stands for several things, so it opens the CHANNEL —
           landing on one of the three it happens to name last would be picking
           for you. A single one still opens at the thread it named. */
        this.open(a.dataset.ch, (a._n > 1 || !it) ? undefined : (it.thread || it.id));
      });
      band.addEventListener('pointerover', e => {
        const a = e.target.closest('.alert'); if (a) this.hold(a, true);
      });
      band.addEventListener('pointerout', e => {
        const a = e.target.closest('.alert'); if (a) this.hold(a, false);
      });
    }
    /* A ROTATION CHANGES THE CAP. Three alerts standing in a landscape band
       are three alerts in a portrait band reserved for two the instant the
       phone is turned, and they would sit there until they timed out. Trimmed
       on resize, which is the event that can change the answer — the band's
       own max-height holds the line meanwhile, so this is tidying rather than
       the guarantee. */
    addEventListener('resize', () => {
      while (this._alerts.length > maxAlerts()) this.retire(this._alerts[0]);
    });
    $('#cmClose').onclick = () => this.close();
    $('#inbox').addEventListener('click', e => { if (e.target.id === 'inbox') this.close(); });
    this.sync();
  }
};
