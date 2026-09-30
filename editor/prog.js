'use strict';
/* ---------------- What you get for it ----------------
   The other half of a game: what the player earns, carries, buys and unlocks.
   Four tables, all in data/items.js except the ranks, and all of them pure
   data — so unlike a level or a move, every one of these round-trips exactly.

     ITEMS   what you can carry, wear and drink.
     SHOP    what the vending machine and the Greggs downstairs will sell you.
     SKILLS  the tree, in branches.
     ACHS    the achievements.

   Which makes the interesting part the joins, and they are the usual shape —
   a string in one file that has to exist somewhere else, checked by nobody:

     SHOP.stock[]      names an ITEMS key, and one that has gone is a shelf
                       with a hole in it
     ITEMS[].use       names a handler in `Uses`, and a missing one is an item
                       you drink and nothing happens
     ITEMS[].slot      has to be a key of P.equipment or the item can never be
                       worn — there is no slot to put it in
     ITEMS[].eff       is read key by key in Player.recalc(), which knows six
                       names and silently ignores everything else
     ACHS[id]          is handed out by Ach.get(id) somewhere in the writing,
                       and one nothing hands out is an achievement no player
                       can ever earn
     SKILLS[..].list   is read by Sk.rank(id), and a skill nothing reads is
                       three points the player spends on nothing at all

   The last two are the ones worth having. Both are completely invisible in
   play: the achievement simply never appears, and the skill quietly does
   nothing. `Writing` is what can answer them, by reading the source of the acts
   and the dialogue that are already loaded. */

const Prog = {
  KINDS: [
    { k: 'item', label: 'Items', table: () => ITEMS },
    { k: 'shop', label: 'Shops', table: () => SHOP },
    { k: 'skill', label: 'Skill branches', table: () => SKILLS },
    { k: 'ach', label: 'Achievements', table: () => ACHS },
  ],
  /* What the engine will actually honour. Read off the code that consumes
     them — P.equipment's own keys, Player.recalc()'s own list — so a name that
     is not here is a name that does nothing. */
  SLOTS: ['headset', 'trinket', 'mug'],
  EFFECTS: ['empathy', 'knowledge', 'bullshit', 'chaos', 'patience', 'energy'],
  RARITY: ['common', 'rare', 'epic'],

  kind: 'item', id: null, it: null,
  base: null, undoStack: [], redoStack: [],

  key() { return this.kind + ':' + this.id; },
  def(k) { return this.KINDS.find(x => x.k === (k || this.kind)); },
  ids() {
    const out = [];
    this.KINDS.forEach(d => Object.keys(d.table()).forEach(id => out.push(d.k + ':' + id)));
    return out;
  },
  groups() {
    return this.KINDS.map(d => ({
      label: d.label,
      items: Object.keys(d.table()).map(id => [d.k + ':' + id, this.label(d.k, id)]),
    }));
  },
  label(kind, id) {
    const e = this.entry(kind, id);
    if (!e) return id;
    if (kind === 'item') return (e.e ? e.e + ' ' : '') + (e.n || id);
    if (kind === 'shop') return e.title || id;
    if (kind === 'skill') return e.name || id;
    return (e.e ? e.e + ' ' : '') + (e.n || id);
  },
  entry(kind, id) {
    const d = this.def(kind);
    return d ? (d.table()[id === undefined ? this.id : id] || null) : null;
  },

  load(key) {
    const [kind, ...rest] = String(key || '').split(':');
    const id = rest.join(':');
    if (!this.def(kind)) return false;
    const e = this.entry(kind, id);
    if (!e) return false;
    this.kind = kind; this.id = id;
    this.it = clone(e);
    /* A shelf written as a getter — Rosie's and Nico's change with the catch —
       is code, and clone() would freeze it into whatever it returned just now.
       Carried as its source instead, and written back exactly. */
    const src = Prog.stockSrc(e);
    if (src) { delete this.it.stock; this.it.stockSrc = src; }
    this.rebase();
    return true;
  },
  state() { return clone({ kind: this.kind, id: this.id, it: this.it }); },
  restore(s) { this.kind = s.kind; this.id = s.id; this.it = clone(s.it); },
  rebuild() {
    ProgCheck.run();
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
  /* An effect is a name and a number, and both halves can be wrong in a way
     nothing reports: an unknown name is dropped by recalc() and a zero does
     nothing at all. */
  setEff(k, v) {
    const n = Number(v);
    this.mark('edit ' + k);
    this.it.eff = Object.assign({}, this.it.eff);
    if (v === '' || !isFinite(n) || n === 0) delete this.it.eff[k];
    else this.it.eff[k] = n;
    if (!Object.keys(this.it.eff).length) delete this.it.eff;
    this.rebuild();
  },
  /* A shop's shelf. Ordered, because that is the order it is offered in. */
  stock() { return (this.it && this.it.stock) || []; },
  /* The source of a shelf that is a getter, or null for a plain list. */
  stockSrc(e) {
    if (!e) return null;
    if (typeof e.stockSrc === 'string') return e.stockSrc;
    const d = Object.getOwnPropertyDescriptor(e, 'stock');
    return d && typeof d.get === 'function' ? String(d.get) : null;
  },
  /* Everything a shop can EVER have on its shelf: the list, or for a getter
     every item it names — the union of its days, which is what "is this ever
     sold" and "does this name a real item" are both asking. */
  shelf(e) {
    const src = this.stockSrc(e);
    if (!src) return (e && e.stock) || [];
    const out = [];
    src.replace(/['"]([A-Za-z_$][\w$]*)['"]/g, (_, id) => {
      if (typeof ITEMS !== 'undefined' && ITEMS[id] && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  },
  addStock(id) {
    if (this.it && this.it.stockSrc) return false;
    if (!id || this.stock().indexOf(id) >= 0) return false;
    this.mark('stock ' + id);
    this.it.stock = this.stock().concat([id]);
    this.rebuild();
    return true;
  },
  removeStock(i) {
    if ((this.it && this.it.stockSrc) || !this.stock()[i]) return false;
    this.mark('unstock ' + this.stock()[i]);
    this.it.stock = this.stock().filter((_, j) => j !== i);
    this.rebuild();
    return true;
  },
  moveStock(i, d) {
    if (this.it && this.it.stockSrc) return false;
    const s = this.stock().slice(), j = i + d;
    if (j < 0 || j >= s.length) return false;
    this.mark('reorder the shelf');
    [s[i], s[j]] = [s[j], s[i]];
    this.it.stock = s;
    this.rebuild();
    return true;
  },
  /* A skill branch holds a list of skills, keyed by the id Sk.rank() reads. */
  skills() { return (this.it && this.it.list) || {}; },
  setSkill(id, k, v) {
    const list = Object.assign({}, this.skills());
    if (!list[id]) return false;
    this.mark('edit ' + id);
    list[id] = Object.assign({}, list[id]);
    if (k === 'max') list[id].max = Math.max(1, Number(v) || 1);
    else list[id][k] = v;
    this.it.list = list;
    this.rebuild();
    return true;
  },
  removeSkill(id) {
    if (!this.skills()[id]) return false;
    this.mark('delete ' + id);
    const list = Object.assign({}, this.skills());
    delete list[id];
    this.it.list = list;
    this.rebuild();
    return true;
  },
  addSkill(id, n) {
    if (!id || this.skills()[id]) return false;
    this.mark('add ' + id);
    this.it.list = Object.assign({}, this.skills(), { [id]: { n: n || id, d: 'What it does.', max: 3 } });
    this.rebuild();
    return true;
  },
};
Object.assign(Prog, HIST);

/* ---------------- Making and unmaking ---------------- */
const ProgMake = {
  create() {
    Ask.form('Something new to earn', [
      { k: 'kind', label: 'what', value: 'item', options: Prog.KINDS.map(d => [d.k, d.label]) },
      { k: 'id', label: 'id', value: '', hint: 'how the table keys it' },
      { k: 'n', label: 'called', value: '', hint: 'what the player sees' },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (Prog.entry(v.kind, id)) { Side.say('There is already a ' + v.kind + ' called ' + id + '.'); return; }
      const name = v.n || id;
      if (v.kind === 'item') ITEMS[id] = { n: name, e: '📦', d: 'What it is.', v: 1, r: 'common' };
      else if (v.kind === 'shop') SHOP[id] = { title: name, note: 'What it is like.', stock: [] };
      else if (v.kind === 'skill') SKILLS[id] = { name: name, colour: '#4da3ff', list: {} };
      else ACHS[id] = { n: name, e: '🏅', d: 'What you did.' };
      Mode.openSubject(v.kind + ':' + id);
      Side.say(v.kind === 'ach'
        ? 'Created ' + id + '. Nothing hands it out yet — the check says so, and an act or a line '
          + 'of dialogue has to call Ach.get(' + Emit.str(id) + ').'
        : 'Created ' + id + '. It is in this tab only — the export is what puts it in the file.');
    });
  },
  drop() {
    const key = Prog.key();
    const others = Prog.ids().filter(x => x !== key);
    if (!others.length) { Side.say('This is the only one there is.'); return; }
    const uses = ProgCheck.usedBy(Prog.kind, Prog.id);
    Ask.confirm('Delete ' + Prog.label(Prog.kind, Prog.id) + '?',
      'It goes from this tab’s table. data/items.js is untouched, so a reload brings it back'
      + (uses.length ? ' — but ' + uses.length + ' place(s) still name it: ' + uses.slice(0, 3).join(', ') : '.'),
      'Delete it').then(yes => {
      if (!yes) return;
      delete Prog.def().table()[Prog.id];
      Prog.forget(key);
      Mode.openSubject(others[0]);
      Side.say('Deleted from this tab.');
    });
  }
};

/* ---------------- What is wrong with the rewards ---------------- */
const ProgCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    Prog.ids().forEach(key => this.per.set(key, this.one(key)));
    this.faults = (this.per.get(Prog.key()) || []).concat(this.dangling());
    return this;
  },

  /* The FOUR ways an item can reach the player. Two of them cannot be read out
     of the writing at all, because both hand the item over by VARIABLE — a
     quest reward is `Item.give(q.rw.item)` and an arcade cabinet is
     `Item.give(this.cab.item)`. Both tables have to be asked directly, which
     is the same rule and the same reason: a call built out of a variable is
     invisible to a regular expression over source, and a table that grants
     things is a root whether or not anybody remembered to say so. */
  reachable(id) {
    const stocked = Object.keys(SHOP).some(s => Prog.shelf(SHOP[s]).indexOf(id) >= 0);
    if (stocked) return true;
    if (typeof QUESTS !== 'undefined'
      && Object.keys(QUESTS).some(q => ((QUESTS[q] || {}).rw || {}).item === id)) return true;
    if (this.cabinetGives(id)) return true;
    if (this.tableGives().has(id)) return true;
    if (typeof Writing !== 'undefined'
      && Writing.calls('Item', 'give').some(c => c.id === id)) return true;
    /* Starting kit and anything the engine hands over by name. */
    return this.engineReads(id);
  },
  /* A minigame's cabinet hands its item over on the first win. Read off the
     EDITOR's copy where there is one, so an item you have just wired to a game
     stops being reported the moment you wire it — same rule every other check
     here follows about the open subject. */
  cabinetGives(id) {
    const live = typeof Games !== 'undefined' && Games.id && Games.cabs
      ? Games.table().filter(c => c.game !== Games.id).concat(Games.cabs)
      : (typeof CABINETS !== 'undefined' && Array.isArray(CABINETS) ? CABINETS : []);
    return live.some(c => c && c.item === id);
  },

  /* The island's production tables, which hand over by variable too —
     `Item.give(r.out)` — and so are roots for the same reason QUESTS and the
     cabinets are: a harvest from CROPS, what a node on the beach or in the
     rock gives, and whatever the blender, bench, kiln, oven and drying rack
     make. Read fresh each time: they are the game's, and cheap. */
  tableGives() {
    const out = new Set();
    const outs = list => (Array.isArray(list) ? list : []).forEach(r => { if (r && r.out) out.add(r.out); });
    if (typeof CROPS !== 'undefined') Object.keys(CROPS).forEach(k => out.add(k));
    if (typeof NODES !== 'undefined') Object.keys(NODES).forEach(k => {
      ((NODES[k] || {}).gives || []).concat((NODES[k] || {}).extra || []).forEach(g => out.add(g[0]));
    });
    if (typeof RECIPES !== 'undefined') outs(RECIPES);
    if (typeof WORKBENCH !== 'undefined') outs(WORKBENCH);
    if (typeof KILN !== 'undefined') outs(KILN.recipes);
    if (typeof OVEN !== 'undefined') outs(OVEN);
    if (typeof RACK !== 'undefined') outs(RACK.recipes);
    return out;
  },

  /* What else names this thing, for the delete question. */
  usedBy(kind, id) {
    const out = [];
    if (kind === 'item') {
      (typeof CABINETS !== 'undefined' && Array.isArray(CABINETS) ? CABINETS : [])
        .forEach(c => { if (c.item === id) out.push('the ' + c.game + ' cabinet on ' + c.use); });
      Object.keys(SHOP).forEach(s => {
        if (Prog.shelf(SHOP[s]).indexOf(id) >= 0) out.push('the ' + (SHOP[s].title || s));
      });
      if (typeof Writing !== 'undefined') {
        Writing.calls('Item', 'give').filter(c => c.id === id).forEach(c => out.push(c.where));
      }
    }
    return out;
  },

  one(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    const live = kind === Prog.kind && id === Prog.id;
    const e = live ? Prog.it : Prog.entry(kind, id);
    const out = [];
    const fault = (level, msg, extra) => out.push(Object.assign({ level, msg, key }, extra || {}));
    if (!e) return out;

    if (kind === 'item') {
      if (!String(e.n || '').trim()) fault('error', 'No name, so the inventory shows a blank row.', { field: 'n' });
      if (!String(e.d || '').trim()) fault('warn', 'No description. Every other item has one and it is where the writing is.', { field: 'd' });
      if (e.slot !== undefined && Prog.SLOTS.indexOf(e.slot) < 0) {
        fault('error', 'Slot “' + e.slot + '” is not one P.equipment has (' + Prog.SLOTS.join(', ')
          + '), so this can never be worn — there is nowhere to put it.', { field: 'slot' });
      }
      if (e.r !== undefined && Prog.RARITY.indexOf(e.r) < 0) {
        fault('warn', 'Rarity “' + e.r + '” is not one the panel styles, so it is drawn plain.', { field: 'r' });
      }
      Object.keys(e.eff || {}).forEach(k => {
        if (Prog.EFFECTS.indexOf(k) < 0) {
          fault('error', 'Effect “' + k + '” is not one Player.recalc() reads (' + Prog.EFFECTS.join(', ')
            + '). It is dropped silently, so the item does nothing.', { field: 'eff' });
        }
      });
      /* A `use` is either a table of what it does (see Item.consume()) or the
         name of a function in `Uses`. Only the second can be missing. */
      if (typeof e.use === 'string' && !(typeof Uses !== 'undefined' && typeof Uses[e.use] === 'function')) {
        fault('error', '`use: ' + Emit.str(e.use) + '` has no handler in `Uses`, so drinking or '
          + 'eating this does nothing at all.', { field: 'use' });
      }
      /* Can anything actually put this in your hands? Three ways in, and the
         third is why the first version of this check cried wolf on six items
         that were perfectly reachable: a quest reward is handed over by
         `Item.give(q.rw.item)`, which is a call built out of a VARIABLE and so
         invisible to Writing's regex. The table has to be asked directly. */
      if (!this.reachable(id)) {
        fault('warn', 'Nothing can put this in your hands: no shop stocks it, no line of writing '
          + 'calls Item.give(' + Emit.str(id) + '), it is not a job’s reward, and no arcade '
          + 'cabinet hands it over.', { field: 'n' });
      }
    }

    if (kind === 'shop') {
      if (!String(e.title || '').trim()) fault('error', 'No title.', { field: 'title' });
      const stock = Prog.shelf(e);
      if (!stock.length) fault('warn', 'Nothing on the shelf, so opening it shows an empty shop.', { field: 'stock' });
      stock.forEach(s => {
        if (!ITEMS[s]) {
          fault('error', '“' + s + '” is on the shelf and there is no such item, so the row is a '
            + 'hole the shop cannot draw.', { field: 'stock' });
        }
      });
      const dupes = stock.filter((s, i) => stock.indexOf(s) !== i);
      if (dupes.length) fault('warn', 'Stocked twice: ' + Array.from(new Set(dupes)).join(', '), { field: 'stock' });
    }

    if (kind === 'skill') {
      if (!String(e.name || '').trim()) fault('error', 'No branch name.', { field: 'name' });
      const list = live ? Prog.skills() : (e.list || {});
      if (!Object.keys(list).length) fault('warn', 'No skills in this branch, so it is an empty column.', { field: 'list' });
      Object.keys(list).forEach(sid => {
        const sk = list[sid];
        if (!String(sk.n || '').trim()) fault('error', '“' + sid + '” has no name.', { skill: sid });
        if (!(sk.max > 0)) fault('error', '“' + sid + '” has a max of ' + JSON.stringify(sk.max)
          + ', so it can never be bought.', { skill: sid });
        /* A skill nothing reads is three points spent on nothing. */
        if (typeof Writing !== 'undefined') {
          const reads = Writing.index().filter(x => x.src.indexOf("'" + sid + "'") >= 0
            || x.src.indexOf('"' + sid + '"') >= 0);
          if (!reads.length && !this.engineReads(sid) && !this.gatesAMove(sid)) {
            fault('warn', '“' + sid + '” is never read — no Sk.rank(' + Emit.str(sid) + ') anywhere '
              + 'in the writing or the engine, and no move is gated on it. Buying it does nothing '
              + 'at all.', { skill: sid });
          }
        }
      });
    }

    if (kind === 'ach') {
      if (!String(e.n || '').trim()) fault('error', 'No name.', { field: 'n' });
      if (!String(e.d || '').trim()) fault('warn', 'No description, so the list says what it is called and nothing else.', { field: 'd' });
      /* The one that matters. An achievement nothing hands out is one no player
         can ever earn, and there is no way to tell from the table. */
      if (typeof Writing !== 'undefined') {
        const given = Writing.calls('Ach', 'get').filter(c => c.id === id);
        if (!given.length && !this.engineReads(id) && !this.declaredGrant(id)) {
          fault('warn', 'Nothing hands this out. No Ach.get(' + Emit.str(id) + ') anywhere in the '
            + 'writing or the engine, so no player can ever earn it. A call built out of a variable '
            + 'would be invisible here, which is why this is a warning.', { field: 'n' });
        }
      }
    }
    return out;
  },

  /* AN ACHIEVEMENT GRANTED BY A TABLE rather than a call: a BOSSES row's `ach`,
     a level's `drives`, an item's declarative `use.ach`. Data the engine reads,
     so a regular expression over source cannot see it — asked directly, the
     same way a quest reward is. */
  declaredGrant(id) {
    const B = typeof BOSSES !== 'undefined' ? BOSSES : {};
    if (Object.values(B).some(b => b && b.ach === id)) return true;
    const L = typeof LEVELS !== 'undefined' ? LEVELS : {};
    if (Object.values(L).some(l => l && (l.drives || []).some(d => d.ach === id))) return true;
    const I = typeof ITEMS !== 'undefined' ? ITEMS : {};
    return Object.values(I).some(it => it && it.use && typeof it.use === 'object' && it.use.ach === id);
  },

  /* The engine grants a good deal of this itself — a shift survived, a call
     resolved well, a rank reached — and those call sites are not among
     `Writing`'s roots because they are not writing. Same method, different
     roots: read the source of what is already loaded. DECLARED rather than
     crawled, for the reason Writing gives — there is no way to enumerate the
     global lexical scope a classic script writes into, so a list is the honest
     way to say what has been looked at. */
  engineRoots() {
    /* Everything in engine/ that hands something out or reads a rank. Getting
       this list short is how three achievements came back as unearnable when
       they are granted from office.js and input.js — so it is deliberately the
       whole surface rather than the parts that seemed likely. */
    return [
      typeof Combat !== 'undefined' && Combat,
      typeof Player !== 'undefined' && Player,
      typeof Game !== 'undefined' && Game,
      typeof Report !== 'undefined' && Report,
      typeof Phones !== 'undefined' && Phones,
      typeof Interact !== 'undefined' && Interact,
      typeof Panels !== 'undefined' && Panels,
      typeof Menu !== 'undefined' && Menu,
      typeof Boot !== 'undefined' && Boot,
      typeof Shop !== 'undefined' && Shop,
      typeof Item !== 'undefined' && Item,
      typeof Sk !== 'undefined' && Sk,
      typeof Q !== 'undefined' && Q,
      typeof Track !== 'undefined' && Track,
      typeof Uses !== 'undefined' && Uses,
      typeof Ach !== 'undefined' && Ach,
      typeof Rel !== 'undefined' && Rel,
      typeof Save !== 'undefined' && Save,
      typeof Settings !== 'undefined' && Settings,
      typeof UI !== 'undefined' && UI,
      typeof Cut !== 'undefined' && Cut,
      typeof Endings !== 'undefined' && Endings,
      typeof EventSys !== 'undefined' && EventSys,
      typeof Chat !== 'undefined' && Chat,
      typeof Mail !== 'undefined' && Mail,
      typeof Arcade !== 'undefined' && Arcade,
      /* The street, which hands out five of these on its own: four for driving
         and one for hitting five colleagues with something out of the box.
         Missing here, all five read as unearnable — the same blind spot MOVES
         and the minigames were, one file further out. */
      typeof Cars !== 'undefined' && Cars,
      typeof Guns !== 'undefined' && Guns,
    ].filter(Boolean).concat(
      /* The minigames themselves. Each names its achievement literally inside
         its own reward(), so this is the only list that has to know they exist
         — and it asks the host for it rather than repeating it. */
      (typeof Arcade !== 'undefined' && Arcade.catalogue ? (Arcade.catalogue() || []) : []).filter(Boolean)
    );
  },
  /* Top-level FUNCTIONS, which no amount of enumerating object methods will
     ever reach: `a_allthree` is granted inside zoneCheck(), and until this
     list existed the reward editor called it unearnable. Declared, like every
     other root here, because the global lexical scope a classic script writes
     into cannot be enumerated at all. */
  engineFns() {
    return [
      typeof movePlayer !== 'undefined' && movePlayer,
      typeof zoneCheck !== 'undefined' && zoneCheck,
      typeof resetRun !== 'undefined' && resetRun,
      typeof count !== 'undefined' && count,
      typeof HOOKS !== 'undefined' && HOOKS,
      typeof Uses !== 'undefined' && Uses,
      typeof BaseActs !== 'undefined' && BaseActs,
    ].filter(f => typeof f === 'function');
  },
  engineReads(id) {
    if (this._eng === undefined) {
      const parts = [];
      this.engineRoots().forEach(o => Object.keys(o).forEach(k => {
        if (typeof o[k] === 'function') parts.push(String(o[k]));
      }));
      this.engineFns().forEach(f => parts.push(String(f)));
      this._eng = parts.join('\n');
    }
    return this._eng.indexOf("'" + id + "'") >= 0 || this._eng.indexOf('"' + id + '"') >= 0;
  },

  /* The OTHER way a skill is read, and the one a regular expression over
     source can never see: a move carries `need: 'blame'`, which is a STRING on
     a table rather than a call in a function, and Writing's index only holds
     functions. So the table is asked directly — the same rule, and the same
     reason, as the quest and cabinet tables in reachable() above. Without it
     two skills that unlock two moves read as dead. */
  gatesAMove(id) {
    return typeof MOVES !== 'undefined' && Array.isArray(MOVES)
      && MOVES.some(m => m && m.need === id);
  },

  /* The other direction: the writing naming something that is not in a table.
     Ach.get() on an unknown id THROWS, mid-sentence, in front of the player. */
  dangling() {
    const out = [];
    if (typeof Writing === 'undefined') return out;
    Writing.byId('Ach', 'get').forEach((wheres, id) => {
      if (ACHS[id]) return;
      out.push({ level: 'error', key: null,
        msg: 'Ach.get(' + Emit.str(id) + ') is called in ' + wheres.length + ' place'
          + (wheres.length === 1 ? '' : 's') + ' and there is no such achievement — it throws, '
          + 'mid-sentence, in front of the player: ' + wheres.slice(0, 3).join(', ') });
    });
    Writing.byId('Item', 'give').forEach((wheres, id) => {
      if (ITEMS[id]) return;
      out.push({ level: 'error', key: null,
        msg: 'Item.give(' + Emit.str(id) + ') is called in ' + wheres.length + ' place'
          + (wheres.length === 1 ? '' : 's') + ' and there is no such item, so it hands over '
          + 'nothing, quietly: ' + wheres.slice(0, 3).join(', ') });
    });
    Writing.byId('Shop', 'open').forEach((wheres, id) => {
      if (SHOP[id]) return;
      out.push({ level: 'error', key: null,
        msg: 'Shop.open(' + Emit.str(id) + ') is called in ' + wheres.length + ' place'
          + (wheres.length === 1 ? '' : 's') + ' and there is no such shop.' });
    });
    return out;
  },
};
Object.assign(ProgCheck, FAULTS);
