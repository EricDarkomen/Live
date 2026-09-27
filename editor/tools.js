'use strict';
/* ---------------- Pointer and keyboard ----------------
   One pointer handler, switched on the current tool. Everything that changes
   the level goes through a Doc method, so every edit is undoable and every edit
   rebuilds the map — there is no path from a gesture to World that skips
   either.

   Dragging deliberately does not commit until the pointer comes up. Moving an
   object rebuilds the whole level, and doing that per pointermove would put
   sixty entries on the undo stack for one drag. */

const Tools = {
  current: 'select',
  zone: 'main',
  /* What the object tool places. A template, cloned on each placement. */
  brush: { e: '🪑', name: 'Chair', kind: 'chair', solid: false, use: 'chair' },

  drag: null,
  /* A touch that has not decided whether it is a tap yet. */
  tap: null,
  spaceDown: false,
  /* Every pointer currently down on the canvas. Two of them is a gesture rather
     than two drags — see gesture() below. */
  pointers: new Map(),
  gesture: null,

  init() {
    const cv = R.cv;
    cv.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.up(e));
    cv.addEventListener('pointerleave', () => { View.hover = null; Side.readout(); });

    /* touch-action only governs a gesture that STARTS on the element declaring
       it, so a thumb landing a few pixels off the canvas still drags the whole
       page around — which on a fixed layout reads as the editor falling apart.
       Decided once per touch, in touchstart, because the answer cannot change
       half way through a drag: a touch that began somewhere genuinely scrollable
       (a pane, a toolbar strip, the tab row, a text field) is left alone and
       everything else is refused. Non-passive, or preventDefault is ignored. */
    let letScroll = false;
    document.addEventListener('touchstart', e => {
      letScroll = !!(e.target && e.target.closest
        && e.target.closest('.pane, #bar, .tabs, .pop, .work, textarea, input, select, #edAsk'));
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!letScroll) e.preventDefault();
    }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      View.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    window.addEventListener('keydown', e => this.key(e));
    window.addEventListener('keyup', e => { if (e.code === 'Space') this.spaceDown = false; });
  },

  set(tool) {
    this.current = tool;
    Side.toolButtons();
    /* The chip says what the tool in your hand is holding, and the dock changes
       size when it appears — which moves what the camera thinks it can see. */
    Side.context();
  },

  /* Capture is an optimisation — it keeps the drag alive when the pointer
     leaves the canvas — and it throws if the browser has no active pointer with
     that id. An exception here would take the whole pointerdown handler with it
     and the tool would simply not act, so it is allowed to fail: the move and up
     handlers are bound to the window and work either way. */
  capture(e) {
    try { R.cv.setPointerCapture(e.pointerId); } catch (_) { /* drag still works */ }
  },

  /* Where on the canvas, in CSS pixels. */
  at(e) {
    const r = R.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  },

  /* ---- pointer ---- */

  /* ---- two fingers ----
     One finger uses the tool; two move the map. That is the convention every
     map on a phone follows, and it is what makes the editor usable without the
     wheel and the space bar it was written for. A second finger landing ABORTS
     whatever the first was doing rather than committing it — you were reaching
     for the map, not placing a chair. */
  centroid() {
    let x = 0, y = 0;
    this.pointers.forEach(p => { x += p.x; y += p.y; });
    const n = this.pointers.size;
    return { x: x / n, y: y / n };
  },
  spread() {
    const a = Array.from(this.pointers.values());
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  },
  startGesture() {
    this.drag = null;
    View.band = null;
    this.tap = null;              /* it was half a pinch, not a tap */
    this.gesture = { c: this.centroid(), d: this.spread() };
  },
  moveGesture() {
    const c = this.centroid(), d = this.spread();
    const g = this.gesture;
    /* Zoom about where the fingers were, then follow them. Doing it the other
       way round moves the map out from under the pinch. */
    if (g.d > 0 && d > 0) View.zoomAt(d / g.d, g.c.x, g.c.y);
    View.pan(c.x - g.c.x, c.y - g.c.y);
    this.gesture = { c: c, d: d };
  },

  down(e) {
    const p = this.at(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) { this.capture(e); this.startGesture(); return; }
    if (this.pointers.size > 2) return;

    const t = View.toTile(p.x, p.y);
    /* Middle button and space-drag always pan, whatever the tool is — you need
       to get somewhere else without changing tool and back. Neither exists on a
       touch device, which is the whole reason there is a Pan tool as well: with
       no third button and no keyboard, those two shortcuts are not shortcuts,
       they are the only way to move and it is unreachable. */
    if (e.button === 1 || this.spaceDown || this.current === 'pan') {
      this.drag = { mode: 'pan', px: e.clientX, py: e.clientY };
      this.capture(e);
      return;
    }
    if (e.button === 2) { this.rightClick(t); return; }
    if (!View.inMap(t)) return;
    /* Alt-click takes a copy of whatever is under it into the object tool — the
       one gesture every painting program has, and the difference between
       "another one of those" and finding it again in a palette of two hundred.
       There is no alt key on a phone, so the object inspector carries the same
       thing as a button. */
    if (e.altKey) { this.sample(t); return; }
    /* Something elsewhere in the editor asked for a tile — a person's desk is
       the first, and it is the only honest way to set one: (33,19) means
       nothing until you can see which desk it is. */
    if (this.picking) {
      if (e.pointerType === 'touch') this.tap = { tool: 'pick', x: p.x, y: p.y, shift: false };
      else this.act('pick', t, false);
      return;
    }
    this.capture(e);

    if (this.current === 'select') this.downSelect(t, e);
    else if (this.current === 'room' || this.current === 'counter') {
      this.drag = { mode: 'band', x0: t.x, y0: t.y };
      View.band = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
    } else if (e.pointerType === 'touch') {
      /* A finger does not act until it lifts. The placing tools act on the way
         DOWN for a mouse, which is right there and wrong here: the first finger
         of a pinch lands a few milliseconds before the second, so reaching for
         the map with the object tool up dropped a chair every single time. A
         tap still acts; a finger that turns out to be half a gesture, or the
         start of a drag, does not. */
      this.tap = { tool: this.current, x: p.x, y: p.y, shift: e.shiftKey };
    } else this.act(this.current, t, e.shiftKey);
  },

  /* What the placing tools do, once something has decided they should. */
  act(tool, t, shift) {
    if (tool === 'pick') { this.finishPick(t); return; }
    if (tool === 'door') this.doDoor(t);
    else if (tool === 'object') this.doPlace(t);
    else if (tool === 'erase') this.doErase(t);
    else if (tool === 'entry') this.doEntry(t, { shiftKey: shift });
  },

  move(e) {
    const p = this.at(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.gesture && this.pointers.size >= 2) { this.moveGesture(); return; }

    const t = View.toTile(p.x, p.y);
    View.hover = View.inMap(t) ? t : null;
    Side.readout();

    if (!this.drag) return;
    if (this.drag.mode === 'pan') {
      View.pan(e.clientX - this.drag.px, e.clientY - this.drag.py);
      this.drag.px = e.clientX; this.drag.py = e.clientY;
    } else if (this.drag.mode === 'band') {
      View.band = { x0: this.drag.x0, y0: this.drag.y0, x1: t.x, y1: t.y };
    } else if (this.drag.mode === 'move') {
      /* A ghost of where it would land. The move itself is committed on the way
         up, as one undo entry rather than sixty. */
      View.band = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
    }
  },

  up(e) {
    this.pointers.delete(e.pointerId);
    /* Lifting one of two fingers ends the gesture rather than handing the drag
       to the finger still down: carrying on would move whatever was under it. */
    if (this.gesture) {
      if (this.pointers.size < 2) this.gesture = null;
      else this.gesture = { c: this.centroid(), d: this.spread() };
      this.drag = null; View.band = null; this.tap = null;
      return;
    }
    const d = this.drag;
    const tap = this.tap;
    this.drag = null; this.tap = null;
    View.band = null;
    const p = this.at(e);
    const t = View.toTile(p.x, p.y);

    /* A tap is a finger that went down and came up in about the same place with
       nothing else happening in between. Anything further than that was a drag
       or a gesture, and neither means "put a chair here". */
    if (tap) {
      if (Math.hypot(p.x - tap.x, p.y - tap.y) < 12 && View.inMap(t)) {
        this.act(tap.tool, t, tap.shift);
      }
      Side.refresh();
      return;
    }
    if (!d) return;

    if (d.mode === 'band' && View.inMap(t)) {
      const x = Math.min(d.x0, t.x), y = Math.min(d.y0, t.y);
      const w = Math.abs(t.x - d.x0) + 1, h = Math.abs(t.y - d.y0) + 1;
      if (this.current === 'room') {
        /* A one-tile drag is a click, and a click on a room is how you select
           it — otherwise every attempt to pick a room paints a new one over it. */
        if (w === 1 && h === 1) this.selectAt(t);
        else Doc.addRoom(this.zone, x, y, x + w - 1, y + h - 1);
      } else if (this.current === 'counter') {
        if (w === 1 && h === 1 && Doc.counterAt(t.x, t.y) >= 0) this.selectAt(t);
        else Doc.addCounter(x, y, w, 'COUNTER');
      }
    } else if (d.mode === 'move' && View.inMap(t)) {
      if (d.what === 'object') Doc.moveObject(d.i, t.x, t.y);
      else if (d.what === 'entry') Doc.setEntry(d.name, t.x, t.y);
      else if (d.what === 'wp') Doc.setWaypoint(d.name, t.x, t.y);
    }
    Side.refresh();
  },

  /* Right-click deletes whatever is under it, whichever tool is up. The one
     gesture that means the same thing everywhere. */
  rightClick(t) {
    if (!View.inMap(t)) return;
    this.doErase(t);
  },

  /* ---- select ---- */

  /* Anything that lives on a single tile can be dragged to another one. The
     move is committed on the way up, as one undo entry rather than sixty. */
  DRAGGABLE: ['object', 'entry', 'wp'],
  downSelect(t, e) {
    const hit = this.selectAt(t);
    if (this.DRAGGABLE.indexOf(hit) >= 0) {
      this.drag = { mode: 'move', what: hit, i: Sel.i, name: Sel.name };
      View.band = { x0: t.x, y0: t.y, x1: t.x, y1: t.y };
    }
  },
  /* What is on this tile, most specific first: the things you placed by hand
     beat the room they were placed in, exactly as a person beats the chair they
     are sitting on. */
  selectAt(t) {
    const objs = Doc.objectsAt(t.x, t.y);
    if (objs.length) {
      /* Clicking again steps down through a stack rather than re-selecting the
         top one forever — a chair under a colleague, a jug on a table. */
      let pick = objs[objs.length - 1];
      if (Sel.kind === 'object') {
        const at = objs.findIndex(x => x.i === Sel.i);
        if (at >= 0) pick = objs[(at - 1 + objs.length) % objs.length];
      }
      this.select('object', pick.i);
      return 'object';
    }
    const entry = Doc.entryAt(t.x, t.y);
    if (entry) { this.select('entry', -1, entry); return 'entry'; }
    /* Only when the layer is showing. Selecting something invisible reads as
       the click having gone wrong. */
    if (View.wps) {
      const wp = Doc.waypointAt(t.x, t.y);
      if (wp) { this.select('wp', -1, wp); return 'wp'; }
    }
    const door = Doc.doorAt(t.x, t.y);
    if (door >= 0) { this.select('door', door); return 'door'; }
    const counter = Doc.counterAt(t.x, t.y);
    if (counter >= 0) { this.select('counter', counter); return 'counter'; }
    const room = Doc.roomAt(t.x, t.y);
    if (room >= 0) { this.select('room', room); return 'room'; }
    this.select(null, -1);
    return null;
  },
  select(kind, i, name) {
    Sel.kind = kind; Sel.i = i === undefined ? -1 : i; Sel.name = name || null;
    Side.refresh();
  },

  /* ---- the placing tools ---- */

  doDoor(t) {
    const at = Doc.doorAt(t.x, t.y);
    if (at >= 0) { Doc.removeDoor(at); this.select(null); return; }
    /* A door belongs to the room it opens into. Take that from a neighbouring
       room rather than from the toolbar, because a door in a wall has a room on
       one side of it and that is nearly always the answer. */
    const near = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      .map(([dx, dy]) => Doc.roomAt(t.x + dx, t.y + dy))
      .filter(i => i >= 0)
      .map(i => Doc.rooms[i].z);
    const z = near[0] || this.zone;
    Doc.addDoor(t.x, t.y, z, (ZONES[z] || {}).name);
    this.select('door', Doc.doorAt(t.x, t.y));
  },

  doPlace(t) {
    const o = Object.assign({}, clone(this.brush), { x: t.x, y: t.y });
    Doc.addObject(o);
    this.select('object', Doc.objects.length - 1);
  },

  doErase(t) {
    const objs = Doc.objectsAt(t.x, t.y);
    if (objs.length) { Doc.removeObject(objs[objs.length - 1].i); this.select(null); return; }
    const door = Doc.doorAt(t.x, t.y);
    if (door >= 0) { Doc.removeDoor(door); this.select(null); return; }
    const counter = Doc.counterAt(t.x, t.y);
    if (counter >= 0) { Doc.removeCounter(counter); this.select(null); return; }
    const room = Doc.roomAt(t.x, t.y);
    if (room >= 0) { Doc.removeRoom(room); this.select(null); }
  },

  /* Move the arrival point you are holding, or make one. Shift asks for a new
     one — and so does having none to move, because there is no shift key on a
     phone and "add the first arrival point" is exactly what a level made here
     needs first. Tapping one that is already there picks it up instead of
     dropping another on top of it. */
  doEntry(t, e) {
    const on = Doc.entryAt(t.x, t.y);
    if (on && !e.shiftKey) { this.select('entry', -1, on); return; }
    const have = Object.keys(Doc.entries);
    if (e.shiftKey || !have.length) { this.newEntry(t); return; }
    const name = Sel.kind === 'entry' ? Sel.name : have[0];
    Doc.setEntry(name, t.x, t.y);
    this.select('entry', -1, name);
  },
  newEntry(t) {
    Ask.form('A new arrival point', [
      { k: 'name', label: 'called', value: Doc.entries.start ? '' : 'start',
        hint: 'a link from another level names this' },
    ], 'Place it').then(v => {
      if (!v || !v.name) return;
      if (Doc.entries[v.name]) { Side.say('There is already one called ' + v.name + '.'); return; }
      Doc.addEntry(v.name, t.x, t.y);
      this.select('entry', -1, v.name);
      Side.say('Placed ' + v.name + '.');
    });
  },

  /* ---- picking a tile for somebody else ----
     `ask` switches to the map and waits for one tap. Escape or a second call
     cancels it, and the readout says what it is waiting for — a mode you cannot
     see you are in is a mode that eats your next tap. */
  picking: null,
  askTile(label, cb) {
    this.picking = { label: label, cb: cb };
    Mode.set('levels');
    this.set('select');
    Side.say(label + ' — tap a tile on the map. Escape to give up.');
  },
  cancelPick() {
    if (!this.picking) return false;
    this.picking = null;
    Side.say('Left it where it was.');
    Side.refresh();
    return true;
  },
  finishPick(t) {
    const p = this.picking;
    if (!p) return;
    this.picking = null;
    p.cb(t.x, t.y);
  },

  /* ---- the eyedropper ----
     Everything about an object except where it is. Taken from the doc rather
     than from the palette, so it carries whatever was edited onto it — a `furn:`
     override, a custom `use` — and placing the copy places THAT, not something
     that merely looks like it. */
  sample(t) {
    const objs = Doc.objectsAt(t.x, t.y);
    if (!objs.length) { Side.say('Nothing here to take a copy of.'); return; }
    const o = clone(objs[objs.length - 1].o);
    delete o._k; delete o.x; delete o.y;
    Tools.brush = o;
    this.set('object');
    Side.say('The object tool is holding \u201c' + (o.name || o.kind) + '\u201d.');
  },

  /* ---- keyboard ---- */

  key(e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).nodeName)) return;

    /* Undo, redo and Escape belong to the page; everything below them belongs
       to the map, and there is no map in the other two modes — where `D` and
       `X` would otherwise silently change a tool nobody can see. */
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); Side.step(e.shiftKey); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault(); Side.step(true); return;
    }
    /* Find across the whole game, on the key every tool binds it to. It is a
       page thing, not a map thing, so it sits with undo above the mode gate. */
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault(); Project.show(''); return;
    }
    /* Back, after a jump took you to another document. */
    if (e.altKey && e.code === 'ArrowLeft') {
      e.preventDefault(); Project.back(); return;
    }
    if (e.code === 'Escape') {
      Pop.close();
      if (this.cancelPick()) return;
      if (Mode.id === 'levels') this.select(null);
      return;
    }
    if (typeof Mode !== 'undefined' && Mode.id !== 'levels') return;

    if (e.code === 'Space') { this.spaceDown = true; e.preventDefault(); return; }

    const byNumber = { Digit1: 'select', Digit2: 'room', Digit3: 'door', Digit4: 'object', Digit5: 'erase', Digit6: 'entry', Digit7: 'counter', Digit8: 'pan' };
    const byLetter = { KeyV: 'select', KeyR: 'room', KeyD: 'door', KeyO: 'object', KeyX: 'erase', KeyE: 'entry', KeyC: 'counter', KeyH: 'pan' };
    const tool = byNumber[e.code] || byLetter[e.code];
    if (tool) { this.set(tool); return; }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault(); this.duplicate(); return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') { this.deleteSelection(); return; }
    /* T for turn. R is the room tool and has been since there were three of
       them, so the letter this wants is taken; T is next to it and free. */
    if (e.code === 'KeyT') { this.turn(e.shiftKey ? -1 : 1); return; }
    if (e.code === 'KeyF') { View.fit(); return; }
    if (e.key === '+' || e.key === '=') { View.setZoom(View.zoom * 1.25); return; }
    if (e.key === '-' || e.key === '_') { View.setZoom(View.zoom / 1.25); return; }

    /* Nudge. A tile at a time is the only unit the map has. */
    const nudge = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
    if (!nudge) return;
    if (Sel.kind === 'object') {
      const o = Doc.objects[Sel.i];
      if (!o) return;
      e.preventDefault();
      Doc.moveObject(Sel.i, o.x + nudge[0], o.y + nudge[1]);
    } else if (Sel.kind === 'entry') {
      const en = Doc.entries[Sel.name];
      if (!en) return;
      e.preventDefault();
      Doc.setEntry(Sel.name, Math.floor(en[0]) + nudge[0], Math.floor(en[1]) + nudge[1]);
    } else if (Sel.kind === 'wp') {
      const w = Doc.waypoints[Sel.name];
      if (!w) return;
      e.preventDefault();
      Doc.setWaypoint(Sel.name, w[0] + nudge[0], w[1] + nudge[1]);
    } else return;
    Side.refresh();
  },

  /* A quarter turn on the selected object, the same edit the inspector's four
     buttons make — one place, so the key and the buttons cannot drift apart.
     Art only: what an object is solid on and what pressing E does are the same
     whichever way round it is drawn. */
  turn(by) {
    if (Sel.kind !== 'object') { Side.say('Select an object to turn it.'); return; }
    const o = Doc.objects[Sel.i];
    if (!o) return;
    const t = (((o.turn || 0) + by) % 4 + 4) % 4;
    Doc.setObject(Sel.i, 'turn', t || '');
    Side.say((o.name || o.kind) + ' — ' + ['as drawn', 'a quarter turn', 'upside down',
      'three quarters'][t] + '.');
    Side.refresh();
  },

  /* Another one of these, a tile to the right — the same thing the inspector's
     button does, so Ctrl+D and the button cannot drift apart. */
  duplicate() {
    if (Sel.kind !== 'object') { Side.say('Only an object can be duplicated.'); return; }
    const o = Doc.objects[Sel.i];
    if (!o) return;
    const c = clone(o);
    delete c._k;
    c.x = clamp(o.x + 1, 0, Doc.w - 1);
    Doc.addObject(c);
    this.select('object', Doc.objects.length - 1);
  },

  deleteSelection() {
    if (Sel.kind === 'object') Doc.removeObject(Sel.i);
    else if (Sel.kind === 'door') Doc.removeDoor(Sel.i);
    else if (Sel.kind === 'room') Doc.removeRoom(Sel.i);
    else if (Sel.kind === 'counter') Doc.removeCounter(Sel.i);
    else if (Sel.kind === 'entry') Doc.removeEntry(Sel.name);
    else if (Sel.kind === 'wp') Doc.removeWaypoint(Sel.name);
    else return;
    this.select(null);
  }
};
