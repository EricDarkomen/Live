'use strict';
/* ---------------- The job being edited ----------------
   A quest is the one thing in this game that is pure data: a name, who gives it,
   an ordered list of steps, one tracker target per step, and what you get. No
   loops, no functions, nothing to capture — so unlike a level's furniture it
   round-trips exactly, and the whole QUESTS table can be written back out.

   Which makes the interesting part not the editing but the CHECKING. A quest is
   two lists that have to stay the same length and one table of targets that
   have to resolve, and both faults are invisible: `Guide.aim()` returns false
   for a target that has gone and the tracker simply shows no pin, which reads
   as a step that has nowhere to go rather than as a mistake. A step with no
   entry in `track` is `undefined` rather than `null`, and `null` means
   something here — it means "you are not told where to go, that is the puzzle".

   The catalogue is not written to. QUESTS stays exactly as data/items.js
   declared it and the doc is a copy, the same arrangement the level editor uses
   with LEVELS: the preview and the checks read the doc, the export is the
   deliverable, and Revert is a reload. */

const Jobs = {
  id: null,
  n: '', giver: '', steps: [], track: [], rw: { xp: 0, money: 0, item: null },
  base: null, undoStack: [], redoStack: [],

  ids() { return Object.keys(QUESTS); },

  load(id) {
    const q = QUESTS[id];
    if (!q) return false;
    this.id = id;
    this.n = q.n || id;
    this.giver = q.giver || '';
    this.steps = clone(q.steps || []);
    /* One target per step, and `null` where there deliberately is none. A
       shorter `track` than `steps` is not "the rest are null" — it is a step
       whose target is `undefined`, which the tracker treats the same way and
       the check does not, because one of them was meant and the other was
       forgotten. Padded on the way in so the pairing is visible. */
    this.track = clone(q.track || []);
    while (this.track.length < this.steps.length) this.track.push(null);
    this.rw = Object.assign({ xp: 0, money: 0, item: null }, clone(q.rw || {}));
    this.rebase();
    return true;
  },

  state() {
    return clone({ n: this.n, giver: this.giver, steps: this.steps, track: this.track, rw: this.rw });
  },
  restore(s) { Object.keys(s).forEach(k => this[k] = clone(s[k])); },
  /* Nothing to build — a quest has no map. What "rebuild" means here is that
     the checks and the panel are made current, which is the same promise. */
  rebuild() {
    JobCheck.run();
    if (Side.live) Side.refresh();
    return this;
  },

  /* ---- the entry as the file writes it ----
     Taken from a state rather than from `this`, so the same normalisation
     serves the job in front of you and the ones on the bench. */
  defFrom(s) {
    const out = { n: s.n, giver: s.giver, steps: clone(s.steps), track: clone(s.track) };
    const rw = s.rw || {};
    out.rw = { xp: +rw.xp || 0, money: +rw.money || 0, item: rw.item || null };
    return out;
  },
  def() { return this.defFrom(this); },

  /* ---- editing ---- */
  set(k, v) {
    this.mark('edit ' + this.n);
    this[k] = v;
    this.rebuild();
  },
  setReward(k, v) {
    this.mark('edit reward');
    this.rw[k] = v;
    this.rebuild();
  },
  setStep(i, text) {
    if (this.steps[i] === text) return;
    this.mark('edit step ' + (i + 1));
    this.steps[i] = text;
    this.rebuild();
  },
  /* The two lists move together, always. Every one of these could be written as
     a splice on `steps` alone and every one of them would leave the targets
     shifted one step out — a job that points at Dave for the step about the
     printer, which looks like a job that works. */
  addStep() {
    this.mark('add a step');
    this.steps.push('');
    this.track.push(null);
    this.rebuild();
  },
  removeStep(i) {
    if (this.steps.length <= 1) return false;
    this.mark('delete step ' + (i + 1));
    this.steps.splice(i, 1);
    this.track.splice(i, 1);
    this.rebuild();
    return true;
  },
  moveStep(i, d) {
    const j = i + d;
    if (j < 0 || j >= this.steps.length) return false;
    this.mark('reorder steps');
    [this.steps[i], this.steps[j]] = [this.steps[j], this.steps[i]];
    [this.track[i], this.track[j]] = [this.track[j], this.track[i]];
    this.rebuild();
    return true;
  },
  /* `kind` is 'npc', 'obj', 'wp' or '' — and '' is a real answer, not an empty
     one. "Find out who has Terry's mug" has no destination on purpose: a
     compass arrow pointing at the answer is the game telling you the answer. */
  setTarget(i, kind, value, label) {
    this.mark('point step ' + (i + 1));
    if (!kind) this.track[i] = null;
    else {
      const t = {};
      t[kind] = value;
      if (kind === 'wp' && label) t.label = label;
      this.track[i] = t;
    }
    this.rebuild();
  },
  targetOf(i) {
    const t = this.track[i];
    if (!t) return { kind: '', value: '' };
    if (t.npc) return { kind: 'npc', value: t.npc };
    if (t.obj) return { kind: 'obj', value: t.obj };
    if (t.wp) return { kind: 'wp', value: t.wp, label: t.label || '' };
    return { kind: '', value: '' };
  }
};
Object.assign(Jobs, HIST);

/* ---------------- Making and unmaking a job ----------------
   In this tab only, exactly like a level made here: QUESTS is the catalogue and
   the export is what puts anything into it for real. */
const JobMake = {
  create() {
    Ask.form('A new job', [
      { k: 'id', label: 'id', value: '', hint: 'how the table keys it, e.g. q_kettle' },
      { k: 'n', label: 'called', value: '', hint: 'what the tracker shows' },
      { k: 'giver', label: 'given by', value: '', hint: 'a name, or a thing — “the tin” is a giver' },
    ], 'Create').then(v => {
      if (!v || !v.id) return;
      const id = v.id.replace(/[^\w$]/g, '');
      if (!id || /^\d/.test(id)) { Side.say('An id has to be a usable property name.'); return; }
      if (QUESTS[id]) { Side.say('There is already a job called ' + id + '.'); return; }
      QUESTS[id] = {
        n: v.n || id, giver: v.giver || 'nobody in particular',
        steps: ['The first thing to do.'], track: [null],
        rw: { xp: 50, money: 0, item: null }
      };
      Mode.openSubject(id);
      Side.say('Created ' + id + '. Nothing starts it yet — the check says so, and an act or a '
        + 'line of dialogue has to call Q.start(' + Emit.str(id) + ').');
    });
  },
  drop() {
    const id = Jobs.id;
    const others = Jobs.ids().filter(x => x !== id);
    if (!others.length) { Side.say('This is the only job there is.'); return; }
    const from = JobCheck.callers(id);
    Ask.confirm('Delete ' + Jobs.n + '?',
      'It goes from this tab’s table. data/items.js is untouched, so a reload brings it '
      + 'back exactly as it was'
      /* Named, not counted. "3 place(s) still name it" is a number you can do
         nothing with; the places themselves are where you have to go next, and
         the check will keep saying so until you have. */
      + (from.start.length || from.step.length
        ? ' — but the writing still names it in ' + (from.start.length + from.step.length)
          + ' place(s), and those would throw: '
          + from.start.concat(from.step).slice(0, 3).join(', ')
          + (from.start.length + from.step.length > 3 ? ', …' : '') + '.'
        : '.'),
      'Delete it').then(yes => {
      if (!yes) return;
      delete QUESTS[id];
      Jobs.forget(id);
      Mode.openSubject(others[0]);
      Side.say('Deleted ' + id + ' from this tab.');
    });
  }
};

/* ---------------- What is wrong with the jobs ----------------
   Three kinds of fault, and only the first is visible while you play.

     THE PAIRING   — `steps` and `track` are one list written as two, and
                     nothing enforces it. A target list one short does not fail;
                     it shifts, so the step about the printer points at Dave.
     THE TARGETS   — Guide.aim() returns false for a target that has gone and
                     the tracker simply shows no pin, which is indistinguishable
                     from a step that deliberately has none.
     THE WIRING    — a job nobody starts is a job nobody sees, and a job nobody
                     completes sits in the tracker until the shift ends.

   The last one is the reason `Writing` exists: nothing in data/items.js says
   which line of dialogue starts a job, so the only way to answer it is to read
   the writing. */

const JobCheck = {
  faults: [], per: new Map(),

  run() {
    this.per = new Map();
    Jobs.ids().forEach(id => this.per.set(id, this.one(id)));
    this.faults = (this.per.get(Jobs.id) || []).concat(this.dangling());
    return this;
  },

  /* The job being edited is read from the doc; every other job is read from the
     table, so the list's badges are about the game as it stands. */
  one(id) {
    const q = id === Jobs.id ? Jobs.def() : QUESTS[id];
    const out = [];
    const fault = (level, msg, extra) => out.push(Object.assign({ level: level, msg: msg, job: id }, extra || {}));
    if (!q) return out;

    const steps = q.steps || [], track = q.track || [];
    if (steps.length !== track.length) {
      fault('error', 'This job has ' + steps.length + ' step' + (steps.length === 1 ? '' : 's')
        + ' and ' + track.length + ' tracker target' + (track.length === 1 ? '' : 's') + '. They are one '
        + 'list written as two: a short `track` does not fail, it shifts, so a later step points '
        + 'at the wrong thing.');
    }
    steps.forEach((t, i) => {
      if (!String(t || '').trim()) fault('error', 'Step ' + (i + 1) + ' has no text.', { step: i });
      else if (/\w'\w/.test(t)) fault('warn', 'Step ' + (i + 1) + ' uses a straight apostrophe. '
        + 'Everything else the player reads uses a curly one.', { step: i });
    });

    track.forEach((t, i) => {
      if (!t) return;                        /* deliberate: see the note above */
      if (t.npc && !(typeof NPCS !== 'undefined' && NPCS.some(p => p.id === t.npc))) {
        fault('error', 'Step ' + (i + 1) + ' points at a colleague called “' + t.npc
          + '”, and there is nobody by that id.', { step: i });
      }
      if (t.obj && Palette.uses.indexOf(t.obj) < 0) {
        fault('error', 'Step ' + (i + 1) + ' points at the object with `use: ' + Emit.str(t.obj)
          + '`, and no level has one. Guide.aim() returns false and the step simply has no pin, '
          + 'which looks exactly like a step that never had one.', { step: i });
      }
      if (t.wp && !(typeof WP !== 'undefined' && WP[t.wp])) {
        fault('error', 'Step ' + (i + 1) + ' points at waypoint “' + t.wp + '”, which is not in WP.',
          { step: i });
      }
    });

    const rw = q.rw || {};
    if (rw.item && !(typeof ITEMS !== 'undefined' && ITEMS[rw.item])) {
      fault('error', 'The reward is an item called “' + rw.item + '”, which is not in ITEMS. '
        + 'Item.give() would hand over nothing, quietly.');
    }
    if (!rw.xp) fault('warn', 'No XP on completion. Every other job pays something.');

    /* The wiring. Read off the writing, so it is about the game rather than
       about the table. */
    const w = Writing.job(id);
    if (!w.start.length) {
      fault('error', 'Nothing starts this job. No line of dialogue and no act calls '
        + 'Q.start(' + Emit.str(id) + '), so it can never appear in the tracker.');
    }
    if (!w.complete.length) {
      fault('warn', 'Nothing completes this job. Q.complete(' + Emit.str(id) + ') is never called, '
        + 'so it stays open in the tracker until the shift ends and the reward is never paid.');
    }
    if (steps.length > 1 && w.step.length < steps.length - 1) {
      fault('warn', 'Found ' + w.step.length + ' place' + (w.step.length === 1 ? '' : 's')
        + ' that advance this job, for ' + steps.length + ' steps. A step that is never advanced '
        + 'is a step the player is asked to do and then asked to do again.');
    }
    return out;
  },

  /* The other direction: the writing naming a job that is not in the table.
     Q.step on an unknown id returns early and does nothing at all, which is the
     worst kind of fault — the conversation reads perfectly. */
  dangling() {
    const out = [];
    ['start', 'step', 'complete', 'active', 'complete2'].forEach(m => {
      Writing.byId('Q', m).forEach((wheres, id) => {
        if (QUESTS[id]) return;
        out.push({ level: 'error', job: null,
          msg: 'Q.' + m + '(' + Emit.str(id) + ') is called in ' + wheres.length + ' place'
            + (wheres.length === 1 ? '' : 's') + ' and there is no such job: ' + wheres.slice(0, 3).join(', ')
            + (wheres.length > 3 ? '…' : '') });
      });
    });
    return out;
  },

  /* Where the writing touches one job, for the panel. */
  callers(id) { return Writing.job(id); }
};
Object.assign(JobCheck, FAULTS);
