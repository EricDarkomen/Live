'use strict';
/* ---------------- The canvas: camera, loop and overlays ----------------
   The preview is the GAME's renderer, not a diagram of the level. R.draw()
   reads Cam, World and MAPW/MAPH by bare name and has no idea it is being
   driven by an editor, so the walls, the light pools, the worktops and the
   doorway leaves are all exactly what the player will see.

   Zoom is the one thing that had to be arranged rather than asked for. R.draw()
   sets its transform from R.dpr and clears Cam.w × Cam.h, so drawing the world
   at 2× is a matter of handing it twice the device ratio and half the visible
   span. R.dpr is put back immediately afterwards, because R.resize() sizes the
   canvas backing store from it and a zoomed value there would grow the canvas
   on every resize until the tab fell over. */

/* What is selected, if anything. One thing at a time, addressed the way the doc
   addresses it: an index into a list, or an entry's name. */
const Sel = { kind: null, i: -1, name: null };

const View = {
  x: 0, y: 0, zoom: 1,
  /* The floor is low enough that fit() can actually fit. The fourth floor is
     64×44 tiles — 2048px — and a phone is 390 of them, so the whole level needs
     about 0.19 and the old floor of 0.25 meant "see all of it" was a thing the
     button could not do on the device that most needs it. */
  MIN: 0.1, MAX: 3,
  /* Where the pointer is, in tiles, or null when it is off the canvas. */
  hover: null,
  /* A rectangle being dragged out by the room or counter tool. */
  band: null,
  grid: true, plan: true, faults: true, wps: false,
  last: 0,

  dpr() { return Math.min(2, window.devicePixelRatio || 1); },

  init() {
    R.init();
    /* R.resize() reads the canvas's laid-out size, so the stylesheet has had
       its say by now and the editor only has to keep the camera honest. */
    window.addEventListener('resize', () => { this.measure(); this.clamp(); });
    this.measure();
    this.fit();
  },

  /* ---- what the chrome is covering ----
     The tools and the zoom float ON the map now, so "the visible map" is the
     canvas minus whatever is parked over it — a rail down one side on a desktop,
     a strip along the bottom of a phone. Everything that centres or fits reads
     this, or the fourth floor is fitted to a box a fifth of which is behind the
     tool strip and the middle of the level is under your thumb.

     Measured off the real elements rather than written down, because which edge
     the dock is on is a media query's decision and this file must not have to
     agree with it. Cached: clamp() runs on every pointermove of a drag, and two
     getBoundingClientRects per move is a layout flush per move. */
  ins: { l: 0, t: 0, r: 0, b: 0 },
  measure() {
    const cv = R.cv;
    const out = { l: 0, t: 0, r: 0, b: 0 };
    if (!cv) { this.ins = out; return out; }
    const r = cv.getBoundingClientRect();
    if (r.width && r.height) {
      ['#dock', '#zoomer'].forEach(sel => {
        const el = $(sel);
        if (!el) return;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        const gap = 10;
        /* A band across the map, a rail down one side of it, or a widget in a
           corner. Only the first two are worth steering round: reserving a
           column for the zoom pill cost a 320px phone 128px of camera and drove
           "fit the whole level" into the zoom floor — a corner widget is small,
           it is in a corner, and the map is allowed to run under it. */
        const band = b.width > r.width * 0.6, rail = b.height > r.height * 0.4;
        if (band) {
          if (b.top - r.top < r.height / 2) out.t = Math.max(out.t, b.bottom - r.top + gap);
          else out.b = Math.max(out.b, r.bottom - b.top + gap);
        } else if (rail) {
          if (b.left - r.left < r.width / 2) out.l = Math.max(out.l, b.right - r.left + gap);
          else out.r = Math.max(out.r, r.right - b.left + gap);
        }
      });
      /* Never let the chrome claim more than half the map in either direction:
         a mis-measured floating element must cost a margin, not the canvas. */
      const capX = r.width * 0.4, capY = r.height * 0.4;
      out.l = clamp(out.l, 0, capX); out.r = clamp(out.r, 0, capX);
      out.t = clamp(out.t, 0, capY); out.b = clamp(out.b, 0, capY);
    }
    this.ins = out;
    return out;
  },
  /* The middle of the part of the canvas you can actually see, in CSS pixels. */
  eye() {
    const i = this.ins;
    const cw = R.cv.clientWidth || 800, ch = R.cv.clientHeight || 600;
    return { x: i.l + (cw - i.l - i.r) / 2, y: i.t + (ch - i.t - i.b) / 2 };
  },

  /* ---- the loop ----
     Always running: the game's own idle animation (breathing, a ringing phone,
     the light on a monitor) is part of what you are judging. */
  loop(now) {
    const dt = Math.min(0.05, (now - (View.last || now)) / 1000);
    View.last = now;
    try { View.frame(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(View.loop);
  },
  frame(dt) {
    /* The map is only one of the three documents. The loop keeps running — it
       is what notices a resize — but there is nothing to draw when the canvas is
       behind a workspace, and drawing it anyway is a phone getting warm for a
       picture nobody can see. */
    if (typeof Mode !== 'undefined' && Mode.id !== 'levels') {
      /* Except the art importer, which has a sheet of its own to draw and a
         walk cycle that has to actually walk. */
      if (typeof Mode !== 'undefined' && Mode.id === 'art') ArtUI.frame(dt);
      return;
    }
    const d = this.dpr();
    R.dpr = d * this.zoom;
    Cam.w = R.cv.width / R.dpr;
    Cam.h = R.cv.height / R.dpr;
    Cam.x = this.x; Cam.y = this.y;
    R.draw(dt);
    this.overlay();
    /* Back to the true ratio before anything can resize the canvas from it. */
    R.dpr = d;
  },

  /* ---- camera ---- */

  /* World span the canvas shows, in pixels. */
  spanW() { return R.cv.width / (this.dpr() * this.zoom); },
  spanH() { return R.cv.height / (this.dpr() * this.zoom); },
  clamp() {
    const w = this.spanW(), h = this.spanH();
    const i = this.ins, z = this.zoom;
    const il = i.l / z, ir = i.r / z, it = i.t / z, ib = i.b / z;
    const mw = MAPW * TILE, mh = MAPH * TILE;
    /* Centre a map smaller than the window rather than pinning it to a corner,
       which is what the game's own camera does for the same reason — but centre
       it in the part of the canvas that is not behind the tool rail. */
    this.x = mw <= w - il - ir ? (mw - w) / 2 - (il - ir) / 2
      : clamp(this.x, -TILE - il, mw - w + TILE + ir);
    this.y = mh <= h - it - ib ? (mh - h) / 2 - (it - ib) / 2
      : clamp(this.y, -TILE - it, mh - h + TILE + ib);
  },
  pan(dxCss, dyCss) {
    this.x -= dxCss / this.zoom;
    this.y -= dyCss / this.zoom;
    this.clamp();
  },
  /* Zoom about a point on the canvas, so the tile under the pointer stays under
     the pointer. Anything else feels like the map is running away. */
  zoomAt(f, cssX, cssY) {
    const before = this.toWorld(cssX, cssY);
    this.zoom = clamp(this.zoom * f, this.MIN, this.MAX);
    const after = this.toWorld(cssX, cssY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
    Side.zoomLabel();
  },
  setZoom(z, keepCentre) {
    const e = this.eye();
    const before = keepCentre === false ? null : this.toWorld(e.x, e.y);
    this.zoom = clamp(z, this.MIN, this.MAX);
    if (before) {
      const after = this.toWorld(e.x, e.y);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
    }
    this.clamp();
    Side.zoomLabel();
  },
  /* Put a world point in the middle of the visible map. */
  lookAt(wx, wy) {
    const e = this.eye();
    this.x = wx - e.x / this.zoom;
    this.y = wy - e.y / this.zoom;
    this.clamp();
  },
  /* The whole level, with a tile of air round it and clear of the chrome. */
  fit() {
    this.measure();
    const i = this.ins;
    const cw = (R.cv.clientWidth || 800) - i.l - i.r;
    const ch = (R.cv.clientHeight || 600) - i.t - i.b;
    const z = Math.min(Math.max(80, cw) / ((MAPW + 2) * TILE), Math.max(80, ch) / ((MAPH + 2) * TILE));
    this.zoom = clamp(z, this.MIN, this.MAX);
    this.lookAt(MAPW * TILE / 2, MAPH * TILE / 2);
    Side.zoomLabel();
  },

  /* CSS pixels on the canvas → world pixels. The device ratio cancels: the
     transform is dpr×zoom and the backing store is dpr× the CSS size. */
  toWorld(cssX, cssY) {
    return { x: this.x + cssX / this.zoom, y: this.y + cssY / this.zoom };
  },
  toTile(cssX, cssY) {
    const w = this.toWorld(cssX, cssY);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  },
  inMap(t) { return t.x >= 0 && t.y >= 0 && t.x < MAPW && t.y < MAPH; },

  /* ---- overlays ----
     Drawn in world space under the same transform R.draw() used, with every
     stroke width and font divided by the zoom so they stay the size of a line
     on the screen rather than the size of a line on the floor. */
  overlay() {
    const c = R.ctx, z = this.zoom;
    c.save();
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    c.translate(-Math.round(this.x), -Math.round(this.y));
    c.lineWidth = 1 / z;
    /* Every chip drawn this frame, so the next one can decline to draw itself
       on top of one. Cleared here rather than appended to for ever. */
    this.taken = [];

    const x0 = Math.max(0, Math.floor(this.x / TILE));
    const y0 = Math.max(0, Math.floor(this.y / TILE));
    const x1 = Math.min(MAPW - 1, Math.ceil((this.x + this.spanW()) / TILE));
    const y1 = Math.min(MAPH - 1, Math.ceil((this.y + this.spanH()) / TILE));

    if (this.grid && z > 0.35) this.drawGrid(c, x0, y0, x1, y1);
    if (this.faults) this.drawFaults(c);
    if (this.plan) this.drawPlan(c, z);
    if (this.wps) this.drawWaypoints(c, z);
    this.drawSelection(c, z);
    if (this.band) this.drawBand(c, z);
    if (this.hover) this.drawHover(c, z);

    c.restore();
  },

  drawGrid(c, x0, y0, x1, y1) {
    c.strokeStyle = 'rgba(180,205,255,.10)';
    c.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      c.moveTo(x * TILE, y0 * TILE); c.lineTo(x * TILE, (y1 + 1) * TILE);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      c.moveTo(x0 * TILE, y * TILE); c.lineTo((x1 + 1) * TILE, y * TILE);
    }
    c.stroke();
  },

  drawFaults(c) {
    Check.tiles.forEach((level, k) => {
      const [x, y] = k.split(',').map(Number);
      c.fillStyle = level === 'error' ? 'rgba(255,95,86,.30)' : 'rgba(255,179,71,.26)';
      c.fillRect(x * TILE, y * TILE, TILE, TILE);
      c.strokeStyle = level === 'error' ? 'rgba(255,95,86,.9)' : 'rgba(255,179,71,.85)';
      c.strokeRect(x * TILE + .5, y * TILE + .5, TILE - 1, TILE - 1);
    });
  },

  /* ---- labels ----
     A knocked-out stroke behind the text was not enough: the labels sit over a
     drawn floor at whatever zoom you are at, and at "fit" on a phone thirteen
     room names at eleven screen pixels each ran into one another and read as
     one long word. They are chips now — a dark plate, the room's own tint — and
     a chip that would land on one already drawn simply does not draw. What you
     lose is the name of a room too small to hold its own name, which is a room
     you can see the shape of anyway. */
  CHIP_FONT: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  free(x, y, w, h) {
    return !this.taken.some(b =>
      x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]);
  },
  /* Returns false when it declined to draw, so a caller can skip the rest of
     whatever it was going to say. `fit` caps the chip: a label wider than the
     thing it names is a label pointing at the wrong thing. */
  chip(c, text, wx, wy, colour, z, fit) {
    const s = 11 / z, padx = 5 / z, pady = 3.5 / z;
    c.font = '600 ' + s + 'px ' + this.CHIP_FONT;
    c.textBaseline = 'top'; c.textAlign = 'left';
    const w = c.measureText(text).width + padx * 2, h = s + pady * 2;
    if (fit !== undefined && w > fit) return false;
    if (!this.free(wx, wy, w, h)) return false;
    this.taken.push([wx, wy, w, h]);
    c.fillStyle = 'rgba(8,11,17,.80)';
    c.beginPath(); c.roundRect(wx, wy, w, h, 3.5 / z); c.fill();
    c.globalAlpha = .55; c.strokeStyle = colour; c.lineWidth = 1 / z;
    c.beginPath(); c.roundRect(wx + .5 / z, wy + .5 / z, w - 1 / z, h - 1 / z, 3.5 / z); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = colour;
    c.fillText(text, wx + padx, wy + pady);
    return true;
  },

  /* Rooms, doors, counters and arrival points: the things that are structure
     rather than furniture, and that the rendered floor deliberately hides. */
  drawPlan(c, z) {
    Doc.rooms.forEach(rm => {
      const [ax, ay, bx, by] = rm.r;
      const tint = (ZONES[rm.z] || {}).tint || '#8d9bb5';
      const x = ax * TILE, y = ay * TILE;
      const w = (bx - ax + 1) * TILE, h = (by - ay + 1) * TILE;
      c.strokeStyle = tint; c.globalAlpha = .5;
      c.strokeRect(x + .5, y + .5, w - 1, h - 1);
      c.globalAlpha = 1;
    });
    /* Names after outlines, so a name is never drawn under the next room's
       border — and in their own pass so the collision test sees them all. */
    Doc.rooms.forEach(rm => {
      const [ax, ay, bx, by] = rm.r;
      const tint = (ZONES[rm.z] || {}).tint || '#8d9bb5';
      const name = (ZONES[rm.z] || {}).name || rm.z;
      const x = ax * TILE, y = ay * TILE;
      const w = (bx - ax + 1) * TILE, h = (by - ay + 1) * TILE;
      /* Centred in the room, which is where a plan puts a room's name, and
         measured against the room's own width so a cupboard stays unlabelled
         rather than wearing a label three times its size. */
      c.font = '600 ' + (11 / z) + 'px ' + this.CHIP_FONT;
      const cw = c.measureText(name).width + 10 / z;
      this.chip(c, name, x + (w - cw) / 2, y + h / 2 - 9 / z, tint, z, w - 4 / z);
    });

    Doc.doors.forEach(d => {
      c.fillStyle = d.locked ? '#ff5f56' : '#5ad48a';
      c.beginPath();
      c.moveTo((d.x + .5) * TILE, d.y * TILE + 4 / z);
      c.lineTo((d.x + 1) * TILE - 4 / z, (d.y + .5) * TILE);
      c.lineTo((d.x + .5) * TILE, (d.y + 1) * TILE - 4 / z);
      c.lineTo(d.x * TILE + 4 / z, (d.y + .5) * TILE);
      c.closePath(); c.fill();
    });

    Doc.counters.forEach(t => {
      c.strokeStyle = '#ffb347'; c.globalAlpha = .8;
      c.strokeRect(t.x * TILE + .5, t.y * TILE + .5, t.w * TILE - 1, TILE - 1);
      c.globalAlpha = 1;
    });

    for (const k in Doc.entries) {
      const e = Doc.entries[k];
      const wx = e[0] * TILE, wy = e[1] * TILE;
      c.fillStyle = '#4da3ff';
      c.beginPath(); c.arc(wx, wy, 5 / z, 0, 6.3); c.fill();
      c.strokeStyle = '#4da3ff'; c.lineWidth = 1 / z;
      c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx, wy - 16 / z);
      c.lineTo(wx + 12 / z, wy - 12 / z); c.lineTo(wx, wy - 8 / z); c.stroke();
      this.chip(c, k, wx + 7 / z, wy + 3 / z, '#4da3ff', z);
    }
  },

  /* Where the colleagues are sent. Their own layer, because there are thirty of
     them on the hub and drawn with the rooms they bury the floor plan. */
  drawWaypoints(c, z) {
    for (const k in Doc.waypoints) {
      const w = Doc.waypoints[k];
      const wx = (w[0] + .5) * TILE, wy = (w[1] + .5) * TILE;
      c.strokeStyle = '#b48cff'; c.lineWidth = 1.5 / z;
      c.beginPath(); c.arc(wx, wy, TILE * .3, 0, 6.3); c.stroke();
      c.beginPath();
      c.moveTo(wx - 4 / z, wy); c.lineTo(wx + 4 / z, wy);
      c.moveTo(wx, wy - 4 / z); c.lineTo(wx, wy + 4 / z);
      c.stroke();
      c.lineWidth = 1 / z;
      if (z > 0.5) this.chip(c, k, wx + TILE * .34, wy - 9 / z, '#b48cff', z);
    }
  },

  drawSelection(c, z) {
    const box = (x, y, w, h, colour) => {
      c.save();
      c.strokeStyle = colour; c.lineWidth = 2 / z;
      c.setLineDash([6 / z, 4 / z]);
      c.strokeRect(x * TILE - 1, y * TILE - 1, w * TILE + 2, h * TILE + 2);
      c.restore();
    };
    if (Sel.kind === 'object') {
      const o = Doc.objects[Sel.i];
      if (o) box(o.x, o.y, 1, 1, '#4da3ff');
    } else if (Sel.kind === 'room') {
      const rm = Doc.rooms[Sel.i];
      if (rm) box(rm.r[0], rm.r[1], rm.r[2] - rm.r[0] + 1, rm.r[3] - rm.r[1] + 1, '#b48cff');
    } else if (Sel.kind === 'door') {
      const d = Doc.doors[Sel.i];
      if (d) box(d.x, d.y, 1, 1, '#5ad48a');
    } else if (Sel.kind === 'counter') {
      const t = Doc.counters[Sel.i];
      if (t) box(t.x, t.y, t.w, 1, '#ffb347');
    } else if (Sel.kind === 'entry') {
      const e = Doc.entries[Sel.name];
      if (e) box(Math.floor(e[0]), Math.floor(e[1]), 1, 1, '#4da3ff');
    } else if (Sel.kind === 'wp') {
      const w = Doc.waypoints[Sel.name];
      if (w) box(w[0], w[1], 1, 1, '#b48cff');
    }
  },

  drawBand(c, z) {
    const b = this.band;
    const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
    const w = Math.abs(b.x1 - b.x0) + 1, h = Math.abs(b.y1 - b.y0) + 1;
    c.save();
    c.fillStyle = 'rgba(77,163,255,.18)';
    c.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
    c.strokeStyle = '#4da3ff'; c.lineWidth = 2 / z;
    c.strokeRect(x * TILE + .5, y * TILE + .5, w * TILE - 1, h * TILE - 1);
    /* How big it is, while you are dragging it out. A room is written down in
       tiles and drawn in pixels, and counting them off the grid is the one part
       of this that a number does better than a picture. */
    this.chip(c, w + ' × ' + h, x * TILE + 3 / z, y * TILE + 3 / z, '#cfe4ff', z);
    c.restore();
  },

  /* The tile under the pointer, and — for the tools where it is not obvious
     what is about to happen — what would happen to it. The object tool used to
     say what it was holding in a toast that had gone by the time you looked. */
  drawHover(c, z) {
    const t = this.hover;
    const tool = Tools.current;
    if (tool === 'erase') {
      c.fillStyle = 'rgba(255,95,86,.22)';
      c.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
    } else if (tool === 'object' && Tools.brush) {
      const b = Tools.brush;
      if (b.e) R.emoji(b.e, (t.x + .5) * TILE, (t.y + .55) * TILE, 22, .55);
    }
    c.strokeStyle = tool === 'erase' ? 'rgba(255,95,86,.85)' : 'rgba(255,255,255,.55)';
    c.lineWidth = 1.5 / z;
    c.strokeRect(t.x * TILE + .5, t.y * TILE + .5, TILE - 1, TILE - 1);
  }
};
