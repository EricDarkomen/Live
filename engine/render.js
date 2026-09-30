'use strict';
/* Kinds whose art is symmetrical enough to mirror for variety. By hand: a
   mirrored copier or sofa is the same piece drawn wrong. */
const FLIPPABLE = new Set(['box', 'plant', 'chair', 'bin', 'cab']);

const R = {
  cv: null, ctx: null, dpr: 1, emojiScale: 1, animate: true, t: 0,
  /* The opening hides name tags and markers. Owned here, since editor.html
     loads this file but not boot.js (Cine). */
  cinema: false,
  init() {
    this.cv = $('#view'); this.ctx = this.cv.getContext('2d');
    this.resize(); window.addEventListener('resize', () => this.resize());
    /* Fullscreen and a retracting address bar change the drawable area; only the
       first reliably fires `resize`, so visualViewport catches the other. */
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', () => this.resize());
      /* iOS retracts the bar as you scroll, and reports that as a scroll on
         the visual viewport rather than a resize. */
      visualViewport.addEventListener('scroll', () => this.resize());
    }
    document.addEventListener('fullscreenchange', () => this.resize());
    document.addEventListener('webkitfullscreenchange', () => this.resize());
    /* Render the minimap at device resolution so it isn't a blurry postage
       stamp on a HiDPI screen. */
    const mm = $('#minimap');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    mm.style.width = mm.width + 'px'; mm.style.height = mm.height + 'px';
    mm.width = Math.round(mm.width * dpr); mm.height = Math.round(mm.height * dpr);
  },
  /* Pin the app to the height a phone shows. The stylesheet's 100dvh covers
     most; this is exact where dvh means the largest size. */
  fitViewport() {
    const app = $('#app'); if (!app) return;
    const vv = window.visualViewport;
    /* Not while typing: the soft keyboard shrinks the viewport too. */
    const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.nodeName);
    if (!vv || typing) { app.style.height = ''; return; }
    app.style.height = Math.round(vv.height) + 'px';
  },
  resize() {
    this.fitViewport();
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.max(320, r.width * this.dpr);
    this.cv.height = Math.max(240, r.height * this.dpr);
    Cam.w = this.cv.width / this.dpr; Cam.h = this.cv.height / this.dpr;
    Cam.snap();
  },
  _fontCache: new Map(),
  emojiFont(size) {
    const px = Math.round(size * this.emojiScale * 2) / 2;
    let f = this._fontCache.get(px);
    if (!f) { f = px + 'px ' + EMOJI_FONT; this._fontCache.set(px, f); }
    return f;
  },
  emoji(e, x, y, size, alpha) {
    const c = this.ctx;
    c.font = this.emojiFont(size);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    /* Chromium applies fill alpha to colour emoji, and shadow() leaves a
       translucent fill: set it opaque every time. */
    c.fillStyle = '#fff';
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillText(e, x, y);
    if (alpha !== undefined) c.globalAlpha = 1;
  },
  /* ---- the focus rim ----
     A rim that follows the thing's own shape. `draw` runs off-canvas and only
     its shadow lands: a flat silhouette in `colour` at eight offsets round the
     real position, then one blurred pass in `glow`. Shadows follow alpha and
     read no pixels back, so file:// is fine; the cost is nine draws of one
     object. Shadow offsets are device pixels, untouched by the transform, so
     the draw is shifted in device space to match. Call before drawing the
     thing itself, which then covers the silhouette's middle. */
  RIM_W: 2,
  rim(draw, colour, glow) {
    const c = this.ctx, m = c.getTransform(), O = 1e4;
    const w = Math.hypot(m.a, m.b) * this.RIM_W;
    c.save();
    c.setTransform(m.a, m.b, m.c, m.d, m.e - O, m.f);
    c.shadowBlur = 0; c.shadowColor = colour;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      c.shadowOffsetX = O + Math.cos(a) * w; c.shadowOffsetY = Math.sin(a) * w;
      draw();
    }
    c.shadowColor = glow; c.shadowBlur = w * 8; c.shadowOffsetX = O; c.shadowOffsetY = 0;
    draw();
    c.restore();
  },
  RIM_PERSON: ['#ff8c1a', 'rgba(255,140,26,.8)'],
  RIM_THING: ['#7cc0ff', 'rgba(77,163,255,.75)'],
  /* A radial gradient is expensive to build; bake each colour once and blit it. */
  glow(colour, r) {
    const key = colour + r;
    this._glows = this._glows || new Map();
    let g = this._glows.get(key);
    if (!g) {
      g = document.createElement('canvas');
      g.width = g.height = r * 2;
      const gc = g.getContext('2d');
      const grad = gc.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, colour.replace('ALPHA', '.6'));
      grad.addColorStop(0.5, colour.replace('ALPHA', '.22'));
      grad.addColorStop(1, colour.replace('ALPHA', '0'));
      gc.fillStyle = grad; gc.fillRect(0, 0, r * 2, r * 2);
      this._glows.set(key, g);
    }
    return g;
  },
  /* ---- Baked surfaces ----
     Each surface is drawn once into a small canvas, then blitted. Baked at 2x
     for devicePixelRatio. Textures seed off the cache key, never Math.random(),
     so a resize does not change the floor. */
  _rand(seed) {
    /* Deterministic, because a texture that is baked with Math.random() is a
       texture that changes every time the window is resized. */
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  },
  _hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  /* t > 0 towards white, t < 0 towards black. Cached: the wall pass asks the
     same colours every tile of every frame. */
  _shades: new Map(),
  shade(hex, t) {
    const key = hex + t;
    let out = this._shades.get(key);
    if (out) return out;
    const n = parseInt(hex.slice(1), 16), to = t > 0 ? 255 : 0, a = Math.abs(t);
    const ch = s => Math.round(((n >> s) & 255) + (to - ((n >> s) & 255)) * a);
    out = 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
    if (this._shades.size > 4096) this._shades.clear();
    this._shades.set(key, out);
    return out;
  },
  /* A fade to clear across a rectangle, strongest on `side` ('n','s','w','e'),
     blitted from a strip baked once per colour. `mid` is an optional 55% stop
     (the tide uses it). */
  _fades: new Map(),
  fade(c, x, y, w, h, side, colour, mid) {
    const key = side + colour + (mid || '');
    let st = this._fades.get(key);
    if (!st) {
      const L = 64, vert = side === 'n' || side === 's';
      st = document.createElement('canvas');
      st.width = vert ? 1 : L; st.height = vert ? L : 1;
      const g = st.getContext('2d');
      const from = side === 'n' || side === 'w' ? 0 : L;
      const gr = vert ? g.createLinearGradient(0, from, 0, L - from) : g.createLinearGradient(from, 0, L - from, 0);
      gr.addColorStop(0, colour);
      if (mid) gr.addColorStop(.55, mid);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, st.width, st.height);
      this._fades.set(key, st);
    }
    c.drawImage(st, x, y, w, h);
  },
  /* Throw the baked tiles away. The game never changes a zone at runtime; the
     editor does, and the preview must follow. */
  rebake() {
    if (this._tiles) this._tiles.clear();
    /* And the ground chunks, every one of which is made of those tiles. */
    this._ground = null;
    this._coast = null;
    this._baseZone = null;
    /* Baked vehicles too (carArt()), for the same reason. */
    if (this._cars) this._cars.clear();
    /* And which baked tile each roof tile was holding, since every one of them
       is a key into the map that was just emptied. */
    this._roofOf = null; this._roofLevel = null;
    /* And the roof plots, derived from the repainted map. */
    this._plots = null; this._plotsLevel = null;
  },
  _bake(key, draw) {
    this._tiles = this._tiles || new Map();
    let cv = this._tiles.get(key);
    if (cv) return cv;
    const S = 2, N = TILE * S;
    cv = document.createElement('canvas'); cv.width = cv.height = N;
    draw(cv.getContext('2d'), N, this._rand(this._hash(key)));
    this._tiles.set(key, cv);
    return cv;
  },
  /* Which sprite an object wears: its kind's, or one of four keyed by season.
     One place, so a new seasonal object is a table entry. */
  spriteOf(f, o) {
    if (!f) return undefined;
    /* `tones`: colourways picked by the tile's hash (the doors' hash), so a row of
       shops varies and nothing changes when the camera moves. */
    if (f.tones && o) return f.tones[this.toneOf(o.x, o.y) % f.tones.length];
    /* Lit from inside once the streetlights are on; outdoors only. */
    if (f.lit && !World.indoors() && Sky.lampsOn()) return f.lit;
    return f.sprites ? f.sprites[Sky.season()] : f.sprite;
  },

  floorTile(z, v, s) {
    /* The kit's floor multiplied through the zone's colour, baked once. Pick floor
       cells by tiling a candidate and checking for seams; most atlas cells are
       edge pieces. `s` is a SURFACE (World.surf), what this tile is made of where
       it differs from its room, and it wins. */
    const S = s && SURFACES[s];
    /* A surface may have seasonal tiles (SURFACES.grass). The kit tile's name is
       in the bake key, so a new season re-bakes on its own. */
    const kit = S ? (S.tiles ? S.tiles[Sky.season()] : S.tile) : ZONES[z] && ZONES[z].tile;
    const floor = S ? S.floor : ZONES[z] && ZONES[z].floor;
    const alt = S ? S.alt : ZONES[z] && ZONES[z].alt;
    if (Tiles.has(kit)) {
      return this._bake('k' + (S ? 's' + s : z) + v + kit, (g, N) => {
        const r = Tiles.rects[kit], src = Tiles.imgFor(kit);
        g.imageSmoothingEnabled = false;
        g.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, N, N);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = this.shade(v ? floor : alt, .55);
        g.fillRect(0, 0, N, N);
        /* `lift` screens light back in: multiply can only darken. */
        if (S && S.lift) { g.globalCompositeOperation = 'screen'; g.fillStyle = S.lift; g.fillRect(0, 0, N, N); }
        g.globalCompositeOperation = 'source-over';
        /* A seam along the top and left makes a floor read as laid; poured surfaces
           go without. */
        if (!S) {
          g.fillStyle = 'rgba(0,0,0,.10)';
          g.fillRect(0, 0, N, 1); g.fillRect(0, 0, 1, N);
        }
      });
    }
    /* An open surface (sea, rock) has no zone under it, so ZONES[z] may be
       undefined: `floor` and `base` come from S first. */
    const base = v ? floor : alt, surf = S ? S.surf : (ZONES[z] && ZONES[z].surf);
    return this._bake('f' + (S ? 's' + s : z) + v, (g, N, rnd) => {
      g.fillStyle = base; g.fillRect(0, 0, N, N);
      const speck = (n, light, dark) => {
        for (let i = 0; i < n; i++) {
          g.fillStyle = rnd() > .5 ? light : dark;
          g.fillRect(Math.floor(rnd() * N), Math.floor(rnd() * N), 2, 2);
        }
      };
      switch (surf) {
        case 'tile': {
          /* Toilets and nowhere else: 300mm tiles, four to a floor tile, laid
             by somebody who was paid by the tile. */
          const h = N / 2;
          for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
            g.fillStyle = this.shade(base, .05 + ((i + j) & 1) * .05);
            g.fillRect(i * h + 2, j * h + 2, h - 4, h - 4);
            g.fillStyle = 'rgba(255,255,255,.07)';
            g.fillRect(i * h + 2, j * h + 2, h - 4, 2);
          }
          g.fillStyle = 'rgba(0,0,0,.34)';
          g.fillRect(0, 0, N, 2); g.fillRect(0, 0, 2, N);
          g.fillRect(N / 2 - 1, 0, 2, N); g.fillRect(0, N / 2 - 1, N, 2);
          break;
        }
        case 'vinyl':
          /* Sheet vinyl: no seams anywhere, and a fleck in it chosen in 1994
             specifically so that nothing shows up on it. */
          for (let i = 0; i < 130; i++) {
            const a = rnd();
            g.fillStyle = a > .66 ? 'rgba(255,255,255,.06)' : a > .33 ? 'rgba(0,0,0,.09)' : 'rgba(255,214,150,.05)';
            g.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 5, 2);
          }
          break;
        case 'stone': {
          /* The lobby, and only the lobby. Whatever this cost, it was spent
             where visitors could see it. */
          g.fillStyle = this.shade(base, .05);
          g.fillRect(3, 3, N - 6, N - 6);
          g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            let x = rnd() * N, y = 0; g.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += (rnd() - .5) * 20; y += N / 4; g.lineTo(x, y); }
            g.stroke();
          }
          g.fillStyle = 'rgba(0,0,0,.34)'; g.fillRect(0, 0, N, 3); g.fillRect(0, 0, 3, N);
          g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 3, N, 2); g.fillRect(3, 0, 2, N);
          break;
        }
        case 'raised': {
          /* An access floor. The panels lift out, which is where six years of
             cable has gone. */
          g.fillStyle = 'rgba(0,0,0,.40)'; g.fillRect(0, 0, N, N);
          g.fillStyle = this.shade(base, .06); g.fillRect(3, 3, N - 6, N - 6);
          g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(3, 3, N - 6, 2);
          g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(3, N - 5, N - 6, 2);
          speck(40, 'rgba(255,255,255,.05)', 'rgba(0,0,0,.07)');
          g.fillStyle = 'rgba(0,0,0,.40)';
          [[9, 9], [N - 9, 9], [9, N - 9], [N - 9, N - 9]].forEach(([x, y]) => {
            g.beginPath(); g.arc(x, y, 2.4, 0, 6.3); g.fill();
          });
          break;
        }
        case 'concrete':
          for (let i = 0; i < 9; i++) {
            g.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.028)' : 'rgba(0,0,0,.06)';
            g.beginPath();
            g.ellipse(rnd() * N, rnd() * N, 7 + rnd() * 16, 6 + rnd() * 12, rnd() * 3, 0, 6.3);
            g.fill();
          }
          speck(110, 'rgba(255,255,255,.07)', 'rgba(0,0,0,.10)');
          break;
        case 'rock': {
          /* The cliff: angular facets in greys, since tinting a brick-red kit texture
             cannot desaturate it. */
          g.fillStyle = this.shade(base, -.12); g.fillRect(0, 0, N, N);
          for (let i = 0; i < 7; i++) {
            const cx = rnd() * N, cy = rnd() * N, r = 6 + rnd() * 14;
            g.fillStyle = rnd() > .5
              ? this.shade(base, .10 + rnd() * .10) : this.shade(base, -.10 - rnd() * .12);
            const sides = 5 + Math.floor(rnd() * 3);
            g.beginPath();
            for (let side = 0; side < sides; side++) {
              const a = (side / sides) * 6.28 + rnd() * .6, rr = r * (.7 + rnd() * .5);
              const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
              side ? g.lineTo(px, py) : g.moveTo(px, py);
            }
            g.closePath(); g.fill();
          }
          /* Fault lines, not a grid — the thing that tells a cliff apart
             from a crazy-paved patio is that the cracks do not repeat. */
          g.strokeStyle = 'rgba(0,0,0,.32)'; g.lineWidth = 1.4;
          for (let i = 0; i < 4; i++) {
            let x = rnd() * N, y = rnd() * N;
            g.beginPath(); g.moveTo(x, y);
            for (let s = 0; s < 3; s++) { x += (rnd() - .5) * 18; y += (rnd() - .5) * 18; g.lineTo(x, y); }
            g.stroke();
          }
          g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, 0, N, 2);
          break;
        }
        default: {
          /* Carpet tiles laid with the pile at ninety degrees, so one colour still has
             grain. */
          g.globalAlpha = .05; g.strokeStyle = '#fff'; g.lineWidth = 1;
          for (let i = 0; i < 26; i++) {
            const a = rnd() * N, b = rnd() * N, len = 6 + rnd() * 15;
            g.beginPath();
            if (v) { g.moveTo(a, b); g.lineTo(a + len, b); } else { g.moveTo(a, b); g.lineTo(a, b + len); }
            g.stroke();
          }
          g.globalAlpha = 1;
          speck(80, 'rgba(255,255,255,.045)', 'rgba(0,0,0,.07)');
          g.fillStyle = 'rgba(0,0,0,.17)'; g.fillRect(0, 0, N, 2); g.fillRect(0, 0, 2, N);
          g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, 2, N, 2); g.fillRect(2, 0, 2, N);
        }
      }
    });
  },
  wallTile(z, v) {
    /* The kit's wall, tinted per room like floorTile(). Toilets and the fire
       escape keep their own. */
    const kw = ZONES[z] && ZONES[z].wtile;
    if (Tiles.has(kw)) {
      return this._bake('kw' + z + v + kw, (g, N) => {
        const r = Tiles.rects[kw], src = Tiles.imgFor(kw);
        g.imageSmoothingEnabled = false;
        g.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, N, N);
        g.globalCompositeOperation = 'multiply';
        /* Lifted off the flat wall colour, or a dark tint turns the texture black. */
        /* A third, not two-thirds. The wall colours are dark on purpose and a
           wall the same value as the floor loses the edge of the room. */
        g.fillStyle = this.shade(ZONES[z].wall, v ? 0.34 : 0.28);
        g.fillRect(0, 0, N, N);
        g.globalCompositeOperation = 'source-over';
      });
    }
    return this._bake('w' + z + v, (g, N, rnd) => {
      const base = (ZONES[z] && ZONES[z].wall) || '#141a24';
      g.fillStyle = base; g.fillRect(0, 0, N, N);
      switch (ZONES[z] && ZONES[z].wsurf) {
        case 'tile': {
          /* Glazed brick, half bond, to about shoulder height in every
             institutional toilet ever built. */
          const rows = 3, h = N / rows, w = N / 2;
          for (let r = 0; r < rows; r++) {
            const off = (r & 1) ? w / 2 : 0;
            for (let x = -w; x < N + w; x += w) {
              g.fillStyle = this.shade(base, .11);
              g.fillRect(x + off + 2, r * h + 2, w - 4, h - 4);
              g.fillStyle = 'rgba(255,255,255,.07)';
              g.fillRect(x + off + 2, r * h + 2, w - 4, 2);
            }
          }
          break;
        }
        case 'block': {
          /* Painted breeze block. Painted, repainted, and painted again over
             the notice that used to be screwed to it. */
          const rows = 2, h = N / rows;
          for (let r = 0; r < rows; r++) {
            const off = (r & 1) ? N / 2 : 0;
            for (let x = -N; x < N * 2; x += N) {
              g.fillStyle = this.shade(base, .07);
              g.fillRect(x + off + 2, r * h + 2, N - 4, h - 4);
            }
          }
          for (let i = 0; i < 60; i++) {
            g.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.07)';
            g.fillRect(rnd() * N, rnd() * N, 3, 3);
          }
          break;
        }
        default:
          /* Plaster, painted the colour of the room, with the mottling of a
             wall that has been touched up in patches for twenty years. */
          for (let i = 0; i < 7; i++) {
            g.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.022)' : 'rgba(0,0,0,.05)';
            g.beginPath();
            g.ellipse(rnd() * N, rnd() * N, 10 + rnd() * 22, 8 + rnd() * 18, 0, 0, 6.3);
            g.fill();
          }
          /* Every wall at trolley height in this building has one of these. */
          if (v) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(rnd() * N * .5, N * .58, 12 + rnd() * 14, 3); }
      }
    });
  },
  /* ---- the roofs ----
     Everything solid outdoors that no floor can see is roof: block interiors
     and the town past the map edge. From above, the lines between buildings are
     the town, so a roof is drawn in three steps:
     1. Cut the mass into plots (roofPlots()): derived, since levels do not say
        where buildings end.
     2. Pick the corner-matched tile: thirteen per material from
        art/sprites/roofs.png (tools/sheets/roofs.mjs), chosen by which of the
        tile's four corners share its plot. That puts a mitred coping round every
        building.
     3. Put something on it (roofDeco()), baked into the same tile. */

  /* Roof materials as a weighted bag, the mix of an English market town. Uneven
     odds read as a town rather than a chessboard. */
  ROOF_MATS: [
    'slate', 'slate', 'slate', 'slate', 'slate', 'slate',
    'lead', 'lead', 'lead',
    'felt', 'felt',
    'pantile', 'pantile',
    'oxblood',
  ],
  /* The thirteen, indexed by corner bits (1 NW, 2 NE, 4 SW, 8 SE) set when that
     corner shares the plot. A name is the side the coping is on (`n`: the plot
     continues south). 0 (a one-tile plot) and the diagonals 6 and 9 take the
     field tile: no honest coping exists for them. */
  ROOF_WANG: [
    'mid', 'se', 'sw', 's', 'ne', 'e', 'mid', 'in.se',
    'nw', 'mid', 'w', 'in.sw', 'n', 'in.ne', 'in.nw', 'mid',
  ],
  /* Rooftop junk, weighted; most of a roof is roof. */
  ROOF_DECO: ['vent', 'vent', 'light', 'light', 'plant', 'tank', 'aerial', 'lift', 'stack'],

  /* The plots, cut from the mass rather than a grid (a grid made a quilt):
     1. Blocks: flood-fill the roof mass; each connected piece is a block. One
        pass per level.
     2. Party walls run across the block's short axis: the frontage is the long
        side and buildings run back from it.
     3. Back to back: a block nine or more deep with frontages both sides is
        split once down the middle.
     Cut spacing comes off a hash of the block, so it is stable and differs per
     block. Cached per level and dropped with the baked tiles. */
  roofPlots() {
    if (this._plots && this._plotsLevel === World.level && this._plotsStamp === World.objects.length)
      return this._plots;
    this._plotsLevel = World.level; this._plotsStamp = World.objects.length;
    const id = new Int32Array(MAPW * MAPH);
    const grp = new Int32Array(MAPW * MAPH);
    const mat = new Map();
    /* The blocks. `seen` is the block each tile is in, 0 for "not roof". */
    const seen = new Int32Array(MAPW * MAPH);
    let block = 0;
    const cells = [];
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      const i = y * MAPW + x;
      if (seen[i] || !this.roofMass(x, y)) continue;
      block++;
      const mine = [];
      const stack = [i];
      seen[i] = block;
      while (stack.length) {
        const j = stack.pop(), jx = j % MAPW, jy = (j - jx) / MAPW;
        mine.push(j);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = jx + dx, ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= MAPW || ny >= MAPH) continue;
          /* The fill does not cross into the map's rim, or every border-touching block
             would join into one roof through it. */
          if (this.onRim(nx, ny) !== this.onRim(jx, jy)) continue;
          const k = ny * MAPW + nx;
          if (seen[k] || !this.roofMass(nx, ny)) continue;
          seen[k] = block; stack.push(k);
        }
      }
      cells.push(mine);
    }
    /* And the units inside each block. */
    for (let b = 0; b < cells.length; b++) {
      const mine = cells[b];
      let x0 = MAPW, y0 = MAPH, x1 = -1, y1 = -1;
      for (const j of mine) {
        const jx = j % MAPW, jy = (j - jx) / MAPW;
        if (jx < x0) x0 = jx; if (jx > x1) x1 = jx;
        if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      /* The frontage is the long side; the party walls are square to it. */
      const alongX = w >= h;
      const run = alongX ? w : h, depth = alongX ? h : w;
      /* Party walls go between the shops: halfway between one door and the next
         (data/levels.js exits), so each shop has one roof the width of its frontage.
         Per rank: rank 0 takes doors on the block's north (or west) edge, rank 1 its
         south (or east). A block with no doors is cut every three to five tiles off
         its hash. */
      const doors = (World.objects || []).filter(o => o.kind === 'exit');
      const cutsFor = rank => {
        const nearEdge = (rank === 1)
          ? (alongX ? o => o.y >= y1 && o.y <= y1 + 3 : o => o.x >= x1 && o.x <= x1 + 3)
          : (alongX ? o => o.y <= y0 && o.y >= y0 - 3 : o => o.x <= x0 && o.x >= x0 - 3);
        const at = doors
          .filter(o => nearEdge(o))
          .map(o => (alongX ? o.x : o.y) - (alongX ? x0 : y0))
          .filter(v => v >= 0 && v < run)
          .sort((a, c) => a - c);
        /* Two doors make one party wall; one door makes none, and a single
           shop the width of the block is a perfectly good building. */
        const out = [];
        for (let k = 1; k < at.length; k++) {
          const mid = Math.round((at[k - 1] + at[k]) / 2);
          if (mid > 0 && mid < run && mid !== out[out.length - 1]) out.push(mid);
        }
        if (at.length) {
          /* Doorless stretches longer than eight tiles are subdivided on the hash, four
             to seven apart; known boundaries win. */
          const rnd2 = this._rand(this._hash('gap' + b + ':' + x0 + ',' + y0 + ':' + rank));
          const edges = [0].concat(out, [run]);
          const filled = out.slice();
          for (let k = 1; k < edges.length; k++) {
            const from = edges[k - 1], to = edges[k];
            if (to - from <= 8) continue;
            for (let o = from + 4 + Math.floor(rnd2() * 4); o <= to - 4; o += 4 + Math.floor(rnd2() * 4))
              filled.push(o);
          }
          return { cuts: filled.sort((a, c) => a - c), doors: true };
        }
        const rnd = this._rand(this._hash('blk' + b + ':' + x0 + ',' + y0 + ':' + rank));
        const hashed = [];
        for (let o = 3 + Math.floor(rnd() * 3); o <= run - 3; o += 3 + Math.floor(rnd() * 3)) hashed.push(o);
        return { cuts: hashed, doors: false };
      };
      /* One terrace or two back to back is decided by frontages, not depth: doors on
         only one side make one terrace running all the way through. */
      const north = cutsFor(0), south = cutsFor(1);
      const both = depth >= 9 && north.doors && south.doors;
      const split = both ? Math.floor(depth / 2) : -1;
      const one = north.doors ? north : south.doors ? south : north;
      const cuts = both ? [north.cuts, south.cuts] : [one.cuts, null];
      for (const j of mine) {
        const jx = j % MAPW, jy = (j - jx) / MAPW;
        const along = alongX ? jx - x0 : jy - y0;
        const across = alongX ? jy - y0 : jx - x0;
        const rank = (split >= 0 && across >= split) ? 1 : 0;
        const mine2 = cuts[rank] || cuts[0];
        let unit = 0;
        while (unit < mine2.length && mine2[unit] <= along) unit++;
        id[j] = ((b + 1) << 10) | (unit << 1) | rank;
      }
      /* Material: a terrace is roofed at once, so the bag is drawn once per block,
         and each unit has about one chance in seven of having been redone. Decided
         at the block's and unit's north-west corners (smallest row-major index), so
         a unit straddling a `roofs:` rect is one material. */
      const first = new Map();
      let blockFirst = Infinity;
      for (const j of mine) {
        const plot = id[j];
        if (!first.has(plot) || j < first.get(plot)) first.set(plot, j);
        if (j < blockFirst) blockFirst = j;
      }
      const bfx = blockFirst % MAPW, bfy = (blockFirst - bfx) / MAPW;
      /* The rim is not a terrace: roofed per unit from the bag for where it is, so
         one draw does not colour every edge of the world. */
      const rim = this.onRim(bfx, bfy);
      const blockBag = this.roofMatsAt(bfx, bfy);
      const blockMat = blockBag[this._hash('terrace' + b + ':' + bfx + ',' + bfy) % blockBag.length];
      for (const [plot, j] of first) {
        const jx = j % MAPW, jy = (j - jx) / MAPW;
        const bag = this.roofMatsAt(jx, jy);
        if (rim) { mat.set(plot, bag[this._hash('rim' + plot) % bag.length]); continue; }
        /* A redone unit never matches its block: the block's material is left out. */
        const redone = (this._hash('redone' + plot) % 7) === 0;
        const others = bag.filter(m => m !== blockMat);
        mat.set(plot, (redone && others.length)
          ? others[this._hash('newroof' + plot) % others.length]
          : blockMat);
      }
      /* Roof plane, not building: the group is block plus material, so a terrace
         under one covering has one coping with party walls drawn on it, and a
         redone unit gets its own. `id` stays the unit. */
      /* A run of six or more units with no exception gets one, chosen stably. */
      const units = [...first.keys()];
      if (!rim && units.length >= 6 && units.every(k => mat.get(k) === blockMat)) {
        const pick = units[this._hash('atleastone' + b + ':' + bfx + ',' + bfy) % units.length];
        const others = blockBag.filter(m => m !== blockMat);
        if (others.length) mat.set(pick, others[this._hash('newroof' + pick) % others.length]);
      }
      for (const j of mine) {
        const m = mat.get(id[j]);
        /* On the rim every unit is its own roof, so the group is the unit. */
        grp[j] = rim ? ((b + 1) << 14) | id[j]
                     : ((b + 1) << 4) | (blockBag.indexOf(m) + 1);
      }
    }
    return (this._plots = { id, grp, mat });
  },
  roofPlot(x, y) {
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return 0;
    return this.roofPlots().id[y * MAPW + x];
  },
  /* The last tile before the edge of the drawn world. */
  onRim(x, y) { return x === 0 || y === 0 || x === MAPW - 1 || y === MAPH - 1; },
  /* A level's `roofs: [{ m: [...], r: [x1,y1,x2,y2] }]` overrides ROOF_MATS for a
     region (as `surfaces:` does): this map is two towns. Asked at the plot's
     north-west corner, so palette boundaries fall on party walls. */
  roofMatsAt(x, y) {
    const list = World.def && World.def.roofs;
    if (list) {
      for (const p of list) {
        const r = p.r;
        if (x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3] && p.m && p.m.length) return p.m;
      }
    }
    return this.ROOF_MATS;
  },
  /* A wall whose face is visible: solid, with walkable floor directly below. */
  wallFace(x, y) {
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return false;
    if (!World.solid[y][x]) return false;
    return y + 1 < MAPH && !World.solid[y + 1][x] && !!World.zone[y + 1][x];
  },
  /* Roof: solid, outdoors, with no walkable tile beside it. Off the map is not
     roof, so the map edge gets a parapet. */
  roofAt(x, y) {
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return false;
    if (!World.solid[y][x] || World.open(x, y)) return false;
    if (this.wallFace(x, y)) return false;
    /* The tile above a wall face is the wall's top half (walls are drawn two tiles
       high), not roof; the coping lands on the true top of the wall. */
    if (this.wallFace(x, y + 1)) return false;
    if (x + 1 < MAPW && !World.solid[y][x + 1]) return false;
    if (x > 0 && !World.solid[y][x - 1]) return false;
    if (y > 0 && !World.solid[y - 1][x]) return false;
    return true;
  },
  /* ---- the verge ----
     roofAt() insets the mass by a tile on the flanks and back, which drew every
     building's outer ring as bare wall. A roof overhangs its walls, so the skirt
     is that ring: a tile with real roof beside it (field walls have none, so
     stay walls). Diagonals count, for the corners. The front eaves are handled
     in the wall band. */
  roofSkirt(x, y) {
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return false;
    if (!World.solid[y][x] || World.open(x, y)) return false;
    /* The frontage and the top half of it are the wall you can see the face
       of. They are not skirt, for the reason roofAt() excludes them. */
    if (this.wallFace(x, y) || this.wallFace(x, y + 1)) return false;
    if (this.roofAt(x, y)) return false;
    /* The roof it laps must be a building's: at least two tiles across. A crossing
       of two one-tile walls has no roof neighbour, so it does not grow slate. */
    const roof = (ax, ay) => this.roofAt(ax, ay)
      && (this.roofAt(ax - 1, ay) || this.roofAt(ax + 1, ay)
        || this.roofAt(ax, ay - 1) || this.roofAt(ax, ay + 1));
    if (roof(x - 1, y) || roof(x + 1, y) || roof(x, y - 1) || roof(x, y + 1)) return true;
    return roof(x - 1, y - 1) || roof(x + 1, y - 1)
      || roof(x - 1, y + 1) || roof(x + 1, y + 1);
  },
  /* Roof for everything downstream: the plane plus its skirt. The plot fill,
     corner matching and wall band all use this. */
  roofMass(x, y) { return this.roofAt(x, y) || this.roofSkirt(x, y); },
  /* One roof tile, plot resolved. Null until the sheet decodes (the wall pass
     then uses roofBaked()). */
  roofTile(x, y) {
    /* Cached per tile: picking one asks the plots of nine tiles, and nothing
       changes while a level is up. Dropped with the baked tiles. */
    const i = y * MAPW + x;
    if (!this._roofOf || this._roofLevel !== World.level) { this._roofLevel = World.level; this._roofOf = []; }
    const hit = this._roofOf[i];
    if (hit) return hit;
    const plots = this.roofPlots();
    const plot = plots.id[i], group = plots.grp[i];
    const mat = plots.mat.get(plot) || this.ROOF_MATS[0];
    if (!Tiles.has('roof.' + mat + '.mid')) return null;
    /* Same roof plane, not same building (see `grp` in roofPlots()). */
    const same = (ax, ay) => this.roofMass(ax, ay) && plots.grp[ay * MAPW + ax] === group;
    /* A CORNER is inside the plot when all three tiles touching it are — this
       one is by definition, so it is the other three that decide. */
    const c = (dx, dy) => (same(x + dx, y) && same(x, y + dy) && same(x + dx, y + dy)) ? 1 : 0;
    const bits = c(-1, -1) | (c(1, -1) << 1) | (c(-1, 1) << 2) | (c(1, 1) << 3);
    const key = this.ROOF_WANG[bits];
    /* Weathering and junk on field tiles only; edges are mostly coping. */
    if (key !== 'mid') return (this._roofOf[i] = this.roofBake(mat, key, 0, '', ''));
    /* A sliver: `mid` without all four corners is a one-tile-deep plot. No
       coping piece fits, so it gets party-wall lines on the sides the plot does
       not continue. */
    if (bits !== 15) {
      let cut = '';
      if (!same(x, y - 1)) cut += 'n';
      if (!same(x, y + 1)) cut += 's';
      if (!same(x - 1, y)) cut += 'w';
      if (!same(x + 1, y)) cut += 'e';
      return (this._roofOf[i] = this.roofBake(mat, 'mid', 0, '', cut));
    }
    const h = this._hash('roof' + x + ',' + y);
    const deco = (h % 7) ? '' : this.ROOF_DECO[(h >>> 5) % this.ROOF_DECO.length];
    /* Party walls inside a plane: two dark pixels on the boundary edge, from both
       sides. One boundary in five is hidden (roofs done together), decided per
       boundary so it is consistent along its length. */
    let party = '';
    const wallOn = (dx, dy, letter) => {
      const ax = x + dx, ay = y + dy;
      if (!this.roofMass(ax, ay)) return;
      const k = ay * MAPW + ax;
      if (plots.grp[k] !== group || plots.id[k] === plot) return;
      const lo = Math.min(plot, plots.id[k]), hi = Math.max(plot, plots.id[k]);
      if ((this._hash('party' + lo + '|' + hi) % 5) === 0) return;
      party += letter;
    };
    wallOn(0, -1, 'n'); wallOn(0, 1, 's'); wallOn(-1, 0, 'w'); wallOn(1, 0, 'e');
    return (this._roofOf[i] = this.roofBake(mat, key, h & 1, deco, party));
  },
  /* Crop, weathering and junk baked together: one canvas per combination
     (about 130 on a busy level), one blit per tile. */
  roofBake(mat, key, v, deco, cut) {
    const name = 'roof.' + mat + '.' + key;
    return this._bake('R' + name + v + deco + '|' + cut, (g, N, rnd) => {
      const r = Tiles.rects[name];
      g.imageSmoothingEnabled = false;
      g.drawImage(Tiles.imgFor(name), r[0], r[1], r[2], r[3], 0, 0, N, N);
      if (key === 'mid') {
        /* Weathering to break the 32px repeat: a few soft patches, two variants. */
        for (let i = 0; i < 4; i++) {
          g.fillStyle = rnd() > .45 ? 'rgba(0,0,0,.09)' : 'rgba(184,196,170,.055)';
          g.beginPath();
          g.ellipse(rnd() * N, rnd() * N, 5 + rnd() * 13, 4 + rnd() * 10, rnd() * 3, 0, 6.3);
          g.fill();
        }
        if (deco) this.roofDeco(g, N, rnd, deco, mat);
      }
      /* The party wall last: gutter dark and a damp course line on the requested
         sides. */
      if (cut) {
        const u = N / 32, edge = (a, b, w, h) => {
          g.fillStyle = 'rgba(12,14,19,.80)'; g.fillRect(a, b, w, h);
        };
        if (cut.includes('n')) edge(0, 0, N, 2 * u);
        if (cut.includes('s')) edge(0, N - 2 * u, N, 2 * u);
        if (cut.includes('w')) edge(0, 0, 2 * u, N);
        if (cut.includes('e')) edge(N - 2 * u, 0, 2 * u, N);
        g.fillStyle = 'rgba(255,255,255,.10)';
        if (cut.includes('n')) g.fillRect(0, 2 * u, N, u);
        if (cut.includes('w')) g.fillRect(2 * u, 0, u, N);
      }
    });
  },
  /* Rooftop junk, drawn in canvas (no kit has any), lit from the north-west with
     shadows to the south-east. */
  roofDeco(g, N, rnd, kind, mat) {
    const u = N / 32;                       /* one source pixel, at bake scale */
    const shadow = (x, y, w, h) => { g.fillStyle = 'rgba(0,0,0,.34)'; g.fillRect(x + 2 * u, y + 2 * u, w, h); };
    /* A box with a lit top edge and a dark south face: the whole vocabulary of
       everything up here, so it is one function and five callers. */
    const box = (x, y, w, h, top, side) => {
      shadow(x, y, w, h);
      g.fillStyle = side; g.fillRect(x, y, w, h);
      g.fillStyle = top; g.fillRect(x, y, w, h - 3 * u);
      g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x, y, w, u);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y + h - u, w, u);
    };
    switch (kind) {
      case 'vent': {
        /* A mushroom cowl on a stub of pipe. There are four of these on every
           flat roof in England and not one of them is straight. */
        const x = (6 + rnd() * 14) * u, y = (8 + rnd() * 12) * u;
        shadow(x - 4 * u, y, 9 * u, 6 * u);
        g.fillStyle = '#4a5058'; g.fillRect(x - 2 * u, y + 2 * u, 4 * u, 5 * u);
        g.fillStyle = '#767d86';
        g.beginPath(); g.ellipse(x, y + 2 * u, 5 * u, 3 * u, 0, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(255,255,255,.22)';
        g.beginPath(); g.ellipse(x - u, y + u, 3 * u, 1.6 * u, 0, 0, 6.3); g.fill();
        break;
      }
      case 'light': {
        /* A rooflight: wired glass reflecting cold sky. */
        const w = 14 * u, h = 10 * u, x = (32 * u - w) / 2 + (rnd() * 6 - 3) * u, y = (32 * u - h) / 2 + (rnd() * 6 - 3) * u;
        shadow(x, y, w, h);
        g.fillStyle = '#9aa0a6'; g.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);   /* the upstand */
        g.fillStyle = '#7d9fb4'; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(226,240,248,.45)'; g.fillRect(x, y, w, h / 2);
        g.fillStyle = 'rgba(40,52,62,.55)'; g.fillRect(x + w / 2 - u / 2, y, u, h);
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - u, y - u, w + 2 * u, u);
        break;
      }
      case 'plant': {
        /* An air-handling unit with louvres and a duct. */
        const w = 16 * u, h = 11 * u, x = (7 + rnd() * 3) * u, y = (9 + rnd() * 5) * u;
        box(x, y, w, h, '#69707a', '#464c55');
        g.fillStyle = 'rgba(0,0,0,.30)';
        for (let i = 1; i < 6; i++) g.fillRect(x + 2 * u, y + h - 3 * u - i * 1.4 * u, w - 4 * u, u);
        g.fillStyle = '#5b626b'; g.fillRect(x + w, y + 3 * u, 5 * u, 4 * u);       /* the duct */
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + w, y + 3 * u, 5 * u, u);
        break;
      }
      case 'tank': {
        /* A water tank on four legs. */
        const w = 13 * u, h = 9 * u, x = (9 + rnd() * 4) * u, y = (8 + rnd() * 4) * u;
        /* Legs first, tank over them, so only their feet show below: it stands off
           the roof. */
        g.fillStyle = 'rgba(0,0,0,.26)'; g.fillRect(x + 2 * u, y + 3 * u, w, h + 3 * u);
        g.fillStyle = '#3f4650';
        for (const lx of [x + u, x + w - 2.5 * u]) g.fillRect(lx, y + 2 * u, 1.5 * u, h + 4 * u);
        box(x, y, w, h, '#6d6459', '#4b453d');
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 3 * u, y + 2 * u, w - 6 * u, u);
        g.fillStyle = 'rgba(120,150,110,.22)'; g.fillRect(x, y + h - 4 * u, w, u);  /* the algae line */
        break;
      }
      case 'lift': {
        /* The lift overrun: a small single storey in the building's own material. */
        const w = 17 * u, h = 13 * u, x = (6 + rnd() * 4) * u, y = (8 + rnd() * 4) * u;
        g.fillStyle = 'rgba(0,0,0,.36)'; g.fillRect(x + 3 * u, y + 3 * u, w, h);
        /* Brick for brick buildings, render otherwise. */
        const body = mat === 'oxblood' || mat === 'pantile' ? '#6a4133' : '#575d64';
        g.fillStyle = body; g.fillRect(x, y, w, h);
        /* Its own little flat roof inside its own little parapet — which is
           the joke of the thing: there is a roof on the roof. */
        g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, h - 6 * u);
        g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, u);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, w, 1.5 * u);
        g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(x, y + h - 3 * u, w, 3 * u);
        g.fillStyle = 'rgba(0,0,0,.50)'; g.fillRect(x + 4 * u, y + h - 6 * u, 4.5 * u, 3.5 * u);  /* the door out */
        g.fillStyle = '#8b9199'; g.fillRect(x + w - 5 * u, y + h - 5 * u, 1.5 * u, 4 * u);       /* the vent pipe */
        break;
      }
      case 'aerial': {
        /* An H aerial and a dish on one bracket. */
        const x = (10 + rnd() * 12) * u, y = (20 + rnd() * 4) * u;
        g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(x + 2 * u, y - 10 * u, 1.5 * u, 12 * u);
        g.fillStyle = '#8b9199';
        g.fillRect(x, y - 12 * u, 1.5 * u, 13 * u);
        g.fillRect(x - 4 * u, y - 12 * u, 9.5 * u, 1.2 * u);
        g.fillRect(x - 3 * u, y - 9 * u, 7.5 * u, 1.2 * u);
        g.fillStyle = '#cfd3d6';
        g.beginPath(); g.ellipse(x + 7 * u, y - 5 * u, 3.4 * u, 4.2 * u, .4, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(0,0,0,.30)';
        g.beginPath(); g.ellipse(x + 7.8 * u, y - 4.4 * u, 2.4 * u, 3.2 * u, .4, 0, 6.3); g.fill();
        break;
      }
      case 'stack': {
        /* A chimney stack with four pots. */
        const w = 15 * u, h = 8 * u, x = (8 + rnd() * 4) * u, y = (12 + rnd() * 4) * u;
        g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(x + 3 * u, y + 3 * u, w, h + 3 * u);
        g.fillStyle = '#7a4a3a'; g.fillRect(x, y, w, h);                 /* the brickwork */
        g.fillStyle = 'rgba(0,0,0,.20)';
        for (let i = 1; i < 4; i++) g.fillRect(x, y + i * 2 * u, w, u);
        g.fillStyle = '#9b9083'; g.fillRect(x - u, y - 2 * u, w + 2 * u, 2.5 * u);   /* the flaunching */
        for (let i = 0; i < 4; i++) {
          const px = x + (1.5 + i * 3.4) * u;
          g.fillStyle = i === 3 ? '#8d5a41' : '#5c6169';
          g.fillRect(px, y - 6 * u, 2.6 * u, 4.5 * u);
          g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(px, y - 6 * u, 2.6 * u, u);
        }
        break;
      }
    }
  },
  /* The procedural roof, used until the roof sheet has decoded. */
  roofBaked(v) {
    return this._bake('roof' + v, (g, N, rnd) => {
      const base = v ? '#2b3038' : '#292e35';
      g.fillStyle = base; g.fillRect(0, 0, N, N);
      const rows = 4, h = N / rows;
      for (let r = 0; r < rows; r++) {
        const y = r * h, off = (r & 1) ? h : 0;
        for (let x = -h; x < N + h; x += h * 2) {
          g.fillStyle = 'rgba(255,255,255,' + (0.03 + rnd() * 0.035).toFixed(3) + ')';
          g.fillRect(x + off + 1, y + 1, h * 2 - 2, h - 2);
        }
        g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(0, y, N, 2);
      }
      if (rnd() > .72) {
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(N * .3, N * .3, N * .3, N * .3);
        g.fillStyle = 'rgba(255,255,255,.06)';
        g.fillRect(N * .3, N * .3, N * .3, 3);
      }
    });
  },
  /* ---- the street ----
     Two passes for levels with `surfaces:` and `paint:`. The kerb is derived:
     wherever one surface meets walkable ground of another there is a step (a lit
     edge and a gutter shadow). A crossover carries the tarmac through, so it has
     no kerb. */
  kerbs(x0, y0, x1, y1) {
    if (!World.surf) return;
    const c = this.ctx;
    /* Ground you can see, not stand on: an open surface (water) still has an edge
       worth drawing. */
    const vis = (x, y) => !(x < 0 || y < 0 || x >= MAPW || y >= MAPH)
      && (!World.solid[y][x] || World.open(x, y));
    const at = (x, y) => vis(x, y) ? { s: World.surfAt(x, y) } : false;
    /* `soft` surfaces meeting each other (grass and a track) have no kerb. */
    const soft = n => !!(n && SURFACES[n] && SURFACES[n].soft);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = World.surfAt(x, y);
      if (!s || !vis(x, y)) continue;
      const px = x * TILE, py = y * TILE;
      /* Drawn from the surfaced side only, and between two surfaces only from the
         one whose name sorts first, or the shadow doubles. */
      const edge = n => n && n.s !== s && (!n.s || s < n.s) && !(soft(s) && soft(n.s));
      /* North and west get the kerb top (the lit face); south and east likewise.
         The gutter shadow is always in the tarmac. */
      if (edge(at(x, y - 1))) {
        c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px, py, TILE, 3);
        c.fillStyle = 'rgba(226,229,234,.30)'; c.fillRect(px, py - 4, TILE, 4);
        c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(px, py - 5, TILE, 1);
      }
      if (edge(at(x, y + 1))) {
        c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px, py + TILE - 3, TILE, 3);
        c.fillStyle = 'rgba(226,229,234,.30)'; c.fillRect(px, py + TILE, TILE, 4);
      }
      if (edge(at(x - 1, y))) {
        c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px, py, 3, TILE);
        c.fillStyle = 'rgba(226,229,234,.30)'; c.fillRect(px - 4, py, 4, TILE);
      }
      if (edge(at(x + 1, y))) {
        c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px + TILE - 3, py, 3, TILE);
        c.fillStyle = 'rgba(226,229,234,.30)'; c.fillRect(px + TILE, py, 4, TILE);
      }
    }
  },
  /* The level's `paint:` list, in tiles, all faded:
       dash    broken white line from a to b
       line    solid line (give way, stop line)
       yellow  double yellow along a kerb, a to b
       zebra   crossing filling r; bars run with the traffic, repeated across
       bays    r divided into two-tile bays, open on the named side
       text    words at `at`, turned `turn` quarter turns
       rails   railway track from a to b: sleepers and two rails on ballast
     Rails are linework, not tiles, so sleeper joints fall where they should.
     Baked into ground()'s chunks. `view` is the cull rectangle: the chunk being
     baked, or the camera when the cache is off. */
  roadPaint(view) {
    const list = World.def && World.def.paint;
    if (!list || !list.length) return;
    const c = this.ctx, V = view || Cam;
    const WHITE = 'rgba(228,230,222,.58)', YELLOW = 'rgba(206,172,66,.5)';
    /* Anything wholly off-screen costs one rectangle test and nothing else. */
    const near = (ax, ay, bx, by) => !(Math.max(ax, bx) < V.x - TILE || Math.min(ax, bx) > V.x + V.w + TILE
      || Math.max(ay, by) < V.y - TILE || Math.min(ay, by) > V.y + V.h + TILE);
    /* One line, solid or broken, between two points. Everything except the
       crossing and the words is one of these. */
    const stroke = (ax, ay, bx, by, w, colour, dash) => {
      if (!near(ax, ay, bx, by)) return;
      const len = Math.hypot(bx - ax, by - ay);
      if (!len) return;
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      c.save();
      c.strokeStyle = colour; c.lineWidth = w; c.lineCap = 'butt';
      if (dash) {
        /* Laid to a pitch rather than stretched to fit: a centre line that
           ends mid-dash is what a real one does. */
        const on = TILE * .78, off = TILE * .95;
        for (let d = 0; d + on <= len; d += on + off) {
          c.beginPath();
          c.moveTo(ax + ux * d, ay + uy * d);
          c.lineTo(ax + ux * (d + on), ay + uy * (d + on));
          c.stroke();
        }
      } else {
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      }
      c.restore();
    };
    for (const m of list) {
      if (m.a && m.b) {
        const ax = m.a[0] * TILE, ay = m.a[1] * TILE, bx = m.b[0] * TILE, by = m.b[1] * TILE;
        if (m.p === 'rails') {
          /* Sleepers, rails, then the shine along each. The 22px gauge fits a 19px
             person between the rails. */
          if (!near(ax, ay, bx, by)) continue;
          const len = Math.hypot(bx - ax, by - ay);
          if (!len) continue;
          const ux = (bx - ax) / len, uy = (by - ay) / len;
          const nx = -uy, ny = ux, g = 11;
          c.save();
          c.lineCap = 'butt';
          c.strokeStyle = 'rgba(38,30,24,.62)'; c.lineWidth = 4;
          for (let d = 9; d < len; d += 19) {
            const px = ax + ux * d, py = ay + uy * d;
            c.beginPath();
            c.moveTo(px - nx * (g + 6), py - ny * (g + 6));
            c.lineTo(px + nx * (g + 6), py + ny * (g + 6));
            c.stroke();
          }
          for (const side of [-1, 1]) {
            const ox = nx * g * side, oy = ny * g * side;
            c.strokeStyle = 'rgba(26,28,32,.85)'; c.lineWidth = 5;
            c.beginPath(); c.moveTo(ax + ox, ay + oy); c.lineTo(bx + ox, by + oy); c.stroke();
            c.strokeStyle = 'rgba(196,202,210,.42)'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(ax + ox, ay + oy); c.lineTo(bx + ox, by + oy); c.stroke();
          }
          c.restore();
          continue;
        }
        if (m.p === 'dash') stroke(ax, ay, bx, by, 4, WHITE, true);
        else if (m.p === 'line') stroke(ax, ay, bx, by, 5, WHITE, false);
        /* A stop line: wider and whiter than a give-way line. */
        else if (m.p === 'stop') stroke(ax, ay, bx, by, 7, 'rgba(238,240,234,.7)', false);
        else if (m.p === 'yellow') {
          /* Two of them, three pixels apart, because one is a restriction and
             two is a prohibition and everybody in the country knows which. */
          const len = Math.hypot(bx - ax, by - ay) || 1;
          const nx = -(by - ay) / len * 3, ny = (bx - ax) / len * 3;
          stroke(ax - nx, ay - ny, bx - nx, by - ny, 2.5, YELLOW, false);
          stroke(ax + nx, ay + ny, bx + nx, by + ny, 2.5, YELLOW, false);
        }
        continue;
      }
      /* A pelican is one marking: two rows of studs across the road and zig-zags on
         each approach (the kerbside parking in data/levels.js stops at them). */
      if (m.p === 'pelican' && m.r) {
        const [x1, y1, x2, y2] = m.r;
        const px = x1 * TILE, py = y1 * TILE;
        const w = (x2 - x1 + 1) * TILE, h = (y2 - y1 + 1) * TILE;
        if (!near(px - TILE * 5, py - TILE * 5, px + w + TILE * 5, py + h + TILE * 5)) continue;
        /* Road direction by the zebra's test: a crossing is short along the road and
           spans its width. */
        const horiz = h >= w;
        c.save();
        c.fillStyle = 'rgba(232,234,228,.62)';
        /* THE STUDS. Two rows, one on each edge the traffic meets, square and
           spaced about their own width apart. */
        const STUD = 7, GAP = 11;
        for (const at of horiz ? [px, px + w - STUD] : [py, py + h - STUD]) {
          if (horiz) for (let y = py + 4; y + STUD <= py + h - 2; y += STUD + GAP) c.fillRect(at, y, STUD, STUD);
          else for (let x = px + 4; x + STUD <= px + w - 2; x += STUD + GAP) c.fillRect(x, at, STUD, STUD);
        }
        /* The zig-zags: four runs, one per side per approach, a tooth per tile, set in
           from the kerb. */
        const RUN = TILE * 4.5, PITCH = TILE, AMP = TILE * .34, IN = TILE * .5;
        c.strokeStyle = 'rgba(228,230,222,.5)'; c.lineWidth = 2.5;
        c.lineCap = 'butt'; c.lineJoin = 'miter';
        const zig = (sx, sy, ux, uy, len) => {
          const nx = -uy, ny = ux;
          c.beginPath();
          let d = 0, up = 1;
          c.moveTo(sx, sy);
          while (d < len) {
            d = Math.min(len, d + PITCH / 2);
            c.lineTo(sx + ux * d + nx * AMP * up, sy + uy * d + ny * AMP * up);
            up = -up;
          }
          c.stroke();
        };
        if (horiz) {
          for (const sideY of [py + IN, py + h - IN]) {
            zig(px - 1, sideY, -1, 0, RUN);
            zig(px + w + 1, sideY, 1, 0, RUN);
          }
        } else {
          for (const sideX of [px + IN, px + w - IN]) {
            zig(sideX, py - 1, 0, -1, RUN);
            zig(sideX, py + h + 1, 0, 1, RUN);
          }
        }
        c.restore();
        continue;
      }
      if (m.p === 'zebra' && m.r) {
        const [x1, y1, x2, y2] = m.r;
        const px = x1 * TILE, py = y1 * TILE;
        const w = (x2 - x1 + 1) * TILE, h = (y2 - y1 + 1) * TILE;
        if (!near(px, py, px + w, py + h)) continue;
        c.save();
        c.fillStyle = 'rgba(232,234,228,.6)';
        /* Bars laid along the crossing's short side (the road's direction) and spaced
           along the long one. */
        if (h >= w) { for (let y = py + 5; y + 13 <= py + h; y += 26) c.fillRect(px, y, w, 13); }
        else { for (let x = px + 5; x + 13 <= px + w; x += 26) c.fillRect(x, py, 13, h); }
        c.restore();
        continue;
      }
      if (m.p === 'bays' && m.r) {
        const [x1, y1, x2, y2] = m.r;
        const px = x1 * TILE, py = y1 * TILE;
        const w = (x2 - x1 + 1) * TILE, h = (y2 - y1 + 1) * TILE;
        if (!near(px, py, px + w, py + h)) continue;
        /* Two-tile bays: dividers run away from the open side; the closed end gets a
           line. */
        const acrossX = m.open === 'n' || m.open === 's';
        c.save();
        c.strokeStyle = WHITE; c.lineWidth = 3;
        c.beginPath();
        /* The bay head is drawn inside the rectangle, since the wall or kerb behind it
           is drawn over the boundary. */
        const in2 = 2;
        if (acrossX) {
          for (let x = px; x <= px + w + 1; x += TILE * 2) { c.moveTo(x, py); c.lineTo(x, py + h); }
          const cy = m.open === 's' ? py + in2 : py + h - in2;
          c.moveTo(px, cy); c.lineTo(px + w, cy);
        } else {
          for (let y = py; y <= py + h + 1; y += TILE * 2) { c.moveTo(px, y); c.lineTo(px + w, y); }
          const cx = m.open === 'e' ? px + in2 : px + w - in2;
          c.moveTo(cx, py); c.lineTo(cx, py + h);
        }
        c.stroke(); c.restore();
        continue;
      }
      if (m.p === 'kerbside' && m.r) {
        /* Parallel parking along a kerb, unlike `bays`: a line between the parked cars
           and the traffic, with ticks closing each bay. The outer lanes of six-tile
           roads. `side` names the kerb; one tile deep. */
        const [x1, y1, x2, y2] = m.r;
        const px = x1 * TILE, py = y1 * TILE;
        const w = (x2 - x1 + 1) * TILE, h = (y2 - y1 + 1) * TILE;
        if (!near(px, py, px + w, py + h)) continue;
        const along = w >= h;                       /* the lane runs left-right */
        c.save();
        c.strokeStyle = WHITE; c.lineWidth = 3;
        c.beginPath();
        if (along) {
          /* The long white line, on the traffic side of the lane. */
          const ly = m.side === 'n' ? py + h : py;
          c.moveTo(px, ly); c.lineTo(px + w, ly);
          /* And a tick across the lane every bay-and-a-half, which is where a
             real one goes: long enough that a car fits between two of them. */
          for (let x = px; x <= px + w + 1; x += TILE * 2.5) { c.moveTo(x, py); c.lineTo(x, py + h); }
        } else {
          const lx = m.side === 'w' ? px + w : px;
          c.moveTo(lx, py); c.lineTo(lx, py + h);
          for (let y = py; y <= py + h + 1; y += TILE * 2.5) { c.moveTo(px, y); c.lineTo(px + w, y); }
        }
        c.stroke(); c.restore();
        continue;
      }
      if (m.p === 'text' && m.at) {
        const px = m.at[0] * TILE, py = m.at[1] * TILE;
        if (!near(px - 60, py - 60, px + 60, py + 60)) continue;
        c.save();
        c.translate(px, py);
        if (m.turn) c.rotate((m.turn & 3) * Math.PI / 2);
        /* Road lettering is tall and narrow, read at an angle from afar. */
        c.scale(0.82, 2);
        c.font = ROAD_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = WHITE;
        c.fillText(m.s || '', 0, 0);
        c.restore();
      }
    }
  },
  /* Vehicle shapes, so a bus is not a long car:
       nose/tail  fraction of full width kept at front and back
       belly      side bulge past the widest point (under 1 for a slab)
       sprite     which vehicle on art/sprites/cars.png
       seat       windscreen position as a fraction of half-length, for the
                  driver's head
       lamp       lamps' inset from each side as a fraction of half-width,
                  measured off the art (carLamps())
       livery     keep the sheet's own paint; do not tint
     The outline casts the shadow; the sheet provides the body. A model without
     a shape gets `car`. */
  CARSHAPES: {
    car: { nose: .84, tail: .90, belly: 1.03, sprite: 'car.coupe', seat: .12, lamp: .71 },
    van: { nose: .97, tail: .99, belly: 1.0, sprite: 'car.van', seat: .72, lamp: .56 },
    bus: { nose: .98, tail: .99, belly: 1.0, sprite: 'car.bus', seat: .75, lamp: .66 },
    /* A taxi's chequers and sign are the artist's paint, hence `livery`. */
    taxi: { nose: .84, tail: .90, belly: 1.03, sprite: 'car.taxi', seat: .12, lamp: .56, livery: true },
  },
  /* The body off the sheet: art/sprites/cars.png draws vehicles from directly
     above, so one sprite rotates through any angle.
     - The paint is the game's: a silver base with the CARS colour multiplied
       through, keeping the artist's highlights and glass. Multiply and
       destination-in, never getImageData (file:// taints the canvas).
     - Rotated a quarter turn: the sheet is nose-up, angle zero is east.
     - Smoothed: scaled non-uniformly and rotated, nearest neighbour would give
       uneven pixels. */
  /* Whether this silhouette's sheet is loaded; one function so carArt() and
     carSprite() ask the same question. */
  carSheet(S) {
    return !!S.sprite && Tiles.has(S.sprite)
      && !!Tiles.rects[S.sprite] && !!Tiles.imgFor(S.sprite);
  },
  carSprite(c, d, S, wet) {
    if (!this.carSheet(S)) return false;
    const r = Tiles.rects[S.sprite], img = Tiles.imgFor(S.sprite);
    const put = () => {
      c.save(); c.rotate(Math.PI / 2);
      c.drawImage(img, r[0], r[1], r[2], r[3], -d.wid / 2, -d.len / 2, d.wid, d.len);
      c.restore();
    };
    put();
    if (!S.livery) {
      c.save();
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = d.body;
      c.fillRect(-d.len / 2 - 1, -d.wid / 2 - 1, d.len + 2, d.wid + 2);
      /* The fill covered the transparent corners too, so put the sprite's own
         alpha back over the top of it. */
      c.globalCompositeOperation = 'destination-in';
      put();
      c.restore();
    }
    /* Wet paint: a sheen painted `source-atop`, only where the sprite is. */
    if (wet > 0) {
      c.save();
      c.globalCompositeOperation = 'source-atop';
      const g = c.createLinearGradient(0, -d.wid / 2, 0, d.wid / 2);
      g.addColorStop(0, 'rgba(226,240,255,' + (.20 * wet).toFixed(3) + ')');
      g.addColorStop(.42, 'rgba(255,255,255,' + (.07 * wet).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,140,170,' + (.13 * wet).toFixed(3) + ')');
      c.fillStyle = g;
      c.fillRect(-d.len / 2 - 1, -d.wid / 2 - 1, d.len + 2, d.wid + 2);
      c.restore();
    }
    return true;
  },
  /* Lamp centres in the vehicle's frame, measured off the sprites (tails a fifth
     to a quarter in from each side, clusters at the ends), so brake lights land
     on the drawn lamps. `lamp` is what differs between silhouettes. */
  carLamps(d, S) {
    const hl = d.len / 2, hw = d.wid / 2;
    return { hx: hl * .90, tx: -hl * .92, v: hw * S.lamp };
  },
  /* The baked half of a vehicle: body, shadow and sign into a small canvas at 2x,
     one blit a frame. Live parts are the lights, indicators and occupant. Keyed
     by model and quantised wetness. */
  /* ---- the lights ----
     Drawn, since a signal is all change (the atlas has one red head, used for
     the broken set: FURN.signals, tools/sheets/streets.mjs). Every arm gets a
     three-aspect head; a crossing pole adds the man facing across and the WAIT
     box with the button. Unlit lenses show dark, or a head reads as broken.
     Lit lenses bloom, with 'lighter'. */
  SIG: { red: '#e8342c', amber: '#f0a42a', green: '#34c759' },
  signalHead(arm, ex, ey) {
    const c = this.ctx, inst = arm.inst;
    const asp = Signals.aspect(arm);
    /* Flashing amber at four a second. */
    const flash = (this.t * 4 | 0) & 1;
    const on = {
      red: asp === 'red' || asp === 'redamber',
      amber: asp === 'amber' || asp === 'redamber' || (asp === 'flash' && flash),
      green: asp === 'green'
    };
    /* The post, three tiles tall, anchored at its foot, leaning a few pixels over
       its approach so its facing shows from above. */
    const lean = 4;
    const bx = ex - arm.gx * lean, base = ey + 14, top = ey - 52;
    this.shadow(ex, base - 1, 9, 4);
    c.save();
    c.fillStyle = '#4a4e54'; c.fillRect(bx - 2.5, top, 5, base - top);
    c.fillStyle = '#6b7076'; c.fillRect(bx - 2.5, top, 1.5, base - top);
    /* The base flange, which is the bit that makes a post look bolted down
       rather than pushed in. */
    c.fillStyle = '#3a3e44'; c.fillRect(bx - 5, base - 3, 10, 3);

    /* The head: black board with a pale retroreflective border. */
    const hw = 13, hh = 31, hx = bx - hw / 2, hy = top - 2;
    c.fillStyle = '#16181c';
    c.beginPath(); c.roundRect(hx, hy, hw, hh, 3); c.fill();
    c.strokeStyle = 'rgba(214,218,222,.72)'; c.lineWidth = 1.4;
    c.beginPath(); c.roundRect(hx + .7, hy + .7, hw - 1.4, hh - 1.4, 2.6); c.stroke();
    const lamps = [['red', on.red], ['amber', on.amber], ['green', on.green]];
    lamps.forEach(([k, lit], i) => {
      const cy = hy + 6.5 + i * 9, cx = bx;
      /* The hood over each lens. A signal you can read in low sun is a signal
         with a peak on it, and a head without them is a toy. */
      c.fillStyle = '#0c0e11';
      c.beginPath(); c.arc(cx, cy - 1.4, 4.4, Math.PI, 0); c.fill();
      c.fillStyle = lit ? this.SIG[k] : this.shade(this.SIG[k], -.62);
      c.beginPath(); c.arc(cx, cy, 3.2, 0, 6.3); c.fill();
      if (lit) {
        c.fillStyle = 'rgba(255,255,255,.55)';
        c.beginPath(); c.arc(cx - .9, cy - 1, 1.1, 0, 6.3); c.fill();
      }
    });
    c.restore();

    /* THE OTHER TWO UNITS, and only on a crossing. */
    if (inst.kind === 'pelican') this.crossingUnit(inst, bx, top + 34);

    /* The light re-added over the grade, as R.lamps() does, so it glows at night
       and a little by day. */
    const night = clamp(-Sky.sunPos() * 1.6 + .55, .22, 1);
    c.save();
    c.globalCompositeOperation = 'lighter';
    lamps.forEach(([k, lit], i) => {
      if (!lit) return;
      const g = this.glow(this.rgba(this.SIG[k], 'ALPHA'), 15);
      c.globalAlpha = .5 * night;
      c.drawImage(g, bx - g.width / 2, top + 4.5 + i * 9 - g.height / 2);
    });
    if (inst.kind === 'pelican' && Signals.man(inst) !== 'red') {
      const lit = Signals.man(inst) === 'green' || flash;
      if (lit) {
        const g = this.glow('rgba(52,199,89,ALPHA)', 14);
        c.globalAlpha = .42 * night;
        c.drawImage(g, bx - g.width / 2, top + 41 - g.height / 2);
      }
    }
    c.restore();
  },
  /* The man and the button box face across the road, drawn square to the
     screen. Six rectangles: feet together on red, mid-stride on green. */
  crossingUnit(inst, bx, uy) {
    const c = this.ctx;
    const st = Signals.man(inst);
    const flash = (this.t * 4 | 0) & 1;
    const walk = st === 'green' || (st === 'flash' && flash);
    const lit = st === 'red' ? 'red' : (walk ? 'green' : null);
    c.save();
    /* The box. Smaller than the traffic head, which is what it is. */
    c.fillStyle = '#16181c';
    c.beginPath(); c.roundRect(bx - 6.5, uy, 13, 13, 2.5); c.fill();
    c.strokeStyle = 'rgba(214,218,222,.6)'; c.lineWidth = 1.1;
    c.beginPath(); c.roundRect(bx - 5.9, uy + .6, 11.8, 11.8, 2); c.stroke();
    if (lit) {
      const col = lit === 'red' ? this.SIG.red : this.SIG.green;
      c.fillStyle = col;
      const my = uy + 2.4;
      c.fillRect(bx - .9, my, 1.9, 1.9);                     /* head */
      c.fillRect(bx - 1.1, my + 2.4, 2.3, 3.6);              /* body */
      if (walk) {
        c.fillRect(bx - 3.4, my + 2.8, 2.4, 1.1);            /* arms, swinging */
        c.fillRect(bx + 1.2, my + 3.6, 2.4, 1.1);
        c.fillRect(bx - 3, my + 6.2, 2.6, 1.2);              /* legs, mid-stride */
        c.fillRect(bx + .6, my + 6.2, 2.6, 1.2);
        c.fillRect(bx - 1.4, my + 5.8, 1.2, 1.6);
        c.fillRect(bx + .4, my + 5.8, 1.2, 1.6);
      } else {
        c.fillRect(bx - 2.4, my + 2.6, 1.1, 3.2);            /* arms, down */
        c.fillRect(bx + 1.4, my + 2.6, 1.1, 3.2);
        c.fillRect(bx - 1.1, my + 6, 1, 2.4);                /* legs, together */
        c.fillRect(bx + .2, my + 6, 1, 2.4);
      }
    }
    /* WAIT is lit from the press until the green man; the button is always there. */
    const w = Signals.waiting(inst);
    const py = uy + 14;
    c.fillStyle = w ? '#c8a23a' : '#2a2c30';
    c.beginPath(); c.roundRect(bx - 6.5, py, 13, 6, 1.5); c.fill();
    c.fillStyle = w ? '#1a1509' : '#6a6e74';
    c.font = 'bold 5px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('WAIT', bx, py + 3.2);
    c.fillStyle = '#3b3e44';
    c.beginPath(); c.roundRect(bx - 4, py + 7, 8, 6, 1.5); c.fill();
    c.fillStyle = '#8d9298';
    c.beginPath(); c.arc(bx, py + 10, 1.9, 0, 6.3); c.fill();
    c.restore();
  },
  /* A hex colour as an rgba template for R.glow(). */
  rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')';
  },
  CAR_PAD: 10,
  carArt(d) {
    const S = this.CARSHAPES[d.shape] || this.CARSHAPES.car;
    /* Before any canvas work: null until the atlas decodes, and nothing is cached
       then. */
    if (!this.carSheet(S)) return null;
    const wet = Math.round(Sky.wet() * 4) / 4;
    const key = d.len + ':' + d.wid + ':' + (d.shape || 'car') + ':' + d.body
      + (d.sign ? 'S' : '') + ':' + wet;
    this._cars = this._cars || new Map();
    const had = this._cars.get(key);
    if (had) return had;

    const P = this.CAR_PAD, Z = 2;
    const w = d.len + P * 2, h = d.wid + P * 2;
    const surface = () => {
      const cv = document.createElement('canvas');
      cv.width = w * Z; cv.height = h * Z;
      const g = cv.getContext('2d');
      g.scale(Z, Z); g.translate(w / 2, h / 2);
      return { cv, g };
    };

    const hl = d.len / 2, hw = d.wid / 2;
    const fw = hw * S.nose, rw = hw * S.tail, bel = hw * S.belly;

    /* The outline is a path (narrower at the nose), shared by shadow and body. */
    const outline = c => {
      c.beginPath();
      c.moveTo(-hl + rw * .45, -rw);
      c.quadraticCurveTo(0, -bel, hl - fw * .5, -fw);
      c.quadraticCurveTo(hl, -fw, hl, -fw * .45);
      c.quadraticCurveTo(hl, fw * .45, hl - fw * .5, fw);
      c.quadraticCurveTo(0, bel, -hl + rw * .45, rw);
      c.quadraticCurveTo(-hl, rw, -hl, rw * .45);
      c.quadraticCurveTo(-hl, -rw * .45, -hl + rw * .45, -rw);
      c.closePath();
    };

    /* ---- the shadow ----
       Two: the cast shadow, soft (three passes) and offset down-right like every
       shadow; and the tight contact shadow under the sills. The sprite is placed
       at the contact shadow. */
    const sh = surface();
    for (const [s, a] of [[1.13, .09], [1.06, .12], [1, .20]]) {
      sh.g.save(); sh.g.translate(2, 4.5); sh.g.scale(s, s);
      sh.g.fillStyle = 'rgba(0,0,0,' + a + ')';
      outline(sh.g); sh.g.fill();
      sh.g.restore();
    }
    sh.g.save(); sh.g.scale(.93, .93);
    sh.g.fillStyle = 'rgba(0,0,0,.30)';
    outline(sh.g); sh.g.fill();
    sh.g.restore();

    const bd = surface(), c = bd.g;
    /* The body: one blit off the sheet. No sheet, no cars: release.sh refuses to
       publish without every manifest sheet, and the `sprites` suite checks them. */
    this.carSprite(c, d, S, wet);

    /* The pool car's slid door sign, from its CARS entry. */
    if (d.sign) {
      c.save(); c.translate(-hl * .06, -hw + 1.5); c.rotate(-0.09);
      c.fillStyle = 'rgba(232,236,242,.9)';
      c.beginPath(); c.roundRect(-hl * .22, 0, hl * .44, 5, 1); c.fill();
      c.fillStyle = 'rgba(60,80,120,.55)';
      c.fillRect(-hl * .18, 1.6, hl * .36, 1.8);
      c.restore();
    }

    const art = { w, h, body: bd.cv, shadow: sh.cv };
    /* One entry per model per quarter-step of wet, so the cache is bounded. */
    this._cars.set(key, art);
    return art;
  },

  /* One vehicle from above: the baked body (carArt()), then what moves: brake
     lights, indicators, reversing wash and the occupant. */
  car(car, focused) {
    const c = this.ctx, d = car.def;
    const hl = d.len / 2, hw = d.wid / 2;
    const S = this.CARSHAPES[d.shape] || this.CARSHAPES.car;
    /* No sheet yet: nothing, rather than floating lamps. */
    const art = this.carArt(d);
    if (!art) return;
    const ax = -art.w / 2, ay = -art.h / 2;

    /* The shadow is the ground's, so it is placed in the WORLD and only then
       turned to match the body. */
    c.save();
    c.translate(car.x, car.y + 1.5); c.rotate(car.a);
    c.drawImage(art.shadow, ax, ay, art.w, art.h);
    c.restore();

    c.save();
    c.translate(car.x, car.y); c.rotate(car.a);
    /* The rim goes round the body only, over the shadow. */
    if (focused) this.rim(() => c.drawImage(art.body, ax, ay, art.w, art.h), ...this.RIM_THING);

    /* No drawn wheels: the sheet's bodies cover their own tyres. `car.wheel` still
       drives the physics. */
    c.drawImage(art.body, ax, ay, art.w, art.h);

    /* Somebody in it. A head, at the right-hand seat, because this is Bellhaven
       and not Bellhaven, Ohio. */
    if (car === Cars.driving || car.traffic) {
      /* The driver sits under the windscreen, which differs per sheet. */
      const seat = hl * S.seat;
      c.fillStyle = car === Cars.driving ? 'rgba(233,214,190,.95)' : 'rgba(60,66,78,.9)';
      c.beginPath(); c.arc(seat, hw * 0.42, 3.4, 0, 6.3); c.fill();
    }

    /* Brake and indicator lamps over the sheet's own, at carLamps(). */
    const L = this.carLamps(d, S);
    const lamp = (x, v, lw, lh, col) => {
      c.fillStyle = col;
      c.beginPath(); c.roundRect(x - lw / 2, v - lh / 2, lw, lh, Math.min(lw, lh) / 2); c.fill();
    };
    /* Rear lamps light when braking or reversing. */
    const lit = car.braking || car.fwd < -4;
    if (lit) for (const v of [-1, 1]) lamp(L.tx, v * L.v, 3, 5, '#ff5f56');
    /* Indicators show the driver's decision (Cars.signal()): the wheel for the
       driven car, the coming corner for traffic. Off with Animation. */
    const turn = car.blink || 0;
    if (this.animate && Math.abs(turn) > .22 && Math.floor(this.t * 2.6) % 2 === 0) {
      const v = turn < 0 ? -1 : 1;
      /* Indicators inboard of the headlights. */
      const iv = v * Math.max(L.v - 4.5, L.v * .45);
      lamp(L.hx, iv, 3, 4, '#ffb347');
      lamp(L.tx, iv, 3, 4, '#ffb347');
    }
    if (lit && Math.abs(car.fwd) > 20) {
      c.fillStyle = 'rgba(255,95,86,.18)';
      c.beginPath(); c.roundRect(L.tx - 8, -L.v - 2, 8, L.v * 2 + 4, 3); c.fill();
    }
    c.restore();
  },
  /* Bake a blurred copy of the frame into the canvas once, when a full-screen
     overlay opens. */
  freeze() {
    const c = this.ctx, cv = this.cv;
    if (typeof c.filter === 'undefined') return;   /* older Safari: just stay sharp */
    try {
      const s = this._scratch || (this._scratch = document.createElement('canvas'));
      if (s.width !== cv.width || s.height !== cv.height) { s.width = cv.width; s.height = cv.height; }
      const sc = s.getContext('2d');
      sc.clearRect(0, 0, s.width, s.height);
      sc.drawImage(cv, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      c.filter = 'blur(' + (6 * this.dpr).toFixed(1) + 'px) saturate(0.75) brightness(0.72)';
      c.drawImage(s, 0, 0);
      c.filter = 'none';
    } catch (e) { /* leave the sharp frame in place */ }
  },
  shadow(x, y, w, h) {
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.beginPath(); c.ellipse(x, y, w, h, 0, 0, 6.3); c.fill();
  },
  /* ---- Furniture in 44px units ----
     Desks, tables, worktops, counters, cubicles and doorways draw at a 44px
     reference tile and the canvas scales them: `fn` is handed that size,
     shadowing the global TILE. New drawing uses TILE directly. */
  REF_TILE: 44,
  refScale(fn) {
    const c = this.ctx;
    c.save(); c.scale(TILE / this.REF_TILE, TILE / this.REF_TILE);
    fn(this.REF_TILE);
    c.restore();
  },
  /* What you see through an open door cut into wall mass: World.behind() names
     the room behind, and this paints its floor into the gap, darkening towards
     the lintel. Before R.doorways(), which lays jambs, threshold and leaf over it. */
  /* The gap between the jambs in world pixels, for a doorway in wall mass, or
     null. Shared by R.thresholds() and R.lamps(). A two-tile opening is one
     opening, as R.doorways() treats it. */
  doorOpening(d, list) {
    if (!World.solid[d.y] || !World.solid[d.y][d.x]) return null;
    const J = TILE * (9 / this.REF_TILE);
    const px = d.x * TILE, py = d.y * TILE;
    let x = px, y = py, w = TILE, h = TILE;
    if (d.axis === 'h') {
      if (!list.some(o => o.y === d.y && o.x === d.x - 1)) { x += J; w -= J; }
      if (!list.some(o => o.y === d.y && o.x === d.x + 1)) w -= J;
    } else {
      if (!list.some(o => o.x === d.x && o.y === d.y - 1)) { y += J; h -= J; }
      if (!list.some(o => o.x === d.x && o.y === d.y + 1)) h -= J;
    }
    return (w < 1 || h < 1) ? null : { x, y, w, h, px, py, J };
  },
  thresholds(x0, y0, x1, y1) {
    const list = World.doorways; if (!list) return;
    const c = this.ctx;
    for (const d of list) {
      if (d.x < x0 - 1 || d.x > x1 + 1 || d.y < y0 - 1 || d.y > y1 + 1) continue;
      /* Only where the tile really is wall. An opening in a room already has a
         floor and does not want a second one laid over it. */
      const op = this.doorOpening(d, list); if (!op) continue;
      /* A room to show, or none: a shut door still gets its recess. */
      const room = d.into && ZONES[d.into] ? d.into : null;
      const px = op.px, py = op.py, J = op.J;
      const ox = op.x, oy = op.y, ow = op.w, oh = op.h;
      c.save();
      c.beginPath(); c.rect(ox, oy, ow, oh); c.clip();
      if (room) c.drawImage(this.floorTile(room, (d.x + d.y) & 1), px, py, TILE, TILE);
      else {
        /* Nothing behind: the wall's colour, sunk. */
        const z = World.zoneAt(d.x, d.y);
        c.fillStyle = this.shade((ZONES[z] && ZONES[z].wall) || '#1a212e', -.35);
        c.fillRect(ox, oy, ow, oh);
      }
      /* Deepest at the head, lifting to the threshold; three quarters down at most. */
      const g = c.createLinearGradient(0, py, 0, py + TILE);
      g.addColorStop(0, 'rgba(0,0,0,.62)');
      g.addColorStop(.55, 'rgba(0,0,0,.22)');
      g.addColorStop(1, 'rgba(0,0,0,.06)');
      c.fillStyle = g; c.fillRect(ox, oy, ow, oh);
      /* The jambs' shadows across it, for wall thickness. */
      const rv = Math.min(J, ow / 3);
      if (rv > 0.5) {
        const l = c.createLinearGradient(ox, 0, ox + rv, 0);
        l.addColorStop(0, 'rgba(0,0,0,.45)'); l.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = l; c.fillRect(ox, oy, rv, oh);
        const r = c.createLinearGradient(ox + ow, 0, ox + ow - rv, 0);
        r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = r; c.fillRect(ox + ow - rv, oy, rv, oh);
      }
      c.restore();
    }
  },
  /* The drawn doorway, for openings the kit has no door for: jambs, threshold
     and leaf. Visual only. Not drawn behind a kit door; jambs stay on walkable
     openings, where they carry the wall into the hole. */
  doorways(x0, y0, x1, y1) {
    this.refScale(TILE => {
      const list = World.doorways; if (!list) return;
      const c = this.ctx;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d.x < x0 - 1 || d.x > x1 + 1 || d.y < y0 - 1 || d.y > y1 + 1) continue;
        const kit = this.kitDoor(d);
        /* A kit door in wall mass needs nothing here. The test is the tile, not
           `d.solid` (which means declared shut; shopfronts are open doors in brick). */
        if (kit && World.solid[d.y] && World.solid[d.y][d.x]) continue;
        const z = World.zoneAt(d.x, d.y);
        const wall = (ZONES[z] && ZONES[z].wall) || '#1a212e';
        const px = d.x * TILE, py = d.y * TILE;
        const JAMB = 9;                     /* how far the wall reaches in */
        c.save();
        {
          /* The reveal, the wall's cut face, for shut doors too, so a door is set into
             the wall rather than stuck on. Only open ones get a threshold. */
          c.fillStyle = wall;
          if (d.axis === 'h') {
            /* Only where there is wall to carry in; a two-tile opening has no middle post. */
            const wOpen = list.some(o => o.y === d.y && o.x === d.x - 1);
            const eOpen = list.some(o => o.y === d.y && o.x === d.x + 1);
            if (!wOpen) c.fillRect(px, py, JAMB, TILE);
            if (!eOpen) c.fillRect(px + TILE - JAMB, py, JAMB, TILE);
            c.fillStyle = 'rgba(255,255,255,.06)';
            if (!wOpen) c.fillRect(px, py, JAMB, 3);
            if (!eOpen) c.fillRect(px + TILE - JAMB, py, JAMB, 3);
            c.fillStyle = 'rgba(0,0,0,.45)';
            if (!wOpen) c.fillRect(px + JAMB - 2, py, 2, TILE);
            if (!eOpen) c.fillRect(px + TILE - JAMB, py, 2, TILE);
            if (!d.solid && !kit) {
              /* A threshold strip, only where no kit door stands. */
              c.fillStyle = 'rgba(140,150,170,.16)';
              c.fillRect(px + JAMB, py + TILE / 2 - 4, TILE - JAMB * 2, 8);
              c.fillStyle = 'rgba(0,0,0,.25)';
              c.fillRect(px + JAMB, py + TILE / 2 - 4, TILE - JAMB * 2, 1.5);
            }
          } else {
            c.fillRect(px, py, TILE, JAMB);
            c.fillRect(px, py + TILE - JAMB, TILE, JAMB);
            c.fillStyle = 'rgba(255,255,255,.06)';
            c.fillRect(px, py, TILE, 2);
            c.fillStyle = 'rgba(0,0,0,.45)';
            c.fillRect(px, py + JAMB - 2, TILE, 2);
            c.fillRect(px, py + TILE - JAMB, TILE, 2);
            if (!d.solid && !kit) {
              c.fillStyle = 'rgba(140,150,170,.16)';
              c.fillRect(px + TILE / 2 - 4, py + JAMB, 8, TILE - JAMB * 2);
              c.fillStyle = 'rgba(0,0,0,.25)';
              c.fillRect(px + TILE / 2 - 4, py + JAMB, 1.5, TILE - JAMB * 2);
            }
          }
        }
        /* The leaf: locked is shut across the opening with a reader; open is swung
           back against its jamb. */
        const open = !d.locked;
        const face = d.locked ? '#5b4632' : '#7c5738';
        /* The kit draws doors face-on only. A vertical opening you can walk through
           gets no leaf (doorLeaves()); one set into a solid wall keeps this drawn leaf. */
        /* One question, asked once, in one place — see R.kitDoor(). */
        const kitLeaf = !!kit;
        const leaf = (lx, ly, lw, lh, vert) => {
          /* `vert` is the leaf's direction: hinges at the near end, handle at the far. */
          c.fillStyle = 'rgba(0,0,0,.40)';
          c.beginPath(); c.roundRect(lx + 1.5, ly + 2, lw, lh, 2); c.fill();
          const g = c.createLinearGradient(lx, ly, vert ? lx + lw : lx, vert ? ly : ly + lh);
          g.addColorStop(0, this.shade(face, .12)); g.addColorStop(1, this.shade(face, -.16));
          c.fillStyle = g;
          c.beginPath(); c.roundRect(lx, ly, lw, lh, 2); c.fill();
          c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1;
          c.beginPath(); c.roundRect(lx + .5, ly + .5, lw - 1, lh - 1, 2); c.stroke();
          /* Two recessed panels down the length of it. */
          for (let p = 0; p < 2; p++) {
            const a = .36 + p * .28;
            c.fillStyle = 'rgba(0,0,0,.24)';
            if (vert) c.fillRect(lx + 2.5, ly + lh * a, lw - 5, lh * .21);
            else c.fillRect(lx + lw * a, ly + 2.5, lw * .21, lh - 5);
            c.fillStyle = 'rgba(255,255,255,.08)';
            if (vert) c.fillRect(lx + 2.5, ly + lh * a, lw - 5, 1);
            else c.fillRect(lx + lw * a, ly + 2.5, 1, lh - 5);
          }
          c.fillStyle = 'rgba(210,220,235,.42)';
          for (let h = 0; h < 2; h++) {
            const a = h ? .24 : .09;
            if (vert) c.fillRect(lx, ly + lh * a, lw, 2);
            else c.fillRect(lx + lw * a, ly, 2, lh);
          }
          c.fillStyle = '#d8c48a';
          if (vert) c.fillRect(lx + lw * .18, ly + lh - 7, lw * .64, 2.5);
          else c.fillRect(lx + lw - 7, ly + lh * .18, 2.5, lh * .64);
        };
        /* Architrave for every doorway, shut or open. */
        {
          c.fillStyle = 'rgba(255,255,255,.05)';
          if (d.axis === 'h') {
            if (!list.some(o => o.y === d.y && o.x === d.x - 1)) c.fillRect(px + JAMB - 3, py, 3, TILE);
            if (!list.some(o => o.y === d.y && o.x === d.x + 1)) c.fillRect(px + TILE - JAMB, py, 3, TILE);
          }
          else { c.fillRect(px, py + JAMB - 3, TILE, 3); c.fillRect(px, py + TILE - JAMB, TILE, 3); }
        }
        if (kitLeaf) { c.restore(); continue; }
        if (d.axis === 'h') {
          if (open) leaf(px + JAMB, py + 5, TILE * 0.28, TILE - 10, true);
          else {
            leaf(px + JAMB, py + TILE / 2 - 5, TILE - JAMB * 2, 10, false);
            /* The reader. Green because it is working, which is not the same
               thing as it letting you in. */
            c.fillStyle = 'rgba(18,24,32,.9)';
            c.fillRect(px + TILE - JAMB + 1, py + TILE / 2 - 9, 6, 12);
            c.fillStyle = '#5ad48a'; c.fillRect(px + TILE - JAMB + 3, py + TILE / 2 - 6, 2, 2);
          }
        } else {
          if (open) leaf(px + 5, py + JAMB, TILE - 10, TILE * 0.28, false);
          else {
            leaf(px + TILE / 2 - 5, py + JAMB, 10, TILE - JAMB * 2, true);
            c.fillStyle = 'rgba(18,24,32,.9)';
            c.fillRect(px + TILE / 2 - 9, py + TILE - JAMB + 1, 12, 6);
            c.fillStyle = '#5ad48a'; c.fillRect(px + TILE / 2 - 6, py + TILE - JAMB + 3, 2, 2);
          }
        }
        c.restore();
      }
    });
  },
  /* Which kit door this opening wears (shut, ajar, locked), or null for vertical
     walls, which keep the drawn doorway. Asked in one place so doorways() and
     doorLeaves() agree. */
  /* Shopfronts wear `door.front.*`: the leaf shut flat in its opening, in four
     wood tones, seeded off the tile and row so neighbours differ. */
  SHOP_TONES: ['pine', 'oak', 'walnut', 'olive'],
  /* A unit's paint, off the tile (the windows use the same hash). */
  toneOf(x, y) { return ((x * 2654435761 ^ y * 40503) >>> 13) & 3; },
  kitDoor(d) {
    if (!Tiles.ready || d.axis !== 'h') return null;
    /* An exit is a door in a building's outer wall; a door inside keeps the kit's
       swing. */
    if (d.kind === 'exit') {
      const tone = this.SHOP_TONES[this.toneOf(d.x, d.y)];
      /* Four frames; `a` is 0 shut to 1 wide, rounded (pixel art does not tween). */
      const f = Math.min(3, Math.round((d.a || 0) * 3));
      const n = 'door.shop.' + tone + '.' + f;
      if (Tiles.has(n)) return n;
    }
    const n = d.locked ? 'door.shut.locked' : d.solid ? 'door.shut' : 'door.open';
    return Tiles.has(n) ? n : null;
  },
  /* How open each door is, once a frame: opening within a tile and a half of
     the threshold, closing beyond two (a band, so it does not flap), and only
     with something behind it. A fixed rate, closing a little slower. */
  swingDoors(dt) {
    const list = World.doorways; if (!list) return;
    const px = P ? P.x / TILE : -99, py = P ? P.y / TILE : -99;
    for (const d of list) {
      if (d.kind !== 'exit') continue;
      const open = d.shop && d.into && ZONES[d.into];
      let want = 0;
      if (open) {
        const dx = px - (d.x + .5), dy = py - (d.y + .5);
        const r = Math.hypot(dx, dy);
        want = r < 1.5 ? 1 : r < 2.2 ? (2.2 - r) / .7 : 0;
      }
      const a = d.a || 0;
      const rate = want > a ? 3.4 : 2.1;
      const step = rate * Math.min(dt || .016, .05);
      d.a = want > a ? Math.min(want, a + step) : Math.max(want, a - step);
    }
  },
  /* The hinge side: the far half of a pair mirrors; otherwise seeded off the
     tile so a parade varies. */
  doorFlip(d, list) {
    if (list.some(o => o.y === d.y && o.x === d.x - 1 && o.axis === 'h')) return true;
    if (list.some(o => o.y === d.y && o.x === d.x + 1 && o.axis === 'h')) return false;
    return ((d.x * 7 + d.y * 13) & 1) === 1;
  },
  /* The kit's door leaves, drawn at true scale — outside refScale(), because a
     32px sprite scaled by 32/44 is not pixel art any more. */
  doorLeaves(x0, y0, x1, y1) {
    const list = World.doorways; if (!list || !Tiles.ready) return;
    const c = this.ctx;
    for (const d of list) {
      if (d.x < x0 - 1 || d.x > x1 + 1 || d.y < y0 - 1 || d.y > y1 + 1) continue;
      const n = this.kitDoor(d); if (!n) continue;
      /* Shop leaves hang in the wall band on the threshold; a shut one sits higher
         than an open one. Not flipped. */
      if (n.startsWith('door.shop')) {
        /* Bottom-aligned on the threshold, where the shop window's step is (`shopwin`
           in data/world.js), so leaves of different heights share a foot. */
        /* One box and one lift for all four frames. */
        const r = Tiles.rects && Tiles.rects[n];
        const lift = (r ? r[3] : 42) / 2 - 19;
        Tiles.draw(c, n, (d.x + .5) * TILE, (d.y + .5) * TILE - lift);
      } else {
        Tiles.draw(c, n, (d.x + .5) * TILE, (d.y + .5) * TILE - TILE * .18, this.doorFlip(d, list));
      }
    }
  },
  /* Strip lighting: one cached pool sprite on a 7-tile grid, offset from the
     4-tile desk pitch so it does not band. (Drawn tubes read as faults.) */
  ceiling(x0, y0, x1, y1) {
    const c = this.ctx;
    const SP = 7, OFF = 3;
    const pool = this.glow('rgba(255,246,220,ALPHA)', Math.round(TILE * 4.3));
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = .14;
    const ty0 = Math.floor((y0 - OFF) / SP) * SP + OFF;
    const tx0 = Math.floor((x0 - OFF) / SP) * SP + OFF;
    for (let ty = ty0; ty <= y1 + SP; ty += SP) {
      for (let tx = tx0; tx <= x1 + SP; tx += SP) {
        if (ty < 0 || tx < 0 || ty >= MAPH || tx >= MAPW) continue;
        if (!World.zone[ty][tx] || World.solid[ty][tx]) continue;
        c.drawImage(pool, (tx + .5) * TILE - pool.width / 2, (ty + .5) * TILE - pool.height / 2);
      }
    }
    c.restore();
  },
  /* Outdoors, ceiling()'s counterpart: one flat wash over the view, following
     the sun. */
  daylight() {
    const c = this.ctx;
    const up = clamp(Sky.sunPos() * 1.8 + .12, 0, 1);
    if (up <= 0.01) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = .075 * up;
    c.fillStyle = '#a8c4e0';
    c.fillRect(Cam.x, Cam.y, Cam.w, Cam.h);
    c.restore();
  },
  /* ---------------- The sky, painted ----------------
     Sky knows the time and weather; these draw it, over an otherwise ordinary
     frame, so nothing else knows the sun sets.
     Water on the ground: wet surfaces darken and shine everywhere; puddles are
     picked off World.seed, the same places each shower and different per map. */
  wetGround(x0, y0, x1, y1) {
    const w = Sky.wet(), lie = Sky.lying();
    const k = Sky.kind();
    /* Splashes are in world coordinates with the puddles, so they stay on the
       road as you walk. */
    const splashing = this.animate && !World.indoors() && k.fall === 'rain' && k.rate >= 1;
    if (World.indoors() || (w < .04 && lie < .04 && !splashing)) return;
    const c = this.ctx;
    c.save();
    if (w > .04) {
      /* The sheen: one multiply and one screen. */
      c.globalAlpha = .16 * w;
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = '#6d7a8e';
      c.fillRect(Cam.x, Cam.y, Cam.w, Cam.h);
      c.globalCompositeOperation = 'source-over';
      /* Batched into four paths, filled once each. */
      const pool = [new Path2D(), new Path2D()], glint = [new Path2D(), new Path2D()];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!World.zone[y][x] || World.solid[y][x]) continue;
        const sd = World.seed[y][x];
        if (sd < .90) continue;
        /* Puddles gather on the road, not on the camber of a pavement — and
           not on grass, which is the other thing World.surf can say now. */
        const road = World.surfAt(x, y) === 'tarmac' ? 1 : 0;
        const px = x * TILE, py = y * TILE;
        const ex = px + TILE * (.3 + sd * .4), ey = py + TILE * (.35 + (1 - sd) * 3 % .4);
        const rx = TILE * (.16 + (sd - .9) * 2.4), ry = TILE * (.10 + (sd - .9) * 1.5);
        pool[road].moveTo(ex + rx * Math.cos(sd * 3), ey + rx * Math.sin(sd * 3));
        pool[road].ellipse(ex, ey, rx, ry, sd * 3, 0, 6.3);
        const gx = ex - 2, gy = ey - 2, grx = TILE * (.10 + (sd - .9) * 1.6);
        glint[road].moveTo(gx + grx * Math.cos(sd * 3), gy + grx * Math.sin(sd * 3));
        glint[road].ellipse(gx, gy, grx, TILE * (.05 + (sd - .9) * .9), sd * 3, 0, 6.3);
      }
      c.fillStyle = '#2b3a4e';
      c.globalAlpha = .20 * w; c.fill(pool[0]);
      c.globalAlpha = .34 * w; c.fill(pool[1]);
      c.fillStyle = '#9fc0dd';
      c.globalAlpha = .10 * w; c.fill(glint[0]);
      c.globalAlpha = .16 * w; c.fill(glint[1]);
    }
    if (lie > .04) {
      /* Lying snow, over the ground so a light fall shows the paving. */
      c.globalAlpha = .80 * lie;
      c.fillStyle = '#eef4fb';
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!World.zone[y][x] || World.solid[y][x]) continue;
        c.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      /* Tracks: the road keeps less snow than the pavement; verges keep all of it. */
      c.globalAlpha = .35 * lie;
      c.fillStyle = '#8f9cad';
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!World.zone[y][x] || World.solid[y][x]) continue;
        if (World.surfAt(x, y) === 'tarmac') c.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    if (splashing) {
      /* Each ground tile has its own seeded clock and ripples on some turns, so
         splashes come and go with nothing remembered. The ring widens over three
         fading passes. Snow and indoors are excluded by the gate above. */
      const t = this.t, dens = .10 * k.rate;
      c.strokeStyle = '#c8e0f5';
      c.lineWidth = 1;
      /* One walk sorting ripples into their three passes. */
      const rings = [new Path2D(), new Path2D(), new Path2D()];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!World.zone[y][x] || World.solid[y][x]) continue;
        const sd = World.seed[y][x];
        const cyc = t * 2.6 + sd * 11;
        const g = Math.floor(cyc), ph = cyc - g;
        const i = x * 3011 + y * 7919;
        if (this.noise(i, g) > dens) continue;
        const pass = Math.min(2, Math.floor(ph * 3));
        const cx = (x + this.noise(i + 1, g)) * TILE;
        const cy = (y + this.noise(i + 2, g)) * TILE;
        const r = 1.5 + ph * 5.5;
        rings[pass].moveTo(cx + r, cy);
        rings[pass].ellipse(cx, cy, r, r * .45, 0, 0, 6.3);
      }
      for (let pass = 0; pass < 3; pass++) {
        c.globalAlpha = (.30 - pass * .09) * Math.min(1, .35 + w);
        c.stroke(rings[pass]);
      }
    }
    c.restore();
  },
  /* The tideline: foam where sea meets land, drawn over the sea's bake because
     it moves. */
  shoreline(x0, y0, x1, y1) {
    if (World.indoors()) return;
    const c = this.ctx, rows = this.coast();
    const was = c.globalAlpha;
    const FOAM = 'rgba(232,240,244,1)', MID = 'rgba(232,240,244,.318)';
    for (let y = y0; y <= y1; y++) {
      const row = rows[y];
      if (!row) continue;
      for (let i = 0; i < row.length; i++) {
        const t = row[i];
        if (t.x < x0 || t.x > x1) continue;
        const px = t.x * TILE, py = y * TILE;
        /* Seeded per tile so the coast does not breathe in lockstep. Reduced motion
           freezes it at rest. */
        const wash = this.animate ? (Math.sin(this.t * 1.6 + t.phase) + 1) / 2 : .5;
        const reach = TILE * (.16 + wash * .22);
        /* One strip baked at crest strength; the swell only changes reach and alpha. */
        c.globalAlpha = was * (.32 + wash * .24);
        if (t.n) this.fade(c, px, py, TILE, reach, 'n', FOAM, MID);
        if (t.s) this.fade(c, px, py + TILE - reach, TILE, reach, 's', FOAM, MID);
        if (t.w) this.fade(c, px, py, reach, TILE, 'w', FOAM, MID);
        if (t.e) this.fade(c, px + TILE - reach, py, reach, TILE, 'e', FOAM, MID);
      }
    }
    c.globalAlpha = was;
  },
  /* Coastal sea tiles by row, with their land sides and phase, computed once
     per world. */
  coast() {
    if (this._coast && this._coast.world === World._solid) return this._coast.rows;
    const land = s => s === 'sand' || s === 'rock', rows = [];
    for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
      if (World.surfAt(x, y) !== 'sea') continue;
      const n = land(World.surfAt(x, y - 1)), s = land(World.surfAt(x, y + 1));
      const w = land(World.surfAt(x - 1, y)), e = land(World.surfAt(x + 1, y));
      if (!n && !s && !w && !e) continue;
      const phase = (this._hash('tide' + x + ',' + y) % 1000) / 1000 * 6.283;
      (rows[y] = rows[y] || []).push({ x, n, s, w, e, phase });
    }
    this._coast = { world: World._solid, rows };
    return rows;
  },
  /* The grade: one multiplied rectangle over everything, the light. lamps()
     takes it back off where lights fall. */
  skyGrade() {
    const g = Sky.grade(World.indoors());
    if (g.a < .004) return;
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = g.a;
    c.fillStyle = g.col;
    c.fillRect(Cam.x, Cam.y, Cam.w, Cam.h);
    c.restore();
    /* Fog lifts the blacks (screen, over the multiply), scaled by daylight: a
       white sheet at noon, almost nothing but lamplight at 2am. */
    const fog = Sky.fog();
    if (fog > .01) {
      const lit = clamp(Sky.sunPos() * 1.2 + .45, .16, 1);
      c.save();
      c.globalAlpha = fog * lit * (.34 + Math.sin(this.t * .12) * .03);
      c.fillStyle = World.indoors() ? '#b6bdc7' : '#c6cdd6';
      c.fillRect(Cam.x, Cam.y, Cam.w, Cam.h);
      c.restore();
    }
    /* Lightning: a whole-frame flash counted down in real time. */
    const st = Sky.state();
    if (st.flash > 0) {
      st.flash = Math.max(0, st.flash - (this.lastDt || .016));
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(.5, st.flash) * (World.indoors() ? .45 : 1);
      c.fillStyle = '#dfe8ff';
      c.fillRect(Cam.x, Cam.y, Cam.w, Cam.h);
      c.restore();
    }
  },
  /* The level's lampposts, found once per level (levelChanged()). */
  lampList() {
    if (this._lamps) return this._lamps;
    this._lamps = (World.objects || []).filter(o =>
      (o.fdef && o.fdef.sprite === 'obj.lamppost') || o.kind === 'lamp');
    return this._lamps;
  },
  /* The lamps, after the grade and with 'lighter': light put back, so pools
     and headlights show only in the dark. */
  lamps(x0, y0, x1, y1) {
    if (World.indoors() || !Sky.lampsOn()) return;
    const c = this.ctx;
    /* Fog makes lamps more visible, not less. */
    const haze = 1 + Sky.fog() * .8;
    const night = clamp(-Sky.sunPos() * 2.2 + .35, .15, 1) * haze;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const pool = this.glow('rgba(255,214,150,ALPHA)', Math.round(TILE * 3.4));
    this.lampList().forEach(o => {
      if (o.x < x0 - 4 || o.x > x1 + 4 || o.y < y0 - 4 || o.y > y1 + 4) return;
      /* The pool lands under the lamp head. One lamp in eight flickers, always the
         same one. */
      const bad = ((o.x * 31 + o.y * 17) & 7) === 3;
      const f = bad ? (.55 + Math.abs(Math.sin(this.t * 9.3 + o.x)) * .45) : 1;
      /* Posts are three tiles tall, anchored at the foot: a pool on the ground and a
         small bloom at the lantern. */
      const fx = (o.x + .5) * TILE;
      c.globalAlpha = .40 * night * f;
      c.drawImage(pool, fx - pool.width / 2, (o.y + .85) * TILE - pool.height / 2);
      c.globalAlpha = .26 * night * f;
      c.fillStyle = '#ffe6b0';
      c.beginPath(); c.arc(fx, (o.y - 1.7) * TILE, 6, 0, 6.3); c.fill();
    });
    /* Shop doorways with a floor behind them light up, brightest at the threshold.
       Here, after the grade, so the night does not crush it. */
    const doors = World.doorways || [];
    for (const d of doors) {
      if (!d.into || !ZONES[d.into]) continue;
      if (d.x < x0 - 2 || d.x > x1 + 2 || d.y < y0 - 2 || d.y > y1 + 2) continue;
      const op = this.doorOpening(d, doors); if (!op) continue;
      /* How much light depends on the swing (`a`, from R.swingDoors()): a line round
         a shut leaf, the whole inside when open. */
      const a = d.a || 0;
      const lit = .18 + a * .82;
      const warm = c.createLinearGradient(0, op.py, 0, op.py + TILE);
      warm.addColorStop(0, 'rgba(255,206,140,0)');
      warm.addColorStop(.4, 'rgba(255,206,140,' + (.22 * lit).toFixed(3) + ')');
      warm.addColorStop(1, 'rgba(255,220,164,' + (.62 * lit).toFixed(3) + ')');
      c.globalAlpha = night;
      c.fillStyle = warm;
      c.fillRect(op.x, op.y, op.w, op.h);
      /* The spill: an open door throws a widening wedge of light across the
         pavement. */
      if (a > .02) {
        const cx = op.x + op.w / 2, ty = op.py + TILE;
        const reach = TILE * (0.5 + a * 1.45);
        const half = op.w / 2;
        const spill = c.createLinearGradient(0, ty, 0, ty + reach);
        spill.addColorStop(0, 'rgba(255,214,150,' + (.30 * a).toFixed(3) + ')');
        spill.addColorStop(.45, 'rgba(255,214,150,' + (.12 * a).toFixed(3) + ')');
        spill.addColorStop(1, 'rgba(255,214,150,0)');
        c.globalAlpha = night;
        c.fillStyle = spill;
        c.beginPath();
        c.moveTo(cx - half, ty);
        c.lineTo(cx + half, ty);
        c.lineTo(cx + half + reach * .36, ty + reach);
        c.lineTo(cx - half - reach * .36, ty + reach);
        c.closePath(); c.fill();
      }
    }
    /* Lit shop windows: a warm gradient behind the glass, on any window sprite.
       The tile hash that picks a shop's paint decides whether it is lit, so most
       of a parade is on and a few are dark. */
    for (const o of (World.objects || [])) {
      if (o.kind !== 'shopwin') continue;
      if (o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 2 || o.y > y1 + 2) continue;
      if ((this.toneOf(o.x * 3, o.y * 7) & 3) === 1) continue;      /* this one is shut */
      /* North walls only: the only side whose face this projection shows. */
      if (o.mount !== 'wall' || o.wallSide !== 'n') continue;
      const f = o.fdef || FURN[o.kind] || {};
      const n = this.spriteOf(f, o), r = n && Tiles.rects && Tiles.rects[n];
      if (!r) continue;
      /* Where the sprite lands — the same sum the object pass does, so the
         light is in the glass and not beside it. */
      const cx = (o.x + .5) * TILE;
      const cy = (o.y + .5) * TILE - TILE * (typeof f.high === 'number' ? f.high : 1.45);
      const w = r[2] * .78, h = r[3] * .62;
      const g = c.createRadialGradient(cx, cy, 1, cx, cy, Math.max(w, h) / 2);
      g.addColorStop(0, 'rgba(255,216,152,.60)');
      g.addColorStop(.7, 'rgba(255,206,140,.30)');
      g.addColorStop(1, 'rgba(255,200,132,0)');
      c.globalAlpha = night;
      c.save();
      c.translate(cx, cy); c.scale(1, h / Math.max(w, h));
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, Math.max(w, h) / 2, 0, 6.3); c.fill();
      c.restore();
    }
    c.globalAlpha = 1;

    /* Headlights only on a car being driven. */
    (World.cars || []).forEach(car => {
      if (car !== Cars.driving && !car.traffic) return;
      if (!Cam.visible(car.x, car.y)) return;
      const d = car.def, hl = d.len / 2, hw = d.wid / 2;
      c.save();
      c.translate(car.x, car.y); c.rotate(car.a);
      const beam = c.createLinearGradient(hl, 0, hl + TILE * 3.6, 0);
      beam.addColorStop(0, 'rgba(255,242,214,.34)');
      beam.addColorStop(1, 'rgba(255,242,214,0)');
      c.fillStyle = beam;
      c.globalAlpha = night;
      c.beginPath();
      c.moveTo(hl - 2, -hw + 3); c.lineTo(hl + TILE * 3.6, -hw - TILE * 1.1);
      c.lineTo(hl + TILE * 3.6, hw + TILE * 1.1); c.lineTo(hl - 2, hw - 3);
      c.closePath(); c.fill();
      c.restore();
    });
    c.restore();
  },
  /* Rain and snow, in screen space after the camera pops, so rain does not
     slide as you walk. No particles: each drop is a function of its index and
     the clock; pausing freezes it. */
  /* A small integer hash (multiply-xor-shift), with `s` selecting a stream, so a
     drop's x, y, speed, length and lean are independent. */
  noise(i, s) {
    let h = Math.imul(i + 1, 374761393) + Math.imul(s + 1, 668265263) | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  },
  /* Three sheets at three distances: far is thin, slow and dim; near is bright
     and long. One path per sheet. */
  RAIN_LAYERS: [
    { share: .46, alpha: .26, width: 1,   speed: .74, len: .70 },
    { share: .34, alpha: .42, width: 1.2, speed: 1,   len: 1 },
    { share: .20, alpha: .62, width: 1.7, speed: 1.32, len: 1.45 },
  ],
  weather() {
    const k = Sky.kind();
    if (!k.fall || !k.rate) return;
    /* Indoors you do not get rained on. You get a window with water running
       down it, and that is drawn by wallArt(). */
    if (World.indoors()) return;
    /* No falling with Animation off; the weather still shows in the light, the
       ground and the window. */
    if (!this.animate) return;
    const c = this.ctx, W = Cam.w, H = Cam.h, t = this.t;
    const n = Math.round((k.fall === 'snow' ? 90 : 150) * k.rate);
    c.save();
    /* Positions wrap through a span wider than the screen, and are seeded across
       the whole span so the lean does not stripe one edge. */
    const xSpan = W + 120, ySpan = H + 80;
    if (k.fall === 'snow') {
      c.fillStyle = 'rgba(244,250,255,.85)';
      for (let i = 0; i < n; i++) {
        const rx = this.noise(i, 1), ry = this.noise(i, 2), rs = this.noise(i, 3);
        const rr = this.noise(i, 4), rd = this.noise(i, 5);
        /* Each flake has its own sway, period and fall. */
        const sp = 22 + rs * 40;
        const sway = Math.sin(t * (.45 + rd * .7) + rd * 12) * (7 + rd * 16);
        const x = ((i + rx) * (xSpan / n) + sway + t * (5 + rd * 9)) % xSpan - 60;
        const y = (ry * ySpan + t * sp) % ySpan - 40;
        c.globalAlpha = .30 + rr * .62;
        c.beginPath(); c.arc(x, y, .9 + rr * 2, 0, 6.3); c.fill();
      }
    } else {
      /* Rain and sleet. Sleet is rain that has given up: shorter, slower,
         paler, and it comes at you sideways because it always does. */
      const sleet = k.fall === 'sleet';
      const lean = sleet ? 0.42 : 0.22;
      const base = sleet ? 430 : 700, blen = sleet ? 7 : 12;
      const col = sleet ? '219,232,245' : '178,206,235';
      let from = 0;
      for (const L of this.RAIN_LAYERS) {
        const upto = Math.min(n, from + Math.round(n * L.share));
        c.strokeStyle = `rgba(${col},${L.alpha * (sleet ? 1.3 : 1)})`;
        c.lineWidth = L.width * (sleet ? 1.2 : 1);
        c.beginPath();
        /* Each drop gets its own slice of the width, jittered within it: stratified,
           so the shower has no clumps or gaps. */
        const slice = xSpan / Math.max(1, upto - from);
        for (let i = from; i < upto; i++) {
          const rx = this.noise(i, 1), ry = this.noise(i, 2);
          const rs = this.noise(i, 3), rl = this.noise(i, 4), rn = this.noise(i, 5);
          const sp = base * L.speed * (.78 + rs * .5);
          const len = blen * L.len * (.62 + rl * .85);
          /* Its own lean, within a few degrees of the shower's. Rain that all
             leans by exactly the same amount is a hatching pattern. */
          const sl = lean * (.82 + rn * .36);
          const y = (ry * ySpan + t * sp) % ySpan - 40;
          const x = ((i - from + rx) * slice + y * sl) % xSpan - 60;
          c.moveTo(x, y); c.lineTo(x - len * sl, y - len);
        }
        c.stroke();
        from = upto;
      }
    }
    c.restore();
  },
  /* Atlas keys its rasters by level and season, so only the lamp list resets. */
  levelChanged() { this._lamps = null; },
  /* Desks: a surface and a partition behind each. */
  desks(x0, y0, x1, y1) {
    this.refScale(TILE => {
      const list = World.desks; if (!list) return;
      const c = this.ctx;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d.x + d.w < x0 - 1 || d.x > x1 + 1 || d.y < y0 - 2 || d.y > y1 + 1) continue;
        const px = d.x * TILE + 3, py = d.y * TILE + 4;
        const w = d.w * TILE - 6, h = TILE - 6;

        /* Partition behind: fabric panel, lit along its top edge. Drawn first so
           the desk surface overlaps its foot. */
        const ph = 13;
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.fillRect(px - 2, py - ph + 3, w + 4, ph);
        c.fillStyle = '#3a4357';
        c.fillRect(px - 2, py - ph, w + 4, ph);
        c.fillStyle = 'rgba(255,255,255,.10)';
        c.fillRect(px - 2, py - ph, w + 4, 2);
        c.fillStyle = 'rgba(0,0,0,.18)';
        c.fillRect(px - 2, py - 2, w + 4, 2);

        /* Contact shadow, then the desktop itself. */
        c.fillStyle = 'rgba(0,0,0,.30)';
        c.beginPath(); c.roundRect(px + 2, py + 5, w, h, 6); c.fill();
        /* Warmer and lighter than the carpet, or the desks vanish. */
        const g = c.createLinearGradient(0, py, 0, py + h);
        g.addColorStop(0, '#6d7183');
        g.addColorStop(1, '#4c5162');
        c.fillStyle = g;
        c.beginPath(); c.roundRect(px, py, w, h, 6); c.fill();
        /* Laminate edge: a light top lip and a dark front lip. */
        c.fillStyle = 'rgba(255,255,255,.13)';
        c.beginPath(); c.roundRect(px, py, w, 3, 3); c.fill();
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.beginPath(); c.roundRect(px, py + h - 3, w, 3, 3); c.fill();
        /* A keyboard in front of the monitor. */
        c.fillStyle = 'rgba(20,25,34,.55)';
        c.beginPath(); c.roundRect(px + 7, py + h - 13, TILE - 20, 9, 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.07)';
        c.fillRect(px + 9, py + h - 11, TILE - 24, 1.5);
        /* Clutter seeded per desk, stable across frames. */
        const s = (i * 2654435761) % 97 / 97;
        const cx2 = px + w - 30;
        if (s > .18) {                                   /* a mug */
          c.fillStyle = ['#c9d3e4', '#d8b48a', '#8ab6d8', '#cf8f8f'][i % 4];
          c.beginPath(); c.arc(cx2 + 5, py + 11, 4, 0, 6.3); c.fill();
          c.fillStyle = 'rgba(0,0,0,.35)';
          c.beginPath(); c.arc(cx2 + 5, py + 11, 2.1, 0, 6.3); c.fill();
        }
        if (s > .45) {                                   /* a stack of paper */
          c.fillStyle = 'rgba(232,236,244,.72)';
          c.fillRect(px + 9, py + 7, 13, 9);
          c.fillStyle = 'rgba(0,0,0,.2)';
          c.fillRect(px + 10, py + 9, 9, 1); c.fillRect(px + 10, py + 12, 7, 1);
        }
        if (s > .72) {                                   /* a sticky note */
          c.fillStyle = ['#ffe08a', '#b9e6a1', '#ffb8c8'][i % 3];
          c.fillRect(cx2 - 8, py + h - 15, 8, 8);
        }
        /* Yours has a name card on it. Thirty-two identical desks is the joke;
           being unable to find your own was not meant to be part of it. */
        if (d.mine) {
          c.fillStyle = 'rgba(90,212,138,.16)';
          c.beginPath(); c.roundRect(px, py, w, h, 6); c.fill();
          c.strokeStyle = 'rgba(90,212,138,.5)'; c.lineWidth = 1.5;
          c.beginPath(); c.roundRect(px, py, w, h, 6); c.stroke();
          c.fillStyle = '#e9eef7';
          c.fillRect(px + w - 27, py + h - 13, 21, 9);
          c.fillStyle = 'rgba(0,0,0,.5)';
          c.fillRect(px + w - 25, py + h - 11, 17, 1.5);
          c.fillRect(px + w - 25, py + h - 8, 11, 1.5);
        }
      }
    });
  },
  /* A slab with a lit top edge and a dark front lip — the same read as the
     desks, so a table looks like it belongs to the same office. */
  slab(px, py, w, h, top, bot, r = 6) {
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.beginPath(); c.roundRect(px + 2, py + 5, w, h, r); c.fill();
    const g = c.createLinearGradient(0, py, 0, py + h);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    c.fillStyle = g;
    c.beginPath(); c.roundRect(px, py, w, h, r); c.fill();
    c.fillStyle = 'rgba(255,255,255,.13)';
    c.beginPath(); c.roundRect(px, py, w, 3, 3); c.fill();
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.beginPath(); c.roundRect(px, py + h - 3, w, 3, 3); c.fill();
  },
  /* A run of tables is an end, middles and an end; the drawn slab is used where
     the atlas has none. */
  tables(x0, y0, x1, y1) {
    const list = World.tables; if (!list) return;
    const vis = list.filter(t =>
      !(t.x + t.w < x0 - 1 || t.x > x1 + 1 || t.y < y0 - 1 || t.y > y1 + 1));
    const kit = Tiles.has('obj.table.m');
    if (kit) {
      for (const t of vis) {
        for (let i = 0; i < t.w; i++) {
          const piece = t.w === 1 ? 'obj.table.m'
            : i === 0 ? 'obj.table.l' : i === t.w - 1 ? 'obj.table.r' : 'obj.table.m';
          Tiles.draw(this.ctx, piece, (t.x + i + .5) * TILE, (t.y + .5) * TILE);
        }
      }
      return;
    }
    this.refScale(TILE => {
      for (const t of vis)
        this.slab(t.x * TILE + 3, t.y * TILE + 5, t.w * TILE - 6, TILE - 10, '#6f6152', '#4c433a', 8);
    });
  },
  /* Kit units in the break room only: the same run is also the toilets' vanity
     and the training bench. One answer, shared with the object pass (how high
     a kettle stands). */
  /* The zone a wall with no room beside it is tinted as: `base: true` on a
     ZONES row, or the first one. */
  /* Asked for every wall tile that has no room of its own to take a finish
     from, so it is remembered; rebake() forgets it with the tiles. */
  baseZone() {
    if (this._baseZone && ZONES[this._baseZone]) return this._baseZone;
    return (this._baseZone = Object.keys(ZONES).find(k => ZONES[k].base) || Object.keys(ZONES)[0]);
  },
  /* `kitchen: true` on a ZONES row is what makes its worktops kitchen units. */
  kitRun(t) { const z = t && ZONES[World.zoneAt(t.x, t.y)]; return !!(z && z.kitchen) && Tiles.has('obj.counter'); },
  /* The run under a tile, or null. World.worktops is a handful of entries — a
     scan is cheaper than another grid to keep in step with it. */
  worktopAt(x, y) {
    const list = World.worktops || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.y === y && x >= t.x && x < t.x + t.w) return t;
    }
    return null;
  },
  /* How far above its tile's centre a worktop's surface is: 11 for the drawn
     slab, and the kit's kitchen unit is measured separately so things stand on
     its worktop, not its doors. */
  SLAB_TOP: 11,
  KIT_TOP: 26,
  worktopTop(x, y) { return this.kitRun(this.worktopAt(x, y)) ? this.KIT_TOP : this.SLAB_TOP; },

  worktops(x0, y0, x1, y1) {
    const list = World.worktops; if (!list) return;
    const kit = [];
    for (const t of list) {
      if (t.x + t.w < x0 - 1 || t.x > x1 + 1 || t.y < y0 - 2 || t.y > y1 + 1) continue;
      if (this.kitRun(t)) kit.push(t); else kit.push(null);
    }
    let i = 0;
    this.refScale(TILE => {
      const c = this.ctx;
      for (const t of list) {
        if (t.x + t.w < x0 - 1 || t.x > x1 + 1 || t.y < y0 - 2 || t.y > y1 + 1) continue;
        if (kit[i++]) continue;                     /* drawn from the kit below */
        const px = t.x * TILE + 2, py = t.y * TILE + 8, w = t.w * TILE - 4, h = TILE - 14;
        if (World.solid[t.y - 1] && World.solid[t.y - 1][t.x]) {
          c.fillStyle = 'rgba(212,222,238,.10)';
          c.fillRect(px, py - 9, w, 9);
        }
        /* One mirror over the row of basins, on the wall face below the counter (the
           basins are on the room's last row). */
        if ((ZONES[World.zoneAt(t.x, t.y)] || {}).washroom
            && World.solid[t.y + 1] && World.solid[t.y + 1][t.x]) {
          const my = (t.y + 1) * TILE + 2, mh = 13;
          c.fillStyle = 'rgba(24,32,42,.85)';
          c.fillRect(px - 2, my - 2, w + 4, mh + 4);
          c.fillStyle = 'rgba(126,158,192,.55)';
          c.fillRect(px, my, w, mh);
          /* Two streaks of ceiling light down the glass, per basin, which is
             the only thing that makes a rectangle read as a mirror. */
          c.fillStyle = 'rgba(232,242,255,.22)';
          /* `b`, not `i`, to avoid shadowing the run counter. */
          for (let b = 0; b < t.w; b++) {
            const bx = px + b * TILE + TILE * .2;
            c.beginPath();
            c.moveTo(bx, my + mh); c.lineTo(bx + 9, my);
            c.lineTo(bx + 14, my); c.lineTo(bx + 5, my + mh);
            c.closePath(); c.fill();
          }
          c.fillStyle = 'rgba(236,244,255,.5)'; c.fillRect(px, my, w, 1.5);
          c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(px, my + mh - 1.5, w, 1.5);
        }
        this.slab(px, py, w, h, '#7c8496', '#565d6c', 4);
      }
    });
    for (const t of kit) {
      if (!t) continue;
      for (let n = 0; n < t.w; n++) {
        Tiles.draw(this.ctx, 'obj.counter', (t.x + n + .5) * TILE, (t.y + .5) * TILE);
      }
    }
  },
  /* The reception and security counters. A counter is a desk you stand behind,
     so it gets a taller front panel and a strip of signage. */
  counter(t) {
    this.refScale(TILE => {
      const c = this.ctx;
      {
        const px = t.x * TILE + 2, py = t.y * TILE + 6, w = t.w * TILE - 4, h = TILE - 12;
        this.slab(px, py, w, h, '#5b6b86', '#38445a', 5);
        /* Front panel, standing proud of the top so it reads as a counter you
           cannot see over rather than a table you can. */
        c.fillStyle = 'rgba(16,21,30,.55)';
        c.beginPath(); c.roundRect(px + 3, py + h - 2, w - 6, 9, 3); c.fill();
        c.fillStyle = 'rgba(255,255,255,.07)';
        c.fillRect(px + 5, py + h, w - 10, 1.5);
        if (t.label) {
          c.font = '600 8px ui-monospace,Consolas,monospace';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = 'rgba(223,230,242,.5)';
          c.fillText(t.label, px + w / 2, py + h + 3.5);
        }
      }
    });
  },
  /* Toilet cubicles: three partitions and an open door, so the toilet shows. */
  cubicles(x0, y0, x1, y1) {
    /* Partition alpha by the wall rule, computed here in real TILE units before
       the 44px drawing below. */
    const wallAlpha = new Map();
    for (const o of World.objects) {
      if (o.kind !== 'loo') continue;
      const rel = (P.y - o.y * TILE) / (TILE * 1.6);
      wallAlpha.set(o, Math.max(.15, Math.min(1, rel + .35)));
    }
    this.refScale(TILE => {
      const c = this.ctx;
      for (const o of World.objects) {
        if (o.kind !== 'loo') continue;
        if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
        /* A stall backs onto a wall; the accessible toilet is a room, not a stall. */
        if (!World.solid[o.y - 1] || !World.solid[o.y - 1][o.x]) continue;
        const px = o.x * TILE, py = o.y * TILE;
        const T = 5;                                  /* partition thickness */
        /* Inside of the stall, a shade off the room so the opening reads. */
        c.fillStyle = 'rgba(10,14,19,.30)';
        c.fillRect(px + T, py - 4, TILE - T * 2, TILE - 4);
        /* Back and sides. Melamine: light face, dark edge. */
        c.fillStyle = '#5d6980';
        c.fillRect(px, py - 8, TILE, T + 3);          /* back */
        c.fillRect(px, py - 8, T, TILE + 2);          /* left */
        c.fillRect(px + TILE - T, py - 8, T, TILE + 2);
        /* The partition, two tiles tall, its upper part fading like the wall behind. */
        c.save();
        c.globalAlpha = wallAlpha.get(o);
        c.fillStyle = '#5d6980';
        c.fillRect(px, py - 8 - TILE, TILE, TILE);          /* back ext. */
        c.fillRect(px, py - 8 - TILE, T, TILE);             /* left ext. */
        c.fillRect(px + TILE - T, py - 8 - TILE, T, TILE);  /* right ext. */
        c.fillStyle = 'rgba(255,255,255,.10)';
        c.fillRect(px, py - 8 - TILE, TILE, 2);
        c.restore();
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.fillRect(px, py + TILE - 6, T, 6);
        c.fillRect(px + TILE - T, py + TILE - 6, T, 6);
        /* The door, hinged left and standing open into the room. */
        c.fillStyle = '#6b7790';
        c.fillRect(px + T - 1, py + TILE - 6, TILE - T * 2 - 8, T);
        c.fillStyle = 'rgba(0,0,0,.3)';
        c.fillRect(px + T - 1, py + TILE - 6 + T, TILE - T * 2 - 8, 2);
        /* Vacant/engaged. The engaged one also gets the kit's shut door below; the
           indicator stays in case the atlas has not loaded. */
        c.fillStyle = o.n === 1 && G.today.looClosed ? '#ff5f56' : '#5ad48a';
        c.fillRect(px + TILE - T - 4, py + TILE - 7, 3, 3);
      }
    });
    /* The locked cubicle drawn shut, in TILE space (kit art). Only the engaged
       one: open stalls show their pan. */
    for (const o of World.objects) {
      if (o.kind !== 'loo' || !(o.n === 1 && G.today.looClosed)) continue;
      if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
      if (!World.solid[o.y - 1] || !World.solid[o.y - 1][o.x]) continue;
      Tiles.draw(this.ctx, 'loo.door', (o.x + .5) * TILE, (o.y + .5) * TILE);
    }
  },
  /* How much of an object behind a wall you may see. Walls you see the front of
     extend a tile into the row above, which is real floor with furniture; the
     drawables come after the wall pass and would paint over it. So such objects
     fade on the wall's own ramp in the opposite direction, crossing over while
     you stand in the wall band. */
  veil(o) {
    if (o.mount === 'wall' || o.onTable) return 1;
    return this.veilAt(o.x, o.y);
  },
  /* The same for anything standing on a tile, mostly colleagues. For a person
     0 means "clip at the top of the course" (colleague()), since they are
     taller than it. The player is never veiled. */
  veilAt(x, y) {
    const wy = y + 1;
    if (wy + 1 >= MAPH || !World.solid[wy] || !World.solid[wy][x]) return 1;
    /* Only a wall with a room below it grows the extension — see the `below`
       branch of the wall loop. Interior mass has nothing stacked on it. */
    if (World.solid[wy + 1][x] || !World.zone[wy + 1][x]) return 1;
    const rel = (P.y - wy * TILE) / (TILE * 1.6);
    return Math.max(0, Math.min(1, (1 - Math.max(.15, Math.min(1, rel + .35))) * 2.2));
  },

  /* One colleague. The wall clip draws them twice (above the course and behind
     it), so everything hanging off them (shadow, ring, marker, name, bubble) is
     here and matches. */
  colleague(n, hi) {
    const c = this.ctx;
    const sprite = Sprites.has(n.id);
    /* Stopped on a chair is seated. `at` is where they are drawn; interaction
       still uses n.x/n.y. */
    const seat = sprite && !n.walking
      ? Sprites.seatedAt(Math.floor(n.x / TILE), Math.floor(n.y / TILE)) : null;
    const at = seat ? Sprites.seatPos(seat) : { x: n.x, y: n.y };
    this.shadow(at.x, at.y + 13, 12, 5);
    /* The LPC walk cycle carries its own vertical movement, so the bob is
       only for the emoji fallback — doubling them reads as a limp. */
    const bob = sprite ? 0
      : n.walking && this.animate ? Math.abs(Math.sin(n.bob * 2)) * 3.5 : Math.sin(n.bob * .5) * 1;
    const box = Sprites.bounds(n.id, at.x, at.y);
    let body;
    if (sprite) {
      /* Standing colleagues breathe; walkers and sitters do not. Off with Animation. */
      const nf = seat ? Sprites.sit(n.id)
        : n.walking ? Sprites.frame(n.id, this.animate, n.step)
        : this.animate ? Sprites.breath(n.id) : 0;
      /* A hop for joy when they are having a wonderful day (Moves.joy). */
      const nlift = seat ? (this.animate ? Sprites.breathLift(n.id) : 0) : Moves.joy(n);
      /* A seated person faces the chair's `face` (0 up, 1 left, 2 down, 3 right),
         default 0 (towards the desk). Somebody hit turns to see who did it
         (Guns.watch twist). */
      body = () => Sprites.draw(c, n.id, seat ? (seat.face ?? 0) : n.dir ?? 2, nf, at.x, at.y - nlift,
        seat ? null : Guns.watchOf(n));
    } else body = () => this.emoji(n.face, at.x, at.y - bob, 29);
    if (hi === n) this.rim(body, ...this.RIM_PERSON);
    if (!this.cinema && this.questMark(n)) this.emoji('❗', at.x + 13, box.y - 4, 15);
    /* A need, mood or inspiration icon over the head, opposite the quest mark,
       not while speaking. */
    else if (!this.cinema && !(n.sayT > 0)) {
      const ic = Mind.icon(n);
      if (ic) {
        const ix = at.x + 14, iy = box.y - 2 + (this.animate ? Math.sin(n.bob * .8) * 1.5 : 0);
        c.save(); c.fillStyle = 'rgba(12,18,28,.62)';
        c.beginPath(); c.arc(ix, iy, 9, 0, Math.PI * 2); c.fill(); c.restore();
        this.emoji(ic, ix, iy, 12);
      }
    }
    body();
    /* NB: canvas font strings cannot contain CSS custom properties — an
       invalid string is ignored and the previous (emoji-sized) font sticks. */
    if (!this.cinema) {
      c.font = NAME_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)';
      c.strokeText(n.name, at.x, at.y + 26);
      c.fillStyle = n.def.colour ? n.def.colour : 'rgba(223,230,242,.82)';
      c.fillText(n.name, at.x, at.y + 26);
    }
    if (n.sayT > 0) this.bubble(at.x, at.y - 34, n.say, Math.min(1, n.sayT));
  },
  /* One person on the street; drawn twice by the wall clip, like colleague(). */
  stranger(p, hi) {
    const c = this.ctx;
    this.shadow(p.x, p.y + 13, 12, 5);
    let body;
    if (Sprites.has(p.sprite)) {
      const f = p.walking ? Sprites.frame(p.sprite, this.animate, p.step)
        : this.animate ? Sprites.breath(p.sprite) : 0;
      body = () => Sprites.draw(c, p.sprite, p.dir ?? 2, f, p.x, p.y, Guns.watchOf(p));
    } else body = () => this.emoji('🧑', p.x, p.y, 28);
    if (hi === p) this.rim(body, ...this.RIM_PERSON);
    body();
    /* No names over strangers. */
    if (p.sayT > 0) this.bubble(p.x, p.y - 34, p.say, Math.min(1, p.sayT));
  },
  /* ---- The drawn things ----
     Where the emoji is worse than nothing. Each is seeded off its own id, so it
     is stable and no two are alike. */
  wallArt(o, ex, ey, size) {
    const c = this.ctx;
    const rnd = this._rand(this._hash(o.id + o.kind));
    const r1 = rnd(), r2 = rnd(), r3 = rnd();
    /* On a side wall it is squashed to its edge. */
    const side = o.wallSide;
    const sq = (side === 'w' || side === 'e') ? .44 : 1;
    c.save();
    c.translate(ex, ey);
    c.scale(sq, 1);
    /* A poster nobody has straightened since it went up. Boards and screens
       are screwed to the wall and stay level. */
    if (o.art === 'poster') c.rotate((r3 - .5) * .13);
    const frame = (w, h, edge, fill) => {
      c.fillStyle = 'rgba(0,0,0,.45)';
      c.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
      c.fillStyle = edge; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = fill; c.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
      c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(-w / 2, -h / 2, w, 1.5);
    };
    switch (o.art) {
      case 'poster': {
        const w = size * .82, h = size * 1.12;
        const tint = ['#4da3ff', '#5ad48a', '#ffb347', '#b48cff', '#ff5f56'][Math.floor(r1 * 5)];
        frame(w, h, '#20262f', '#e9eef7');
        /* The photograph, the enormous single word, and the small print
           nobody has read since 2016. */
        c.fillStyle = tint;
        c.globalAlpha = .55; c.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * .42); c.globalAlpha = 1;
        c.fillStyle = '#2b3444';
        c.fillRect(-w / 2 + 4, -h / 2 + h * .52, (w - 8) * (.5 + r2 * .45), 4);
        c.fillStyle = 'rgba(43,52,68,.55)';
        for (let i = 0; i < 3; i++)
          c.fillRect(-w / 2 + 4, -h / 2 + h * .66 + i * 4, (w - 8) * (.4 + rnd() * .55), 1.5);
        break;
      }
      case 'board': {
        /* Cork, and four things pinned to it at four different angles by four
           people who each thought theirs was the important one. */
        const w = size * 1.12, h = size * .84;
        frame(w, h, '#2a2018', '#8a6b46');
        for (let i = 0; i < 4; i++) {
          const pw = 6 + rnd() * 5, ph = 7 + rnd() * 4;
          const x = -w / 2 + 5 + rnd() * (w - 12), y = -h / 2 + 4 + rnd() * (h - 12);
          c.save(); c.translate(x, y); c.rotate((rnd() - .5) * .4);
          c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-pw / 2 + 1, -ph / 2 + 1, pw, ph);
          c.fillStyle = ['#e9eef7', '#e9eef7', '#ffe08a', '#b9e6a1'][i];
          c.fillRect(-pw / 2, -ph / 2, pw, ph);
          c.fillStyle = 'rgba(0,0,0,.35)';
          c.fillRect(-pw / 2 + 1.5, -ph / 2 + 2, pw - 3, 1);
          c.fillRect(-pw / 2 + 1.5, -ph / 2 + 4.5, pw - 5, 1);
          c.fillStyle = '#ff5f56';
          c.beginPath(); c.arc(0, -ph / 2 + 1.5, 1.3, 0, 6.3); c.fill();
          c.restore();
        }
        break;
      }
      case 'chart': {
        /* Bars going up and a line going down, or the other way round. It has
           never mattered which. */
        const w = size * 1.16, h = size * .8;
        frame(w, h, '#20262f', '#f2f5fa');
        const n = 5, bw = (w - 12) / n;
        for (let i = 0; i < n; i++) {
          const bh = (h - 12) * (.25 + rnd() * .7);
          c.fillStyle = i === n - 1 ? '#ff5f56' : '#4da3ff';
          c.fillRect(-w / 2 + 5 + i * bw, h / 2 - 5 - bh, bw - 2, bh);
        }
        c.strokeStyle = 'rgba(20,26,36,.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-w / 2 + 4, h / 2 - 5); c.lineTo(w / 2 - 4, h / 2 - 5); c.stroke();
        break;
      }
      case 'window': {
        /* The window keeps the sky's time and weather, so it and the town outside
           always agree. */
        const w = size * 1.06, h = size * .86;
        const view = Sky.windowSky();
        const sky = c.createLinearGradient(0, -h / 2, 0, h / 2);
        sky.addColorStop(0, view.top);
        sky.addColorStop(1, view.bot);
        frame(w, h, '#cdd6e4', '#8fb4d8');
        c.fillStyle = sky; c.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
        /* The building opposite, which is the whole view. */
        c.fillStyle = 'rgba(30,38,52,.45)';
        c.fillRect(-w / 2 + 3, h / 2 - 3 - h * .3, w - 6, h * .3);
        c.fillStyle = 'rgba(255,214,120,' + (view.lit ? .5 : .16) + ')';
        for (let i = 0; i < 6; i++)
          c.fillRect(-w / 2 + 6 + rnd() * (w - 14), h / 2 - 4 - rnd() * h * .26, 2, 2);
        /* Water on the glass, or snow going past it. Two lines' worth, and it
           is the difference between a window and a picture of one. */
        const wk = Sky.kind();
        if (wk.fall === 'snow') {
          c.fillStyle = 'rgba(250,253,255,.8)';
          for (let i = 0; i < 7; i++) {
            const fx = -w / 2 + 5 + rnd() * (w - 10);
            const fy = -h / 2 + 4 + ((rnd() * h + this.t * 9) % (h - 8));
            c.fillRect(fx, fy, 1.6, 1.6);
          }
        } else if (wk.fall) {
          c.strokeStyle = 'rgba(210,232,250,.45)'; c.lineWidth = 1;
          c.beginPath();
          for (let i = 0; i < 9; i++) {
            const fx = -w / 2 + 5 + rnd() * (w - 10);
            const fy = -h / 2 + 4 + ((rnd() * h + this.t * (22 + rnd() * 30)) % (h - 8));
            c.moveTo(fx, fy); c.lineTo(fx - 1, fy - 4 - rnd() * 4);
          }
          c.stroke();
        }
        /* Frame: one mullion, one transom, and a sill you could put a mug on. */
        c.fillStyle = '#cdd6e4';
        c.fillRect(-1.5, -h / 2 + 3, 3, h - 6); c.fillRect(-w / 2 + 3, -2, w - 6, 3);
        c.fillStyle = 'rgba(255,255,255,.18)';
        c.beginPath(); c.moveTo(-w / 2 + 4, h / 2 - 4); c.lineTo(w / 2 - 4, -h / 2 + 4);
        c.lineTo(w / 2 - 4, -h / 2 + 10); c.lineTo(-w / 2 + 10, h / 2 - 4); c.closePath(); c.fill();
        c.fillStyle = '#b6c1d2'; c.fillRect(-w / 2 - 2, h / 2 - 1, w + 4, 3);
        break;
      }
      case 'screen': {
        const w = size * 1.0, h = size * .74;
        frame(w, h, '#0f141b', '#10161e');
        c.fillStyle = 'rgba(77,163,255,' + (.14 + Math.abs(Math.sin(this.t * 1.6 + r1 * 6)) * .1) + ')';
        c.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
        c.fillStyle = 'rgba(200,225,255,.55)';
        for (let i = 0; i < 3; i++)
          c.fillRect(-w / 2 + 6, -h / 2 + 7 + i * 5, (w - 12) * (.35 + rnd() * .6), 1.5);
        c.fillStyle = '#5ad48a';
        c.beginPath(); c.arc(w / 2 - 4, h / 2 - 4, 1.2, 0, 6.3); c.fill();
        break;
      }
      case 'roll': {
        /* Bracket, roll, and the tail hanging off it. The one with something
           written on it has something written on it. */
        const w = size * .95, h = size * .72;
        c.fillStyle = 'rgba(0,0,0,.4)';
        c.beginPath(); c.ellipse(1, h * .5, w * .34, 3, 0, 0, 6.3); c.fill();
        c.fillStyle = '#9aa6ba'; c.fillRect(-w / 2, -h / 2, 3, h * .8);
        c.fillRect(w / 2 - 3, -h / 2, 3, h * .8);
        c.fillStyle = '#b7c2d4'; c.fillRect(-w / 2, -h / 2, w, 3);
        /* The paper. */
        c.fillStyle = '#f4f6fa';
        c.beginPath(); c.ellipse(0, h * .06, w * .33, h * .33, 0, 0, 6.3); c.fill();
        c.fillStyle = 'rgba(0,0,0,.18)';
        c.beginPath(); c.ellipse(0, h * .06, w * .11, h * .11, 0, 0, 6.3); c.fill();
        c.fillStyle = '#e8ecf4';
        c.fillRect(w * .22, h * .06, w * .13, h * .48);
        /* The flap, and on one of them, the writing. */
        c.fillStyle = '#aab5c8'; c.fillRect(-w * .38, -h * .34, w * .76, 4);
        if (o.use === 'poopRoll') {
          c.fillStyle = 'rgba(30,40,120,.85)';
          c.fillRect(-w * .30, -h * .33, w * .40, 1.4);
          c.fillRect(-w * .30, -h * .27, w * .28, 1.2);
          /* the arrow, pointing at the toilet roll */
          c.fillRect(w * .14, -h * .30, 1.2, h * .16);
          c.fillRect(w * .11, -h * .18, 4, 1.2);
        }
        break;
      }
      case 'sign': {
        /* A laminated sign: plate, coloured band, two lines; a stand only when it is
           free-standing. */
        const w = size * 1.04, h = size * .66;
        if (!side) {
          c.fillStyle = 'rgba(0,0,0,.35)';
          c.beginPath(); c.ellipse(0, h * .74, w * .3, 3, 0, 0, 6.3); c.fill();
          c.fillStyle = '#8c97a8'; c.fillRect(-1.5, h * .3, 3, h * .44);
        }
        frame(w, h, '#20262f', '#f2f5fa');
        c.fillStyle = ['#4da3ff', '#ff5f56', '#ffb347'][Math.floor(r1 * 3)];
        c.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * .26);
        c.fillStyle = 'rgba(43,52,68,.6)';
        for (let i = 0; i < 2; i++)
          c.fillRect(-w / 2 + 4, h * .04 + i * 4, (w - 8) * (.55 + rnd() * .4), 1.5);
        break;
      }
      case 'dryer': {
        /* The hand dryer: a wall box, a nozzle, a standby light. */
        const w = size * .96, h = size * .8;
        frame(w, h, '#1b2028', '#ccd5e2');
        c.fillStyle = 'rgba(20,26,36,.42)';
        for (let i = 0; i < 3; i++) c.fillRect(-w / 2 + 4, -h / 2 + 5 + i * 3, w - 8, 1.4);
        /* The nozzle, and the draught coming out of it. */
        c.fillStyle = '#8792a4';
        c.fillRect(-w * .26, h / 2 - 3, w * .52, 4);
        c.fillStyle = 'rgba(180,205,240,.30)';
        c.fillRect(-w * .18, h / 2 + 1, w * .36, 3);
        c.fillStyle = '#5ad48a';
        c.beginPath(); c.arc(w / 2 - 4, h / 2 - 6, 1.2, 0, 6.3); c.fill();
        break;
      }
      case 'loo': {
        /* The pan inside a cubicle, seen from above: cistern at the back with
           the flush plate on it, the seat ring, and the water. */
        const w = size * .68, h = size * .96;
        c.fillStyle = 'rgba(0,0,0,.32)';
        c.beginPath(); c.ellipse(1, h * .34, w * .5, h * .16, 0, 0, 6.3); c.fill();
        c.fillStyle = '#dbe3ee';
        c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h * .36, 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-w / 2, -h / 2, w, 1.5);
        c.fillStyle = '#9fabbd'; c.fillRect(-3, -h * .40, 6, 3.5);
        c.fillStyle = 'rgba(20,26,36,.20)'; c.fillRect(-w / 2, -h * .16, w, 2);
        c.fillStyle = '#eef2f8';
        c.beginPath(); c.ellipse(0, h * .14, w * .46, h * .30, 0, 0, 6.3); c.fill();
        c.strokeStyle = '#c3cddb'; c.lineWidth = 2.2;
        c.beginPath(); c.ellipse(0, h * .14, w * .33, h * .21, 0, 0, 6.3); c.stroke();
        c.fillStyle = 'rgba(96,152,196,.42)';
        c.beginPath(); c.ellipse(0, h * .16, w * .21, h * .12, 0, 0, 6.3); c.fill();
        break;
      }
      case 'graf': {
        /* Years of biro on tile, over each other at every angle. */
        const w = size * 1.1, h = size * .9;
        for (let i = 0; i < 11; i++) {
          const y = -h / 2 + 2 + rnd() * (h - 4);
          const x = -w / 2 + 1 + rnd() * (w * .35);
          const len = (w - 4) * (.3 + rnd() * .62);
          c.strokeStyle = rnd() < .78 ? 'rgba(38,52,120,.75)' : 'rgba(24,26,32,.6)';
          c.lineWidth = rnd() < .3 ? 1.4 : .9;
          c.beginPath();
          c.moveTo(x, y);
          /* Handwriting: three little humps rather than a straight rule, or it
             reads as a barcode. */
          for (let s = 1; s <= 3; s++)
            c.lineTo(x + len * (s / 3), y + (rnd() - .5) * 2.4);
          c.stroke();
        }
        /* The one somebody went over twice so it would still be there. */
        c.strokeStyle = 'rgba(46,60,140,.9)'; c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(-w / 2 + 2, h * .18); c.lineTo(w * .28, h * .18 + (r2 - .5) * 2);
        c.stroke();
        break;
      }
      /* The lift, drawn (the kit has none): a recess with two steel leaves, a seam,
         a call plate and a floor indicator reading Lifts.at() (engine/levels.js). */
      case 'lift': {
        const w = size * 0.92, h = size * 1.04;
        const x0 = -w / 2, y0 = -h / 2;
        /* The recess, then the architrave round it. */
        c.fillStyle = '#1b2029';
        c.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
        c.fillStyle = '#3c434e';
        c.fillRect(x0 - 2, y0 - 2, w + 4, 2);
        c.fillStyle = '#141920';
        c.fillRect(x0, y0, w, h);
        /* The two leaves, brushed, lit from the left, with the seam between. */
        for (const side of [0, 1]) {
          const lx = x0 + side * (w / 2);
          const g = c.createLinearGradient(lx, 0, lx + w / 2, 0);
          g.addColorStop(0, side ? '#5a636f' : '#6b7480');
          g.addColorStop(1, side ? '#77808c' : '#59626e');
          c.fillStyle = g;
          c.fillRect(lx + .5, y0 + 1, w / 2 - 1, h - 2);
          /* The vertical brushing, which is what stops it reading as a door. */
          c.fillStyle = 'rgba(255,255,255,.05)';
          for (let i = 2; i < w / 2 - 2; i += 3) c.fillRect(lx + i, y0 + 2, 1, h - 4);
        }
        c.fillStyle = 'rgba(12,14,18,.85)';
        c.fillRect(-0.9, y0 + 1, 1.8, h - 2);
        /* The call plate: two buttons, one above the other, one of them lit. */
        c.fillStyle = '#2b313a';
        c.fillRect(x0 + w + 1, -h * .18, 3.4, h * .36);
        c.fillStyle = 'rgba(255,179,71,.9)';
        c.fillRect(x0 + w + 2, -h * .12, 1.6, 1.6);
        c.fillStyle = 'rgba(120,128,140,.9)';
        c.fillRect(x0 + w + 2, h * .04, 1.6, 1.6);
        /* And the light over the top, showing where the car is. */
        const floor = Lifts.at() || '';
        c.fillStyle = '#0d1016';
        c.fillRect(x0 + w * .18, y0 - 6, w * .64, 4.6);
        if (floor) {
          c.fillStyle = 'rgba(255,140,60,.95)';
          c.font = '600 ' + Math.max(5, Math.round(size * .19)) + 'px ui-monospace,"Cascadia Mono",Consolas,monospace';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(floor), 0, y0 - 3.7);
        }
        break;
      }
      /* Stairs: three treads and a handrail. The kit's `terrain.steps` is a surface
         and cannot stand in a doorway. */
      case 'stairs': {
        const w = size * .95, h = size * .8;
        const x0 = -w / 2, y0 = -h / 2;
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.fillRect(x0 + 1.5, y0 + 2, w, h);
        for (let i = 0; i < 3; i++) {
          const ty = y0 + i * (h / 3);
          c.fillStyle = i === 0 ? '#8d949e' : i === 1 ? '#7b828c' : '#6a717a';
          c.fillRect(x0, ty, w, h / 3 - 1);
          c.fillStyle = 'rgba(255,255,255,.16)';
          c.fillRect(x0, ty, w, 1);
        }
        /* The rail, on the open side, worn bright along the top of it. */
        c.fillStyle = '#39404a';
        c.fillRect(x0 - 1.5, y0 - 1, 2, h + 2);
        c.fillStyle = 'rgba(226,229,234,.45)';
        c.fillRect(x0 - 1.5, y0 - 1, 2, 1);
        break;
      }
      case 'ledger': {
        /* The sign-in book lying open on the counter, biro on a string. */
        const w = size * 1.25, h = size * .8;
        c.fillStyle = 'rgba(0,0,0,.38)';
        c.beginPath(); c.roundRect(-w / 2 + 2, -h / 2 + 3, w, h, 2); c.fill();
        c.fillStyle = '#7c3f3f';                      /* the hardbound cover */
        c.beginPath(); c.roundRect(-w / 2 - 1.5, -h / 2 - 1, w + 3, h + 2, 2); c.fill();
        c.fillStyle = '#f4f1e8';
        c.fillRect(-w / 2, -h / 2, w, h);
        c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(-1, -h / 2, 2, h);
        /* Ruled columns — NAME, COMPANY, VISITING — and the entries, which stop
           partway down the page and have never got as far as TIME OUT. */
        c.fillStyle = 'rgba(60,72,92,.45)';
        c.fillRect(-w * .16, -h / 2 + 2, 1, h - 4);
        c.fillRect(w * .22, -h / 2 + 2, 1, h - 4);
        c.fillStyle = 'rgba(60,72,92,.55)';
        for (let i = 0; i < 3; i++)
          c.fillRect(-w / 2 + 2, -h / 2 + 4 + i * 3, (w * .4) * (.5 + rnd() * .5), 1);
        c.fillStyle = '#2b3444';                      /* the biro, on its string */
        c.fillRect(w * .06, h * .18, w * .38, 1.6);
        break;
      }
    }
    c.restore();
  },
  /* ---- The ground cache ----
     The floor and everything painted on it, baked in GROUND_N × GROUND_N tile
     chunks at device scale and blitted 1:1. Keyed on World's buffer (new per
     build), the season, the art and the scale; rebake() drops it. Bounded by a
     pixel budget, not a count. */
  GROUND_N: 8,
  _ground: null,
  groundScale() {
    const d = this.dpr, dev = Math.min(2, window.devicePixelRatio || 1);
    /* The game's scale is fixed; the editor's zoom snaps up to a power of two so a
       pinch does not rebake every frame. */
    if (Math.abs(d - dev) < 1e-6) return d;
    return clamp(Math.pow(2, Math.ceil(Math.log2(d))), 1 / 16, 4);
  },
  ground(x0, y0, x1, y1) {
    if (this.noGroundCache || !World._solid) return false;
    const S = this.groundScale();
    const key = S + '|' + Sky.season() + '|' + (Tiles.gen || 0);
    let G = this._ground;
    if (!G || G.world !== World._solid || G.key !== key) {
      G = this._ground = { world: World._solid, key, S, chunks: new Map(), px: 0, clock: 0, pool: [] };
    }
    const N = this.GROUND_N, W = N * TILE, c = this.ctx;
    const cx0 = Math.floor(x0 / N), cx1 = Math.floor(x1 / N);
    const cy0 = Math.floor(y0 / N), cy1 = Math.floor(y1 / N);
    const clock = ++G.clock;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.groundChunk(G, cx, cy);
      ch.used = clock;
      c.drawImage(ch.cv, cx * W, cy * W, W, W);
    }
    /* Prebake one chunk of the off-screen ring per frame. */
    const mx = Math.ceil(MAPW / N) - 1, my = Math.ceil(MAPH / N) - 1;
    outer: for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(my, cy1 + 1); cy++)
      for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(mx, cx1 + 1); cx++)
        if (!G.chunks.has(cy * 4096 + cx)) { this.groundChunk(G, cx, cy).used = clock; break outer; }
    /* Over budget: drop the longest unseen. About three screens. */
    const budget = Math.max(4e6, 3 * this.cv.width * this.cv.height);
    if (G.px > budget) {
      const old = [...G.chunks].filter(e => e[1].used !== clock).sort((a, b) => a[1].used - b[1].used);
      for (const [id, ch] of old) {
        if (G.px <= budget * .75) break;
        G.chunks.delete(id); G.px -= ch.cv.width * ch.cv.height;
        if (G.pool.length < 8) G.pool.push(ch.cv);
      }
    }
    return true;
  },
  groundChunk(G, cx, cy) {
    const id = cy * 4096 + cx;
    let ch = G.chunks.get(id);
    if (ch) return ch;
    const N = this.GROUND_N, W = N * TILE, S = G.S, size = Math.ceil(W * S);
    const cv = G.pool.pop() || document.createElement('canvas');
    cv.width = cv.height = size;                 /* and cleared, by being set */
    const g = cv.getContext('2d');
    g.setTransform(S, 0, 0, S, -cx * W * S, -cy * W * S);
    const tx0 = cx * N, ty0 = cy * N;
    const tx1 = Math.min(MAPW - 1, tx0 + N - 1), ty1 = Math.min(MAPH - 1, ty0 + N - 1);
    const was = this.ctx;
    this.ctx = g;
    try {
      /* The chunk's tiles, with passes from one tile further out (kerbs, stains and
         lines lap over edges); the canvas clips. */
      this.groundBase(tx0, ty0, tx1, ty1, { x: cx * W, y: cy * W, w: W, h: W }, 1);
      this.groundMarks(Math.max(0, tx0 - 1), Math.max(0, ty0 - 1), Math.min(MAPW - 1, tx1 + 1), Math.min(MAPH - 1, ty1 + 1));
    } finally { this.ctx = was; }
    ch = { cv, used: 0 };
    G.chunks.set(id, ch); G.px += size * size;
    return ch;
  },
  /* The ground as laid: floor, kerbs, paint. `view` is roadPaint()'s cull rect;
     `m` how far past the tiles to look for kerbs. */
  groundBase(x0, y0, x1, y1, view, m = 0) {
    const c = this.ctx;
    /* Seams belong to the sprite, not a grid stroke. */
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const z = World.zoneAt(x, y);
      /* Open surfaces (river, ballast) have no zone and are solid, but are drawn:
         what they are made of is what they are (World.open()). */
      if ((!z || World.solid[y][x]) && !World.open(x, y)) continue;
      c.drawImage(this.floorTile(z, (x + y) & 1, World.surfAt(x, y)), x * TILE, y * TILE, TILE, TILE);
    }
    /* Kerb then road paint, straight onto the floor, before wear and wall shadows. */
    this.kerbs(Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(MAPW - 1, x1 + m), Math.min(MAPH - 1, y1 + m));
    this.roadPaint(view);
  },
  /* Wear, stains and the contact shadow at every wall's foot. `shadows` omits
     wear, for redrawing the dark half over snow. */
  groundMarks(x0, y0, x1, y1, shadows) {
    const c = this.ctx;
    /* Worn patches, but not on the carriageway, where a tile-shaped patch shows as
       a chequerboard on the flat tarmac. Round stains still go everywhere. */
    c.fillStyle = 'rgba(255,255,255,.018)';
    if (!shadows) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!World.zone[y][x] || World.solid[y][x]) continue;
      if (World.surfAt(x, y) === 'tarmac') continue;
      if (World.seed[y][x] > .82) c.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    c.fillStyle = 'rgba(0,0,0,.13)'; c.beginPath();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!World.zone[y][x] || World.solid[y][x]) continue;
      const s = World.seed[y][x];
      if (s > .965) { const px = x * TILE, py = y * TILE; c.moveTo(px + TILE * s % TILE + 3 + s * 3, py + TILE * (1 - s) % TILE); c.arc(px + TILE * s % TILE, py + TILE * (1 - s) % TILE, 3 + s * 3, 0, 6.3); }
    }
    c.fill();

    /* contact shadow, two bands for a soft falloff */
    for (let pass = 0; pass < 2; pass++) {
      c.fillStyle = pass ? 'rgba(0,0,0,.10)' : 'rgba(0,0,0,.20)';
      const t = pass ? 9 : 5, o = pass ? 5 : 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const m = World.ao[y] && World.ao[y][x];
        if (!m) continue;
        const px = x * TILE, py = y * TILE;
        if (m & 1) c.fillRect(px, py + o, TILE, t - o);
        if (m & 2) c.fillRect(px, py + TILE - t, TILE, t - o);
        if (m & 4) c.fillRect(px + o, py, t - o, TILE);
        if (m & 8) c.fillRect(px + TILE - t, py, t - o, TILE);
      }
    }  },
  draw(dt) {
    /* `|| 0`: one call without dt would make t NaN for ever and every frame blank.
       Tests calling R.draw() must pass a dt. */
    const c = this.ctx; this.t += dt || 0; this.lastDt = dt || 0;
    /* Door swing first, so the leaf and its light agree this frame. */
    this.swingDoors(dt || 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, Cam.w, Cam.h);
    const sx = FX.shakeAmt ? rnd(-FX.shakeAmt, FX.shakeAmt) : 0;
    const sy = FX.shakeAmt ? rnd(-FX.shakeAmt, FX.shakeAmt) : 0;
    const ox = -Math.round(Cam.x) + sx, oy = -Math.round(Cam.y) + sy;
    c.save(); c.translate(ox, oy);

    const x0 = Math.max(0, Math.floor(Cam.x / TILE) - 1), x1 = Math.min(MAPW - 1, Math.ceil((Cam.x + Cam.w) / TILE));
    const y0 = Math.max(0, Math.floor(Cam.y / TILE) - 1), y1 = Math.min(MAPH - 1, Math.ceil((Cam.y + Cam.h) / TILE) + 1);

    /* The ground from the cache (ground()): a frame is a dozen blits. Moving
       things (tide, rain) go on top. groundBase()/groundMarks() remain the one
       drawing path, used directly when the cache is off. */
    const cached = this.ground(x0, y0, x1, y1);
    if (!cached) this.groundBase(x0, y0, x1, y1);
    this.shoreline(x0, y0, x1, y1);
    /* Water and snow belong to the ground, so a puddle is under the people. */
    this.wetGround(x0, y0, x1, y1);
    if (!cached) this.groundMarks(x0, y0, x1, y1);
    /* Lying snow covers what the chunk has already laid down, where the old
       frame drew the shadows on top of it. Put them back over the snow. */
    else if (Sky.lying() > .04 && !World.indoors()) this.groundMarks(x0, y0, x1, y1, true);

    /* walls */
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      /* Never the water: open surfaces are solid and would otherwise become roof. */
      if (!World.solid[y][x] || World.open(x, y)) continue;
      const below = y + 1 < MAPH && !World.solid[y + 1][x] && World.zone[y + 1][x];
      const anyNear = below || (x + 1 < MAPW && !World.solid[y][x + 1]) || (x > 0 && !World.solid[y][x - 1]) || (y > 0 && !World.solid[y - 1][x]);
      /* Mass with nothing beside it: black indoors; roofs outdoors, since the
         mass between streets is buildings and past the map edge is town. */
      if (!anyNear) {
        if (World.indoors()) { c.fillStyle = '#080b11'; c.fillRect(x * TILE, y * TILE, TILE, TILE); }
        else {
          /* The gap first: the roof tile's clear two-pixel edge shows this gutter dark
             between parapets. Not black, which reads as a hole. */
          c.fillStyle = '#14181f'; c.fillRect(x * TILE, y * TILE, TILE, TILE);
          const roof = this.roofTile(x, y) || this.roofBaked((x * 5 + y * 3) & 1);
          c.drawImage(roof, x * TILE, y * TILE, TILE, TILE);
        }
        continue;
      }
      /* Only visible walls look up their room; roofs skip the eight lookups. */
      /* Which room's wall this is: the one it faces. All four neighbours, in the
         order the wall is seen from: the room below, the room above, then the sides. */
      /* Looking down finds a doorway too, correctly: the wall over an opening takes
         the finish of the room it leads to. Looking up must not: a doorway above is
         a hole in the same run. */
      const nz = World.zoneAt(x, y + 1)
        || (!World.isOpening(x, y - 1) && World.zoneAt(x, y - 1))
        /* West before east, as a tie-break, so a small room's finish does not leak
           onto the main floor. */
        || World.zoneAt(x - 1, y) || World.zoneAt(x + 1, y)
        /* A corner's room is diagonal. */
        || World.zoneAt(x + 1, y + 1) || World.zoneAt(x - 1, y + 1)
        || World.zoneAt(x + 1, y - 1) || World.zoneAt(x - 1, y - 1)
        || null;
      const px = x * TILE, py = y * TILE;
      c.drawImage(this.wallTile(nz || this.baseZone(), (x * 3 + y) & 1), px, py, TILE, TILE);
      if (below) {
        /* Every wall whose face you see gets a second tile stacked on top, so rooms
           read enclosed. Drawn over the row above (already finished, top to bottom),
           and never over people, who are drawn later. Its opacity follows which side
           the player is on: solid from the room it encloses, faded a tile past it. */
        /* Not over a doorway: the head of an opening has no sides. */
        const head = World.isOpening(x, y + 1);
        /* Not where nobody can stand behind: solid behind means no fade (a shopfront
           with building behind it). */
        const behind = y > 0 && World.solid[y - 1][x];
        const rel = (P.y - py) / (TILE * 1.6);
        const wallAlpha = (head || behind) ? 1 : Math.max(.15, Math.min(1, rel + .35));
        c.save();
        c.globalAlpha = wallAlpha;
        c.drawImage(this.wallTile(nz || this.baseZone(), (x * 3 + y + 1) & 1), px, py - TILE, TILE, TILE);
        c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(px, py - TILE, TILE, 4);
        /* The eaves: roofAt() stops the roof a tile back, so a slice of that tile's
           bake, coping and all, laps down over the wall's top, with the overhang's
           shadow. */
        if (this.roofMass(x, y - 2)) {
          const eave = this.roofTile(x, y - 2) || this.roofBaked((x * 5 + (y - 2) * 3) & 1);
          const N = eave.width, EH = 5;
          c.drawImage(eave, 0, N - (EH / TILE) * N, N, (EH / TILE) * N, px, py - TILE, TILE, EH);
          this.fade(c, px, py - TILE + EH, TILE, 8, 'n', 'rgba(0,0,0,.5)');
        }
        c.restore();
        /* Skirting: a 7px board at the foot of every visible wall face. */
        const sk = py + TILE - 9;
        c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(px, sk - 2, TILE, 3);
        c.fillStyle = this.shade((ZONES[nz] && ZONES[nz].wall) || '#141a24', .22);
        c.fillRect(px, sk, TILE, 9);
        c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px, sk, TILE, 2);
        c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px, py + TILE - 2, TILE, 2);
        this.fade(c, px, py + TILE, TILE, 10, 'n', 'rgba(0,0,0,.45)');
      } else if (!World.indoors() && this.roofSkirt(x, y)) {
        /* The verge (roofSkirt()): roof on the ring of wall it sits on, over the wall
           tile so the top of the wall shows past the covering. The plot fill and
           corner matching count it (roofMass), so copings land on the true edge. */
        const roof = this.roofTile(x, y) || this.roofBaked((x * 5 + y * 3) & 1);
        c.drawImage(roof, px, py, TILE, TILE);
        /* The overhang's shadow on sides with ground under them. */
        const OV = 7;
        /* From the wall face outwards, so the dark end is against the
           building and the clear end is the ground it falls on. */
        const SH = 'rgba(0,0,0,.34)';
        if (x > 0 && !World.solid[y][x - 1]) this.fade(c, px - OV, py, OV, TILE, 'e', SH);
        if (x + 1 < MAPW && !World.solid[y][x + 1]) this.fade(c, px + TILE, py, OV, TILE, 'w', SH);
        if (y > 0 && !World.solid[y - 1][x]) this.fade(c, px, py - OV, TILE, OV, 's', SH);
      } else {
        /* Not a visible face — interior wall mass, or a boundary with nothing
           behind it to enclose. One tile, same as it always was. */
        c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(px, py, TILE, 4);
      }
    }

    /* Doorways sit in the wall band: after walls, before anything in front. The
       floor behind them first. */
    this.thresholds(x0, y0, x1, y1);
    this.doorways(x0, y0, x1, y1);
    this.doorLeaves(x0, y0, x1, y1);

    /* Ceiling light pools and static furniture, under everything that moves. No
       ceiling outdoors. */
    if (World.indoors()) this.ceiling(x0, y0, x1, y1);
    else this.daylight();
    this.desks(x0, y0, x1, y1);
    this.tables(x0, y0, x1, y1);
    this.worktops(x0, y0, x1, y1);
    this.cubicles(x0, y0, x1, y1);

    /* Rings on the water where you swim, under everybody (engine/moves.js). */
    Moves.paintUnder(c);
    /* drawables sorted by y */
    const drawables = [];
    World.objects.forEach(o => {
      /* Picked up and not back yet (driftwood); the object stays for its id. */
      if (o.gone) return;
      const wx = (o.x + .5) * TILE, wy = (o.y + .5) * TILE;
      if (!Cam.visible(wx, wy)) return;
      /* An occupied chair sorts after its occupant; an empty one draws behind. */
      let sy = wy;
      if (o.kind === 'chair' && Sprites.seatedHere(o.x, o.y)) sy = wy + 2;
      drawables.push({ y: sy, kind: 'obj', o, wx, wy });
    });
    /* Counters sort with everything, so the person on duty stands behind them. */
    (World.counters || []).forEach(t => {
      const wy = (t.y + .5) * TILE;
      if (Cam.visible((t.x + t.w / 2) * TILE, wy)) drawables.push({ y: wy - 1, kind: 'counter', t });
    });
    NPCM.list.forEach(n => { if (Cam.visible(n.x, n.y)) drawables.push({ y: n.y, kind: 'npc', n }); });
    /* Cars sort with everybody, so you can walk behind a parked car. */
    (World.cars || []).forEach(car => { if (Cam.visible(car.x, car.y)) drawables.push({ y: car.y, kind: 'car', car }); });
    /* The people on the street, sorted with everybody else for the same reason
       the cars are: walk behind one and you are behind them. */
    (World.peds || []).forEach(p => { if (Cam.visible(p.x, p.y)) drawables.push({ y: p.y, kind: 'ped', p }); });
    /* Not while you are in one. You are the car — drawing you as well puts a
       person standing on the roof of the thing they are driving. */
    if (!Cars.driving) drawables.push({ y: P.y, kind: 'player' });
    drawables.sort((a, b) => a.y - b.y);

    const hi = Interact.target;
    drawables.forEach(d => {
      if (d.kind === 'counter') {
        this.counter(d.t);
      } else if (d.kind === 'ped') {
        /* Strangers are clipped behind two-course walls like colleagues. */
        const p = d.p, pty = Math.floor(p.y / TILE);
        const pveil = this.veilAt(Math.floor(p.x / TILE), pty);
        if (pveil >= 1) { this.stranger(p, hi); return; }
        const plip = pty * TILE;
        c.save(); c.beginPath(); c.rect(-1e6, -1e6, 2e6, 1e6 + plip); c.clip();
        this.stranger(p, hi); c.restore();
        if (pveil > 0) {
          c.save(); c.beginPath(); c.rect(-1e6, plip, 2e6, 1e6); c.clip();
          c.globalAlpha = pveil; this.stranger(p, hi); c.restore();
        }
      } else if (d.kind === 'car') {
        this.car(d.car, hi === d.car && !Cars.driving);
      } else if (d.kind === 'obj') {
        const o = d.o;
        /* Behind a wall you see the front of: not drawn at all. */
        const veil = this.veil(o);
        if (veil <= 0) return;
        let bob = 0;
        if (this.animate) {
          if (o.kind === 'phone' && o.ringing) bob = Math.sin(this.t * 18 + o.wob) * 5;
          else if (o.kind === 'pc') bob = Math.sin(this.t * 1.4 + o.wob) * 1.2;
          else if (o.kind === 'plant') bob = Math.sin(this.t * .8 + o.wob) * 1.4;
          else if (o.kind === 'printer') bob = Math.sin(this.t * 9 + o.wob) * (chance(.02) ? 3 : .5);
          else if (o.kind === 'coffee') bob = Math.sin(this.t * 2.2 + o.wob) * 1.2;
        }
        /* Where it is drawn, not its tile: emoji, shadow and highlight move together. */
        const f = o.fdef || FURN[o.kind] || {};
        /* The sprite resolved once, so a tree cannot answer two seasons in one frame. */
        const fsprite = this.spriteOf(f, o);
        const size = o.kind === 'chair' ? (Sprites.ready ? 22 : 16) : (f.size ?? 20);
        let ex = d.wx, ey = d.wy, onFloor = true;
        if (o.mount === 'wall') {
          const s = o.wallSide;
          /* Hung things stand three quarters of a tile off their wall; paint goes on
             the wall tile, centred. */
          const off = f.paint ? TILE : TILE * .72;
          ex += s === 'w' ? -off : s === 'e' ? off : 0;
          /* Only a north wall has a second course to hang things on, so pictures go at
             head height there. */
          /* Any wall-anchored sprite hangs high, not only `o.art`. */
          const wallSprite = fsprite && Tiles.anchors && Tiles.anchors[fsprite] === 'wall';
          /* `high` lifts a hanging kind with no art of its own: shop signs go on the
             fascia over the door. */
          const high = s === 'n' && (o.art || wallSprite || f.high);
          /* A number sets the height in tiles; the default is 1.45. */
          const lift = typeof f.high === 'number' ? f.high : 1.45;
          ey += s === 'n' ? (high ? -TILE * lift : -TILE * .72) : s === 's' ? (f.paint ? TILE : TILE * .68) : 0;
          onFloor = false;
        } else if (o.onTable) {
          /* Onto a tabletop, before the worktop case. */
          ey -= 8;                                   /* up onto the tabletop */
          onFloor = false;
        } else if (o.mount === 'surface' || o.onCounter) {
          /* Onto a worktop: the counter's slab, or the kit's kitchen unit. */
          ey -= o.onCounter ? this.SLAB_TOP : this.worktopTop(o.x, o.y);
          onFloor = false;
        }
        c.save();
        if (veil < 1) c.globalAlpha = veil;
        /* Only emoji get a shadow ellipse; anything drawing its own art is grounded
           already. */
        const drawsOwn = (fsprite && Tiles.has(fsprite)) || f.drawn || o.art || o.noEmoji;
        if (onFloor && !drawsOwn && o.kind !== 'hatch') {
          this.shadow(ex, ey + size * .45, Math.max(11, size * .42), 5);
        }
        if (o.ringing) {
          /* a pool of light on the carpet, so a ringing phone reads from across
             the floor rather than only when it is already on screen centre */
          const gs = this.glow('rgba(255,179,71,ALPHA)', Math.round(TILE * 1.27));
          c.save();
          c.globalAlpha = .55 + Math.sin(this.t * 6) * .2;
          c.drawImage(gs, d.wx - gs.width / 2, d.wy - gs.height / 2 + 10);
          c.globalAlpha = .35 + Math.sin(this.t * 10) * .25;
          c.strokeStyle = '#ffb347'; c.lineWidth = 2;
          c.beginPath(); c.arc(d.wx, d.wy, 20 + Math.sin(this.t * 6) * 5, 0, 6.3); c.stroke();
          c.restore();
        }
        /* The kit's own furniture where there is any, then the drawn wall
           art, then the emoji it all replaced. */
        /* Kit wall items are face-on, and only north walls show their face. Anywhere
           else falls back to the emoji. By anchor, so new items follow the rule. */
        const edgeOn = o.mount === 'wall' && o.wallSide !== 'n' && !f.paint
                    && fsprite && Tiles.anchors && Tiles.anchors[fsprite] === 'wall';
        /* Mirror some repeated objects for variety (FLIPPABLE, seeded off the tile). */
        const canFlip = FLIPPABLE.has(o.kind) && ((o.x * 7 + o.y * 13) & 1) === 1;
        /* `turn` is quarter turns clockwise and art only, like `flip`: collision and
           interaction are unchanged. About the sprite's middle; shadow and
           pool stay square. */
        /* Paint turns with its wall: on east and west walls a wide tag is turned a
           quarter so it runs along the wall. */
        const paintTurn = f.paint && o.mount === 'wall'
          ? (o.wallSide === 'e' ? 1 : o.wallSide === 'w' ? 3 : 0) : 0;
        const turn = ((o.turn || 0) + paintTurn) & 3;
        const art = () => {
          if (turn) {
            const mid = (fsprite && Tiles.has(fsprite))
              ? Tiles.centre(fsprite, ex, ey + bob) : { x: ex, y: ey + bob };
            c.save();
            c.translate(mid.x, mid.y); c.rotate(turn * Math.PI / 2); c.translate(-mid.x, -mid.y);
          }
          if (edgeOn || !(fsprite && Tiles.draw(c, fsprite, ex, ey + bob, canFlip))) {
            if (o.arm) this.signalHead(o.arm, ex, ey);
            else if (o.art) this.wallArt(o, ex, ey + bob, size);
            else if (!o.noEmoji) this.emoji(o.e, ex, ey + bob, size);
          }
          if (turn) c.restore();
        };
        if (hi === o) this.rim(art, ...this.RIM_THING);
        art();
        if (o.kind === 'pc' && this.animate) {
          c.fillStyle = 'rgba(120,190,255,' + (0.05 + Math.abs(Math.sin(this.t * 2 + o.wob)) * .08) + ')';
          c.fillRect(ex - 13, ey - 12, 26, 16);
        }
        c.restore();
      } else if (d.kind === 'npc') {
        const n = d.n;
        /* Behind the wall in front of you: furniture is shorter than the upper course
           and veil() drops it; a person is taller, so they are clipped, not culled.
           Above the course they are solid; behind it they fade on the veil's ramp. */
        const nty = Math.floor(n.y / TILE);
        const nveil = this.veilAt(Math.floor(n.x / TILE), nty);
        if (nveil >= 1) { this.colleague(n, hi); return; }
        /* The course's top edge is the top of their tile. Both halves are the same
           drawing. */
        const lip = nty * TILE;
        c.save(); c.beginPath(); c.rect(-1e6, -1e6, 2e6, 1e6 + lip); c.clip();
        this.colleague(n, hi); c.restore();
        if (nveil > 0) {
          c.save(); c.beginPath(); c.rect(-1e6, lip, 2e6, 1e6); c.clip();
          c.globalAlpha = nveil; this.colleague(n, hi); c.restore();
        }
      } else {
        const psprite = Sprites.has('player');
        /* Seated, you are drawn in the chair. */
        const seat = psprite && !P.moving
          ? Sprites.seatedAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE)) : null;
        const at = seat ? Sprites.seatPos(seat) : { x: P.x, y: P.y };
        /* Jumping, landing and swimming (engine/moves.js): how you are drawn,
           not where you are. */
        const mv = seat ? null : Moves.pose(P.dir ?? 2, !P.moving);
        /* The shadow stays on the ground and shrinks as you rise; a swimmer has none. */
        if (!(mv && mv.swim)) {
          const sh = mv && mv.lift ? Math.max(.45, 1 - mv.lift / 30) : 1;
          this.shadow(at.x, at.y + 13, 13 * sh, 5 * sh);
        }
        const bob = psprite ? 0 : P.moving && this.animate ? Math.abs(Math.sin(P.bob * 2)) * 4 : 0;
        c.save();
        /* The glow marks which person is you. */
        c.shadowColor = 'rgba(77,163,255,.55)'; c.shadowBlur = 16;
        if (psprite) {
          /* The top half first, since it decides the legs: Guns.pose() writes P.dir and
             Guns.back, or returns null with nothing in hand (Sprites.twisted()). */
          const tw = seat ? null : Guns.pose();
          /* The legs' frame: walk, run (P.fast, set from the movement vector), or stand. */
          let pf = seat ? Sprites.sit('player')
            : P.moving ? Sprites.frame('player', this.animate, P.step, P.fast, tw && Guns.back)
            /* Squared up with something to swing, the feet are the stance's. */
            : tw && tw.legFrame !== undefined ? tw.legFrame
            : this.animate ? Sprites.breath('player') : 0;
          if (mv && mv.frame !== null && !tw) pf = mv.frame;
          const plift = seat && this.animate ? Sprites.breathLift('player') : 0;
          const pdir = seat ? (seat.face ?? 0) : P.dir ?? 2;
          if (mv && mv.swim) {
            /* In the water: drawn low, cut at the waterline. */
            Moves.paintSwimmer(c, at.x, at.y, mv, dy => Sprites.draw(c, 'player', pdir, pf, at.x, at.y + dy));
          } else {
            const lift = (mv ? mv.lift : 0) + plift;
            /* A squash or a stretch, about the feet, so you land on your shadow. */
            const squash = mv && (mv.sx !== 1 || mv.sy !== 1);
            if (squash) {
              const fy = at.y + Sprites.FOOT;
              c.translate(at.x, fy); c.scale(mv.sx, mv.sy); c.translate(-at.x, -fy);
            }
            /* Same rule as the colleagues above: the chair points, not the
               sitter. Sit on the bench in Nailed It and you face the room. */
            Sprites.draw(c, 'player', pdir, pf, at.x, at.y - lift, tw);
            /* What is in hand, always on top: the arm is held away from the body in every
               direction. */
            if (!seat && Guns.armed) Guns.held(c, at.x, at.y - lift);
          }
        } else this.emoji(P.face, at.x, at.y - bob - (mv ? mv.lift : 0) + (mv && mv.swim ? 8 : 0), 30);
        c.restore();
      }
    });

    /* Projectiles over people and under the light. */
    Guns.paintShots(c);

    /* The light: over the world, under the game's overlays. The grade darkens,
       lamps restore, and particles and numbers come after, unlit. */
    this.skyGrade();
    this.lamps(x0, y0, x1, y1);

    /* particles + floats */
    FX.parts.forEach(p => {
      const a = 1 - p.t / p.life;
      if (p.e) this.emoji(p.e, p.x, p.y, p.sz, a);
      else { c.globalAlpha = a; c.fillStyle = p.c || '#fff'; c.fillRect(p.x, p.y, 3, 3); c.globalAlpha = 1; }
    });
    c.textAlign = 'center'; c.textBaseline = 'middle';
    FX.floats.forEach(f => {
      const a = 1 - f.t / f.life;
      c.globalAlpha = a; c.font = FLOAT_FONT;
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.65)';
      c.strokeText(f.text, f.x, f.y); c.fillStyle = f.c; c.fillText(f.text, f.x, f.y);
      c.globalAlpha = 1;
    });
    if (Guide.on()) this.guidePin();
    c.restore();
    /* Rain falls past the CAMERA, not past the map, so it is drawn out here
       with everything else that lives at the edge of the screen. */
    this.weather();
    /* The guide arrow is in screen space. */
    if (Guide.on()) this.guideArrow();
  },
  /* A pin over the waypoint, with a pool of light so it reads across a floor
     of identical furniture. */
  guidePin() {
    const c = this.ctx;
    const wx = (Guide.tx + .5) * TILE, wy = (Guide.ty + .5) * TILE;
    if (!Cam.visible(wx, wy)) return;
    const bob = Math.sin(this.t * 3.4) * 4;
    c.save();
    const g = this.glow('rgba(90,212,138,ALPHA)', Math.round(TILE * 1.18));
    c.globalAlpha = .5 + Math.sin(this.t * 3) * .18;
    c.drawImage(g, wx - g.width / 2, wy - g.height / 2 + 8);
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(90,212,138,.85)'; c.lineWidth = 2;
    c.beginPath(); c.arc(wx, wy, 19 + Math.sin(this.t * 3) * 3, 0, 6.3); c.stroke();
    this.emoji('📍', wx, wy - 34 + bob, 24);
    if (Guide.label) {
      c.font = NAME_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)';
      c.strokeText(Guide.label, wx, wy - 52 + bob);
      c.fillStyle = '#5ad48a'; c.fillText(Guide.label, wx, wy - 52 + bob);
    }
    c.restore();
  },
  /* A compass arrow orbiting the player, not an edge arrow (the top corners are
     HUD cards), and correct when the camera is clamped. */
  guideArrow() {
    const c = this.ctx;
    const wx = (Guide.tx + .5) * TILE, wy = (Guide.ty + .5) * TILE;
    if (Cam.visible(wx, wy)) return;
    const px = P.x - Cam.x, py = P.y - Cam.y;
    const ang = Math.atan2(wy - P.y, wx - P.x);
    const rad = Math.min(96, Math.min(Cam.w, Cam.h) * .3);
    const ax = px + Math.cos(ang) * rad, ay = py + Math.sin(ang) * rad;
    const steps = Guide.steps();
    const pulse = .78 + Math.sin(this.t * 3) * .18;
    c.save();
    c.globalAlpha = pulse;
    c.translate(ax, ay); c.rotate(ang);
    c.fillStyle = '#5ad48a'; c.strokeStyle = 'rgba(6,9,14,.9)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(16, 0); c.lineTo(-10, -11); c.lineTo(-5, 0); c.lineTo(-10, 11);
    c.closePath(); c.fill(); c.stroke();
    c.restore();
    /* The label sits outside the arrow, along the same bearing, so it never
       covers the player and never reads upside down. */
    const lx = px + Math.cos(ang) * (rad + 26), ly = py + Math.sin(ang) * (rad + 26);
    c.save();
    c.font = NAME_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    const txt = (Guide.label || 'this way') + ' · ' + steps;
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,.85)';
    c.strokeText(txt, lx, ly); c.fillStyle = '#5ad48a'; c.fillText(txt, lx, ly);
    c.restore();
  },
  questMark(n) {
    if (!n.def.entry) return false;
    try {
      const id = n.def.entry();
      /* A node with `mark: true` is one that has a job to give or take. */
      const node = n.def.nodes && n.def.nodes[id];
      return !!(node && node.mark);
    } catch (e) { return false; }
  },
  bubble(x, y, text, alpha) {
    const c = this.ctx;
    c.font = BUBBLE_FONT; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const w = Math.min(230, c.measureText(text).width + 18);
    c.globalAlpha = alpha;
    c.fillStyle = 'rgba(15,20,29,.92)'; c.strokeStyle = 'rgba(77,163,255,.5)'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(x - w / 2, y - 20, w, 24, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 5, y + 4); c.lineTo(x + 5, y + 4); c.lineTo(x, y + 10); c.fill();
    c.fillStyle = '#dfe6f2';
    let t = text; if (c.measureText(t).width > 212) { const ch = Array.from(t); while (ch.length > 4 && c.measureText(ch.join('') + '…').width > 212) ch.pop(); t = ch.join('') + '…'; }
    c.fillText(t, x, y - 4);
    c.globalAlpha = 1;
  },
  /* The floor plan never changes, so it is rasterised once and blitted. */
};
