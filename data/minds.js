'use strict';
/* HOW THE ISLANDERS FEEL, and what they do about it.
 *
 * The engine half is engine/mind.js. This file is the half that makes Mari
 * Mari: what each person needs, what they love, who they cannot stand, and
 * what they say when the day is going well or badly — all in their own voice,
 * because a needs meter is only a spreadsheet until somebody complains about
 * it in character.
 *
 * Kept out of data/npcs.js on purpose. That file is a person's day and their
 * dialogue tree; this is their temperament, it is read by nothing but the
 * mind, and a person without an entry here still has needs and moods — just
 * nobody's in particular.
 *
 *   MIND_NEEDS     the five every islander has. `decay` is points lost per
 *                  game hour; the fifth, `passion`, is named per person below.
 *   MIND_SPOTS     what standing at each waypoint does for a person, in points
 *                  a real second. `desk` is their own spot, `out` is an `out:`
 *                  window, `home` is asleep.
 *   MIND_THOUGHTS  the things that happen to people, and how much they mind.
 *                  `mins` is how long it stays with them, in game minutes;
 *                  `stack` is how many of the same one can pile up.
 *   MINDS          the people. Everything in an entry is optional.
 *
 *     base      how sunny they are to begin with, in mood points
 *     works     false for somebody with nowhere to be (a regular, a guest)
 *     passion   { n, e, at: [spots], decay, chat } — their own fifth need.
 *               `chat` means talking feeds it (gossip, networking)
 *     weights   how much each need counts towards their mood
 *     rates     how fast each need runs down, as a multiplier
 *     spots     how much they like each waypoint, as a multiplier
 *     post      what their own spot does for them, if anything: a shop full
 *               of juice is not a shift behind a bar
 *     likes     opinion of the others to start from, -100..100
 *     thoughts  their own value for a thought: { rained: -1 } for a surfer
 *     named     their own label for one: { soaked: 'Water fight!' }
 *     words     what they call their mood, best to worst
 *     lines     what they say, by state: great, low, energy, thirst, fun,
 *               social, passion, inspired, moment
 *     moment    what they do when it all gets too much: { at, n, lines }
 *     flirt     how a flirt lands when they are glowing, or not in the mood
 */

const MIND_NEEDS = {
  energy:  { n: 'Energy',      e: '💤', decay: 4.5, low: 'Tired' },
  thirst:  { n: 'Refreshment', e: '🥤', decay: 13,  low: 'Thirsty' },
  fun:     { n: 'Fun',         e: '🎈', decay: 9,   low: 'Bored' },
  social:  { n: 'Company',     e: '💬', decay: 8,   low: 'Lonely' },
  passion: { n: 'Passion',     e: '✨', decay: 8,   low: 'Restless' }
};

const MIND_SPOTS = {
  /* The Driftwood. */
  jukebox:  { fun: 5 },
  deck:     { fun: 3, social: 2.5, energy: .6 },
  rail:     { fun: 3.5, energy: .5 },
  barTable: { thirst: 7, social: 3 },
  hammock:  { energy: 6, fun: 1 },
  /* Isla Solana. */
  fountain: { social: 4, fun: 1.5 },
  garden:   { fun: 2, energy: 2 },
  yoga:     { energy: 4, fun: 1.5 },
  sands:    { fun: 4.5, energy: .8 },
  jetty:    { fun: 2, energy: 1.5 },
  cove:     { fun: 3.5, energy: 2 },
  lagoon:   { fun: 6, energy: 1.5 },
  surfshack:{ fun: 3, social: 1.5 },
  stall:    { thirst: 7, social: 1.5 },
  /* Mama Coco's. */
  till:     { social: 1 },
  /* Not waypoints: where somebody is when they are not at one. A desk does
     nothing for you by itself — working is a faster run-down, not a spot, see
     MIND_WORK — unless it is where your passion lives. */
  desk:     {},
  out:      { fun: 3, social: 2, energy: .5 },
  home:     { energy: 9, thirst: 2, fun: 1, social: .3 }
};

/* What a shift at your post costs, as a multiplier on how fast each need runs
   down. Nobody has ever come off a shift behind a bar less tired. */
const MIND_WORK = { energy: 1.4, fun: 1.25, thirst: 1.15 };

/* What each spot is called in a sentence — "Heading to the jukebox". */
const MIND_SPOT_NAMES = {
  jukebox: 'the jukebox', deck: 'the deck', rail: 'the rail', barTable: 'the corner table',
  hammock: 'the hammock', fountain: 'the plaza fountain', garden: 'the garden', yoga: 'the yoga deck',
  sands: 'Honeymoon Sands', jetty: 'the jetty', cove: 'Lovers’ Cove', lagoon: 'the lagoon',
  surfshack: 'the surf shack', stall: 'the drinks stall', till: 'the till'
};

/* Where the weather can reach somebody: anywhere on the island, and the parts
   of the Driftwood that are a deck rather than a roof. */
const MIND_OUTDOORS = { levels: ['island'], spots: ['deck', 'rail', 'hammock'] };

const MIND_THOUGHTS = {
  sunshine: { n: 'Sunshine on their face',   v: 3,  mins: 60 },
  rained:   { n: 'Caught in the rain',       v: -6, mins: 90 },
  sunset:   { n: 'Watched the sun go down',  v: 7,  mins: 120 },
  chat:     { n: 'Good chat with {who}',     v: 3,  mins: 180, stack: 3 },
  rival:    { n: 'Had to put up with {who}', v: -5, mins: 120, stack: 2 },
  friend:   { n: 'Time with {who}',          v: 4,  mins: 120 },
  talked:   { n: 'Chatted with {you}',       v: 2,  mins: 120 },
  flirted:  { n: '{you} flirted with them',  v: 8,  mins: 360 },
  gift:     { n: 'A drink from {you}',       v: 10, mins: 480 },
  date:     { n: 'A date with {you} tonight', v: 14, mins: 900 },
  soaked:   { n: 'Soaked by {you}',          v: -8, mins: 120, stack: 3 },
  moment:   { n: 'Got it out of their system', v: 12, mins: 240 },
  inspired: { n: 'Feeling on top of the world', v: 6, mins: 180 }
};

const MINDS = {
  mari: {
    base: 2,
    passion: { n: 'Hustle', e: '🍸', at: ['desk'], decay: 10 },
    weights: { passion: 1.4, social: .7 },
    rates: { thirst: .8 },
    spots: { barTable: 1.2, hammock: .6 },
    likes: { pepe: 35, luca: 12, sienna: -18, blake: -55, coco: 25 },
    thoughts: { rained: -2 },
    words: ['On fire', 'In the zone', 'Fine', 'Frayed', 'Done with everyone'],
    lines: {
      great: ['Look at this place. LOOK at it.', 'Tonight? Tonight is a good night.', 'Somebody order something complicated. I dare you.'],
      low: ['Nobody talk to me until I’ve had a lime.', 'If one more person asks for a Sex on the Beach…', 'Six years. SIX.'],
      energy: ['My feet have filed a complaint.', 'I could sleep standing up. I have.'],
      thirst: ['I pour drinks all day and I haven’t had a water since ten.'],
      fun: ['I need a song. A loud one.'],
      social: ['Pepe. Where’s Pepe. I need to be insulted.'],
      passion: ['Too quiet. Why is it quiet. I don’t like quiet.', 'Somebody ring a bell. Any bell.'],
      inspired: ['Watch this.', 'Three cocktails, one hand. Don’t clap. Okay, clap.'],
      moment: ['This table is FINE. It is a FINE table.', 'I am polishing. Do not interrupt the polishing.']
    },
    moment: { at: 'barTable', n: 'Stress-polishing a clean table' },
    flirt: {
      great: ['“Oh, you’re good today.” She leans over the bar, close. “Keep going.”'],
      low: ['“Not now, gorgeous. Ask me again when the ice machine works.” She almost smiles.']
    }
  },

  kai: {
    base: 8,
    passion: { n: 'Stoke', e: '🏄', at: ['sands', 'surfshack', 'desk', 'lagoon'], decay: 11 },
    weights: { passion: 1.3, fun: 1.2, energy: .7 },
    rates: { energy: .8, fun: 1.2 },
    spots: { sands: 1.5, lagoon: 1.4, fountain: .8 },
    likes: { jade: 40, luca: 20, teo: 15, blake: -30 },
    thoughts: { rained: 1, soaked: 5 },
    named: { rained: 'Rain! Waves incoming', soaked: 'Water fight with {you}!' },
    words: ['Stoked', 'Chill', 'Meh', 'Bummed', 'Wiped out'],
    lines: {
      great: ['Best. Day. Ever. Again.', 'Everything is a wave if you think about it.', 'I love everyone. Even the crabs.'],
      low: ['The sea’s flat and so am I.', 'Bummer, dude. Big bummer.'],
      energy: ['Eyes closing. Like a sea cucumber.', 'Gonna nap in the sand. Wake me for sunset.'],
      thirst: ['I would kill for a coconut. Not a real coconut. A drink one.'],
      fun: ['Nobody’s surfing. Why is nobody surfing?'],
      social: ['Where is everyone? Where’s Jade?'],
      passion: ['I need to be in the water. Like, now.', 'My board misses me. I can feel it.'],
      inspired: ['I’m going to learn to surf BACKWARDS.', 'Today I am one with the ocean.'],
      moment: ['Just gonna look at the sea for a bit, bro.', 'The sea gets it. The sea always gets it.']
    },
    moment: { at: 'sands', n: 'Staring at the sea' },
    flirt: {
      great: ['He goes bright red, laughs, and pushes his wet hair back. “Dude. DUDE. You can’t just say that.” He definitely wants you to.'],
      low: ['He manages half a grin. “Sorry. Bit wiped out. Say it again tomorrow? I want to enjoy it.”']
    }
  },

  jade: {
    base: 0,
    passion: { n: 'Sun', e: '☀️', at: ['desk', 'sands', 'cove'], decay: 9 },
    weights: { passion: 1.1, social: .6, energy: 1.2 },
    rates: { social: .7 },
    spots: { cove: 1.4, fountain: 1.1, lagoon: .7 },
    likes: { kai: 25, teo: 20, coco: 15, blake: -40 },
    thoughts: { sunshine: 6, rained: -9, soaked: -12 },
    named: { soaked: 'Squirted by {you}. On DUTY.' },
    words: ['Radiant', 'Easy', 'On watch', 'Salty', 'Off duty in her head'],
    lines: {
      great: ['Not one drowning today. Personal best.', 'Sun’s out. So am I.', 'I could do this job forever. Don’t tell anyone.'],
      low: ['Rescue me from this day.', 'I’m blowing this whistle at the next person who talks to me.'],
      energy: ['Squinting is a workout, you know.', 'I’d sell my whistle for a hammock.'],
      thirst: ['Water, water everywhere. None of it cold and in a glass.'],
      fun: ['Seen this beach. All of it. Twice.'],
      social: ['Just me and the gulls again.'],
      passion: ['Where’s the sun gone? I had plans for that sun.'],
      inspired: ['I could swim to San Tomás. Watch me.', 'Flags look straighter today. That’s me.'],
      moment: ['Nobody talk to me. I’m on a break from people.', 'Off duty. Mentally. Physically in about ten minutes.']
    },
    moment: { at: 'cove', n: 'Taking a break from people' },
    flirt: {
      great: ['She pulls her sunglasses down, holds your eye, and does not look away first. “Mm. Keep that up and I’ll stop pretending not to notice.”'],
      low: ['“Save it for when I’m not having a day.” She taps your nose with her whistle. “But I heard it.”']
    }
  },

  luca: {
    base: 5,
    passion: { n: 'Groove', e: '🎶', at: ['desk', 'jukebox', 'yoga', 'out'], decay: 10 },
    weights: { passion: 1.3, social: 1.1 },
    rates: { social: 1.2, energy: .9 },
    spots: { jukebox: 1.6, deck: 1.2, hammock: 1.1 },
    likes: { kai: 20, mari: 15, sienna: 10, pepe: 20, blake: -20 },
    thoughts: { sunset: 10, rained: -4 },
    named: { sunset: 'The sky did a sunset, just for him' },
    words: ['Magnifico', 'Molto bene', 'Così così', 'Malinconico', 'Tragedia'],
    lines: {
      great: ['Everything is music today. Even the till.', 'Bellissimo. All of it. All of you.'],
      low: ['Only sad songs now. Only the saddest.', 'Even the jukebox is against me.'],
      energy: ['I need a siesta. A long one. An Italian one.'],
      thirst: ['A spritz. My kingdom for a spritz.'],
      fun: ['Where is the party? I AM the party. Where am I?'],
      social: ['Nobody to dance with. A tragedy in three acts.'],
      passion: ['My fingers need the decks. They are twitching.', 'Too long without a beat. I am wilting.'],
      inspired: ['Tonight I play something the island will never forget.', 'I have written a song about the sea. It is the sea.'],
      moment: ['Leave me with the music. It understands.', 'One more sad song. Then I will be brave.']
    },
    moment: { at: 'jukebox', n: 'Sad songs on the jukebox' },
    flirt: {
      great: ['He takes both your hands and dances you three steps backwards and three forwards. “You see? We are already in rhythm.”'],
      low: ['He sighs dramatically and presses your hand to his heart. “Tonight it is broken. Tomorrow — who knows.”']
    }
  },

  coco: {
    base: 6,
    works: true,
    passion: { n: 'Gossip', e: '👂', at: [], decay: 7, chat: true },
    weights: { passion: 1.5, social: 1.2, fun: .5 },
    rates: { energy: .8, social: 1.1 },
    likes: { mari: 30, jade: 20, kai: 15, pepe: 25, blake: -70, sienna: -10 },
    /* A shop full of juice, a radio, a chair nobody else is allowed in, and a
       trickle of customers — not quite enough gossip to live on. */
    post: { thirst: 2.5, fun: 1.2, energy: .8, passion: .2 },
    words: ['Delighted', 'Content', 'Watching', 'Unimpressed', 'Writing names down'],
    lines: {
      great: ['I have heard SUCH a thing today. Sit down.', 'Mm-hm. Mm-HM.'],
      low: ['Nobody tells me anything any more.', 'I am writing this down. All of it.'],
      energy: ['These old legs. Sit, sit.'],
      thirst: ['Pass me that juice, sweetheart. No, the good one.'],
      fun: ['Same faces, same faces.'],
      social: ['Nobody has been in all morning. Not ONE.'],
      passion: ['Something is happening on this island and I don’t know what. I don’t LIKE it.', 'Tell me something. Anything. Who’s kissing who?'],
      inspired: ['I know everything. EVERYTHING.'],
      moment: ['Mm. MM. I am writing this down.']
    },
    moment: { at: 'desk', n: 'Writing names in a little book' },
    flirt: {}
  },

  teo: {
    base: 4,
    passion: { n: 'Sea air', e: '⚓', at: ['desk', 'jetty'], decay: 6 },
    weights: { passion: 1.2, social: .5, fun: .6 },
    rates: { social: .6, fun: .7 },
    spots: { jetty: 1.8, stall: 1.2 },
    likes: { kai: 15, jade: 20, coco: 20, blake: -35 },
    /* The boat. There is rum on the boat. */
    post: { thirst: 1.2, fun: .6 },
    thoughts: { rained: 0 },
    named: { rained: 'Rain. Just weather.' },
    words: ['Shipshape', 'Steady', 'Hrm', 'Stormy', 'Taking on water'],
    lines: {
      great: ['Good tide. Good day.', 'Seen worse. Much worse. This is good.'],
      low: ['Hrm.', 'Should have stayed at sea.'],
      energy: ['Old bones. Old boat. Both need a sit.'],
      thirst: ['Rum. Or water. Mostly rum.'],
      fun: ['Knot practice. Again.'],
      social: ['Quiet on the jetty.'],
      passion: ['Too long on land. Makes a man soft.'],
      inspired: ['Might paint the boat. Might even name her.'],
      moment: ['Hrm. Hrm hrm.', 'The sea never lies. People do.']
    },
    moment: { at: 'jetty', n: 'Glaring at the horizon' },
    flirt: {}
  },

  pepe: {
    base: 10,
    works: false,
    passion: { n: 'Rum', e: '🥃', at: ['desk', 'barTable'], decay: 9 },
    weights: { passion: 1.2, thirst: 1.2, energy: .6 },
    rates: { thirst: 1.3, energy: 1.2, fun: .7 },
    spots: { barTable: 1.6, deck: 1.3, hammock: 1.4 },
    likes: { mari: 40, luca: 15, coco: 30, sienna: 25, blake: -25 },
    thoughts: { soaked: -2 },
    named: { soaked: 'Youngsters. Squirting. In MY day…' },
    words: ['Magnificent', 'Merry', 'Hm?', 'Grumbling', 'Sulking into his glass'],
    lines: {
      great: ['In 1974 it was like this every day.', 'I feel sixty again!'],
      low: ['In my day the rum was cheaper and the young were politer.', 'Hm. Hmph. Hm.'],
      energy: ['I will rest my eyes. Only my eyes.', 'Zzz — what? I was listening.'],
      thirst: ['Another, please. Or the first one. I forget.', 'My glass is empty. Look at it. Tragic.'],
      fun: ['Dominoes. Does nobody play dominoes any more?'],
      social: ['Nobody to tell about 1974.'],
      passion: ['A little rum for an old man?'],
      inspired: ['I shall dance! Somebody catch me!', 'Tonight I tell THE story. The whole story.'],
      moment: ['Another. No — the bottle.', 'Nobody listens to Pepe.']
    },
    moment: { at: 'barTable', n: 'Sulking into a rum' },
    flirt: {}
  },

  sienna: {
    base: -2,
    works: false,
    passion: { n: 'Content', e: '📸', at: ['rail', 'deck', 'out'], decay: 14 },
    weights: { passion: 1.6, social: .8, energy: .8 },
    rates: { fun: 1.3, thirst: 1.1 },
    spots: { rail: 1.6, deck: 1.3, barTable: .7 },
    likes: { luca: 15, mari: -5, pepe: 5, blake: 10 },
    thoughts: { sunset: 12, rained: -12, soaked: -15, sunshine: 5 },
    named: { sunset: 'Golden hour. Posted it.', soaked: 'Soaked by {you}. The HAIR.' },
    words: ['Trending', 'Glowing', 'Filtered', 'Ratioed', 'Deleting the app'],
    lines: {
      great: ['The engagement on this. THE ENGAGEMENT.', 'Okay, this island is… actually cute.'],
      low: ['Ugh. The light. The LIGHT.', 'Three likes. THREE.'],
      energy: ['I need a nap and a ring light.'],
      thirst: ['Is there oat milk? For the mojito?'],
      fun: ['I’ve photographed this sea from every angle. It has one angle.'],
      social: ['Nobody’s here. What’s the point of being here.'],
      passion: ['I haven’t posted in an HOUR.', 'Content. I need content.'],
      inspired: ['This is going viral. I can feel it.', 'Hold still. No — be natural. No — less natural.'],
      moment: ['Deleting the app. For real this time.', 'Don’t look at me. Don’t film me.']
    },
    moment: { at: 'rail', n: 'Doom-scrolling at the rail' },
    flirt: {}
  },

  blake: {
    base: -4,
    works: false,
    passion: { n: 'Deals', e: '💼', at: ['desk'], decay: 12, chat: true },
    weights: { passion: 1.4, social: .9, energy: 1.1 },
    rates: { thirst: 1.5, energy: 1.2 },
    spots: { fountain: 1.3, stall: 1.4, jetty: .6 },
    likes: { sienna: 20, teo: -5, kai: -20, coco: -30, jade: -10 },
    thoughts: { sunshine: -4, rained: 3, soaked: -18 },
    named: { sunshine: 'The HEAT', rained: 'Finally, some weather', soaked: 'Soaked by {you}. It is LINEN.' },
    words: ['Closing', 'Leveraged', 'Circling', 'Sweating', 'Liquidating'],
    lines: {
      great: ['Everything has a price. Today, everything is on sale.', 'I can smell a deal. Also the sea. Mostly the deal.'],
      low: ['This heat is a hostile takeover.', 'Nobody on this island respects a term sheet.'],
      energy: ['Jet lag. Sun lag. Island lag.'],
      thirst: ['Is there anything COLD on this island?', 'Sparkling water. Any sparkling water.'],
      fun: ['What do people DO here?'],
      social: ['My people aren’t calling my people.'],
      passion: ['I haven’t closed anything in hours. I’m withering.'],
      inspired: ['I have a vision. Glass. Chrome. Valet. Destiny.'],
      moment: ['Sell. Sell everything.', 'I need a board meeting. With anyone.']
    },
    moment: { at: 'fountain', n: 'Pacing and making calls' },
    flirt: {}
  }
};
