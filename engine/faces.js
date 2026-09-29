'use strict';
/* ---------------- Faces ----------------
   What a person's face is doing. Liberated Pixel Cup art, built by
   tools/build-sprites.mjs from ElizaWy's LPC Revised heads — third-party,
   OGA-BY 3.0, NOT covered by this file's licence. See LICENSE part 2 and
   art/CREDITS.md.

   An expression is twenty-two pixels by ten, drawn OVER somebody who is
   already on the screen. It has to be, and that is worth explaining, because
   the obvious design is a sheet of faces and the obvious design does not fit
   in a browser: twenty-one colleagues times twelve expressions is two hundred
   and fifty-two more rows of 1824x56, which is fourteen megapixels of PNG and
   fifty-odd megabytes of decoded bitmap, for a change to somebody's eyebrows.
   So the build ships the CHANGE instead — the difference between a face and
   the same face at rest — and this draws it on top. The whole sheet is 68KB.

   Three things follow from that, and they are the whole of this file:

     - A patch belongs to a HEAD, not to a person. The build works out which
       head and which skin each colleague was composited from, and which the
       player chose, and `rows` on the sheet maps both to the same place. So
       Bev's mouth is Bev's mouth and not a generic one.
     - A head MOVES. It bobs through the walk, drops two pixels when somebody
       sits down and rides four high through the run, so the sheet carries a
       table of where the head is in every frame of every direction and the
       patch goes wherever the head went. Get this wrong by one pixel and a
       person does not look like they are frowning, they look like something
       is wrong with their face.
     - There is no face on the back of a head. Direction 0 draws nothing,
       which is also why a seated colleague — drawn facing their desk — is
       never wearing an expression. The dialogue box is where you actually
       look somebody in the eye, so that is where most of this shows.

   Nothing here reads pixels back. Same rule as engine/sprites.js: the sheets
   sit beside index.html and a file:// page taints every canvas they are drawn
   into, so this draws and never reads, and the game still opens off disk.

   A copy without art/ never loads the manifest, so `ok` stays false, and every
   entry point below is a no-op. Everybody keeps a straight face and the game
   is exactly the game it was. */
const Faces = {
  sheet: null, img: null, ok: false,

  /* The sheet is the one on the manifest that carries expressions. Found by
     what it HAS rather than by its name, the same way Sprites.load() picks out
     the roster sheets — a sheet is its geometry, not its id. */
  load() {
    if (typeof SPRITE_ATLAS === 'undefined' || !SPRITE_ATLAS) return;
    const list = SPRITE_ATLAS.sheets;
    const s = Array.isArray(list) ? list.find(x => x && Array.isArray(x.exprs) && x.rows) : null;
    if (!s || s === this.sheet) return;
    this.sheet = s;
    const im = new Image();
    im.onload = () => { this.img = im; this.ok = true; };
    /* A sheet that will not decode is not an error worth telling anybody
       about: it is an office of people with resting faces. */
    im.onerror = () => { this.ok = false; };
    im.src = s.src + (s.v ? '?v=' + s.v : '');
  },

  /* ---- what somebody is wearing ----
     Two registers, and they are deliberately different things. A HOLD is a
     state — she is pleased to see you, and stays pleased for as long as the
     conversation lasts. A FLASH is an event — that landed, and it is gone in
     two seconds. Events beat states, because the event is the news.

     Neither is in G. An expression is not worth saving: come back to a save
     and everybody is simply at rest again, which is what a fresh room looks
     like anyway. */
  held: Object.create(null),
  timed: Object.create(null),

  hold(id, expr) {
    if (!id) return;
    if (expr) this.held[id] = expr; else delete this.held[id];
  },
  flash(id, expr, secs) {
    if (!id || !expr || typeof R === 'undefined') return;
    this.timed[id] = { expr, till: R.t + (secs || 1.6) };
  },
  clear(id) { delete this.held[id]; delete this.timed[id]; },

  /* The expressions that already have the eyes shut, and so have nothing a
     blink could add. Everything else blinks over the top of whatever it is
     holding — somebody unimpressed with you still blinks, and a face that
     holds one expression without ever blinking is the waxwork this whole file
     exists to avoid. */
  SHUT: ['closing', 'closed', 'happy'],

  /* One face, right now. Held and flashed expressions are named; a blink is
     not, because nobody asks for one. */
  of(id) {
    const t = this.timed[id];
    if (t) {
      if (typeof R !== 'undefined' && R.t < t.till) return t.expr;
      delete this.timed[id];
    }
    /* Failing anything said to them, the day they are having — see
       Mind.face(), which only answers at the ends of the scale. */
    const held = this.held[id] || (typeof Mind !== 'undefined' ? Mind.face(id) : null);
    if (held) return this.SHUT.indexOf(held) < 0 ? (this.blink(id) || held) : held;
    return this.blink(id);
  },

  /* ---- blinking ----
     The one expression everybody wears. A floor of people who never blink is
     the thing that gives sprites away — they are furniture with legs — and
     three frames of eyelid, on nobody's schedule but their own, is the whole
     fix. Phased off the person's own id exactly as breathing is, or the entire
     office blinks in time, which is worse than nobody blinking at all.

     Off with Animation, along with the breath and the walk: it is movement,
     and nothing is said by it. */
  BLINK_S: 4.4,
  blink(id) {
    if (typeof R === 'undefined' || !R.animate) return null;
    let hsh = 0;
    for (let i = 0; i < id.length; i++) hsh = (hsh * 31 + id.charCodeAt(i)) & 1023;
    /* A spread of periods rather than one, so two people who happen to be in
       step do not stay in step. */
    const period = this.BLINK_S + (hsh % 27) / 10;
    const t = (R.t + hsh) % period;
    if (t < .06) return 'closing';
    if (t < .15) return 'closed';
    if (t < .21) return 'closing';
    return null;
  },

  /* Which row of the sheet is this person's face. The cast are on it by name;
     the player is on it by the BUILD THEY CHOSE, because the player is not a
     baked row — they are a stack of parts composed at runtime, and the face
     that goes with them is the face of the base underneath. Somebody who never
     opened the creator is still the row the build baked, and has a row of
     their own under `player`. */
  row(id) {
    if (!this.sheet) return -1;
    const rows = this.sheet.rows;
    /* Anybody composed is on the sheet by the BASE THEY WERE STACKED FROM,
       because a composed person has no baked row and the face that goes with
       them is the face of the head underneath.

       This tested `id === 'player'` and read G.look, which was true of the one
       composed person there used to be. Sprites.baseOf() answers it for any of
       them, so a shopkeeper written into data/npcs.js with a `look:` blinks
       and frowns like the rest of the cast. */
    /* A colleague has a row of their own, masked against their own hair; the
       player may have chosen other hair, so they wear their base's. */
    if (id !== 'player' && rows[id] !== undefined) return rows[id];
    const base = Sprites.composed(id) && Sprites.baseOf(id);
    if (base && rows[base] !== undefined) return rows[base];
    return rows[id] !== undefined ? rows[id] : -1;
  },

  /* ---- drawing ----
     Called by Sprites.draw() with the frame it has just drawn and the box it
     drew it in, so this never works out where anybody is. `dir` is the LPC
     order — 0 is away from the camera, and a back has no face. */
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
    /* And the mouth, which the heads were drawn without — see MOUTHS. Facing
       the camera only: in profile a mouth is a pixel on the edge of a face,
       and there is nothing a pixel there can say. */
    if (dir === 2) this.paintMouth(c, id, x + off[0], y + off[1]);
  },

  /* ---- mouths ----
     THE HEADS HAVE NO MOUTHS. The kit draws a face at this size as two eyes
     over a jaw, which is a fine face and a face that cannot talk — so a
     portrait speaking a line could only nod. These are the frames that were
     missing: eight mouths, four pixels wide and three high, placed on the
     row where every adult head in the kit narrows to its chin (row 24 of the
     frame, between the eyes — measured off the art, and the same on every
     head in the cast, fem, masc and elderly alike).

       D  the mouth itself       L  a lip at rest       I  the inside

     They are painted as TRANSLUCENT darks over whatever skin is underneath
     rather than as colours, so one set of frames suits every skin tone in
     the game without reading a single pixel back — which this file never
     does, because a page opened from disk cannot. */
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
  /* On the deepest skin tones a dark mouth disappears into the face, so the
     ink turns round: a near-black line with a lighter, rosier lip — which is
     how the art would have drawn it. Chosen from the skin a person was
     composed from (their `look` in data/npcs.js, or yours), never from the
     pixels. */
  MOUTH_INK_DEEP: { D: 'rgba(12,2,6,.95)', L: 'rgba(214,112,132,.6)', I: 'rgba(232,74,104,.92)' },
  DEEP: ['Brown', 'Coffee'],
  _ink: Object.create(null),
  inkFor(id) {
    if (this._ink[id]) return this._ink[id];
    let base = '';
    if (id === 'player') base = ((typeof G !== 'undefined' && G.look) || (typeof Look !== 'undefined' && Look.DEFAULT) || {}).base || '';
    else if (typeof NPCS !== 'undefined') { const d = NPCS.find(x => x.id === id); base = (d && d.look && d.look.base) || ''; }
    const tone = String(base).split('/')[1] || '';
    const ink = this.DEEP.includes(tone) ? this.MOUTH_INK_DEEP : this.MOUTH_INK;
    /* The player can change skin in the wardrobe, so theirs is never kept. */
    if (id !== 'player') this._ink[id] = ink;
    return ink;
  },
  /* The mouth's top-left, in the pixels of a front-facing frame. */
  MOUTH_AT: [30, 23],
  /* Who is talking, and until when (R.t). Set by the dialogue portrait while
     its words type out; somebody in the world is talking while their speech
     bubble is new. */
  talk: Object.create(null),
  talking(id) {
    const t = typeof R !== 'undefined' ? R.t : 0;
    if (this.talk[id] > t) return true;
    if (typeof NPCM === 'undefined' || !NPCM.byId) return false;
    const n = NPCM.byId.get(id);
    return !!(n && n.sayT > 2.3);
  },
  /* WHICH MOUTH. Talking cycles through the shapes a line of speech makes —
     happily, if they are happy; at rest it is whatever their face is doing:
     a smile, a frown, an o of surprise, a hard line when they are cross. */
  TALK: ['small', 'open', 'o', 'open', 'small', 'rest', 'open', 'small'],
  TALK_HAPPY: ['smile', 'laugh', 'smile', 'open', 'laugh', 'smile'],
  mouthOf(id) {
    const t = this.timed[id];
    const t0 = typeof R !== 'undefined' ? R.t : 0;
    const expr = (t && t0 < t.till && t.expr) || this.held[id]
      || (typeof Mind !== 'undefined' ? Mind.face(id) : null);
    const glad = expr === 'happy' || expr === 'blush';
    if (this.talking(id) && !(typeof R !== 'undefined' && !R.animate)) {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 1023;
      const seq = glad ? this.TALK_HAPPY : this.TALK;
      return seq[Math.floor(t0 * 9 + h) % seq.length];
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

  /* The same patch as CSS, for the dialogue box's portrait — which is a window
     onto the atlas rather than a canvas, so the expression has to be a second
     window laid over the first. Standing, facing the camera: frame 0 of
     direction 2, where the head is at rest and the offset is nothing.

     Returns null for anybody the portrait itself refuses (a composed sheet is
     a canvas with no url() to point at), so the two always agree. */
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

  /* ---- what the game means by a face ----
     The one place a number becomes an expression, so the rules are in one
     place and not spread through the writing.

     A standing you gets nothing: neutral is not an absence, it is what a
     colleague's face does at work. Only the ends of the scale show — the
     woman who is glad you are back, and the man who has told somebody about
     you — which is also exactly where Rel.label stops being polite. */
  mood(rel) {
    if (rel >= 5) return 'happy';
    if (rel <= -3) return 'anger';
    return null;
  },
};
