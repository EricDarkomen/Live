'use strict';
/* ---------------- The conversation being edited ----------------
   A person in data/npcs.js is a definition plus a tree of nodes. Prose,
   choices and `to` links are data and round-trip exactly. `do()`, `if:` and
   function `text` are code, captured as source and carried through verbatim,
   never run or regenerated here. Editing a `do()` edits exported text only.
   Nothing is written into NPCS: the export is the deliverable, Revert reloads. */

const Talk = {
  id: null,
  name: '', role: '', face: '', lines: [],
  /* Desk, minimap colour and schedule live in the same entry and fail silently
     (a schedule naming a missing waypoint leaves them at their desk all day). */
  desk: [1, 1], colour: '#8d9bb5', schedule: [],
  entrySrc: null,
  /* Node ids in file order, so the export diffs cleanly. */
  order: [],
  nodes: {},
  base: null, undoStack: [], redoStack: [],

  ids() { return (typeof NPCS !== 'undefined' ? NPCS : []).map(p => p.id); },
  person(id) { return (typeof NPCS !== 'undefined' ? NPCS : []).find(p => p.id === (id || this.id)); },

  /* ---- capture ---- */
  load(id) {
    const p = this.person(id);
    if (!p) return false;
    this.id = id;
    this.name = p.name || id;
    this.role = p.role || '';
    this.face = p.face || '';
    this.lines = clone(p.lines || []);
    this.desk = clone(p.desk || [1, 1]);
    this.colour = p.colour || '#8d9bb5';
    /* [minutes, where] pairs. `desk` is the one destination that is not a
       waypoint: it means their own, wherever that has been moved to. */
    this.schedule = clone(p.schedule || []);
    /* Whether the file had `schedule` and `lines` at all: shopkeepers have
       neither, and the export must not invent empty ones. */
    this.hadSchedule = Array.isArray(p.schedule);
    this.hadLines = Array.isArray(p.lines);
    this.entrySrc = typeof p.entry === 'function' ? String(p.entry) : null;
    /* Every field this editor does not model, kept verbatim and written back, so
       new fields never need editor changes. `entry` and `nodes` are modelled. */
    const MODELLED = ['id', 'name', 'role', 'face', 'lines', 'desk', 'colour', 'schedule', 'entry', 'nodes'];
    this.extra = {};
    Object.keys(p).forEach(k => { if (MODELLED.indexOf(k) < 0) this.extra[k] = capture(p[k]); });
    /* islander() people get inherited nodes (flirt, gift, practise, date,
       `again`): loaded so links check, and omitted on export (Talk.inherited(),
       Emit.talkPerson()). */
    this.wrap = p.islander ? { who: p.islander.who } : null;
    this.made = p.islander ? p.islander.made.slice() : [];
    this.order = Object.keys(p.nodes || {});
    this.nodes = {};
    this.order.forEach(k => { this.nodes[k] = this.grab(p.nodes[k]); });
    this.rebase();
    return true;
  },
  /* One node, split into the half that is data and the half that is source. */
  grab(n) {
    const out = {
      text: Array.isArray(n.text) ? clone(n.text) : (typeof n.text === 'string' ? [n.text] : null),
      textSrc: typeof n.text === 'function' ? String(n.text) : null,
      to: typeof n.to === 'string' ? n.to : null,
      doSrc: typeof n.do === 'function' ? String(n.do) : null,
      doneSrc: typeof n.done === 'function' ? String(n.done) : null,
      choices: (n.choices || []).map(c => ({
        t: typeof c.t === 'string' ? c.t : '',
        tSrc: typeof c.t === 'function' ? String(c.t) : null,
        to: typeof c.to === 'string' ? c.to : null,
        ifSrc: typeof c.if === 'function' ? String(c.if) : null,
        doSrc: typeof c.do === 'function' ? String(c.do) : null,
      }))
    };
    return out;
  },

  state() {
    return clone({ name: this.name, role: this.role, face: this.face, lines: this.lines,
      desk: this.desk, colour: this.colour, schedule: this.schedule, extra: this.extra,
      entrySrc: this.entrySrc, order: this.order, nodes: this.nodes,
      wrap: this.wrap || null, made: this.made || [] });
  },
  /* A node islander() writes rather than the file. */
  inherited(id) { return (this.made || []).indexOf(id) >= 0; },
  restore(s) { Object.keys(s).forEach(k => this[k] = clone(s[k])); },
  rebuild() {
    TalkCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },

  /* ---- reading ---- */
  node(id) { return this.nodes[id] || null; },
  /* The first page of a node, for a list that has to say which node this is
     without showing all of it. */
  gist(id) {
    const n = this.nodes[id];
    if (!n) return '';
    if (n.textSrc) return '(written in code)';
    const t = (n.text || [])[0] || '';
    return t.length > 90 ? t.slice(0, 88) + '…' : t;
  },
  /* Where a node is entered from: every `to` naming it. */
  incoming(id) {
    const out = [];
    this.order.forEach(k => {
      const n = this.nodes[k];
      if (n.to === id) out.push({ from: k, via: null });
      (n.choices || []).forEach((c, i) => { if (c.to === id) out.push({ from: k, via: i }); });
    });
    return out;
  },
  outgoing(id) {
    const n = this.nodes[id];
    if (!n) return [];
    const out = [];
    if (n.to) out.push({ to: n.to, via: null });
    (n.choices || []).forEach((c, i) => { if (c.to) out.push({ to: c.to, via: i }); });
    return out;
  },
  /* Nodes a conversation can start at: the quoted literals entry() can return,
     plus `again` (Dialogue.openNPC()'s fallback). */
  roots() {
    const found = new Set();
    if (this.entrySrc) {
      const re = /['"]([A-Za-z_$][\w$]*)['"]/g;
      let m;
      while ((m = re.exec(this.entrySrc))) found.add(m[1]);
    }
    found.add('again');
    /* Only the ones that are actually nodes: entry() also names flags and quest
       ids, and those are not places the conversation can start. */
    return Array.from(found).filter(k => this.nodes[k]);
  },
  /* Every node you can get to from a root. The dialogue equivalent of the flood
     fill: a node nobody can reach is writing nobody will ever read. */
  reachable() {
    const seen = new Set();
    const queue = this.roots();
    queue.forEach(k => seen.add(k));
    while (queue.length) {
      const k = queue.pop();
      this.outgoing(k).forEach(e => {
        if (seen.has(e.to) || !this.nodes[e.to]) return;
        seen.add(e.to); queue.push(e.to);
      });
    }
    return seen;
  },

  /* ---- editing ---- */
  setField(k, v) {
    this.mark('edit ' + this.name);
    this[k] = v;
    this.rebuild();
  },
  setDesk(x, y) {
    this.mark('move ' + this.name + '\u2019s desk');
    this.desk = [x, y];
    this.rebuild();
  },
  /* The schedule is ordered [minute, destination]; NPCM takes the last passed. */
  setStop(i, k, v) {
    if (!this.schedule[i]) return false;
    this.mark('edit the schedule');
    this.schedule[i][k === 'at' ? 0 : 1] = v;
    this.schedule.sort((a, b) => a[0] - b[0]);
    this.rebuild();
    return true;
  },
  addStop() {
    this.mark('add a stop');
    const last = this.schedule[this.schedule.length - 1];
    this.schedule.push([Math.min(1020, (last ? last[0] : 480) + 60), 'desk']);
    this.schedule.sort((a, b) => a[0] - b[0]);
    this.rebuild();
  },
  removeStop(i) {
    if (!this.schedule[i]) return false;
    this.mark('delete a stop');
    this.schedule.splice(i, 1);
    this.rebuild();
    return true;
  },
  /* Which sheet draws them, from the game's tables. */
  sprite() {
    const r = typeof Sprites !== 'undefined' && Sprites.rows.get(this.id);
    return r ? { sheet: r.sheet.id, row: r.row, ok: r.sheet.ok } : null;
  },
  setLines(list) {
    this.mark('edit the one-liners');
    this.lines = list;
    this.rebuild();
  },
  setText(id, lines) {
    const n = this.nodes[id];
    if (!n) return false;
    this.mark('edit ' + id);
    n.text = lines;
    this.rebuild();
    return true;
  },
  setTo(id, to) {
    const n = this.nodes[id];
    if (!n) return false;
    this.mark('re-point ' + id);
    n.to = to || null;
    this.rebuild();
    return true;
  },
  setCode(id, field, src) {
    const n = this.nodes[id];
    if (!n) return false;
    this.mark('edit the code on ' + id);
    n[field] = src && src.trim() ? src : null;
    this.rebuild();
    return true;
  },
  setChoice(id, i, k, v) {
    const c = ((this.nodes[id] || {}).choices || [])[i];
    if (!c) return false;
    this.mark('edit a reply on ' + id);
    c[k] = v === '' && k === 'to' ? null : v;
    this.rebuild();
    return true;
  },
  addChoice(id) {
    const n = this.nodes[id];
    if (!n) return false;
    this.mark('add a reply to ' + id);
    n.choices = n.choices || [];
    n.choices.push({ t: '', tSrc: null, to: null, ifSrc: null, doSrc: null });
    this.rebuild();
    return true;
  },
  removeChoice(id, i) {
    const n = this.nodes[id];
    if (!n || !n.choices || !n.choices[i]) return false;
    this.mark('delete a reply from ' + id);
    n.choices.splice(i, 1);
    if (!n.choices.length) n.choices = [];
    this.rebuild();
    return true;
  },
  moveChoice(id, i, d) {
    const n = this.nodes[id];
    const j = i + d;
    if (!n || !n.choices || j < 0 || j >= n.choices.length) return false;
    this.mark('reorder the replies on ' + id);
    [n.choices[i], n.choices[j]] = [n.choices[j], n.choices[i]];
    this.rebuild();
    return true;
  },
  addNode(id) {
    if (this.nodes[id]) return false;
    this.mark('add ' + id);
    this.nodes[id] = { text: ['…'], textSrc: null, to: null, doSrc: null, doneSrc: null, choices: [] };
    this.order.push(id);
    this.rebuild();
    return true;
  },
  removeNode(id) {
    if (!this.nodes[id]) return false;
    this.mark('delete ' + id);
    delete this.nodes[id];
    this.order = this.order.filter(k => k !== id);
    this.rebuild();
    return true;
  },
  /* Renaming a node rewrites every `to` and the quoted literal in entry(): a
     mechanical substitution. Other code naming it is reported, not changed. */
  renameNode(from, to) {
    if (!this.nodes[from] || this.nodes[to] || !/^[A-Za-z_$][\w$]*$/.test(to)) return false;
    this.mark('rename ' + from);
    this.nodes[to] = this.nodes[from];
    delete this.nodes[from];
    this.order = this.order.map(k => (k === from ? to : k));
    this.order.forEach(k => {
      const n = this.nodes[k];
      if (n.to === from) n.to = to;
      (n.choices || []).forEach(c => { if (c.to === from) c.to = to; });
    });
    if (this.entrySrc) {
      this.entrySrc = this.entrySrc.replace(
        new RegExp("(['\"])" + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\1", 'g'),
        "'" + to + "'");
    }
    this.rebuild();
    return true;
  }
};
Object.assign(Talk, HIST);

/* ---------------- What is wrong with a conversation ----------------
   A dangling `to` closes the box; an unreachable node is never read; a `do()`
   naming a missing achievement throws mid-sentence (Dialogue.setNode catches
   it, so the line silently does nothing). */

const TalkCheck = {
  faults: [], perNode: new Map(),

  run() {
    this.faults = [];
    this.perNode = new Map();
    const flag = (id, level) => {
      if (level === 'error' || !this.perNode.has(id)) this.perNode.set(id, level);
    };
    const fault = (level, msg, extra) => {
      const f = Object.assign({ level: level, msg: msg }, extra || {});
      this.faults.push(f);
      if (f.node) flag(f.node, level);
      return f;
    };

    const ids = Talk.order;
    if (!ids.length) return this;

    /* ---- the person, not the tree ----
       Desk, schedule and sprite: invisible in play until wrong. */
    this.person();

    /* ---- the way in ---- */
    const roots = Talk.roots();
    if (!roots.length) {
      fault('error', 'Nothing can open this conversation: entry() names no node that exists, and '
        + 'there is no `again` to fall back on.');
    }
    if (Talk.entrySrc) {
      const re = /return\s+['"]([A-Za-z_$][\w$]*)['"]/g;
      let m;
      while ((m = re.exec(Talk.entrySrc))) {
        if (!Talk.nodes[m[1]]) {
          fault('error', 'entry() returns “' + m[1] + '”, which is not a node. '
            + 'Dialogue.openNPC falls back to `again`, so the conversation silently starts '
            + 'somewhere else.');
        }
      }
    }

    /* ---- the links ---- */
    ids.forEach(id => {
      const n = Talk.nodes[id];
      if (n.to && !Talk.nodes[n.to]) {
        fault('error', '“' + id + '” continues to “' + n.to + '”, which is not a node. '
          + 'Dialogue.advance() closes the box instead, which reads as the end of the '
          + 'conversation.', { node: id });
      }
      (n.choices || []).forEach((c, i) => {
        if (c.to && !Talk.nodes[c.to]) {
          fault('error', 'Reply ' + (i + 1) + ' on “' + id + '” goes to “' + c.to + '”, which is '
            + 'not a node — so it ends the conversation.', { node: id, choice: i });
        }
        if (!c.t && !c.tSrc) {
          fault('warn', 'Reply ' + (i + 1) + ' on “' + id + '” has no text on it.',
            { node: id, choice: i });
        }
      });
      if (!n.text && !n.textSrc) {
        fault('warn', '“' + id + '” has nothing to say. The box opens on an empty line.',
          { node: id });
      }
      if (!n.to && !(n.choices || []).length && n.text && !n.text.length) {
        fault('warn', '“' + id + '” has no text, no replies and nowhere to go.', { node: id });
      }
      /* House style. Everything the player reads uses a curly apostrophe, and a
         straight one is the kind of thing that is invisible until it is beside
         one that isn't. */
      const prose = (n.text || []).concat((n.choices || []).map(c => c.t));
      if (prose.some(t => /\w'\w/.test(t || ''))) {
        fault('warn', '“' + id + '” uses a straight apostrophe. Everything else the player reads '
          + 'uses a curly one.', { node: id });
      }
    });

    /* ---- the shared moves ----
       islander() writes these, for everybody at once, so an edit here has
       nowhere to go: the export leaves them out and the game rebuilds them. */
    (Talk.made || []).forEach(id => {
      const was = Talk.base && Talk.base.nodes ? Talk.base.nodes[id] : null;
      if (was && JSON.stringify(was) !== JSON.stringify(Talk.nodes[id])) {
        fault('warn', '“' + id + '” is one of the shared moves islander() gives everybody, so this '
          + 'edit will not be saved. Change it in islander() at the top of data/npcs.js.', { node: id });
      }
    });

    /* ---- writing nobody will read ---- */
    const seen = Talk.reachable();
    const marooned = ids.filter(k => !seen.has(k));
    marooned.forEach(k => fault('warn', '“' + k + '” cannot be reached: no `to` names it and '
      + 'entry() cannot return it. It is writing nobody will ever see.', { node: k }));

    /* ---- what the code names ----
       Read from captured source by convention (a literal first argument on one
       line), so it reports only what it finds. */
    ids.forEach(id => {
      const n = Talk.nodes[id];
      const bits = [n.doSrc, n.doneSrc, n.textSrc]
        .concat((n.choices || []).map(c => c.doSrc))
        .concat((n.choices || []).map(c => c.ifSrc))
        .filter(Boolean);
      if (!bits.length) return;
      const src = bits.join('\n');
      this.NAMES.forEach(rule => {
        const re = new RegExp('\\b' + rule.call.replace('.', '\\.') + '\\(\\s*[\'"]([^\'"]+)[\'"]', 'g');
        let m;
        while ((m = re.exec(src))) {
          if (rule.has(m[1])) continue;
          fault('error', 'The code on “' + id + '” calls ' + rule.call + '(' + Emit.str(m[1]) + '), '
            + 'and ' + rule.what + '.', { node: id });
        }
      });
    });

    return this;
  },

  /* The half of a person that is not what they say. Checked against the level
     the schedules are for — WP is one table and it is the hub's. */
  /* Which floor their desk is on: `level` from the unmodelled fields, default
     the hub (as NPCM does). */
  deskLevel() {
    return (Talk.extra && Talk.extra.level) || Levels.hub();
  },

  person() {
    const fault = (level, msg, extra) => {
      this.faults.push(Object.assign({ level: level, msg: msg }, extra || {}));
    };
    const [dx, dy] = Talk.desk || [];
    if (typeof dx !== 'number' || typeof dy !== 'number') {
      fault('error', 'No desk. NPCM falls back to it for every destination it cannot resolve, '
        + 'so a person without one has nowhere to be.');
    } else if (dx < 0 || dy < 0 || dx >= MAPW || dy >= MAPH) {
      fault('warn', 'Their desk at (' + dx + ',' + dy + ') is off the level that is open. '
        + 'A desk is on the level that person works on, so this is only a fault if that is '
        + 'what you are looking at.');
    /* Only when their own level is the one built (`Doc.id`; Levels.current is
       null in the editor). Otherwise the check would test the wrong floor plan. */
    } else if (this.deskLevel() === Doc.id && World.isSolid(dx, dy)) {
      fault('error', 'Their desk at (' + dx + ',' + dy + ') is inside something solid. They spawn '
        + 'there and spend the morning shouldering it.');
    }

    /* Every stop has to name somewhere they can be sent. `desk` is the one
       destination that is not a waypoint. */
    let last = -1;
    (Talk.schedule || []).forEach((stop, i) => {
      const [at, where] = stop;
      if (typeof at !== 'number' || at < 0 || at > 1440) {
        fault('error', 'Stop ' + (i + 1) + ' is at ' + at + ', which is not a time of day.', { stop: i });
      } else {
        /* No bound by the bar's hours: the clock wraps at midnight and NPCM takes the
           last stop passed. */
        if (at <= last) {
          fault('error', 'Stop ' + (i + 1) + ' is at ' + clockStr(at) + ', not after the one before '
            + 'it. NPCM takes the last stop whose time has passed, so one out of order never '
            + 'happens at all.', { stop: i });
        }
        last = at;
      }
      if (where !== 'desk' && !(typeof WP !== 'undefined' && WP[where])) {
        fault('error', 'Stop ' + (i + 1) + ' sends them to “' + where + '”, which is not in WP — '
          + 'so they go to their desk instead, silently, for that whole part of the day.', { stop: i });
      }
    });
    if (!(Talk.schedule || []).length) {
      fault('warn', 'No schedule, so they sit at their desk from nine to five. Several people do; '
        + 'it is only worth knowing that it was a decision.');
    }

    /* Two lists in two files. A person in NPCS with no row on any sheet falls
       back to an emoji among twenty sprites, which is the one art fault that
       looks deliberate. */
    if (!Talk.sprite()) {
      fault('warn', 'Nobody draws them: no sheet claims “' + Talk.id + '”, so they are an emoji '
        + 'among sprites. NPCS and a pack’s roster are two lists in two files — the Art tab is '
        + 'where a sheet claims a row.');
    }
  },

  /* Every call whose first argument must name something that exists. */
  NAMES: [
    { call: 'Q.start', what: 'there is no such job', has: id => typeof QUESTS !== 'undefined' && !!QUESTS[id] },
    { call: 'Q.step', what: 'there is no such job — Q.step returns early, so the line does nothing at all',
      has: id => typeof QUESTS !== 'undefined' && !!QUESTS[id] },
    { call: 'Q.complete', what: 'there is no such job', has: id => typeof QUESTS !== 'undefined' && !!QUESTS[id] },
    { call: 'Ach.get', what: 'there is no such achievement — this throws mid-sentence',
      has: id => typeof ACHS !== 'undefined' && !!ACHS[id] },
    { call: 'Item.give', what: 'there is no such item, so it hands over nothing',
      has: id => typeof ITEMS !== 'undefined' && !!ITEMS[id] },
    { call: 'Rel.add', what: 'there is nobody by that id',
      has: id => typeof NPCS !== 'undefined' && NPCS.some(p => p.id === id) },
    { call: 'Shop.open', what: 'there is no such shop',
      has: id => typeof SHOP !== 'undefined' && !!SHOP[id] },
  ],

  levelFor(id) { return this.perNode.get(id) || ''; }
};
/* `perNode` maps a node to its worst level, so it keeps levelFor() and takes
   only errors() from FAULTS. */
Object.assign(TalkCheck, FAULTS);
