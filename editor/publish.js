'use strict';
/* ---------------- Publishing, from a phone ----------------
   The other end of Sync. Given a folder to write to, it writes; given a browser
   with no folder picker, it prepares the finished files and hands them to you.
   Neither is any use on a phone: there is no folder to be given and nowhere to
   put a download, and the published editor is the only copy of the tool most
   people will ever open. Draw a room on the train, and the work goes as far as
   the browser tab and no further.

   So this is the third end: the finished files go straight into the repository
   the page was served from, as ONE COMMIT, and the site rebuilds itself. The
   splice, the staging and the parse check are Sync's and unchanged — the only
   thing that differs is that the current text is read from the branch rather
   than from a folder or from the served copy, which is also the safer place to
   read it: the branch is what the commit will land on, so a Pages deploy that
   is a minute behind cannot cause the write to clobber anything.

   ONE COMMIT, NOT ONE PER FILE. The Contents API would be four lines shorter
   and would leave the repository half-written if the second call failed, which
   is the same outcome Sync.write() stages every file in memory to avoid. So it
   goes through the git data API — blobs, a tree over the branch's tree, a
   commit, then the ref moves — and the ref moving is the only moment anything
   has changed.

   THE TOKEN. A fine-grained personal access token, scoped to the one
   repository, with Contents: read and write. It is kept in this browser's own
   storage and sent to api.github.com and nowhere else; a token in storage is
   readable by anything that can run script on this origin, which is what makes
   "one repository, and an expiry date" the shape to ask for. Forgetting it is
   one press, and it is offered next to the button that uses it. */

const Repo = {
  /* Where it goes and what it goes with, kept apart on purpose: forgetting the
     token must not also forget which repository you were publishing to. */
  CFG: GAME.id + '.repo',
  TOK: GAME.id + '.token',
  API: 'https://api.github.com',

  /* The repository this page was served FROM, where that is knowable — and on
     GitHub Pages it is: owner.github.io/repo/editor.html names both halves. The
     phone that opened the published editor is offered its own repository
     already filled in, and the only thing left to type is the token. */
  guess() {
    const host = String(location.hostname || '');
    const m = /^([\w-]+)\.github\.io$/i.exec(host);
    if (!m) return { owner: '', repo: '', branch: 'main' };
    const seg = String(location.pathname || '/').split('/').filter(Boolean);
    const first = seg[0] || '';
    /* A project page is /repo/…; a user page is the whole site, and its
       repository is named after the host. `editor.html` has a dot in it and a
       repository name does not, which is the whole of the difference. */
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
     One place, so the headers cannot drift and the token has exactly one way
     out of this page. Errors come back as sentences: GitHub answers 404 both
     for a repository that does not exist and for one this token may not see,
     and "not found" on its own has sent people looking for the wrong fault. */
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

  /* One file as the BRANCH has it, which is what the commit will be built on
     top of. Not as this page was served it: a Pages deploy runs a minute or so
     behind the branch, and splicing into yesterday's copy would put yesterday
     back. */
  read(path) {
    return this.call('GET', this.at('/contents/' + this.enc(path))
      + '?ref=' + encodeURIComponent(this.where().branch),
    undefined, 'application/vnd.github.raw', true);
  },

  /* Every file, one commit, and nothing has changed until the last line of
     this. Blobs and a tree cost three more calls than the contents API and buy
     the one property worth having: there is no state in which half of a save
     is on the branch. */
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
     Four fields, three of them already filled in on a published page, and a
     token you make yourself. The link is the fine-grained one on purpose: a
     classic token is every repository you have and every scope you ticked, and
     nothing here needs either. */
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
