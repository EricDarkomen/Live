'use strict';
/* ---------------- The arcade, which is a library ----------------
   engine/arcade.js hosts minigames/*.js on declarations nothing else checks:
     pads: [{ code: 'ArrowLeft', … }]   a key the game's input() must read
     help: { keys, taps }                both wordings, or one device has none
     Arcade.open('patch')                in some act, or the game is unreachable
     Ach.get('a_patched')                an id that must be in ACHS
     par                                 reward() divides by it
   Each fails silently and differently. This document makes them answerable.
   Half a minigame is code (start, update, draw, input, reward, hud, summary),
   captured and carried through verbatim. Only the declarations are edited. */

const Games = {
  id: null,
  /* The declarations, as plain data, and the hooks beside them as text. */
  it: null,
  code: null,

  base: null, undoStack: [], redoStack: [],

  /* The fields this editor owns; `pads` and `help` have their own rows. */
  FIELDS: ['name', 'icon', 'blurb', 'goal', 'mins', 'par'],
  /* The cabinets: where the game is installed and what it is wired into
     (data/items.js), held beside the definition and exported separately.
     Written into the live CABINETS so walking up to the object shows it. */
  cabs: null,
  /* The hooks in engine/arcade.js's order, which is run order. */
  HOOKS: ['start', 'update', 'draw', 'input', 'hud', 'summary', 'reward', 'stop', 'resized'],

  /* ---- the catalogue ----
     Arcade's own list, as Arcade.init() reads it. */
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
     A capture: nothing is written into Arcade.games; the export is the
     deliverable and Revert reloads. */
  load(id) {
    const g = this.def(id);
    if (!g) return false;
    this.id = id;
    this.it = {}; this.code = {};
    Object.keys(g).forEach(k => {
      if (typeof g[k] === 'function') this.code[k] = String(g[k]);
      else this.it[k] = clone(g[k]);
    });
    /* Normalised on load so the panel has rows; both help wordings always exist
       as lists, so a missing one is a fault rather than an absent field. */
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
  /* Written into CABINETS, as the object and room editors write FURN and ZONES;
     the file's version is kept for Revert. */
  pristine: null,
  keep() { if (!this.pristine) this.pristine = clone(this.table()); },
  commit() {
    const t = this.table();
    if (!t || !this.id) return;
    this.keep();
    for (let i = t.length - 1; i >= 0; i--) if (t[i].game === this.id) t.splice(i, 1);
    (this.cabs || []).forEach(c => t.push(clone(c)));
  },
  /* data/items.js's cabinets for this game: the baseline for changed(). */
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
     A code (what the game receives) and a label (what a thumb reads), in order
     left to right across the screen. */
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
     Install, uninstall and wire rewards; lists wherever a known set exists. */
  install(use) {
    this.mark('install ' + this.id);
    this.cabs.push({ game: this.id, use: use || 'generic', skill: null, job: null,
      item: null, need: null, t: 'Play ' + (this.it.name || this.id) + '.' });
    this.rebuild();
  },
  setCab(i, k, v) {
    const c = this.cabs[i]; if (!c) return;
    this.mark('edit where ' + this.id + ' is played');
    /* Emptied means empty, so the check can report it. */
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
     Regular expressions over captured source (see editor/writing.js): calls are
     one line with a literal argument by convention. Anything built from a
     variable is invisible, so nothing is ever reported as "all". */
  /* The game as text: every hook plus every table it declares (key lookup
     tables like `LANE: { KeyD: 0, … }` are how games read keys). `pads` and
     `help` are excluded, or every pad would justify itself; so are scalars. */
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
  /* Every key code the source names, quoted or not (lookup tables use bare
     object keys). A key named only in a comment counts. */
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
  /* Whether the game reads a pointer; with no pads, a phone cannot play it. */
  readsPointer(src) {
    return /['"]point['"]/.test(src === undefined ? this.src() : src);
  },
  /* Who opens it, via Writing.calls(). */
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
   Six joins, none visible while playing on the author's machine. */

const GameCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    Games.ids().forEach(id => this.per.set(id, this.one(id)));
    this.faults = this.per.get(Games.id) || [];
    return this;
  },

  /* The open game from the document, others from the live table. */
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

    /* ---- the pads ----
       A code the game never reads is a dead button, and invisible on a desktop. */
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
    /* The other direction: keys the game reads that no pad sends. Exempt: Escape
       and Tab (the host's) and the number row (a keyboard shortcut for choices). */
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

    /* ---- both wordings ----
       Touch and keyboard instructions are both required. */
    const help = it.help || {};
    if (!(help.keys || []).length) {
      fault('error', 'No keyboard wording in `help.keys`, so on a desktop the hint line under '
        + 'the canvas and the list on the card in front of the game are both empty.');
    }
    if (!(help.taps || []).length) {
      fault('error', 'No touch wording in `help.taps`, so on a phone this game opens with no '
        + 'instructions at all.');
    }

    /* ---- is it reachable ----
       A cabinet, or an Arcade.open in the writing. */
    const cabs = id === Games.id && Games.cabs ? Games.cabs : Games.table().filter(c => c.game === id);
    const opens = Games.openedBy(id);
    if (!cabs.length && !opens.length) {
      fault('error', 'Nothing installs this game. It is registered and unreachable — put it on '
        + 'an object with the "Where it is played" section below, which is one row in CABINETS '
        + 'and needs no code at all.');
    }

    /* ---- what each cabinet names ----
       Object, skill and item joins, each failing silently. */
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

    /* ---- the hooks ----
       The host defaults all of them, but no draw() is a black rectangle and no
       way to end never pays out. */
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

  /* An Arcade.open('…') naming an unregistered game. */
  danglingOpens() {
    const have = Games.ids();
    const out = [];
    const add = (id, where) => { if (!out.some(x => x.id === id)) out.push({ id: id, where: where }); };
    if (typeof Writing !== 'undefined') {
      Writing.calls('Arcade', 'open').forEach(c => {
        if (have.indexOf(c.id) < 0) add(c.id, c.where);
      });
    }
    /* A cabinet for an unregistered game (Arcade.cabinets() drops it silently). */
    Games.table().forEach(c => {
      if (have.indexOf(c.game) < 0) add(c.game, 'CABINETS on ' + c.use);
    });
    return out;
  }
};
Object.assign(GameCheck, FAULTS);

/* ---------------- Making one ----------------
   Writes a template, not logic: the shortest real game (start, draw, a press,
   an end, a payout). */
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
  /* Registered as real functions so the capture exports them as source. */
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
