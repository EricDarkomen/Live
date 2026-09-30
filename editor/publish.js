'use strict';
/* ---------------- Publishing, from a phone ----------------
   The third end of Sync: the finished files go into the repository the page
   was served from, as one commit, and the site rebuilds. Sync's splice,
   staging and parse check are unchanged; the current text is read from the
   branch (which a lagging Pages deploy cannot make stale).
   One commit, not one per file: the git data API (blobs, a tree, a commit,
   then the ref moves), so a failure never leaves half a save.
   The token is a fine-grained personal access token scoped to one repository
   with Contents: read and write, kept in this browser's storage and sent only
   to api.github.com. Forgetting it is one press, beside the button. */

const Repo = {
  /* Where it goes and what it goes with, kept apart on purpose: forgetting the
     token must not also forget which repository you were publishing to. */
  CFG: GAME.id + '.repo',
  TOK: GAME.id + '.token',
  API: 'https://api.github.com',

  /* The repository this page was served from, when on GitHub Pages
     (owner.github.io/repo/editor.html). */
  guess() {
    const host = String(location.hostname || '');
    const m = /^([\w-]+)\.github\.io$/i.exec(host);
    if (!m) return { owner: '', repo: '', branch: 'main' };
    const seg = String(location.pathname || '/').split('/').filter(Boolean);
    const first = seg[0] || '';
    /* A project page is /repo/…; a user page's repository is named after the host. */
    return { owner: m[1], repo: first && first.indexOf('.') < 0 ? first : host, branch: 'main' };
  },

  where() {
    let saved = null;
    try { saved = JSON.parse(Store.get(this.CFG) || 'null'); } catch (_) { saved = null; }
    return Object.assign(this.guess(), saved || {});
  },
  remember(cfg) { Store.set(this.CFG, JSON.stringify(cfg)); },
  token() { return Store.get(this.TOK) || ''; },
  keepToken(t) { return Store.set(this.TOK, t); },
  forget() { Store.drop(this.TOK); },
  /* Everything it needs to go. Somewhere to send it is half; something to send
     it with is the other half. */
  ready() {
    const w = this.where();
    return !!(w.owner && w.repo && w.branch && this.token());
  },
  label() { const w = this.where(); return w.owner + '/' + w.repo + ' · ' + w.branch; },

  /* ---- the API ----
     One place for headers and the token. Errors come back as sentences (a 404
     can mean missing or not permitted). */
  at(path) {
    const w = this.where();
    return '/repos/' + encodeURIComponent(w.owner) + '/' + encodeURIComponent(w.repo) + path;
  },
  enc(path) { return String(path).split('/').map(encodeURIComponent).join('/'); },

  call(method, path, body, accept, raw) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('this page cannot reach the network'));
    }
    const head = {
      Authorization: 'Bearer ' + this.token(),
      Accept: accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (body !== undefined) head['Content-Type'] = 'application/json';
    return fetch(this.API + path, {
      method: method, headers: head,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(r => {
      if (r.ok) return raw ? r.text() : r.json();
      return r.text().then(t => {
        let msg = '';
        try { msg = (JSON.parse(t) || {}).message || ''; } catch (_) { msg = ''; }
        throw new Error(this.saidWhat(r.status, msg));
      });
    }, () => { throw new Error('could not reach api.github.com'); });
  },
  saidWhat(status, msg) {
    if (status === 401) return 'GitHub refused the token — it may have expired, or been typed short';
    if (status === 404) {
      return 'GitHub has no ' + this.label().split(' · ')[0] + ', or this token cannot see it — a '
        + 'fine-grained token has to name the repository itself';
    }
    if (status === 403) {
      return 'GitHub allowed the token but not this: ' + (msg || 'it needs Contents: read and write');
    }
    if (status === 409 || status === 422) {
      return 'the branch moved while this was being prepared' + (msg ? ' — ' + msg : '')
        + '. Reload and save again';
    }
    return 'GitHub said ' + status + (msg ? ' — ' + msg : '');
  },

  /* One file as the branch has it, since the commit builds on the branch. */
  read(path) {
    return this.call('GET', this.at('/contents/' + this.enc(path))
      + '?ref=' + encodeURIComponent(this.where().branch),
    undefined, 'application/vnd.github.raw', true);
  },

  /* Every file in one commit; nothing changes until the ref moves. */
  commit(files, message) {
    const w = this.where();
    const head = '/git/ref/heads/' + this.enc(w.branch);
    let base = null;
    return this.call('GET', this.at(head))
      .then(r => {
        base = r.object.sha;
        return this.call('GET', this.at('/git/commits/' + base));
      })
      .then(c => Promise.all(files.map(f =>
        this.call('POST', this.at('/git/blobs'), { content: f.text, encoding: 'utf-8' })
          .then(b => ({ path: f.path, mode: '100644', type: 'blob', sha: b.sha })))
      ).then(tree => this.call('POST', this.at('/git/trees'),
        { base_tree: c.tree.sha, tree: tree })))
      .then(t => this.call('POST', this.at('/git/commits'),
        { message: message, tree: t.sha, parents: [base] }))
      .then(c => this.call('PATCH', this.at('/git/refs/heads/' + this.enc(w.branch)), { sha: c.sha })
        .then(() => c));
  },

  /* Where to go and look at what just happened. */
  commitUrl(sha) {
    const w = this.where();
    return 'https://github.com/' + encodeURIComponent(w.owner) + '/'
      + encodeURIComponent(w.repo) + '/commit/' + sha;
  },

  /* ---- setting it up ----
     Four fields, three prefilled on a published page; the link makes a
     fine-grained token. */
  setup() {
    const w = this.where();
    return Ask.form('Publish to GitHub', [
      { k: 'owner', label: 'owner', value: w.owner, hint: 'the user or organisation' },
      { k: 'repo', label: 'repository', value: w.repo, hint: 'the repository' },
      { k: 'branch', label: 'branch', value: w.branch, hint: 'main' },
      { k: 'token', label: 'token', value: this.token(), hint: 'github_pat_…' },
    ], 'Save it',
    '<div class="note">Saving from a phone: the finished files go straight into the repository '
      + 'as one commit, and the site rebuilds itself.<br><br>Make a <b>fine-grained</b> token at '
      + '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" '
      + 'rel="noopener">github.com/settings/personal-access-tokens/new</a> — give it <b>this '
      + 'repository only</b>, <b>Contents: read and write</b>, and an expiry date. It is kept in '
      + 'this browser and sent to api.github.com and nowhere else.</div>')
      .then(v => {
        if (!v) return false;
        if (!v.owner || !v.repo || !v.branch) { Side.say('It needs an owner, a repository and a branch.'); return false; }
        this.remember({ owner: v.owner, repo: v.repo, branch: v.branch });
        if (v.token && !this.keepToken(v.token)) { Side.say(Store.why()); return false; }
        if (!this.token()) { Side.say('It needs a token to commit with.'); return false; }
        return true;
      });
  },
};
