'use strict';
/* ---------------- THE VIEW FROM ABOVE ----------------
   The minimap in the corner and the map screen in the panel are the same
   picture at two sizes, and this file is the one that draws it.

   They were not, and that was most of what was wrong with both. The minimap
   rasterised the whole level into a 168×118 canvas with a scale per axis —
   `cv.width / MAPW` by `cv.height / MAPH` — which is correct for exactly one
   shape of map and a lie about every other. The office is 64×44 and came out
   about right. The town is 114×120 and came out HALF AS WIDE AGAIN as it is:
   a square of streets drawn as an oblong, which is a map of somewhere else.
   The outskirts is 384×384 and came out at four tenths of a pixel per tile,
   where a house is a third of a pixel, the dot for the player covers eight
   tiles, and the whole thing is a smear the colour of a field. It also cost
   58 ms to build, and it was thrown away and built again on every walk
   through a door and every turn of the season.

   Three ideas, and they are the whole file.

   ONE RASTER PER LEVEL, AT A PIXEL A TILE. Not at the size of the minimap —
   at the size of the map. A level is `MAPW` by `MAPH` pixels of ground, built
   once, kept, and drawn at whatever scale anybody asks for. The outskirts is
   a 384×384 image: 590 kB, built in a few milliseconds because it is laid
   down in RUNS rather than in tiles (a field is one fillRect per row, not
   four hundred), and never built twice for the same level in the same season.

   ONE PROJECTION, ASKED BY BOTH. `fit()` answers "where does tile x,y land on
   this canvas" for a given canvas and a given scale, and everything that draws
   a dot goes through what it returns. The minimap and the map screen cannot
   disagree about where you are, because neither of them works it out.

   AND A SCALE FLOOR. A map is a thing you read at a glance and there is a size
   below which there is nothing to read. Under `WHOLE` pixels a tile the whole
   map stops being worth showing whole, and the minimap shows a WINDOW around
   the player at `DETAIL` instead — the same rule, and the same clamp, that
   Cam.bound() uses on the world itself, because it is the same problem one
   level up.

   Nothing in here knows what a level IS. It asks World for what is at a tile,
   ZONES and SURFACES for what that looks like from above, and the catalogue
   for where a door goes — so a level nobody wrote down maps itself, which is
   the whole of why the estate comes out with its avenues named. */
const Atlas = {
  /* Pixels per tile, in CSS pixels, and the two numbers the scale rule is made
     of. Under nine tenths of a pixel a tile, a street is a smudge and a
     building is nothing — so a map that cannot be shown whole at WHOLE is
     shown as a window at DETAIL instead. DETAIL is a shade over a pixel and a
     half, which puts about a hundred tiles across the minimap: the width of
     the town, which is the distance somebody driving actually needs. */
  WHOLE: 0.9,
  DETAIL: 1.6,
  /* Rasters kept, keyed by level and season. Three, for the same reason
     Levels.BUDGET is two: it makes a there-and-back-again free — the town, the
     shop you walked into, and the road out of it — and it keeps the ceiling on
     memory something you can say out loud. */
  KEEP: 3,
  /* Mass with no room behind it: a building from above, on a map with no light
     on it. Dark enough that a street reads as the bright thing — which is what
     a street is from up here — and light enough that the edge of the map is
     visibly the edge of somewhere rather than the end of the canvas. */
  MASS: '#191e28',
  rasters: new Map(),
  _labels: null, _labelsFor: null,

  /* THE SEASON IS PART OF THE KEY, not a thing to invalidate. A verge is green
     in June and white in January and the map says so; keying by it means the
     turn of a season costs a rebuild the first time and nothing ever again,
     and it means nothing has to remember to throw anything away. */
  key() { return (World.level || '?') + '|' + (typeof Sky === 'undefined' ? '' : Sky.season()); },

  /* ---- the picture ---- */

  /* What a tile is, seen from above. The one place that decides, so the
     minimap, the map screen and anything else that ever wants it cannot come
     out different colours. */
  colourAt(x, y) {
    const z = World.zoneAt(x, y);
    const open = World.open(x, y);
    /* THE MASS IS DRAWN, and it is most of what makes this a map of a place
       rather than a diagram of the bits of it you are allowed to stand on. The
       old minimap skipped every solid tile, so a town came out as streets
       floating in the panel's own background and a wood came out as a field.
       A wall takes the colour its own room paints its walls — which is what
       turns a floor plan into a floor plan — and mass with no room behind it is
       a building, seen from above, in the one colour that is not any room's.
       The open surfaces are tested first, because a river is solid and is not
       a building: it has no zone at all, which is why it must carry its own
       `map` colour. See World.open(). */
    if (World.solid[y][x] && !open) return (z && ZONES[z] && ZONES[z].wall) || this.MASS;
    if (!z && !open) return null;
    /* A surface paints itself, because a minimap of a town in which the roads
       are the same colour as the pavements is a minimap of a car park. `map`
       and not `floor`: a surface's floor colour is a TINT multiplied through a
       texture, and there is no texture down here to multiply. */
    const s = World.surfAt(x, y);
    const S = s && SURFACES[s];
    /* And the seasonal ones paint themselves four ways, for the same reason
       the tile does: a green verge on the map in January is a lie about a
       white one. */
    const seasonal = S && S.maps && S.maps[typeof Sky === 'undefined' ? 'autumn' : Sky.season()];
    /* An open surface that declares no `map` has nothing to paint and no zone
       to fall back on. Nothing is drawn rather than something guessed at: a
       wrong colour on a map is worse than a gap in one. */
    return seasonal || (S && S.map) || (z ? ZONES[z].floor : null) || null;
  },

  /* The level as an image, one pixel per tile, built once and kept.

     IN RUNS, and that is the difference between three milliseconds and sixty.
     A fillRect per tile is a hundred and forty-seven thousand calls on the
     outskirts, nearly all of them the same colour as the one before — four
     hundred acres of field is four hundred identical rectangles a row. The
     scan below carries the colour it is drawing along the row and only emits
     when it changes, so a field is one call per row, and the cost stops being
     about the size of the map and starts being about how complicated it is. */
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
     Where a tile lands, for a canvas of this size at this scale. Everything
     that draws anything on either map goes through what this returns, which is
     the whole reason the two of them agree.

       px = ox + (tx - vx) * k

     `vx, vy, vw, vh` is the WINDOW: which part of the map is on show, in
     tiles. It is the whole map whenever the whole map is worth showing, and a
     box around the player when it is not — clamped to the edges, and centred
     rather than clamped when the map is smaller than the window, which is
     exactly what Cam.bound does with the world and for exactly the same
     reason: a minimum above a maximum pins everything into a corner and leaves
     the rest as void. */
  fit(w, h, k, cx, cy) {
    const vw = Math.min(MAPW, w / k), vh = Math.min(MAPH, h / k);
    const span = (c, v, m) => (m <= v ? (m - v) / 2 : clamp(c - v / 2, 0, m - v));
    return {
      k, vw, vh,
      vx: span(cx, vw, MAPW), vy: span(cy, vh, MAPH),
      /* Whatever is left over after the window is centred, so a map narrower
         than its canvas sits in the middle of it rather than in the corner. */
      ox: (w - Math.min(w, MAPW * k)) / 2,
      oy: (h - Math.min(h, MAPH * k)) / 2
    };
  },
  /* The scale to draw a whole map of this many tiles at, in a canvas this big,
     and whether it is worth doing whole at all. */
  whole(w, h) { return Math.min(w / MAPW, h / MAPH); },

  /* Tile → canvas, and the one that matters: a thing standing at a world pixel.
     `at()` takes tiles because that is what an object is written in, and
     `atPx()` takes world pixels because that is what anything that moves is
     measured in, and neither of them is allowed to know how the other works. */
  at(f, tx, ty) { return { x: f.ox + (tx - f.vx) * f.k, y: f.oy + (ty - f.vy) * f.k }; },
  atPx(f, px, py) { return this.at(f, px / TILE, py / TILE); },
  /* Is this tile on the part of the map being shown. The margin is a tile,
     because a dot half off the edge is still half on it. */
  seen(f, tx, ty) { return tx >= f.vx - 1 && tx <= f.vx + f.vw + 1 && ty >= f.vy - 1 && ty <= f.vy + f.vh + 1; },

  /* ---- the minimap ---- */

  /* Called four times a second by the loop, and it costs one drawImage plus
     whatever is moving. Everything expensive about it — the ground — was done
     once, when the level was first stood on. */
  hud() {
    const cv = $('#minimap'); if (!cv || !World.level) return;
    /* NOT WHEN IT IS NOT THERE. The stylesheet takes the minimap off a phone —
       the bottom corners of that screen are where the thumbs are, and one of
       them is the throttle — and a map drawn four times a second into a canvas
       with `display:none` over it is work nobody can see. It is also the one
       case where the ratio below cannot be worked out, because a hidden
       element has no client width. The map screen is the phone's map. */
    if (!cv.clientWidth) return;
    const c = cv.getContext('2d');
    /* The canvas is in DEVICE pixels — R.init sized it for the screen's own
       ratio so the map is not a blurry postage stamp on a phone — and the two
       scale constants are in CSS pixels, because that is the size a thing
       actually looks. One multiply, here, and nothing below this line has to
       think about it again. */
    const dpr = Math.max(1, cv.width / cv.clientWidth);
    const w = cv.width, h = cv.height;
    const whole = this.whole(w, h);
    const detail = whole >= this.WHOLE * dpr ? whole : this.DETAIL * dpr;
    const f = this.fit(w, h, detail, P.x / TILE, P.y / TILE);

    c.clearRect(0, 0, w, h);
    /* Smoothing only when shrinking. A map drawn bigger than a pixel a tile is
       a grid of little squares and should look like one; a map drawn smaller
       than that is throwing rows away, and averaging them is kinder than
       dropping them. */
    c.imageSmoothingEnabled = f.k < 1;
    const img = this.raster();
    c.drawImage(img, f.vx, f.vy, f.vw, f.vh, f.ox, f.oy, f.vw * f.k, f.vh * f.k);
    c.imageSmoothingEnabled = true;

    this.pins(c, f, dpr, false);

    /* What is on screen, which is the one thing a minimap can say that a map
       screen cannot. */
    const a = this.atPx(f, Cam.x, Cam.y);
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = dpr;
    c.strokeRect(a.x, a.y, Cam.w / TILE * f.k, Cam.h / TILE * f.k);
  },

  /* Everything on a map that is not the ground, at either size. `big` is the
     map screen, which has room for a bigger dot and for the things a glance
     does not need. */
  pins(c, f, s, big) {
    const dot = (x, y, col, r) => {
      if (!this.seen(f, x, y)) return;
      const p = this.at(f, x, y);
      c.fillStyle = col; c.fillRect(p.x - r * s, p.y - r * s, r * 2 * s, r * 2 * s);
    };
    /* The doors first and under everything, because they are furniture rather
       than news. A ringing phone is news.

       AND ONLY WHERE A DOOR IS BIGGER THAN THE DOT FOR IT. Under two pixels a
       tile a doorway is smaller than its own marker, and a town with two
       hundred doors on it comes out as a rash rather than as a town — the
       markers stop being where the doors are and start being a texture. The
       office is drawn at five pixels a tile and keeps them; the town at one
       does not, and loses nothing, because at that size the thing you are
       reading a minimap for is the shape of the streets. */
    const fine = f.k >= 2 * s;
    for (const o of World.objects) {
      if (o.ringing) dot(o.x + .5, o.y + .5, '#ffb347', big ? 2.4 : 1.6);
      else if (!fine && !big) continue;
      else if (o.kind === 'door') dot(o.x + .5, o.y + .5, '#8d9bb5', big ? 1.6 : 1);
      else if (!big && (o.kind === 'coffee' || o.kind === 'printer')) dot(o.x + .5, o.y + .5, 'rgba(255,179,71,.7)', 1);
    }
    for (const car of (World.cars || [])) {
      if (car === Cars.driving) continue;            /* that dot is the player's */
      /* A car you can drive is worth a dot at any size — there are two of them
         in the game and one of them is the whole afternoon. The other sixty are
         parked scenery, and at a pixel a tile sixty grey dots over a town is
         the same rash the doors were. */
      if (!car.canDrive && !fine && !big) continue;
      dot(car.x / TILE, car.y / TILE, car.canDrive ? 'rgba(90,212,138,.9)' : 'rgba(200,205,215,.6)', big ? 1.8 : 1.3);
    }
    for (const n of NPCM.list) {
      dot(n.x / TILE, n.y / TILE, R.questMark(n) ? '#ff5f56' : 'rgba(180,140,255,.85)', big ? 2 : 1.3);
    }
    if (Guide.tx !== null) dot(Guide.tx + .5, Guide.ty + .5, '#5ad48a', big ? 3 : 2);
    this.you(c, f, s, big);
  },

  /* You, and which way you are facing — because a dot on a map answers half of
     the question somebody looking at a map is asking. The heading comes off the
     car when there is one, since a car has a nose and the person in it does
     not. `dir` is a sprite row: 0 north, 1 west, 2 south, 3 east. */
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

  /* ---- the map screen ----
     The same picture with the room to say what things are called. */

  /* Where to write a zone's name, derived rather than written down — which it
     has to be, because the estate out east has eleven of them and nobody typed
     any of it.

     The CENTROID of a zone's floor, snapped to the nearest tile that is
     actually in that zone. The snap is the whole of it: the centre of mass of
     a street that bends, or of the ring of pavement round the minster, is a
     point in the middle of a building. A name written there is a name on the
     wrong thing. */
  labels() {
    if (this._labels && this._labelsFor === this.key()) return this._labels;
    const sum = new Map();
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      if (World.solid[y][x]) continue;
      const z = World.zoneAt(x, y); if (!z) continue;
      let s = sum.get(z);
      if (!s) sum.set(z, s = { z, n: 0, sx: 0, sy: 0, x: 0, y: 0, d: Infinity, x0: x, x1: x, y0: y, y1: y });
      s.n++; s.sx += x; s.sy += y;
      /* And how much room the place has to be named in. A name is written
         inside the thing it names or not at all — see names(). */
      if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x;
      if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
    }
    for (const s of sum.values()) { s.cx = s.sx / s.n; s.cy = s.sy / s.n; }
    /* And the snap, in one more pass over the map rather than one per zone. */
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      if (World.solid[y][x]) continue;
      const z = World.zoneAt(x, y); if (!z) continue;
      const s = sum.get(z);
      const d = (x - s.cx) * (x - s.cx) + (y - s.cy) * (y - s.cy);
      if (d < s.d) { s.d = d; s.x = x + .5; s.y = y + .5; }
    }
    /* Biggest first, because when two names cannot both fit the bigger place
       is the one somebody is more likely to be looking for. */
    this._labels = [...sum.values()].sort((a, b) => b.n - a.n);
    this._labelsFor = this.key();
    return this._labels;
  },

  /* Every way off this level that the player can see from here, and where each
     one goes — asked of the catalogue rather than written down, so a door that
     is moved or a level that is renamed carries its own label with it. */
  waysOut() {
    const links = (World.def && World.def.links) || [];
    if (!links.length) return [];
    const name = to => { const d = Levels.def(to); return (d && d.name) || to; };
    const size = to => { const d = Levels.def(to); return d ? d.w * d.h : 0; };
    const out = [];
    for (const o of World.objects) {
      /* The object that names the link, by `via` or by being the handler the
         link is called after. That is nearly all of them. */
      let mine = links.filter(k => k.via === o.via || k.via === o.use);
      /* And the two that are one piece of furniture offering several — see
         EXITS in data/world.js, which is where that fact lives. */
      if (!mine.length) {
        const ex = EXITS.find(e => e.kind === o.kind);
        if (ex) mine = links.filter(k => ex.vias.indexOf(k.via) >= 0);
      }
      /* AND NOT THE ONE THAT IS NOT ON THE FLOOR PLAN. A level may declare
         itself a secret and name what stops it being one; until then the way
         down to it is a square of carpet like the carpet round it, which is
         what it is on the screen as well. See LEVELS.basement. */
      mine = mine.filter(l => { const d = Levels.def(l.to); return !(d && d.secret) || G.achievements[d.secret]; });
      if (!mine.length) continue;
      out.push({
        x: o.x + .5, y: o.y + .5,
        /* ONE WAY OUT, ONE NAME. A door goes somewhere and says where; a lift
           goes to four floors and a stairwell to three, and writing all of them
           out puts CALLHALL SERVICES · GROUND FLOOR · CALLHALL SERVICES · FIFTH
           FLOOR across the middle of a floor plan. A fixture that serves
           several ways out is called what it is called — which is what is
           written on it in a real building, and for the same reason. */
        name: mine.length > 1 ? (o.name || 'A way out') : name(mine[0].to),
        big: Math.max.apply(null, mine.map(l => size(l.to)))
      });
    }
    /* BIGGEST FIRST, and it is the only ranking this map has any business
       using: when two labels cannot both fit, the one that gets written is the
       one that leads somewhere there is more of. On the High Street that is the
       road out of the town over the door of a vape shop, which is the right way
       round and was not decided by anybody. */
    return out.sort((a, b) => b.big - a.big);
  },

  /* Drawn into the canvas the panel puts in front of it. Sized here rather
     than in the stylesheet: a map that is laid out in CSS pixels and drawn in
     device pixels is a map with soft edges on every phone in the world. */
  panel() {
    const cv = $('#mapCv'); if (!cv || !World.level) return;
    const box = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(160, Math.round(box.width * dpr)), h = Math.max(120, Math.round(box.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    /* A margin, in tiles, so the edge of the map is not the edge of the canvas
       and a name written at the top of it has somewhere to go. */
    const PAD = 10 * dpr;
    const k = Math.min((w - PAD * 2) / MAPW, (h - PAD * 2) / MAPH);
    const f = this.fit(w - PAD * 2, h - PAD * 2, k, MAPW / 2, MAPH / 2);
    f.ox += PAD; f.oy += PAD;

    c.clearRect(0, 0, w, h);
    c.imageSmoothingEnabled = k < 1;
    c.drawImage(this.raster(), f.ox, f.oy, MAPW * k, MAPH * k);
    c.imageSmoothingEnabled = true;

    /* The edge of the map, because a map with no edge on it reads as a picture
       of somewhere that carries on. */
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = dpr;
    c.strokeRect(f.ox - .5, f.oy - .5, MAPW * k + 1, MAPH * k + 1);

    this.exitPins(c, f, dpr);
    this.legends(c, f, dpr);
    this.pins(c, f, dpr, true);
    this.scaleBar(c, f, dpr, w, h);
  },

  /* EVERYTHING WITH A NAME ON IT, IN ONE PASS AND IN ONE ORDER.
     The rooms, the streets and the fields on one side and the ways out on the
     other are not two questions about what to write down, they are one — and
     the order they are answered in is the only editorial judgement this map
     makes. It is made by SIZE: how many tiles a place has, and how many tiles
     there are at the other end of a way out. Biggest first, and anything that
     will not fit beside what is already written is left as a marker.

     That one rule puts the road east to four hundred acres over the door of a
     vape shop, and Corven Way over both, and nobody decided any of it. A map
     of a high street with twenty-two doors on it cannot write twenty-two names
     across four streets; what it can do is be honest about which of them it
     dropped. */
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
        /* A NAME GOES INSIDE THE THING IT NAMES, measured against the place's
           own box rather than against its area: THE FIRE ESCAPE across a
           stairwell two tiles wide is written over the training room next door,
           and a label on the wrong room is worse than a room with no label on
           it. A place too small to be named at this size is a place you can see
           all of anyway. */
        const z = L.zone;
        if (wpx > (z.x1 - z.x0 + 1) * f.k || L.px > (z.y1 - z.y0 + 1) * f.k) continue;
        const p = this.at(f, z.x, z.y); x = p.x; y = p.y;
      } else {
        /* Above the marker, and below it when the marker is at the top of the
           map: a label off the top of a canvas is not a label. */
        const p = this.at(f, L.exit.x, L.exit.y);
        y = p.y + (p.y > f.oy + L.px * 2.2 ? -L.px * 1.5 : L.px * 1.5);
        x = clamp(p.x, f.ox + wpx / 2, f.ox + MAPW * f.k - wpx / 2);
      }
      if (!this.room(placed, x - wpx / 2 - 2 * s, y - L.px * .6, wpx + 4 * s, L.px * 1.2)) continue;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      this.write(c, L.text, x, y, s, L.fill);
    }
  },
  /* Is there room here, and if there is, take it. One list for the street names
     and the ways out together, because a map does not care which of the two was
     written over the other. */
  room(placed, x, y, w, h) {
    if (placed.some(q => !(x > q.x + q.w || x + w < q.x || y > q.y + q.h || y + h < q.y))) return false;
    placed.push({ x, y, w, h });
    return true;
  },
  /* Every word on this map, written the same way: a dark outline under it, so
     a street name is legible over tarmac and over a field. */
  write(c, text, x, y, s, fill) {
    c.lineWidth = 3 * s; c.strokeStyle = 'rgba(8,11,17,.85)'; c.lineJoin = 'round';
    c.strokeText(text, x, y);
    c.fillStyle = fill; c.fillText(text, x, y);
  },
  /* The ways out, as markers, all of them and before anything is written: which
     of them gets its name is legends()' business, but a door is a door whether
     or not there was room to say where it goes. */
  exitPins(c, f, s) {
    for (const e of this.waysOut()) {
      const p = this.at(f, e.x, e.y);
      c.beginPath(); c.arc(p.x, p.y, 4 * s, 0, 6.29);
      c.fillStyle = 'rgba(77,163,255,.95)'; c.fill();
      c.lineWidth = 1.6 * s; c.strokeStyle = 'rgba(8,11,17,.8)'; c.stroke();
    }
  },
  /* How big the place is, in metres, because a tile is about a metre and
     otherwise nothing on this screen has a size at all. Rounded down to
     something a person would say — 50, 100, 200 — rather than to whatever the
     canvas happens to make a hundred pixels worth. */
  scaleBar(c, f, s, w, h) {
    const want = Math.min(140 * s, MAPW * f.k * .45);
    const steps = [10, 20, 25, 50, 100, 200, 250, 500];
    let m = steps[0];
    for (const v of steps) if (v * f.k <= want) m = v;
    const len = m * f.k;
    const x = f.ox, y = h - 9 * s;
    /* On a backing, because the bottom-left corner of a map is a field as often
       as it is the background, and a white rule on a pale field is not a rule. */
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

  /* ---- the loop's one call ----
     Four times a second, whichever of the two is in front of the player. The
     map screen is live because the world behind it is: a panel does not stop
     the shift, and a map of where everybody was a minute ago is a map of
     nowhere. */
  tick() {
    if (typeof Panels !== 'undefined' && Panels.on && Panels.tab === 'map') { this.panel(); return; }
    if (!Game.overlayUp()) this.hud();
  }
};
