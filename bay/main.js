'use strict';
/* Boot, title screen and the main loop. */

function handleEvents() {
  for (const e of G.events.splice(0)) {
    switch (e.type) {
      case 'toast': UI.toast(e.msg); break;
      case 'sfx': SFX.play(e.s); break;
      case 'float': R.float(e.x, e.y, e.msg, e); break;
      case 'puff': R.puff(e.x, e.y, e.dust); break;
      case 'gull': R.gull(e.x, e.y, () => G.gullDrop(e.x, e.y)); break;
      case 'boatleave': { const b = R.boatPos(e.i); R.leaving.push({ x: b.x, y: b.y, t: 0, boat: e.boat }); break; }
      case 'questdone': UI.toast('📜 Quest done! Tap the Captain for your reward.'); SFX.play('coin'); break;
      case 'levelup':
        SFX.play('level');
        $('#lvlNum').textContent = e.lvl;
        $('#lvlLine').textContent = pick(LEVEL_LINES);
        $('#lvlUnlock').innerHTML = unlocksAt(e.lvl);
        $('#levelUp').classList.add('on');
        break;
    }
  }
}

function unlocksAt(l) {
  const u = [];
  for (const [k, c] of Object.entries(CROPS)) if (c.lvl === l) u.push(ITEMS[k].e + ' ' + ITEMS[k].n);
  for (const A of Object.values(ANIMALS)) if (A.lvl === l) u.push(A.e + ' ' + A.n);
  for (const F of Object.values(FACTORIES)) if (F.lvl === l) u.push(F.e + ' ' + F.n);
  for (const D of Object.values(DECOR)) if (D.lvl === l) u.push(D.e + ' ' + D.n);
  for (const [k, E] of Object.entries(EXPAND)) if (E.lvl === l) u.push('🏝️ New land for sale');
  return (u.length ? 'Unlocked: ' + u.map(esc).join(' · ') + '<br>' : '') + '+2 ✨💩 Golden Nuggets';
}

let last = performance.now(), saveAt = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  G.tick();
  handleEvents();
  R.draw(dt, UI.mode);
  UI.hud();
  if (t > saveAt) { G.save(); saveAt = t + 3000; }
  requestAnimationFrame(frame);
}

function start(fresh) {
  if (fresh) { G.wipe(); G.fresh(); }
  $('#title').classList.add('gone');
  SFX.ctx(); SFX.play('fart');
  R.init($('#world'));
  UI.init();
  // boats that were waiting while you were away are already docked
  requestAnimationFrame(frame);
  if (fresh) setTimeout(() => UI.open('quest'), 700);
  else UI.toast('Welcome back! Everything kept growing. So did the poop.');
}

addEventListener('load', () => {
  const had = G.load();
  $('#btnPlay').textContent = had ? '🧻 Continue' : '🧻 Wash hands & play';
  $('#btnPlay').onclick = () => start(!had);
  if (had) { $('#btnNew').style.display = ''; $('#btnNew').onclick = () => { if (confirm('Start over? Your island will be flushed.')) start(true); }; }
  $('#lvlOk').onclick = () => $('#levelUp').classList.remove('on');
  addEventListener('visibilitychange', () => { if (document.hidden && G.s) G.save(); });
});
