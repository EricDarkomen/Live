'use strict';
/* ---------------- The call editor's panes ----------------
   Four tables in one list, because they are one subject. A move is written
   against the tells it answers and a caller is written against the moves that
   will be used on it, so putting them behind separate modes would mean editing
   one with the other out of sight. */

const CallsUI = {
  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },

  /* ---- the workspace ---- */
  filter: '',
  only: 'all',
  FILTERS: [
    { k: 'all', label: 'Everything' },
    { k: 'caller', label: 'Callers' },
    { k: 'move', label: 'Moves' },
    { k: 'boss', label: 'Bosses' },
    { k: 'tell', label: 'Tells' },
    { k: 'fault', label: 'Flagged' },
  ],
  workspace() {
    const el = $('#callsWork');
    if (!el) return;
    const q = this.filter.toLowerCase();
    const here = Calls.kind + ':' + Calls.id;

    const blocks = Calls.groups().map(g => {
      let items = g.items;
      const kind = items.length ? items[0][0].split(':')[0] : '';
      if (this.only !== 'all' && this.only !== 'fault' && this.only !== kind) return '';
      if (this.only === 'fault') items = items.filter(([key]) => CallCheck.countFor(key));
      if (q) items = items.filter(([key, label]) =>
        label.toLowerCase().indexOf(q) >= 0 || key.toLowerCase().indexOf(q) >= 0);
      if (!items.length) return '';
      const rows = items.map(([key, label]) => {
        const worst = CallCheck.worstFor(key);
        const n = CallCheck.countFor(key);
        return '<li data-key="' + esc(key) + '" class="' + (key === here ? 'on ' : '') + worst + '">'
          + '<b>' + esc(label) + '</b>'
          + '<em>' + esc(this.blurb(key)) + '</em>'
          + (n ? '<span class="badge ' + worst + '">' + n + '</span>' : '')
          + '</li>';
      }).join('');
      return '<h4>' + esc(g.label) + ' <span class="pill">' + items.length + '</span></h4>'
        + '<ul class="list rows">' + rows + '</ul>';
    }).join('');

    el.innerHTML = '<div class="work-head"><h2>The phones</h2>'
      + '<span class="work-sub">who rings, what you can say, what they are showing you, '
      + 'and the set pieces</span></div>'
      + '<div class="seek">'
      + '<input id="edCallSeek" value="' + esc(this.filter) + '" placeholder="Find by name or id">'
      + '<div class="chips">' + this.FILTERS.map(f =>
        '<button data-only="' + f.k + '" class="' + (f.k === this.only ? 'on' : '') + '">'
        + esc(f.label) + '</button>').join('') + '</div></div>'
      + (blocks || '<p class="empty">Nothing matches.</p>');

    const seek = $('#edCallSeek');
    seek.oninput = () => { this.filter = seek.value; this.workspace(); $('#edCallSeek').focus(); };
    el.querySelectorAll('[data-only]').forEach(b => {
      b.onclick = () => { this.only = b.dataset.only; this.workspace(); };
    });
    el.querySelectorAll('li[data-key]').forEach(li => {
      li.onclick = () => Mode.openSubject(li.dataset.key);
    });
  },
  /* One line under each row saying what it actually is, so the list can be
     read without opening every entry. */
  blurb(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    const e = Calls.entry(kind, id);
    if (!e) return '';
    if (kind === 'caller') return 'weight ' + (e.w || 0) + ' · frustration ' + (e.frus || 0)
      + ' · aggression ' + (e.agg || 0);
    if (kind === 'move') return (e.serves || []).length
      ? 'answers ' + (e.serves || []).join(', ') : 'always offered';
    if (kind === 'boss') return ((e.phases || []).length) + ' phases · sets ' + (e.win || 'nothing');
    return (Array.isArray(e) ? e.length : 0) + ' lines';
  },

  /* ---- inspect ---- */
  inspect() {
    const p = $('#paneInspect');
    if (!Calls.it) { p.innerHTML = '<p class="empty">Nothing open.</p>'; return; }
    const k = Calls.kind;
    p.innerHTML = '<h3>' + esc(Calls.label(k, Calls.id)) + '</h3>'
      + '<div class="note">' + esc(Calls.def().label) + ' · <code>' + esc(Calls.id) + '</code></div>'
      + (k === 'caller' ? this.caller() : k === 'move' ? this.move()
        : k === 'boss' ? this.boss() : this.tell())
      + '<div class="btns"><button data-a="new">New…</button>'
      + '<button data-a="dup">Duplicate</button>'
      + '<button data-a="drop" class="warn">Delete</button></div>';
    this.wire(p);
  },

  field(label, k, type) {
    const v = Calls.it[k];
    return Side.row(label, '<input data-f="' + esc(k) + '"'
      + (type === 'num' ? ' type="number"' : '')
      + ' value="' + esc(v === undefined || v === null ? '' : String(v)) + '">');
  },
  area(label, k, rows, note) {
    return Side.row(label, '<textarea data-l="' + esc(k) + '" rows="' + (rows || 4)
      + '" spellcheck="false">' + esc(Calls.lines(k)) + '</textarea>')
      + (note ? '<div class="note">' + note + '</div>' : '');
  },

  caller() {
    return this.field('name', 'name') + this.field('face', 'face')
      + this.field('weight', 'w', 'num')
      + '<div class="note">How often they come up. It is a weighted draw, so 0 is “never” and the '
      + 'number only means anything next to the other callers’.</div>'
      + this.field('frustration', 'frus', 'num')
      + this.field('aggression', 'agg', 'num')
      + this.field('patience', 'pat', 'num')
      + this.area('issues', 'issues', 4, 'What the call is about. One per line; one is picked.')
      + this.area('opening', 'open', 3, 'The first thing they say.')
      + this.area('middle', 'mid', 4)
      + this.area('when hot', 'hot', 3, 'Once their patience has gone.')
      + this.area('when won', 'win', 3, 'How a call that went well ends.');
  },

  move() {
    const needs = CallCheck.needs();
    const serves = Calls.it.serves || [];
    const cost = Calls.it.cost || {};
    return this.field('reply', 'n') + this.field('emoji', 'e')
      + this.field('description', 'd')
      + '<div class="note">The greyed second line on a desktop. A phone shows the reply only.</div>'
      + Side.row('answers', '<div class="chips">' + needs.map(n =>
        '<button data-need="' + esc(n) + '" class="' + (serves.indexOf(n) >= 0 ? 'on' : '') + '">'
        + esc(n) + '</button>').join('') + '</div>')
      + '<div class="note">Which tells this move answers. A move that serves nothing is offered '
      + 'whatever the caller is showing you; a move that serves a need TELLS has never heard of '
      + 'is offered on a hint the player is never shown.</div>'
      /* One row, two small fields. Left to flow they wrapped the second label
         onto its own line and read as one control with a stray box under it. */
      + Side.row('costs', '<span class="pair">'
        + '<label>patience <input type="number" data-c="pat" value="'
        + esc(cost.pat === undefined ? '' : cost.pat) + '"></label>'
        + '<label>energy <input type="number" data-c="ene" value="'
        + esc(cost.ene === undefined ? '' : cost.ene) + '"></label></span>')
      + '<h4>The code</h4>'
      + '<div class="note">Captured from data/callers.js and carried through the export exactly as '
      + 'it came in. This editor does not write <code>run()</code> and will not pretend to — the '
      + 'same call it makes about a procedural <code>furnish()</code> and a dialogue '
      + '<code>do()</code>. Editing it here changes what is exported and nothing else.</div>'
      + Side.row('run(E)', '<textarea data-code="run" class="code" rows="8" spellcheck="false" '
        + 'wrap="off">' + esc(Calls.code.run || '') + '</textarea>')
      + Side.row('show', '<textarea data-code="show" class="code" rows="3" spellcheck="false" '
        + 'wrap="off">' + esc(Calls.code.show || '') + '</textarea>')
      + '<div class="note">Optional. Decides whether the move is offered at all — “Land it.” uses '
      + 'it to appear only once there is enough rapport to finish on.</div>';
  },

  boss() {
    const ph = Calls.phases();
    return this.field('title', 'title') + this.field('face', 'face')
      + this.field('subtitle', 'sub')
      + this.field('breather', 'breather')
      + '<div class="note">What plays between phases.</div>'
      + this.field('sets flag', 'win')
      + '<div class="note">The whole consequence of winning. Nothing declares who reads it, so the '
      + 'check goes looking through the acts and the dialogue for the name.</div>'
      + '<h4>Phases <span class="pill">' + ph.length + '</span></h4>'
      /* The same card the job editor's steps use — an ordered list of things
         with a move-up, a move-down and a delete is the same shape here. */
      + ph.map((p, i) => '<div class="step">'
        + '<div class="step-h"><span class="step-n">' + (i + 1) + '</span>'
        + '<button data-ph="up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' title="Move up">↑</button>'
        + '<button data-ph="down" data-i="' + i + '"' + (i === ph.length - 1 ? ' disabled' : '') + ' title="Move down">↓</button>'
        + '<button data-ph="del" data-i="' + i + '" class="warn" title="Delete this phase">✕</button></div>'
        + Side.row('name', '<input data-pf="n" data-i="' + i + '" value="' + esc(p.n || '') + '">')
        + Side.row('frus', '<input type="number" data-pf="frus" data-i="' + i + '" value="' + (p.frus || 0) + '">')
        + Side.row('agg', '<input type="number" data-pf="agg" data-i="' + i + '" value="' + (p.agg || 0) + '">')
        + Side.row('lines', '<textarea data-pf="lines" data-i="' + i + '" rows="3" spellcheck="false">'
          + esc((p.lines || []).join('\n')) + '</textarea>')
        + '</div>').join('')
      + '<div class="btns"><button data-a="addphase">Add a phase</button></div>';
  },

  tell() {
    const served = CallCheck.served().has(Calls.id);
    return this.area('lines', 'lines', 8,
      'What the caller is showing you. One is picked and shown above the moves — it is the only '
      + 'thing that says which need is live.')
      + '<div class="note' + (served ? '' : ' bad') + '">'
      + (served ? 'At least one move answers this need.'
        : 'No move serves this need, so the player can be shown it and have nothing to answer it '
        + 'with.') + '</div>';
  },

  wire(p) {
    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        const k = el.dataset.f;
        if (el.type === 'number') Calls.setNum(k, el.value); else Calls.set(k, el.value);
      };
    });
    p.querySelectorAll('[data-l]').forEach(el => {
      el.onchange = () => Calls.setLines(el.dataset.l, el.value);
    });
    p.querySelectorAll('[data-need]').forEach(b => {
      b.onclick = () => Calls.toggleServes(b.dataset.need);
    });
    p.querySelectorAll('[data-c]').forEach(el => {
      el.onchange = () => Calls.setCost(el.dataset.c, el.value);
    });
    p.querySelectorAll('[data-code]').forEach(el => {
      el.onchange = () => {
        Calls.mark('edit ' + el.dataset.code + '()');
        const v = el.value.trim();
        if (v) Calls.code[el.dataset.code] = v; else delete Calls.code[el.dataset.code];
        Calls.rebuild();
      };
    });
    p.querySelectorAll('[data-pf]').forEach(el => {
      el.onchange = () => Calls.setPhase(+el.dataset.i, el.dataset.pf, el.value);
    });
    p.querySelectorAll('[data-ph]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.i;
        if (b.dataset.ph === 'del') Calls.removePhase(i);
        else Calls.movePhase(i, b.dataset.ph === 'up' ? -1 : 1);
      };
    });
    p.querySelectorAll('[data-a]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.a === 'new') CallsMake.create();
        else if (b.dataset.a === 'dup') Mode.duplicate();
        else if (b.dataset.a === 'drop') CallsMake.drop();
        else if (b.dataset.a === 'addphase') Calls.addPhase();
      };
    });
  },

  /* ---- check ---- */
  check() {
    const p = $('#paneCheck');
    const f = CallCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const table = Calls.ids().reduce((n, k) => n + CallCheck.countFor(k), 0);
    const unserved = CallCheck.needs().filter(n => !CallCheck.served().has(n));
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
      + '<h4>Needs no move answers <span class="pill">' + unserved.length + '</span></h4>'
      + (unserved.length
        ? '<ul class="list tight">' + unserved.map(n => '<li><b>' + esc(n) + '</b></li>').join('') + '</ul>'
          + '<div class="note">A tell can be shown for each of these and the player has nothing to '
          + 'answer it with.</div>'
        : '<div class="note">Every need in TELLS has at least one move behind it.</div>');
  },

  /* ---- export ---- */
  exportPane() {
    const d = Calls.def();
    Side.exportChoices({
      name: () => Calls.kind + '-' + Calls.id + '.txt',
      choices: [
        { v: 'one', label: 'This one &rarr; data/callers.js',
          src: () => Emit.callEntry(Calls.kind, Calls.id, Calls.it, Calls.code),
          note: () => Calls.kind === 'move'
            ? 'One entry. run() and show: are the source they came in as — this tool did not write '
              + 'them and has not rewritten them.'
            : 'One entry, ready to paste over the old one.' },
        { v: 'all', label: 'The whole ' + esc(d.label.toUpperCase()) + ' table',
          src: () => Emit.callTable(Calls.kind),
          note: 'The whole table with this one as you have it. data/callers.js carries '
            + 'comments this does not, so paste an entry rather than the block unless you mean it.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.callChanges(),
          note: 'What you changed, so you can edit the entry rather than replace it.' }]
    });
  }
};
