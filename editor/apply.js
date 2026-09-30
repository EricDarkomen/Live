'use strict';
/* ---------------- Saving edits back to the game ----------------
   Takes what the ten documents have that the files do not, emits each as the
   whole-table source the Export tab produces, and puts it in its file. Code
   (a do(), a run(), a procedural furnish()) is never written. Three rules:
   - Whole tables, never fragments: each write replaces one complete top-level
     `const NAME = …;`, so renames, additions and deletions are one operation.
   - It parses or it does not land: every spliced file is parsed first, and
     one failure abandons the run.
   - What it cannot write, it says: procedural furnish(), the build-output
     manifest, a new minigame's wiring are reported by name. */

const Sync = {
  V: 1,

  /* ---- which declaration each document owns ----
     For documents keyed by kind, the key's prefix picks the table. Read off the
     export panes' tables, not a second list. */
  DECL: {
    prog: { item: 'ITEMS', shop: 'SHOP', skill: 'SKILLS', ach: 'ACHS' },
    calls: { caller: 'CALLERS', move: 'MOVES', tell: 'TELLS', boss: 'BOSSES' },
    office: { event: 'EVENTS', ending: 'ENDINGS', mail: 'MAIL_SCRIPT', chat: 'CHAT_SCRIPT',
      text: 'TEXT_SCRIPT', cut: 'CUT' },
  },

  /* ---- the plan ----
     One pass over Mode.changes() (the bench list), returning `writes` (file,
     declaration, source) and `manual` (what it cannot do, in words). One write
     per changed kind; documents sharing a file write separate declarations. */
  plan() {
    const rows = Mode.changes();
    const writes = [], manual = [], seen = {};
    /* ---- which documents may then say the files have their work ----
       settle() empties a bench, so only documents this run wrote are settled:
       `true` for a whole table, a list of subjects where written one at a time,
       absent where only a note was given. Absent is the safe default. */
    const done = {};
    const add = (file, decl, code, why, entries) => {
      const k = file + '|' + decl;
      if (seen[k]) return;
      seen[k] = 1;
      writes.push({ file: file, decl: decl, code: code, why: why, entries: entries || null });
    };
    /* A table emitted whole: everything the document has is in the file. */
    const whole = (mode, file, decl, code, why) => {
      add(file, decl, code, why);
      done[mode] = true;
    };
    const kinds = mode => {
      const out = {};
      rows.filter(r => r.mode === mode).forEach(r => {
        const key = String(r.key);
        out[key.indexOf(':') > 0 ? key.split(':')[0] : key] = 1;
      });
      return Object.keys(out);
    };
    const touched = mode => rows.some(r => r.mode === mode);

    try {
      if (touched('jobs')) whole('jobs', 'data/items.js', 'QUESTS', Emit.questTable(), 'the jobs');
      if (touched('zones')) whole('zones', 'data/world.js', 'ZONES', Emit.zoneTable(), 'the room types');
      if (touched('things')) whole('things', 'data/world.js', 'FURN', Emit.furnTable(), 'how kinds are furnished');
      if (touched('talk')) whole('talk', 'data/npcs.js', 'NPCS', Emit.talkTable(), 'the people and what they say');
      kinds('prog').forEach(k => this.DECL.prog[k]
        && whole('prog', 'data/items.js', this.DECL.prog[k], Emit.progTable(k), 'the rewards'));
      kinds('calls').forEach(k => this.DECL.calls[k]
        && whole('calls', 'data/callers.js', this.DECL.calls[k], Emit.callTable(k), 'the calls'));
      kinds('office').forEach(k => this.DECL.office[k]
        && whole('office', 'data/office.js', this.DECL.office[k], Emit.officeTable(k), 'the day'));
      if (touched('games')) this.games(rows, add, manual, done);
      if (touched('levels')) this.levels(rows, add, manual, done);
    } catch (e) {
      manual.push({ label: 'Something would not emit', file: '',
        why: 'The export for one of these threw: ' + (e && e.message ? e.message : e)
          + '. Nothing has been written.' });
      return { writes: [], manual: manual, done: {}, blocked: true };
    }

    /* The manifest is build output (tools/build-sprites.mjs); a sheet that stays
       belongs in that script's inputs. */
    if (touched('art')) {
      manual.push({ label: 'The imported sheet', file: 'art/sprites/manifest.js',
        why: 'the manifest is build output. Its Export tab has the entry, the credit and the '
          + 'PNG; a sheet that is staying goes into tools/build-sprites.mjs.' });
    }
    return { writes: writes, manual: manual, done: done, blocked: false };
  },

  /* A minigame is a whole file, which is written; its wiring (two script tags,
     catalogue() and the opening act) is manual. */
  games(rows, add, manual, done) {
    const ids = {};
    const wrote = [];
    rows.filter(r => r.mode === 'games').forEach(r => { ids[String(r.key)] = r.how; });
    add('data/items.js', 'CABINETS', Emit.cabinetTable(), 'where the games are played');
    /* The open game's edits live on the document, not on the bench, and
       `load()` below would walk straight over them. Same reason
       Emit.talkTable() stashes first. */
    Games.stash();
    const was = Games.id;
    Object.keys(ids).forEach(id => {
      if (ids[id] === 'gone') {
        manual.push({ label: Games.label ? Games.label(id) : id, file: 'minigames/' + id + '.js',
          why: 'deleting a game is a file to remove and four places that name it to unwire. '
            + 'The Arcade Export tab lists them.' });
        return;
      }
      if (!Games.load(id)) return;
      Games.resume();
      add('minigames/' + id + '.js', null, Emit.gameFile(), 'the ' + id + ' minigame');
      /* The game's file settles even when new; the wiring note stays. */
      wrote.push(id);
      if (ids[id] === 'new') {
        manual.push({ label: Games.label ? Games.label(id) : id, file: 'index.html · editor.html',
          why: 'a new game needs its script tag on both pages and an entry in '
            + 'Arcade.catalogue(), or it is a file nothing loads. The Export tab has the wiring.' });
      }
    });
    if (was && Games.load(was)) Games.resume();
    if (wrote.length) done.games = wrote;
  },

  /* ---- what a level keeps, and where ----
     A procedural furnish() cannot be written back (Emit.flatIsSafe()). The hub's
     floor plan lives in data/world.js as ROOM_DEFS, DOOR_DEFS and WP, all whole
     declarations, so those go in; anything else is named part by part. */
  SHARED: ['rooms', 'doors', 'waypoints'],
  PARTS: { objects: 'the furniture', desks: 'the desks', counters: 'the front desks',
    entries: 'the arrival points', links: 'the ways out', name: 'its name',
    w: 'its size', h: 'its size', indoors: 'whether it is outdoors',
    hub: 'whether it is the hub' },
  /* What changed on the open level beyond the floor plan, against `base` (the
     file's version). */
  leftOver() {
    const base = Doc.base || {}, now = Doc.state(), out = [];
    Object.keys(now).forEach(k => {
      if (this.SHARED.indexOf(k) >= 0) return;
      if (JSON.stringify(base[k]) === JSON.stringify(now[k])) return;
      const n = this.PARTS[k] || k;
      if (out.indexOf(n) < 0) out.push(n);
    });
    return out;
  },
  words(list) {
    const s = list.length < 2 ? list[0]
      : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  levels(rows, add, manual, done) {
    const ids = {};
    rows.filter(r => r.mode === 'levels').forEach(r => { ids[String(r.key)] = r.how; });
    const entries = [], wrote = [];
    Doc.stash();
    const was = Doc.id;
    Object.keys(ids).forEach(id => {
      if (ids[id] === 'gone') {
        manual.push({ label: (LEVELS[id] || {}).name || id, file: 'data/levels.js',
          why: 'a deleted level is an entry to take out by hand, and anything linking to it '
            + 'has to lose the link in the same edit.' });
        return;
      }
      if (!Doc.load(id)) return;
      Doc.resume(); Doc.rebuild();
      if (Emit.usesSharedDefs()) {
        add('data/world.js', 'ROOM_DEFS', Emit.roomDefs(), 'the fourth floor’s rooms');
        add('data/world.js', 'DOOR_DEFS', Emit.doorDefs(), 'its doors');
        /* Only the hub has any: WP is one table and the schedules that read it
           belong to the floor the colleagues work on. */
        const wp = Doc.hub ? Emit.waypointTable() : '';
        if (wp) add('data/world.js', 'WP', wp, 'where the colleagues are sent');
        const left = this.leftOver();
        if (left.length) {
          manual.push({ label: Doc.name || id, file: 'data/levels.js',
            why: 'its rooms, its doors and its waypoints live in data/world.js and have just '
              + 'been written. ' + this.words(left) + (left.length > 1 ? ' are' : ' is')
              + ' inside its catalogue entry, beside a '
              + 'furnish() that builds thirty-two desks in two loops — writing that entry out '
              + 'flat would replace all of it with one line per object. The Export tab’s change '
              + 'list is what to edit from.' });
        } else wrote.push(id);
        return;
      }
      if (!Emit.flatIsSafe()) {
        manual.push({ label: Doc.name || id, file: 'data/levels.js',
          why: 'it builds its furniture with loops and explains itself in comments. Writing a flat '
            + 'furnish() would replace all of that with one line per object — the Export tab’s '
            + 'change list is what to edit from.' });
        return;
      }
      entries.push({ id: id, code: Emit.levelEntry() });
      wrote.push(id);
    });
    if (was && Doc.load(was)) { Doc.resume(); Doc.rebuild(); }
    if (wrote.length) done.levels = wrote;
    /* LEVELS takes entry writes: splices inside the declaration, not a
       replacement. */
    if (entries.length) add('data/levels.js', 'LEVELS', null, 'the levels', entries);
  },

  /* ---- splicing ----
     A top-level declaration starts `const NAME = ` at a line start and ends at
     its matching bracket. Both are checked; a file that does not fit is left
     alone and reported. */
  splice(src, decl, code) {
    const re = new RegExp('^const ' + decl + ' = ', 'm');
    const m = re.exec(src);
    if (!m) return null;
    const at = m.index + m[0].length;
    if (src[at] !== '{' && src[at] !== '[') return null;
    const close = this.end(src, at);
    if (close < 0) return null;
    /* The `;` and the newline after it belong to the declaration, and the
       emitters already write both. */
    let tail = close;
    while (tail < src.length && (src[tail] === ';' || src[tail] === ' ')) tail++;
    if (src[tail] === '\n') tail++;
    return src.slice(0, m.index) + code + src.slice(tail);
  },

  /* Replace one KEY inside a declaration, which is what a level entry is.
     Same scan, one level in. */
  spliceKey(src, decl, key, code) {
    const re = new RegExp('^const ' + decl + ' = ', 'm');
    const m = re.exec(src);
    if (!m) return null;
    const at = m.index + m[0].length;
    if (src[at] !== '{') return null;
    const close = this.end(src, at);
    if (close < 0) return null;
    const body = src.slice(at, close);
    /* The key as the file could have written it: bare, or quoted either way. */
    const k = '(?:' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "|'" + key + "'|\"" + key + '")';
    const km = new RegExp('^([ \\t]*)' + k + ':\\s*\\{', 'm').exec(body);
    if (!km) {
      /* Not in the file at all — a level invented here. It goes in at the end,
         before the closing brace. */
      const ins = at + body.length - 1;
      return src.slice(0, ins) + code + src.slice(ins);
    }
    const kAt = body.indexOf('{', km.index + km[0].length - 1);
    const kEnd = this.end(body, kAt);
    if (kEnd < 0) return null;
    let tail = kEnd;
    while (tail < body.length && (body[tail] === ',' || body[tail] === ' ')) tail++;
    if (body[tail] === '\n') tail++;
    return src.slice(0, at + km.index) + code + src.slice(at + tail);
  },

  /* Where the bracket at `i` closes, skipping comments and strings. data/ has
     no regex literals; the parse check guards against one appearing. */
  end(src, i) {
    const open = src[i], close = open === '{' ? '}' : ']';
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      const c = src[j], n = src[j + 1];
      if (c === '/' && n === '/') { j = src.indexOf('\n', j); if (j < 0) return -1; continue; }
      if (c === '/' && n === '*') { j = src.indexOf('*/', j + 2); if (j < 0) return -1; j++; continue; }
      if (c === '"' || c === "'" || c === '`') { j = this.strEnd(src, j); if (j < 0) return -1; continue; }
      if (c === open) depth++;
      else if (c === close && !--depth) return j + 1;
    }
    return -1;
  },
  strEnd(src, i) {
    const q = src[i];
    for (let j = i + 1; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === q) return j;
      if (q !== '`' && c === '\n') return -1;
    }
    return -1;
  },

  /* A syntax check: `new Function` compiles without running. A host that
     forbids compiling is not a syntax error. */
  parses(src) {
    try { new Function(src); return true; } catch (e) {
      if (e instanceof SyntaxError) return false;
      return true;
    }
  },

  /* ---- doing it ----
     A directory handle writes files in place after one grant; it needs a secure
     context (a local server, never file://), as Store.works() notes. */
  can() { return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'; },

  dir: null,

  /* One entry for all three ends: 'github' commits; otherwise folder or
     download, whichever this browser can do. */
  go(how) {
    const plan = this.plan();
    if (plan.blocked) { Side.say(plan.manual[0].why); return; }
    if (!plan.writes.length && !plan.manual.length) {
      Side.say('Nothing to save — the files already have all of it.');
      return;
    }
    if (!plan.writes.length) { this.report(plan); return; }
    if (how === 'github') this.publish(plan);
    else if (this.can()) this.direct(plan);
    else this.bundle(plan);
  },

  /* The one-grant path. The folder is asked for once per page and kept, so a
     second save is a single press. */
  direct(plan) {
    const pick = this.dir
      ? Promise.resolve(this.dir)
      : window.showDirectoryPicker({ mode: 'readwrite', id: GAME.id })
        .then(d => this.check(d).then(ok => {
          if (!ok) throw new Error('wrong folder');
          this.dir = d;
          return d;
        }));

    pick.then(dir => this.write(dir, plan)).catch(err => {
      if (err && err.name === 'AbortError') { Side.say('Save cancelled.'); return; }
      if (err && err.message === 'wrong folder') {
        Side.say('That folder is not the game — it has no index.html and no data/ in it.');
        return;
      }
      Side.say('Could not write there. ' + this.why());
    });
  },

  /* A folder with no index.html and no data/ in it is somebody's home
     directory, and writing eight files into it is not a mistake worth being
     able to make. */
  check(dir) {
    return dir.getFileHandle('index.html').then(() => dir.getDirectoryHandle('data'))
      .then(() => true, () => false);
  },

  file(dir, path, create) {
    const parts = path.split('/');
    let at = Promise.resolve(dir);
    parts.slice(0, -1).forEach(p => {
      at = at.then(d => d.getDirectoryHandle(p, { create: !!create }));
    });
    return at.then(d => d.getFileHandle(parts[parts.length - 1], { create: !!create }));
  },

  /* ---- staging ----
     Read, splice and parse every write before any lands. The ends differ only in
     where text is read from and written to. Keyed by path and carried forward,
     since several writes can land in one file (data/items.js holds jobs,
     rewards and cabinets). */
  stage(plan, read) {
    const staged = {};
    const order = [];
    let chain = Promise.resolve();
    plan.writes.forEach(w => {
      chain = chain.then(() => {
        if (order.indexOf(w.file) < 0) order.push(w.file);
        if (w.decl === null) { staged[w.file] = { text: w.code, made: true }; return; }
        const have = staged[w.file] ? Promise.resolve(staged[w.file].text) : read(w.file);
        return have.then(src => {
          const out = w.entries
            ? w.entries.reduce((s, e) => {
              const next = this.spliceKey(s, w.decl, e.id, e.code);
              if (next === null) throw new Error('no ' + w.decl + '.' + e.id + ' in ' + w.file);
              return next;
            }, src)
            : this.splice(src, w.decl, w.code);
          if (out === null) throw new Error('no ' + w.decl + ' in ' + w.file);
          if (!this.parses(out)) throw new Error(w.file + ' would not parse after writing ' + w.decl);
          staged[w.file] = { text: out, made: staged[w.file] && staged[w.file].made };
        });
      });
    });
    return chain.then(() => ({ staged: staged, order: order }));
  },

  write(dir, plan) {
    return this.stage(plan, path => this.file(dir, path).then(h => h.getFile()).then(f => f.text()))
      .then(res => {
        const staged = res.staged, files = res.order;
        let put = Promise.resolve();
        files.forEach(p => {
          put = put.then(() => this.file(dir, p, staged[p].made)
            .then(h => h.createWritable())
            .then(w => w.write(staged[p].text).then(() => w.close())));
        });
        return put.then(() => {
          this.landed(plan);
          Side.refresh();
          this.report(plan, files);
        });
      }).catch(err => {
        Side.say('Nothing was written — ' + (err && err.message ? err.message : 'the write failed') + '.');
      });
  },

  /* Settle only what this run wrote (see `done` in plan()). Folder path only: a
     prepared download is not saved until somebody moves it. */
  landed(plan) {
    const done = plan.done || {};
    Mode.docs().forEach(({ mode, doc }) => {
      const d = done[mode];
      if (d === true) { if (doc.settle) doc.settle(); }
      else if (Array.isArray(d) && d.length && doc.settleSome) doc.settleSome(d);
    });
    /* And the same question for what the files HOLD, which is how a subject
       made here stops reading as new. Whole modes re-counted; a level or a game
       written one at a time says which. */
    Mode.noteWhatIsOnFile(Object.keys(done).filter(m => done[m] === true));
    Object.keys(done).forEach(m => {
      if (Array.isArray(done[m])) Mode.noteOnFile(m, done[m]);
    });
    Bank.save();
  },

  /* ---- straight into the repository ----
     The same staged files as one commit on the served branch (editor/publish.js
     has the token and calls). This settles the bench; the report notes Pages
     deploys a minute later. */
  publish(plan) {
    Side.say('Committing to ' + Repo.label() + '…');
    this.stage(plan, path => Repo.read(path)).then(res => {
      const staged = res.staged, order = res.order;
      const files = order.map(p => ({ path: p, text: staged[p].text }));
      return Repo.commit(files, this.message(plan)).then(c => {
        this.landed(plan);
        Side.refresh();
        Side.say('Committed to ' + Repo.label() + '.');
        this.report(plan, order, null, c);
      });
    }).catch(err => {
      Side.say('Nothing was committed — ' + (err && err.message ? err.message : 'the commit failed') + '.');
    });
  },

  /* The commit subject names what changed, not which files. */
  message(plan) {
    const rows = Mode.changes();
    const names = [];
    rows.forEach(r => { if (names.indexOf(r.label) < 0) names.push(r.label); });
    const head = names.slice(0, 3).join(', ')
      + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '');
    const body = rows.map(r => '- ' + Mode.def(r.mode).label + ' · ' + r.label
      + ' (' + r.how + ')').join('\n');
    const left = plan.manual.length
      ? '\n\nStill by hand:\n' + plan.manual.map(m => '- ' + m.label
        + (m.file ? ' (' + m.file + ')' : '')).join('\n')
      : '';
    return 'Editor: ' + (head || 'changes from the level editor') + '\n\n' + body + left + '\n';
  },

  /* ---- everywhere else ----
     Safari and Firefox have no directory picker. Fetch the served file (the
     source the tables came from), splice, check it parses, and hand over the
     finished file. */
  bundle(plan) {
    this.stage(plan, path => this.fetchText(path)).then(res => {
      const staged = res.staged, order = res.order;
      const names = this.names(order);
      /* One at a time and spaced out: a browser asked for several downloads in
         the same tick offers the first and quietly drops the rest. */
      order.forEach((p, i) => setTimeout(() => Side.download(names[p], staged[p].text), i * 400));
      /* After the last download, so the final message is the true one. */
      setTimeout(() => Side.say(order.length === 1
        ? names[order[0]] + ' is ready — put it back in the game’s folder as ' + order[0] + '.'
        : order.length + ' files are ready — put each one back where it came from.'),
      order.length * 400 + 60);
      this.report(plan, null, order.map(p => ({ name: names[p], file: p })));
    }).catch(err => this.changeFile(plan, err));
  },

  /* The file as served; a query string bypasses a stale cache. */
  fetchText(path) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('this page cannot read ' + path));
    const url = path + (path.indexOf('?') < 0 ? '?' : '&') + 'v=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('could not read ' + path + ' — ' + r.status);
      return r.text();
    }, () => { throw new Error('could not read ' + path); });
  },

  /* What to call each download: the name it has to have when it goes back, and
     the folder in front of it only where two would otherwise arrive as one. */
  names(order) {
    const n = {}, out = {};
    order.forEach(p => { const b = p.split('/').pop(); n[b] = (n[b] || 0) + 1; });
    order.forEach(p => {
      const b = p.split('/').pop();
      out[p] = n[b] > 1 ? p.replace(/\//g, '-') : b;
    });
    return out;
  },

  /* Last resort when the page cannot read its files (file://): the emitted
     source as a change file. */
  changeFile(plan, err) {
    const text = JSON.stringify({
      v: this.V, at: new Date().toISOString(),
      writes: plan.writes.map(w => ({ file: w.file, decl: w.decl, code: w.code, entries: w.entries || null })),
      manual: plan.manual,
    }, null, 1);
    Side.download('editor-changes.json', text);
    /* Last, for the same reason as above: Side.download() says "Saved" and this
       is the sentence that has to be left on the screen. */
    setTimeout(() => Side.say((err && err.message ? err.message : 'The files could not be read')
      + '. Saved editor-changes.json instead — it holds the same source, and '
      + 'tools/apply-editor-changes.mjs in the project applies it.'), 60);
    this.report(plan);
  },

  /* What happened and what is still yours to do. */
  report(plan, files, downloads, commit) {
    const L = [];
    if (commit) L.push('<h4>Committed</h4><ul class="list">'
      + (files || []).map(f => '<li><code>' + esc(f) + '</code></li>').join('') + '</ul>'
      + '<div class="note">One commit on <code>' + esc(Repo.label()) + '</code> — '
      + '<a href="' + esc(Repo.commitUrl(commit.sha)) + '" target="_blank" rel="noopener"><code>'
      + esc(String(commit.sha).slice(0, 7)) + '</code></a>. The site rebuilds itself from the '
      + 'branch, which takes a minute or two; after that the game may still hand you a cached '
      + 'copy for a few minutes more, so reload it twice before believing it.</div>');
    else if (files && files.length) L.push('<h4>Written</h4><ul class="list">'
      + files.map(f => '<li><code>' + esc(f) + '</code></li>').join('') + '</ul>');
    else if (downloads && downloads.length) L.push('<h4>Ready to put back</h4><ul class="list">'
      + downloads.map(d => '<li><code>' + esc(d.name) + '</code>'
        + '<em>goes back as <code>' + esc(d.file) + '</code></em></li>').join('') + '</ul>'
      + '<div class="note">Each is the file as this page was served it with your work spliced into '
      + 'it, parsed before it was offered — the same check the folder path makes. This browser '
      + 'cannot put them back for you and cannot tell when you have, so the bench keeps every one '
      + 'of them until you reload with the files in place.</div>');
    else if (plan.writes.length) L.push('<h4>' + plan.writes.length + ' to apply</h4><ul class="list">'
      + plan.writes.map(w => '<li><code>' + esc(w.file) + '</code>'
        + '<em>' + esc(w.decl || 'the whole file') + ' · ' + esc(w.why) + '</em></li>').join('') + '</ul>');
    if (plan.manual.length) L.push('<h4>Still yours to do</h4><ul class="list">'
      + plan.manual.map(m => '<li><b>' + esc(m.label) + '</b>'
        + '<em>' + (m.file ? '<code>' + esc(m.file) + '</code> — ' : '') + esc(m.why) + '</em></li>').join('')
      + '</ul>');
    if (!L.length) return;
    Ask.tell(commit ? 'Published' : files ? 'Saved to the game' : 'Prepared', L.join(''));
  },

  why() {
    return 'A page opened off disk cannot be given a folder to write to, and cannot read one '
      + 'either. Serve it — python3 -m http.server — and the save prepares the finished files '
      + 'even where the browser has no folder picker.';
  },
};
