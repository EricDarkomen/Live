'use strict';
/* Items, skills, jobs, achievements, the minigame cabinets and the shops. */

/* ---------------- Items ----------------
   n name · e emoji · d description · v value (what it sells and buys for)
   r rarity · use what happens when you use it · slot where it is worn
   eff what wearing it does · gun a key in GUNS (engine/guns.js)
   `crop` on a seed names the fruit it grows into (see data/garden.js);
   `drink` marks a cocktail you can give, ship or knock back. */
const ITEMS = {
  /* Worn. */
  headset0: { n: 'Cheap Sunglasses', e: '🕶️', d: 'Two euros from the airport. They make you look like you know things.', v: 0, r: 'common', slot: 'headset', eff: { bullshit: 1 } },
  aviators: { n: 'Aviators', e: '🕶️', d: 'Mirrored. Nobody can see you looking. Everybody can see you looking.', v: 18, r: 'rare', slot: 'headset', eff: { bullshit: 3, empathy: 1 } },
  strawhat: { n: 'Rafa’s Straw Hat', e: '👒', d: 'Frayed at the brim and smelling faintly of rum. It fits perfectly.', v: 0, r: 'rare', slot: 'trinket', eff: { knowledge: 2, patience: 4 } },
  shaker: { n: 'The Silver Shaker', e: '🍸', d: 'Mari’s spare. “Don’t drop it. Or do, it’s a good show.”', v: 0, r: 'rare', slot: 'mug', eff: { knowledge: 3 } },
  shell: { n: 'Puka Shell Necklace', e: '🐚', d: 'Kai made it. He made you promise not to tell anyone he made it.', v: 0, r: 'rare', slot: 'trinket', eff: { empathy: 2, chaos: 1 } },
  hibiscus: { n: 'Hibiscus Flower', e: '🌺', d: 'Tucked behind the ear. Left means taken, right means available. You forget which.', v: 4, r: 'common', slot: 'trinket', eff: { empathy: 1 } },
  suncream: { n: 'Factor 50', e: '🧴', d: 'The most important item in the game. Put it on.', v: 6, r: 'common', use: { patience: 12, t: 'You put sun cream on. Somebody offers to do your back. You let them.' } },
  /* Food and drink you buy. */
  coffee: { n: 'Island Coffee', e: '☕', d: 'Thick, black, and grown on the hill.', v: 2, r: 'common', use: { energy: 20, patience: -2, food: 2, count: { coffee: 1 }, sfx: 'coffee', t: 'Rocket fuel. You feel brave.' } },
  icecream: { n: 'Coconut Ice Cream', e: '🍦', d: 'It is melting down your wrist before you have paid for it.', v: 3, r: 'common', use: { energy: 12, patience: 10, food: 12, t: 'Cold, sweet, gone in four licks.' } },
  empanada: { n: 'An Empanada', e: '🥟', d: 'From Coco’s. Still hot. Dangerously hot.', v: 4, r: 'common', use: { energy: 25, patience: 8, food: 40, minutes: 10, t: 'A proper lunch. You burn your mouth. Worth it.' } },
  coconutwater: { n: 'Coconut Water', e: '🥥', d: 'Straight from the nut, with a straw in it.', v: 3, r: 'common', use: { energy: 15, patience: 6, food: 6, t: 'Hydrated. Your skin thanks you.' } },
  /* Seeds, from Mama Coco's. */
  seed_mint: { n: 'Mint Seedlings', e: '🌱', d: 'Grows fast. Grows everywhere. Plant it in the garden.', v: 2, r: 'common', crop: 'mint' },
  seed_lime: { n: 'Lime Sapling', e: '🌱', d: 'Every good drink starts with a lime. Plant it in the garden.', v: 3, r: 'common', crop: 'lime' },
  seed_strawberry: { n: 'Strawberry Runners', e: '🌱', d: 'Sweet, red and a little bit suggestive. Plant it in the garden.', v: 4, r: 'common', crop: 'strawberry' },
  seed_mango: { n: 'Mango Stone', e: '🌱', d: 'Slow to start, worth the wait. Plant it in the garden.', v: 6, r: 'common', crop: 'mango' },
  seed_pineapple: { n: 'Pineapple Crown', e: '🌱', d: 'The top off last week’s pineapple. Plant it in the garden.', v: 8, r: 'common', crop: 'pineapple' },
  seed_coconut: { n: 'Sprouting Coconut', e: '🌱', d: 'A coconut that has decided to become a tree. Plant it in the garden.', v: 10, r: 'rare', crop: 'coconut' },
  /* Harvest. */
  mint: { n: 'Fresh Mint', e: '🌿', d: 'Smells like a mojito already.', v: 3, r: 'common', use: { patience: 3, food: 2, t: 'You chew a mint leaf. Fresh.' } },
  lime: { n: 'Lime', e: '🍋', d: 'Sour, bright, essential.', v: 4, r: 'common' },
  strawberry: { n: 'Strawberries', e: '🍓', d: 'Warm from the sun.', v: 5, r: 'common', use: { energy: 6, patience: 4, food: 10, t: 'You eat one. Then four more.' } },
  mango: { n: 'Mango', e: '🥭', d: 'Ripe, heavy, and it will drip everywhere.', v: 8, r: 'common', use: { energy: 12, patience: 6, food: 18, t: 'Juice to the elbows. No regrets.' } },
  pineapple: { n: 'Pineapple', e: '🍍', d: 'Spiky outside, sweet inside. Like Mari.', v: 11, r: 'common', use: { energy: 10, patience: 5, food: 20, t: 'You hack it open with a bar knife. Sticky, glorious.' } },
  coconut: { n: 'Coconut', e: '🥥', d: 'Hard work. Worth it.', v: 14, r: 'rare', use: { energy: 14, patience: 6, food: 22, t: 'Twenty minutes with a rock. Then: heaven.' } },
  /* What the farm makes out of what the garden gives — see data/farm.js.
     Dried fruit keeps for ever and ships well; scraps and compost close the
     loop back to the soil. */
  scraps: { n: 'Kitchen Scraps', e: '🍂', d: 'Peel, leaves, and fruit that went soft. The compost bin in the garden wants it.', v: 0, r: 'common' },
  compost: { n: 'Compost', e: '🪱', d: 'Black, crumbly, and full of worms having the time of their lives. Dig it into a plot: things grow faster and give more.', v: 5, r: 'common' },
  dried_mango: { n: 'Dried Mango', e: '🥭', d: 'Sun-dried on Rafa’s rack. Chewy, sweet, and it keeps for ever.', v: 16, r: 'rare', use: { energy: 10, patience: 4, food: 25, t: 'Chewy sunshine.' } },
  dried_pineapple: { n: 'Dried Pineapple', e: '🍍', d: 'Golden rings, dried in the sun. They keep for ever.', v: 20, r: 'rare', use: { energy: 10, patience: 4, food: 25, t: 'Like a pineapple, but it concentrated.' } },
  coconut_chips: { n: 'Coconut Chips', e: '🥥', d: 'Toasted flakes in a paper cone. The other islands go mad for them.', v: 26, r: 'rare', use: { energy: 12, patience: 5, food: 28, t: 'Crunchy. Addictive. Gone.' } },
  dried_strawberry: { n: 'Sun-dried Strawberries', e: '🍓', d: 'Little red jewels. They keep for ever.', v: 11, r: 'common', use: { energy: 6, patience: 4, food: 15, t: 'Intensely strawberry.' } },
  /* Cocktails, from the blender at The Driftwood. */
  mojito: { n: 'Mojito', e: '🍸', d: 'Lime, mint, rum, and a bit of a swagger.', v: 16, r: 'rare', drink: true, use: { energy: 10, patience: 14, food: 3, t: 'Cold, minty, dangerous. You feel ten per cent more attractive.' } },
  daiquiri: { n: 'Strawberry Daiquiri', e: '🍹', d: 'Pink, frozen, and deeply flirtatious.', v: 18, r: 'rare', drink: true, use: { energy: 8, patience: 16, t: 'Brain freeze. Worth it.' } },
  sotb: { n: 'Sex on the Beach', e: '🍑', d: 'Mango, strawberry, a splash of scandal. The house special.', v: 24, r: 'rare', drink: true, use: { energy: 10, patience: 20, t: 'You blush. You are not sure why. You are sure why.' } },
  colada: { n: 'Piña Colada', e: '🥥', d: 'If you like it, and getting caught in the rain.', v: 30, r: 'epic', drink: true, use: { energy: 15, patience: 22, t: 'Creamy, sweet, and it tastes like a holiday postcard.' } },
  sunset: { n: 'Driftwood Sunset', e: '🌅', d: 'Rafa’s own recipe: mango, pineapple and lime, layered like the sky at eight.', v: 40, r: 'epic', drink: true, use: { energy: 20, patience: 30, t: 'It tastes like the last night of a holiday. You feel wonderful.' } },
  /* Toys. */
  soaker: { n: 'Water Pistol', e: '💦', d: 'From the surf shack. For “emergencies”.', v: 0, r: 'rare', gun: 'water' },
  /* Keepsakes. */
  letter: { n: 'Rafa’s Letter', e: '💌', d: '“The bar is yours now, kid. Look after Mari, water the mangoes, and never let a man called Sterling buy you a drink. — R.”', v: 0, r: 'rare', quest: true },
  polaroid: { n: 'A Polaroid', e: '📸', d: 'The two of you at the cove, lit by the lantern, laughing at something you have already forgotten.', v: 0, r: 'epic', quest: true },
};

/* ---------------- Skills ----------------
   The ids are the engine's (engine/progress.js reads empathy, product, system,
   corp, sarcasm, stress, caffeine, deesc and persuade by name); everything a
   player reads is here. */
const SKILLS = {
  people: { name: '💋 Charm', colour: '#ff7eb6', list: {
    empathy: { n: 'Read the Room', d: 'You know what they want before they do.', max: 3 },
    deesc: { n: 'Cool Head', d: 'A difficult guest bothers you less.', max: 3 },
    persuade: { n: 'Big Tipper', d: 'A happy guest pays more.', max: 3 } } },
  systems: { name: '🍸 Mixology', colour: '#4dd4ff', list: {
    product: { n: 'Recipes', d: 'Your drinks hit harder.', max: 3 },
    system: { n: 'Speed Pour', d: 'Faster, flashier, more ice.', max: 3 },
    corp: { n: 'Smooth Lines', d: 'You always know what to say.', max: 3 } } },
  self: { name: '☀️ Island Life', colour: '#ffb347', list: {
    stress: { n: 'Sun-kissed', d: 'More nerve to spend.', max: 3 },
    caffeine: { n: 'Espresso Tolerance', d: 'More energy to spend.', max: 3 },
    sarcasm: { n: 'Cheek', d: 'Your mischief lands.', max: 2 } } },
};

/* ---------------- Jobs ----------------
   `track` is one entry per step: `{ npc }` a person, followed live; `{ obj }` a
   world object named by its `use`; `{ wp }` a waypoint. `null` means you have
   to find it yourself, and the tracker says so. */
const QUESTS = {
  q_arrive: { n: 'Welcome to Paradise', giver: 'Teo', steps: [
      'Find The Driftwood on the Promenade.',
      'Say hello to Mari behind the bar.',
    ],
    track: [{ obj: 'barDoor' }, { npc: 'mari' }],
    rw: { xp: 40, money: 20, item: 'hibiscus' } },
  q_bar: { n: 'Behind the Bar', giver: 'Mari', steps: [
      'Open up the till behind the bar.',
      'Serve your first guest — ring a bell, pour a drink.',
      'Tell Mari how it went.',
    ],
    track: [{ obj: 'playerDesk' }, { obj: 'stool' }, { npc: 'mari' }],
    rw: { xp: 80, money: 25, item: 'shaker' } },
  q_garden: { n: 'Rafa’s Garden', giver: 'Mama Coco', steps: [
      'Buy some seeds at Mama Coco’s.',
      'Plant them in Rafa’s garden, inside the loop.',
      'Harvest your first crop.',
      'Blend a cocktail at The Driftwood.',
    ],
    track: [{ obj: 'seedRack' }, { obj: 'plot' }, { obj: 'plot' }, { obj: 'blender' }],
    rw: { xp: 100, money: 10, item: 'strawhat' } },
  q_boat: { n: 'Cargo', giver: 'Captain Teo', steps: [
      'Read the order board on the jetty.',
      'Fill an order for the supply boat.',
    ],
    track: [{ obj: 'orderBoard' }, { obj: 'orderBoard' }],
    rw: { xp: 90, money: 40 } },
  q_kai: { n: 'Catch a Wave', giver: 'Kai', steps: [
      'Pick up a board at the surf shack.',
      'Find the lagoon Kai told you about, somewhere in the jungle.',
      'Tell Kai you found it.',
    ],
    track: [{ obj: 'surfShack' }, null, { npc: 'kai' }],
    rw: { xp: 80, item: 'shell' } },
  q_jade: { n: 'Lifeguard on Duty', giver: 'Jade', steps: [
      'Bring Jade something cold from the bar.',
      'Meet Jade at the cove lantern after sunset.',
    ],
    track: [{ npc: 'jade' }, { obj: 'coveLantern' }],
    rw: { xp: 90, item: 'aviators' } },
  q_luca: { n: 'Sunrise Salutations', giver: 'Luca', steps: [
      'Join Luca on the yoga deck.',
      'Put a record on the jukebox for his set.',
      'Find Luca on the deck at The Driftwood.',
    ],
    track: [{ obj: 'yogaMats' }, { obj: 'jukebox' }, { npc: 'luca' }],
    rw: { xp: 80, money: 15 } },
  q_critic: { n: 'The Review', giver: 'Mari', steps: [
      'Blend three cocktails to have ready.',
      'Win over Sienna Vale on the deck.',
    ],
    track: [{ obj: 'blender' }, { npc: 'sienna' }],
    rw: { xp: 150, money: 60 } },
  q_offer: { n: 'The Offer', giver: 'Blake Sterling', steps: [
      'Hear Blake Sterling out.',
    ],
    track: [{ npc: 'blake' }],
    rw: { xp: 200 } },
};

/* ---------------- Achievements ----------------
   Several ids are the engine's own — a_first, a_landed, a_adult, a_bs,
   a_legend, a_allthree, a_drive, a_parked, a_lap, a_foamwar and the arcade's —
   and only their words are ours. */
const ACHS = {
  a_first: { n: 'First Sunset', e: '🌅', d: 'Close the bar at the end of a day.' },
  a_settled: { n: 'Part of the Furniture', e: '🍹', d: 'Serve your first guest.' },
  a_review: { n: 'Five Stars', e: '⭐', d: 'Win over Sienna Vale.' },
  a_landed: { n: 'Smooth Operator', e: '😏', d: 'Seal the deal on chemistry alone.' },
  a_adult: { n: 'Ice Cold', e: '🧊', d: 'Win a guest over with more than half your nerve left.' },
  a_bs: { n: 'All Talk', e: '💬', d: 'Win a guest using nothing but lines.' },
  a_legend: { n: 'Legend of the Isle', e: '👑', d: 'Reach 100 reputation.' },
  a_allthree: { n: 'Explorer', e: '🧭', d: 'Walk into every place there is.' },
  a_drive: { n: 'Top Down', e: '🚙', d: 'Drive the beach buggy.' },
  a_parked: { n: 'Nailed the Park', e: '🅿️', d: 'Park straight, first go.' },
  a_lap: { n: 'Round the Island', e: '🔄', d: 'Drive the whole loop in one go.' },
  a_foamwar: { n: 'Water Fight', e: '💦', d: 'Soak five different people.' },
  a_holdmusic: { n: 'Shake It', e: '🍸', d: 'Clear the cocktail rhythm game.' },
  a_inboxzero: { n: 'All Booked', e: '📅', d: 'Clear the bookings game.' },
  a_nothingread: { n: 'Flawless', e: '💯', d: 'Clear the bookings game without a mistake.' },
  a_patched: { n: 'Lit Up', e: '✨', d: 'Clear the fairy-lights game.' },
  a_arcade: { n: 'Beach Games', e: '🕹️', d: 'Clear all three games.' },
  a_lagoon: { n: 'Secret Spot', e: '💎', d: 'Find the Hidden Lagoon.' },
  a_green: { n: 'Green Fingers', e: '🌱', d: 'Harvest ten crops.' },
  a_prime: { n: 'Prime Cut', e: '🏅', d: 'Harvest a prime crop: composted, never let dry.' },
  a_compost: { n: 'Circle of Life', e: '🪱', d: 'Turn scraps into compost.' },
  a_dried: { n: 'Preserved', e: '🌞', d: 'Dry something on Rafa’s rack.' },
  a_stocked: { n: 'Fully Stocked', e: '🧊', d: 'Keep the bar stocked from your own fridge three days running.' },
  a_mixer: { n: 'Mixologist', e: '🍸', d: 'Blend ten cocktails.' },
  a_cargo: { n: 'Shipshape', e: '⛵', d: 'Fill five orders for the supply boat.' },
  a_date: { n: 'Lantern Light', e: '🏮', d: 'Go on a date at Lovers’ Cove.' },
  a_kiss: { n: 'Sunset Kiss', e: '💋', d: 'Win somebody’s heart completely.' },
  a_stayed: { n: 'Paradise Kept', e: '🌴', d: 'Turn down Blake Sterling.' },
  a_dip: { n: 'Skinny Dip', e: '🌙', d: 'Go for a swim in the lagoon after dark.' },
};

/* ---------------- The arcade cabinets ----------------
   WHERE a minigame is played, and what it is wired into.
     game   a minigame in engine/arcade.js's catalogue
     use    an object's `use:` handler in data/acts.js
     t      the reply that offers it
     skill  a skill whose rank the game spends on something felt
     job    a job stepped once when first cleared · item handed over then
     need   a G.flag that must be set before it is offered */
const CABINETS = [
  { game: 'holdmusic', use: 'djBooth', skill: 'system', job: null, item: null, need: null,
    t: 'Get on the decks.' },
  { game: 'patch', use: 'fairyLights', skill: 'product', job: null, item: 'hibiscus', need: null,
    t: 'Untangle the fairy lights.' },
  { game: 'inbox', use: 'playerDesk', skill: 'corp', job: null, item: null, need: null,
    t: 'Sort out the bookings.' },
];

/* ---------------- Shops ---------------- */
const SHOP = {
  coco: { title: 'Mama Coco’s', note: 'Seeds, snacks, sun cream and scandal.',
    stock: ['seed_mint', 'seed_lime', 'seed_strawberry', 'seed_mango', 'seed_pineapple', 'seed_coconut', 'empanada', 'coffee', 'coconutwater', 'suncream', 'hibiscus', 'aviators'] },
  icecream: { title: 'The Ice-Cream Cart', note: 'One flavour. It is the right one.',
    stock: ['icecream', 'coconutwater'] },
  fruit: { title: 'The Fruit Stall', note: 'Whatever came in on the boat this morning.',
    stock: ['lime', 'mint', 'strawberry', 'mango'] },
};
