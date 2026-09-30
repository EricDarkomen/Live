'use strict';
/* Character sprites: Liberated Pixel Cup art, built by tools/build-sprites.mjs.
   OGA-BY 3.0, not covered by this file's licence (LICENSE part 2,
   art/CREDITS.md).
   Several sheets, each a PNG plus its geometry, so art from another project
   can join without the renderer knowing. Sprites.rows maps a person to a sheet.
   Nothing reads pixels back: file:// taints the canvas, and getImageData would
   stop the game opening off disk. A missing sheet falls back to emoji (has()). */

const atlasSheets = () => SPRITE_ATLAS.sheets;

const Sprites = {
  ready: false, sheets: [], rows: new Map(),
  /* Where the feet sit relative to the drawing origin — the same offset the
     shadow uses, so a sprite stands on its own shadow. */
  FOOT: 13,
  /* Named cycles past the walk: breathing, running, and the combat poses
     (squared up, forehand, backhand). A sheet without one skips that move. */
  CYCLES: ['breath', 'run', 'ready', 'slash', 'backslash'],
  load() {
    /* `lazy` sheets are the creator's parts, hundreds of them, fetched only on
       demand by needParts(). */
    atlasSheets().forEach(s => { if (s && Array.isArray(s.ids) && !s.lazy) this.adopt(s); });
    /* The expressions sheet loads with the people it goes on (engine/faces.js). */
    Faces.load();
  },

  /* ---- the character creator's parts ----
     The cast is baked into people.png; a chosen look is stacked here from the
     same components. Each component is one file: the manifest lists every axis
     (label, stacking order, variants) and `each`, a path with `%d` for the
     variant, so menus are complete at load and pixels come only when worn. */
  partOf(vid) {
    for (const s of atlasSheets()) {
      if (!s || !s.each || !Array.isArray(s.meta)) continue;
      const i = s.meta.findIndex(m => m && m.id === vid);
      if (i >= 0) return { s, i };
    }
    return null;
  },
  /* Fetch these components and call back once all have decoded or any has
     failed (the baked row stays). Nothing is fetched twice. */
  needParts(ids, done) {
    const sheets = [];
    for (const vid of ids || []) {
      const p = this.partOf(vid);
      if (!p) continue;
      const g = p.s, sheet = { id: 'part:' + vid, src: g.each.replace('%d', p.i), v: g.v,
        fw: g.fw, fh: g.fh, frames: g.frames, sit: g.sit, dirs: g.dirs, ids: [vid], part: g.part, lazy: true };
      this.CYCLES.forEach(k => { sheet[k] = g[k]; });
      sheets.push(this.adopt(sheet));
    }
    const settled = () => sheets.every(sh => sh && (sh.ok || sh.failed));
    const finish = () => { if (done) done(sheets.length > 0 && sheets.every(sh => sh.ok)); };
    if (settled()) { finish(); return; }
    let waited = 0;
    const tick = () => {
      if (settled() || (waited += 50) > 20000) { finish(); return; }
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  },
  /* Release component bitmaps once stacked; the composed canvases are what is
     drawn, and the HTTP cache brings parts back for the creator. */
  dropParts() {
    this.sheets = this.sheets.filter(sh => {
      if (!sh.lazy || !/^part:/.test(sh.id)) return true;
      this.rows.forEach((r, id) => { if (r.sheet === sh) this.rows.delete(id); });
      return false;
    });
  },
  partsReady(ids) {
    return (ids || []).length > 0 && ids.every(v => { const r = this.rows.get(v); return !!(r && r.sheet.ok); });
  },

  /* The creator's menu, one entry per axis in stacking order, read off the
     manifest so a new hairstyle is a build change only. */
  partGroups() {
    return atlasSheets()
      .filter(s => s && s.part && Array.isArray(s.meta))
      .sort((a, b) => a.part.z - b.part.z)
      .map(s => ({ k: s.part.group, label: s.part.label, z: s.part.z,
        optional: !!s.part.optional, items: s.meta }));
  },
  /* The recipe a baked row was made from, spelled as the build spells it —
     see lookKey() in tools/lib/buildPeople.mjs. Null for anybody not baked. */
  bakedLook(id) {
    for (const s of atlasSheets()) {
      if (s && s.looks && s.looks[id] !== undefined && Array.isArray(s.ids) && s.ids.includes(id)) return s.looks[id];
    }
    return null;
  },
  lookKey(look) {
    return Object.keys(look || {}).sort().filter(k => look[k]).map(k => look[k]).join('|');
  },

  /* Stack the chosen variants into one row and register it as an ordinary sheet
     (a canvas is a valid drawImage source). Only draws, never reads back, so
     file:// still works. Overrides the row claiming `id`; the baked row is kept
     for uncompose(). */
  compose(id, picks) {
    const rows = (picks || []).map(v => this.rows.get(v)).filter(r => r && r.sheet.ok && r.sheet.part);
    if (!rows.length) return null;
    rows.sort((a, b) => a.sheet.part.z - b.sheet.part.z);
    const m = rows[0].sheet;
    const w = m.fw * m.frames * m.dirs.length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = m.fh;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    rows.forEach(r => c.drawImage(r.sheet.img, 0, r.row * r.sheet.fh, w, r.sheet.fh, 0, 0, w, r.sheet.fh));

    if (!this._baked) this._baked = new Map();
    if (!this._baked.has(id) && this.rows.has(id)) this._baked.set(id, this.rows.get(id));
    const sh = { id: 'composed:' + id, src: null, img: cv, ok: true, composed: true,
      fw: m.fw, fh: m.fh, frames: m.frames, sit: m.sit, dirs: m.dirs, ids: [id] };
    this.CYCLES.forEach(k => { sh[k] = m[k]; });
    /* The base they were stacked from, for Faces: a composed person has no baked
       row to find their head by. */
    if (!this._bases) this._bases = new Map();
    const base = (picks || []).find(v => typeof v === 'string' && v.startsWith('base:'));
    if (base) this._bases.set(id, base); else this._bases.delete(id);
    /* A portrait needs a URL, and a composed sheet is a canvas. toDataURL() reads
       it back, which throws on file://: caught, and portrait() falls back to emoji.
       Made once per compose and cached on the sheet. */
    /* The portrait's data URL is made when somebody is first talked to, not
       here: twenty-seven of them at boot is megabytes nobody has asked for. */
    sh.lazySrc = true;
    this.rows.set(id, { sheet: sh, row: 0 });
    this.ready = true;
    return sh;
  },
  /* Back to the baked row. A no-op when nothing was composed. */
  uncompose(id) {
    const was = this._baked && this._baked.get(id);
    if (!was) return false;
    this.rows.set(id, was);
    this._baked.delete(id);
    /* And forget the base, or somebody handed back their baked row keeps
       wearing the expressions of the head they were composed from. */
    if (this._bases) this._bases.delete(id);
    return true;
  },
  /* Whether somebody is stacked from parts, and from which base. Only Faces asks:
     a composed face comes from the base, a baked one from its own row. Any NPC
     with a `look:` can be composed (Look.dressCast()). */
  /* Asked of the sheet, not of _baked: a person composed from nothing has no
     baked row but is still composed. */
  composed(id) {
    const r = this.rows.get(id);
    return !!(r && r.sheet && r.sheet.composed);
  },
  baseOf(id) { return (this._bases && this._bases.get(id)) || null; },
  /* One sheet, by id. Re-adopting an id replaces it rather than duplicating
     rows and bitmaps (the editor's importer re-reads on every keystroke). */
  adopt(s) {
    if (!s || !s.src || !Array.isArray(s.ids)) return null;   /* not a roster sheet */
    let sh = this.sheets.find(x => x.id === s.id);
    const fresh = !sh;
    if (fresh) { sh = { id: s.id, src: null, img: null, ok: false }; this.sheets.push(sh); }
    Object.assign(sh, {
      fw: s.fw, fh: s.fh, frames: s.frames, sit: s.sit, dirs: s.dirs, ids: s.ids,
      /* The creator axis this sheet is, if any; compose() sorts by `part.z`. */
      part: s.part || null, lazy: !!s.lazy });
    /* Named cycles the sheet may carry; one it lacks is simply not done. */
    this.CYCLES.forEach(k => { sh[k] = Array.isArray(s[k]) ? s[k] : null; });
    /* Give up what this sheet claimed, then claim again — otherwise a row
       reassigned in the editor leaves the old person drawn from the old row. */
    const mine = [];
    this.rows.forEach((r, id) => { if (r.sheet === sh) mine.push(id); });
    mine.forEach(id => this.rows.delete(id));
    /* First sheet to claim a person wins, so a sheet added later cannot
       silently repaint somebody who is already drawn. */
    s.ids.forEach((id, row) => { if (id && !this.rows.has(id)) this.rows.set(id, { sheet: sh, row }); });
    if (fresh || sh.src !== s.src) {
      sh.src = s.src; sh.ok = false;
      const im = new Image();
      sh.failed = false;
      im.onload = () => { sh.img = im; sh.ok = true; this.ready = true; };
      im.onerror = () => { sh.ok = false; sh.failed = true; };      /* this sheet stays on the emoji */
      im.src = s.src + (s.v ? '?v=' + s.v : '');
    }
    return sh;
  },
  /* The sheet a person is on, but only once it has actually decoded. */
  at(id) {
    const r = this.rows.get(id);
    return r && r.sheet.ok ? r : null;
  },
  has(id) { return !!this.at(id); },
  /* LPC row order: up, left, down, right. The dominant axis picks the facing. */
  dirOf(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 1 : 3;
    return dy < 0 ? 0 : 2;
  },
  /* Which frame is the seated one. Per sheet, because a sheet from another
     project will not have the same number of poses in the same order. */
  sit(id) {
    const r = this.rows.get(id);
    return r ? r.sheet.sit : 0;
  },
  /* Frame 0 stands, 1..sit-1 walks, sit is seated. `phase` free-runs, so callers
     keep no timer. `back` plays the walk in reverse, which is walking backwards
     (Guns.legs()). */
  frame(id, walking, phase, fast, back) {
    if (!walking) return 0;
    /* Derived as the frames between standing and sitting, so a pose appended
       past `sit` (breath, run) is never walked into by accident. */
    const r = this.rows.get(id);
    const run = fast && r && r.sheet.run;
    if (run && run.length) {
      const i = Math.floor(phase) % run.length;
      return run[back ? run.length - 1 - i : i];
    }
    const cycle = Math.max(1, (r ? r.sheet.sit : 1) - 1);
    const i = Math.floor(phase) % cycle;
    return 1 + (back ? cycle - 1 - i : i);
  },
  /* Seconds per breath step. The kit's idle at full speed reads as panting; the
     phase is offset per person so the room does not inhale together. */
  BREATH_S: 0.6,
  /* Where in the breath somebody is, 0..n-1; shared with breathLift(). */
  breathStep(id, n) {
    let hsh = 0;
    for (let i = 0; i < id.length; i++) hsh = (hsh * 31 + id.charCodeAt(i)) & 1023;
    const step = Math.floor(R.t / this.BREATH_S + hsh % n + hsh / 1024);
    return ((step % n) + n) % n;
  },
  breath(id) {
    const r = this.rows.get(id), b = r && r.sheet.breath;
    if (!b || !b.length) return 0;
    return b[this.breathStep(id, b.length)];
  },
  /* A one-pixel breath for sitters: the kit's sitting columns are postures, not
     a cycle, and frozen sitters give the sprites away. */
  breathLift(id) {
    const r = this.rows.get(id), b = r && r.sheet.breath;
    if (!b || !b.length) return 0;
    return this.breathStep(id, b.length) === 2 ? 1 : 0;
  },
  /* Standing still on a chair tile is sitting. Derived rather than stored, so
     there is no seated flag to keep in sync. */
  seatedAt(tx, ty) {
    return World.at(tx, ty).find(o => o.kind === 'chair') || null;
  },
  /* The seat, not the sitter: nobody stops exactly on a tile centre. */
  seatPos(o) { return { x: (o.x + 0.5) * TILE, y: (o.y + 0.5) * TILE - SEAT }; },
  /* The other way round: is anybody sitting on this tile right now. Used by
     the renderer to decide whether a chair draws in front of its occupant. */
  seatedHere(tx, ty) {
    if (!P.moving && Math.floor(P.x / TILE) === tx && Math.floor(P.y / TILE) === ty) return true;
    return NPCM.list.some(n => !n.walking
      && Math.floor(n.x / TILE) === tx && Math.floor(n.y / TILE) === ty);
  },
  /* The head from the standing front frame, as CSS for the dialogue portrait:
     30 rows clears the tallest hair and reaches the shoulders. */
  HEAD_W: 28, HEAD_H: 30, HEAD_TOP: 0,
  portrait(id, scale) {
    const r = this.at(id);
    /* No `src`, no portrait. A composed sheet carries a data URL from compose(),
       except on file://. */
    if (r && r.sheet.lazySrc) {
      r.sheet.lazySrc = false;
      try { r.sheet.src = r.sheet.img.toDataURL('image/png'); } catch (e) { r.sheet.src = null; }
    }
    if (!r || !r.sheet.src) return null;
    const m = r.sheet;
    /* dir 2 = facing the camera, frame 0 = standing still. */
    const fx = (2 * m.frames) * m.fw + (m.fw - this.HEAD_W) / 2;
    const fy = r.row * m.fh + this.HEAD_TOP;
    return {
      width: this.HEAD_W * scale + 'px',
      height: this.HEAD_H * scale + 'px',
      backgroundImage: 'url(' + m.src + ')',
      backgroundSize: (m.fw * m.frames * m.dirs.length * scale) + 'px ' + (m.fh * m.ids.length * scale) + 'px',
      backgroundPosition: '-' + (fx * scale) + 'px -' + (fy * scale) + 'px',
    };
  },
  /* The box a sprite occupies, for highlight rings and hit feedback. Sized off
     that person's own sheet — two sheets at two scales is the point. */
  box(id, x, y) {
    const r = this.at(id);
    if (!r) return { x: x - 18, y: y - 24, w: 36, h: 44 };
    const m = r.sheet;
    return { x: x - m.fw / 2, y: y + this.FOOT - m.fh, w: m.fw, h: m.fh };
  },
  /* The person, not the cell: the 64px cell leaves room for a swing; a standing
     body is the middle 38, which a highlight ring is drawn round. */
  BODY_W: 38,
  bounds(id, x, y) {
    const b = this.box(id, x, y);
    const w = Math.min(b.w, this.BODY_W);
    return { x: x - w / 2, y: b.y, w, h: b.h };
  },
  /* ---- where a person bends ----
     Row 35 of 56, where the kit's legs layer starts, as a fraction so a sheet at
     another size bends in the right place. */
  WAIST: 35 / 56,
  waistOf(m) { return Math.round(m.fh * this.WAIST); },
  /* ---- where a person is cut ----
     The turn is always at the waist. When both halves are one drawing the cut is
     there too. When they differ, the cut drops to row 43: the kit hangs hands at
     rows 36-42, so a waist cut gives an aiming torso a second pair of hands. No
     foot starts above 44. */
  HIP: 43 / 56,
  hipOf(m) { return Math.round(m.fh * this.HIP); },

  /* ---- the twist ----
     One person drawn twice: legs from the row they walk in, torso from the row
     they look in, and the remaining angle as a lean about the hip. That is how
     aiming one way while walking another works with a four-direction sheet.
     The clips overlap by a row so no seam shows at fractional pixel ratios.
     `twist` is optional; without it a person is one blit. */
  twisted(c, id, r, legDir, legFrame, b, tw) {
    const m = r.sheet;
    const waist = this.waistOf(m);
    const hip = this.hipOf(m);
    const cut = (dir, frame) => {
      if (!(dir >= 0 && dir < m.dirs.length)) dir = 2;
      c.drawImage(m.img, (dir * m.frames + frame) * m.fw, r.row * m.fh, m.fw, m.fh,
        Math.round(b.x), Math.round(b.y), m.fw, m.fh);
    };
    /* A top half from another image, as long as it is a frame-sized rectangle.
       Unused by the game; kept so a second copy of everything below is never needed. */
    const cell = tw.cell;
    /* ---- the arm that is holding something ----
       A rectangle of this frame, turned about the shoulder (Guns.ARM: `rect` is the
       arm, `from` its joint, `to` where the joint goes, `turn` the angle). The arm
       is cut out of the torso blit, then redrawn inside a rotation clipped to
       itself. No pixel is read back, so file:// works. */
    const arm = tw.arm || null;
    /* And the other one, when the thing in the hand wants two — see
       Guns.supportFor(). Cut out and turned exactly like the first. */
    const off = (arm && arm.support) || null;
    /* A pixel of breath when asked for, on the same rhythm as the seated. The
       clip stays put; the row uncovered at the waist is legs. */
    const lift = tw.lift || 0;
    const top = cell
      ? () => c.drawImage(cell.img, cell.sx, cell.sy, m.fw, m.fh,
          Math.round(b.x), Math.round(b.y) - lift, m.fw, m.fh)
      : () => cut(tw.dir, tw.frame === undefined ? legFrame : tw.frame);
    const tdir = tw.dir, tframe = tw.frame === undefined ? legFrame : tw.frame;
    const lean = tw.lean || 0;

    /* ---- the legs ----
       A separate blit with neither lean nor breath: a lean bends at the waist, and
       the feet stay put. `whole` means both halves are one drawing (standing, or
       walking where you point); otherwise the halves differ and the cut is the low
       one. */
    /* The low cut whenever an arm is in play: the arm reaches row 42, so the line
       must be below it or the arm's hole is cut in a blit that never covered it. */
    const line = (tw.whole && !arm) ? waist : hip;
    c.save();
    c.beginPath(); c.rect(b.x - m.fw, b.y + line, m.fw * 3, m.fh);
    c.clip();
    if (tw.whole && cell) {
      c.drawImage(cell.img, cell.sx, cell.sy, m.fw, m.fh,
        Math.round(b.x), Math.round(b.y), m.fw, m.fh);
    } else cut(legDir, legFrame);
    c.restore();

    /* The torso, turned about the waist, shifted a pixel or two with the lean so
       it reads as a twist rather than a swivelling head. */
    c.save();
    /* Clip before rotating, so the cut line stays level; what rotates below it is
       hidden behind the legs. */
    c.beginPath(); c.rect(b.x - m.fw, b.y - m.fh, m.fw * 3, m.fh + line + 1);
    c.clip();
    const px = b.x + m.fw / 2, py = b.y + waist;
    c.translate(px, py);
    c.rotate(lean);
    c.translate(-px + Math.round(Math.sin(lean) * 3), -py);
    if (arm) {
      /* The arm's hole: everything minus the arm rectangle, by the even-odd rule. */
      c.save();
      c.beginPath();
      c.rect(b.x - m.fw, b.y - m.fh, m.fw * 3, m.fh * 3);
      this.armRect(c, arm, b);
      if (off) this.armRect(c, off, b);
      c.clip('evenodd');
      top();
      c.restore();
    } else top();
    /* And the face, inside the same transform: an expression is part of the
       head and the head has just turned. */
    this.faceOn(c, id, b, m, cell, tdir, tframe, lift);
    /* The near arm goes on last, in front: it holds the weapon. */
    /* The clip is set after the transform so it rotates with the blit. The off
       arm first, so the gripping hand is on top. */
    for (const a of [off, arm]) {
      if (!a) continue;
      c.save();
      c.translate(b.x + a.to[0], b.y + a.to[1]);
      c.rotate(a.turn);
      c.translate(-(b.x + a.from[0]), -(b.y + a.from[1]));
      c.beginPath();
      this.armRect(c, a, b);
      c.clip();
      top();
      c.restore();
    }
    c.restore();
  },

  /* The face goes on the half it belongs to, mirrored with the cell and told the
     source row, or a flipped head wears the expression on its ear. */
  /* One arm's rectangle as a path, rounded like the blit it cuts. */
  armRect(c, arm, b) {
    const [x0, y0, x1, y1] = arm.rect;
    c.rect(Math.round(b.x) + x0, Math.round(b.y) + y0, x1 - x0 + 1, y1 - y0 + 1);
  },

  faceOn(c, id, b, m, cell, tdir, tframe, lift) {
    if (cell && cell.flip) {
      c.save();
      c.translate(2 * (b.x + m.fw / 2), 0); c.scale(-1, 1);
      Faces.paint(c, id, cell.faceDir, cell.faceFrame, b.x, b.y - lift);
      c.restore();
    } else if (cell) Faces.paint(c, id, cell.faceDir, cell.faceFrame, b.x, b.y - lift);
    else Faces.paint(c, id, tdir, tframe, b.x, b.y);
  },

  draw(c, id, dir, frame, x, y, twist) {
    const r = this.at(id);
    if (!r) return;
    const m = r.sheet, b = this.box(id, x, y);
    /* A bad row makes the source rect NaN and drawImage silently draws nothing.
       Face the camera instead, so a mistake is visible. */
    if (!(dir >= 0 && dir < m.dirs.length)) dir = 2;
    /* No smoothing for the sprite: the HiDPI upscale would blur pixel art. */
    const smooth = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    if (twist && twist.dir !== undefined) { this.twisted(c, id, r, dir, frame, b, twist); c.imageSmoothingEnabled = smooth; return; }
    c.drawImage(m.img, (dir * m.frames + frame) * m.fw, r.row * m.fh, m.fw, m.fh,
      Math.round(b.x), Math.round(b.y), m.fw, m.fh);
    /* The expression, inside the same smoothing rule. Here rather than in the
       renderer, because every drawer of people calls this. */
    Faces.paint(c, id, dir, frame, b.x, b.y);
    c.imageSmoothingEnabled = smooth;
  }
};

/* ---------------- World art ----------------
   Floors, doors, windows and furniture, packed by tools/build-sprites.mjs into
   named rectangles. Same licence carve-out as the people (LICENSE part 2,
   art/CREDITS.md). The game knows only names, so swapping art is a data change;
   every call site falls back to emoji when a name is missing. */
const Tiles = {
  ready: false, img: null, rects: null, anchors: null,
  /* Several sheets, like Sprites. `rects` and `anchors` stay flat name → geometry
     maps; `owner` says which sheet a name's pixels are in. */
  sheets: [], owner: null,
  load() {
    atlasSheets().forEach(s => { if (s && s.sprites) this.adopt(s); });
  },
  /* One sheet. First to claim a name wins, as with Sprites.rows. */
  adopt(s) {
    if (!s || !s.src) return null;
    if (!this.rects) { this.rects = Object.create(null); this.anchors = Object.create(null); this.owner = Object.create(null); }
    let sh = this.sheets.find(x => x.id === s.id);
    const fresh = !sh;
    if (fresh) { sh = { id: s.id, src: null, img: null, ok: false }; this.sheets.push(sh); }
    /* No cell size is kept: every rect is in pixels, since wall items are off the
       32px grid. The importer keeps its own. */
    /* Re-adopting an id releases its old names first, so the importer's per-keystroke
       re-reads never leak a sheet. */
    Object.keys(this.owner).forEach(n => {
      if (this.owner[n] !== sh) return;
      delete this.owner[n]; delete this.rects[n]; delete this.anchors[n];
    });
    Object.keys(s.sprites || {}).forEach(n => {
      if (n in this.rects) return;         /* first to claim a name wins */
      this.rects[n] = s.sprites[n];
      this.anchors[n] = (s.anchors || {})[n] || 'flat';
      this.owner[n] = sh;
    });
    if (fresh || sh.src !== s.src) {
      sh.src = s.src; sh.ok = false;
      const im = new Image();
      im.onload = () => {
        sh.img = im; sh.ok = true;
        if (!this.img) this.img = im;        /* the first sheet to decode */
        this.ready = true;
        /* Anything baked from the emoji stand-ins is out of date now. */
        this.gen = (this.gen || 0) + 1;
      };
      im.onerror = () => { sh.ok = false; };   /* this sheet stays on the emoji */
      /* No cache key on a data: URI (the query would become data). */
      im.src = s.src + (s.v ? '?v=' + s.v : '');
    }
    return sh;
  },
  /* Which PNG a name's pixels are in. Named rather than assumed, because the
     baked floor and wall tiles in render.js reach for the bitmap directly. */
  imgFor(n) {
    const o = this.owner && this.owner[n];
    return o ? o.img : this.img;
  },
  has(n) {
    if (!n || !this.rects || !this.rects[n]) return false;
    const o = this.owner[n];
    return o ? o.ok : this.ready;
  },
  /* The art is 32px and so is the tile, so everything here is 1:1 — no
     scaling, and smoothing off, or pixel art on a 2x screen turns to mush. */
  blit(c, r, x, y, img) {
    const sm = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    c.drawImage(img || this.img, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
    c.imageSmoothingEnabled = sm;
  },
  /* An object on the tile centred at (wx, wy): `floor` stands it on the tile's
     bottom edge, `flat` centres it. */
  draw(c, n, wx, wy, flip, turn) {
    const r = this.has(n) && this.rects[n];
    if (!r) return false;
    const img = this.imgFor(n);
    const a = this.anchors[n] || 'flat';
    const x = wx - r[2] / 2, y = a === 'floor' ? wy + TILE / 2 - r[3] : wy - r[3] / 2;
    /* A quarter turn, for a door in a wall that runs top to bottom: an open
       leaf lying back along the wall is the same door seen from the side. */
    if (turn) {
      c.save();
      c.translate(Math.round(wx), Math.round(wy));
      c.rotate(turn * Math.PI / 2);
      this.blit(c, r, -r[2] / 2, -r[3] / 2, img);
      c.restore();
      return true;
    }
    if (!flip) { this.blit(c, r, x, y, img); return true; }
    /* Mirrored, for the far half of a double doorway — a pair of doors is
       hinged at the jambs and opens outwards, not both the same way round. */
    c.save();
    c.translate(Math.round(x + r[2] / 2), 0);
    c.scale(-1, 1);
    this.blit(c, r, -r[2] / 2, y, img);
    c.restore();
    return true;
  },
  /* Where a sprite's own middle lands when drawn at (wx, wy); a floor-anchored
     sprite's is higher. For turning a sprite about itself. */
  centre(n, wx, wy) {
    const r = this.has(n) && this.rects[n];
    if (!r) return { x: wx, y: wy };
    return { x: wx, y: (this.anchors[n] || 'flat') === 'floor' ? wy + TILE / 2 - r[3] / 2 : wy };
  },
  /* One floor tile at the top-left of its cell. */
  floor(c, n, px, py) {
    const r = this.has(n) && this.rects[n];
    if (!r) return false;
    this.blit(c, r, px, py);
    return true;
  },
};
