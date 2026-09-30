'use strict';
/* ---------------- The engine's own acts ----------------
   What pressing E does on the engine's things: doors, cars, passers-by and the
   fallback for anything a game has not written an act for. Each is filled into
   Acts only where the game has none of its own, at load time so the editor's
   checks see the same Acts the game does. The words are TEXT's (`act.*`). */
const BaseActs = {
  generic(o) { Dialogue.say(o.e, o.name, say('act.genericRole'), [say('act.generic')], null); },
  door(o) { Sfx.door(); Dialogue.say('🚪', o.name, say('act.doorRole'), [say('act.door', { name: o.name })], null); },
  lockedDoor(o) { Sfx.deny(); Dialogue.say('🔒', o.name || say('act.doorRole'), say('act.lockedRole'), [say('act.locked')], null); },
  parkedCar(car) { Dialogue.say('🚗', car.name, say('act.parkedCarRole'), [say('act.parkedCar')], null); },
  passingCar(car) { Dialogue.say('🚗', car.name, say('act.passingCarRole'), [say('act.passingCar')], null); },
  passerby(ped) { Dialogue.say('🧑', ped.name, say('act.passerbyRole'), [say('act.passerby')], null); }
};
Object.keys(BaseActs).forEach(k => { if (typeof Acts !== 'undefined' && !(k in Acts)) Acts[k] = BaseActs[k]; });

/* ---------------- The engine's own move ----------------
   Landing it: with enough rapport you can close instead of grinding them down,
   which pays better (see Combat.end). Filled into MOVES unless the game writes
   its own `land`. */
const RAPPORT_LAND = 70;
const BaseMoves = [
  { id: 'land', e: '💋', get n() { return say('land.n'); }, get d() { return say('land.d'); },
    show: E => (E.rap || 0) >= RAPPORT_LAND, cost: {},
    run(E) { E.landed = true; return { dmg: 999, win: true, txt: say('land.txt') }; } }
];
if (typeof MOVES !== 'undefined')
  BaseMoves.slice().reverse().forEach(m => { if (!MOVES.some(x => x.id === m.id)) MOVES.unshift(m); });
