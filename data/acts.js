'use strict';
/* What happens when you press E. One entry per object `use:`, looked up by
 * name from Interact.go() and handed the object you pressed. Content that is
 * also code: it may call Q, Ach, Item, Rel, Garden, Orders and the rest, and
 * touches none of them until somebody presses the button. The engine's own
 * acts — doors, parked cars, passers-by — are in engine/acts.js and fill in
 * wherever this has none.
 */

const insp = (face, name, role, pages, choices, done) => Dialogue.say(face, name, role, pages, choices, done);

/* The replies that offer whatever minigames are installed on an object — the
   binding is CABINETS in data/items.js. */
const cab = use => Arcade.cabinets(use).map(c => ({
  t: c.t, to: null, do() { Arcade.open(c.game, c); }
}));
const evening = () => G.minutes % 1440 >= 1140 || G.minutes % 1440 < 300;
const night = () => G.minutes % 1440 >= 1230 || G.minutes % 1440 < 300;

const Acts = {
  /* ---- ways in and out ---- */
  barOut() { Sfx.door(); Levels.take('barOut'); },
  villaOut() { Sfx.door(); Levels.take('villaOut'); },
  marketOut() { Sfx.door(); Levels.take('marketOut'); },
  barDoor() { Sfx.door(); Levels.take('barDoor'); },
  marketDoor() { Sfx.door(); Levels.take('marketDoor'); },
  villaDoor() { Sfx.door(); Levels.take('villaDoor'); },

  /* ---- The Driftwood ---- */
  playerDesk() {
    insp('💵', 'The till', 'Yours now', [
      'An old brass till with RAFA scratched into the side and a photo of a much younger Mari taped to the drawer.'],
      [
       { t: 'Open up for the day.', to: null, if: () => qAt('q_bar', 0), do() {
      G.flags.openedTill = true;
      G.flags.foundDesk = true;
      Player.xp(10);
      Q.step('q_bar');
      UI.objective('A bell will ring on a stool. Go and serve that guest.');
      setTimeout(() => { if (!Phones.ringing.length) Phones.ringRandom(); }, 1500);
    } },
       { t: 'Count the takings.', to: null, if: () => !qAt('q_bar', 0), do() { Panels.open('shift'); } },
       { t: 'Lean on the bar for a minute.', to: null, do() { Player.mod({ patience: 4 }); G.minutes += 3; } }].concat(cab('playerDesk')));
  },
  stool() {
    insp('🛎️', 'A bar stool', 'Empty', ['Nobody here yet. When somebody wants serving, the bell rings.'],
      [
       { t: 'Wave somebody over.', to: null, if: () => Sky.working() && Levels.onSite(), do() { Combat.startCall(false); } },
       { t: 'Wipe it down.', to: null, do() { Player.xp(1); } }]);
  },
  taps() {
    insp('🍺', 'The taps', 'Island lager', ['Two taps: lager, and a second lager that Rafa insisted was different.'],
      [{ t: 'Pour yourself a small one.', to: null, if: () => evening(), do() { Player.mod({ patience: 10, energy: -4 }); } },
       { t: 'Not while you’re working.', to: null }]);
  },
  blender() { Blender.open(); },
  iceWell() {
    insp('🧊', 'The ice well', 'Full, for once', ['You put your hands in it. You put your face in it. Nobody saw. Probably.'],
      [{ t: 'Cool down.', to: null, do() { Player.mod({ patience: 5 }); } }]);
  },
  topShelf() {
    insp('🍾', 'The top shelf', 'Rafa’s collection', ['Rum from nine islands, a bottle of something with a snake in it, and a note: “NOT FOR SALE. NOT FOR MARI. — R.”']);
  },
  cocktailBoard() {
    insp('📋', 'The cocktail board', 'Chalked by Mari', RECIPES.map(r => ITEMS[r.out].e + ' ' + ITEMS[r.out].n + ' — ' + Blender.list(r)));
  },
  jukebox() {
    insp('🎵', 'The jukebox', 'One song works properly', ['It plays anything you like, as long as what you like is “Kokomo”.'],
      [
       { t: 'Put a record on for Luca’s set.', to: null, if: () => qAt('q_luca', 1), do() { Q.step('q_luca'); Player.xp(10); UI.toast('🎵', 'You pick something slow and warm. Luca, across the room, puts a hand on his heart.'); } },
       { t: 'Play “Kokomo”. Again.', to: null, do() { Player.mod({ patience: 3 }); } }]);
  },
  barTable() {
    insp('🍽️', 'A table', 'Sticky', ['Carved into the top: “M + ?” The second letter has been scratched out. Recently.']);
  },
  snug() {
    insp('🛋️', 'The snug', 'For two', ['A sofa built for two people, or one person and a very large cocktail.'],
      [{ t: 'Sit for a minute.', to: null, do() { Player.mod({ patience: 6 }); G.minutes += 4; } }]);
  },
  plant() { insp('🪴', 'A plant', 'Thriving', ['It is doing better than anything else in here. It is thriving on spilt rum.']); },
  photos() {
    insp('🖼️', 'Old photographs', 'Forty years of The Driftwood', [
      'Rafa with a marlin. Rafa with a film star. Rafa with a man in a suit, pointing at a dominoes board and laughing. The man in the suit is not laughing.',
      'And in the corner, a young Mari on her first day, scowling at the camera exactly as she scowls now.']);
  },
  darts() {
    insp('🎯', 'The dartboard', 'Well used', ['Somebody has pinned a Sterling Resorts brochure to the middle of it. It has been hit a lot.']);
  },
  telescope() {
    insp('🔭', 'The telescope', 'Pointed at the sea', [night() ? 'Stars, more of them than you knew there were. The whole Milky Way, sitting on the sea.' : 'You can see the next island, a sailing boat, and Kai falling off a surfboard in slow motion.'],
      [{ t: 'Look a while longer.', to: null, do() { Player.mod({ patience: 5 }); G.minutes += 5; } }]);
  },
  fairyLights() {
    insp('🏮', 'Fairy lights', 'A tangle', ['Four hundred little bulbs strung along the deck, half of them in a knot the size of a coconut.'],
      [{ t: 'Leave them.', to: null }].concat(cab('fairyLights')));
  },
  hammock() {
    insp('🛏️', 'The hammock', 'Swaying', ['Strung between two posts over the water. It is the most comfortable thing on the island and it knows it.'],
      [{ t: 'Lie in it for a bit.', to: null, do() { Player.mod({ patience: 18, energy: 6 }); G.minutes += 15; UI.toast('😌', 'The sea goes shhh. You go shhh. Fifteen minutes pass like five.'); } }]);
  },
  deckchair() {
    insp('🪑', 'A deckchair', 'Salt-bleached', ['Faded stripes, a view straight out to sea.'],
      [{ t: 'Sit and watch the sea.', to: null, do() { Player.mod({ patience: 6 }); G.minutes += 5; } }]);
  },
  rail() {
    insp('🌊', 'The deck rail', 'Over the water', [evening() ? 'The sun is sitting on the sea like a peach on a plate. Everybody on the deck has gone quiet.' : 'Turquoise all the way down. A shoal of tiny silver fish turns at once, like one thought.']);
  },
  djBooth() {
    insp('🎧', 'The DJ booth', 'Luca’s', ['Two decks, one of them held together with tape. A sticker says ONLY LUCA TOUCHES THIS. Somebody has added “(AND YOU)”.'],
      [{ t: 'Leave it.', to: null }].concat(cab('djBooth')));
  },

  /* ---- Home ---- */
  bed() {
    const m = G.minutes % 1440;
    insp('🛏️', 'Your bed', 'Linen, and sand in it', [
      'A big white bed under a mosquito net, the window open to the sound of the sea.',
      m >= 1200 || m < DAY_START ? 'It is late. You could sleep through till morning.' : 'It is the middle of the day. A nap is not out of the question.'],
      [
       { t: 'Sleep until morning.', to: null, if: () => m >= 1200 || m < DAY_START, do() {
      if (m >= DAY_START) Sky.newDay();
      G.minutes = DAY_START - 25;
      P.patience = P.patMax; P.energy = P.eneMax;
      UI.toast('🌙', 'You sleep like somebody with nothing to worry about. The sea does the rest.', 'gold');
      Save.auto && Save.auto();
    } },
       { t: 'Have a siesta.', to: null, if: () => !(m >= 1200 || m < DAY_START), do() { Player.mod({ patience: 20, energy: 20 }); G.minutes += 45; } },
       { t: 'Not yet.', to: null }]);
  },
  wardrobe() {
    insp('👙', 'The wardrobe', 'Mostly swimwear', ['Bikinis, trunks, one linen shirt for emergencies, and nothing warmer than a vest.'],
      [{ t: 'Change what you’re wearing.', to: null, do() { setTimeout(() => Look.open({ wardrobe: true }), 250); } },
       { t: 'Leave it.', to: null }]);
  },
  mirror() {
    insp('🪞', 'The mirror', 'Honest', [pick(['You look good. Tanned. Relaxed. Slightly dangerous.', 'You have tan lines now. Visible ones. You are weirdly proud.', 'Sun-bleached hair, salt on your skin. The island suits you.'])]);
  },
  shower() {
    insp('🚿', 'The outdoor shower', 'Under the sky', ['A shower head on a post behind a bamboo screen that covers slightly less than you would like.'],
      [{ t: 'Rinse off the salt.', to: null, do() { Player.mod({ patience: 10, energy: 12 }); G.minutes += 10; } }]);
  },
  hutFridge() {
    insp('🧊', 'The fridge', 'Humming', ['Coconut water, one lime, and a bottle of Rafa’s rum with a bow on it.'],
      [{ t: 'Take a coconut water.', to: null, if: () => !G.flags['fridge_' + G.day], do() { G.flags['fridge_' + G.day] = true; Item.give('coconutwater'); } }]);
  },
  ukulele() {
    insp('🎸', 'A ukulele', 'Four strings, three in tune', ['You play the only chord you know. It sounds like a holiday.'],
      [{ t: 'Play it again.', to: null, do() { Player.mod({ patience: 4 }); } }]);
  },
  rafaBox() {
    insp('📦', 'Uncle Rafa’s box', 'Taped shut, then opened', [
      'Photographs, a dominoes set, a deed to “the bar, the beach, and the cove (don’t let them take the cove)”, and a straw hat.',
      Q.complete2('q_garden') ? 'The hat is on your head now. It suits you.' : 'Under the hat, a note: “Grow something. Then you can wear this.”']);
  },

  /* ---- Mama Coco's ---- */
  marketTill() {
    insp('💰', 'The till', 'Mama Coco’s', ['A till, a bowl of mints, and a sign: CREDIT IS FOR PEOPLE WHO HAVE DIED.'],
      [{ t: 'Buy something.', to: null, do() { Shop.open('coco'); } }, { t: 'Leave it.', to: null }]);
  },
  seedRack() {
    insp('🌱', 'The seed rack', 'Everything grows here', ['Mint, lime, strawberries, mangoes, pineapples and one very ambitious coconut, each with a handwritten growing time.'],
      [{ t: 'Buy some seeds.', to: null, do() { Shop.open('coco'); } }, { t: 'Just looking.', to: null }]);
  },
  shelves() { insp('🧴', 'Sun cream and sundries', 'Stocked', ['Factor 50, factor 30, a factor 4 that should be illegal, flip-flops, and a single snorkel.']); },
  fruitCrates() { insp('🍉', 'Fruit crates', 'Off this morning’s boat', ['The smell is incredible. Mango, guava, something you do not have a name for.']); },
  flowerBucket() {
    insp('🌺', 'A flower bucket', 'For behind the ear', ['Hibiscus, a euro each. “Left ear, taken. Right ear, available,” says a sign. “Both ears, complicated.”'],
      [{ t: 'Buy one.', to: null, do() { Shop.open('coco'); } }]);
  },

  /* ---- The Promenade and the beach ---- */
  barSign() {
    insp('🪧', 'The Driftwood', 'Under new management', ['A hand-painted sign: THE DRIFTWOOD — COCKTAILS · SUNSETS · BAD DECISIONS. Somebody has added “UNDER NEW MANAGEMENT” in lipstick.']);
  },
  tikiTorch() { insp('🏮', 'A tiki torch', evening() ? 'Lit' : 'Unlit', [evening() ? 'Flickering orange against the blue of the evening.' : 'Waiting for sunset.']); },
  busStop() {
    insp('🚏', 'The shuttle stop', 'Every twenty minutes, allegedly', ['A timetable that says “WHEN IT COMES” and a bench with a view of the sea.']);
  },
  theBus() { insp('🚌', 'The island shuttle', 'Not stopping', ['A purple minibus going round the island with the music too loud. It does not stop. It never stops.']); },
  buggy(car) {
    insp('🚙', 'Your beach buggy', 'Keys in it', ['Orange, doorless, and smelling of coconut. A bumper sticker says HONK IF YOU’RE SUNBURNT.'],
      [{ t: 'Drive it.', to: null, do() { Cars.take(car); } }, { t: 'Leave it.', to: null }]);
  },
  streetLamp() { insp('💡', 'A street light', 'Wrapped in bougainvillea', ['It comes on at sunset, and the moths are already waiting.']); },
  palm() {
    insp('🌴', 'A palm', 'Tall', [pick(['A coconut palm, leaning towards the sea the way they all do.', 'There is a coconut directly above your head. You move.', 'Somebody has carved two initials and a heart into the trunk.'])],
      [{ t: 'Shake it for a coconut.', to: null, if: () => !G.flags['palm_' + G.day] && chance(.5), do() { G.flags['palm_' + G.day] = true; Item.give('coconut'); } }]);
  },
  tree() { insp('🌳', 'A tree', 'Jungle', ['Something bright green and very loud lives in it.']); },
  parasol() {
    insp('⛱️', 'A parasol', 'Somebody’s', ['A towel, a paperback with a steamy cover, and a bottle of tanning oil. Its owner is in the sea.']);
  },
  lounger() {
    insp('🩴', 'A sun lounger', 'Free', ['Warm from the sun. The best seat on the island that is not a hammock.'],
      [{ t: 'Lie in the sun.', to: null, do() {
        if (!Item.has('suncream') && chance(.4)) { Player.mod({ patience: 6, energy: -6 }); UI.toast('🥵', 'You forgot sun cream. You now have a very specific tan line.'); }
        else Player.mod({ patience: 14 });
        G.minutes += 20;
      } }]);
  },
  surfShack() {
    insp('🏄', 'The surf shack', 'Kai’s', ['Boards stacked against a wall of shells. A water pistol hangs on a nail: FOR EMERGENCIES. The emergencies are clearly frequent.'],
      [
       { t: 'Grab a board.', to: null, if: () => qAt('q_kai', 0), do() { Q.step('q_kai'); Player.xp(10); UI.toast('🏄', 'You fall off eleven times. The twelfth time you stand up for a whole second. Kai whoops.'); } },
       { t: 'Take the water pistol.', to: null, if: () => !Item.has('soaker'), do() { Item.give('soaker'); } },
       { t: 'Leave it.', to: null }]);
  },
  lifeguardTower() {
    insp('🛟', 'The lifeguard tower', 'Jade’s', ['A red flag, a whistle on a hook, and a pair of binoculars pointing suspiciously at the Driftwood deck.']);
  },
  volleyball() {
    insp('🏐', 'The volleyball net', 'Game on', ['A game of beach volleyball that has been going on, apparently, since last Tuesday.'],
      [{ t: 'Join in for a game.', to: null, do() { Player.mod({ energy: -12, patience: 8 }); Player.xp(5); G.minutes += 15; UI.toast('🏐', pick(['You spike it. Everybody cheers. You will never be able to do it again.', 'You dive, miss, and get a mouthful of sand. Somebody helps you up. Somebody cute.'])); } }]);
  },
  sandcastle() { insp('🏰', 'A sandcastle', 'Moated', ['Four towers, a moat and a flag made from an ice-lolly stick. The tide is coming for it.']); },
  firePit() {
    insp('🔥', 'The fire pit', evening() ? 'Crackling' : 'Cold', [evening() ? 'Driftwood, a circle of stones, and somebody playing a guitar badly and beautifully.' : 'Ash, and a lot of footprints. There was a party here last night.'],
      [{ t: 'Sit by the fire.', to: null, if: evening, do() { Player.mod({ patience: 12 }); G.minutes += 15; } }]);
  },

  /* ---- Inside the loop ---- */
  plot(o) { Garden.act(o); },
  waterButt() { insp('🛢️', 'The water butt', 'Full of rain', ['Rafa rigged it to the gutters. On this island the rain comes when the plants need it. Mostly.']); },
  scarecrow() { insp('🧑‍🌾', 'The scarecrow', 'Wearing a Hawaiian shirt', ['It is wearing Rafa’s best shirt and a pair of sunglasses. The birds are not scared. The birds think it is cool.']); },
  fountain() {
    insp('⛲', 'The fountain', 'Wishing', ['Full of coins and one flip-flop.'],
      [{ t: 'Throw in a coin and make a wish.', to: null, if: () => P.money >= 1, do() { Player.mod({ money: -1, patience: 5 }); UI.toast('✨', 'You wish for something. You are not telling anyone what.'); } }]);
  },
  bench() { insp('🪑', 'A bench', 'In the shade', ['A good place to sit and watch the island go by.'], [{ t: 'Sit a while.', to: null, do() { Player.mod({ patience: 4 }); G.minutes += 5; } }]); },
  flowers() { insp('🌺', 'Flowers', 'Blooming', ['Bougainvillea, frangipani and something that smells like it is flirting with you.']); },
  fruitStall() {
    insp('🍉', 'The fruit stall', 'Honesty box', ['Fruit, a price list and a tin. When you do not have time to grow it.'],
      [{ t: 'Buy some fruit.', to: null, do() { Shop.open('fruit'); } }, { t: 'Leave it.', to: null }]);
  },
  iceCream() {
    insp('🍦', 'The ice-cream cart', 'One flavour', ['Coconut. Only coconut. It is the right answer.'],
      [{ t: 'Buy one.', to: null, do() { Shop.open('icecream'); } }, { t: 'Leave it.', to: null }]);
  },
  noticeboard() {
    insp('📋', 'The island noticeboard', 'Pinned', [
      'LOST: one sandal, left. FOUND: one sandal, right.',
      'YOGA WITH LUCA — the deck, 11 till 12, “all bodies welcome, especially yours”.',
      'STERLING RESORTS — “A NEW VISION FOR ISLA SOLANA”. Somebody has drawn a moustache on the artist’s impression.']);
  },
  yogaMats() {
    const m = G.minutes % 1440;
    insp('🧘', 'The yoga mats', m >= 660 && m < 720 ? 'Class in session' : 'Rolled up', [m >= 660 && m < 720 ? 'Luca is walking between the mats adjusting people’s hips, very professionally, mostly.' : 'Class is eleven till twelve. The mats smell of coconut oil.'],
      [{ t: 'Join the class.', to: null, if: () => m >= 660 && m < 720, do() {
        Player.mod({ patience: 15, energy: 8 }); G.minutes += 20;
        if (qAt('q_luca', 0)) { Q.step('q_luca'); UI.toast('🧘', 'Downward dog. Luca adjusts you. You forget how to breathe, which rather defeats the point.'); }
      } },
       { t: 'Do a sun salutation on your own.', to: null, if: () => !(m >= 660 && m < 720), do() { Player.mod({ patience: 8 }); G.minutes += 5; if (qAt('q_luca', 0)) UI.toast('🧘', 'Luca’s class is eleven till twelve, on this deck.'); } }]);
  },
  chimes() { insp('🎋', 'Wind chimes', 'Tinkling', ['Bamboo and shells. They play the breeze.']); },

  /* ---- The jetty ---- */
  supplyBoat() {
    insp('⛵', 'The supply boat', 'The “Marisol II”', ['Captain Teo’s boat, named after somebody he will not talk about. It brought you here, and it takes the island’s orders to the others.'],
      [{ t: 'Check the orders.', to: null, do() { Orders.open(); } }, { t: 'Leave it.', to: null }]);
  },
  orderBoard() { Orders.open(); },
  suitcase() {
    insp('🧳', 'Your suitcase', 'Heavy', ['Everything you own, most of it unsuitable for thirty-one degrees.'],
      [{ t: 'Leave it for Teo to bring up.', to: null }]);
  },

  /* ---- Secret places ---- */
  coveLantern() {
    if (Dates.lantern()) return;
    insp('🏮', 'The cove lantern', evening() ? 'Glowing' : 'Waiting', [
      evening() ? 'The lantern throws a soft gold circle on the sand. It is very obviously built for two.' : 'An old ship’s lantern on a post, the glass polished by a lot of hands.',
      'Pepe says two people light it together. Pepe says a lot of things.']);
  },
  picnic() { insp('🧺', 'A picnic blanket', 'Left out', ['Two glasses, one bottle, and a lot of sand. Somebody had a nice time.']); },
  divingRock() {
    insp('🪨', 'The diving rock', 'Over the lagoon', [night() ? 'Moonlight on still water. Not a soul around.' : 'Clear green water, ten feet deep. You can see every pebble on the bottom.'],
      [
       { t: 'Dive in.', to: null, if: () => !night(), do() { Player.mod({ patience: 20, energy: 10 }); G.minutes += 20; UI.toast('💦', 'Cold, clear, perfect. You float on your back and watch the parrots.'); } },
       { t: 'Go for a moonlit swim. Nobody’s looking.', to: null, if: night, do() { Player.mod({ patience: 30, energy: 10 }); G.minutes += 20; Ach.get('a_dip'); UI.toast('🌙', 'The water is warm as a bath. You leave your swimsuit on the rock. The fish are very discreet.', 'gold'); } }]);
  },
};
