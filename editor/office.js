'use strict';
/* ---------------- The day around the calls ----------------
   Everything in data/office.js:
     EVENTS       one-off happenings; `go()` is code
     CHAT_SCRIPT  the office chat, by channel, on the clock
     MAIL_SCRIPT  the inbox, on the same clock
     TEXT_SCRIPT  texts, by sender, on a clock that does not stop at five
     ENDINGS      the ways out
     CUT          the opening
   Silent faults: a chat or mail `t` outside the shift never fires (their ticks
   run only in working hours). Texts tick at any hour (engine/boot.js), so
   they are bounded by the day instead. An ending available() never offers is
   unreachable; one it offers that is not in the table would throw. */

const Office = {
  KINDS: [
    { k: 'event', label: 'Events' },
    { k: 'chat', label: 'Chat channels' },
    { k: 'mail', label: 'Emails' },
    { k: 'text', label: 'Text threads' },
    { k: 'ending', label: 'Endings' },
    { k: 'cut', label: 'The opening' },
  ],
  /* What SHAPE a beat of the opening is drawn as. The engine defaults a beat
     with no `k` to 'scene', so this list is the whole of what one may be. */
  SHAPES: [['scene', 'a scene — caption in the lower third'],
           ['line', 'somebody speaking — big type, no box'],
           ['title', 'a title card — display type, centred']],
  kind: 'event', id: null, it: null, code: null,
  base: null, undoStack: [], redoStack: [],

  key() { return this.kind + ':' + this.id; },
  def(k) { return this.KINDS.find(x => x.k === (k || this.kind)); },

  channels() {
    return Array.from(new Set(CHAT_SCRIPT.map(c => c.c)));
  },
  /* A text thread is grouped by WHO, exactly as a chat channel is grouped by
     which channel — one conversation, edited whole, because a single text out
     of a thread is not a thing anybody edits either. */
  people() {
    return Array.from(new Set(TEXT_SCRIPT.map(c => c.who)));
  },
  ids() {
    const out = [];
    EVENTS.forEach(e => out.push('event:' + e.id));
    this.channels().forEach(c => out.push('chat:' + c));
    MAIL_SCRIPT.forEach((m, i) => out.push('mail:' + i));
    this.people().forEach(w => out.push('text:' + w));
    Object.keys(ENDINGS).forEach(k => out.push('ending:' + k));
    out.push('cut:opening');
    return out;
  },
  groups() {
    const all = this.ids();
    return this.KINDS.map(d => ({
      label: d.label,
      items: all.filter(k => k.split(':')[0] === d.k).map(k => [k, this.label(k)]),
    }));
  },
  label(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    if (kind === 'event') {
      const e = (EVENTS || []).find(x => x.id === id);
      return e ? (e.e ? e.e + ' ' : '') + (e.t || id) : id;
    }
    if (kind === 'chat' || kind === 'text') return id;
    if (kind === 'mail') {
      const m = (MAIL_SCRIPT || [])[+id];
      return m ? m.s || ('email ' + id) : id;
    }
    if (kind === 'ending') return ((ENDINGS || {})[id] || {}).t || id;
    return 'The opening cutscene';
  },

  /* ---- loading ----
     A capture. Chat is captured as the WHOLE channel, because a channel is a
     conversation and a single line out of one is not a thing anybody edits. */
  load(key) {
    const [kind, ...rest] = String(key || '').split(':');
    const id = rest.join(':');
    if (!this.def(kind)) return false;
    this.code = {};
    if (kind === 'event') {
      const e = (EVENTS || []).find(x => x.id === id);
      if (!e) return false;
      this.it = {};
      Object.keys(e).forEach(k => {
        if (typeof e[k] === 'function') this.code[k] = String(e[k]);
        else this.it[k] = clone(e[k]);
      });
    } else if (kind === 'chat') {
      if (this.channels().indexOf(id) < 0) return false;
      this.it = { lines: clone(CHAT_SCRIPT.filter(c => c.c === id)) };
    } else if (kind === 'text') {
      if (this.people().indexOf(id) < 0) return false;
      this.it = { lines: clone(TEXT_SCRIPT.filter(c => c.who === id)) };
    } else if (kind === 'mail') {
      const m = (MAIL_SCRIPT || [])[+id];
      if (!m) return false;
      this.it = clone(m);
    } else if (kind === 'ending') {
      if (!(ENDINGS || {})[id]) return false;
      /* capture(), not clone(): `when` is code, and clone() drops it. */
      this.it = capture(ENDINGS[id]);
    } else {
      this.it = { beats: clone(CUT) };
    }
    this.kind = kind; this.id = id;
    this.rebase();
    return true;
  },
  state() { return clone({ kind: this.kind, id: this.id, it: this.it, code: this.code }); },
  restore(s) {
    this.kind = s.kind; this.id = s.id;
    this.it = clone(s.it); this.code = clone(s.code);
  },
  rebuild() {
    OfficeCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },

  set(k, v) {
    this.mark('edit ' + k);
    if (v === null || v === undefined || v === '') delete this.it[k];
    else this.it[k] = v;
    this.rebuild();
  },
  setNum(k, v) {
    const n = Number(v);
    this.mark('edit ' + k);
    if (v === '' || !isFinite(n)) delete this.it[k]; else this.it[k] = n;
    this.rebuild();
  },
  setLines(k, text) {
    this.mark('edit ' + k);
    const list = String(text).split('\n').map(s => s.trim()).filter(Boolean);
    if (!list.length) delete this.it[k]; else this.it[k] = list;
    this.rebuild();
  },
  lines(k) { return (this.it && Array.isArray(this.it[k]) ? this.it[k] : []).join('\n'); },

  /* ---- the timed lists ----
     A chat channel and the cutscene are both ordered lists of small records,
     edited the same way. */
  list() {
    return (this.it && (this.it.lines || this.it.beats)) || [];
  },
  listKey() { return (this.kind === 'chat' || this.kind === 'text') ? 'lines' : 'beats'; },
  setRow(i, k, v) {
    const rows = this.list().slice();
    if (!rows[i]) return false;
    this.mark('edit line ' + (i + 1));
    rows[i] = Object.assign({}, rows[i]);
    /* `t` is a time on a chat or text line but the text on an opening beat: only
       the first is numeric. */
    if (k === 't' && (this.kind === 'chat' || this.kind === 'text')) rows[i].t = Number(v) || 0;
    /* A camera is two numbers or empty ("keep the previous shot"); anything else
       is dropped rather than aiming at NaN. */
    else if (k === 'cam') {
      const n = String(v).split(/[\s,]+/).filter(Boolean).map(Number);
      if (n.length === 2 && n.every(x => isFinite(x))) rows[i].cam = n; else delete rows[i].cam;
    } else if (k === 'len') {
      const n = Number(v);
      if (String(v).trim() && isFinite(n) && n > 0) rows[i].len = n; else delete rows[i].len;
    } else rows[i][k] = v;
    this.it[this.listKey()] = rows;
    this.rebuild();
    return true;
  },
  addRow() {
    const rows = this.list().slice();
    this.mark('add a line');
    if (this.kind === 'chat') {
      const last = rows[rows.length - 1];
      rows.push({ t: last ? last.t + 3 : DAY_START, c: this.id,
        who: (last && last.who) || 'Somebody', f: (last && last.f) || '🧑', m: 'Something said.' });
    } else if (this.kind === 'text') {
      const last = rows[rows.length - 1];
      /* `who` is the thread, so a new line in one is from the same person by
         construction — there is no second sender in a text thread, which is
         the difference between this and a chat channel. */
      rows.push({ t: last ? last.t + 12 : DAY_START, who: this.id,
        f: (last && last.f) || '🧑', m: 'Something typed.' });
    } else {
      rows.push({ k: 'scene', f: '🏢', l: 'Somewhere · 09:00', t: 'Something happens.' });
    }
    this.it[this.listKey()] = rows;
    this.rebuild();
  },
  removeRow(i) {
    const rows = this.list();
    if (!rows[i]) return false;
    this.mark('delete line ' + (i + 1));
    this.it[this.listKey()] = rows.filter((_, j) => j !== i);
    this.rebuild();
    return true;
  },
  moveRow(i, d) {
    const rows = this.list().slice(), j = i + d;
    if (j < 0 || j >= rows.length) return false;
    this.mark('reorder');
    [rows[i], rows[j]] = [rows[j], rows[i]];
    this.it[this.listKey()] = rows;
    this.rebuild();
    return true;
  },
};
Object.assign(Office, HIST);

/* ---------------- Making and unmaking ---------------- */
const OfficeMake = {
  create() {
    Ask.form('Something new in the day', [
      { k: 'kind', label: 'what', value: 'event',
        options: [['event', 'An event'], ['chat', 'A chat channel'], ['mail', 'An email'],
          ['text', 'A text thread'], ['ending', 'An ending']] },
      { k: 'id', label: 'id', value: '', hint: 'for a channel its name (#tickets); for a text thread, who sends it' },
      { k: 'n', label: 'called', value: '' },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const name = v.n || v.id;
      if (v.kind === 'chat') {
        const ch = v.id[0] === '#' ? v.id : '#' + v.id.replace(/[^\w-]/g, '');
        if (Office.channels().indexOf(ch) >= 0) { Side.say('That channel already exists.'); return; }
        CHAT_SCRIPT.push({ t: DAY_START + 10, c: ch, who: 'Somebody', f: '🧑', m: 'First message.' });
        Mode.openSubject('chat:' + ch);
      } else if (v.kind === 'mail') {
        MAIL_SCRIPT.push({ t: DAY_START + 30, from: 'Somebody <somebody@example.com>',
          s: name, b: 'The body of it.' });
        Mode.openSubject('mail:' + (MAIL_SCRIPT.length - 1));
      } else if (v.kind === 'text') {
        /* The id IS the sender, because the sender is the thread. */
        const who = v.id.trim();
        if (Office.people().indexOf(who) >= 0) { Side.say('There is already a thread with ' + who + '.'); return; }
        TEXT_SCRIPT.push({ t: DAY_START + 20, who, f: '🧑', m: 'First one.' });
        Mode.openSubject('text:' + who);
      } else {
        const id = v.id.replace(/[^\w$]/g, '');
        if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
        if (v.kind === 'event') {
          if ((EVENTS || []).some(e => e.id === id)) { Side.say('There is already an event called ' + id + '.'); return; }
          EVENTS.push({ id, e: '📌', t: name.toUpperCase(), d: 'What has happened.', go() { } });
        } else {
          if (ENDINGS[id]) { Side.say('There is already an ending called ' + id + '.'); return; }
          ENDINGS[id] = { t: '🏁 ' + name.toUpperCase(), b: ['How it goes.'] };
        }
        Mode.openSubject(v.kind + ':' + id);
      }
      Side.say(v.kind === 'ending'
        ? 'Created it. It is offered at the end of the game unless its `when()` says otherwise — '
          + 'that guard is code, and is written in data/office.js.'
        : 'Created it in this tab. The export is what puts it in the file.');
    });
  },
  drop() {
    const key = Office.key(), others = Office.ids().filter(x => x !== key);
    if (Office.kind === 'cut') { Side.say('The opening is one thing and the game needs it.'); return; }
    if (!others.length) return;
    Ask.confirm('Delete ' + Office.label(key) + '?',
      'It goes from this tab’s table. data/office.js is untouched, so a reload brings it back.',
      'Delete it').then(yes => {
      if (!yes) return;
      if (Office.kind === 'event') {
        const i = EVENTS.findIndex(e => e.id === Office.id);
        if (i >= 0) EVENTS.splice(i, 1);
      } else if (Office.kind === 'chat') {
        for (let i = CHAT_SCRIPT.length - 1; i >= 0; i--) if (CHAT_SCRIPT[i].c === Office.id) CHAT_SCRIPT.splice(i, 1);
      } else if (Office.kind === 'text') {
        for (let i = TEXT_SCRIPT.length - 1; i >= 0; i--) if (TEXT_SCRIPT[i].who === Office.id) TEXT_SCRIPT.splice(i, 1);
      } else if (Office.kind === 'mail') {
        MAIL_SCRIPT.splice(+Office.id, 1);
      } else {
        delete ENDINGS[Office.id];
      }
      Office.forget(key);
      Mode.openSubject(Office.ids()[0]);
      Side.say('Deleted from this tab.');
    });
  }
};

/* ---------------- What is wrong with the day ---------------- */
const OfficeCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    Office.ids().forEach(key => this.per.set(key, this.one(key)));
    this.faults = (this.per.get(Office.key()) || []).concat(this.unreachable());
    return this;
  },

  /* Which endings Endings.available() can actually return. Read out of its
     source as quoted literals, exactly as the dialogue reachability check reads
     entry(): nothing here runs code. */
  offered() { return this.pushed(); },

  one(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    const live = kind === Office.kind && id === Office.id;
    const out = [];
    const fault = (level, msg, extra) => out.push(Object.assign({ level, msg, key }, extra || {}));

    /* Chat and mail only ever fire while the shift is running: both ticks
       compare `G.minutes >= t` and nothing runs after DAY_END. */
    const timed = (t, what, extra) => {
      if (typeof t !== 'number' || !isFinite(t)) {
        fault('error', what + ' has no time on it, so it never fires.', extra);
      } else if (t < DAY_START || t > DAY_END) {
        fault('error', what + ' is timed for ' + clockStr(t) + ', outside the shift ('
          + clockStr(DAY_START) + '–' + clockStr(DAY_END) + '), so it never fires at all.', extra);
      }
    };

    if (kind === 'event') {
      const e = live ? Office.it : (EVENTS || []).find(x => x.id === id);
      if (!e) return out;
      if (!String(e.t || '').trim()) fault('error', 'No title, so the toast is blank.', { field: 't' });
      if (!String(e.d || '').trim()) fault('warn', 'No description.', { field: 'd' });
      const src = live ? Office.code : { go: e.go && String(e.go) };
      if (!src.go) fault('warn', 'No go(), so this event happens and does nothing.', { field: 'go' });
    }

    if (kind === 'chat') {
      const rows = live ? Office.list() : CHAT_SCRIPT.filter(c => c.c === id);
      if (!rows.length) fault('error', 'No messages in this channel.', { field: 'lines' });
      let last = -1;
      rows.forEach((c, i) => {
        timed(c.t, 'Message ' + (i + 1), { row: i });
        if (!String(c.m || '').trim()) fault('error', 'Message ' + (i + 1) + ' is empty.', { row: i });
        else if (/\w'\w/.test(c.m)) fault('warn', 'Message ' + (i + 1) + ' uses a straight apostrophe.', { row: i });
        if (!String(c.who || '').trim()) fault('error', 'Message ' + (i + 1) + ' has nobody saying it.', { row: i });
        /* Out of order is not fatal — the tick fires whatever has come due —
           but it reads as a conversation happening backwards. */
        if (typeof c.t === 'number' && c.t < last) {
          fault('warn', 'Message ' + (i + 1) + ' is timed before the one above it, so the '
            + 'conversation arrives out of order.', { row: i });
        }
        if (typeof c.t === 'number') last = c.t;
      });
    }

    /* Texts are bounded by the day, not the shift: only times below zero or past
       midnight (where Sky.newDay() clears the index) are wrong. */
    if (kind === 'text') {
      const rows = live ? Office.list() : TEXT_SCRIPT.filter(c => c.who === id);
      if (!rows.length) fault('error', 'No texts in this thread.', { field: 'lines' });
      let last = -1;
      rows.forEach((c, i) => {
        if (typeof c.t !== 'number' || !isFinite(c.t)) {
          fault('error', 'Text ' + (i + 1) + ' has no time on it, so it never arrives.', { row: i });
        } else if (c.t < 0 || c.t >= 1440) {
          fault('error', 'Text ' + (i + 1) + ' is timed for ' + c.t + ' minutes past midnight, which '
            + 'is off the end of the day — G.minutes wraps at 1440 and Sky.newDay() clears the send '
            + 'index, so it never arrives at all.', { row: i });
        }
        if (!String(c.m || '').trim()) fault('error', 'Text ' + (i + 1) + ' is empty.', { row: i });
        else if (/\w'\w/.test(c.m)) fault('warn', 'Text ' + (i + 1) + ' uses a straight apostrophe.', { row: i });
        if (String(c.who || '').trim() !== id) {
          fault('error', 'Text ' + (i + 1) + ' is from “' + (c.who || '') + '” rather than from “'
            + id + '”, so it is a thread of its own and this one is short a message.', { row: i });
        }
        if (typeof c.t === 'number' && c.t < last) {
          fault('warn', 'Text ' + (i + 1) + ' is timed before the one above it, so the conversation '
            + 'arrives out of order.', { row: i });
        }
        if (typeof c.t === 'number') last = c.t;
      });
    }

    if (kind === 'mail') {
      const m = live ? Office.it : (MAIL_SCRIPT || [])[+id];
      if (!m) return out;
      timed(m.t, 'This email', { field: 't' });
      if (!String(m.s || '').trim()) fault('error', 'No subject.', { field: 's' });
      if (!String(m.from || '').trim()) fault('error', 'No sender.', { field: 'from' });
      if (!String(m.b || '').trim()) fault('error', 'No body.', { field: 'b' });
    }

    if (kind === 'ending') {
      const e = live ? Office.it : (ENDINGS || {})[id];
      if (!e) return out;
      if (!String(e.t || '').trim()) fault('error', 'No title.', { field: 't' });
      if (!Array.isArray(e.b) || !e.b.length) fault('error', 'No text, so the ending is a title and a blank page.', { field: 'b' });
      (e.b || []).forEach((t, i) => {
        if (/\w'\w/.test(t)) fault('warn', 'Paragraph ' + (i + 1) + ' uses a straight apostrophe.', { field: 'b' });
      });
      if (e.when !== undefined && typeof e.when !== 'function' && !isSrc(e.when)) {
        fault('warn', '`when` is not a function, so it is ignored and this ending is always '
          + 'offered.', { field: 't' });
      }
    }

    if (kind === 'cut') {
      const beats = live ? Office.list() : CUT;
      if (!beats.length) fault('error', 'No opening at all.', { field: 'beats' });
      /* The office is the level the shift starts on, and a camera is read in
         tiles on it. One off the edge is a shot the bounds silently pull back,
         which reads as the beat simply not moving. */
      const off = LEVELS.office || {};
      let seen = false;
      beats.forEach((b, i) => {
        if (!String(b.t || '').trim()) fault('error', 'Beat ' + (i + 1) + ' has no text.', { row: i });
        else if (/\w'\w/.test(b.t)) fault('warn', 'Beat ' + (i + 1) + ' uses a straight apostrophe.', { row: i });
        if (b.k && !Office.SHAPES.some(sh => sh[0] === b.k)) {
          fault('error', 'Beat ' + (i + 1) + ' is shaped “' + b.k + '”, which the opening has never '
            + 'heard of. It falls back to a scene.', { row: i });
        }
        if (b.cam) {
          seen = true;
          if (off.w && off.h && (b.cam[0] < 0 || b.cam[1] < 0 || b.cam[0] >= off.w || b.cam[1] >= off.h)) {
            fault('warn', 'Beat ' + (i + 1) + '’s camera is off the edge of the floor, so the shot is '
              + 'clamped back to the edge and the beat looks like it did not move.', { row: i });
          }
        }
      });
      if (beats.length && !seen) {
        fault('warn', 'No beat names a camera, so the opening never shows the building at all — '
          + 'twelve captions on a black screen. A `cam` of two tile coordinates is what brings the '
          + 'floor up behind the writing.', { field: 'beats' });
      }
      const last = beats[beats.length - 1];
      if (last && !last.cam) {
        fault('warn', 'The last beat has no camera of its own, so the opening ends wherever the beat '
          + 'before it was looking and the shift begins with a jump to the player. Aim it at the tile '
          + 'they start on.', { row: beats.length - 1 });
      }
    }
    return out;
  },

  /* Endings.available() walks ENDINGS and keeps rows whose `when()` passes, so
     every row is offerable by construction. */
  pushed() {
    return new Set(Object.keys(ENDINGS));
  },
  unreachable() {
    const out = [];
    const pushed = this.pushed();
    if (!pushed) return out;
    pushed.forEach(k => {
      if (ENDINGS[k]) return;
      out.push({ level: 'error', key: null,
        msg: 'Endings.available() offers “' + k + '” and ENDINGS has no such entry. '
          + 'Endings.offer() reads ENDINGS[k].t for every one of them, so this throws on the last '
          + 'screen of the game.' });
    });
    return out;
  },
};
Object.assign(OfficeCheck, FAULTS);
