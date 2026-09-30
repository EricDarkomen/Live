'use strict';
/* ---------------- Ten documents, one shell ----------------
   The editor edits ten things: a level, a job, what a person says, a kind of
   object, a kind of room, the shape of the day, what you earn, the call itself,
   a sheet of art, and a minigame. They are not ten pages. They share a bar, an
   undo pair, a side panel that inspects whatever is selected, a bottom sheet on
   a phone, an Export tab that is always the deliverable, and a Check tab that
   is always the same promise — so the only honest arrangement is one shell with
   ten documents in it, and a switch that says which.

   The pattern each one follows is the same, and it is the level editor's:

     the WORKSPACE is the thing you browse   (the map · the jobs · the nodes)
     the PANEL inspects what you picked      (an object · a step · a node)
     the CHECK reads invariants nothing else reads
     the EXPORT is the source, and Sync is what puts it in the file for you

   `Mode.doc()` is what makes that work: everything shared — the undo buttons,
   Revert, the identity chip, the tab strip — asks for the current document
   rather than knowing which one it is. And `Mode.changes()` is what makes the
   ten add up: what the files do not have yet is the single most important
   thing about this page, and it is now also the list Sync writes back — see
   editor/apply.js. */

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
    /* "People" rather than "Dialogue": what a colleague IS lives in the same
       entry as what they say — their desk, their colour, the day they walk —
       and every one of those fails silently on its own. Editing them apart was
       editing three files and hoping. */
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
    /* The fourth one is not a document you author so much as one you bring in:
       a tileset or a character sheet, sliced and named here and exported as a
       manifest entry. It is in the same shell because what it produces is used
       by the other three — a named rectangle is what an object draws, and a row
       is what a person is drawn from. */
    /* The call is the game — four tables in data/callers.js that nothing joins
       up. One mode rather than four, because a move is written against the
       tells it answers and a caller against the moves that will be used on it:
       behind separate switches you would be editing each with the others out
       of sight. The subject select groups them. */
    /* What a room is MADE of, as opposed to where its walls are. Everything
       about how a level looks comes from here, which is why a different game
       needs this more than it needs any other mode: you can lay out a new
       building with the level editor and it stays this office, in these
       thirteen greys, until the zones change. */
    { k: 'zones', label: 'Rooms', icon: 'room', subject: 'Room type',
      file: 'data/world.js',
      blurb: 'What a room is made of — its floor, its walls and its light. How the game looks.',
      tabs: ['inspect', 'check', 'export'] },
    /* The other half of a game: what the player earns, carries, buys and
       unlocks. Two of its checks are ones nothing else in the project can ask —
       whether an achievement is reachable at all, and whether a skill does
       anything — and both are invisible in play. */
    /* Everything that happens to you rather than because of you: the events,
       the chat, the inbox, the opening and the endings. All of it on a clock,
       and a time outside the shift is writing nobody ever reads. */
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
    /* The tenth is the odd one and is here because the arcade is a LIBRARY: the
       host knows nothing about any game and no game knows anything about the
       game, which means everything that joins the two is a declaration nothing
       checks. A pad whose key its own game never reads is a dead button on a
       phone and perfect on the desktop it was written on; a registered game
       nothing opens is finished, tested and unreachable. Its subject is a file
       rather than a row in a table, which is why its export is a whole one. */
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
      /* A COMPOSED LEVEL IS NOT DRAWN, IT IS ASSEMBLED — see composeLevel() in
         data/world.js. The island is the town and the outskirts stamped into a
         map with a coast round it, so what you would be editing here is the
         merge: rooms that belong to two other levels, at coordinates neither of
         them uses, which emit.js would then write out as one enormous level and
         somebody would paste over the town. The parts themselves are in this
         list and are what you actually want. */
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
  /* What the subject select should be showing. A document may key itself by
     something other than a bare id — the call editor holds four tables behind
     one list, so its subjects are `kind:id` — and a `current()` that returned
     the bare id set the select to a value none of its options had, which shows
     as an empty box. */
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
     A mode switch is not a document change, so it asks nothing and loses
     nothing: all three documents stay loaded and stay edited. Only leaving one
     SUBJECT for another can lose work, and that is the question Ed.open asks. */
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
     The phone's whole answer to "where am I", and the control that gets you
     somewhere else. Two lines because it is two facts: the mode, which the
     desktop shows as ten labelled buttons, and the subject, which the desktop
     shows in a select wide enough to read. Neither fits a 320px bar as its own
     control, and the version that tried showed an unlabelled icon beside the
     word "CALLH". */
  what(bench) {
    const el = $('#edPick');
    if (!el) return;
    const d = this.def();
    const name = this.title() || '—';
    el.querySelector('.w-i use').setAttribute('href', '#i-' + d.icon);
    el.querySelector('.w-k').textContent = d.label;
    el.querySelector('.w-n').textContent = name;
    /* A dot when what you are looking at is not what the file says — edited,
       or made here and never exported. It is the only thing on a phone's bar
       with room to carry that, and "am I looking at something that is not in
       the game yet" is exactly the question you have while looking at it. */
    const rows = bench || this.changes();
    const here = this.current();
    el.classList.toggle('dirty', rows.some(c => c.mode === this.id && c.key === here));
    el.title = d.label + ' · ' + name + ' — press to change';
    el.setAttribute('aria-label', el.title);
  },

  /* ---- the picker ----
     One sheet holding both halves of that question, because they are asked
     together: you go to the day editor IN ORDER TO open the 4pm email. The
     modes are tiles with their names on — ten icons in a bar is a memory test
     — and the subjects are a filtered list, which is the part a <select> cannot
     do: there are seventy object kinds and forty callers behind that control.

     Choosing a mode redraws the list in place rather than closing, so picking
     the wrong one costs nothing. A mode switch loses no work by construction
     (all ten documents stay loaded and stay edited), which is exactly why it
     can be this cheap. */
  pick() {
    Ask.picker('What are you editing?', (host, api) => {
      const d = this.def();
      const doc = this.doc();
      const groups = this.subjectGroups()
        || [{ label: null, items: this.subjects() }];
      const n = groups.reduce((a, g) => a + g.items.length, 0);
      const cur = this.current();
      /* A subject with work on it says so here, because this list is the one
         place you see every subject of a document at once — and an edit you
         have walked away from is invisible everywhere else. */
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
      /* Filtered in place rather than redrawn: a redraw would take the focus
         out of the box you are typing in. An emptied section hides its own
         heading, or the call editor shows four labels over nothing. */
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
  /* The tab strip is the same five buttons on the page at all times; which of
     them apply is a property of the mode. Hidden rather than rebuilt, so the
     strip cannot end up describing a mode it is not in. */
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
    /* Art starts with nothing in it, which is the one subject list that can be
       empty — and a select whose value is null shows its first option, which
       here is "import one". That is the right thing to be looking at. */
    sel.value = this.current() || '__new__';
  },

  /* Load a subject in the current mode. Levels go through Ed.open, which has a
     camera and a map to move as well; everything else comes straight here.
     Neither asks a question any more — leaving a subject keeps it on the
     document's bench, so there is nothing to lose and nothing to warn about.
     What there IS to say is that you have work on the bench, and that is the
     Changes list's job rather than a modal's. */
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
    /* Choosing a subject is asking to SEE it, and in nine of the ten modes
       the subject is in the panel — which on a phone starts folded away. So
       tapping a job used to highlight its row and leave you looking at the list
       you tapped it from, with its steps behind a fold nothing mentioned. Same
       call Side.show() already makes about choosing a tab. Levels is the
       exception and never comes through here: there the map IS the subject. */
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
     How content actually gets made: the second caller is written by looking at
     the first, the fourth email by looking at the third. Every data editor
     worth the name has this and only the level editor here did — so a new job
     started from an empty form every time, and the shape you were copying was
     in another tab of your head.

     It copies the WORKING version, not the file's: the point is to fork what
     you are looking at. Art is the exception and says so — a sheet is pixels
     somebody else made, and a second copy of it is not a new asset. */
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
    /* A copy of a minigame is a copy of its code as well — the whole point of
       "one like this one" here is to fork a working game and change the half
       that is declarations. Registered in this tab only, like every other
       duplicate, and the export is a whole new file. */
    games: (to, name) => {
      const A = Games.live(); if (!A) return;
      const copy = Object.assign({}, A.def(Games.id), Games.it,
        { id: to, name: name });
      Object.keys(Games.code).forEach(k => { copy[k] = A.def(Games.id)[k]; });
      A.register(copy);
      if (typeof Writing !== 'undefined') Writing._index = null;
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
    /* The arcade writes its cabinets into the live CABINETS, because the game's
       own dialogue reads that table and the point of editing a binding is to be
       able to walk up to the object and find it. So reverting has to put the
       whole table back, not only this game's rows — the same call the object
       and room editors make about FURN and ZONES. */
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
     Anything unexported, anywhere. The tab is lost all at once or not at all.

     This was [Doc, Jobs, Talk, Things, Art] — five of the nine — so an
     afternoon in the day editor, the rooms, the rewards or the calls could be
     closed with the tab asking nothing. It reads the DOCS table now, which is
     the list of documents rather than a copy of it, so a tenth is counted the
     day it exists. */
  docs() { return Object.keys(this.DOCS).map(k => ({ mode: k, doc: this.DOCS[k]() })); },
  anyChanged() { return this.changes().length > 0; },
  /* ---- what the FILES have ----
     Taken once, on the way up, and it is the other half of "unexported".
     `changed()` compares a document against the table it was loaded from, so a
     subject INVENTED in this tab compares equal to itself and reads as
     untouched: you could make a job, a person and a caller, close the tab, and
     nothing would so much as ask. A subject the files have never heard of is
     not changed — it is absent — and only a list taken at boot can tell the
     difference. */
  onFile: null,
  /* With no argument: everything, which is what boot wants. With a list of
     modes: only those, which is what a save that wrote SOME of the game wants —
     re-counting a document this run could not write would quietly forget that a
     level was made here, or that a minigame was deleted here, and the reminder
     to do it by hand would go with it. */
  noteWhatIsOnFile(modes) {
    if (!this.onFile || !modes) {
      this.onFile = {};
      Object.keys(this.DOCS).forEach(k => { this.onFile[k] = this.subjectIds(k); });
      return;
    }
    modes.forEach(k => { this.onFile[k] = this.subjectIds(k); });
  },
  /* These subjects are on file now, and nothing else about their document has
     changed. A level written one at a time needs exactly this: re-counting the
     whole mode would put every OTHER new level on file with it. */
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

  /* Every subject with unexported work on it, as rows something can list:
     which document, which subject, what it is called, and which file the
     export of it lands in. Three ways a subject gets on this list — edited,
     made here, or deleted here — and all three are things the files do not
     know about yet. This is the whole of what closing the tab would cost. */
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
  /* What a subject is called, in any mode rather than only the open one — the
     changes list names subjects from all ten at once, and `q_fridge` is an id
     where "The Great Fridge Incident" is the thing you were working on.
     `subjects()` and `title()` both read `this.id`, so this borrows it and
     hands it straight back; a bare key is the fallback and is never wrong,
     only unhelpful. */
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
   A kind is not created so much as furnished: it exists the moment an object
   carries it, and what this adds is the FURN entry that says how one is drawn.
   Which is why the "new" here asks for a name and nothing else — everything
   about it is on the panel a moment later. */
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
   A new one is added to NPCS in this tab only, exactly like a level or a job.
   It is deliberately the bare minimum: an id, a name, a face and a first node —
   because a person's schedule, desk and colour belong on the floor plan and in
   the roster, and inventing them here would be inventing them twice. */
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
