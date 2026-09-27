'use strict';
/* ---------------- The dialogue editor's panes ----------------
   The node list is the workspace and the panel edits the node you picked, which
   is the level editor's arrangement applied to a tree instead of a map. Two
   things are specific to a conversation and both earn their place.

   THE BADGES. A node's problems are all invisible from its text: whether
   anything can reach it, whether its `to` goes anywhere, whether the code on it
   names something real. So every row carries them, and the list is the only
   place a tree of forty nodes can be read as a whole.

   THE READ TAB. A conversation is a thing you go THROUGH, and no list of nodes
   tells you how one reads. It walks the tree the way Dialogue does — pages,
   then replies — so the writing can be judged as writing. It does not evaluate
   guards or run `do()`: this page never runs the captured code, so a guarded
   reply is shown with its condition rather than hidden by it, which is what you
   want when reading anyway. */

const TalkUI = {
  walk: null,

  refresh() {
    this.workspace();
    if (Side.tab === 'inspect') this.inspect();
    else if (Side.tab === 'read') this.read();
    else if (Side.tab === 'check') this.check();
    else if (Side.tab === 'export') this.exportPane();
  },
  select(id) {
    Sel.kind = Talk.nodes[id] ? 'node' : null;
    Sel.name = Talk.nodes[id] ? id : null;
    Sel.i = -1;
    Side.show('inspect');
    Side.refresh();
    const row = $('#talkWork') && $('#talkWork').querySelector('[data-node="' + id + '"]');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  },

  /* ---- the workspace ----
     Two views of the same tree, and they answer two different questions. The
     LIST answers "what is in here" — forty nodes, which are unreachable, which
     carry code. The FLOW answers "what shape is it", which is the question you
     actually have when you are writing a branch, and which no list can answer:
     Karen's recurring-meeting thread forks four ways at the confession and
     comes back together at one of six endings, and that is a fact about the
     writing that is invisible until it is drawn.

     An indented outline rather than a node graph, deliberately. A graph wants a
     canvas, a pan, a zoom and a layout pass; an outline is text, it reads at
     320px, every line is a tap target, and the nesting IS the branching. */
  view: 'list',
  workspace() {
    const el = $('#talkWork');
    if (!el) return;
    const roots = Talk.roots();
    const seen = Talk.reachable();
    const rows = Talk.order.map(id => {
      const n = Talk.nodes[id];
      const bad = TalkCheck.levelFor(id);
      const tags = [];
      if (roots.indexOf(id) >= 0) tags.push('<span class="tag in">way in</span>');
      if (!seen.has(id)) tags.push('<span class="tag warn">unreachable</span>');
      if ((n.choices || []).length) tags.push('<span class="tag">' + n.choices.length + ' replies</span>');
      if (n.to) tags.push('<span class="tag">→ ' + esc(n.to) + '</span>');
      if (!n.to && !(n.choices || []).length) tags.push('<span class="tag">ends</span>');
      if (n.doSrc) tags.push('<span class="tag code">code</span>');
      if (n.textSrc) tags.push('<span class="tag code">written in code</span>');
      return '<li data-node="' + esc(id) + '" class="' + (Sel.name === id ? 'on ' : '') + bad + '">'
        + '<b>' + esc(id) + '</b>'
        + '<em>' + esc(Talk.gist(id)) + '</em>'
        + '<span class="tags">' + tags.join('') + '</span></li>';
    }).join('');

    el.innerHTML = '<div class="work-head"><h2>' + esc(Talk.face) + ' ' + esc(Talk.name) + '</h2>'
      + '<span class="work-sub">' + esc(Talk.role || 'no role') + ' · ' + Talk.order.length
      + ' nodes · ' + seen.size + ' reachable</span></div>'
      + '<div class="segs">'
      + '<button data-view="list" class="' + (this.view === 'list' ? 'on' : '') + '">Nodes</button>'
      + '<button data-view="flow" class="' + (this.view === 'flow' ? 'on' : '') + '">Flow</button>'
      + '</div>'
      + (this.view === 'flow'
        ? this.flow(roots)
        : '<ul class="list rows nodes">' + rows + '</ul>')
      + '<div class="btns"><button data-a="addnode">Add a node</button></div>';

    el.querySelectorAll('[data-view]').forEach(b => {
      b.onclick = () => { this.view = b.dataset.view; this.workspace(); };
    });
    el.querySelectorAll('[data-node]').forEach(li => {
      li.onclick = () => this.select(li.dataset.node);
    });
    el.querySelector('[data-a="addnode"]').onclick = () => this.addNode();
  },

  /* ---- the flow ----
     One outline per way in. A node already expanded on this branch is shown as
     a link rather than expanded again: conversations loop back — `again` is
     reached from half of everything — and expanding a loop is a page that never
     ends. That is the same call the reachability walk makes, for the same
     reason. */
  MAX_DEPTH: 14,
  flow(roots) {
    if (!roots.length) return '<p class="empty">Nothing can open this conversation.</p>';
    /* Anything not reachable from a way in still has to be visible, or the one
       view that shows the shape hides the writing nobody can get to. */
    const seen = Talk.reachable();
    const orphans = Talk.order.filter(k => !seen.has(k));
    return roots.map(r => '<div class="flow"><div class="flow-h">opens on <b>' + esc(r)
      + '</b></div>' + this.branch(r, new Set(), 0) + '</div>').join('')
      + (orphans.length
        ? '<div class="flow orphans"><div class="flow-h">unreachable — nothing opens these and '
          + 'no reply leads to them</div>'
          + orphans.map(k => this.line(k, 0)).join('') + '</div>'
        : '');
  },
  /* `seen` is shared across the whole outline for one way in, not carried down
     one branch — so a node several replies converge on is expanded once and
     shown as a link after that. Two reasons and both matter: convergence is
     what you are looking for (three of Karen's four replies land on the same
     node, and that is the fact), and a tree that re-expands every join grows
     exponentially in a conversation that loops back, which most of them do. */
  branch(id, seen, depth) {
    const n = Talk.nodes[id];
    if (!n) return '<div class="fl-miss" style="--d:' + depth + '">→ ' + esc(id)
      + ' — no such node, so the conversation ends here</div>';
    if (seen.has(id)) {
      return '<button class="fl-loop" data-node="' + esc(id) + '" style="--d:' + depth + '">↩ '
        + esc(id) + ' — as above</button>';
    }
    if (depth > this.MAX_DEPTH) {
      return '<button class="fl-loop" data-node="' + esc(id) + '" style="--d:' + depth + '">… '
        + esc(id) + '</button>';
    }
    seen.add(id);
    let out = this.line(id, depth);
    (n.choices || []).forEach(c => {
      out += '<div class="fl-r" style="--d:' + (depth + 1) + '">'
        + '<span class="fl-you">' + esc(c.t || (c.tSrc ? '(a reply written in code)' : '(no text)')) + '</span>'
        + (c.ifSrc ? '<em>only if ' + esc(c.ifSrc) + '</em>' : '')
        + '</div>'
        + (c.to ? this.branch(c.to, seen, depth + 2)
          : '<div class="fl-end" style="--d:' + (depth + 2) + '">— and that is the end of it</div>');
    });
    if (!(n.choices || []).length) {
      out += n.to ? this.branch(n.to, seen, depth + 1)
        : '<div class="fl-end" style="--d:' + (depth + 1) + '">— and that is the end of it</div>';
    }
    return out;
  },
  line(id, depth) {
    const n = Talk.nodes[id];
    const bad = TalkCheck.levelFor(id);
    return '<button class="fl-n ' + bad + (Sel.name === id ? ' on' : '') + '" data-node="' + esc(id)
      + '" style="--d:' + depth + '">'
      + '<b>' + esc(id) + '</b>'
      + '<em>' + esc(Talk.gist(id)) + '</em>'
      + (n && n.doSrc ? '<span class="tag code">code</span>' : '')
      + '</button>';
  },

  addNode() {
    Ask.form('A new node', [
      { k: 'id', label: 'called', value: '', hint: 'how a `to` will name it, e.g. first2' },
    ], 'Add it').then(v => {
      if (!v || !v.id) return;
      if (!/^[A-Za-z_$][\w$]*$/.test(v.id)) { Side.say('A node id has to be a usable property name.'); return; }
      if (!Talk.addNode(v.id)) { Side.say('There is already a node called ' + v.id + '.'); return; }
      this.select(v.id);
      Side.say('Added ' + v.id + '. Nothing reaches it yet — point a reply at it.');
    });
  },

  /* ---- the panel ---- */
  inspect() {
    const p = $('#paneInspect');
    if (Sel.kind === 'node' && Talk.nodes[Sel.name]) return this.inspectNode(p, Sel.name);
    return this.inspectPerson(p);
  },

  /* Nothing selected shows the PERSON — all of them, not only what they say.
     A colleague is spread across three files: their desk and their day are in
     data/npcs.js beside the dialogue, the waypoints their day names are in
     data/world.js, and whether anybody DRAWS them is a row on a sheet in
     art/. None of those three is visible from any of the others, and every one
     of them fails silently: a bad waypoint stands them at their desk all day, a
     desk inside a counter has them shouldering it, and no sprite row makes them
     an emoji among twenty people. So this is where they are bound together. */
  inspectPerson(p) {
    const sp = Talk.sprite();
    const wps = Object.keys(typeof WP !== 'undefined' ? WP : {}).sort();

    p.innerHTML = '<h3><span class="h-e">' + esc(Talk.face || '🧑') + '</span>' + esc(Talk.name) + '</h3>'
      + Side.row('id', '<code>' + esc(Talk.id) + '</code>')
      + Side.row('name', '<input data-f="name" value="' + esc(Talk.name) + '">')
      + Side.row('face', '<input data-f="face" value="' + esc(Talk.face) + '" size="3">')
      + Side.row('role', '<input data-f="role" value="' + esc(Talk.role) + '">')
      + Side.row('colour', '<input type="color" data-f="colour" value="'
        + esc(/^#[0-9a-f]{6}$/i.test(Talk.colour) ? Talk.colour : '#8d9bb5') + '">')

      + '<h4>Where they sit</h4>'
      + Side.row('desk', '<input type="number" data-d="0" value="' + Talk.desk[0] + '"> '
        + '<input type="number" data-d="1" value="' + Talk.desk[1] + '">')
      + '<div class="btns"><button data-a="pickdesk">Pick it on the map</button></div>'
      + '<div class="note">Their desk is the destination NPCM falls back to for anything it '
      + 'cannot resolve, so it is where they are most of the day. <b>Behind a counter means '
      + 'behind it</b>, or they spawn on the visitors’ side and spend the morning shouldering '
      + 'their own desk.</div>'

      + '<h4>Who draws them</h4>'
      + (sp
        ? '<div class="note">Row ' + (sp.row + 1) + ' of the <code>' + esc(sp.sheet)
          + '</code> sheet' + (sp.ok ? '.' : ', which has not decoded.') + '</div>'
        : '<div class="note warn">Nobody. NPCS and a pack’s roster are two lists in two files, '
          + 'and a name in one and not the other is a person who falls back to an emoji among '
          + 'twenty sprites. The <b>Art</b> tab is where a sheet claims a row.</div>')

      + '<h4>Their day <span class="pill">' + Talk.schedule.length + '</span></h4>'
      + '<div class="note">Where they walk, in order. <code>desk</code> is the one destination '
      + 'that is not a waypoint — it means their own, wherever it has been moved to. NPCM takes '
      + 'the last stop whose time has passed, so one out of order never happens at all.</div>'
      + (Talk.schedule.length
        ? '<div class="day">' + Talk.schedule.map((st, i) => this.stopRow(st, i, wps)).join('') + '</div>'
        : '<p class="empty">Nothing — they are at their desk from nine to five.</p>')
      + '<div class="btns"><button data-a="addstop">Add a stop</button></div>'

      + '<h4>One-liners <span class="pill">' + Talk.lines.length + '</span></h4>'
      + '<div class="note">What they say over their own head as you walk past. One per line.</div>'
      + '<textarea data-f="lines" rows="5" spellcheck="true">' + esc(Talk.lines.join('\n')) + '</textarea>'

      + '<h4>The way in</h4>'
      + (Talk.entrySrc
        ? '<div class="note">entry() decides which node a conversation opens on, out of game '
          + 'state. It is code: carried through to the export exactly as it reads here, and '
          + 'never run by this page.</div>'
          + '<textarea data-f="entrySrc" class="code" rows="7" spellcheck="false" wrap="off">'
          + esc(Talk.entrySrc) + '</textarea>'
        : '<p class="empty">No entry(); every conversation opens on <code>again</code>.</p>')
      + '<div class="btns"><button data-a="dup">One like this</button>'
      + '<button data-a="drop" class="warn">Delete this person</button></div>';

    p.querySelectorAll('[data-f]').forEach(el => {
      el.onchange = () => {
        if (el.dataset.f === 'lines') Talk.setLines(el.value.split('\n').filter(x => x.trim()));
        else Talk.setField(el.dataset.f, el.value);
      };
    });
    p.querySelectorAll('[data-d]').forEach(el => {
      el.onchange = () => {
        const x = el.dataset.d === '0' ? +el.value : Talk.desk[0];
        const y = el.dataset.d === '1' ? +el.value : Talk.desk[1];
        Talk.setDesk(x, y);
      };
    });
    p.querySelectorAll('[data-st]').forEach(el => {
      el.onchange = () => {
        const i = +el.dataset.i;
        if (el.dataset.st === 'at') Talk.setStop(i, 'at', this.minutes(el.value));
        else Talk.setStop(i, 'to', el.value);
      };
    });
    p.querySelectorAll('[data-delstop]').forEach(b => {
      b.onclick = () => Talk.removeStop(+b.dataset.delstop);
    });
    p.querySelector('[data-a="addstop"]').onclick = () => Talk.addStop();
    p.querySelector('[data-a="pickdesk"]').onclick = () => {
      const who = Talk.id;
      Tools.askTile(Talk.name + '’s desk', (x, y) => {
        Mode.set('talk');
        Mode.openSubject(who, true);
        Talk.setDesk(x, y);
        Side.say('Desk moved to (' + x + ',' + y + ').');
      });
    };
    p.querySelector('[data-a="dup"]').onclick = () => Mode.duplicate();
    p.querySelector('[data-a="drop"]').onclick = () => TalkMake.drop();
  },
  /* A stop is a time and a destination, and the time is written as a clock
     because a schedule read in minutes-since-midnight is a schedule nobody
     checks. `<input type="time">` gets a real picker on a phone for free. */
  stopRow(st, i, wps) {
    const [at, to] = st;
    return '<div class="stop">'
      + '<input type="time" data-st="at" data-i="' + i + '" value="' + this.hhmm(at) + '">'
      + '<select data-st="to" data-i="' + i + '">'
      + '<option value="desk"' + (to === 'desk' ? ' selected' : '') + '>their own desk</option>'
      + wps.map(k => '<option value="' + esc(k) + '"' + (k === to ? ' selected' : '') + '>'
        + esc(k) + '</option>').join('')
      + (to !== 'desk' && wps.indexOf(to) < 0
        ? '<option value="' + esc(to) + '" selected>⚠ ' + esc(to) + '</option>' : '')
      + '</select>'
      + '<button data-delstop="' + i + '" class="warn" title="Delete this stop">✕</button>'
      + '</div>';
  },
  hhmm(m) {
    const h = Math.floor((+m || 0) / 60), mm = (+m || 0) % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  },
  minutes(v) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
    return m ? clamp(+m[1] * 60 + +m[2], 0, 1439) : 0;
  },

  nodeOptions(value) {
    return '<option value=""' + (value ? '' : ' selected') + '>— end the conversation —</option>'
      + Talk.order.map(k => '<option value="' + esc(k) + '"' + (k === value ? ' selected' : '') + '>'
        + esc(k) + '</option>').join('');
  },

  inspectNode(p, id) {
    const n = Talk.nodes[id];
    const inc = Talk.incoming(id);
    const roots = Talk.roots();

    p.innerHTML = '<h3><span class="h-e">💬</span>' + esc(id) + '</h3>'
      + '<div class="btns"><button data-a="rename">Rename</button>'
      + '<button data-a="read">Read from here</button>'
      + '<button data-a="delnode" class="warn">Delete</button></div>'

      + '<h4>What they say</h4>'
      + (n.textSrc
        ? '<div class="note">This node picks its line in code — <code>pick([…])</code> over a list. '
          + 'Carried through verbatim; edit it as source or not at all.</div>'
          + '<textarea data-c="textSrc" class="code" rows="7" spellcheck="false" wrap="off">'
          + esc(n.textSrc) + '</textarea>'
        : '<div class="note">One page per line. The box shows them one at a time, and the player '
          + 'presses on between them — so a paragraph break here is a beat.</div>'
          + '<textarea data-t rows="7" spellcheck="true">' + esc((n.text || []).join('\n')) + '</textarea>')

      + '<h4>Replies <span class="pill">' + (n.choices || []).length + '</span></h4>'
      + ((n.choices || []).length
        ? (n.choices || []).map((c, i) => this.choiceCard(c, i)).join('')
        : '<p class="empty">None. The node continues on its own.</p>')
      + '<div class="btns"><button data-a="addchoice">Add a reply</button></div>'

      + (!(n.choices || []).length
        ? '<h4>Then</h4>' + Side.row('continues to',
          '<select data-to>' + this.nodeOptions(n.to) + '</select>')
          + '<div class="note">A node with replies ignores `to` — Dialogue.advance() only follows '
          + 'it when there is nothing to choose.</div>'
        : '')

      + '<h4>What it does</h4>'
      + '<div class="note">Code. It sets flags, gives items and moves jobs on, and it is what the '
      + 'check reads to tell you that <code>Ach.get</code> names an achievement that exists. '
      + 'Carried through to the export exactly as it reads here, and <b>never run by this '
      + 'page</b> — so a change here does not change what the Read tab shows.</div>'
      + '<textarea data-c="doSrc" class="code" rows="5" spellcheck="false" wrap="off" '
      + 'placeholder="do() { G.flags.x = true; }">' + esc(n.doSrc || '') + '</textarea>'

      + '<h4>How you get here</h4>'
      + (roots.indexOf(id) >= 0
        ? '<div class="note">entry() can open the conversation straight onto this node.</div>' : '')
      + (inc.length
        ? '<ul class="list tight">' + inc.map(x =>
          '<li data-go="' + esc(x.from) + '"><b>' + esc(x.from) + '</b>'
          + '<em>' + (x.via === null ? 'continues here' : 'reply ' + (x.via + 1)) + '</em></li>').join('')
          + '</ul>'
        : (roots.indexOf(id) >= 0 ? ''
          : '<p class="empty">Nothing reaches it. This is writing nobody will ever read.</p>'));

    const t = p.querySelector('[data-t]');
    if (t) t.onchange = () => Talk.setText(id, t.value.split('\n'));
    p.querySelectorAll('[data-c]').forEach(el => {
      el.onchange = () => Talk.setCode(id, el.dataset.c, el.value);
    });
    const to = p.querySelector('[data-to]');
    if (to) to.onchange = () => Talk.setTo(id, to.value);

    p.querySelectorAll('[data-ct]').forEach(el => {
      el.onchange = () => Talk.setChoice(id, +el.dataset.ct, 't', el.value);
    });
    p.querySelectorAll('[data-cto]').forEach(el => {
      el.onchange = () => Talk.setChoice(id, +el.dataset.cto, 'to', el.value);
    });
    p.querySelectorAll('[data-cc]').forEach(el => {
      el.onchange = () => Talk.setChoice(id, +el.dataset.cc, el.dataset.k, el.value.trim() || null);
    });
    p.querySelectorAll('[data-cmove]').forEach(b => {
      b.onclick = () => Talk.moveChoice(id, +b.dataset.cmove, +b.dataset.d);
    });
    p.querySelectorAll('[data-cdel]').forEach(b => {
      b.onclick = () => Talk.removeChoice(id, +b.dataset.cdel);
    });
    p.querySelectorAll('[data-go]').forEach(li => {
      li.onclick = () => this.select(li.dataset.go);
    });
    p.querySelector('[data-a="addchoice"]').onclick = () => Talk.addChoice(id);
    p.querySelector('[data-a="delnode"]').onclick = () => this.dropNode(id);
    p.querySelector('[data-a="rename"]').onclick = () => this.rename(id);
    p.querySelector('[data-a="read"]').onclick = () => { this.walk = { at: id, trail: [] }; Side.show('read'); };
  },

  choiceCard(c, i) {
    return '<div class="step">'
      + '<div class="step-h"><span class="step-n">' + (i + 1) + '</span>'
      + '<button data-cmove="' + i + '" data-d="-1" title="Move up">↑</button>'
      + '<button data-cmove="' + i + '" data-d="1" title="Move down">↓</button>'
      + '<button data-cdel="' + i + '" class="warn" title="Delete this reply">✕</button></div>'
      + (c.tSrc
        ? '<textarea data-cc="' + i + '" data-k="tSrc" class="code" rows="2" wrap="off">' + esc(c.tSrc) + '</textarea>'
        : '<textarea data-ct="' + i + '" rows="2" placeholder="What the player says">' + esc(c.t || '') + '</textarea>')
      + '<div class="step-t"><span class="step-lbl">goes to</span>'
      + '<select data-cto="' + i + '">' + this.nodeOptions(c.to) + '</select></div>'
      + '<div class="step-t"><span class="step-lbl">only if</span>'
      + '<input data-cc="' + i + '" data-k="ifSrc" class="code" value="' + esc(c.ifSrc || '')
      + '" placeholder="always offered"></div>'
      + (c.doSrc
        ? '<textarea data-cc="' + i + '" data-k="doSrc" class="code" rows="2" wrap="off">' + esc(c.doSrc) + '</textarea>'
        : '')
      + '</div>';
  },

  rename(id) {
    Ask.form('Rename ' + id, [
      { k: 'id', label: 'to', value: id },
    ], 'Rename').then(v => {
      if (!v || !v.id || v.id === id) return;
      if (!Talk.renameNode(id, v.id)) { Side.say('That name is taken, or is not a usable one.'); return; }
      this.select(v.id);
      Side.say('Renamed. Every `to` moved with it, and the quoted name inside entry() — but a '
        + 'flag that entry() reads is out of reach, so check it.');
    });
  },
  dropNode(id) {
    const inc = Talk.incoming(id);
    Ask.confirm('Delete ' + id + '?',
      inc.length
        ? inc.length + ' place(s) point here, and they will be left pointing at a node that does '
          + 'not exist — which ends the conversation instead of failing.'
        : 'Nothing points at it.', 'Delete it').then(yes => {
      if (!yes) return;
      Talk.removeNode(id);
      Sel.kind = null; Sel.name = null;
      Side.refresh();
    });
  },

  /* ---- read ----
     The conversation as a conversation. Follows `to` and the replies the way
     Dialogue does, and shows a guarded reply WITH its guard rather than hiding
     it: nothing here runs the captured code, and for reading you want to see
     every branch anyway. */
  read() {
    const p = $('#paneRead');
    const roots = Talk.roots();
    if (!this.walk || !Talk.nodes[this.walk.at]) this.walk = { at: roots[0] || Talk.order[0], trail: [] };
    const at = this.walk.at;
    const n = Talk.nodes[at];
    if (!n) { p.innerHTML = '<p class="empty">Nothing to read.</p>'; return; }

    const pages = n.textSrc
      ? ['(one of a list, picked at random — ' + at + ' writes its line in code)']
      : (n.text || []);

    p.innerHTML = '<div class="frow"><span>start at</span><span><select id="edRoot">'
      + Talk.order.map(k => '<option value="' + esc(k) + '"' + (k === (this.walk.trail[0] || at) ? ' selected' : '')
        + '>' + esc(k) + (roots.indexOf(k) >= 0 ? ' — a way in' : '') + '</option>').join('')
      + '</select></span></div>'
      + (this.walk.trail.length
        ? '<div class="trail">' + this.walk.trail.map(step =>
          '<div class="trail-you">' + esc(step) + '</div>').join('') + '</div>'
        : '')
      + '<div class="said"><div class="said-who">' + esc(Talk.face || '🧑') + ' '
      + esc(Talk.name.toUpperCase()) + '<span>' + esc(at) + '</span></div>'
      + (pages.length
        ? pages.map(t => '<p>' + esc(t) + '</p>').join('')
        : '<p class="empty">(nothing)</p>')
      + (n.doSrc ? '<div class="said-code">and this node runs code</div>' : '')
      + '</div>'
      + ((n.choices || []).length
        ? '<div class="replies">' + n.choices.map((c, i) =>
          '<button data-r="' + i + '">' + esc(c.t || (c.tSrc ? '(written in code)' : '(no text)'))
          + (c.ifSrc ? '<small>only if ' + esc(c.ifSrc) + '</small>' : '')
          + '</button>').join('') + '</div>'
        : n.to
          ? '<div class="replies"><button data-r="on">Press on →</button></div>'
          : '<p class="empty">The conversation ends here.</p>')
      + '<div class="btns"><button data-a="again">Start again</button>'
      + '<button data-a="edit">Edit this node</button></div>'
      + '<div class="note">Guards are shown, not applied — this page never runs the code it '
      + 'captured, so every branch is readable from here. Reading is what this is for.</div>';

    $('#edRoot').onchange = e => { this.walk = { at: e.target.value, trail: [] }; this.read(); };
    p.querySelectorAll('[data-r]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.r;
        if (k === 'on') { this.walk.trail.push('…'); this.walk.at = n.to; }
        else {
          const c = n.choices[+k];
          this.walk.trail.push(c.t || '(a reply written in code)');
          if (!c.to || !Talk.nodes[c.to]) { this.walk.trail.push('— and that was the end of it.'); this.read(); return; }
          this.walk.at = c.to;
        }
        this.read();
      };
    });
    p.querySelector('[data-a="again"]').onclick = () => {
      this.walk = { at: this.walk.trail[0] ? this.walk.at : (roots[0] || Talk.order[0]), trail: [] };
      this.walk.at = $('#edRoot').value;
      this.read();
    };
    p.querySelector('[data-a="edit"]').onclick = () => this.select(at);
  },

  /* ---- check ---- */
  check() {
    const p = $('#paneCheck');
    const f = TalkCheck.faults;
    const errors = f.filter(x => x.level === 'error');
    const warns = f.filter(x => x.level === 'warn');
    const seen = Talk.reachable();

    const group = (list, title, cls) => !list.length ? '' : '<h4>' + title + '</h4>'
      + '<ul class="faults">' + list.map(x =>
        '<li class="' + cls + '"' + (x.node ? ' data-node="' + esc(x.node) + '"' : '') + '>'
        + esc(x.msg) + '</li>').join('') + '</ul>';

    p.innerHTML = '<div class="stat">'
      + '<div><b>' + Talk.order.length + '</b><span>nodes</span></div>'
      + '<div><b class="' + (seen.size < Talk.order.length ? 'bad' : 'good') + '">' + seen.size
      + '</b><span>reachable</span></div>'
      + '<div><b class="' + (errors.length ? 'bad' : 'good') + '">' + errors.length + '</b><span>broken</span></div>'
      + '</div>'
      + (f.length
        ? group(errors, errors.length + ' broken now', 'error')
          + group(warns, warns.length + ' will bite later', 'warn')
        : '<p class="ok">✓ Nothing wrong with this conversation.</p>')
      + '<div class="note">The reachability walk is the flood fill, applied to a tree: it starts '
      + 'at every node entry() could return, follows every `to`, and anything it never arrives at '
      + 'is writing nobody will ever read. The rest is names — a <code>to</code>, an achievement, '
      + 'a job — that have to exist somewhere else and are checked by nobody.</div>';

    p.querySelectorAll('.faults li').forEach(li => {
      if (li.dataset.node) li.onclick = () => this.select(li.dataset.node);
    });
  },

  /* ---- export ---- */
  exportPane() {
    Side.exportChoices({
      rows: 18,
      name: v => Talk.id + '.' + v + '.txt',
      choices: [
        { v: 'nodes', label: 'The nodes &rarr; data/npcs.js',
          src: () => Emit.talkNodes(),
          note: 'The nodes block, to paste over the old one. Every do(), if: and '
            + 'code-written text comes back out exactly as it went in — this tool does not write '
            + 'that code and will not pretend to.' },
        { v: 'person', label: 'The whole person',
          src: () => Emit.talkPerson(),
          note: 'The whole entry for data/npcs.js. The desk, colour and schedule come '
            + 'through as they were — they belong to the floor plan, not to this tab.' },
        { v: 'changes', label: 'Change list',
          src: () => Emit.talkChanges(),
          note: 'What you changed, node by node.' }]
    });
  }
};
