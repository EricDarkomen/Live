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
  /* EVERY TOAST IN THIS GAME IS AN EVENT, so this is now the way into the event
     log rather than a surface of its own. Hundreds of call sites say
     UI.toast('📵', 'A phone stops ringing on its own.', 'bad') and every one of
     them is a line in the ledger of a day — which is exactly what the log
     channel is. So the signature does not change and the destination does: the
     record goes to Comms, and the one-line alert over the game is Comms's
     business too.

     `cls` was a border colour on a box and is a severity now ('bad', 'good',
     'gold'), which is the same three values doing the job they were always
     really doing. Anything that is NOT an event — a text, an email, a message
     in the chat — does not come through here at all; it posts to its own
     channel, because that is the entire point of there being channels. */
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
  /* The HUD is refreshed every frame, so each field is written only when its
     value has actually changed — otherwise this is ~14 layout-invalidating DOM
     writes per frame for text that changes a few times a minute. */
  _last: {},
  set(id, prop, val) {
    const k = id + prop;
    if (this._last[k] === val) return;
    this._last[k] = val;
    const el = $(id); if (!el) return;
    if (prop === 'w') {
      el.style.width = val;
      if (el.parentElement) el.parentElement.setAttribute('aria-valuenow', String(Math.round(parseFloat(val))));
    } else el.textContent = val;
  },
  hud() {
    this.set('#hName', 't', P.name.toUpperCase());
    this.set('#hFace', 't', P.face);
    this.set('#hRank', 't', 'Lv.' + P.level + ' · ' + RANKS[P.rank].n);
    this.set('#bPat', 'w', clamp(P.patience / P.patMax * 100, 0, 100).toFixed(1) + '%');
    this.set('#vPat', 't', String(Math.round(P.patience)));
    this.set('#mPat', 't', '/' + Math.round(P.patMax));
    this.set('#bEne', 'w', clamp(P.energy / P.eneMax * 100, 0, 100).toFixed(1) + '%');
    this.set('#vEne', 't', String(Math.round(P.energy)));
    this.set('#mEne', 't', '/' + Math.round(P.eneMax));
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
    /* THE OTHER QUEUE, and it is a different fact from the phones in every
       way that matters: it does not ring, it does not abandon, and it does not
       stop at the front door. One row, said once. */
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
      /* Shorter on a phone: the queue shares one bar with the clock, the money
         and three meters, and "calls" is the word the amber dot beside it is
         already saying. */
      if (q) $('#hQueueT').textContent = TOUCH ? q + ' waiting'
        : q === 1 ? '1 call waiting' : q + ' calls waiting';
    }
    /* the bars turn red when you are nearly out of yourself */
    const low = P.patience <= P.patMax * 0.25;
    if (this._last.low !== low) { this._last.low = low; $('#hudTL').classList.toggle('low', low); }
    /* The sky, in four words: what is falling, what season it is, and — after
       five — that the shift is over, because at 19:40 on a Tuesday the clock
       above it is the one number on this screen that could be misread as
       something you are still being paid for. */
    const sky = Sky.label() + ' · ' + Sky.seasonName()
      + (Sky.working() ? '' : ' · off shift');
    if (this._last.sky !== sky) {
      this._last.sky = sky;
      this.set('#hSkyT', 't', sky);
    }
    /* How much of the shift is behind you, as the hairline along the bottom of
       the phone bar. The clock says 14:20; this says "nearly there" — and once
       it is over it says so by sitting full and going out, rather than by
       staying pinned at 100% all evening looking like it is still counting. */
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
  /* forces the next hud() to rewrite everything — used after a load */
  hudDirty() { this._last = {}; this.hud(); }
};
