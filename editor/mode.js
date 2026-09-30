'use strict';
/* ---------------- Ten documents, one shell ----------------
   A level, a job, a person, a kind of object, a kind of room, the day, the
   rewards, the call, a sheet of art and a minigame. They share a bar, undo,
   an inspector panel, a phone bottom sheet, an Export tab and a Check tab, so
   one shell holds ten documents with a switch between them. Each follows the
   level editor's pattern:
     the workspace is what you browse (the map, the jobs, the nodes)
     the panel inspects what you picked
     the check reads invariants nothing else reads
     the export is the source; Sync writes it into the file
   `Mode.doc()` lets shared controls ask for the current document.
   `Mode.changes()` is what the files do not have yet, and the list Sync
   writes back (editor/apply.js). */

const Mode = {
  id: 'levels',

  DEFS: [
    { k: 'levels', label: 'Levels', icon: 'levels', subject: 'Level',
      file: 'data/levels.js',
      blurb: 'The building. A map you draw on, previewed with the game’s own renderer.',
      tabs: ['inspect', 'check', 'palette', 'level', 'export'] },
    { k: 'jobs', label: 'Jobs', icon: 'jobs', subject: 'Job',
      file: 'data/items.js',
      blurb: 'The quests: their steps, what the tracker points at for each one, and what it pays.',
      tabs: ['inspect', 'check', 'export'] },
    /* "People": who somebody is (desk, colour, day) lives with what they say. */
    { k: 'talk', label: 'People', icon: 'talk', subject: 'Person',
      file: 'data/npcs.js',
      blurb: 'Who everybody is, where they sit, the day they walk, and every word they say.',
      tabs: ['inspect', 'read', 'check', 'export'] },
    /* And the other half of the same idea: an object is a placement, a FURN
       entry and an act, in three files, joined by strings nobody checks. */
    { k: 'things', label: 'Objects', icon: 'things', subject: 'Kind',
      file: 'data/world.js',
      blurb: 'How a kind is furnished, what pressing it does, and everywhere it stands.',
      tabs: ['inspect', 'check', 'export'] },
    /* Art is brought in rather than authored: sliced, named and exported as a
       manifest entry, used by objects and people. */
    /* The call: four tables in data/callers.js edited together, since moves,
       tells and callers are written against each other. */
    /* What a room is made of, as opposed to where its walls are. */
    { k: 'zones', label: 'Rooms', icon: 'room', subject: 'Room type',
      file: 'data/world.js',
      blurb: 'What a room is made of — its floor, its walls and its light. How the game looks.',
      tabs: ['inspect', 'check', 'export'] },
    /* What the player earns, carries, buys and unlocks, with checks nothing else
       can make (reachable achievements, skills that do something). */
    /* What happens to you: events, chat, inbox, opening and endings, all on a
       clock. */
    { k: 'office', label: 'The day', icon: 'day', subject: 'Part of the day',
      file: 'data/office.js',
      blurb: 'Events, chat, email, the opening and the endings — everything on the shift clock.',
      tabs: ['inspect', 'check', 'export'] },
    { k: 'prog', label: 'Rewards', icon: 'prog', subject: 'Reward',
      file: 'data/items.js',
      blurb: 'Items, shops, skills and achievements — and whether each can be earned at all.',
      tabs: ['inspect', 'check', 'export'] },
    { k: 'calls', label: 'Calls', icon: 'calls', subject: 'Phones',
      file: 'data/callers.js',
      blurb: 'Callers, moves, tells and bosses — the fight at the other end of the phone.',
      tabs: ['inspect', 'check', 'export'] },
    { k: 'art', label: 'Art', icon: 'art', subject: 'Sheet',
      file: 'art/sprites/manifest.js',
      blurb: 'Bring a tileset or a character sheet in, slice it, and check its licence.',
      tabs: ['inspect', 'check', 'export'] },
    /* The arcade is a library: host and games know nothing of each other, so the
       declarations joining them (pads, registration, cabinets) are checked here.
       Its subject is a file, so its export is one. */
    { k: 'games', label: 'Arcade', icon: 'arcade', subject: 'Minigame',
      file: 'minigames/*.js',
      blurb: 'The minigames: what each declares, which buttons a thumb gets, and what opens it.',
      tabs: ['inspect', 'check', 'export'] },
  ],
  def(k) { return this.DEFS.find(d => d.k === (k || this.id)); },

  /* The ten documents, and the ten checkers that go with them. Nothing else on
     the page needs to know which is which — and this table, rather than a list
     written out beside it, is what stopped the tenth being left out of the
     count of unexported work the day it arrived. */
  DOCS: { levels: () => Doc, jobs: () => Jobs, talk: () => Talk, things: () => Things,
    zones: () => Zones, calls: () => Calls, prog: () => Prog, office: () => Office,
    art: () => Art, games: () => Games },
  CHECKERS: { levels: () => Check, jobs: () => JobCheck, talk: () => TalkCheck,
    things: () => ThingCheck, zones: () => ZoneCheck, calls: () => CallCheck,
    prog: () => ProgCheck, office: () => OfficeCheck, art: () => ArtCheck,
    games: () => GameCheck },
  doc() { return this.DOCS[this.id](); },
  checker() { return this.CHECKERS[this.id](); },
  /* What the subject select offers, and what the current one is called. */
  subjects() {
    return this.id === 'games' ? Games.ids().map(id => [id, Games.label(id)])
      /* A composed level is assembled (composeLevel() in data/world.js), so only
         its parts are listed for editing. */
      : this.id === 'levels' ? Levels.ids().filter(id => !LEVELS[id].composed).map(id => [id, LEVELS[id].name || id])
      : this.id === 'jobs' ? Jobs.ids().map(id => [id, QUESTS[id].n || id])
        : this.id === 'art' ? Art.sheets.map(s => [s.id, s.credit.name || s.id])
          : this.id === 'things' ? Things.ids().map(k => [k, k])
            : this.id === 'zones' ? Zones.ids().map(id => [id, (ZONES[id] || {}).name || id])
              : this.id === 'office' ? Office.groups().reduce((a, g) => a.concat(g.items), [])
                : this.id === 'prog' ? Prog.groups().reduce((a, g) => a.concat(g.items), [])
                : this.id === 'calls' ? Calls.groups().reduce((a, g) => a.concat(g.items), [])
              : Talk.ids().map(id => [id, (Talk.person(id) || {}).name || id]);
  },
  /* Four tables behind one select, which is what <optgroup> is for. Only the
     call editor has them; everything else is one flat list and says so by
     returning null. */
  subjectGroups() {
    return this.id === 'calls' ? Calls.groups() : this.id === 'prog' ? Prog.groups()
      : this.id === 'office' ? Office.groups() : null;
  },
  /* What the subject select shows; a document may key subjects as `kind:id`. */
  current() { const d = this.doc(); return d.key ? d.key() : d.id; },
  title() {
    return this.id === 'games' ? (Games.it ? (Games.it.name || Games.id) : (Games.id || 'nothing'))
      : this.id === 'levels' ? Doc.name : this.id === 'jobs' ? Jobs.n
      : this.id === 'art' ? ((Art.sheet() || {}).id || 'nothing')
        : this.id === 'things' ? (Things.id || 'nothing')
          : this.id === 'zones' ? ((Zones.z || {}).name || Zones.id || 'nothing')
            : this.id === 'office' ? Office.label(Office.key())
              : this.id === 'prog' ? Prog.label(Prog.kind, Prog.id)
              : this.id === 'calls' ? Calls.label(Calls.kind, Calls.id) : Talk.name;
  },

  /* ---- switching ----
     A mode switch keeps every document loaded and edited; only changing subject
     could lose work, and that goes through Ed.open. */
  set(k) {
    if (!this.def(k) || k === this.id) return;
    Pop.close();
    this.id = k;
    $('#app').dataset.mode = k;
    this.buttons();
    this.subjectOptions();
    this.tabs();
    /* The map has been sitting there not being drawn. Its size may have changed
       underneath it, and the camera measures the chrome off real elements. */
    if (k === 'levels' && R.cv) { R.resize(); View.measure(); View.clamp(); }
    Side.refresh();
  },
  buttons() {
    document.querySelectorAll('#edModes button').forEach(b =>
      b.classList.toggle('on', b.dataset.mode === this.id));
    this.what();
  },

  /* ---- what you are editing ----
     The phone's bar: mode and subject, on two lines. */
  what(bench) {
    const el = $('#edPick');
    if (!el) return;
    const d = this.def();
    const name = this.title() || '—';
    el.querySelector('.w-i use').setAttribute('href', '#i-' + d.icon);
    el.querySelector('.w-k').textContent = d.label;
    el.querySelector('.w-n').textContent = name;
    /* A dot when the subject differs from the file. */
    const rows = bench || this.changes();
    const here = this.current();
    el.classList.toggle('dirty', rows.some(c => c.mode === this.id && c.key === here));
    el.title = d.label + ' · ' + name + ' — press to change';
    el.setAttribute('aria-label', el.title);
  },

  /* ---- the picker ----
     Modes as named tiles and subjects as a filtered list, in one sheet. Picking
     a mode redraws the list in place. */
  pick() {
    Ask.picker('What are you editing?', (host, api) => {
      const d = this.def();
      const doc = this.doc();
      const groups = this.subjectGroups()
        || [{ label: null, items: this.subjects() }];
      const n = groups.reduce((a, g) => a + g.items.length, 0);
      const cur = this.current();
      /* Edited subjects are marked here, the one place all are listed. */
      const edited = doc.editedKeys ? doc.editedKeys() : [];
      const row = ([id, label]) => '<li data-s="' + esc(id) + '"'
        + (id === cur ? ' class="on"' : '') + '><b>' + esc(label) + '</b>'
        + (edited.indexOf(id) >= 0 ? '<span class="edited" title="edited, not exported">•</span>' : '')
        + '</li>';
      const bench = this.changes().length;
      host.innerHTML = '<div class="pickmodes">'
        + this.DEFS.map(m => {
          const md = this.DOCS[m.k]();
          const n = md.editedKeys ? md.editedKeys().length : 0;
          return '<button type="button" data-m="' + m.k + '"'
            + (m.k === this.id ? ' class="on"' : '') + ' title="' + esc(m.blurb) + '">'
            + '<svg class="ic"><use href="#i-' + m.icon + '"/></svg>'
            + '<span>' + esc(m.label) + '</span>'
            + (n ? '<span class="edited">•</span>' : '') + '</button>';
        }).join('')
        + '</div>'
        /* The way out of "what am I editing" and into "what state is any of it
           in" — one press from the control every screen has. */
        + '<button type="button" class="pickall">'
        + '<svg class="ic"><use href="#i-all"/></svg>'
        + '<span>The whole game<small>' + (bench
          ? bench + ' edited and not exported' : 'what every check found') + '</small></span>'
        + '</button>'
        + '<p class="pickblurb">' + esc(d.blurb) + '</p>'
        + '<h4>' + esc(d.subject) + '</h4>'
        /* A filter earns its line at about a screenful. Below that it is a box
           to tab past on the way to a list you can already see all of. */
        + (n > 8 ? '<input class="pickfind" type="search" placeholder="Type to filter" '
          + 'aria-label="Filter the list">' : '')
        /* The tiles and the filter stay put and only the list scrolls: a filter
           that scrolls off the top of what it is filtering is a filter you have
           to go back up for. */
        + '<div class="picklist">'
        + groups.map(g => (g.label ? '<h4>' + esc(g.label) + '</h4>' : '')
          + '<ul class="list pickitems">' + g.items.map(row).join('') + '</ul>').join('')
        /* The same words the select's own last option uses. Art is the one
           subject you do not make up: you bring it in from outside. */
        + '<div class="btns"><button type="button" class="picknew">'
        + (this.id === 'art' ? '+ Import a sheet…' : '+ New ' + esc(d.subject.toLowerCase()) + '…')
        + '</button>'
        + (this.id === 'art' ? ''
          : '<button type="button" class="pickdup">One like this one…</button>')
        + '</div>'
        + '</div>';

      host.querySelectorAll('[data-m]').forEach(b => {
        b.onclick = () => { this.set(b.dataset.m); api.redraw(); };
      });
      host.querySelectorAll('[data-s]').forEach(li => {
        li.onclick = () => { api.close(); this.openSubject(li.dataset.s); };
      });
      host.querySelector('.picknew').onclick = () => { api.close(); this.create(); };
      const dup = host.querySelector('.pickdup');
      if (dup) dup.onclick = () => { api.close(); this.duplicate(); };
      host.querySelector('.pickall').onclick = () => Project.show();
      const find = host.querySelector('.pickfind');
      /* Filtered in place, keeping focus; empty sections hide their heading. */
      if (find) find.oninput = () => {
        const q = find.value.trim().toLowerCase();
        host.querySelectorAll('.pickitems').forEach(ul => {
          let shown = 0;
          ul.querySelectorAll('[data-s]').forEach(li => {
            const hit = !q || li.textContent.toLowerCase().indexOf(q) >= 0;
            li.hidden = !hit;
            if (hit) shown++;
          });
          const h = ul.previousElementSibling;
          if (h && h.tagName === 'H4') h.hidden = !shown;
        });
      };
    });
  },
  /* Which tabs apply is a property of the mode; the others are hidden. */
  tabs() {
    const on = this.def().tabs;
    document.querySelectorAll('#edTabs button[data-tab]').forEach(b => {
      b.hidden = on.indexOf(b.dataset.tab) < 0;
    });
    /* Folded stays folded across a mode switch: you asked for another
       document, not for the panel. */
    if (on.indexOf(Side.tab) < 0) Side.show(on[0], true);
  },
  subjectOptions() {
    const sel = $('#edSubject');
    if (!sel) return;
    const d = this.def();
    sel.setAttribute('aria-label', d.subject);
    $('#edSubjectLbl').firstChild.nodeValue = d.subject + ' ';
    const groups = this.subjectGroups();
    const opt = ([id, name]) => '<option value="' + esc(id) + '">' + esc(name) + '</option>';
    sel.innerHTML = (groups
      ? groups.map(g => '<optgroup label="' + esc(g.label) + '">'
        + g.items.map(opt).join('') + '</optgroup>').join('')
      : this.subjects().map(opt).join(''))
      + '<option value="__new__">'
      + (this.id === 'art' ? '+ Import a sheet…' : '+ New ' + esc(d.subject.toLowerCase()) + '…')
      + '</option>';
    /* Art may have no subjects; the select then shows "import one". */
    sel.value = this.current() || '__new__';
  },

  /* Load a subject. Levels go through Ed.open (camera and map). Leaving a
     subject keeps it on the bench, so nothing is asked. */
  openSubject(id, first) {
    if (this.id === 'levels') { Ed.open(id, first); return; }
    this.loadSubject(id);
  },
  loadSubject(id) {
    const doc = this.doc();
    doc.stash();                         /* keep what is on the bench */
    if (!doc.load(id)) return;
    doc.resume();                        /* and take back anything kept for this one */
    Sel.kind = null; Sel.i = -1; Sel.name = null;
    doc.rebuild();
    this.subjectOptions();
    /* Choosing a subject shows the panel (folded on a phone). Levels never come
       here: the map is the subject. */
    Side.show(Side.tab);
  },

  /* "+ New …" in the subject list, which is the same decision as picking one. */
  create() {
    if (this.id === 'levels') Ed.newLevel();
    else if (this.id === 'jobs') JobMake.create();
    else if (this.id === 'art') $('#edFile').click();
    else if (this.id === 'things') ThingsMake.create();
    else if (this.id === 'zones') ZonesMake.create();
    else if (this.id === 'office') OfficeMake.create();
    else if (this.id === 'prog') ProgMake.create();
    else if (this.id === 'calls') CallsMake.create();
    else if (this.id === 'games') GamesMake.create();
    else TalkMake.create();
  },
  /* ---- one like this one ----
     Duplicate the working version of the subject, to fork what you are looking
     at. Art is excluded. */
  DUP: {
    jobs: (to, name) => { QUESTS[to] = Object.assign(Jobs.defFrom(Jobs), { n: name }); },
    talk: (to, name) => {
      const s = Talk.state();
      NPCS.push({ id: to, name: name, role: s.role, face: s.face, desk: clone(s.desk),
        colour: s.colour, schedule: clone(s.schedule), lines: clone(s.lines),
        nodes: clone(s.nodes) });
      Writing._index = null;
    },
    things: (to) => { Things.keep(); FURN[to] = clone(Things.furn || { size: 24 }); Things.build(); },
    zones: (to, name) => { Zones.keep(); ZONES[to] = Object.assign(clone(Zones.z), { name: name }); },
    prog: (to, name) => {
      const t = Prog.def().table();
      t[to] = Object.assign(clone(Prog.it), Prog.kind === 'shop' ? { title: name } : { n: name });
    },
    calls: (to, name) => {
      const d = Calls.def();
      const copy = Object.assign(clone(Calls.it), { id: to });
      if (Calls.kind === 'caller' || Calls.kind === 'move') copy.n = copy.name = undefined;
      if (Calls.kind === 'caller') copy.name = name;
      else if (Calls.kind === 'move') copy.n = name;
      else if (Calls.kind === 'boss') copy.title = name;
      if (d.arr) d.table().push(copy); else d.table()[to] = copy;
    },
    /* A minigame copy includes its code, registered in this tab only. */
    games: (to, name) => {
      const A = Games.live(); if (!A) return;
      const copy = Object.assign({}, A.def(Games.id), Games.it,
        { id: to, name: name });
      Object.keys(Games.code).forEach(k => { copy[k] = A.def(Games.id)[k]; });
      A.register(copy);
      Writing._index = null;
    },
    office: (to, name) => {
      if (Office.kind === 'event') EVENTS.push(Object.assign(clone(Office.it), { id: to, t: name }));
      else if (Office.kind === 'ending') ENDINGS[to] = Object.assign(clone(Office.it), { t: name });
      else if (Office.kind === 'mail') MAIL_SCRIPT.push(Object.assign(clone(Office.it), { s: name }));
      /* A thread is its rows, so a duplicate is every row re-addressed — to
         the new channel for a chat, to the new sender for a text, because the
         sender IS the thread there. */
      else if (Office.kind === 'text') TEXT_SCRIPT.push.apply(TEXT_SCRIPT,
        (Office.list() || []).map(c => Object.assign(clone(c), { who: to })));
      else CHAT_SCRIPT.push.apply(CHAT_SCRIPT,
        (Office.list() || []).map(c => Object.assign(clone(c), { c: to })));
    },
  },
  /* Where the copy ends up in the subject list, which is not always its id:
     three documents key themselves by `kind:id`, and one is an array whose new
     entry goes on the end. */
  dupKey(id) {
    return this.id === 'prog' ? Prog.kind + ':' + id
      : this.id === 'calls' ? Calls.kind + ':' + id
        : this.id === 'office'
          ? (Office.kind === 'mail' ? 'mail:' + (MAIL_SCRIPT.length - 1)
            : (Office.kind === 'chat' || Office.kind === 'text') ? Office.kind + ':' + id
              : Office.kind + ':' + id)
          : id;
  },
  duplicate() {
    if (this.id === 'levels') { Ed.duplicateLevel(); return; }
    if (this.id === 'art') {
      Side.say('A sheet is somebody else’s pixels — import it again rather than copying it.');
      return;
    }
    const d = this.def();
    const dup = this.DUP[this.id];
    if (!dup || !this.current()) return;
    const bare = String(this.current()).split(':').pop();
    const chat = this.id === 'office' && Office.kind === 'chat';
    Ask.form('One like ' + this.title(), [
      { k: 'id', label: chat ? 'channel' : 'new id', value: bare + (chat ? '2' : 'Copy'),
        hint: 'how the table keys it' },
      { k: 'n', label: 'called', value: this.title() + ' (copy)' },
    ], 'Duplicate').then(v => {
      if (!v || !v.id) return;
      const id = chat ? (v.id[0] === '#' ? v.id : '#' + v.id.replace(/[^\w-]/g, ''))
        : v.id.replace(/[^\w$]/g, '');
      if (!id || (!chat && /^\d/.test(id))) { Side.say('An id has to be a usable property name.'); return; }
      if (this.subjectIds(this.id).indexOf(this.dupKey(id)) >= 0) {
        Side.say('There is already a ' + d.subject.toLowerCase() + ' called ' + id + '.');
        return;
      }
      dup(id, v.n || id);
      this.openSubject(this.dupKey(id));
      Side.say('Copied to ' + id + '. It is in this tab only — the export is what puts it in the file.');
    });
  },

  revert() {
    if (this.id === 'art') { Side.say('An imported sheet is reverted by forgetting it.'); return; }
    /* Off the bench as well, whatever the mode's own revert does — otherwise
       walking away and coming back puts the reverted edits straight back. */
    this.doc().forget();
    if (this.id === 'things') {
      Ask.confirm('Put FURN back?',
        'Every change to every kind goes, not only this one — FURN is one table and the level is '
        + 'built from it.', 'Put it back').then(yes => {
        if (!yes) return;
        Things.restore_all();
        Things.load(Things.id);
        Doc.rebuild();
        Side.say('FURN is as data/world.js has it.');
        Side.refresh();
      });
      return;
    }
    if (this.id === 'levels') { Ed.revert(); return; }
    /* Reverting the arcade restores the whole live CABINETS table, as the object
       and room editors do for FURN and ZONES. */
    if (this.id === 'games') {
      Ask.confirm('Revert ' + this.title() + '?',
        'Everything about this game goes, and so does every cabinet — CABINETS is one table and '
        + 'the arcade is built from it.', 'Throw them away').then(yes => {
        if (!yes) return;
        Games.restore_all();
        Games.load(Games.id);
        Games.rebuild();
        Side.say('Back to what data/items.js and minigames/ have.');
        Side.refresh();
      });
      return;
    }
    const doc = this.doc();
    if (!doc.changed()) { Side.say('Nothing to revert.'); return; }
    Ask.confirm('Revert ' + this.title() + '?',
      'Every change since you opened it goes, including anything undo would have brought back.',
      'Throw them away').then(yes => {
      if (!yes) return;
      doc.load(doc.id);
      doc.rebuild();
      Sel.kind = null;
      Side.say('Reverted.');
      Side.refresh();
    });
  },
  /* ---- what is on the bench, across all ten ----
     Read from DOCS, so a new document is counted automatically. */
  docs() { return Object.keys(this.DOCS).map(k => ({ mode: k, doc: this.DOCS[k]() })); },
  anyChanged() { return this.changes().length > 0; },
  /* ---- what the files have ----
     Snapshotted at boot: a subject invented in this tab compares equal to
     itself, so only this list can tell it is absent from the files. */
  onFile: null,
  /* No argument: everything (boot). A list of modes: only those, after a
     partial save. */
  noteWhatIsOnFile(modes) {
    if (!this.onFile || !modes) {
      this.onFile = {};
      Object.keys(this.DOCS).forEach(k => { this.onFile[k] = this.subjectIds(k); });
      return;
    }
    modes.forEach(k => { this.onFile[k] = this.subjectIds(k); });
  },
  /* Mark these subjects as on file without re-counting the rest of the mode. */
  noteOnFile(mode, keys) {
    if (!this.onFile) return;
    const list = this.onFile[mode] || (this.onFile[mode] = []);
    keys.forEach(k => { if (list.indexOf(k) < 0) list.push(k); });
  },
  subjectIds(mode) {
    const was = this.id;
    this.id = mode;
    try {
      const groups = this.subjectGroups();
      const items = groups ? groups.reduce((a, g) => a.concat(g.items), []) : this.subjects();
      return items.map(x => x[0]);
    } catch (_) {
      return [];
    } finally {
      this.id = was;
    }
  },

  /* Every subject with unexported work (edited, made here or deleted here):
     document, subject, name and destination file. */
  changes() {
    const out = [];
    this.docs().forEach(({ mode, doc }) => {
      const d = this.def(mode);
      const row = (key, how) => out.push({
        mode: mode, key: key, file: d.file, subject: d.subject, how: how,
        label: how === 'gone' ? key : this.nameOf(mode, key),
      });
      const had = (this.onFile && this.onFile[mode]) || [];
      const has = this.onFile ? this.subjectIds(mode) : [];
      const edited = doc.editedKeys ? doc.editedKeys() : [];
      has.forEach(k => { if (had.indexOf(k) < 0) row(k, 'new'); });
      edited.forEach(k => { if (has.indexOf(k) < 0 || had.indexOf(k) >= 0) row(k, 'edited'); });
      had.forEach(k => { if (has.indexOf(k) < 0) row(k, 'gone'); });
    });
    return out;
  },
  /* A subject's display name in any mode (borrows `this.id` and restores it). */
  nameOf(mode, key) {
    const was = this.id;
    this.id = mode;
    try {
      if (mode === was && key === this.current()) return this.title();
      const groups = this.subjectGroups();
      const items = groups ? groups.reduce((a, g) => a.concat(g.items), []) : this.subjects();
      const hit = items.filter(x => x[0] === key)[0];
      return hit ? hit[1] : key;
    } catch (_) {
      return key;
    } finally {
      this.id = was;
    }
  }
};

/* ---------------- Making a kind ----------------
   A kind exists once an object carries it; this adds its FURN entry, so only
   a name is asked. */
const ThingsMake = {
  create() {
    Ask.form('Furnish a new kind', [
      { k: 'kind', label: 'kind', value: '', hint: 'the `kind:` an object will carry' },
    ], 'Add it').then(v => {
      if (!v || !v.kind) return;
      const kind = v.kind.replace(/[^\w$]/g, '');
      if (!kind || /^\d/.test(kind)) { Side.say('A kind has to be a usable property name.'); return; }
      if (FURN[kind]) { Side.say('FURN already furnishes ' + kind + '.'); return; }
      Things.keep();
      FURN[kind] = { size: 24 };
      Things.build();
      Mode.openSubject(kind);
      Side.say('Furnished ' + kind + '. Nothing is of this kind yet — place one with the object '
        + 'tool and give it `kind: ' + kind + '`.');
    });
  }
};

/* ---------------- Making a person ----------------
   Added to NPCS in this tab only: id, name, face and a first node. Schedule,
   desk and colour are set elsewhere. */
const TalkMake = {
  create() {
    Ask.form('A new person', [
      { k: 'id', label: 'id', value: '', hint: 'lower case, e.g. pauline' },
      { k: 'name', label: 'name', value: '' },
      { k: 'face', label: 'face', value: '🧑', hint: 'the emoji in the dialogue box' },
      { k: 'role', label: 'role', value: '', hint: 'the line under the name' },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (Talk.person(id)) { Side.say('There is already somebody called ' + id + '.'); return; }
      NPCS.push({
        id: id, name: v.name || id, face: v.face || '🧑', role: v.role || '',
        desk: [1, 1], colour: '#8d9bb5', schedule: [], lines: [],
        nodes: { again: { text: ['…'] } }
      });
      Mode.openSubject(id);
      Side.say('Created ' + id + '. They have one node and no sprite, no desk and no schedule — '
        + 'those live in the roster and on the floor plan, and the export says so.');
    });
  },
  drop() {
    const id = Talk.id;
    const others = Talk.ids().filter(x => x !== id);
    if (!others.length) { Side.say('This is the only person there is.'); return; }
    Ask.confirm('Delete ' + Talk.name + '?',
      'They go from this tab’s roster, with everything they say. data/npcs.js is untouched, so '
      + 'a reload brings them back exactly as they were.', 'Delete them').then(yes => {
      if (!yes) return;
      const at = NPCS.findIndex(p => p.id === id);
      if (at >= 0) NPCS.splice(at, 1);
      Writing._index = null;             /* the index named their nodes */
      Talk.forget(id);
      Mode.openSubject(others[0]);
      Side.say('Deleted ' + id + ' from this tab.');
    });
  }
};
