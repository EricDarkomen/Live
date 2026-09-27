'use strict';
/* ---------------- DialogueSystem ---------------- */
const Dialogue = {
  on: false, npc: null, node: null, pages: [], page: 0, typed: 0, full: '', typing: false, sel: 0,
  openNPC(npc) {
    const id = npc.def.entry ? npc.def.entry() : 'again';
    const node = npc.def.nodes[id] || npc.def.nodes.again || { text: ['...'] };
    this.open(npc, node, npc.def);
  },
  say(face, name, role, pages, choices, onDone) {
    this.open({ face, name, role, x: P.x, y: P.y }, { text: pages, choices: choices || null, done: onDone }, null);
  },
  open(who, node, def) {
    G.state = 'dialogue'; this.on = true; this.npc = who; this.def = def || (who.def || null);
    $('#dialogue').classList.add('on');
    /* The dialogue box owns the bottom of a phone screen, so the pad sits under
       it and cannot be tapped. Movement is locked here anyway — take the pad
       away and let the box itself be the tap target. */
    document.body.classList.add('talking');
    const id = who.id || (who.def && who.def.id);
    /* Portrait: the character's own sprite head where there is one, so the
       face in the box is the person you walked up to. Callers on the phone and
       anyone without a sprite keep their emoji. */
    const face = $('#dFace');
    const pic = id && Sprites.portrait(id, TOUCH ? 2 : 3);
    face.classList.toggle('sprite', !!pic);
    face.style.cssText = '';
    if (pic) { face.textContent = ''; Object.assign(face.style, pic); }
    else face.textContent = who.face || (who.def && who.def.face) || '🧑';
    /* How they are with you, on their face rather than only in the line of
       text beside it. Held for the conversation and cleared when you walk
       away — anything that happens DURING it (see Rel.add) flashes over the
       top of this and then hands it back. */
    if (typeof Faces !== 'undefined' && id) {
      Faces.hold(id, G.rel[id] !== undefined ? Faces.mood(G.rel[id]) : null);
      this.faceExpr = null;
      this.eyes();
    }
    $('#dName').textContent = (who.name || (who.def && who.def.name) || '???').toUpperCase();
    $('#dRole').textContent = who.role || (who.def && who.def.role) || '';
    $('#dMood').textContent = id && G.rel[id] !== undefined ? Rel.label(G.rel[id]) : '';
    this.setNode(node);
  },
  /* The portrait's expression, kept up with the conversation. A face that is
     set once when the box opens is a photograph: this is the same person
     blinking, and pleased or unimpressed by what you just said, while you
     read what they said back. Cheap enough to do every frame — it is one
     string compare until the expression actually changes. */
  eyes() {
    if (typeof Faces === 'undefined' || !this.on) return;
    const face = $('#dFace');
    if (!face || !face.classList.contains('sprite')) return;
    const id = this.npc && (this.npc.id || (this.npc.def && this.npc.def.id));
    const expr = id ? Faces.of(id) : null;
    if (expr === this.faceExpr) return;
    this.faceExpr = expr;
    const style = id && expr ? Faces.portrait(id, TOUCH ? 2 : 3) : null;
    let el = face.firstElementChild;
    if (!style) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('i'); el.className = 'expr'; face.appendChild(el); }
    el.style.cssText = '';
    Object.assign(el.style, style);
  },
  setNode(node) {
    this.node = node; this.sel = 0;
    if (node.do) { try { node.do(); } catch (e) { console.warn(e); } }
    let t = node.text; if (typeof t === 'function') t = t();
    this.pages = Array.isArray(t) ? t.slice() : [t];
    this.page = 0; this.showPage();
  },
  showPage() {
    this.full = this.pages[this.page] || '';
    this.typed = 0; this.typing = true;
    /* stale choices left in `avail` would keep swallowing the movement keys */
    this.avail = null; this.sel = 0;
    $('#dChoices').innerHTML = ''; $('#dCont').textContent = TOUCH ? 'Tap to continue' : 'Space — continue';
    this.render();
  },
  render() {
    const el = $('#dText');
    el.innerHTML = esc(this.full.slice(0, this.typed)) + (this.typing ? '<span class="cursor"></span>' : '');
  },
  speed: 62,
  tick(dt) {
    if (!this.on) return;
    this.eyes();
    if (!this.typing) return;
    const before = Math.floor(this.typed);
    this.typed += dt * this.speed;
    /* One blip every few characters actually revealed, rather than per frame —
       the old modulo test fired at frame rate and stacked up oscillators. */
    if (Math.floor(this.typed / 3) !== Math.floor(before / 3)) Sfx.talk();
    if (this.typed >= this.full.length) { this.typed = this.full.length; this.typing = false; this.afterType(); }
    this.render();
  },
  afterType() {
    this.render();
    const last = this.page >= this.pages.length - 1;
    if (!last) return;
    const ch = this.node.choices;
    if (ch) {
      const box = $('#dChoices'); box.innerHTML = '';
      const avail = ch.filter(c => !c.if || c.if());
      this.avail = avail;
      avail.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'choice'; b.type = 'button';
        b.innerHTML = '<span class="num">' + (i + 1) + '</span><span>' + esc(typeof c.t === 'function' ? c.t() : c.t) + '</span>' + (c.tag ? '<span class="tag">' + c.tag + '</span>' : '');
        b.onclick = () => this.choose(i);
        b.onmousemove = () => this.select(i);
        box.appendChild(b);
      });
      this.sel = 0; this.highlight();
      $('#dCont').textContent = TOUCH
        ? 'Tap a reply'
        : '↑ ↓ and Enter · number keys · or click — Esc to walk away';
    } else {
      $('#dCont').textContent = TOUCH
        ? (this.node.to ? 'Tap to continue' : 'Tap to end conversation')
        : (this.node.to ? 'Space — continue' : 'Space — end conversation');
    }
  },
  /* Keyboard selection of dialogue choices. The .sel style existed from the
     start but nothing ever applied it. */
  select(i) {
    const n = (this.avail || []).length; if (!n) return;
    this.sel = ((i % n) + n) % n;
    this.highlight();
  },
  move(d) { if (this.avail && this.avail.length) { this.select(this.sel + d); Sfx.blip(); } },
  highlight() {
    const kids = $('#dChoices').children;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('sel', i === this.sel);
  },
  choose(i) {
    const c = (this.avail || [])[i]; if (!c) return;
    Sfx.select();
    if (c.do) { try { c.do(); } catch (e) { console.warn(e); } }
    if (c.to && this.def && this.def.nodes && this.def.nodes[c.to]) this.setNode(this.def.nodes[c.to]);
    else if (c.to && typeof c.to === 'object') this.setNode(c.to);
    else this.close();
  },
  advance() {
    if (!this.on) return;
    if (this.typing) { this.typed = this.full.length; this.typing = false; this.afterType(); return; }
    if (this.page < this.pages.length - 1) { this.page++; this.showPage(); return; }
    if (this.node.choices) return;
    if (this.node.to && this.def && this.def.nodes && this.def.nodes[this.node.to]) { this.setNode(this.def.nodes[this.node.to]); return; }
    this.close();
  },
  close() {
    /* The expression was for the conversation, not for the rest of the day.
       A flash set during it is left alone: it is already on its own clock and
       will run out on the floor, which is the point of it. */
    if (typeof Faces !== 'undefined') {
      const id = this.npc && (this.npc.id || (this.npc.def && this.npc.def.id));
      if (id) Faces.hold(id, null);
    }
    this.faceExpr = null;
    this.on = false; $('#dialogue').classList.remove('on');
    document.body.classList.remove('talking');
    /* A d-pad key held when the conversation started never received its
       touchend, so clear the direction rather than walking off on your own. */
    Keys.up = Keys.down = Keys.left = Keys.right = 0;
    const done = this.node && this.node.done;
    this.node = null; this.avail = null; this.sel = 0;
    if (G.state === 'dialogue') G.state = 'play';
    if (done) try { done(); } catch (e) { }
    UI.hud();
  }
};
