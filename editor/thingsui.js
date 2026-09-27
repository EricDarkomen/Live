'use strict';
/* ---------------- The object editor's panes ----------------
   One row per kind, and the panel is the three files at once: how it is
   furnished, what pressing it does, and every one of them in the building.
   The level editor moves one object; this moves what all of them are. */

const ThingsUI = {
  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },

  /* ---- the workspace ---- */
  filter: '',
  FILTERS: [
    { k: 'all', label: 'Everything' },
    { k: 'act', label: 'With an act' },
    { k: 'furn', label: 'Furnished' },
    { k: 'plain', label: 'Default' },
    { k: 'fault', label: 'Flagged' },
  ],
  only: 'all',
  workspace() {
    const el = $('#thingsWork');
    if (!el) return;
    const q = this.filter.toLowerCase();
    let ids = Things.ids();
    if (this.only === 'act') ids = ids.filter(k => Things.entry(k).uses.size);
    else if (this.only === 'furn') ids = ids.filter(k => FURN[k]);
    else if (this.only === 'plain') ids = ids.filter(k => !FURN[k]);
    else if (this.only === 'fault') ids = ids.filter(k => ThingCheck.countFor(k));
    if (q) ids = ids.filter(k => k.toLowerCase().indexOf(q) >= 0
      || Array.from(Things.entry(k).uses).some(u => u.toLowerCase().indexOf(q) >= 0));

    const rows = ids.map(k => {
      const e = Things.entry(k);
      const f = FURN[k];
      const worst = ThingCheck.worstFor(k);
      const n = ThingCheck.countFor(k);
      const tags = [];
      if (f && f.mount) tags.push('<span class="tag">' + esc(f.mount) + '</span>');
      if (f && f.sprite) tags.push('<span class="tag code">' + esc(f.sprite) + '</span>');
      if (!f) tags.push('<span class="tag">default</span>');
      e.uses.forEach(u => tags.push('<span class="tag in">' + esc(u) + '</span>'));
      return '<li data-kind="' + esc(k) + '" class="' + (k === Things.id ? 'on ' : '') + worst + '">'
        + '<b><span class="li-e">' + esc(e.emoji || '·') + '</span>' + esc(k) + '</b>'
        + '<em>' + e.places.length + ' in the building'
        + (f && f.size ? ' · ' + f.size + 'px' : '') + '</em>'
        + '<span class="tags">' + tags.join('') + '</span>'
        + (n ? '<span class="badge ' + worst + '">' + n + '</span>' : '')
        + '</li>';
    }).join('');

    el.innerHTML = '<div class="work-head"><h2>Objects</h2>'
      + '<span class="work-sub">' + Things.ids().length + ' kinds · how they are furnished, what '
      + 'they do, and where they are</span></div>'
      + '<div class="seek">'
      + '<input id="edThingSeek" value="' + esc(this.filter) + '" placeholder="Find by kind or use">'
      + '<div class="chips">' + this.FILTERS.map(f =>
        '<button data-only="' + f.k + '" class="' + (f.k === this.only ? 'on' : '') + '">'
        + esc(f.label) + '</button>').join('') + '</div></div>'
      + (rows ? '<ul class="list rows">' + rows + '</ul>'
        : '<p class="empty">No kind matches.</p>');

    const seek = $('#edThingSeek');
    seek.oninput = () => { this.filter = seek.value; this.workspace(); $('#edThingSeek').focus(); };
    el.querySelectorAll('[data-only]').forEach(b => {
      b.onclick = () => { this.only = b.dataset.only; this.workspace(); };
    });
    el.querySelectorAll('[data-kind]').forEach(li => {
      li.onclick = () => Mode.openSubject(li.dataset.kind);
    });
  },

  /* ---- the panel ---- */
  inspect() {
    const p = $('#paneInspect');
    const e = Things.entry();
    if (!e) { p.innerHTML = '<p class="empty">No kind open.</p>'; return; }
    const f = Things.furn;
    const names = Tiles.rects ? Object.keys(Tiles.rects).sort() : [];
    const extra = {};
    if (f) Object.keys(f).forEach(k => {
      if (['mount', 'size', 'sprite', 'art', 'drawn'].indexOf(k) < 0) extra[k] = f[k];
    });

    p.innerHTML = '<h3><span class="h-e">' + esc(e.emoji || '·') + '</span>' + esc(Things.id) + '</h3>'

      + '<h4>How it is furnished</h4>'
      + (f
        ? Side.row('mount', '<select data-f="mount">'
          + [['', 'the floor'], ['wall', 'on a wall'], ['surface', 'on a worktop']].map(([v, l]) =>
            '<option value="' + v + '"' + ((f.mount || '') === v ? ' selected' : '') + '>' + l
            + '</option>').join('') + '</select>')
          + Side.row('size', '<input type="number" data-f="size" value="' + (f.size || '') + '" min="6" max="64">')
          + Side.row('sprite', '<select data-f="sprite">'
            + '<option value=""' + (f.sprite ? '' : ' selected') + '>— none, the emoji —</option>'
            + names.map(n => '<option value="' + esc(n) + '"' + (n === f.sprite ? ' selected' : '') + '>'
              + esc(n) + '</option>').join('') + '</select>')
          + Side.row('drawn by R', '<input data-f="art" value="' + esc(f.art || '') + '" '
            + 'placeholder="a case in R.wallArt()">')
          + Side.row('no emoji', '<input type="checkbox" data-f="drawn"' + (f.drawn ? ' checked' : '') + '>')
          + (Object.keys(extra).length
            ? Side.row('other', '<code>' + esc(JSON.stringify(extra)) + '</code>') : '')
          + '<div class="note">A wall-mounted thing <b>needs a wall</b>: wallSide is resolved from '
          + 'the four neighbours and an object in open floor stays on the floor. When something '
          + 'wants a wall, move the object to the row against one rather than loosening this.</div>'
          + '<div class="btns"><button data-a="unfurnish" class="warn">Back to the default</button></div>'
        : '<div class="note">No FURN entry, so every one of these is 27px on the floor. That is '
          + 'opt-in by design — adding a kind to FURN is a decision, and most kinds are only ever '
          + 'a label on an object.</div>'
          + '<div class="btns"><button data-a="furnish" class="primary">Give it a FURN entry</button></div>')

      + '<h4>What pressing it does</h4>'
      + (e.uses.size
        ? Array.from(e.uses).map(u => this.actCard(u)).join('')
        : '<p class="empty">Nothing. No object of this kind carries a <code>use</code>, so '
          + 'Interact never offers one.</p>')

      + '<h4>Where they are <span class="pill">' + e.places.length + '</span></h4>'
      + (e.places.length
        ? '<ul class="list tight">' + e.places.slice(0, 40).map((pl, i) =>
          '<li data-go="' + i + '"><b>' + esc(pl.name || Things.id) + '</b>'
          + '<em>' + esc(pl.level) + ' (' + pl.x + ',' + pl.y + ')'
          + (pl.use ? ' · ' + esc(pl.use) : '') + '</em></li>').join('') + '</ul>'
          + (e.places.length > 40 ? '<p class="empty">' + (e.places.length - 40) + ' more.</p>' : '')
        : '<p class="empty">None in the building.</p>')
      + '<div class="note">Choosing one opens its level and walks the map to it.</div>';

    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        const k = el.dataset.f;
        if (k === 'drawn') Things.set('drawn', el.checked ? true : '');
        else if (k === 'size') Things.set('size', el.value === '' ? '' : (+el.value || 0));
        else Things.set(k, el.value);
      };
    });
    const fu = p.querySelector('[data-a="furnish"]');
    if (fu) fu.onclick = () => Things.furnish();
    const un = p.querySelector('[data-a="unfurnish"]');
    if (un) un.onclick = () => Things.unfurnish();
    p.querySelectorAll('[data-go]').forEach(li => {
      li.onclick = () => this.goTo(e.places[+li.dataset.go]);
    });
  },

  /* The act behind a `use`, with its source. Read off the loaded function, so
     what is shown is what will run — and the panel is honest that this is the
     one thing here it cannot edit: data/acts.js is where most of the writing
     lives, and an editor that regenerated it would flatten the lot. */
  actCard(use) {
    const src = Things.act(use);
    return '<div class="step">'
      + '<div class="step-h"><span class="step-n">' + esc(use) + '</span></div>'
      + (src
        ? '<pre class="actsrc">' + esc(src.length > 900 ? src.slice(0, 900) + '\n…' : src) + '</pre>'
        : '<div class="note bad">There is no <code>Acts.' + esc(use) + '</code>. Pressing E on '
          + 'one of these does nothing at all.</div>')
      + '</div>';
  },

  goTo(pl) {
    if (!pl) return;
    Mode.set('levels');
    Ed.open(pl.level);
    setTimeout(() => {
      Side.centre(pl.x, pl.y);
      const at = Doc.objectsAt(pl.x, pl.y);
      if (at.length) Tools.select('object', at[at.length - 1].i);
    }, 0);
  },

  /* ---- check ---- */
  check() {
    const p = $('#paneCheck');
    const f = ThingCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const table = Things.ids().reduce((n, k) => n + ThingCheck.countFor(k), 0);
    const orphans = ThingCheck.orphanActs();
    const group = (list, title, cls) => !list.length ? '' : '<h4>' + title + '</h4>'
      + '<ul class="faults">' + list.map(x => '<li class="' + cls + '">' + esc(x.msg) + '</li>').join('')
      + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b>' + (Things.entry() ? Things.entry().places.length : 0) + '</b><span>placed</span></div>'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length + '</b><span>broken</span></div>'
      + '<div><b>' + table + '</b><span>table-wide</span></div>'
      + '</div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this kind.</p>')
      + '<h4>Acts nothing reaches <span class="pill">' + orphans.length + '</span></h4>'
      + (orphans.length
        ? '<ul class="list tight">' + orphans.map(a =>
          '<li><b>' + esc(a) + '</b></li>').join('') + '</ul>'
          + '<div class="note">Handlers in data/acts.js that no object names. Some are reached '
          + 'from a link or from another act rather than from a <code>use</code>, so this is a '
          + 'list to read rather than a fault to fix — but writing that cannot be got to is the '
          + 'same fault as an unreachable dialogue node, and just as invisible.</div>'
        : '<p class="ok">✓ Every act is named by something.</p>');
  },

  /* ---- export ---- */
  exportPane() {
    Side.exportChoices({
      name: () => Things.id + '.furn.txt',
      choices: [
        { v: 'one', label: 'This kind &rarr; data/world.js',
          src: () => Emit.furnEntry(Things.id, Things.furn),
          note: 'One line of FURN. The table is keyed by `kind`, and the entries at '
            + 'the end of it win the merge — which is how the sprites are added to kinds that '
            + 'already had a size.' },
        { v: 'all', label: 'The whole FURN table',
          src: () => Emit.furnTable(),
          note: 'The whole table, with this kind as you have it. data/world.js writes '
            + 'it with comments explaining each group; this does not, so paste a line rather than '
            + 'the block unless you mean it.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.furnChanges(),
          note: 'What you changed, so you can edit the line rather than replace the table.' }]
    });
  }
};
