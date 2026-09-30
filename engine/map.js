'use strict';
/* ---------------- The map: the minimap and the map screen ----------------
   One picture at two sizes. Each level is rasterised once at a pixel a tile
   (in runs, so a field is one fillRect a row), keyed by level and season and
   kept. fit() is the one projection both sizes draw through, so they cannot
   disagree. Below WHOLE pixels a tile the minimap shows a window round you at
   DETAIL instead, as Cam.bound() does for the world. */
const Atlas = {
  /* Pixels per tile (CSS): the whole map below WHOLE is unreadable, so a window at DETAIL instead. */
  WHOLE: 0.9,
  DETAIL: 1.6,
  /* Rasters kept, least recently used dropped. */
  KEEP: 3,
  /* Mass with no room behind it: a building from above. */
  MASS: '#191e28',
  rasters: new Map(),
  _labels: null, _labelsFor: null,

  /* The season is part of the key, so a new season never has to invalidate anything. */
  key() { return (World.level || '?') + '|' + Sky.season(); },

  /* ---- the picture ---- */

  /* What a tile is, from above; the one place that decides. */
  colourAt(x, y) {
    const z = World.zoneAt(x, y);
    const open = World.open(x, y);
    /* Walls take their room's wall colour and roomless mass is a building. Open
       surfaces (a river) are solid but not buildings, so they are asked first. */
    if (World.solid[y][x] && !open) return (z && ZONES[z] && ZONES[z].wall) || this.MASS;
    if (!z && !open) return null;
    /* A surface paints itself with `map` (its `floor` is a tint for a texture). */
    const s = World.surfAt(x, y);
    const S = s && SURFACES[s];
    const seasonal = S && S.maps && S.maps[Sky.season()];
    /* An open surface without `map` draws nothing rather than a guess. */
    return seasonal || (S && S.map) || (z ? ZONES[z].floor : null) || null;
  },

  /* The level as an image, a pixel a tile, emitted in runs of one colour. */
  raster() {
    const key = this.key();
    const had = this.rasters.get(key);
    if (had) { this.rasters.delete(key); this.rasters.set(key, had); return had; }   /* touch: LRU */

    const b = document.createElement('canvas');
    b.width = Math.max(1, MAPW); b.height = Math.max(1, MAPH);
    const c = b.getContext('2d');
    for (let y = 0; y < MAPH; y++) {
      let run = null, from = 0;
      for (let x = 0; x <= MAPW; x++) {
        const col = x < MAPW ? this.colourAt(x, y) : null;
        if (col === run) continue;
        if (run) { c.fillStyle = run; c.fillRect(from, y, x - from, 1); }
        run = col; from = x;
      }
    }
    this.rasters.set(key, b);
    /* Oldest first, and never the one just made. */
    while (this.rasters.size > this.KEEP) this.rasters.delete(this.rasters.keys().next().value);
    return b;
  },

  /* ---- the projection ----
     Where a tile lands on a canvas at scale k: px = ox + (tx - vx) * k. The
     window (vx, vy, vw, vh) is the whole map, or a box round the player clamped
     to the edges, centred when the map is smaller than the window. */
  fit(w, h, k, cx, cy) {
    const vw = Math.min(MAPW, w / k), vh = Math.min(MAPH, h / k);
    const span = (c, v, m) => (m <= v ? (m - v) / 2 : clamp(c - v / 2, 0, m - v));
    return {
      k, vw, vh,
      vx: span(cx, vw, MAPW), vy: span(cy, vh, MAPH),
      /* Leftover space, so a narrow map is centred. */
      ox: (w - Math.min(w, MAPW * k)) / 2,
      oy: (h - Math.min(h, MAPH * k)) / 2
    };
  },
  whole(w, h) { return Math.min(w / MAPW, h / MAPH); },

  /* Tiles, or world pixels. */
  at(f, tx, ty) { return { x: f.ox + (tx - f.vx) * f.k, y: f.oy + (ty - f.vy) * f.k }; },
  atPx(f, px, py) { return this.at(f, px / TILE, py / TILE); },
  /* On show, with a tile of margin. */
  seen(f, tx, ty) { return tx >= f.vx - 1 && tx <= f.vx + f.vw + 1 && ty >= f.vy - 1 && ty <= f.vy + f.vh + 1; },

  /* ---- the minimap ---- */

  /* Four times a second: one drawImage plus what moves. */
  hud() {
    const cv = $('#minimap'); if (!cv || !World.level) return;
    /* Hidden on phones (the thumbs live there); a hidden canvas has no width anyway. */
    if (!cv.clientWidth) return;
    const c = cv.getContext('2d');
    /* The canvas is in device pixels, the scales in CSS pixels. */
    const dpr = Math.max(1, cv.width / cv.clientWidth);
    const w = cv.width, h = cv.height;
    const whole = this.whole(w, h);
    const detail = whole >= this.WHOLE * dpr ? whole : this.DETAIL * dpr;
    const f = this.fit(w, h, detail, P.x / TILE, P.y / TILE);

    c.clearRect(0, 0, w, h);
    /* Smooth only when shrinking. */
    c.imageSmoothingEnabled = f.k < 1;
    const img = this.raster();
    c.drawImage(img, f.vx, f.vy, f.vw, f.vh, f.ox, f.oy, f.vw * f.k, f.vh * f.k);
    c.imageSmoothingEnabled = true;

    this.pins(c, f, dpr, false);

    /* What is on screen. */
    const a = this.atPx(f, Cam.x, Cam.y);
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = dpr;
    c.strokeRect(a.x, a.y, Cam.w / TILE * f.k, Cam.h / TILE * f.k);
  },

  /* Everything but the ground; `big` is the map screen. */
  pins(c, f, s, big) {
    const dot = (x, y, col, r) => {
      if (!this.seen(f, x, y)) return;
      const p = this.at(f, x, y);
      c.fillStyle = col; c.fillRect(p.x - r * s, p.y - r * s, r * 2 * s, r * 2 * s);
    };
    /* Doors under everything, and only once a door is bigger than its dot, or a
       town becomes a rash of markers. */
    const fine = f.k >= 2 * s;
    for (const o of World.objects) {
      if (o.ringing) dot(o.x + .5, o.y + .5, '#ffb347', big ? 2.4 : 1.6);
      else if (!fine && !big) continue;
      else if (o.kind === 'door') dot(o.x + .5, o.y + .5, '#8d9bb5', big ? 1.6 : 1);
      else if (!big && (o.kind === 'coffee' || o.kind === 'printer')) dot(o.x + .5, o.y + .5, 'rgba(255,179,71,.7)', 1);
    }
    for (const car of (World.cars || [])) {
      if (car === Cars.driving) continue;            /* that dot is the player's */
      /* A car you can drive always gets a dot; parked scenery only when there is room. */
      if (!car.canDrive && !fine && !big) continue;
      dot(car.x / TILE, car.y / TILE, car.canDrive ? 'rgba(90,212,138,.9)' : 'rgba(200,205,215,.6)', big ? 1.8 : 1.3);
    }
    for (const n of NPCM.list) {
      dot(n.x / TILE, n.y / TILE, R.questMark(n) ? '#ff5f56' : 'rgba(180,140,255,.85)', big ? 2 : 1.3);
    }
    if (Guide.tx !== null) dot(Guide.tx + .5, Guide.ty + .5, '#5ad48a', big ? 3 : 2);
    this.you(c, f, s, big);
  },

  /* You, and which way you face (the car's nose when driving). `dir`: 0 N, 1 W, 2 S, 3 E. */
  you(c, f, s, big) {
    const p = this.atPx(f, P.x, P.y);
    const r = (big ? 7 : 3.2) * s;
    const a = Cars.driving ? Cars.driving.a
      : P.dir === 0 ? -Math.PI / 2 : P.dir === 1 ? Math.PI : P.dir === 3 ? 0 : Math.PI / 2;
    c.save();
    c.translate(p.x, p.y); c.rotate(a);
    c.beginPath();
    c.moveTo(r, 0); c.lineTo(-r * .72, r * .72); c.lineTo(-r * .3, 0); c.lineTo(-r * .72, -r * .72);
    c.closePath();
    c.fillStyle = '#fff'; c.fill();
    c.strokeStyle = 'rgba(11,15,22,.85)'; c.lineWidth = s; c.stroke();
    c.restore();
  },

  /* ---- the map screen: the same picture, with names ---- */

  /* Where to name each zone: the centroid of its floor, snapped to a tile in
     the zone, since a bent street's centre of mass is inside a building. */
  labels() {
    if (this._labels && this._labelsFor === this.key()) return this._labels;
    const sum = new Map();
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      if (World.solid[y][x]) continue;
      const z = World.zoneAt(x, y); if (!z) continue;
      let s = sum.get(z);
      if (!s) sum.set(z, s = { z, n: 0, sx: 0, sy: 0, x: 0, y: 0, d: Infinity, x0: x, x1: x, y0: y, y1: y });
      s.n++; s.sx += x; s.sy += y;
      /* The room it has, for names() to fit the name inside. */
      if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x;
      if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
    }
    for (const s of sum.values()) { s.cx = s.sx / s.n; s.cy = s.sy / s.n; }
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      if (World.solid[y][x]) continue;
      const z = World.zoneAt(x, y); if (!z) continue;
      const s = sum.get(z);
      const d = (x - s.cx) * (x - s.cx) + (y - s.cy) * (y - s.cy);
      if (d < s.d) { s.d = d; s.x = x + .5; s.y = y + .5; }
    }
    /* Biggest first: it wins when two names cannot both fit. */
    this._labels = [...sum.values()].sort((a, b) => b.n - a.n);
    this._labelsFor = this.key();
    return this._labels;
  },

  /* Every way off this level and where it goes, asked of the catalogue. */
  waysOut() {
    const links = (World.def && World.def.links) || [];
    if (!links.length) return [];
    const name = to => { const d = Levels.def(to); return (d && d.name) || to; };
    const size = to => { const d = Levels.def(to); return d ? d.w * d.h : 0; };
    const out = [];
    for (const o of World.objects) {
      /* By `via`, or by being the handler the link is named after. */
      let mine = links.filter(k => k.via === o.via || k.via === o.use);
      /* Or a fixture offering several (EXITS in data/world.js). */
      if (!mine.length) {
        const ex = EXITS.find(e => e.kind === o.kind);
        if (ex) mine = links.filter(k => ex.vias.indexOf(k.via) >= 0);
      }
      /* A `secret` level's way in is unmarked until its achievement. */
      mine = mine.filter(l => { const d = Levels.def(l.to); return !(d && d.secret) || G.achievements[d.secret]; });
      if (!mine.length) continue;
      out.push({
        x: o.x + .5, y: o.y + .5,
        /* A fixture serving several ways out is called by its own name. */
        name: mine.length > 1 ? (o.name || 'A way out') : name(mine[0].to),
        big: Math.max.apply(null, mine.map(l => size(l.to)))
      });
    }
    /* Biggest destination first. */
    return out.sort((a, b) => b.big - a.big);
  },

  /* Sized here in device pixels, or every edge is soft. */
  panel() {
    const cv = $('#mapCv'); if (!cv || !World.level) return;
    const box = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(160, Math.round(box.width * dpr)), h = Math.max(120, Math.round(box.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    /* A margin, so a name at the top has somewhere to go. */
    const PAD = 10 * dpr;
    const k = Math.min((w - PAD * 2) / MAPW, (h - PAD * 2) / MAPH);
    const f = this.fit(w - PAD * 2, h - PAD * 2, k, MAPW / 2, MAPH / 2);
    f.ox += PAD; f.oy += PAD;

    c.clearRect(0, 0, w, h);
    c.imageSmoothingEnabled = k < 1;
    c.drawImage(this.raster(), f.ox, f.oy, MAPW * k, MAPH * k);
    c.imageSmoothingEnabled = true;

    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = dpr;
    c.strokeRect(f.ox - .5, f.oy - .5, MAPW * k + 1, MAPH * k + 1);

    this.exitPins(c, f, dpr);
    this.legends(c, f, dpr);
    this.pins(c, f, dpr, true);
    this.scaleBar(c, f, dpr, w, h);
  },

  /* Every name in one pass, biggest place first; anything that will not fit
     beside what is written stays a marker. */
  legends(c, f, s) {
    const out = [];
    const zoneSize = Math.max(9 * s, Math.min(15 * s, f.k * 4));
    const exitSize = 11 * s;
    for (const z of this.labels()) {
      const Z = ZONES[z.z]; if (!Z || !Z.name) continue;
      out.push({ size: z.n, text: Z.name, px: zoneSize, fill: 'rgba(232,238,246,.95)', zone: z });
    }
    for (const e of this.waysOut()) {
      out.push({ size: e.big, text: e.name, px: exitSize, fill: '#8fc4ff', exit: e });
    }
    out.sort((a, b) => b.size - a.size);

    const placed = [];
    for (const L of out) {
      c.font = '600 ' + L.px.toFixed(0) + 'px ' + MAP_FAMILY;
      const wpx = c.measureText(L.text).width;
      let x, y;
      if (L.zone) {
        /* A name goes inside what it names, or not at all. */
        const z = L.zone;
        if (wpx > (z.x1 - z.x0 + 1) * f.k || L.px > (z.y1 - z.y0 + 1) * f.k) continue;
        const p = this.at(f, z.x, z.y); x = p.x; y = p.y;
      } else {
        /* Above its marker, or below it at the top edge. */
        const p = this.at(f, L.exit.x, L.exit.y);
        y = p.y + (p.y > f.oy + L.px * 2.2 ? -L.px * 1.5 : L.px * 1.5);
        x = clamp(p.x, f.ox + wpx / 2, f.ox + MAPW * f.k - wpx / 2);
      }
      if (!this.room(placed, x - wpx / 2 - 2 * s, y - L.px * .6, wpx + 4 * s, L.px * 1.2)) continue;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      this.write(c, L.text, x, y, s, L.fill);
    }
  },
  /* Room here? Take it. */
  room(placed, x, y, w, h) {
    if (placed.some(q => !(x > q.x + q.w || x + w < q.x || y > q.y + q.h || y + h < q.y))) return false;
    placed.push({ x, y, w, h });
    return true;
  },
  /* Every word with a dark outline, legible over tarmac and field alike. */
  write(c, text, x, y, s, fill) {
    c.lineWidth = 3 * s; c.strokeStyle = 'rgba(8,11,17,.85)'; c.lineJoin = 'round';
    c.strokeText(text, x, y);
    c.fillStyle = fill; c.fillText(text, x, y);
  },
  /* Every way out as a marker; legends() decides which get names. */
  exitPins(c, f, s) {
    for (const e of this.waysOut()) {
      const p = this.at(f, e.x, e.y);
      c.beginPath(); c.arc(p.x, p.y, 4 * s, 0, 6.29);
      c.fillStyle = 'rgba(77,163,255,.95)'; c.fill();
      c.lineWidth = 1.6 * s; c.strokeStyle = 'rgba(8,11,17,.8)'; c.stroke();
    }
  },
  /* A scale bar in metres (a tile is about one), rounded to something sayable. */
  scaleBar(c, f, s, w, h) {
    const want = Math.min(140 * s, MAPW * f.k * .45);
    const steps = [10, 20, 25, 50, 100, 200, 250, 500];
    let m = steps[0];
    for (const v of steps) if (v * f.k <= want) m = v;
    const len = m * f.k;
    const x = f.ox, y = h - 9 * s;
    /* On a backing, legible over a pale field. */
    c.fillStyle = 'rgba(8,11,17,.55)';
    c.fillRect(x - 6 * s, y - 14 * s, len + 52 * s, 20 * s);
    c.strokeStyle = 'rgba(232,238,246,.8)'; c.lineWidth = 2 * s;
    c.beginPath();
    c.moveTo(x, y - 4 * s); c.lineTo(x, y); c.lineTo(x + len, y); c.lineTo(x + len, y - 4 * s);
    c.stroke();
    c.font = '600 ' + (10 * s).toFixed(0) + 'px ' + MAP_FAMILY;
    c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillStyle = 'rgba(232,238,246,.8)';
    c.fillText(m + ' m', x + len + 6 * s, y);
  },

  /* ---- four times a second, whichever map is in front ---- */
  tick() {
    if (Panels.on && Panels.tab === 'map') { this.panel(); return; }
    if (!Game.overlayUp()) this.hud();
  }
};
