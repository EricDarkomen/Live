'use strict';
/* ---------------- The engine's own acts ----------------
   A game's `Acts` (data/acts.js) is what pressing E on ITS things does. Some
   things are the engine's, not the game's: the doorway every DOOR_DEFS entry
   makes, the pole every signal puts up, the car and the stranger that
   Interact falls back on, the lift that FLOORS describes. Those were written
   in the game's acts file, which meant a new game that replaced that file —
   which is what `import-game --replace` does — had doors and crossings that
   did nothing when pressed.

   So they live here, and each is filled into `Acts` only where the game has
   not written its own. A game overrides one by writing an act of the same
   name; it never has to write one to get a working door. The prose is TEXT's
   (`act.*` in data/game.js), like every other word the engine says.

   Filled in at load time — one of the very few top-level statements in the
   engine, alongside the roundRect polyfill and boot — because the editor's
   checks ask `Acts` which handlers exist and must get the same answer the
   game does, and the editor never runs Boot.init(). */
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

  /* THE LIFT reads FLOORS (data/world.js): one row per button, `via` naming the
     link that button takes from the level you are on. A button whose link does
     not exist here is the floor you are already on. `key` names a G.flag the
     button needs; `dead` is a floor that is out of service, with the reason. */
  lift() {
    const floors = typeof FLOORS !== 'undefined' ? FLOORS : [];
    const here = floors.filter(f => f.via && !Levels.links(f.via)).map(f => f.b);
    const on = here.length ? here[0] : Lifts.at();
    const rows = [], opts = [];
    for (const f of floors) {
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
Object.keys(BaseActs).forEach(k => { if (typeof Acts !== 'undefined' && !(k in Acts)) Acts[k] = BaseActs[k]; });

/* ---------------- The engine's own move ----------------
   LANDING IT. Build enough rapport and you can stop grinding their frustration
   down and simply close — which pays better than winning it (see Combat.end).
   That is the engine's mechanic rather than any one game's writing, so it is
   here, filled into MOVES where the game has not written a `land` of its own.
   `RAPPORT_LAND` is the rapport at which it is offered. */
const RAPPORT_LAND = 70;
const BaseMoves = [
  { id: 'land', e: '💋', get n() { return say('land.n'); }, get d() { return say('land.d'); },
    show: E => (E.rap || 0) >= RAPPORT_LAND, cost: {},
    run(E) { E.landed = true; return { dmg: 999, win: true, txt: say('land.txt') }; } }
];
if (typeof MOVES !== 'undefined')
  BaseMoves.slice().reverse().forEach(m => { if (!MOVES.some(x => x.id === m.id)) MOVES.unshift(m); });
