'use strict';
/* ---------------- The guns ----------------
   The office's own arsenal, from the 2019 away-day box: a foam dart blaster,
   a water pistol and an elastic-band post tray. Nothing hurts anybody; it
   makes people turn round.
   Drawn, not fetched: each gun is a character grid plus a palette, like the
   cars. The LPC kit has no guns, and twin-stick aim needs art that rotates:
   a bitmap baked once at 1:1 and turned about its grip. Moving the trigger
   guard is moving a `g`.

   A gun:
     n, e, d       name, emoji, inventory description.
     mag, reload   rounds, and reload seconds.
     rate          shots per second, held down.
     speed, range  tiles per second, and tiles before it is spent.
     spread        radians of inaccuracy per shot.
     kick          pixels of screen shake.
     shot          how the projectile is drawn.
     hands         2 puts the off hand on the art's `fore`, under the barrel.
     art           the picture, facing right, grip and muzzle marked.

   Items bind to guns from data: an ITEMS entry's `gun:` names a key here
   (Item.give()). Aiming, firing, flight and reactions are one object below:
   there is one gun in the world, in the player's hands. */

const GUNS = {
  /* Six darts, a proper clunk, slow enough to watch. */
  dart: {
    n: 'Foam Dart Blaster', e: '🔫',
    d: 'Six foam darts. Four of them match.',
    mag: 6, reload: 1.7, rate: 3.1, speed: 9.4, range: 7.6, spread: 0.05, kick: 1.8, hands: 2,
    shot: { len: 7, w: 3, body: '#ff8a3d', tip: '#ffe27a', trail: 0 },
    art: {
      pivot: [6, 10], muzzle: [17, 4], fore: [12, 7],
      pal: { o: '#1d2230', O: '#ff7a2f', w: '#9fb0c9', W: '#e8eef7', Y: '#ffe27a', B: '#2f6fd0', g: '#151922' },
      px: [
        '.....ooooooo......',
        '....oOOOOOOOoo....',
        '...oOOOOOOOOOOooo.',
        '...oOOOOOOOOOOOOOo',
        '...oOOOwWWWWWWWWWY',
        '...oOOOwWWWWWWWWWY',
        '...oOOOOOOOOOOOOOo',
        '...oOOOOOOOoooooo.',
        '....oOOgggo.......',
        '....oBBBBo........',
        '.....oBBo.........',
        '.....oBBo.........',
        '......oo..........'
      ]
    }
  },
  /* A post tray, four bands and a bulldog clip. Nobody remembers who made it.
     It is the fastest thing in the box and it holds four. */
  band: {
    n: 'Elastic Band Pistol', e: '📎',
    d: 'A post tray, four elastic bands and a bulldog clip.',
    mag: 4, reload: 1.1, rate: 2.4, speed: 13.5, range: 5.4, spread: 0.02, kick: 1.2,
    shot: { len: 5, w: 2, body: '#e2554f', tip: '#e2554f', trail: 4 },
    art: {
      pivot: [3, 8], muzzle: [17, 3],
      pal: { o: '#1d2230', B: '#c9a06a', b: '#8d6a42', r: '#e2554f', K: '#2a2f3a' },
      px: [
        '....rrrrrrrrrrrrrr',
        '..................',
        '..ooooooooooooooo.',
        '.oBBBBBBBBBBBBBBBo',
        '.oBbbbbbbbbbbbbbBo',
        '.oBBBBooooooooooo.',
        '.oBBBo............',
        'oKKKKo............',
        'oKKKKo............',
        'oKKKo.............',
        '.ooo..............'
      ]
    }
  },
  /* Holds forty, carries about three tiles. */
  water: {
    n: 'Water Pistol', e: '💦',
    d: 'Translucent pink. Fill it at a sink.',
    mag: 40, reload: 2.4, rate: 11, speed: 7.2, range: 3.6, spread: 0.17, kick: 0.5,
    shot: { len: 3, w: 2, body: '#7fd8ff', tip: '#dff4ff', trail: 0 },
    art: {
      pivot: [5, 9], muzzle: [17, 3],
      pal: { o: '#1d2230', C: '#6fd0f2', c: '#a9e7fb', P: '#e46ba8', n: '#c9d6e8' },
      px: [
        '......ooooooo.....',
        '.....oCCCCCCCoo...',
        '...ooCCcccCCCCCoo.',
        '..oCCCCCCCCCCCCCCo',
        '..onnnnnnnnnnnnnno',
        '..oCCCCCCCCCCCCCCo',
        '...ooCCCCCCCCCooo.',
        '.....oCCCCCCo.....',
        '.....oCCPPCo......',
        '.....oPPPPo.......',
        '......oPPo........',
        '......oPo.........',
        '......oo..........'
      ]
    }
  }
};

/* ---- the two things you swing ----
   Melee shares the table, controls and drawing: a `melee` block instead of a
   magazine means no ammo, no reload, and an arc swept through the aim.

     arc      radians swept, centred on the aim.
     reach    tiles, centre to centre.
     swing    seconds the sweep (two pose frames) takes.
     rate     swings per second, held down. */
GUNS.noodle = {
  n: 'Foam Sword', e: '🗡️',
  d: 'Foam, and a slogan printed down the blade.',
  melee: true, arc: 1.6, reach: 1.35, swing: 0.22, rate: 2.6, kick: 1,
  art: {
    pivot: [4, 3], muzzle: [21, 3],
    pal: { o: '#1d2230', F: '#b48cff', f: '#d9c6ff', G: '#2a2f3a', Y: '#ffd166' },
    px: [
      '..........oooooooooooo',
      '.......ooYFFFFFFFFFFFo',
      '..ooooYYYFFffffffffFFo',
      '..oGGGoYYYFFFFFFFFFFFo',
      '..ooooYYYFFffffffffFFo',
      '.......ooYFFFFFFFFFFFo',
      '..........oooooooooooo'
    ]
  }
};
GUNS.pack = {
  n: 'Rolled-Up Newspaper', e: '📜',
  d: 'Rolled tight, with a band round it.',
  melee: true, arc: 1.35, reach: 1.55, swing: 0.3, rate: 1.6, kick: 2.4,
  art: {
    pivot: [4, 3], muzzle: [20, 3],
    pal: { o: '#1d2230', W: '#e8e2d4', P: '#bdb6a4', r: '#e2554f' },
    px: [
      '....oooooooooooooooo..',
      '..ooWWWWWrWWWWWWWWWo..',
      '..oWWWWWWrWWWWWWWWWWo.',
      '..oPPPPPPrPPPPPPPPPPo.',
      '..oWWWWWWrWWWWWWWWWWo.',
      '..ooWWWWWrWWWWWWWWWo..',
      '....oooooooooooooooo..'
    ]
  }
};

const Guns = {
  /* The order Q walks, and the order the box hands them over in: the three you
     fire, then the two you swing. */
  ORDER: ['dart', 'band', 'water', 'noodle', 'pack'],

  /* ---- state ----
     Ownership is in G.guns and saved (what you have, what is in hand, ammo, who
     you hit today). What is happening is here and unsaved. */
  shots: [],
  armed: false,      /* is it out */
  a: 0,              /* where it is pointing, radians, screen space */
  want: false,       /* is the trigger held */
  cool: 0, reloadT: 0, flash: 0, holster: 0, hint: 0,
  /* A swing in progress: time left, duration, starting bearing, who it caught
     (each person once per swing). */
  swingT: 0, swingFor: 0.3, swingA: 0, swingHit: null,
  /* Alternates every swing: forehand, backhand (the pose sheet's mirrored columns). */
  swingDir: 1,
  /* Seconds the arm takes to come back after a shot. */
  KICK_S: 0.13, kickT: 0,
  /* The eased lean: a per-frame smoothing fraction, since it is only drawn. */
  smooth: 0, EASE: 0.28,

  /* How far the shoulders may turn past the drawn row before the sprite faces
     the next one. The head is 25px above the hip, so beyond about a third of a
     radian a twist reads as falling over. */
  TWIST: 0.30,
  /* ---- the arm ----
     Every frame in the kit has both arms at the sides, and LPC's gun-holding
     rows are ShareAlike (not mixable with OGA-BY, LICENSE part 2). So the arm
     already drawn is cut out and turned at the shoulder: the player's own
     sleeve and hand, whatever they wear. Two canvas operations (a clip with a
     hole, and the same blit rotated), nothing read back. Coordinates are in the
     64x56 cell.

     Each entry is one arm:

       rect    the arm in the cell, [x0, y0, x1, y1] inclusive, along the seam
               the kit shades between sleeve and ribs.
       from    the shoulder joint inside it: the pivot.
       to      where the joint goes. Same as `from` front and back; side on,
               the only visible arm is the far one, carried to the near shoulder.
       hand    the fist's middle in the rect, where the grip goes.
       base    screen direction of the arm when the aim lies along the row.

     Front and back rows have two arms and the aim picks one; side rows have one. */
  ARM: [
    /* up    */ [
      { rect: [18, 31, 24, 42], from: [21, 32], to: [21, 32], hand: [21, 39], base: -Math.PI + 0.55 },
      { rect: [39, 31, 45, 42], from: [42, 32], to: [42, 32], hand: [42, 39], base: -0.55 }],
    /* left  */ [
      { rect: [36, 31, 43, 42], from: [39, 32], to: [28, 33], hand: [39, 39], base: Math.PI - 0.15 }],
    /* down  */ [
      { rect: [18, 31, 24, 42], from: [21, 32], to: [21, 32], hand: [21, 39], base: Math.PI - 0.62 },
      { rect: [39, 31, 45, 42], from: [42, 32], to: [42, 32], hand: [42, 39], base: 0.62 }],
    /* right */ [
      { rect: [20, 31, 27, 42], from: [24, 32], to: [35, 33], hand: [24, 39], base: 0.15 }],
  ],
  /* Where the arm points when it is hanging: down the screen. Everything in
     ARM is a rotation away from this. */
  ARM_REST: Math.PI / 2,

  /* ---- the hands in the combat frames ----
     The foam sword and compliance pack are held in LPC Revised's one-handed
     combat set (ready, forehand, backhand): the body plays the swing and the
     weapon is a layer in the hand. Each entry is the middle of an exposed-hand
     patch in that frame, measured in the 64x56 cell. Where both hands show, the
     one pointing most nearly along the weapon holds it. Facing away, the
     backhand's hidden middle frame uses the midpoint of its neighbours. */
  HANDS: [
    /* up    */ {
      ready: [[[42, 36]], [[43, 38]]],
      slash: [[[39, 38]], [[46, 31]], [[23, 35]]],
      backslash: [[[23, 35]], [[37, 32]], [[51, 29]]] },
    /* left  */ {
      ready: [[[21, 32], [33, 36]], [[20, 33], [32, 37]]],
      slash: [[[52, 29], [22, 32]], [[15, 31], [24, 36]], [[13, 30], [17, 37]]],
      backslash: [[[13, 30], [17, 37]], [[20, 34]], [[22, 31], [47, 33]]] },
    /* down  */ {
      ready: [[[23, 32], [32, 35]], [[23, 33], [32, 36]]],
      slash: [[[17, 23], [31, 36]], [[39, 31], [20, 34]], [[40, 27], [38, 39]]],
      backslash: [[[40, 27], [38, 39]], [[39, 29], [39, 38]], [[12, 28], [30, 33]]] },
    /* right */ {
      ready: [[[42, 32], [30, 36]], [[43, 33], [31, 37]]],
      slash: [[[11, 29], [41, 32]], [[48, 31], [40, 36]], [[50, 30], [46, 37]]],
      backslash: [[[50, 30], [46, 37]], [[43, 34]], [[41, 31], [16, 33]]] },
  ],
  /* The middle of a person, in the cell: where "which hand is further along
     the weapon" is measured from. */
  CHEST: [32, 30],
  /* Seconds per frame of the squared-up stance: quicker than a resting breath. */
  READY_S: 0.45,
  gripFor(dir, cycle, k, bearing) {
    const row = this.HANDS[dir] && this.HANDS[dir][cycle];
    const hands = row && row[Math.max(0, Math.min(row.length - 1, k))];
    if (!hands || !hands.length) return null;
    const cx = Math.cos(bearing), cy = Math.sin(bearing);
    let best = hands[0], score = -Infinity;
    for (const h of hands) {
      const dx = h[0] - this.CHEST[0], dy = h[1] - this.CHEST[1], m = Math.hypot(dx, dy) || 1;
      const sc = (dx * cx + dy * cy) / m;
      if (sc > score) { score = sc; best = h; }
    }
    return best;
  },
  /* The arm's share of the angle left after the row and the lean; the full
     residual would fold the arm across the chest. */
  ARM_K: 0.5,

  /* Pixels of wrist along the aim, past the hand. */
  REACH: 1,

  /* Shots travel on the ground plane (hit-tested like everything else) and are
     drawn this high. They start at the muzzle. */
  SHOT_Z: -11,
  /* Solids taller than this stop shots; desks, bins and chairs do not. */
  STOP_H: 24,

  /* ---- what you own ---- */
  state() {
    if (!G.guns) G.guns = { have: [], gun: null, ammo: {}, hit: {} };
    const g = G.guns;
    if (!Array.isArray(g.have)) g.have = [];
    if (!g.ammo) g.ammo = {};
    if (!g.hit) g.hit = {};
    return g;
  },
  have() { return this.state().have.filter(id => GUNS[id]); },
  any() { return this.have().length > 0; },
  id() {
    const g = this.state();
    if (g.gun && GUNS[g.gun] && g.have.indexOf(g.gun) >= 0) return g.gun;
    return this.have()[0] || null;
  },
  def() { return GUNS[this.id()] || null; },
  ammo() { const id = this.id(); return id ? (this.state().ammo[id] || 0) : 0; },

  give(id) {
    if (!GUNS[id]) return false;
    const g = this.state();
    if (g.have.indexOf(id) < 0) g.have.push(id);
    g.ammo[id] = GUNS[id].mag;
    /* The first gun picked up stays in hand; later pickups do not replace it. */
    if (!g.gun || !GUNS[g.gun] || g.have.indexOf(g.gun) < 0) g.gun = id;
    return true;
  },
  /* Put one of them in your hand by name. Refuses one you do not have, which
     is the only way this can be asked wrongly. */
  select(id) {
    if (!GUNS[id] || this.have().indexOf(id) < 0) { Sfx.deny(); return false; }
    this.state().gun = id;
    this.reloadT = 0; this.cool = 0.15;
    return true;
  },
  /* Q cycles the guns you have, in catalogue order. */
  next() {
    const list = this.ORDER.filter(k => this.have().indexOf(k) >= 0);
    if (list.length < 2) return false;
    const g = this.state();
    g.gun = list[(list.indexOf(this.id()) + 1) % list.length];
    this.reloadT = 0; this.cool = 0.2;
    const d = GUNS[g.gun];
    UI.toast(d.e, d.n + (d.melee ? '' : ' — ' + this.ammo() + '/' + d.mag));
    Sfx.blip();
    return true;
  },

  /* ---- may it be out at all ----
     One answer for keyboard, stick, update and renderer: not while anything
     takes the world away, and not while driving (the right stick is throttle). */
  can() {
    return G.state === 'play' && this.any()
      && !Cars.driving
      && !Dialogue.on && !Panels.on && !Arcade.on && !Combat.E;
  },

  arm(on) {
    on = !!on && this.can();
    if (on === this.armed) { if (on) this.holster = this.HOLSTER; return; }
    this.armed = on;
    this.want = false;
    this.holster = this.HOLSTER;
    /* Whatever the shoulders were doing when it went away is not where they
       are when it comes back out. */
    if (on) { this._dir = null; this.smooth = this.twist(this.a).lean; }
    if (on) {
      this.cool = Math.max(this.cool, 0.12);
      /* Drawn empty: start reloading now, since only firing would start it. */
      if (!this.melee() && this.ammo() <= 0) this.reload();
      Sfx.draw();
      /* Said once, in words for this device. */
      if (!G.flags.gunHint) {
        G.flags.gunHint = true;
        UI.toast(this.def().e, TOUCH
          ? 'The <b>' + this.def().n + '</b> is out. The stick on the ' + Hand.btnSide()
            + ' aims it, and it fires where you push it.'
          : '<b>' + this.def().n + '</b> out. The mouse or the arrow keys aim it, and it fires '
            + 'where you point. <b>R</b> reloads, <b>Q</b> swaps, <b>G</b> puts it away.');
      }
    } else {
      this.reloadT = 0;
    }
  },
  /* Seconds without aim before it is put away. Phones have no holster button:
     you let go of the stick. */
  HOLSTER: 2.6,
  toggle() { this.arm(!this.armed); },

  /* ---- pointing it ----
     `point` is a stick or arrow vector: aims and fires, twin-stick style.
     `at` is a map position (the mouse): aims only; the mouse has its own button. */
  point(dx, dy) {
    const m = Math.hypot(dx, dy);
    if (m < 0.001) { this.want = false; return; }
    this.arm(true);
    if (!this.armed) return;
    this.a = Math.atan2(dy, dx);
    this.holster = this.HOLSTER;
    /* Past half a push fires; below that it only turns you. */
    this.want = m > 0.52;
  },
  at(wx, wy) {
    if (!this.armed) return;
    this.a = Math.atan2(wy - (P.y + this.SHOT_Z), wx - P.x);
    this.holster = this.HOLSTER;
  },
  trigger(on) {
    if (on && !this.armed) this.arm(true);
    this.want = !!on && this.armed;
    if (this.want) this.holster = this.HOLSTER;
  },

  /* ---- the twist ----
     The renderer is told which row the legs use and which the torso uses, and
     the leftover angle becomes a lean (Sprites.twisted()). Anybody can be
     handed one: the player aims, and a colleague turns to see who hit them. */
  CARD: [-Math.PI / 2, Math.PI, Math.PI / 2, 0],
  /* Hysteresis before the shoulders change row, so an aim on a diagonal does not
     flicker (about eight degrees). */
  HYST: 0.14,
  twist(angle, sticky) {
    let dir = Sprites.dirOf(Math.cos(angle), Math.sin(angle));
    /* Keep the current row while the aim stays near it. Player only. */
    if (sticky && this._dir !== null && this._dir !== undefined && this._dir !== dir
        && Math.abs(this.off(angle, this._dir)) < Math.PI / 4 + this.HYST) dir = this._dir;
    if (sticky) this._dir = dir;
    let d = this.off(angle, dir);
    /* Facing the camera, a turn to the aimer's right leans to screen right; facing
       away it is reversed. Side rows take the residual as it comes. */
    if (dir === 2) d = -d;
    return { dir, lean: clamp(d, -this.TWIST, this.TWIST) };
  },
  /* The signed angle between a bearing and the cardinal a row faces. */
  off(angle, dir) {
    let d = angle - this.CARD[dir];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  _dir: null,
  /* ---- how far the feet may disagree ----
     The legs may be at most a quarter turn from the shoulders. Walking away
     from the aim, the feet take the aim's row and the walk plays in reverse:
     backing up while facing it. Standing still, the feet face the aim. */
  legs(tdir) {
    if (!P.moving) return { dir: tdir, back: false };
    const mv = P.dir ?? 2;
    if ((mv + 2) % 4 === tdir) return { dir: tdir, back: true };
    return { dir: mv, back: false };
  },
  /* ---- which arm, and how far round ----
     The last of the angle goes into the shoulder. `armAim` is the aim, or the
     sweep during a swing, so the arm carries the weapon round. The arm is picked
     by the aim either way, so it never switches sides mid-swing. `turn` has the
     lean subtracted, since that blit already happens inside the twist. */
  armAim() {
    const d = this.def();
    const base = (d && d.melee && this.swingT > 0) ? this.sweep() : this.a;
    return base + this.tilt(base);
  },
  /* ---- the arm does the kick and the reload ----
     As in LPC gun sheets, recoil lifts the arms and the gun with them; a gun
     rising alone from a still fist looks loose. The reload drops the muzzle:
     down fast, held, up again (sin(πp) clipped flat). Both turn towards a
     screen direction, so they read the same whichever way you aim. */
  RELOAD_DIP: 0.75,
  tilt(base) {
    const d = this.def();
    if (!d) return 0;
    const toward = (to, amt) => {
      if (amt <= 0) return 0;
      const o = this.wrap(to - base);
      return Math.sign(o || 1) * Math.min(Math.abs(o), amt);
    };
    const up = this.kickT > 0 ? (this.kickT / this.KICK_S) * 0.09 * (d.kick || 1) : 0;
    let down = 0;
    if (!d.melee && this.reloadT > 0 && d.reload) {
      const p = 1 - this.reloadT / d.reload;
      down = Math.min(1, Math.sin(Math.PI * clamp(p, 0, 1)) * 1.6) * this.RELOAD_DIP;
    }
    return toward(-Math.PI / 2, up) + toward(Math.PI / 2, down);
  },
  wrap(d) {
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  armFor(dir, lean) {
    const row = this.ARM[dir];
    if (!row) return null;
    const s = row.length > 1 ? row[Math.cos(this.a) < 0 ? 0 : 1] : row[0];
    const aim = this.armAim();
    const turn = s.base + this.off(aim, dir) * this.ARM_K
      - this.ARM_REST - lean;
    const co = Math.cos(turn), si = Math.sin(turn);
    const hx = s.hand[0] - s.from[0], hy = s.hand[1] - s.from[1];
    /* The fist's position in the cell after the turn; hand() takes it to screen. */
    const hand = [s.to[0] + hx * co - hy * si, s.to[1] + hx * si + hy * co];
    return { rect: s.rect, from: s.from, to: s.to, turn, hand, support: this.supportFor(row, s, hand, aim, lean) };
  },
  /* ---- the other hand ----
     The off hand under the barrel, for `hands: 2`, on front and back rows only
     (side on, the far arm is hidden). The same cut-and-turn, pointed at the
     gun's `fore`, in cell space before the lean. Across the body it reaches
     towards the grip rather than onto it: a forearm across the belt. */
  supportFor(row, s, hand, aim, lean) {
    const d = this.def();
    if (row.length < 2 || !d || d.hands !== 2 || !d.art || !d.art.fore || this.reloadT > 0) return null;
    const o = row[0] === s ? row[1] : row[0];
    const flip = Math.abs(this.wrap(aim)) > Math.PI / 2;
    const fx = d.art.fore[0] - d.art.pivot[0];
    const fy = (d.art.fore[1] - d.art.pivot[1]) * (flip ? -1 : 1);
    const a = aim - lean, c = Math.cos(a), si = Math.sin(a);
    const tx = hand[0] + fx * c - fy * si, ty = hand[1] + fx * si + fy * c;
    const hx = o.hand[0] - o.from[0], hy = o.hand[1] - o.from[1];
    return {
      rect: o.rect, from: o.from, to: o.to,
      turn: Math.atan2(ty - o.to[1], tx - o.to[0]) - Math.atan2(hy, hx)
    };
  },

  /* The player's pose: shoulder row, lean, arm, and the feet as a side effect.
     Null with nothing in hand (a single blit). Writes P.dir, so everything
     asking which way the player faces gets one answer. */
  pose() {
    if (!this.armed) return null;
    const t = this.twist(this.a, true);
    t.lean = this.smooth = this.smooth + (t.lean - this.smooth) * this.EASE;
    /* The standing frame in the shoulders' direction, frozen while the legs move:
       the arm rect is measured on this frame, and the run pose moves the arm
       halfway across the cell. The breath keeps it alive. */
    t.frame = 0;
    t.arm = this.armFor(t.dir, t.lean);
    /* ---- the things you swing ----
       Squared up while out, the kit's forehand or backhand while swinging
       (swingDir alternates). The frame draws the arm; the weapon goes in the
       leading hand. A sheet without combat frames uses the turned arm. */
    const r = Sprites.at('player'), m = r && r.sheet, d = this.def();
    if (d && d.melee && m && m.ready && m.slash && m.backslash) {
      let cycle, k;
      if (this.swingT > 0) {
        cycle = this.swingDir > 0 ? 'slash' : 'backslash';
        const p = 1 - this.swingT / (this.swingFor || 1);
        k = Math.min(m[cycle].length - 1, Math.floor(p * m[cycle].length));
      } else {
        cycle = 'ready';
        k = R.animate ? Math.floor(R.t / this.READY_S) % m.ready.length : 0;
      }
      t.frame = m[cycle][k];
      t.arm = null;
      t.grip = this.gripFor(t.dir, cycle, k, this.armAim());
      /* Standing still, the legs are the stance's legs as well: the whole
         frame, feet apart. Walking, the walk carries on underneath. */
      t.legFrame = t.frame;
    }
    /* One pixel of breath while nothing else moves the top half. */
    t.lift = (t.grip || this.swingT > 0 || this.kickT > 0 || !R.animate)
      ? 0 : Sprites.breathLift('player');
    const l = this.legs(t.dir);
    P.dir = l.dir; this.back = l.back;
    /* Both halves the same drawing (standing, or walking where you aim): no cut. */
    t.whole = l.dir === t.dir;
    this._pose = t;
    return t;
  },
  /* Whether the walk is playing backwards this frame. Set by pose(), read by
     the renderer one line later. */
  back: false,

  /* ---- where the hand is, in the world ----
     The same transform Sprites.twisted() applies (rotate about the waist, then
     the shoulder shift), so the grip stays in the hand at every lean. */
  hand(x, y, ang) {
    const t = this._pose;
    const r = Sprites.at('player');
    if (!t || !(t.arm || t.grip) || !r) return { x: x + Math.cos(ang) * 10, y: y - 15 };
    const m = r.sheet, b = Sprites.box('player', x, y);
    /* A turned arm's fist, or the hand the combat frame drew. */
    const h = t.grip || t.arm.hand;
    const waist = Sprites.waistOf(m);
    const px = b.x + m.fw / 2, py = b.y + waist;
    const sh = Math.round(Math.sin(t.lean) * 3);
    const dx = (b.x + h[0]) - px + sh, dy = (b.y + h[1]) - py;
    const co = Math.cos(t.lean), si = Math.sin(t.lean);
    return {
      x: px + dx * co - dy * si + Math.cos(ang) * this.REACH,
      y: py + dx * si + dy * co + Math.sin(ang) * this.REACH
    };
  },

  /* Somebody else's: they have `watch` set to a bearing and a moment to hold
     it for. Set by a dart landing on them. */
  watchOf(who) {
    if (!who || !who.watch || who.watch.till < R.t) return null;
    return this.twist(who.watch.a);
  },
  watch(who, x, y, secs) {
    if (!who) return;
    who.watch = { a: Math.atan2(y - who.y, x - who.x), till: R.t + (secs || 2.2) };
  },

  /* ---- firing, and swinging ---- */
  melee() { const d = this.def(); return !!(d && d.melee); },
  ready() {
    const d = this.def();
    if (!d || !this.armed || this.cool > 0) return false;
    /* Nothing to be out of, and nothing to put back in. */
    if (d.melee) return this.swingT <= 0;
    return this.reloadT <= 0 && this.ammo() > 0;
  },
  /* The one thing the trigger does, whichever of the five is in your hand. */
  pull() { if (this.melee()) this.swing(); else this.shoot(); },
  reload() {
    const d = this.def(); if (!d || d.melee || !this.armed) return false;
    if (this.reloadT > 0 || this.ammo() >= d.mag) return false;
    this.reloadT = d.reload;
    Sfx.reload();
    return true;
  },
  fill() {
    const id = this.id(); if (!id) return;
    this.state().ammo[id] = GUNS[id].mag;
    UI.hudDirty();
  },
  shoot() {
    const d = this.def(); if (!d) return;
    const g = this.state(), id = this.id();
    g.ammo[id] = Math.max(0, (g.ammo[id] || 0) - 1);
    this.cool = 1 / d.rate;
    this.flash = 0.06;
    this.kickT = this.KICK_S;
    const a = this.a + rnd(-d.spread, d.spread);
    const sp = d.speed * TILE;
    /* Out of the barrel. The muzzle's offset splits into distance ahead (projected
       onto the aim, on the ground plane) and height (carried on the shot), so the
       shot leaves the barrel it is drawn from. */
    const m = this.muzzleAt(a);
    const reach = clamp((m.x - P.x) * Math.cos(a) + (m.y - (P.y + this.SHOT_Z)) * Math.sin(a), 12, 22);
    const sx = P.x + Math.cos(a) * reach, sy = P.y + Math.sin(a) * reach;
    this.shots.push({
      x: sx, y: sy, z: clamp(m.y - sy, -30, 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a,
      left: d.range * TILE, gun: id, t: 0
    });
    if (d.kick) FX.shake(d.kick);
    /* A puff after the flash: the spring's breath. Not for water, whose shot is a
       puff. */
    if (id !== 'water' && FX.motion) {
      for (let i = 0; i < 2; i++) {
        FX.parts.push({ x: m.x + Math.cos(a) * 3, y: m.y + Math.sin(a) * 3,
          vx: Math.cos(a) * 18 + rnd(-8, 8), vy: Math.sin(a) * 18 - rnd(40, 60),
          t: 0, life: rnd(.2, .34), c: 'rgba(220,226,236,.7)', sz: 2 });
      }
    }
    Sfx.gun(id);
    /* Empty is a click, then an automatic reload: no fourth control on a phone. */
    if (!g.ammo[id]) this.reload();
    UI.hudDirty();
  },

  /* ---- the swing ----
     A sweep: the weapon follows the sweep's bearing and anybody it passes within
     reach is caught as it goes, tested per frame, so the arc reaches one side
     before the other. */
  swing() {
    const d = this.def(); if (!d || !d.melee) return;
    this.swingT = this.swingFor = d.swing;
    this.swingA = this.a;
    this.swingDir = -this.swingDir;
    this.swingHit = new Set();
    this.cool = 1 / d.rate;
    if (d.kick) FX.shake(d.kick);
    Sfx.swing(this.id());
    UI.hudDirty();
  },
  /* The bearing this instant: from a − arc/2 to a + arc/2 as t runs 0 → 1. */
  sweep() {
    const d = this.def();
    if (!d || !d.melee || this.swingT <= 0) return this.a;
    const t = 1 - this.swingT / (this.swingFor || 1);
    return this.swingA + (t - 0.5) * d.arc * this.swingDir;
  },
  /* Who the blade covers this frame. It has a width, or a fast sweep would pass
     between frames. */
  BLADE: 0.42,
  swept(dt) {
    const d = this.def(); if (!d || !d.melee || this.swingT <= 0) return;
    const sa = this.sweep(), r = d.reach * TILE;
    const test = (o, kind) => {
      if (this.swingHit.has(o)) return;
      const dx = o.x - P.x, dy = o.y - P.y;
      if (Math.hypot(dx, dy) > r) return;
      let df = Math.atan2(dy, dx) - sa;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      if (Math.abs(df) > this.BLADE) return;
      /* No hitting through walls: the dart's test, at mid-reach. */
      if (this.stopped(P.x + Math.cos(sa) * r * 0.6, P.y + Math.sin(sa) * r * 0.6)) return;
      this.swingHit.add(o);
      this.land(this.id(), o, kind, o.x, o.y - 6);
    };
    NPCM.list.forEach(n => test(n, 'npc'));
    Peds.list().forEach(q => test(q, 'ped'));
  },

  /* The barrel's end in drawn pixels: the hand plus the muzzle offset turned
     through the aim, as paint() draws it. */
  muzzleAt(ang, id) {
    const art = this.art(id || this.id());
    const h = this.hand(P.x, P.y, ang);
    if (!art) return h;
    const mx = art.muzzle[0] - art.pivot[0];
    /* Mirrored past the vertical, exactly as the drawing is. */
    const my = (art.muzzle[1] - art.pivot[1]) * (Math.abs(ang) > Math.PI / 2 ? -1 : 1);
    const c = Math.cos(ang), s = Math.sin(ang);
    return { x: h.x + mx * c - my * s, y: h.y + mx * s + my * c };
  },

  /* ---- what is in the way ----
     Walls and solids taller than a desk. Not Collide.free(), which is a foot
     box stopped by bins and chairs that a dart sails over. */
  stopped(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return true;
    if (World.solid[ty][tx]) return true;
    const here = World.at(tx, ty);
    for (let i = 0; i < here.length; i++) {
      const o = here[i];
      if (!o.solid) continue;
      const f = o.fdef || FURN[o.kind] || {};
      if (f.mount === 'surface') continue;      /* it is standing on a worktop */
      if ((f.size || TILE) >= this.STOP_H) return true;
    }
    return false;
  },

  /* ---- the frame ---- */
  update(dt) {
    if (!this.can() && this.armed) this.arm(false);
    if (this.flash > 0) this.flash -= dt;
    if (this.kickT > 0) this.kickT = Math.max(0, this.kickT - dt);
    if (this.armed) {
      if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) { this.reloadT = 0; this.fill(); }
      if (this.cool > 0) this.cool -= dt;
      if (this.want && this.ready()) this.pull();
      /* A swing is stepped: the arc advances, and whoever it reaches is hit now. */
      if (this.swingT > 0) { this.swept(dt); this.swingT = Math.max(0, this.swingT - dt); }
      /* No aim for a while: put it away. Only runs out when truly idle. */
      if ((this.holster -= dt) <= 0) this.arm(false);
    }
    this.step(dt);
    this.hud();
  },

  /* Projectiles, stepped in pieces no longer than a third of a tile so fast
     darts cannot pass through people or walls. */
  step(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const dist = Math.hypot(s.vx, s.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / (TILE / 3)));
      let gone = false;
      for (let k = 0; k < steps && !gone; k++) {
        s.x += s.vx * dt / steps; s.y += s.vy * dt / steps;
        s.left -= dist / steps;
        if (this.stopped(s.x, s.y)) { this.splat(s, null); gone = true; break; }
        const who = this.whoIsThere(s);
        if (who) { this.splat(s, who.o); this.land(s.gun, who.o, who.kind, s.x, s.y + (s.z || this.SHOT_Z)); gone = true; break; }
        if (s.left <= 0) { this.splat(s, null); gone = true; }
      }
      if (gone) this.shots.splice(i, 1);
    }
  },
  /* Everybody a shot could be touching, in the order the game already draws
     them: the twenty colleagues, then whoever is walking past outside. */
  whoIsThere(s) {
    const r = TILE * 0.42;
    if (typeof NPCM !== 'undefined' && NPCM.list) {
      for (const n of NPCM.list) {
        if (Math.abs(n.x - s.x) < r && Math.abs(n.y - s.y) < r) return { o: n, kind: 'npc' };
      }
    }
    if (typeof Peds !== 'undefined') {
      for (const p of Peds.list()) {
        if (Math.abs(p.x - s.x) < r && Math.abs(p.y - s.y) < r) return { o: p, kind: 'ped' };
      }
    }
    return null;
  },

  /* ---- and what everybody does about it ---- */
  /* What people say when hit, per weapon: TEXT's `hit.<id>` and `hit.ped`. */
  get NPC_LINES() { const o = {}; Object.keys(GUNS).forEach(k => { o[k] = says('hit.' + k); }); return o; },
  get PED_LINES() { return says('hit.ped'); },

  /* One person hit by any weapon; the same whether thrown or swung. */
  land(id, who, kind, x, y) {
    const d = GUNS[id] || GUNS.dart;
    FX.parts.push(...this.spray(x, y, d.melee ? 4 : 3, d.melee ? '#ffe27a' : d.shot.body));
    if (d.melee) Sfx.bonk(); 
    FX.burst(who.x, who.y - 18, d.e, 3, d.melee ? '#ffd166' : d.shot.body);
    /* They turn to face the attacker, torso first (the same twist). */
    this.watch(who, P.x, P.y, 2.6);
    if (kind === 'ped') {
      if (who.sayT <= 0) { who.say = pick(this.PED_LINES); who.sayT = 2.4; }
      return;
    }
    who.stunTimer = Math.max(who.stunTimer || 0, 0.9);
    if (who.sayT <= 0) { who.say = pick(this.NPC_LINES[id] || this.NPC_LINES.dart); who.sayT = 3.2; }
    Faces.flash(who.id, id === 'band' || id === 'pack' ? 'anger' : 'shock', 1.6);
    /* Every hit moves their mood (`soaked` in data/minds.js); the grudge below is
       once a shift. */
    Mind.event(who.id, 'soaked');
    /* A cost once per person per shift, so repeated hits are one grudge. */
    const hit = this.state().hit;
    if (!hit[who.id]) {
      hit[who.id] = true;
      Rel.add(who.id, -1);
      P.stats.chaos = (P.stats.chaos || 0) + 0.5;
      const n = Object.keys(hit).length;
      if (n >= 5) Ach.get('a_foamwar');
    }
  },
  /* The end of a shot, wherever it ended. A dart bounces and lies there for a
     moment, water goes everywhere, a band simply stops existing. */
  splat(s, who) {
    const d = GUNS[s.gun] || GUNS.dart;
    const x = s.x, y = s.y + (s.z === undefined ? this.SHOT_Z : s.z);
    if (s.gun === 'water') { FX.parts.push(...this.spray(x, y, 5, d.shot.body)); Sfx.splat(); }
    else { FX.parts.push(...this.spray(x, y, 3, d.shot.body)); Sfx.plink(); }
    /* A shot stopping at a wall or at a person makes the same puff; land() does the
       rest. */
  },
  spray(x, y, n, colour) {
    const out = [];
    /* These bypass FX.burst(), so they check Motion themselves. */
    if (!FX.motion) return out;
    for (let i = 0; i < n; i++) {
      out.push({ x, y, vx: rnd(-40, 40), vy: rnd(-50, 10), t: 0, life: rnd(.25, .5), c: colour, sz: 3 });
    }
    return out;
  },

  /* ---- the picture ----
     Baked once per gun at 1:1: a character grid to pixels. `.` and any character
     not in the palette are transparent. */
  art(id) {
    this._art = this._art || new Map();
    const had = this._art.get(id);
    if (had) return had;
    const a = GUNS[id] && GUNS[id].art;
    if (!a) return null;
    const w = a.px[0].length, h = a.px.length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = a.px[y];
      for (let x = 0; x < row.length; x++) {
        const col = a.pal[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    const out = { cv, w, h, pivot: a.pivot, muzzle: a.muzzle };
    this._art.set(id, out);
    return out;
  },

  /* One gun, in one pair of hands; `x, y` is where the person stands. Mirrored
     rather than rotated past vertical, so the grip stays under the hand. */
  paint(c, x, y, ang, id, out) {
    const art = this.art(id || this.id());
    if (!art) return;
    const flip = Math.abs(ang) > Math.PI / 2;
    /* The grip goes in the hand — see hand() — and `out` is the extra reach a
       swing puts on top of it, because an arm straightens through one. */
    const h = this.hand(x, y, ang);
    const ax = h.x + (out || 0) * Math.cos(ang);
    const ay = h.y + (out || 0) * Math.sin(ang);
    /* ---- the kick ----
       A couple of pixels back along the barrel, over an eighth of a second. The
       rise is in tilt(), on the arm. */
    const d = GUNS[id || this.id()] || {};
    const k = this.kickT > 0 ? this.kickT / this.KICK_S : 0;
    /* `kick` scales both the shake and this. */
    const back = k * (d.kick || 1) * 2.2;
    const sm = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    c.save();
    c.translate(Math.round(ax - Math.cos(ang) * back), Math.round(ay - Math.sin(ang) * back));
    c.rotate(ang);
    if (flip) c.scale(1, -1);
    c.drawImage(art.cv, -art.pivot[0], -art.pivot[1]);
    /* The flash, drawn in the muzzle's own frame. */
    if (this.flash > 0 && this.armed) {
      c.globalAlpha = clamp(this.flash / 0.06, 0, 1);
      c.fillStyle = d && d.shot ? d.shot.tip : '#ffe27a';
      c.fillRect(art.muzzle[0], art.muzzle[1] - 1, 4, 3);
      c.fillRect(art.muzzle[0] + 2, art.muzzle[1] - 2, 2, 5);
      c.globalAlpha = 1;
    }
    c.restore();
    c.imageSmoothingEnabled = sm;
  },
  /* Whatever is in hand, at the aim or the swing's sweep. The renderer calls
     this, so a swing is the same one line as a gun. */
  held(c, x, y) {
    if (!this.armed) return;
    const d = this.def();
    if (d && d.melee && this.swingT > 0) {
      const t = 1 - this.swingT / (this.swingFor || 1);
      /* A two-pixel follow-through at mid-arc; the arm in the art does not
         straighten, so the swing lives in the arc. */
      this.paint(c, x, y, this.armAim(), null, Math.sin(t * Math.PI) * 2);
      return;
    }
    this.paint(c, x, y, this.armAim());
  },
  /* Projectiles as pixels: a dart is a small angled rectangle. */
  paintShots(c) {
    for (const s of this.shots) {
      const d = GUNS[s.gun] || GUNS.dart, sh = d.shot;
      const x = s.x, y = s.y + (s.z === undefined ? this.SHOT_Z : s.z);
      c.save();
      c.translate(x, y);
      c.rotate(s.a);
      if (sh.trail) {
        c.globalAlpha = 0.35; c.fillStyle = sh.body;
        c.fillRect(-sh.len - sh.trail, -sh.w / 2 + 0.5, sh.trail, 1);
        c.globalAlpha = 1;
      }
      c.fillStyle = sh.body;
      c.fillRect(-sh.len / 2, -sh.w / 2, sh.len, sh.w);
      c.fillStyle = sh.tip;
      c.fillRect(sh.len / 2 - 2, -sh.w / 2, 2, sh.w);
      c.restore();
    }
  },

  /* ---- the readout ----
     What is in hand and what is left, while it is out. */
  hud() {
    const el = $('#gunHud');
    if (!el) return;
    const on = this.armed && this.can();
    /* Rewritten only on change: it runs every frame. */
    const d = on ? this.def() : null;
    const sig = on ? this.id() + ':' + (d.melee ? '' : this.ammo()) + ':' + (this.reloadT > 0 ? 'r' : '') : '';
    if (sig === this._hudSig) return;
    this._hudSig = sig;
    el.hidden = !on;
    if (!on) return;
    /* A swung thing has nothing to count. */
    let right = 'swing';
    if (!d.melee) {
      const n = this.ammo();
      right = '';
      for (let i = 0; i < Math.min(d.mag, 12); i++) right += i < n ? '▮' : '▯';
      if (d.mag > 12) right = n + '/' + d.mag;
    }
    el.innerHTML = '<span class="gh-e">' + d.e + '</span><span class="gh-n">' + esc(d.n) + '</span>'
      + '<span class="gh-a' + (this.reloadT > 0 ? ' rl' : '') + '">'
      + (this.reloadT > 0 ? 'reloading' : right) + '</span>';
  },

  /* A level swap, a save being loaded, a shift ending: the things in the air
     belong to the room they were fired in. */
  clear() {
    this.shots.length = 0;
    this.armed = false; this.want = false; this.reloadT = 0; this.cool = 0;
    this.swingT = 0; this.swingHit = null; this.kickT = 0; this._dir = null; this.smooth = 0;
  }
};
