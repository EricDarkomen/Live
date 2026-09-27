'use strict';
/* BUM BAY — everything the island is made of. Numbers are tuned short so a
   test session levels up in minutes, not days. */

const ITEMS = {
  beans:      { n: 'Magic Beans',        e: '🫘', sell: 2 },
  corn:       { n: 'Corn',               e: '🌽', sell: 3 },
  chilli:     { n: 'Ring-Sting Chilli',  e: '🌶️', sell: 5 },
  banana:     { n: 'Banana',             e: '🍌', sell: 7 },
  cabbage:    { n: 'Fart Cabbage',       e: '🥬', sell: 8 },
  coconut:    { n: 'Coconut',            e: '🥥', sell: 10 },
  pineapple:  { n: 'Spiky Pineapple',    e: '🍍', sell: 14 },
  egg:        { n: 'Bum Egg',            e: '🥚', sell: 6 },
  jar:        { n: 'Jar of Pig Toots',   e: '🫙', sell: 9 },
  cheese:     { n: 'Stinky Cheese',      e: '🧀', sell: 12 },
  milk:       { n: 'Milk',               e: '🥛', sell: 12 },
  bakedbeans: { n: 'Baked Beans',        e: '🥫', sell: 12 },
  hotsauce:   { n: 'Bum Burner Sauce',   e: '🧴', sell: 20 },
  breakfast:  { n: 'Full Greasy Brekkie', e: '🍳', sell: 34 },
  loo:        { n: 'Loo Roll',           e: '🧻', sell: 28 },
  smoothie:   { n: 'Suspicious Smoothie', e: '🍹', sell: 32 },
  colada:     { n: 'Piña Colada',        e: '🍸', sell: 52 },
  wind:       { n: 'Canned Wind',        e: '💨', sell: 60 }
};

/* t = seconds to grow. */
const CROPS = {
  beans:     { lvl: 1, t: 20,  cost: 1, xp: 1 },
  corn:      { lvl: 1, t: 40,  cost: 2, xp: 1 },
  chilli:    { lvl: 2, t: 75,  cost: 3, xp: 2 },
  banana:    { lvl: 3, t: 120, cost: 4, xp: 2 },
  cabbage:   { lvl: 4, t: 180, cost: 5, xp: 3 },
  coconut:   { lvl: 5, t: 240, cost: 6, xp: 3 },
  pineapple: { lvl: 6, t: 330, cost: 8, xp: 4 }
};

const ANIMALS = {
  chicken: { n: 'Chicken', e: '🐔', lvl: 1, cost: 40,  eats: 'corn',    gives: 'egg',    t: 50,  xp: 2,
    line: ['Fresh from the chicken’s bum!', 'Still warm. Ew.', 'Bok. (That means “you’re welcome”.)'] },
  pig:     { n: 'Pig',     e: '🐷', lvl: 2, cost: 90,  eats: 'beans',   gives: 'jar',    t: 90,  xp: 3,
    line: ['Sealed for freshness.', 'Vintage 2026. Notes of bean.', 'Do NOT open indoors.'] },
  goat:    { n: 'Goat',    e: '🐐', lvl: 3, cost: 150, eats: 'chilli',  gives: 'cheese', t: 140, xp: 4,
    line: ['It smells like feet. Premium feet.', 'The goat is judging you.', 'Aged in a goat. Obviously.'] },
  cow:     { n: 'Cow',     e: '🐄', lvl: 5, cost: 260, eats: 'cabbage', gives: 'milk',   t: 200, xp: 5,
    line: ['Moo-ve over, supermarket.', 'Slightly fizzy. Cabbage diet.', 'Udderly delightful.'] }
};

/* Factories. Each recipe: in {item: qty}, out item, t seconds. */
const FACTORIES = {
  canner:  { n: 'Bean Canner',     e: '🥫', roof: '#d9534f', lvl: 2, cost: 120, recipes: [
    { out: 'bakedbeans', in: { beans: 3 }, t: 45, xp: 4 } ] },
  sauce:   { n: 'Hot Sauce Shack', e: '🔥', roof: '#f0932b', lvl: 3, cost: 200, recipes: [
    { out: 'hotsauce', in: { chilli: 3, jar: 1 }, t: 80, xp: 6 } ] },
  diner:   { n: 'Greasy Spoon',    e: '🍳', roof: '#6ab04c', lvl: 4, cost: 300, recipes: [
    { out: 'breakfast', in: { egg: 2, bakedbeans: 1, cheese: 1 }, t: 110, xp: 9 } ] },
  loomill: { n: 'Loo Roll Mill',   e: '🧻', roof: '#7ed6df', lvl: 5, cost: 380, recipes: [
    { out: 'loo', in: { coconut: 2 }, t: 100, xp: 8 } ] },
  hut:     { n: 'Smoothie Hut',    e: '🍹', roof: '#e056fd', lvl: 6, cost: 480, recipes: [
    { out: 'smoothie', in: { banana: 2, milk: 1 }, t: 100, xp: 9 },
    { out: 'colada', in: { pineapple: 1, coconut: 1, milk: 1 }, t: 160, xp: 14 } ] },
  windco:  { n: 'Wind Farm (Indoor)', e: '💨', roof: '#95a5a6', lvl: 7, cost: 650, recipes: [
    { out: 'wind', in: { bakedbeans: 1, cabbage: 2, jar: 1 }, t: 180, xp: 16 } ] }
};

const DECOR = {
  palm:      { n: 'Palm Tree',       e: '🌴', lvl: 1, cost: 20,  joy: 1 },
  duck:      { n: 'Rubber Duck',     e: '🦆', lvl: 2, cost: 45,  joy: 2 },
  outhouse:  { n: 'Scenic Outhouse', e: '🚽', lvl: 2, cost: 70,  joy: 3 },
  tiki:      { n: 'Grumpy Tiki',     e: '🗿', lvl: 3, cost: 110, joy: 4 },
  flamingo:  { n: 'Plastic Flamingo', e: '🦩', lvl: 4, cost: 150, joy: 5 },
  unicorn:   { n: 'Inflatable Unicorn', e: '🦄', lvl: 5, cost: 220, joy: 7 },
  castle:    { n: 'Sandcastle (Moated)', e: '🏰', lvl: 6, cost: 320, joy: 10 },
  statue:    { n: 'Statue of a Bum', e: '🍑', lvl: 8, cost: 500, joy: 15 }
};

/* Junk on the ground. Poop is free to clear; the rest costs coins. */
const JUNK = {
  poop: { n: 'A Mystery Poop', e: '💩', cost: 0,  xp: 1, coins: 2 },
  bush: { n: 'Scraggy Bush',   e: '🌿', cost: 8,  xp: 3, coins: 0 },
  rock: { n: 'Big Rock',       e: '🪨', cost: 15, xp: 5, coins: 0 },
  sock: { n: 'A Lone Sock',    e: '🧦', cost: 0,  xp: 2, coins: 5 }
};

const CUSTOMERS = [
  { n: 'Captain Pantsless', f: '🏴‍☠️', say: ['Arr. Don’t look down.', 'Me trousers blew away in ’09. Never replaced ’em.', 'Quick, before the breeze picks up.'] },
  { n: 'Grandma Gasbag',    f: '👵', say: ['Ooh, lovely. Makes me toot like a tugboat.', 'It’s for my book club. We don’t read.', 'Don’t tell Harold.'] },
  { n: 'Sir Toots-a-Lot',   f: '🎩', say: ['A gentleman requires provisions. And air freshener.', 'Pip pip. And also parp parp.', 'Charge it to the estate.'] },
  { n: 'A Walrus (Blocked)', f: '🦭', say: ['It has been nine days.', 'Please. I’m begging you.', 'Hurry. HURRY.'] },
  { n: 'Mermaid w/ Hiccups', f: '🧜', say: ['*hic* Don’t ask where I keep it *hic*', 'Fish are SO judgy.', 'Bubbles aren’t always from breathing, sweetie.'] },
  { n: 'Sunburnt Steve',    f: '🥵', say: ['I fell asleep on the beach. Face down.', 'Everything hurts. Even my opinions.', 'Can’t sit. Standing order.'] },
  { n: 'Polly the Parrot',  f: '🦜', say: ['SQUAWK! Polly wants… that lot!', 'Polly did a poo on the captain. SQUAWK.', 'Pieces of eight! Pieces of beans!'] },
  { n: 'Octo-Nan',          f: '🐙', say: ['Eight arms, eight shopping bags, dear.', 'I’ll need a wet wipe for each tentacle.', 'Ink? No, that was a sneeze.'] },
  { n: 'Tourist Terry',     f: '🤳', say: ['Is this the nudist bit? No? Shame.', 'Gonna put this on my story.', 'The brochure said “paradise”. It smells like beans.'] },
  { n: 'King Crab',         f: '🦀', say: ['The royal throne requires stocking. The OTHER throne.', 'Pinch pinch. Hand it over.', 'Kneel. Actually, don’t, the sand’s wet.'] }
];

const GULL_LINES = ['SPLAT! A seagull has left you a gift.', 'A gull flies over. It was not a clean flight.', 'Incoming! …Too late.'];

const LEVEL_LINES = [
  'Your mum would be mildly impressed.',
  'The walrus salutes you. Weakly.',
  'You’ve earned the right to more beans.',
  'Nobody clapped, but the goat blinked.',
  'The seagulls are taking notice. Worryingly.'
];

const SKINT = ['You’re skint. Sell something. Maybe your dignity.', 'Not enough coins. Try looking down the back of a coconut.', 'Can’t afford that. The crab is laughing at you.'];

/* The tutorial-ish quest chain. `k` is a stat counter, `n` the target. */
const QUESTS = [
  { k: 'harvest', n: 3,  t: 'Harvest 3 crops',            say: 'Oi, newbie! Tap the ripe stuff. Or swipe across it like a pro.', r: { coins: 20, xp: 5 } },
  { k: 'plant',   n: 4,  t: 'Plant 4 crops',              say: 'Tap an empty field and pick a seed. Beans are quick. Beans are life.', r: { coins: 20, xp: 5 } },
  { k: 'poop',    n: 3,  t: 'Scoop 3 poops',              say: 'The seagulls have been… busy. Tap the 💩 to clean it. Wash your hands after.', r: { coins: 25, xp: 5, gold: 1 } },
  { k: 'egg',     n: 2,  t: 'Collect 2 eggs',             say: 'Feed the chicken some 🌽 and it’ll lay you an egg. Don’t think about where from.', r: { coins: 30, xp: 8 } },
  { k: 'order',   n: 1,  t: 'Ship a boat order',          say: 'Boats at the pier want stuff. Tap one, fill it, get paid. Easy money.', r: { coins: 40, xp: 10 } },
  { k: 'build_canner', n: 1, t: 'Build a Bean Canner',    say: 'Time to industrialise the beans. Shop → Buildings.', r: { coins: 40, xp: 10 } },
  { k: 'make_bakedbeans', n: 2, t: 'Can 2 Baked Beans',   say: 'Stuff beans in tins. The island economy runs on it.', r: { coins: 50, xp: 12 } },
  { k: 'decor',   n: 1,  t: 'Place a decoration',         say: 'Pretty things make customers pay more. Science.', r: { coins: 40, xp: 10, gold: 1 } },
  { k: 'land',    n: 1,  t: 'Buy more island',            say: 'Tap a 🔒 sign to buy land. More room for poop.', r: { coins: 60, xp: 15 } },
  { k: 'order',   n: 6,  t: 'Ship 6 boat orders',         say: 'Keep those boats happy. The walrus is still blocked.', r: { coins: 80, xp: 20, gold: 2 } },
  { k: 'build_loomill', n: 1, t: 'Build a Loo Roll Mill', say: 'The whole bay is running low on loo roll. It’s a crisis.', r: { coins: 100, xp: 25 } },
  { k: 'make_loo', n: 3, t: 'Make 3 Loo Rolls',           say: 'Roll, roll, roll your… you know the rest.', r: { coins: 120, xp: 30, gold: 2 } },
  { k: 'make_wind', n: 1, t: 'Can some Wind',             say: 'The final frontier. Bottle the unbottlable.', r: { coins: 200, xp: 50, gold: 5 } }
];

/* Land expansion, by 6×6 chunk. */
const EXPAND = {
  '1,0': { lvl: 2, cost: 120 }, '0,1': { lvl: 3, cost: 250 }, '2,1': { lvl: 4, cost: 450 }, '1,2': { lvl: 5, cost: 700 },
  '0,0': { lvl: 6, cost: 1000 }, '2,0': { lvl: 7, cost: 1300 }, '0,2': { lvl: 8, cost: 1700 }, '2,2': { lvl: 9, cost: 2200 }
};
