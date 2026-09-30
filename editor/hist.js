'use strict';
/* ---------------- What every document shares ----------------
   Three mixins, so the shell's questions are answered once for all ten
   documents.

   ---- Undo ----
   Snapshot the whole document before each edit: small enough to copy, and
   cannot drift like a journal of operations. A document supplies `state()`,
   `restore(s)` and `rebuild()`; the rest is mixed in, so `Doc.undo()` stays
   `Doc.undo()`. */

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
  /* No base means nothing loaded (the art importer until a sheet comes in),
     which is not "changed". */
  changed() {
    return this.base !== null && this.base !== undefined
      && JSON.stringify(this.state()) !== JSON.stringify(this.base);
  },

  /* ---- the bench ----
     A document holds one subject at a time. Leaving one keeps it: `stash()`
     puts the working copy on the bench with its undo stack, `resume()` takes it
     back and rebases on the file's version, so "changed" means "not exported".
     Nothing is written to disk; Project shows what is on the bench. */
  bench: null,
  /* Prog, Calls and Office key themselves by `kind:id`; everything else by a
     bare id. One question, asked in one place. */
  subjectKey() { return this.key ? this.key() : this.id; },

  /* Before load() leaves the subject. Unedited ones come off the bench. */
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
  /* After load(). Objects and rooms write into the live FURN and ZONES, so they
     supply `pristineState()` (the file's version) to measure against. */
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
     Sync writes the files, so every bench empties and `base` becomes what was
     written. FURN and ZONES documents re-take their file snapshot, or the save
     itself would read as an edit. */
  settle() {
    this.bench = {};
    if (this.keep) { this.pristine = null; this.keep(); }
    const p = this.pristineState ? this.pristineState() : null;
    this.base = p || clone(this.state());
    /* The undo stack is kept: undoing past a save makes the document differ
       again, which is true. */
  },
  /* Settle only the subjects that landed; for documents written a subject at
     a time (a level, a minigame). */
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
   The shell asks every checker: how bad (the Check badge), how many faults a
   subject has, and the worst (a list dot). A checker supplies `faults` for
   the open subject and, where it badges a list, `per`: subject id to faults. */
const FAULTS = {
  errors() { return this.faults.filter(f => f.level === 'error').length; },
  countFor(id) { return (this.per.get(id) || []).length; },
  /* '' when there is nothing to say, so it can go straight into a class name. */
  worstFor(id) {
    const f = this.per.get(id) || [];
    return f.some(x => x.level === 'error') ? 'error' : f.length ? 'warn' : '';
  }
};

/* A JSON clone: every document is JSON-shaped. */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/* The same for values holding code (`onGift()`, an `if:`): each function
   becomes `{ __src }`, written back by Emit.prop() as code. */
function capture(v) {
  if (typeof v === 'function') return { __src: String(v) };
  if (Array.isArray(v)) return v.map(capture);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach(k => { out[k] = capture(v[k]); });
    return out;
  }
  return v;
}
const isSrc = v => !!v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === 1 && typeof v.__src === 'string';
