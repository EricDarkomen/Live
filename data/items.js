'use strict';
/* Items, skills, jobs, achievements, the minigame cabinets and the shops. */

/* ---------------- Items ---------------- */
const ITEMS = {
  coffee: { n: 'A Coffee', e: '☕', d: 'Hot, brown, and technically coffee.', v: 1.2, r: 'common', use: { energy: 20, patience: -3, count: { coffee: 1 }, sfx: 'coffee', t: 'Coffee. You feel braver.' } },
  sandwich: { n: 'A Sandwich', e: '🥪', d: 'From the shop. Cheese and something.', v: 3, r: 'common', use: { energy: 25, patience: 10, minutes: 10, t: 'A proper lunch. It helps.' } },
  biscuit: { n: 'A Biscuit', e: '🍪', d: 'Small, honest, correct.', v: 0.5, r: 'common', use: { energy: 8, patience: 3, t: 'A biscuit.' } },
  mug: { n: 'A Mug', e: '☕', d: 'It was somebody’s. It is yours now.', v: 0, r: 'common', slot: 'mug', eff: { patience: 4 } },
  lanyard: { n: 'A Lanyard', e: '🪪', d: 'Your name, spelled correctly for once.', v: 0, r: 'rare', slot: 'trinket', eff: { knowledge: 2 } },
  cabletie: { n: 'A Cable Tie', e: '🪢', d: 'The one left over. There is always one left over.', v: 0, r: 'rare', slot: 'trinket', eff: { knowledge: 1 } },
  blaster: { n: 'Foam Dart Blaster', e: '🔫', d: 'Six foam darts. Found in the supplies cupboard.', v: 0, r: 'rare', gun: 'dart' },
};

/* ---------------- Skills ---------------- */
const SKILLS = {
  people: { name: '🤝 People', colour: '#5ad48a', list: {
    empathy: { n: 'Empathy', d: 'You hear what they mean, not what they say.', max: 3 },
    deesc: { n: 'De-escalation', d: 'Encounters hit you softer.', max: 3 },
    persuade: { n: 'Persuasion', d: 'A won encounter pays more.', max: 3 } } },
  systems: { name: '🖥️ Systems', colour: '#4da3ff', list: {
    product: { n: 'Product Knowledge', d: 'You know the answer before they finish.', max: 3 },
    system: { n: 'The System', d: 'You can find anything in it, eventually.', max: 3 },
    corp: { n: 'Corporate', d: 'You can say nothing convincingly.', max: 3 } } },
  self: { name: '🧘 Self', colour: '#ffb347', list: {
    stress: { n: 'Resilience', d: 'More patience to spend.', max: 3 },
    caffeine: { n: 'Caffeine', d: 'More energy to spend.', max: 3 },
    sarcasm: { n: 'Sarcasm', d: 'Chaos, deployed.', max: 2 } } },
};

/* ---------------- Quests ---------------- */
/* `track` is one entry per step: where the tracker points when a job is being
   followed. `{ npc }` is a colleague, who walks their own schedule and is
   followed live; `{ obj }` is a world object, named by its `use` handler so it
   moves if the floor plan ever does; `{ wp }` is a floor waypoint, for a step
   that means a room rather than a thing.
   `null` is deliberate and load-bearing: a step whose whole point is that you do
   not know where to go — who has the mug, who wrote the numbers — gets no pin.
   The tracker says so rather than inventing a destination, because a compass
   arrow pointing at the answer is the game telling you the answer. */
const QUESTS = {
  q_settle: { n: 'Settling In', giver: 'Lee', steps: [
      'Find your desk.',
      'Get Lee a coffee from the kitchen.',
      'Take the coffee to Lee.',
    ],
    track: [{ obj: 'playerDesk' }, { obj: 'coffee' }, { npc: 'lee' }],
    rw: { xp: 80, money: 5, item: 'mug' } },
  q_look: { n: 'Look Around', giver: 'Pat', steps: [
      'Find the meeting room.',
      'Find out whose name is on the whiteboard.',
      'Tell Pat.',
    ],
    track: [{ wp: 'meeting' }, null, { npc: 'pat' }],
    rw: { xp: 60, money: 0, item: 'lanyard' } },
};

/* ---------------- Achievements ---------------- */
const ACHS = {
  a_first: { n: 'Day One', e: '🕔', d: 'Finish a working day.' },
  a_settled: { n: 'One of Us', e: '☕', d: 'Bring Lee a coffee.' },
  a_review: { n: 'Reviewed', e: '📊', d: 'Survive your review.' },
  a_landed: { n: 'Landed It', e: '🤝', d: 'Win an encounter on rapport alone.' },
  a_adult: { n: 'The Adult in the Room', e: '🧘', d: 'Win an encounter with more than half your patience left.' },
  a_bs: { n: 'Said Nothing, Won', e: '💼', d: 'Win an encounter using only corporate language.' },
  a_legend: { n: 'Legend', e: '⭐', d: 'Reach 100 reputation.' },
  a_allthree: { n: 'Explorer', e: '🧭', d: 'Walk into every place there is.' },
  a_drive: { n: 'Behind the Wheel', e: '🚗', d: 'Drive a car.' },
  a_parked: { n: 'First Go', e: '🅿️', d: 'Park straight, between the lines.' },
  a_lap: { n: 'Round the Block', e: '🔄', d: 'Drive the whole loop in one go.' },
  a_grid: { n: 'Every Road', e: '🗺️', d: 'Drive every road in one go.' },
  a_greenman: { n: 'Green Man', e: '🚶', d: 'Cross at the crossing you pressed.' },
  a_pressed: { n: 'Pressed It Again', e: '🚦', d: 'Press a crossing button that was already lit.' },
  a_foamwar: { n: 'Foam War', e: '🔫', d: 'Hit five people with something foam.' },
  a_holdmusic: { n: 'On Hold', e: '🎵', d: 'Clear the rhythm game.' },
  a_inboxzero: { n: 'Inbox Zero', e: '📥', d: 'Clear the inbox game.' },
  a_nothingread: { n: 'Flawless', e: '📭', d: 'Clear the inbox game without a mistake.' },
  a_patched: { n: 'Patched', e: '🔌', d: 'Clear the cable game.' },
  a_arcade: { n: 'Arcade', e: '🕹️', d: 'Clear all three games.' },
};


/* ---------------- The arcade cabinets ----------------
   WHERE a minigame is played, and what it is wired into. One entry per game
   per object, and every field on it is a string that joins two files nothing
   else joins up:

     game    a minigame in engine/arcade.js's catalogue
     use     an object's `use:` handler in data/acts.js — the thing you press
     t       the reply that offers it, in the dialogue that object opens
     skill   a skill in SKILLS whose rank the game is handed and spends on
             something felt: a wider judgement window, a longer read, one more
             cable already bolted down
     job     a job in QUESTS, stepped once when the game is first cleared
     item    an item in ITEMS, handed over the first time it is cleared
     need    a G.flag that has to be set before the reply is offered at all

   It is a TABLE rather than four hand-written dialogue choices because that is
   the only form the editor can add to, edit and take away from — a minigame
   bound to an object in code is one the tool can describe and never change.
   cab() at the top of data/acts.js turns these into the replies, so the PROSE
   stays there with the rest of the writing and only the wiring is data.

   Every one of those six joins fails silently and each fails differently: a
   `use` nothing handles is a reply that never appears, a `skill` that is not
   in SKILLS is a rank of zero for ever, an `item` ITEMS has never heard of is
   a reward that quietly does not arrive. editor/games.js checks all six. */
const CABINETS = [
  { game: 'holdmusic', use: 'oldTerminal', skill: 'system', job: null, item: null, need: null,
    t: 'Play the game on the old terminal.' },
  { game: 'patch', use: 'cables', skill: 'product', job: null, item: 'cabletie', need: null,
    t: 'Sort out the cables.' },
  { game: 'inbox', use: 'playerDesk', skill: 'corp', job: null, item: null, need: null,
    t: 'Clear your inbox.' },
];


/* ---------------- Shop ---------------- */
const SHOP = {
  vending: { title: 'Vending machine', note: 'Snacks, and one kind of coffee.',
    stock: ['coffee', 'biscuit'] },
  corner: { title: 'The Shop', note: 'Sandwiches and the rest.',
    stock: ['sandwich', 'coffee', 'biscuit'] },
};
