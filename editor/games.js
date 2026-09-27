'use strict';
/* ---------------- The arcade, which is a library rather than a game ----------
   engine/arcade.js is a host and minigames/*.js are its guests, and the whole
   arrangement rests on declarations that nothing checks:

     pads: [{ code: 'ArrowLeft', … }]   a key the game's own input() has to read
     help: { keys, taps }               BOTH wordings, or one device has no
                                        instructions at all
     Arcade.open('patch')               in an act somewhere, or the game is
                                        registered and unreachable
     Ach.get('a_patched')               an id that has to be in ACHS
     par                                reward() divides by it

   Every one of those fails silently and every one fails differently. A pad
   whose code the game never reads is a button under a thumb that does nothing
   — no error, no console line, just a game that appears broken on a phone and
   is fine on a desktop. A game nothing opens is registered, tested, complete
   and unreachable. `Ach.get` on an id ACHS has never heard of returns quietly.

   This document is where those are answerable. HALF OF A MINIGAME IS CODE —
   start, update, draw, input, reward, hud, summary — and that half is captured
   as SOURCE and carried through verbatim, never regenerated, for exactly the
   reason a procedural furnish(), a dialogue do() and a move's run() are. What
   is EDITED here is the declarations: what it is called, what it says about
   itself, which buttons a thumb gets, what it costs and what it is worth. */

const Games = {
  id: null,
  /* The declarations, as plain data, and the hooks beside them as text. */
  it: null,
  code: null,

  base: null, undoStack: [], redoStack: [],

  /* The fields this editor owns. Everything else on a minigame object is a
     function and belongs to the file. `pads` and `help` are objects rather than
     scalars and are edited through their own rows. */
  FIELDS: ['name', 'icon', 'blurb', 'goal', 'mins', 'par'],
  /* And the cabinets: WHERE the game is installed and what it is wired into.
     A different file (data/items.js) and a different shape — one game can be
     on several objects — so they are held beside the definition rather than
     in it, and exported separately. Written back into the live CABINETS,
     because the game's own dialogue reads that table and the point of editing
     a binding is to be able to walk up to the object and see it. */
  cabs: null,
  /* The hooks, in the order engine/arcade.js documents them, which is also the
     order they run in. The export writes them in this order for the same
     reason the file does: it reads as the life of a round. */
  HOOKS: ['start', 'update', 'draw', 'input', 'hud', 'summary', 'reward', 'stop', 'resized'],

  /* ---- the catalogue ----
     Arcade's own list, which is the game's own declaration of what is in the
     arcade — the same source `Arcade.init()` reads. Asked rather than repeated,
     so a fourth game appears here the day it is registered. */
  live() { return typeof Arcade !== 'undefined' ? Arcade : null; },
  ids() {
    const A = this.live();
    return A ? A.list() : [];
  },
  def(id) {
    const A = this.live();
    return A ? A.def(id === undefined ? this.id : id) : null;
  },
  label(id) {
    const g = this.def(id);
    if (!g) return id;
    return (g.icon ? g.icon + ' ' : '') + (g.name || id);
  },

  /* ---- loading ----
     A capture. Nothing is written back into Arcade.games, the export is the
     deliverable and Revert is a reload — the arrangement Talk and Calls have
     with NPCS and CALLERS, and for the same reason: the half of this that
     matters is code this page must not rewrite. */
  load(id) {
    const g = this.def(id);
    if (!g) return false;
    this.id = id;
    this.it = {}; this.code = {};
    Object.keys(g).forEach(k => {
      if (typeof g[k] === 'function') this.code[k] = String(g[k]);
      else this.it[k] = clone(g[k]);
    });
    /* Normalised on the way in so the panel has rows to draw rather than
       undefined to guard against. Both wordings exist as lists whether the
       game declared them or not — which is also how "this one has no touch
       wording" becomes a fault rather than a missing field. */
    this.it.help = this.it.help || {};
    this.it.help.keys = this.it.help.keys || [];
    this.it.help.taps = this.it.help.taps || [];
    this.it.pads = this.it.pads || [];
    this.cabs = this.table().filter(c => c.game === id).map(c => clone(c));
    this.rebase();
    return true;
  },
  /* The live table, guarded: a page without data/items.js has no cabinets
     rather than a broken mode. */
  table() { return typeof CABINETS !== 'undefined' && Array.isArray(CABINETS) ? CABINETS : []; },
  state() { return clone({ id: this.id, it: this.it, code: this.code, cabs: this.cabs }); },
  restore(s) {
    this.id = s.id; this.it = clone(s.it); this.code = clone(s.code);
    this.cabs = clone(s.cabs);
    this.commit();
  },
  /* Written back into CABINETS, like the object and room editors write into
     FURN and ZONES: the preview here is the GAME — walking up to the object
     and finding the reply — and there is nowhere else for Acts to read it
     from. The file's version is kept so Revert is a real revert. */
  pristine: null,
  keep() { if (!this.pristine) this.pristine = clone(this.table()); },
  commit() {
    const t = this.table();
    if (!t || !this.id) return;
    this.keep();
    for (let i = t.length - 1; i >= 0; i--) if (t[i].game === this.id) t.splice(i, 1);
    (this.cabs || []).forEach(c => t.push(clone(c)));
  },
  /* What data/items.js has for this game, as a state — the baseline `changed()`
     is measured against, because commit() has already written the working copy
     into the live table. Same arrangement Things and Zones have. */
  pristineState() {
    const t = this.pristine || this.table();
    const g = this.def(this.id);
    if (!g) return null;
    const it = {}, code = {};
    Object.keys(g).forEach(k => {
      if (typeof g[k] === 'function') code[k] = String(g[k]); else it[k] = clone(g[k]);
    });
    it.help = it.help || {}; it.help.keys = it.help.keys || []; it.help.taps = it.help.taps || [];
    it.pads = it.pads || [];
    return clone({ id: this.id, it: it, code: code,
      cabs: t.filter(c => c.game === this.id).map(c => clone(c)) });
  },
  restore_all() {
    if (!this.pristine) return;
    const t = this.table();
    t.length = 0;
    this.pristine.forEach(c => t.push(clone(c)));
  },
  rebuild() {
    this.commit();
    GameCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },

  /* ---- editing ---- */
  set(k, v) {
    this.mark('edit ' + k);
    if (v === '' || v === null || v === undefined) delete this.it[k];
    else this.it[k] = v;
    this.rebuild();
  },
  setHelp(which, lines) {
    this.mark('edit ' + (which === 'keys' ? 'keyboard' : 'touch') + ' wording');
    this.it.help[which] = lines.filter(x => x.trim() !== '');
    this.rebuild();
  },
  /* ---- the pads ----
     A pad is a key code and a label, and both halves are load-bearing: the code
     is what the game receives and the label is the only thing a thumb has to go
     on. They are edited as a list because the ORDER is the order they appear
     across the bottom of the screen, left to right, which for a four-lane
     rhythm game is the whole of which pad is which lane. */
  addPad(code, label) {
    this.mark('add a pad');
    this.it.pads.push({ code: code || 'Space', label: label || 'Button' });
    this.rebuild();
  },
  setPad(i, k, v) {
    const pd = this.it.pads[i]; if (!pd) return;
    this.mark('edit pad ' + (i + 1));
    if (v === '') delete pd[k]; else pd[k] = v;
    this.rebuild();
  },
  dropPad(i) {
    if (!this.it.pads[i]) return;
    this.mark('remove pad ' + (i + 1));
    this.it.pads.splice(i, 1);
    this.rebuild();
  },
  movePad(i, d) {
    const to = i + d;
    const list = this.it.pads;
    if (!list[i] || to < 0 || to >= list.length) return;
    this.mark('reorder the pads');
    const [x] = list.splice(i, 1);
    list.splice(to, 0, x);
    this.rebuild();
  },

  /* ---- the cabinets ----
     Installing a game on an object, taking it off again, and saying what
     winning it is wired into. Every one of these is a string join that fails
     silently, which is why the panel offers a list rather than a text box
     wherever there is a known set to choose from. */
  install(use) {
    this.mark('install ' + this.id);
    this.cabs.push({ game: this.id, use: use || 'generic', skill: null, job: null,
      item: null, need: null, t: 'Play ' + (this.it.name || this.id) + '.' });
    this.rebuild();
  },
  setCab(i, k, v) {
    const c = this.cabs[i]; if (!c) return;
    this.mark('edit where ' + this.id + ' is played');
    /* Emptied means empty. An earlier version quietly put 'Play it.' back into
       a blank reply, which papered over the exact state the check exists to
       report — and silently rewriting what somebody typed is worse than
       telling them it is wrong. */
    c[k] = (v === '' || v === undefined) ? null : v;
    this.rebuild();
  },
  uninstall(i) {
    if (!this.cabs[i]) return;
    this.mark('take ' + this.id + ' off ' + this.cabs[i].use);
    this.cabs.splice(i, 1);
    this.rebuild();
  },
  /* Every `use:` handler in the building, which is what a game can be installed
     ON. Asked of the object editor's one walk rather than walked again here. */
  objects() {
    if (typeof Things !== 'undefined' && Things.uses && Things.uses.size) {
      return Array.from(Things.uses.keys()).sort();
    }
    return typeof Acts !== 'undefined' ? Object.keys(Acts).filter(k => k[0] !== '_').sort() : [];
  },
  /* Every skill id, flattened out of the four branches — a skill id is unique
     across all of them, which is what lets a cabinet name one with no branch. */
  skills() {
    if (typeof SKILLS === 'undefined') return [];
    const out = [];
    Object.keys(SKILLS).forEach(b => Object.keys(SKILLS[b].list || {}).forEach(k =>
      out.push([k, SKILLS[b].list[k].n])));
    return out.sort((x, y) => x[1].localeCompare(y[1]));
  },
  jobs() {
    return typeof QUESTS === 'undefined' ? []
      : Object.keys(QUESTS).map(id => [id, QUESTS[id].n || id]);
  },
  items() {
    return typeof ITEMS === 'undefined' ? []
      : Object.keys(ITEMS).map(id => [id, (ITEMS[id].e ? ITEMS[id].e + ' ' : '') + (ITEMS[id].n || id)]);
  },

  /* ---- reading the code ----
     Everything below is a regular expression over captured source, deliberately
     and for the reason editor/writing.js gives at length: the calls being
     looked for are one line with a literal argument, that is the convention
     this codebase writes them in, and a real parser buys nothing but a
     dependency. A call built out of a variable is invisible, which is the
     honest limit and why nothing here is ever reported as "all". */
  /* The whole game as text: every hook, plus every TABLE it declares.

     The tables are not optional here and leaving them out was a bug that
     reported all three of the shipped games' pads as dead. Two of the three
     read their keys through a lookup — `LANE: { KeyD: 0, … }`, `ACT: {
     ArrowLeft: 'bin', … }` — and a lookup table is data, so it lives beside the
     functions rather than in one. That table IS how the game reads its keys.

     `pads` and `help` are left out, and that is the load-bearing part: a pad
     carries its own code, so including them would make every pad justify
     itself and the check would pass on a game where every button is dead.
     Scalars are left out too — a blurb that happens to say "press ArrowLeft"
     is prose, not a handler. */
  sourceOf(it, code) {
    const parts = Object.keys(code || {}).map(k => code[k]);
    Object.keys(it || {}).forEach(k => {
      if (k === 'pads' || k === 'help') return;
      const v = it[k];
      if (v && typeof v === 'object') parts.push(k + ': ' + JSON.stringify(v));
    });
    return parts.join('\n');
  },
  src() { return this.sourceOf(this.it, this.code); },
  /* Every key code the game's own source names. `KeyD`, `ArrowLeft`, `Space` —
     the shapes a KeyboardEvent.code actually takes.

     NOT required to be quoted, and that is the whole of what makes this check
     work. The first version asked for a string literal and reported all three
     of the shipped games' pads as dead: every one of them reads its keys
     through a LOOKUP TABLE — `LANE: { KeyD: 0, KeyF: 1, … }`, `ACT: { ArrowLeft:
     'bin', … }` — where the code is an object key and an object key is a bare
     identifier. That is the convention this codebase writes them in, which is
     the thing a regular expression over source has to be written against; the
     same call editor/writing.js makes about `Q.step('q_x')` being one line with
     a literal argument.

     A word boundary is enough because these are not words anything says by
     accident. A key named only in a comment counts, which is the honest cost of
     reading source rather than parsing it — and a comment naming a key the game
     does not handle is worth a second look anyway. */
  KEYRE: /\b(Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Escape|Tab|Numpad[A-Za-z0-9]+)\b/g,
  keysRead(src) {
    const out = [];
    const re = new RegExp(this.KEYRE.source, 'g');
    let m;
    while ((m = re.exec(src === undefined ? this.src() : src))) {
      if (out.indexOf(m[1]) < 0) out.push(m[1]);
    }
    return out;
  },
  /* Whether the game handles a pointer at all. A game with no pads that does
     not read a pointer either cannot be played on a phone — which is a whole
     class of person, and the one this project treats as first-class. */
  readsPointer(src) {
    return /['"]point['"]/.test(src === undefined ? this.src() : src);
  },
  /* Who opens it. Writing.calls() reads every act, every node, every move and
     the arcade itself, so this is the same question the job editor asks about
     `Q.start` and gets the same honest answer. */
  openedBy(id) {
    if (typeof Writing === 'undefined') return [];
    return Writing.calls('Arcade', 'open')
      .filter(c => c.id === (id === undefined ? this.id : id))
      .map(c => c.where);
  },
  /* Every achievement this game hands out, from its own source. */
  grants(src) {
    const out = [];
    const re = /\bAch\.get\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src === undefined ? this.src() : src))) {
      if (out.indexOf(m[1]) < 0) out.push(m[1]);
    }
    return out;
  }
};
Object.assign(Games, HIST);

/* ---------------- What is wrong with a minigame ----------------
   Six joins, and not one of them is visible while playing the game on the
   machine it was written on. That is the point of the list: a rhythm game
   written on a desktop with four pads declared and one of them mistyped plays
   perfectly for its author and has a dead button for everybody else. */

const GameCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    Games.ids().forEach(id => this.per.set(id, this.one(id)));
    this.faults = this.per.get(Games.id) || [];
    return this;
  },

  /* The open game is read from the DOCUMENT and every other from the live
     table. Same rule the object and job checks follow: a pad you have just
     renamed should be reported now, not after you have exported it. */
  viewOf(id) {
    if (id === Games.id && Games.it) {
      return { it: Games.it, src: Games.src() };
    }
    const g = Games.def(id);
    if (!g) return null;
    const it = {}, code = {};
    Object.keys(g).forEach(k => {
      if (typeof g[k] === 'function') code[k] = String(g[k]);
      else it[k] = g[k];
    });
    /* Through the same call the open one goes through, or the two answers
       drift and only one of them is the one anybody looks at. */
    return { it: it, src: Games.sourceOf(it, code) };
  },

  one(id) {
    const out = [];
    const v = this.viewOf(id);
    if (!v) return out;
    const it = v.it, src = v.src;
    const fault = (level, msg, extra) =>
      out.push(Object.assign({ level: level, msg: msg, game: id }, extra || {}));

    /* ---- THE PADS ----
       The touch half of the key contract. A pad declares a code, the host
       delivers a press on it as that key, and the game reads it — so a code
       the game's own source never names is a button that is drawn, is under a
       thumb, is pressed, and does nothing at all. Silent on a desktop, where
       the pads are not even shown. */
    const pads = it.pads || [];
    const reads = Games.keysRead(src);
    pads.forEach((pd, i) => {
      if (!pd.code) {
        fault('error', 'Pad ' + (i + 1) + ' has no `code`, so the host has no key to deliver '
          + 'when it is pressed.', { pad: i });
        return;
      }
      if (reads.indexOf(pd.code) < 0) {
        fault('error', 'Pad ' + (i + 1) + ' (“' + (pd.label || '') + '”) sends `' + pd.code
          + '` and nothing in this game reads that code. The button is drawn, it is under a '
          + 'thumb, it is pressed, and nothing happens — and it is invisible on a desktop, '
          + 'where the pads are not shown at all.', { pad: i });
      }
      if (!pd.label) {
        fault('error', 'Pad ' + (i + 1) + ' has no label. It is a blank button.', { pad: i });
      } else if (pd.label.length > 12) {
        fault('warn', 'Pad ' + (i + 1) + '’s label is ' + pd.label.length + ' characters. '
          + 'Three pads share a 320px phone, so about twelve is where they start being '
          + 'ellipsised into nothing.', { pad: i });
      }
    });
    /* And the other direction: a key the game reads that no pad sends is a part
       of the game a thumb cannot reach.

       Two exemptions, and both are rules rather than excuses. Escape and Tab
       belong to the HOST outright — it takes them before the game ever sees
       them, to leave and to move focus — so a game naming either is not missing
       a pad for it. And the number row is a keyboard affordance by construction:
       it is how a dialogue choice and a combat move are already picked in this
       game, a phone does not have one, and a pad that sends Digit3 would be a
       button whose whole meaning is the key it is standing in for. That second
       one DID fire — the rhythm game offers 1–4 as an alternate to D F J K — and
       it is right that it should not. */
    const HOST = ['Escape', 'Tab'];
    const uncovered = reads.filter(k => HOST.indexOf(k) < 0 && !/^Digit/.test(k)
      && !pads.some(pd => pd.code === k));
    if (pads.length && uncovered.length) {
      fault('warn', 'This game reads ' + uncovered.join(', ') + ' and no pad sends '
        + (uncovered.length > 1 ? 'those' : 'that') + '. A thumb cannot reach '
        + (uncovered.length > 1 ? 'them' : 'it') + ' at all.', { keys: uncovered });
    }
    if (!pads.length && !Games.readsPointer(src) && reads.length) {
      fault('error', 'No pads and no pointer handling, so on a phone this game cannot be '
        + 'played at all: the keys it reads are keys the device does not have. Either declare '
        + 'pads for them or handle `ev.kind === "point"`.');
    }

    /* ---- BOTH WORDINGS ----
       Touch and keyboard are both first-class here, and any new instruction
       text needs both. A game with one is a game that explains itself to half
       the people who open it. */
    const help = it.help || {};
    if (!(help.keys || []).length) {
      fault('error', 'No keyboard wording in `help.keys`, so on a desktop the hint line under '
        + 'the canvas and the list on the card in front of the game are both empty.');
    }
    if (!(help.taps || []).length) {
      fault('error', 'No touch wording in `help.taps`, so on a phone this game opens with no '
        + 'instructions at all.');
    }

    /* ---- IS IT REACHABLE ----
       A registered game nothing installs is finished, tested, and something no
       player will ever see. Two ways in: a CABINET, which is the ordinary one
       and the one this editor can do anything about, or a bare Arcade.open in
       the writing, which is still legal and still counts. */
    const cabs = id === Games.id && Games.cabs ? Games.cabs : Games.table().filter(c => c.game === id);
    const opens = Games.openedBy(id);
    if (!cabs.length && !opens.length) {
      fault('error', 'Nothing installs this game. It is registered and unreachable — put it on '
        + 'an object with the "Where it is played" section below, which is one row in CABINETS '
        + 'and needs no code at all.');
    }

    /* ---- WHAT EACH CABINET NAMES ----
       Six joins per row, every one a string matched by nobody, and each fails
       differently: an object with no act is a reply that never appears, a skill
       that is not in SKILLS is a rank of zero for ever, an item ITEMS has never
       heard of is a reward that silently does not arrive. */
    const objects = Games.objects();
    cabs.forEach((c, i) => {
      const at = 'Cabinet ' + (i + 1) + ' (' + (c.use || '—') + ')';
      if (!c.use) {
        fault('error', at + ' names no object, so nothing offers it.', { cab: i });
      } else if (typeof Acts !== 'undefined' && typeof Acts[c.use] !== 'function') {
        fault('error', at + ': there is no `Acts.' + c.use + '`, so no object opens that '
          + 'dialogue and the reply is never offered to anybody.', { cab: i });
      } else if (objects.length && objects.indexOf(c.use) < 0) {
        fault('warn', at + ': `' + c.use + '` is a handler in data/acts.js but nothing in the '
          + 'building carries it as a `use:`, so there is no object to walk up to.', { cab: i });
      }
      if (!c.t) {
        fault('error', at + ' has no reply text, so the choice is a blank button.', { cab: i });
      }
      if (c.skill && typeof SKILLS !== 'undefined'
        && !Games.skills().some(x => x[0] === c.skill)) {
        fault('error', at + ' draws on the skill `' + c.skill + '` and SKILLS has no such id. '
          + 'Sk.rank() returns 0 for an id it does not know, so the game is handed a rank of '
          + 'zero for ever and buying anything changes nothing.', { cab: i });
      }
      if (c.job && typeof QUESTS !== 'undefined' && !QUESTS[c.job]) {
        fault('error', at + ' steps the job `' + c.job + '` and QUESTS has no such id. Q.step '
          + 'returns early on a job that is not active, so nothing happens and nothing says '
          + 'so.', { cab: i });
      }
      if (c.item && typeof ITEMS !== 'undefined' && !ITEMS[c.item]) {
        fault('error', at + ' hands over the item `' + c.item + '` and ITEMS has no such id. '
          + 'Item.give() gives nothing, quietly.', { cab: i });
      }
      if (cabs.some((o, j) => j < i && o.use === c.use)) {
        fault('warn', at + ' is the second copy of this game on the same object, so the reply '
          + 'is offered twice in the same dialogue.', { cab: i });
      }
    });

    /* ---- WHAT IT HANDS OUT ----
       Ach.get on an id that is not in ACHS returns without a word, so the
       reward simply never arrives and nothing says so. */
    Games.grants(src).forEach(a => {
      if (typeof ACHS !== 'undefined' && !ACHS[a]) {
        fault('error', 'It grants the achievement `' + a + '` and there is no such entry in '
          + 'ACHS. Ach.get() returns early on an id it does not know, so nothing at all '
          + 'happens and nothing says so.', { ach: a });
      }
    });

    /* ---- THE NUMBERS ---- */
    if (!(it.par > 0)) {
      fault('error', '`par` is ' + JSON.stringify(it.par) + '. Every reward() in the library '
        + 'divides the score by it to work out what the round was worth, so this one pays out '
        + 'nothing, Infinity or NaN.');
    }
    if (!(it.mins > 0)) {
      fault('warn', 'A round costs no time. The clock is stopped while you play, so a game '
        + 'with no `mins` is a way to stand still in a shift that is on a timer.');
    } else if (it.mins > 120) {
      fault('warn', 'A round costs ' + it.mins + ' minutes of a 480-minute shift. That is a '
        + 'quarter of the day on one go.');
    }
    if (!it.name) fault('error', 'No name. The host uses it for the title bar and the card.');
    if (!it.icon) {
      fault('warn', 'No icon, so the badge, the toast and the card all fall back to a '
        + 'generic one.');
    } else if (Array.from(it.icon).length > 2) {
      fault('warn', 'The icon is ' + Array.from(it.icon).length + ' characters. It sits in a '
        + 'title bar beside the name; one or two is what fits.');
    }
    if (!it.blurb) fault('warn', 'No blurb, so the card in front of the game says only its name.');
    if (!it.goal) {
      fault('warn', 'No goal, so nothing on the card says what winning is. Every one of these '
        + 'has a win condition and none of them is guessable.');
    }

    /* ---- THE HOOKS ----
       The host has a default for all of them, which is what makes a fifteen-
       line game possible — but a game with no draw() is a black rectangle and
       a game with no way to end never pays out. */
    const code = id === Games.id ? Games.code : this.codeOf(id);
    ['start', 'update', 'draw'].forEach(k => {
      if (!code[k]) {
        fault('warn', 'No `' + k + '()`. The host defaults it, so this is legal — but a game '
          + 'without one is either very simple or unfinished.');
      }
    });
    if (!/\ba\.end\s*\(|\bend\s*\(\s*\{/.test(src)) {
      fault('error', 'Nothing in this game ever calls `a.end()`. A round that cannot finish '
        + 'cannot be won, cannot pay out and can only be left with Escape.');
    }
    if (!code.reward) {
      fault('warn', 'No `reward()`, so a finished round pays nothing at all — no XP, no money '
        + 'and no toast.');
    }
    return out;
  },
  codeOf(id) {
    const g = Games.def(id);
    const out = {};
    if (g) Object.keys(g).forEach(k => { if (typeof g[k] === 'function') out[k] = String(g[k]); });
    return out;
  },

  /* The other direction, across the whole library: an `Arcade.open('…')`
     somewhere in the writing that names a game nobody registered. That is a
     dialogue choice which denies with a buzz — and it is exactly what a
     renamed id leaves behind. */
  danglingOpens() {
    const have = Games.ids();
    const out = [];
    const add = (id, where) => { if (!out.some(x => x.id === id)) out.push({ id: id, where: where }); };
    if (typeof Writing !== 'undefined') {
      Writing.calls('Arcade', 'open').forEach(c => {
        if (have.indexOf(c.id) < 0) add(c.id, c.where);
      });
    }
    /* And the table's own version of the same fault: a cabinet installed on an
       object for a game nobody registered. Arcade.cabinets() filters those out
       rather than throwing, so the reply simply never appears — which looks
       exactly like the object having nothing on it. */
    Games.table().forEach(c => {
      if (have.indexOf(c.game) < 0) add(c.game, 'CABINETS on ' + c.use);
    });
    return out;
  }
};
Object.assign(GameCheck, FAULTS);

/* ---------------- Making one ----------------
   The one place this editor writes code, and it writes a TEMPLATE rather than
   generating logic — the same distinction the dialogue editor draws when it
   rewrites a `to` inside an entry(): a mechanical substitution is not the tool
   inventing behaviour.

   It is deliberately the shortest thing that is really a game: it starts, it
   draws, it takes a press, it ends, and it pays. Fifteen lines, which is the
   claim engine/arcade.js makes about its own defaults, made good. */
const GamesMake = {
  create() {
    Ask.form('A new minigame', [
      { k: 'id', label: 'id', value: '', hint: 'lower case; keys the high score in G.arcade' },
      { k: 'name', label: 'called', value: '' },
      { k: 'icon', label: 'icon', value: '🕹️', hint: 'one emoji' },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (Games.def(id)) { Side.say('There is already a game called ' + id + '.'); return; }
      const A = Games.live();
      if (!A) { Side.say('engine/arcade.js is not loaded on this page.'); return; }
      A.register(this.template(id, v.name || id, v.icon || '🕹️'));
      if (typeof Writing !== 'undefined') Writing._index = null;
      Mode.openSubject(id);
      Side.say('Created ' + id + ' in this tab. Its body is a template — the export is a whole '
        + 'file for minigames/' + id + '.js, and the game is written there.');
    });
  },
  /* Registered as real functions rather than as strings, because the document
     captures source off what is loaded and a string would export as a quoted
     one. It is a working game: press the pad, the score goes up, it ends. */
  template(id, name, icon) {
    return {
      id: id, name: name, icon: icon,
      blurb: 'Written in the editor. The body of it is a template.',
      goal: 'Press the button five times before the ten seconds are up.',
      mins: 5, par: 500,
      help: { keys: ['Space to press it'], taps: ['Tap the button'] },
      pads: [{ code: 'Space', label: 'Press' }],
      start(a) { this.n = 0; },
      update(a, dt) {
        if (a.t > 10) a.end({ win: this.n >= 5, note: this.n + ' presses.' });
      },
      draw(a, g) {
        const p = a.paint;
        p.say(g, String(this.n), a.w / 2, a.h / 2,
          { size: 48, weight: '700', font: p.mono, colour: p.hold, align: 'center' });
        p.say(g, Math.max(0, 10 - a.t).toFixed(1) + 's', a.w / 2, a.h / 2 + 30,
          { size: 12, font: p.mono, colour: p.dim, align: 'center' });
      },
      input(a, ev) {
        if (ev.kind === 'key' && ev.down && ev.code === 'Space') { this.n++; a.add(100); }
      },
      summary(a) { return [['presses', String(this.n)]]; },
      reward(a, r) {
        return r.win ? { xp: 20, toast: 'You pressed the button.' } : { xp: 5 };
      }
    };
  },
  drop() {
    const id = Games.id;
    const others = Games.ids().filter(x => x !== id);
    const A = Games.live();
    if (!A || !id) return;
    const opens = Games.openedBy(id);
    Ask.confirm('Delete ' + Games.label(id) + '?',
      'It goes from this tab’s arcade only, with every cabinet it was on — minigames/ and '
      + 'data/items.js are untouched, so a reload brings it back. ' + (opens.length
        ? opens.length + ' place(s) in the writing still call Arcade.open(' + Emit.str(id)
          + '): ' + opens.join(', ') + '. Each becomes a button that denies.'
        : 'Nothing in the writing opens it.'), 'Delete it').then(yes => {
      if (!yes) return;
      delete A.games[id];
      const at = A.order.indexOf(id);
      if (at >= 0) A.order.splice(at, 1);
      /* And every cabinet it was on, or the table keeps rows for a game nobody
         registers — which is a reply that never appears and reads as the object
         having nothing on it. */
      Games.keep();
      const t = Games.table();
      for (let i = t.length - 1; i >= 0; i--) if (t[i].game === id) t.splice(i, 1);
      Games.forget(id);
      if (typeof Writing !== 'undefined') Writing._index = null;
      if (others.length) Mode.openSubject(others[0]);
      else { Games.id = null; Games.it = null; Games.code = null; Side.refresh(); }
      Side.say('Deleted ' + id + ' from this tab.');
    });
  }
};
