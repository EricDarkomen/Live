'use strict';
/* Handedness of the on-screen controls. The layout mirrors in pure CSS off
   body.southpaw; this owns only the flag and the wording that describes it. */
const Hand = {
  left: false,
  /* 'stick' is a floating analogue thumbstick, 'dpad' the four buttons it
     replaced. Both are in the markup; this only picks which one CSS shows. */
  pad: 'stick',
  apply() {
    document.body.classList.toggle('southpaw', !!this.left);
    document.body.classList.toggle('dpad-controls', this.pad === 'dpad');
    /* Switching styles mid-drag would otherwise leave the old one held down. */
    releaseSticks();
    Keys.up = Keys.down = Keys.left = Keys.right = 0;
  },
  /* "bottom left" / "bottom right", for instructions that name a corner. */
  padSide() { return this.left ? 'right' : 'left'; },
  btnSide() { return this.left ? 'left' : 'right'; },
  /* What to call the movement control in prose. */
  padName() { return this.pad === 'dpad' ? 'pad' : 'stick'; }
};

/* Floating analogue thumbstick: press anywhere in the bottom corner and it
   springs to the thumb that just landed. Two things are load-bearing —
   it is analogue (real direction and magnitude, so a small push is a slow
   walk; below DEAD it is nothing, or a resting thumb walks you into a wall),
   and everything after the press is bound to window rather than the zone,
   because a thumb slides off a 132px element and the controls are hidden
   outright when a conversation opens — an element listener misses the release
   and leaves you walking for the rest of the shift.

   THERE ARE TWO OF THEM. One in each bottom corner: the left one walks you
   about and steers, and the right one — which only exists behind a wheel — is
   the throttle. That is not decoration. With one stick, steering a car means
   pushing the thumb sideways, which takes the forward component out of the
   same vector, which slows the car down, which takes the bite out of the
   steering, so the harder you ask it to turn the less it turns. Two sticks is
   the whole fix: one thumb decides how fast and the other decides where, and
   neither can undo the other.

   Hence a maker rather than an object literal. Everything below is per-stick
   state and there is now more than one stick. */
function makeStick(ids) {
  return {
  id: null, x: 0, y: 0, mag: 0, ox: 0, oy: 0,
  /* Travel to full deflection, in CSS pixels. Re-measured off the elements at
     each press: landscape shrinks them, and "full push" has to mean the knob
     reaching the edge of its ring, the only cue the control gives you. */
  R: 41,
  DEAD: 0.16,   /* fraction of R that is a resting thumb rather than an input */
  el: null, knob: null, zone: null,
  init() {
    this.el = $(ids.el); this.knob = $(ids.knob); this.zone = $(ids.zone);
    if (!this.zone) return;
    this.zone.addEventListener('pointerdown', e => this.grab(e));
    /* Bound once, on the window, for the reasons in the comment above. */
    addEventListener('pointermove', e => this.drag(e));
    addEventListener('pointerup', e => this.drop(e));
    addEventListener('pointercancel', e => this.drop(e));
  },
  grab(e) {
    if (this.id !== null || G.state !== 'play' || Panels.on || Dialogue.on) return;
    e.preventDefault();
    Sfx.init();
    this.id = e.pointerId;
    const z = this.zone.getBoundingClientRect(), rad = this.el.offsetWidth / 2;
    if (rad) this.R = Math.max(24, rad - this.knob.offsetWidth / 2 + 4);
    /* Clamped inside the zone, so the stick never climbs out of the corner it
       was given and over the prompt or the HUD. */
    this.ox = clamp(e.clientX, z.left + rad, z.right - rad);
    this.oy = clamp(e.clientY, z.top + rad, z.bottom - rad);
    /* Both of the resting position's anchors have to be overruled: the CSS
       pins bottom, and southpaw pins right instead of left. */
    const s = this.el.style;
    s.left = (this.ox - z.left - rad) + 'px'; s.top = (this.oy - z.top - rad) + 'px';
    s.right = 'auto'; s.bottom = 'auto';
    this.el.classList.add('grab');
    this.drag(e);
  },
  drag(e) {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, this.R);
    this.knob.style.transform = 'translate(' + (dx / len * cl) + 'px,' + (dy / len * cl) + 'px)';
    const m = clamp((cl / this.R - this.DEAD) / (1 - this.DEAD), 0, 1);
    /* Not the raw magnitude: a stick just past the deadzone would otherwise
       creep at a twentieth of walking pace. The floor is a slow, usable walk
       and full deflection is the speed the keyboard has always given. */
    this.mag = m ? 0.42 + 0.58 * m : 0;
    this.x = dx / len * this.mag; this.y = dy / len * this.mag;
  },
  drop(e) { if (e.pointerId === this.id) this.release(); },
  release() {
    this.id = null; this.x = this.y = this.mag = 0;
    if (!this.el) return;
    this.el.classList.remove('grab');
    /* Back to whatever the stylesheet says, southpaw included. */
    const s = this.el.style;
    s.left = s.top = s.right = s.bottom = '';
    this.knob.style.transform = '';
  },
  get on() { return this.id !== null && this.mag > 0; }
  };
}

/* The left one: walking, and steering. The right-hand corner has two, and
   never both at once — the throttle while you are driving, the aim while you
   are carrying something to fire. Both are hidden by CSS unless their moment
   has come, so nothing on foot can grab the throttle and nothing behind a
   wheel can grab the aim.

   That is the twin-stick arrangement and it is the same argument the throttle
   made when it arrived. One stick cannot walk and aim: the direction you are
   going and the direction you are pointing are two facts, and a single vector
   carries one of them. With two, the left thumb decides where you are and the
   right decides what you are looking at, and neither can undo the other. It is
   also why people can now turn at the waist — see Sprites.twisted(). */
const Stick = makeStick({ el: '#stick', knob: '#stickKnob', zone: '#stickZone' });
const Throttle = makeStick({ el: '#throttle', knob: '#throttleKnob', zone: '#throttleZone' });
const Aim = makeStick({ el: '#aim', knob: '#aimKnob', zone: '#aimZone' });

/* Let go of all of them. Every place that drops the controls — a panel
   opening, the tab going away, a level swapping, getting into a car — wants
   the lot, and naming them one at a time is how one of them gets left held
   down. */
function releaseSticks() {
  Stick.release();
  Throttle.release();
  Aim.release();
}

/* Which of the two right-hand sticks is on screen, as a body class, decided in
   one place because it is one question: are you driving, or are you armed. The
   CSS does the rest. Called every frame from the update — it is two class
   toggles and the DOM ignores a toggle that changes nothing. */
function syncControls() {
  const driving = typeof Cars !== 'undefined' && !!Cars.driving;
  const armed = !driving && typeof Guns !== 'undefined' && Guns.can();
  if (syncControls.was === armed) return;    /* one comparison, no DOM */
  syncControls.was = armed;
  document.body.classList.toggle('armed', armed);
  /* A stick that goes off the screen with a thumb still on it is a stick that
     is still being read — the same failure the throttle has always guarded
     against on the way out of a car. */
  if (!armed) Aim.release();
}
syncControls.was = null;
