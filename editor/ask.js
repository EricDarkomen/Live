'use strict';
/* ---------------- Asking for something ----------------
   A <dialog>, since sandboxed frames refuse prompt() and confirm(). One form
   holds every field, selects cover known sets, and Escape abandons it. */

const Ask = {
  el: null, resolve: null,

  init() {
    this.el = document.createElement('dialog');
    this.el.id = 'edAsk';
    document.body.appendChild(this.el);
    /* Escape closes a <dialog> by itself; make that a cancel rather than a
       resolve-with-whatever-was-typed. */
    this.el.addEventListener('cancel', () => this.done(null));
    this.el.addEventListener('close', () => this.done(null));
  },

  done(v) {
    const r = this.resolve;
    this.resolve = null;
    if (r) r(v);
  },
  close() {
    if (this.el.open) this.el.close();
    this.el.classList.remove('picking');
  },

  /* fields: [{ k, label, value, hint, options }]; `options` makes a select.
     Resolves with { k: value }, or null if cancelled. */
  /* `intro` is markup above the fields, built in code, so not escaped. */
  form(title, fields, okLabel, intro) {
    return new Promise(resolve => {
      this.close();
      this.resolve = resolve;
      this.el.innerHTML = '<form method="dialog"><h3>' + esc(title) + '</h3>'
        + (intro || '')
        + fields.map(f => '<label class="frow"><span>' + esc(f.label) + '</span><span>'
          + (f.options
            ? '<select data-k="' + esc(f.k) + '">' + f.options.map(o =>
              '<option value="' + esc(o) + '"' + (o === f.value ? ' selected' : '') + '>'
              + esc(o) + '</option>').join('') + '</select>'
            : '<input data-k="' + esc(f.k) + '" value="' + esc(f.value == null ? '' : f.value) + '"'
              + (f.hint ? ' placeholder="' + esc(f.hint) + '"' : '') + '>')
          + '</span></label>').join('')
        + '<div class="btns"><button value="ok">' + esc(okLabel || 'OK') + '</button>'
        + '<button value="cancel" class="ghost">Cancel</button></div></form>';

      const form = this.el.querySelector('form');
      form.addEventListener('submit', e => {
        /* The submitter tells you which button; a form submitted with Enter has
           none, and Enter means OK. */
        if (e.submitter && e.submitter.value === 'cancel') return;
        const out = {};
        this.el.querySelectorAll('[data-k]').forEach(i => out[i.dataset.k] = i.value.trim());
        e.preventDefault();
        this.el.close();
        this.done(out);
      });
      this.el.showModal();
      const first = this.el.querySelector('input,select');
      if (first) { first.focus(); if (first.select) first.select(); }
    });
  },

  /* Something to read (the help sheet); markup built in code, not escaped. */
  tell(title, html, okLabel) {
    return new Promise(resolve => {
      this.close();
      this.resolve = resolve;
      this.el.innerHTML = '<form method="dialog"><h3>' + esc(title) + '</h3>'
        + html
        + '<div class="btns"><button value="ok">' + esc(okLabel || 'Right') + '</button></div></form>';
      this.el.showModal();
      /* Focusing the button scrolls a long sheet to the bottom of itself, so the
         first thing you are shown is the end of it. */
      this.el.querySelector('button').focus();
      this.el.scrollTop = 0;
    });
  },

  /* ---- a list to choose from ----
     For choices too many for a <select>: filterable, with hints. The caller
     draws the list: `render(host, api)` fills it, `api.redraw()` redraws and
     `api.close()` closes. Nothing resolves; a picker acts as you press. */
  picker(title, render) {
    this.close();
    this.resolve = null;
    /* The one dialog whose middle has to absorb the height rather than the
       whole thing growing past the bottom of the screen. */
    this.el.classList.add('picking');
    this.el.innerHTML = '<form method="dialog"><h3>' + esc(title) + '</h3>'
      + '<div class="pick"></div>'
      + '<div class="btns"><button value="ok" class="ghost">Close</button></div></form>';
    const host = this.el.querySelector('.pick');
    const api = { redraw: () => render(host, api), close: () => this.close() };
    api.redraw();
    this.el.showModal();
    /* The filter if there is one, because the keyboard is why it is there; the
       list otherwise. Never the Close button — focusing that scrolls a long
       sheet to its own end. */
    const first = host.querySelector('input');
    if (first) first.focus();
    this.el.scrollTop = 0;
  },

  /* A question with a real verb on the button. "Continue" tells you nothing
     about what is about to happen to your afternoon's work. */
  confirm(title, body, okLabel) {
    return new Promise(resolve => {
      this.close();
      this.resolve = resolve;
      this.el.innerHTML = '<form method="dialog"><h3>' + esc(title) + '</h3>'
        + '<p>' + esc(body) + '</p>'
        + '<div class="btns"><button value="ok" class="warn">' + esc(okLabel || 'Yes') + '</button>'
        + '<button value="cancel" class="ghost">Cancel</button></div></form>';
      this.el.querySelector('form').addEventListener('submit', e => {
        if (e.submitter && e.submitter.value === 'cancel') return;
        e.preventDefault();
        this.el.close();
        this.done(true);
      });
      this.el.showModal();
      this.el.querySelector('button').focus();
    });
  }
};
