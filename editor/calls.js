'use strict';
/* ---------------- The call, which is the game ----------------
   Everything else this editor touches is scenery around one loop: a phone
   rings, somebody is upset, and you have a handful of things you can say. That
   loop is four tables in data/callers.js and nothing joins them up.

     CALLERS   who rings, how angry, and what they say at each stage.
     MOVES     what you can say back. Half data, half code.
     TELLS     what the caller is showing you — the hint that says which need
               is live. Keyed by NEED.
     BOSSES    the set pieces: phases, lines, and the flag winning one sets.

   The joins that fail silently are all of the same shape as everywhere else in
   this project:

     a move's `serves: ['heard']`   names a key in TELLS, checked by nobody
     a boss's `win: 'printerBeaten'` names a G.flag something else has to read
     a caller's `w:`                is a weight in a draw nothing normalises

   All four are edited here, in one mode, because they are one subject: you
   cannot sensibly write a move without seeing the tells it answers.

   HALF OF MOVES IS CODE. `run(E)` is where a move actually does something and
   `show:` decides whether it is offered at all. Both are captured as SOURCE and
   carried through verbatim — never regenerated — for exactly the reason a
   procedural furnish() and a dialogue do() are. This tool cannot write that
   code and must not pretend to. */

const Calls = {
  /* The four tables, in the order the subject list shows them. `arr` says
     whether the table is an array (id lives on the entry) or an object (the id
     is the key), because that decides how it is read, written and emitted. */
  KINDS: [
    { k: 'caller', label: 'Callers', arr: true, table: () => CALLERS },
    { k: 'move', label: 'Moves', arr: true, table: () => MOVES },
    { k: 'boss', label: 'Bosses', arr: false, table: () => BOSSES },
    { k: 'tell', label: 'Tells', arr: false, table: () => TELLS },
  ],
  kind: 'caller',
  id: null,
  /* The subject, as plain data. For a move that means every field except the
     two that are code, which are kept beside it as text. */
  it: null,
  code: null,

  base: null, undoStack: [], redoStack: [],

  /* One select holds all four tables, so a subject is addressed by `kind:id`.
     Mode asks for this rather than assuming a bare id. */
  key() { return this.kind + ':' + this.id; },
  def(k) { return this.KINDS.find(x => x.k === (k || this.kind)); },
  /* Every subject, grouped by table — which is what the subject select renders
     as <optgroup>s. A key is `kind:id` so one select can offer all four. */
  ids() {
    const out = [];
    this.KINDS.forEach(d => {
      const t = d.table();
      const list = d.arr ? t.map(e => e.id) : Object.keys(t);
      list.forEach(id => out.push(d.k + ':' + id));
    });
    return out;
  },
  groups() {
    return this.KINDS.map(d => {
      const t = d.table();
      const list = d.arr ? t.map(e => e.id) : Object.keys(t);
      return { label: d.label, items: list.map(id => [d.k + ':' + id, this.label(d.k, id)]) };
    });
  },
  label(kind, id) {
    const d = this.def(kind), t = d.table();
    const e = d.arr ? t.find(x => x.id === id) : t[id];
    if (!e) return id;
    if (kind === 'caller') return e.name || id;
    if (kind === 'move') return (e.e ? e.e + ' ' : '') + (e.n || id);
    if (kind === 'boss') return e.title || id;
    return id + '  (' + (Array.isArray(e) ? e.length : 0) + ')';
  },
  entry(kind, id) {
    const d = this.def(kind), t = d.table();
    return d.arr ? t.find(x => x.id === id) || null : t[id] || null;
  },

  /* ---- loading ----
     A capture, like every other document here: nothing is written back into
     CALLERS, MOVES, TELLS or BOSSES, the export is the deliverable and Revert
     is a reload. */
  load(key) {
    const [kind, ...rest] = String(key || '').split(':');
    const id = rest.join(':');
    if (!this.def(kind)) return false;
    const e = this.entry(kind, id);
    if (!e) return false;
    this.kind = kind; this.id = id;
    this.code = {};
    if (kind === 'move') {
      /* Captured as SOURCE and never run by this page — the same call Emit
         makes about a do() and a procedural furnish(). */
      this.it = {};
      Object.keys(e).forEach(k => {
        if (typeof e[k] === 'function') this.code[k] = String(e[k]);
        else this.it[k] = clone(e[k]);
      });
    } else if (kind === 'tell') {
      this.it = { lines: clone(e) };
    } else {
      this.it = clone(e);
    }
    this.rebase();
    return true;
  },
  state() { return clone({ kind: this.kind, id: this.id, it: this.it, code: this.code }); },
  restore(s) {
    this.kind = s.kind; this.id = s.id;
    this.it = clone(s.it); this.code = clone(s.code);
  },
  rebuild() {
    CallCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },

  /* ---- editing ----
     Every one of these marks and rebuilds, so the Check tab is never
     describing a subject that has changed underneath it. */
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
  /* The string lists — a caller's `open`/`mid`/`hot`/`win`/`issues`, a tell
     group's lines, a boss phase's lines. One per line in a textarea, because
     that is how they read and how they are written in the file. */
  setLines(k, text) {
    this.mark('edit ' + k);
    const list = String(text).split('\n').map(s => s.trim()).filter(Boolean);
    if (!list.length) delete this.it[k]; else this.it[k] = list;
    this.rebuild();
  },
  lines(k) { return (this.it && Array.isArray(this.it[k]) ? this.it[k] : []).join('\n'); },

  /* `serves` is a set of TELLS keys, and it is the whole reason a move ever
     gets offered for a reason rather than at random. */
  toggleServes(need) {
    const cur = Array.isArray(this.it.serves) ? this.it.serves.slice() : [];
    const i = cur.indexOf(need);
    this.mark(i < 0 ? 'serve ' + need : 'stop serving ' + need);
    if (i < 0) cur.push(need); else cur.splice(i, 1);
    if (cur.length) this.it.serves = cur; else delete this.it.serves;
    this.rebuild();
  },
  setCost(k, v) {
    const n = Number(v);
    this.mark('edit cost');
    this.it.cost = Object.assign({}, this.it.cost);
    if (v === '' || !isFinite(n) || n === 0) delete this.it.cost[k];
    else this.it.cost[k] = n;
    this.rebuild();
  },

  /* ---- a boss's phases ----
     Ordered, and the order is the fight. */
  phases() { return (this.it && this.it.phases) || []; },
  addPhase() {
    this.mark('add a phase');
    this.it.phases = this.phases().concat([{ n: 'NEW PHASE', frus: 60, agg: 8, lines: ['Something it says.'] }]);
    this.rebuild();
  },
  removePhase(i) {
    if (!this.phases()[i]) return false;
    this.mark('delete phase ' + (i + 1));
    this.it.phases = this.phases().filter((_, j) => j !== i);
    this.rebuild();
    return true;
  },
  movePhase(i, d) {
    const p = this.phases().slice(), j = i + d;
    if (j < 0 || j >= p.length) return false;
    this.mark('reorder phases');
    [p[i], p[j]] = [p[j], p[i]];
    this.it.phases = p;
    this.rebuild();
    return true;
  },
  setPhase(i, k, v) {
    const p = this.phases().slice();
    if (!p[i]) return false;
    this.mark('edit phase ' + (i + 1));
    p[i] = Object.assign({}, p[i]);
    if (k === 'lines') p[i].lines = String(v).split('\n').map(s => s.trim()).filter(Boolean);
    else if (k === 'n') p[i].n = v;
    else p[i][k] = Number(v) || 0;
    this.it.phases = p;
    this.rebuild();
    return true;
  },
};
Object.assign(Calls, HIST);

/* ---------------- Making and unmaking ----------------
   In this tab only, exactly like a level, a job or a person made here. The
   table is the catalogue and the export is what puts anything into it for
   real. */
const CallsMake = {
  create() {
    Ask.form('Something new for the phones', [
      { k: 'kind', label: 'what', value: 'caller', options: Calls.KINDS.map(d => [d.k, d.label]) },
      { k: 'id', label: 'id', value: '', hint: 'how the table keys it, e.g. builder' },
      { k: 'n', label: 'called', value: '', hint: 'what the player sees' },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (Calls.entry(v.kind, id)) { Side.say('There is already a ' + v.kind + ' called ' + id + '.'); return; }
      const name = v.n || id;
      if (v.kind === 'caller') {
        CALLERS.push({ id, name, face: '🧑', w: 10, frus: 50, agg: 6, pat: 100,
          issues: ['something that has gone wrong'], open: ['Hello?'], mid: ['Right.'],
          hot: ['This is not good enough.'], win: ['Thanks. That is sorted then.'] });
      } else if (v.kind === 'move') {
        /* A move with no run() does nothing at all, so it is made with one —
           and the panel says, where you edit it, that this half is code the
           editor carries rather than writes. */
        MOVES.push({ id, e: '💬', n: name, d: 'What it does.', cost: {},
          run(E) { return { dmg: 8, txt: 'You say something.' }; } });
      } else if (v.kind === 'boss') {
        BOSSES[id] = { title: name, face: '📞', sub: 'A set piece',
          phases: [{ n: name.toUpperCase(), frus: 60, agg: 8, lines: ['It begins.'] }],
          breather: 'A pause.', win: id + 'Beaten' };
      } else {
        TELLS[id] = ['They are showing you something.'];
      }
      Mode.openSubject(v.kind + ':' + id);
      Side.say('Created ' + id + '. It is in this tab only — the export is what puts it in the file.');
    });
  },
  drop() {
    const key = Calls.kind + ':' + Calls.id;
    const others = Calls.ids().filter(x => x !== key);
    if (!others.length) { Side.say('This is the only one there is.'); return; }
    const uses = CallCheck.usedBy(Calls.kind, Calls.id);
    Ask.confirm('Delete ' + Calls.label(Calls.kind, Calls.id) + '?',
      'It goes from this tab’s table. data/callers.js is untouched, so a reload brings it back'
      + (uses.length ? ' — but ' + uses.length + ' other thing(s) name it: ' + uses.slice(0, 3).join(', ') : '.'),
      'Delete it').then(yes => {
      if (!yes) return;
      const d = Calls.def();
      if (d.arr) {
        const t = d.table(), i = t.findIndex(x => x.id === Calls.id);
        if (i >= 0) t.splice(i, 1);
      } else delete d.table()[Calls.id];
      Calls.forget(key);
      Mode.openSubject(others[0]);
      Side.say('Deleted from this tab.');
    });
  }
};

/* ---------------- What is wrong with the phones ----------------
   The faults that matter are the ones that are invisible while you play. A
   move that serves a need nothing ever shows is a move offered at random; a
   caller with no `win` lines ends every good call in silence; a boss whose flag
   nobody reads is a fight with no consequence. */
const CallCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    Calls.ids().forEach(key => this.per.set(key, this.one(key)));
    this.faults = (this.per.get(Calls.kind + ':' + Calls.id) || []).concat(this.orphans());
    return this;
  },

  /* Which needs any move claims to serve, and which the tells actually offer.
     The two are matched by string and by nobody else. */
  needs() { return Object.keys(typeof TELLS !== 'undefined' ? TELLS : {}); },
  served() {
    const out = new Set();
    (typeof MOVES !== 'undefined' ? MOVES : []).forEach(m => {
      const s = (Calls.kind === 'move' && m.id === Calls.id) ? Calls.it.serves : m.serves;
      (s || []).forEach(n => out.add(n));
    });
    return out;
  },
  /* What else names this thing, for the delete question. */
  usedBy(kind, id) {
    const out = [];
    if (kind === 'tell') {
      (typeof MOVES !== 'undefined' ? MOVES : []).forEach(m => {
        if ((m.serves || []).indexOf(id) >= 0) out.push('move ' + (m.n || m.id));
      });
    }
    return out;
  },

  one(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    const live = kind === Calls.kind && id === Calls.id;
    const out = [];
    const fault = (level, msg, extra) =>
      out.push(Object.assign({ level, msg, key }, extra || {}));

    /* The open subject is read from the DOCUMENT and every other from the
       table — the same rule the job and object checks follow, so something you
       have just changed is reported now rather than after you export it. */
    let e = this.entry(kind, id, live);
    if (!e) return out;

    const strList = (k, what) => {
      const v = e[k];
      if (!Array.isArray(v) || !v.length) { fault('error', what, { field: k }); return; }
      v.forEach((t, i) => {
        if (!String(t || '').trim()) fault('error', k + ' line ' + (i + 1) + ' is empty.', { field: k });
        else if (/\w'\w/.test(t)) fault('warn', k + ' line ' + (i + 1) + ' uses a straight apostrophe. '
          + 'Everything else the player reads uses a curly one.', { field: k });
      });
    };

    if (kind === 'caller') {
      if (!String(e.name || '').trim()) fault('error', 'No name, so the call card has nothing to head it with.', { field: 'name' });
      if (!String(e.face || '').trim()) fault('warn', 'No face. The call card falls back to a blank.', { field: 'face' });
      if (!(e.w > 0)) fault('error', 'A weight of ' + JSON.stringify(e.w) + ' means this caller is drawn '
        + 'never — the pick is weighted and zero is "not in the deck".', { field: 'w' });
      ['frus', 'agg', 'pat'].forEach(k => {
        if (typeof e[k] !== 'number' || !isFinite(e[k]) || e[k] < 0) {
          fault('error', '`' + k + '` is ' + JSON.stringify(e[k]) + ', which is not a number the fight can use.', { field: k });
        }
      });
      if (e.frus > 0 && e.agg > 0 && e.frus / e.agg > 30) {
        fault('warn', 'Frustration ' + e.frus + ' against aggression ' + e.agg + ' is a very long call. '
          + 'Move staleness decays, but a caller this placid still takes a while to finish.');
      }
      strList('issues', 'No issues, so the call has nothing to be about.');
      strList('open', 'No opening line, so the caller starts the call in silence.');
      strList('mid', 'No middle lines.');
      strList('hot', 'No hot lines, so nothing changes when they lose patience.');
      strList('win', 'No winning line, so a call resolved well ends in silence.');
    }

    if (kind === 'move') {
      if (!String(e.n || '').trim()) fault('error', 'No reply text, so the button is blank.', { field: 'n' });
      if (!String(e.d || '').trim()) fault('warn', 'No description. The desktop shows one under the reply.', { field: 'd' });
      const src = live ? Calls.code : { run: e.run && String(e.run), show: e.show && String(e.show) };
      if (!src.run) fault('error', 'No run(), so pressing this does nothing at all.', { field: 'run' });
      (e.serves || []).forEach(n => {
        if (this.needs().indexOf(n) < 0) {
          fault('error', 'It serves “' + n + '”, and TELLS has no such need — so nothing will ever '
            + 'show the player a reason to press it.', { field: 'serves' });
        }
      });
      const cost = e.cost || {};
      Object.keys(cost).forEach(k => {
        if (['pat', 'ene'].indexOf(k) < 0) {
          fault('error', 'Cost “' + k + '” is not one Combat knows. It spends `pat` and `ene`.', { field: 'cost' });
        }
      });
    }

    if (kind === 'boss') {
      if (!String(e.title || '').trim()) fault('error', 'No title.', { field: 'title' });
      const ph = e.phases || [];
      if (!ph.length) fault('error', 'No phases, so there is no fight.', { field: 'phases' });
      ph.forEach((p, i) => {
        if (!String(p.n || '').trim()) fault('error', 'Phase ' + (i + 1) + ' has no name.', { phase: i });
        if (!Array.isArray(p.lines) || !p.lines.length) {
          fault('error', 'Phase ' + (i + 1) + ' has no lines, so it says nothing.', { phase: i });
        }
        if (!(p.frus > 0)) fault('error', 'Phase ' + (i + 1) + ' has no frustration to work through.', { phase: i });
      });
      if (!String(e.breather || '').trim()) {
        fault('warn', 'No breather line. It is what plays between phases.', { field: 'breather' });
      }
      /* The flag is the whole consequence of winning, and nothing declares who
         reads it. Writing is the index that can answer. */
      if (!e.win) fault('warn', 'Winning sets no flag, so beating this changes nothing anywhere.', { field: 'win' });
      else if (typeof Writing !== 'undefined') {
        const reads = Writing.index().filter(x => x.src.indexOf(e.win) >= 0);
        if (!reads.length) {
          fault('warn', 'Nothing in the writing reads `' + e.win + '`, so beating this is a flag '
            + 'nobody checks. Found by reading the acts and the dialogue — a name built out of a '
            + 'variable would be invisible here.', { field: 'win' });
        }
      }
    }

    if (kind === 'tell') {
      const lines = Array.isArray(e) ? e : (e.lines || []);
      if (!lines.length) fault('error', 'No lines, so this need can never be shown.', { field: 'lines' });
      lines.forEach((t, i) => {
        if (/\w'\w/.test(t)) fault('warn', 'Line ' + (i + 1) + ' uses a straight apostrophe.', { field: 'lines' });
      });
      if (!this.served().has(id)) {
        fault('warn', 'No move serves “' + id + '”, so the player can be shown this tell and have '
          + 'nothing to answer it with.', { field: 'lines' });
      }
    }
    return out;
  },

  /* The open subject as the document has it; anything else as the table has
     it. Written once because all four kinds need it and they read differently:
     a tell is a bare array, a move keeps its code beside its data. */
  entry(kind, id, live) {
    if (!live) {
      const e = Calls.entry(kind, id);
      return kind === 'tell' ? (e || []) : e;
    }
    if (kind === 'tell') return Calls.it.lines || [];
    if (kind === 'move') return Object.assign({}, Calls.it, {
      run: Calls.code.run || null, show: Calls.code.show || null });
    return Calls.it;
  },

  /* The other direction: a need with no tell behind it. A move that serves it
     will be offered on a hint the player is never shown. */
  orphans() {
    const out = [];
    const have = new Set(this.needs());
    (typeof MOVES !== 'undefined' ? MOVES : []).forEach(m => {
      const serves = (Calls.kind === 'move' && m.id === Calls.id) ? (Calls.it.serves || []) : (m.serves || []);
      serves.forEach(n => {
        if (have.has(n)) return;
        out.push({ level: 'error', key: null,
          msg: 'Move “' + (m.n || m.id) + '” serves “' + n + '”, and there is no such need in TELLS.' });
      });
    });
    return out;
  },
};
Object.assign(CallCheck, FAULTS);
