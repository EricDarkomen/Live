'use strict';
/* ---------------- Writing it back out ----------------
   The editor emits source (Sync writes it, or you paste it). Two kinds:
   - Geometry: w, h, rooms, doors, counters, entries, links. Literal data,
     round-tripping exactly.
   - Furniture: a flat furnish(). Faithful for a level whose furnish() is
     already flat, destructive for a procedural one (loops and comments). For
     those there is the change list: what moved and by how much, so you edit
     the loop instead. */

const Emit = {

  /* ---- literals ---- */

  /* Single quotes, as the codebase uses; only the quote and backslash need
     escaping. */
  str(s) {
    return "'" + String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      /* A raw newline in a single-quoted string does not parse. */
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      /* U+2028/9 end a line in JS source even though they read as spaces. */
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
      + "'";
  },
  key(k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? k : this.str(k); },
  lit(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return this.str(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return '[' + v.map(x => this.lit(x)).join(', ') + ']';
    if (isSrc(v)) return v.__src;
    const ks = Object.keys(v);
    if (!ks.length) return '{}';
    return '{ ' + ks.map(k => this.prop(k, v[k])).join(', ') + ' }';
  },
  /* One property. A captured function (see capture() in hist.js) goes back as
     the code it was — codeProp() tells method shorthand from an arrow. */
  prop(k, v) {
    return isSrc(v) ? this.codeProp(k, this.dedent(v.__src)) : this.key(k) + ': ' + this.lit(v);
  },
  /* Captured source keeps its file indentation after the first line, so strip
     it (measured off the closing brace) before re-indenting. */
  dedent(src) {
    const L = String(src).split('\n');
    if (L.length < 2) return L[0];
    const base = L[L.length - 1].match(/^[ \t]*/)[0];
    return L.map((l, j) => j && l.indexOf(base) === 0 ? l.slice(base.length) : l).join('\n');
  },

  /* ---- objects ----
     Written in the order the file writes them, so a diff against the original
     is about what changed rather than about key order. */
  ORDER: ['x', 'y', 'e', 'name', 'kind', 'solid', 'use'],
  SKIP: ['_k'],
  objectLit(o) {
    const seen = new Set(this.SKIP);
    const parts = [];
    this.ORDER.forEach(k => {
      if (!(k in o)) return;
      seen.add(k);
      parts.push(k + ': ' + this.lit(o[k]));
    });
    Object.keys(o).forEach(k => {
      if (seen.has(k)) return;
      parts.push(k + ': ' + this.lit(o[k]));
    });
    return parts;
  },
  /* One add() call. `furn:` goes to its own line on a long one — that is where
     the file already breaks them, and it is the half you want to read. */
  objectLine(o, indent) {
    const pad = ' '.repeat(indent);
    const parts = this.objectLit(o);
    const one = pad + 'A({ ' + parts.join(', ') + ' });';
    if (one.length <= 108) return one;
    const cut = parts.findIndex(p => p.indexOf('furn: ') === 0);
    if (cut < 1) return one;
    return pad + 'A({ ' + parts.slice(0, cut).join(', ') + ',\n'
      + pad + '  ' + parts.slice(cut).join(', ') + ' });';
  },

  /* ---- geometry ----
     The data half of a level entry in data/levels.js, indented to sit inside
     the catalogue. Paste it over the old one. */
  geometry() {
    const i = '    ', L = [];
    const shared = this.usesSharedDefs();

    L.push(i + 'name: ' + this.str(Doc.name) + ',');
    L.push(i + 'w: ' + Doc.w + ', h: ' + Doc.h + ',');
    if (Doc.hub) L.push(i + 'hub: true,');
    if (!Doc.indoors) L.push(i + 'indoors: false,');

    if (shared) {
      /* The shared floor plan in data/world.js stays a reference; flattening it
         would create two plans free to disagree. */
      L.push(i + 'rooms: ROOM_DEFS,');
      L.push(i + 'doors: DOOR_DEFS,');
    } else {
      L.push(this.listBlock('rooms', Doc.rooms, i));
      L.push(this.listBlock('doors', Doc.doors, i));
    }
    if (Doc.counters.length) L.push(this.listBlock('counters', Doc.counters, i));
    /* Kept exactly as read: the editor cannot draw road markings or park cars,
       but must not lose them (see Doc.surfaces). */
    if (Doc.surfaces && Doc.surfaces.length) L.push(this.listBlock('surfaces', Doc.surfaces, i));
    if (Doc.roofs && Doc.roofs.length) L.push(this.listBlock('roofs', Doc.roofs, i));
    if (Doc.paint && Doc.paint.length) L.push(this.listBlock('paint', Doc.paint, i));
    if (Doc.cars && Doc.cars.length) L.push(this.listBlock('cars', Doc.cars, i));
    if (Doc.peds && Doc.peds.length) L.push(this.listBlock('peds', Doc.peds, i));
    if (Doc.signals && Doc.signals.length) L.push(this.listBlock('signals', Doc.signals, i));

    const ek = Object.keys(Doc.entries);
    if (ek.length === 1) {
      L.push(i + 'entries: { ' + this.key(ek[0]) + ': ' + this.lit(Doc.entries[ek[0]]) + ' },');
    } else {
      L.push(i + 'entries: {');
      ek.forEach(k => L.push(i + '  ' + this.key(k) + ': ' + this.lit(Doc.entries[k]) + ','));
      L.push(i + '},');
    }
    L.push(this.listBlock('links', Doc.links, i));
    return L.join('\n') + '\n';
  },
  /* `key: [ … ]`, one entry a line, or `key: []` when there is nothing in it. */
  listBlock(name, list, i) {
    if (!list.length) return i + name + ': [],';
    if (list.length === 1) return i + name + ': [' + this.lit(list[0]) + '],';
    return i + name + ': [\n'
      + list.map(v => i + '  ' + this.lit(v) + ',').join('\n') + '\n'
      + i + '],';
  },
  /* Whether this level's floor plan is the shared one, asked of the catalogue. */
  usesSharedDefs() {
    const def = LEVELS[Doc.id];
    return !!def && def.rooms === ROOM_DEFS && def.doors === DOOR_DEFS;
  },

  /* ---- a whole catalogue entry ----
     A new level: id, data and flat furnish, ready for `const LEVELS = { … }`.
     Only offered where a flat furnish() is faithful. */
  levelEntry() {
    return '  ' + this.key(Doc.id) + ': {\n'
      + this.geometry()
      + this.furnish()
      + '  },\n';
  },

  /* ---- the floor plan, for data/world.js ----
     Emitted with the zone and name columns lined up, because that file lines
     them up and a floor plan is read down the columns. */
  roomDefs() {
    const w = Math.max.apply(null, Doc.rooms.map(r => this.str(r.z).length).concat([0]));
    return 'const ROOM_DEFS = [\n'
      + Doc.rooms.map(r =>
        '  { z: ' + pad(this.str(r.z) + ',', w + 1) + ' r: ' + this.lit(r.r) + ' }').join(',\n')
      + '\n];\n';
  },
  doorDefs() {
    const zw = Math.max.apply(null, Doc.doors.map(d => this.str(d.z).length).concat([0]));
    const xw = Math.max.apply(null, Doc.doors.map(d => String(d.x).length).concat([0]));
    const yw = Math.max.apply(null, Doc.doors.map(d => String(d.y).length).concat([0]));
    return 'const DOOR_DEFS = [\n'
      + Doc.doors.map(d => {
        let s = '  { x: ' + pad(d.x + ',', xw + 1) + ' y: ' + pad(d.y + ',', yw + 1)
          + ' z: ' + pad(this.str(d.z) + ',', zw + 1) + ' name: ' + this.str(d.name);
        if (d.locked) s += ', locked: ' + this.str(d.locked);
        return s + ' }';
      }).join(',\n')
      + '\n];\n';
  },

  /* ---- waypoints, for data/world.js ----
     Wrapped to a sensible width: WP is one table of short pairs. */
  waypointDefs() {
    const t = this.waypointTable();
    return t ? '/* named spots used by NPC schedules */\n' + t
      : '/* This level has no waypoints. */\n';
  },
  /* The declaration only; the file keeps its own comment above it. */
  waypointTable() {
    const keys = Object.keys(Doc.waypoints);
    if (!keys.length) return '';
    const lines = [];
    let row = '';
    keys.forEach(k => {
      const bit = this.key(k) + ': ' + this.lit(Doc.waypoints[k]) + ', ';
      if (row.length + bit.length > 76) { lines.push('  ' + row.trimEnd()); row = ''; }
      row += bit;
    });
    if (row.trim()) lines.push('  ' + row.trimEnd().replace(/,$/, ''));
    return 'const WP = {\n' + lines.join('\n') + '\n};\n';
  },

  /* ---- furniture ----
     A whole furnish(), flat. Right for a flat level, wrong for a procedural
     one — the panel says which this is before offering it. */
  furnish() {
    const L = ['    furnish() {', '      const A = o => this.add(o);'];
    Doc.objects.forEach(o => L.push(this.objectLine(o, 6)));
    if (Doc.desks.length) {
      L.push('      /* The renderer draws a surface and a partition per desk. */');
      L.push('      this.desks = [');
      Doc.desks.forEach(d => L.push('        ' + this.lit(d) + ','));
      L.push('      ];');
    }
    L.push('    }');
    return L.join('\n') + '\n';
  },
  /* Whether a flat furnish() would lose anything. */
  flatIsSafe() {
    /* A level whose map is written by its own furnish (stamped buildings, a
       composed level) loses its mass; Doc captures it for the preview, and this
       refuses the flat export. */
    if ((Doc.mass || []).length || (Doc.carved || []).length) return false;
    const def = LEVELS[Doc.id];
    if (!def) return true;
    /* A furnish() that is only A({…}) calls, read off the source. */
    const src = String(def.furnish);
    return !/\b(for|while|forEach|map|if)\b/.test(src);
  },

  /* ================= jobs =================
     Pure data, round-tripping exactly. `track` is written in full with explicit
     nulls: a null is "no pin on purpose", a missing entry is unfinished. */
  questEntry(id, q) {
    const i = '  ';
    const L = [];
    L.push(i + this.key(id) + ': { n: ' + this.str(q.n) + ', giver: ' + this.str(q.giver) + ', steps: [');
    q.steps.forEach(t => L.push(i + '    ' + this.str(t) + ','));
    L.push(i + '  ],');
    L.push(i + '  track: [' + q.track.map(t => this.lit(t === undefined ? null : t)).join(', ') + '],');
    L.push(i + '  rw: { xp: ' + (q.rw.xp || 0) + ', money: ' + (q.rw.money || 0)
      + ', item: ' + this.lit(q.rw.item || null) + ' } },');
    return L.join('\n') + '\n';
  },
  /* ---- what the editor has of a subject ----
     The document for the open subject, its bench copy for one set aside, or
     null for one untouched (read the file's table). */
  held(doc, key) {
    return key === doc.subjectKey() ? doc : doc.kept(key);
  },

  /* The whole table: every job as the editor has it — the one being edited,
     the ones on the bench, and everything else as the file already has it. */
  questTable() {
    return 'const QUESTS = {\n'
      + Jobs.ids().map(id => {
        const h = this.held(Jobs, id);
        return this.questEntry(id, h ? Jobs.defFrom(h) : QUESTS[id]);
      }).join('')
      + '};\n';
  },
  jobChanges() {
    const was = Jobs.base, now = Jobs.state();
    if (!was) return 'Nothing has changed.\n';
    const L = [];
    if (was.n !== now.n) L.push('called: ' + this.str(was.n) + ' → ' + this.str(now.n));
    if (was.giver !== now.giver) L.push('given by: ' + this.str(was.giver) + ' → ' + this.str(now.giver));
    ['xp', 'money', 'item'].forEach(k => {
      if (JSON.stringify(was.rw[k]) !== JSON.stringify(now.rw[k])) {
        L.push('reward ' + k + ': ' + this.lit(was.rw[k]) + ' → ' + this.lit(now.rw[k]));
      }
    });
    const n = Math.max(was.steps.length, now.steps.length);
    for (let i = 0; i < n; i++) {
      const a = was.steps[i], b = now.steps[i];
      if (a !== b) {
        L.push('step ' + (i + 1) + (a === undefined ? ' ADDED: ' + this.str(b)
          : b === undefined ? ' REMOVED: ' + this.str(a)
            : ': ' + this.str(a) + '\n           → ' + this.str(b)));
      }
      const ta = JSON.stringify(was.track[i]), tb = JSON.stringify(now.track[i]);
      if (ta !== tb) L.push('step ' + (i + 1) + ' points at: ' + (ta || 'nothing') + ' → ' + (tb || 'nothing'));
    }
    return L.length ? L.join('\n') + '\n' : 'Nothing has changed.\n';
  },

  /* ================= a conversation =================
     Prose round-trips; code (do(), if:, text()) is carried through as captured
     source, never regenerated. */

  /* A captured function back as a property: method shorthand carries its name,
     an arrow does not. */
  codeProp(name, src) {
    const t = String(src).trim();
    return new RegExp('^' + name + '\\s*\\(').test(t) ? t : name + ': ' + t;
  },
  /* One line per page, because the file writes them that way and because a page
     IS a beat — the player presses on between them. */
  textProp(n, ind) {
    if (n.textSrc) return ind + this.codeProp('text', n.textSrc) + ',';
    const list = n.text || [];
    if (!list.length) return ind + 'text: [],';
    if (list.length === 1 && (ind + list[0]).length < 92) return ind + 'text: [' + this.str(list[0]) + '],';
    return ind + 'text: [' + list.map(t => '\n' + ind + '  ' + this.str(t)).join(',') + '],';
  },
  choiceLit(c, ind) {
    const parts = [];
    parts.push(c.tSrc ? this.codeProp('t', c.tSrc) : 't: ' + this.str(c.t || ''));
    parts.push('to: ' + (c.to ? this.str(c.to) : 'null'));
    if (c.ifSrc) parts.push(this.codeProp('if', c.ifSrc));
    if (c.doSrc) parts.push(this.codeProp('do', c.doSrc));
    const one = ind + '{ ' + parts.join(', ') + ' }';
    if (one.length <= 108) return one;
    return ind + '{ ' + parts[0] + ', ' + parts[1] + ',\n' + ind + '  ' + parts.slice(2).join(', ') + ' }';
  },
  nodeLit(id, n, ind) {
    const inner = ind + '  ';
    const L = [ind + this.key(id) + ': {'];
    L.push(this.textProp(n, inner));
    if (n.doSrc) L.push(inner + this.codeProp('do', n.doSrc) + ',');
    /* `to` as the file writes it: named when set, explicit null on a node with no
       replies (the end). Nodes with replies and no `to` get neither. */
    if (n.to) L.push(inner + 'to: ' + this.str(n.to) + ',');
    if ((n.choices || []).length) {
      L.push(inner + 'choices: [');
      n.choices.forEach((c, i) => L.push(this.choiceLit(c, inner + '  ')
        + (i === n.choices.length - 1 ? '' : ',')));
      L.push(inner + '],');
    } else if (!n.to) {
      L.push(inner + 'to: null,');
    }
    if (n.doneSrc) L.push(inner + this.codeProp('done', n.doneSrc) + ',');
    /* Trailing comma off the last property, so the block pastes into a file
       that is written without them. */
    L[L.length - 1] = L[L.length - 1].replace(/,$/, '');
    L.push(ind + '}');
    return L.join('\n');
  },
  talkNodes(ind) {
    const i = ind === undefined ? '  ' : ind;
    return i + 'nodes: {\n'
      /* Not the ones islander() writes: they are its code, not the file's. */
      + Talk.order.filter(k => !Talk.inherited(k))
        .map(k => this.nodeLit(k, Talk.nodes[k], i + '  ')).join(',\n')
      + '\n' + i + '}\n';
  },
  talkPerson() {
    const i = '  ';
    const L = ['{'];
    L.push(i + 'id: ' + this.str(Talk.id) + ', name: ' + this.str(Talk.name)
      + ', face: ' + this.str(Talk.face) + ', role: ' + this.str(Talk.role) + ',');
    L.push(i + 'desk: ' + this.lit(Talk.desk) + ', colour: ' + this.str(Talk.colour) + ',');
    /* Fields the editor does not model (`level`, `dir`, `hours`, `look`, `out`, …)
       written back as read (Talk.load()), one line each. */
    Object.keys(Talk.extra || {}).forEach(k => {
      L.push(i + this.prop(k, Talk.extra[k]).replace(/\n/g, '\n' + i) + ',');
    });
    /* One line, however long. The file writes a schedule as one line because it
       is one fact — a day — and eight lines of two-element arrays reads as
       eight facts. */
    /* Only where the person has one, or had one (Talk.load()). */
    if (Talk.hadSchedule || Talk.schedule.length) {
      L.push(i + 'schedule: [' + Talk.schedule.map(s => this.lit(s)).join(',') + '],');
    }
    if (Talk.hadLines || Talk.lines.length) {
      L.push(i + 'lines: [' + Talk.lines.map(t => this.str(t)).join(', ') + '],');
    }
    if (Talk.entrySrc) L.push(i + this.dedent(Talk.entrySrc).replace(/\n/g, '\n' + i) + ',');
    L.push(this.talkNodes(i).replace(/\n$/, ''));
    L.push(Talk.wrap ? '}),' : '},');
    /* Somebody islander() dresses in the shared moves goes back in through it —
       see data/npcs.js — so the file keeps saying so and they keep them. */
    if (Talk.wrap) L[0] = 'islander(' + this.str(Talk.id) + ', ' + this.str(Talk.wrap.who) + ', {';
    return L.join('\n') + '\n';
  },
  /* The whole roster, for data/npcs.js. A person must be loaded to be emitted
     (their conversation is a tree to walk), so this borrows the document a
     person at a time, as Project.sweep() does, and restores it. */
  talkTable() {
    const out = [];
    /* Stash the open person first, or sweep() emits them as the file has them
       and drops the edits in front of you. */
    Talk.stash();
    Project.sweep(Talk, Talk.ids(), () => {}, () => out.push(this.talkPerson()));
    return 'const NPCS = [\n' + out.join('') + '];\n';
  },
  talkChanges() {
    const was = Talk.base, now = Talk.state();
    if (!was) return 'Nothing has changed.\n';
    const L = [];
    ['name', 'role', 'face'].forEach(k => {
      if (was[k] !== now[k]) L.push(k + ': ' + this.str(was[k]) + ' → ' + this.str(now[k]));
    });
    if (JSON.stringify(was.lines) !== JSON.stringify(now.lines)) L.push('the one-liners changed');
    if (was.entrySrc !== now.entrySrc) L.push('entry() changed');
    const keys = Array.from(new Set(was.order.concat(now.order)));
    keys.forEach(k => {
      const a = was.nodes[k], b = now.nodes[k];
      if (!a) { L.push('ADDED ' + k); return; }
      if (!b) { L.push('REMOVED ' + k); return; }
      if (JSON.stringify(a) !== JSON.stringify(b)) L.push('EDITED ' + k);
    });
    return L.length ? L.join('\n') + '\n' : 'Nothing has changed.\n';
  },

  /* ================= how a kind is furnished =================
     FURN is flat data and round-trips; one entry per line, as data/world.js
     writes it. */
  /* ---- a minigame ----
     A whole file: minigames/<id>.js, one const. Declarations as edited; hooks
     verbatim as captured, never regenerated. */
  gameHead(id, it) {
    const L = [];
    /* The file's order, as engine/arcade.js documents it. */
    L.push('  id: ' + this.str(id) + ',');
    L.push('  name: ' + this.str(it.name || id) + ',');
    if (it.icon) L.push('  icon: ' + this.str(it.icon) + ',');
    if (it.blurb) L.push('  blurb: ' + this.str(it.blurb) + ',');
    if (it.goal) L.push('  goal: ' + this.str(it.goal) + ',');
    if (it.mins !== undefined) L.push('  mins: ' + this.lit(it.mins) + ',');
    if (it.par !== undefined) L.push('  par: ' + this.lit(it.par) + ',');
    const help = it.help || {};
    /* Written even when empty: a missing `help` and an empty one mean different
       things to a person. */
    L.push('  help: {');
    L.push('    keys: [' + (help.keys || []).map(x => this.str(x)).join(', ') + '],');
    L.push('    taps: [' + (help.taps || []).map(x => this.str(x)).join(', ') + ']');
    L.push('  },');
    const pads = it.pads || [];
    if (pads.length) {
      L.push('  pads: [');
      pads.forEach((pd, i) => {
        const bits = ['code: ' + this.str(pd.code || '')];
        bits.push('label: ' + this.str(pd.label || ''));
        this.callRest(pd, ['code', 'label']).forEach(k => bits.push(this.key(k) + ': ' + this.lit(pd[k])));
        L.push('    { ' + bits.join(', ') + ' }' + (i === pads.length - 1 ? '' : ','));
      });
      L.push('  ],');
    } else {
      L.push('  pads: [],');
    }
    /* Unknown fields too: every emitter writes every field. */
    const known = ['id', 'name', 'icon', 'blurb', 'goal', 'mins', 'par', 'help', 'pads'];
    this.callRest(it, known).forEach(k => L.push('  ' + this.key(k) + ': ' + this.lit(it[k]) + ','));
    return L;
  },
  gameEntry(id, it, code) {
    const L = ['const MG_' + String(id).toUpperCase().replace(/[^A-Z0-9_$]/g, '') + ' = {'];
    L.push.apply(L, this.gameHead(id, it));
    /* The hooks, in the order a round runs them. Anything captured that is not
       on that list still goes out — after them, so a game with a helper method
       of its own keeps it. */
    const order = Games.HOOKS
      .filter(k => code[k])
      .concat(Object.keys(code).filter(k =>
        Games.HOOKS.indexOf(k) < 0));
    order.forEach((k, i) => {
      L.push('');
      L.push('  ' + this.codeProp(k, code[k]) + (i === order.length - 1 ? '' : ','));
    });
    L.push('};');
    return L.join('\n') + '\n';
  },
  /* ---- the cabinets ----
     The whole CABINETS table: rows for one game are scattered, and games not
     open are on the bench (Emit.held). */
  cabinetLit(c) {
    const bits = ['game: ' + this.str(c.game), 'use: ' + this.str(c.use || '')];
    ['skill', 'job', 'item', 'need'].forEach(k => bits.push(k + ': ' + (c[k] ? this.str(c[k]) : 'null')));
    bits.push('t: ' + this.str(c.t || ''));
    const one = '  { ' + bits.join(', ') + ' },';
    if (one.length <= 108) return one + '\n';
    /* The reply is the long half and the half worth reading, so it breaks onto
       its own line — the same call objectLine() makes about `furn:`. */
    return '  { ' + bits.slice(0, -1).join(', ') + ',\n'
      + '    ' + bits[bits.length - 1] + ' },\n';
  },
  cabinetTable() {
    const rows = [];
    Games.ids().forEach(id => {
      const h = this.held(Games, id);
      const list = h ? h.cabs : Games.table().filter(c => c.game === id);
      (list || []).forEach(c => rows.push(Object.assign({}, c, { game: id })));
    });
    /* Rows for unregistered games are kept, so the check can still report them. */
    Games.table().forEach(c => {
      if (Games.ids().indexOf(c.game) < 0) rows.push(c);
    });
    return 'const CABINETS = [\n' + rows.map(c => this.cabinetLit(c)).join('') + '];\n';
  },

  gameFile() {
    const id = Games.id;
    if (!id) return 'No game is open.\n';
    return "'use strict';\n"
      + '/* ---------------- ' + (Games.it.name || id) + ' ----------------\n'
      + '   ' + (Games.it.blurb || '') + '\n\n'
      + '   Written against the interface at the top of engine/arcade.js and nothing\n'
      + '   else: it never touches G, P, World, Levels or the DOM. Everything it needs\n'
      + '   arrives on `a`. */\n\n'
      + this.gameEntry(id, Games.it, Games.code);
  },
  /* The three places a new minigame must be wired, none of them in its file. */
  gameWiring() {
    const id = Games.id || 'x';
    const CONST = 'MG_' + String(id).toUpperCase().replace(/[^A-Z0-9_$]/g, '');
    return '/* 1. index.html — beside the other minigames, before engine/boot.js */\n'
      + '<script src="minigames/' + id + '.js"><\/script>\n\n'
      + '/* 2. editor.html — the same tag. The editor never RUNS a minigame; it loads\n'
      + '      them because the whole-project checks read their source, and a reward()\n'
      + '      it cannot see is one it reports as unearnable writing. */\n'
      + '<script src="minigames/' + id + '.js"><\/script>\n\n'
      + '/* 3. engine/arcade.js — in catalogue(), by hand, because a classic\n'
      + '      script\u2019s top-level const cannot be enumerated. */\n'
      + '    catalogue() { return [/* …the others, */ ' + CONST + ']; },\n\n'
      + '/* 4. data/acts.js — in the act for the object that should have it. Until\n'
      + '      this line exists the game is registered and unreachable. */\n'
      + '    Arcade.open(' + this.str(id) + ');\n';
  },
  gameChanges() {
    const was = Games.base, now = Games.state();
    if (!was) return 'Nothing has changed.\n';
    if (JSON.stringify(was) === JSON.stringify(now)) return 'Nothing has changed.\n';
    const L = [];
    const a = was.it || {}, b = now.it || {};
    ['name', 'icon', 'blurb', 'goal', 'mins', 'par'].forEach(k => {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        L.push(k + ': ' + this.lit(a[k]) + ' → ' + this.lit(b[k]));
      }
    });
    ['keys', 'taps'].forEach(k => {
      const x = ((a.help || {})[k] || []), y = ((b.help || {})[k] || []);
      if (JSON.stringify(x) !== JSON.stringify(y)) {
        L.push('help.' + k + ': ' + x.length + ' line(s) → ' + y.length + ' line(s)');
        y.forEach((line, i) => { if (x[i] !== line) L.push('  ' + (i + 1) + '. ' + this.str(line)); });
      }
    });
    const pa = a.pads || [], pb = b.pads || [];
    if (JSON.stringify(pa) !== JSON.stringify(pb)) {
      L.push('pads: ' + pa.length + ' → ' + pb.length);
      const n = Math.max(pa.length, pb.length);
      for (let i = 0; i < n; i++) {
        const x = pa[i], y = pb[i];
        if (JSON.stringify(x) === JSON.stringify(y)) continue;
        L.push('  ' + (i + 1) + '. ' + (x ? x.code + ' “' + x.label + '”' : '—')
          + ' → ' + (y ? y.code + ' “' + y.label + '”' : '—'));
      }
    }
    /* Captured code differs only if somebody edited the file since this tab
       opened; said plainly. */
    Object.keys(Object.assign({}, was.code, now.code)).forEach(k => {
      if ((was.code || {})[k] !== (now.code || {})[k]) L.push(k + '(): the source differs');
    });
    return L.length ? L.join('\n') + '\n' : 'Nothing has changed.\n';
  },

  furnEntry(kind, furn) {
    if (!furn) return '/* ' + kind + ' has no FURN entry: 27px on the floor, which is the '
      + 'default and often the right answer. */\n';
    const ORDER = ['mount', 'size', 'sprite', 'art', 'drawn'];
    const parts = [];
    ORDER.forEach(k => { if (k in furn) parts.push(k + ': ' + this.lit(furn[k])); });
    Object.keys(furn).forEach(k => {
      if (ORDER.indexOf(k) < 0) parts.push(this.key(k) + ': ' + this.lit(furn[k]));
    });
    return '  ' + this.key(kind) + ': { ' + parts.join(', ') + ' },\n';
  },
  furnTable() {
    return 'const FURN = {\n'
      + Object.keys(FURN).map(k =>
        this.furnEntry(k, k === Things.id ? Things.furn : FURN[k])).filter(l => l[0] === ' ').join('')
      + '};\n';
  },
  furnChanges() {
    const was = (Things.pristine || {})[Things.id];
    const now = Things.furn;
    if (JSON.stringify(was) === JSON.stringify(now)) return 'Nothing has changed.\n';
    if (!was) return 'ADDED\n' + this.furnEntry(Things.id, now);
    if (!now) return 'REMOVED — ' + Things.id + ' goes back to the 27px floor default.\n';
    const keys = Array.from(new Set(Object.keys(was).concat(Object.keys(now))));
    return 'EDITED ' + Things.id + '\n'
      + keys.filter(k => JSON.stringify(was[k]) !== JSON.stringify(now[k]))
        .map(k => '  ' + k + ': ' + this.lit(was[k]) + ' → ' + this.lit(now[k])).join('\n')
      + '\n';
  },

  /* ================= imported art =================
     The shape build-sprites.mjs writes, minus the data: `src` is the PNG's
     destination path, and there is no `v` until the file exists. */
  artSheet(s) {
    const def = Art.def(s);
    def.src = Art.path(s);
    const i = '  ';
    if (s.kind === 'people') {
      return i + '{ ' + ['id', 'src', 'fw', 'fh', 'frames', 'sit']
        .map(k => this.key(k) + ': ' + this.lit(def[k])).join(', ') + ',\n'
        + i + '  dirs: ' + this.lit(def.dirs) + ',\n'
        + i + '  ids: ' + this.lit(def.ids) + ' },\n';
    }
    const names = Object.keys(def.sprites);
    return i + '{ id: ' + this.str(def.id) + ', src: ' + this.str(def.src)
      + ', cell: ' + def.cell + ', w: ' + def.w + ', h: ' + def.h + ',\n'
      + i + '  sprites: {\n'
      + names.map(n => i + '    ' + this.key(n) + ': ' + this.lit(def.sprites[n])).join(',\n')
      + (names.length ? '\n' : '')
      + i + '  },\n'
      + i + '  anchors: {\n'
      + names.map(n => i + '    ' + this.key(n) + ': ' + this.str(def.anchors[n])).join(',\n')
      + (names.length ? '\n' : '')
      + i + '  } },\n';
  },
  /* The attribution for art/CREDITS.md; OGA-BY requires it (LICENSE part 2). */
  artCredit(s) {
    const c = s.credit;
    return '### ' + (c.name || s.id) + '\n\n'
      + '- **File:** `' + Art.path(s) + '`\n'
      + '- **Author:** ' + (c.author || '⚠ NOT RECORDED — do not ship this') + '\n'
      + '- **Source:** ' + (c.source || '⚠ NOT RECORDED') + '\n'
      + '- **Licence:** ' + c.licence + '\n'
      + (Art.licence(c.licence).ok ? '' : '\n> ⚠ ' + Art.licence(c.licence).why + '\n');
  },
  artLicence(s) {
    return '  ' + Art.path(s) + '   — ' + (s.credit.author || '⚠ author not recorded')
      + ', ' + s.credit.licence + '\n';
  },

  /* ---- the change list ----
     Edits to make to a furnish() you keep, matched by identity so a move reads
     as a move. */
  changes() {
    const was = new Map((Doc.base.objects || []).map(o => [o._k, o]));
    const now = new Map(Doc.objects.map(o => [o._k, o]));
    const moved = [], added = [], removed = [], edited = [];

    now.forEach((o, k) => {
      const b = was.get(k);
      if (!b) { added.push(o); return; }
      if (b.x !== o.x || b.y !== o.y) moved.push({ b: b, o: o });
      const diffs = [];
      Object.keys(o).concat(Object.keys(b)).forEach(f => {
        if (f === '_k' || f === 'x' || f === 'y') return;
        if (diffs.some(d => d.f === f)) return;
        const a = JSON.stringify(b[f]), c = JSON.stringify(o[f]);
        if (a !== c) diffs.push({ f: f, from: b[f], to: o[f] });
      });
      if (diffs.length) edited.push({ o: o, diffs: diffs });
    });
    was.forEach((o, k) => { if (!now.has(k)) removed.push(o); });

    const geo = JSON.stringify({
      w: Doc.w, h: Doc.h, rooms: Doc.rooms, doors: Doc.doors,
      counters: Doc.counters, entries: Doc.entries, links: Doc.links
    }) !== JSON.stringify({
      w: Doc.base.w, h: Doc.base.h, rooms: Doc.base.rooms, doors: Doc.base.doors,
      counters: Doc.base.counters, entries: Doc.base.entries, links: Doc.base.links
    });

    return { moved: moved, added: added, removed: removed, edited: edited, geometry: geo };
  },
  changeText() {
    const c = this.changes();
    const L = [];
    const nm = o => this.str(o.name || o.kind);

    if (c.geometry) L.push('GEOMETRY changed — take it from the Geometry export above.', '');
    if (c.moved.length) {
      L.push('MOVED (' + c.moved.length + ')');
      c.moved.forEach(m => L.push('  ' + nm(m.o) + '  (' + m.b.x + ',' + m.b.y + ') → ('
        + m.o.x + ',' + m.o.y + ')'));
      L.push('');
    }
    if (c.edited.length) {
      L.push('EDITED (' + c.edited.length + ')');
      c.edited.forEach(e => e.diffs.forEach(d => L.push('  ' + nm(e.o) + '  ' + d.f + ': '
        + this.lit(d.from) + ' → ' + this.lit(d.to))));
      L.push('');
    }
    if (c.added.length) {
      L.push('ADDED (' + c.added.length + ') — paste these into furnish()');
      c.added.forEach(o => L.push(this.objectLine(o, 6)));
      L.push('');
    }
    if (c.removed.length) {
      L.push('REMOVED (' + c.removed.length + ') — delete these lines');
      c.removed.forEach(o => L.push('  ' + nm(o) + ' at (' + o.x + ',' + o.y + ')'));
      L.push('');
    }
    if (!L.length) return 'Nothing has changed on this level.\n';
    return L.join('\n');
  },

  /* ================= the phones =================
     CALLERS and MOVES are arrays of entries with ids; BOSSES and TELLS are
     keyed objects. A move's run() and show: are captured code, carried through. */

  /* One string per line, the way data/callers.js writes them: these are the
     lines a player reads, and a diff of them should be a diff of the writing
     rather than of how it was wrapped. */
  callLines(list, ind) {
    const pad = ' '.repeat(ind);
    if (!list || !list.length) return '[]';
    return '[\n' + list.map(t => pad + '  ' + this.str(t)).join(',\n') + '\n' + pad + ']';
  },
  /* Known keys in data/callers.js order, then anything else, so fields like
     `mystery` and `need` survive. */
  CALL_ORDER: {
    caller: ['id', 'name', 'face', 'w', 'frus', 'agg', 'pat'],
    move: ['id', 'e', 'n', 'd', 'serves', 'cost'],
    boss: ['title', 'face', 'sub'],
  },
  CALL_LISTS: { caller: ['issues', 'open', 'mid', 'hot', 'win'] },
  /* The keys of `o` not already written, so nothing is lost. */
  callRest(o, done) {
    return Object.keys(o).filter(k => done.indexOf(k) < 0 && typeof o[k] !== 'function');
  },
  callEntry(kind, id, it, code) {
    const live = Calls.entry(kind, id);
    const body = it !== undefined ? it : (kind === 'tell' ? { lines: live } : live);
    /* The open subject's code comes from the document; others from the table. */
    const src = code || (kind === 'move' && live
      ? { run: live.run && String(live.run), show: live.show && String(live.show) }
      : {});
    if (!body) return '';

    if (kind === 'tell') {
      return '  ' + this.key(id) + ': ' + this.callLines(body.lines || body, 2) + ',\n';
    }

    if (kind === 'caller') {
      const order = this.CALL_ORDER.caller, lists = this.CALL_LISTS.caller;
      const head = order.filter(k => k === 'id' || body[k] !== undefined)
        .map(k => k + ': ' + this.lit(k === 'id' ? id : body[k]));
      this.callRest(body, order.concat(lists)).forEach(k => head.push(this.key(k) + ': ' + this.lit(body[k])));
      const rows = lists.filter(k => body[k]).map(k => '    ' + k + ': ' + this.callLines(body[k], 4));
      return '  { ' + head.join(', ') + (rows.length ? ',\n' + rows.join(',\n') : '') + ' },\n';
    }

    if (kind === 'boss') {
      const order = this.CALL_ORDER.boss;
      const head = order.filter(k => body[k] !== undefined).map(k => k + ': ' + this.lit(body[k]));
      const phase = p => {
        const known = ['n', 'frus', 'agg', 'lines'];
        const bits = ['n: ' + this.str(p.n), 'frus: ' + (p.frus || 0), 'agg: ' + (p.agg || 0)];
        this.callRest(p, known).forEach(k => bits.push(this.key(k) + ': ' + this.lit(p[k])));
        bits.push('lines: ' + this.callLines(p.lines, 6));
        return '      { ' + bits.join(', ') + ' }';
      };
      const tail = [];
      if (body.breather !== undefined) tail.push('    breather: ' + this.lit(body.breather));
      if (body.win !== undefined) tail.push('    win: ' + this.lit(body.win));
      this.callRest(body, order.concat(['phases', 'breather', 'win']))
        .forEach(k => tail.push('    ' + this.key(k) + ': ' + this.lit(body[k])));
      return '  ' + this.key(id) + ': { ' + head.join(', ') + ',\n'
        + '    phases: [\n' + (body.phases || []).map(phase).join(',\n') + '],\n'
        + tail.join(',\n') + ' },\n';
    }

    /* A move. Data first, in file order, then anything else, then the code
       exactly as it was captured. */
    const order = this.CALL_ORDER.move;
    const head = order.filter(k => k === 'id' || k === 'cost' || body[k] !== undefined)
      .map(k => k + ': ' + this.lit(k === 'id' ? id : k === 'cost' ? (body.cost || {}) : body[k]));
    this.callRest(body, order).forEach(k => head.push(this.key(k) + ': ' + this.lit(body[k])));
    const bits = ['  { ' + head.join(', ')];
    if (src.show) bits.push('    ' + this.codeProp('show', src.show));
    if (src.run) bits.push('    ' + this.codeProp('run', src.run));
    return bits.join(',\n') + ' },\n';
  },
  callTable(kind) {
    const d = Calls.def(kind);
    const t = d.table();
    const NAME = { caller: 'CALLERS', move: 'MOVES', boss: 'BOSSES', tell: 'TELLS' }[kind];
    const open = d.arr ? 'const ' + NAME + ' = [\n' : 'const ' + NAME + ' = {\n';
    const close = d.arr ? '];\n' : '};\n';
    /* Not the engine's base moves (engine/acts.js adds `land` where the game has
       none). */
    const engine = e => kind === 'move' && BaseMoves.indexOf(e) >= 0;
    const ids = d.arr ? t.filter(e => !engine(e)).map(e => e.id) : Object.keys(t);
    return open + ids.map(id => {
      const h = this.held(Calls, kind + ':' + id);
      return h ? this.callEntry(kind, id, h.it, h.code) : this.callEntry(kind, id);
    }).join('') + close;
  },
  callChanges() {
    const was = Calls.base, now = Calls.state();
    if (!was) return 'Nothing has changed.\n';
    if (JSON.stringify(was) === JSON.stringify(now)) return 'Nothing has changed.\n';
    const L = [];
    const keys = Array.from(new Set(Object.keys(was.it || {}).concat(Object.keys(now.it || {}))));
    keys.forEach(k => {
      const a = JSON.stringify(was.it[k]), b = JSON.stringify(now.it[k]);
      if (a === b) return;
      if (Array.isArray(now.it[k]) || Array.isArray(was.it[k])) {
        const A = was.it[k] || [], B = now.it[k] || [];
        const n = Math.max(A.length, B.length);
        for (let i = 0; i < n; i++) {
          if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) {
            L.push(k + ' ' + (i + 1) + (A[i] === undefined ? ' ADDED: ' + this.lit(B[i])
              : B[i] === undefined ? ' REMOVED: ' + this.lit(A[i])
                : ': ' + this.lit(A[i]) + '\n           → ' + this.lit(B[i])));
          }
        }
      } else {
        L.push(k + ': ' + (a === undefined ? 'nothing' : a) + ' → ' + (b === undefined ? 'nothing' : b));
      }
    });
    Object.keys(Object.assign({}, was.code, now.code)).forEach(k => {
      if ((was.code || {})[k] !== (now.code || {})[k]) L.push(k + '() edited');
    });
    return L.length ? L.join('\n') + '\n' : 'Nothing has changed.\n';
  },

  /* ================= rooms =================
     All data; known keys in data/world.js order, then anything else. */
  ZONE_ORDER: ['name', 'floor', 'alt', 'wall', 'tint', 'surf', 'wsurf', 'tile', 'wtile'],
  zoneEntry(id, z) {
    const e = z || ZONES[id];
    if (!e) return '';
    const done = this.ZONE_ORDER;
    const parts = done.filter(k => e[k] !== undefined).map(k => k + ': ' + this.lit(e[k]));
    Object.keys(e).filter(k => done.indexOf(k) < 0)
      .forEach(k => parts.push(this.key(k) + ': ' + this.lit(e[k])));
    return '  ' + this.key(id) + ': { ' + parts.join(', ') + ' },\n';
  },
  zoneTable() {
    return 'const ZONES = {\n'
      + Object.keys(ZONES).map(id => this.zoneEntry(id, id === Zones.id ? Zones.z : ZONES[id])).join('')
      + '};\n';
  },
  zoneChanges() {
    const was = (Zones.pristine || {})[Zones.id], now = Zones.z;
    if (JSON.stringify(was) === JSON.stringify(now)) return 'Nothing has changed.\n';
    if (!was) return 'ADDED\n' + this.zoneEntry(Zones.id, now);
    if (!now) return 'REMOVED — ' + Zones.id + '\n';
    const keys = Array.from(new Set(Object.keys(was).concat(Object.keys(now))));
    return 'EDITED ' + Zones.id + '\n'
      + keys.filter(k => JSON.stringify(was[k]) !== JSON.stringify(now[k]))
        .map(k => '  ' + k + ': ' + this.lit(was[k]) + ' → ' + this.lit(now[k])).join('\n') + '\n';
  },

  /* ================= what you get for it =================
     Four data tables; known keys in data/items.js order, then anything else. */
  PROG_ORDER: {
    item: ['n', 'e', 'd', 'v', 'r', 'slot', 'quest', 'use', 'eff'],
    shop: ['title', 'note', 'stock'],
    skill: ['name', 'colour', 'list'],
    ach: ['n', 'e', 'd'],
  },
  progEntry(kind, id, it) {
    const e = it !== undefined ? it : Prog.entry(kind, id);
    if (!e) return '';
    const order = this.PROG_ORDER[kind] || [];
    if (kind === 'skill') {
      const list = e.list || {};
      const rows = Object.keys(list).map(sid => {
        const sk = list[sid];
        const bits = ['n: ' + this.lit(sk.n), 'd: ' + this.lit(sk.d), 'max: ' + this.lit(sk.max)];
        Object.keys(sk).filter(k => ['n', 'd', 'max'].indexOf(k) < 0)
          .forEach(k => bits.push(this.key(k) + ': ' + this.lit(sk[k])));
        return '    ' + this.key(sid) + ': { ' + bits.join(', ') + ' }';
      }).join(',\n');
      const head = ['name', 'colour'].filter(k => e[k] !== undefined)
        .map(k => k + ': ' + this.lit(e[k]));
      Object.keys(e).filter(k => order.indexOf(k) < 0)
        .forEach(k => head.push(this.key(k) + ': ' + this.lit(e[k])));
      return '  ' + this.key(id) + ': { ' + head.join(', ') + ', list: {\n' + rows + ' } },\n';
    }
    if (kind === 'shop') {
      const head = ['title', 'note'].filter(k => e[k] !== undefined).map(k => k + ': ' + this.lit(e[k]));
      Object.keys(e).filter(k => order.indexOf(k) < 0 && k !== 'stockSrc')
        .forEach(k => head.push(this.key(k) + ': ' + this.lit(e[k])));
      /* A getter goes back as the getter — see Prog.stockSrc(). */
      const src = Prog.stockSrc(e);
      return '  ' + this.key(id) + ': { ' + head.join(', ') + ',\n'
        + '    ' + (src ? this.dedent(src) : 'stock: ' + this.lit(e.stock || [])) + ' },\n';
    }
    const parts = order.filter(k => e[k] !== undefined).map(k => k + ': ' + this.lit(e[k]));
    Object.keys(e).filter(k => order.indexOf(k) < 0)
      .forEach(k => parts.push(this.key(k) + ': ' + this.lit(e[k])));
    return '  ' + this.key(id) + ': { ' + parts.join(', ') + ' },\n';
  },
  progTable(kind) {
    const NAME = { item: 'ITEMS', shop: 'SHOP', skill: 'SKILLS', ach: 'ACHS' }[kind];
    const t = Prog.def(kind).table();
    return 'const ' + NAME + ' = {\n'
      + Object.keys(t).map(id => {
        const h = this.held(Prog, kind + ':' + id);
        return this.progEntry(kind, id, h ? h.it : undefined);
      }).join('')
      + '};\n';
  },
  progChanges() {
    const was = Prog.base, now = Prog.state();
    if (!was || JSON.stringify(was) === JSON.stringify(now)) return 'Nothing has changed.\n';
    const keys = Array.from(new Set(Object.keys(was.it || {}).concat(Object.keys(now.it || {}))));
    const L = keys.filter(k => JSON.stringify(was.it[k]) !== JSON.stringify(now.it[k]))
      .map(k => '  ' + k + ': ' + this.lit(was.it[k]) + ' → ' + this.lit(now.it[k]));
    return L.length ? 'EDITED ' + Prog.id + '\n' + L.join('\n') + '\n' : 'Nothing has changed.\n';
  },

  /* ================= the day =================
     EVENTS' go() is captured code. CHAT_SCRIPT, MAIL_SCRIPT and TEXT_SCRIPT are
     flat arrays in time order; a channel or thread emits its own lines, the
     table all of them. */
  officeEntry(kind, id, it, code) {
    if (kind === 'event') {
      const live = EVENTS.find(e => e.id === id);
      const body = it !== undefined ? it : live;
      if (!body) return '';
      const src = code || (live ? { go: live.go && String(live.go) } : {});
      const head = ['id', 'e', 't', 'd'].filter(k => k === 'id' || body[k] !== undefined)
        .map(k => k + ': ' + this.lit(k === 'id' ? id : body[k]));
      Object.keys(body).filter(k => ['id', 'e', 't', 'd'].indexOf(k) < 0)
        .forEach(k => head.push(this.key(k) + ': ' + this.lit(body[k])));
      const bits = ['  { ' + head.join(', ')];
      if (src.go) bits.push('    ' + this.codeProp('go', src.go));
      return bits.join(',\n') + ' },\n';
    }
    if (kind === 'ending') {
      const e = it !== undefined ? it : (ENDINGS || {})[id];
      if (!e) return '';
      /* Anything besides the title and the text — `when`, which is code — goes
         between them, where the file writes it, rather than being dropped. */
      const mid = Object.keys(e).filter(k => k !== 't' && k !== 'b')
        .map(k => ', ' + this.prop(k, typeof e[k] === 'function' ? capture(e[k]) : e[k])).join('');
      return '  ' + this.key(id) + ': { t: ' + this.lit(e.t) + mid + ', b: [\n'
        + (e.b || []).map(t => '    ' + this.str(t)).join(',\n') + '] },\n';
    }
    if (kind === 'mail') {
      const m = it !== undefined ? it : (MAIL_SCRIPT || [])[+id];
      if (!m) return '';
      return '  { t: ' + this.lit(m.t) + ', from: ' + this.lit(m.from) + ', s: ' + this.lit(m.s) + ',\n'
        + '    b: ' + this.lit(m.b) + ' },\n';
    }
    if (kind === 'chat') {
      const rows = it !== undefined ? (it.lines || []) : CHAT_SCRIPT.filter(c => c.c === id);
      return rows.map(c => '  { t: ' + this.lit(c.t) + ', c: ' + this.lit(c.c)
        + ', who: ' + this.lit(c.who) + ', f: ' + this.lit(c.f) + ', m: ' + this.lit(c.m) + ' },\n').join('');
    }
    if (kind === 'text') {
      const rows = it !== undefined ? (it.lines || []) : TEXT_SCRIPT.filter(c => c.who === id);
      /* No `c`: the sender IS the thread, so there is no second field naming
         which conversation a text belongs to. */
      return rows.map(c => '  { t: ' + this.lit(c.t) + ', who: ' + this.lit(c.who)
        + ', f: ' + this.lit(c.f) + ', m: ' + this.lit(c.m) + ' },\n').join('');
    }
    /* Every field, known ones first. */
    const beats = it !== undefined ? (it.beats || []) : CUT;
    const HEAD = ['k', 'f', 'l', 'cam', 'len', 't'];
    return beats.map(b => {
      const parts = HEAD.filter(k => b[k] !== undefined).map(k => k + ': ' + this.lit(b[k]));
      Object.keys(b).filter(k => HEAD.indexOf(k) < 0)
        .forEach(k => parts.push(this.key(k) + ': ' + this.lit(b[k])));
      return '  { ' + parts.join(', ') + ' },\n';
    }).join('');
  },
  officeTable(kind) {
    if (kind === 'event') {
      return 'const EVENTS = [\n' + (EVENTS || []).map(e => {
        const h = this.held(Office, 'event:' + e.id);
        return this.officeEntry('event', e.id, h ? h.it : undefined, h ? h.code : undefined);
      }).join('') + '];\n';
    }
    if (kind === 'ending') {
      return 'const ENDINGS = {\n' + Object.keys(ENDINGS || {}).map(k => {
        const h = this.held(Office, 'ending:' + k);
        return this.officeEntry('ending', k, h ? h.it : undefined);
      }).join('') + '};\n';
    }
    if (kind === 'mail') {
      return 'const MAIL_SCRIPT = [\n' + (MAIL_SCRIPT || []).map((m, i) => {
        const h = this.held(Office, 'mail:' + i);
        return this.officeEntry('mail', i, h ? h.it : undefined);
      }).join('') + '];\n';
    }
    if (kind === 'chat') {
      /* One flat array in time order, which is how Chat.tick() reads it — the
         channel is a field on each line rather than a grouping. */
      const rows = [];
      Office.channels().forEach(ch => {
        /* `list()` reads Office.it, which is the open channel — so a channel
           on the bench is read out of its kept `it` the same way. */
        const h = this.held(Office, 'chat:' + ch);
        const list = h ? ((h.it && h.it.lines) || [])
          : CHAT_SCRIPT.filter(c => c.c === ch);
        list.forEach(c => rows.push(c));
      });
      /* By time, then by the file's own order: within a minute the array order is
         the feed order. New lines go to the end of their minute. */
      const filed = new Map(CHAT_SCRIPT.map((c, i) => [c, i]));
      const at = c => (filed.has(c) ? filed.get(c) : Number.MAX_SAFE_INTEGER);
      rows.sort((a, b) => ((a.t || 0) - (b.t || 0)) || (at(a) - at(b)));
      return 'const CHAT_SCRIPT = [\n' + rows.map(c => '  { t: ' + this.lit(c.t)
        + ', c: ' + this.lit(c.c) + ', who: ' + this.lit(c.who) + ', f: ' + this.lit(c.f)
        + ', m: ' + this.lit(c.m) + ' },\n').join('') + '];\n';
    }
    if (kind === 'text') {
      /* The same for texts (Texts.tick() reads one flat array). */
      const rows = [];
      Office.people().forEach(who => {
        const h = this.held(Office, 'text:' + who);
        const list = h ? ((h.it && h.it.lines) || []) : TEXT_SCRIPT.filter(c => c.who === who);
        list.forEach(c => rows.push(c));
      });
      const filedT = new Map(TEXT_SCRIPT.map((c, i) => [c, i]));
      const atT = c => (filedT.has(c) ? filedT.get(c) : Number.MAX_SAFE_INTEGER);
      rows.sort((a, b) => ((a.t || 0) - (b.t || 0)) || (atT(a) - atT(b)));
      return 'const TEXT_SCRIPT = [\n' + rows.map(c => '  { t: ' + this.lit(c.t)
        + ', who: ' + this.lit(c.who) + ', f: ' + this.lit(c.f)
        + ', m: ' + this.lit(c.m) + ' },\n').join('') + '];\n';
    }
    return 'const CUT = [\n' + this.officeEntry('cut', 'opening',
      Office.kind === 'cut' ? Office.it : undefined) + '];\n';
  },
};

function pad(s, n) { return s + ' '.repeat(Math.max(0, n - s.length)); }
