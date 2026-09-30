'use strict';
/* ---------------- FX: juice ---------------- */
const FX = {
  parts: [], floats: [], shakeAmt: 0, motion: true,
  shake(n) { if (this.motion) this.shakeAmt = Math.min(18, this.shakeAmt + n); },
  burst(wx, wy, emoji, n = 8, colour) {
    if (!this.motion) return;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.283), s = rnd(40, 150);
      this.parts.push({ x: wx, y: wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rnd(.5, 1.1), t: 0, e: emoji, c: colour, sz: rnd(10, 20) });
    }
  },
  float(wx, wy, text, colour = '#fff') {
    this.floats.push({ x: wx + rnd(-8, 8), y: wy, text, c: colour, t: 0, life: 1.3 });
  },
  update(dt) {
    this.shakeAmt *= Math.pow(0.02, dt);
    if (this.shakeAmt < 0.2) this.shakeAmt = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
      if (p.t > p.life) this.parts.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t += dt; f.y -= 34 * dt;
      if (f.t > f.life) this.floats.splice(i, 1);
    }
  }
};

/* ---------------- UI helpers ---------------- */
const UI = {
  /* Every toast is an event: it goes to the log channel, and the alert over
     the game is Comms's business. `cls` is a severity: 'bad', 'good', 'gold'. */
  toast(e, msg, cls = '') {
    Comms.post('log', { face: e, body: msg, k: cls });
  },
  float(text, colour) { FX.float(P.x, P.y - 24, text, colour); },
  objective(t) { G.objective = t; $('#hObj').textContent = t; },
  zone(name) {
    const el = $('#zoneName'); el.textContent = name;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  flash(c = '#fff', a = .5) {
    const f = $('#flash'); f.style.background = c; f.style.opacity = a;
    setTimeout(() => f.style.opacity = 0, 90);
  },
  /* The HUD runs every frame, so each field is written only when it changes. */
  _last: {},
  set(id, prop, val) {
    const k = id + prop;
    if (this._last[k] === val) return;
    this._last[k] = val;
    const el = $(id); if (!el) return;
    if (prop === 'w') {
      el.style.width = val;
      if (el.parentElement) el.parentElement.setAttribute('aria-valuenow', String(Math.round(parseFloat(val))));
    } else if (prop === 'h') el.innerHTML = val;
    else el.textContent = val;
  },
  hud() {
    this.set('#hName', 't', P.name.toUpperCase());
    /* Your live face once your sprite is ready, the rank's emoji until then. */
    if (!Portrait.hud()) this.set('#hFace', 't', P.face);
    /* In pieces, so the phone bar can put the rank under the level. */
    this.set('#hRank', 'h', '<span>Lv.' + P.level + '</span><span class="rk-sep"> · </span><span class="rk-nm">' + esc(RANKS[P.rank].n) + '</span>');
    this.set('#bPat', 'w', clamp(P.patience / P.patMax * 100, 0, 100).toFixed(1) + '%');
    this.set('#vPat', 't', String(Math.round(P.patience)));
    this.set('#mPat', 't', '/' + Math.round(P.patMax));
    this.set('#bEne', 'w', clamp(P.energy / P.eneMax * 100, 0, 100).toFixed(1) + '%');
    this.set('#vEne', 't', String(Math.round(P.energy)));
    this.set('#mEne', 't', '/' + Math.round(P.eneMax));
    this.set('#bFood', 'w', clamp(P.food, 0, 100).toFixed(1) + '%');
    this.set('#vFood', 't', String(Math.round(P.food)));
    this.set('#bXp', 'w', clamp(P.xpv / P.xpNext * 100, 0, 100).toFixed(1) + '%');
    this.set('#vXp', 't', String(P.xpv));
    this.set('#mXp', 't', '/' + P.xpNext);
    this.set('#hMoney', 't', P.money.toFixed(2));
    this.set('#hCalls', 't', String(G.totals.calls));
    this.set('#hDay', 't', 'DAY ' + G.day + ' · ' + (DAYS[(G.day - 1) % 7] || 'Monday').toUpperCase());
    const clock = clockStr(G.minutes);
    if (this._last.clock !== clock) {
      this._last.clock = clock;
      const el = $('#hClock');
      if (el && el.firstChild) el.firstChild.textContent = clock;
    }
    /* Messages waiting on a reply: a queue that does not ring. */
    const w = Comms.pending();
    if (this._last.w !== w) {
      this._last.w = w;
      $('#hWrit').hidden = w === 0;
      if (w) $('#hWritT').textContent = TOUCH ? w + ' to answer'
        : w === 1 ? '1 waiting on a reply' : w + ' waiting on a reply';
    }
    const q = Phones.waiting();
    if (this._last.q !== q) {
      this._last.q = q;
      $('#hQueue').hidden = q === 0;
      if (q) $('#hQueueT').textContent = TOUCH ? q + ' waiting'
        : q === 1 ? '1 guest waiting' : q + ' guests waiting';
    }
    /* The bars turn red when you are nearly out of yourself. */
    const low = P.patience <= P.patMax * 0.25;
    if (this._last.low !== low) { this._last.low = low; $('#hudTL').classList.toggle('low', low); }
    /* The weather, the season, and whether work is over. */
    const sky = Sky.label() + ' · ' + Sky.seasonName()
      + (Sky.working() ? '' : ' · off shift');
    if (this._last.sky !== sky) {
      this._last.sky = sky;
      this.set('#hSkyT', 't', sky);
    }
    /* The working day as a hairline along the phone bar; full and dimmed after. */
    const shift = (clamp((G.minutes - DAY_START) / (DAY_END - DAY_START), 0, 1) * 100).toFixed(1) + '%';
    if (this._last.shift !== shift) {
      this._last.shift = shift;
      const b = $('#shiftBarI'); if (b) b.style.width = shift;
    }
    const done = !Sky.working();
    if (this._last.done !== done) {
      this._last.done = done;
      const sb = $('#shiftBar'); if (sb) sb.classList.toggle('done', done);
    }
    Track.sync();
  },
  /* On the move the HUD steps back, and comes forward again a moment after you
     stop, or whenever your nerve is low (css/polish.css: body.hud-quiet). */
  _q: 0,
  quiet(dt) {
    const moving = G.state === 'play' && (P.moving || !!Cars.driving);
    this._q = moving ? Math.min(2, this._q + dt) : Math.max(0, this._q - dt * 1.6);
    const on = this._q > .9 && P.patience > P.patMax * .25;
    if (on !== this._quiet) { this._quiet = on; document.body.classList.toggle('hud-quiet', on); }
  },
  /* Rewrite every field on the next hud(), after a load. */
  hudDirty() { this._last = {}; this.hud(); }
};
