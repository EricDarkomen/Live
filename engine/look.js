'use strict';
/* ---------------- The character creator ----------------
   Section 2 of the new starter form. Everybody in the building is made of the
   same components — the catalogue in tools/sheets/people.mjs — and everybody
   but the player is baked into people.png at build time from the `look:`
   data/npcs.js gives them. The player is the one person who cannot be baked,
   because the player is chosen.

   So the same components ship a second way, one small PNG each in
   art/sprites/parts/, and Sprites.compose() stacks the chosen ones into a
   single canvas when somebody picks them. After that the player is an ordinary
   sheet and the renderer has no idea any of this happened.

   Three things this must never do:

     - Read pixels back. The parts sit beside index.html and a file:// page
       taints every canvas they are drawn into, so compose() draws and never
       reads. (Its one toDataURL() is guarded and expected to fail there.)
     - Fetch components nobody is wearing. There are four hundred of them;
       Sprites.needParts() brings in exactly the picks, and a player who takes
       the default fetches none at all — the build baked that person already.
     - Block on them arriving. Until they do, the player is the baked row,
       which is a real character rather than an error. */

const Look = {
  /* The stack the build bakes as `player`, and what the creator opens on, so
     the first thing you see is the person the game would have given you
     anyway. It lives in data/npcs.js beside everybody else's. */
  DEFAULT: typeof PLAYER_LOOK !== 'undefined' ? PLAYER_LOOK : {},
  /* Filled from the manifest, so adding a hairstyle is a change to the build
     and to nothing here. */
  groups: [],
  /* Whether the last thing asked for is on screen, and whether it could not
     be. Read by the creator's note and by the suite. */
  ready: false, failed: false,
  /* The preview's own clock, so it walks on the spot while the game is not
     running. */
  _t: 0, _raf: 0,
  /* Which request is the latest, per person. Picks arrive faster than files
     do, and a component that lands late must not overwrite a newer choice. */
  _asked: {},

  /* Which components a stack names, skipping the axes left empty.
     Deliberately independent of `groups`: the menus are only filled when the
     SCREEN is opened, and this also runs on the save-load path where it never
     is. Order does not matter because compose() sorts by each axis's own z. */
  picks(look) {
    const L = look || G.look || this.DEFAULT;
    return Object.keys(L).map(k => L[k]).filter(Boolean);
  },

  /* Put somebody in these clothes. The build may already have: a look that is
     exactly the row it baked is that row, with nothing fetched and nothing
     composed. Anything else is fetched and stacked, and `done` hears whether
     it worked. */
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
  /* The player's own. Safe to call at any time — a save written before any of
     this existed has no look and keeps the baked row. */
  apply(look, done) {
    const L = look || G.look;
    if (!L) { if (done) done(false); return; }
    this.dress('player', L, ok => {
      this.ready = ok; this.failed = !ok;
      if (done) done(ok);
    });
  },

  /* ---- THE REST OF THE CAST ----
     Baked, all of them, from their `look:`. The one case this handles is a
     look changed in data/npcs.js WITHOUT a rebuild — which is exactly what
     the people editor does and what a person editing the file by hand does
     before remembering the build. The row the build baked says which recipe
     it was made from, and anybody whose recipe no longer matches is dressed
     here from the same components, so the data is always what is drawn. In a
     build that is up to date this finds nobody and fetches nothing. */
  stale() {
    if (typeof NPCS === 'undefined') return [];
    return NPCS.filter(d => d && d.look && Sprites.bakedLook(d.id) !== Sprites.lookKey(d.look));
  },
  /* EVERYBODY is composed at boot from the shared components — the player's
     default included — so a component worn by six people is fetched and
     decoded once, and dropped again when the last of them is stacked. */
  dressCast(then) {
    const who = (typeof NPCS === 'undefined' ? [] : NPCS.filter(d => d && d.look))
      .concat([{ id: 'player', look: G.look || this.DEFAULT }]);
    let n = 0, left = who.length;
    who.forEach(d => this.dress(d.id, d.look, ok => {
      if (ok) n++;
      if (--left === 0) { Sprites.dropParts(); if (then) then(n); }
    }));
  },

  /* ---- the screen ---- */

  open(opts) {
    /* The wardrobe: the same screen opened mid-game from a piece of furniture,
       which goes back to the game rather than on to the opening. */
    this.wardrobe = !!(opts && opts.wardrobe);
    const go = $('#btnLookGo'); if (go) go.textContent = this.wardrobe ? 'Done' : 'Start';
    G.state = 'look';
    $('#nameScreen').classList.remove('on');
    $('#lookScreen').classList.add('on');
    /* Somebody who has already made a character and come back keeps it. */
    if (!G.look) G.look = { ...this.DEFAULT };
    /* The MENUS come off the manifest, which is already loaded — a variant's
       id, label and fit are text, and only its pixels are in the PNGs. So the
       screen is complete and usable the instant it opens, showing the row the
       build baked, and the wardrobe arrives behind it. An earlier version put
       the whole screen behind that fetch and stalled 274KB deep on the one step
       between naming yourself and starting work. */
    this.groups = Sprites.partGroups();
    this.fit();
    this.render();
    this.spin();
    this.put();
  },
  /* Whatever G.look now says, on the screen — saying so while the components
     are on their way, and saying so if they never arrive. A failure is not
     something the player can act on and not fatal: the baked row is a
     perfectly good call-centre employee. */
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

  /* Clothing is cut for one build, so changing build has to drag the wardrobe
     with it: a masculine top on a feminine body is not a look, it is a hole.
     Every axis that locks to a fit is re-pointed at the same garment in the
     other fit where there is one, and at that axis's first option where there
     is not. */
  fit() {
    const base = this.item('base', G.look.base);
    const want = base && base.fit;
    if (!want) return;
    this.groups.forEach(g => {
      /* Never the base: it is the axis the build is chosen ON, and re-pointing
         it at "the same garment in the other fit" is how the first version
         nulled the very thing that had just been picked. */
      if (g.k === 'base') return;
      const cur = this.item(g.k, G.look[g.k]);
      if (!cur || !cur.fit || cur.fit === want) return;
      /* The same garment in the other build, by the half of the id that names
         it rather than the half that names the fit. */
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
  /* What one axis may offer, given the build that is chosen. Clothing is cut
     for one build so it is filtered; the base group is where the build is
     chosen and must always offer all of them, or picking one takes the others
     off the menu. */
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
        /* Changing the build re-points the wardrobe, so the menus themselves
           have to be rebuilt — not just the preview. */
        if (sel.dataset.g === 'base') { this.fit(); this.render(); }
        this.put();
        Sfx.select();
      };
    });
  },

  /* One of everything, at random, respecting the build's own wardrobe. */
  random() {
    /* Off the manifest, so it works before the pixels land — the preview simply
       catches up when they do. */
    if (!this.groups.length) return;
    const bases = this.group('base');
    if (bases) G.look.base = pick(bases.items).id;
    this.groups.forEach(g => {
      if (g.k === 'base') return;
      const opts = this.options(g);
      if (!opts.length) { G.look[g.k] = null; return; }
      /* An optional axis is sometimes genuinely empty — not everybody has a
         beard, and a creator that always gives you one is not random. */
      G.look[g.k] = g.optional && chance(.45) ? null : pick(opts).id;
    });
    this.render();
    this.put();
    Sfx.select();
  },

  /* ---- the preview ----
     The real sprite, drawn by the real code, walking on the spot. A still
     picture would hide the one thing worth checking — that every layer is
     present in every frame. */
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
      /* Turn on the spot every couple of seconds, so every direction is seen —
         a character creator that only ever shows a back is no use. */
      const dir = [2, 3, 0, 1][Math.floor(this._t / 2) % 4];
      const frame = Sprites.frame('player', true, this._t * 8);
      const box = Sprites.box('player', 0, 0);
      /* A WHOLE-number scale, because this is pixel art and the whole point of
         the screen is to look at the pixels — 2.4x is a character with some
         rows of it twice as tall as the others. */
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

  /* Done. The stack is already in G, so it is already in the save. */
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
