'use strict';
/* ---------------- Starting the editor ----------------
   Not Boot.init(), which starts a shift (NPCs, input, save, clock). The
   editor needs only the renderer and builder, so editor.html does not load
   engine/boot.js. All the data is present; the simulation does not run. */

const Ed = {
  /* Anything thrown during start-up is put on the page. */
  init() {
    document.title = GAME.title + ' · Editor';
    { const b = $('#edBrandName'); if (b) b.textContent = GAME.title; }
    try { this.boot(); }
    catch (e) {
      console.error(e);
      this.died(e);
    }
  },
  died(e) {
    const box = document.createElement('div');
    box.id = 'edDead';
    box.innerHTML = '<h2>The editor did not start.</h2>'
      + '<p>' + esc((e && e.message) || String(e)) + '</p>'
      + '<pre>' + esc(((e && e.stack) || '').split('\n').slice(0, 6).join('\n')) + '</pre>'
      + '<p class="hint">The game itself is unaffected — this page is a tool and '
      + 'nothing the game loads comes from it.</p>';
    document.body.appendChild(box);
  },
  boot() {
    /* Ids onto the catalogue entries, exactly as the game does — Doc and the
       link checks both read def.id. */
    Levels.init();
    /* The art. Both are <img> loads that resolve whenever they resolve; the
       renderer falls back to emoji until they do, and so does the game. */
    Sprites.load(); Tiles.load();
    /* Nobody is baked: the preview composes the cast from the same components the game does. */
    Look.dressCast();

    Ask.init();
    View.init();

    /* Whichever level the URL asks for, so a bookmark is a level. */
    const want = new URLSearchParams(location.search).get('level');
    this.open(LEVELS[want] ? want : Levels.ids()[0], true);

    Tools.init();

    /* The other documents load up front: a mode switch must not fail, and
       cross-document checks need everything present. */
    Jobs.load(Jobs.ids()[0]);
    Talk.load(Talk.ids()[0]);
    Zones.load(Zones.ids()[0]);
    Office.load(Office.ids()[0]);
    Prog.load(Prog.ids()[0]);
    Calls.load(Calls.ids()[0]);
    /* The arcade registers its games from catalogue(), as the game does. */
    Arcade.init();
    if (Games.ids().length) Games.load(Games.ids()[0]);
    /* Doc.rebuild() in open() has already indexed the kinds. */
    Things.load(Things.ids()[0]);

    Side.init();
    this.kindList();
    /* Now that the walk has been made, the job checks can resolve an `{ obj }`
       target, and the dialogue checks can be run at all. */
    JobCheck.run();
    TalkCheck.run();
    ThingCheck.run();
    ZoneCheck.run();
    OfficeCheck.run();
    ProgCheck.run();
    CallCheck.run();
    GameCheck.run();
    Mode.buttons();
    Mode.tabs();
    /* Now everything is loaded, take the list of what the files have. Anything
       that appears after this was made here and has never been exported. */
    Mode.noteWhatIsOnFile();
    /* Fit again now the panel and dock exist, since the chrome they cover is
       measured off the real elements. */
    View.fit();
    requestAnimationFrame(View.loop);
    /* Last, and asked rather than applied: a bench kept from an earlier session
       may sit beside a data/ file somebody has edited since. */
    Bank.offer();
  },

  /* Load a level and point the camera at it. `first` marks the page's first
     level. */
  open(id, first) { this.load(id, first); },
  load(id, first) {
    Doc.stash();                         /* keep the level you are walking away from */
    if (!Doc.load(id)) return;
    Doc.resume();                        /* and take back anything kept for this one */
    Doc.rebuild();

    /* Stand the player on the first arrival point: the wall fade reads P.y, and
       seeing where a shift begins matters. */
    const e = Doc.entries.start || Object.values(Doc.entries)[0] || [1.5, 1.5];
    P.x = e[0] * TILE; P.y = e[1] * TILE;
    /* Nobody is at work in the editor. NPCM.list is presence, and an empty list
       is the whole of "this level has no one standing on it". */
    NPCM.list = [];

    Sel.kind = null; Sel.i = -1; Sel.name = null;
    View.fit();

    /* A bookmark is a level. A sandboxed frame refuses replaceState; that is fine. */
    try {
      const url = new URL(location.href);
      url.searchParams.set('level', id);
      history.replaceState(null, '', url);
    } catch (_) { /* no addressable URL here; carry on */ }

    if ($('#edSubject') && Mode.id === 'levels') $('#edSubject').value = id;
    if (!first) Side.refresh();
  },

  /* A blank level, in memory only until exported: one room inset a tile so it
     has walls. */
  newLevel() {
    Ask.form('A new level', [
      { k: 'id', label: 'id', value: '', hint: 'how the catalogue keys it, e.g. carPark' },
      { k: 'name', label: 'name', value: '', hint: 'what the game calls it on screen' },
      { k: 'w', label: 'width', value: 24 },
      { k: 'h', label: 'height', value: 18 },
      { k: 'indoors', label: 'indoors', value: 'yes', options: ['yes', 'no'] },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (LEVELS[id]) { Side.say('There is already a level called ' + id + '.'); return; }
      const w = clamp(parseInt(v.w, 10) || 24, 6, 200);
      const h = clamp(parseInt(v.h, 10) || 18, 6, 200);
      LEVELS[id] = {
        id: id, name: v.name || id, w: w, h: h,
        indoors: v.indoors !== 'no',
        rooms: [{ z: 'main', r: [1, 1, w - 2, h - 2] }],
        doors: [], counters: [],
        entries: { start: [1.5, 1.5] },
        links: [],
        furnish() { /* nothing in it yet */ }
      };
      Side.levelOptions();
      this.load(id);
      Side.show('level');
      Side.say('Created ' + id + '. It lives in this tab only — export it when it is ready.');
    });
  },

  /* A copy of the level as it is now, from the doc (flattened, with its own
     floor plan). */
  duplicateLevel() {
    Ask.form('Duplicate ' + Doc.name, [
      { k: 'id', label: 'new id', value: Doc.id + 'Copy', hint: 'how the catalogue keys it' },
      { k: 'name', label: 'name', value: Doc.name + ' (copy)' },
    ], 'Duplicate').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (LEVELS[id]) { Side.say('There is already a level called ' + id + '.'); return; }
      const objects = clone(Doc.objects).map(o => { delete o._k; return o; });
      const desks = clone(Doc.desks);
      /* The mass the furnish put back (Doc.load()). */
      const mass = clone(Doc.mass || []), carved = clone(Doc.carved || []);
      /* Fields from Doc.def(), the one definition of a level document. */
      const src = Doc.def();
      const copy = {};
      Object.keys(src).forEach(k => { if (k !== 'furnish') copy[k] = clone(src[k]); });
      copy.id = id;
      copy.name = v.name || id;
      /* Deliberately not `hub`. There is one hub, it is the level with twenty
         colleagues and the waypoint table on it, and a second one claiming to
         be it would be pinned in the cache for ever. */
      delete copy.hub;
      copy.furnish = function () {
        mass.forEach(t => { this.solid[t[1]][t[0]] = 1; });
        carved.forEach(t => { this.solid[t[1]][t[0]] = 0; });
        objects.forEach(o => this.add(clone(o)));
        this.desks = clone(desks);
      };
      LEVELS[id] = copy;
      Side.levelOptions();
      this.load(id);
      Side.show('level');
      Side.say('Copied to ' + id + '. It lives in this tab only — export it when it is ready.');
    });
  },

  /* Out of the catalogue, and out of the level cache with it — a level left in
     the cache is one Levels.go() would still happily load. In this tab only:
     data/levels.js is not ours to write. */
  deleteLevel() {
    const id = Doc.id;
    const others = Levels.ids().filter(x => x !== id);
    if (!others.length) { Side.say('This is the only level there is.'); return; }
    const pointing = Levels.ids().filter(x => x !== id)
      .filter(x => (LEVELS[x].links || []).some(l => l.to === id));
    Ask.confirm('Delete ' + Doc.name + '?',
      'It goes from this tab\u2019s catalogue, with every change you have made to it. '
      + 'data/levels.js is untouched, so a reload brings it back exactly as it was'
      + (pointing.length ? ' — but ' + pointing.join(', ') + ' still links to it.' : '.'),
      'Delete it').then(yes => {
      if (!yes) return;
      delete LEVELS[id];
      Levels.cache.delete(id);
      Doc.forget(id);
      Side.levelOptions();
      this.load(others[0]);
      Side.say('Deleted ' + id + ' from this tab.');
    });
  },

  revert() {
    if (!Doc.changed()) { Side.say('Nothing to revert.'); return; }
    Ask.confirm('Revert ' + Doc.name + '?',
      'Every change since you opened it goes, including anything undo would have brought back.',
      'Throw them away').then(yes => {
      if (!yes) return;
      /* Off the bench as well as out of the doc, or walking away and coming
         back would put the reverted level straight back. */
      Doc.forget();
      Doc.load(Doc.id);
      Doc.rebuild();
      Sel.kind = null;
      Side.say('Reverted.');
      Side.refresh();
    });
  },

  /* Every `kind` in use, for autocomplete: FURN's and label-only ones. */
  kindList() {
    const kinds = new Set(Object.keys(FURN));
    Palette.items.forEach(it => kinds.add(it.kind));
    const dl = document.createElement('datalist');
    dl.id = 'edKinds';
    dl.innerHTML = Array.from(kinds).sort().map(k => '<option value="' + esc(k) + '">').join('');
    document.body.appendChild(dl);
  }
};

/* A tab you are about to lose work in should say so. The doc lives in memory
   and nowhere else — there is no autosave, on purpose: the output of this tool
   is source you paste, not a file it owns. */
window.addEventListener('beforeunload', e => {
  if (!Mode.anyChanged()) return;
  e.preventDefault();
  e.returnValue = '';
});

/* A host that injects this page may finish parsing before the scripts run. */
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => Ed.init());
else Ed.init();
