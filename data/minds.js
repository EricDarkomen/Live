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
 *     skill     the skill their passion trains while they are at it
 *     skills    where their skills start, as levels 0..10
 *     talent    how quickly each skill comes to them, as a multiplier
 *     routines  things they do in several steps — see ROUTINES below
 *     teach     what happens when you ask them to show you how they do it
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
  /* Rosie's truck is a drink and a chat; the end of the jetty and the cove
     rocks are somewhere to sit and look at the sea. */
  truck:    { thirst: 5, social: 3 },
  pier:     { fun: 3, energy: 1.5 },
  reef:     { fun: 4, energy: 1 },
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
  surfshack: 'the surf shack', stall: 'the drinks stall', till: 'the till',
  truck: 'Rosie’s taco truck', pier: 'the end of the jetty', reef: 'the reef rocks'
};

/* Where the weather can reach somebody: anywhere on the island, and the parts
   of the Driftwood that are a deck rather than a roof. */
const MIND_OUTDOORS = { levels: ['island'], spots: ['deck', 'rail', 'hammock'] };

/* SKILLS. Everybody has every skill; most of them are nought. A level is
   15 × level² experience, so the first few come in a day and the last few
   take a week. They come from doing things — a routine step names what it
   trains — from chatting, from time spent on their passion, and from you
   (see `practise` in data/npcs.js). A level makes them quicker at every step
   that trains it, and some routines only open once a skill is high enough. */
const MIND_SKILLS = {
  mixology:     { n: 'Mixology',   e: '🍹' },
  surfing:      { n: 'Surfing',    e: '🏄' },
  lifesaving:   { n: 'Lifesaving', e: '🛟' },
  music:        { n: 'Music',      e: '🎶' },
  charm:        { n: 'Charm',      e: '💋' },
  fitness:      { n: 'Fitness',    e: '💪' },
  business:     { n: 'Business',   e: '💼' },
  gossip:       { n: 'Gossip',     e: '👂' },
  seamanship:   { n: 'Seamanship', e: '⚓' },
  storytelling: { n: 'Stories',    e: '📖' },
  content:      { n: 'Content',    e: '📸' },
  fishing:      { n: 'Fishing',    e: '🎣' },
  science:      { n: 'Science',    e: '🔬' },
  cooking:      { n: 'Cooking',    e: '🌮' }
};

/* ROUTINES. A routine is a list of steps done in order:

     { go, secs, n, say, train }   a waypoint (or 'desk'), how long to spend
                                   there in real seconds, what they are doing
                                   in a phrase, what they say on arrival, and
                                   what it trains: { skill: experience }

     { act }                       and something the step DOES to the world
                                   when it is finished: a name in NPC_ACTS
                                   (data/farm.js)

   and around the steps, when it happens and what it is for:

     duty    it is work, and outranks a timetabled break — they cut a coffee
             short to open up. Duties happen once a day, started inside `at`
     at      [from, to] game minutes: the window a duty may start in
     every   game minutes before a leisure routine can come round again
     when    { mood, from, to, dry, rain } — conditions for starting at all
     unlock  { skill: level } — they have to have grown into it
     gives   need points on finishing, like a spot but all at once
     done    what they tell themselves afterwards (a thought, and the life log)
     onUnlock, onDone
             what it means to the story when they grow into it, and when it
             is done — Tito's first set moves his job along

   A routine interrupted by something urgent — a need gone critical — is
   picked up again at the step it stopped on. */
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
  inspired: { n: 'Feeling on top of the world', v: 6, mins: 180 },
  routine:  { n: '{what}',                   v: 4,  mins: 240, stack: 3 },
  late:     { n: 'Late for {what}',          v: -4, mins: 180, stack: 2 },
  levelup:  { n: 'Got better at {what}',     v: 7,  mins: 480, stack: 2 },
  practise: { n: 'Practised with {you}',     v: 6,  mins: 480 },
  stocked:  { n: 'A full fridge to open with', v: 5, mins: 480 },
  nostock:  { n: 'Opened up to an empty fridge', v: -6, mins: 480 },
  tacos:    { n: 'One of Rosie’s tacos',     v: 4,  mins: 240 }
};

const MINDS = {
  mari: {
    base: 2,
    passion: { n: 'Hustle', e: '🍸', at: ['desk'], decay: 10 },
    weights: { passion: 1.4, social: .7 },
    rates: { thirst: .8 },
    spots: { barTable: 1.2, hammock: .6 },
    likes: { pepe: 35, luca: 12, sienna: -18, blake: -55, coco: 25, rosie: 30, val: 20 },
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
    skill: 'mixology',
    teach: ['She hands you a shaker. “Wrist, not arm. WRIST.” Ten minutes later there is mojito on the ceiling and she is laughing so hard she has to sit down. She is also, somehow, faster than she was this morning.',
      '“Watch.” She flips a bottle, catches it behind her back, and pours without looking. “Now you.” You do not. “Again.” By the end, you both have.'],
    skills: { mixology: 5, charm: 3, fitness: 2, music: 1 },
    talent: { mixology: 1.2, charm: 1.1 },
    routines: [
      { id: 'openUp', n: 'Opening up', duty: true, at: [640, 700], done: 'Opened up on time',
        steps: [
          { go: 'jukebox', secs: 5, n: 'putting something on the jukebox', say: 'Something with a pulse. Not that.', train: { music: 3 } },
          { go: 'deck', secs: 7, n: 'wiping down the deck', say: 'Wipe, wipe, wipe. Who SITS like that.', train: { fitness: 4 } },
          { go: 'barTable', secs: 6, n: 'setting out the tables', train: { fitness: 2, mixology: 2 } },
          /* `act` runs when the step is done: she stocks the bar from your
             fridge — see NPC_ACTS in data/farm.js. */
          { go: 'desk', secs: 5, n: 'stocking the bar from the fridge', act: 'stockBar', train: { mixology: 6 } }] },
      { id: 'lastOrders', n: 'Last orders', duty: true, at: [1110, 1140], done: 'Closed up clean',
        steps: [
          { go: 'barTable', secs: 6, n: 'collecting glasses', say: 'Glasses. Glasses. Why is there a shoe.', train: { fitness: 3 } },
          { go: 'deck', secs: 6, n: 'stacking chairs', train: { fitness: 3 } },
          { go: 'desk', secs: 6, n: 'cashing up', say: 'Not bad. Not bad at all.', train: { mixology: 3 } }] },
      { id: 'flair', n: 'Practising flair', unlock: { mixology: 6 }, every: 300, gives: { passion: 35, fun: 25 },
        done: 'Nailed a bottle flip',
        steps: [
          { go: 'desk', secs: 10, n: 'flipping bottles behind the bar', say: 'Watch. Watch. WATCH.', train: { mixology: 8 } },
          { go: 'barTable', secs: 5, n: 'taking a bow', say: 'Thank you, thank you, I know.', train: { charm: 4 } }] },
      { id: 'dance', n: 'Dancing it off', when: { mood: 60 }, every: 420, gives: { fun: 40, social: 15 }, done: 'Had a dance',
        steps: [
          { go: 'jukebox', secs: 5, n: 'picking a song', train: { music: 3 } },
          { go: 'deck', secs: 9, n: 'dancing on the deck', say: 'Don’t look. Okay, look.', train: { fitness: 3, charm: 3 } }] }
    ],
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
    likes: { jade: 40, luca: 20, teo: 15, blake: -30, tito: 35, amara: 25, nico: 10 },
    /* A cooler of coconut water under the counter. */
    post: { thirst: .7 },
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
    skill: 'surfing',
    teach: ['He takes you out on a foamie and pushes you into a wave that is, generously, a ripple. You stand up for one glorious second. He screams like you have won the Olympics — and catches the next one himself, cleaner than you have ever seen him ride.',
      '“Pop-up drill on the sand, twenty times.” He does them with you, all twenty, grinning. “Teaching makes you better, dude. Everybody knows that.”'],
    skills: { surfing: 5, fitness: 4, charm: 2, lifesaving: 1 },
    talent: { surfing: 1.3, fitness: 1.1 },
    routines: [
      { id: 'lesson', n: 'Morning lesson', duty: true, at: [650, 720], done: 'Taught the morning lesson',
        steps: [
          { go: 'surfshack', secs: 6, n: 'waxing the boards', say: 'Wax on. Wax on. Wax ON.', train: { surfing: 3 } },
          { go: 'sands', secs: 10, n: 'teaching pop-ups on the sand', say: 'Paddle, paddle, POP! …Nearly.', train: { surfing: 5, charm: 3 } },
          { go: 'desk', secs: 4, n: 'hosing down the boards', train: { fitness: 2 } }] },
      { id: 'session', n: 'Surf session', every: 240, gives: { passion: 45, fun: 35 }, done: 'Caught a good one',
        steps: [
          { go: 'surfshack', secs: 4, n: 'grabbing his board', train: { surfing: 2 } },
          { go: 'sands', secs: 12, n: 'surfing off the Sands', say: 'WOOOO!', train: { surfing: 7, fitness: 4 } },
          { go: 'stall', secs: 6, n: 'drinking a coconut', say: 'Coconut. Nature’s energy drink.', train: {} }] },
      { id: 'bigWave', n: 'Hunting the big one', unlock: { surfing: 7 }, every: 600, gives: { passion: 60, fun: 50 },
        done: 'Rode the biggest wave of his life',
        steps: [
          { go: 'sands', secs: 6, n: 'reading the swell', say: 'There. THERE. You see it?', train: { surfing: 4 } },
          { go: 'cove', secs: 12, n: 'surfing the reef break at the cove', train: { surfing: 10, fitness: 5 } },
          { go: 'lagoon', secs: 8, n: 'floating in the lagoon, grinning', say: 'I am never getting out of this water.' }] },
      { id: 'kids', n: 'Water-safety talk', unlock: { lifesaving: 3 }, every: 480, gives: { social: 40, passion: 20 },
        done: 'Taught kids about rip currents',
        steps: [
          { go: 'fountain', secs: 10, n: 'telling kids about rip currents', say: 'Swim ACROSS it, little dudes!', train: { lifesaving: 6, charm: 4 } }] }
    ],
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
    likes: { kai: 25, teo: 20, coco: 15, blake: -40, amara: 30, nico: 15 },
    /* A water bottle on the tower, which she forgets to drink. */
    post: { thirst: .45 },
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
    skill: 'lifesaving',
    teach: ['She walks you through a rescue on the sand: approach, reassure, tow. Then she makes you be the victim, and practises on you, very thoroughly. “For science,” she says.',
      '“Scan left to right. Heads, not bodies. Count them.” You count. She counts faster. “Better,” she says, and means you both.'],
    skills: { lifesaving: 6, fitness: 5, charm: 3 },
    talent: { lifesaving: 1.2, fitness: 1.2 },
    routines: [
      { id: 'flags', n: 'Putting the flags out', duty: true, at: [640, 700], done: 'Flags out on time',
        steps: [
          { go: 'sands', secs: 7, n: 'planting the flags', say: 'Red and yellow. Swim between them. Every time.', train: { lifesaving: 4 } },
          { go: 'desk', secs: 4, n: 'climbing the tower', train: { fitness: 2 } }] },
      { id: 'patrol', n: 'Afternoon patrol', duty: true, at: [930, 990], done: 'Walked the patrol',
        steps: [
          { go: 'sands', secs: 6, n: 'walking the shoreline', say: 'Nobody past the buoys. I SEE you.', train: { lifesaving: 4, fitness: 3 } },
          { go: 'surfshack', secs: 4, n: 'checking in with the surf school', say: 'Kai. KAI. The leashes.', train: { charm: 2 } },
          { go: 'desk', secs: 3, n: 'back up the tower', train: { fitness: 2 } }] },
      { id: 'swim', n: 'Training swim', when: { dry: true }, every: 360, gives: { fun: 35, passion: 30 }, done: 'Swam a personal best',
        steps: [
          { go: 'sands', secs: 10, n: 'swimming lengths off the Sands', say: 'Hundred more. Then a hundred more.', train: { fitness: 7 } },
          { go: 'desk', secs: 4, n: 'drying off on the tower', train: {} }] },
      { id: 'cove', n: 'Sunset at the cove', unlock: { charm: 5 }, when: { from: 1140, to: 1260 }, every: 900,
        gives: { fun: 40, energy: 20 }, done: 'Watched the sunset from the cove',
        steps: [
          { go: 'cove', secs: 14, n: 'watching the sun go down at the cove', say: 'Off duty. Finally.', train: { charm: 3 } }] }
    ],
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
    likes: { kai: 20, mari: 15, sienna: 10, pepe: 20, blake: -20, tito: 40 },
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
    skill: 'music',
    teach: ['He puts his headphones on you and his hands over yours on the decks. “Feel the one. The ONE.” You drop the beat. He drops the next one, and the whole deck cheers. “Magnifico. We are both better now.”',
      '“Yoga first. The body is the instrument.” Forty minutes later you are folded in a way you did not know you could fold, and he is humming a melody he says you gave him.'],
    skills: { music: 5, charm: 4, fitness: 3 },
    talent: { music: 1.3, charm: 1.2 },
    routines: [
      { id: 'soundcheck', n: 'Soundcheck', duty: true, at: [710, 760], done: 'Soundchecked the deck',
        steps: [
          { go: 'jukebox', secs: 6, n: 'untangling cables', say: 'Why is it always the red cable.', train: { music: 3 } },
          { go: 'deck', secs: 6, n: 'testing the speakers', say: 'Uno, due. Uno, due. Bellissimo.', train: { music: 4 } },
          { go: 'desk', secs: 5, n: 'setting up the decks', train: { music: 4 } }] },
      { id: 'crates', n: 'Digging for records', every: 300, gives: { passion: 40, fun: 25 }, done: 'Found a lost disco classic',
        steps: [
          { go: 'jukebox', secs: 10, n: 'flicking through the jukebox', say: 'No. No. No. …Oh. OH.', train: { music: 6 } },
          { go: 'hammock', secs: 8, n: 'listening with his eyes shut', train: { music: 3 } }] },
      { id: 'sunsetSet', n: 'The sunset set', unlock: { music: 7 }, when: { from: 1120, to: 1260 }, every: 900,
        gives: { passion: 70, social: 40 }, done: 'Played the set of the summer',
        steps: [
          { go: 'desk', secs: 14, n: 'playing the sunset set', say: 'This one is for the sea.', train: { music: 10, charm: 4 } },
          { go: 'deck', secs: 8, n: 'dancing with the crowd', say: 'Everybody! Hands for the sun!', train: { charm: 5 } }] }
    ],
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
    likes: { mari: 30, jade: 20, kai: 15, pepe: 25, blake: -70, sienna: -10, rosie: -30, val: 15 },
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
    skill: 'gossip',
    skills: { gossip: 8, business: 6, charm: 4 },
    talent: { gossip: 1.2, business: 1.1 },
    routines: [
      { id: 'stock', n: 'Morning stocktake', duty: true, at: [600, 660], done: 'Counted every mango',
        steps: [
          { go: 'till', secs: 12, n: 'counting mangoes', say: 'Forty-one. FORTY-ONE. Somebody has had a mango.', train: { business: 5 } }] },
      { id: 'books', n: 'Doing the books', duty: true, at: [1080, 1140], done: 'Balanced the books',
        steps: [
          { go: 'till', secs: 12, n: 'doing the books', say: 'Mm-hm. Mm-HM. Kai owes me for hair gel.', train: { business: 5, gossip: 2 } }] }
    ],
    flirt: {}
  },

  teo: {
    base: 4,
    passion: { n: 'Sea air', e: '⚓', at: ['desk', 'jetty'], decay: 6 },
    weights: { passion: 1.2, social: .5, fun: .6 },
    rates: { social: .6, fun: .7 },
    spots: { jetty: 1.8, stall: 1.2 },
    likes: { kai: 15, jade: 20, coco: 20, blake: -35, nico: -35 },
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
    skill: 'seamanship',
    skills: { seamanship: 8, fitness: 5, business: 3 },
    talent: { seamanship: 1.1 },
    routines: [
      { id: 'unload', n: 'Unloading the boat', duty: true, at: [490, 560], done: 'Unloaded the morning run',
        steps: [
          { go: 'jetty', secs: 8, n: 'hauling crates off the boat', say: 'Hup. Hrm. Hup.', train: { fitness: 5, seamanship: 2 } },
          { go: 'stall', secs: 6, n: 'delivering to the stall', say: 'Limes. Rum. More rum.', train: { business: 4 } },
          { go: 'desk', secs: 4, n: 'coiling rope', train: { seamanship: 3 } }] },
      { id: 'nets', n: 'Mending nets', every: 360, gives: { passion: 35, fun: 25 }, done: 'Mended the nets',
        steps: [
          { go: 'jetty', secs: 12, n: 'mending nets on the jetty', say: 'Knot. Knot. Knot.', train: { seamanship: 6 } }] },
      { id: 'fishing', n: 'Evening fishing', unlock: { seamanship: 9 }, when: { from: 1080, to: 1260 }, every: 900,
        gives: { fun: 50, passion: 40 }, done: 'Caught supper',
        steps: [
          { go: 'jetty', secs: 8, n: 'baiting a line', train: { seamanship: 4 } },
          { go: 'cove', secs: 12, n: 'fishing off the rocks at the cove', say: 'Bite. Bite, you coward.', train: { seamanship: 8 } }] }
    ],
    flirt: {}
  },

  pepe: {
    base: 10,
    works: false,
    passion: { n: 'Rum', e: '🥃', at: ['desk', 'barTable'], decay: 9 },
    weights: { passion: 1.2, thirst: 1.2, energy: .6 },
    rates: { thirst: 1.3, energy: 1.2, fun: .7 },
    spots: { barTable: 1.6, deck: 1.3, hammock: 1.4 },
    likes: { mari: 40, luca: 15, coco: 30, sienna: 25, blake: -25, tito: 70, rosie: 35 },
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
    skill: 'storytelling',
    skills: { storytelling: 6, charm: 5, fitness: 1 },
    talent: { storytelling: 1.2 },
    routines: [
      { id: 'walk', n: 'Taking his constitutional', when: { dry: true }, every: 300, gives: { fun: 30, social: 20 },
        done: 'Took the air',
        steps: [
          { go: 'deck', secs: 6, n: 'shuffling round the deck', say: 'Doctor’s orders. Two laps. Then rum.', train: { fitness: 3 } },
          { go: 'rail', secs: 6, n: 'leaning on the rail, looking at the sea', train: {} },
          { go: 'barTable', secs: 8, n: 'resting at the corner table', say: 'Exhausting.', train: {} }] },
      { id: 'theStory', n: 'Telling THE story', unlock: { storytelling: 7 }, when: { mood: 55 }, every: 600,
        gives: { social: 60, passion: 30 }, done: 'Told THE story, all of it',
        steps: [
          { go: 'barTable', secs: 8, n: 'clearing his throat', say: 'Gather round. It was 1974…', train: { storytelling: 6 } },
          { go: 'deck', secs: 12, n: 'acting out the film star kiss', say: '…and SHE said, “Pepe, you are the best kisser in the Caribbean.”', train: { storytelling: 8, charm: 3 } }] }
    ],
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
    skill: 'content',
    skills: { content: 6, charm: 4, business: 3 },
    talent: { content: 1.2, charm: 1.1 },
    routines: [
      { id: 'shoot', n: 'Shooting content', when: { dry: true }, every: 240, gives: { passion: 45, fun: 20 }, done: 'Got the shot',
        steps: [
          { go: 'rail', secs: 6, n: 'finding the light at the rail', say: 'No. No. Yes. Don’t move. NOBODY move.', train: { content: 4 } },
          { go: 'deck', secs: 6, n: 'shooting on the deck', say: 'Candid. Be candid. Less candid.', train: { content: 4 } },
          { go: 'hammock', secs: 6, n: 'posing in the hammock', train: { content: 3, charm: 2 } }] },
      { id: 'golden', n: 'Golden-hour shoot', unlock: { content: 7 }, when: { from: 1120, to: 1260, dry: true }, every: 900,
        gives: { passion: 70, fun: 30 }, done: 'Posted the golden-hour shot',
        steps: [
          { go: 'rail', secs: 12, n: 'shooting the golden hour', say: 'THIS. This is the one. Two million people need this.', train: { content: 9 } },
          { go: 'barTable', secs: 6, n: 'writing the caption', say: 'Hashtag… blessed? Too much. Hashtag… Driftwood.', train: { business: 3 } }] }
    ],
    flirt: {}
  },

  blake: {
    base: -4,
    works: false,
    passion: { n: 'Deals', e: '💼', at: ['desk'], decay: 12, chat: true },
    weights: { passion: 1.4, social: .9, energy: 1.1 },
    rates: { thirst: 1.5, energy: 1.2 },
    spots: { fountain: 1.3, stall: 1.4, jetty: .6 },
    likes: { sienna: 20, teo: -5, kai: -20, coco: -30, jade: -10, amara: -55, val: 5 },
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
    skill: 'business',
    skills: { business: 7, charm: 3, fitness: 2 },
    talent: { business: 1.1, charm: .8 },
    routines: [
      { id: 'survey', n: 'Surveying the land', every: 360, gives: { passion: 40 }, done: 'Measured the whole plaza',
        steps: [
          { go: 'fountain', secs: 6, n: 'pacing out the plaza', say: 'Forty paces. Room for a helipad.', train: { business: 4 } },
          { go: 'garden', secs: 6, n: 'imagining a car park over the garden', say: 'Valet here. Obviously.', train: { business: 4 } },
          { go: 'stall', secs: 6, n: 'buying a sparkling water', say: 'Is it cold? Define cold.', train: {} }] },
      { id: 'pitch', n: 'A pitch meeting', unlock: { charm: 5 }, every: 600, gives: { passion: 50, social: 40 }, done: 'Pitched a resort to a pelican',
        steps: [
          { go: 'fountain', secs: 12, n: 'pitching a resort to anybody who will listen', say: 'Picture it. Four hundred rooms. Infinity pool.', train: { charm: 6, business: 4 } }] }
    ],
    flirt: {}
  },

  /* ---- The newcomers ---- */
  nico: {
    base: 3,
    passion: { n: 'The catch', e: '🎣', at: ['desk', 'pier', 'cove'], decay: 9 },
    weights: { passion: 1.4, social: .4, fun: .7 },
    rates: { social: .5, energy: 1.1 },
    spots: { pier: 1.8, cove: 1.3, truck: 1.4, fountain: .6 },
    /* The feud with Teo is about a bollard. It has been about a bollard for
       fifteen years. */
    likes: { teo: -35, rosie: 40, amara: 15, jade: 15, kai: 10, blake: -45 },
    thoughts: { rained: -1, soaked: 2 },
    named: { rained: 'Rain. Fish don’t mind.', soaked: '{you} got him wet. He was already wet.' },
    words: ['Catching', 'Steady', 'Mm', 'Choppy', 'Becalmed'],
    lines: {
      great: ['Good day.', 'Snapper jumping. Good sign.', 'Hm. Nice out.'],
      low: ['Mm.', 'Leave it.', 'Nothing’s biting. Nothing.'],
      energy: ['Up at four. Every day. Four.'],
      thirst: ['Throat like a net full of sand.'],
      fun: ['Same sea. Same fish. Same Teo.'],
      social: ['Too quiet. Even for me.'],
      passion: ['Should be out on the water.', 'Wind’s right. Why am I on land.'],
      inspired: ['Going out past the reef tomorrow. Big ones out there.', 'Feel like I could catch a marlin with my hands.'],
      moment: ['Nobody talk to me. The fish don’t.', 'Teo moved my bollard AGAIN.']
    },
    moment: { at: 'pier', n: 'Glaring at Teo’s boat' },
    flirt: {
      great: ['He holds out a fish, very seriously, like a bouquet. “For you.” He is — you realise — smiling.'],
      low: ['“Not now.” Then, gruffer, softer: “Tomorrow. Ask me tomorrow.”']
    },
    skill: 'fishing',
    teach: ['He puts a hand line in yours and says nothing for ten whole minutes. When something bites he says one word — “Now” — and you land a fish. He looks at it, and then at you, and nods once. He lands three more while you are still celebrating.',
      '“Knots.” He ties one, slowly. You tie one, badly. He reties it, better than before. “See? Teaching sharpens the teacher.” That is the most he has ever said at once.'],
    skills: { fishing: 7, seamanship: 5, fitness: 5, charm: 2 },
    talent: { fishing: 1.2, seamanship: 1.1 },
    routines: [
      { id: 'dawnCatch', n: 'Landing the dawn catch', duty: true, at: [420, 560], done: 'Landed the morning catch',
        steps: [
          { go: 'pier', secs: 8, n: 'hauling in the lines', say: 'Heave. Heave. Hm.', train: { fishing: 5, fitness: 3 } },
          /* The catch lands: his crate is open, and Rosie can do fish tacos. */
          { go: 'desk', secs: 6, n: 'icing the catch', act: 'landCatch', train: { fishing: 4 } }] },
      { id: 'delivery', n: 'Fish for Rosie', duty: true, at: [700, 760], done: 'Took Rosie her fish',
        steps: [
          { go: 'truck', secs: 6, n: 'delivering fish to Rosie', say: 'Snapper. Don’t overcook it.', train: { charm: 2 } },
          { go: 'desk', secs: 4, n: 'back to his crate', train: {} }] },
      { id: 'mend', n: 'Mending the boat', every: 360, gives: { passion: 35, fun: 20 }, done: 'Patched the hull',
        steps: [
          { go: 'pier', secs: 12, n: 'patching his hull', say: 'Hold. Hold. Good.', train: { seamanship: 6 } }] },
      { id: 'reefFish', n: 'Fishing the reef', unlock: { fishing: 9 }, when: { from: 1080, to: 1260, dry: true }, every: 900,
        gives: { passion: 60, fun: 40 }, done: 'Caught a fish worth telling Teo about',
        steps: [
          { go: 'cove', secs: 14, n: 'fishing off the cove rocks', say: 'Come on. Come on, you beauty.', train: { fishing: 10 } },
          { go: 'desk', secs: 4, n: 'showing off the catch', say: 'TEO. Look at this. LOOK AT IT.', train: { charm: 3 } }] }
    ]
  },

  amara: {
    base: 4,
    passion: { n: 'Discovery', e: '🔬', at: ['reef', 'lagoon', 'desk', 'cove'], decay: 10 },
    weights: { passion: 1.5, social: .8 },
    rates: { energy: 1.1, fun: .8 },
    spots: { reef: 1.8, lagoon: 1.7, cove: 1.4, stall: .8 },
    likes: { blake: -75, kai: 25, jade: 30, coco: 20, nico: 20, val: 15, rosie: 15 },
    thoughts: { rained: 1, sunset: 8, soaked: 3 },
    named: { rained: 'Rain — good for the lagoon salinity data', soaked: 'Soaked by {you}. It’s fine, she’s a marine biologist' },
    words: ['Eureka', 'Curious', 'Measuring', 'Frustrated', 'Despairing for the reef'],
    lines: {
      great: ['FORTY-FIVE parrotfish! That is a record!', 'The seagrass is coming back. I could cry.', 'Science is going SO well today.'],
      low: ['Sterling’s surveyors were on the reef again.', 'I have peer-reviewed this island and it is not okay.'],
      energy: ['I’ve been underwater since dawn. I think I’m part fish.'],
      thirst: ['Ironic. Surrounded by water. Parched.'],
      fun: ['Forty jars of seawater and not one of them is a cocktail.'],
      social: ['I’ve been talking to a sea cucumber for three hours.'],
      passion: ['I need to get in the water. Data does not collect itself.', 'Something is happening on that reef and I am MISSING it.'],
      inspired: ['I’m going to write the paper of my career.', 'I am going to name a species after this island.'],
      moment: ['Do not talk to me about resorts. Do NOT.', 'I need to count something. Anything.']
    },
    moment: { at: 'reef', n: 'Counting fish to calm down' },
    flirt: {
      great: ['She takes your hand and holds it up to the light like a specimen. “Hm. Remarkable.” She does not let go.'],
      low: ['“I’m sorry, the reef had a bad day, so I had a bad day.” She squeezes your arm. “Try me after a swim.”']
    },
    skill: 'science',
    teach: ['She fits a mask on you and takes you out to the shallows. Under the water she points: a turtle, a ray, a parrotfish chewing coral. Back on the beach she is scribbling notes — “You spotted something I missed. The juvenile, by the rock. Thank you.”',
      'She teaches you to do a transect: a tape measure, a slate, counting every fish in a two-metre strip. You count badly. She counts again, better. “Explaining it made me see it differently,” she says, delighted.'],
    skills: { science: 7, fitness: 4, lifesaving: 3, charm: 3 },
    talent: { science: 1.2, charm: 1.1 },
    routines: [
      { id: 'survey', n: 'Morning reef survey', duty: true, at: [600, 700], done: 'Surveyed the reef',
        steps: [
          { go: 'reef', secs: 10, n: 'counting parrotfish on the reef', say: 'Thirty-eight, thirty-nine, FORTY—', train: { science: 5, fitness: 3 } },
          { go: 'cove', secs: 6, n: 'checking the seagrass plots', train: { science: 4 } },
          { go: 'desk', secs: 6, n: 'writing up her notes', say: 'Data. Beautiful, beautiful data.', train: { science: 3 } }] },
      { id: 'samples', n: 'Sampling the lagoon', every: 360, gives: { passion: 45, fun: 25 }, done: 'Took forty samples',
        steps: [
          { go: 'lagoon', secs: 12, n: 'filling sample jars at the lagoon', say: 'Jar thirty-one. Jar thirty-two.', train: { science: 6 } },
          { go: 'desk', secs: 6, n: 'labelling jars', train: { science: 2 } }] },
      { id: 'glow', n: 'The plankton bloom', unlock: { science: 9 }, when: { from: 1200, to: 1380 }, every: 1200,
        gives: { passion: 70, fun: 50 }, done: 'Watched the lagoon glow',
        steps: [
          { go: 'lagoon', secs: 16, n: 'wading through the glowing lagoon', say: 'Look. LOOK. It’s alive.', train: { science: 10 } }] }
    ]
  },

  rosie: {
    base: 8,
    passion: { n: 'Feeding people', e: '🌮', at: ['desk'], decay: 9, chat: true },
    weights: { passion: 1.4, social: 1.2, energy: .8 },
    rates: { social: 1.2, energy: 1.1 },
    spots: { stall: 1.3, fountain: 1.3, truck: 1.2 },
    /* The price war with Coco is eleven years old. Neither will say who
       started it. Both know. */
    likes: { coco: -30, nico: 40, pepe: 35, kai: 25, mari: 25, tito: 30, blake: -25 },
    thoughts: { sunshine: 4, rained: -5 },
    named: { rained: 'Rain — nobody queues in the rain' },
    words: ['Sizzling', 'Cooking', 'Simmering', 'Burnt', 'Closing the hatch'],
    lines: {
      great: ['BEST DAY! Everybody eats!', 'I love this island. I love all of you. Eat!'],
      low: ['Nobody’s eating. NOBODY.', 'Coco. It’s always Coco.'],
      energy: ['Eleven years on a hot plate. My feet are tortillas.'],
      thirst: ['Pass me an agua fresca. No — two.'],
      fun: ['Same tacos. Same plaza. Same Coco staring at me.'],
      social: ['Somebody come and talk to me. I’ll feed you.'],
      passion: ['Who’s hungry? Somebody must be hungry.'],
      inspired: ['New recipe. Mango habanero. Nobody is ready.', 'Tonight I feed the WHOLE island.'],
      moment: ['That’s it. Hatch is shut. I’m on strike.', 'I am going to stand here and not cook. For five minutes.']
    },
    moment: { at: 'fountain', n: 'On strike at the fountain' },
    flirt: {},
    skill: 'cooking',
    /* The truck has its own agua fresca, and she drinks it. */
    post: { thirst: 1.5, fun: .6 },
    skills: { cooking: 8, business: 5, charm: 5 },
    talent: { cooking: 1.1, charm: 1.1 },
    routines: [
      { id: 'market', n: 'Buying for the day', duty: true, at: [600, 650], done: 'Bought the day’s limes',
        steps: [
          { go: 'stall', secs: 8, n: 'haggling at the fruit stall', say: 'Twelve limes. And you are robbing me.', train: { business: 4 } },
          { go: 'desk', secs: 6, n: 'chopping salsa', train: { cooking: 4 } }] },
      /* Lunch: everybody on the island has had a taco. See NPC_ACTS. */
      { id: 'rush', n: 'The lunch rush', duty: true, at: [750, 800], done: 'Fed the whole plaza',
        steps: [
          { go: 'desk', secs: 16, n: 'serving the lunch rush', say: '¡A COMER! Queue! QUEUE!', act: 'lunchRush', train: { cooking: 5, charm: 2 } }] },
      { id: 'gossip', n: 'Gossiping at the fountain', every: 300, gives: { social: 45, fun: 25 }, done: 'Heard everything',
        steps: [
          { go: 'fountain', secs: 10, n: 'swapping gossip at the fountain', say: 'No. NO. With WHO?', train: { charm: 3 } }] }
    ]
  },

  tito: {
    base: 9,
    works: false,
    passion: { n: 'Beats', e: '🎧', at: ['desk', 'fountain', 'sands', 'out'], decay: 11 },
    weights: { passion: 1.5, social: 1.3, fun: 1.2, energy: .6 },
    rates: { fun: 1.3, social: 1.2, energy: .8 },
    spots: { fountain: 1.5, sands: 1.3, jukebox: 2 },
    likes: { luca: 70, pepe: 60, kai: 40, sienna: 35, rosie: 30, blake: -10 },
    thoughts: { soaked: 6 },
    named: { soaked: 'Water fight with {you}! Epic' },
    words: ['Vibing', 'Hyped', 'Chillin', 'Mid', 'Cooked'],
    lines: {
      great: ['Today is a BANGER.', 'I’m gonna be famous. Like, next week.', 'Everything is a beat if you listen.'],
      low: ['Nobody gets my music.', 'Abuelo says it’s magnificent. That’s the problem.'],
      energy: ['Stayed up till four making a mix. Worth it. Dead.'],
      thirst: ['Is there any agua fresca left? Rosie? ROSIE?'],
      fun: ['Bored bored bored bored bored.'],
      social: ['Where’s everyone? Where’s Luca?'],
      passion: ['I need to make a beat. Right now. It’s in my head.'],
      inspired: ['I just made the best beat in the HISTORY of beats.', 'Luca is going to be SO jealous.'],
      moment: ['I’m quitting music. Forever. Or until tomorrow.', 'Don’t look at me. I’m having a moment. An artistic one.']
    },
    moment: { at: 'sands', n: 'Sulking on the sand' },
    flirt: {},
    skill: 'music',
    teach: ['He plays you his mix. You tell him, honestly, that the drop comes in too early. He argues for five minutes, sulks for two, then plays it again with the drop moved. It is — genuinely — much better.',
      'You clap a rhythm. He beatboxes over it. You lose the beat; he keeps it, and keeps it, and keeps it, grinning. “Okay,” he says, breathless, “okay, THAT was something.”'],
    /* He starts raw and learns fast: his first set unlocks at Music 4, and
       practising with him gets him there. See q_tito. */
    skills: { music: 2, charm: 2, fitness: 3 },
    talent: { music: 1.6, charm: 1.2 },
    routines: [
      { id: 'beatbox', n: 'Beatboxing at the fountain', every: 240, gives: { passion: 40, fun: 30, social: 15 }, done: 'Drew a crowd of two',
        steps: [
          { go: 'fountain', secs: 10, n: 'beatboxing at the fountain', say: 'Boots and cats and — BOOTS AND CATS.', train: { music: 6, charm: 2 } }] },
      { id: 'firstSet', n: 'Tito’s first set', unlock: { music: 4 }, when: { from: 1060, to: 1200 }, every: 1440,
        gives: { passion: 80, social: 60, fun: 50 }, done: 'Played his first set',
        /* Growing into it moves his job along, and playing it finishes it. */
        onUnlock() { if (qAt('q_tito', 0)) Q.step('q_tito'); },
        onDone() { if (qAt('q_tito', 1)) Q.complete('q_tito'); },
        steps: [
          { go: 'fountain', secs: 16, n: 'playing his first ever set', say: 'THIS ONE IS FOR MY ABUELO!', train: { music: 10, charm: 4 } },
          { go: 'sands', secs: 8, n: 'screaming into the sea with joy', say: 'I DID IT! I DID IT!', train: {} }] }
    ]
  },

  val: {
    base: -3,
    passion: { n: 'Five minutes’ peace', e: '☕', at: ['cove', 'garden', 'hammock'], decay: 12 },
    weights: { passion: 1.3, energy: 1.2, social: .6 },
    rates: { energy: 1.3, thirst: 1.2 },
    spots: { cove: 1.6, garden: 1.5, stall: 1.2, fountain: .5 },
    likes: { blake: -15, amara: 25, mari: 20, coco: 20, sienna: 10, rosie: 20 },
    thoughts: { sunshine: -2 },
    named: { sunshine: 'Thirty-four degrees in a blazer', soaked: 'Soaked by {you}. Honestly? Refreshing.' },
    words: ['On top of it', 'Coping', 'Caffeinated', 'Drowning', 'Updating her CV'],
    lines: {
      great: ['He’s in a meeting. For an HOUR.', 'I took my blazer off. I feel dangerous.'],
      low: ['Per my last email. Per my LAST email.', 'Nine missed calls. All him.'],
      energy: ['I have been awake since his 5am idea.'],
      thirst: ['He drank my water. MY water.'],
      fun: ['Fun. I remember fun.'],
      social: ['Nobody talks to the assistant.'],
      passion: ['Five minutes. I just need five minutes.', 'If he calls me again I’m walking into the sea.'],
      inspired: ['I could run this whole company. I basically do.', 'Today I say no to him. Once. Watch.'],
      moment: ['I’m on a break. A BREAK. It’s in the contract.', 'No. No. Not today, Mr Sterling.']
    },
    moment: { at: 'cove', n: 'Hiding from Blake at the cove' },
    flirt: {},
    skill: 'business',
    skills: { business: 6, charm: 4, fitness: 2 },
    talent: { business: 1.2, charm: 1.1 },
    routines: [
      { id: 'agenda', n: 'Blake’s morning agenda', duty: true, at: [640, 700], done: 'Got him through the morning',
        steps: [
          { go: 'fountain', secs: 6, n: 'setting up Blake’s meeting spot', say: 'Umbrella. Chair. Shade. Sparkling water. Why.', train: { business: 4 } },
          { go: 'stall', secs: 6, n: 'buying his sparkling water', say: 'Colder. He will say it isn’t cold.', train: { business: 2 } },
          { go: 'desk', secs: 4, n: 'back at his elbow', train: { business: 2 } }] },
      { id: 'escape', n: 'Five minutes at the cove', every: 480, gives: { passion: 60, fun: 25 }, done: 'Five whole minutes to herself',
        steps: [
          { go: 'cove', secs: 12, n: 'hiding at the cove with her phone off', say: 'Phone off. Phone OFF.', train: {} }] }
    ]
  }
};
