'use strict';
/* ---------------- The guns ----------------

   The game is called Call of Duty: Customer Service and for eleven months the
   only thing in it you could point at anybody was a policy. This is the rest of
   the joke: there ARE guns in this building, and they are the guns an office
   actually has — a foam dart blaster, a water pistol and a thing somebody made
   out of a post tray and four elastic bands — all three of them from the box
   Marketing brought back from the 2019 away day and nobody has opened since.
   Nothing in here hurts anybody. What it does is make twenty adults turn round,
   which is the only ammunition this game has ever had.

   ---- THEY ARE DRAWN, NOT FETCHED ----

   Every gun below is a picture written out in the source: a grid of characters
   and a palette to look them up in. That is the same decision the cars made and
   it is made for the same two reasons. The first is the licence — every pixel
   in art/ is third-party, fetched and licence-checked by the sprite build, and
   the kit this game pins is mediaeval-through-Victorian: there is no blaster in
   it and there was never going to be one. The second is rotation. A twin-stick
   game aims through every angle, not through the eight a sprite sheet would
   give it, so the art has to be something that can be turned — and a bitmap
   baked once at 1:1 and rotated about its grip is exactly that.

   Read the arrays. They are pictures. That is the point of writing them this
   way: moving the trigger guard is moving a `g`.

   ---- WHAT A GUN IS ----

     n, e, d       what it is called, its emoji, and what it is when you look
                   at it in the inventory.
     mag, reload   how many, and how long the fumbling takes.
     rate          shots per second, held down.
     speed, range  tiles per second, and how many tiles before it is spent.
     spread        radians of inaccuracy per shot. A water pistol has a lot.
     kick          pixels of screen shake.
     shot          how the thing in the air is drawn.
     hands         2 for the one you hold like you mean it. The second arm goes
                   to `fore` on the art, the way every two-handed LPC shooting
                   sheet has the off hand under the barrel.
     art           the picture, facing right, with its grip and muzzle marked.

   The binding to the thing in your pocket runs the OTHER way, from data: an
   entry in ITEMS carries a `gun:` naming its key here, and that is the whole
   of it — see Item.give(). Nothing in this file has to keep a second list of
   what the player is carrying.

   Everything else — the aiming, the firing, the flying and the reacting — is
   one object below, because there is exactly one of these in the world at a
   time and it is in the player's hands. */

const GUNS = {
  /* Orange, enormous, and the only one of the three that came out of a box
     with a brand on it. Six darts, a proper clunk, and slow enough across a
     room that you can watch one go. */
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
  /* From the same box, still with a 2019 price sticker on the tank. It holds
     forty and it carries about three tiles, which is the whole personality. */
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

/* ---- and the two things you swing ----
   Melee is in the same table, on the same controls, drawn by the same code,
   because it is the same thing: something in your hands, pointed where the
   right stick is pointed. A `melee` block instead of a magazine is the whole
   of the difference — no ammo, no reload, and an ARC swept through the aim
   rather than a thing sent down it.

     arc      radians swept, centred on the aim.
     reach    tiles, from the middle of you to the middle of them.
     swing    seconds the sweep takes. The pose is two frames; this is how
              long they last.
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
     What is OWNED is in G.guns and is saved: which ones you have, which is in
     your hand, how much is left in each, and who you have already hit today.
     What is HAPPENING is here and is not saved — coming back to a shift with
     the gun still up and the trigger still held would be a strange way to
     rejoin an office. */
  shots: [],
  armed: false,      /* is it out */
  a: 0,              /* where it is pointing, radians, screen space */
  want: false,       /* is the trigger held */
  cool: 0, reloadT: 0, flash: 0, holster: 0, hint: 0,
  /* A swing in progress: how much of it is left, how long it was, which
     bearing it started from, and who it has already caught. A swing hits
     each person once however long the arc dwells on them. */
  swingT: 0, swingFor: 0.3, swingA: 0, swingHit: null,
  /* Which way round the next swing goes. Flipped by every swing, so holding
     the trigger is a forehand, then a backhand, then a forehand — which is
     what the mirrored columns of the pose sheet are for. */
  swingDir: 1,
  /* How long after a shot the arm is still coming back.
     an eighth of a second: long enough to see at sixty frames and short enough
     that the third dart of a magazine is not fired out of a pose left over
     from the first. */
  KICK_S: 0.13, kickT: 0,
  /* The eased lean, and how fast it catches up. A fraction per frame rather
     than a rate per second on purpose: it is a smoothing filter on something
     that is only ever drawn, not a thing in the world with a speed. */
  smooth: 0, EASE: 0.28,

  /* How far the shoulders may turn past the direction the sprite is drawn
     facing before the sprite gives up and faces the other way. Four rows of
     art and any angle of aim: the difference between the two is taken up at
     the waist, and this is the cap on it. The head is twenty-five pixels above
     the hip, so every tenth of a radian moves it two and a half pixels
     sideways — which on a body fourteen pixels wide is a great deal further
     than it sounds, and past about a third of a radian a person stops reading
     as twisting and starts reading as falling over. */
  TWIST: 0.30,
  /* ---- THE ARM ----

     THE PROBLEM. Four rows of art, and in every frame of every one of them
     both arms hang at the sides. There is no pose in this kit where anybody
     is holding a GUN up. LPC Revised's combat set — squared up, a forehand, a
     backhand — is in the people now (see HANDS below, which is what the two
     things you SWING use), and it is a set for a sword: the one frame with
     the arm held straight out is the middle of a lunging punch. The universal
     spritesheet's `shoot` row — the bow draw most LPC games with guns put a
     rifle over — is on a different body under a ShareAlike licence this
     project will not mix into OGA-BY art (see LICENSE part 2). So a blaster drawn at the end of the arm
     the kit gives you is a blaster floating beside a man standing to
     attention, and facing away it is a blaster nothing on the screen is
     holding.

     THE ANSWER IS THE ARM THE KIT ALREADY DREW, TURNED AT THE SHOULDER. Cut
     the arm out of the frame — it is a rectangle, seven pixels by twelve, and
     the kit separates it from the torso with a line of its own shading — and
     blit that same rectangle back rotated about the shoulder joint. It is the
     player's OWN sleeve and the player's OWN hand, because it is their own
     frame: whatever shirt they chose, whatever skin they chose, at whatever
     moment of the walk cycle they are on. Nothing is recoloured, nothing is
     invented, and a shirt added to the creator tomorrow gets an arm for free.

     That is paper-doll animation and it is as old as animation. What makes it
     affordable here is that it is two canvas operations: a clip with a hole in
     it so the arm does not also hang where it used to, and the same blit again
     inside a rotation. No pixel is ever read back, which matters because this
     game opens from file:// and a canvas that has had a sprite drawn on it
     cannot be read from there at all.

     Every coordinate below is in the 64x56 cell the people are drawn in —
     thirteen pixels right of where they were when the cell was 38 wide, which
     is the whole of that change as far as this table is concerned.

     EACH ENTRY IS ONE ARM:

       rect    the arm in the cell, [x0, y0, x1, y1] inclusive. Measured off
               the composed frame: the kit shades a seam between the sleeve
               and the ribs, so the cut follows a line that is already drawn.
       from    the shoulder joint inside that rectangle — what it turns about.
       to      where that joint goes. The same point for the front and back
               rows, where the arm is already on the shoulder it belongs to.
               NOT the same for the side rows, where the only arm the kit
               leaves visible is the FAR one, swung out behind the back: it is
               carried across to the near shoulder on the way, which is the
               difference between an arm reaching forward and a hand stuck to
               somebody's chest.
       hand    the middle of the fist in that rectangle. Where the grip goes,
               once the rotation has taken it wherever it takes it.
       base    where the arm points, on the screen, when the aim is straight
               along the row. Down and out on the front row, up and out on the
               back one, forward on the two side rows.

     Two arms on the front and back rows and the aim picks which — front on, a
     blaster held out to the right is in the right hand. One on the side rows,
     because there is only one arm to have. */
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

  /* ---- THE HANDS IN THE COMBAT FRAMES ----
     The foam sword and the compliance pack are not held on a turned arm: they
     are held in LPC Revised's own one-handed combat set, which the people are
     built with — squared up while it is out, a forehand, a backhand. That is
     how every LPC game with a sword does it: the body plays the swing and the
     weapon is a layer in the hand. The frames draw the arm; all this has to
     know is where the hand IS in each of them.

     Measured, not placed: in a composed person the only body pixels left
     showing below the head are the hands, so each entry is the middle of one
     patch of exposed skin in that frame, in the 64x56 cell. Both builds agree
     to the pixel. Where both hands show, both are listed and the one that
     points most nearly along the weapon at that instant is the one holding it
     — a forehand swaps hands across the body and a backhand swaps them back,
     and choosing by bearing gets that right without anybody labelling it.
     Facing away, the backhand's middle frame has its hand behind the body
     entirely; that one is the midpoint of its neighbours. */
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
  /* How long a squared-up stance holds each of its two frames: a breath, a
     little quicker than a standing one, because somebody holding a foam sword
     at a colleague is not relaxed. */
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
  /* HOW MUCH OF THE LEFTOVER ANGLE THE ARM TAKES. The row is chosen first and
     takes the cardinal; the lean takes a third of a radian of what is left;
     this takes half of it again, and the rest is simply the difference between
     a shoulder and a wrist. A whole shoulder is more than one: swing the arm
     through the full residual and aiming at the near corner of the room folds
     it across the chest. */
  ARM_K: 0.5,

  /* A couple of pixels of reach along the aim, on top of the hand: a wrist,
     on the end of the arm the shoulder has just moved. Two, and not more —
     every pixel of this is a pixel of daylight between a grip and the fist
     holding it. */
  REACH: 1,

  /* How high a shot is drawn. It travels on the GROUND plane like everything
     else in this game — that is what lets it be tested against people and
     walls with the same arithmetic everything else uses — and is drawn eleven
     pixels up, which is where a chest is. Where it is born is not a constant
     any more: it is the muzzle, wherever the pose has put that. */
  SHOT_Z: -11,
  /* Taller than a desk. A dart goes over a desk, a worktop, a bin and a chair,
     because it is thrown at chest height and those are not chest height; it
     stops at a wall, a cabinet, a vending machine and a shut door. The drawn
     size is the only height this game has ever had, and it turns out to be
     enough to answer the question. */
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
    /* The first one you pick up is the one in your hand, and the second and
       third do not take it off you. Taking all three out of the away-day box
       is three calls to this in one line, and the last of them used to win —
       so opening the box left you holding the water pistol, which is the
       third-funniest of the three and not the one anybody reached for. */
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
  /* Walk the ones you actually have, in catalogue order, so Q is the same
     three in the same order every time rather than the order you found them. */
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
     One question, asked by everything: the keyboard, the stick, the update and
     the renderer. A gun is a thing you are holding in the world, so anything
     that takes the world away takes it with them — and that includes being
     behind a wheel, where both hands are already spoken for and where the
     right-hand stick is the throttle. */
  can() {
    return G.state === 'play' && this.any()
      && !(typeof Cars !== 'undefined' && Cars.driving)
      && !Dialogue.on && !Panels.on && !Arcade.on && !(typeof Combat !== 'undefined' && Combat.E);
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
      /* Out with nothing in it is out with nothing in it: start the fumbling
         now rather than on a trigger pull that cannot happen. Without this, a
         gun put away halfway through a reload — which is what letting go of
         the stick with an empty magazine does — came back out empty for ever,
         because reloading is only ever started by firing. */
      if (!this.melee() && this.ammo() <= 0) this.reload();
      Sfx.draw();
      /* Said once, the first time, and said in whichever words this device
         deserves — the same rule every other instruction in this game follows. */
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
  /* Seconds of nobody touching the aim before it goes back in your pocket. It
     exists for the thumb: on a phone there is no "holster" button and there
     should not be one — you let go of the stick, and a moment later you are
     somebody walking through an office again. */
  HOLSTER: 2.6,
  toggle() { this.arm(!this.armed); },

  /* ---- pointing it ----
     Two ways in, and they mean slightly different things. `point` is a vector
     from a stick or a pair of arrow keys: it aims AND it pulls the trigger,
     which is what a twin-stick right hand does. `at` is a place on the map —
     the mouse — which aims and nothing else, because a mouse has its own
     button and taking the click away from it would be rude. */
  point(dx, dy) {
    const m = Math.hypot(dx, dy);
    if (m < 0.001) { this.want = false; return; }
    this.arm(true);
    if (!this.armed) return;
    this.a = Math.atan2(dy, dx);
    this.holster = this.HOLSTER;
    /* Past half a push is a shot. Below it you are turning to face something,
       which is a thing people do with a gun in their hand and which should not
       cost a dart. */
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
     The one piece of this that everybody in the building gets and not just the
     person holding the gun. A sprite sheet has four directions; an aim has
     every angle; a person resolves the difference by turning their shoulders
     and leaving their feet where they are. So the renderer is told two things
     rather than one — which row the LEGS are drawn from, and which row the
     TORSO is — and the leftover angle between the aim and the row it picked is
     handed over as a lean. Sprites.draw() takes it and Sprites.twisted() does
     the cutting.

     Anyone can be handed one. The player twists because they are aiming;
     a colleague twists because somebody has just hit them with a foam dart and
     they are turning round to find out who, which is the same movement and the
     same three lines of code. */
  CARD: [-Math.PI / 2, Math.PI, Math.PI / 2, 0],
  /* How far past the halfway line the aim has to go before the shoulders give
     up the row they are on. Without it, an aim sitting exactly on a diagonal —
     which is where a thumb naturally rests — flickers between two rows every
     frame, and a person who cannot decide which way they are facing is worse
     than one facing slightly the wrong way. Eight degrees of stickiness. */
  HYST: 0.14,
  twist(angle, sticky) {
    let dir = Sprites.dirOf(Math.cos(angle), Math.sin(angle));
    /* Keep the row we are on while the aim is still anywhere near it. Only the
       player asks for this — a colleague turning to see who hit them is
       answering once and has no row to keep. */
    if (sticky && this._dir !== null && this._dir !== undefined && this._dir !== dir
        && Math.abs(this.off(angle, this._dir)) < Math.PI / 4 + this.HYST) dir = this._dir;
    if (sticky) this._dir = dir;
    let d = this.off(angle, dir);
    /* Facing the camera, a turn to the aimer's right is a lean to the screen's
       right; facing away it is the other way round. Left and right take the
       residual as it comes, because there it is simply the barrel rising and
       falling and the shoulders go with it. */
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
  /* ---- and how far the feet are allowed to disagree with it ----
     A waist is not a swivel. The first version of this let the legs take the
     direction of travel whatever the shoulders were doing, and walking west
     while aiming east drew somebody whose top half was turned through a
     hundred and eighty degrees — which is not a pose, it is an injury.

     So the legs may be a QUARTER TURN from the shoulders and no more, which
     with four directions means they may be the row either side of the torso's
     and never the one opposite it. Ask for the opposite — walk away from what
     you are pointing at — and the feet give up the argument rather than the
     spine: they take the aim's own row and the walk cycle plays in reverse.
     You back up facing the thing, which is exactly what a person does and is
     one flag to the frame lookup.

     Standing still, the feet simply come round to the aim, because somebody
     who has stopped to point at something is facing it. */
  legs(tdir) {
    if (!P.moving) return { dir: tdir, back: false };
    const mv = P.dir ?? 2;
    if ((mv + 2) % 4 === tdir) return { dir: tdir, back: true };
    return { dir: mv, back: false };
  },
  /* ---- which arm is holding it, and how far round ----
     The row has already been chosen and the lean already taken off; this is
     the last of the angle, and it goes into the shoulder.

     `armAim` is the AIM most of the time and the SWEEP while a swing is
     running, so the arm goes round with the thing in it instead of holding
     still while a sword describes an arc on its own. Which arm it is comes
     from the aim either way: a forehand that crosses the body is still thrown
     by the shoulder it started on, and an arm that changed sides halfway
     through a swing would be a second person's.

     `turn` is what Sprites.twisted() rotates the cut rectangle by, and it has
     the lean SUBTRACTED out of it, because that blit happens inside the twist:
     the torso has already turned by that much and the arm went with it. */
  armAim() {
    const d = this.def();
    const base = (d && d.melee && this.swingT > 0) ? this.sweep() : this.a;
    return base + this.tilt(base);
  },
  /* ---- THE ARM DOES THE KICK AND THE RELOAD, NOT THE GUN ----
     Every LPC sheet that ships a gun — the shotgun cut for Warlordocracy, the
     two-handed pistol and rifle in Skorpio's sci-fi pack, the bow `shoot` row
     half the tile-RPGs on OpenGameArt put a rifle over — does the recoil in
     the ARMS: a frame where the hands come up and the barrel goes with them.
     A gun that rises on its own out of a still fist reads as the gun coming
     loose. So it is an angle added to the aim before the shoulder is turned,
     and the picture follows the hand because it is drawn at the same angle.

     The reload is the same move the other way: every one of those sheets
     drops the muzzle to the floor while the hands are busy, and a gun that
     stays levelled at Marjorie while you fumble with its darts is still
     pointed at Marjorie. Down fast, held, up again — sin(πp) clipped flat at
     the bottom.

     Both are a turn TOWARDS a screen direction rather than a fixed sign, so
     they read the same aimed left, right, up or down: the kick lifts the
     muzzle up the screen and the reload lowers it down it. */
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
    /* Where the fist ended up, in the cell, once its own rectangle has been
       turned about the shoulder and carried to wherever `to` puts it. The
       grip goes here — see hand(), which takes it the rest of the way out
       of the cell and onto the screen. */
    const hand = [s.to[0] + hx * co - hy * si, s.to[1] + hx * si + hy * co];
    return { rect: s.rect, from: s.from, to: s.to, turn, hand, support: this.supportFor(row, s, hand, aim, lean) };
  },
  /* ---- THE OTHER HAND ----
     The two-handed hold every LPC shooting sheet draws: the off hand forward
     under the barrel. Only where the kit has a second arm to give — the front
     and back rows; side on, the far arm is behind the body and there is only
     one to have — and only for a gun that declares `hands: 2`.

     It is the same cut-and-turn as the first arm, pointed at the gun's `fore`
     rather than along the aim. Worked out in the CELL, before the lean, which
     is the space the main hand is already in: the barrel's direction there is
     the aim with the lean taken off, because the cell is about to be turned
     by the lean and the barrel with it. The arm is seven pixels long and the
     shoulders are further apart than two of them, so across the body it
     reaches TOWARDS the grip rather than onto it — which from the front is
     what a two-handed hold looks like anyway: a forearm across the belt. */
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

  /* The player's own pose: which row the shoulders are, how far the lean
     goes, where the arm has got to — and, as a side effect, where the feet
     end up. Null when there is nothing in your hands, which is the single
     blit everybody has always been.

     P.dir is WRITTEN here rather than returned, so that everything downstream
     that has ever asked which way the player is facing — the renderer, and
     whatever asks next — gets one answer. movePlayer sets it from the
     direction of travel a moment earlier in the same frame; this is the part
     that knows travel is no longer the only thing pointing it. */
  pose() {
    if (!this.armed) return null;
    const t = this.twist(this.a, true);
    t.lean = this.smooth = this.smooth + (t.lean - this.smooth) * this.EASE;
    /* THE STANDING FRAME, in the direction the SHOULDERS are facing, whatever
       the feet are doing. There is no second drawing of this person anywhere
       and there does not need to be one: the pose is this frame with one arm
       turned at the shoulder.

       It is FROZEN on the stand while the legs walk and run underneath, for a
       reason that is about the arm and not about taste. The rectangle the arm
       is cut from is measured on this frame; the kit's own walk shifts it a
       pixel or two and its RUN — which pitches the whole body forward over a
       leading leg and tucks both elbows in — moves it halfway across the cell.
       Cut that rectangle out of a run frame and you take a piece of ribs and
       blit back a stub. So the top half braces, which is what a top half
       carrying something does, and the shins do the walking. The breath below
       keeps it from reading as furniture. */
    t.frame = 0;
    t.arm = this.armFor(t.dir, t.lean);
    /* ---- THE THINGS YOU SWING ----
       Squared up while it is out, and the kit's own forehand or backhand while
       it is going round — swingDir is flipped by every swing, so holding the
       trigger alternates the two exactly as it always alternated the arc. The
       frame draws the arm, so nothing is cut; the weapon goes in whichever
       hand of that frame is leading. A sheet without the combat frames — a
       copy opened with an old manifest — falls through to the turned arm. */
    const r = Sprites.at('player'), m = r && r.sheet, d = this.def();
    if (d && d.melee && m && m.ready && m.slash && m.backslash) {
      let cycle, k;
      if (this.swingT > 0) {
        cycle = this.swingDir > 0 ? 'slash' : 'backslash';
        const p = 1 - this.swingT / (this.swingFor || 1);
        k = Math.min(m[cycle].length - 1, Math.floor(p * m[cycle].length));
      } else {
        cycle = 'ready';
        k = (typeof R !== 'undefined' && R.animate) ? Math.floor(R.t / this.READY_S) % m.ready.length : 0;
      }
      t.frame = m[cycle][k];
      t.arm = null;
      t.grip = this.gripFor(t.dir, cycle, k, this.armAim());
      /* Standing still, the legs are the stance's legs as well: the whole
         frame, feet apart. Walking, the walk carries on underneath. */
      t.legFrame = t.frame;
    }
    /* A BRACED TOP HALF IS NOT A FROZEN ONE. One pixel, on the rhythm every
       seated person in the building breathes on, and only while nothing else
       is moving it. */
    t.lift = (t.grip || this.swingT > 0 || this.kickT > 0 || !(typeof R !== 'undefined' && R.animate))
      ? 0 : Sprites.breathLift('player');
    const l = this.legs(t.dir);
    P.dir = l.dir; this.back = l.back;
    /* WHEN BOTH HALVES WANT THE SAME THING they are one drawing and not two.
       Standing still, or walking the way you are pointing, there is nothing to
       cut: the same frame, the same hips, the same legs, and a lean at the
       waist over the top of it. */
    t.whole = l.dir === t.dir;
    this._pose = t;
    return t;
  },
  /* Whether the walk is playing backwards this frame. Set by pose(), read by
     the renderer one line later. */
  back: false,

  /* ---- where the hand is, in the world ----
     The arm says where the fist has got to in the cell; this says where that
     pixel has ended up on the screen, which is not the same question once the
     torso has been turned about the hip. It applies the SAME transform
     Sprites.twisted() applies to the pixels — rotate about the waist, then the
     shoulder shift — so the grip stays in the hand at every lean instead of
     drifting out of it by a couple of pixels at the extremes, which is exactly
     the amount that reads as a gun somebody is not quite holding. */
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
    /* OUT OF THE BARREL, not out of the middle of the chest. It used to be a
       flat fifteen pixels along the aim from the body, which was near enough
       while the gun was drawn at one height for every direction and plainly
       wrong the moment it was not: aimed down, the gun is at the hip and the
       dart appeared from the collarbone.

       Two numbers come out of the muzzle and they are different questions. HOW
       FAR IN FRONT is a distance in the ground plane, and it is the muzzle's
       offset from the chest projected onto the aim — take the drawn y at face
       value instead and a shot fired dead level starts eight pixels north of
       the person firing it, which is most of the margin the hit test has. HOW
       HIGH is what is left over, and it is carried on the shot, so the dart
       leaves the barrel it is drawn coming out of instead of appearing at a
       standard chest height an inch below it. */
    const m = this.muzzleAt(a);
    const reach = clamp((m.x - P.x) * Math.cos(a) + (m.y - (P.y + this.SHOT_Z)) * Math.sin(a), 12, 22);
    const sx = P.x + Math.cos(a) * reach, sy = P.y + Math.sin(a) * reach;
    this.shots.push({
      x: sx, y: sy, z: clamp(m.y - sy, -30, 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a,
      left: d.range * TILE, gun: id, t: 0
    });
    if (d.kick) FX.shake(d.kick);
    /* The second frame of every LPC muzzle flash: after the flash, a puff.
       A dart blaster has no powder in it, so it is the spring's breath rather
       than smoke — pale, two pixels of it, gone in a third of a second. Not
       for the water pistol, whose shot IS the puff. */
    if (id !== 'water' && FX.motion) {
      for (let i = 0; i < 2; i++) {
        FX.parts.push({ x: m.x + Math.cos(a) * 3, y: m.y + Math.sin(a) * 3,
          vx: Math.cos(a) * 18 + rnd(-8, 8), vy: Math.sin(a) * 18 - rnd(40, 60),
          t: 0, life: rnd(.2, .34), c: 'rgba(220,226,236,.7)', sz: 2 });
      }
    }
    Sfx.gun(id);
    /* Empty is not a failure state to be announced, it is a click and then the
       fumbling. Reloading itself is automatic because the alternative on a
       phone is a fourth control for a thing that has exactly one answer. */
    if (!g.ammo[id]) this.reload();
    UI.hudDirty();
  },

  /* ---- the swing ----
     A sweep rather than a thing in the air, and everything about it is one
     angle moving: the weapon is drawn at the sweep's bearing rather than the
     aim's, and anybody the sweep passes over within reach gets caught by it
     as it goes. That is why the hit test is per frame and not at the moment
     the button went down — the swing arrives at the person on the left of the
     arc before the person on the right, which is the whole reason a swing
     feels different from a shot. */
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
  /* Where the weapon is pointing this instant: the arc is swept from one side
     to the other over the life of the swing, so t runs 0 → 1 and the bearing
     runs from a − arc/2 to a + arc/2. */
  sweep() {
    const d = this.def();
    if (!d || !d.melee || this.swingT <= 0) return this.a;
    const t = 1 - this.swingT / (this.swingFor || 1);
    return this.swingA + (t - 0.5) * d.arc * this.swingDir;
  },
  /* Who the blade is on top of this frame. Reach is measured centre to centre
     and the blade is given a width of its own — a sweep that only caught what
     was exactly on the line would pass through somebody between two frames at
     any speed worth swinging at. */
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
      /* Through a wall is not through a wall. The same question a dart asks
         at the tile it is in, asked at the halfway point of the reach — you
         cannot hit somebody round a corner with a rolled-up compliance pack,
         however much you would like to. */
      if (this.stopped(P.x + Math.cos(sa) * r * 0.6, P.y + Math.sin(sa) * r * 0.6)) return;
      this.swingHit.add(o);
      this.land(this.id(), o, kind, o.x, o.y - 6);
    };
    if (typeof NPCM !== 'undefined' && NPCM.list) NPCM.list.forEach(n => test(n, 'npc'));
    if (typeof Peds !== 'undefined') Peds.list().forEach(q => test(q, 'ped'));
  },

  /* Where the end of the barrel is, in drawn pixels: the hand, plus the muzzle
     offset from the grip turned through the aim. The same arithmetic paint()
     does, which is the point — a dart that leaves from anywhere else is a dart
     that leaves from somewhere you can see it did not. */
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
     Walls, and anything solid that is drawn taller than a desk. Deliberately
     NOT Collide.free(): that is the question a pair of feet asks, and a foot
     box is stopped by every bin, chair and worktop in the building — none of
     which is at chest height, and all of which a dart sails over. */
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
      /* A swing is a moving thing for a quarter of a second, so it is stepped
         like one: the arc advances, and anybody it reaches is reached now. */
      if (this.swingT > 0) { this.swept(dt); this.swingT = Math.max(0, this.swingT - dt); }
      /* Nothing has touched the aim for a while: put it away. The keyboard
         refreshes this on every aim and the stick on every frame it is held,
         so this only ever runs out when somebody has genuinely stopped. */
      if ((this.holster -= dt) <= 0) this.arm(false);
    }
    this.step(dt);
    this.hud();
  },

  /* The things in the air. Stepped in pieces no longer than a third of a tile:
     a dart at thirteen tiles a second covers most of a person in one frame,
     and a hit test that only looks at where it ENDED UP is a dart that goes
     through people and walls at exactly the speeds that matter. */
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

  /* One person, hit by one of the five. Everything below this line is the same
     whether it arrived through the air or on the end of a swing, which is why
     it takes an id and a place rather than a shot. */
  land(id, who, kind, x, y) {
    const d = GUNS[id] || GUNS.dart;
    FX.parts.push(...this.spray(x, y, d.melee ? 4 : 3, d.melee ? '#ffe27a' : d.shot.body));
    if (d.melee) Sfx.bonk(); 
    if (typeof FX !== 'undefined') FX.burst(who.x, who.y - 18, d.e, 3, d.melee ? '#ffd166' : d.shot.body);
    /* They turn to look at whoever did it, upper body first, feet later, which
       is the same twist the player is using to aim and the reason it lives in
       one place. */
    this.watch(who, P.x, P.y, 2.6);
    if (kind === 'ped') {
      if (who.sayT <= 0) { who.say = pick(this.PED_LINES); who.sayT = 2.4; }
      return;
    }
    who.stunTimer = Math.max(who.stunTimer || 0, 0.9);
    if (who.sayT <= 0) { who.say = pick(this.NPC_LINES[id] || this.NPC_LINES.dart); who.sayT = 3.2; }
    if (typeof Faces !== 'undefined') Faces.flash(who.id, id === 'band' || id === 'pack' ? 'anger' : 'shock', 1.6);
    /* It costs you something, once per person per shift. A second dart at the
       same person is the same joke and should not be a second grudge — and
       forty darts at Marjorie should not put her below anything a conversation
       can recover. */
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
    /* What it did to the person it hit is land()'s: a dart that stops at a
       wall and a dart that stops at Marjorie make the same puff, and only one
       of them is an event. */
  },
  spray(x, y, n, colour) {
    const out = [];
    /* Nothing at all when Motion is off. Every other particle in the game is
       gated on that setting inside FX.burst(); these are pushed straight into
       the list, so they have to ask for themselves. */
    if (!FX.motion) return out;
    for (let i = 0; i < n; i++) {
      out.push({ x, y, vx: rnd(-40, 40), vy: rnd(-50, 10), t: 0, life: rnd(.25, .5), c: colour, sz: 3 });
    }
    return out;
  },

  /* ---- the picture ----
     Baked once per gun at 1:1 and kept. A grid of characters into a canvas of
     pixels: nothing here is clever, and the only rule is that `.` is nothing
     and every other character must be in the palette, or it is nothing too. */
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

  /* One gun, in one pair of hands, pointing wherever it is pointing. `x, y` is
     the point the person stands on; everything else is worked out from there.

     Mirrored rather than rotated past the vertical: a gun turned 170 degrees is
     a gun lying on its back, which is not how anybody holds one. Flipping it
     about the barrel instead keeps the grip under the hand and the sights on
     top, which is what a side-on gun does when its owner turns round. */
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
       A couple of pixels back down its own line, decaying over an eighth of a
       second. The RISE is not here: it is in tilt(), added to the aim before
       the shoulder turns, so the arm lifts and the gun goes with the hand
       rather than jumping out of it. */
    const d = GUNS[id || this.id()] || {};
    const k = this.kickT > 0 ? this.kickT / this.KICK_S : 0;
    /* `kick` is already the number that says how hard this one goes off — it
       is what shakes the screen — so it is what moves the gun as well, rather
       than a second number saying the same thing in other units. */
    const back = k * (d.kick || 1) * 2.2;
    const sm = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    c.save();
    c.translate(Math.round(ax - Math.cos(ang) * back), Math.round(ay - Math.sin(ang) * back));
    c.rotate(ang);
    if (flip) c.scale(1, -1);
    c.drawImage(art.cv, -art.pivot[0], -art.pivot[1]);
    /* The flash, at the muzzle, in the muzzle's own frame — which is why it is
       inside the transform rather than worked out in world coordinates. */
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
  /* What is in the player's hands, wherever it is pointing this instant: the
     aim, or the sweep of a swing in progress. The renderer calls this rather
     than paint() so that the swing is the same one line as the gun.

     A swung thing goes out to arm's length and comes back, because an arm
     that stays bent through a swing is somebody waving. Eased on the sine of
     the swing so it is furthest out at the middle of the arc, which is where
     it hits. */
  held(c, x, y) {
    if (!this.armed) return;
    const d = this.def();
    if (d && d.melee && this.swingT > 0) {
      const t = 1 - this.swingT / (this.swingFor || 1);
      /* A LITTLE further out at the middle of the arc, and only a little. The
         first version pushed it nine pixels and the sword left the hand
         entirely — the arm in the art does not straighten, so nothing the
         weapon does can pretend it has. The swing is in the ARC; this is the
         two pixels of follow-through on top of it. */
      this.paint(c, x, y, this.armAim(), null, Math.sin(t * Math.PI) * 2);
      return;
    }
    this.paint(c, x, y, this.armAim());
  },
  /* Everything in the air. Drawn as pixels rather than as sprites — a dart is
     seven pixels by three and a rectangle at an angle is exactly that. */
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
     What is in your hand and what is left in it, as one line. Only while it is
     out: a magazine count on the screen of an office simulator the rest of the
     time would be the game telling you what it thinks it is about. */
  hud() {
    const el = $('#gunHud');
    if (!el) return;
    const on = this.armed && this.can();
    /* Called every frame from update(), so it is written as a comparison and
       not as a DOM write: the readout changes about six times a magazine and
       rewriting it sixty times a second would be innerHTML churn under the one
       thing in this game that has to stay at sixty. */
    const d = on ? this.def() : null;
    const sig = on ? this.id() + ':' + (d.melee ? '' : this.ammo()) + ':' + (this.reloadT > 0 ? 'r' : '') : '';
    if (sig === this._hudSig) return;
    this._hudSig = sig;
    el.hidden = !on;
    if (!on) return;
    /* A thing you swing has nothing to count, and a row of pips that never
       moves is a row of pips that means nothing. It says what it is and stops
       there. */
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
