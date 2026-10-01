'use strict';
/* ---------------- Comms: five channels and the alerts that point into them ----
   THE RECORD is five channels, each its own list at its own cap and read in
   its own shape (render()): mail by sender, texts and chat as conversations,
   the log as a ledger, guests as transcripts. THE ALERT is one short line that
   points into a channel and opens it when tapped; it carries no history.

   Nothing grows with traffic: the band holds maxAlerts() rows, the rail is five
   chips on a desktop and one (#cmOne) on a phone, and sync() writes both.
   G.comms is plain data, so saves carry it. */

const CHANNELS = [
  /* `cap` is how much history a channel keeps. `pop` is whether an arrival
     interrupts you: 'always' for someone addressing you (mail, texts) and for
     the log, which acknowledges what you just did; 'never' for atmosphere or
     something you just saw (chat, guests). Silent arrivals still count on the
     rail. */
  { id: 'mail',  n: 'Post',   e: '💌', cap: 60,  read: 'thread', pop: 'always',
    get empty() { return say('empty.mail'); } },
  { id: 'text',  n: 'Texts',  e: '📱', cap: 90,  read: 'thread', pop: 'always',
    get empty() { return say('empty.text'); } },
  { id: 'chat',  n: 'Chat',   e: '💬', cap: 140, read: 'thread', pop: 'never',
    get empty() { return say('empty.chat'); } },
  /* The log is a ledger: no list beside it, the whole width on a phone. */
  { id: 'log',   n: 'Log',    e: '📋', cap: 160, read: 'ledger', pop: 'always',
    get empty() { return say('empty.log'); } },
  { id: 'calls', n: 'Guests', e: '🍹', cap: 40,  read: 'thread', pop: 'never',
    get empty() { return say('empty.calls'); } }
];
const CH = {}; CHANNELS.forEach(c => CH[c.id] = c);

/* How many alerts stand at once: --alert-n in css/comms.css, which also sizes
   the band, so the cap and the reserved space are one number. */
const maxAlerts = () => {
  const n = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--alert-n'), 10);
  return n > 0 ? n : 3;
};
/* How long an alert stands; hovering holds it. */
const ALERT_MS = 5200;
/* A how-to tip wraps and stands long enough to read twice. */
const TIP_MS = 13000;
/* The floor between pop-ups, in real ms. A game day passes in minutes, so any
   per-item pop-up is a stream: arrivals inside the floor are queued and come
   out as one digest per channel. */
const MIN_GAP_MS = 9000;
const now = () => performance.now();

const Comms = {
  on: false, ch: 'mail', sel: null, seq: 0, _alerts: [], _hold: null,
  /* The player's setting: 'all' pops every channel, 'needed' follows each
     channel's `pop` (default), 'none' pops nothing and the rail still counts. */
  pop: 'needed',
  /* The last row's time, and per channel a count and newest item queued behind the floor. */
  _lastRow: -1e9, _q: {}, _qT: null,

  /* Whether this one is worth a row over the game. */
  pops(item) {
    if (this.pop === 'none') return false;
    if (this.pop === 'all') return true;
    /* Somebody waiting on your answer always interrupts. */
    if (item.enc) return true;
    return (CH[item.ch] || {}).pop !== 'never';
  },

  /* ---------------- the record ---------------- */
  store(ch) { return G.comms[ch] || (G.comms[ch] = []); },
  /* Everything that has something to say comes through here. */
  post(ch, it) {
    if (!CH[ch]) ch = 'log';
    const box = this.store(ch);
    const item = Object.assign({
      ch, id: ch + ':' + (++this.seq), t: G.minutes, r: false,
      face: CH[ch].e, from: '', subj: '', body: '', k: ''
    }, it || {});
    /* The thread defaults to the sender, else the channel. */
    if (!item.thread) item.thread = item.from || CH[ch].n;
    box.push(item);
    while (box.length > CH[ch].cap) box.shift();
    this.alert(item);
    this.sync();
    if (this.on) this.render();
    return item;
  },
  /* A new run starts with nothing queued or standing. */
  hush() {
    clearTimeout(this._qT); this._qT = null; this._q = {};
    this._alerts.slice().forEach(a => this.retire(a));
  },
  unread(ch) { return this.store(ch).filter(it => !it.r).length; },
  total() { return CHANNELS.reduce((n, c) => n + this.unread(c.id), 0); },
  /* Opening a channel reads all of it. */
  markRead(ch) { this.store(ch).forEach(it => it.r = true); this.sync(); },

  /* ---------------- the alert band ---------------- */
  /* One line, styled and voiced by its channel, so you know what arrived
     without looking. */
  alert(item) {
    const band = $('#alerts'); if (!band) return;
    if (!this.pops(item)) return;
    /* One standing row per channel: another arrival folds into it ("3 new")
       without moving anything or chiming again. */
    /* A how-to tip is never folded away or held back: it is read, not glanced at. */
    const tip = item.k === 'tip';
    const live = !tip && this._alerts.find(a => a.dataset.ch === item.ch && !a.classList.contains('gone') && !a.classList.contains('tip'));
    if (live) return this.restack(live, item);
    /* Inside the floor, only somebody waiting on an answer gets through. */
    const t = now();
    if (!tip && !item.enc && t - this._lastRow < MIN_GAP_MS) return this.queue(item);
    return this.raise(item);
  },
  /* Behind the floor, counted per channel; one timer however many arrive.
     (Not `hold`: a duplicate key in an object literal silently wins.) */
  queue(item) {
    const q = this._q[item.ch] || (this._q[item.ch] = { n: 0, last: null });
    q.n++; q.last = item;
    if (this._qT) return;
    this._qT = setTimeout(() => this.flush(), Math.max(60, MIN_GAP_MS - (now() - this._lastRow)));
  },
  /* One channel per flush, newest first, re-armed while others wait. */
  flush() {
    this._qT = null;
    const chs = Object.keys(this._q).filter(c => this._q[c].n);
    if (!chs.length) return;
    chs.sort((a, b) => this._q[b].last.t - this._q[a].last.t);
    const ch = chs[0], q = this._q[ch];
    const item = q.last, n = q.n;
    q.n = 0; q.last = null;
    const el = this.raise(item);
    if (el && n > 1) { el._n = n - 1; this.restack(el, item); }
    if (chs.length > 1) this._qT = setTimeout(() => this.flush(), MIN_GAP_MS);
  },
  /* Put a row up. (Not `row`: that is the console's list row.) */
  raise(item) {
    const band = $('#alerts'); if (!band) return null;
    this._lastRow = now();
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'alert ch-' + item.ch + (item.k ? ' ' + item.k : '');
    d.dataset.ch = item.ch; d.dataset.id = item.id;
    d.innerHTML = '<span class="a-e" aria-hidden="true">' + (item.face || CH[item.ch].e) + '</span>'
      + '<span class="a-t">' + (item.from ? '<b>' + esc(item.from) + '</b> ' : '')
      + (item.alert || item.subj || item.body || '') + '</span>';
    d.setAttribute('aria-label', CH[item.ch].n + ': '
      + (item.from ? item.from + ' — ' : '') + this.plain(item.alert || item.subj || item.body));
    band.appendChild(d);
    this._alerts.push(d);
    /* Over the cap, the oldest goes. */
    while (this._alerts.length > maxAlerts()) this.retire(this._alerts[0]);
    d._out = setTimeout(() => this.retire(d), item.k === 'tip' ? TIP_MS : ALERT_MS);
    this.sound(item);
    return d;
  },
  /* Fold an arrival into its channel's standing row: newest line, a count,
     and a fresh timer. */
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
    /* `.gone` is absolute, so pin it where it stood before it leaves the flow. */
    d.style.top = d.offsetTop + 'px';
    d.classList.add('gone');
    setTimeout(() => d.remove(), 280);
    /* A folded row can leave arrivals queued with no timer armed. */
    if (!this._qT && Object.keys(this._q).some(c => this._q[c].n)) {
      this._qT = setTimeout(() => this.flush(), Math.max(60, MIN_GAP_MS - (now() - this._lastRow)));
    }
  },
  /* Held while a pointer is on it. */
  hold(d, on) {
    if (!d) return;
    if (on) { this._hold = d; clearTimeout(d._out); }
    else if (this._hold === d) { this._hold = null; d._out = setTimeout(() => this.retire(d), 1800); }
  },
  sound(item) {
    if (item.k === 'gold') return Sfx.notify();
    if (item.k === 'bad') return Sfx.bad();
    if (item.ch === 'text') return Sfx.text();
    if (item.ch === 'mail') return Sfx.mail();
    Sfx.blip();
  },
  /* Tags stripped, for aria-labels. */
  plain(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ''); },

  /* ---------------- the rail ---------------- */
  /* The rail: both the five chips and the phone's one are written, whichever
     the stylesheet is showing. */
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
      /* The one chip shows the channel of the newest unread thing. */
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
    /* On a phone, land on the reader if an item was named, else the list. */
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

  /* Threads, newest activity first. */
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
    /* A thread aged out from under the cap falls back to the newest. */
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
  /* The phone's way back from a message to its channel's list. */
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
  /* The name part of an address, for a narrow list row. */
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
  /* Mail: newest first, full headers, the body as written. */
  mail(th) {
    return th.items.slice().reverse().map(it =>
      '<article class="cm-mail">'
      + '<header><h4>' + esc(it.subj || '(no subject)') + '</h4>'
      + '<div class="m-from">' + esc(it.from) + '</div>'
      + '<div class="m-when">' + clockStr(it.t) + (it.enc ? ' · needs an answer' : '') + '</div></header>'
      + '<div class="m-body">' + esc(it.body).replace(/\n/g, '<br>') + '</div>'
      + this.answerBtn(it) + '</article>').join('');
  },
  /* Texts and chat: oldest first, yours on the right. Chat names every
     message; a text only when the speaker changes. */
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
  /* A guest: the transcript the encounter kept. */
  call(th) {
    return th.items.slice().reverse().map(it =>
      '<article class="cm-call ' + esc(it.k || '') + '">'
      + '<header><h4>' + esc(it.subj || it.from) + '</h4>'
      + '<div class="m-when">' + clockStr(it.t) + ' · ' + esc(it.meta || '') + '</div></header>'
      + '<ol class="c-lines">' + (it.lines || []).map(l => '<li>' + esc(l) + '</li>').join('')
      + '</ol></article>').join('');
  },
  /* The log: newest first, by hour, each row with its severity. */
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
  /* A message with an `enc` is answered as an encounter. */
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

  /* How many messages wait on an answer; the HUD shows it. */
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
    /* pointerdown, with the ghost click swallowed. */
    if (one) {
      one.addEventListener('pointerdown', e => { e.preventDefault(); Sfx.init(); this.toggle(); });
      one.addEventListener('click', e => e.preventDefault());
    }
    /* Tapping an alert opens its channel at the thing it named. */
    const band = $('#alerts');
    if (band) {
      band.addEventListener('click', e => {
        const a = e.target.closest('.alert'); if (!a) return;
        const it = this.store(a.dataset.ch).find(x => x.id === a.dataset.id);
        this.retire(a);
        /* A folded alert opens the channel, not one of its items. */
        this.open(a.dataset.ch, (a._n > 1 || !it) ? undefined : (it.thread || it.id));
      });
      band.addEventListener('pointerover', e => {
        const a = e.target.closest('.alert'); if (a) this.hold(a, true);
      });
      band.addEventListener('pointerout', e => {
        const a = e.target.closest('.alert'); if (a) this.hold(a, false);
      });
    }
    /* Turning a phone can lower the cap. */
    addEventListener('resize', () => {
      while (this._alerts.length > maxAlerts()) this.retire(this._alerts[0]);
    });
    $('#cmClose').onclick = () => this.close();
    $('#inbox').addEventListener('click', e => { if (e.target.id === 'inbox') this.close(); });
    this.sync();
  }
};
