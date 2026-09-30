'use strict';
/* ---------------- Bringing art in ----------------
   The only document whose content arrives from outside the project, so it is
   careful. art/sprites/*.png is third-party (OGA-BY 3.0, licensed separately,
   LICENSE part 2), and tools/build-sprites.mjs only builds assets whose
   licence it can prove (`USABLE = ['OGA-BY', 'CC0']`). So this asks where a
   file came from first and refuses the wrong answer.
   Nothing is written: the sheet lives in this tab as a data: URI, adopted by
   Tiles and Sprites so the map draws it, and the export is the manifest
   entry, the credits stanza and the PNG. Files come through
   <input type="file">, not fetch, which file:// refuses. */

const Art = {
  /* Sheets imported in this tab. The shipped ones are not in here: they are the
     manifest's, they are already correct, and this document is about the ones
     that are not yet. */
  sheets: [],
  id: null,
  base: null, undoStack: [], redoStack: [],

  /* ---- what this project can accept ----
     The build gate's two, named the same. ShareAlike (CC-BY-SA, GPL) is refused
     with the reason: it cannot coexist with the game's CC BY-NC-ND. */
  LICENCES: [
    { k: 'CC0', label: 'CC0 1.0 — public domain', ok: true },
    { k: 'OGA-BY 3.0', label: 'OGA-BY 3.0', ok: true },
    { k: 'CC-BY-SA 3.0', label: 'CC-BY-SA 3.0', ok: false,
      why: 'ShareAlike would force this game to relicense, and it is CC BY-NC-ND. They cannot both apply.' },
    { k: 'CC-BY 4.0', label: 'CC-BY 4.0', ok: false,
      why: 'No ShareAlike, so it is not impossible — but the build gate accepts OGA-BY and CC0 only, deliberately, and the editor is not the place to relax it.' },
    { k: 'GPL 3.0', label: 'GPL 3.0', ok: false,
      why: 'Copyleft. Same problem as ShareAlike, with more of it.' },
    { k: 'unknown', label: 'I do not know', ok: false,
      why: 'An asset that cannot prove its licence does not get built — that is what assertUsable() is for.' },
  ],
  licence(k) { return this.LICENCES.find(l => l.k === k) || this.LICENCES[5]; },

  ids() { return this.sheets.map(s => s.id); },
  sheet(id) { return this.sheets.find(s => s.id === (id === undefined ? this.id : id)) || null; },

  /* ---- the document ---- */
  load(id) {
    if (!this.sheet(id)) return false;
    this.id = id;
    this.rebase();
    return true;
  },
  state() {
    const s = this.sheet();
    /* The pixels are not part of the state. A data: URI of a megabyte cloned on
       every edit is an undo stack that eats the tab. */
    return s ? clone({ id: s.id, kind: s.kind, credit: s.credit, cell: s.cell,
      margin: s.margin, spacing: s.spacing, entries: s.entries,
      fw: s.fw, fh: s.fh, frames: s.frames, sit: s.sit, dirs: s.dirs, ids: s.ids }) : {};
  },
  restore(st) {
    const s = this.sheet(st.id);
    if (!s) return;
    Object.keys(st).forEach(k => { s[k] = clone(st[k]); });
    this.id = st.id;
  },
  rebuild() {
    this.publish();
    ArtCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },

  /* ---- reading a file ----
     Resolves with the decoded <img> (for slicing) and its data: URI (for Tiles
     and Sprites). */
  read(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('no file'));
      if (!/^image\/(png|webp|gif)$/.test(file.type || '')) {
        return reject(new Error('That is a ' + (file.type || 'file of unknown type')
          + '. Pixel art wants a PNG — a JPEG would blur every edge in it.'));
      }
      if (file.size > 8 * 1024 * 1024) {
        return reject(new Error('That sheet is ' + Math.round(file.size / 1024) + 'KB. '
          + 'Anything over about eight megabytes is not a sprite sheet.'));
      }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('The file could not be read.'));
      fr.onload = () => {
        const uri = String(fr.result);
        const im = new Image();
        im.onload = () => resolve({ img: im, uri: uri, w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => reject(new Error('That is not an image this browser can decode.'));
        im.src = uri;
      };
      fr.readAsDataURL(file);
    });
  },

  /* ---- adding one ----
     `kind` is 'tiles' (named rectangles) or 'people' (one character per row),
     as the manifest has both. */
  add(meta, loaded) {
    const id = meta.id;
    const s = {
      id: id, kind: meta.kind, src: loaded.uri, img: loaded.img,
      w: loaded.w, h: loaded.h,
      credit: { name: meta.name, author: meta.author, source: meta.source, licence: meta.licence },
      /* tiles */
      cell: meta.cell || 32, margin: 0, spacing: 0, entries: [],
      /* people */
      fw: meta.cell || 32, fh: meta.cell || 32, frames: 1, sit: 0,
      dirs: ['up', 'left', 'down', 'right'], ids: [],
    };
    if (s.kind === 'people') {
      /* A guess that is usually right for an LPC-shaped sheet, and always
         visible on screen so a wrong one is one field away from correct. */
      s.fw = meta.cell || 64; s.fh = meta.cell || 64;
      s.frames = Math.max(1, Math.floor(s.w / s.fw));
      s.ids = [];
    }
    this.sheets.push(s);
    this.id = id;
    this.rebase();
    this.rebuild();
    return s;
  },
  drop(id) {
    const at = this.sheets.findIndex(s => s.id === id);
    if (at < 0) return false;
    this.sheets.splice(at, 1);
    this.id = this.sheets.length ? this.sheets[Math.min(at, this.sheets.length - 1)].id : null;
    /* Nothing un-adopts a sheet from Tiles or Sprites: both are the game's, and
       the game has no idea sheets can arrive at runtime. A reload is the honest
       way back, and the panel says so. */
    this.rebase();
    ArtCheck.run();
    return true;
  },

  /* ---- the geometry ---- */
  set(k, v) {
    const s = this.sheet();
    if (!s || s[k] === v) return false;
    this.mark('edit ' + k);
    s[k] = v;
    this.rebuild();
    return true;
  },
  /* One named rectangle, in pixels: wall items are off the 32px grid. The grid
     is for picking, not storage. */
  addEntry(name, rect, anchor) {
    const s = this.sheet();
    if (!s) return false;
    this.mark('name a sprite');
    const at = s.entries.findIndex(e => e.name === name);
    const e = { name: name, r: rect.slice(0, 4), anchor: anchor || 'flat' };
    if (at >= 0) s.entries[at] = e; else s.entries.push(e);
    this.rebuild();
    return true;
  },
  setEntry(i, k, v) {
    const s = this.sheet();
    if (!s || !s.entries[i]) return false;
    this.mark('edit ' + s.entries[i].name);
    s.entries[i][k] = v;
    this.rebuild();
    return true;
  },
  removeEntry(i) {
    const s = this.sheet();
    if (!s || !s.entries[i]) return false;
    this.mark('delete ' + s.entries[i].name);
    s.entries.splice(i, 1);
    this.rebuild();
    return true;
  },
  /* Which person is on which row. An empty string is a row that is art and not
     anybody — a spare, or a blank at the bottom of the sheet. */
  setRow(row, id) {
    const s = this.sheet();
    if (!s) return false;
    this.mark('assign a row');
    while (s.ids.length <= row) s.ids.push('');
    s.ids[row] = id;
    this.rebuild();
    return true;
  },
  rows() {
    const s = this.sheet();
    return s && s.fh ? Math.max(1, Math.floor(s.h / s.fh)) : 0;
  },
  cols() {
    const s = this.sheet();
    return s && s.fw ? Math.max(1, Math.floor(s.w / s.fw)) : 0;
  },

  /* ---- what the manifest would say ----
     build-sprites.mjs's shape. No `v` until there is a file to hash. */
  def(s) {
    s = s || this.sheet();
    if (!s) return null;
    if (s.kind === 'people') {
      return { id: s.id, src: s.src, fw: s.fw, fh: s.fh, frames: s.frames,
        sit: s.sit, dirs: s.dirs.slice(), ids: s.ids.slice() };
    }
    const sprites = {}, anchors = {};
    s.entries.forEach(e => { sprites[e.name] = e.r.slice(); anchors[e.name] = e.anchor; });
    return { id: s.id, src: s.src, cell: s.cell, w: s.w, h: s.h, sprites: sprites, anchors: anchors };
  },
  /* The path the PNG has to end up at for the emitted entry to be true. */
  path(s) { return 'art/sprites/' + (s || this.sheet()).id + '.png'; },

  /* ---- into the running game ----
     The preview is the renderer, so the sheet must be in its tables. */
  publish() {
    const s = this.sheet();
    if (!s) return;
    /* One adopted sheet per import, re-adopted in place on each edit (geometry
       changes, pixels decoded once). The `ed:` prefix marks it as this tab's. */
    const def = Object.assign({}, this.def(s), { id: 'ed:' + s.id });
    if (s.kind === 'people') Sprites.adopt(def);
    else Tiles.adopt(def);
  },
  /* Is this sheet's art on screen yet? The file decoded before it was ever
     adopted, so this is only ever false for the frame or two in between. */
  live(s) {
    s = s || this.sheet();
    const list = (s && s.kind === 'people' ? Sprites.sheets : Tiles.sheets) || [];
    const sh = list.find(x => x.id === 'ed:' + (s || {}).id);
    return !!(sh && sh.ok);
  }
};
Object.assign(Art, HIST);

/* ---------------- What is wrong with an imported sheet ----------------
   An unproven licence (must never reach the build), a rectangle off the edge
   of its PNG, and a name already owned by other pixels. */

const ArtCheck = {
  faults: [],
  run() {
    this.faults = [];
    const s = Art.sheet();
    if (!s) return this;
    const fault = (level, msg, extra) => this.faults.push(Object.assign({ level: level, msg: msg }, extra || {}));

    /* ---- the licence ---- */
    const lic = Art.licence(s.credit.licence);
    if (!lic.ok) {
      fault('error', 'This sheet is ' + lic.label + ', and this project ships OGA-BY 3.0 and CC0 '
        + 'art only. ' + lic.why + ' tools/build-sprites.mjs would refuse it, and rightly.');
    }
    if (!s.credit.author) {
      fault('error', 'No author. OGA-BY requires attribution to travel with the art — '
        + 'art/CREDITS.md and the OGA-BY text are both in LICENSE part 2 for that reason.');
    }
    if (!s.credit.source) {
      fault('warn', 'No source. A URL is what makes the licence checkable by somebody who is '
        + 'not you, a year from now.');
    }

    /* ---- the geometry ---- */
    if (s.kind === 'tiles') {
      if (!s.entries.length) fault('warn', 'Nothing is named yet, so nothing can use this sheet. '
        + 'Drag out a rectangle on it and give it a name.');
      const seen = new Set();
      s.entries.forEach((e, i) => {
        if (!/^[a-z][\w.]*$/i.test(e.name)) {
          fault('error', '“' + e.name + '” is not a usable name. The manifest keys sprites like '
            + '`obj.printer` and `wall.mirror`.', { entry: i });
        }
        if (seen.has(e.name)) fault('error', 'Two rectangles are both called “' + e.name + '”.', { entry: i });
        seen.add(e.name);
        const [x, y, w, h] = e.r;
        if (w <= 0 || h <= 0) fault('error', '“' + e.name + '” has no area.', { entry: i });
        else if (x < 0 || y < 0 || x + w > s.w || y + h > s.h) {
          fault('error', '“' + e.name + '” runs off the edge of the sheet. drawImage takes the '
            + 'source rect as read and draws nothing at all.', { entry: i });
        }
        /* The rule the whole atlas already follows. A name that is taken is a
           name whose pixels are somewhere else, and first-to-claim wins. */
        const mine = 'ed:' + s.id;
        const owner = Tiles.owner && Tiles.owner[e.name];
        if (owner && String(owner.id).indexOf(mine) !== 0) {
          fault('error', '“' + e.name + '” is already a sprite on the ' + owner.id + ' sheet. '
            + 'First to claim a name wins, so this one would never be drawn.', { entry: i });
        }
      });
      if (s.cell !== TILE) {
        fault('warn', 'The cell is ' + s.cell + 'px and the game’s tile is ' + TILE
          + 'px. Not wrong — a wall item is measured in pixels anyway — but a FLOOR tile at '
          + 'another size will not sit on the grid.');
      }
    } else {
      const claimed = s.ids.filter(Boolean);
      if (!claimed.length) fault('warn', 'No row is assigned to anybody, so nobody is drawn from '
        + 'this sheet.');
      claimed.forEach((id, i) => {
        if (!NPCS.some(p => p.id === id) && id !== 'player') {
          fault('error', 'Row ' + (s.ids.indexOf(id) + 1) + ' is assigned to “' + id
            + '”, and there is nobody by that id. NPCS and a pack’s roster are two lists in '
            + 'two files, and a name in one and not the other is a person who silently falls back '
            + 'to an emoji.');
        }
        /* The rule the `sprites` suite already asserts: two sheets must never
           claim the same person, because the loser is silently dead weight. */
        const at = Sprites.rows.get(id);
        if (at && String(at.sheet.id).indexOf('ed:' + s.id) !== 0) {
          fault('error', '“' + id + '” is already drawn from the ' + at.sheet.id + ' sheet. '
            + 'First sheet to claim a person wins, so these rows would be dead weight.');
        }
        if (claimed.indexOf(id) !== i) fault('error', '“' + id + '” is on two rows.');
      });
      if (s.frames < 2) fault('warn', 'One frame per row, so nobody walks. Frame 0 is standing, '
        + '`sit` is seated, and the walk is what lies between.');
      else if (s.sit <= 0 || s.sit >= s.frames) {
        fault('error', 'The seated frame is column ' + s.sit + ' of ' + s.frames + '. It has to be '
          + 'inside the row and after frame 0 — the walk is derived as 1..sit-1, so a bad one '
          + 'collapses the walk to a single frame and draws the chair as a person.');
      }
      if (s.dirs.length !== 4) fault('error', 'Four directions, in the LPC order: up, left, down, right.');
      /* A row is four direction blocks: width must be fw × frames × 4, or frames
         silently read the next direction. */
      const wide = s.fw * s.frames * s.dirs.length;
      if (s.w !== wide) {
        fault('warn', 'A row of ' + s.frames + ' frames at ' + s.fw + 'px across '
          + s.dirs.length + ' directions is ' + wide + 'px, and the sheet is ' + s.w
          + 'px. One of those three is wrong — a frame index that runs past the end of a row '
          + 'draws the next direction\u2019s pose and throws nothing.');
      }
      if (s.fh && s.h % s.fh) {
        fault('warn', 'The sheet is ' + s.h + 'px and the frame is ' + s.fh + 'px, so the last row '
          + 'is a part-row. Usually that means the frame height is wrong.');
      }
    }
    return this;
  },
  /* Can this sheet go anywhere near the build? The Export tab asks, because the
     honest answer changes what it is willing to offer you. */
  usable() { return Art.sheet() ? Art.licence(Art.sheet().credit.licence).ok && !!Art.sheet().credit.author : false; }
};
Object.assign(ArtCheck, FAULTS);
