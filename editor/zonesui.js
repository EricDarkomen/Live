'use strict';
/* ---------------- The zone editor's panes ----------------
   The list is swatches: the zones are told apart by looking. */

const ZonesUI = {
  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },

  filter: '',
  workspace() {
    const el = $('#zonesWork');
    if (!el) return;
    const q = this.filter.toLowerCase();
    const use = Zones.usage();
    const ids = Zones.ids().filter(id => !q
      || id.toLowerCase().indexOf(q) >= 0
      || String((ZONES[id] || {}).name || '').toLowerCase().indexOf(q) >= 0);

    const rows = ids.map(id => {
      const z = id === Zones.id ? Zones.z : ZONES[id];
      const used = use.get(id) || [];
      const tiles = used.reduce((n, r) => n + r.tiles, 0);
      const worst = ZoneCheck.worstFor(id);
      const n = ZoneCheck.countFor(id);
      const chip = c => '<i style="background:' + esc(String(c || '#000')) + '"></i>';
      return '<li data-zone="' + esc(id) + '" class="' + (id === Zones.id ? 'on ' : '') + worst + '">'
        + '<b><span class="swatch">' + chip(z.floor) + chip(z.wall) + chip(z.tint) + '</span>'
        + esc(z.name || id) + '</b>'
        + '<em><code>' + esc(id) + '</code> · '
        + (used.length ? used.length + ' room' + (used.length === 1 ? '' : 's') + ' · ' + tiles + ' tiles'
          : 'nowhere') + '</em>'
        + '<span class="tags">'
        + (z.tile ? '<span class="tag code">' + esc(z.tile) + '</span>' : '')
        + (z.surf ? '<span class="tag">' + esc(z.surf) + '</span>' : '')
        + (z.wsurf ? '<span class="tag">wall ' + esc(z.wsurf) + '</span>' : '')
        + '</span>'
        + (n ? '<span class="badge ' + worst + '">' + n + '</span>' : '')
        + '</li>';
    }).join('');

    el.innerHTML = '<div class="work-head"><h2>Rooms</h2>'
      + '<span class="work-sub">' + Zones.ids().length + ' kinds of room · what a level is made '
      + 'of, and everything about how one looks</span></div>'
      + '<div class="seek"><input id="edZoneSeek" value="' + esc(this.filter)
      + '" placeholder="Find by name or id"></div>'
      + (rows ? '<ul class="list rows">' + rows + '</ul>' : '<p class="empty">No zone matches.</p>');

    const seek = $('#edZoneSeek');
    seek.oninput = () => { this.filter = seek.value; this.workspace(); $('#edZoneSeek').focus(); };
    el.querySelectorAll('li[data-zone]').forEach(li => {
      li.onclick = () => Mode.openSubject(li.dataset.zone);
    });
  },

  /* A colour field is a text box AND a picker, side by side. The text box is
     what the file holds and what gets pasted between zones; the picker is how
     anybody actually chooses a colour. */
  colour(label, k) {
    const v = Zones.z[k];
    const ok = ZoneCheck.colour(v);
    return Side.row(label, '<span class="pair">'
      + '<input type="color" data-col="' + esc(k) + '" value="' + esc(ok ? v : '#000000') + '">'
      + '<input data-f="' + esc(k) + '" value="' + esc(v === undefined ? '' : String(v))
      + '" spellcheck="false">' + '</span>');
  },
  /* ---- choosing a floor or a wall ----
     The tiles themselves, baked through this room's colours. Two rows: the
     atlas rect (which wins) and the procedural surface (the fallback without
     art). Picking a procedural surface while a rect is set clears the rect in
     the same edit. */
  label(n) { return n.replace(/^(floor|wall)\./, '').replace(/\./g, ' · '); },

  cell(where, o) {
    return '<button type="button" class="mat' + (o.on ? ' on' : '') + '"'
      + ' data-mat="' + esc(where) + '" data-set="' + esc(o.set) + '"'
      + ' data-v="' + esc(o.v) + '" data-key="' + esc(o.key) + '"'
      + ' title="' + esc(o.title) + '"><span class="mat-p"></span>'
      + '<b>' + esc(o.label) + '</b></button>';
  },

  material(where) {
    const wall = where === 'wall';
    const kitK = wall ? 'wtile' : 'tile', surfK = wall ? 'wsurf' : 'surf';
    const kit = Zones.z[kitK], surf = Zones.z[surfK] || '';
    const drawn = (wall ? Zones.WSURF : Zones.SURF);
    const plain = wall ? 'plain' : 'carpet';
    const art = [{ set: kitK, v: '', key: 'none', on: !kit, label: 'no art',
      title: 'No rect from the atlas — the drawn surface below is what you get.' }]
      .concat(Zones.materials(where).map(n => ({
        set: kitK, v: n, key: n, on: n === kit, label: this.label(n),
        title: n + ' — a rect in the world atlas, multiplied through this room’s colours.',
      })));
    const surfs = [{ set: surfK, v: '', key: 'plain', on: !surf, label: plain,
      title: 'The default the renderer draws when nothing names a texture.' }]
      .concat(drawn.map(n => ({
        set: surfK, v: n, key: n, on: n === surf, label: n,
        title: n + ' — drawn by the renderer, no art needed.',
      })));

    return '<h4>' + (wall ? 'Walls' : 'Floor') + '</h4>'
      + '<div class="mats">' + art.map(o => this.cell(where, o)).join('') + '</div>'
      + '<div class="matnote">' + (kit
        ? '<code>' + esc(kit) + '</code>'
        : 'No art — drawn by the renderer.') + '</div>'
      + '<div class="mats small' + (kit ? ' muted' : '') + '">'
      + surfs.map(o => this.cell(where, o)).join('') + '</div>'
      + '<div class="matnote">' + (kit
        ? 'Drawn <b>' + esc(surf || plain) + '</b> underneath, which is what a copy of the game '
          + 'without <code>art/</code> shows. Picking one here turns the art off.'
        : 'Drawn <b>' + esc(surf || plain) + '</b>.') + '</div>';
  },

  /* Previews are drawn into canvases after the panel is in the DOM: a data URI
     would need a pixel read, which throws on file://. */
  paint(p) {
    p.querySelectorAll('.mat').forEach(b => {
      const where = b.dataset.mat, patch = {};
      const kitK = where === 'wall' ? 'wtile' : 'tile';
      patch[b.dataset.set] = b.dataset.v || undefined;
      /* A procedural swatch is previewed without the atlas over it. */
      if (b.dataset.set !== kitK) patch[kitK] = undefined;
      const cv = Zones.swatch(where, patch, b.dataset.set + ':' + b.dataset.key);
      const host = b.querySelector('.mat-p');
      if (!cv || !host) return;
      const out = document.createElement('canvas');
      out.width = cv.width; out.height = cv.height;
      out.getContext('2d').drawImage(cv, 0, 0);
      host.appendChild(out);
    });
  },

  wireMaterials(p) {
    p.querySelectorAll('.mat').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.set, v = b.dataset.v;
        const wall = b.dataset.mat === 'wall';
        const kitK = wall ? 'wtile' : 'tile';
        /* One edit and one undo step, said out loud. */
        if (k !== kitK && Zones.z[kitK]) {
          const patch = {};
          patch[k] = v; patch[kitK] = '';
          Zones.setAll('edit ' + k, patch);
          Side.say('Turned the ' + (wall ? 'wall' : 'floor') + ' art off — it would have '
            + 'covered the drawn surface you just chose.');
          return;
        }
        Zones.set(k, v);
      };
    });
  },

  inspect() {
    const p = $('#paneInspect');
    if (!Zones.z) { p.innerHTML = '<p class="empty">No zone open.</p>'; return; }
    const used = Zones.usage().get(Zones.id) || [];
    const where = Play.levelFor(Zones.id);

    p.innerHTML = '<h3>' + esc(Zones.z.name || Zones.id) + '</h3>'
      + '<div class="note">Rooms · <code>' + esc(Zones.id) + '</code></div>'
      + Side.row('called', '<input data-f="name" value="' + esc(Zones.z.name || '') + '">')
      + '<div class="note">What the HUD says you are standing in.</div>'
      + '<h4>Colour</h4>'
      + this.colour('floor', 'floor')
      + this.colour('alternate', 'alt')
      + this.colour('wall', 'wall')
      + this.colour('tint', 'tint')
      + '<div class="note">The two floor shades alternate tile to tile. <b>tint</b> is the minimap '
      + 'and the room chip, not the floor. A wall too close to its own floor in brightness loses '
      + 'the edge of the room — these colours are dark on purpose, which is what makes that easy '
      + 'to do.</div>'
      + this.material('floor')
      + this.material('wall')
      + '<div class="note">A named rect from the world atlas wins over the drawn surface, and is '
      + 'tinted through the colours above — straight from the atlas each material is one flat '
      + 'colour and every room becomes the same room. The drawn surfaces are what the toilets and '
      + 'the fire escape use on purpose, and they are what a copy of the game taken without '
      + '<code>art/</code> falls back to.</div>'
      + '<h4>Where it is <span class="pill">' + used.length + '</span></h4>'
      + (used.length
        ? '<ul class="list tight">' + used.map(r =>
          '<li><b>' + esc((LEVELS[r.level] || {}).name || r.level) + '</b>'
          + '<em>' + r.tiles + ' tiles</em></li>').join('') + '</ul>'
        : '<div class="note bad">No room anywhere is painted with this, so nobody will ever '
          + 'see it. Paint one with the room tool on the Levels tab.</div>')
      + (where
        ? '<div class="btns"><button data-a="try" class="primary">▶ Try it in the game</button></div>'
          + '<div class="note">Opens the game in a new tab on '
          + esc((LEVELS[where] || {}).name || where) + ', with every room type as you have them '
          + 'here. Nothing is written to <code>data/</code> by that — the whole game sheet’s '
          + '<b>Save to the game files</b> is what does that.</div>'
        : '')
      + '<div class="btns"><button data-a="new">New room type…</button>'
      + '<button data-a="dup">Duplicate</button>'
      + '<button data-a="drop" class="warn">Delete</button></div>';

    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => Zones.set(el.dataset.f, el.value);
    });
    /* The picker writes the text box's value, so the two can never disagree —
       and it is `change`, not `input`, or dragging through a gradient marks a
       hundred undo steps. */
    p.querySelectorAll('[data-col]').forEach(el => {
      el.onchange = () => Zones.set(el.dataset.col, el.value);
    });
    p.querySelectorAll('[data-a]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.a === 'new') ZonesMake.create();
        else if (b.dataset.a === 'dup') Mode.duplicate();
        else if (b.dataset.a === 'try') Play.go(where);
        else ZonesMake.drop();
      };
    });
    this.wireMaterials(p);
    this.paint(p);
  },

  check() {
    const p = $('#paneCheck');
    const f = ZoneCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const table = Zones.ids().reduce((n, id) => n + ZoneCheck.countFor(id), 0);
    const unused = Zones.ids().filter(id => !(Zones.usage().get(id) || []).length);
    const group = (list, title, cls) => !list.length ? '' : '<h4>' + esc(title) + '</h4>'
      + '<ul class="faults">' + list.map(x => '<li class="' + cls + '">' + esc(x.msg) + '</li>').join('')
      + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length + '</b><span>broken</span></div>'
      + '<div><b>' + warns.length + '</b><span>warnings</span></div>'
      + '<div><b>' + table + '</b><span>table-wide</span></div>'
      + '</div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this room type.</p>')
      + '<h4>Nowhere in the building <span class="pill">' + unused.length + '</span></h4>'
      + (unused.length
        ? '<ul class="list tight">' + unused.map(id =>
          '<li><b>' + esc((ZONES[id] || {}).name || id) + '</b><em><code>' + esc(id) + '</code></em></li>').join('')
          + '</ul><div class="note">Defined, and no room is painted with them.</div>'
        : '<div class="note">Every room type is used somewhere.</div>');
  },

  exportPane() {
    Side.exportChoices({
      name: () => Zones.id + '.zone.txt',
      choices: [
        { v: 'one', label: 'This room type &rarr; data/world.js',
          src: () => Emit.zoneEntry(Zones.id, Zones.z),
          note: 'One line of ZONES, ready to paste over the old one.' },
        { v: 'all', label: 'The whole ZONES table',
          src: () => Emit.zoneTable(),
          note: 'The whole table with this one as you have it. data/world.js lines its '
            + 'columns up by hand and carries a comment about the outdoor zones; this does not.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.zoneChanges(),
          note: 'What you changed, so you can edit the line rather than replace the table.' }]
    });
  }
};
