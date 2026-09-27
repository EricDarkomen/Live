'use strict';
/* ---------------- The reward editor's panes ----------------
   Four tables in one list, like the phones. What makes this one worth having is
   the two questions it can answer that nothing else can: whether an achievement
   is reachable, and whether a skill does anything. */

const ProgUI = {
  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },

  filter: '',
  only: 'all',
  FILTERS: [
    { k: 'all', label: 'Everything' },
    { k: 'item', label: 'Items' },
    { k: 'shop', label: 'Shops' },
    { k: 'skill', label: 'Skills' },
    { k: 'ach', label: 'Achievements' },
    { k: 'fault', label: 'Flagged' },
  ],
  workspace() {
    const el = $('#progWork');
    if (!el) return;
    const q = this.filter.toLowerCase();
    const here = Prog.key();

    const blocks = Prog.groups().map(g => {
      let items = g.items;
      const kind = items.length ? items[0][0].split(':')[0] : '';
      if (this.only !== 'all' && this.only !== 'fault' && this.only !== kind) return '';
      if (this.only === 'fault') items = items.filter(([key]) => ProgCheck.countFor(key));
      if (q) items = items.filter(([key, label]) =>
        label.toLowerCase().indexOf(q) >= 0 || key.toLowerCase().indexOf(q) >= 0);
      if (!items.length) return '';
      const rows = items.map(([key, label]) => {
        const worst = ProgCheck.worstFor(key);
        const n = ProgCheck.countFor(key);
        return '<li data-key="' + esc(key) + '" class="' + (key === here ? 'on ' : '') + worst + '">'
          + '<b>' + esc(label) + '</b><em>' + esc(this.blurb(key)) + '</em>'
          + (n ? '<span class="badge ' + worst + '">' + n + '</span>' : '')
          + '</li>';
      }).join('');
      return '<h4>' + esc(g.label) + ' <span class="pill">' + items.length + '</span></h4>'
        + '<ul class="list rows">' + rows + '</ul>';
    }).join('');

    el.innerHTML = '<div class="work-head"><h2>What you get for it</h2>'
      + '<span class="work-sub">what the player carries, buys, unlocks and earns</span></div>'
      + '<div class="seek">'
      + '<input id="edProgSeek" value="' + esc(this.filter) + '" placeholder="Find by name or id">'
      + '<div class="chips">' + this.FILTERS.map(f =>
        '<button data-only="' + f.k + '" class="' + (f.k === this.only ? 'on' : '') + '">'
        + esc(f.label) + '</button>').join('') + '</div></div>'
      + (blocks || '<p class="empty">Nothing matches.</p>');

    const seek = $('#edProgSeek');
    seek.oninput = () => { this.filter = seek.value; this.workspace(); $('#edProgSeek').focus(); };
    el.querySelectorAll('[data-only]').forEach(b => {
      b.onclick = () => { this.only = b.dataset.only; this.workspace(); };
    });
    el.querySelectorAll('li[data-key]').forEach(li => {
      li.onclick = () => Mode.openSubject(li.dataset.key);
    });
  },
  blurb(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    const e = Prog.entry(kind, id);
    if (!e) return '';
    if (kind === 'item') return [e.slot ? 'worn: ' + e.slot : null, e.use ? 'used' : null,
      e.quest ? 'quest' : null, e.v ? '£' + e.v : null].filter(Boolean).join(' · ') || 'carried';
    if (kind === 'shop') return ((e.stock || []).length) + ' on the shelf';
    if (kind === 'skill') return Object.keys(e.list || {}).length + ' skills';
    return e.d || '';
  },

  inspect() {
    const p = $('#paneInspect');
    if (!Prog.it) { p.innerHTML = '<p class="empty">Nothing open.</p>'; return; }
    const k = Prog.kind;
    p.innerHTML = '<h3>' + esc(Prog.label(k, Prog.id)) + '</h3>'
      + '<div class="note">' + esc(Prog.def().label) + ' · <code>' + esc(Prog.id) + '</code></div>'
      + (k === 'item' ? this.item() : k === 'shop' ? this.shop()
        : k === 'skill' ? this.skill() : this.ach())
      + '<div class="btns"><button data-a="new">New…</button>'
      + '<button data-a="dup">Duplicate</button>'
      + '<button data-a="drop" class="warn">Delete</button></div>';
    this.wire(p);
  },

  f(label, k, type) {
    const v = Prog.it[k];
    return Side.row(label, '<input data-f="' + esc(k) + '"' + (type === 'num' ? ' type="number" step="any"' : '')
      + ' value="' + esc(v === undefined || v === null ? '' : String(v)) + '">');
  },
  sel(label, k, list, none) {
    const v = Prog.it[k];
    return Side.row(label, '<select data-f="' + esc(k) + '"><option value="">' + esc(none) + '</option>'
      + list.map(o => '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>'
        + esc(o) + '</option>').join('')
      + (v !== undefined && list.indexOf(v) < 0
        ? '<option value="' + esc(v) + '" selected>' + esc(v) + '  (unknown)</option>' : '')
      + '</select>');
  },

  item() {
    const eff = Prog.it.eff || {};
    const uses = typeof Uses !== 'undefined' ? Object.keys(Uses) : [];
    return this.f('name', 'n') + this.f('emoji', 'e') + this.f('description', 'd')
      + this.f('value', 'v', 'num')
      + this.sel('rarity', 'r', Prog.RARITY, '—')
      + this.sel('worn in', 'slot', Prog.SLOTS, 'not worn')
      + '<div class="note">The three slots are P.equipment’s own keys. An item with any other slot '
      + 'can never be worn, because there is nowhere to put it.</div>'
      + this.sel('used by', 'use', uses, 'not used')
      + '<div class="note">A handler in <code>Uses</code>. Without one, eating or drinking it does '
      + 'nothing at all.</div>'
      + Side.row('quest item', '<input type="checkbox" data-b="quest"' + (Prog.it.quest ? ' checked' : '') + '>')
      + '<h4>What wearing it does</h4>'
      + '<div class="note">Player.recalc() reads these six by name and drops anything else without '
      + 'a word, so an effect it has never heard of is an item that does nothing.</div>'
      + '<div class="effs">' + Prog.EFFECTS.map(k =>
        '<label>' + esc(k) + '<input type="number" data-e="' + esc(k) + '" value="'
        + esc(eff[k] === undefined ? '' : eff[k]) + '"></label>').join('') + '</div>'
      + (Object.keys(eff).filter(k => Prog.EFFECTS.indexOf(k) < 0).length
        ? '<div class="note bad">Also carries: '
          + esc(Object.keys(eff).filter(k => Prog.EFFECTS.indexOf(k) < 0).join(', '))
          + ' — which recalc() ignores.</div>' : '');
  },

  shop() {
    const stock = Prog.stock();
    const all = Object.keys(ITEMS).filter(i => stock.indexOf(i) < 0).sort();
    return this.f('title', 'title')
      + Side.row('note', '<textarea data-f="note" rows="3">' + esc(Prog.it.note || '') + '</textarea>')
      + '<h4>On the shelf <span class="pill">' + stock.length + '</span></h4>'
      + (stock.length ? '<ul class="list tight">' + stock.map((s, i) => {
        const it = ITEMS[s];
        return '<li class="' + (it ? '' : 'error') + '">'
          + '<b>' + esc(it ? (it.e || '') + ' ' + (it.n || s) : s) + '</b>'
          + '<em>' + (it ? '£' + (it.v || 0) : 'no such item') + '</em>'
          + '<span class="card-btns">'
          + '<button data-st="up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
          + '<button data-st="down" data-i="' + i + '"' + (i === stock.length - 1 ? ' disabled' : '') + '>↓</button>'
          + '<button data-st="del" data-i="' + i + '" class="warn">✕</button></span></li>';
      }).join('') + '</ul>' : '<div class="note">Nothing on the shelf.</div>')
      + Side.row('add', '<select id="edStockAdd"><option value="">choose an item…</option>'
        + all.map(i => '<option value="' + esc(i) + '">' + esc((ITEMS[i].e || '') + ' ' + ITEMS[i].n) + '</option>').join('')
        + '</select>');
  },

  skill() {
    const list = Prog.skills();
    return this.f('branch', 'name')
      + Side.row('colour', '<span class="pair">'
        + '<input type="color" data-col="colour" value="' + esc(Prog.it.colour || '#4da3ff') + '">'
        + '<input data-f="colour" value="' + esc(Prog.it.colour || '') + '" spellcheck="false"></span>')
      + '<h4>Skills <span class="pill">' + Object.keys(list).length + '</span></h4>'
      + '<div class="note">The id is what <code>Sk.rank()</code> reads, and it is matched by nobody '
      + '— one nothing reads is three points the player spends on nothing at all.</div>'
      + Object.keys(list).map(id => {
        const sk = list[id];
        return '<div class="step">'
          + '<div class="step-h"><span class="step-n code">' + esc(id) + '</span>'
          + '<button data-sk="del" data-id="' + esc(id) + '" class="warn" title="Delete">✕</button></div>'
          + Side.row('called', '<input data-sf="n" data-id="' + esc(id) + '" value="' + esc(sk.n || '') + '">')
          + Side.row('does', '<textarea data-sf="d" data-id="' + esc(id) + '" rows="2">' + esc(sk.d || '') + '</textarea>')
          + Side.row('max rank', '<input type="number" data-sf="max" data-id="' + esc(id) + '" value="' + (sk.max || 1) + '" min="1">')
          + '</div>';
      }).join('')
      + '<div class="btns"><button data-a="addskill">Add a skill</button></div>';
  },

  ach() {
    const given = typeof Writing !== 'undefined'
      ? Writing.calls('Ach', 'get').filter(c => c.id === Prog.id) : [];
    return this.f('name', 'n') + this.f('emoji', 'e') + this.f('description', 'd')
      + '<h4>Handed out by <span class="pill">' + given.length + '</span></h4>'
      + (given.length
        ? '<ul class="list tight">' + given.map(c => '<li><b>' + esc(c.where) + '</b></li>').join('') + '</ul>'
        : '<div class="note bad">Nothing calls <code>Ach.get(' + esc(Emit.str(Prog.id))
          + ')</code>, so no player can ever earn this. Found by reading the acts and the dialogue '
          + '— a call built out of a variable would be invisible here.</div>');
  },

  wire(p) {
    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        if (el.type === 'number') Prog.setNum(el.dataset.f, el.value);
        else Prog.set(el.dataset.f, el.value);
      };
    });
    p.querySelectorAll('[data-col]').forEach(el => { el.onchange = () => Prog.set(el.dataset.col, el.value); });
    p.querySelectorAll('[data-b]').forEach(el => {
      el.onchange = () => Prog.set(el.dataset.b, el.checked ? true : '');
    });
    p.querySelectorAll('[data-e]').forEach(el => { el.onchange = () => Prog.setEff(el.dataset.e, el.value); });
    p.querySelectorAll('[data-st]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.i;
        if (b.dataset.st === 'del') Prog.removeStock(i);
        else Prog.moveStock(i, b.dataset.st === 'up' ? -1 : 1);
      };
    });
    const add = $('#edStockAdd');
    if (add) add.onchange = () => { if (add.value) Prog.addStock(add.value); };
    p.querySelectorAll('[data-sf]').forEach(el => {
      el.onchange = () => Prog.setSkill(el.dataset.id, el.dataset.sf, el.value);
    });
    p.querySelectorAll('[data-sk]').forEach(b => { b.onclick = () => Prog.removeSkill(b.dataset.id); });
    p.querySelectorAll('[data-a]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.a === 'new') ProgMake.create();
        else if (b.dataset.a === 'dup') Mode.duplicate();
        else if (b.dataset.a === 'drop') ProgMake.drop();
        else if (b.dataset.a === 'addskill') {
          Ask.form('A new skill', [
            { k: 'id', label: 'id', value: '', hint: 'what Sk.rank() will read' },
            { k: 'n', label: 'called', value: '' },
          ], 'Add').then(v => { if (v && v.id) Prog.addSkill(v.id.replace(/[^\w$]/g, ''), v.n); });
        }
      };
    });
  },

  check() {
    const p = $('#paneCheck');
    const f = ProgCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const table = Prog.ids().reduce((n, k) => n + ProgCheck.countFor(k), 0);
    /* The two questions worth asking across the whole table. */
    const unreachable = Object.keys(ACHS).filter(id =>
      !(typeof Writing !== 'undefined' && Writing.calls('Ach', 'get').some(c => c.id === id))
      && !ProgCheck.engineReads(id));
    const group = (list, title, cls) => !list.length ? '' : '<h4>' + esc(title) + '</h4>'
      + '<ul class="faults">' + list.map(x => '<li class="' + cls + '">' + esc(x.msg) + '</li>').join('')
      + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length + '</b><span>broken</span></div>'
      + '<div><b>' + warns.length + '</b><span>warnings</span></div>'
      + '<div><b>' + table + '</b><span>everywhere</span></div>'
      + '</div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this one.</p>')
      + '<h4>Achievements nothing hands out <span class="pill">' + unreachable.length + '</span></h4>'
      + (unreachable.length
        ? '<ul class="list tight">' + unreachable.map(id =>
          '<li><b>' + esc((ACHS[id] || {}).n || id) + '</b><em><code>' + esc(id) + '</code></em></li>').join('')
          + '</ul><div class="note">No <code>Ach.get()</code> anywhere in the writing or the engine, '
          + 'so no player can ever earn these.</div>'
        : '<div class="note">Every achievement is handed out somewhere.</div>');
  },

  exportPane() {
    const d = Prog.def();
    Side.exportChoices({
      name: () => Prog.kind + '-' + Prog.id + '.txt',
      choices: [
        { v: 'one', label: 'This one &rarr; data/items.js',
          src: () => Emit.progEntry(Prog.kind, Prog.id, Prog.it),
          note: 'One entry, ready to paste over the old one.' },
        { v: 'all', label: 'The whole ' + esc(d.label) + ' table',
          src: () => Emit.progTable(Prog.kind),
          note: 'The whole table with this one as you have it. data/items.js lines its '
            + 'columns up by hand; this does not.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.progChanges(),
          note: 'What you changed, so you can edit the entry rather than replace it.' }]
    });
  }
};
