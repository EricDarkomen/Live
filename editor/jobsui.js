'use strict';
/* ---------------- The job editor's panes ----------------
   The job list is the workspace; the panel edits the pick. A step and its
   tracker target are one card, added, deleted and reordered together. */

const JobsUI = {
  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },

  /* ---- the workspace: every job in the game ---- */
  workspace() {
    const el = $('#jobsWork');
    if (!el) return;
    const rows = Jobs.ids().map(id => {
      const q = id === Jobs.id ? Jobs.def() : QUESTS[id];
      const worst = JobCheck.worstFor(id);
      const n = JobCheck.countFor(id);
      return '<li data-job="' + esc(id) + '" class="' + (id === Jobs.id ? 'on ' : '') + worst + '">'
        + '<b>' + esc(q.n || id) + '</b>'
        + '<em>' + esc(q.giver || 'nobody') + ' · ' + (q.steps || []).length + ' steps'
        + (q.rw && q.rw.xp ? ' · ' + q.rw.xp + ' XP' : '')
        + (q.rw && q.rw.item ? ' · ' + esc(((ITEMS[q.rw.item] || {}).n) || q.rw.item) : '')
        + '</em>'
        + (n ? '<span class="badge ' + worst + '">' + n + '</span>' : '')
        + '</li>';
    }).join('');
    el.innerHTML = '<div class="work-head"><h2>Jobs</h2>'
      + '<span class="work-sub">' + Jobs.ids().length + ' in the game · the tracker calls them jobs, '
      + 'data/items.js calls them QUESTS</span></div>'
      + '<ul class="list rows">' + rows + '</ul>';
    el.querySelectorAll('[data-job]').forEach(li => {
      li.onclick = () => Mode.openSubject(li.dataset.job);
    });
  },

  /* ---- the panel: one job, all of it ---- */
  OPTS: {
    npc: () => (typeof NPCS !== 'undefined' ? NPCS : []).map(p => [p.id, p.name || p.id]),
    obj: () => Palette.uses.map(u => [u, u + '  (' + (Palette.useLevel.get(u) || '?') + ')']),
    wp: () => Object.keys(typeof WP !== 'undefined' ? WP : {}).map(k => [k, k]),
  },
  sel(name, value, pairs, blank) {
    return '<select ' + name + '>'
      + (blank ? '<option value=""' + (value ? '' : ' selected') + '>' + esc(blank) + '</option>' : '')
      + pairs.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>'
        + esc(l) + '</option>').join('')
      + '</select>';
  },

  inspect() {
    const p = $('#paneInspect');
    if (!Jobs.id) { p.innerHTML = '<p class="empty">No job open.</p>'; return; }
    const w = JobCheck.callers(Jobs.id);

    p.innerHTML = '<h3><span class="h-e">❗</span>' + esc(Jobs.n) + '</h3>'
      + Side.row('id', '<code>' + esc(Jobs.id) + '</code>')
      + Side.row('called', '<input data-f="n" value="' + esc(Jobs.n) + '">')
      + Side.row('given by', '<input data-f="giver" value="' + esc(Jobs.giver) + '" '
        + 'placeholder="a person, or a thing">')
      + '<h4>Steps <span class="pill">' + Jobs.steps.length + '</span></h4>'
      + '<div class="note">Each step carries the one place the tracker points while it is the '
      + 'current one. <b>No destination</b> is a real answer, not a missing one — “find out who '
      + 'took the mug” has no pin because a compass arrow at the answer is the game telling '
      + 'you the answer.</div>'
      + Jobs.steps.map((t, i) => this.stepCard(t, i)).join('')
      + '<div class="btns"><button data-a="addstep">Add a step</button></div>'
      + '<h4>On completion</h4>'
      + Side.row('xp', '<input type="number" data-r="xp" value="' + (Jobs.rw.xp || 0) + '" min="0">')
      + Side.row('money', '<input type="number" data-r="money" value="' + (Jobs.rw.money || 0) + '" min="0">')
      + Side.row('item', this.sel('data-r="item"', Jobs.rw.item || '',
        Object.keys(typeof ITEMS !== 'undefined' ? ITEMS : {}).map(k => [k, (ITEMS[k].e || '') + ' ' + ITEMS[k].n]),
        'nothing'))
      + '<h4>Where the writing touches it</h4>'
      + this.wiring(w)
      + '<div class="btns"><button data-a="dup">One like this</button>'
      + '<button data-a="drop" class="warn">Delete this job</button></div>';

    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => Jobs.set(el.dataset.f, el.value);
    });
    p.querySelectorAll('[data-r]').forEach(el => {
      el.onchange = () => Jobs.setReward(el.dataset.r,
        el.dataset.r === 'item' ? (el.value || null) : (+el.value || 0));
    });
    p.querySelectorAll('[data-s]').forEach(el => {
      el.onchange = () => Jobs.setStep(+el.dataset.s, el.value);
    });
    p.querySelectorAll('[data-k]').forEach(el => {
      el.onchange = () => {
        const i = +el.dataset.k;
        const kind = el.value;
        const first = (this.OPTS[kind] ? this.OPTS[kind]()[0] : null);
        Jobs.setTarget(i, kind, first ? first[0] : '');
      };
    });
    p.querySelectorAll('[data-v]').forEach(el => {
      el.onchange = () => {
        const i = +el.dataset.v;
        Jobs.setTarget(i, Jobs.targetOf(i).kind, el.value);
      };
    });
    p.querySelectorAll('[data-move]').forEach(b => {
      b.onclick = () => Jobs.moveStep(+b.dataset.move, +b.dataset.d);
    });
    p.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => { if (!Jobs.removeStep(+b.dataset.del)) Side.say('A job needs at least one step.'); };
    });
    p.querySelector('[data-a="addstep"]').onclick = () => Jobs.addStep();
    p.querySelector('[data-a="dup"]').onclick = () => Mode.duplicate();
    p.querySelector('[data-a="drop"]').onclick = () => JobMake.drop();
    p.querySelectorAll('[data-where]').forEach(li => {
      li.onclick = () => this.goTo(li.dataset.where);
    });
  },

  stepCard(text, i) {
    const t = Jobs.targetOf(i);
    const pairs = this.OPTS[t.kind] ? this.OPTS[t.kind]() : [];
    return '<div class="step">'
      + '<div class="step-h"><span class="step-n">' + (i + 1) + '</span>'
      + '<button data-move="' + i + '" data-d="-1" title="Move up">↑</button>'
      + '<button data-move="' + i + '" data-d="1" title="Move down">↓</button>'
      + '<button data-del="' + i + '" class="warn" title="Delete this step and its target">✕</button></div>'
      + '<textarea data-s="' + i + '" rows="2" placeholder="What the tracker tells you to do">'
      + esc(text || '') + '</textarea>'
      + '<div class="step-t">'
      + '<span class="step-lbl">points at</span>'
      + this.sel('data-k="' + i + '"', t.kind, [['npc', 'a colleague'], ['obj', 'an object'], ['wp', 'a spot on the floor']],
        'nothing — on purpose')
      + (t.kind ? this.sel('data-v="' + i + '"', t.value, pairs) : '')
      + '</div></div>';
  },

  /* The cross-reference. Nothing in data/items.js says which line of dialogue
     starts a job, so this is the only place the answer is written down. */
  wiring(w) {
    /* An unwired hook shows the exact line to add (a do() is code the editor
       will not write), in selectable `.pane code`. */
    const call = fn => '<code>Q.' + fn + '(' + Emit.str(Jobs.id) + ')</code>';
    const group = (label, list, fn, empty) => '<div class="wire">'
      + '<span class="wire-k">' + esc(label) + '</span>'
      + (list.length
        ? '<ul class="list tight">' + list.map(x =>
          '<li data-where="' + esc(x) + '"><b>' + esc(x) + '</b></li>').join('') + '</ul>'
        : '<em class="wire-none">' + esc(empty) + ' — put ' + call(fn)
          + ' in a <code>do()</code> or an act</em>')
      + '</div>';
    return group('Q.start', w.start, 'start', 'nothing starts it, so it can never appear')
      + group('Q.step', w.step, 'step', 'nothing advances it, so the tracker stands still')
      + group('Q.complete', w.complete, 'complete', 'nothing completes it, so it never pays out')
      + '<div class="note">Read out of the source of the functions that are loaded, so a call '
      + 'built out of a variable is invisible here. It reports what it found, never “all”.</div>';
  },
  /* "dave · mgmt.do()" is a place you can go. Anything in a person's tree opens
     that person at that node; an act is in data/acts.js and this says so. */
  goTo(where) {
    const m = /^(\w+) · ([\w$]+)/.exec(where);
    if (m && Talk.person(m[1])) {
      Mode.set('talk');
      Mode.openSubject(m[1]);
      setTimeout(() => { if (Talk.nodes[m[2]]) TalkUI.select(m[2]); }, 0);
      return;
    }
    Side.say(where + ' — that one is in the engine or in data/acts.js, not in a conversation.');
  },

  /* ---- check ---- */
  check() {
    const p = $('#paneCheck');
    const f = JobCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const table = Jobs.ids().reduce((n, id) => n + JobCheck.countFor(id), 0);

    const group = (list, title, cls) => !list.length ? '' : '<h4>' + title + '</h4>'
      + '<ul class="faults">' + list.map(x =>
        '<li class="' + cls + '"' + (x.step !== undefined ? ' data-step="' + x.step + '"' : '')
        + (x.job && x.job !== Jobs.id ? ' data-job="' + esc(x.job) + '"' : '') + '>'
        + esc(x.msg) + '</li>').join('') + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b>' + Jobs.steps.length + '</b><span>steps</span></div>'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length + '</b><span>broken</span></div>'
      + '<div><b>' + table + '</b><span>table-wide</span></div>'
      + '</div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this job.</p>')
      + '<div class="note">Two of these can only be answered by reading the writing: whether '
      + 'anything <b>starts</b> this job, and whether anything <b>completes</b> it. Neither is '
      + 'declared anywhere — a job nobody starts never appears, and one nobody completes sits in '
      + 'the tracker until the shift ends.</div>';

    p.querySelectorAll('.faults li').forEach(li => {
      li.onclick = () => {
        if (li.dataset.job) { Mode.openSubject(li.dataset.job); return; }
        Side.show('inspect');
      };
    });
  },

  /* ---- export ---- */
  exportPane() {
    Side.exportChoices({
      rows: 18,
      name: v => Jobs.id + '.' + v + '.txt',
      choices: [
        { v: 'one', label: 'This job &rarr; data/items.js',
          src: () => Emit.questEntry(Jobs.id, Jobs.def()),
          note: 'One entry, indented to sit inside `const QUESTS = { … }`. A job is '
            + 'pure data, so this round-trips exactly — there is no procedural half to lose.' },
        { v: 'all', label: 'The whole QUESTS table',
          src: () => Emit.questTable(),
          note: 'The whole table, with this job as you have it and every other one as '
            + 'the file already has it.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.jobChanges(),
          note: 'What you changed, if you would rather edit the entry than replace it.' }]
    });
  }
};
