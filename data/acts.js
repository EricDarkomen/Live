'use strict';
/* What happens when you press E. One entry per object `use:`, looked up by
 * name from Interact.go(). Content that is also code: it may call Q, Ach, Item,
 * Rel and the rest, which live in engine/, and touches none of them until
 * somebody presses the button. The engine's own acts — doors, the lift, the
 * crossing — are in engine/acts.js and are filled in wherever this has none.
 */

const insp = (face, name, role, pages, choices, done) => Dialogue.say(face, name, role, pages, choices, done);

/* The replies that offer whatever minigames are installed on an object. The
   binding is a table (CABINETS in data/items.js) rather than four choices
   written out here, because a binding written in code is one the editor can
   describe and never change — and putting a game on an object, taking it off
   and saying what it is wired into is the whole point of the arcade being a
   library rather than three special cases.

   Only the WIRING moved. The prose an object opens with is still written out
   below, one entry per `use:`, which is where the writing lives. */
const cab = use => Arcade.cabinets(use).map(c => ({
  t: c.t, to: null, do() { Arcade.open(c.game, c); }
}));

const Acts = {
  exitDoor() { Sfx.door(); Levels.take('exitDoor'); },
  stairsUp() { Sfx.door(); Levels.take('stairsUp'); },
  stairsDown() { Sfx.door(); Levels.take('stairsDown'); },
  fireExit() { Sfx.door(); Levels.take('fireExit'); },
  officeDoor() { Sfx.door(); Levels.take('officeDoor'); },
  shopDoor() { Sfx.door(); Levels.take('shopDoor'); },
  fireDoor() { Sfx.door(); Levels.take('fireDoor'); },
  shopOut() { Sfx.door(); Levels.take('shopOut'); },
  playerDesk() {
    insp('🖥️', 'Your desk', 'Yours', [
      'Your desk. A screen, a phone, and a chair that goes up and down.'],
      [
       { t: 'Log in.', to: null, if: () => (Q.active('q_settle') && !G.flags.loggedIn), do() {
      G.flags.loggedIn = true;
      G.flags.foundDesk = true;
      Player.xp(10);
      Q.step('q_settle');
      UI.objective('Get Lee a coffee from the kitchen.');
    } },
       { t: 'Sit down for five minutes.', to: null, do() { Player.mod({ patience: 6 }); G.minutes += 5; } }].concat(cab('playerDesk')));
  },
  pc() {
    insp('🖥️', 'A workstation', 'Somebody’s', [
      'Somebody else’s screen. Their wallpaper is a beach.']);
  },
  phone() {
    insp('☎️', 'A desk phone', 'Not ringing', ['It is not ringing. It will.'],
      [
       { t: 'Ask the queue for one.', to: null, do() { Combat.startCall(false); } },
       { t: 'Leave it.', to: null }]);
  },
  chair() {
    insp('🪑', 'A chair', 'Office chair', ['It goes up and down. Mostly down.'],
      [
       { t: 'Sit for a minute.', to: null, do() { Player.mod({ patience: 2 }); G.minutes += 1; } }]);
  },
  printer() {
    insp('🖨️', 'The printer', 'Networked, allegedly', ['It is printing something nobody sent.']);
  },
  noticeboard() {
    insp('📋', 'Noticeboard', 'Pinned', [
      'A fire notice, a lost-property list and a leaflet about posture.']);
  },
  plant() {
    insp('🪴', 'A plant', 'Alive', ['Somebody waters it. Nobody knows who.']);
  },
  coffee() {
    insp('☕', 'Coffee machine', 'Bean to cup', [
      'It makes a noise and produces something hot and brown.'],
      [
       { t: 'Make one for Lee.', to: null, if: () => (Q.active('q_settle') && !G.flags.madeLeeCoffee && !!G.flags.loggedIn), do() {
      G.flags.madeLeeCoffee = true;
      Item.give('coffee');
      Q.step('q_settle');
      UI.objective('Take the coffee to Lee.');
    } },
       { t: 'Make one for yourself — 50p.', to: null, do() { Player.mod({ money: -0.5, patience: -2, energy: 15 }); } }]);
  },
  kettle() {
    insp('🫖', 'The kettle', 'Just boiled', ['It has just boiled. It has always just boiled.'],
      [
       { t: 'Make a tea.', to: null, do() { Player.mod({ patience: 8 }); G.minutes += 4; } }]);
  },
  fridge() {
    insp('🧊', 'The fridge', 'Communal', ['Several yoghurts, all of them somebody’s.']);
  },
  vending() {
    insp('🥤', 'Vending machine', 'Takes coins', ['It hums. Something inside it is lit.'],
      [
       { t: 'Buy something.', to: null, do() { Shop.open('vending'); } },
       { t: 'Leave it.', to: null }]);
  },
  kitchenTable() {
    insp('🍽️', 'The kitchen table', 'Crumbs', [
      'A table, four chairs and a newspaper from last week.']);
  },
  loo() {
    insp('🚽', 'A cubicle', 'Vacant', ['A moment to yourself.'],
      [
       { t: 'Take a moment.', to: null, do() { Player.mod({ patience: 12 }); G.minutes += 4; } }]);
  },
  sink() {
    insp('🚰', 'A basin', 'Cold only', ['The hot tap is a decorative feature.']);
  },
  meetingNotes() {
    insp('📄', 'Somebody’s notes', 'Left behind', [
      'Minutes of a meeting. Every action is assigned to somebody who was not there.']);
  },
  filing() {
    insp('🗄️', 'Filing cabinet', 'Locked', [
      'Locked. The key is in the top drawer, which is also locked.']);
  },
  meetingTable() {
    insp('🍽️', 'The meeting table', 'Booked', ['Booked all day by somebody who never comes.']);
  },
  whiteboard() {
    insp('📋', 'The whiteboard', 'Do not wipe', [
      'DO NOT WIPE, in a box, from a meeting nobody remembers.',
      'There is a list of names in the corner. The newest one is yours.'],
      [
       { t: 'Remember whose names they are.', to: null, if: () => (Q.active('q_look') && !!G.flags.sawMeeting && !G.flags.readBoard), do() {
      G.flags.readBoard = true;
      Q.step('q_look');
      UI.objective('Tell Pat whose name is on the whiteboard.');
    } }]);
  },
  oldTerminal() {
    insp('🖥️', 'The old terminal', 'Still on', [
      'A beige computer that is somehow still switched on.'],
      [{ t: 'Leave it on.', to: null }].concat(cab('oldTerminal')));
  },
  cables() {
    insp('🔌', 'The cable box', 'Tangled', [
      'A box of cables that were all connected to something once.'],
      [{ t: 'Leave it tangled.', to: null }].concat(cab('cables')));
  },
  cupboard() {
    insp('📦', 'The supplies cupboard', 'Unlocked', [
      'Pens, paper, and at the back, a foam dart blaster.'],
      [
       { t: 'Take the blaster.', to: null, if: () => !G.flags.tookBlaster, do() { G.flags.tookBlaster = true; Item.give('blaster'); } },
       { t: 'Take a pen.', to: null, do() { Player.xp(1); } }]);
  },
  reception() {
    insp('🛎️', 'Reception', 'Staffed', ['A bell, a signing-in book and a bowl of mints.'],
      [{ t: 'Take a mint.', to: null, do() { Player.mod({ energy: 2 }); } }]);
  },
  sofa() {
    insp('🛋️', 'A sofa', 'For visitors', ['A sofa for visitors. You are not a visitor any more.']);
  },
  directory() {
    insp('📋', 'The directory', 'Floors', ['G — Reception. 1 — The Floor.']);
  },
  shopTill() {
    insp('💷', 'The till', 'Open', ['A till, a card reader and a jar of sweets.'],
      [
       { t: 'Buy something.', to: null, do() { Shop.open('corner'); } },
       { t: 'Leave it.', to: null }]);
  },
  shelves() {
    insp('🗄️', 'Shelves', 'Stocked', ['Crisps, batteries and a single birthday card.']);
  },
  tree() {
    insp('🌳', 'A tree', 'Deciduous', ['A tree. It has been here longer than the road.']);
  },
  streetLamp() {
    insp('💡', 'A street light', 'Council', ['A lamp post. It comes on when it gets dark.']);
  },
  busStop() {
    insp('🚏', 'The bus stop', 'Every twenty minutes', [
      'A timetable, a bench and a shelter with one pane missing.']);
  },
  poolCar() {
    insp('🚗', 'The pool car', 'Keys in it', ['The pool car. The keys are in it.']);
  },
  theBus() {
    insp('🚌', 'The bus', 'Not stopping', ['The bus, going past the stop without stopping.']);
  },
};
