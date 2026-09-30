'use strict';
/* ---------------- Where in the writing something is named ----------------
   Nothing declares which line starts a quest or advances it, so the faults
   that matter are names that must exist elsewhere:
     Q.start('q_kettle')  a job never started is never seen
     Q.step('q_typo')     a silent no-op
     Ach.get('a_typo')    throws mid-sentence
     Item.give('mug2')    gives nothing, quietly
   This index reads `String(fn)` of the loaded functions (no fetching under
   file://). Roots are declared, since a classic script's global lexical scope
   cannot be enumerated (`window.Acts` is undefined while `Acts` works). */

const Writing = {
  /* Built once. Nothing in it changes while the tab is open: these are the
     game's own functions, and the editor never rewrites them — it emits source
     for somebody else to paste. */
  _index: null,

  index() {
    if (this._index) return this._index;
    const out = [];
    const add = (where, fn) => {
      if (typeof fn !== 'function') return;
      try { out.push({ where: where, src: String(fn) }); } catch (_) { /* exotic; skip */ }
    };

    /* One entry per `use:` handler, which is where most of the acts live. */
    if (typeof Acts !== 'undefined') {
      Object.keys(Acts).forEach(k => add('Acts.' + k, Acts[k]));
    }
    /* The engine drives some of it too — finishing a boss call completes a job,
       and signing the biscuit rota is a panel button. */
    /* EVENTS' go() is writing too (free pizza hands out an item). */
    if (typeof EVENTS !== 'undefined' && Array.isArray(EVENTS)) {
      EVENTS.forEach(e => {
        if (!e) return;
        Object.keys(e).forEach(k => add('event ' + (e.id || e.t || '?') + '.' + k, e[k]));
      });
    }
    [['Combat', typeof Combat !== 'undefined' && Combat],
     ['Panels', typeof Panels !== 'undefined' && Panels],
     ['Shop', typeof Shop !== 'undefined' && Shop],
     ['Endings', typeof Endings !== 'undefined' && Endings],
     ['Chat', typeof Chat !== 'undefined' && Chat],
     ['Mail', typeof Mail !== 'undefined' && Mail],
     ['EventSys', typeof EventSys !== 'undefined' && EventSys],
     /* The game's own code on engine events, its bespoke item uses, and the
        engine's default acts — each as much writing as an act. */
     ['HOOKS', typeof HOOKS !== 'undefined' && HOOKS],
     ['Uses', typeof Uses !== 'undefined' && Uses],
     ['BaseActs', typeof BaseActs !== 'undefined' && BaseActs],
     /* The island's systems: data/garden.js, data/farm.js, data/craft.js and
        engine/mind.js. */
     ['Garden', typeof Garden !== 'undefined' && Garden],
     ['Blender', typeof Blender !== 'undefined' && Blender],
     ['Orders', typeof Orders !== 'undefined' && Orders],
     ['Dates', typeof Dates !== 'undefined' && Dates],
     ['Farm', typeof Farm !== 'undefined' && Farm],
     ['Larder', typeof Larder !== 'undefined' && Larder],
     ['Stations', typeof Stations !== 'undefined' && Stations],
     ['Hunger', typeof Hunger !== 'undefined' && Hunger],
     ['NPC_ACTS', typeof NPC_ACTS !== 'undefined' && NPC_ACTS],
     ['Gear', typeof Gear !== 'undefined' && Gear],
     ['Craft', typeof Craft !== 'undefined' && Craft],
     ['Build', typeof Build !== 'undefined' && Build],
     ['Mind', typeof Mind !== 'undefined' && Mind]].forEach(([label, obj]) => {
      if (!obj) return;
      Object.keys(obj).forEach(k => add(label + '.' + k, obj[k]));
    });

    /* MOVES' run() grants achievements, counts, and reads skills. */
    if (typeof MOVES !== 'undefined' && Array.isArray(MOVES)) {
      MOVES.forEach(m => {
        if (!m) return;
        Object.keys(m).forEach(k => add('move ' + (m.id || m.n || '?') + '.' + k, m[k]));
      });
    }
    /* Minigames' reward() and the arcade host, via Arcade.catalogue(). */
    if (typeof Arcade !== 'undefined') {
      Object.keys(Arcade).forEach(k => add('Arcade.' + k, Arcade[k]));
      let games = [];
      try { games = Arcade.catalogue() || []; } catch (_) { games = []; }
      games.forEach(g => {
        if (!g) return;
        Object.keys(g).forEach(k => add('minigame ' + (g.id || g.name || '?') + '.' + k, g[k]));
      });
    }
    /* And the people, which is where the rest of it lives. Every place a node
       can carry code, named so the answer to "where" is somewhere you can go. */
    if (typeof NPCS !== 'undefined') NPCS.forEach(p => {
      add(p.id + ' · entry()', p.entry);
      /* And the code a person carries outside their tree — `onGift()`, the
         `if:` on a reply in `more` — which islander() calls on their behalf. */
      Object.keys(p).filter(k => k !== 'entry' && k !== 'nodes')
        .forEach(k => this.deep(p.id + ' · ' + k, p[k], add));
      Object.keys(p.nodes || {}).forEach(id => {
        const n = p.nodes[id];
        add(p.id + ' · ' + id + '.text()', n.text);
        add(p.id + ' · ' + id + '.do()', n.do);
        (n.choices || []).forEach((c, i) => {
          add(p.id + ' · ' + id + ' choice ' + (i + 1) + ' .if', c.if);
          add(p.id + ' · ' + id + ' choice ' + (i + 1) + ' .do', c.do);
          add(p.id + ' · ' + id + ' choice ' + (i + 1) + ' .t', c.t);
        });
      });
    });
    if (typeof CALLERS !== 'undefined') {
      const list = Array.isArray(CALLERS) ? CALLERS : Object.values(CALLERS);
      list.forEach((c, i) => {
        const label = 'caller ' + (c.name || c.id || i);
        Object.keys(c).forEach(k => add(label + '.' + k, c[k]));
      });
    }

    /* What the islanders run on their own — a routine's onUnlock() and onDone()
       are where Tito's job moves, several levels down in data/minds.js. */
    if (typeof MINDS !== 'undefined') {
      Object.keys(MINDS).forEach(id => this.deep('mind ' + id, MINDS[id], add));
    }

    this._index = out;
    return out;
  },
  /* Every function anywhere inside a value, a few levels down. */
  deep(where, v, add, depth) {
    if (typeof v === 'function') { add(where, v); return; }
    if (!v || typeof v !== 'object' || (depth || 0) > 5) return;
    Object.keys(v).forEach(k => this.deep(where + '.' + k, v[k], add, (depth || 0) + 1));
  },

  /* data/garden.js's shorthand: qTo(id, n) is Q.step to step n, qAt(id, n) reads
     Q.active. */
  ALIASES: { 'Q.step': ['qTo'], 'Q.active': ['qAt'] },

  /* Every string literal passed to `Callee.method(` in the writing, with where.
     A regex over source, by convention (a literal first argument on one line);
     calls built from variables are invisible, so counts are "found", not "all". */
  calls(callee, method) {
    const names = [callee + '\\.' + method].concat(this.ALIASES[callee + '.' + method] || []);
    const re = new RegExp('\\b(?:' + names.join('|') + ')\\(\\s*[\'"]([^\'"]+)[\'"]', 'g');
    const out = [];
    this.index().forEach(e => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(e.src))) out.push({ id: m[1], where: e.where });
    });
    return out;
  },
  /* The same, grouped by the id named. */
  byId(callee, method) {
    const map = new Map();
    this.calls(callee, method).forEach(c => {
      if (!map.has(c.id)) map.set(c.id, []);
      map.get(c.id).push(c.where);
    });
    return map;
  },

  /* What the writing does with one job. */
  job(id) {
    const of = (callee, method) => this.calls(callee, method).filter(c => c.id === id).map(c => c.where);
    return {
      start: of('Q', 'start'),
      step: of('Q', 'step'),
      complete: of('Q', 'complete'),
      reads: of('Q', 'active').concat(of('Q', 'complete2')),
    };
  },

  /* Every id named by a kind of call anywhere, so a check can ask the other
     question: is anything being named that does not exist? */
  named(callee, method) { return Array.from(this.byId(callee, method).keys()); }
};
