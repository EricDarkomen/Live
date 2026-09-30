'use strict';
/* ---------------- The engine's own acts ----------------
   What E does on the engine's own things: doorways, signal poles, the lift,
   cars and passers-by, and the fallback for anything without an act. Each is
   filled into Acts unless the game writes one of the same name, at load time so
   the editor's checks see what the game sees. The words are TEXT's `act.*`. */
const BaseActs = {
  generic(o) { Dialogue.say(o.e, o.name, say('act.genericRole'), [say('act.generic')], null); },
  door(o) { Sfx.door(); Dialogue.say('🚪', o.name, say('act.doorRole'), [say('act.door', { name: o.name })], null); },
  lockedDoor(o) {
    const name = o.name || say('act.doorRole');
    if (G.flags.keycard) { Sfx.door(); Dialogue.say('🚪', name, say('act.unlockedRole'), [say('act.unlocked')], null); }
    else { Sfx.deny(); Dialogue.say('🔒', name, say('act.lockedRole'), [say('act.locked')], null); }
  },
  parkedCar(car) { Dialogue.say('🚗', car.name, say('act.parkedCarRole'), [say('act.parkedCar')], null); },
  passingCar(car) { Dialogue.say('🚗', car.name, say('act.passingCarRole'), [say('act.passingCar')], null); },
  passerby(ped) { Dialogue.say('🧑', ped.name, say('act.passerbyRole'), [say('act.passerby')], null); },
  assemblyPoint() { Dialogue.say('🪧', say('act.assemblyName'), say('act.assemblyRole'), [say('act.assembly')], null); },

  /* A crossing: the button on the pole is a request, not a switch. */
  crossingButton(o) {
    const inst = o.arm && o.arm.inst;
    const box = (e, role, k) => Dialogue.say(e, say('act.crossingName'), role, [say(k)], null);
    if (!inst) return box('🚦', say('act.crossingRole'), 'act.crossing');
    const st = Signals.man(inst);
    if (st === 'green') return box('🚶', say('act.crossNowRole'), 'act.crossNow');
    if (st === 'flash') return box('🚶', say('act.crossFlashRole'), 'act.crossFlash');
    if (Signals.press(inst)) { inst.mine = true; Sfx.blip(); return box('🚦', say('act.crossWaitRole'), 'act.crossWait'); }
    Ach.get('a_pressed');
    box('🚦', say('act.crossAgainRole'), 'act.crossAgain');
  },
  trafficLights(o) {
    const asp = o.arm && o.arm.inst ? Signals.aspect(o.arm) : 'red';
    Dialogue.say('🚦', say('act.lightsName'), say('act.lights.' + asp), [say('act.lights')], null);
  },

  /* The lift reads FLOORS (data/world.js): a row per button, `via` naming the
     link it takes from here (none: the floor you are on), `key` a G.flag it
     needs, `dead` the reason a floor is out of service. */
  lift() {
    const here = FLOORS.filter(f => f.via && !Levels.links(f.via)).map(f => f.b);
    const on = here.length ? here[0] : Lifts.at();
    const rows = [], opts = [];
    for (const f of FLOORS) {
      const link = f.via ? Levels.links(f.via) : null;
      if (f.dead) { rows.push(f.b + ' ' + f.name + ' (' + f.dead + ')'); continue; }
      if (!link) { rows.push(f.b + ' ' + f.name + ' — ' + say('act.liftHere')); continue; }
      rows.push(f.b + ' ' + f.name);
      const locked = f.key && !G.flags[f.key];
      opts.push({
        t: say(locked ? 'act.liftPressLocked' : 'act.liftPress', { b: f.b, name: f.name }), to: null,
        do() {
          if (locked) { Sfx.deny(); return Dialogue.say('🛗', say('act.liftName'), f.b, [say('act.liftLocked')], null); }
          Lifts.send(f.b); Sfx.door(); Levels.take(f.via);
        }
      });
    }
    const car = Lifts.at();
    Dialogue.say('🛗', say('act.liftName'), say('act.liftCar', { b: car }),
      [say('act.lift', { b: car, rows: rows.join(' · ') }), say(car === on ? 'act.liftHereNow' : 'act.liftComing')],
      opts.concat([{ t: say('act.liftNever'), to: null }]));
  }
};
Object.keys(BaseActs).forEach(k => { if (!(k in Acts)) Acts[k] = BaseActs[k]; });

/* ---------------- The engine's own move ----------------
   Landing it: with RAPPORT_LAND rapport you can close instead of grinding them
   down, which pays better (Combat.end). Filled into MOVES unless the game
   writes its own `land`. */
const RAPPORT_LAND = 70;
const BaseMoves = [
  { id: 'land', e: '💋', get n() { return say('land.n'); }, get d() { return say('land.d'); },
    show: E => (E.rap || 0) >= RAPPORT_LAND, cost: {},
    run(E) { E.landed = true; return { dmg: 999, win: true, txt: say('land.txt') }; } }
];
BaseMoves.slice().reverse().forEach(m => { if (!MOVES.some(x => x.id === m.id)) MOVES.unshift(m); });
