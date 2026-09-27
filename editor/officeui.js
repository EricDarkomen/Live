'use strict';
/* ---------------- The day editor's panes ----------------
   Six things that share one property: none of them is on the map, and all of
   them are on a clock or at the end of one. The texts are the one whose clock
   does not stop at five — see the header of editor/office.js. */

/* Six things now, and the sixth is the one that is not on office hours. */
const OfficeUI = {
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
    { k: 'event', label: 'Events' },
    { k: 'chat', label: 'Chat' },
    { k: 'mail', label: 'Email' },
    { k: 'text', label: 'Texts' },
    { k: 'ending', label: 'Endings' },
    { k: 'fault', label: 'Flagged' },
  ],
  workspace() {
    const el = $('#officeWork');
    if (!el) return;
    const q = this.filter.toLowerCase();
    const here = Office.key();
    const blocks = Office.groups().map(g => {
      let items = g.items;
      const kind = items.length ? items[0][0].split(':')[0] : '';
      if (this.only !== 'all' && this.only !== 'fault' && this.only !== kind) return '';
      if (this.only === 'fault') items = items.filter(([key]) => OfficeCheck.countFor(key));
      if (q) items = items.filter(([key, label]) => (label + key).toLowerCase().indexOf(q) >= 0);
      if (!items.length) return '';
      const rows = items.map(([key, label]) => {
        const worst = OfficeCheck.worstFor(key);
        const n = OfficeCheck.countFor(key);
        return '<li data-key="' + esc(key) + '" class="' + (key === here ? 'on ' : '') + worst + '">'
          + '<b>' + esc(label) + '</b><em>' + esc(this.blurb(key)) + '</em>'
          + (n ? '<span class="badge ' + worst + '">' + n + '</span>' : '')
          + '</li>';
      }).join('');
      return '<h4>' + esc(g.label) + ' <span class="pill">' + items.length + '</span></h4>'
        + '<ul class="list rows">' + rows + '</ul>';
    }).join('');

    el.innerHTML = '<div class="work-head"><h2>The day</h2>'
      + '<span class="work-sub">what happens to you, what people say behind your back, '
      + 'and how it ends</span></div>'
      + '<div class="seek">'
      + '<input id="edOffSeek" value="' + esc(this.filter) + '" placeholder="Find">'
      + '<div class="chips">' + this.FILTERS.map(f =>
        '<button data-only="' + f.k + '" class="' + (f.k === this.only ? 'on' : '') + '">'
        + esc(f.label) + '</button>').join('') + '</div></div>'
      + (blocks || '<p class="empty">Nothing matches.</p>');

    const seek = $('#edOffSeek');
    seek.oninput = () => { this.filter = seek.value; this.workspace(); $('#edOffSeek').focus(); };
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
    if (kind === 'chat') {
      const rows = CHAT_SCRIPT.filter(c => c.c === id);
      return rows.length + ' messages · ' + (rows.length
        ? clockStr(rows[0].t) + '–' + clockStr(rows[rows.length - 1].t) : '');
    }
    if (kind === 'text') {
      const rows = TEXT_SCRIPT.filter(c => c.who === id);
      /* The last one is what says most about a thread here, because the whole
         point of this channel is the ones that land after five. */
      return rows.length + ' texts · ' + (rows.length
        ? clockStr(rows[0].t) + '–' + clockStr(rows[rows.length - 1].t)
          + (rows[rows.length - 1].t > DAY_END ? ' · after the shift' : '') : '');
    }
    if (kind === 'mail') {
      const m = MAIL_SCRIPT[+id];
      return m ? clockStr(m.t) + ' · ' + String(m.from || '').replace(/<.*/, '').trim() : '';
    }
    if (kind === 'event') {
      const e = (EVENTS || []).find(x => x.id === id);
      return e ? (e.d || '').slice(0, 70) : '';
    }
    if (kind === 'ending') {
      const off = OfficeCheck.offered();
      return off && !off.has(id) ? 'never offered' : 'reachable';
    }
    return (typeof CUT !== 'undefined' ? CUT.length : 0) + ' beats';
  },

  inspect() {
    const p = $('#paneInspect');
    if (!Office.it) { p.innerHTML = '<p class="empty">Nothing open.</p>'; return; }
    const k = Office.kind;
    p.innerHTML = '<h3>' + esc(Office.label(Office.key())) + '</h3>'
      + '<div class="note">' + esc(Office.def().label) + '</div>'
      + (k === 'event' ? this.event()
        : k === 'chat' ? this.rows('who says it', true)
        : k === 'text' ? this.rows('who texts', true)
        : k === 'mail' ? this.mail() : k === 'ending' ? this.ending() : this.rows('the beat', false))
      + '<div class="btns"><button data-a="new">New…</button>'
      + (k === 'cut' ? '' : '<button data-a="dup">Duplicate</button>'
        + '<button data-a="drop" class="warn">Delete</button>') + '</div>';
    this.wire(p);
  },

  f(label, key, type) {
    const v = Office.it[key];
    return Side.row(label, '<input data-f="' + esc(key) + '"'
      + (type === 'num' ? ' type="number"' : '')
      + ' value="' + esc(v === undefined || v === null ? '' : String(v)) + '">');
  },

  event() {
    return this.f('title', 't') + this.f('emoji', 'e')
      + Side.row('description', '<textarea data-f="d" rows="3">' + esc(Office.it.d || '') + '</textarea>')
      + '<h4>The code</h4>'
      + '<div class="note">Captured from data/office.js and carried through the export exactly as '
      + 'it came in — this editor does not write <code>go()</code>. It is also writing, in the sense '
      + 'the reward editor cares about: the free pizza hands over an item from in here.</div>'
      + Side.row('go()', '<textarea data-code="go" class="code" rows="6" spellcheck="false" '
        + 'wrap="off">' + esc(Office.code.go || '') + '</textarea>');
  },

  mail() {
    return Side.row('arrives', '<input type="number" data-f="t" value="' + (Office.it.t || 0) + '">'
      + '<span class="hintlet">' + esc(clockStr(Office.it.t || 0)) + '</span>')
      + '<div class="note">In minutes past midnight. Mail.tick() only ever compares '
      + '<code>G.minutes &gt;= t</code>, and nothing runs after ' + esc(clockStr(DAY_END))
      + ' — so a time outside the shift is an email nobody receives.</div>'
      + this.f('from', 'from') + this.f('subject', 's')
      + Side.row('body', '<textarea data-f="b" rows="8">' + esc(Office.it.b || '') + '</textarea>');
  },

  ending() {
    const off = OfficeCheck.offered();
    const reachable = !off || off.has(Office.id);
    return this.f('title', 't')
      + Side.row('text', '<textarea data-l="b" rows="10">' + esc(Office.lines('b')) + '</textarea>')
      + '<div class="note">One paragraph per line.</div>'
      + '<div class="note' + (reachable ? '' : ' bad') + '">'
      + (reachable
        ? 'Endings.available() can offer this one.'
        : 'Endings.available() never names this, so no player can reach it. Which endings are '
          + 'offered is decided in engine/menus.js.') + '</div>';
  },

  /* A chat channel and the cutscene are the same shape: an ordered list of
     small records with a move-up, a move-down and a delete. */
  rows(what, isChat) {
    const rows = Office.list();
    const text = Office.kind === 'text';
    return '<h4>' + (text ? 'Texts' : isChat ? 'Messages' : 'Beats')
      + ' <span class="pill">' + rows.length + '</span></h4>'
      /* The note is the DIFFERENCE between the two timed lists, said where
         somebody is typing a time in. Chat stops at five and a text does not,
         and writing an evening text into a chat channel is the mistake this
         line exists to prevent. */
      + (text ? '<div class="note">Texts.tick() is outside the shift test in engine/boot.js, so '
        + 'these arrive whatever the clock says and whether you are on the premises or not — a time '
        + 'after ' + esc(clockStr(DAY_END)) + ' is an evening text, not a broken one. What does not '
        + 'arrive is a time past midnight.</div>'
        : isChat ? '<div class="note">Chat.tick() fires anything whose time has come, so a message '
        + 'timed outside the shift never arrives at all.</div>' : '')
      + rows.map((r, i) => '<div class="step">'
        + '<div class="step-h"><span class="step-n">' + (i + 1) + '</span>'
        + (isChat ? '<span class="hintlet">' + esc(clockStr(r.t || 0)) + '</span>' : '')
        + '<span class="card-btns">'
        + '<button data-rw="up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
        + '<button data-rw="down" data-i="' + i + '"' + (i === rows.length - 1 ? ' disabled' : '') + '>↓</button>'
        + '<button data-rw="del" data-i="' + i + '" class="warn">✕</button></span></div>'
        + (isChat
          ? Side.row('at', '<input type="number" data-rf="t" data-i="' + i + '" value="' + (r.t || 0) + '">')
            + Side.row(what, '<span class="pair">'
              + '<input data-rf="f" data-i="' + i + '" value="' + esc(r.f || '') + '" size="2">'
              + '<input data-rf="who" data-i="' + i + '" value="' + esc(r.who || '') + '"></span>')
            + Side.row(text ? 'texts' : 'says', '<textarea data-rf="m" data-i="' + i + '" rows="2">' + esc(r.m || '') + '</textarea>')
          : Side.row('shape', '<select data-rf="k" data-i="' + i + '">'
              + Office.SHAPES.map(([v, l]) => '<option value="' + v + '"'
                + (v === (r.k || 'scene') ? ' selected' : '') + '>' + esc(l) + '</option>').join('')
              + '</select>')
            + Side.row('face', '<input data-rf="f" data-i="' + i + '" value="' + esc(r.f || '') + '" size="3">')
            + Side.row('label', '<input data-rf="l" data-i="' + i + '" value="' + esc(r.l || '') + '">')
            + Side.row('text', '<textarea data-rf="t" data-i="' + i + '" rows="3">' + esc(r.t || '') + '</textarea>')
            /* The camera, in tiles on the level the shift starts on. Blank is
               not "0,0" — it is "keep the shot before this one", which is what
               the first beats do to stay out of a building they are not in
               yet. So it is one text field with an empty state rather than two
               number boxes that can only ever be a coordinate. */
            + Side.row('camera', '<span class="pair">'
              + '<input data-rf="cam" data-i="' + i + '" placeholder="keep the shot"'
              + ' value="' + esc(r.cam ? r.cam.join(', ') : '') + '">'
              + '<input type="number" step="0.1" min="0" data-rf="len" data-i="' + i + '"'
              + ' title="seconds to glide there" value="' + (r.len === undefined ? '' : r.len) + '"></span>'))
        + '</div>').join('')
      + '<div class="btns"><button data-a="addrow">Add</button></div>';
  },

  wire(p) {
    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        if (el.type === 'number') Office.setNum(el.dataset.f, el.value);
        else Office.set(el.dataset.f, el.value);
      };
    });
    p.querySelectorAll('[data-l]').forEach(el => {
      el.onchange = () => Office.setLines(el.dataset.l, el.value);
    });
    p.querySelectorAll('[data-code]').forEach(el => {
      el.onchange = () => {
        Office.mark('edit ' + el.dataset.code + '()');
        const v = el.value.trim();
        if (v) Office.code[el.dataset.code] = v; else delete Office.code[el.dataset.code];
        Office.rebuild();
      };
    });
    p.querySelectorAll('[data-rf]').forEach(el => {
      el.onchange = () => Office.setRow(+el.dataset.i, el.dataset.rf, el.value);
    });
    p.querySelectorAll('[data-rw]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.i;
        if (b.dataset.rw === 'del') Office.removeRow(i);
        else Office.moveRow(i, b.dataset.rw === 'up' ? -1 : 1);
      };
    });
    p.querySelectorAll('[data-a]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.a === 'new') OfficeMake.create();
        else if (b.dataset.a === 'dup') Mode.duplicate();
        else if (b.dataset.a === 'drop') OfficeMake.drop();
        else if (b.dataset.a === 'addrow') Office.addRow();
      };
    });
  },

  check() {
    const p = $('#paneCheck');
    const f = OfficeCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const table = Office.ids().reduce((n, k) => n + OfficeCheck.countFor(k), 0);
    const off = OfficeCheck.offered();
    const never = off ? Object.keys(ENDINGS).filter(k => !off.has(k)) : [];
    const group = (list, title, cls) => !list.length ? '' : '<h4>' + esc(title) + '</h4>'
      + '<ul class="faults">' + list.map(x => '<li class="' + cls + '">' + esc(x.msg) + '</li>').join('')
      + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length + '</b><span>broken</span></div>'
      + '<div><b>' + warns.length + '</b><span>warnings</span></div>'
      + '<div><b>' + table + '</b><span>everywhere</span></div></div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this one.</p>')
      + '<h4>Endings nothing offers <span class="pill">' + never.length + '</span></h4>'
      + (never.length
        ? '<ul class="list tight">' + never.map(k =>
          '<li><b>' + esc(ENDINGS[k].t || k) + '</b><em><code>' + esc(k) + '</code></em></li>').join('')
          + '</ul><div class="note">Endings.available() in engine/menus.js never names these.</div>'
        : '<div class="note">Every ending can be reached.</div>');
  },

  exportPane() {
    Side.exportChoices({
      name: () => Office.kind + '-' + String(Office.id).replace(/[^\w-]/g, '') + '.txt',
      choices: [
        { v: 'one', label: 'This one &rarr; data/office.js',
          src: () => Emit.officeEntry(Office.kind, Office.id, Office.it, Office.code),
          note: () => Office.kind === 'event'
            ? 'go() is the source it came in as — this tool did not write it and has not rewritten it.'
            : 'One entry, ready to paste over the old one.' },
        { v: 'all', label: 'The whole table it is in',
          src: () => Emit.officeTable(Office.kind),
          note: 'The whole table with this one as you have it.' }]
    });
  }
};
