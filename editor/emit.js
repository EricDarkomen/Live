'use strict';
/* ---------------- Writing it back out ----------------
   A browser cannot save over data/levels.js, and it should not want to: that
   file is where most of the writing lives, and its loops and its comments are
   the point of it. So the editor emits source and you paste it, deliberately.

   Two very different exports, because two very different things came in:

     GEOMETRY  — w, h, rooms, doors, counters, entries, links. Literal data in
                 the file and literal data here, so it round-trips exactly and
                 can be pasted over the old block without losing anything.

     FURNITURE — a flat furnish(). Correct for a level whose furnish() already
                 IS a flat list (the basement, outside, anything made here) and
                 destructive for one that is not: office builds thirty-two desks
                 in two loops and explains itself in twenty comments, and this
                 would replace all of it with ninety-six identical lines.

   For that second case there is the CHANGE LIST, which is what you actually
   want: it names what moved and by how much, so you edit the loop rather than
   flattening it. */

const Emit = {

  /* ---- literals ---- */

  /* Single quotes, because the codebase does. Only the two characters that can
     end the literal or start an escape need escaping — the prose is full of
     curly apostrophes and they are fine as they are. */
  str(s) {
    return "'" + String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      /* A real newline inside a single-quoted string is a syntax error, not a
         line break — the emitted file simply does not parse. Nothing had one
         until the inbox, whose bodies are several paragraphs each, and it took
         a round-trip test to notice because the output looks perfectly fine
         until something tries to evaluate it. */
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
    const ks = Object.keys(v);
    if (!ks.length) return '{}';
    return '{ ' + ks.map(k => this.key(k) + ': ' + this.lit(v[k])).join(', ') + ' }';
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
      /* The fourth floor's floor plan lives in data/world.js and is named from
         here, so this stays a reference and the arrays go in the other export.
         Flattening them into the catalogue would give the building two floor
         plans that are free to disagree. */
      L.push(i + 'rooms: ROOM_DEFS,');
      L.push(i + 'doors: DOOR_DEFS,');
    } else {
      L.push(this.listBlock('rooms', Doc.rooms, i));
      L.push(this.listBlock('doors', Doc.doors, i));
    }
    if (Doc.counters.length) L.push(this.listBlock('counters', Doc.counters, i));
    /* Written back exactly as they came in. This editor cannot draw a road
       marking or park a car, and a table it cannot edit is still a table it
       must not lose — see the note on Doc.surfaces. Emitted here, in the
       geometry block, because that is the half of a level that round-trips. */
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
  /* Is this level's floor plan the shared one in data/world.js? Asked of the
     catalogue rather than assumed of `office`, so a second level that names the
     same consts is handled without this knowing about it. */
  usesSharedDefs() {
    const def = LEVELS[Doc.id];
    return !!def && def.rooms === ROOM_DEFS && def.doors === DOOR_DEFS;
  },

  /* ---- a whole catalogue entry ----
     What a NEW level needs: the id, the data and the furnish, indented to drop
     straight into `const LEVELS = { … }`. Only offered where a flat furnish() is
     faithful, which a level made here always is. */
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
     Wrapped at a sensible width rather than one per line: WP is thirty short
     pairs and a column of thirty lines reads as thirty facts when it is really
     one table. */
  waypointDefs() {
    const t = this.waypointTable();
    return t ? '/* named spots used by NPC schedules */\n' + t
      : '/* This level has no waypoints. */\n';
  },
  /* The declaration on its own. The writer replaces `const WP = …` in place and
     the comment above it is the file's, already there — emitting the comment
     too would leave data/world.js with two of them. */
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
  /* Whether a flat furnish() would lose anything. A level built here has
     nothing to lose; one loaded from a hand-written procedural furnish() has
     its loops and its comments to lose, and no export can carry those. */
  flatIsSafe() {
    /* A flat furnish() writes the objects and nothing else, so a level whose
       map was WRITTEN by its own furnish — the buildings on the outskirts, the
       island that stamps them in — loses all of it. Doc captures that mass so
       the preview is honest; this is the other half, and it is asked of the
       document rather than of the source because a composed level's furnish
       runs its parts' through closures and says nothing about it itself. */
    if ((Doc.mass || []).length || (Doc.carved || []).length) return false;
    const def = LEVELS[Doc.id];
    if (!def) return true;
    /* A furnish() that is a plain run of A({…}) calls and nothing else. Read off
       the source rather than guessed at: a `for`, a `forEach` or a `const` in
       there means the file says something this export cannot. */
    const src = String(def.furnish);
    return !/\b(for|while|forEach|map|if)\b/.test(src);
  },

  /* ================= jobs =================
     A quest is pure data, so there is nothing to lose and no procedural half to
     warn about: this is the whole entry, and it round-trips exactly.

     `track` is emitted even where every entry is null, and null is written out
     rather than left as a hole. A missing entry and an explicit null read the
     same way to Guide.aim() and mean opposite things to a person: one is "no
     pin here, on purpose" and the other is a list somebody stopped writing. */
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
  /* ---- what the EDITOR has of a subject ----
     Not always the one in front of you. Leaving a subject keeps it on the
     document's bench, and a table export that only ever asked about the open
     one quietly undid every edit you had walked away from — which is the worst
     kind of export, because the output looks perfectly plausible. Returns the
     document itself for the open subject, the kept working copy for one on the
     bench, and null for one nobody has touched, which is the caller's signal
     to read the file's own table. */
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
     Half of this is prose and round-trips; half of it is code and is carried
     through as the source it came in as. Nothing here writes a do(), an if: or
     a text() — the editor captured them as text and hands them back unchanged,
     for the same reason a procedural furnish() is never regenerated. */

  /* A captured function, put back as the property it was. Method shorthand
     already carries its own name (`do() { … }`), an arrow does not (`() => …`),
     and telling them apart is a matter of looking at what String() gave us. */
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
    /* `to` is written where the file writes it: named when there is one, and
       explicitly null on a node with no replies, which is how the file says
       "this is the end of it". A node WITH replies and no `to` gets neither —
       Dialogue.advance() never reads it there, and inventing a `to: null` on
       two hundred nodes would be two hundred lines of diff saying nothing. */
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
      + Talk.order.map(k => this.nodeLit(k, Talk.nodes[k], i + '  ')).join(',\n')
      + '\n' + i + '}\n';
  },
  talkPerson() {
    const i = '  ';
    const L = ['{'];
    L.push(i + 'id: ' + this.str(Talk.id) + ', name: ' + this.str(Talk.name)
      + ', face: ' + this.str(Talk.face) + ', role: ' + this.str(Talk.role) + ',');
    L.push(i + 'desk: ' + this.lit(Talk.desk) + ', colour: ' + this.str(Talk.colour) + ',');
    /* Fields this editor does not model, written back exactly as they were
       read — `level`, `dir`, `hours`, `look`, `out` and whatever comes next.
       See Talk.load(): without this, saving the roster silently deletes them
       and six people stop existing. One line each, because each of them is one
       fact about a person. */
    Object.keys(Talk.extra || {}).forEach(k => {
      L.push(i + this.key(k) + ': ' + this.lit(Talk.extra[k]) + ',');
    });
    /* One line, however long. The file writes a schedule as one line because it
       is one fact — a day — and eight lines of two-element arrays reads as
       eight facts. */
    /* Written only where the person has one, or had one to begin with — see
       Talk.load(). A shopkeeper with no day and nothing to say unprompted has
       neither field in the file, and writing an empty one for them is an export
       that does not reproduce what it read. */
    if (Talk.hadSchedule || Talk.schedule.length) {
      L.push(i + 'schedule: [' + Talk.schedule.map(s => this.lit(s)).join(',') + '],');
    }
    if (Talk.hadLines || Talk.lines.length) {
      L.push(i + 'lines: [' + Talk.lines.map(t => this.str(t)).join(', ') + '],');
    }
    if (Talk.entrySrc) L.push(i + Talk.entrySrc.replace(/\n/g, '\n' + i) + ',');
    L.push(this.talkNodes(i).replace(/\n$/, ''));
    L.push('},');
    return L.join('\n') + '\n';
  },
  /* The whole roster, for a save that writes data/npcs.js rather than asking
     you to paste one person into it. Unlike every other table here a person
     cannot be emitted without being LOADED — `talkPerson()` reads the open
     subject's fields, because a conversation is a tree that has to be walked
     rather than a row that can be read — so this borrows the document a person
     at a time and hands it back exactly as it found it. That is the same call
     Project.sweep() already makes for the checks, which is why it is that
     function doing it rather than a second copy of the same care. */
  talkTable() {
    const out = [];
    /* THE OPEN PERSON IS NOT ON THE BENCH — that is what a bench is for, and
       `sweep()` resumes each subject from it. So without this the one person
       you are actually looking at is emitted as the FILE has them and every
       edit in front of you is dropped, which is the worst possible shape for
       this bug: every other person saves correctly. `stash()` is what leaving
       a subject already does, and sweep hands the document back afterwards. */
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
     FURN is a flat table of plain data, so it round-trips exactly. Written one
     entry to a line because that is how data/world.js writes it: the table is
     read down the column of kinds, and a five-line object per kind would make
     forty facts out of one. */
  /* ---- a minigame ----
     The only export here that is a whole FILE rather than a line to paste into
     a table, because a minigame IS a file: minigames/<id>.js, one const, and
     nothing else in it. So this writes the lot — every declaration as the
     editor has it, and every hook as the source it was captured from.

     The hooks are verbatim and are never regenerated, exactly as a procedural
     furnish(), a dialogue do() and a move's run() are. That is not a limitation
     to apologise for: it is the only arrangement in which editing what a game
     SAYS about itself cannot destroy what it IS. */
  gameHead(id, it) {
    const L = [];
    /* Identity first, then the prose, then the numbers, then the two
       declarations that decide how it is played. The file's own order, which
       is also the order engine/arcade.js documents them in. */
    L.push('  id: ' + this.str(id) + ',');
    L.push('  name: ' + this.str(it.name || id) + ',');
    if (it.icon) L.push('  icon: ' + this.str(it.icon) + ',');
    if (it.blurb) L.push('  blurb: ' + this.str(it.blurb) + ',');
    if (it.goal) L.push('  goal: ' + this.str(it.goal) + ',');
    if (it.mins !== undefined) L.push('  mins: ' + this.lit(it.mins) + ',');
    if (it.par !== undefined) L.push('  par: ' + this.lit(it.par) + ',');
    const help = it.help || {};
    /* Written even when empty. A missing `help` and an empty one read the same
       to the host and mean opposite things to a person — the same call the job
       editor makes about an explicit `null` in a track list. */
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
    /* Anything else the game declared and this editor has never heard of. An
       allow-list version of this dropped `mystery: true` from the unknown
       caller once; the rule since is that every emitter writes every field. */
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
    const order = (typeof Games !== 'undefined' ? Games.HOOKS : [])
      .filter(k => code[k])
      .concat(Object.keys(code).filter(k =>
        (typeof Games === 'undefined' ? [] : Games.HOOKS).indexOf(k) < 0));
    order.forEach((k, i) => {
      L.push('');
      L.push('  ' + this.codeProp(k, code[k]) + (i === order.length - 1 ? '' : ','));
    });
    L.push('};');
    return L.join('\n') + '\n';
  },
  /* ---- the cabinets ----
     Where every game is installed, as the whole CABINETS table. A table rather
     than a line because it is short, because the rows for one game are not
     contiguous in it, and because the working copy of a game that is NOT open
     is on the bench — Emit.held is what makes an export the whole bench rather
     than just the thing in front of you. */
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
    if (typeof Games === 'undefined') return 'const CABINETS = [];\n';
    const rows = [];
    Games.ids().forEach(id => {
      const h = this.held(Games, id);
      const list = h ? h.cabs : Games.table().filter(c => c.game === id);
      (list || []).forEach(c => rows.push(Object.assign({}, c, { game: id })));
    });
    /* Anything installed for a game nobody registers is kept rather than
       silently dropped: the export is what the table IS, and losing a row
       because its game is missing would hide the very fault the check reports. */
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
  /* A file in minigames/ that nothing loads and nothing names is a game that
     does not exist. Three places, and none of them is in the file itself —
     which is exactly the sort of thing a person does not remember at 6pm. */
  gameWiring() {
    const id = Games.id || 'x';
    const CONST = 'MG_' + String(id).toUpperCase().replace(/[^A-Z0-9_$]/g, '');
    return '/* 1. index.html — beside the other minigames, before engine/boot.js */\n'
      + '<script src="minigames/' + id + '.js"><\/script>\n\n'
      + '/* 2. editor.html — the same tag. The editor never RUNS a minigame; it loads\n'
      + '      them because the whole-project checks read their source, and a reward()\n'
      + '      it cannot see is one it reports as unearnable writing. */\n'
      + '<script src="minigames/' + id + '.js"><\/script>\n\n'
      + '/* 3. engine/arcade.js — in catalogue(). By hand and behind a typeof guard,\n'
      + '      because a classic script\u2019s top-level const cannot be enumerated at all,\n'
      + '      and because a copy opened without minigames/ must be a game with no\n'
      + '      arcade rather than a page that fails to boot. */\n'
      + '    if (typeof ' + CONST + ' !== \'undefined\') out.push(' + CONST + ');\n\n'
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
    /* The code is captured, so a change to it here is a change somebody made in
       the file since this tab was opened rather than one made in this tab. Said
       plainly, because a diff of it would read as this tool having written it. */
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
     The same shape build-sprites.mjs writes, so what the engine adopted and
     what you paste are the same object — except for two fields it deliberately
     does not carry. `src` is the path the PNG has to end up at rather than the
     data: URI it is being previewed from, and there is no `v`: that is a hash
     of a file's bytes, and there is no file yet. */
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
  /* The attribution, in the shape art/CREDITS.md already uses. OGA-BY requires
     this and the licence text to travel with the art, which is the whole reason
     both are named in LICENSE part 2. */
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
     What to do to a furnish() you do not want to regenerate. Matched on the
     identity the doc carries rather than on position, so a move is reported as
     a move instead of as a delete and an add. */
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
     Four tables, two shapes. CALLERS and MOVES are arrays whose entries carry
     their own id; BOSSES and TELLS are objects keyed by it. And half of a move
     is CODE — run() and show: are carried through as the source they came in
     as, never regenerated, for the same reason a procedural furnish() and a
     dialogue do() are. */

  /* One string per line, the way data/callers.js writes them: these are the
     lines a player reads, and a diff of them should be a diff of the writing
     rather than of how it was wrapped. */
  callLines(list, ind) {
    const pad = ' '.repeat(ind);
    if (!list || !list.length) return '[]';
    return '[\n' + list.map(t => pad + '  ' + this.str(t)).join(',\n') + '\n' + pad + ']';
  },
  /* Known keys in the order data/callers.js writes them, then ANYTHING ELSE.
     That second half is not decoration: `mystery: true` on the unknown caller
     and `need: 'corp'` on the corporate-speak move are both real fields that an
     allow-list emitter dropped silently, which is an export that quietly
     destroys the thing it is supposed to preserve. Same rule objectLit and
     furnEntry already follow. */
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
    /* For the OPEN subject the code comes from the document, where it may have
       been edited. For every other move it has to be read back off the table —
       an earlier version defaulted to {} here, which emitted every move in the
       game with its run() silently missing. */
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
    const ids = d.arr ? t.map(e => e.id) : Object.keys(t);
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
     Nine fields, all data, so the table round-trips exactly. Known keys in the
     order data/world.js writes them, then anything else — the same rule the
     object and caller emitters follow, and for the same reason. */
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
     All four tables are pure data, so all four round-trip exactly. Known keys
     in the order data/items.js writes them, then anything else — the same rule
     everything else here follows, because an allow-list emitter is an export
     that quietly destroys what it does not recognise. */
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
      Object.keys(e).filter(k => order.indexOf(k) < 0)
        .forEach(k => head.push(this.key(k) + ': ' + this.lit(e[k])));
      return '  ' + this.key(id) + ': { ' + head.join(', ') + ',\n'
        + '    stock: ' + this.lit(e.stock || []) + ' },\n';
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
     EVENTS carries code (go()), which is captured and carried through like
     every other captured function here. The rest is data. CHAT_SCRIPT,
     MAIL_SCRIPT and TEXT_SCRIPT are flat arrays in time order, so a channel or
     a thread is emitted as the lines belonging to it and the table as all of
     them. */
  officeEntry(kind, id, it, code) {
    if (kind === 'event') {
      const live = (typeof EVENTS !== 'undefined' ? EVENTS : []).find(e => e.id === id);
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
      return '  ' + this.key(id) + ': { t: ' + this.lit(e.t) + ', b: [\n'
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
    /* EVERY field, known ones first — the allow-list version of this dropped
       `mystery: true` off the unknown caller and `need: 'corp'` off a move, and
       it would have dropped a beat's camera the day one was added. Same rule
       objectLit and furnEntry already follow. */
    const beats = it !== undefined ? (it.beats || []) : (typeof CUT !== 'undefined' ? CUT : []);
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
      /* By time, and then BY WHERE THE FILE ALREADY HAD THEM. Grouping by
         channel and stable-sorting on `t` alone is not a re-ordering of
         nothing: several lines share a minute, and within a minute the array
         order IS the order they appear in the feed — so exporting put every
         #general line of 09:38 ahead of the #wins line Dave posted in the same
         minute, and Sarah's reply to him landed before the thing she was
         replying to. Identical content, different reading, and the round-trip
         check is what said so.

         A line that came off the bench is not in the file yet and has no place
         in it, so it goes to the end of its own minute. */
      const filed = new Map(CHAT_SCRIPT.map((c, i) => [c, i]));
      const at = c => (filed.has(c) ? filed.get(c) : Number.MAX_SAFE_INTEGER);
      rows.sort((a, b) => ((a.t || 0) - (b.t || 0)) || (at(a) - at(b)));
      return 'const CHAT_SCRIPT = [\n' + rows.map(c => '  { t: ' + this.lit(c.t)
        + ', c: ' + this.lit(c.c) + ', who: ' + this.lit(c.who) + ', f: ' + this.lit(c.f)
        + ', m: ' + this.lit(c.m) + ' },\n').join('') + '];\n';
    }
    if (kind === 'text') {
      /* The same arrangement CHAT_SCRIPT has, for the same two reasons: one
         flat array in time order because that is how Texts.tick() reads it,
         and a tie broken by where the file already had them because several
         texts share a minute and within a minute the array order IS the order
         they arrive in. A line off the bench has no place in the file yet and
         goes to the end of its own minute. */
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
