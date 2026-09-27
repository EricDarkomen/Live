'use strict';
/* The people and everything they say.
 *
 * A person is a definition plus a dialogue tree. Dialogue.choose() resolves a
 * choice's `to` as a node id or an object and never as a function, so a branch
 * that depends on game state is two choices with the same `t` and mutually
 * exclusive `if:` guards.
 */

/* WHERE EVERYBODY GOES AT FIVE.
 *
 * `home: { at: [x, y], where: '...', part?, bus? }` — a spot on the street
 * level (`street: true`, see Levels.street()) and a sentence about it. `part`
 * names a part of that level the coordinates are relative to. When somebody's day ends they walk out through the lobby
 * as they always have, and then, instead of becoming a level called 'away'
 * that is not in the catalogue, they step onto the street and make for that
 * spot: the bus stop, their own car in the bays, a door between the launderette
 * and the post office, the subway under the railway, or west past the
 * multi-storey in no hurry at all. They are gone when they get there.
 *
 * It is one line each and it is the whole of the fiction of a town: stand
 * outside that building at five past five and twenty people come out of it and
 * go twenty different ways, and three of them go upstairs, above the shops they
 * have walked past every day for years. See runHome()'s second leg.
 *
 * Two of them have no `home:` and that is written rather than missed. Colin
 * does not go home. Ron is on the door until the last of them is out, which is
 * what HOME_STAY has always meant and what it has never once said out loud.
 *
 * `where` is prose and is read by the profile panel and by the doors on the
 * parade. Nothing in the engine reads it. */

/* OUT OF THE BUILDING, AND OUT IN THE EVENING.
 *
 * `out: [{ from, to, level, tile, face, lines }]` on a person means: between
 * those two times on the clock they are not on the fourth floor, they are
 * standing on that tile of that level, facing that way, saying those things.
 * NPCM.runErrands() moves them and NPCM.homeSnap() starts them there if the
 * shift is loaded mid-window; nothing else in the engine needed to learn
 * anything, because `n.level` was already the thing every reader of presence
 * asks about. A single object rather than a list still means what it always
 * meant.
 *
 * It is here because the town got built and then furnished with strangers.
 * There are twenty-six people in this game with sprites, expressions, moods
 * and dialogue trees, and a nail bar was standing three anonymous emoji in the
 * chairs when the joke it was written for is that they are COLLEAGUES.
 *
 * A LIST RATHER THAN ONE WINDOW, because a day has more than one hole in it.
 * It was one for as long as every window in the table was lunch, and lunch is
 * one window; a man who has the same thing in Greggs at twenty past eight for
 * seventeen years and is in the Bellhaven Arms at quarter past five is two,
 * and writing two Daves was never going to be the answer.
 *
 * AND THE EVENING IS THE POINT OF THE SECOND ONE. Five o'clock used to be the
 * last thing that happened to anybody — the doors, the street, their own
 * direction, gone — so a town with fourteen rooms in it went dark at the exact
 * hour a town starts, and the pub across the road from twenty people who had
 * just finished work was empty every night of the game. A window that opens
 * after five outranks going home (see runHome), and when it shuts they go home
 * FROM there rather than from a desk they left hours ago (see CLOSING TIME in
 * runErrands). Somebody already away comes back OUT for one, which is how a
 * kebab shop has anybody in it at nine at night.
 *
 * Every daytime window below is one somebody's schedule already had a hole in
 * — lunch, or the dead hour after it, or ten past four — so nobody is missing
 * from a desk they were meant to be at. And each of them says something about
 * the person that the fourth floor cannot: Karen is not in back-to-backs,
 * Sarah knows everything and is therefore the easiest to catch, Gary does not
 * care who knows, Marjorie is losing an argument with herself in front of a
 * shelf, Nigel is the man who has not paid the eleven invoices on that spike,
 * Priya's favourite part of her day is being fourth in a queue, and Mo stands
 * outside his own front door for a bit before he goes in.
 *
 * `lines:` is what they say WHILE THEY ARE THERE, and it is the whole reason
 * the rooms are worth walking to: six colleagues in a pub who are still
 * talking about the printer are six colleagues at their desks. Idle mutters
 * and colleague-to-colleague chatter both read it — see NPCM.linesFor().
 *
 * THREE ROOMS ARE DELIBERATELY EMPTY and stay that way. Unit 6 has nobody in
 * it and that is the first thing about Unit 6. Sunseekers is a room you cannot
 * see, because everything in Sunseekers happens behind a door with a light
 * over it. And Colin does not go anywhere, ever, which is Colin.
 *
 * A person in a shop still runs their own entry() — they are the same person —
 * so the branch is one line at the top of it, testing World.level. */

/* ---------------- NPCs, personalities, dialogue trees ---------------- */
/* WHAT EVERYBODY LOOKS LIKE.
 *
 * `look:` on a person is the stack of components they are made of, in the
 * vocabulary of the catalogue in tools/sheets/people.mjs and the character
 * creator: a build and skin, eyes, hair, a top, a cardigan over it, legs,
 * shoes, a beard. tools/build-sprites.mjs reads this file and bakes every one
 * of them into art/sprites/people.png, so changing somebody's shirt is a
 * change to one line here and a rebuild — and the game notices a line changed
 * without one and dresses them at runtime from the same components instead,
 * which is what the creator does for the player.
 *
 * PLAYER_LOOK is the new starter before they have chosen: what the creator
 * opens on, and the row the build bakes as `player`. */
const PLAYER_LOOK = { base: 'base:masc/Honey', eyes: 'eyes:Brown',
  hair: 'hair:Short 02 - Parted/Brown', torso: 'torso:masc/Shirt 01 - Longsleeve Shirt/Sky',
  legs: 'legs:masc/Pants 03 - Pants/Navy', feet: 'feet:masc/Shoes 01 - Shoes/Black' };

const NPCS = [
{
  id: 'lee', name: 'Lee', face: '🧑‍💻', role: 'Colleague · the desk across',
  desk: [15, 6], colour: '#4da3ff',
  level: 'floor',
  look: { base: 'base:masc/Ivory', eyes: 'eyes:Green', hair: 'hair:Short 04 - Cowlick/Chestnut', torso: 'torso:masc/Shirt 04 - T-shirt/Forest', legs: 'legs:masc/Pants 04 - Cuffed Pants/Smoke', feet: 'feet:masc/Shoes 01 - Shoes/Gray' },
  schedule: [[540, 'desk'],[630, 'kitchen'],[650, 'desk'],[780, 'kitchen'],[820, 'desk'],[900, 'meeting'],[940, 'desk']],
  lines: ['Morning.', 'Is the printer working?', 'Nearly lunch.'],
  entry() {
      if (Q.complete2('q_settle')) return 'again';
      if ((Q.active('q_settle') && Item.has('coffee'))) return 'coffee';
      if (!!G.flags.metLee) return 'waiting';
      return 'first';
    },
  nodes: {
    first: {
      text: [
        'You’re new. I’m Lee. I sit across from you.',
        'Two things: find your desk, and get me a coffee from the kitchen while you’re up. Then you’re one of us.'],
      do() { G.flags.metLee = true; Player.xp(10); Q.start('q_settle'); Rel.add('lee', 1); },
      choices: [
        { t: 'On it.', to: null },
        { t: 'What happens if I don’t?', to: 'else' }
      ]
    },
    else: {
      text: ['Then you’re a person who doesn’t get coffee. There are a few of those.'],
      to: null
    },
    waiting: {
      text: () => pick([
      'Desk. Coffee. In that order.',
      'Kitchen’s through the door on the right.']),
      choices: [
        { t: 'Right.', to: null }
      ]
    },
    coffee: {
      text: [
        'Is that for me? That’s for me.',
        'You’ll do.'],
      do() { Item.take('coffee'); Q.complete('q_settle'); Ach.get('a_settled'); Rel.add('lee', 2); },
      to: null
    },
    again: {
      text: () => pick([
      'Alright.',
      'Busy one.',
      'The printer’s at it again.']),
      choices: [
        { t: 'Just saying hello.', to: null }
      ]
    }
  }
},
{
  id: 'pat', name: 'Pat', face: '👩‍💼', role: 'Colleague · been here years',
  desk: [20, 6], colour: '#5ad48a',
  level: 'floor',
  home: { at: [60, 43], where: 'A flat on Middle Street' },
  look: { base: 'base:fem/Ivory', eyes: 'eyes:Hazel', hair: 'hair:Medium 02 - Curly/Orange', torso: 'torso:fem/Shirt 01 - Longsleeve Shirt/Wine', over: 'over:fem/Sweater 01 - Cardigan/Wine', legs: 'legs:fem/Pants 03 - Pants/Brown', feet: 'feet:fem/Shoes 01 - Shoes/Brown' },
  schedule: [[540, 'desk'],[690, 'kitchen'],[720, 'desk'],[960, 'printer'],[980, 'desk']],
  lines: ['Mm.', 'Don’t touch the thermostat.', 'That’s my mug.'],
  entry() {
      if ((Q.active('q_look') && !!G.flags.readBoard)) return 'board';
      if (!!G.flags.metPat) return 'again';
      return 'first';
    },
  nodes: {
    first: {
      text: [
        'Pat. Been here longer than the carpet.',
        'If you want to know anything, ask. If you want to know anything useful, go and look at the whiteboard in the meeting room and tell me whose name is in the corner.'],
      do() { G.flags.metPat = true; Q.start('q_look'); Rel.add('pat', 1); },
      choices: [
        { t: 'Nice to meet you.', to: null }
      ]
    },
    board: {
      text: ['Yours? Already? Then you’ll do.'],
      do() { Q.complete('q_look'); Rel.add('pat', 2); },
      to: null
    },
    again: {
      text: () => pick([
      'Mm.',
      'Still here.',
      'The kettle’s just boiled.']),
      choices: [
        { t: 'Just saying hello.', to: null }
      ]
    }
  }
},
{
  id: 'jordan', name: 'Jordan', face: '🧑‍🎤', role: 'Colleague · headphones in',
  desk: [5, 12], colour: '#b48cff',
  level: 'floor',
  look: { base: 'base:masc/Tawny', eyes: 'eyes:Brown', hair: 'hair:Short 03 - Curly/Black', torso: 'torso:masc/Shirt 09 - Polo/Red', legs: 'legs:masc/Pants 03 - Pants/Navy', feet: 'feet:masc/Shoes 01 - Shoes/Black' },
  schedule: [[540, 'desk'],[600, 'washroom'],[615, 'desk'],[840, 'kitchen'],[870, 'desk']],
  lines: ['…', 'Sorry, what?', 'Good tune, this.'],
  entry() {
      if (!!G.flags.metJordan) return 'again';
      return 'first';
    },
  nodes: {
    first: {
      text: [
        '(Jordan takes one earphone out.)',
        'Hiya. The old terminal in the meeting room has a game on it. Don’t tell anyone.'],
      do() { G.flags.metJordan = true; Rel.add('jordan', 1); },
      choices: [
        { t: 'Thanks.', to: null }
      ]
    },
    again: {
      text: () => pick([
      '(One earphone comes out, and goes back in.)',
      'Sorry, what?']),
      choices: [
        { t: 'Just saying hello.', to: null }
      ]
    }
  }
},
{
  id: 'morgan', name: 'Morgan', face: '👔', role: 'Manager',
  desk: [25, 12], colour: '#ff5f56',
  level: 'floor',
  boss: true,
  look: { base: 'base:fem/Ivory', eyes: 'eyes:Blue', hair: 'hair:Medium 08 - Bob, Bangs/Brown', torso: 'torso:fem/Shirt 07 - Buttoned Longsleeve Shirt/White', legs: 'legs:fem/Pants 03 - Pants/Charcoal', feet: 'feet:fem/Shoes 01 - Shoes/Black' },
  schedule: [[540, 'desk'],[600, 'meeting'],[660, 'desk'],[900, 'meeting'],[960, 'desk']],
  lines: ['Everything alright?', 'Numbers look good.', 'Quick one later.'],
  entry() {
      if (!!G.flags.finalDone) return 'after';
      if (!!G.flags.metMorgan) return 'ready';
      return 'first';
    },
  nodes: {
    first: {
      text: [
        'Morgan. I manage the floor.',
        'Settle in. When you’re ready, we’ll do your review.'],
      do() { G.flags.metMorgan = true; Rel.add('morgan', 1); },
      choices: [
        { t: 'Sounds good.', to: null }
      ]
    },
    ready: {
      text: ['Ready for your review?'],
      choices: [
        { t: 'Ready.', to: null, do() { setTimeout(() => Combat.startBoss('review'), 400); } },
        { t: 'Not yet.', to: null }
      ]
    },
    after: {
      text: () => pick([
      'Good work.',
      'Keep it up.']),
      choices: [
        { t: 'Just saying hello.', to: null }
      ]
    }
  }
},
{
  id: 'ro', name: 'Ro', face: '💁', role: 'Reception',
  desk: [7, 3], colour: '#ffb347',
  level: 'lobby',
  stays: true,
  look: { base: 'base:fem/Bronze', eyes: 'eyes:Brown', hair: 'hair:Medium 04 - Bangs & Bun/Raven', torso: 'torso:fem/Shirt 01 - Longsleeve Shirt/Purple', legs: 'legs:fem/Pants 03 - Pants/Charcoal', feet: 'feet:fem/Shoes 01 - Shoes/Black' },
  schedule: [[540, 'desk']],
  lines: ['Morning.', 'Sign in, please.', 'Lift’s on the left.'],
  entry() {
      if (!!G.flags.metRo) return 'again';
      return 'first';
    },
  nodes: {
    first: {
      text: ['Welcome. You’re on the first floor — lift or stairs, either works.'],
      do() {
      G.flags.metRo = true;
      Rel.add('ro', 1);
      UI.objective('Go up to the first floor and find your desk.');
    },
      choices: [
        { t: 'Thanks.', to: null }
      ]
    },
    again: {
      text: () => pick([
      'Morning.',
      'Everything alright up there?']),
      choices: [
        { t: 'Just saying hello.', to: null }
      ]
    }
  }
},
{
  id: 'kit', name: 'Kit', face: '🧑‍🍳', role: 'The shop',
  desk: [6, 3], colour: '#ffb347',
  level: 'shop',
  look: { base: 'base:masc/Ivory', eyes: 'eyes:Blue', hair: 'hair:Short 01 - Buzzcut/Blonde', torso: 'torso:masc/Shirt 09 - Polo/Teal', legs: 'legs:masc/Pants 03 - Pants/Smoke', feet: 'feet:masc/Shoes 01 - Shoes/Black' },
  schedule: [[480, 'desk']],
  lines: ['Morning.', 'Card or cash?', 'We’ve got sandwiches.'],
  entry() {
      return 'hello';
    },
  nodes: {
    hello: {
      text: ['What can I get you?'],
      choices: [
        { t: 'Let me see.', to: null, do() { Shop.open('corner'); } },
        { t: 'Just looking.', to: null }
      ]
    }
  }
},
];
