'use strict';
/* ---------------- Popovers, and the help sheet ----------------
   A popover is a menu that does NOT take the map away: you point at something,
   then reach for the layers or the zone list, and a modal backdrop in between
   would hide the very thing you were looking at. So this is a plain positioned
   <div> rather than a <dialog> — deliberately the opposite call from Ask, which
   is modal because it is asking a question you have to answer before anything
   else can happen.

   It exists at all because the bar used to carry fifteen controls and a phone
   has room for about five. The four layer switches, the zone list and the
   things you press once an afternoon are all here now; the desktop still shows
   the layer switches in the open, because it has the room and a menu you have to
   open is a control you have to remember. */

const Pop = {
  el: null,
  anchor: null,

  /* Content, then position, then show. Built fresh every time: these menus are
     views of live state (which layer is on, which zone, whether undo has
     anything in it) and a cached one would eventually disagree. */
  open(anchor, html, wire) {
    this.close();
    const el = document.createElement('div');
    el.className = 'pop';
    el.innerHTML = html;
    document.body.appendChild(el);
    this.el = el; this.anchor = anchor;
    this.place();
    if (wire) wire(el);

    /* Anything outside it closes it. `pointerdown` rather than `click`, so the
       menu is gone before whatever you pressed acts — and the anchor is exempt,
       or pressing the button that opened it would close and reopen. */
    this.away = e => {
      if (el.contains(e.target) || (anchor && anchor.contains(e.target))) return;
      this.close();
    };
    document.addEventListener('pointerdown', this.away, true);
    window.addEventListener('resize', this.closeBound = () => this.close());
    return el;
  },

  /* Under the anchor and aligned to whichever of its edges leaves the menu on
     screen. Fixed positioning, because the anchor may be inside the bar, inside
     the dock or inside a pane and all three scroll differently. */
  place() {
    const el = this.el, a = this.anchor;
    if (!el || !a) return;
    const r = a.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let x = r.right - w;
    if (x < 8) x = Math.min(r.left, vw - w - 8);
    x = clamp(x, 8, Math.max(8, vw - w - 8));
    /* Below by default; above when there is no room below and more above —
       which is what the tool dock at the bottom of a phone always wants. */
    let y = r.bottom + 6;
    if (y + h > vh - 8 && r.top - h - 6 > 8) y = r.top - h - 6;
    y = clamp(y, 8, Math.max(8, vh - h - 8));
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
  },

  close() {
    if (this.away) { document.removeEventListener('pointerdown', this.away, true); this.away = null; }
    if (this.closeBound) { window.removeEventListener('resize', this.closeBound); this.closeBound = null; }
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null; this.anchor = null;
  },
  /* Pressing the same button again puts it away, which is what a menu button
     does everywhere else. */
  toggle(anchor, html, wire) {
    const was = this.anchor === anchor && this.el;
    this.close();
    if (!was) this.open(anchor, html, wire);
  },

  /* ---- a plain list of things to do ----
     items: [{ label, hint, icon, warn, href, run }] or 'sep'. */
  menu(anchor, title, items) {
    const html = (title ? '<div class="pop-h">' + esc(title) + '</div>' : '')
      + items.map((it, i) => it === 'sep' ? '<hr>'
        : '<' + (it.href ? 'a href="' + esc(it.href) + '"' : 'button type="button"')
          + ' data-i="' + i + '"' + (it.warn ? ' class="warn"' : '') + '>'
          + (it.icon ? '<svg class="ic"><use href="#i-' + esc(it.icon) + '"/></svg>' : '')
          + '<span>' + esc(it.label)
          + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</span>'
          + '</' + (it.href ? 'a' : 'button') + '>').join('');
    this.toggle(anchor, html, el => {
      el.querySelectorAll('[data-i]').forEach(b => {
        const it = items[+b.dataset.i];
        if (!it.run) return;
        b.onclick = () => { this.close(); it.run(); };
      });
    });
  },

  /* ---- the layers ----
     The same four checkboxes the desktop shows in the bar, wired to the same
     four fields. Written here rather than moved, because on a desktop both are
     showing and either has to work. */
  LAYERS: [
    { k: 'grid', id: 'edGrid', label: 'Tile grid' },
    { k: 'plan', id: 'edPlan', label: 'Rooms, doors and arrivals' },
    { k: 'faults', id: 'edFaults', label: 'What the check found' },
    { k: 'wps', id: 'edWps', label: 'Waypoints', hint: 'where the colleagues are sent' },
  ],
  layers(anchor) {
    const html = '<div class="pop-h">Layers</div>'
      + this.LAYERS.map((l, i) => '<button type="button" data-i="' + i + '">'
        + '<span>' + esc(l.label) + (l.hint ? '<small>' + esc(l.hint) + '</small>' : '') + '</span>'
        + '<span class="tick">' + (View[l.k] ? '✓' : '') + '</span></button>').join('');
    this.toggle(anchor, html, el => {
      el.querySelectorAll('[data-i]').forEach(b => {
        b.onclick = () => {
          const l = this.LAYERS[+b.dataset.i];
          View[l.k] = !View[l.k];
          /* The desktop's own checkbox is the other view of this field, and it
             is on the page whether or not it is being shown. */
          const box = $('#' + l.id);
          if (box) box.checked = View[l.k];
          b.querySelector('.tick').textContent = View[l.k] ? '✓' : '';
          Side.refresh();
        };
      });
    });
  },

  /* ---- which zone the room tool paints ----
     A list with the tint on it, not a <select>. The zones are thirteen dark
     variations of the same navy-grey and their names do not tell them apart;
     the swatch is the only thing that does. */
  zones(anchor) {
    const html = '<div class="pop-h">Room tool paints</div>'
      + Object.keys(ZONES).map(z => '<button type="button" data-z="' + esc(z) + '">'
        + '<span class="sw" style="background:' + esc(ZONES[z].floor || ZONES[z].tint || '#333') + '"></span>'
        + '<span>' + esc(ZONES[z].name) + '</span>'
        + '<span class="tick">' + (z === Tools.zone ? '✓' : '') + '</span></button>').join('');
    this.toggle(anchor, html, el => {
      el.querySelectorAll('[data-z]').forEach(b => {
        b.onclick = () => {
          Tools.zone = b.dataset.z;
          this.close();
          Side.context();
          Side.say('The room tool paints ' + (ZONES[Tools.zone] || {}).name + '.');
        };
      });
    });
  },

  /* ---- everything the phone's bar has no room for ----
     Which of the ten documents is NOT in here: that is the identity chip and
     the picker behind it, because "what am I editing" is the one thing a bar
     has to answer without being opened. */
  more(anchor) {
    const levels = Mode.id === 'levels';
    const items = [];
    /* Redo lives here on a phone, named. It is the only bar control that spends
       most of its life disabled, and a menu can say what it would put back —
       which the greyed-out arrow it replaced never could. */
    const fwd = Mode.doc().redoStack[Mode.doc().redoStack.length - 1];
    if (fwd) items.push({ label: 'Redo ' + fwd.label, icon: 'redo', run: () => Side.step(true) });
    if (levels) items.push({ label: 'Fit the whole level', icon: 'fit', run: () => View.fit() });
    if (levels) items.push({ label: '▶ Try this level', hint: 'the game, on what you are drawing',
      run: () => Play.go() });
    /* The Rooms tab gets it too, and only the Rooms tab: ZONES is one of the
       three things that cross over into a trial, so a repainted floor is
       something you can walk around. Nothing an NPC or an item says does, which
       is why the other seven documents do not offer this. */
    if (Mode.id === 'zones') {
      const on = Play.levelFor(Zones.id);
      if (on) {
        items.push({ label: '▶ Try it in the game',
          hint: 'the game, on ' + ((LEVELS[on] || {}).name || on),
          run: () => Play.go(on) });
      }
    }
    const n = Mode.changes().length;
    items.push({ label: 'The whole game', icon: 'all',
      hint: n ? n + ' edited and not exported' : 'what every check found',
      run: () => Project.show() });
    items.push({ label: 'Tools, gestures and shortcuts', run: () => Help.show() });
    items.push('sep');
    items.push({ label: 'New ' + Mode.def().subject.toLowerCase() + '…', run: () => Mode.create() });
    if (Mode.id !== 'art') {
      items.push({ label: 'One like this one…', hint: 'a copy of ' + Mode.title(),
        run: () => Mode.duplicate() });
    }
    items.push({ label: 'Revert this ' + Mode.def().subject.toLowerCase(),
      hint: 'throw away every change', warn: true, run: () => Mode.revert() });
    items.push('sep');
    items.push({ label: '▶ the game', href: 'index.html' });
    this.menu(anchor, null, items);
  }
};

/* ---------------- What everything does ----------------
   The hint line under the map is the first thing every short viewport drops, and
   a phone never had it at all — so on a phone the shortcuts were invisible and
   so was the fact that the second finger moves the map. This is that line, in
   full, one tap away on every screen.

   Keyed by the same icons the dock draws, because "which one is the eraser" is
   a question a picture answers and a word does not. */
const Help = {
  TOOLS: [
    ['select', 'Select', 'Pick anything up. Drag an object, an arrival point or a waypoint to another tile. Click again to step down through a stack.', 'V'],
    ['room', 'Room', 'Drag out a room in the zone the chip shows. A single click picks the room under it instead.', 'R'],
    ['door', 'Door', 'Punch a door through a wall. Clicking one again takes it out.', 'D'],
    ['object', 'Object', 'Place whatever the chip is holding. The Palette tab is where you change it.', 'O'],
    ['erase', 'Erase', 'Take away whatever is on the tile: the object, then the door, the counter, the room.', 'X'],
    ['entry', 'Entry', 'Move the selected arrival point here — or place a new one if there is none.', 'E'],
    ['counter', 'Counter', 'Drag out a run of counter. Bare stretches of it are solid.', 'C'],
    ['pan', 'Pan', 'Drag the map about with one finger and no keyboard.', 'H'],
  ],
  KEYS: [
    ['Undo · redo', 'Ctrl+Z · Ctrl+Shift+Z'],
    ['Delete what is selected', 'Del'],
    ['Nudge it a tile', '← ↑ ↓ →'],
    ['Turn an object a quarter · the other way', 'T · Shift+T'],
    ['Duplicate it', 'Ctrl+D'],
    ['Let go of the selection', 'Esc'],
    ['Find anything, anywhere in the game', 'Ctrl+F'],
    ['Back where a jump came from', 'alt+←'],
    ['Fit the whole level', 'F'],
    ['Zoom', '+ · − · scroll · pinch'],
    ['Move around', 'space-drag · middle-drag · two fingers'],
    ['Take a copy of what is under the pointer', 'alt-click'],
    ['Delete what is under the pointer', 'right-click'],
  ],
  /* What the tool IS, before what its buttons do. Nine documents in one shell is
     the first thing to know about this page and the last thing a toolbar can
     say on its own — and this list is Mode.DEFS rather than a copy of it,
     because the copy went on saying "three documents" while six more modes
     were added around it. A tenth describes itself here for free. */
  show() {
    Pop.close();
    Ask.tell('How this works',
      '<div class="keys">'
      + Mode.DEFS.map(m => '<div class="k"><svg class="ic"><use href="#i-' + m.icon + '"/></svg>'
        + '<span><b>' + esc(m.label) + '</b> — <i>' + esc(m.blurb) + '</i></span></div>').join('')
      + '</div>'
      + '<div class="note">' + Mode.DEFS.length + ' documents, one shell. The bar says which one '
      + 'you are in and switches between them; each has a workspace you browse, a panel that '
      + 'inspects what you picked, a Check tab for the faults you cannot see, and an Export tab — '
      + 'which is always the deliverable — and the whole-game sheet can write it into data/.</div>'
      + '<h4>The map</h4>'
      + '<div class="keys">'
      /* One flex row per line rather than a three-column grid: on a 320px phone
         the grid gave the description column about ninety pixels and every
         sentence came out one word wide. A row wraps its key to the next line
         instead, which costs a line and reads. */
      + this.TOOLS.map(t => '<div class="k"><svg class="ic"><use href="#i-' + t[0] + '"/></svg>'
        + '<span><b>' + esc(t[1]) + '</b> — <i>' + esc(t[2]) + '</i></span>'
        + '<kbd>' + esc(t[3]) + '</kbd></div>').join('')
      + '<hr>'
      + this.KEYS.map(k => '<div class="k"><span>' + esc(k[0]) + '</span>'
        + '<kbd>' + esc(k[1]) + '</kbd></div>').join('')
      + '</div>'
      + '<div class="note">One finger uses the tool, two move the map — and the second finger '
      + 'aborts what the first was doing, because you were reaching for the map rather than '
      + 'placing a chair. Nothing is written until you save: the whole-game sheet does that.</div>');
  }
};
