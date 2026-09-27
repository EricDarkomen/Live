'use strict';
/* The day around you: random events, the chat, mail and text feeds, the
 * endings, and the opening.
 */

/* ---------------- Random events ---------------- */
const EVENTS = [
  { id: 'firealarm', e: '🔔', t: 'THE FIRE ALARM', d: 'The alarm goes. Everybody out to the assembly point.', crowd: { evacuate: true, secs: 70, haste: 1.5 },
    go() { G.flags.drill = true; } },
  { id: 'cake', e: '🎂', t: 'CAKE IN THE KITCHEN', d: 'Somebody has brought cake in. The floor empties.', crowd: { go: 'kitchen', secs: 60, haste: 1.4 },
    go() {  } },
  { id: 'printerjam', e: '🖨️', t: 'THE PRINTER', d: 'The printer has jammed. Everybody looks at it.', crowd: { look: 'printer', secs: 3 },
    go() {  } },
];


/* ---------------- Office chat + mail scripts ---------------- */
const CHAT_SCRIPT = [
  { t: 545, c: '#general', who: 'Pat', f: '👩‍💼', m: 'Morning all.' },
  { t: 548, c: '#general', who: 'Lee', f: '🧑‍💻', m: 'Morning. Who’s on coffee?' },
  { t: 560, c: '#general', who: 'Jordan', f: '🧑‍🎤', m: 'Not me.' },
  { t: 720, c: '#general', who: 'Morgan', f: '👔', m: 'Reminder: reviews this week.' },
];

const MAIL_SCRIPT = [
  { t: 570, from: 'Morgan <morgan@example.com>', s: 'Welcome',
    b: 'Welcome aboard. Lee will show you around.\n\nMorgan' },
  { t: 700, from: 'Facilities <facilities@example.com>', s: 'The printer',
    b: 'Please do not hit the printer.\n\nFacilities' },
];

/* ---------------- Texts ----------------
   THE CHANNEL THAT IS NOT ABOUT THE JOB, which is what makes it the one that
   says most about it. The chat is the company talking to itself and the inbox
   is the company talking at you; a text is somebody who knows you, arriving on
   the same screen, about a boiler.

   It is deliberately the only channel that does not stop at the door or at
   five — see Texts in engine/office.js — so the shape of the script is a day
   with a life either side of it: the morning ones are about getting here, the
   afternoon ones are about what is happening while you are not there, and the
   ones after 17:00 are the evening arriving whether you have clocked off or
   not. Written in the second person on purpose. Nobody in here says your name,
   because nobody texting you would. */
const TEXT_SCRIPT = [
  { t: 556, who: 'Mum', f: '👩', m: 'Good luck today! Text me when you’re in.' },
  { t: 1030, who: 'Lee', f: '🧑‍💻', m: 'Few of us going for a drink if you fancy it.' },
  { t: 1045, who: 'Mum', f: '👩', m: 'How was it?' },
];

/* Both scripts are written in blocks, so put them back in clock order — the
   feed reads as a day, and Chat.tick's index keys stay stable after the sort. */
CHAT_SCRIPT.sort((a, b) => a.t - b.t);
MAIL_SCRIPT.sort((a, b) => a.t - b.t);
TEXT_SCRIPT.sort((a, b) => a.t - b.t);

/* ---------------- Endings ---------------- */
const ENDINGS = {
  onwards: { t: '🌅 ONWARDS', b: [
    'You finish the week. Then another one.',
    'It turns out you are good at this. Nobody is more surprised than you.'] },
  elsewhere: { t: '🚪 ELSEWHERE', b: [
    'You hand your lanyard in on Friday.',
    'Whatever comes next, it is yours.'] },
};

/* ---------------- Opening cutscene ----------------
   Eighteen beats, and three fields on each of them that are not prose.

     k    what SHAPE the beat is. 'scene' is the default — a caption in the
          lower third. 'line' is somebody speaking, which wants the room a
          paragraph does not: Big Ron's four lines are the comic timing of the
          whole opening and as full-size cards they read as four essays.
          'title' is the last card and is display type.
     cam  where the camera is, in TILES, on the level the shift starts on.
          A beat with no `cam` keeps the shot before it — and until the FIRST
          one the building is not shown at all, which is why nothing here puts
          a camera behind "outside": the office cannot honestly draw a street,
          so it stays dark until you are through the door.
     len  seconds to glide there. Short is a cut, long is a move.

   THE PLAYER NEVER LEAVES RECEPTION, and the tense is what says so. The shift
   starts on the spawn tile in the lobby, under an objective that reads "find
   the fourth floor, find your desk" — so an opening that walks you up there
   and sits you down contradicts the first thing the game asks you to do. It
   used to. The camera goes up ahead of you instead and the narrator describes
   what is waiting in the future tense, which fixes the continuity and is the
   funnier voice anyway: somebody who has watched this happen to a lot of
   people and is telling you how it goes.

   No beat runs past about 260 characters, and that is a layout rule that turned
   out to be a writing rule. At 320px a 370-character beat is thirteen lines: it
   fills the whole frame between the letterbox bars, which buries the building
   the opening exists to show you. Splitting the long ones cured that and read
   better anyway — the four cards that came out of the split are all punchlines
   ("...you will be doing it yourself", "...not to mention that"), and a
   punchline on its own card is the oldest timing there is.

   Everything named here is paid off somewhere in data/acts.js — the sold
   assembly point, the decorative lift, the propped fire door, the out-of-date
   floor plan, The Good Chair, the spreadsheet whose formulas have been wrong
   since 2009. The opening sets them up and is careful not to spend them. */
const CUT = [
  { k: 'scene', f: '🏢', l: 'Outside · 08:52', t: 'A new building, a new job, and a lanyard with your name on it.' },
  { k: 'scene', f: '🛎️', l: 'Reception · 08:55', cam: [11, 6], len: 2.2, t: 'Reception is warm and quiet. The lift is on the left, the stairs on the right.', level: 'lobby' },
  { k: 'line', f: '💁', l: 'Ro · Reception', cam: [7, 4], len: 1.3, t: '“Morning. You must be new.”' },
  { k: 'scene', f: '🖥️', l: 'The Floor · 08:57', cam: [15, 9], len: 2.4, t: 'Upstairs, ten desks, and one of them will be yours.', level: 'floor' },
  { k: 'scene', f: '☕', l: 'The Kitchen · 08:58', cam: [33, 6], len: 2, t: 'There is a kitchen. There is always a kitchen.' },
  { k: 'title', f: '✨', l: '', cam: [11, 9], len: 1.6, t: 'UNTITLED', level: 'lobby' },
];
