'use strict';
/* ---------------- What you get for it ----------------
   What the player earns, carries, buys and unlocks. Four data tables, mostly
   in data/items.js, all round-tripping exactly:
     ITEMS   what you carry, wear and drink
     SHOP    what the machines and shops sell
     SKILLS  the tree, in branches
     ACHS    the achievements
   The joins, each checked by nobody else:
     SHOP.stock[]    names an ITEMS key
     ITEMS[].use     names a `Uses` handler
     ITEMS[].slot    a key of P.equipment (GAME.slots)
     ITEMS[].eff     keys Player.recalc() reads; others are ignored
     ACHS[id]        granted by Ach.get(id) somewhere, or unearnable
     SKILLS[..]      read by Sk.rank(id) or carrying `eff`, or dead
   The last two are invisible in play; Writing answers them by reading the
   loaded source. */

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
  SLOTS: GAME.slots,
  EFFECTS: ['empathy', 'knowledge', 'bullshit', 'chaos', 'patience', 'energy'],
  /* What a skill's `eff` may add to, per rank. */
  SKILL_EFFECTS: ['empathy', 'knowledge', 'bullshit', 'chaos', 'patMax', 'eneMax', 'calm', 'winXp'],
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
    /* A getter shelf (it changes with the catch) is code: carried as source. */
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
      if (ITEMS[id] && out.indexOf(id) < 0) out.push(id);
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

  /* The ways an item reaches the player. Quest rewards and cabinets hand over by
     variable, invisible to a regex, so those tables are asked directly. */
  reachable(id) {
    const stocked = Object.keys(SHOP).some(s => Prog.shelf(SHOP[s]).indexOf(id) >= 0);
    if (stocked) return true;
    if (Object.keys(QUESTS).some(q => ((QUESTS[q] || {}).rw || {}).item === id)) return true;
    if (this.cabinetGives(id)) return true;
    if (this.tableGives().has(id)) return true;
    if (Writing.calls('Item', 'give').some(c => c.id === id)) return true;
    /* Starting kit and anything the engine hands over by name. */
    return this.engineReads(id);
  },
  /* A cabinet's item on first win, from the editor's copy where open. */
  cabinetGives(id) {
    const live = Games.id && Games.cabs
      ? Games.table().filter(c => c.game !== Games.id).concat(Games.cabs)
      : (Array.isArray(CABINETS) ? CABINETS : []);
    return live.some(c => c && c.item === id);
  },

  /* Production tables (CROPS, nodes, crafting stations) also give by variable:
     roots, read fresh. */
  tableGives() {
    const out = new Set();
    const outs = list => (Array.isArray(list) ? list : []).forEach(r => { if (r && r.out) out.add(r.out); });
    Object.keys(CROPS).forEach(k => out.add(k));
    Object.keys(NODES).forEach(k => {
      ((NODES[k] || {}).gives || []).concat((NODES[k] || {}).extra || []).forEach(g => out.add(g[0]));
    });
    outs(RECIPES);
    outs(WORKBENCH);
    outs(KILN.recipes);
    outs(OVEN);
    outs(RACK.recipes);
    return out;
  },

  /* What else names this thing, for the delete question. */
  usedBy(kind, id) {
    const out = [];
    if (kind === 'item') {
      (Array.isArray(CABINETS) ? CABINETS : [])
        .forEach(c => { if (c.item === id) out.push('the ' + c.game + ' cabinet on ' + c.use); });
      Object.keys(SHOP).forEach(s => {
        if (Prog.shelf(SHOP[s]).indexOf(id) >= 0) out.push('the ' + (SHOP[s].title || s));
      });
      Writing.calls('Item', 'give').filter(c => c.id === id).forEach(c => out.push(c.where));
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
      if (typeof e.use === 'string' && !(typeof Uses[e.use] === 'function')) {
        fault('error', '`use: ' + Emit.str(e.use) + '` has no handler in `Uses`, so drinking or '
          + 'eating this does nothing at all.', { field: 'use' });
      }
      /* Can anything put this in your hands? Tables that give by variable are asked
         directly. */
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
        Object.keys(sk.eff || {}).forEach(k => {
          if (Prog.SKILL_EFFECTS.indexOf(k) < 0) fault('error', '“' + sid + '” has effect “' + k
            + '”, which is not one Player.recalc() reads (' + Prog.SKILL_EFFECTS.join(', ') + ').', { skill: sid });
        });
        /* A skill with no effect that nothing reads is points spent on nothing. */
        if (!Object.keys(sk.eff || {}).length) {
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
      {
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

  /* Achievements granted by tables (a BOSSES `ach`, a level's `drives`, an
     item's `use.ach`), asked directly. */
  declaredGrant(id) {
    const B = BOSSES;
    if (Object.values(B).some(b => b && b.ach === id)) return true;
    const L = LEVELS;
    if (Object.values(L).some(l => l && (l.drives || []).some(d => d.ach === id))) return true;
    const I = ITEMS;
    return Object.values(I).some(it => it && it.use && typeof it.use === 'object' && it.use.ach === id);
  },

  /* The engine grants some itself; its call sites are roots too. Declared,
     since the global lexical scope cannot be enumerated. */
  engineRoots() {
    /* Everything in engine/ that grants something or reads a rank: the whole
       surface, not the likely parts. */
    return [
      Combat,
      Player,
      typeof Game !== 'undefined' && Game,
      Report,
      Phones,
      Interact,
      Panels,
      Menu,
      typeof Boot !== 'undefined' && Boot,
      Shop,
      Item,
      Sk,
      Q,
      Track,
      Uses,
      Ach,
      Rel,
      Save,
      Settings,
      UI,
      typeof Cut !== 'undefined' && Cut,
      Endings,
      EventSys,
      Chat,
      Mail,
      Arcade,
      /* The street grants driving and weapon achievements. */
      Cars,
      Guns,
      /* Swimming and jumping grant theirs (engine/moves.js). */
      typeof Moves !== 'undefined' && Moves,
    ].filter(Boolean).concat(
      /* Each minigame names its achievement in its own reward(); asked of the host. */
      (Arcade.catalogue ? (Arcade.catalogue() || []) : []).filter(Boolean)
    );
  },
  /* Top-level functions (zoneCheck() grants `a_allthree`), declared. */
  engineFns() {
    return [
      typeof movePlayer !== 'undefined' && movePlayer,
      typeof zoneCheck !== 'undefined' && zoneCheck,
      typeof resetRun !== 'undefined' && resetRun,
      typeof count !== 'undefined' && count,
      HOOKS,
      Uses,
      BaseActs,
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

  /* A move's `need:` is a skill read from a table, not a call: asked directly. */
  gatesAMove(id) {
    return Array.isArray(MOVES)
      && MOVES.some(m => m && m.need === id);
  },

  /* The other direction: the writing naming something that is not in a table.
     Ach.get() on an unknown id does nothing (engine/progress.js), so the
     achievement is quietly never awarded. */
  dangling() {
    const out = [];
    Writing.byId('Ach', 'get').forEach((wheres, id) => {
      if (ACHS[id]) return;
      out.push({ level: 'warn', key: null,
        msg: 'Ach.get(' + Emit.str(id) + ') is called in ' + wheres.length + ' place'
          + (wheres.length === 1 ? '' : 's') + ' and there is no such achievement, so it is '
          + 'never awarded: ' + wheres.slice(0, 3).join(', ') });
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
