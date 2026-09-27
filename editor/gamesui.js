'use strict';
/* ---------------- The arcade editor's panes ----------------
   One row per game, and the panel is the whole of what a minigame declares
   about itself: what it is called, how it explains itself on each device, which
   buttons a thumb gets, what a round costs and what it is worth — plus the code
   it is made of, shown and not edited, because that is the half of a game this
   tool must not pretend it can write. */

const GamesUI = {
  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },

  /* ---- the workspace ---- */
  workspace() {
    const el = $('#gamesWork');
    if (!el) return;
    const ids = Games.ids();
    const rows = ids.map(id => {
      const g = Games.def(id);
      const it = (id === Games.id && Games.it) ? Games.it : g;
      const worst = GameCheck.worstFor(id);
      const n = GameCheck.countFor(id);
      /* Where it is INSTALLED, which is the table, plus any bare Arcade.open
         still written into an act by hand. Reading only the second is how this
         row came to say "nothing opens it" about all three of them the moment
         the binding became data. */
      const cabs = id === Games.id && Games.cabs ? Games.cabs
        : Games.table().filter(c => c.game === id);
      const opens = Games.openedBy(id);
      const ways = cabs.length + opens.length;
      const tags = [];
      (it.pads || []).forEach(pd => tags.push('<span class="tag code">' + esc(pd.code || '?') + '</span>'));
      if (!(it.pads || []).length) tags.push('<span class="tag">pointer</span>');
      cabs.forEach(c => tags.push('<span class="tag in">' + esc(c.use || '—') + '</span>'));
      opens.forEach(w => tags.push('<span class="tag in">' + esc(w) + '</span>'));
      const wired = [];
      cabs.forEach(c => {
        if (c.skill && wired.indexOf('skill') < 0) wired.push('skill');
        if (c.job && wired.indexOf('job') < 0) wired.push('job');
        if (c.item && wired.indexOf('item') < 0) wired.push('item');
      });
      wired.forEach(w => tags.push('<span class="tag">' + esc(w) + '</span>'));
      return '<li data-g="' + esc(id) + '" class="' + (id === Games.id ? 'on ' : '') + worst + '">'
        + '<b><span class="li-e">' + esc(it.icon || '🕹️') + '</span>' + esc(it.name || id) + '</b>'
        + '<em>' + esc(id) + ' · ' + (it.mins || 0) + ' min · par ' + (it.par || 0)
        + ' · ' + (ways ? 'on ' + ways + ' object' + (ways === 1 ? '' : 's')
          : 'on nothing') + '</em>'
        + '<span class="tags">' + tags.join('') + '</span>'
        + (n ? '<span class="badge ' + worst + '">' + n + '</span>' : '')
        + '</li>';
    }).join('');

    const dangling = GameCheck.danglingOpens();
    el.innerHTML = '<div class="work-head"><h2>Arcade</h2>'
      + '<span class="work-sub">' + ids.length + ' game' + (ids.length === 1 ? '' : 's')
      + ' · what each declares, which buttons a thumb gets, and where it is installed</span></div>'
      + (rows ? '<ul class="list rows">' + rows + '</ul>'
        : '<p class="empty">No minigame is registered. engine/arcade.js names them in '
          + 'catalogue(), behind typeof guards — a page loaded without minigames/ has an '
          + 'arcade with nothing in it.</p>')
      + (dangling.length
        ? '<h4>Opened and not registered <span class="pill">' + dangling.length + '</span></h4>'
          + '<ul class="list tight">' + dangling.map(d =>
            '<li><b>' + esc(d.id) + '</b><em>' + esc(d.where) + '</em></li>').join('') + '</ul>'
          + '<div class="note bad">Something calls <code>Arcade.open</code> with a name no game '
          + 'answers to. Arcade.open() denies with a buzz and the dialogue choice does '
          + 'nothing — which is exactly what a renamed id leaves behind.</div>'
        : '');

    el.querySelectorAll('[data-g]').forEach(li => {
      li.onclick = () => Mode.openSubject(li.dataset.g);
    });
  },

  /* ---- the panel ---- */
  inspect() {
    const p = $('#paneInspect');
    if (!Games.id || !Games.it) { p.innerHTML = '<p class="empty">No game open.</p>'; return; }
    const it = Games.it;
    const reads = Games.keysRead();
    const opens = Games.openedBy();

    p.innerHTML = '<h3><span class="h-e">' + esc(it.icon || '🕹️') + '</span>'
      + esc(it.name || Games.id) + '</h3>'

      + '<h4>What it is</h4>'
      + Side.row('id', '<code>' + esc(Games.id) + '</code>')
      + Side.row('called', '<input data-k="name" value="' + esc(it.name || '') + '">')
      + Side.row('icon', '<input data-k="icon" value="' + esc(it.icon || '') + '" maxlength="4">')
      + Side.row('blurb', '<textarea data-k="blurb" rows="2">' + esc(it.blurb || '') + '</textarea>')
      + Side.row('goal', '<textarea data-k="goal" rows="2">' + esc(it.goal || '') + '</textarea>')
      + Side.row('costs', '<input type="number" data-k="mins" value="' + (it.mins || 0)
        + '" min="0" max="120"> min')
      + Side.row('par', '<input type="number" data-k="par" value="' + (it.par || 0) + '" min="1">')
      + '<div class="note">A round costs <b>mins</b> of the shift at the end of it — the clock '
      + 'is stopped while you play. <b>par</b> is the score a good round reaches, and every '
      + 'reward() in the library divides by it, so it is how a game tunes its own payout.</div>'

      /* Both wordings, side by side, because that is the rule and seeing them
         apart is what makes one of them missing obvious. */
      + '<h4>How it explains itself</h4>'
      + Side.row('with a keyboard', '<textarea data-h="keys" rows="2">'
        + esc((it.help.keys || []).join('\n')) + '</textarea>')
      + Side.row('with a thumb', '<textarea data-h="taps" rows="2">'
        + esc((it.help.taps || []).join('\n')) + '</textarea>')
      + '<div class="note">One line each. Touch and keyboard are both first-class here, so '
      + 'every instruction needs both wordings — the host shows whichever the device is.</div>'

      + '<h4>Pads <span class="pill">' + (it.pads || []).length + '</span></h4>'
      + ((it.pads || []).length
        ? (it.pads || []).map((pd, i) => this.padCard(pd, i, reads)).join('')
        : '<p class="empty">None. This game is pointer-first, and the host draws no button '
          + 'row for it.</p>')
      + '<div class="btns"><button data-a="addpad">+ Add a pad</button></div>'
      + '<div class="note">A pad is the <b>touch half of the key contract</b>: the host draws '
      + 'the button and delivers a press on it as the key it names, so input is written once '
      + 'against key codes and gets a thumb for free. Their order is their order on screen, '
      + 'left to right.</div>'

      /* ---- where it is played ----
         The part that used to be code and could only be described. A cabinet
         is one row: which object offers it, what the reply says, and what
         winning it is wired into. Install, edit, remove — no file touched
         until the export. */
      + '<h4>Where it is played <span class="pill">' + (Games.cabs || []).length + '</span></h4>'
      + ((Games.cabs || []).length
        ? Games.cabs.map((c, i) => this.cabCard(c, i)).join('')
        : '<p class="empty">Nowhere. This game is registered and no object offers it, so no '
          + 'player will ever see it.</p>')
      + '<div class="btns"><button data-a="install" class="primary">+ Put it on an object…</button></div>'
      + '<div class="note">A cabinet is a row in <code>CABINETS</code> — the object it hangs '
      + 'off, the reply that offers it, and what it draws on and hands back. The prose the '
      + 'object opens with stays in data/acts.js, which is where the writing lives; only the '
      + 'wiring is data.</div>'

      + (opens.length
        ? '<h4>And opened in code</h4><ul class="list tight">' + opens.map(w =>
          '<li><b>' + esc(w) + '</b></li>').join('') + '</ul>'
          + '<div class="note">An <code>Arcade.open</code> written into an act by hand. Still '
          + 'legal and still counts as a way in — it is just not one this page can change.</div>'
        : '')

      + '<h4>What it is made of</h4>'
      + Games.HOOKS.filter(k => Games.code[k]).map(k => this.hookCard(k)).join('')
      + (Object.keys(Games.code).some(k => Games.HOOKS.indexOf(k) < 0)
        ? Object.keys(Games.code).filter(k => Games.HOOKS.indexOf(k) < 0)
          .map(k => this.hookCard(k)).join('') : '')
      + '<div class="note">Captured as source and carried through the export exactly as it is. '
      + 'This page never runs it and never rewrites it — the same call the level editor makes '
      + 'about a procedural furnish() and the dialogue editor about a do(). A game is written '
      + 'in minigames/, and what is edited here is what it declares about itself.</div>'

      + '<div class="btns"><button data-a="drop" class="warn">Delete this game…</button></div>';

    p.querySelectorAll('[data-k]').forEach(el => {
      el.onchange = () => {
        const k = el.dataset.k;
        Games.set(k, (k === 'mins' || k === 'par') ? (+el.value || 0) : el.value);
      };
    });
    p.querySelectorAll('[data-h]').forEach(el => {
      el.onchange = () => Games.setHelp(el.dataset.h, el.value.split('\n'));
    });
    p.querySelectorAll('[data-pad]').forEach(el => {
      el.onchange = () => Games.setPad(+el.dataset.i, el.dataset.pad, el.value);
    });
    p.querySelectorAll('[data-padact]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.i;
        if (b.dataset.padact === 'drop') Games.dropPad(i);
        else Games.movePad(i, b.dataset.padact === 'up' ? -1 : 1);
      };
    });
    p.querySelectorAll('[data-cab]').forEach(el => {
      el.onchange = () => Games.setCab(+el.dataset.i, el.dataset.cab, el.value);
    });
    p.querySelectorAll('[data-cabact]').forEach(b => {
      b.onclick = () => Games.uninstall(+b.dataset.i);
    });
    const inst = p.querySelector('[data-a="install"]');
    if (inst) inst.onclick = () => this.install();
    const add = p.querySelector('[data-a="addpad"]');
    if (add) add.onclick = () => Games.addPad(this.suggestCode(reads, Games.it.pads), 'Button');
    const drop = p.querySelector('[data-a="drop"]');
    if (drop) drop.onclick = () => GamesMake.drop();
  },

  /* Choosing the object to install it on. A real <select> over every `use:` in
     the building rather than a box to type an id into — seventy of them, and a
     typo is a reply nobody is ever offered. */
  install() {
    const objs = Games.objects();
    if (!objs.length) { Side.say('No object handlers to install it on.'); return; }
    Ask.form('Put ' + (Games.it.name || Games.id) + ' on an object', [
      { k: 'use', label: 'object', value: objs[0], options: objs,
        hint: 'the `use:` an object carries' },
      { k: 't', label: 'the reply', value: 'Play ' + (Games.it.name || Games.id) + '.' },
    ], 'Install').then(v => {
      if (!v || !v.use) return;
      Games.install(v.use);
      const c = Games.cabs[Games.cabs.length - 1];
      if (v.t) c.t = v.t;
      Games.rebuild();
      Side.say('Installed on ' + v.use + '. Walk up to it in the game and the reply is there — '
        + 'the export is what puts it in data/items.js.');
    });
  },

  /* The first key the game reads that no pad sends yet — which is nearly always
     the one you were about to add, and saves typing `ArrowRight` correctly. */
  suggestCode(reads, pads) {
    const free = reads.filter(k => ['Escape', 'Tab'].indexOf(k) < 0 && !/^Digit/.test(k)
      && !pads.some(pd => pd.code === k));
    return free[0] || 'Space';
  },

  /* One cabinet. Every join is a <select> over a known set wherever there is
     one, because these are exactly the fields where a typo is silent: a skill
     id that is not in SKILLS is a rank of zero for ever and nothing says so. */
  cabCard(c, i) {
    const opt = (list, cur, none) => '<option value="">' + esc(none) + '</option>'
      + list.map(x => {
        const id = Array.isArray(x) ? x[0] : x, label = Array.isArray(x) ? x[1] : x;
        return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>'
          + esc(label) + '</option>';
      }).join('');
    const bad = typeof Acts !== 'undefined' && c.use && typeof Acts[c.use] !== 'function';
    return '<div class="step">'
      + '<div class="step-h"><span class="step-n">' + esc(c.use || 'nowhere') + '</span>'
      + '<button data-cabact="drop" data-i="' + i + '" class="warn" title="Take it off">✕</button></div>'
      + Side.row('on', '<select data-cab="use" data-i="' + i + '">'
        + opt(Games.objects(), c.use, '— nothing —') + '</select>')
      + Side.row('reply', '<textarea data-cab="t" data-i="' + i + '" rows="2">'
        + esc(c.t || '') + '</textarea>')
      + Side.row('draws on', '<select data-cab="skill" data-i="' + i + '">'
        + opt(Games.skills(), c.skill, '— no skill —') + '</select>')
      + Side.row('steps', '<select data-cab="job" data-i="' + i + '">'
        + opt(Games.jobs(), c.job, '— no job —') + '</select>')
      + Side.row('hands over', '<select data-cab="item" data-i="' + i + '">'
        + opt(Games.items(), c.item, '— nothing —') + '</select>')
      + Side.row('only after', '<input data-cab="need" data-i="' + i + '" value="'
        + esc(c.need || '') + '" placeholder="a G.flag, or nothing">')
      + (bad ? '<div class="note bad">There is no <code>Acts.' + esc(c.use) + '</code>, so no '
        + 'object opens that dialogue and this reply is never offered.</div>'
        : '<div class="note">The skill’s rank is handed to the game, which spends it on '
          + 'something felt. The job and the item are paid on the FIRST win only — Q.step '
          + 'advances by one and clamps, and a cabinet is the most walk-back-to thing in the '
          + 'building.</div>')
      + '</div>';
  },

  padCard(pd, i, reads) {
    const dead = pd.code && reads.indexOf(pd.code) < 0;
    return '<div class="step">'
      + '<div class="step-h"><span class="step-n">' + (i + 1) + '</span>'
      + '<button data-padact="up" data-i="' + i + '" title="Move left">↑</button>'
      + '<button data-padact="down" data-i="' + i + '" title="Move right">↓</button>'
      + '<button data-padact="drop" data-i="' + i + '" class="warn" title="Remove">✕</button></div>'
      + Side.row('sends', '<input data-pad="code" data-i="' + i + '" value="'
        + esc(pd.code || '') + '" placeholder="ArrowLeft">')
      + Side.row('label', '<input data-pad="label" data-i="' + i + '" value="'
        + esc(pd.label || '') + '">')
      + (dead ? '<div class="note bad">Nothing in this game reads <code>' + esc(pd.code)
        + '</code>. The button is drawn, it is pressed, and nothing happens.</div>' : '')
      + '</div>';
  },

  hookCard(k) {
    const src = Games.code[k] || '';
    return '<div class="step">'
      + '<div class="step-h"><span class="step-n">' + esc(k) + '</span></div>'
      + '<pre class="actsrc">' + esc(src.length > 900 ? src.slice(0, 900) + '\n…' : src) + '</pre>'
      + '</div>';
  },

  /* ---- check ---- */
  check() {
    const p = $('#paneCheck');
    const f = GameCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const table = Games.ids().reduce((n, id) => n + GameCheck.countFor(id), 0);
    const dangling = GameCheck.danglingOpens();
    const group = (list, title, cls) => !list.length ? '' : '<h4>' + title + '</h4>'
      + '<ul class="faults">' + list.map(x => '<li class="' + cls + '">' + esc(x.msg)
        + (x.wants ? ' <code>' + esc(x.wants) + '</code>' : '') + '</li>').join('') + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b>' + (Games.it ? (Games.it.pads || []).length : 0) + '</b><span>pads</span></div>'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length
      + '</b><span>broken</span></div>'
      + '<div><b>' + table + '</b><span>library-wide</span></div>'
      + '</div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this game.</p>')
      + '<h4>Opened and not registered <span class="pill">' + dangling.length + '</span></h4>'
      + (dangling.length
        ? '<ul class="list tight">' + dangling.map(d =>
          '<li><b>' + esc(d.id) + '</b><em>' + esc(d.where) + '</em></li>').join('') + '</ul>'
        : '<p class="ok">✓ Every Arcade.open in the writing names a game that exists.</p>')
      + '<div class="note">The two joins nothing else in the project can see: a pad whose key '
      + 'its own game never reads, and a game the writing does not open. Both are silent — the '
      + 'first is a dead button on a phone only, the second is a finished game nobody meets.</div>';
  },

  /* ---- export ----
     A minigame is its own FILE, which is what makes this export different from
     every other one here: there is no table to paste a line into. So the
     deliverable is the whole of minigames/<id>.js, declarations rewritten and
     hooks verbatim — and, separately, the two lines in engine/arcade.js and
     index.html without which the file is never loaded and never registered. */
  exportPane() {
    Side.exportChoices({
      rows: 18,
      name: () => (Games.id || 'game') + '.js',
      choices: [
        { v: 'file', label: 'This game &rarr; minigames/' + esc(Games.id || 'x') + '.js',
          src: () => Emit.gameFile(),
          note: 'The whole file. Everything you edited here is rewritten; every '
            + 'hook is the source exactly as it was captured, because this tool cannot write '
            + 'that half and must not pretend to.' },
        { v: 'cabs', label: 'Where they are played &rarr; data/items.js',
          src: () => Emit.cabinetTable(),
          note: 'The whole CABINETS table, with every game as you have it here — '
            + 'the ones on the bench included. It is one table and the rows for a game are not '
            + 'next to each other in it, so this replaces the block rather than adding a line.' },
        { v: 'wire', label: 'Wiring it up &rarr; arcade.js, index.html, acts.js',
          src: () => Emit.gameWiring(),
          note: 'A file in minigames/ that nothing loads and nothing names is a '
            + 'game that does not exist. Three places: the script tag, the catalogue, and the '
            + 'act that opens it.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.gameChanges(),
          note: 'What you changed, so you can edit the declaration rather than '
            + 'replace the file.' }]
    });
  }
};
