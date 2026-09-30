'use strict';
/* Kinds whose kit art is symmetrical enough that mirroring it is a variation
   rather than a mistake. Deliberately short and deliberately by hand: the
   copier has its console on one side, the trolley has a handle, the sofa has
   an arm that meets the wall, and a mirrored one of any of those is not a
   second piece of furniture, it is the same piece drawn wrong. What is in here
   is boxes, pot plants, chairs, bins and filing cabinets — the things this
   building has fifteen and thirty-two of. */
const FLIPPABLE = new Set(['box', 'plant', 'chair', 'bin', 'cab']);

const R = {
  cv: null, ctx: null, dpr: 1, emojiScale: 1, animate: true, t: 0,
  /* The opening draws this same building behind its letterbox, and a shot of
     an office with twenty floating name tags and a row of red ❗ over it is a
     screenshot of a game rather than a place. Owned here rather than read off
     the cutscene, because this file is loaded by editor.html and boot.js is
     not: naming Cine from in here would be a ReferenceError on that page. */
  cinema: false,
  init() {
    this.cv = $('#view'); this.ctx = this.cv.getContext('2d');
    this.resize(); window.addEventListener('resize', () => this.resize());
    /* Fullscreen and a retracting address bar both change the drawable area
       and only the first reliably fires `resize`; visualViewport catches the
       other (iOS reports the bar retracting as a scroll). */
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
  /* Pin the app to the height a phone actually shows. 100dvh in the stylesheet
     covers modern browsers; this is exact and reaches further back, because in
     some engines dvh is the LARGEST dynamic size — the wrong end of it. */
  fitViewport() {
    const app = $('#app'); if (!app) return;
    const vv = window.visualViewport;
    /* The soft keyboard shrinks the visual viewport too, and squashing the
       layout around somebody typing their name is worse than the clipping it
       would be avoiding. Let the stylesheet have it back while a field has
       focus. */
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
    /* Chromium applies the fill's alpha to colour-emoji glyphs, and every
       object is drawn straight after its shadow() leaves rgba(0,0,0,.35)
       behind. Set an opaque fill every time or the desk phones half-vanish. */
    c.fillStyle = '#fff';
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillText(e, x, y);
    if (alpha !== undefined) c.globalAlpha = 1;
  },
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
     Each surface is drawn once into a small canvas and blitted after that, so a
     textured floor costs what the fillRect it replaced did. Baked at 2x because
     the canvas is scaled by devicePixelRatio and a 44px texture blown up to 88
     is a smear. Textures seed off the cache key, never Math.random(), or the
     floor changes every time the window is resized. */
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
  /* t > 0 towards white, t < 0 towards black. Remembered, because the wall
     pass asks it for the same skirting board on every tile of every frame and
     the answer was a fresh string each time. */
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
  /* A fade to clear across a rectangle, strongest on `side` ('n', 's', 'w' or
     'e'). Blitted from a strip baked once per colour, where it used to be a
     gradient built and thrown away per tile per frame — the eaves, the skirting
     and the roof shadows alone were a couple of hundred of those a frame in
     town. `mid` is an optional colour for the 55% stop, which the tide uses. */
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
  /* Throw the baked tiles away. Nothing in the GAME changes a zone while it is
     running, so this is never called there — but the baked bitmap is the only
     thing that ever reaches the screen, and an editor that lets somebody repaint
     a room has to be able to say so. Without this, changing a zone's colour
     changes nothing at all and the preview quietly lies. */
  rebake() {
    if (this._tiles) this._tiles.clear();
    /* And the ground chunks, every one of which is made of those tiles. */
    this._ground = null;
    this._coast = null;
    this._baseZone = null;
    /* The vehicles are baked too — see carArt() — and for the same reason: the
       baked bitmap is the only thing that reaches the screen, so an editor that
       can change what a thing looks like has to be able to say so. */
    if (this._cars) this._cars.clear();
    /* And which baked tile each roof tile was holding, since every one of them
       is a key into the map that was just emptied. */
    this._roofOf = null; this._roofLevel = null;
    /* And which building each tile of roof is part of, which is derived from
       the mass and therefore from the map the editor has just repainted. */
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
  /* Which sprite an object is wearing today. Almost always the one its kind
     names and nothing more — but a thing may carry four of them keyed by
     season instead of one, and then this is what picks. The same question
     floorTile() asks of SURFACES.grass, asked of FURN.tree, and asked in one
     place so the next seasonal object is a table entry rather than a branch
     in the draw. */
  spriteOf(f, o) {
    if (!f) return undefined;
    /* A ROW OF SHOPS IS NOT ONE SHOP DRAWN ELEVEN TIMES. `tones` is a list of
       colourways of the same object and the tile picks between them — the same
       hash the doors use, so a unit's glass and its door were painted by the
       same person in the same decade. Seeded off the tile rather than shuffled,
       so nothing changes colour when the camera moves. */
    if (f.tones && o) return f.tones[this.toneOf(o.x, o.y) % f.tones.length];
    /* Lit from inside, once the streetlights are on. The same idea as the
       seasonal swap below and a different axis of it: a shop is not a
       different shop after dark, it is the same shop with the lights on. Only
       outdoors — a window seen from inside the building it belongs to is the
       office's own, and Sky.lampsOn() has nothing to say about that. */
    if (f.lit && !World.indoors() && Sky.lampsOn()) return f.lit;
    return f.sprites ? f.sprites[Sky.season()] : f.sprite;
  },

  floorTile(z, v, s) {
    /* The kit's floor, multiplied through the zone's colour: straight from the
       atlas each material is one flat colour and thirteen rooms become one room
       thirteen times. Baked once, so the tint is free per frame. Never pick a
       floor cell off a contact sheet — most are edge pieces; tile a candidate
       and look for a seam.

       `s` is a SURFACE, from World.surf — what this particular tile is made of
       where that differs from what its room is made of. It is looked at first
       and it wins outright: a street is one zone with one name, and the tarmac
       down the middle of it is not a second street. */
    const S = s && SURFACES[s];
    /* A surface may have four tiles rather than one — see SURFACES.grass. The
       season is part of the bake key already, because the key carries the kit
       tile's NAME and the name is what changes, so nothing here has to be told
       to throw anything away when the year turns. */
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
        /* A surface may LIFT its tile as well as tint it: multiply can only
           darken, and a tropical sea painted from a North Sea tile needs light
           adding back, not taking away. */
        if (S && S.lift) { g.globalCompositeOperation = 'screen'; g.fillStyle = S.lift; g.fillRect(0, 0, N, N); }
        g.globalCompositeOperation = 'source-over';
        /* The seam along the top and left of a tile is what makes a floor read
           as laid rather than as wallpaper. A road has no seams in it — it was
           poured, not laid — so the surface that says so does without. */
        if (!S) {
          g.fillStyle = 'rgba(0,0,0,.10)';
          g.fillRect(0, 0, N, 1); g.fillRect(0, 0, 1, N);
        }
      });
    }
    /* PAST HERE THERE MAY BE NO ZONE AT ALL. An open surface (the sea, the
       rock) is drawn with nothing under it — see World.open() — so `z` is
       0 and `ZONES[0]` is undefined. Reading `Z.floor` unconditionally is
       exactly the crash a copy opened without `art/` (or a frame drawn
       before the atlas has decoded) used to hit on every such tile: `floor`
       and `base` are already worked out above, from S first, and that is
       what this bakes from — Z is asked only for a room that actually has
       one. */
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
          /* THE CLIFF. This used to be `wall.stone` tinted grey — a kit
             texture that ships brick-red, and multiplying a colour toward
             white by the fraction floorTile() uses everywhere else can
             lighten it but never desaturates it, so the "grey stone" read
             as a dim brick wall lying on its side. Drawn instead: broken,
             angular facets of a few greys, which is what the same rock
             looks like from directly above whether it is the last six feet
             of the island or the foreshore under it. */
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
          /* Carpet tiles, and the reason the office reads as an office: they
             are laid with the pile at ninety degrees tile to tile, so a floor
             of exactly one colour still has a grain that changes direction. */
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
    /* The kit's wall, tinted per room exactly as floorTile() does. The toilets
       and the fire escape opt out below: glazed brick and breeze block are the
       point of those rooms. */
    const kw = ZONES[z] && ZONES[z].wtile;
    if (Tiles.has(kw)) {
      return this._bake('kw' + z + v + kw, (g, N) => {
        const r = Tiles.rects[kw], src = Tiles.imgFor(kw);
        g.imageSmoothingEnabled = false;
        g.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, N, N);
        g.globalCompositeOperation = 'multiply';
        /* Lifted off the flat wall colour: the texture is nearly white, and
           multiplying it straight through a #1a212e leaves a black rectangle. */
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

     Everything solid outdoors that no floor can see is a roof: the middle of a
     block, and the whole of the town past the edge of the map. That used to be
     roofBaked() below and nothing else — four courses of slate in two variants,
     with a black square on about a quarter of them standing for a vent. On one
     tile it is a decent piece of drawing. On the four hundred tiles between
     Cargate Lane and the retail park it is a swatch, and a swatch cannot do the
     one thing a roof has to do from above: say where one building stops and the
     next one starts. A town seen from overhead is not a texture. It is a
     hundred roofs butted up against each other, in four or five materials, each
     with a parapet round it and its own junk on it, and the lines between them
     ARE the town.

     So the roof is drawn in three steps, and the first of them is the one that
     matters.

     ONE: cut the mass into PLOTS. See roofPlot(). Nothing in a level says where
     a building ends — a block is one rectangle of solid with a shop front drawn
     on the south side of it — so the plots are derived, the way R.kerbs()
     derives a kerb from wherever two surfaces meet. What comes out is a terrace:
     runs of three to five tiles across, cut again front to back, and cut
     differently in each run so the party walls of one street do not line up with
     the street behind it.

     TWO: ask the corner-matched set for the tile. Thirteen tiles per material
     off art/sprites/roofs.png (tools/sheets/roofs.mjs) — field, four edges, four
     outer corners, four inner corners — chosen by which of this tile's four
     CORNERS are inside the same plot. That is what puts a coping all the way
     round every building, mitred at the corners and returned into the inner
     ones, without anybody drawing one.

     THREE: put something on it. A flat roof is never empty: there is plant on
     it, or a rooflight, or a tank, or a stack, or an aerial somebody put up for
     analogue television and never took down. roofDeco() draws those, baked into
     the same tile, so a roof with a lift overrun on it still costs one blit. */

  /* What a roof is MADE of, as a bag to draw from rather than a list to cycle:
     six slates to three leads to two felts to two pantiles to one oxblood,
     which is roughly the mix of an English market town that got bombed in one
     half and listed in the other. The odds are the whole of the reason it reads
     as a town rather than as a chessboard — an even split between five colours
     would look deliberate, and nothing about a roofscape is deliberate. */
  ROOF_MATS: [
    'slate', 'slate', 'slate', 'slate', 'slate', 'slate',
    'lead', 'lead', 'lead',
    'felt', 'felt',
    'pantile', 'pantile',
    'oxblood',
  ],
  /* Which of the thirteen, indexed by this tile's four corners as bits:
     1 north-west, 2 north-east, 4 south-west, 8 south-east, set when that
     corner is inside the same plot. A name here is the roof's own word for
     which way its open side faces — `n` is the tile whose plot carries on to
     the SOUTH of it, so the coping is along its north edge.

     Three of the sixteen are not roof shapes at all: 0 is a tile with no
     corner in its own plot (a one-tile plot, which only happens where the mass
     narrows to a sliver) and 6 and 9 are the two diagonals, where two plots
     touch at a point. All three take the field tile, because there is no
     honest coping to draw for a shape that has no side. */
  ROOF_WANG: [
    'mid', 'se', 'sw', 's', 'ne', 'e', 'mid', 'in.se',
    'nw', 'mid', 'w', 'in.sw', 'n', 'in.ne', 'in.nw', 'mid',
  ],
  /* The junk. Weighted the same way the materials are and for the same reason:
     most roofs have a vent and a puddle on them, one in a street has a lift
     overrun, and the empty string is the commonest thing on the list because
     most of a roof is roof. */
  ROOF_DECO: ['vent', 'vent', 'light', 'light', 'plant', 'tank', 'aerial', 'lift', 'stack'],

  /* THE PLOTS, AND THEY ARE CUT OUT OF THE MASS RATHER THAN OFF A GRID.

     One rectangle of solid between two streets is a BLOCK, and a block is not
     a building: it is a row of buildings that share party walls. Working out
     where those walls fall is the whole job here, because everything else
     about a roof — its material, its coping, the junk on it — is a fact about
     the building and not about the tile.

     The first version of this asked the COORDINATE. The map was taken in
     periods of sixteen, cut three to five apart off a hash of the period, and
     the rows were banded once per column band so the cuts would not line up
     into a chessboard. It is a tidy piece of arithmetic and it is wrong in the
     one way that matters: it knows nothing about the mass it is cutting. A
     block eleven deep and seventy wide came out as sixty-odd plots of three by
     four, each drawing its own material out of the bag, and what that is from
     above is not a town. It is a quilt. A high street where the roof changes
     colour every three metres in both directions reads as a rendering fault,
     which is what it was.

     So: find the blocks, and cut each one the way a terrace is actually built.

     ONE, THE BLOCKS. Flood the roof mass four ways. Every connected piece is
     one block and gets one id. This is the only part that costs anything and
     it is one pass over the map, once per level.

     TWO, WHICH WAY THE PARTY WALLS RUN. Down the block's SHORT axis, always,
     because that is what a party wall is: the frontage is on the long side and
     the building runs back from it. A block seventy wide and eleven deep is cut
     into units three to five wide, each of them eleven deep, and that is a
     terrace. Cutting it the other way — or both ways, which is what the grid
     did — makes a building with a party wall across the middle of it.

     THREE, BACK TO BACK. A block deep enough to have a street on both sides
     has two rows of buildings in it, not one, and they meet down the middle
     with their backs together. Nine tiles is the threshold: below it the plot
     runs the full depth, at or above it the block is split once down its
     middle and each half is its own run of units. Once, not repeatedly — the
     one thing a deep block is never divided into is a grid.

     The cuts inside a run are three to five apart, drawn off a hash of the
     block so the same block is cut the same way every frame and two blocks are
     not cut alike. Same as it ever was, and asked once per block rather than
     once per period of the map.

     Cached per level and thrown away with the baked tiles, exactly as the tile
     cache is: the mass is a function of the map and cannot change while a
     level is up. */
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
          /* AND THE FILL DOES NOT CROSS THE EDGE OF THE MAP.

             The outermost ring of tiles is not a building. It is the town
             carrying on past the view — see the note over roofAt() — and it
             runs all the way round, so a fill that walks through it comes back
             round the other side and joins every block that happens to touch
             the border into one. It did: nine hundred and thirty-two tiles,
             one material, the high street and the car park and the retail park
             all the same roof, because they are all connected through two rows
             at the top of the map that nobody can see. The rim is its own
             region and the blocks inside are their own. */
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
      /* WHERE THE PARTY WALLS GO, and the first answer is: BETWEEN THE SHOPS.

         A block with frontages on it is not an anonymous lump of mass to be
         divided up by arithmetic — it is a known terrace, and where one unit
         stops and the next starts is already written down in data/levels.js,
         because that is where somebody put a door. Cutting on a hash instead
         put the party walls in the middle of shops: the Bellhaven parade's
         doors are six tiles apart and the roof over them was changing material
         every three, so one shop wore two roofs and the roofs belonged to
         nothing. Halfway between one door and the next is where the wall
         between two shops is, and once the cuts are there every unit on the
         parade is one building, one material, one coping, the width of its own
         frontage — which is also what stops a shop reading as half the size of
         the room you walk into.

         Per RANK, not per block: a block between two streets has a row of
         shops facing each way and they are not the same shops. Rank 0 takes
         the doors off the block's north (or west) edge, rank 1 the ones off
         its south (or east) edge.

         A block with no doors on it — the middle of the retail park, the mass
         past the edge of the map — keeps the old rule, which is a cut every
         three to five tiles drawn off a hash of the block. That is a terrace
         nobody has drawn a frontage on yet, and it is what the whole town
         looked like before there were any. */
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
          /* AND THE STRETCHES WITH NO DOOR ON THEM ARE STILL BUILDINGS.

             A door is the only frontage this map writes down, and plenty of a
             real street has none you can see: the car wash you drive into, the
             blind side of a corner unit, the twenty yards of a parade nobody
             has furnished yet. The Bellhaven parade between Aldergate and
             Cargate has two doors on forty tiles, which made a single
             twenty-six tile building with no party wall anywhere along it —
             one shop the length of the street. Anything longer than eight
             tiles gets subdivided on the hash, four to seven apart, which is
             the same rule the unfurnished mass gets and is what a terrace is
             underneath. The known boundaries still win; this only fills in
             between them. */
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
      /* AND WHETHER THIS IS ONE TERRACE OR TWO BACK TO BACK, which is a
         question about frontages and not about depth. A block with doors on
         both of its long sides has a row of buildings facing each way and they
         meet down the middle with their backs together. A block with doors on
         only one side — the high street, whose far side is the edge of the map
         — is ONE terrace however deep it is, and its buildings run all the way
         through from the shop at the front to the yard at the back. Splitting
         that on depth alone gave the backs of the buildings their own party
         walls in different places from the fronts, which is a roofline that
         disagrees with itself along the length of the street. */
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
      /* WHICH MATERIAL, and A TERRACE IS ROOFED ALL AT ONCE.

         The bag was drawn from per UNIT, which is what a row of shops looks
         like if every shopkeeper re-roofed independently in a different decade
         — and it is not what a street looks like. A terrace goes up together
         and is covered together: twelve houses, one roof, one material, from
         the day it was built. What varies along a real run is one or two of
         them, where somebody took the slate off in 1988 and had it felted, or
         a bomb site was filled in with whatever was going. That is the
         exception and it reads as one BECAUSE the rest of the run agrees.

         So the bag is drawn from once per BLOCK, and each unit then has about
         one chance in seven of having been done since. Decided at the block's
         own north-west corner and at each unit's, so both are stable and
         neither moves when the camera does.

         The smallest row-major index IS that corner: furthest north, then
         furthest west. Asked of the corner rather than of the tile because a
         unit that straddles the edge of a `roofs:` rect would otherwise come
         out half pantile and half felt inside one unbroken parapet. */
      const first = new Map();
      let blockFirst = Infinity;
      for (const j of mine) {
        const plot = id[j];
        if (!first.has(plot) || j < first.get(plot)) first.set(plot, j);
        if (j < blockFirst) blockFirst = j;
      }
      const bfx = blockFirst % MAPW, bfy = (blockFirst - bfx) / MAPW;
      /* THE RIM IS NOT A TERRACE. It is the one region that wraps the entire
         map, and roofing it all at once means one draw deciding the colour of
         every edge of the world — including both sides of a railway the whole
         southern half of this map exists to be older than, since the draw is
         taken at (0,0) and the old town's own palette never gets asked. What
         is out there is not a row of buildings, it is a town: many roofs,
         decided one at a time, each from the bag for the part of the map it is
         actually on. */
      const rim = this.onRim(bfx, bfy);
      const blockBag = this.roofMatsAt(bfx, bfy);
      const blockMat = blockBag[this._hash('terrace' + b + ':' + bfx + ',' + bfy) % blockBag.length];
      for (const [plot, j] of first) {
        const jx = j % MAPW, jy = (j - jx) / MAPW;
        const bag = this.roofMatsAt(jx, jy);
        if (rim) { mat.set(plot, bag[this._hash('rim' + plot) % bag.length]); continue; }
        /* Re-roofed since, and never the same as its neighbours by accident:
           the pick is taken from the bag with the block's own material left
           out, or one unit in seven would come out identical to the run it is
           supposed to be an exception to. */
        const redone = (this._hash('redone' + plot) % 7) === 0;
        const others = bag.filter(m => m !== blockMat);
        mat.set(plot, (redone && others.length)
          ? others[this._hash('newroof' + plot) % others.length]
          : blockMat);
      }
      /* AND WHICH ROOF PLANE EACH TILE IS ON, which is not the same question as
         which building it is. Two houses in a terrace under one unbroken run of
         slate share a roof: there is one plane, one coping round the outside of
         the pair, and a party wall drawn ON it rather than a parapet returned
         between them. A unit that has been re-roofed is a different plane and
         gets a coping of its own, because a change of material at a boundary is
         a real step in the roof and is exactly where a parapet goes.

         So the group is the block AND the material, and the corner matching
         below runs on that. `id` is still the unit, and is what the party walls
         are drawn from. */
      /* AND A LONG RUN ALWAYS HAS ONE. A chance in seven means a terrace of
         thirteen comes out with none about one time in eight, and a whole
         street where every roof agrees is the thing this was trying to get
         away from in the other direction — the point is a run with an
         exception in it. Six units or more and nothing drawn yet, and one of
         them gets done, chosen the same stable way as everything else. */
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
  /* WHAT THIS PART OF TOWN IS ROOFED IN.

     A level may say, and most do not. `roofs: [{ m: [...], r: [x1,y1,x2,y2] }]`
     in a level def is the same shape of thing as `surfaces:` and does the same
     kind of job — it says what a piece of the map is MADE of, over the top of
     what the default would have been. The default is ROOF_MATS, which is the
     mix of a town that grew normally.

     It exists because this map is two towns. The half north of the railway was
     flattened and rebuilt in the sixties and is roofed the way that half of
     England is: slate, lead, and a lot of felt. The half south of it is a
     walled mediaeval centre with a minster in the middle, and a conservation
     area officer who will not have felt. Giving those two the same bag to draw
     from made the old town look like the retail park from above, which is the
     one thing the whole southern half of this map exists not to be.

     Asked of the plot's north-west corner and not of the tile, which matters
     at the boundary: a plot that straddles the edge of a rect would otherwise
     come out half pantile and half felt inside one unbroken parapet, and a
     building that changes material halfway across reads as a fault rather than
     as a boundary. One plot, one material, and the line between two palettes
     falls where the party walls already are. */
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
  /* A wall you can see the FACE of: solid, with walkable floor of some room
     directly below it. The same question the wall band asks itself as `below`,
     and the reason it is here is that the roof has to ask it of its neighbours
     as well as of itself. */
  wallFace(x, y) {
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return false;
    if (!World.solid[y][x]) return false;
    return y + 1 < MAPH && !World.solid[y + 1][x] && !!World.zone[y + 1][x];
  },
  /* Is this tile roof — solid, outdoors, and with no walkable tile beside it to
     be seen from. The same question the wall pass asks itself before it reaches
     the roof branch; asked here as well because the corner test has to ask it
     of eight neighbours, four of which may be off the map. Off the map is NOT
     roof: the edge of the world gets a parapet like anything else, which is
     honest — you are looking at the last building before the ring road. */
  roofAt(x, y) {
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return false;
    if (!World.solid[y][x] || World.open(x, y)) return false;
    if (this.wallFace(x, y)) return false;
    /* AND THE TILE ABOVE ONE IS THE TOP HALF OF THAT WALL, not roof.
       A wall you can see the face of is drawn TWO tiles high — see `below` in
       the wall band — and the second one is drawn over this tile. So a roof
       drawn here is a roof drawn underneath a wall: invisible, and, worse,
       it made this tile part of the same plot as the one behind it, so the
       parapet that should finish the top of the wall was drawn down here and
       covered, and the roof plane started a row further back with no edge on
       it at all. The building had no top. Excluded, and the coping lands on
       the true top of the wall, where the building actually stops. */
    if (this.wallFace(x, y + 1)) return false;
    if (x + 1 < MAPW && !World.solid[y][x + 1]) return false;
    if (x > 0 && !World.solid[y][x - 1]) return false;
    if (y > 0 && !World.solid[y - 1][x]) return false;
    return true;
  },
  /* ---- THE VERGE, WHICH IS THE RING OF WALL A ROOF SITS ON TOP OF ----------

     The three neighbour tests above are what keep a one-tile-wide run of mass
     from coming out as a strip of slate: a field wall, a garden wall, the
     churchyard wall. They are right, and they are also why the roof mass is
     INSET BY A TILE on the flanks and the back — so the coping landed a metre
     inside the footprint and the outermost ring of every building in the game
     was drawn as bare wall. From directly above that is a roof sitting in a
     grey tray, which is not what a building looks like from a helicopter and
     not what one looks like from anywhere: a roof OVERHANGS the walls that
     bear it. There is an eaves overhang at the front, a verge at each gable
     and another eaves at the back, and on all four the covering runs out past
     the wall face rather than stopping short of it.

     The front was already right, and by hand — see THE EAVES in the wall band,
     which bleeds a slice of the roof down over the top of the tall south face.
     That is the one wall in this projection you see the FACE of, so it has to
     keep its face and the roof can only lap the top few pixels of it. The
     other three you see the TOP of, and what is on top of them is roof.

     So the skirt is that ring, and it is deliberately not a relaxation of
     roofAt(). A skirt tile has to have a tile of real roof beside it, which is
     the whole difference: a field wall has none anywhere along it and comes
     out exactly as it always did, and a building has one all the way round.
     One tile thick by construction, because it is defined against roofAt()
     rather than against itself.

     DIAGONALS COUNT, and only for the corners. The north-west tile of a
     building has roof neither east of it nor south of it — the roof starts one
     in on both axes — so an orthogonal-only test left a grey notch at all four
     corners of every building on the map, which is the one place a missing
     tile of roof reads as damage rather than as detail. */
  roofSkirt(x, y) {
    if (x < 0 || y < 0 || x >= MAPW || y >= MAPH) return false;
    if (!World.solid[y][x] || World.open(x, y)) return false;
    /* The frontage and the top half of it are the wall you can see the face
       of. They are not skirt, for the reason roofAt() excludes them. */
    if (this.wallFace(x, y) || this.wallFace(x, y + 1)) return false;
    if (this.roofAt(x, y)) return false;
    /* AND THE ROOF IT LAPS OVER HAS TO BE A ROOF, which is worth a paragraph
       because it is the one case that is not a building.

       WHERE TWO ONE-TILE WALLS CROSS, the tile at the crossing has solid mass
       to its left, to its right and above it — so roofAt() has always said
       yes to it, and has always been right to in the one way that matters: it
       is drawn as a party-wall sliver, which is what a wall crossing looks
       like from above and is the same case as the one-tile-deep terrace of
       warehouses along the quay. Fine on its own. Not fine as a thing to lap a
       roof over: every crossing of two field walls on the outskirts grew a
       three-by-three patch of slate in the middle of a hedge, fifty-two tiles
       of it across the island, and a dry stone wall with a little roof where
       it meets the next one is the sort of fault you would look at for a long
       time before working out what it was.

       A roof of a BUILDING is at least two tiles across, so it has a roof tile
       next to it. A crossing is one tile and has none. That is the whole test,
       and it costs one more roofAt() per candidate. */
    const roof = (ax, ay) => this.roofAt(ax, ay)
      && (this.roofAt(ax - 1, ay) || this.roofAt(ax + 1, ay)
        || this.roofAt(ax, ay - 1) || this.roofAt(ax, ay + 1));
    if (roof(x - 1, y) || roof(x + 1, y) || roof(x, y - 1) || roof(x, y + 1)) return true;
    return roof(x - 1, y - 1) || roof(x + 1, y - 1)
      || roof(x - 1, y + 1) || roof(x + 1, y + 1);
  },
  /* Roof as far as everything downstream is concerned: the plane and the ring
     it laps over. This is what the plot fill floods, what the corner matching
     calls `same`, and what the wall band draws — so the coping, the party
     walls and the material all land on the true edge of the building without
     any of them knowing there is such a thing as a verge. */
  roofMass(x, y) { return this.roofAt(x, y) || this.roofSkirt(x, y); },
  /* One tile of roof, with the plot worked out and the tile picked. Returns
     null when the sheet has not decoded yet, which is what sends the wall pass
     back to roofBaked() for that frame. */
  roofTile(x, y) {
    /* CACHED PER TILE, and that is not an optimisation so much as the price of
       doing it this way at all. Picking one tile means asking roofPlot() of
       this tile and its eight neighbours, and each of those is two banded
       lookups — call it twenty per tile, six hundred tiles on screen, sixty
       times a second. Nothing about the answer can change while a level is up:
       the plots are a function of the coordinate and the mass is a function of
       the map. So it is worked out once per tile and the wall pass gets an
       array lookup and a blit, which is what it had before any of this. Thrown
       away with the baked tiles, and when the level changes under it. */
    const i = y * MAPW + x;
    if (!this._roofOf || this._roofLevel !== World.level) { this._roofLevel = World.level; this._roofOf = []; }
    const hit = this._roofOf[i];
    if (hit) return hit;
    const plots = this.roofPlots();
    const plot = plots.id[i], group = plots.grp[i];
    const mat = plots.mat.get(plot) || this.ROOF_MATS[0];
    if (!Tiles.has('roof.' + mat + '.mid')) return null;
    /* SAME ROOF, not same building — see the note on `grp` in roofPlots(). A
       run of houses under one unbroken slope is one plane with one coping
       round the outside of the whole run; the boundaries inside it are party
       walls drawn on the roof, not parapets returned between two of them. */
    const same = (ax, ay) => this.roofMass(ax, ay) && plots.grp[ay * MAPW + ax] === group;
    /* A CORNER is inside the plot when all three tiles touching it are — this
       one is by definition, so it is the other three that decide. */
    const c = (dx, dy) => (same(x + dx, y) && same(x, y + dy) && same(x + dx, y + dy)) ? 1 : 0;
    const bits = c(-1, -1) | (c(1, -1) << 1) | (c(-1, 1) << 2) | (c(1, 1) << 3);
    const key = this.ROOF_WANG[bits];
    /* Weathering and junk go on the FIELD tile only. On an edge or a corner
       most of the tile is coping and there is nowhere to put either, and a
       water tank sat half over a parapet is the one thing on a roof that reads
       as a bug rather than as a building. */
    if (key !== 'mid') return (this._roofOf[i] = this.roofBake(mat, key, 0, '', ''));
    /* A SLIVER. `mid` with anything but all four corners set means this tile is
       field because there was no honest coping to draw, not because it is in
       the middle of anything — a plot one tile deep, which is what the terrace
       of warehouses along the quay is and what the nave of the minster is. The
       corner-matched set has no piece for that and no kit's does: a run one
       tile wide is drawn as a run, not as four parapets back to back.

       What it gets instead is a PARTY WALL: a line of the gutter's own dark
       down each side the plot does not carry on into. That is the difference
       between a row of little buildings and a stripe, and on a one-deep terrace
       it is the only thing saying there is more than one shop there. */
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
    /* AND THE PARTY WALLS INSIDE THE RUN.

       Field tile, so this is the middle of a roof plane — but a plane can have
       more than one building under it, and where the boundary between two of
       them falls you can see it: a party wall carried up through the covering,
       a change of pitch, a line of flashing, a gutter that stops. Same two
       pixels of dark the sliver case uses, drawn on the edge the boundary is
       on, from both sides, so a run of houses reads as a run of houses rather
       than as one very long building.

       NOT ALWAYS, which is the other half of it. Roofs get done two and three
       at a time, and a covering laid over a neighbour's wall as well as your
       own leaves nothing on top to see. One boundary in five is invisible, and
       because the decision is taken for the BOUNDARY rather than for the tile,
       it is invisible down its whole length instead of flickering along it. */
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
  /* The crop, the weathering and the junk, baked together. One canvas per
     combination that actually occurs — about a hundred and thirty of them on a
     level with all five materials on it — and one blit a tile after that, which
     is what the procedural version cost. */
  roofBake(mat, key, v, deco, cut) {
    const name = 'roof.' + mat + '.' + key;
    return this._bake('R' + name + v + deco + '|' + cut, (g, N, rnd) => {
      const r = Tiles.rects[name];
      g.imageSmoothingEnabled = false;
      g.drawImage(Tiles.imgFor(name), r[0], r[1], r[2], r[3], 0, 0, N, N);
      if (key === 'mid') {
        /* WEATHERING, which is here to kill the repeat. The field tile is one
           32-pixel square laid over a whole building and the eye finds that
           grid immediately; two variants of a few soft patches of damp and
           lichen is enough to stop it, and is what a flat roof looks like
           anyway three winters after anybody last went up there. */
        for (let i = 0; i < 4; i++) {
          g.fillStyle = rnd() > .45 ? 'rgba(0,0,0,.09)' : 'rgba(184,196,170,.055)';
          g.beginPath();
          g.ellipse(rnd() * N, rnd() * N, 5 + rnd() * 13, 4 + rnd() * 10, rnd() * 3, 0, 6.3);
          g.fill();
        }
        if (deco) this.roofDeco(g, N, rnd, deco, mat);
      }
      /* The party wall, drawn last so nothing sits over it. Two source pixels
         of gutter and one of damp course above it, on whichever sides were
         asked for — see the note about slivers in roofTile(). */
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
  /* What is on the roof. Drawn rather than cropped: the kit these tiles come
     from has no rooftop plant in it, nobody's does, and the things on a British
     flat roof are five boxes and an aerial — which is about forty lines of
     canvas and does not need to be somebody else's pixels.

     Every one of them is lit from the north-west and drops its shadow to the
     south-east, which is where everything else in this game puts one. */
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
        /* A ROOFLIGHT. Wired glass in a kerb, two panes, and the sky in it —
           which is the only thing on a roof that is ever brighter than the
           roof. Colder than the daylight on the street on purpose: you are
           looking at reflected sky, not at lit ground. */
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
        /* An air-handling unit on a timber frame, with louvres down the front
           and a duct off the side of it. The thing that keeps a shop cold and
           is the reason the flat above it can hear a hum. */
        const w = 16 * u, h = 11 * u, x = (7 + rnd() * 3) * u, y = (9 + rnd() * 5) * u;
        box(x, y, w, h, '#69707a', '#464c55');
        g.fillStyle = 'rgba(0,0,0,.30)';
        for (let i = 1; i < 6; i++) g.fillRect(x + 2 * u, y + h - 3 * u - i * 1.4 * u, w - 4 * u, u);
        g.fillStyle = '#5b626b'; g.fillRect(x + w, y + 3 * u, 5 * u, 4 * u);       /* the duct */
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + w, y + 3 * u, 5 * u, u);
        break;
      }
      case 'tank': {
        /* A water tank on four legs, which is a Victorian answer to a problem
           the building stopped having in about 1970 and which is still up
           there because taking it down costs more than leaving it. */
        const w = 13 * u, h = 9 * u, x = (9 + rnd() * 4) * u, y = (8 + rnd() * 4) * u;
        /* The legs first and the tank over them, so what you see of a leg is
           the bit that sticks out below — which is the only part of a gantry
           you can see from directly above, and the whole of how it reads as
           standing OFF the roof rather than sitting on it. */
        g.fillStyle = 'rgba(0,0,0,.26)'; g.fillRect(x + 2 * u, y + 3 * u, w, h + 3 * u);
        g.fillStyle = '#3f4650';
        for (const lx of [x + u, x + w - 2.5 * u]) g.fillRect(lx, y + 2 * u, 1.5 * u, h + 4 * u);
        box(x, y, w, h, '#6d6459', '#4b453d');
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 3 * u, y + 2 * u, w - 6 * u, u);
        g.fillStyle = 'rgba(120,150,110,.22)'; g.fillRect(x, y + h - 4 * u, w, u);  /* the algae line */
        break;
      }
      case 'lift': {
        /* The overrun: the stair head and the lift motor room, which is the one
           thing up here that is the same material as the building under it and
           is drawn that way — a small windowless single storey with a parapet
           of its own, standing on a roof. */
        const w = 17 * u, h = 13 * u, x = (6 + rnd() * 4) * u, y = (8 + rnd() * 4) * u;
        g.fillStyle = 'rgba(0,0,0,.36)'; g.fillRect(x + 3 * u, y + 3 * u, w, h);
        /* Brick where the building is brick, render where it is not, because
           the one thing everybody gets right about an overrun is that it was
           built by whoever built the rest of it. */
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
        /* An H aerial and a dish, on the same bracket, pointing two different
           ways. Analogue stopped in 2012 and the aerial is still there, because
           the aerial is always still there. */
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
        /* A CHIMNEY STACK with four pots on it. Nothing is lit under any of
           them and has not been since the clean air acts, which is why three of
           the four have a cowl on and the fourth has a bird in it. */
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
  /* The roof this game had before it had a sheet of them, kept because the
     sheet is a separate PNG and a separate PNG is a separate thing that might
     not have decoded yet. One frame of slate courses on the first frame after a
     level loads is nothing; a hole in the middle of the town is not. */
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
     Two passes that exist only because a level declared `surfaces:` and
     `paint:`, and that cost one bounds check on every level that did not.

     The KERB is derived rather than drawn by hand: wherever a tile of one
     surface meets walkable ground of another, there is a step between them,
     and a step is a lit top edge and a shadow in the gutter. Doing it this way
     means a car park somebody redraws in the editor gets its kerbs right
     without anybody drawing one — and it is the same reason the vehicle
     crossover at the car park exit has no kerb across it: the tarmac is
     carried through the pavement there, so there is no boundary to find. */
  kerbs(x0, y0, x1, y1) {
    if (!World.surf) return;
    const c = this.ctx;
    /* Ground you can SEE, which is not the same as ground you can stand on:
       an open surface is solid and still has an edge worth drawing, because
       the edge between a wharf and the water is a wall four feet down and is
       the most important line on that half of the map. Everything else here is
       exactly as it was — an ordinary wall has no surface on it and so is still
       thrown out by the first test. */
    const vis = (x, y) => !(x < 0 || y < 0 || x >= MAPW || y >= MAPH)
      && (!World.solid[y][x] || World.open(x, y));
    const at = (x, y) => vis(x, y) ? { s: World.surfAt(x, y) } : false;
    /* A KERB IS A MADE EDGE, which is the whole of why `soft` exists. Grass
       meeting tarmac is a verge and has a kerb along it; grass meeting the
       track up to a farm is one sort of ground meeting another and has
       nothing along it at all, and until this test was here it had four
       inches of pale concrete down both sides of it through the middle of a
       wood. Two soft surfaces have no edge between them worth drawing. */
    const soft = n => !!(n && SURFACES[n] && SURFACES[n].soft);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = World.surfAt(x, y);
      if (!s || !vis(x, y)) continue;
      const px = x * TILE, py = y * TILE;
      /* Only ever from the surfaced side, and between two surfaced tiles only
         from the one whose name sorts first — otherwise every boundary is
         drawn twice, which doubles the shadow and shows as a dark line down
         the middle of the kerb. */
      const edge = n => n && n.s !== s && (!n.s || s < n.s) && !(soft(s) && soft(n.s));
      /* North and west get the kerb TOP (the pavement is up or left of here,
         so the lit face is on that side); south and east get it likewise. The
         gutter shadow is always inside the tarmac. */
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
  /* The paint, from the level's own `paint:` list. Six words of vocabulary,
     all of them in TILES because that is what the rest of a level is written
     in, and all of them faded, because the last time anybody repainted
     Bellhaven Road the building had a different name over the door.

       dash   a broken white line from a to b — a centre line
       line   a solid one — a give way, a stop line
       yellow a double yellow along a kerb, from a to b
       zebra  a crossing filling r; the bars run the way the traffic does and
              repeat across it, which is the way you walk over them
       bays   r divided into two-tile parking bays, open on the side named
       text   words painted on the road at `at`, turned by `turn` quarter turns
       rails  a railway track from a to b — two rails and the sleepers under
              them, on the ballast

     `rails` is the odd one and belongs here anyway, for the reason the note
     above gives: a marking is linework laid on the ground at a position, and a
     running line is the most position-dependent linework there is. It is not a
     tile for the same reason the centre lines are not — a track that came in
     32-pixel pieces would put a sleeper joint every metre, and the one thing
     everybody knows about the sound of a train is that the joints are further
     apart than that.

     Baked with the rest of the ground now, into the chunks ground() keeps —
     which are not the size of a level, and are thrown away with it for free.
     `view` is the rectangle to cull against: the chunk being baked, or the
     camera when the cache is off. */
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
          /* Sleepers first, then the two rails over them, then the shine along
             the top of each — which is the only part of a railway anybody has
             ever actually looked at. The gauge is 22px, which is a shade over
             two thirds of a tile: on the same floor a person is 19 wide, and
             standing somebody between the rails is the check that says whether
             a track is the right size. */
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
        /* A STOP LINE, which is not a give-way line and is the difference
           between a junction with a sign on it and a junction with lights. A
           give-way line is the thin one you may cross when the road is clear;
           this is the fat one you may not cross at all while the light says
           so, and it is wider and whiter on the ground for exactly that
           reason. Nine inches against six, in a country that still paints them
           in inches. */
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
      /* A PELICAN, which is one word for the whole marking because on the
         ground it is one marking. A zebra is stripes; a pelican is two rows of
         square studs across the road and the zig-zags on the approach to it,
         and you can tell which of the two you are looking at from fifty yards
         away before you have seen a single lamp. Drawing the studs without the
         zig-zags would be a crossing wearing half its clothes, and making them
         two words would be two entries that have to agree about where a
         crossing is.

         The zig-zags are the part that is doing the work. Their whole job is
         to be visible from further back than the crossing is, which is why
         they run twenty-odd metres up each approach and why nothing may park
         on them — and it is the reason the kerbside parking in data/levels.js
         stops where it does at both of these. */
      if (m.p === 'pelican' && m.r) {
        const [x1, y1, x2, y2] = m.r;
        const px = x1 * TILE, py = y1 * TILE;
        const w = (x2 - x1 + 1) * TILE, h = (y2 - y1 + 1) * TILE;
        if (!near(px - TILE * 5, py - TILE * 5, px + w + TILE * 5, py + h + TILE * 5)) continue;
        /* Which way the road runs, by the same test the zebra uses and for the
           same reason: a crossing is a few tiles ALONG the road and the whole
           width of it across. */
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
        /* THE ZIG-ZAGS. Four runs: one along each side of the carriageway, on
           each approach. A tooth to the tile, a third of a tile deep, set in
           from the kerb by a tooth's depth so the line has room to zig. */
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
        /* The bars run WITH the traffic and REPEAT across it: you walk over
           them one at a time and you drive along the length of one. So each
           bar is laid along the crossing's SHORT side — which is the way the
           road runs, a crossing being a few tiles of road and the whole width
           of it — and they are spaced out along the long one.
           This was the other way round for a year and it is the sort of thing
           you cannot unsee once somebody says it: the stripes were at ninety
           degrees to every zebra crossing in the country. */
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
        /* Bays are two tiles across. The open side is the one you drive in
           from, so the dividers run away from it and the closed end gets a
           line along it. */
        const acrossX = m.open === 'n' || m.open === 's';
        c.save();
        c.strokeStyle = WHITE; c.lineWidth = 3;
        c.beginPath();
        /* THE HEAD OF THE BAY, drawn INSIDE the rectangle rather than along
           its edge. It used to be laid exactly on the boundary, which is the
           boundary with whatever the bays are backed onto — a car park wall,
           a kerb — and that is drawn after the paint and over the top of it.
           Half a line of three pixels survived, under a wall, which on screen
           is no line at all: every bay in both car parks was two sides and an
           open end, and a bay with no head is not a bay, it is a pair of
           lines. Half the width in is the whole line showing. */
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
        /* A LANE OF PARALLEL PARKING along a kerb, which is a different mark
           from `bays` and a different thing on the ground. `bays` is a car
           park: you drive in off an aisle and the dividers run away from it,
           square to the kerb. This is a street: the cars lie ALONG the kerb,
           nose to tail, and what is painted is a line between them and the
           moving traffic with a short tick closing off each bay.

           It exists because every carriageway in this town is six tiles wide
           and the traffic only ever uses the middle four of them. Six tiles is
           a nineteen-metre road, which is not a street in a market town, it is
           a runway — and the two outer tiles were empty tarmac for the length
           of the map because nothing was ever going to drive down them. They
           are parking now, which is both what a road that wide actually is and
           the reason it is allowed to be that wide.

           `side` names the KERB, so the outer line is drawn on the far side
           from it and the ticks run inwards. One tile deep, always: a parked
           car is about a tile wide and this is a lane, not a compound. */
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
        /* Road lettering is tall and narrow because it is read at an angle
           from a long way off, and squashing the font sideways is how it is
           done in real life too. */
        c.scale(0.82, 2);
        c.font = ROAD_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = WHITE;
        c.fillText(m.s || '', 0, 0);
        c.restore();
      }
    }
  },
  /* WHAT SHAPE A VEHICLE IS, so that a bus and a hatchback are not the same
     drawing at two sizes — which is what they were, and which is why the 41
     read as a very long car.

     It used to be six numbers and it is five, because three of them described
     a body this file no longer draws: `base` and `rear` put the axles under
     the wheel arches and `cab` said how much of the length was cabin, and the
     arches, the seams and the mirrors they placed are all in the sheet's
     pixels now. What is left is the three that describe the OUTLINE, which is
     still drawn — it is the shape the shadow is cast from — plus the two that
     say which vehicle to take off the sheet and how to read it.

       nose/tail  how much of the full width the front and back keep. A car is
                  narrower at both ends than across the doors; a van and a bus
                  are boxes and say so.
       belly      how far the sides bulge past the widest point. Under 1 for a
                  slab, a shade over for a body with shoulders on it.
       sprite     which of art/sprites/cars.png's vehicles this one is.
       seat       where its windscreen is, as a fraction of the half-length
                  from the middle, which is where the driver's head goes.
       lamp       how far in from each side its lamps sit, as a fraction of the
                  half-width. Measured off the art — see carLamps().
       livery     the sheet's own paint is the point of this one; do not tint.

     A new model is still an entry in a table and not a new drawing: it names a
     shape, or names none and gets `car`. */
  CARSHAPES: {
    car: { nose: .84, tail: .90, belly: 1.03, sprite: 'car.coupe', seat: .12, lamp: .71 },
    van: { nose: .97, tail: .99, belly: 1.0, sprite: 'car.van', seat: .72, lamp: .56 },
    bus: { nose: .98, tail: .99, belly: 1.0, sprite: 'car.bus', seat: .75, lamp: .66 },
    /* A taxi is its own silhouette only because the sheet drew one: the
       chequers down the doors and the sign on the roof are painted on, so this
       is the one vehicle whose paint is the artist's rather than the CARS
       table's — which is what `livery` means. Everything else about it is a
       car. */
    taxi: { nose: .84, tail: .90, belly: 1.03, sprite: 'car.taxi', seat: .12, lamp: .56, livery: true },
  },
  /* THE BODY, OFF THE SHEET.

     art/sprites/cars.png is thirty vehicles drawn from directly above, and
     four of them are the bodies this game uses — one per silhouette. It
     replaces about twenty paths per vehicle with one blit, and it is the whole
     of what a car IS from up here: the screens, the mirrors, the shut lines,
     the arches and the lamps are all in the pixels.

     The note over car() used to say a sprite was the wrong answer because a
     sheet gives you eight angles and the renderer gives you any. That is true
     of a sheet drawn in PERSPECTIVE and false of one drawn from overhead: a
     car seen from straight up is the same shape whichever way it is pointing,
     so one rectangle rotates through all 360 degrees and the objection does
     not apply. What it cost instead is the four facts below.

     THE PAINT IS STILL THE GAME'S. The sheet has no blue car, no green one and
     nothing in the browns and purples the levels ask for, so a car drawn in
     the artist's own colours would throw away the twenty-five paint jobs the
     catalogue already specifies and put sixteen identical cars outside the
     Greggs. So the base sprite is a plain silver one and the body colour is
     multiplied through it, which keeps every highlight, shut line and pane of
     glass the artist drew and changes only the hue. The dark parts stay dark
     because anything times a colour is darker than it was.

     Multiply and destination-in, rather than reading the pixels: this canvas
     has a file:// image drawn into it and is therefore tainted, so
     getImageData would throw on the one copy of the game that opens off disk.
     Compositing is not a read. See the note over Sprites.compose().

     ROTATED A QUARTER TURN, because the sheet draws every vehicle nose-up and
     angle zero in this engine is east.

     NOT SMOOTHED OFF. Everything else from an atlas is blitted 1:1 with
     smoothing disabled, and this one cannot be: it is scaled to whatever len
     and wid the model declares — 1.56x across and 1.95x along for a hatchback
     — and then rotated to a heading that is almost never square. Nearest
     neighbour at a fractional non-uniform scale gives pixels of two different
     widths in the same car, and the rotation resamples it again anyway. */
  /* Whether this silhouette's vehicle is on the page yet. Its own function
     because carArt() has to ask before it starts drawing and carSprite() has
     to ask before it draws, and two spellings of the same question is how one
     of them ends up answering something slightly different. */
  carSheet(S) {
    return typeof Tiles !== 'undefined' && !!S.sprite && Tiles.has(S.sprite)
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
    /* HOW WET IT IS. The drawn body had a polish that knew what the weather was
       doing and the sheet has one fixed overcast highlight, so without this a
       rained-on street is full of cars that have not noticed. `source-atop`
       rather than another destination-in pass: it paints only where the sprite
       already is, which is the whole of what is wanted here. */
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
  /* WHERE A VEHICLE'S LAMPS ARE, as centres in its own frame.

     Measured off the four sprites rather than guessed: every one of them
     carries its tail lamps between a fifth and a quarter of the way in from
     each side, and its head and tail clusters within a twentieth of the length
     of each end. A brake light that does not land on the lamp the artist
     already drew there does not read as a brake light — it reads as a second
     lamp coming on somewhere else.

     Its own function rather than four numbers inline, because `lamp` is the
     only thing the four silhouettes disagree about and a van's are noticeably
     further in than a coupe's. */
  carLamps(d, S) {
    const hl = d.len / 2, hw = d.wid / 2;
    return { hx: hl * .90, tx: -hl * .92, v: hw * S.lamp };
  },
  /* THE BAKED HALF OF A VEHICLE.

     Everything about one that is the same from frame to frame — the body, the
     arches, the flanks, the panel gaps, the polish, the glass, the bumpers,
     the mirrors, the door sign — is about twenty paths, and twenty paths times
     eleven vehicles times sixty frames is the arithmetic that decides whether
     this game runs on a phone. Drawn live, the layered body cost three and a
     half times what the flat one did.

     So it is baked, exactly as the floor tiles are: drawn flat into a small
     canvas the first time it is asked for and blitted after that, which turns
     twenty paths into one drawImage and leaves the layering free. What is left
     to draw live is the four things that actually change — the wheels, because
     the front pair steer; the lights, because they come on; the indicators,
     because they blink; and whoever is in it.

     Baked at 2x for the reason R._bake() is: the canvas is scaled by the device
     pixel ratio and a sprite blown up is a smear. Keyed by the model and by how
     wet the paint is — the polish is the one part of a car that knows what the
     weather is doing — and the wet is quantised, so drizzle turning into rain
     does not rebake eleven vehicles a frame. */
  /* ---- THE LIGHTS ----
     Drawn rather than cropped, and for exactly the reason the cars are. The
     whole of what a signal DOES is change: a sheet would have to carry every
     head in every aspect, and the atlas carries one — a red and nothing else,
     which is why it is on the one set of lights in this town that has never
     shown anything else (see FURN.signals and tools/sheets/streets.mjs).

     What is on the pole depends on what the pole is for. Every arm gets the
     three-aspect head the traffic reads. A crossing's poles get two more
     things, because a pelican pole is three units bolted to one post and
     everybody knows the shape of it without ever having looked: the man
     facing across the road, and under him the box with the button in it and
     the word WAIT over the top.

     The lenses are visible when they are off. That is not decoration — an
     unlit signal head in this country is three dark coloured circles in a
     black board, and a head drawn with three grey holes reads as broken. What
     lighting one does is make it bright and put a bloom round it, which is
     also the only part of this that is drawn with 'lighter'. */
  SIG: { red: '#e8342c', amber: '#f0a42a', green: '#34c759' },
  signalHead(arm, ex, ey) {
    const c = this.ctx, inst = arm.inst;
    const asp = Signals.aspect(arm);
    /* Flashing amber is a phase in its own right and has to flash: five
       seconds of a steady amber is a different instruction. Four a second,
       which is what the real ones do and is fast enough to read as flashing
       rather than as a fault. */
    const flash = (this.t * 4 | 0) & 1;
    const on = {
      red: asp === 'red' || asp === 'redamber',
      amber: asp === 'amber' || asp === 'redamber' || (asp === 'flash' && flash),
      green: asp === 'green'
    };
    /* The post. Three tiles of it, anchored by its foot like the lamp columns,
       and leaning a few pixels out over the approach it holds so that which
       way a head faces is a thing you can see from above without an arrow on
       it. */
    const lean = 4;
    const bx = ex - arm.gx * lean, base = ey + 14, top = ey - 52;
    this.shadow(ex, base - 1, 9, 4);
    c.save();
    c.fillStyle = '#4a4e54'; c.fillRect(bx - 2.5, top, 5, base - top);
    c.fillStyle = '#6b7076'; c.fillRect(bx - 2.5, top, 1.5, base - top);
    /* The base flange, which is the bit that makes a post look bolted down
       rather than pushed in. */
    c.fillStyle = '#3a3e44'; c.fillRect(bx - 5, base - 3, 10, 3);

    /* The head: a black board with a pale border, which is the retroreflective
       backing every signal in the country has had since the seventies. */
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

    /* And the light itself, put back over the grade rather than left out of
       it — the same rule as R.lamps(), and the reason a red light in this game
       has something round it at eight o'clock and nothing round it at two in
       the afternoon. Signals glow a little in daylight too, because they are
       the only thing on a street bright enough to. */
    const night = (typeof Sky !== 'undefined') ? clamp(-Sky.sunPos() * 1.6 + .55, .22, 1) : .5;
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
  /* The man, and the box with the button in it. Both face ACROSS the road
     rather than along it, so both are drawn square to the screen — which is
     also the only way a ten-pixel figure is ever going to read as a person.
     He is six rectangles: a head, a body, two arms and two legs, standing with
     his feet together when he is red and mid-stride when he is green, because
     that is the entire difference between the two and everybody knows it. */
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
    /* THE WAIT PLATE AND THE BUTTON. The plate is lit from the moment the
       button goes in until the man goes green, which is the whole of the
       interval anybody has ever had an opinion about. The button under it is
       always there, because the button is always there. */
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
  /* A hex colour as an rgba template R.glow() can fill in. Two lines, and it
     exists because every glow in this file was written with its colour spelt
     out and a signal's is picked at runtime. */
  rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')';
  },
  CAR_PAD: 10,
  carArt(d) {
    const S = this.CARSHAPES[d.shape] || this.CARSHAPES.car;
    /* BEFORE ANY CANVAS WORK, because nothing below it is cached when the
       answer is no: this returns null until the atlas decodes, and asked once
       per car per frame on a road with ninety-two of them, a bake-then-discard
       further down would be ninety-two shadows a frame for as long as the
       sheet took to arrive. */
    if (!this.carSheet(S)) return null;
    const wet = Math.round((((typeof Sky !== 'undefined' && Sky.wet()) || 0)) * 4) / 4;
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

    /* The outline, and it is a PATH rather than a rounded rectangle. A rect is
       a slab: the whole reason a car reads as a car from directly above is that
       it is narrower at the nose than across the doors, and a bus reads as a
       bus because it is not. One function, laid down by both the shadow and the
       body, so the two can never disagree about the shape. */
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

    /* ---- THE SHADOW ----
       Two shadows in one sprite, because a car casts two and only one of them
       is the shape of the car. THE CAST one is soft and offset down and a
       little right like every other shadow in this game, and it is three
       passes rather than one: a flat copy of the outline six pixels down is a
       stencil, and a shadow has an edge that goes soft. THE CONTACT one is
       tight, dark and barely offset — the dark under the sills where no light
       gets in at all, and the one that puts the car ON the road rather than
       above it.
       Their offset from each other is baked in; the sprite is blitted at the
       contact one's own place. */
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
    /* THE BODY. One blit off the sheet, and nothing behind it.

       There WAS a drawn body here — about two hundred lines that built a car
       out of an outline, four arches, two flanks, the panel gaps, the glass
       and a polish — and it was kept for a while as the fallback for a copy
       opened without art/, which is the rule the emoji keep for the
       furniture. It is gone, deliberately, and the reason is this project's
       own: an entry nobody asks for is never seen to be wrong. release.sh
       stages every sheet the manifest names and refuses to publish one that
       is missing or the wrong size, so a released copy always has this art;
       a fallback that can only run in a checkout somebody has deleted art/
       from is two hundred lines nothing would ever notice rotting.

       What that costs is stated plainly rather than hidden: WITHOUT THE SHEET
       THERE ARE NO CARS. Not emoji ones, none — carArt() has already returned
       null above and R.car() draws nothing. It is also why the cars are a test
       now: with one path and no safety net, a renamed rect is an empty road and
       nothing else in the suite would have said so. See `sprites`. */
    this.carSprite(c, d, S, wet);

    /* The magnetic door sign that has slid, which the pool car's own entry in
       the CARS table has described since the day it was written. Drawn over
       the sheet, because none of its thirty vehicles has a door sign and this
       one is a piece of the writing rather than a piece of the drawing. */
    if (d.sign) {
      c.save(); c.translate(-hl * .06, -hw + 1.5); c.rotate(-0.09);
      c.fillStyle = 'rgba(232,236,242,.9)';
      c.beginPath(); c.roundRect(-hl * .22, 0, hl * .44, 5, 1); c.fill();
      c.fillStyle = 'rgba(60,80,120,.55)';
      c.fillRect(-hl * .18, 1.6, hl * .36, 1.8);
      c.restore();
    }

    const art = { w, h, body: bd.cv, shadow: sh.cv };
    /* One entry per model per quarter-step of wet, so the map is bounded by the
       CARS table and cannot grow with the traffic. Reached only once the sheet
       is up — the early return above caches nothing — so the first cars drawn
       on a cold load are baked the moment the atlas decodes rather than being
       cached as whatever was available before it. */
    this._cars.set(key, art);
    return art;
  },

  /* One vehicle, from above: the body, whoever is in it, and the lights that
     say what it is doing.

     The body is a sprite now — see carSprite(). It was not, for a long time,
     and the reason was a good one while it lasted: the kit this game pins is a
     mediaeval-through-Victorian tile set with a wheelchair and a shopping
     trolley in it as the only wheeled things in the whole repository, so a car
     in that style had to be drawn, and a car that is drawn may as well be
     drawn by the renderer. The argument that a sheet would only give eight
     angles never applied to a sheet drawn from DIRECTLY ABOVE, which is what
     art/sprites/cars.png is: from up there a car is the same shape whichever
     way it is pointing, so one rectangle rotates through all of them.

     What this function does is the things about a vehicle that MOVE, and they
     are the reason the sheet is a base rather than the whole answer: a drawn
     car's lamps are on all the time and these come on, so the brakes, the
     indicators and the reversing wash are painted live over whichever body is
     underneath. The rest of it is carArt(), baked. */
  car(car) {
    const c = this.ctx, d = car.def;
    const hl = d.len / 2, hw = d.wid / 2;
    const S = this.CARSHAPES[d.shape] || this.CARSHAPES.car;
    /* No sheet, no car — see carArt(). Null only in the moments before the
       atlas has decoded, and a car that is not drawn for two frames is better
       than a lamp and a driver's head floating over an empty road. */
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

    /* THERE ARE NO DRAWN WHEELS ANY MORE, and it is worth saying why rather
       than leaving a gap. There were: four black lozenges, the front pair
       turned to wherever the steering was, which was the single thing that
       most said a car was being DRIVEN rather than slid. The sheet's bodies
       carry their own wheels and arches in the pixels, and from directly above
       a car covers its own tyres — so a lozenge laid over that art read as
       something stuck to the car's sides. `car.wheel` is still kept by
       engine/cars.js, because the steering angle is what the physics turns on;
       it simply has nothing to draw now.

       Everything the vehicle IS, in one blit. */
    c.drawImage(art.body, ax, ay, art.w, art.h);

    /* Somebody in it. A head, at the right-hand seat, because this is Bellhaven
       and not Bellhaven, Ohio. */
    if (car === Cars.driving || car.traffic) {
      /* Under the WINDSCREEN, which the four sheets do not put in the same
         place: a coupe glazes its middle and a van glazes right over its front
         axle. Get it wrong on a van and the driver is sitting on the roof. */
      const seat = hl * S.seat;
      c.fillStyle = car === Cars.driving ? 'rgba(233,214,190,.95)' : 'rgba(60,66,78,.9)';
      c.beginPath(); c.arc(seat, hw * 0.42, 3.4, 0, 6.3); c.fill();
    }

    /* THE LAMPS THAT SAY WHAT IT IS DOING, and they are painted over the
       sheet's own dull pair rather than instead of them, at the place
       carLamps() says the sheet keeps them. One question, asked once, or a
       brake light lands beside the lamp instead of on it. */
    const L = this.carLamps(d, S);
    const lamp = (x, v, lw, lh, col) => {
      c.fillStyle = col;
      c.beginPath(); c.roundRect(x - lw / 2, v - lh / 2, lw, lh, Math.min(lw, lh) / 2); c.fill();
    };
    /* The back pair come up when the brakes are on or when it is reversing,
       which are the two times a car behind you needs to know. Painted over the
       dull pair the body already carries. */
    const lit = car.braking || car.fwd < -4;
    if (lit) for (const v of [-1, 1]) lamp(L.tx, v * L.v, 3, 5, '#ff5f56');
    /* INDICATORS, and they are real: `blink` is what the driver has DECIDED,
       which for the car you are in is the wheel in your own hands and for
       everything else is the corner it is coming up to — signalled before the
       turn rather than during it, which is the entire point of an indicator and
       is a thing a driver can only do if it knows where it is going. See
       Cars.signal(). The 41 pulling away from a stop has its indicator on,
       which is a thing the bus stop's act claims about it. Off with Animation,
       along with everything else that blinks. */
    const turn = car.blink || 0;
    if (this.animate && Math.abs(turn) > .22 && Math.floor(this.t * 2.6) % 2 === 0) {
      const v = turn < 0 ? -1 : 1;
      /* INBOARD of the headlight, not outboard. The lights already sit at the
         widest part of the nose, so pushing the indicator further out put it
         three pixels off the side of the vehicle, hanging in the road. */
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
  /* Bake an out-of-focus version of the current frame into the canvas, once,
     when a full-screen overlay opens. One canvas operation instead of a CSS
     filter the compositor would redo on every frame. */
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
  /* ---- Legacy furniture ----
     Desks, tables, worktops, counters, cubicles and doorways are full of pixel
     counts chosen by eye at the old 44px tile. Rather than re-tune sixty of
     them, they draw in their own units and the canvas scales them down: `fn`
     is handed that tile size, shadowing the global one. Anything new should be
     written against TILE and stay outside this wrapper. */
  REF_TILE: 44,
  legacy(fn) {
    const c = this.ctx;
    c.save(); c.scale(TILE / this.REF_TILE, TILE / this.REF_TILE);
    fn(this.REF_TILE);
    c.restore();
  },
  /* WHAT YOU SEE THROUGH AN OPEN DOOR.

     A doorway in a wall you can walk through has floor under it already and
     wants nothing from this. A doorway cut into wall MASS does not: the room
     behind it is a whole other level, the tile is brick, and what showed
     between the jambs was that brick. Every frontage in this town read as a
     door stuck on a wall, and the front of this building read as two doors
     stuck on a car park wall, because looking through one of them found
     exactly what looking at the wall beside it found.

     World.behind() has already asked the catalogue which room is on the other
     side. This paints that room's own floor into the gap and drops the light
     off towards the head, which is the part furthest under the lintel — a foot
     of shadow and then a floor, seen from a street at noon. One borrowed tile,
     and it is the whole difference between a shop with a way in and a sticker
     of a shop.

     Before R.doorways(), which lays the jambs, the threshold and the leaf over
     the top of it. */
  /* THE GAP BETWEEN THE JAMBS, in world pixels, for a doorway cut into wall
     mass — or null for anything else. Two passes want it, and they must not
     work it out separately: R.thresholds() paints the room behind it and
     R.lamps() puts the light on in it, and a rect computed twice is a rect
     that will disagree with itself one day.
     A two-tile opening is ONE opening, so the jamb between its halves is not
     there. That is the same question R.doorways() asks of its own reveal, and
     it has to get the same answer or the borrowed floor stops half a jamb short
     of the wall it is set into. */
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
      /* A room to show, or nothing behind it. A shut door still gets a recess —
         the reveal it stands in is what makes it a door SET INTO a wall rather
         than a door painted on one — it just has no floor to show through,
         because there is no floor: nobody goes into the cash and carry. */
      const room = d.into && ZONES[d.into] ? d.into : null;
      const px = op.px, py = op.py, J = op.J;
      const ox = op.x, oy = op.y, ow = op.w, oh = op.h;
      c.save();
      c.beginPath(); c.rect(ox, oy, ow, oh); c.clip();
      if (room) c.drawImage(this.floorTile(room, (d.x + d.y) & 1), px, py, TILE, TILE);
      else {
        /* Nothing behind it, so the reveal is the reveal and stops there: the
           wall's own colour, sunk, which is what the inside of a frame looks
           like when the thing filling it is a shut door. */
        const z = World.zoneAt(d.x, d.y);
        c.fillStyle = this.shade((ZONES[z] && ZONES[z].wall) || '#1a212e', -.35);
        c.fillRect(ox, oy, ow, oh);
      }
      /* Deepest at the head and lifting towards the threshold, so the opening
         reads as something with depth rather than as a picture of a floor
         pasted into a hole. Far enough down to be a lintel and no further: at
         three quarters the whole opening went to black and the doorway read as
         a hole knocked in a wall rather than as a shop with its lights on. */
      const g = c.createLinearGradient(0, py, 0, py + TILE);
      g.addColorStop(0, 'rgba(0,0,0,.62)');
      g.addColorStop(.55, 'rgba(0,0,0,.22)');
      g.addColorStop(1, 'rgba(0,0,0,.06)');
      c.fillStyle = g; c.fillRect(ox, oy, ow, oh);
      /* And the two shadows the jambs throw across it, which are what say the
         wall has a thickness. Without them the borrowed floor meets the brick
         at a hard edge and the opening reads as flat. */
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
  /* THE DRAWN DOORWAY, which is what an opening gets where the kit has no door
     for it: two jambs carrying the wall into the opening, a threshold strip
     across the floor, and a leaf on the hinge side. Nothing here touches
     World.solid — a doorway is purely what it looks like.

     WHAT IT NO LONGER DOES is draw any of that behind a door the kit HAS art
     for. It used to draw all of it and then let R.doorLeaves() put the good
     leaf on top, which came out as exactly what it was: a crude open doorway
     with a nicely drawn ajar door superimposed on it, the crude one showing
     round the edges. The pale threshold bar across the middle was the worst of
     it and it is gone from every opening with a real door in it.

     The jambs survive on a walkable opening, because there they are doing
     structural work: the tile is FLOOR, the wall run has a tile-wide hole in
     it, and the jambs are what carry the wall in far enough for the hole to
     read as a doorway. On a door set into wall MASS — every shopfront, and the
     front doors of this building — the wall is already there and they were
     drawing a second one. */
  doorways(x0, y0, x1, y1) {
    this.legacy(TILE => {
      const list = World.doorways; if (!list) return;
      const c = this.ctx;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d.x < x0 - 1 || d.x > x1 + 1 || d.y < y0 - 1 || d.y > y1 + 1) continue;
        const kit = this.kitDoor(d);
        /* A door in wall MASS that the kit draws needs nothing at all from
           here: the sprite is the whole doorway and R.thresholds() has already
           put the room behind it.
           The test is the TILE and not `d.solid`. Those are two different
           facts wearing one word: `d.solid` says the door was declared a shut
           one, and every shopfront on the parade is declared open while
           standing in a foot of brick. Asking the wrong one drew the jambs
           back onto all fourteen of them. */
        if (kit && World.solid[d.y] && World.solid[d.y][d.x]) continue;
        const z = World.zoneAt(d.x, d.y);
        const wall = (ZONES[z] && ZONES[z].wall) || '#1a212e';
        const px = d.x * TILE, py = d.y * TILE;
        const JAMB = 9;                     /* how far the wall reaches in */
        c.save();
        {
          /* THE REVEAL: the cut face of the wall, darker than the wall itself.

             Drawn for a SHUT door as well as an open one, and that is the whole
             of what a shut door was missing. A door in a wall is set INTO the
             wall — jambs either side, a frame round it, and the leaf standing
             back from the face — and a leaf drawn straight onto the brick with
             none of that is a door stuck on, not a door shut. The empty unit,
             the cash and carry and the four sheds on Corven Way all had one,
             and so did the two inside the building. The only part of this that
             an opening you can walk through gets to itself is the threshold,
             because a threshold is the floor of it and a shut door has no
             floor to show. */
          c.fillStyle = wall;
          if (d.axis === 'h') {
            /* Only where there is a wall to carry in. A two-tile opening is
               one opening: jamb both halves and you build a post down the
               middle of your own double doorway. */
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
              /* Threshold: a strip of a different material underfoot. Only
                 where no real door stands in the opening — beside one it is a
                 pale bar across the middle of a drawn door, and it was the
                 single most artificial mark on the whole parade. */
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
        /* The leaf. Locked is shut across the opening with a reader beside it,
           open is swung back against its jamb — which is what tells you at a
           glance that you can walk through. */
        const open = !d.locked;
        const face = d.locked ? '#5b4632' : '#7c5738';
        /* The kit's own leaf is drawn afterwards at true scale by
           doorLeaves(); this block still draws a door in a vertical wall,
           which the kit has no art for. */
        /* A vertical opening you can walk through gets no leaf at all (see
           doorLeaves); one set into a solid wall still needs something to show
           for itself, so it keeps the drawn leaf. */
        /* One question, asked once, in one place — see R.kitDoor(). */
        const kitLeaf = !!kit;
        const leaf = (lx, ly, lw, lh, vert) => {
          /* `vert` says which way the leaf runs. Hinges go at the near end of its
             long edge and the handle at the far end, so a shut door and an open
             one are read the same way round. */
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
        /* Architrave: the frame the leaf hangs in. Every doorway gets one now,
           shut or open — a shut door has exactly as much frame round it as an
           open one, and the version that trimmed only the openings is what left
           the shut ones looking stuck on. */
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
  /* WHICH OF THE KIT'S DOORS THIS OPENING WEARS, or null for the ones it has
     no art for. Asked in one place because two places used to ask it slightly
     differently and disagree: R.doorways() decided whether to draw its own leaf
     from one condition and R.doorLeaves() decided what to blit from another, so
     a door set into a wall you walk through SIDEWAYS got neither.

     Three states, and the kit has exactly three: shut, ajar, and the red one
     that is shut and locked. All three are the same leaf seen swung towards
     you — the difference is how far, and what colour — which is why a shut shop
     and an open one read as different doors and not as the same sticker twice.

     Nothing for an opening in a vertical wall: the kit draws a door face-on,
     which is what you see of a wall running left to right, and turning one on
     its side reads as decking. Those keep the drawn doorway below. */
  /* A SHOPFRONT WEARS A DIFFERENT DOOR, and the four of them are the whole
     point. The three above are one leaf at three angles — a door swung towards
     you, which is what a corridor door looks like from inside a building and is
     right in every room of this office. Out on the street it was twenty shops
     each with the same pine door standing open at forty-five degrees, hinged
     out across the pavement, in a row. `door.front.*` is the same kit's leaf at
     the frame it is SHUT and flat in its own opening, in four wood tones, which
     is what a parade actually looks like from the other side of the road.

     Seeded off the tile rather than shuffled, so a door does not change colour
     when the camera moves, and mixed with the door's own row so two shops side
     by side do not draw the same tone. */
  SHOP_TONES: ['pine', 'oak', 'walnut', 'olive'],
  /* WHICH PAINT THIS UNIT WAS DONE IN. Off the tile, so it is the same every
     frame and no two doors in a row match, and the same hash the windows use so
     a shop's door and its glass are not decided by two different coin flips. */
  toneOf(x, y) { return ((x * 2654435761 ^ y * 40503) >>> 13) & 3; },
  kitDoor(d) {
    if (!Tiles.ready || d.axis !== 'h') return null;
    /* An EXIT is a way out of a building and is drawn as a door in a wall. A
       DOOR is a door inside one and keeps the swing the kit drew it for, which
       is what a corridor wants and what R.doorways() has always given it. */
    if (d.kind === 'exit') {
      const tone = this.SHOP_TONES[this.toneOf(d.x, d.y)];
      /* Four frames, and `a` is how far through them this door is: 0 shut,
         1 wide. Rounded rather than lerped, because pixel art does not
         interpolate and four frames is enough swing to read as one. */
      const f = Math.min(3, Math.round((d.a || 0) * 3));
      const n = 'door.shop.' + tone + '.' + f;
      if (Tiles.has(n)) return n;
    }
    const n = d.locked ? 'door.shut.locked' : d.solid ? 'door.shut' : 'door.open';
    return Tiles.has(n) ? n : null;
  },
  /* HOW OPEN EVERY DOOR IS, advanced once a frame before anything draws one.

     A door opens because somebody is walking up to it, which is the only reason
     a door in a shop front ever opens. `want` is 1 within a tile and a half of
     the threshold and 0 beyond two — a band rather than a line, so standing on
     the edge of it does not make the door flap — and only for a unit with
     something behind it. The cash and carry does not open for anybody.

     Eased at a fixed rate rather than lerped by a fraction, so a door takes the
     same third of a second to open whatever the frame rate is doing, and shuts
     a little slower than it opens because that is what a closer does. */
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
  /* WHICH JAMB IT IS HUNG ON. The far half of a two-tile opening is the other
     leaf of a pair, so it is hinged on the other side and mirrored — that one
     is not a choice. The rest is: fourteen frontages all hinged the same way is
     fourteen copies of one sticker, and a real parade is not. Seeded off the
     tile, so a door does not change which way it opens when the camera moves. */
  doorFlip(d, list) {
    if (list.some(o => o.y === d.y && o.x === d.x - 1 && o.axis === 'h')) return true;
    if (list.some(o => o.y === d.y && o.x === d.x + 1 && o.axis === 'h')) return false;
    return ((d.x * 7 + d.y * 13) & 1) === 1;
  },
  /* The kit's door leaves, drawn at true scale — outside legacy(), because a
     32px sprite scaled by 32/44 is not pixel art any more. */
  doorLeaves(x0, y0, x1, y1) {
    const list = World.doorways; if (!list || !Tiles.ready) return;
    const c = this.ctx;
    for (const d of list) {
      if (d.x < x0 - 1 || d.x > x1 + 1 || d.y < y0 - 1 || d.y > y1 + 1) continue;
      const n = this.kitDoor(d); if (!n) continue;
      /* Hung in the wall band, standing on the threshold — and a shut leaf sits
         HIGHER than an open one, because a door swung towards you is drawn
         standing on the floor in front of the opening and a door shut in a wall
         is drawn in the wall. Not flipped either: a mirrored hinge is a
         variation on a leaf you can see the hinge side of, and on a flat one it
         is the same twenty-six pixels reversed. */
      if (n.startsWith('door.shop')) {
        /* Stood on the shop's threshold rather than centred on anything: the
           two leaves are different heights (a shut one is twenty-six pixels of
           door seen flat, an ajar one thirty-four), and hanging both from the
           same centre would put their FEET at two different places on the same
           parade. What has to line up is the bottom edge, which is the step,
           and that sits where the shop window's does — see `shopwin` in
           data/world.js and the `high` it is hung at. */
        /* One box for all four frames now, so one lift for all four: the box
           is bottom-aligned on the threshold, which is where the leaf's foot
           is in every frame of the swing. */
        const r = Tiles.rects && Tiles.rects[n];
        const lift = (r ? r[3] : 42) / 2 - 19;
        Tiles.draw(c, n, (d.x + .5) * TILE, (d.y + .5) * TILE - lift);
      } else {
        Tiles.draw(c, n, (d.x + .5) * TILE, (d.y + .5) * TILE - TILE * .18, this.doorFlip(d, list));
      }
    }
  },
  /* Strip lighting: the only thing breaking up an acre of identical carpet.
     One cached sprite on a 7-tile grid, offset from the 4-tile desk pitch or
     the pools line up with the rows and read as banding. Light tubes were tried
     and removed — a bright bar every few tiles reads as a rendering fault. */
  ceiling(x0, y0, x1, y1) {
    const c = this.ctx;
    /* Offset from the desk grid deliberately: on a multiple of the 4-tile desk
       pitch the pools line up with the rows and read as banding rather than as
       light. Tubes were tried and removed — at this scale a 44px bright bar
       every few tiles looks like a rendering fault, not a light fitting. */
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
  /* The outdoor counterpart of ceiling(): flat, cold and everywhere at once,
     which is exactly the difference between daylight and a strip light. One
     rectangle over the viewport rather than a grid of pools — an overcast sky
     is the only light source in the game with no shape to it.

     It follows the sun now, because it is the sun. A fixed wash was fine while
     the game had eight hours in it and every one of them was daytime; laid over
     a car park at two in the morning it is a floodlight nobody installed. */
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
     Sky knows what time it is and what the weather is doing; these four draw
     it. Everything here is over the top of a frame that was rendered exactly as
     it always was, which is the whole design: no tile, no sprite and no piece
     of furniture in this game knows that the sun sets.

     WATER ON THE GROUND. Two things, and they are different: a wet surface is
     darker and shinier everywhere, and a puddle is somewhere in particular.
     The puddles are picked off World.seed, so they are in the same places every
     time it rains and in different places on every map — a road that grows its
     puddles somewhere new each shower reads as static, not as weather. */
  wetGround(x0, y0, x1, y1) {
    const w = Sky.wet(), lie = Sky.lying();
    const k = Sky.kind();
    /* Rain hitting the ground. It used to be drawn with the falling rain, in
       screen space, which put a scatter of little ripples at fixed points on
       the CANVAS: walk, and the whole shower of them walked with you, pinned to
       the glass like spots on a lens. A splash happens where a drop lands, and
       where a drop lands is a place on the road. So it is here, with the
       puddles, in world coordinates, under everything that walks through it. */
    const splashing = this.animate && !World.indoors() && k.fall === 'rain' && k.rate >= 1;
    if (World.indoors() || (w < .04 && lie < .04 && !splashing)) return;
    const c = this.ctx;
    c.save();
    if (w > .04) {
      /* The sheen. Darker where it has soaked in, brighter where it has not,
         which is one multiply and one screen and reads as tarmac in the rain. */
      c.globalAlpha = .16 * w;
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = '#6d7a8e';
      c.fillRect(Cam.x, Cam.y, Cam.w, Cam.h);
      c.globalCompositeOperation = 'source-over';
      /* Gathered into four paths — road and not, water and sky in it — and
         filled once each, rather than two state changes and two fills for
         every puddle on screen. */
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
      /* Lying snow. Over the ground rather than instead of it, so the paving
         still shows through a light fall and has gone entirely by the time it
         has been coming down for an hour. */
      c.globalAlpha = .80 * lie;
      c.fillStyle = '#eef4fb';
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!World.zone[y][x] || World.solid[y][x]) continue;
        c.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      /* Where feet and tyres have been. The road keeps less of it than the
         pavement, which is the only reason anybody can tell where the road is.
         The verges keep the most of all, and get nothing taken back off them. */
      c.globalAlpha = .35 * lie;
      c.fillStyle = '#8f9cad';
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!World.zone[y][x] || World.solid[y][x]) continue;
        if (World.surfAt(x, y) === 'tarmac') c.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    if (splashing) {
      /* Each ground tile keeps its own clock, offset by its seed, and gets a
         ripple on some of its turns and not others — so the splashes come and
         go all over the road without anything having to remember one. The ring
         widens as it goes; the three passes are its fade, because alpha is a
         property of the path and a ripple that ends at full strength pops.

         Nothing lands on the tiles under lying snow that the road has not
         worn back through, and nothing lands indoors: both fall out of the
         gate above rather than being tested for here. */
      const t = this.t, dens = .10 * k.rate;
      c.strokeStyle = '#c8e0f5';
      c.lineWidth = 1;
      /* One walk over the ground sorting each ripple into the pass it is in,
         where there used to be three walks that each threw two thirds away. */
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
  /* THE TIDELINE. Sand and rock meet the sea at a flat seam, the same as any
     other two tiles that happen to touch — correct as far as collision goes
     (World.open() already treats the sea as ground you can see and cannot
     stand on) and wrong to look at: water that never moves at its own edge
     reads as a lake in a quarry, not a coast. Drawn here, over the sea
     tile's own bake rather than into it, because the wash has to move and a
     baked tile is, on purpose, the one thing in this renderer that does not
     redraw itself. */
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
        /* Seeded off the tile so the whole coast does not breathe in
           lockstep, and off nothing else, so it survives a rebuild the way
           every other seeded texture here does. Reduced motion gets the
           foam frozen at its resting reach, same idiom the opening uses for
           its typewriter. */
        const wash = this.animate ? (Math.sin(this.t * 1.6 + t.phase) + 1) / 2 : .5;
        const reach = TILE * (.16 + wash * .22);
        /* One strip, baked once, at the strength of the crest: the foam's
           fade is the same shape at every point of the swell (the 55% stop
           is within half a percent of a third of the crest throughout), so
           the swell is only how far and how bright. */
        c.globalAlpha = was * (.32 + wash * .24);
        if (t.n) this.fade(c, px, py, TILE, reach, 'n', FOAM, MID);
        if (t.s) this.fade(c, px, py + TILE - reach, TILE, reach, 's', FOAM, MID);
        if (t.w) this.fade(c, px, py, reach, TILE, 'w', FOAM, MID);
        if (t.e) this.fade(c, px + TILE - reach, py, reach, TILE, 'e', FOAM, MID);
      }
    }
    c.globalAlpha = was;
  },
  /* The sea tiles that touch land, by row, with which sides do and the phase
     of each one's swell — worked out once per world rather than per tile per
     frame, which was four surface lookups and a string hash for every tile on
     screen. */
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
  /* THE GRADE. One rectangle, multiplied, over everything that has been drawn
     so far. It is last because it is the light: a person standing under a
     streetlight and a person standing in the dark are the same sprite, and what
     separates them is what is painted over both of them and then taken back off
     one of them by lamps() below. */
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
    /* Fog sits on top of the multiply rather than in it: it is something in the
       air between you and the floor, so it LIFTS the blacks instead of
       deepening them, which is the one thing that makes fog read as fog. */
    /* — and only as much of it as there is light to catch. Fog is lit air, so
       at noon it is a white sheet and at two in the morning it is almost
       nothing except what the streetlights make of it. Without the daylight
       term a foggy 02:00 came out paler than a clear 18:00, which is the one
       reading a night should never give. */
    const fog = Sky.fog();
    if (fog > .01) {
      const lit = clamp(Sky.sunPos() * 1.2 + .45, .16, 1);
      c.save();
      c.globalAlpha = fog * lit * (.34 + Math.sin(this.t * .12) * .03);
      c.fillStyle = World.indoors() ? '#b6bdc7' : '#c6cdd6';
      c.fillRect(Cam.x, Cam.y, Cam.w, Cam.h);
      c.restore();
    }
    /* Lightning. A whole-frame flash, because that is what it is — and it is
       counted down here rather than in Sky.minute() so it lasts a fifth of a
       second of real time and not a fifth of a game minute. */
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
  /* Every lamppost on this level, found once and kept: the list only changes
     when the map underneath does, and levelChanged() is already the place that
     is said. */
  lampList() {
    if (this._lamps) return this._lamps;
    this._lamps = (World.objects || []).filter(o =>
      (o.fdef && o.fdef.sprite === 'obj.lamppost') || o.kind === 'lamp');
    return this._lamps;
  },
  /* THE LAMPS. Drawn after the grade and with 'lighter', so they are light put
     back rather than darkness left out — which is why a streetlight in this
     game has a pool under it and a headlight has a cone in front of it, and why
     neither of them does anything at all at two in the afternoon. */
  lamps(x0, y0, x1, y1) {
    if (World.indoors() || !Sky.lampsOn()) return;
    const c = this.ctx;
    /* Fog is what makes a streetlight visible as a light rather than as a lit
       patch of pavement, so it does not dim the lamps — it does the opposite. */
    const haze = 1 + Sky.fog() * .8;
    const night = clamp(-Sky.sunPos() * 2.2 + .35, .15, 1) * haze;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const pool = this.glow('rgba(255,214,150,ALPHA)', Math.round(TILE * 3.4));
    this.lampList().forEach(o => {
      if (o.x < x0 - 4 || o.x > x1 + 4 || o.y < y0 - 4 || o.y > y1 + 4) return;
      /* Under the lamp, not at the base of the post: the light is at the top of
         it and this is where it lands. The flicker is one of them in eight, the
         same one every time, because a street where every lamp flickers is a
         horror film and a street where none of them does is a rendering. */
      const bad = ((o.x * 31 + o.y * 17) & 7) === 3;
      const f = bad ? (.55 + Math.abs(Math.sin(this.t * 9.3 + o.x)) * .45) : 1;
      /* The post is three tiles tall and anchored by its foot, so the base is
         the bottom of the tile and the lantern is two tiles above that. The
         pool goes on the ground at the foot and the lantern gets its own small
         bloom — the two halves of a streetlight, and without the second one the
         post is a dark stick standing in a bright circle. */
      const fx = (o.x + .5) * TILE;
      c.globalAlpha = .40 * night * f;
      c.drawImage(pool, fx - pool.width / 2, (o.y + .85) * TILE - pool.height / 2);
      c.globalAlpha = .26 * night * f;
      c.fillStyle = '#ffe6b0';
      c.beginPath(); c.arc(fx, (o.y - 1.7) * TILE, 6, 0, 6.3); c.fill();
    });
    /* THE SHOPS, and this is what lights the parade. It used to light up by
       swapping every sash window for a lit one; the sashes have gone — a sash
       is a house window and a parade is plate glass, see FURN.shopwin — and
       what comes on now is the light in the doorways of the units that have a
       floor behind them. Brightest at the threshold and falling away towards
       the lintel, which is the way light comes OUT of a door rather than the
       way shadow goes into one.
       Here rather than in R.thresholds() for the reason at the top of this
       function: down there it would be painted under the grade and the night
       would crush it. Light is put back, not left out. */
    const doors = World.doorways || [];
    for (const d of doors) {
      if (!d.into || !ZONES[d.into]) continue;
      if (d.x < x0 - 2 || d.x > x1 + 2 || d.y < y0 - 2 || d.y > y1 + 2) continue;
      const op = this.doorOpening(d, doors); if (!op) continue;
      /* THE LIGHT IN THE OPENING, and how much of it there is depends on how
         far the door is open. A shut shop with its lights on leaks a line of
         light round the leaf and nothing else; the same shop with the door
         swinging back throws the whole of its inside out at you. `a` is the
         swing, set by R.swingDoors() before anything drew today's frame. */
      const a = d.a || 0;
      const lit = .18 + a * .82;
      const warm = c.createLinearGradient(0, op.py, 0, op.py + TILE);
      warm.addColorStop(0, 'rgba(255,206,140,0)');
      warm.addColorStop(.4, 'rgba(255,206,140,' + (.22 * lit).toFixed(3) + ')');
      warm.addColorStop(1, 'rgba(255,220,164,' + (.62 * lit).toFixed(3) + ')');
      c.globalAlpha = night;
      c.fillStyle = warm;
      c.fillRect(op.x, op.y, op.w, op.h);
      /* AND THE SPILL, which is the half nobody had. Light does not stop at a
         threshold: an open door lays a patch of its own inside out across the
         pavement in front of it, and that patch is the thing you see from down
         the street long before you can see the shop. Drawn as a wedge widening
         away from the opening rather than as a circle — a doorway is a slot and
         a slot throws a slot-shaped light — and only when the door is actually
         open, which is what makes walking up to a shop at night worth doing. */
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
    /* THE GLASS, lit from inside, and this is drawn rather than swapped for.
       The parade used to come on at dusk by exchanging every window sprite for
       a second copy of itself with yellow paint behind the panes, which meant
       one hard-coded brightness, no falloff, and a sheet carrying two of every
       window so that one of them could be on. What a lit shop window actually
       is, is the room behind it seen through glass: warm, brightest at the
       middle of the pane, and dimmer at the frame where the reveal is. That is
       a gradient, it costs nothing, and it works on any window sprite in any
       colourway — including the three this town has changed its glass for.

       Not every unit: the same tile hash that picks a shop's paint decides
       whether its lights are on, so a parade at eight o'clock is most of it
       lit and two of them dark, which is what a parade at eight o'clock is. */
    for (const o of (World.objects || [])) {
      if (o.kind !== 'shopwin') continue;
      if (o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 2 || o.y > y1 + 2) continue;
      if ((this.toneOf(o.x * 3, o.y * 7) & 3) === 1) continue;      /* this one is shut */
      /* North walls only, for the reason the object pass gives: the kit draws a
         wall item face-on and north is the only side this projection shows you
         the face of. Anywhere else the window is already falling back to an
         emoji and there is no glass to light. */
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

    /* Headlights. Only on something that is being driven — a car parked in a
       bay with its lights on all night is a flat battery, and the pool car has
       enough wrong with it. */
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
  /* WHAT IS COMING DOWN. Screen space, after the camera transform has been
     popped: rain falls past the camera rather than past the map, and drawing it
     in world coordinates makes it slide sideways whenever you walk.

     No particle objects. Every drop's position is a function of its index and
     the clock, so a downpour is four hundred numbers rather than four hundred
     allocations a second, and pausing the game stops it dead because `this.t`
     stops. */
  /* A drop's own numbers, and the reason there is a hash here at all.

     This used to be a pair of terms of the form `i * BIG % M`, which is a
     lattice and not a scatter: both numbers were linear in the drop's index,
     so the pairs fell on a handful of parallel lines and the rain arrived in
     stripes. Worse, the two were correlated with each other and with
     everything derived from them — a column of drops all fell at the same
     speed, at the same length, because speed and length were read off the same
     linear sequence as the column.

     This is the finalising mix of a small integer hash: one multiply-xor-shift
     round per call, no allocation, and `s` selects a stream, so one drop's x,
     its y, its speed, its length and its lean are five independent numbers
     rather than five views of one. Same cost as the arithmetic it replaced. */
  noise(i, s) {
    let h = Math.imul(i + 1, 374761393) + Math.imul(s + 1, 668265263) | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  },
  /* Three sheets of it at three distances, because rain seen through rain is
     not one flat curtain: the far stuff is thin, slow, short and dim, the near
     stuff is bright and long and comes down hard. Three passes rather than
     three hundred, since a stroke style is per path and a path is cheap. */
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
    /* And with animation off — which follows the operating system's
       reduced-motion setting by default — nothing falls. The weather is still
       there: it is in the light, on the ground and on the window, and all three
       of those hold still. */
    if (!this.animate) return;
    const c = this.ctx, W = Cam.w, H = Cam.h, t = this.t;
    const n = Math.round((k.fall === 'snow' ? 90 : 150) * k.rate);
    c.save();
    /* Both of these wrap their positions through a span WIDER than the screen,
       so a drop that leaves one edge is already drawn coming in at the other.
       The base number has to cover that whole span: seed it across the screen
       only, as this did, and everything the lean pushes off the right-hand
       edge lands back in the same narrow band on the left — which is a stripe
       of double-thick rain down one side of the frame and nothing at all in
       the corner it came from. Uniform over the span in, uniform out. */
    const xSpan = W + 120, ySpan = H + 80;
    if (k.fall === 'snow') {
      c.fillStyle = 'rgba(244,250,255,.85)';
      for (let i = 0; i < n; i++) {
        const rx = this.noise(i, 1), ry = this.noise(i, 2), rs = this.noise(i, 3);
        const rr = this.noise(i, 4), rd = this.noise(i, 5);
        /* Not one drift for all of it: each flake has its own sway, its own
           period and its own idea of down, which is the difference between
           snow and a screensaver of dots. */
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
        /* Across, each drop gets its own slice of the width and a random
           position inside it, rather than a random position across the whole
           of it. Pure scatter clumps: with a few hundred drops you get a
           handful of gaps and a handful of thickets every frame, and the eye
           reads those as the rain being patchy rather than as the rain being
           random. A drop's x barely moves once it is falling — the lean only
           slides it a fifth of a screen over a whole descent — so evening it
           out here evens out the whole shower, and the jitter inside the slice
           is what keeps it from looking like railings. */
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
  /* The map underneath has been replaced. Anything cached off its shape — the
     minimap is baked once and blitted after that — has to go, or the new level
     is played over a picture of the old one. */
  /* Nothing to say about the map here any more: Atlas keys its rasters by
     level and by season, so a level swapped in finds its own or builds it, and
     a level swapped back finds the one it left. */
  levelChanged() { this._lamps = null; },
  /* Desks. Thirty-two of them, and until now they were a monitor emoji and a
     phone emoji sitting on carpet with nothing underneath — which is what made
     the floor read as a spreadsheet rather than an office. Each one gets a
     surface to stand on and a partition behind it. */
  desks(x0, y0, x1, y1) {
    this.legacy(TILE => {
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
        /* Warmer and lighter than the carpet on purpose — at the carpet's own
           blue-grey the surface disappeared and the desks went back to looking
           like emoji on a floor. */
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
        /* A keyboard in front of the monitor. Small, but it is the detail that
           makes the surface read as a desk rather than a coloured rectangle. */
        c.fillStyle = 'rgba(20,25,34,.55)';
        c.beginPath(); c.roundRect(px + 7, py + h - 13, TILE - 20, 9, 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.07)';
        c.fillRect(px + 9, py + h - 11, TILE - 24, 1.5);
        /* Clutter. Deterministic per desk — a stable seed off the index, not
           Math.random(), or the papers rearrange themselves every frame. Thirty-
           two identical desks is the joke; thirty-two identical desks rendered
           identically is just a tiling pattern. */
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
  /* A run of tables is an end, some middles and an end — tiling the middle the
     whole way puts a leg and a seam on every tile and reads as five small
     tables shoved together. Falls back to the drawn slab when the atlas has
     nothing, which is also a copy opened without art/. */
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
    this.legacy(TILE => {
      for (const t of vis)
        this.slab(t.x * TILE + 3, t.y * TILE + 5, t.w * TILE - 6, TILE - 10, '#6f6152', '#4c433a', 8);
    });
  },
  /* Worktops: kitchen counters and the row of sinks in the toilets. Given a
     splashback when they stand against a wall, which is what stops them
     reading as a plank floating on the carpet. */
  /* Kit units in the break room only: the same run type is also the toilets'
     vanity and the training room's bench, and a wooden kitchen carcass under a
     washroom sink is worse than the grey slab it replaced.

     Asked in one place because two things need the answer and they must not
     disagree: this draws the run, and the object pass has to know how high to
     stand a kettle on it. */
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
  /* How far above the centre of its tile a worktop's surface is.

     The slab is drawn 8/44 of a tile down from the top of its own tile, which
     puts its front edge a whisker under the centre — that is what the 11 was
     measured against, and it is why a jug on the vanity sits ON the vanity.
     The kit's kitchen unit is a two-tile sprite standing on the same tile: its
     worktop is the band 12..31 of a 64px slot whose foot is half a tile below
     the centre, so the surface is 26px ABOVE it and everything on that counter
     was standing fifteen pixels down the cupboard doors. */
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
    this.legacy(TILE => {
      const c = this.ctx;
      for (const t of list) {
        if (t.x + t.w < x0 - 1 || t.x > x1 + 1 || t.y < y0 - 2 || t.y > y1 + 1) continue;
        if (kit[i++]) continue;                     /* drawn from the kit below */
        const px = t.x * TILE + 2, py = t.y * TILE + 8, w = t.w * TILE - 4, h = TILE - 14;
        if (World.solid[t.y - 1] && World.solid[t.y - 1][t.x]) {
          c.fillStyle = 'rgba(212,222,238,.10)';
          c.fillRect(px, py - 9, w, 9);
        }
        /* One mirror over the whole row of basins, part of the run rather than
           a line of hung objects. On the wall face, which for the vanity is the
           band BELOW the counter — the basins are on the last row of the room
           and the wall is to the south. Above it, it is a mirror on the floor. */
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
          /* `b`, not `i`: the run counter above is an `i` in this same
             function and a shadow here is one rename away from a silent
             off-by-one in which kitchen units draw over the vanity. */
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
    this.legacy(TILE => {
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
  /* Toilet cubicles: a stall with partitions on three sides and its door
     standing open, so you can see there is a toilet in there. They used to be
     drawn as doorways, which meant a door leaf lying on its side and no toilet
     at all. */
  cubicles(x0, y0, x1, y1) {
    /* Same rule as the architectural wall each stall backs onto: full height
       facing the room, fading once the player is past it. Computed here, in
       real tile units, because the drawing below runs inside legacy()'s 44px
       space and TILE means something else by the time it gets there. */
    const wallAlpha = new Map();
    for (const o of World.objects) {
      if (o.kind !== 'loo') continue;
      const rel = (P.y - o.y * TILE) / (TILE * 1.6);
      wallAlpha.set(o, Math.max(.15, Math.min(1, rel + .35)));
    }
    this.legacy(TILE => {
      const c = this.ctx;
      for (const o of World.objects) {
        if (o.kind !== 'loo') continue;
        if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
        /* A stall backs onto a wall. The accessible toilet is a door in the far
           wall of the room — a room, not a cubicle — and a stall drawn there
           had its back panel standing in mid-floor. */
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
        /* The partition, two tiles tall like everything else it stands
           against — the base is always solid, and the extension above it
           fades exactly the way the real wall behind it does, so a stall
           doesn't read as a squat afterthought next to it. */
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
        /* Vacant/engaged, the only thing anybody actually reads on a cubicle.
           The engaged one also gets a real closed door drawn over all of this,
           below — the indicator stays because the door is only there when the
           atlas is. */
        c.fillStyle = o.n === 1 && G.today.looClosed ? '#ff5f56' : '#5ad48a';
        c.fillRect(px + TILE - T - 4, py + TILE - 7, 3, 3);
      }
    });
    /* The locked cubicle, drawn shut. Outside legacy(): this is kit art and
       belongs in TILE space rather than in the 44px space the drawn furniture
       above was written for. Only ever the engaged one — a closed door on the
       three you can walk into would cover the pan, and the whole point of the
       stall standing open is that you can see there is one. */
    for (const o of World.objects) {
      if (o.kind !== 'loo' || !(o.n === 1 && G.today.looClosed)) continue;
      if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
      if (!World.solid[o.y - 1] || !World.solid[o.y - 1][o.x]) continue;
      Tiles.draw(this.ctx, 'loo.door', (o.x + .5) * TILE, (o.y + .5) * TILE);
    }
  },
  /* How much of an object standing BEHIND a wall you are allowed to see.

     Every wall you can see the front of gets a second tile stacked into the
     row above it, and that row is real floor with real furniture on it. The
     extension is painted in the wall pass; the drawables come after it, full
     stop — which is exactly what keeps the wall off the player's head, and
     exactly what let the far room's furniture paint straight over the wall
     enclosing it. Thirteen objects on the fourth floor alone: the fax table
     through the management wall, the trophy shelf, three sinks through the
     back of the toilets.

     It is not a cull, because from the OTHER side that object is in the room
     you are standing in and must be fully visible — which is the same reason
     the extension itself fades to .15 when you cross. So it fades on the wall's
     own ramp, in the opposite direction, and the two cross over while you are
     standing in the wall band and looking at neither. */
  veil(o) {
    if (o.mount === 'wall' || o.onTable) return 1;
    return this.veilAt(o.x, o.y);
  },
  /* The same question for anything that stands on a tile rather than being an
     object — a colleague, mostly. NPCs are drawn in the sorted pass like the
     furniture and were just as visible through the wall in front of them.

     What the ANSWER means differs, though, and that is the whole of the note
     on colleague() below: a person is taller than the course that hides them,
     so 0 here means "clip them at the top of it", not "drop them". Furniture
     is shorter than the course, so for furniture the two are the same thing.

     The PLAYER is deliberately never asked: the extension fades so you can see
     your own avatar when you cross, and veiling it would undo the thing the
     fade is for. */
  veilAt(x, y) {
    const wy = y + 1;
    if (wy + 1 >= MAPH || !World.solid[wy] || !World.solid[wy][x]) return 1;
    /* Only a wall with a room below it grows the extension — see the `below`
       branch of the wall loop. Interior mass has nothing stacked on it. */
    if (World.solid[wy + 1][x] || !World.zone[wy + 1][x]) return 1;
    const rel = (P.y - wy * TILE) / (TILE * 1.6);
    return Math.max(0, Math.min(1, (1 - Math.max(.15, Math.min(1, rel + .35))) * 2.2));
  },

  /* ONE COLLEAGUE, drawn where they are standing. Its own method because the
     wall clip in draw() draws them twice — once above the top of the wall
     course and once behind it — and both halves have to be the same person:
     the same seat, the same frame of the same walk, the same name under them.
     Everything that hangs off somebody (shadow, ring, quest mark, name,
     bubble) is in here for that reason, and clips with them. */
  colleague(n, hi) {
    const c = this.ctx;
    const sprite = Sprites.has(n.id);
    /* Stopped on a chair means seated, facing north — every desk chair has
       its desk there. `at` is where they are DRAWN, and everything hanging
       off a person (shadow, ring, name, quest mark, bubble) moves with it.
       Interaction deliberately still uses n.x/n.y: reach should not change
       because somebody sat down. */
    const seat = sprite && !n.walking
      ? Sprites.seatedAt(Math.floor(n.x / TILE), Math.floor(n.y / TILE)) : null;
    const at = seat ? Sprites.seatPos(seat) : { x: n.x, y: n.y };
    this.shadow(at.x, at.y + 13, 12, 5);
    /* The LPC walk cycle carries its own vertical movement, so the bob is
       only for the emoji fallback — doubling them reads as a limp. */
    const bob = sprite ? 0
      : n.walking && this.animate ? Math.abs(Math.sin(n.bob * 2)) * 3.5 : Math.sin(n.bob * .5) * 1;
    const box = Sprites.bounds(n.id, at.x, at.y);
    if (hi === n) {
      c.save(); c.strokeStyle = 'rgba(255,179,71,.9)'; c.lineWidth = 2; c.shadowColor = '#ffb347'; c.shadowBlur = 14;
      c.beginPath(); c.roundRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4, 8); c.stroke(); c.restore();
    }
    if (!this.cinema && this.questMark(n)) this.emoji('❗', at.x + 13, box.y - 4, 15);
    /* WHAT IS ON THEIR MIND, the way the colony games show it: a small icon
       over the head when a need is running out, a mood is at the bottom, or
       they are inspired. Opposite shoulder to the quest mark so both fit, and
       not while they are speaking — the bubble is already saying it. */
    else if (!this.cinema && !(n.sayT > 0) && typeof Mind !== 'undefined') {
      const ic = Mind.icon(n);
      if (ic) {
        const ix = at.x + 14, iy = box.y - 2 + (this.animate ? Math.sin(n.bob * .8) * 1.5 : 0);
        c.save(); c.fillStyle = 'rgba(12,18,28,.62)';
        c.beginPath(); c.arc(ix, iy, 9, 0, Math.PI * 2); c.fill(); c.restore();
        this.emoji(ic, ix, iy, 12);
      }
    }
    if (sprite) {
      /* Standing colleagues breathe. Walking ones do not need it — the
         walk cycle already moves them — and a seated one is holding a
         pose on purpose. Off entirely when Animation is off. */
      const nf = seat ? Sprites.sit(n.id)
        : n.walking ? Sprites.frame(n.id, this.animate, n.step)
        : this.animate ? Sprites.breath(n.id) : 0;
      const nlift = seat && this.animate ? Sprites.breathLift(n.id) : 0;
      /* WHICH WAY A SEATED PERSON POINTS, and it is the CHAIR that decides.
         This used to be a hard 0 — facing away — which was true of every chair
         in the game for as long as every chair in the game was at a desk with
         a monitor on the far side of it. It stopped being true the moment
         there were chairs in a nail bar on the High Street, where the whole
         joke is three colleagues who can see you come in, and it was drawing
         them with their backs to the door.

         `face` on the chair object, 0 up / 1 left / 2 down / 3 right, and
         absent means 0, so nothing on the fourth floor moves a pixel. */
      /* Somebody who has just been hit with a foam dart turns round to find
         out who by — shoulders first, feet where they were, which is exactly
         what a person does and exactly the twist the player is aiming with.
         Nobody is drawn any differently until something happens to them. */
      Sprites.draw(c, n.id, seat ? (seat.face ?? 0) : n.dir ?? 2, nf, at.x, at.y - nlift,
        seat ? null : Guns.watchOf(n));
    } else this.emoji(n.face, at.x, at.y - bob, 29);
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
  /* One person on the street. Split out for the same reason colleague() is:
     the wall clip draws them twice and both halves have to be the same
     stranger. */
  stranger(p, hi) {
    const c = this.ctx;
    this.shadow(p.x, p.y + 13, 12, 5);
    if (hi === p) {
      const box = Sprites.bounds(p.sprite, p.x, p.y);
      c.save(); c.strokeStyle = 'rgba(255,179,71,.9)'; c.lineWidth = 2;
      c.shadowColor = '#ffb347'; c.shadowBlur = 14;
      c.beginPath(); c.roundRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4, 8); c.stroke();
      c.restore();
    }
    if (Sprites.has(p.sprite)) {
      const f = p.walking ? Sprites.frame(p.sprite, this.animate, p.step)
        : this.animate ? Sprites.breath(p.sprite) : 0;
      Sprites.draw(c, p.sprite, p.dir ?? 2, f, p.x, p.y, Guns.watchOf(p));
    } else this.emoji('🧑', p.x, p.y, 28);
    /* No name over a stranger. That label is how you tell one of the twenty
       colleagues from another, and a street of floating names would say these
       are twenty more people to get to know. They are not. */
    if (p.sayT > 0) this.bubble(p.x, p.y - 34, p.say, Math.min(1, p.sayT));
  },
  /* ---- The drawn things ----
     At 29px the candidate emoji are four near-identical rounded rectangles, and
     some things have none at all. Each is seeded off its own id, so the same
     poster is the same poster every frame and no two are alike. The test is
     whether the emoji is worse than nothing, not whether it hangs on a wall. */
  wallArt(o, ex, ey, size) {
    const c = this.ctx;
    const rnd = this._rand(this._hash(o.id + o.kind));
    const r1 = rnd(), r2 = rnd(), r3 = rnd();
    /* Seen at an angle, a thing on a side wall shows you its edge rather than
       its face. Squashing it is cheaper than a second set of drawings and
       reads correctly at this size. */
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
        /* The only daylight in the building, and it keeps the time. It used to
           keep the SHIFT'S time — a fraction from 09:00 to 17:00, which meant
           the glass was as bright at 04:00 as it was at nine — and it asks the
           sky now, so the one window on the fourth floor and the whole of the
           town outside can never disagree about what it is doing out there.
           It is also the only place indoors that shows you the weather, which
           is exactly how much of the weather anybody at this desk sees. */
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
        /* 🪧 is a placard on a stick and every sign in this building is a
           laminated A5 someone printed in 2017. A plate, a coloured band, and
           two lines of words you have never once read — plus a stand, but only
           for the one that is standing in the middle of the floor. */
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
        /* 🖐️ is a hand, waving, at head height. This is the machine: a box on
           the wall, a nozzle underneath, and the standby light that is the only
           part of it anybody trusts. */
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
        /* Biro, years of it, on tile. Not one message — a dozen, over each
           other, at every angle, most of them illegible, which is what the act
           that reads them out is describing. */
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
      /* THE LIFT, and it is drawn rather than sprited for the reason FURN.plant
         gives about picking a cell before writing an asset off: the kit this
         game pins is mediaeval-through-Victorian and the nearest thing in it to
         a lift is a panelled oak door. A lift is a recess in a wall with two
         steel leaves in it, a seam down the middle, a call plate beside it and
         a light over the top, and none of those five things is available.

         The light over the top is the only part that is not decoration: it
         shows the floor the car is on, and the floor the car is on is a real
         thing — Lifts.at() in engine/levels.js, which is the same number the
         indicator beside it reads out. */
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
        const floor = (typeof Lifts !== 'undefined' && Lifts.at()) || '';
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
      /* THE STAIRS. Three treads and a handrail, seen from above and slightly
         on, which is the same compromise every other standing thing in this
         game is drawn to. The kit's `terrain.steps` is a SURFACE — it tiles a
         whole flight and it is what Fishers Steps is made of — and a surface
         cannot stand in a doorway, which is what this has to do. */
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
        /* Not everything flat is on a wall: the sign-in book lies open on the
           reception counter with a biro on a string beside it, which is the
           only way a visitors' book has ever been drawn. */
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
     The floor and everything painted straight onto it, baked in chunks of
     GROUND_N × GROUND_N tiles at the canvas's own device scale, so a chunk is
     blitted 1:1 and costs one drawImage however much is on it. Keyed on the
     world's own buffer (World.build() makes a new one, so a new level or an
     editor rebuild is a new cache without anybody saying so), the season (the
     grass changes), the art (a sheet decoding late must not leave a chunk of
     emoji-era floor behind) and the scale. rebake() throws it away with the
     tiles it was built from. Bounded by a pixel budget rather than a count, so
     the editor zoomed out over a whole island does not hold a gigabyte. */
  GROUND_N: 8,
  _ground: null,
  groundScale() {
    const d = this.dpr, dev = Math.min(2, window.devicePixelRatio || 1);
    /* The game's scale is fixed, so it bakes at exactly that. The editor's
       zoom is continuous, and a scale per zoom step would rebake the lot on
       every frame of a pinch: it snaps up to a power of two instead. */
    if (Math.abs(d - dev) < 1e-6) return d;
    return clamp(Math.pow(2, Math.ceil(Math.log2(d))), 1 / 16, 4);
  },
  ground(x0, y0, x1, y1) {
    if (this.noGroundCache || !World._solid || typeof document === 'undefined') return false;
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
    /* One chunk of the ring just off screen per frame, so walking or driving
       into new ground finds it ready rather than baking a row of it at once. */
    const mx = Math.ceil(MAPW / N) - 1, my = Math.ceil(MAPH / N) - 1;
    outer: for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(my, cy1 + 1); cy++)
      for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(mx, cx1 + 1); cx++)
        if (!G.chunks.has(cy * 4096 + cx)) { this.groundChunk(G, cx, cy).used = clock; break outer; }
    /* Over budget: drop whatever has been off screen longest. Three screens'
       worth, which is what is visible plus the ring round it, with room over. */
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
      /* The tiles of this chunk, and the passes over them from one tile
         further out: a kerb, a stain and a painted line all lap over the edge
         of the tile they belong to, and the canvas clips what falls outside. */
      this.groundBase(tx0, ty0, tx1, ty1, { x: cx * W, y: cy * W, w: W, h: W }, 1);
      this.groundMarks(Math.max(0, tx0 - 1), Math.max(0, ty0 - 1), Math.min(MAPW - 1, tx1 + 1), Math.min(MAPH - 1, ty1 + 1));
    } finally { this.ctx = was; }
    ch = { cv, used: 0 };
    G.chunks.set(id, ch); G.px += size * size;
    return ch;
  },
  /* The floor, the kerbs and the paint: the ground as it was laid. `view` is
     what roadPaint() culls against, the camera unless a chunk is being baked,
     and `m` how far past the tiles the kerbs are looked for. */
  groundBase(x0, y0, x1, y1, view, m = 0) {
    const c = this.ctx;
    /* The tile seam belongs to the sprite, not to a grid stroke over the top:
       carpet has a seam, glazed tile has grout, sheet vinyl has neither. */
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const z = World.zoneAt(x, y);
      /* An OPEN surface is ground with no room over it — the river, the
         ballast under the railway. It has no zone and it is solid, so both of
         the tests below throw it out; it is drawn here anyway because what it
         is made of is the whole of what it is. See World.open(). */
      if ((!z || World.solid[y][x]) && !World.open(x, y)) continue;
      c.drawImage(this.floorTile(z, (x + y) & 1, World.surfAt(x, y)), x * TILE, y * TILE, TILE, TILE);
    }
    /* The kerb, and then the paint on the road. Both go straight onto the
       floor, before the wear and the wall shadows: a marking is painted on the
       tarmac and everything the building does to the light happens on top of
       it. Both cost nothing on a level with no surfaces declared. */
    this.kerbs(Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(MAPW - 1, x1 + m), Math.min(MAPH - 1, y1 + m));
    this.roadPaint(view);
  },
  /* What wear and the walls have done to it since: the worn patches, the
     stains, and the contact shadow along the foot of every wall. `shadows`
     leaves the wear out, for putting the dark half back over lying snow. */
  groundMarks(x0, y0, x1, y1, shadows) {
    const c = this.ctx;
    /* worn patches and old stains. The patch is a whole tile lightened by
       under two percent, which is nothing at all on carpet or on grit and was
       nothing at all on the road until the road became a flat, poured sheet
       with no grain in it: on that, a tile-shaped patch is a tile-shaped
       patch, and a road with a chequerboard on it is worse than a road with
       nothing on it. So the carriageway sits this one out and keeps the
       stains below, which are round, and which a road has anyway. */
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
    /* `|| 0` because one call with no dt makes t NaN forever, NaN spreads into
       every frame index derived from it, and a NaN frame index draws nothing
       and throws nothing. Tests calling R.draw() by hand must pass a dt. */
    const c = this.ctx; this.t += dt || 0; this.lastDt = dt || 0;
    /* Before anything draws a door. Two passes read how open one is — the leaf
       itself and the light coming out of it — and they must not each work it
       out, or the light will be a frame ahead of the door on the frame the
       player steps over the threshold. */
    this.swingDoors(dt || 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, Cam.w, Cam.h);
    const sx = FX.shakeAmt ? rnd(-FX.shakeAmt, FX.shakeAmt) : 0;
    const sy = FX.shakeAmt ? rnd(-FX.shakeAmt, FX.shakeAmt) : 0;
    const ox = -Math.round(Cam.x) + sx, oy = -Math.round(Cam.y) + sy;
    c.save(); c.translate(ox, oy);

    const x0 = Math.max(0, Math.floor(Cam.x / TILE) - 1), x1 = Math.min(MAPW - 1, Math.ceil((Cam.x + Cam.w) / TILE));
    const y0 = Math.max(0, Math.floor(Cam.y / TILE) - 1), y1 = Math.min(MAPH - 1, Math.ceil((Cam.y + Cam.h) / TILE) + 1);

    /* THE GROUND, from the cache. Everything from here to the contact shadows
       is the same on every frame of a level — what the tiles are made of, the
       kerbs, the paint, the wear, the shadow at the foot of every wall — and it
       used to be worked out afresh on every one of them: a thousand floor tiles
       looked up by string key and blitted one at a time, and the same again for
       each of the passes over them. It is baked into chunks now (see ground())
       and a frame is a dozen blits. What moves — the tide and the rain — goes on
       top, as it always did. groundBase()/groundMarks() are still the one place
       any of it is drawn, so the fallback below is the old frame exactly. */
    const cached = this.ground(x0, y0, x1, y1);
    if (!cached) this.groundBase(x0, y0, x1, y1);
    this.shoreline(x0, y0, x1, y1);
    /* And then the weather on it. Water and lying snow are part of what the
       ground is made of today, so they go on with the ground rather than over
       the whole frame — a puddle a colleague walks through has to be under
       them, and a screen-space wash never can be. */
    this.wetGround(x0, y0, x1, y1);
    if (!cached) this.groundMarks(x0, y0, x1, y1);
    /* Lying snow covers what the chunk has already laid down, where the old
       frame drew the shadows on top of it. Put them back over the snow. */
    else if (Sky.lying() > .04 && !World.indoors()) this.groundMarks(x0, y0, x1, y1, true);

    /* walls */
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      /* ...and never the water. An open surface is solid, so without this it
         reaches the roof branch at the bottom of this loop and the river comes
         out as a terrace of slate. See World.open(). */
      if (!World.solid[y][x] || World.open(x, y)) continue;
      const below = y + 1 < MAPH && !World.solid[y + 1][x] && World.zone[y + 1][x];
      const anyNear = below || (x + 1 < MAPW && !World.solid[y][x + 1]) || (x > 0 && !World.solid[y][x - 1]) || (y > 0 && !World.solid[y - 1][x]);
      /* Wall mass with nothing beside it to see it from. Indoors that is the
         inside of the building and it is black; outdoors it is whatever is
         past the car park wall, and black there reads as a hole cut in the
         world rather than as distance. */
      /* Indoors this is the inside of the building and it is black. Outdoors
         it used to be a flat pale blue-grey standing for distance, which was
         right while the only wall mass out there was one course of car park
         wall — and became wrong the moment a level had a whole city block in
         the middle of it, because forty tiles of flat pale grey between two
         streets reads as a lake. It is roofs now, which is what is actually up
         there: correct over the block, and better than a flat colour past the
         edge of the map as well, where what you are looking at is the rest of
         a town. */
      if (!anyNear) {
        if (World.indoors()) { c.fillStyle = '#080b11'; c.fillRect(x * TILE, y * TILE, TILE, TILE); }
        else {
          /* THE GAP FIRST, and then the roof over it. A corner-matched roof
             tile is not opaque to its own edges — the two pixels outside the
             coping are clear, because upstream drew these to sit over whatever
             is behind the building. Here what is behind the building is the
             next building, so those two pixels are the reveal between two
             parapets: four pixels of shadow wherever two plots meet, and two
             at the outside of the block. That line is the single thing doing
             the most work in this whole pass. It is not black — black reads as
             a hole cut in the world — it is the colour of a gutter nobody has
             cleared. */
          c.fillStyle = '#14181f'; c.fillRect(x * TILE, y * TILE, TILE, TILE);
          const roof = this.roofTile(x, y) || this.roofBaked((x * 5 + y * 3) & 1);
          c.drawImage(roof, x * TILE, y * TILE, TILE, TILE);
        }
        continue;
      }
      /* Only a wall somebody can see needs to know whose it is: the roofs above
         were drawn without asking, and eight neighbour lookups a tile, for
         every tile of every roof in town, was most of this loop. */
      /* Which room's wall this is: the one it faces. A wall tile between two
         rooms belongs to whichever is below it, because that is the face you
         can see — and that's the ONLY neighbour a one-sided lookup like
         `south, else east` ever found, which is fine for the common case (an
         interior wall with a room to its south) but wrong for a room's own
         south or east boundary: nothing there to find, and south-else-east
         has no fallback, so it silently painted every such wall in the
         generic 'main' tint. Invisible inside the building, where most zones
         are dark variations of the same navy-grey and 'main' often IS the
         room anyway (the break room's own south wall was one of the ones
         quietly getting it wrong) — impossible to miss the moment a level's
         boundary wall is meant to be a daylit car-park breeze block and
         renders as an indoor office wall instead. All four neighbours now
         get a look, in the order the wall could actually be seen from: the
         room it caps from below, then the room it caps from above, then
         whichever side is left. */
      /* Looking DOWN finds a doorway as readily as a room, and that is right:
         the wall above an opening is its head, seen from the opening, and it
         takes the finish of the room the door leads to. That is what puts two
         courses of glazed brick over the toilet door and it is the whole of
         why a doorway in a wall you walk through east-west reads as a door.
         Looking UP must NOT: a doorway above this tile is a hole in the same
         wall run, not a room this wall caps, and taking its zone painted the
         one tile south of the toilet door in the toilets' white brick while
         the rest of the column stayed office drywall. Left as the only wrong
         tile on that wall, in the one room whose finish is light enough to
         see it. */
      const nz = World.zoneAt(x, y + 1)
        || (!World.isOpening(x, y - 1) && World.zoneAt(x, y - 1))
        /* WEST before east, and that is a tie-break rather than a symmetry.
           A vertical wall run has wall above and below it, so it never reaches
           the two cases above and is decided entirely here — and whichever way
           round it goes, the tile is one finish for a partition that really has
           two. West wins because it keeps a small room's finish from leaking
           out onto the floor the player is standing on: the toilets' west wall
           is seen from the main floor far more often than from inside the
           toilets, and it went pale the day that room got a light wall. It did
           not matter while every zone was a dark variation of the same
           navy-grey, which is why it surfaced only now. */
        || World.zoneAt(x - 1, y) || World.zoneAt(x + 1, y)
        /* A CORNER has wall on all four sides and so reached none of the above:
           it fell through to the generic 'main' tint and stopped matching the
           two walls it joins, which is what makes a room look like it does not
           close. Its room is diagonally adjacent, so ask there. */
        || World.zoneAt(x + 1, y + 1) || World.zoneAt(x - 1, y + 1)
        || World.zoneAt(x + 1, y - 1) || World.zoneAt(x - 1, y - 1)
        || null;
      const px = x * TILE, py = y * TILE;
      c.drawImage(this.wallTile(nz || this.baseZone(), (x * 3 + y) & 1), px, py, TILE, TILE);
      if (below) {
        /* A one-tile wall reads as a kerb, not something you could stand
           behind. Every face you can actually see the front of (the same
           population that gets a skirting board below) gets a second tile
           stacked on top of it, so the room reads as enclosed rather than
           bounded by ankle-height dado rail. It is drawn over whatever is in
           the row above — floor, another wall, or void — because that row
           was already finished by the time this row's turn comes round: the
           loop runs top to bottom, so "in front" is simply "drawn later".
           That ordering is also what keeps it off the player and every NPC —
           both are drawn in the sorted pass after every wall, full stop, so
           the extension can only ever cover something behind it, never
           someone standing in front of it.
           Its opacity still answers "which side is the player on", because a
           solid tall wall between the player and their own avatar the moment
           they cross into the room behind it reads as broken rendering even
           though nothing is actually hidden. Full strength looking up at it
           from the room it encloses; faded by the time the player is a tile
           past it into whatever is on the other side. */
        /* Except over a doorway. The fade answers "which side of this wall is
           the player on", and the head of an opening has no sides to be on:
           what it hides is a tile of wall you are already looking through a
           hole in. Fading it took the top half off the door surround and left
           the bottom half standing, which is the one thing on this wall that
           reads as a fault rather than as depth. */
        const head = World.isOpening(x, y + 1);
        /* AND THERE IS NOWHERE BEHIND THIS ONE TO BE. The fade answers "which
           side of this wall is the player on", and it is worth the loss of a
           solid wall only where the player can actually get behind it — an
           interior partition with a room on the other side of it. A shop front
           on a high street has a building behind it: the tile this second
           storey is drawn on is roof, nobody can ever stand there, and fading
           the front of the parade to fifteen per cent whenever you walk up the
           pavement north of it made the whole row go transparent for no reason
           anybody could see. Solid behind means no fade. */
        const behind = y > 0 && World.solid[y - 1][x];
        const rel = (P.y - py) / (TILE * 1.6);
        const wallAlpha = (head || behind) ? 1 : Math.max(.15, Math.min(1, rel + .35));
        c.save();
        c.globalAlpha = wallAlpha;
        c.drawImage(this.wallTile(nz || this.baseZone(), (x * 3 + y + 1) & 1), px, py - TILE, TILE, TILE);
        c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(px, py - TILE, TILE, 4);
        /* THE EAVES. roofAt() deliberately excludes this very tile from the
           roof mass so the coping lands one row further back, on the tile
           that is actually the top of the building (see the note there) —
           which is correct for working out where the building stops, and
           reads as wrong once it is drawn, because it puts the roof's own
           edge flush against this one with nothing of it lapping over the
           wall beneath. A slice of that tile's own bake — coping and all —
           bled down over the top few pixels of the wall, plus the shadow the
           overhang would actually cast, is what tells a roof sitting ON a
           wall from a roof poured INTO one. */
        if (this.roofMass(x, y - 2)) {
          const eave = this.roofTile(x, y - 2) || this.roofBaked((x * 5 + (y - 2) * 3) & 1);
          const N = eave.width, EH = 5;
          c.drawImage(eave, 0, N - (EH / TILE) * N, N, (EH / TILE) * N, px, py - TILE, TILE, EH);
          this.fade(c, px, py - TILE + EH, TILE, 8, 'n', 'rgba(0,0,0,.5)');
        }
        c.restore();
        /* Skirting. One 7px board along the foot of every wall you can see the
           face of, which is the cheapest detail in the building and the one
           that stops the wall and the floor reading as two flat colours that
           happen to meet. */
        const sk = py + TILE - 9;
        c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(px, sk - 2, TILE, 3);
        c.fillStyle = this.shade((ZONES[nz] && ZONES[nz].wall) || '#141a24', .22);
        c.fillRect(px, sk, TILE, 9);
        c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px, sk, TILE, 2);
        c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px, py + TILE - 2, TILE, 2);
        this.fade(c, px, py + TILE, TILE, 10, 'n', 'rgba(0,0,0,.45)');
      } else if (!World.indoors() && this.roofSkirt(x, y)) {
        /* THE VERGE. This is the ring of wall the roof sits on — a gable end,
           the back wall, a corner — and what is on top of a wall that bears a
           roof is roof. See roofSkirt(). The wall tile is already down and is
           deliberately left under this one: a corner-matched roof tile is not
           opaque to its own edges, so the outermost couple of pixels are the
           top of the wall showing past the covering, which is what an eaves
           actually looks like from above.

           The coping comes out here rather than a tile inside, because the
           plot fill and the corner matching both count the skirt (roofMass),
           so the parapet, the verge and the party walls all land on the true
           edge of the building and nothing else had to be told. */
        const roof = this.roofTile(x, y) || this.roofBaked((x * 5 + y * 3) & 1);
        c.drawImage(roof, px, py, TILE, TILE);
        /* And the shadow it throws OFF the building, on whichever sides have
           ground under them rather than more building. A roof that overhangs
           casts a line; without it the covering reads as having been poured
           flush into the wall. The contact shadow in the floor pass is under
           the wall and is a different thing — that one says the wall is
           thick, this one says the roof is proud of it. */
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

    /* Doorways sit in the wall band, so they are drawn straight after the walls
       and before anything that stands in front of them. The floor behind them
       goes first, because the jambs and the leaf are what stand in front of
       THAT. */
    this.thresholds(x0, y0, x1, y1);
    this.doorways(x0, y0, x1, y1);
    this.doorLeaves(x0, y0, x1, y1);

    /* Ceiling lights and furniture, under everything that moves. Both are
       static, so both are cheap: the light is one cached sprite blitted a
       handful of times, and a desk is four rectangles.
       Outdoors there is no ceiling to hang a light from, and the giveaway that
       a level is outside is not the sky — you never see it, the camera looks
       straight down — it is that the light stops arriving in pools. */
    if (World.indoors()) this.ceiling(x0, y0, x1, y1);
    else this.daylight();
    this.desks(x0, y0, x1, y1);
    this.tables(x0, y0, x1, y1);
    this.worktops(x0, y0, x1, y1);
    this.cubicles(x0, y0, x1, y1);

    /* drawables sorted by y */
    const drawables = [];
    World.objects.forEach(o => {
      /* Picked up, and not back yet — driftwood the tide has not replaced. The
         object stays where it is, so its id and everything keyed on it do too. */
      if (o.gone) return;
      const wx = (o.x + .5) * TILE, wy = (o.y + .5) * TILE;
      if (!Cam.visible(wx, wy)) return;
      /* An occupied chair sorts AFTER its occupant: same tile centre, so a
         plain y sort drew the chair under them and everyone perched on top of
         their seat. Only when occupied — an empty one draws behind you. */
      let sy = wy;
      if (o.kind === 'chair' && Sprites.seatedHere(o.x, o.y)) sy = wy + 2;
      drawables.push({ y: sy, kind: 'obj', o, wx, wy });
    });
    /* Counters are sorted with everything else rather than drawn with the
       static furniture: the whole point of a reception desk is that the person
       on duty stands behind it, and static art would put Ron in front of his
       own counter. */
    (World.counters || []).forEach(t => {
      const wy = (t.y + .5) * TILE;
      if (Cam.visible((t.x + t.w / 2) * TILE, wy)) drawables.push({ y: wy - 1, kind: 'counter', t });
    });
    NPCM.list.forEach(n => { if (Cam.visible(n.x, n.y)) drawables.push({ y: n.y, kind: 'npc', n }); });
    /* Cars sort with everybody else, which is the whole reason they are in
       this list rather than drawn in a pass of their own: walk behind a parked
       car and you are behind it, walk in front and you are in front of it. */
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
        /* Somebody on the street, behind the same two-course wall and clipped
           by it the same way — the car park has one along the road and the
           retail park has one across the back, and a stranger blinking out on
           the pavement behind either of them is the same fault as a colleague
           doing it in the corridor. */
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
        this.car(d.car);
        if (hi === d.car && !Cars.driving) {
          c.save();
          c.strokeStyle = 'rgba(77,163,255,.9)'; c.lineWidth = 2;
          c.shadowColor = '#4da3ff'; c.shadowBlur = 14;
          const cw = d.car.def.len + 12, ch = d.car.def.wid + 12;
          c.translate(d.car.x, d.car.y); c.rotate(d.car.a);
          c.beginPath(); c.roundRect(-cw / 2, -ch / 2, cw, ch, 10); c.stroke();
          c.restore();
        }
      } else if (d.kind === 'obj') {
        const o = d.o;
        /* Behind a wall you are looking at the front of: don't draw it at all.
           Anything less than opaque here IS the bug — a chair you can see
           through a wall reads as the wall being broken, not the chair. */
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
        /* Where the thing is drawn, not which tile it occupies: a poster is on
           the wall face, a kettle on the worktop. Emoji, shadow and highlight
           move together or you highlight the carpet under a poster. */
        const f = o.fdef || FURN[o.kind] || {};
        /* Resolved once, here, because everything below asks the same question
           of it — whether it hangs, whether it draws its own shadow, where its
           middle is, and what to draw — and a tree must not be able to answer
           in two different seasons within one frame. */
        const fsprite = this.spriteOf(f, o);
        const size = o.kind === 'chair' ? (Sprites.ready ? 22 : 16) : (f.size ?? 20);
        let ex = d.wx, ey = d.wy, onFloor = true;
        if (o.mount === 'wall') {
          const s = o.wallSide;
          /* Hung things stop short of the wall they hang on — that three
             quarters of a tile is the thickness of the thing plus the fact
             that you are looking at it from in front. Paint has no thickness
             and no front: a tag goes ON the wall tile, centred, or half of it
             ends up lying on the pavement beside it. */
          const off = f.paint ? TILE : TILE * .72;
          ex += s === 'w' ? -off : s === 'e' ? off : 0;
          /* A north wall is the one case with a wall to hang this ON: it is the
             only side that gets the second, taller tile stacked above it (see
             the `below` branch of the wall loop) — every other side is either a
             flat single-tile wall or the back of one, with nothing above the
             base tile to be "up" on. Paintings, noticeboards, charts and the
             rest of `o.art` belong on that top block, not down by the skirting
             where a fire extinguisher or a thermostat actually lives — real
             pictures hang at head height, not ankle height, and now the wall is
             tall enough for that to be visible instead of hidden behind the
             player's own sprite. */
          /* Head height rather than ankle height. This asked for `o.art` because
             the procedural pictures were the only things ever hung up here —
             but a wall-anchored SPRITE is the same kind of object, and a
             television bracketed level with the skirting board is not mounted,
             it is leaning. Anything that hangs hangs. */
          const wallSprite = fsprite && Tiles.anchors && Tiles.anchors[fsprite] === 'wall';
          /* `high` is opt-in for a kind that hangs but draws no art of its own,
             and the shop signs are why it exists. A frontage's emoji IS its
             sign, and a sign goes on the fascia over the door — which nobody
             had to say while there was no door under it and the whole wall was
             free. There is one now, and at handle height the sign was hanging
             on the leaf of it. */
          const high = s === 'n' && (o.art || wallSprite || f.high);
          /* A number says HOW high, in tiles, for the one case where the
             picture-rail height is not enough: a shop sign has a door under it
             and has to clear the head of it. Everything else is 1.45, which is
             where every poster and chart in the building has always hung. */
          const lift = typeof f.high === 'number' ? f.high : 1.45;
          ey += s === 'n' ? (high ? -TILE * lift : -TILE * .72) : s === 's' ? (f.paint ? TILE : TILE * .68) : 0;
          onFloor = false;
        } else if (o.onTable) {
          /* Before the worktop case: the jug and the biscuits are `surface`
             things that happen to be standing on a table, and a table is not
             as tall as a counter. */
          ey -= 8;                                   /* up onto the tabletop */
          onFloor = false;
        } else if (o.mount === 'surface' || o.onCounter) {
          /* Up onto the worktop — and there are two of those. A front desk is
             the counter's own height, which is what the slab is; the break
             room's kitchen units are the kit's, and a tile taller. */
          ey -= o.onCounter ? this.SLAB_TOP : this.worktopTop(o.x, o.y);
          onFloor = false;
        }
        c.save();
        if (veil < 1) c.globalAlpha = veil;
        /* Only the emoji need a shadow under them. Everything that draws its
           OWN art already carries its own grounding: a kit sprite has one
           baked into the pixels, R.tables() and R.desks() draw a real piece of
           furniture with its own shading, and R.wallArt() stands a sign on its
           own little post. An ellipse under any of those is a second shadow at
           a different angle, which is what makes a room look assembled rather
           than drawn. `chair`, `bin` and `hatch` used to be named here one at a
           time for exactly this reason; two of the three are covered by the
           sprite test now and the third by `drawn`. */
        const drawsOwn = (fsprite && Tiles.has(fsprite)) || f.drawn || o.art || o.noEmoji;
        if (onFloor && !drawsOwn && o.kind !== 'hatch') {
          this.shadow(ex, ey + size * .45, Math.max(11, size * .42), 5);
        }
        if (hi === o) {
          c.save();
          c.strokeStyle = 'rgba(77,163,255,.9)'; c.lineWidth = 2;
          c.shadowColor = '#4da3ff'; c.shadowBlur = 14;
          const hw = Math.max(40, size + 13), hh = Math.max(42, size + 15);
          c.beginPath(); c.roundRect(ex - hw / 2, ey - hh / 2, hw, hh, 8); c.stroke();
          c.restore();
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
        /* Already drawn by doorways(), tables() or wallArt() — the emoji would
           be a second one on top. Chairs scale with the people: 22px is doll's
           furniture under a 58px sprite. */
        /* The kit's own furniture where there is any, then the drawn wall
           art, then the emoji it all replaced. */
        /* The kit draws its wall items FACE-ON, and NORTH is the only wall this
           projection shows you the face of — it is the one side that gets the
           second tile stacked above it, which is what you are looking at. East
           and west you see edge-on; south you are looking at the BACK of a
           wall. R.wallArt() squashes its own drawings to 44% on e/w for exactly
           this reason, and a sprite has no such affordance: a widescreen
           television on a side wall arrives as a poster of a television, and a
           mirror on a south wall is a mirror hung facing away from you. Fall
           back to the emoji anywhere but north — it has no orientation to get
           wrong. By anchor, so the next one is right without anybody
           remembering this. */
        const edgeOn = o.mount === 'wall' && o.wallSide !== 'n' && !f.paint
                    && fsprite && Tiles.anchors && Tiles.anchors[fsprite] === 'wall';
        /* Fifteen archive boxes and thirty-two chairs cut from one rectangle
           read as a stamp rather than as a room. Tiles.draw already mirrors —
           it is how the far leaf of a double doorway is drawn — so variety
           costs a boolean rather than a second crop. Seeded off the tile so it
           is stable across a rebuild, and limited to kinds whose art is
           symmetrical enough that the mirror is a variation rather than a
           mistake: nothing with a handle, a hinge or a console on one side. */
        const canFlip = FLIPPABLE.has(o.kind) && ((o.x * 7 + o.y * 13) & 1) === 1;
        /* `turn` is quarter turns clockwise, and it is ART AND NOTHING ELSE —
           the same standing as `flip`. A sofa turned to face the other way is
           still one tile, still solid or not exactly as it was, and still
           interacted with from wherever it always was: nothing here touches
           World.solid and nothing downstream reads this.

           About the sprite's own middle rather than about the tile it is
           anchored to, or a bookcase would swing out of the room when it
           turned. The shadow, the highlight and the ringing pool stay square
           to the map above: they are the floor and the UI, not the object. */
        /* AND PAINT TURNS WITH THE WALL IT IS ON.

           `paint` is what lets a tag hang on a wall you are not looking square
           at: it goes ON the wall tile rather than standing in front of it,
           because paint has no thickness. What nobody said was which way up.
           A tag is two or three tiles of WIDE, and on Aldergate Rise and Marlow
           Street the wall it is sprayed on runs north to south — so a
           horizontal tag lay across the street instead of along the wall, with
           a third of it on the pavement and a third on the carriageway. Turned
           a quarter, it runs down the wall, which is the only way a tag that
           shape fits on a wall that shape. East and west only: a wall to the
           south runs east–west already and a tag on it is the right way round
           without anybody doing anything. */
        const paintTurn = f.paint && o.mount === 'wall'
          ? (o.wallSide === 'e' ? 1 : o.wallSide === 'w' ? 3 : 0) : 0;
        const turn = ((o.turn || 0) + paintTurn) & 3;
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
        if (o.kind === 'pc' && this.animate) {
          c.fillStyle = 'rgba(120,190,255,' + (0.05 + Math.abs(Math.sin(this.t * 2 + o.wob)) * .08) + ')';
          c.fillRect(ex - 13, ey - 12, 26, 16);
        }
        c.restore();
      } else if (d.kind === 'npc') {
        const n = d.n;
        /* BEHIND THE WALL IN FRONT OF YOU — and a person is not a filing
           cabinet about it.

           Every wall whose face you can see is drawn two courses tall, and the
           upper course is painted over the row of floor BEHIND it. For
           furniture that is the whole story: a filing cabinet is shorter than
           the course that hides it, so veil() drops it and that is what stops
           this building's furniture painting straight through its own walls.

           A colleague is taller than that course. Half of them stands above
           its top edge — which is why dropping them the same way was wrong in
           a way you could sit and watch: a hundred and thirty-six squares of
           this floor plan are "the row behind a wall", and one of them is the
           bottom lane of the corridor, which is four lanes deep and which
           everybody walks all day. From the main floor a colleague crossing it
           blinked out and back every time they drifted a lane.

           So they are CLIPPED rather than culled. What stands above the top of
           the course is drawn solid, because you can see it and there is
           nothing in front of it; what is behind the course fades on the
           veil's own ramp exactly as it always did. Nothing shows through a
           wall, which is the thing the veil was written for, and nobody
           vanishes, which is the thing it cost. */
        const nty = Math.floor(n.y / TILE);
        const nveil = this.veilAt(Math.floor(n.x / TILE), nty);
        if (nveil >= 1) { this.colleague(n, hi); return; }
        /* The top edge of the course is the top edge of the tile they are
           standing on: it is drawn over that tile, one course up from the wall
           itself. Both halves are the same person drawn twice — same seat,
           same frame of the same walk, same name — so neither can drift. */
        const lip = nty * TILE;
        c.save(); c.beginPath(); c.rect(-1e6, -1e6, 2e6, 1e6 + lip); c.clip();
        this.colleague(n, hi); c.restore();
        if (nveil > 0) {
          c.save(); c.beginPath(); c.rect(-1e6, lip, 2e6, 1e6); c.clip();
          c.globalAlpha = nveil; this.colleague(n, hi); c.restore();
        }
      } else {
        const psprite = Sprites.has('player');
        /* Same as the colleagues: sitting draws you in the chair, not at the
           pixel you happened to stop on. You stop wherever the thumb came off
           the stick, which is almost never the middle of the seat. */
        const seat = psprite && !P.moving
          ? Sprites.seatedAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE)) : null;
        const at = seat ? Sprites.seatPos(seat) : { x: P.x, y: P.y };
        this.shadow(at.x, at.y + 13, 13, 5);
        const bob = psprite ? 0 : P.moving && this.animate ? Math.abs(Math.sin(P.bob * 2)) * 4 : 0;
        c.save();
        /* The glow is what tells you which of twenty-one similar people is
           you — it matters more with sprites than it did with a distinct emoji. */
        c.shadowColor = 'rgba(77,163,255,.55)'; c.shadowBlur = 16;
        if (psprite) {
          /* WHICH WAY THE TOP HALF IS POINTING, asked FIRST because the
             answer decides the bottom half as well. Aiming is the one thing
             in this game where where you are going and where you are looking
             are two different facts: the shoulders take the bearing of the
             aim, the leftover angle becomes a lean, and the feet take
             whichever row is within a quarter turn of the shoulders — which
             may mean walking backwards. Guns.pose() writes P.dir and sets
             Guns.back for the two lines below; with nothing in your hands it
             is null and this is the single blit it has always been. See
             Sprites.twisted(). */
          const tw = seat ? null : Guns.pose();
          /* You run when you are actually moving at speed and walk when you
             are easing along on the stick — P.fast is set by movePlayer from
             the size of the movement vector, so the animation and the pace
             can never disagree. */
          /* WHICH FRAME THE LEGS ARE: the ordinary walk, or the ordinary
             stand. Holding something changes the ARM and nothing else — see
             Guns.ARM — so the legs are the legs they have always been. */
          const pf = seat ? Sprites.sit('player')
            : P.moving ? Sprites.frame('player', this.animate, P.step, P.fast, tw && Guns.back)
            /* Squared up with something to swing, the feet are the stance's. */
            : tw && tw.legFrame !== undefined ? tw.legFrame
            : this.animate ? Sprites.breath('player') : 0;
          const plift = seat && this.animate ? Sprites.breathLift('player') : 0;
          /* Same rule as the colleagues above: the chair points, not the
             sitter. Sit on the bench in Nailed It and you face the room. */
          Sprites.draw(c, 'player', seat ? (seat.face ?? 0) : P.dir ?? 2, pf, at.x, at.y - plift, tw);
          /* And what is in the hand, over the top, always. There used to be a
             depth test here — behind the body when you were pointing away from
             the camera — and it was answering a question that no longer comes
             up: the hand is on the end of an arm that is held out away from
             the ribs in every direction, including away from the camera, so
             there is nothing left for the body to be in front of. */
          if (!seat && Guns.armed) Guns.held(c, at.x, at.y - plift);
        } else this.emoji(P.face, at.x, at.y - bob, 30);
        c.restore();
      }
    });

    /* Everything in the air, over the people it is going past and under the
       light below, because a dart crossing an office at half past four is a
       thing in that office and is lit by whatever that office is lit by. */
    Guns.paintShots(c);

    /* THE LIGHT, over the top of everything the world is made of and under
       everything the game says about it. The order is the whole trick: the
       grade darkens the office, the lamps put the light back where there is a
       lamp, and the particles and the floating numbers are drawn after both
       because a damage number is not lit by anything. */
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
    /* The edge arrow is drawn after the camera transform is popped, because it
       lives at the edge of the screen rather than anywhere in the office. */
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
  /* A compass arrow orbiting the player, NOT an edge arrow: an edge arrow
     lands in a corner and both top corners are HUD cards. Orbiting also
     survives the camera hitting the map edge, where the player is off centre. */
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
  /* The minimap and the map screen are engine/map.js now — one raster per
     level at a pixel a tile, read by both, rather than the level squashed into
     a 168×118 canvas with a scale per axis. What was here drew the town half
     as wide again as it is and the outskirts at four tenths of a pixel a tile,
     and rebuilt both on every walk through a door. See Atlas. */
};
