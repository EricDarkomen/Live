'use strict';
/* HUD, sheets, toasts, sound and touch input. */

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- sound: tiny synths, no files ---------------- */
const SFX = {
  ac: null,
  ctx() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (this.ac.state === 'suspended') this.ac.resume();
    return this.ac;
  },
  tone(f0, f1, dur, type = 'sine', vol = 0.15, delay = 0) {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  fart() {
    const a = this.ctx(); if (!a) return;
    const t = a.currentTime, dur = 0.35 + Math.random() * 0.4;
    const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain(), f = a.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70 + Math.random() * 40, t); o.frequency.linearRampToValueAtTime(45 + Math.random() * 20, t + dur);
    lfo.frequency.value = 18 + Math.random() * 20; lg.gain.value = 30;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 500;
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    g.gain.setValueAtTime(0.3, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(a.destination);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },
  play(s) {
    if (!G.s || !G.s.sound) return;
    switch (s) {
      case 'pop': this.tone(500, 900, 0.09, 'sine', 0.18); break;
      case 'plant': this.tone(300, 200, 0.08, 'triangle', 0.15); break;
      case 'coin': this.tone(988, 988, 0.08, 'square', 0.06); this.tone(1319, 1319, 0.25, 'square', 0.06, 0.08); break;
      case 'splat': this.tone(220, 60, 0.18, 'sawtooth', 0.12); break;
      case 'munch': this.tone(180, 120, 0.05, 'square', 0.08); this.tone(200, 110, 0.05, 'square', 0.08, 0.09); break;
      case 'build': this.tone(160, 320, 0.12, 'triangle', 0.2); this.tone(240, 480, 0.12, 'triangle', 0.2, 0.1); break;
      case 'nope': this.tone(200, 150, 0.15, 'square', 0.07); break;
      case 'fart': this.fart(); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.15, i * 0.09)); break;
    }
  }
};

/* ---------------- UI ---------------- */
const UI = {
  mode: null,        // {place:'cat:id'} | {plant:'crop'} | {remove:true}
  sheetOpen: null,
  sheetArg: null,
  shopTab: 'farm',

  init() {
    $('#bShop').onclick = () => this.open('shop');
    $('#bOrders').onclick = () => this.open('orders');
    $('#bBarn').onclick = () => this.open('barn');
    $('#bQuest').onclick = () => this.open('quest');
    $('#bMenu').onclick = () => this.open('menu');
    $('#sheetX').onclick = () => this.close();
    $('#scrim').onclick = () => this.close();
    $('#modeX').onclick = () => this.setMode(null);
    $('#captain').onclick = () => this.open('quest');
    $('#sheetBody').addEventListener('click', e => this.sheetClick(e));
    this.input();
  },

  setMode(m) {
    this.mode = m;
    const bar = $('#modeBar');
    if (!m) { bar.classList.remove('on'); return; }
    let txt = '';
    if (m.plant) txt = 'Tap or swipe empty fields to plant ' + ITEMS[m.plant].e + ' ' + ITEMS[m.plant].n;
    else if (m.place) {
      const [cat, id] = m.place.split(':');
      const nm = cat === 'field' ? '🟫 Field' : cat === 'animal' ? ANIMALS[id].e + ' ' + ANIMALS[id].n : cat === 'fac' ? FACTORIES[id].e + ' ' + FACTORIES[id].n : DECOR[id].e + ' ' + DECOR[id].n;
      txt = 'Tap a glowing spot to place ' + nm;
    } else if (m.remove) txt = '🧹 Tap something to sell it back for half. Cheapskate.';
    $('#modeTxt').textContent = txt;
    bar.classList.add('on');
  },

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = esc(msg);
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
    const all = $('#toasts').children; if (all.length > 3) all[0].remove();
  },

  /* ---------- HUD ---------- */
  hud() {
    const s = G.s;
    $('#lvl').textContent = s.lvl;
    $('#xpFill').style.width = (100 * s.xp / G.xpFor(s.lvl)) + '%';
    $('#coins').textContent = s.coins;
    $('#gold').textContent = s.gold;
    $('#joy').textContent = '+' + Math.round(G.bonus() * 100) + '%';
    const ready = s.orders.filter(o => G.canFill(o)).length;
    $('#oBadge').textContent = ready; $('#oBadge').style.display = ready ? '' : 'none';
    $('#qBadge').style.display = s.questReady ? '' : 'none';
    const { q, have } = G.questProgress();
    $('#capTask').textContent = q.t + ' ' + have + '/' + q.n;
    $('#captain').classList.toggle('done', !!s.questReady);
    if (['orders', 'fac', 'pen', 'field'].includes(this.sheetOpen) && performance.now() - (this._last || 0) > 500) { this._last = performance.now(); this.render(); }
  },

  /* ---------- sheets ---------- */
  open(which, arg) {
    this.sheetOpen = which; this.sheetArg = arg;
    this.render();
    $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
    SFX.play('pop');
  },
  close() {
    this.sheetOpen = null;
    $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on');
  },

  render() {
    const w = this.sheetOpen, s = G.s;
    let title = '', h = '';
    const cost = (c, ok = true) => '<span class="cost' + (ok ? '' : ' no') + '">🪙 ' + c + '</span>';
    if (w === 'shop') {
      title = '🛒 Shop';
      h += '<div class="tabs">' + [['farm', '🌾 Farm'], ['fac', '🏭 Buildings'], ['decor', '🦩 Pretty'], ['tools', '🧹 Tools']]
        .map(([k, n]) => '<button data-tab="' + k + '" class="' + (this.shopTab === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div><div class="grid">';
      const card = (act, e, n, sub, c, lvl, extra = '') => {
        const locked = s.lvl < lvl;
        return '<button class="card' + (locked ? ' locked' : '') + '" ' + (locked ? 'disabled' : 'data-act="' + act + '"') + '>' +
          '<span class="ce">' + e + '</span><b>' + esc(n) + '</b><small>' + esc(sub) + '</small>' +
          (locked ? '<span class="cost no">🔒 Lv ' + lvl + '</span>' : cost(c, s.coins >= c)) + extra + '</button>';
      };
      if (this.shopTab === 'farm') {
        h += card('place:field', '🟫', 'Field', 'Grows stuff. Mostly beans.', G.fieldCost(), 1, '<i>owned ' + G.count('field') + '</i>');
        for (const [id, A] of Object.entries(ANIMALS))
          h += card('place:animal:' + id, A.e, A.n, 'Eats ' + ITEMS[A.eats].e + ' → makes ' + ITEMS[A.gives].e, G.animalCost(id), A.lvl, '<i>owned ' + G.count('pen', id) + '</i>');
      } else if (this.shopTab === 'fac') {
        for (const [id, F] of Object.entries(FACTORIES)) {
          const has = G.count('fac', id);
          const sub = F.recipes.map(r => Object.entries(r.in).map(([k, n]) => n + ITEMS[k].e).join('+') + '→' + ITEMS[r.out].e).join('  ');
          if (has) h += '<button class="card locked" disabled><span class="ce">' + F.e + '</span><b>' + esc(F.n) + '</b><small>' + sub + '</small><span class="cost">✔ Built</span></button>';
          else h += card('place:fac:' + id, F.e, F.n, sub, F.cost, F.lvl);
        }
      } else if (this.shopTab === 'decor') {
        for (const [id, D] of Object.entries(DECOR)) h += card('place:decor:' + id, D.e, D.n, '+' + D.joy + '% order tips', D.cost, D.lvl);
      } else {
        h += '<button class="card" data-act="remove"><span class="ce">🧹</span><b>Sell / Clear</b><small>Sell placed things back for half. Chop wild palms.</small><span class="cost">free</span></button>';
      }
      h += '</div>';
    } else if (w === 'orders') {
      title = '⛵ The Pier';
      h += '<p class="hint">Boats want stuff. Pretty decorations make them tip more (+' + Math.round(G.bonus() * 100) + '%).</p>';
      s.orders.forEach((o, i) => {
        const C = CUSTOMERS[o.who], left = o.arrive - now();
        if (left > 0) { h += '<div class="order away"><span class="face">' + o.boat + '</span><div><b>Next boat</b><small>Arriving in ' + fmt(left) + '…</small></div></div>'; return; }
        const chips = Object.entries(o.items).map(([k, n]) => {
          const ok = G.have(k) >= n;
          return '<span class="chip' + (ok ? ' ok' : '') + '">' + ITEMS[k].e + ' ' + G.have(k) + '/' + n + '</span>';
        }).join('');
        const can = G.canFill(o);
        h += '<div class="order"><span class="face">' + C.f + '</span><div class="od"><b>' + esc(C.n) + '</b><small>“' + esc(o.line) + '”</small>' +
          '<div class="chips">' + chips + '</div><div class="row"><span class="rew">🪙 ' + Math.round(o.coins * (1 + G.bonus())) + ' · ⭐ ' + o.xp + '</span>' +
          '<button class="skip" data-act="skip:' + i + '">Nah 💨</button><button class="go" ' + (can ? '' : 'disabled') + ' data-act="fill:' + i + '">Ship it!</button></div></div></div>';
      });
    } else if (w === 'barn') {
      title = '🎒 The Barn';
      const keys = Object.keys(ITEMS).filter(k => G.have(k));
      if (!keys.length) h += '<p class="hint">Empty. Like your head. Go grow something.</p>';
      h += '<div class="grid inv">';
      for (const k of keys) h += '<div class="card"><span class="ce">' + ITEMS[k].e + '</span><b>' + esc(ITEMS[k].n) + '</b><small>× ' + G.have(k) + '</small><button class="mini" data-act="sell:' + k + '">Sell 🪙' + ITEMS[k].sell + '</button></div>';
      h += '</div>';
    } else if (w === 'quest') {
      const { q, have, done } = G.questProgress();
      title = '📜 Captain Barnacle-Bum';
      h += '<div class="cap"><span class="face big">🧔‍♂️</span><p>“' + esc(q.say) + '”</p></div>' +
        '<div class="qbox"><b>' + esc(q.t) + '</b><div class="pbar"><i style="width:' + (100 * have / q.n) + '%"></i></div><small>' + have + ' / ' + q.n + '</small>' +
        '<div class="rew">Reward: ' + (q.r.coins ? '🪙 ' + q.r.coins + ' ' : '') + (q.r.xp ? '⭐ ' + q.r.xp + ' ' : '') + (q.r.gold ? '✨💩 ' + q.r.gold : '') + '</div>' +
        (done ? '<button class="go big" data-act="claim">Claim it!</button>' : '') + '</div>' +
        '<p class="hint">Level ' + s.lvl + ' · ' + s.xp + '/' + G.xpFor(s.lvl) + ' ⭐ · ' + (s.stats.order || 0) + ' orders shipped · ' + (s.stats.poop || 0) + ' poops scooped</p>';
    } else if (w === 'menu') {
      title = '⚙️ Settings';
      h += '<div class="list"><button data-act="sound">' + (s.sound ? '🔊 Sound: ON (farts included)' : '🔇 Sound: OFF') + '</button>' +
        '<button data-act="help">❓ How to play</button>' +
        '<button data-act="full">⛶ Fullscreen</button>' +
        '<button class="danger" data-act="reset">🧨 Nuke the island & restart</button></div>' +
        '<p class="hint">Bum Bay saves itself. Everything keeps growing while you’re away.</p>';
    } else if (w === 'help') {
      title = '❓ How to play';
      h += '<div class="help"><p>🌱 <b>Tap an empty field</b> to plant. <b>Swipe</b> across ripe crops to harvest them all.</p>' +
        '<p>🐔 <b>Tap animals</b> to feed them — then tap again to collect whatever they… produce.</p>' +
        '<p>🏭 <b>Buildings</b> turn boring stuff into posh stuff. Tap them to cook.</p>' +
        '<p>⛵ <b>Boats</b> at the pier want orders. Fill them for 🪙 and ⭐.</p>' +
        '<p>💩 <b>Seagulls</b> poop on your island. Scoop it for coins — sometimes it’s <b>golden</b>. ✨💩 skips timers.</p>' +
        '<p>🔒 <b>Signs</b> on the dark land let you buy more island.</p>' +
        '<p>🦩 <b>Decorations</b> make customers tip more.</p>' +
        '<p>👆 Drag to look around, pinch to zoom.</p></div>';
    } else if (w === 'field') {
      const [x, y] = this.sheetArg, o = G.tile(x, y);
      if (!o || o.k !== 'field') return this.close();
      if (o.crop && G.cropLeft(o) > 0) {
        title = ITEMS[o.crop].e + ' ' + ITEMS[o.crop].n;
        h += '<p class="hint">Ready in ' + fmt(G.cropLeft(o)) + '. Watching it won’t help. Or will it? (No.)</p><button class="go big" data-act="skipcrop">Hurry up! ✨💩 1</button>';
      } else {
        title = '🌱 What are we growing?';
        h += '<div class="grid">';
        for (const [id, C] of Object.entries(CROPS)) {
          const locked = s.lvl < C.lvl;
          h += '<button class="card' + (locked ? ' locked' : '') + '" ' + (locked ? 'disabled' : 'data-act="plant:' + id + '"') + '><span class="ce">' + ITEMS[id].e + '</span><b>' + esc(ITEMS[id].n) + '</b><small>⏱ ' + fmt(C.t * 1000) + ' · you have ' + G.have(id) + '</small>' +
            (locked ? '<span class="cost no">🔒 Lv ' + C.lvl + '</span>' : cost(C.cost, s.coins >= C.cost)) + '</button>';
        }
        h += '</div>';
      }
    } else if (w === 'pen') {
      const [x, y] = this.sheetArg, o = G.tile(x, y), A = ANIMALS[o.a];
      title = A.e + ' ' + A.n;
      h += '<p class="hint">Busy digesting. ' + ITEMS[A.gives].e + ' ready in ' + fmt(G.penLeft(o)) + '. Don’t stand behind it.</p><button class="go big" data-act="skippen">Squeeze it out ✨💩 1</button>';
    } else if (w === 'fac') {
      const [x, y] = this.sheetArg, o = G.tile(x, y);
      if (!o || o.k !== 'fac') return this.close();
      const F = FACTORIES[o.id];
      title = F.e + ' ' + F.n;
      h += '<div class="queue">' + [0, 1, 2].map(i => {
        const j = o.q[i];
        if (!j) return '<span class="slot"></span>';
        const r = F.recipes[j.r], left = j.end - now();
        return '<span class="slot full">' + ITEMS[r.out].e + '<small>' + (left > 0 ? fmt(left) : '✔') + '</small></span>';
      }).join('') + (o.q.length && o.q[0].end > now() ? '<button class="skip" data-act="facskip">✨💩 1 skip</button>' : '') + '</div>';
      F.recipes.forEach((r, i) => {
        const chips = Object.entries(r.in).map(([k, n]) => '<span class="chip' + (G.have(k) >= n ? ' ok' : '') + '">' + ITEMS[k].e + ' ' + G.have(k) + '/' + n + '</span>').join('');
        h += '<div class="order"><span class="face">' + ITEMS[r.out].e + '</span><div class="od"><b>' + esc(ITEMS[r.out].n) + '</b><small>⏱ ' + fmt(r.t * 1000) + ' · ⭐ ' + r.xp + '</small><div class="chips">' + chips + '</div>' +
          '<div class="row"><span></span><button class="go" data-act="make:' + i + '">Make</button></div></div></div>';
      });
    }
    $('#sheetTitle').textContent = title;
    const body = $('#sheetBody'), st = body.scrollTop;
    body.innerHTML = h; body.scrollTop = st;
  },

  sheetClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { this.shopTab = tab.dataset.tab; this.render(); SFX.play('pop'); return; }
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const [a, p1, p2] = b.dataset.act.split(':');
    const arg = this.sheetArg;
    switch (a) {
      case 'place':
        this.close();
        this.setMode({ place: p2 ? p1 + ':' + p2 : p1 });
        return;
      case 'remove': this.close(); this.setMode({ remove: true }); return;
      case 'fill': G.fill(+p1); break;
      case 'skip': G.skip(+p1); break;
      case 'sell': G.sell(p1); break;
      case 'claim': G.claimQuest(); break;
      case 'plant':
        if (G.plant(arg[0], arg[1], p1)) { this.close(); this.setMode({ plant: p1 }); }
        return;
      case 'skipcrop': if (G.skipCrop(arg[0], arg[1])) this.close(); break;
      case 'skippen': if (G.skipPen(arg[0], arg[1])) this.close(); break;
      case 'make': G.facMake(arg[0], arg[1], +p1); break;
      case 'facskip': G.facSkip(arg[0], arg[1]); break;
      case 'sound': G.s.sound = !G.s.sound; break;
      case 'help': this.open('help'); return;
      case 'full': { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); break; }
      case 'reset':
        if (confirm('Really nuke the whole island? Even the poop?')) { G.wipe(); location.reload(); }
        return;
    }
    this.render();
  },

  /* ---------- world taps ---------- */
  sweepable(x, y) {
    const o = G.tile(x, y);
    if (this.mode && this.mode.plant) return o && o.k === 'field' && !o.crop;
    if (!G.owned(x, y) || !o) return false;
    if (o.k === 'field' && G.isReady(o)) return true;
    if (o.k === 'junk' && JUNK[o.id].cost === 0) return true;
    return false;
  },
  sweep(x, y) {
    const o = G.tile(x, y); if (!o) return;
    if (this.mode && this.mode.plant) {
      if (o.k === 'field' && !o.crop && !G.plant(x, y, this.mode.plant)) this.setMode(null);
      return;
    }
    if (o.k === 'field') G.harvest(x, y);
    else if (o.k === 'junk') G.clearJunk(x, y);
  },

  tapScreen(sx, sy) {
    // boats first
    for (let i = 0; i < G.s.orders.length; i++) {
      const b = R.boatPos(i), p = R.toScreen(b.x, b.y);
      if (Math.hypot(sx - p.x, sy - p.y) < 40 * R.cam.z && G.s.orders[i].arrive <= now()) { this.open('orders'); return; }
    }
    // land signs
    for (const k of Object.keys(EXPAND)) {
      if (G.s.land[k]) continue;
      const [cx, cy] = k.split(',').map(Number), sp = R.signPos(cx, cy), p = R.toScreen(sp.x, sp.y - 15);
      if (Math.abs(sx - p.x) < 40 * R.cam.z && Math.abs(sy - p.y) < 24 * R.cam.z) {
        const e = EXPAND[k];
        if (G.s.lvl >= e.lvl && confirm('Buy this bit of island for 🪙 ' + e.cost + '?')) G.buyLand(k);
        else if (G.s.lvl < e.lvl) G.buyLand(k);
        return;
      }
    }
    // tall things (buildings, animals) are hit above their tile too
    let t = R.tileAt(sx, sy);
    const up = R.tileAt(sx, sy + 22 * R.cam.z);
    const tall = o => o && (o.k === 'fac' || o.k === 'pen' || o.k === 'decor');
    if (!G.tile(t.x, t.y) && tall(G.tile(up.x, up.y))) t = up;
    this.tapTile(t.x, t.y);
  },

  tapTile(x, y) {
    const m = this.mode, o = G.tile(x, y);
    if (m && m.place) {
      if (G.canPlace(x, y)) {
        if (G.place(x, y, m.place)) {
          if (!m.place.startsWith('field') && !m.place.startsWith('decor')) this.setMode(null);
        } else this.setMode(null);
      } else if (!G.owned(x, y)) G.emit('toast', { msg: 'You don’t own that bit. Yet.' });
      else G.emit('toast', { msg: 'Something’s already there. Probably poop.' });
      return;
    }
    if (m && m.remove) {
      if (o && o.k !== 'junk' && G.owned(x, y)) G.remove(x, y);
      return;
    }
    if (m && m.plant) { this.setMode(null); }
    if (!G.owned(x, y)) {
      if (isLand(x, y)) G.emit('toast', { msg: 'That’s not your land. Buy it at the 🔒 sign.' });
      return;
    }
    if (!o) return;
    if (o.k === 'field') {
      if (G.isReady(o)) G.harvest(x, y);
      else this.open('field', [x, y]);
    } else if (o.k === 'pen') {
      if (G.tapPen(x, y) === 'busy') this.open('pen', [x, y]);
    } else if (o.k === 'fac') {
      G.facCollect(x, y);
      this.open('fac', [x, y]);
    } else if (o.k === 'junk') {
      const J = JUNK[o.id];
      if (J.cost && !confirm('Clear the ' + J.n.toLowerCase() + ' for 🪙 ' + J.cost + '?')) return;
      G.clearJunk(x, y);
    } else if (o.k === 'decor') {
      if (o.wild) {
        if (confirm('Chop down this wild palm? (+3 ⭐)')) { delete G.s.tiles[x + ',' + y]; G.gainXp(3, x, y); SFX.play('pop'); R.puff(x, y, true); }
      } else G.emit('toast', { msg: DECOR[o.id].e + ' ' + pick(['Lovely.', 'Stunning. Truly.', 'The tourists love it.', 'Makes the island smell 2% better.']) });
    }
  },

  /* ---------- pointer input: tap, swipe-harvest, pan, pinch ---------- */
  input() {
    const cv = R.cv, pts = new Map();
    let start = null, moved = false, sweeping = false, lastTile = null, pinch = null;
    const key = t => t.x + ',' + t.y;

    cv.addEventListener('pointerdown', e => {
      SFX.ctx();
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: R.cam.z }; sweeping = false; moved = true; return;
      }
      start = { x: e.clientX, y: e.clientY, cx: R.cam.x, cy: R.cam.y };
      moved = false; sweeping = false;
      const t = R.tileAt(e.clientX, e.clientY);
      if (this.sweepable(t.x, t.y)) { sweeping = true; lastTile = key(t); this.sweep(t.x, t.y); }
    });
    cv.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse' && !pts.size) { R.hover = R.tileAt(e.clientX, e.clientY); return; }
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        R.cam.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; R.clampCam(); return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 8) moved = true;
      if (sweeping) {
        const t = R.tileAt(e.clientX, e.clientY);
        if (key(t) !== lastTile) { lastTile = key(t); if (this.sweepable(t.x, t.y)) this.sweep(t.x, t.y); }
      } else if (moved) {
        R.cam.x = start.cx - dx / R.cam.z; R.cam.y = start.cy - dy / R.cam.z; R.clampCam();
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; start = null; return; }
      if (start && !moved && !sweeping) this.tapScreen(e.clientX, e.clientY);
      start = null; sweeping = false;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); R.cam.z *= e.deltaY < 0 ? 1.1 : 0.9; R.clampCam(); }, { passive: false });
    addEventListener('keydown', e => { if (e.key === 'Escape') { this.close(); this.setMode(null); } });
  }
};
