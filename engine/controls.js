'use strict';
/* Handedness and style of the on-screen controls. The layout mirrors in CSS
   off body.southpaw; this owns the flags and the words that describe them. */
const Hand = {
  left: false,
  /* 'stick' is the floating analogue stick, 'dpad' four buttons. */
  pad: 'stick',
  apply() {
    document.body.classList.toggle('southpaw', !!this.left);
    document.body.classList.toggle('dpad-controls', this.pad === 'dpad');
    /* Switching mid-drag would leave the old control held down. */
    releaseSticks();
    Keys.up = Keys.down = Keys.left = Keys.right = 0;
  },
  /* Which corner, for instructions that name one. */
  padSide() { return this.left ? 'right' : 'left'; },
  btnSide() { return this.left ? 'left' : 'right'; },
  /* What to call the movement control in prose. */
  padName() { return this.pad === 'dpad' ? 'pad' : 'stick'; }
};

/* A floating analogue stick: it springs to wherever the thumb lands in its
   corner. Analogue, so a small push is a slow walk (below DEAD is nothing, or a
   resting thumb walks you into a wall). Moves and releases are bound to window,
   because a thumb slides off the zone and the controls hide when a
   conversation opens; an element listener would miss the release.

   Up to two at once: the left walks and steers; the right is the throttle when
   driving or the aim when armed. One stick cannot steer and throttle, or walk
   and aim, without each undoing the other. */
function makeStick(ids) {
  return {
    id: null, x: 0, y: 0, mag: 0, ox: 0, oy: 0,
    /* Travel to full deflection in CSS px, re-measured at each press. */
    R: 41,
    DEAD: 0.16,   /* fraction of R that is a resting thumb */
    el: null, knob: null, zone: null,
    init() {
      this.el = $(ids.el); this.knob = $(ids.knob); this.zone = $(ids.zone);
      if (!this.zone) return;
      this.zone.addEventListener('pointerdown', e => this.grab(e));
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
      /* Kept inside the zone, clear of the prompt and the HUD. */
      this.ox = clamp(e.clientX, z.left + rad, z.right - rad);
      this.oy = clamp(e.clientY, z.top + rad, z.bottom - rad);
      /* Overrule both resting anchors: CSS pins bottom, and left or right. */
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
      /* Floor at a slow but usable walk; full deflection is keyboard speed. */
      this.mag = m ? 0.42 + 0.58 * m : 0;
      this.x = dx / len * this.mag; this.y = dy / len * this.mag;
    },
    drop(e) { if (e.pointerId === this.id) this.release(); },
    release() {
      this.id = null; this.x = this.y = this.mag = 0;
      if (!this.el) return;
      this.el.classList.remove('grab');
      const s = this.el.style;
      s.left = s.top = s.right = s.bottom = '';
      this.knob.style.transform = '';
    },
    get on() { return this.id !== null && this.mag > 0; }
  };
}

const Stick = makeStick({ el: '#stick', knob: '#stickKnob', zone: '#stickZone' });
const Throttle = makeStick({ el: '#throttle', knob: '#throttleKnob', zone: '#throttleZone' });
const Aim = makeStick({ el: '#aim', knob: '#aimKnob', zone: '#aimZone' });

/* Let go of all of them: every place that drops the controls wants the lot. */
function releaseSticks() {
  Stick.release();
  Throttle.release();
  Aim.release();
}

/* Which right-hand stick shows is a body class: driving or armed. Called every
   frame, so it only touches the DOM when the answer changes. */
function syncControls() {
  const driving = typeof Cars !== 'undefined' && !!Cars.driving;
  const armed = !driving && typeof Guns !== 'undefined' && Guns.can();
  if (syncControls.was === armed) return;
  syncControls.was = armed;
  document.body.classList.toggle('armed', armed);
  /* A stick that leaves the screen with a thumb on it is still being read. */
  if (!armed) Aim.release();
}
syncControls.was = null;
