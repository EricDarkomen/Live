'use strict';
/* ---------------- Juice: the interface's small motions ----------------
   css/bubble.css is how the interface looks; this is the handful of things a
   stylesheet cannot do on its own:

     the dock      the desktop's row of key hints, turned into round bubbles
                   with the key in a badge and the name as a tooltip — read
                   off each button's own "N · Map" text, so the markup and
                   everything that builds it stay exactly as they were
     the bump      a meter or the takings give a little bounce when they
                   change by enough to matter, so a drink or a tip is felt
                   and not only read
     the pop       a bubble pops under your finger on anything you press

   Every one of them stands down with the game's Reduced motion setting
   (FX.motion) and the system's own preference, which is what `body.calm`
   says to bubble.css. */
const Juice = {
  init() {
    this.dock();
    this.watch();
    this.pops();
    this.tilt();
    this.calm();
    setInterval(() => this.calm(), 1000);
  },
  still() {
    return (typeof FX !== 'undefined' && FX.motion === false)
      || matchMedia('(prefers-reduced-motion: reduce)').matches;
  },
  calm() { document.body.classList.toggle('calm', this.still()); },

  dock() {
    const k = document.getElementById('keyhints');
    if (!k || (typeof TOUCH !== 'undefined' && TOUCH)) return;
    k.classList.add('dock');
    k.querySelectorAll('button').forEach(b => {
      /* The words only — the icon is in its own span, and belongs on the
         bubble rather than in the badge. */
      const words = [...b.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join('').trim();
      const m = words.match(/^(\S+)\s*·\s*(.+)$/);
      if (!m) return;
      b.dataset.key = m[1] === 'Esc' ? 'Esc' : m[1];
      b.dataset.tip = m[2];
      b.setAttribute('aria-label', m[2] + ' (' + m[1] + ')');
      b.title = '';
    });
  },

  /* A bounce when a number moves by enough to notice: a drink, a tip, a
     meal. Not the energy ticking down a point at a time, which would be the
     HUD fidgeting all afternoon. */
  watch() {
    const rows = [['#vPat', '.bar-row', 3], ['#vEne', '.bar-row', 3], ['#vFood', '.bar-row', 3],
      ['#vXp', '.bar-row', 1], ['#hMoney', '.money-row', .01]];
    for (const [sel, up, min] of rows) {
      const el = document.querySelector(sel);
      const row = el && el.closest(up);
      if (!row) continue;
      let last = parseFloat(el.textContent) || 0;
      new MutationObserver(() => {
        const v = parseFloat(el.textContent) || 0;
        const d = v - last;
        last = v;
        if (Math.abs(d) < min || this.still()) return;
        row.classList.remove('bump'); void row.offsetWidth; row.classList.add('bump');
        /* A tip lands, and you look pleased with yourself for a moment. */
        if (sel === '#hMoney' && d > 0 && typeof Faces !== 'undefined') Faces.flash('player', 'happy', 1.6);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    }
  },

  /* Cards lean towards the pointer, a few degrees, with a highlight that
     follows it — css/bubble.css reads the four variables this writes. */
  tilt() {
    const sel = '.item,.mind-card,.farm-plots .fp,.stat-box,.ach';
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || this.still()) return;
      const t = e.target.closest && e.target.closest(sel);
      if (!t) return;
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t.style.setProperty('--ry', ((x - .5) * 10).toFixed(1) + 'deg');
      t.style.setProperty('--rx', ((.5 - y) * 8).toFixed(1) + 'deg');
      t.style.setProperty('--mx', (x * 100).toFixed(0) + '%');
      t.style.setProperty('--my', (y * 100).toFixed(0) + '%');
    }, { passive: true });
  },
  pops() {
    const hit = '.btn,.choice,.tab,.cm-tab,.chip,#cmOne,.item,.move,#keyhints button,#touchE,#touchMenu,.tk-title';
    document.addEventListener('pointerdown', e => {
      const t = e.target.closest && e.target.closest(hit);
      if (!t || this.still()) return;
      const r = t.getBoundingClientRect();
      if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
      const b = document.createElement('span');
      b.className = 'pop-bubble';
      b.style.left = (e.clientX - r.left) + 'px';
      b.style.top = (e.clientY - r.top) + 'px';
      t.appendChild(b);
      setTimeout(() => b.remove(), 600);
    }, { passive: true });
  }
};
addEventListener('DOMContentLoaded', () => Juice.init());
