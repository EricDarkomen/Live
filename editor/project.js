'use strict';
/* ---------------- The whole game ----------------
   Nine documents, three hundred and fifty subjects, and every check in this
   tool scoped to the one subject in front of you. So the two questions anybody
   actually has — what have I changed, and what is broken — could only be
   answered by visiting ten modes and, in several of them, seventy subjects one
   at a time. The tool knew all of it and never once added it up.

   This is the adding up. It is not a tenth document: it has no subject, no undo
   and no export, and every row in it is a way somewhere else. Two lists:

     THE BENCH   every subject with work on it that is not in a file yet, and
                 which file each one belongs in. Nothing here autosaves, so
                 this is the whole of what closing the tab would cost — and
                 it is what the save button writes.
     THE FAULTS  every checker's whole table at once, errors before warnings,
                 each one a jump to the mode and subject that owns it.

   It is taken on demand rather than kept current. A sweep is ~30ms, which is
   nothing to press a button for and far too much to do on every keystroke. */

const Project = {
  /* ---- borrowing a document ----
     Seven of the ten checkers already hold a `per` map covering their whole
     table, because their subjects are small and cheap to check. The level and
     dialogue checkers only ever know the open subject — a level has to be BUILT
     to be checked, and a conversation walked — so the only way to ask them
     about the rest is to load each one in turn and hand the document back
     afterwards exactly as it was.

     The same call Levels.build() makes about borrowing World. Get it wrong and
     the sweep leaves you standing on a different level with somebody else's
     undo stack, which is a far worse bug than the one it is reporting. */
  sweep(doc, ids, run, collect) {
    const keep = {
      key: doc.subjectKey(), s: doc.state(), base: doc.base,
      u: doc.undoStack, r: doc.redoStack,
    };
    /* Nothing on screen wants to be redrawn ten times on the way past, and a
       refresh mid-sweep would render a panel for a subject nobody asked for. */
    const live = Side.live;
    Side.live = false;
    try {
      ids.forEach(id => {
        if (!doc.load(id)) return;
        /* The bench, not the file: a level you have edited and walked away
           from should be checked as you have it, or the sweep reports on a
           version of the game that exists nowhere. */
        doc.resume();
        run();
        collect(id);
      });
    } finally {
      if (keep.key !== null && keep.key !== undefined) doc.load(keep.key);
      doc.restore(keep.s);
      doc.base = keep.base;
      doc.undoStack = keep.u; doc.redoStack = keep.r;
      Side.live = live;
      run();
    }
  },

  /* ---- the sweep ----
     One row per document: how many subjects, what is on the bench, and every
     fault the checker has, flattened with enough on each to navigate to it. */
  survey() {
    const rows = Mode.DEFS.map(d => {
      const doc = Mode.DOCS[d.k]();
      const faults = this.faultsFor(d.k);
      return {
        mode: d.k, label: d.label, icon: d.icon, file: d.file, subject: d.subject,
        subjects: this.count(d.k),
        edited: doc.editedKeys ? doc.editedKeys() : [],
        faults: faults,
        errors: faults.filter(f => f.level === 'error').length,
        warns: faults.filter(f => f.level !== 'error').length,
      };
    });
    return {
      rows: rows,
      errors: rows.reduce((n, r) => n + r.errors, 0),
      warns: rows.reduce((n, r) => n + r.warns, 0),
      edited: rows.reduce((n, r) => n + r.edited.length, 0),
    };
  },

  count(mode) {
    try {
      const was = Mode.id;
      Mode.id = mode;
      const groups = Mode.subjectGroups();
      const n = groups ? groups.reduce((a, g) => a + g.items.length, 0) : Mode.subjects().length;
      Mode.id = was;
      return n;
    } catch (_) { return 0; }
  },

  /* Every fault in a document, as rows that know where they came from. */
  faultsFor(mode) {
    const out = [];
    const add = (key, list) => (list || []).forEach(f => out.push({
      level: f.level === 'error' ? 'error' : 'warn',
      msg: f.msg, mode: mode, key: key,
    }));

    if (mode === 'levels') {
      this.sweep(Doc, Levels.ids(), () => Doc.rebuild(), id => add(id, Check.faults));
      /* And the one fault about the building rather than about a level. */
      this.marooned().forEach(id => out.push({
        level: 'warn', mode: 'levels', key: id,
        msg: 'Nothing links to ' + ((LEVELS[id] || {}).name || id)
          + ', so the only way onto it is a saved shift.',
      }));
      return out;
    }
    if (mode === 'talk') {
      this.sweep(Talk, Talk.ids(), () => Talk.rebuild(), id => add(id, TalkCheck.faults));
      return out;
    }
    /* Art is the one document that starts empty — there is nothing to load
       until somebody brings a sheet in — so it reports on what is here. */
    if (mode === 'art') {
      add(Art.sheet() ? Art.sheet().id : null, ArtCheck.faults);
      return out;
    }
    const checker = Mode.CHECKERS[mode]();
    if (checker && checker.per) checker.per.forEach((list, key) => add(key, list));
    return out;
  },

  /* ---- going to one ----
     A fault row is only worth having if it is a way to the thing. Every one of
     them names a mode and a subject, so this is the same two calls every time
     — and it lands on the tab the row is about, because arriving at a fault
     with the Inspect tab open is arriving one tap short. */
  goTo(mode, key, tab) {
    Ask.close();
    this.mark();
    if (mode && mode !== Mode.id) Mode.set(mode);
    if (key !== null && key !== undefined && key !== Mode.current()) Mode.openSubject(key);
    const want = tab || 'check';
    if (Mode.def().tabs.indexOf(want) >= 0) Side.show(want);
    if (this.from && this.from.mode !== Mode.id) {
      Side.say('From ' + this.from.label + ' — alt+← goes back.');
    }
  },

  /* ---- and back again ----
     A jump across documents used to be one-way: you pressed a fault, arrived
     somewhere else entirely, and finding your way back was the picker and a
     memory. One step is enough — this is a jump, not a browser — and it is
     announced on arrival, because a shortcut nobody is told about is a
     shortcut nobody has. */
  from: null,
  mark() {
    this.from = { mode: Mode.id, key: Mode.current(), tab: Side.tab,
      label: Mode.def().label + ' · ' + Mode.title() };
  },
  back() {
    const f = this.from;
    if (!f) { Side.say('Nowhere to go back to.'); return; }
    this.from = null;
    if (f.mode !== Mode.id) Mode.set(f.mode);
    if (f.key !== null && f.key !== undefined && f.key !== Mode.current()) Mode.openSubject(f.key);
    if (Mode.def().tabs.indexOf(f.tab) >= 0) Side.show(f.tab);
    Side.say('Back at ' + f.label + '.');
  },

  /* ---- the sheet ----
     Three things about the whole game, and a box at the top that turns it into
     the fourth. Empty, it is the state of the place: what is on the bench and
     what every check found. Typed into, it is find-in-project — which is the
     one thing every comparable tool has and this had ten separate copies of,
     each filtering its own list and none of them able to answer "where does
     anybody mention the kettle". */
  show(seed) {
    Find.q = seed === undefined ? '' : seed;
    Find.rows = null;
    Ask.picker('The whole game', (host, api) => {
      if (Find.q) return Find.render(host, api);
      const s = this.survey();
      const pill = (n, cls) => '<b class="' + cls + '">' + n + '</b>';
      host.innerHTML = Find.box()
        + '<div class="stat">'
        + '<div>' + pill(s.errors, s.errors ? 'bad' : 'good') + '<span>broken</span></div>'
        + '<div>' + pill(s.warns, '') + '<span>to look at</span></div>'
        + '<div>' + pill(Mode.changes().length, Mode.changes().length ? 'warn' : '')
        + '<span>on the bench</span></div>'
        + '</div>'
        /* The lists scroll and the headline does not, the same arrangement the
           picker makes: what you came to see is the numbers, and having to
           scroll back up to them is the sheet being a page instead. */
        + '<div class="picklist">'
        + this.bench()
        + this.graph()
        + this.faultList(s)
        + '<div class="note">The bench is this tab’s memory until you save it. Everything with '
        + 'code in it — a do(), a run(), a procedural furnish() — is still yours to paste, and '
        + 'the save says so by name rather than doing it badly.</div>'
        + '</div>';

      this.wire(host, api);
    });
  },

  /* Every row in every one of these lists is a way somewhere, so they are all
     wired the same way and in one place. */
  wire(host, api) {
    host.querySelectorAll('[data-go]').forEach(el => {
      const [mode, tab, ...rest] = el.dataset.go.split('|');
      el.onclick = () => this.goTo(mode, rest.join('|') || null, tab);
    });
    const save = host.querySelector('[data-a="sync"]');
    /* The sheet closes first. Writing files puts a report up in its place, and
       two dialogs deep is a page you have to press your way out of. */
    if (save) save.onclick = () => { api.close(); Sync.go(); };
    const pub = host.querySelector('[data-a="publish"]');
    if (pub) pub.onclick = () => {
      api.close();
      if (Repo.ready()) { Sync.go('github'); return; }
      Repo.setup().then(ok => { if (ok) Sync.go('github'); });
    };
    const forget = host.querySelector('[data-a="forget"]');
    if (forget) forget.onclick = () => {
      Repo.forget();
      Side.say('Forgotten. The repository is still remembered; the token is not.');
      this.show();
    };
    Find.wire(host, api);
  },

  /* ---- the level graph ----
     Which levels there are and how you get between them. `links` is a table per
     level and `route()` walks it, but nothing has ever DRAWN it — so "is there
     a way to the car park" was three Level tabs and a memory. An outline rather
     than a node graph, for the same reason the dialogue flow is one: a graph
     wants a canvas and a layout pass, and the nesting is the fact.

     The fact worth having is at the bottom of it: a level nothing links to is
     a level nobody can reach, and no per-level check can see that — each one
     only knows its own way out. */
  /* Which levels nothing leads to. No per-level check can see this — each one
     only knows its own way out — so it is the one fault in the building that
     had to wait for something that looks at every level at once. A level you
     have just made is the usual answer, and it stays an answer until you give
     it a door. */
  linksOf(id) { return (id === Doc.id ? Doc.links : (LEVELS[id] || {}).links) || []; },
  hub() {
    const ids = Levels.ids();
    return ids.filter(id => (LEVELS[id] || {}).hub)[0] || ids[0];
  },
  marooned() {
    const ids = Levels.ids();
    const inbound = {};
    ids.forEach(id => this.linksOf(id).forEach(l => { inbound[l.to] = true; }));
    const hub = this.hub();
    return ids.filter(id => id !== hub && !inbound[id]);
  },

  graph() {
    const ids = Levels.ids();
    if (ids.length < 2) return '';
    const linksOf = id => this.linksOf(id);
    const hub = this.hub();

    const seen = {};
    const draw = (id, depth) => {
      const rows = ['<div class="fl-n" style="--d:' + depth + '" data-go="levels|level|' + esc(id) + '">'
        + '<b>' + esc((LEVELS[id] || {}).name || id) + '</b>'
        + '<em>' + esc(id) + (seen[id] ? ' · already above' : '') + '</em></div>'];
      if (seen[id]) return rows.join('');
      seen[id] = true;
      linksOf(id).forEach(l => {
        rows.push('<div class="fl-r" style="--d:' + (depth + 1) + '">'
          + '<span class="fl-you">' + esc(l.via) + '</span>'
          + '<em>' + esc(l.to) + (LEVELS[l.to] ? '' : ' — no such level') + '</em></div>');
        if (LEVELS[l.to]) rows.push(draw(l.to, depth + 2));
      });
      return rows.join('');
    };
    const marooned = this.marooned();
    return '<h4>The building</h4><div class="flow">' + draw(hub, 0) + '</div>'
      + (marooned.length
        ? '<ul class="faults">' + marooned.map(id =>
          '<li class="warn" data-go="levels|level|' + esc(id) + '">Nothing links to '
          + esc((LEVELS[id] || {}).name || id) + ', so the only way onto it is a saved shift.'
          + '<em>' + esc(id) + '</em></li>').join('') + '</ul>'
        : '');
  },

  /* What you have edited and not yet pasted anywhere, grouped by the file it
     goes into rather than by the document — because pasting is done a file at
     a time, and two documents share data/items.js and two more data/world.js. */
  bench() {
    const rows = Mode.changes();
    if (!rows.length) {
      return '<h4>The bench</h4><p class="empty">Nothing on it. Everything here is the game as '
        + 'the files have it.</p>';
    }
    /* Grouped by the FILE rather than by the document, because pasting is done
       a file at a time and two documents share data/items.js while two more
       share data/world.js. */
    const byFile = {};
    rows.forEach(x => { (byFile[x.file] = byFile[x.file] || []).push(x); });
    const HOW = { new: 'made here', edited: 'edited', gone: 'deleted here' };
    /* The bench is the list of what is not in a file yet, so it is the only
       honest place to put the button that puts it there. */
    return '<h4>' + rows.length + ' the files do not have</h4>'
      /* type=button, because the sheet is a <form method="dialog"> and a bare
         button in one submits it — which closes the dialog out from under the
         handler that is about to ask for a folder. */
      + '<div class="btns"><button type="button" data-a="sync">Save to the game files</button>'
      + '<button type="button" data-a="publish">Publish to GitHub'
      + (Repo.ready() ? '' : '…') + '</button></div>'
      + '<div class="note">' + (Sync.can()
        ? 'Writes each table back into data/, whole. You will be asked for the game’s folder once.'
        : 'This browser has no folder picker, so this prepares the finished files — each one as '
          + 'the page was served it with your work spliced in and checked — and hands them to you '
          + 'to drop back into the game’s folder.') + '</div>'
      /* The phone's whole answer, and the only one it has: there is no folder
         to be given and nowhere to put a download. */
      + '<div class="note">' + (Repo.ready()
        ? 'Or straight into <code>' + esc(Repo.label()) + '</code> as one commit, and the site '
          + 'rebuilds itself. <button type="button" class="linky" data-a="forget">Forget the '
          + 'token</button>'
        : 'Or straight into the repository this page was served from, as one commit — which on a '
          + 'phone is the only way there is. It asks for a fine-grained token once.') + '</div>'
      + Object.keys(byFile).sort().map(file => '<div class="pfile"><code>' + esc(file) + '</code></div>'
        + '<ul class="list pickitems">' + byFile[file].map(x =>
          /* A deleted subject has nowhere to go, so it is a line rather than a
             way somewhere — and it still has to be on the list, because taking
             it out of the file is a thing you have to remember to do. */
          '<li' + (x.how === 'gone' ? ' class="dead"'
            : ' data-go="' + esc(x.mode) + '|export|' + esc(x.key) + '"') + '>'
          + '<b>' + esc(x.label) + '</b>'
          + '<em>' + esc(Mode.def(x.mode).label) + ' · ' + esc(HOW[x.how]) + '</em></li>').join('')
        + '</ul>').join('');
  },

  /* Every checker's whole table, errors first. Nine documents' worth of "you
     will find out about this when somebody plays it". */
  faultList(s) {
    const all = s.rows.reduce((a, r) => a.concat(r.faults), []);
    if (!all.length) return '<h4>The check</h4><p class="ok">✓ Nothing wrong anywhere.</p>';
    const by = (lvl) => s.rows.map(r => {
      const list = r.faults.filter(f => f.level === lvl);
      if (!list.length) return '';
      return '<div class="pfile"><svg class="ic"><use href="#i-' + r.icon + '"/></svg>'
        + esc(r.label) + '</div>'
        + '<ul class="faults">' + list.map(f =>
          '<li class="' + lvl + '" data-go="' + esc(f.mode) + '|check|' + esc(f.key || '') + '">'
          + esc(f.msg) + (f.key ? '<em>' + esc(f.key) + '</em>' : '') + '</li>').join('')
        + '</ul>';
    }).join('');
    return (s.errors ? '<h4>' + s.errors + ' broken now</h4>' + by('error') : '')
      + (s.warns ? '<h4>' + s.warns + ' will bite later</h4>' + by('warn') : '');
  }
};

/* ---------------- Find, across all ten ----------------
   Every comparable tool has one box that searches the project. This one had
   ten, each filtering its own list by name and id — so "who mentions the
   kettle", "which caller says that line", "where is that email" could only be
   answered by opening things until you found it. The tool has all of it in
   memory and could never be asked.

   It searches what the EDITOR has rather than what the files have: the sweep
   resumes each subject off the bench first, so a line you typed ten minutes
   ago and walked away from is findable. That is the same call Project.survey()
   makes, and for the same reason — a tool that reports on a version of the
   game that exists nowhere is worse than one that reports nothing. */

const Find = {
  q: '',
  rows: null,

  /* One index per time the sheet is opened, not one per keystroke: it borrows
     and hands back ten documents, which is 60ms — nothing to press a button
     for, far too much to do per character. */
  index() {
    if (this.rows) return this.rows;
    const rows = [];
    Mode.DEFS.forEach(d => {
      const doc = Mode.DOCS[d.k]();
      const ids = Mode.subjectIds(d.k);
      if (!ids.length || !doc.state) return;
      /* A level has to be built to be captured, so it is the one that needs a
         real rebuild on the way past; everything else is a table read. */
      const run = d.k === 'levels' ? () => Doc.rebuild() : () => {};
      Project.sweep(doc, ids, run, key => {
        rows.push({ mode: d.k, key: key, label: Mode.nameOf(d.k, key),
          strings: Array.from(this.strings(doc.state())) });
      });
    });
    this.rows = rows;
    return rows;
  },

  /* Every string in a document's state, which is every word the export would
     write. Walked rather than declared per document: ten bespoke collectors
     would be ten chances to leave a field out, and an eleventh document would be
     unsearchable until somebody remembered. Keys come too — `use: 'kettle'`
     is exactly the sort of thing you are looking for. */
  strings(v, out, depth) {
    /* A Set, and a cap high enough for the biggest document there is. The
       office is three hundred objects and a low cap truncated it long before
       the kettle — a search that silently cannot see the largest level is
       worse than one that says it found nothing. Deduping is what makes that
       affordable: thirty-two workstations contribute one string, not thirty-two. */
    out = out || new Set();
    if (out.size > 3000 || (depth || 0) > 8) return out;
    if (typeof v === 'string') {
      if (v.length > 1) out.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(x => this.strings(x, out, (depth || 0) + 1));
    } else if (v && typeof v === 'object') {
      Object.keys(v).forEach(k => {
        if (typeof v[k] === 'string' && v[k].length > 1) out.add(k + ': ' + v[k]);
        else this.strings(v[k], out, (depth || 0) + 1);
      });
    }
    return out;
  },

  hits() {
    const q = this.q.trim().toLowerCase();
    if (q.length < 2) return [];
    const out = [];
    this.index().forEach(r => {
      if (out.length > 200) return;
      const inName = (r.label + ' ' + r.key).toLowerCase().indexOf(q) >= 0;
      const line = r.strings.filter(s => s.toLowerCase().indexOf(q) >= 0)[0];
      if (!inName && !line) return;
      out.push({ mode: r.mode, key: r.key, label: r.label, line: line || null });
    });
    return out;
  },

  box() {
    return '<input class="pickfind findbox" type="search" value="' + esc(this.q)
      + '" placeholder="Find anything — a line, a name, a use" aria-label="Find across the whole game">';
  },

  render(host, api) {
    const hits = this.hits();
    const byMode = {};
    hits.forEach(h => { (byMode[h.mode] = byMode[h.mode] || []).push(h); });
    /* The snippet is trimmed around the match rather than from the start of
       the line: a node's text can be a paragraph, and the half you are looking
       for is rarely the first forty characters of it. */
    const snip = line => {
      if (!line) return '';
      const at = line.toLowerCase().indexOf(this.q.trim().toLowerCase());
      const from = Math.max(0, at - 24);
      const cut = line.slice(from, from + 90).replace(/\s+/g, ' ');
      return (from ? '…' : '') + cut + (line.length > from + 90 ? '…' : '');
    };
    host.innerHTML = this.box()
      + (hits.length
        ? '<div class="picklist">' + Mode.DEFS.filter(d => byMode[d.k]).map(d =>
          '<div class="pfile"><svg class="ic"><use href="#i-' + d.icon + '"/></svg>'
          + esc(d.label) + ' · ' + byMode[d.k].length + '</div>'
          + '<ul class="list pickitems">' + byMode[d.k].map(h =>
            '<li class="findrow" data-go="' + esc(h.mode) + '|inspect|' + esc(h.key) + '">'
            + '<b>' + esc(h.label) + '</b>'
            + (h.line ? '<em>' + esc(snip(h.line)) + '</em>' : '') + '</li>').join('')
          + '</ul>').join('') + '</div>'
        : '<p class="empty">' + (this.q.trim().length < 2
          ? 'Two letters and it starts looking.'
          : 'Nothing anywhere says “' + esc(this.q) + '”.') + '</p>');
    Project.wire(host, api);
  },

  /* The box redraws the sheet as you type, so it has to put the caret back and
     it must not rebuild the index. Same call the picker's own filter makes. */
  wire(host, api) {
    const box = host.querySelector('.findbox');
    if (!box) return;
    box.oninput = () => {
      const at = box.selectionStart;
      this.q = box.value;
      api.redraw();
      const now = Ask.el.querySelector('.findbox');
      if (now) { now.focus(); try { now.setSelectionRange(at, at); } catch (_) { /* not a text input */ } }
    };
  }
};
