'use strict';
/* ---------------- The side panel ----------------
   Five tabs, and each is a plain rebuild of its own pane: the doc is the truth
   and the panel is a view of it, so every edit ends in refresh() and no part of
   the UI holds state that could disagree with the level.

   Fields commit on `change`, not on `input`. Every commit marks an undo entry
   and rebuilds the map, and doing that per keystroke would put "The Fridg",
   "The Frid", "The Fri" on the undo stack. */

const Side = {
  tab: 'inspect',
  msg: '',
  /* Doc.rebuild() refreshes the panel, and the first rebuild happens while the
     editor is still starting up. Nothing to refresh until init() has run. */
  live: false,

  init() {
    const lv = $('#edSubject');
    Mode.subjectOptions();
    lv.onchange = () => {
      /* "+ New …" lives in the list rather than as another toolbar button: it
         is the same decision as picking one, and it is the same decision in all
         three modes. */
      if (lv.value === '__new__') { lv.value = Mode.current(); Mode.create(); return; }
      Mode.openSubject(lv.value);
    };
    document.querySelectorAll('#edModes button').forEach(b => {
      b.onclick = () => Mode.set(b.dataset.mode);
    });
    /* The phone's whole way around the editor: which document, and which
       subject of it. One control because it is one question. */
    $('#edPick').onclick = () => Mode.pick();

    /* There is no Zone select any more. Which zone the room tool paints is a
       property of the tool, so it lives on the tool: the chip under the rail
       shows it and opens a list with the tints on it, which is the only thing
       that tells thirteen dark navy-greys apart. */

    document.querySelectorAll('#edTools button').forEach(b => {
      b.onclick = () => Tools.set(b.dataset.tool);
    });
    document.querySelectorAll('#edTabs button[data-tab]').forEach(b => {
      b.onclick = () => this.show(b.dataset.tab);
    });
    $('#edSheet').onclick = () => this.sheet();

    $('#edGrid').onchange = e => { View.grid = e.target.checked; };
    $('#edPlan').onchange = e => { View.plan = e.target.checked; };
    $('#edFaults').onchange = e => { View.faults = e.target.checked; };
    $('#edWps').onchange = e => { View.wps = e.target.checked; this.refresh(); };
    $('#edIn').onclick = () => View.setZoom(View.zoom * 1.25);
    $('#edOut').onclick = () => View.setZoom(View.zoom / 1.25);
    $('#edFit').onclick = () => View.fit();
    $('#edRevert').onclick = () => Mode.revert();
    $('#edUndo').onclick = () => this.step(false);
    $('#edRedo').onclick = () => this.step(true);
    $('#edHelp').onclick = () => Help.show();
    $('#edProject').onclick = () => Project.show();
    $('#edLayers').onclick = () => Pop.layers($('#edLayers'));
    $('#edMore').onclick = () => Pop.more($('#edMore'));
    /* What the tool is holding: the object it will place, or the zone it will
       paint. Which of those it is decides where pressing it goes. */
    /* The one file input on the page. Wired once here rather than per render,
       because a re-rendered input is one whose change handler is gone. */
    $('#edFile').onchange = e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';                 /* so choosing the same file twice works */
      if (f) { Mode.set('art'); ArtUI.take(f); }
    };
    $('#edCtx').onclick = () => {
      if (Tools.current === 'object') { this.show('palette'); this.sheet(true); }
      else Pop.zones($('#edCtx'));
    };

    this.live = true;
    this.toolButtons();
    /* On a phone the sheet starts closed, so what you arrive at is the map. It
       is one tap from open and the tab strip is still there saying what is in
       it — whereas an editor that opens on a form reads as a form. */
    if (matchMedia('(pointer: coarse)').matches) this.sheet(false);
    this.refresh();
  },

  /* The subject list is Mode's, because what a subject IS depends on the mode.
     Kept as a name here because the level code calls it after making one. */
  levelOptions() { Mode.subjectOptions(); },

  /* `keepFolded` is for the one caller that is not a request to read anything:
     a mode switch whose new document has no tab of the name the old one was on
     has to put the strip somewhere, and that is not the same as asking for the
     panel. Everything else that calls show() is somebody pressing something. */
  show(tab, keepFolded) {
    this.tab = tab;
    let picked = null;
    document.querySelectorAll('#edTabs button[data-tab]').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      if (on) picked = b;
    });
    document.querySelectorAll('.pane').forEach(p =>
      p.classList.toggle('on', p.id === 'pane' + tab[0].toUpperCase() + tab.slice(1)));
    /* The tab strip scrolls on a phone, so the tab you just chose has to be put
       back into view — otherwise picking the one at the far end scrolls it off
       and nothing looks selected. Same reason the game's panel does it. */
    if (picked && picked.scrollIntoView) {
      picked.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    /* Choosing a tab is asking to read it. `sheet(true)` — the argument is
       whether it ends up OPEN, and this read `sheet(false)`, which is a no-op
       on an already-folded sheet. The panel opens folded on a phone, so that
       made the first tab anybody pressed do nothing at all: the pane switched
       underneath a fold with nothing on screen to say it had. */
    if (this.shut && !keepFolded) this.sheet(true);
    this.refresh();
  },

  /* The bottom sheet. Closed, the panel is its tab strip and the map has the
     screen; open, it takes a fixed share. Phone only — the desktop's side panel
     is a column and there is nothing to get out of the way of. */
  shut: false,
  sheet(open) {
    this.shut = open === undefined ? !this.shut : !open;
    $('#app').classList.toggle('sheet-shut', this.shut);
    const b = $('#edSheet');
    if (b) {
      b.title = this.shut ? 'Show the panel' : 'Collapse the panel';
      b.setAttribute('aria-label', b.title);
    }
    /* The canvas just changed size, and so did where the floating chrome sits
       on it — measure before clamping or the camera centres the level behind
       the tool strip. */
    if (R.cv) { R.resize(); View.measure(); View.clamp(); }
  },
  toolButtons() {
    document.querySelectorAll('#edTools button').forEach(b =>
      b.classList.toggle('on', b.dataset.tool === Tools.current));
  },

  /* ---- what the tool is holding ----
     The object tool used to announce its brush in a toast that had gone by the
     time you looked at the map, and the room tool's zone was a <select> at the
     far end of a strip that scrolled off a phone. Both are this chip now: it
     says what the next tap will do, and pressing it is how you change it. */
  context() {
    const el = $('#edCtx');
    if (!el) return;
    const tool = Mode.id === 'levels' ? Tools.current : null;
    if (tool === 'object') {
      const b = Tools.brush || {};
      el.hidden = false;
      el.innerHTML = '<span class="cx-e">' + esc(b.e || '\u00b7') + '</span>'
        + '<span class="cx-t"><span class="cx-k">placing</span>'
        + '<span class="cx-n">' + esc(b.name || b.kind || 'nothing') + '</span></span>';
      el.title = 'Placing ' + (b.name || b.kind) + ' — open the palette to change it';
    } else if (tool === 'room') {
      const z = ZONES[Tools.zone] || {};
      el.hidden = false;
      el.innerHTML = '<span class="cx-swatch" style="background:' + esc(z.floor || z.tint || '#333') + '"></span>'
        + '<span class="cx-t"><span class="cx-k">painting</span>'
        + '<span class="cx-n">' + esc(z.name || Tools.zone) + '</span></span>';
      el.title = 'The room tool paints ' + (z.name || Tools.zone) + ' — press to change it';
    } else {
      el.hidden = true;
      /* Only the chip's OWN menu goes with it. refresh() runs from inside the
         layers popover's own handler, and closing every popover here would shut
         it the instant you switched a layer. */
      if (Pop.anchor === el) Pop.close();
    }
    /* The dock is a different size now, so the visible map is too. */
    View.measure();
    View.clamp();
  },
  zoomLabel() {
    const el = $('#edZoomV');
    if (el) el.textContent = Math.round(View.zoom * 100) + '%';
  },
  /* Something the editor wants to tell you: what was copied, what was
     reverted, why nothing happened. It goes in the readout, and it goes away
     again — a status line that never clears stops being read, and by the time
     you have made three more edits it is describing something else entirely. */
  say(m) {
    this.msg = m;
    this.readout();
    clearTimeout(this.msgT);
    if (m) this.msgT = setTimeout(() => { this.msg = ''; this.readout(); }, 5000);
  },
  msgT: 0,

  /* One way in for both the buttons and Ctrl+Z, so the message and the button
     states cannot get out of step with each other. */
  step(forward) {
    const doc = Mode.doc();
    const label = forward ? doc.redo() : doc.undo();
    this.say(label ? (forward ? 'Redid ' : 'Undid ') + label
      : 'Nothing to ' + (forward ? 'redo' : 'undo') + '.');
    this.refresh();
  },
  /* Disabled when there is nothing to take back, and titled with what it would
     take back — the label is the only thing that says whether the last thing
     you did registered at all. */
  histButtons() {
    const u = $('#edUndo'), r = $('#edRedo');
    if (!u || !r) return;
    const doc = Mode.doc();
    const back = doc.undoStack[doc.undoStack.length - 1];
    const fwd = doc.redoStack[doc.redoStack.length - 1];
    u.disabled = !back; r.disabled = !fwd;
    u.title = back ? 'Undo ' + back.label + '  (Ctrl+Z)' : 'Nothing to undo';
    r.title = fwd ? 'Redo ' + fwd.label + '  (Ctrl+Shift+Z)' : 'Nothing to redo';
  },

  /* How much is on the bench, in the bar. Counted rather than swept: this runs
     on every refresh, and `editedKeys()` is a JSON compare per document where
     the whole-game sweep is thirty milliseconds. What is BROKEN is not in this
     number for the same reason — that is what pressing it tells you. */
  benchPill(bench) {
    const el = $('#edProjectN'), btn = $('#edProject');
    if (!el || !btn) return;
    const n = (bench || Mode.changes()).length;
    el.textContent = n ? String(n) : '';
    el.className = 'pill' + (n ? ' warn' : '');
    btn.title = n
      ? n + ' subject' + (n === 1 ? '' : 's') + ' the files do not have yet — press for the whole game'
      : 'What is on the bench, and what the checks found';
    /* A phone's bar has no room for the count and no room for the button that
       carries it: the whole game is behind the overflow menu there. So the
       menu button gets the dot. It costs no width, and without it the only
       always-visible sign that you have work the files do not have is the
       chip's own dot, which is about the subject in front of you rather than
       about the other four. */
    const more = $('#edMore');
    if (more) {
      more.classList.toggle('dot', n > 0);
      more.title = n ? 'More — ' + n + ' not exported' : 'More';
    }
  },

  /* The status line under the canvas: where the pointer is and what is there. */
  readout() {
    const el = $('#readout');
    if (!el) return;
    const bits = [];
    if (Mode.id !== 'levels') {
      /* The readout describes the tile under the pointer. There is no map in
         the other two modes, so it carries the message and nothing else. */
      el.textContent = this.msg || '';
      el.hidden = !this.msg;
      return;
    }
    const t = View.hover;
    if (t) {
      bits.push('(' + t.x + ',' + t.y + ')');
      const z = World.zoneAt(t.x, t.y);
      bits.push(z ? ((ZONES[z] || {}).name || z) : 'void');
      bits.push(World.isSolid(t.x, t.y) ? 'solid' : 'walkable');
      const objs = Doc.objectsAt(t.x, t.y);
      if (objs.length) bits.push(objs.map(x => x.o.name || x.o.kind).join(' · '));
    }
    if (this.msg) bits.push('— ' + this.msg);
    el.textContent = bits.join('  ·  ');
    /* An empty readout is an empty box floating over the map, which reads as a
       thing that has gone wrong rather than as nothing to say. */
    el.hidden = !bits.length;
  },

  /* ---- the panes ---- */

  refresh() {
    this.histButtons();
    this.faultPill();
    /* One walk of the bench for both the bar's count and the chip's dot: it is
       a JSON compare per document and a list compare per mode, which is cheap
       once and wasteful twice. */
    const bench = Mode.changes();
    this.benchPill(bench);
    Mode.what(bench);
    /* Debounced inside; this is every commit, not every keystroke. */
    Bank.bump();
    const sel = $('#edSubject');
    if (sel && Mode.current() && sel.value !== Mode.current()) sel.value = Mode.current();
    if (Mode.id === 'jobs') return JobsUI.refresh();
    if (Mode.id === 'talk') return TalkUI.refresh();
    if (Mode.id === 'things') return ThingsUI.refresh();
    if (Mode.id === 'zones') return ZonesUI.refresh();
    if (Mode.id === 'office') return OfficeUI.refresh();
    if (Mode.id === 'prog') return ProgUI.refresh();
    if (Mode.id === 'calls') return CallsUI.refresh();
    if (Mode.id === 'art') return ArtUI.refresh();
    if (Mode.id === 'games') return GamesUI.refresh();
    this.context();
    if (this.tab === 'inspect') this.inspect();
    else if (this.tab === 'check') this.check();
    else if (this.tab === 'palette') Palette.render();
    else if (this.tab === 'level') this.level();
    else if (this.tab === 'export') this.exportPane();
    this.readout();
  },
  /* One badge on the Check tab, whichever document is open. */
  faultPill() {
    const c = Mode.checker();
    const n = c.faults.length;
    const el = $('#edFaultN');
    el.textContent = n ? String(n) : '';
    el.className = 'pill' + (c.errors() ? ' bad' : n ? ' warn' : '');
  },

  /* ---- inspect ---- */
  inspect() {
    const p = $('#paneInspect');
    if (Sel.kind === 'object') return this.inspectObject(p);
    if (Sel.kind === 'room') return this.inspectRoom(p);
    if (Sel.kind === 'door') return this.inspectDoor(p);
    if (Sel.kind === 'counter') return this.inspectCounter(p);
    if (Sel.kind === 'entry') return this.inspectEntry(p);
    if (Sel.kind === 'wp') return this.inspectWaypoint(p);
    return this.finder(p);
  },

  inspectWaypoint(p) {
    const name = Sel.name, w = Doc.waypoints[name];
    if (!w) { Sel.kind = null; return this.inspect(); }
    const solid = World.isSolid(w[0], w[1]);
    p.innerHTML = '<h3>✜ ' + esc(name) + '</h3>'
      + this.row('tile', '<input type="number" data-f="x" value="' + w[0] + '"> '
        + '<input type="number" data-f="y" value="' + w[1] + '">')
      + '<div class="note">' + (solid
        ? '⚠ This tile is solid. NPC movement is greedy rather than pathfound, so anybody '
          + 'sent here walks into it until the stuck timer gives up.'
        : 'On floor, which is the whole requirement. Whole tiles, not halves — a waypoint is '
          + 'a square somebody walks at until they are close enough.') + '</div>'
      + '<div class="note">Used by the NPC schedules in data/npcs.js. Renaming one here does '
      + 'not rename it there, so move them rather than renaming them.</div>'
      + '<div class="btns"><button data-a="del" class="warn">Delete</button></div>';
    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        const x = el.dataset.f === 'x' ? +el.value : w[0];
        const y = el.dataset.f === 'y' ? +el.value : w[1];
        Doc.setWaypoint(name, x, y);
        this.refresh();
      };
    });
    p.querySelector('[data-a="del"]').onclick = () => { Doc.removeWaypoint(name); Tools.select(null); };
  },

  /* Nothing selected is not nothing to show. Three hundred objects on the hub
     is more than anybody can find by looking, so the empty inspector is the
     level's contents page: what is on it, what has an act behind it, what the
     check is unhappy about, and a way to walk to any of them. It was a search
     box that did nothing at all until you typed in it — which on a phone, where
     the panel is folded away by default, meant the answer to "what is on this
     level" was to know already. */
  FILTERS: [
    { k: 'all', label: 'Everything' },
    { k: 'use', label: 'With an act' },
    { k: 'solid', label: 'Solid' },
    { k: 'fault', label: 'Flagged' },
  ],
  finder(p) {
    const q = (this.find || '').toLowerCase();
    const only = this.findOnly || 'all';
    /* Which objects the check has something to say about, so "show me the ones
       that are wrong" is one tap rather than a reading exercise. */
    const flagged = new Set(Check.faults.map(f => f.obj).filter(i => i !== undefined));

    let hits = Doc.objects.map((o, i) => ({ o: o, i: i }));
    if (only === 'use') hits = hits.filter(h => h.o.use);
    else if (only === 'solid') hits = hits.filter(h => h.o.solid);
    else if (only === 'fault') hits = hits.filter(h => flagged.has(h.i));
    if (q) hits = hits.filter(h => (h.o.name || '').toLowerCase().indexOf(q) >= 0
      || (h.o.kind || '').toLowerCase().indexOf(q) >= 0
      || (h.o.use || '').toLowerCase().indexOf(q) >= 0);

    const total = hits.length;
    const shown = hits.slice(0, 80);

    p.innerHTML = '<div class="seek">'
      + '<input id="edSeek" value="' + esc(this.find || '') + '" placeholder="Find by name, kind or use">'
      + '<div class="chips">' + this.FILTERS.map(f =>
        '<button data-only="' + f.k + '" class="' + (f.k === only ? 'on' : '') + '">'
        + esc(f.label) + (f.k === 'fault' && flagged.size ? ' ' + flagged.size : '') + '</button>').join('')
      + '</div></div>'
      + '<h4>' + total + ' of ' + Doc.objects.length + ' objects</h4>'
      + (shown.length
        ? '<ul class="list">' + shown.map(h =>
          '<li data-i="' + h.i + '"><b><span class="li-e">' + esc(h.o.e || '\u00b7') + '</span>'
          + esc(h.o.name || h.o.kind) + '</b>'
          + '<em>' + esc(h.o.kind) + ' \u00b7 (' + h.o.x + ',' + h.o.y + ')'
          + (h.o.use ? ' \u00b7 ' + esc(h.o.use) : '')
          + (flagged.has(h.i) ? ' \u00b7 \u26a0' : '') + '</em></li>').join('') + '</ul>'
          + (total > shown.length ? '<p class="empty">' + (total - shown.length)
            + ' more \u2014 narrow it down above.</p>' : '')
        : '<p class="empty">Nothing on this level matches.</p>')
      + '<div class="note">Choosing one walks the map to it and picks it up. '
      + 'Rooms, doors, counters, arrival points and waypoints are all selectable on the '
      + 'map too \u2014 the furniture is simply what is on top.</div>';

    const seek = $('#edSeek');
    seek.oninput = () => { this.find = seek.value; this.finder(p); $('#edSeek').focus(); };
    p.querySelectorAll('[data-only]').forEach(b => {
      b.onclick = () => { this.findOnly = b.dataset.only; this.finder(p); };
    });
    p.querySelectorAll('[data-i]').forEach(li => {
      li.onclick = () => {
        const i = +li.dataset.i;
        this.centre(Doc.objects[i].x, Doc.objects[i].y);
        Tools.select('object', i);
      };
    });
  },

  inspectObject(p) {
    const i = Sel.i, o = Doc.objects[i];
    if (!o) { Sel.kind = null; return this.inspect(); }
    const built = Doc.built(i);
    const extra = {};
    Object.keys(o).forEach(k => {
      if (['_k', 'x', 'y', 'e', 'name', 'kind', 'solid', 'use', 'furn', 'turn'].indexOf(k) < 0) extra[k] = o[k];
    });

    p.innerHTML = '<h3><span class="h-e">' + esc(o.e || '\u00b7') + '</span>'
      + esc(o.name || o.kind) + '</h3>'
      + this.row('name', '<input data-f="name" value="' + esc(o.name || '') + '">')
      + this.row('emoji', '<input data-f="e" value="' + esc(o.e || '') + '" size="3">')
      + this.row('kind', '<input data-f="kind" value="' + esc(o.kind || '') + '" list="edKinds">')
      + this.row('use', '<input data-f="use" value="' + esc(o.use || '') + '">')
      + this.row('tile', '<input type="number" data-f="x" value="' + o.x + '"> '
        + '<input type="number" data-f="y" value="' + o.y + '">')
      + this.row('solid', '<input type="checkbox" data-f="solid"' + (o.solid ? ' checked' : '') + '>')
      + this.row('facing', this.turnOptions(o))
      + this.row('sprite', this.spriteOptions(o))
      + this.row('other', '<textarea data-f="_extra" rows="3">'
        + esc(Object.keys(extra).length ? JSON.stringify(extra) : '') + '</textarea>')
      + '<div class="note">' + this.builtNote(built) + '</div>'
      + '<div class="btns"><button data-a="brush">Use as brush</button>'
      + '<button data-a="dup">Duplicate</button>'
      + '<button data-a="del" class="warn">Delete</button></div>';

    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        const f = el.dataset.f;
        if (f === '_sprite') { this.setSprite(i, el.value); return; }
        if (f === 'x' || f === 'y') {
          const x = f === 'x' ? +el.value : o.x, y = f === 'y' ? +el.value : o.y;
          Doc.moveObject(i, x, y);
        } else if (f === 'solid') {
          Doc.setObject(i, 'solid', el.checked);
        } else if (f === '_extra') {
          let parsed = null;
          try { parsed = el.value.trim() ? JSON.parse(el.value) : {}; }
          catch (_) { this.say('That is not valid JSON, so nothing was changed.'); this.refresh(); return; }
          Doc.mark('edit ' + (o.name || o.kind));
          Object.keys(extra).forEach(k => delete o[k]);
          Object.assign(o, parsed);
          Doc.rebuild();
        } else {
          Doc.setObject(i, f, el.value);
        }
        this.refresh();
      };
    });
    /* Load this exact object into the object tool. The palette holds one of
       each KIND, so it cannot offer the one that has been edited since — a
       `furn:` override, a custom `use`. This can, and alt-click on the map is
       the same thing for a mouse. */
    p.querySelectorAll('[data-turn]').forEach(b => {
      b.onclick = () => { Doc.setObject(i, 'turn', +b.dataset.turn || ''); this.refresh(); };
    });
    p.querySelector('[data-a="brush"]').onclick = () => {
      const b = clone(o); delete b._k; delete b.x; delete b.y;
      Tools.brush = b;
      Tools.set('object');
      this.say('The object tool is holding \u201c' + (o.name || o.kind) + '\u201d.');
    };
    p.querySelector('[data-a="dup"]').onclick = () => Tools.duplicate();
    p.querySelector('[data-a="del"]').onclick = () => { Doc.removeObject(i); Tools.select(null); };
  },
  /* Which named rectangle in the atlas this object draws, including any brought
     in through the Art tab. It is stored as `furn: { sprite }` on the object —
     an override merged over FURN[kind], which is the same mechanism that gives
     The Printer the whole copier while the other three get the desk crop. */
  /* Which way round it is. Four quarter turns, because the art is pixel art on
     a square grid and anything between them is a smear — and as buttons rather
     than a number, because "2" is not a direction anybody can picture.

     ART ONLY, and the note says so: turning a desk does not turn what it is
     solid on or where you press E. `T` on the map does the same thing, so the
     one you reach for is whichever is nearer. */
  TURNS: [[0, '↑', 'as drawn'], [1, '→', 'a quarter turn clockwise'],
    [2, '↓', 'upside down'], [3, '←', 'a quarter turn anticlockwise']],
  turnOptions(o) {
    const t = (o.turn || 0) & 3;
    return '<span class="turns">' + this.TURNS.map(([v, glyph, title]) =>
      '<button type="button" data-turn="' + v + '" class="' + (v === t ? 'on' : '') + '"'
      + ' title="' + esc(title) + '">' + glyph + '</button>').join('') + '</span>';
  },

  spriteOptions(o) {
    const own = (o.furn || {}).sprite || '';
    const names = Tiles.rects ? Object.keys(Tiles.rects).sort() : [];
    return '<select data-f="_sprite">'
      + '<option value=""' + (own ? '' : ' selected') + '>— whatever its kind draws —</option>'
      + names.map(n => '<option value="' + esc(n) + '"' + (n === own ? ' selected' : '') + '>'
        + esc(n) + '</option>').join('')
      + '</select>';
  },
  setSprite(i, name) {
    const o = Doc.objects[i];
    if (!o) return;
    Doc.mark('re-sprite ' + (o.name || o.kind));
    const furn = Object.assign({}, o.furn || {});
    if (name) furn.sprite = name; else delete furn.sprite;
    if (Object.keys(furn).length) o.furn = furn; else delete o.furn;
    Doc.rebuild();
    this.refresh();
  },

  /* What the builder made of it — the derived half, which is exactly the half
     you cannot see from the source and the reason a thing ends up on the floor
     when it was meant to be on a wall. */
  builtNote(b) {
    if (!b) return 'Not in the built map — check the tile is inside it.';
    const bits = [];
    bits.push('drawn ' + (b.mount === 'wall' ? 'on the ' + ({ n: 'north', s: 'south', e: 'east', w: 'west' }[b.wallSide] || '?') + ' wall'
      : b.mount === 'surface' ? (b.onTable ? 'on a table' : 'on a worktop') : 'on the floor'));
    if (b.fdef && b.fdef.sprite) bits.push('sprite ' + b.fdef.sprite);
    else if (b.art) bits.push('drawn as ' + b.art);
    else if (b.noEmoji) bits.push('drawn by the renderer');
    else bits.push('emoji at ' + ((b.fdef || {}).size || 20) + 'px');
    if (b.onCounter) bits.push('on a counter');
    return bits.join(' · ');
  },

  inspectRoom(p) {
    const i = Sel.i, rm = Doc.rooms[i];
    if (!rm) { Sel.kind = null; return this.inspect(); }
    const [x1, y1, x2, y2] = rm.r;
    p.innerHTML = '<h3>▦ ' + esc((ZONES[rm.z] || {}).name || rm.z) + '</h3>'
      + this.row('zone', '<select data-f="z">' + Object.keys(ZONES).map(z =>
        '<option value="' + esc(z) + '"' + (z === rm.z ? ' selected' : '') + '>'
        + esc(ZONES[z].name) + '</option>').join('') + '</select>')
      + this.row('from', '<input type="number" data-f="x1" value="' + x1 + '"> '
        + '<input type="number" data-f="y1" value="' + y1 + '">')
      + this.row('to', '<input type="number" data-f="x2" value="' + x2 + '"> '
        + '<input type="number" data-f="y2" value="' + y2 + '">')
      + '<div class="note">' + (x2 - x1 + 1) + ' × ' + (y2 - y1 + 1) + ' tiles</div>'
      /* What this room is MADE of, where you are drawing it. A zone is one row
         of data/world.js shared by every room painted with it, so the floor and
         the wall are edited on the Rooms tab and not here — but "what is this
         floor" was a question the level editor could not answer at all, and the
         answer to it is a picture rather than a word. */
      + '<h4>Made of</h4>'
      + (ZONES[rm.z]
        ? '<div class="mats read">'
          + '<span class="mat" data-room-mat="floor"><span class="mat-p"></span><b>floor</b></span>'
          + '<span class="mat" data-room-mat="wall"><span class="mat-p"></span><b>wall</b></span>'
          + '</div>'
          + '<div class="btns"><button data-a="paint">Change what it is made of…</button></div>'
          + '<div class="note">Opens this room type on the Rooms tab, where its floor, its walls '
          + 'and its colours are. Every room painted with it changes — that is what a room type '
          + 'is.</div>'
        /* A room painted with a zone ZONES has no entry for. The check says so
           too; here it is the reason there is nothing to show a picture of. */
        : '<div class="note bad">This room names <code>' + esc(rm.z) + '</code>, and there is no '
          + 'such room type — so the renderer has nothing to look it up in and draws it as bare '
          + 'default. Pick one above, or make it on the Rooms tab.</div>')
      + '<div class="btns"><button data-a="del" class="warn">Delete</button></div>';

    /* Read-only swatches: the bitmap the renderer will use, asked of the
       renderer. Canvases rather than data URIs — see ZonesUI.paint(). */
    p.querySelectorAll('[data-room-mat]').forEach(el => {
      const cv = Zones.tileOf(el.dataset.roomMat, rm.z);
      const host = el.querySelector('.mat-p');
      if (!cv || !host) return;
      const out = document.createElement('canvas');
      out.width = cv.width; out.height = cv.height;
      out.getContext('2d').drawImage(cv, 0, 0);
      host.appendChild(out);
    });
    const paint = p.querySelector('[data-a="paint"]');
    if (paint) paint.onclick = () => Project.goTo('zones', rm.z, 'inspect');

    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        if (el.dataset.f === 'z') { Doc.setRoomZone(i, el.value); this.refresh(); return; }
        const v = { x1: x1, y1: y1, x2: x2, y2: y2 };
        v[el.dataset.f] = +el.value;
        Doc.mark('resize room');
        rm.r = [Math.min(v.x1, v.x2), Math.min(v.y1, v.y2), Math.max(v.x1, v.x2), Math.max(v.y1, v.y2)];
        Doc.rebuild();
        this.refresh();
      };
    });
    p.querySelector('[data-a="del"]').onclick = () => { Doc.removeRoom(i); Tools.select(null); };
  },

  inspectDoor(p) {
    const i = Sel.i, d = Doc.doors[i];
    if (!d) { Sel.kind = null; return this.inspect(); }
    p.innerHTML = '<h3>🚪 ' + esc(d.name || 'Door') + '</h3>'
      + this.row('name', '<input data-f="name" value="' + esc(d.name || '') + '">')
      + this.row('zone', '<select data-f="z">' + Object.keys(ZONES).map(z =>
        '<option value="' + esc(z) + '"' + (z === d.z ? ' selected' : '') + '>'
        + esc(ZONES[z].name) + '</option>').join('') + '</select>')
      + this.row('tile', '<input type="number" data-f="x" value="' + d.x + '"> '
        + '<input type="number" data-f="y" value="' + d.y + '">')
      + this.row('locked by', '<input data-f="locked" value="' + esc(d.locked || '') + '" placeholder="an item id, or empty">')
      + '<div class="note">A door is walkable floor punched through the wall. The leaf and '
      + 'the jambs are art — nothing here changes what is solid except the hole itself.</div>'
      + '<div class="btns"><button data-a="del" class="warn">Delete</button></div>';
    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        const f = el.dataset.f;
        Doc.setDoor(i, f, f === 'x' || f === 'y' ? +el.value : el.value);
        this.refresh();
      };
    });
    p.querySelector('[data-a="del"]').onclick = () => { Doc.removeDoor(i); Tools.select(null); };
  },

  inspectCounter(p) {
    const i = Sel.i, t = Doc.counters[i];
    if (!t) { Sel.kind = null; return this.inspect(); }
    p.innerHTML = '<h3>▤ ' + esc(t.label || 'Counter') + '</h3>'
      + this.row('label', '<input data-f="label" value="' + esc(t.label || '') + '">')
      + this.row('tile', '<input type="number" data-f="x" value="' + t.x + '"> '
        + '<input type="number" data-f="y" value="' + t.y + '">')
      + this.row('width', '<input type="number" data-f="w" value="' + t.w + '" min="1">')
      + '<div class="note">Bare stretches of a counter are solid — but through World.blocked, '
      + 'not World.solid, or the renderer grows a wall on it.</div>'
      + '<div class="btns"><button data-a="del" class="warn">Delete</button></div>';
    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        Doc.mark('edit counter');
        const f = el.dataset.f;
        t[f] = f === 'label' ? el.value : +el.value;
        Doc.rebuild();
        this.refresh();
      };
    });
    p.querySelector('[data-a="del"]').onclick = () => { Doc.removeCounter(i); Tools.select(null); };
  },

  inspectEntry(p) {
    const name = Sel.name, e = Doc.entries[name];
    if (!e) { Sel.kind = null; return this.inspect(); }
    p.innerHTML = '<h3>⚑ ' + esc(name) + '</h3>'
      + this.row('at', '<input type="number" step="0.5" data-f="x" value="' + e[0] + '"> '
        + '<input type="number" step="0.5" data-f="y" value="' + e[1] + '">')
      + '<div class="note">In tiles, not pixels, and fractional on purpose — data/levels.js '
      + 'loads before TILE exists, so the loader multiplies. A link from another level names '
      + 'this by its key.</div>'
      + '<div class="btns"><button data-a="del" class="warn">Delete</button></div>';
    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        Doc.mark('move entry ' + name);
        Doc.entries[name][el.dataset.f === 'x' ? 0 : 1] = +el.value;
        Doc.rebuild();
        this.refresh();
      };
    });
    p.querySelector('[data-a="del"]').onclick = () => { Doc.removeEntry(name); Tools.select(null); };
  },

  row(label, html) {
    return '<label class="frow"><span>' + esc(label) + '</span><span>' + html + '</span></label>';
  },

  /* ---- check ----
     The faults worth a tool are the ones you cannot see, so this pane is the
     one that has to be readable at a glance: three numbers, then what is wrong,
     errors before warnings. Grouped rather than listed flat — a level with one
     sealed room and six posters on the carpet used to read as seven equally
     alarming lines. */
  check() {
    const p = $('#paneCheck');
    const marooned = Check.marooned.length;
    const errors = Check.faults.filter(f => f.level === 'error');
    const warns = Check.faults.filter(f => f.level === 'warn');

    const group = (list, title, cls) => !list.length ? '' : '<h4>' + title + '</h4>'
      + '<ul class="faults">' + list.map(f =>
        '<li class="' + cls + '" data-i="' + Check.faults.indexOf(f) + '">' + esc(f.msg)
        + (f.tiles.length ? '<em>' + f.tiles.slice(0, 3).map(t => '(' + t[0] + ',' + t[1] + ')').join(' ')
          + (f.tiles.length > 3 ? ' +' + (f.tiles.length - 3) : '') + '</em>' : '')
        + '</li>').join('') + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b>' + Check.open + '</b><span>walkable</span></div>'
      + '<div><b>' + Check.reachable + '</b><span>reachable</span></div>'
      + '<div><b class="' + (marooned ? 'bad' : 'good') + '">' + marooned + '</b><span>marooned</span></div>'
      + '</div>'
      + (Check.faults.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
          + '<div class="btns"><button data-a="next">Walk to the next one</button></div>'
        : '<p class="ok">\u2713 Nothing wrong with this level.</p>')
      + '<div class="note">The check walks World.isSolid and counts how many separate pieces '
      + 'the walkable floor is in. One is right. A piece with no arrival point in it is floor '
      + 'nobody can stand on; two pieces that each have one are rooms you cannot walk between \u2014 '
      + 'which is what the Christmas decorations did to the archive, invisibly, for months.</div>';

    p.querySelectorAll('.faults li').forEach(li => {
      li.onclick = () => this.gotoFault(+li.dataset.i);
    });
    const next = p.querySelector('[data-a="next"]');
    if (next) next.onclick = () => {
      this.faultAt = ((this.faultAt === undefined ? -1 : this.faultAt) + 1) % Check.faults.length;
      this.gotoFault(this.faultAt);
    };
  },
  /* Walk the map to a fault and pick up whatever it is about. Faults that name
     no tile (a bad link, a level with no entries) have nowhere to walk to, and
     say so rather than moving the map somewhere arbitrary. */
  gotoFault(i) {
    const f = Check.faults[i];
    if (!f) return;
    this.faultAt = i;
    if (f.obj !== undefined) Tools.select('object', f.obj);
    else if (f.wp) { View.wps = true; $('#edWps').checked = true; Tools.select('wp', -1, f.wp); }
    if (f.tiles.length) this.centre(f.tiles[0][0], f.tiles[0][1]);
    else this.say(f.msg);
  },
  /* Put a tile in the middle of the map you can SEE — not the middle of the
     canvas, a strip of which is behind the tool rail. */
  centre(tx, ty) {
    View.lookAt((tx + .5) * TILE, (ty + .5) * TILE);
  },

  /* ---- level ---- */
  level() {
    const p = $('#paneLevel');
    p.innerHTML = '<h3>' + esc(Doc.name) + '</h3>'
      + this.row('id', '<code>' + esc(Doc.id) + '</code>')
      + this.row('name', '<input data-f="name" value="' + esc(Doc.name) + '">')
      + this.row('size', '<input type="number" data-f="w" value="' + Doc.w + '" min="4"> '
        + '<input type="number" data-f="h" value="' + Doc.h + '" min="4">')
      + this.row('indoors', '<input type="checkbox" data-f="indoors"' + (Doc.indoors ? ' checked' : '') + '>')
      + this.row('hub', '<input type="checkbox" data-f="hub"' + (Doc.hub ? ' checked' : '') + '>')
      + '<h4>Arrival points</h4>'
      + (Object.keys(Doc.entries).length
        ? '<ul class="list">' + Object.keys(Doc.entries).map(k =>
          '<li data-e="' + esc(k) + '"><b>\u2691 ' + esc(k) + '</b><em>'
          + Doc.entries[k].join(', ') + '</em></li>').join('') + '</ul>'
        : '<p class="empty">None — this level cannot be loaded.</p>')
      + '<div class="btns"><button data-a="entry">Add an arrival point</button></div>'
      + '<h4>Ways out</h4>'
      + (Doc.links.length
        ? '<ul class="list">' + Doc.links.map((l, i) =>
          '<li data-l="' + i + '"><b>' + esc(l.via) + '</b><em>→ ' + esc(l.to)
          + ' · ' + esc(l.entry || 'start') + '</em></li>').join('') + '</ul>'
        : '<p class="empty">None.</p>')
      + '<div class="btns"><button data-a="link">Add a way out</button></div>'
      + '<div class="note">A link is the only place a destination is named. An act says '
      + 'Levels.take(&rsquo;hatch&rsquo;) and never knows where the hatch goes.</div>'
      + (Doc.hub
        ? '<h4>Waypoints <span class="pill">' + Object.keys(Doc.waypoints).length + '</span></h4>'
          + '<ul class="list">' + Object.keys(Doc.waypoints).map(k =>
            '<li data-w="' + esc(k) + '"><b>\u271c ' + esc(k) + '</b><em>'
            + Doc.waypoints[k].join(', ')
            + (World.isSolid(Doc.waypoints[k][0], Doc.waypoints[k][1]) ? ' · ⚠ solid' : '')
            + '</em></li>').join('') + '</ul>'
          + '<div class="btns"><button data-a="wp">Add a waypoint</button></div>'
          + '<div class="note">WP is one table and the schedules that read it are this '
          + 'level\u2019s, which is why waypoints are only edited here. data/npcs.js names '
          + 'them by key: move one freely, rename one and a colleague stops turning up.</div>'
        : '')
      + '<h4>This level</h4>'
      + '<div class="btns"><button data-a="dupe">Duplicate it</button>'
      + '<button data-a="drop" class="warn">Delete it</button></div>'
      + '<div class="btns"><button data-a="try" class="primary">▶ Try this level</button></div>'
      + '<div class="note">Opens the game in a new tab on this level, with your objects, your '
      + 'furnishing and your rooms. The writing and everything with code in it is the file’s — '
      + 'a function cannot be handed over as data.</div>'
      + '<div class="note">Both act on the catalogue in this tab only. Nothing here writes '
      + 'to data/levels.js \u2014 the Export tab is the deliverable, and always was.</div>';

    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        const f = el.dataset.f;
        if (f === 'w' || f === 'h') Doc.setSize(f === 'w' ? +el.value : Doc.w, f === 'h' ? +el.value : Doc.h);
        else if (f === 'indoors' || f === 'hub') Doc.setFlag(f, el.checked);
        else Doc.setFlag(f, el.value);
        View.clamp();
        this.refresh();
      };
    });
    p.querySelectorAll('[data-e]').forEach(li => {
      li.onclick = () => Tools.select('entry', -1, li.dataset.e);
    });
    p.querySelectorAll('[data-w]').forEach(li => {
      li.onclick = () => {
        const k = li.dataset.w;
        /* Turn the layer on rather than selecting something the map is not
           showing — otherwise the inspector describes an invisible marker. */
        View.wps = true; $('#edWps').checked = true;
        this.centre(Doc.waypoints[k][0], Doc.waypoints[k][1]);
        Tools.select('wp', -1, k);
      };
    });
    p.querySelectorAll('[data-l]').forEach(li => {
      li.onclick = () => this.editLink(+li.dataset.l);
    });
    p.querySelector('[data-a="link"]').onclick = () => this.editLink(-1);
    p.querySelector('[data-a="entry"]').onclick = () => this.addMarker('entry');
    const wpb = p.querySelector('[data-a="wp"]');
    if (wpb) wpb.onclick = () => this.addMarker('wp');
    p.querySelector('[data-a="dupe"]').onclick = () => Ed.duplicateLevel();
    p.querySelector('[data-a="drop"]').onclick = () => Ed.deleteLevel();
    p.querySelector('[data-a="try"]').onclick = () => Play.go();
  },

  /* Both markers used to be placeable only by a gesture with a shift key in it,
     which is a gesture a phone does not have — so on a phone a new level could
     never be given the arrival point without which it will not load, and a
     waypoint could be moved but never made. Asked for by name and dropped in
     the middle of what you are looking at, which is somewhere you can see. */
  addMarker(what) {
    const e = View.eye();
    const t = View.toTile(e.x, e.y);
    t.x = clamp(t.x, 0, Doc.w - 1); t.y = clamp(t.y, 0, Doc.h - 1);
    const wp = what === 'wp';
    Ask.form(wp ? 'A new waypoint' : 'A new arrival point', [
      { k: 'name', label: 'called', value: '',
        hint: wp ? 'what a schedule in data/npcs.js will name' : 'what a link from another level names' },
    ], 'Place it').then(v => {
      if (!v || !v.name) return;
      const bag = wp ? Doc.waypoints : Doc.entries;
      if (bag[v.name]) { this.say('There is already one called ' + v.name + '.'); return; }
      if (wp) Doc.addWaypoint(v.name, t.x, t.y); else Doc.addEntry(v.name, t.x, t.y);
      if (wp) { View.wps = true; $('#edWps').checked = true; }
      Tools.select(wp ? 'wp' : 'entry', -1, v.name);
      Tools.set(wp ? 'select' : 'entry');
      this.say('Placed ' + v.name + ' at (' + t.x + ',' + t.y + ') — drag it where it belongs.');
    });
  },

  /* One form for both, because adding and editing a way out ask exactly the
     same three questions. `to` is a select: the destinations are a known set and
     a typo there is a door that silently does nothing. */
  editLink(i) {
    const l = i >= 0 ? Doc.links[i] : { via: '', to: Levels.ids().filter(x => x !== Doc.id)[0] || 'office', entry: 'start' };
    if (!l) return;
    /* The handlers on this level that could plausibly be a way out — anything
       with a `use`. Offered rather than demanded: a link may be written before
       the object that takes it exists, and the check will say so. */
    const uses = Array.from(new Set(Doc.objects.map(o => o.use).filter(Boolean))).sort();
    Ask.form(i >= 0 ? 'Edit a way out' : 'Add a way out', [
      { k: 'via', label: 'you take', value: l.via, hint: 'the `use` handler, e.g. hatch',
        options: uses.length ? uses : null },
      { k: 'to', label: 'to level', value: l.to, options: Levels.ids() },
      { k: 'entry', label: 'arriving at', value: l.entry || 'start', hint: 'an entry over there' },
    ], i >= 0 ? 'Save' : 'Add').then(v => {
      if (!v || !v.via || !v.to) return;
      Doc.mark(i >= 0 ? 'edit link' : 'add link');
      const link = { via: v.via, to: v.to, entry: v.entry || 'start' };
      if (i >= 0) Doc.links[i] = link; else Doc.links.push(link);
      Doc.rebuild();
      this.refresh();
    });
  },

  /* ---- export ---- */
  exportPane() {
    const shared = Emit.usesSharedDefs();
    const flat = Emit.flatIsSafe();
    /* The whole entry is only honest where a flat furnish() is faithful and the
       floor plan is the level's own — which is exactly the case for a level
       invented here, and for the flat ones that already exist. */
    const whole = flat && !shared;
    Side.exportChoices({
      rows: 18,
      name: v => Doc.id + '.' + v + '.txt',
      /* Four of the six are conditional, which is what a filtered list of
         choices is for: an option that cannot say anything true about this
         level is not offered rather than offered and hedged. */
      choices: [
        whole && { v: 'entry', label: 'Whole entry &rarr; data/levels.js',
          src: () => Emit.levelEntry(),
          note: 'The complete catalogue entry — drop it into `const LEVELS = { … }` '
            + 'in data/levels.js. A level created here exists in this tab and nowhere else until '
            + 'you do.' },
        { v: 'geometry', label: 'Geometry &rarr; data/levels.js',
          src: () => Emit.geometry(),
          note: 'The data half of this level’s entry. Literal in the file and '
            + 'literal here, so it pastes straight over the old block.'
            + (shared ? ' The floor plan itself is a reference to data/world.js — export that separately.' : '') },
        shared && { v: 'plan', label: 'Floor plan &rarr; data/world.js',
          src: () => Emit.roomDefs() + '\n' + Emit.doorDefs(),
          note: 'ROOM_DEFS and DOOR_DEFS, for data/world.js. This level names them '
            + 'rather than carrying its own copy.' },
        Object.keys(Doc.waypoints).length && { v: 'wp', label: 'Waypoints &rarr; data/world.js',
          src: () => Emit.waypointDefs(),
          note: 'The WP table, for data/world.js. The NPC schedules in data/npcs.js '
            + 'name these by key, so moving one is safe and renaming one is not.' },
        { v: 'furnish', label: 'Whole furnish() &rarr; data/levels.js',
          src: () => Emit.furnish(),
          note: flat
            ? 'A whole furnish(). This level’s furniture is a flat list already, so this is a '
              + 'faithful replacement.'
            : '⚠ This level builds its furniture with loops and explains itself in comments. '
              + 'Pasting this would replace all of that with one line per object. Use the change '
              + 'list instead unless you mean it.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.changeText(),
          note: 'What you changed, so you can edit the source rather than regenerate it.' }
      ].filter(Boolean)
    });
  },

  /* Copy and Download, under every export pane. Copy is the affordance that
     matters — it works everywhere — and Download is the one thing that differs
     by where this page is being served from. */
  /* THE EXPORT PANE, which is the same pane nine times.
     Every document ends at the same place — a `what` select, a note under it,
     a read-only textarea and Copy/Download — and the only thing that differs
     between them is WHICH sources the select is choosing between. That was
     nine copies of the same markup and the same render/onchange wiring, which
     is nine places for the textarea to grow a row or the buttons to change
     and eight of them to be missed.

     A document now declares its choices and nothing else:

       choices  [{ v, label, src(), note }]  — `label` is HTML, so a caller
                that interpolates anything escapes it, exactly as before
       name     (value) => the download's filename
       rows     the textarea's height, where 16 is not what it wanted
       buttons  extra buttons inside the row, wired by the caller afterwards
       after    anything below the buttons

     Returns the pane, so a caller with an extra button has something to hang
     it on. */
  exportChoices(opts) {
    const p = $('#paneExport');
    const choices = opts.choices;
    p.innerHTML = '<label class="frow"><span>what</span><span><select id="edWhat">'
      + choices.map(c => '<option value="' + c.v + '">' + c.label + '</option>').join('')
      + '</select></span></label>'
      + '<div class="note" id="edWhatNote"></div>'
      + '<textarea id="edOut2" class="code" rows="' + (opts.rows || 16) + '" spellcheck="false" readonly wrap="off"></textarea>'
      + '<div class="btns"><button data-a="copy">Copy</button>'
      + '<button data-a="dl">Download</button>' + (opts.buttons || '') + '</div>'
      + (opts.after || '');
    const sel = $('#edWhat'), out = $('#edOut2'), note = $('#edWhatNote');
    const render = () => {
      const c = choices.filter(x => x.v === sel.value)[0] || choices[0];
      out.value = c.src();
      note.textContent = typeof c.note === 'function' ? c.note() : c.note;
    };
    sel.onchange = render;
    render();
    this.wireExport(p, out, () => opts.name(sel.value));
    return p;
  },
  wireExport(p, out, name) {
    p.querySelector('[data-a="copy"]').onclick = () => {
      out.select();
      const ok = navigator.clipboard
        ? navigator.clipboard.writeText(out.value).then(() => true, () => false)
        : Promise.resolve(document.execCommand && document.execCommand('copy'));
      Promise.resolve(ok).then(good => this.say(good ? 'Copied.' : 'Could not copy — select it and copy by hand.'));
    };
    p.querySelector('[data-a="dl"]').onclick = () => this.download(name(), out.value);
  },

  /* Saving a file is the one thing that is not the same everywhere the editor
     runs. Served off disk or a local server it is an <a download>; inside the
     claude.ai artifact viewer that is inert by design and the host mediates the
     save instead. Asked for in that order, because the host is the special case
     and its absence is the normal one — and `use()` resolving null is how a
     viewer that cannot save says so, which is a message rather than a dead
     button. Copy is always there either way. */
  MIME: { png: 'image/png', txt: 'text/plain', md: 'text/markdown', json: 'application/json' },
  download(name, text) {
    const type = this.MIME[String(name).split('.').pop().toLowerCase()] || 'text/plain';
    const host = window.claude && typeof window.claude.use === 'function'
      ? window.claude.use('downloads') : Promise.resolve(null);
    host.then(dl => {
      if (!dl) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: type }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.say('Saved ' + name + '.');
        return;
      }
      dl.save({ filename: name, data: text })
        .then(() => this.say('Saved ' + name + '.'))
        .catch(err => this.say(err && err.code === 'declined'
          ? 'Save cancelled — Copy still works.'
          : 'Could not save here. Use Copy instead.'));
    }, () => this.say('Could not save here. Use Copy instead.'));
  }
};

/* ---------------- The palette ----------------
   Built from the game rather than written out here: every distinct object in
   the whole catalogue, so placing a water cooler places THE water cooler —
   right kind, right emoji, right `use` — instead of something that looks like
   one and has no act behind it. */
const Palette = {
  items: [],
  /* Every `use:` handler in the building, and which level it is on. Gathered on
     the same pass, because it is the same walk and a second one would mean
     building all three levels again — and it is what the job editor points a
     tracker target at: `{ obj: 'hatch' }` names a handler, not a tile, so that
     the step survives the floor plan moving. */
  uses: [], useLevel: new Map(),
  filter: '',

  /* Derived from Things.index rather than from a second walk of the building.
     The two walks disagreed: this one read the catalogue for every level while
     Things read the DOCUMENT for the one that is open, and it ran once at boot
     and never again — so a `use:` you placed here was one the job editor would
     not offer and its check called imaginary. Things.build() calls this, so
     there is one walk, one rule about where the open level comes from, and one
     moment at which both go stale. */
  collect(index, uses) {
    const idx = index || Things.index, use = uses || Things.uses;
    const seen = new Map();
    idx.forEach(e => {
      e.places.forEach(pl => {
        const k = e.kind + '|' + pl.e + '|' + pl.use;
        if (seen.has(k)) return;
        seen.set(k, { e: pl.e, name: pl.name, kind: e.kind, solid: pl.solid, use: pl.use });
      });
    });
    this.useLevel = use;
    this.uses = Array.from(use.keys()).sort();
    this.items = Array.from(seen.values()).sort((a, b) =>
      a.kind.localeCompare(b.kind) || String(a.name).localeCompare(String(b.name)));
  },

  /* What the object tool most recently held. Placing forty chairs and then one
     bin and then another chair should not be two hundred objects of scrolling —
     and on a phone, where the palette is a folded-away sheet, it is the
     difference between reaching for a thing and going looking for it. */
  recent: [],
  remember(it) {
    const k = i => i.kind + '|' + i.e + '|' + i.use + '|' + i.name;
    this.recent = [clone(it)].concat(this.recent.filter(r => k(r) !== k(it))).slice(0, 8);
  },
  /* The brush is an object rather than a palette entry — it may have been
     sampled off the map and carry an override the palette knows nothing about —
     so "which one is selected" is a question about what it looks like. */
  isBrush(it) {
    const b = Tools.brush || {};
    return b.kind === it.kind && b.e === it.e && b.use === it.use && b.name === it.name;
  },
  cell(it, attr) {
    return '<button ' + attr + ' class="' + (this.isBrush(it) ? 'on' : '') + '"'
      + ' title="' + esc(it.kind + ' \u00b7 ' + (it.use || 'no act')) + '">'
      + '<span class="pe">' + esc(it.e || '\u00b7') + '</span>'
      + '<span class="pn">' + esc(it.name || it.kind) + '</span></button>';
  },
  pick(it) {
    Tools.brush = clone(it);
    this.remember(it);
    Tools.set('object');
    Side.say('The object tool is holding \u201c' + (it.name || it.kind) + '\u201d.');
    Side.refresh();
  },

  render() {
    const p = $('#panePalette');
    const q = this.filter.toLowerCase();
    const list = this.items.filter(it => !q
      || (it.name || '').toLowerCase().indexOf(q) >= 0
      || (it.kind || '').toLowerCase().indexOf(q) >= 0
      || (it.use || '').toLowerCase().indexOf(q) >= 0);

    p.innerHTML = '<div class="seek">'
      + '<input id="edFind" value="' + esc(this.filter) + '" placeholder="Find by name, kind or use">'
      + '</div>'
      + (this.recent.length && !q
        ? '<h4>Just used</h4><div class="pal">'
          + this.recent.map((it, i) => this.cell(it, 'data-r="' + i + '"')).join('') + '</div>'
        : '')
      + '<h4>' + (q ? list.length + ' of ' + this.items.length : 'Everything in the game') + '</h4>'
      + (list.length
        ? '<div class="pal">' + list.map((it, i) => this.cell(it, 'data-i="' + i + '"')).join('') + '</div>'
        : '<p class="empty">Nothing in the catalogue matches.</p>')
      + '<div class="btns"><button data-a="custom">Make one up\u2026</button></div>'
      + '<div class="note">These are the real objects out of the catalogue, so the act behind '
      + 'the <code>use</code> already exists \u2014 placing a water cooler places THE water '
      + 'cooler. Alt-clicking one on the map takes a copy of that one instead, overrides and '
      + 'all.</div>';

    const find = $('#edFind');
    find.oninput = () => { this.filter = find.value; this.render(); $('#edFind').focus(); };
    p.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => this.pick(list[+b.dataset.i]);
    });
    p.querySelectorAll('[data-r]').forEach(b => {
      b.onclick = () => this.pick(this.recent[+b.dataset.r]);
    });
    p.querySelector('[data-a="custom"]').onclick = () => {
      Ask.form('Make one up', [
        { k: 'name', label: 'name', value: 'A thing' },
        { k: 'e', label: 'emoji', value: '\ud83d\udce6' },
        { k: 'kind', label: 'kind', value: 'box', options: Object.keys(FURN).sort() },
        { k: 'use', label: 'use', value: '', hint: 'a handler in data/acts.js \u2014 may be blank' },
      ], 'Place it').then(v => {
        if (!v || !v.name) return;
        const it = { e: v.e || '\ud83d\udce6', name: v.name, kind: v.kind || 'box', solid: true };
        if (v.use) it.use = v.use;
        this.pick(it);
      });
    };
  }
};
