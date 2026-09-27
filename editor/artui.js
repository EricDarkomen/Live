'use strict';
/* ---------------- The art importer's panes ----------------
   The workspace is the sheet itself, drawn at an honest zoom with a grid over
   it, and you slice it by dragging. That is the whole interface, because the
   only question a tileset asks is "which pixels are the printer" and the only
   way to answer it is to look.

   Two things are deliberate. The grid is how you PICK a rectangle and not how
   one is stored — every entry is in pixels, because the kit's wall items are
   not on the 32px grid and rounding one to a cell clips the frame off it. And
   the sheet is drawn with smoothing off at integer scales: pixel art resampled
   at 1.37× is pixel art you cannot slice, because the seam you are looking for
   is one pixel wide. */

const ArtUI = {
  zoom: 2,
  sel: null,          /* the rectangle being dragged out, in sheet pixels */
  drag: null,
  t: 0,

  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },

  /* ---- the workspace ---- */
  workspace() {
    const el = $('#artWork');
    if (!el) return;
    const s = Art.sheet();
    if (!s) {
      el.innerHTML = '<div class="work-head"><h2>Art</h2>'
        + '<span class="work-sub">Bring in a tileset or a character sheet</span></div>'
        + '<div class="drop" id="edDrop">'
        + '<b>Drop a PNG here</b>'
        + '<span>or <button data-a="pick" class="primary">choose a file</button></span>'
        + '<small>A tileset becomes named rectangles the map can draw; a character sheet becomes '
        + 'rows of people. Either way it lives in this tab until you export it — nothing here '
        + 'writes to art/.</small>'
        + '<small class="warnline">You will be asked who made it and under what licence, and '
        + 'the answer has to be OGA-BY 3.0 or CC0. That is not this editor being fussy: the '
        + 'game’s art is licensed separately (LICENSE part 2) and the build refuses an asset '
        + 'whose licence it cannot prove.</small>'
        + '</div>';
      this.wireDrop(el);
      return;
    }
    el.innerHTML = '<div class="work-head"><h2>' + esc(s.credit.name || s.id) + '</h2>'
      + '<span class="work-sub">' + s.w + '×' + s.h + ' · '
      + (s.kind === 'people'
        ? Art.rows() + ' rows · ' + s.frames + ' frames per direction · ' + s.dirs.length + ' directions'
        : s.entries.length + ' named') + ' · '
      + esc(s.credit.author || 'no author') + ' · ' + esc(s.credit.licence) + '</span></div>'
      + '<div class="artbar">'
      + '<button data-a="out">−</button><span id="artZoom">' + this.zoom + '×</span>'
      + '<button data-a="in">+</button>'
      + '<span class="spacer"></span>'
      + '<button data-a="pick">Import another</button>'
      + '</div>'
      + '<div class="artwrap"><canvas id="artView"></canvas></div>'
      + '<p class="empty" id="artHint">' + (s.kind === 'people'
        ? 'Each row is one person. Press a row to say who it is.'
        : 'Drag out a rectangle to name it. It snaps to the grid; the entry is kept in pixels.')
      + '</p>';
    this.wireDrop(el);
    el.querySelector('[data-a="in"]').onclick = () => { this.zoom = clamp(this.zoom + 1, 1, 8); this.workspace(); };
    el.querySelector('[data-a="out"]').onclick = () => { this.zoom = clamp(this.zoom - 1, 1, 8); this.workspace(); };
    this.bind($('#artView'), s);
    this.draw();
  },

  wireDrop(el) {
    const pick = el.querySelector('[data-a="pick"]');
    if (pick) pick.onclick = () => $('#edFile').click();
    const zone = el.querySelector('#edDrop') || el;
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('over'); };
    zone.ondragleave = () => zone.classList.remove('over');
    zone.ondrop = e => {
      e.preventDefault();
      zone.classList.remove('over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) this.take(f);
    };
  },

  /* ---- reading one in ----
     The provenance is asked for AFTER the file has decoded, so the form can
     show what it actually is and default the cell size to something sensible
     rather than making you guess before you have seen it. */
  take(file) {
    Art.read(file).then(loaded => this.ask(loaded, file), err => Side.say(err.message));
  },
  ask(loaded, file) {
    /* Prefer the game's own tile where the sheet divides by it. A pass that
       just took the largest divisor answered 64 for a 512px-wide 32px kit,
       which is a grid twice the size of everything on it. */
    const guess = [8, 16, 32, 48, 64].filter(n => loaded.w % n === 0);
    const cell = guess.indexOf(TILE) >= 0 ? TILE : (guess[guess.length - 1] || TILE);
    const base = (file.name || 'sheet').replace(/\.[^.]*$/, '').replace(/[^\w]/g, '') || 'sheet';
    Ask.form('Where is this from?', [
      { k: 'kind', label: 'it is a', value: 'tiles',
        options: ['tiles', 'people'] },
      { k: 'id', label: 'id', value: base, hint: 'names the sheet and its file: art/sprites/<id>.png' },
      { k: 'name', label: 'called', value: file.name || base },
      { k: 'author', label: 'made by', value: '', hint: 'the artist, as their credit entry names them' },
      { k: 'source', label: 'from', value: '', hint: 'a URL somebody else can check' },
      { k: 'licence', label: 'licence', value: 'CC0', options: Art.LICENCES.map(l => l.k) },
      { k: 'cell', label: 'cell size', value: String(cell) },
    ], 'Bring it in').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w]/g, '');
      if (!id) { Side.say('An id has to be a usable file name.'); return; }
      if (Art.sheet(id)) { Side.say('There is already a sheet called ' + id + '.'); return; }
      Art.add({ id: id, kind: v.kind === 'people' ? 'people' : 'tiles',
        name: v.name, author: v.author, source: v.source, licence: v.licence,
        cell: clamp(parseInt(v.cell, 10) || 32, 4, 512) }, loaded);
      Mode.subjectOptions();
      Side.show('inspect');
      const lic = Art.licence(v.licence);
      Side.say(lic.ok ? 'Brought in ' + id + '.'
        : 'Brought in ' + id + ' — but the Check tab says it cannot be shipped.');
    });
  },

  /* ---- drawing the sheet ---- */
  bind(cv, s) {
    if (!cv) return;
    const at = e => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom };
    };
    const snap = (p, floorIt) => {
      const g = s.kind === 'people' ? { w: s.fw, h: s.fh } : { w: s.cell, h: s.cell };
      const f = floorIt ? Math.floor : Math.ceil;
      return { x: clamp(f(p.x / g.w) * g.w, 0, s.w), y: clamp(f(p.y / g.h) * g.h, 0, s.h) };
    };
    cv.style.touchAction = 'none';
    cv.onpointerdown = e => {
      const p = at(e);
      if (s.kind === 'people') {
        const row = Math.floor(p.y / s.fh);
        if (row >= 0 && row < Art.rows()) this.pickRow(row);
        return;
      }
      const a = snap(p, true);
      this.drag = a;
      this.sel = [a.x, a.y, s.cell, s.cell];
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* drag still works */ }
    };
    cv.onpointermove = e => {
      if (!this.drag) return;
      const b = snap(at(e), false);
      const x = Math.min(this.drag.x, b.x), y = Math.min(this.drag.y, b.y);
      this.sel = [x, y, Math.max(s.cell, Math.abs(b.x - this.drag.x)), Math.max(s.cell, Math.abs(b.y - this.drag.y))];
    };
    cv.onpointerup = () => {
      if (!this.drag) return;
      this.drag = null;
      Side.show('inspect');
      Side.refresh();
    };
  },
  pickRow(row) {
    const s = Art.sheet();
    Ask.form('Row ' + (row + 1) + ' is', [
      { k: 'id', label: 'who', value: (s.ids[row] || ''),
        options: [''].concat(['player']).concat(NPCS.map(p => p.id)) },
    ], 'Assign').then(v => {
      if (!v) return;
      Art.setRow(row, v.id || '');
      Side.say(v.id ? 'Row ' + (row + 1) + ' draws ' + v.id + '.' : 'Row ' + (row + 1) + ' is nobody.');
    });
  },

  /* Called from View.loop, so the walk cycle actually walks and the marquee
     follows the pointer without a listener redrawing on every move. */
  frame(dt) {
    this.t += dt || 0;
    if (Side.live) this.draw();
  },
  draw() {
    const cv = $('#artView');
    const s = Art.sheet();
    if (!cv || !s || !s.img) return;
    const z = this.zoom;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = s.w * z, h = s.h * z;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
    }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    /* A chequerboard, because half of what you are slicing is transparent and
       a sprite on a flat ground is a sprite whose edges you cannot see. */
    const n = 8;
    for (let y = 0; y < h; y += n) for (let x = 0; x < w; x += n) {
      c.fillStyle = ((x / n + y / n) & 1) ? '#171d28' : '#12171f';
      c.fillRect(x, y, n, n);
    }
    c.imageSmoothingEnabled = false;
    c.drawImage(s.img, 0, 0, w, h);

    const gw = (s.kind === 'people' ? s.fw : s.cell) * z;
    const gh = (s.kind === 'people' ? s.fh : s.cell) * z;
    if (gw > 3 && gh > 3) {
      c.strokeStyle = 'rgba(180,205,255,.18)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= w + 1; x += gw) { c.moveTo(Math.round(x) + .5, 0); c.lineTo(Math.round(x) + .5, h); }
      for (let y = 0; y <= h + 1; y += gh) { c.moveTo(0, Math.round(y) + .5); c.lineTo(w, Math.round(y) + .5); }
      c.stroke();
    }

    if (s.kind === 'people') this.drawRows(c, s, z);
    else this.drawEntries(c, s, z);

    if (this.sel) {
      const [x, y, rw, rh] = this.sel;
      c.strokeStyle = '#4da3ff'; c.lineWidth = 2;
      c.strokeRect(x * z + 1, y * z + 1, rw * z - 2, rh * z - 2);
      c.fillStyle = 'rgba(77,163,255,.16)';
      c.fillRect(x * z, y * z, rw * z, rh * z);
    }
  },
  drawEntries(c, s, z) {
    c.font = '600 10px system-ui, sans-serif';
    c.textBaseline = 'top';
    s.entries.forEach((e, i) => {
      const [x, y, w, h] = e.r;
      const on = Sel.kind === 'art' && Sel.i === i;
      c.strokeStyle = on ? '#5ad48a' : 'rgba(90,212,138,.65)';
      c.lineWidth = on ? 2 : 1;
      c.strokeRect(x * z + .5, y * z + .5, w * z - 1, h * z - 1);
      const tw = c.measureText(e.name).width + 6;
      c.fillStyle = 'rgba(8,11,17,.82)';
      c.fillRect(x * z, y * z, tw, 13);
      c.fillStyle = on ? '#5ad48a' : '#cfe4ff';
      c.fillText(e.name, x * z + 3, y * z + 2);
    });
  },
  drawRows(c, s, z) {
    c.font = '600 10px system-ui, sans-serif';
    c.textBaseline = 'top';
    /* The walk is 1..sit-1, exactly as Sprites.frame() derives it, and it is
       drawn in the SOUTH block — a row is four direction-blocks of `frames`
       side by side, and south is the pose you see most of anybody. */
    const walk = Math.max(1, s.sit - 1);
    const south = Math.max(0, s.dirs.indexOf('down'));
    const frame = south * s.frames + (s.frames > 1 ? 1 + (Math.floor(this.t * 6) % walk) : 0);
    for (let r = 0; r < Art.rows(); r++) {
      const id = s.ids[r] || '';
      c.strokeStyle = id ? 'rgba(90,212,138,.7)' : 'rgba(140,160,190,.25)';
      c.lineWidth = 1;
      c.strokeRect(.5, r * s.fh * z + .5, s.w * z - 1, s.fh * z - 1);
      const label = id || 'row ' + (r + 1);
      const tw = c.measureText(label).width + 6;
      c.fillStyle = 'rgba(8,11,17,.82)';
      c.fillRect(0, r * s.fh * z, tw, 13);
      c.fillStyle = id ? '#5ad48a' : '#8d9bb5';
      c.fillText(label, 3, r * s.fh * z + 2);
      /* The frame that would be drawn right now, ringed — the only way to see
         that the walk is a walk and not a sprint or a single frame. */
      if (id && s.frames > 1) {
        c.strokeStyle = '#ffb347'; c.lineWidth = 2;
        c.strokeRect(frame * s.fw * z + 1, r * s.fh * z + 1, s.fw * z - 2, s.fh * z - 2);
      }
    }
  },

  /* ---- the panel ---- */
  inspect() {
    const p = $('#paneInspect');
    const s = Art.sheet();
    if (!s) {
      p.innerHTML = '<p class="empty">Nothing imported yet. Drop a PNG on the workspace, or '
        + '<button data-a="pick">choose a file</button>.</p>'
        + '<div class="note">The shipped sheets are not edited here. They are build output — '
        + '<code>tools/build-sprites.mjs</code> writes art/sprites/manifest.js from pinned '
        + 'sources, and the rects and the pixels are only ever correct together.</div>';
      const b = p.querySelector('[data-a="pick"]');
      if (b) b.onclick = () => $('#edFile').click();
      return;
    }
    p.innerHTML = '<h3><span class="h-e">🖼️</span>' + esc(s.id) + '</h3>'
      + Side.row('kind', '<code>' + esc(s.kind) + '</code>')
      + Side.row('file', '<code>' + esc(Art.path(s)) + '</code>')
      + '<h4>Where it is from</h4>'
      + Side.row('called', '<input data-cr="name" value="' + esc(s.credit.name || '') + '">')
      + Side.row('made by', '<input data-cr="author" value="' + esc(s.credit.author || '') + '">')
      + Side.row('from', '<input data-cr="source" value="' + esc(s.credit.source || '') + '" placeholder="a URL">')
      + Side.row('licence', '<select data-cr="licence">' + Art.LICENCES.map(l =>
        '<option value="' + esc(l.k) + '"' + (l.k === s.credit.licence ? ' selected' : '') + '>'
        + esc(l.label) + '</option>').join('') + '</select>')
      + (Art.licence(s.credit.licence).ok
        ? ''
        : '<div class="note bad">' + esc(Art.licence(s.credit.licence).why)
          + ' The sheet still works in this tab so you can see what it would look like — it just '
          + 'cannot be shipped, and the Export tab will not pretend otherwise.</div>')
      + (s.kind === 'people' ? this.peopleFields(s) : this.tileFields(s))
      + '<div class="btns"><button data-a="pick">Import another</button>'
      + '<button data-a="drop" class="warn">Forget this one</button></div>'
      + '<div class="note">Forgetting a sheet takes it out of this list, but the game’s own tables '
      + 'have already adopted it and neither Tiles nor Sprites can un-adopt — they are the game’s, '
      + 'and the game has no idea sheets can arrive at runtime. Reload the page for a clean one.</div>';

    p.querySelectorAll('[data-cr]').forEach(el => {
      el.onchange = () => {
        Art.mark('edit the credit');
        Art.sheet().credit[el.dataset.cr] = el.value;
        Art.rebuild();
      };
    });
    p.querySelectorAll('[data-g]').forEach(el => {
      el.onchange = () => Art.set(el.dataset.g, clamp(parseInt(el.value, 10) || 1, 1, 4096));
    });
    p.querySelectorAll('[data-e]').forEach(el => {
      el.onchange = () => Art.setEntry(+el.dataset.i, el.dataset.e, el.value);
    });
    p.querySelectorAll('[data-pick]').forEach(li => {
      li.onclick = () => { Sel.kind = 'art'; Sel.i = +li.dataset.pick; Side.refresh(); };
    });
    p.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => { Art.removeEntry(+b.dataset.del); Sel.kind = null; };
    });
    p.querySelectorAll('[data-row]').forEach(li => {
      li.onclick = () => this.pickRow(+li.dataset.row);
    });
    const name = p.querySelector('[data-a="name"]');
    if (name) name.onclick = () => this.nameSelection();
    p.querySelector('[data-a="pick"]').onclick = () => $('#edFile').click();
    p.querySelector('[data-a="drop"]').onclick = () => {
      Art.drop(s.id);
      Mode.subjectOptions();
      Side.refresh();
    };
  },

  tileFields(s) {
    return '<h4>The grid</h4>'
      + Side.row('cell', '<input type="number" data-g="cell" value="' + s.cell + '" min="4">')
      + '<div class="note">The grid is how you pick a rectangle, not how one is stored: every '
      + 'entry below is in <b>pixels</b>. The kit’s own wall items are not on the 32px grid — a '
      + 'framed picture at x=141 on a 192px sheet straddles the boundary — and rounding one to a '
      + 'cell clips the frame off it.</div>'
      + (this.sel
        ? '<div class="note">Selected: ' + this.sel.map(Math.round).join(', ')
          + '</div><div class="btns"><button data-a="name" class="primary">Name this rectangle</button></div>'
        : '<p class="empty">Drag out a rectangle on the sheet to name one.</p>')
      + '<h4>Named <span class="pill">' + s.entries.length + '</span></h4>'
      + (s.entries.length
        ? '<ul class="list">' + s.entries.map((e, i) =>
          '<li class="' + (Sel.kind === 'art' && Sel.i === i ? 'on' : '') + '" data-pick="' + i + '">'
          + '<b>' + esc(e.name) + '</b><em>' + e.r.join(', ') + ' · ' + esc(e.anchor) + '</em></li>').join('')
          + '</ul>'
          + (Sel.kind === 'art' && s.entries[Sel.i] ? this.entryForm(s.entries[Sel.i], Sel.i) : '')
        : '<p class="empty">Nothing named yet.</p>');
  },
  entryForm(e, i) {
    return '<h4>' + esc(e.name) + '</h4>'
      + Side.row('name', '<input data-e="name" data-i="' + i + '" value="' + esc(e.name) + '">')
      + Side.row('anchor', '<select data-e="anchor" data-i="' + i + '">'
        + ['flat', 'floor', 'wall'].map(a => '<option value="' + a + '"'
          + (a === e.anchor ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>')
      + '<div class="note"><b>floor</b> stands it on the tile’s bottom edge, because a fridge is '
      + 'two tiles tall and its feet are on the floor. <b>flat</b> centres it, which is what a '
      + 'laptop on a desk wants.</div>'
      + '<div class="btns"><button data-del="' + i + '" class="warn">Delete</button></div>';
  },
  peopleFields(s) {
    return '<h4>The frames</h4>'
      + Side.row('frame', '<input type="number" data-g="fw" value="' + s.fw + '" min="4"> '
        + '<input type="number" data-g="fh" value="' + s.fh + '" min="4">')
      + Side.row('per row', '<input type="number" data-g="frames" value="' + s.frames + '" min="1">')
      + Side.row('seated at', '<input type="number" data-g="sit" value="' + s.sit + '" min="0">')
      + '<div class="note"><b>Frame 0 is standing, `sit` is seated, and the walk is what lies '
      + 'between</b> — derived as 1..sit-1, so a wrong `sit` collapses the walk to one frame and '
      + 'draws the chair as a person. Rows are the LPC order: up, left, down, right.</div>'
      + '<h4>Rows <span class="pill">' + Art.rows() + '</span></h4>'
      + '<ul class="list">' + Array.from({ length: Art.rows() }, (_, r) =>
        '<li data-row="' + r + '"><b>' + esc(s.ids[r] || 'row ' + (r + 1)) + '</b>'
        + '<em>' + (s.ids[r] ? 'drawn from this sheet' : 'not assigned') + '</em></li>').join('')
      + '</ul>';
  },

  nameSelection() {
    const s = Art.sheet();
    if (!s || !this.sel) return;
    Ask.form('Name this rectangle', [
      { k: 'name', label: 'name', value: '', hint: 'the manifest keys them obj.printer, wall.mirror' },
      { k: 'anchor', label: 'anchor', value: 'flat', options: ['flat', 'floor', 'wall'] },
    ], 'Name it').then(v => {
      if (!v || !v.name) return;
      Art.addEntry(v.name, this.sel.map(Math.round), v.anchor);
      Sel.kind = 'art'; Sel.i = s.entries.findIndex(e => e.name === v.name);
      Side.say('Named. Anything with `furn: { sprite: ' + Emit.str(v.name) + ' }` draws it now.');
    });
  },

  /* ---- check ---- */
  check() {
    const p = $('#paneCheck');
    const s = Art.sheet();
    if (!s) { p.innerHTML = '<p class="empty">Nothing imported yet.</p>'; return; }
    const f = ArtCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const group = (list, title, cls) => !list.length ? '' : '<h4>' + title + '</h4>'
      + '<ul class="faults">' + list.map(x => '<li class="' + cls + '">' + esc(x.msg) + '</li>').join('')
      + '</ul>';
    p.innerHTML = '<div class="stat">'
      + '<div><b>' + (s.kind === 'people' ? s.ids.filter(Boolean).length : s.entries.length)
      + '</b><span>' + (s.kind === 'people' ? 'assigned' : 'named') + '</span></div>'
      + '<div><b class="' + (ArtCheck.usable() ? 'good' : 'bad') + '">'
      + (ArtCheck.usable() ? '✓' : '✕') + '</b><span>shippable</span></div>'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length + '</b><span>broken</span></div>'
      + '</div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this sheet.</p>')
      + '<div class="note">The licence check is the one that matters most, and it is not this '
      + 'editor’s opinion: <code>tools/build-sprites.mjs</code> ships OGA-BY 3.0 and CC0 assets '
      + 'only, and refuses anything whose licence it cannot prove. LICENSE part 2 is a list of '
      + 'files, and that list is only true because somebody checked.</div>';
  },

  /* ---- export ---- */
  exportPane() {
    const p = $('#paneExport');
    const s = Art.sheet();
    if (!s) { p.innerHTML = '<p class="empty">Nothing imported yet.</p>'; return; }
    Side.exportChoices({
      rows: 14,
      name: v => s.id + '.' + v + '.txt',
      /* The one document with a third button, because the PNG is half of what
         this tab produces and a manifest entry without it is a list of rects
         describing nothing. */
      buttons: '<button data-a="png" class="primary">Download the PNG</button>',
      after: (ArtCheck.usable() ? '' : '<div class="note bad">This sheet cannot be shipped as it '
        + 'stands — see the Check tab. The export is here so you can see what it would say.</div>')
        + '<div class="note">art/sprites/manifest.js is <b>build output</b>: '
        + '<code>tools/build-sprites.mjs</code> writes it, and the rects and the pixels are only '
        + 'ever correct together — which is why each sheet carries a hash of its own bytes. Pasting '
        + 'this in works until the next build erases it, so a sheet that is staying belongs in that '
        + 'script’s own inputs. Put the PNG at <code>' + esc(Art.path(s)) + '</code>.</div>',
      choices: [
        { v: 'sheet', label: 'The manifest entry',
          src: () => Emit.artSheet(s),
          note: 'One entry for SPRITE_ATLAS.sheets. `src` is the path the PNG has to '
            + 'end up at, not the data: URI it is being previewed from — and there is no `v`, '
            + 'because that hash is of the file’s bytes and there is no file yet.' },
        { v: 'credits', label: 'The credit, for art/CREDITS.md',
          src: () => Emit.artCredit(s),
          note: 'OGA-BY requires the attribution and the licence text to travel with '
            + 'the art, which is why both are in LICENSE part 2.' },
        { v: 'licence', label: 'The line for LICENSE part 2',
          src: () => Emit.artLicence(s),
          note: 'LICENSE part 1 is defined as everything except the files part 2 '
            + 'lists, so that list is the authority and has to stay accurate.' }]
    });
    p.querySelector('[data-a="png"]').onclick = () => this.savePng(s);
  },
  /* The pixels back out as a file. The data: URI is base64 already, so this is
     a decode rather than a re-encode — nothing is resampled and nothing is
     recompressed, which for pixel art is the only acceptable answer. */
  savePng(s) {
    const at = s.src.indexOf(',');
    const b64 = s.src.slice(at + 1);
    try {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      Side.download(s.id + '.png', buf);
    } catch (_) {
      Side.say('The sheet could not be decoded back to a file.');
    }
  }
};
