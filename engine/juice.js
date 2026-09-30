'use strict';
/* ---------------- Juice: the interface's small motions ----------------
   What css/bubble.css cannot do alone:
     the dock   the desktop's key hints as round bubbles, read off each
                button's own "N · Map" text
     the bump   a meter or the takings bounce when they change enough to notice
     the pop    a bubble pops under your finger
   All stand down with Reduced motion or the system preference (body.calm). */
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
    return (FX.motion === false)
      || matchMedia('(prefers-reduced-motion: reduce)').matches;
  },
  calm() { document.body.classList.toggle('calm', this.still()); },

  dock() {
    const k = document.getElementById('keyhints');
    if (!k || TOUCH) return;
    k.classList.add('dock');
    k.querySelectorAll('button').forEach(b => {
      /* The words only; the icon span belongs on the bubble. */
      const words = [...b.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join('').trim();
      const m = words.match(/^(\S+)\s*·\s*(.+)$/);
      if (!m) return;
      b.dataset.key = m[1] === 'Esc' ? 'Esc' : m[1];
      b.dataset.tip = m[2];
      b.setAttribute('aria-label', m[2] + ' (' + m[1] + ')');
      b.title = '';
    });
  },

  /* A bounce when a number moves by enough to notice, not the energy ticking down. */
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
        /* A tip lands and you look pleased with yourself. */
        if (sel === '#hMoney' && d > 0) Faces.flash('player', 'happy', 1.6);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    }
  },

  /* Cards lean a few degrees towards the pointer; bubble.css reads the variables. */
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
    const hit = '.btn,.choice,.tab,.cm-tab,.chip,#cmOne,.item,.move,#keyhints button,#touchE,#touchMenu,.gd-main,.gd-row,.gd-all';
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
