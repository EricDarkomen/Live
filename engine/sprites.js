'use strict';
/* Character sprites: Liberated Pixel Cup art, built by tools/build-sprites.mjs.
   Third-party, OGA-BY 3.0, NOT covered by this file's licence — see LICENSE
   part 2 and art/CREDITS.md.

   Several SHEETS rather than one atlas: a sheet is a PNG plus the geometry to
   read it, so a second one can come from another project in another style and
   the renderer need not know. Sprites.rows maps a person to their sheet.

   Never read pixels back here. The PNGs sit beside index.html and a file://
   page taints a canvas it draws them into — harmless until something calls
   getImageData, which would break opening the game off disk. Missing or broken
   sheets fall back to emoji per person, gated by has(). */

/* typeof, because a copy opened without art/ never loads the manifest at all
   and the const is simply never declared. */
function atlasSheets() {
  if (typeof SPRITE_ATLAS === 'undefined') return [];
  const list = SPRITE_ATLAS && SPRITE_ATLAS.sheets;
  return Array.isArray(list) ? list : [];
}

const Sprites = {
  ready: false, sheets: [], rows: new Map(),
  /* Where the feet sit relative to the drawing origin — the same offset the
     shadow uses, so a sprite stands on its own shadow. */
  FOOT: 13,
  /* The named cycles a person sheet may carry, past the walk: breathing and
     running, and the three combat poses — squared up, forehand and backhand.
     A sheet without one simply does not do that thing. */
  CYCLES: ['breath', 'run', 'ready', 'slash', 'backslash'],
  load() {
    /* `lazy` sheets are the character creator's parts, and they are the one
       thing on the manifest nobody should pay for by default: four hundred
       components, and only somebody who opens the creator — or a colleague
       re-dressed since the last build — ever needs any of them. needParts()
       brings in exactly the ones asked for. */
    atlasSheets().forEach(s => { if (s && Array.isArray(s.ids) && !s.lazy) this.adopt(s); });
    /* The expressions layer is a sheet like any other and is brought in with
       the people it goes on, from the one place sheets are loaded. Guarded
       because a page that does not ship engine/faces.js is still a page that
       ships people — see engine/faces.js. */
    if (typeof Faces !== 'undefined') Faces.load();
  },

  /* ---- the character creator's parts ----
     Everything below this line exists because the player is CHOSEN. Everybody
     else is baked into people.png at build time from the same components; the
     player's are stacked here instead, once, when somebody finishes making a
     character.

     A component is ONE FILE. The manifest carries an entry per axis — its
     label, its stacking order and the list of what it offers — and `each`,
     the path with `%d` where the component's place in that list goes. So the
     menus are complete the moment the page loads, and a component's pixels
     are fetched only when somebody actually wears it: at these frame sizes a
     whole axis in one sheet is a hundred megabytes decoded to show one
     hairstyle. */
  partOf(vid) {
    for (const s of atlasSheets()) {
      if (!s || !s.each || !Array.isArray(s.meta)) continue;
      const i = s.meta.findIndex(m => m && m.id === vid);
      if (i >= 0) return { s, i };
    }
    return null;
  },
  /* Bring in these components, and call back once every one has decoded (or
     any has failed — a missing file leaves the baked row in place, which is a
     real person rather than an error). Re-callable; a component already here
     is not fetched twice. */
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
  /* Let go of every component bitmap once the people are stacked: the
     composed canvases are all that is drawn, and a component needed again
     (the creator) comes back from the HTTP cache. */
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

  /* The creator's menu: one entry per axis, in stacking order, each with the
     variants it offers. Read off the manifest rather than written down here,
     so adding a hairstyle is a change to the build alone. */
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

  /* Stack the chosen variants into one row and hand it to the renderer as an
     ordinary sheet. A canvas is a perfectly good `img` — drawImage takes one —
     and this only ever DRAWS the parts, never reads them back, which is what
     keeps it working from file:// where the sheets taint every canvas they
     touch.

     Deliberately overrides whatever row already claimed `id`: "first sheet to
     claim a person wins" is a rule about two sheets arriving, and this is not
     that. The baked row underneath is remembered so uncompose() can put the
     default back. */
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
    /* WHICH HEAD IS UNDER ALL THAT. An expression is a patch drawn over a
       specific head at a specific skin tone — see engine/faces.js — and a
       composed person has no baked row to look that up by, so the base they
       were stacked from is remembered here. It used to be read off G.look,
       which worked for exactly as long as the player was the only composed
       person in the game. */
    if (!this._bases) this._bases = new Map();
    const base = (picks || []).find(v => typeof v === 'string' && v.startsWith('base:'));
    if (base) this._bases.set(id, base); else this._bases.delete(id);
    /* A PORTRAIT NEEDS A URL. The dialogue box is CSS — a window onto a
       background-image — and a composed sheet is a canvas, so until now
       portrait() simply refused and anybody composed talked to you with no
       picture. That was tolerable while the only composed person was the
       player, who is never the one being talked to, and is not tolerable now
       that a shopkeeper can be composed.

       toDataURL() READS THE CANVAS BACK, which is the one thing this file
       otherwise never does: the part sheets sit beside index.html and a
       file:// page taints every canvas they are drawn into, so this throws
       there. That is exactly the right behaviour and it is caught — no url,
       portrait() refuses as before, and the game still opens off disk with
       everybody's dialogue face on the emoji. Done once per compose, not per
       frame: it is a few hundred KB of base64 and it is cached on the sheet. */
    /* The portrait's data URL is made when somebody is first talked to, not
       here: twenty-seven of them at boot is megabytes nobody has asked for. */
    sh.lazySrc = true;
    this.rows.set(id, { sheet: sh, row: 0 });
    this.ready = true;
    return sh;
  },
  /* Back to the row the build baked. Does NOTHING when nothing was composed:
     an earlier version deleted the row in that case, which took the baked
     `player` off the sheet and left the one character who is always on screen
     drawn as an emoji. */
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
  /* Whether somebody is a stack of chosen parts rather than a row the build
     baked, and which base they were stacked from. Only Faces asks — a composed
     person's face comes from the base underneath and a baked one's from the
     row they are.

     It was the player and nobody else for as long as the cast was the
     twenty-one rows the build bakes. It is not any more: the character sheet
     is pinned and cannot grow, but the creator's parts can make as many people
     as anybody cares to write, so a person in data/npcs.js may carry a `look:`
     and be composed exactly as the player is. See Look.dressCast(). */
  /* Asked of the SHEET, not of what was underneath it. This used to test
     _baked — "is there a row we shadowed" — which is the right question for
     uncompose() and the wrong one for everybody else: the player has a baked
     row to hand back and a shopkeeper composed out of nothing at all does not,
     so six people came out of compose() perfectly well and then answered "no"
     when Faces asked whether they were composed, and stood there expressionless
     with a face row of -1. */
  composed(id) {
    const r = this.rows.get(id);
    return !!(r && r.sheet && r.sheet.composed);
  },
  baseOf(id) { return (this._bases && this._bases.get(id)) || null; },
  /* One sheet, by id. Re-callable with the same id, which is how a sheet whose
     geometry is still being worked out — the editor's importer — is re-read
     without a second copy of its bitmap: the game never does that, and a load()
     that pushed a duplicate would double every row and leave a megabyte of
     decoded PNG behind on each keystroke. */
  adopt(s) {
    if (!s || !s.src || !Array.isArray(s.ids)) return null;   /* not a roster sheet */
    let sh = this.sheets.find(x => x.id === s.id);
    const fresh = !sh;
    if (fresh) { sh = { id: s.id, src: null, img: null, ok: false }; this.sheets.push(sh); }
    Object.assign(sh, {
      fw: s.fw, fh: s.fh, frames: s.frames, sit: s.sit, dirs: s.dirs, ids: s.ids,
      /* What axis of the character creator this sheet is, if it is one at all.
         compose() sorts by `part.z`, so a sheet that arrived without this is a
         layer the compositor silently drops. */
      part: s.part || null, lazy: !!s.lazy });
    /* Named cycles the sheet may or may not carry. A sheet without one simply
       does not do that thing, and everybody stands still and walks exactly as
       they always did. */
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
  /* Sheet rows are the LPC direction order: up, left, down, right. Movement is
     one axis at a time for NPCs and can be diagonal for the player, so the
     dominant axis decides which way they are looking. */
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
  /* Frame 0 stands, 1..sit-1 is the walk, sit is seated. `phase` is free
     running, so callers keep no frame timer.

     `back` plays the same cycle the other way round, and it is the whole of
     walking backwards. There is no reverse walk in the kit and there does not
     need to be one: a walk cycle run in reverse is what backing up looks like,
     and backing up is what somebody does when their feet want to go one way
     and the thing they are pointing at is behind them — see Guns.legs(). */
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
  /* Seconds per breath step, and the tuning knob. The kit's idle runs at
     animation speed, which on a body doing nothing reads as panting. The phase
     is offset per person, or the whole floor inhales together. */
  BREATH_S: 0.6,
  /* Where in the breath somebody is, 0..n-1. Separated from the frame lookup
     because a seated person needs the same rhythm without the same frames —
     see breathLift(). */
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
  /* One pixel on the same rhythm as everyone else's breath. The kit's three
     Sitting columns are three postures, not a cycle — playing them in sequence
     is a violent fidget — and most people on screen are sitting down, so frozen
     sitters are what most gives away that they are sprites. */
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
  /* The seat, not the sitter. Nobody stops on a tile centre — NPCs stop a few
     pixels short, the player wherever the thumb left the stick — so a sitter
     drawn at their own position sits on the arm of the chair. */
  seatPos(o) { return { x: (o.x + 0.5) * TILE, y: (o.y + 0.5) * TILE - SEAT }; },
  /* The other way round: is anybody sitting on this tile right now. Used by
     the renderer to decide whether a chair draws in front of its occupant. */
  seatedHere(tx, ty) {
    if (!P.moving && Math.floor(P.x / TILE) === tx && Math.floor(P.y / TILE) === ty) return true;
    return NPCM.list.some(n => !n.walking
      && Math.floor(n.x / TILE) === tx && Math.floor(n.y / TILE) === ty);
  },
  /* The head off the standing, front-facing frame, as CSS for the dialogue
     portrait. 30 rows clears the tallest hair in the roster (Mo's afro, which
     reaches the top of the frame) and still reaches the shoulders. */
  HEAD_W: 28, HEAD_H: 30, HEAD_TOP: 0,
  portrait(id, scale) {
    const r = this.at(id);
    /* No `src` is no url() for CSS to point at, and the honest answer is "no
       picture". A composed sheet USED to be exactly that — a canvas with
       nothing to link to — and now carries a data url baked at compose time,
       so a composed shopkeeper has a portrait like anybody else. It is still
       null from a file:// page, where reading the canvas back throws: see
       compose(). */
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
  /* THE PERSON, not the cell they are drawn in. The cell is the full sixty-
     four upstream draws in, because a swing reaches the edge of it; a person
     standing up is the middle thirty-eight, which is what a highlight ring is
     drawn round. */
  BODY_W: 38,
  bounds(id, x, y) {
    const b = this.box(id, x, y);
    const w = Math.min(b.w, this.BODY_W);
    return { x: x - w / 2, y: b.y, w, h: b.h };
  },
  /* ---- where a person bends ----
     Thirty-five rows down a fifty-six row frame, which is not a guess: the
     character kit ships the body in layers, and `parts-legs` starts at row 35
     of the frame on the same row `parts-torso` stops. So the waist is where
     the trousers begin, measured off the art rather than eyeballed, and it is
     kept as a FRACTION of the frame so a sheet from another project at another
     size bends in the right place too. */
  WAIST: 35 / 56,
  waistOf(m) { return Math.round(m.fh * this.WAIST); },
  /* ---- and where a person is CUT, which is not always the same line ----
     The waist is where a body bends, so it is where the TURN happens, always.
     Where the CUT goes depends on whether the two halves are the same drawing.

     Same drawing — both halves out of one cell, which is what standing still
     or walking the way you are pointing means — and the cut is the waist too:
     nothing can disagree, because there is only one frame.

     DIFFERENT drawings and the waist is the wrong line, for one reason: hands.
     Every standing and walking frame in this kit hangs them at the hips, rows
     36 to 42, BELOW the waist — so a top half holding a blaster in two braced
     hands got another two dangling at its sides, which is one pair too many.
     Eight rows lower is below every one of them and above every foot: the arms
     come whole from the half that is holding something, the hips come with
     them, and what swings underneath is shins.

     Measured, like the waist: hands end at row 42 in the lowest frame that has
     them, and no foot starts above 44. */
  HIP: 43 / 56,
  hipOf(m) { return Math.round(m.fh * this.HIP); },

  /* ---- the twist ----
     One person, drawn twice, cut in half at the waist: the legs from the row
     they are WALKING in, the torso and head from the row they are LOOKING in,
     and whatever angle is left over between that row and the real bearing
     taken up as a lean about the hip.

     This is the whole of aiming one way and walking another. A sprite sheet
     has four directions and a thumb has three hundred and sixty degrees, and
     for as long as a person was one bitmap the only thing the game could do
     with the difference was throw it away — you walked backwards up a corridor
     with your whole body turned round, which is a thing people do exactly
     never. Cutting at the hip costs one extra blit and gets the other three
     hundred and fifty-six degrees back.

     The clip rectangles OVERLAP by a row on purpose. Two halves butted exactly
     against each other leave a seam the width of nothing at all, which on a
     screen scaled by devicePixelRatio is a bright line across somebody's hips
     on about half of all phones.

     Nobody is obliged to use it: `twist` is optional and every existing call
     passes nothing, so a colleague at a printer is the single blit they have
     always been. */
  twisted(c, id, r, legDir, legFrame, b, tw) {
    const m = r.sheet;
    const waist = this.waistOf(m);
    const hip = this.hipOf(m);
    const cut = (dir, frame) => {
      if (!(dir >= 0 && dir < m.dirs.length)) dir = 2;
      c.drawImage(m.img, (dir * m.frames + frame) * m.fw, r.row * m.fh, m.fw, m.fh,
        Math.round(b.x), Math.round(b.y), m.fw, m.fh);
    };
    /* A CELL FROM SOMEWHERE ELSE. The top half may come from a rectangle in
       another image entirely, as long as it is a rectangle the size of a
       frame: then it is still one blit, and all this has to know is where to
       read it from. Nothing in the game passes one today; the hook stays
       because the alternative is a second copy of everything below it. */
    const cell = tw.cell;
    /* ---- THE ARM THAT IS HOLDING SOMETHING ----
       A rectangle of this same frame, turned about the shoulder. See
       Guns.ARM, which is where it is measured and what it means: `rect` is
       the arm in the cell, `from` is the joint inside it, `to` is where that
       joint goes and `turn` is how far round.

       It costs two things here. The arm is CUT OUT of the torso blit, so it
       does not also hang where the kit drew it — that is one clip with a hole
       in it, and the hole is in the same coordinates as the rectangle because
       it is the same rectangle. And it is drawn again afterwards inside a
       rotation, clipped to itself so the blit paints nothing else.

       No pixel is read back and nothing is composited off-screen, which is
       what lets this work from file:// — see compose(). */
    const arm = tw.arm || null;
    /* And the other one, when the thing in the hand wants two — see
       Guns.supportFor(). Cut out and turned exactly like the first. */
    const off = (arm && arm.support) || null;
    /* One pixel of breath, when the caller asks for it. A braced top half that
       never moves at all is the thing that gives a sprite away as furniture,
       and this is the same pixel and the same rhythm every seated person in
       the building already breathes on. The clip does not move with it: the
       row it uncovers at the waist is a row of legs, which is what is behind
       it anyway. */
    const lift = tw.lift || 0;
    const top = cell
      ? () => c.drawImage(cell.img, cell.sx, cell.sy, m.fw, m.fh,
          Math.round(b.x), Math.round(b.y) - lift, m.fw, m.fh)
      : () => cut(tw.dir, tw.frame === undefined ? legFrame : tw.frame);
    const tdir = tw.dir, tframe = tw.frame === undefined ? legFrame : tw.frame;
    const lean = tw.lean || 0;

    /* ---- the legs ----
       A separate blit, and one that takes neither the lean nor the breath: a
       lean is a bend at the waist, and applied to the whole figure it is a
       bowling pin going over, feet and all. The feet stay where they were put.

       `whole` is both halves out of the SAME drawing, which is what wanting
       the same direction means — standing still, or walking the way you are
       pointing. Then the cut is the waist, the legs are that drawing's own
       legs, and nothing in the figure can disagree with anything else in it.

       Otherwise — strafing, or backing away from what you are aiming at — the
       two halves are genuinely different drawings and the cut is the low one,
       below every hand this kit hangs at a hip. The arms come whole from the
       half that is holding something and what swings underneath is shins. Cut
       at the waist there instead and the bottom half brings its own pair of
       hands along, which is one pair too many. */
    /* Where the two halves meet. The low cut whenever an arm is in play,
       whatever the halves are doing: the arm reaches to row 42 and the torso
       blit is the one holding it, so the line has to be below it or the hole
       cut for the arm is a hole in a blit that never covered it. */
    const line = (tw.whole && !arm) ? waist : hip;
    c.save();
    c.beginPath(); c.rect(b.x - m.fw, b.y + line, m.fw * 3, m.fh);
    c.clip();
    if (tw.whole && cell) {
      c.drawImage(cell.img, cell.sx, cell.sy, m.fw, m.fh,
        Math.round(b.x), Math.round(b.y), m.fw, m.fh);
    } else cut(legDir, legFrame);
    c.restore();

    /* The torso, from the waist up, turned about it. The shoulders also shift
       a pixel or two the way the lean is going, because a body twisting at the
       waist moves sideways as well as round, and without that the rotation
       reads as a head swivelling on a post. */
    c.save();
    /* The cut is clipped BEFORE the rotation and the rotation happens inside
       it, which is the way round that matters: a clip applied after would turn
       with the torso, and a tilted cut line takes a wedge out of one hip and
       leaves a gap at the other. The line across the body stays level; what
       rotates below it is simply hidden behind the legs, which is where it
       has gone. */
    c.beginPath(); c.rect(b.x - m.fw, b.y - m.fh, m.fw * 3, m.fh + line + 1);
    c.clip();
    const px = b.x + m.fw / 2, py = b.y + waist;
    c.translate(px, py);
    c.rotate(lean);
    c.translate(-px + Math.round(Math.sin(lean) * 3), -py);
    if (arm) {
      /* The hole. Two rectangles and the even-odd rule: everything, minus the
         arm. The blit underneath is unchanged — this simply refuses to let it
         paint the six columns the arm used to hang in. */
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
    if (typeof Faces !== 'undefined') this.faceOn(c, id, b, m, cell, tdir, tframe, lift);
    /* The arm goes on LAST and in front of everything, because it is the near
       arm: it is the one the hand at the end of it is holding something with,
       and a blaster behind a shoulder is a blaster nobody can see. */
    /* The clip is declared BEFORE the blit and AFTER the transform, so it
       travels with it: the rectangle is named in the cell's own coordinates
       and lands wherever the rotation puts it, which is the whole trick. The
       off arm first, so the hand on the grip is the one on top. */
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

  /* Whatever their face is doing, onto the half the face is on. A mirrored
     cell needs it mirrored too, and needs to be told which row the body
     underneath actually came from: the patch is measured against a specific
     frame of a specific direction, and drawing a left-facing mouth over a
     right-facing head that has been flipped into place puts somebody's
     expression on the back of their ear. */
  /* One arm's rectangle, in the cell, as a path — rounded the same way the
     blit it is cutting is rounded, or the hole is half a pixel off the thing
     it is supposed to be hiding. */
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
    /* A bad row is not allowed to be silent. Anything non-numeric here makes
       the source rectangle NaN, and a NaN drawImage is a no-op that reports
       nothing — which is a person who simply is not on the screen. Face the
       camera instead, so a mistake looks wrong rather than looking like
       nothing. */
    if (!(dir >= 0 && dir < m.dirs.length)) dir = 2;
    /* The canvas is scaled by devicePixelRatio, so on a HiDPI phone this blit
       is an upscale — and smoothing turns pixel art into mush. Off for the
       sprite only; the emoji and the baked gradients still want it. */
    const smooth = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    if (twist && twist.dir !== undefined) { this.twisted(c, id, r, dir, frame, b, twist); c.imageSmoothingEnabled = smooth; return; }
    c.drawImage(m.img, (dir * m.frames + frame) * m.fw, r.row * m.fh, m.fw, m.fh,
      Math.round(b.x), Math.round(b.y), m.fw, m.fh);
    /* Whatever their face is doing, over the top of the person and inside the
       same smoothing rule — an expression is pixel art too. It goes here
       rather than in the renderer because everybody who draws a person calls
       this: the floor, the street, and the character creator's preview. */
    if (typeof Faces !== 'undefined') Faces.paint(c, id, dir, frame, b.x, b.y);
    c.imageSmoothingEnabled = smooth;
  }
};

/* ---------------- World art ----------------
   The other half of the kit: floors, doors, windows and the office furniture,
   packed by tools/build-sprites.mjs into one PNG of named rectangles. Same
   manifest, same licence, same third-party carve-out as the people — see
   LICENSE part 2 and art/CREDITS.md.

   A name is all the game knows. Nothing above this line has any idea which
   upstream sheet a printer came from, which is what makes swapping one a data
   change. Everything degrades to the emoji it replaced if the atlas is
   missing: every call site checks the return value. */
const Tiles = {
  ready: false, img: null, rects: null, anchors: null,
  /* SEVERAL sheets, exactly as Sprites has several people-sheets and for the
     same reason: a sheet is a PNG plus the geometry to read it, so a second one
     can come from another project in another style and nothing that draws needs
     to know. `rects` and `anchors` stay flat maps of name → geometry, because
     that is what every call site and the suite already read; `owner` is the
     only new thing, and it is what says which PNG a name's pixels are in. */
  sheets: [], owner: null,
  load() {
    atlasSheets().forEach(s => { if (s && s.sprites) this.adopt(s); });
  },
  /* One sheet. First to claim a name wins, so a sheet added later cannot
     silently repaint something already drawn — the same rule Sprites.rows
     follows for people, and for the same reason. */
  adopt(s) {
    if (!s || !s.src) return null;
    if (!this.rects) { this.rects = Object.create(null); this.anchors = Object.create(null); this.owner = Object.create(null); }
    let sh = this.sheets.find(x => x.id === s.id);
    const fresh = !sh;
    if (fresh) { sh = { id: s.id, src: null, img: null, ok: false }; this.sheets.push(sh); }
    /* A sheet's cell size is not kept here. Every entry in `rects` is in
       PIXELS — the kit's wall items are not on the 32px grid and rounding one
       to a cell clips the frame off it — so nothing that draws ever asks, and
       the one flat `cell` this used to carry could only ever be the first
       sheet's. The importer keeps its own, because slicing is where the
       question is asked. */
    /* Re-callable with the same id, and that is the point: the importer changes
       what a sheet declares on every keystroke, and a version that pushed a new
       sheet each time would leave a decoded megabyte behind for each one. Give
       up what this sheet claimed, then claim again. */
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
      };
      im.onerror = () => { sh.ok = false; };   /* this sheet stays on the emoji */
      /* No cache key on a data: URI — a query string there is part of the data,
         not a cache bust, and the browser rejects the lot. An imported sheet has
         nothing to bust against anyway: it arrived with the page. */
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
  /* An object standing on the tile centred at (wx, wy). `floor` stands it on
     the tile's bottom edge, because a fridge is two tiles tall and its feet
     are on the floor; `flat` centres it, which is what a laptop on a desk
     wants. */
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
  /* Where a sprite's own middle lands when it is drawn at (wx, wy), which is
     NOT (wx, wy) for anything standing on the floor: a fridge is two tiles tall
     and anchored by its feet. Asked by anything that has to turn a sprite about
     itself rather than about the tile it stands on. */
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
