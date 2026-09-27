'use strict';
/* ---------------- What the editor keeps outside itself ----------------
   Two things leave this page. The bench goes into localStorage so a reload is
   not an afternoon; a level goes to the game so you can walk around the thing
   you have been drawing. Both are the same shape of problem — JSON, an origin,
   and a browser that may refuse the lot — so they live together.

   Neither is allowed to be silently wrong. Storage is refused outright on a
   `file://` origin in Chromium, so every call is guarded and every failure is
   said out loud rather than swallowed: an autosave you believe in and do not
   have is worse than none at all. */

const Store = {
  ok: null,
  /* Asked once, by doing it: the presence of `localStorage` is not the
     question — a file:// page has the object and throws on touching it. */
  works() {
    if (this.ok !== null) return this.ok;
    try {
      localStorage.setItem(GAME.id + '.probe', '1');
      localStorage.removeItem(GAME.id + '.probe');
      this.ok = true;
    } catch (_) {
      this.ok = false;
    }
    return this.ok;
  },
  get(key) {
    if (!this.works()) return null;
    try { return localStorage.getItem(key); } catch (_) { return null; }
  },
  set(key, text) {
    if (!this.works()) return false;
    try { localStorage.setItem(key, text); return true; } catch (_) { return false; }
  },
  drop(key) {
    if (!this.works()) return;
    try { localStorage.removeItem(key); } catch (_) { /* nothing to do */ }
  },
  /* Why it will not work, in words, once. */
  why() {
    return 'This browser will not let a page opened off disk keep anything. '
      + 'Serve the folder — python3 -m http.server — and it works.';
  }
};

/* ---------------- The bench, across a reload ----------------
   The bench is this tab's memory and the export is still the only way anything
   reaches data/. That has not changed: what has changed is that a reload used
   to take the lot, and the bench can now hold a dozen subjects across ten
   documents. Twine and LDtk both keep a working copy; so does this, with one
   difference that matters.

   IT IS NEVER PUT BACK WITHOUT ASKING. A bench restored beside a data/ file
   somebody has edited since is a working copy of something that no longer
   exists, and applying that silently would be the tool lying about what you
   are looking at. So it is offered, once, on the way in, with what is in it
   named. */
const Bank = {
  KEY: GAME.id + '.bench',
  V: 3,
  /* localStorage is a few megabytes and one level's bench is about eighty
     kilobytes of it. Past this it is not saved and says so, rather than
     throwing on every keystroke. */
  CAP: 3 * 1024 * 1024,
  t: 0,
  warned: false,

  /* Called from Side.refresh(), which is every commit — so it is debounced.
     Writing three hundred objects to storage on each of them would be a tool
     that stutters while you type. */
  bump() {
    if (!Store.works()) return;
    clearTimeout(this.t);
    this.t = setTimeout(() => this.save(), 800);
  },

  /* Everything the files do not have: the working copies on each bench, the
     subjects made here, and the ones deleted here. The three things
     Mode.changes() reports, which is the same list for the same reason. */
  save() {
    const rows = Mode.changes();
    if (!rows.length) { Store.drop(this.KEY); return true; }
    const docs = {};
    Mode.docs().forEach(({ mode, doc }) => {
      const made = {}, gone = [], lost = [];
      rows.filter(r => r.mode === mode).forEach(r => {
        if (r.how === 'gone') { gone.push(r.key); return; }
        if (r.how !== 'new') return;
        const e = this.entryOf(mode, r.key);
        /* A move's run() and an event's go() are functions. JSON drops them and
           rebuilding one would mean evaluating a string out of storage, which
           nothing in this project does. So they are not restored at all rather
           than restored broken, and the offer says which. */
        if (e && Object.keys(e).some(k => typeof e[k] === 'function')) { lost.push(r.label); return; }
        if (e) made[r.key] = e;
      });
      const bench = doc.bench && Object.keys(doc.bench).length ? doc.bench : null;
      if (bench || Object.keys(made).length || gone.length || lost.length) {
        docs[mode] = { bench: bench, made: made, gone: gone, lost: lost };
      }
    });
    /* The open subject is only on its bench once it has been left, so put it
       there — a reload is a leaving. */
    Mode.docs().forEach(({ mode, doc }) => {
      if (!doc.changed || !doc.subjectKey || !doc.changed()) return;
      const k = doc.subjectKey();
      if (k === null || k === undefined) return;
      docs[mode] = docs[mode] || { bench: null, made: {}, gone: [], lost: [] };
      docs[mode].bench = Object.assign({}, docs[mode].bench || {});
      docs[mode].bench[k] = { s: doc.state(), u: [], r: [] };
    });

    let text;
    try {
      text = JSON.stringify({ v: this.V, at: Date.now(), docs: docs });
    } catch (_) {
      return false;
    }
    if (text.length > this.CAP) {
      if (!this.warned) { this.warned = true; Side.say('Too much on the bench to keep across a reload.'); }
      return false;
    }
    return Store.set(this.KEY, text);
  },

  /* The live table entry for a subject, whichever document it belongs to.
     Read rather than declared per mode where it can be: the four that key
     themselves by kind ask their own KINDS table for it. */
  entryOf(mode, key) {
    const bare = String(key).split(':').pop();
    const kind = String(key).indexOf(':') > 0 ? String(key).split(':')[0] : null;
    try {
      if (mode === 'jobs') return QUESTS[key];
      if (mode === 'zones') return ZONES[key];
      if (mode === 'things') return FURN[key];
      if (mode === 'talk') return NPCS.filter(p => p.id === key)[0];
      if (mode === 'levels') return null;         /* a level is its own document */
      if (mode === 'prog') return (Prog.def(kind) || {}).table ? Prog.def(kind).table()[bare] : null;
      if (mode === 'calls') {
        const d = Calls.def(kind);
        if (!d) return null;
        return d.arr ? d.table().filter(x => x.id === bare)[0] : d.table()[bare];
      }
      if (mode === 'office') {
        if (kind === 'event') return (EVENTS || []).filter(e => e.id === bare)[0];
        if (kind === 'ending') return ENDINGS[bare];
        if (kind === 'mail') return (MAIL_SCRIPT || [])[+bare];
        /* A chat channel and a text thread are both many rows, so neither has
           a single file entry to compare a bench copy against. */
        return null;
      }
    } catch (_) { /* a table that is not there is nothing to keep */ }
    return null;
  },

  /* What is waiting, if anything, as something a person can be shown. */
  waiting() {
    const raw = Store.get(this.KEY);
    if (!raw) return null;
    let p;
    try { p = JSON.parse(raw); } catch (_) { Store.drop(this.KEY); return null; }
    if (!p || p.v !== this.V || !p.docs) { Store.drop(this.KEY); return null; }
    let n = 0;
    const lost = [];
    Object.keys(p.docs).forEach(m => {
      const d = p.docs[m];
      n += Object.keys(d.bench || {}).length + Object.keys(d.made || {}).length + (d.gone || []).length;
      (d.lost || []).forEach(x => lost.push(x));
    });
    return n || lost.length ? { p: p, n: n, lost: lost } : null;
  },

  /* Put it back. Deletions first, then the things that were made, then the
     benches — a bench entry for something made here has to find it there. */
  restore(p) {
    Object.keys(p.docs).forEach(mode => {
      const d = p.docs[mode], doc = (Mode.DOCS[mode] || (() => null))();
      if (!doc) return;
      (d.gone || []).forEach(key => this.remove(mode, key));
      Object.keys(d.made || {}).forEach(key => this.insert(mode, key, d.made[key]));
      if (d.bench) doc.bench = clone(d.bench);
    });
    /* Every index in the editor was built from the tables as they were. */
    Things.build();
    Writing._index = null;
    /* And the open subject has to be re-read, or the panel is showing the
       file's version of something the bench now has a working copy of. */
    Mode.DEFS.forEach(m => {
      const doc = Mode.DOCS[m.k]();
      if (!doc || !doc.subjectKey || doc.subjectKey() === null) return;
      if (m.k === 'levels') { Doc.load(Doc.id); Doc.resume(); }
      else if (doc.load(doc.subjectKey())) doc.resume();
    });
    Doc.rebuild();
    Mode.subjectOptions();
    Side.refresh();
  },
  insert(mode, key, entry) {
    const bare = String(key).split(':').pop();
    const kind = String(key).indexOf(':') > 0 ? String(key).split(':')[0] : null;
    try {
      if (mode === 'jobs') QUESTS[key] = entry;
      else if (mode === 'zones') { Zones.keep(); ZONES[key] = entry; }
      else if (mode === 'things') { Things.keep(); FURN[key] = entry; }
      else if (mode === 'talk') NPCS.push(entry);
      else if (mode === 'prog') Prog.def(kind).table()[bare] = entry;
      else if (mode === 'calls') {
        const d = Calls.def(kind);
        if (d.arr) d.table().push(entry); else d.table()[bare] = entry;
      } else if (mode === 'office') {
        if (kind === 'event') EVENTS.push(entry);
        else if (kind === 'ending') ENDINGS[bare] = entry;
        else if (kind === 'mail') MAIL_SCRIPT.push(entry);
        else if (kind === 'text' && entry && Array.isArray(entry.lines)) {
          /* A thread made here is its rows, because that is what the document
             holds — a text thread has no single entry in TEXT_SCRIPT. */
          entry.lines.forEach(c => TEXT_SCRIPT.push(clone(c)));
        }
      }
    } catch (_) { /* a table that has moved on: leave it alone */ }
  },
  remove(mode, key) {
    const bare = String(key).split(':').pop();
    const kind = String(key).indexOf(':') > 0 ? String(key).split(':')[0] : null;
    try {
      if (mode === 'jobs') delete QUESTS[key];
      else if (mode === 'zones') { Zones.keep(); delete ZONES[key]; }
      else if (mode === 'things') { Things.keep(); delete FURN[key]; }
      else if (mode === 'talk') {
        const i = NPCS.findIndex(p => p.id === key);
        if (i >= 0) NPCS.splice(i, 1);
      } else if (mode === 'prog') delete Prog.def(kind).table()[bare];
      else if (mode === 'calls') {
        const d = Calls.def(kind);
        if (d.arr) { const i = d.table().findIndex(x => x.id === bare); if (i >= 0) d.table().splice(i, 1); }
        else delete d.table()[bare];
      }
    } catch (_) { /* already gone */ }
  },

  /* Offered on the way in, never applied on the way in. */
  offer() {
    const w = this.waiting();
    if (!w) return;
    Ask.confirm('You left work here',
      w.n + ' subject' + (w.n === 1 ? '' : 's') + ' the files do not have, kept from an earlier '
      + 'session in this browser. Nothing has been exported and data/ may have moved on since, so '
      + 'this is a question rather than something that has already happened'
      + (w.lost.length
        ? ' — and ' + w.lost.join(', ') + ' cannot come back, because what you made had code in it '
          + 'and code does not survive being written down as data.'
        : '.'),
      'Put it back').then(yes => {
      if (!yes) { Side.say('Left where it was. It will be offered again next time.'); return; }
      this.restore(w.p);
      Side.say('Put back ' + w.n + ' subject' + (w.n === 1 ? '' : 's') + '. Still nothing exported.');
    });
  }
};

/* ---------------- Walking around what you have drawn ----------------
   The play button every map editor has, and the reason this one took a while:
   the game loads from data/, so `index.html?level=x` would play the FILE's
   level while you sit there looking at your edited one. A play button that
   silently ignores your work is worse than no play button.

   So the level goes with it. Geometry, objects, FURN and ZONES — the four
   things that decide what a level is and how it looks, all of them pure data.
   Writing and code do not: a `do()` and a `run()` are functions, JSON drops
   them, and rebuilding one would mean evaluating a string out of storage.
   The button says so rather than letting you find out. */
const Play = {
  KEY: GAME.id + '.trial',

  payload() {
    const objects = clone(Doc.objects).map(o => { delete o._k; return o; });
    return {
      v: 1,
      entry: Doc.entries.start ? 'start' : (Object.keys(Doc.entries)[0] || 'start'),
      level: {
        id: Doc.id, name: Doc.name, w: Doc.w, h: Doc.h, indoors: Doc.indoors, hub: !!Doc.hub,
        rooms: clone(Doc.rooms), doors: clone(Doc.doors), counters: clone(Doc.counters),
        entries: clone(Doc.entries), links: clone(Doc.links),
        objects: objects, desks: clone(Doc.desks),
      },
      /* The two tables that decide how everything in it is furnished and what
         the rooms are made of. Both are what the object and room editors have
         already written into, so they are what you are looking at. */
      furn: clone(FURN),
      zones: clone(ZONES),
    };
  },

  /* Which level to try a ROOM TYPE on. ZONES crosses over whole, so repainting
     a room is a thing you can walk around — but only somewhere it is actually
     painted, and the Rooms tab is not the Levels tab and has no opinion about
     which map you were looking at. The one you have open wins if the room type
     is on it at all; otherwise the level with the most of it. Nowhere is a real
     answer and the button is not offered. */
  levelFor(zone) {
    const used = Zones.usage().get(zone) || [];
    if (!used.length) return null;
    if (used.some(r => r.level === Doc.id)) return Doc.id;
    const by = {};
    used.forEach(r => { by[r.level] = (by[r.level] || 0) + r.tiles; });
    return Object.keys(by).sort((a, b) => by[b] - by[a])[0];
  },

  /* `id` names a level other than the open one, which is what the Rooms tab
     hands over. Swapping the document is the same manoeuvre Sync.levels()
     makes for the same reason — the payload is read off Doc and there is only
     one Doc — and the open level is put back before this returns, whichever
     way out is taken. */
  go(id) {
    const want = id || Doc.id;
    if (!want || !LEVELS[want]) { Side.say('There is no level to try this on.'); return; }
    const swap = want !== Doc.id;
    const was = Doc.id;
    let text = null, name = '';
    if (swap) Doc.stash();
    try {
      if (swap) {
        if (!Doc.load(want)) { Side.say('Could not open ' + want + ' to try it on.'); return; }
        Doc.resume(); Doc.rebuild();
      }
      name = Doc.name || want;
      if (!Object.keys(Doc.entries).length) {
        Side.say(name + ' has no arrival point, so there is nowhere to start. The Level tab adds one.');
        return;
      }
      try { text = JSON.stringify(this.payload()); } catch (_) { text = null; }
    } finally {
      if (swap && was && Doc.load(was)) { Doc.resume(); Doc.rebuild(); }
    }
    if (!text || !Store.set(this.KEY, text)) {
      Side.say('Cannot hand the level over — ' + Store.why());
      return;
    }
    /* A new tab, so the editor and everything on its bench is still here when
       you come back. Popup blockers allow this from inside a click. */
    const url = 'index.html?try=' + encodeURIComponent(want);
    const w = window.open(url, '_blank');
    if (!w) { Side.say('The browser blocked the new tab. Allow pop-ups here and try again.'); return; }
    Side.say('Trying ' + name + ' in a new tab — your level, your rooms, the file’s writing.');
  }
};
