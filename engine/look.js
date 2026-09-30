'use strict';
/* ---------------- The character creator ----------------
   Everybody but the player is baked into people.png by the sprite build from
   their `look:` (data/npcs.js). The player is chosen, so the same components
   also ship one PNG each in art/sprites/parts/, and Sprites.compose() stacks
   the picks into one canvas; after that the player is an ordinary sheet. The
   picks are G.look, so a save carries them. */

const Look = {
  /* The stack the build bakes as `player`, and where the creator starts. */
  DEFAULT: PLAYER_LOOK,
  /* Filled from the manifest. */
  groups: [],
  /* Whether the last request is on screen, or failed. */
  ready: false, failed: false,
  /* The preview's own clock, so it walks while the game is paused. */
  _t: 0, _raf: 0,
  /* The latest request per person, so a late component never overwrites a newer pick. */
  _asked: {},

  /* The components a stack names, skipping empty axes. Independent of `groups`,
     which only fill when the screen opens; compose() sorts by z. */
  picks(look) {
    const L = look || G.look || this.DEFAULT;
    return Object.keys(L).map(k => L[k]).filter(Boolean);
  },

  /* Put somebody in these clothes: the baked row if it matches, else fetched and
     stacked, and `done` hears whether it worked. */
  dress(id, look, done) {
    if (!look) { if (done) done(false); return; }
    if (Sprites.bakedLook(id) === Sprites.lookKey(look)) {
      Sprites.uncompose(id);
      if (done) done(true);
      return;
    }
    const picks = this.picks(look);
    const ask = this._asked[id] = (this._asked[id] || 0) + 1;
    Sprites.needParts(picks, ok => {
      if (ask !== this._asked[id]) return;          /* somebody chose again since */
      const on = ok && !!Sprites.compose(id, picks);
      if (done) done(on);
    });
  },
  /* The player's own; safe any time. */
  apply(look, done) {
    const L = look || G.look;
    if (!L) { if (done) done(false); return; }
    this.dress('player', L, ok => {
      this.ready = ok; this.failed = !ok;
      if (done) done(ok);
    });
  },

  /* ---- the rest of the cast ----
     Anybody whose `look:` no longer matches the recipe their row was baked from
     (edited without a rebuild) is dressed from the components instead. */
  stale() {
    return NPCS.filter(d => d && d.look && Sprites.bakedLook(d.id) !== Sprites.lookKey(d.look));
  },
  /* Everybody is composed at boot, so a component worn by six is fetched once. */
  dressCast(then) {
    const who = NPCS.filter(d => d && d.look)
      .concat([{ id: 'player', look: G.look || this.DEFAULT }]);
    let n = 0, left = who.length;
    who.forEach(d => this.dress(d.id, d.look, ok => {
      if (ok) n++;
      if (--left === 0) { Sprites.dropParts(); if (then) then(n); }
    }));
  },

  /* ---- the screen ---- */

  open(opts) {
    /* The wardrobe: the same screen from furniture, returning to the game. */
    this.wardrobe = !!(opts && opts.wardrobe);
    const go = $('#btnLookGo'); if (go) go.textContent = this.wardrobe ? 'Done' : 'Start';
    G.state = 'look';
    $('#nameScreen').classList.remove('on');
    $('#lookScreen').classList.add('on');
    /* A returning player keeps their character. */
    if (!G.look) G.look = { ...this.DEFAULT };
    /* The menus come off the manifest, so the screen works at once and the
       pixels arrive behind it. */
    this.groups = Sprites.partGroups();
    this.fit();
    this.render();
    this.spin();
    this.put();
  },
  /* Show G.look, saying so while components load or if they fail (the baked
     row still stands, so it is not fatal). */
  put() {
    let done = false;
    setTimeout(() => { if (!done) this.say('Fetching the wardrobe…'); }, 120);
    this.apply(null, ok => {
      done = true;
      this.say(ok ? '' : 'The wardrobe did not arrive — the default look will be used.');
    });
  },
  say(msg) {
    const el = $('#lookNote');
    if (el) { el.textContent = msg; el.classList.toggle('on', !!msg); }
  },
  close() {
    $('#lookScreen').classList.remove('on');
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  },

  /* Changing build re-points every fitted garment at the same one in the other
     fit, or that axis's first option. */
  fit() {
    const base = this.item('base', G.look.base);
    const want = base && base.fit;
    if (!want) return;
    this.groups.forEach(g => {
      /* Never the base: it is the axis the build is chosen on. */
      if (g.k === 'base') return;
      const cur = this.item(g.k, G.look[g.k]);
      if (!cur || !cur.fit || cur.fit === want) return;
      /* The same garment, by the half of the id that names it. */
      const tail = String(cur.id).split('/').slice(1).join('/');
      const swap = g.items.find(it => it.fit === want && String(it.id).split('/').slice(1).join('/') === tail)
        || g.items.find(it => it.fit === want);
      G.look[g.k] = swap ? swap.id : null;
    });
  },
  group(k) { return this.groups.find(g => g.k === k) || null; },
  item(k, id) {
    const g = this.group(k);
    return g ? g.items.find(it => it.id === id) || null : null;
  },
  /* What an axis offers for the chosen build; the base offers every build. */
  options(g) {
    if (g.k === 'base') return g.items;
    const base = this.item('base', G.look.base);
    const want = base && base.fit;
    return g.items.filter(it => !it.fit || !want || it.fit === want);
  },

  render() {
    const box = $('#lookPick');
    if (!box) return;
    box.innerHTML = this.groups.map(g => {
      const opts = this.options(g);
      const cur = G.look[g.k];
      return '<div class="look-row"><label for="lk-' + esc(g.k) + '">' + esc(g.label) + '</label>'
        + '<select id="lk-' + esc(g.k) + '" data-g="' + esc(g.k) + '">'
        + (g.optional ? '<option value="">None</option>' : '')
        + opts.map(it => '<option value="' + esc(it.id) + '"'
          + (it.id === cur ? ' selected' : '') + '>' + esc(it.label) + '</option>').join('')
        + '</select></div>';
    }).join('');
    box.querySelectorAll('select').forEach(sel => {
      sel.onchange = () => {
        G.look[sel.dataset.g] = sel.value || null;
        /* A new build re-points the wardrobe, so the menus are rebuilt too. */
        if (sel.dataset.g === 'base') { this.fit(); this.render(); }
        this.put();
        Sfx.select();
      };
    });
  },

  /* One of everything at random, within the build's wardrobe. */
  random() {
    /* Off the manifest, so it works before the pixels land. */
    if (!this.groups.length) return;
    const bases = this.group('base');
    if (bases) G.look.base = pick(bases.items).id;
    this.groups.forEach(g => {
      if (g.k === 'base') return;
      const opts = this.options(g);
      if (!opts.length) { G.look[g.k] = null; return; }
      /* An optional axis is sometimes empty. */
      G.look[g.k] = g.optional && chance(.45) ? null : pick(opts).id;
    });
    this.render();
    this.put();
    Sfx.select();
  },

  /* ---- the preview: the real sprite, walking on the spot, so every layer shows in every frame ---- */
  spin() {
    const cv = $('#lookView');
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const draw = () => {
      this._raf = requestAnimationFrame(draw);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      if (!Sprites.has('player')) return;
      this._t += 1 / 60;
      /* Turning every couple of seconds, so every direction is seen. */
      const dir = [2, 3, 0, 1][Math.floor(this._t / 2) % 4];
      const frame = Sprites.frame('player', true, this._t * 8);
      const box = Sprites.box('player', 0, 0);
      /* A whole-number scale: this is pixel art. */
      const z = Math.max(2, Math.min(4, Math.floor((h - 20) / box.h)));
      c.imageSmoothingEnabled = false;
      c.save();
      c.translate(w / 2, h / 2 + (box.h * z) / 2 - Sprites.FOOT * z);
      c.scale(z, z);
      Sprites.draw(c, 'player', dir, frame, 0, 0);
      c.restore();
    };
    if (this._raf) cancelAnimationFrame(this._raf);
    draw();
  },

  /* Done: the stack is already in G. */
  accept() {
    this.close();
    Sfx.select();
    if (this.wardrobe) {
      this.wardrobe = false;
      G.state = 'play';
      UI.toast('👙', 'Looking good. Somebody on the beach is going to notice.', 'gold');
      return;
    }
    Cut.start();
  },
};
