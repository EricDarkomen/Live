'use strict';
/* ---------------- Faces ----------------
   What a person's face is doing. LPC art from ElizaWy's LPC Revised heads,
   OGA-BY 3.0, not covered by this file's licence (LICENSE part 2,
   art/CREDITS.md).

   An expression is a 22x10 patch drawn over somebody already on screen: the
   build ships only the difference from the face at rest, 68KB for the whole
   cast, instead of a sheet of faces per person.
     - A patch belongs to a head, not a person: `rows` maps each person, and
       the player's chosen base, to their head's row.
     - A head moves (walk bob, sitting, running), so the sheet records where
       the head is in every frame and the patch follows it.
     - A back has no face: direction 0 draws nothing.
   Nothing reads pixels back, so the game still opens off disk. */
const Faces = {
  sheet: null, img: null, ok: false,

  /* The manifest sheet that carries expressions, found by what it has. */
  load() {
    const s = SPRITE_ATLAS.sheets.find(x => x && Array.isArray(x.exprs) && x.rows);
    if (!s || s === this.sheet) return;
    this.sheet = s;
    const im = new Image();
    im.onload = () => { this.img = im; this.ok = true; };
    /* A sheet that will not decode leaves everybody with resting faces. */
    im.onerror = () => { this.ok = false; };
    im.src = s.src + (s.v ? '?v=' + s.v : '');
  },

  /* ---- what somebody is wearing ----
     A hold is a state for the length of a conversation; a flash is an event,
     gone in seconds, and beats a hold. Neither is saved. */
  held: Object.create(null),
  timed: Object.create(null),

  hold(id, expr) {
    if (!id) return;
    if (expr) this.held[id] = expr; else delete this.held[id];
  },
  flash(id, expr, secs) {
    if (!id || !expr) return;
    this.timed[id] = { expr, till: R.t + (secs || 1.6) };
  },
  clear(id) { delete this.held[id]; delete this.timed[id]; },

  /* Expressions with the eyes already shut; everything else still blinks. */
  SHUT: ['closing', 'closed', 'happy'],

  /* A stable small number per person, so blinks and speech are out of step. */
  seed(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 1023;
    return h;
  },

  /* One face, right now: a flash, else a hold, else the day they are having
     (Mind.face(), which only answers at the ends of the scale), with blinks. */
  of(id) {
    const t = this.timed[id];
    if (t) {
      if (R.t < t.till) return t.expr;
      delete this.timed[id];
    }
    const held = this.held[id] || Mind.face(id);
    if (held) return this.SHUT.indexOf(held) < 0 ? (this.blink(id) || held) : held;
    return this.blink(id);
  },

  /* ---- blinking ----
     Everybody blinks, each on their own period, or a room of sprites is
     furniture with legs. Off with Animation. */
  BLINK_S: 4.4,
  blink(id) {
    if (!R.animate) return null;
    const hsh = this.seed(id);
    const period = this.BLINK_S + (hsh % 27) / 10;
    const t = (R.t + hsh) % period;
    if (t < .06) return 'closing';
    if (t < .15) return 'closed';
    if (t < .21) return 'closing';
    return null;
  },

  /* Which row is this person's face: their own, masked to their own hair;
     else, for anybody composed from parts (the player, or a `look:` without a
     rebuild), the row of the base they were stacked from. */
  row(id) {
    if (!this.sheet) return -1;
    const rows = this.sheet.rows;
    if (id !== 'player' && rows[id] !== undefined) return rows[id];
    const base = Sprites.composed(id) && Sprites.baseOf(id);
    if (base && rows[base] !== undefined) return rows[base];
    return rows[id] !== undefined ? rows[id] : -1;
  },

  /* ---- drawing ----
     From Sprites.draw(), with the frame it drew and where. `dir` is LPC order:
     0 faces away. */
  paint(c, id, dir, frame, x, y) {
    if (!this.ok || !(dir >= 1 && dir <= 3)) return;
    const row = this.row(id);
    if (row < 0) return;
    const s = this.sheet;
    const off = (s.head[dir] || [])[frame] || [0, 0];
    const expr = this.of(id);
    const col = expr ? s.exprs.indexOf(expr) : -1;
    if (col >= 0) c.drawImage(this.img, (col * 3 + dir - 1) * s.fw, row * s.fh, s.fw, s.fh,
      Math.round(x + s.at[0] + off[0]), Math.round(y + s.at[1] + off[1]), s.fw, s.fh);
    /* The mouth, facing the camera only: in profile it is one pixel. */
    if (dir === 2) this.paintMouth(c, id, x + off[0], y + off[1]);
  },

  /* ---- mouths ----
     The kit's heads have none, so a speaking portrait could only nod. Eight
     4x3 shapes on the row where every adult head narrows to its chin (row 24,
     between the eyes), painted as translucent darks so they suit every skin
     without reading pixels back.
       D  the mouth    L  a lip at rest    I  the inside */
  MOUTHS: {
    rest:  ['....', '.LL.', '....'],
    small: ['....', '.DD.', '....'],
    open:  ['....', '.DD.', '.II.'],
    o:     ['....', '.DD.', '.DD.'],
    smile: ['D..D', '.DD.', '.LL.'],
    laugh: ['D..D', '.DD.', '.II.'],
    frown: ['.DD.', 'D..D', '....'],
    flat:  ['....', 'DDDD', '.LL.']
  },
  MOUTH_INK: { D: 'rgba(58,8,24,.78)', L: 'rgba(150,34,60,.38)', I: 'rgba(170,30,62,.85)' },
  /* On the deepest skins a dark mouth vanishes, so the ink turns round. Chosen
     from the skin they were composed from, never from pixels. */
  MOUTH_INK_DEEP: { D: 'rgba(12,2,6,.95)', L: 'rgba(214,112,132,.6)', I: 'rgba(232,74,104,.92)' },
  DEEP: ['Brown', 'Coffee'],
  _ink: Object.create(null),
  inkFor(id) {
    if (this._ink[id]) return this._ink[id];
    let base = '';
    if (id === 'player') base = (G.look || Look.DEFAULT || {}).base || '';
    else { const d = NPCS.find(x => x.id === id); base = (d && d.look && d.look.base) || ''; }
    const tone = String(base).split('/')[1] || '';
    const ink = this.DEEP.includes(tone) ? this.MOUTH_INK_DEEP : this.MOUTH_INK;
    /* The player can change skin in the wardrobe, so theirs is never kept. */
    if (id !== 'player') this._ink[id] = ink;
    return ink;
  },
  /* The mouth's top-left in a front-facing frame. */
  MOUTH_AT: [30, 23],
  /* Who is talking, until when (R.t): the dialogue portrait while its words
     type, or somebody in the world whose speech bubble is new. */
  talk: Object.create(null),
  talking(id) {
    if (this.talk[id] > R.t) return true;
    const n = NPCM.byId && NPCM.byId.get(id);
    return !!(n && n.sayT > 2.3);
  },
  /* Talking cycles through speech shapes (happier if they are happy); at rest
     the mouth follows the face. */
  TALK: ['small', 'open', 'o', 'open', 'small', 'rest', 'open', 'small'],
  TALK_HAPPY: ['smile', 'laugh', 'smile', 'open', 'laugh', 'smile'],
  mouthOf(id) {
    const t = this.timed[id], t0 = R.t;
    const expr = (t && t0 < t.till && t.expr) || this.held[id] || Mind.face(id);
    const glad = expr === 'happy' || expr === 'blush';
    if (this.talking(id) && R.animate) {
      const seq = glad ? this.TALK_HAPPY : this.TALK;
      return seq[Math.floor(t0 * 9 + this.seed(id)) % seq.length];
    }
    if (glad) return 'smile';
    if (expr === 'sad' || expr === 'shame') return 'frown';
    if (expr === 'shock') return 'o';
    if (expr === 'anger') return 'flat';
    return 'rest';
  },
  paintMouth(c, id, x, y) {
    const shape = this.MOUTHS[this.mouthOf(id)];
    if (!shape) return;
    const ax = Math.round(x + this.MOUTH_AT[0]), ay = Math.round(y + this.MOUTH_AT[1]);
    const inks = this.inkFor(id);
    const was = c.fillStyle;
    for (let r = 0; r < shape.length; r++) {
      const line = shape[r];
      for (let k = 0; k < line.length; k++) {
        const ink = inks[line[k]];
        if (!ink) continue;
        c.fillStyle = ink;
        c.fillRect(ax + k, ay + r, 1, 1);
      }
    }
    c.fillStyle = was;
  },

  /* The same patch as CSS, over a still portrait's window onto the atlas:
     standing, facing the camera. Null wherever the portrait itself refuses. */
  portrait(id, scale) {
    if (!this.ok) return null;
    const row = this.row(id);
    if (row < 0) return null;
    const expr = this.of(id);
    if (!expr) return null;
    const s = this.sheet, col = s.exprs.indexOf(expr);
    if (col < 0) return null;
    const r = Sprites.at(id);
    if (!r || !r.sheet.src) return null;
    return {
      left: ((s.at[0] - (r.sheet.fw - Sprites.HEAD_W) / 2) * scale) + 'px',
      top: ((s.at[1] - Sprites.HEAD_TOP) * scale) + 'px',
      width: (s.fw * scale) + 'px',
      height: (s.fh * scale) + 'px',
      backgroundImage: 'url(' + s.src + ')',
      backgroundSize: (s.w * scale) + 'px ' + (s.h * scale) + 'px',
      backgroundPosition: '-' + ((col * 3 + 1) * s.fw * scale) + 'px -' + (row * s.fh * scale) + 'px',
    };
  },

  /* How someone feels about you, as a face: only the ends of the scale show. */
  mood(rel) {
    if (rel >= 5) return 'happy';
    if (rel <= -3) return 'anger';
    return null;
  },
};
