'use strict';
/* ---------------- Dialogue ----------------
   A node is `text` (pages, or a function), then `choices` or `to`; `do` runs
   on entry and `done` when the box closes. See data/npcs.js. */
const Dialogue = {
  on: false, npc: null, node: null, pages: [], page: 0, typed: 0, full: '', typing: false, sel: 0,
  speakerId(who) { return who && (who.id || (who.def && who.def.id)); },
  openNPC(npc) {
    /* Being spoken to is company, and some people live for it. */
    if (npc.id) Mind.event(npc.id, 'talked');
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
    /* On a phone the box covers the pad, and movement is locked anyway. */
    document.body.classList.add('talking');
    const id = this.speakerId(who);
    const face = $('#dFace');
    face.style.cssText = '';
    face.classList.remove('live');
    /* Their colour tints the name tag, the ring and the glow. */
    const col = (who.def && who.def.colour) || who.colour || '';
    $('#dialogue').style.setProperty('--who', col || 'var(--brand)');
    /* A live portrait (engine/portrait.js), else a still crop, else the emoji. */
    const alive = id && Portrait.mount(face, id, { crop: 'bust', scale: TOUCH ? 2 : 3, speaker: true });
    const pic = !alive && id && Sprites.portrait(id, TOUCH ? 2 : 3);
    face.classList.toggle('sprite', !!pic);
    if (alive) { /* drawn by Portrait */ }
    else if (pic) { face.textContent = ''; Object.assign(face.style, pic); }
    else face.textContent = who.face || (who.def && who.def.face) || '🧑';
    /* How they feel about you, held on their face for the conversation;
       anything that happens during it flashes over the top. */
    if (id) {
      Faces.hold(id, G.rel[id] !== undefined ? Faces.mood(G.rel[id]) : null);
      this.faceExpr = null;
      this.eyes();
    }
    $('#dName').textContent = (who.name || (who.def && who.def.name) || '???').toUpperCase();
    $('#dRole').textContent = who.role || (who.def && who.def.role) || '';
    /* How they are with you, then the day they are having. */
    const badge = id ? Mind.badge(id) : '';
    $('#dMood').textContent = [id && G.rel[id] !== undefined ? Rel.label(G.rel[id]) : '', badge].filter(Boolean).join(' · ');
    this.setNode(node);
  },
  /* Keep the still portrait's expression up with the conversation: one
     compare a frame until it changes. */
  eyes() {
    if (!this.on) return;
    const face = $('#dFace');
    if (!face || !face.classList.contains('sprite')) return;
    const id = this.speakerId(this.npc);
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
    /* Stale choices would keep swallowing the movement keys. */
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
    /* A blip every third character revealed. */
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
  /* Keyboard selection of choices. */
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
    /* The held expression ends with the conversation; a flash runs its course. */
    const id = this.speakerId(this.npc);
    if (id) Faces.hold(id, null);
    this.faceExpr = null;
    this.on = false; $('#dialogue').classList.remove('on');
    document.body.classList.remove('talking');
    /* A d-pad key held as the box opened never got its touchend. */
    Keys.up = Keys.down = Keys.left = Keys.right = 0;
    const done = this.node && this.node.done;
    this.node = null; this.avail = null; this.sel = 0;
    if (G.state === 'dialogue') G.state = 'play';
    if (done) try { done(); } catch (e) { }
    UI.hud();
  }
};
