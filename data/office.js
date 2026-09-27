'use strict';
/* The day around you: things that happen at the bar, the island group chat,
 * the post, your texts, the endings, and the opening.
 */

/* ---------------- Happenings ----------------
   `crowd:` is how the bar reacts — { look: 'wp' } turns heads, { go: 'wp' }
   sends everybody there for `secs`. See NPCM.watchFloor(). */
const EVENTS = [
  { id: 'happyhour', e: '🍹', t: 'HAPPY HOUR', d: 'Two-for-one on anything with an umbrella. Everybody crowds the deck.', crowd: { go: 'deck', secs: 60, haste: 1.3 },
    go() { Player.mod({ money: 8 }); } },
  { id: 'pelican', e: '🦤', t: 'THE PELICAN', d: 'A pelican has landed on the deck rail and is staring at the fish in Pepe’s hand.', crowd: { look: 'rail', secs: 4 },
    go() { } },
  { id: 'conga', e: '💃', t: 'A CONGA LINE', d: 'The hen party has started a conga. It goes round the jukebox. Twice.', crowd: { go: 'jukebox', secs: 45, haste: 1.2 },
    go() { } },
  { id: 'shower', e: '🌦️', t: 'A TROPICAL SHOWER', d: 'Five minutes of warm rain. Everybody runs inside laughing, soaked.', crowd: { look: 'deck', secs: 5 },
    go() { } },
];

/* ---------------- The island chat, the post ---------------- */
const CHAT_SCRIPT = [
  { t: 668, c: '#isla-solana', who: 'Mama Coco', f: '👵', m: 'Good morning my loves. Mangoes half price. Rafa’s kid has arrived. They are cute. That is all.' },
  { t: 672, c: '#isla-solana', who: 'Kai', f: '🏄', m: 'waves are CLEAN today 🌊🌊' },
  { t: 690, c: '#isla-solana', who: 'Jade', f: '🛟', m: 'Reminder: red flags mean DON’T SWIM. Kai.' },
  { t: 691, c: '#isla-solana', who: 'Kai', f: '🏄', m: 'that was one time' },
  { t: 760, c: '#isla-solana', who: 'Luca', f: '🧘', m: 'Tonight on the Driftwood deck: sunset set 🌅 bring someone special. Or come alone and leave with someone special 😉' },
  { t: 830, c: '#isla-solana', who: 'Old Pepe', f: '👴', m: 'Who has taken my chair.' },
  { t: 831, c: '#isla-solana', who: 'Mari', f: '💃', m: 'Nobody, Pepe. You’re sitting in it.' },
  { t: 1000, c: '#isla-solana', who: 'Captain Teo', f: '⚓', m: 'Boat leaves at dawn. Orders on the board. Cash only.' },
  { t: 1150, c: '#isla-solana', who: 'Mama Coco', f: '👵', m: 'Somebody was seen walking towards Lovers’ Cove holding TWO drinks. I will find out who.' },
];

const MAIL_SCRIPT = [
  { t: 675, from: 'Rafa <rafa@somewhere-in-bali.example>', s: 'You made it!',
    b: 'Kid,\n\nIf you’re reading this you’re on the island and I am on a beach in Bali with a yoga instructor called Wayan. No regrets.\n\nThe Driftwood is yours. Listen to Mari, she is always right. Grow the fruit in my garden — nothing beats a lime you picked yourself. And if a man called Sterling offers to buy you a drink, pour it on his shoes.\n\nHave a summer you won’t tell your mother about.\n\nRafa x' },
  { t: 900, from: 'Sterling Resorts <offers@sterling.example>', s: 'An exciting opportunity',
    b: 'Dear New Owner,\n\nSterling Resorts would love to discuss the future of your “beach shack”. Mr Sterling will be on the island this week.\n\nBest regards,\nThe Office of Blake Sterling' },
];

/* ---------------- Texts ----------------
   The channel that follows you everywhere, and the one where the island gets
   personal. The late ones are about your evening. */
const TEXT_SCRIPT = [
  { t: 664, who: 'Mum', f: '👩', m: 'Did you land?? Wear sun cream. And DON’T fall in love with a bartender.' },
  { t: 720, who: 'Mari', f: '💃', m: 'If you’re not behind this bar in 5 mins I’m drinking your welcome drink' },
  { t: 1100, who: 'Kai', f: '🏄', m: 'hey its kai. got your number off mari. hope thats ok 🤙 sunset later?' },
  { t: 1145, who: 'Mum', f: '👩', m: 'How was your first day? Send a photo. Not of the bartender.' },
  { t: 1180, who: 'Jade', f: '🛟', m: 'Saw you on the beach. You were doing the thing where you pretend not to look. I was doing it too.' },
  { t: 1230, who: 'Luca', f: '🧘', m: 'The stars are out. The sea is warm. I am just saying, amore.' },
];

CHAT_SCRIPT.sort((a, b) => a.t - b.t);
MAIL_SCRIPT.sort((a, b) => a.t - b.t);
TEXT_SCRIPT.sort((a, b) => a.t - b.t);

/* ---------------- Endings ----------------
   Offered once Blake has been beaten. `when` decides whether one is on the
   table at all. */
const ENDINGS = {
  paradise: { t: '🌴 KEEP THE DRIFTWOOD', b: [
    'You tear up Sterling’s card and pour him a drink on the house. He leaves the next morning, sunburnt.',
    'The Driftwood is packed every night. Mari finally takes a day off. Pepe tells everybody he knew you when.'] },
  love: { t: '💋 SAIL INTO THE SUNSET', when: () => !!G.flags.partner, b: [
    'You hand the keys to Mari — “it was always yours, really” — and step onto a borrowed boat with the person you met at the cove.',
    'The island gets smaller behind you. The sun goes down. You are not, at any point, wearing enough sun cream.'] },
  sold: { t: '💶 TAKE THE MONEY', b: [
    'You sign. Two million euros. The bulldozers arrive in the autumn.',
    'You buy a flat in the city and a very good coat. Every summer you get a postcard from Mari with no message on it, just a picture of a sunset.'] },
};

/* ---------------- The opening ----------------
     k    'scene' a caption · 'line' somebody speaking · 'title' the last card
     cam  where the camera is, in TILES, on `level`
     len  seconds to glide there */
const CUT = [
  { k: 'scene', f: '⛵', l: 'The Caribbean · 10:52', t: 'Three hours on a supply boat, one suitcase, and a letter from an uncle you last saw when you were nine.', level: 'island', cam: [118, 47], len: 1.2 },
  { k: 'line', f: '⚓', l: 'Captain Teo', cam: [112, 47], len: 1.4, t: '“Isla Solana. End of the line, kid. Mind the step.”' },
  { k: 'scene', f: '🌴', l: 'The Promenade · 10:56', cam: [60, 66], len: 2.6, t: 'One road round the island. Palms. A shuttle bus that does not stop anywhere in particular.' },
  { k: 'scene', f: '🍹', l: 'The Driftwood · 10:57', cam: [45, 76], len: 2.2, t: 'And there it is. Your uncle’s beach bar. Your beach bar now. The roof is… mostly there.' },
  { k: 'scene', f: '🏖️', l: 'Honeymoon Sands', cam: [62, 80], len: 2.2, t: 'The beach out front is full of people who have come a very long way to take their clothes off.' },
  { k: 'scene', f: '🏮', l: 'Lovers’ Cove', cam: [14, 46], len: 3, t: 'Round the headland, a lantern that is lit every evening. Nobody will tell you why. Everybody smiles when you ask.' },
  { k: 'line', f: '💌', l: 'Rafa’s letter', cam: [62, 46], len: 2.4, t: '“The bar is yours now, kid. Look after Mari. Water the mangoes. Have a summer you won’t tell your mother about.”' },
  { k: 'title', f: '🌅', l: '', cam: [116, 47], len: 2, t: 'TAN LINES', level: 'island' },
];
