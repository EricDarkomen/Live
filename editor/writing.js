'use strict';
/* ---------------- Where in the writing something is named ----------------
   A quest is started by a line of dialogue calling `Q.start('q_headset')`, and
   nothing anywhere declares that. Neither does anything declare that the
   printer job has four steps and exactly three places that advance it. So the
   faults that matter most in a quest or a conversation are all of the same
   shape: a name in one file that has to exist in another, checked by nobody.

     Q.start('q_kettle')   — a job that is never started is a job nobody sees
     Q.step('q_typo')      — a silent no-op; Q.step returns early if it is not active
     Ach.get('a_typo')     — throws, mid-sentence, in front of the player
     Item.give('mug2')     — gives nothing, quietly

   This is the index that makes those answerable, and it is what turns "check
   this level" into "check this writing". It reads the SOURCE of the functions
   that are already loaded — `String(fn)` — rather than fetching files, because
   the page cannot fetch a local file (that is the whole `file://` rule this
   project is built on) and because the functions are right here.

   The roots are declared rather than crawled. There is no way to enumerate the
   global lexical scope a classic script writes into — `window.Acts` is
   undefined while bare `Acts` works — so a crawl is not available even in
   principle, and a declared list is honest about what has been looked at. */

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
    /* EVENTS is a table of one-off office happenings, each with a go() that is
       as much writing as any act — free pizza in the break room hands over an
       item, and the reward editor called that item unobtainable until this list
       included it. A root missing here is a call site nothing can see. */
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
     ['BaseActs', typeof BaseActs !== 'undefined' && BaseActs]].forEach(([label, obj]) => {
      if (!obj) return;
      Object.keys(obj).forEach(k => add(label + '.' + k, obj[k]));
    });

    /* MOVES are the player's own lines, and their run() is where a move does
       what it does — hands out an achievement, counts a transfer, reads a
       skill. As much writing as any act, and leaving them out made the reward
       editor call three achievements unearnable and three skills dead when all
       six were used right here. */
    if (typeof MOVES !== 'undefined' && Array.isArray(MOVES)) {
      MOVES.forEach(m => {
        if (!m) return;
        Object.keys(m).forEach(k => add('move ' + (m.id || m.n || '?') + '.' + k, m[k]));
      });
    }
    /* A minigame's reward() is where it hands out its achievement, and the
       arcade host is where the round is paid out at all. A root missing here is
       a call site nothing can see: without it the reward editor calls five
       perfectly earnable achievements unearnable, which is the same blind spot
       leaving MOVES out once opened. Arcade.catalogue() is the games' own
       declaration of themselves, so a fourth game is covered for nothing. */
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

    this._index = out;
    return out;
  },

  /* Every string literal handed to `Callee.method(` anywhere in the writing,
     with where it was. Deliberately a regular expression over source and not a
     parse: the calls being looked for are all of the form `Q.step('q_x')`, on
     one line, with a literal first argument — that is the whole convention this
     codebase writes them in, and a real parser buys nothing but a dependency.
     A call built out of a variable is invisible here, which is the honest limit
     and why every count below is reported as "found", never as "all". */
  calls(callee, method) {
    const re = new RegExp('\\b' + callee + '\\.' + method + '\\(\\s*[\'"]([^\'"]+)[\'"]', 'g');
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
