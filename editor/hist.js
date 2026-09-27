'use strict';
/* ---------------- What every document here shares ----------------
   Three mixins now. All of them exist for the same reason: this page edits ten
   things — a level, a job, a person's dialogue, a kind of object, a kind of
   room, the day, the rewards, the calls, a sheet of art, a minigame — and the
   shell asks all ten the same questions, so the answers are written once and
   mixed in rather than copied ten times and left to drift.

   ---- Undo ----
   All ten want the same undo: snapshot the whole document before each edit,
   because a few hundred objects (or forty nodes) is small enough that copying
   the lot per edit is cheaper to reason about than a journal of reversible
   operations, and cannot drift out of step with one.

   So it is written once and mixed in. A document supplies three things and gets
   the rest: `state()` (everything it is, as plain data), `restore(s)` (put that
   back) and `rebuild()` (make the preview and the checks current again).

   Mixed in rather than wrapped, so `Doc.undo()` is still `Doc.undo()` — the
   suite calls it by that name and so does every tool. */

const HIST = {
  /* Bounded: an unbounded undo stack on a document this size is a slow leak
     nobody notices until the tab is warm. */
  LIMIT: 60,

  /* Call BEFORE mutating. `label` is what the undo button says it would take
     back — the only thing that tells you whether the last thing you did
     registered at all. */
  mark(label) {
    this.undoStack.push({ label: label, s: this.state() });
    if (this.undoStack.length > this.LIMIT) this.undoStack.shift();
    this.redoStack = [];
  },
  undo() {
    const top = this.undoStack.pop();
    if (!top) return false;
    this.redoStack.push({ label: top.label, s: this.state() });
    this.restore(top.s);
    this.rebuild();
    return top.label;
  },
  redo() {
    const top = this.redoStack.pop();
    if (!top) return false;
    this.undoStack.push({ label: top.label, s: this.state() });
    this.restore(top.s);
    this.rebuild();
    return top.label;
  },
  /* The state this document was loaded in. Set by whatever loads it, and what
     `changed()` and every change list are measured against. */
  rebase() {
    this.base = this.state();
    this.undoStack = []; this.redoStack = [];
  },
  /* No base means nothing has been loaded into this document — which is the
     art importer's whole life until somebody brings a sheet in. That is not
     "changed": `state()` is `{}` and `base` is null, and comparing the two said
     the empty importer had unexported work in it for as long as the page was
     open. */
  changed() {
    return this.base !== null && this.base !== undefined
      && JSON.stringify(this.state()) !== JSON.stringify(this.base);
  },

  /* ---- the bench ----
     A document holds ONE subject at a time — the job you are editing, the
     person, the level — because that is what the panel inspects and what undo
     is about. That used to mean the subject you had edited was a dead end:
     the only way to look at another job was "Discard and leave", so you could
     not sketch a job, go and add the person who gives it, and come back. With
     ten documents and three hundred and fifty subjects between them, that is
     not a creative process, it is a queue of one.

     So leaving a subject KEEPS it. `stash()` puts the working copy on the
     bench with its own undo stack; `resume()` takes it back off when you
     return, and rebases against the FILE's version rather than the working
     one, so "changed" still means "not exported yet" rather than "not touched
     since I came back". Nothing is written to disk by any of this — the bench
     is this tab's memory until something writes it out, which is exactly why
     what is on it has to be visible: see Project, and `settle()` below. */
  bench: null,
  /* Prog, Calls and Office key themselves by `kind:id`; everything else by a
     bare id. One question, asked in one place. */
  subjectKey() { return this.key ? this.key() : this.id; },

  /* Call BEFORE load() moves off the current subject. An unedited one is taken
     back off the bench rather than left on it, or reverting something and
     walking away would put the edits back next time you looked. */
  stash() {
    const k = this.subjectKey();
    if (k === null || k === undefined) return;
    if (!this.bench) this.bench = {};
    if (this.changed()) {
      this.bench[k] = { s: this.state(), u: this.undoStack.slice(), r: this.redoStack.slice() };
    } else {
      delete this.bench[k];
    }
  },
  /* Call AFTER load() has read the file's version and rebased on it.

     Two documents — the objects and the rooms — write their working copy back
     into the live table, because the preview is built from FURN and ZONES and
     there is nowhere else for the builder to read it from. So `load()` rebases
     them against a table they had already written, and `changed()` read false
     the moment you looked away and back: the edit was still there, still not
     in any file, and the bench quietly dropped it the next time you left. They
     supply `pristineState()` — the FILE's version — and that is what "changed"
     is measured against. */
  resume() {
    if (this.pristineState) {
      const p = this.pristineState();
      if (p) this.base = p;
    }
    const e = this.bench && this.bench[this.subjectKey()];
    if (!e) return false;
    this.restore(clone(e.s));
    this.undoStack = e.u.slice(); this.redoStack = e.r.slice();
    return true;
  },
  /* The working copy of a subject that is NOT the open one, or null. What the
     table emitters read, so an export is the whole bench and not just the
     thing in front of you. */
  kept(key) {
    const e = this.bench && this.bench[key];
    return e && key !== this.subjectKey() ? e.s : null;
  },
  /* Throw one away. Revert calls this, or leaving would put back what you have
     just reverted. */
  forget(key) {
    const k = key === undefined ? this.subjectKey() : key;
    if (this.bench) delete this.bench[k];
  },
  /* ---- when the files catch up ----
     The mirror image of `resume()`. Everything above is written on the
     assumption that data/ never moves — the export was the only way out, so a
     document could only ever be ahead of the files. Sync writes them, which
     makes "ahead" a thing that stops being true, and nothing here could say so:
     the bench would still hold working copies of what had just been saved, and
     the next `stash()` would put them back as unexported work.

     So this is the other end of it. Every bench is empty because its contents
     are in the files now, and `base` is the version just written — which for
     the two documents that write back into a live table (FURN, ZONES) means
     re-taking the snapshot they measure "the file's version" against, or they
     would report the save itself as an unsaved edit for ever. */
  settle() {
    this.bench = {};
    if (this.keep) { this.pristine = null; this.keep(); }
    const p = this.pristineState ? this.pristineState() : null;
    this.base = p || clone(this.state());
    /* The undo stack is deliberately left alone. Saving is not a reason to
       lose the afternoon's history, and an undo past a save is honest: it
       makes the document differ from the files again, which is exactly what
       has happened and exactly what `changed()` should then say. */
  },
  /* Some of what this document had is in the files now and the rest is not,
     which settle() cannot say — it empties the bench. Given the subjects that
     actually landed, forget those and leave every other one exactly where it
     was. Used by the two documents written a subject at a time (a level, a
     minigame); the eight whose table goes in whole have nothing partial to
     say and still settle(). */
  settleSome(keys) {
    if (!keys || !keys.length) return;
    if (this.bench) keys.forEach(k => { delete this.bench[k]; });
    const open = this.subjectKey();
    if (open === null || open === undefined || keys.indexOf(open) < 0) return;
    const p = this.pristineState ? this.pristineState() : null;
    this.base = p || clone(this.state());
  },
  /* Every subject of this document with work on it, the open one included.
     This is what "you have not exported this yet" is counted from. */
  editedKeys() {
    const out = Object.keys(this.bench || {});
    const k = this.subjectKey();
    if (k !== null && k !== undefined && this.changed() && out.indexOf(k) < 0) out.push(k);
    return out.sort();
  }
};

/* ---- Counting what is wrong ----
   Each document has a checker beside it, and the shell asks every one of them
   the same three questions: how bad is it (the badge on the Check tab), how
   many faults has one subject got, and which is the worst of them (the dot
   beside a name in a list). A checker supplies `faults` — the open subject's —
   and, where it has a list of subjects to badge, `per`: a Map of subject id to
   that subject's faults.

   Written here rather than ten times over because ten copies of a one-line
   filter is exactly how one of them ends up counting something else. */
const FAULTS = {
  errors() { return this.faults.filter(f => f.level === 'error').length; },
  countFor(id) { return (this.per.get(id) || []).length; },
  /* '' when there is nothing to say, so it can go straight into a class name. */
  worstFor(id) {
    const f = this.per.get(id) || [];
    return f.some(x => x.level === 'error') ? 'error' : f.length ? 'warn' : '';
  }
};

/* Structured clone by hand: every document here is JSON-shaped by construction,
   and this works on every browser without asking whether structuredClone
   exists. Lives with the history because the history is what needs it. */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}
