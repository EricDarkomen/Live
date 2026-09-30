'use strict';
/* THE GAME ITSELF — what it is called, and every word the ENGINE says.

   Everything else in data/ is a place, a person or a thing. This file is the
   rest: the name on the title screen, the currency, the storage keys, the
   island's hours and weather, and the sentences the engine speaks on its own
   account — a guest giving up on you, the end-of-day takings, the toast when
   you level up.

   `TEXT` is read through `say(key, vars)` (engine/core.js). A value may be a
   string or a list — a list is picked from at random — and `{name}` is filled
   from `vars`.

   Loaded FIRST of data/, because GAME.id names the storage keys and the
   engine reads the hours below before anything else is built. */

const GAME = {
  /* Storage keys, save files and the editor's bench are all prefixed with this. */
  id: 'tanlines',
  title: 'Tan Lines',
  sub: 'Sun, sand & questionable decisions',
  company: 'The Driftwood',
  currency: '€',
  version: 1,
  /* THE ISLAND'S DAY. The bar is open eleven till seven; after that it is
     golden hour, then sunset at quarter past eight, then whatever you make of
     the night. One season, because it is always summer on Isla Solana, and a
     sky that is mostly blue with the odd tropical downpour to keep you honest. */
  hours: [660, 1140],
  seasons: ['summer'],
  sun: { rise: 370, set: 1215 },
  weather: ['clear', 'clear', 'clear', 'clear', 'fair', 'fair', 'fair', 'cloud', 'clear', 'downpour']
};

const TEXT = {
  'land.n': 'Seal it.', 'land.d': 'Lean in, say exactly the right thing, and mean it. Ends it on a high.',
  'land.txt': ['You slide the glass across, hold their eye a beat longer than strictly necessary, and smile. “Oh,” they say. “Oh, you’re good.”',
    'You say the one thing they were hoping somebody would say tonight. They laugh, and tip like they mean it.'],
  'track.stop': 'No longer following <b>{job}</b>.', 'track.on': 'Following <b>{job}</b>.',
  'track.noFix': 'Following <b>{job}</b>. No pin on this one — you will have to ask around.',
  /* The engine's own acts — engine/acts.js. */
  'act.genericRole': 'Island life', 'act.generic': 'It is exactly what it looks like, only warmer.',
  'act.doorRole': 'Doorway', 'act.door': 'A door, propped open with a shell. It leads to {name}.',
  'act.unlockedRole': 'Unlocked', 'act.unlocked': 'It swings open.',
  'act.lockedRole': 'Locked', 'act.locked': 'Locked, and nothing on your key ring fits it.',
  'act.parkedCarRole': 'Somebody’s', 'act.parkedCar': 'A parked car with the roof down and sand on the seats. Not yours.',
  'act.passingCarRole': 'Going past', 'act.passingCar': 'Somebody going round the island, slowly, because there is nowhere to be.',
  'act.passerbyRole': 'Passing', 'act.passerby': ['They lower their sunglasses, look you up and down, and smile.', 'A wave, a “hola”, and they are gone.', 'They are humming. Everybody here is humming.'],
  'act.assemblyName': 'Muster point', 'act.assemblyRole': 'In case of storms', 'act.assembly': 'Where everybody gathers when the sky turns purple.',
  'act.crossingName': 'The crossing', 'act.crossingRole': 'Push button', 'act.crossing': 'A push-button unit on a post.',
  'act.crossNowRole': 'Cross now', 'act.crossNow': 'The man is green. Nobody on this island is in a hurry anyway.',
  'act.crossFlashRole': 'Finish crossing', 'act.crossFlash': 'The man is flashing.',
  'act.crossWaitRole': 'WAIT', 'act.crossWait': 'The WAIT plate lights up.',
  'act.crossAgainRole': 'WAIT — already lit', 'act.crossAgain': 'You press it again. It was already lit.',
  'act.lightsName': 'The lights', 'act.lights': 'A signal head on a post.',
  'act.lights.green': 'Green this way', 'act.lights.amber': 'Amber this way', 'act.lights.redamber': 'Red and amber this way', 'act.lights.red': 'Red this way',
  'act.liftName': 'The lift', 'act.liftCar': 'Car at {b}', 'act.lift': 'A lift. On an island with no second floors. Buttons: {rows}.',
  'act.liftHere': 'where you are', 'act.liftHereNow': 'It is already here.', 'act.liftComing': 'You press the button.',
  'act.liftPress': 'Press {b} — {name}.', 'act.liftPressLocked': 'Press {b}.', 'act.liftLocked': 'Nothing happens.',
  'act.liftNever': 'Take the stairs. There are no stairs.',
  tagline: '“Welcome to paradise. Mind the tan lines.”',
  taglineSmall: 'Inherit a beach bar. Grow the fruit. Pour the drinks. Fall for somebody.',
  firstObjective: 'Find The Driftwood.',
  yourDesk: 'Behind the bar',
  firstTip: 'Everything on the island can be inspected — and most people can be flirted with.',
  phoneTip: 'When a guest rings a bell at the bar (🛎️ glowing), walk up and {press} <span class="kbd">E</span> to serve them.',
  overwriteSave: 'There is a saved island in this browser. Starting again will wash it away. Continue?',
  defaultNames: ['Sol', 'Remy', 'Ari', 'Nico', 'Sasha', 'Jules', 'Rio', 'Kit'],
  defaultName: 'The new owner',
  noSave: 'No saved game',
  noSaveTitle: 'Nothing saved in this browser yet.',
  continueSave: 'Continue — {name}, day {day}, {time}',
  newSave: 'Start a new summer',
  helpLabel: 'How to play',
  helpWho: 'The island',
  helpIntro: [
    'Your Uncle Rafa has left you <b>The Driftwood</b> — a beach bar on Isla Solana with a leaking roof, a loyal bartender and a garden gone wild. Make it the hottest bar in the Caribbean.',
    '<b>The bar is not the whole game, and the island is not the whole map.</b> Walk the beach, drive the buggy, find the lagoon, and see who you run into at sunset.'
  ],
  helpBody: [
    '<b>Serving is turn-based.</b> Your <b>Nerve</b> is your health and their <b>Guard</b> is what you are bringing down. Every turn they give something away — the <b>tell</b> — and a reply that answers it lands properly and builds <b>Chemistry</b>. Build enough and you can <b>seal it</b>, which tips far better than grinding them down.',
    '<b>Grow and ship.</b> Rafa’s garden grows the fruit for your cocktails. The supply boat at the jetty takes orders for the other islands and pays well for them.',
    '<b>Talk to everybody.</b> Everybody has a day of their own, and some of them would very much like to spend the evening with you.',
    '<b>J</b> jobs · <b>T</b> today’s takings · <b>I</b> bag · <b>K</b> skills · <b>C</b> island chat · <b>M</b> post · <b>V</b> texts · <b>P</b> profile · <b>L</b> achievements · <b>Esc</b> menu and settings.',
    'The Driftwood is open 11:00 to 19:00. After that it is golden hour, then sunset, and the next day starts whenever you wake up.'
  ],
  trialObjective: 'Trying {level} from the editor.',
  trialTip: 'This is your level, with the file’s writing in it — nothing here is saved and your game is untouched. Close the tab to go back.',
  levelUp: '<b>LEVEL {level}</b> — one skill point.',
  promoted: 'The island calls you: <b>{rank}</b>.',
  burnout: 'You have lost your nerve. You go and lie in the hammock for a bit. It helps. Hammocks always help.',
  obtained: 'Got: <b>{item}</b>',
  unequipped: 'Took off {item}',
  equipped: 'Wearing <b>{item}</b>',
  useNothing: 'You look at it. It looks back. Nothing happens.',
  skillPoint: '+{n} skill point.',
  noSkillPoints: 'No skill points.',
  skillRank: '<b>{skill}</b> → rank {rank}',
  relLabels: [
    'Head over heels',
    'Smitten',
    'Warm',
    'Friendly',
    'Cool',
    'Has sworn off you'
  ],
  newJob: 'New job: <b>{job}</b>',
  trackerTip: 'The line under the clock points the way to your next step. {press} it to switch jobs.',
  eraseSave: 'Wash away this summer and start again?',
  saved: 'Game saved.',
  saveFailed: 'Could not save. Your browser has said no.',
  noSaveFound: 'No saved game found.',
  restored: 'Welcome back. Day {day}, {time}.',
  saveCorrupt: 'The save file is waterlogged.',
  leaving: [
    'The last guest wobbles out onto the sand, singing.',
    'Mari flips the sign to CERRADO and pours you one.',
    'The fairy lights on the deck come on one string at a time.'
  ],
  verdicts: [
    'Legendary | People will talk about tonight for years.',
    'Red Hot | The whole beach could hear it.',
    'Warm | A good day in paradise.',
    'Lukewarm | Tomorrow the sun comes up again.',
    'Washed Out | At least the sunset was nice.'
  ],
  dayOver: '<b>Seven o’clock. Last orders.</b> The day’s takings are under <b>Takings</b> — {where}. Go and watch the sunset.',
  season: 'It is {season}. It is always {season}.',
  dayBanner: 'Day {day} · {name}',
  dayStart: 'Day {day}. {weather}. {line}',
  dayLines: ['Another day in paradise.', 'The sea is doing that glittery thing again.', 'Somewhere a ukulele has started.', 'The coffee is strong and the sun is stronger.'],
  ticker: ['Happy hour 5–7.', 'Barefoot is fine. Topless is the deck only.', 'Please do not feed the pelican.', 'Two-for-one on anything with an umbrella in it.'],

  /* THE THREE WAYS SOMEBODY TALKS TO YOU. `call` is face to face, across the
     bar; `mail` is the island post and the booking inbox; `text` is your phone. */
  'call.what': 'At the bar',
  'call.end': '🍹 Wrap it up',
  'call.title': 'At the bar · stool {n}',
  'call.said': 'They: ',
  'call.wrote': '▸ ',
  'call.pat': '{n} patience with the wait',
  'call.note': ['♪ the jukebox, softly', '♪ steel drums, from the deck', '♪ the sea, mostly'],
  'call.re': 'Wants {issue}',

  'mail.what': 'A message',
  'mail.end': '💌 Send it',
  'mail.title': 'Unanswered · in your inbox since {time}',
  'mail.said': 'Reply: ',
  'mail.wrote': '▸ You write: ',
  'mail.pat': '{n} more replies before they book somewhere else',
  'mail.note': ['Thread: 3 messages · 1 unread', 'Draft saved.'],

  'text.what': 'Texting',
  'text.end': '📱 Send',
  'text.title': 'Texting · {time}',
  'text.said': '',
  'text.wrote': '▸ You: ',
  'text.pat': '{n} before they leave you on read',
  'text.note': ['typing…', 'delivered · read', 'typing… stopped… typing…'],

  'enc.memGood': 'You have charmed one of these before. You walk up already smiling.',
  'enc.memBad': 'The last one of these went badly. You can feel your ears going pink.',
  'enc.noEnergy': 'Not enough energy.',
  'enc.landed': 'Sealed it. <b>+{xp} XP</b>',
  'enc.rapport': 'They are leaving happier than they came in. <b>+{xp} XP</b>',
  'enc.transfer': 'Mari takes over with a wink.',
  'enc.hangup': 'They have wandered off down the beach.',
  'enc.angered': 'That went badly. They tip in coins, pointedly.',
  'enc.broken': 'You lose your nerve and stare at the sea for a minute. Nobody minds.',

  'idle.desk': 'The bar is open until 19:00.',
  'idle.out': 'Out on the island. Mari is holding the fort.',
  'idle.off': 'The bar is shut. It opens again at 11:00.',

  'notify.all': 'Notifications: <b>everything</b>. The island chat included.',
  'notify.needed': 'Notifications: <b>only what needs you</b>. The chat and the log go to the rail quietly.',

  'report.calls': '🍹 Guests served',
  'report.satisfied': '😍 Left happy',
  'report.angered': '💔 Left grumpy',
  'report.transfers': '🙈 Passed to Mari',
  'report.written': '💌 Of those, by message',
  'report.owed': '📨 Still waiting on a reply',
  'report.covered': '🤝 Covered while you were out',
  'report.coffee': '☕ Coffees',
  'report.worked': '⏱️ Minutes behind the bar',
  'report.events': '🌴 Happenings',
  'report.xp': '⭐ XP gained',
  'report.money': '💶 Takings today',

  'endings.name': 'SUNSET',
  'endings.role': 'The end of the summer',
  'endings.pages': ['The sun is going down over Lovers’ Cove, and for once you are not pouring anything.', 'So: what happens to you now?'],

  'final.title': 'Your summer',
  'final.level': 'Level',
  'final.calls': 'Guests served',
  'final.days': 'Days in paradise',
  'final.achs': 'Achievements',
  'final.endings': 'Endings found',
  'final.sign': 'Thank you for playing. Wear sun cream.',

  'queue.abandonedAway': [
    'Somewhere back at the bar, a guest gives up and orders from Mari.',
    'A bell stops ringing at The Driftwood. Somebody has wandered off.'
  ],
  'queue.abandoned': [
    'A guest sighs, slides off their stool and heads for the sea.',
    'One of the bells goes quiet. They have gone to find a coconut instead.'
  ],
  'queue.coveredOne': 'A guest was waiting as you left. Mari has them.',
  'queue.covered': '{n} guests were waiting as you left. Mari is juggling them, beautifully.',

  'board.0': 'The sun has set · somebody is kissing on the jetty',
  'board.1': 'Last minute of sun · everybody hush',
  'board.2': 'Beach: packed · hearts: fluttering',
  'board.3': 'Beach: filling up · sea: glassy',
  'board.4': 'Beach: perfect · cocktails: cold',

  'car.crash': 'That will have left a mark. And a coconut.',
  'car.tooFast': 'Not at this speed. Stop first.',
  'car.parked': 'Parked. Straight, and first go. Somebody on the beach whistles.',

  'arcade.quit': 'You put it down.',
  'arcade.crash': 'Sand in the works.',
  'arcade.mins': '{n} min of the day',
  'arcade.won': 'Nailed it',
  'arcade.lost': 'That will do',
  'arcade.leave': 'Back to it',

  'empty.mail': 'Nothing in the post.',
  'empty.text': 'Nobody has texted you. Yet.',
  'empty.chat': 'The island is quiet.',
  'empty.log': 'Nothing has happened yet.',
  'empty.calls': 'Nobody served yet.',

  'comms.reply': '💌 Reply',
  'comms.writeBack': '✍️ Write back',

  'shop.pocket': '{money} in your pocket',
  'shop.poor': 'Not enough money. Maybe sell some mangoes.',

  'shift.after': '{time}. The bar is shut. Here is how the day went.',
  'shift.during': '{time}. The bar is open. The day so far.',
  'shift.before': '{time}. Before opening. Nothing poured yet.',
  'shift.verdict': 'THE VIBE',
  'shift.rating': 'The vibe is judged at seven.',
  'shift.opens': 'The bar opens at {time}.',

  'act.answer': 'SERVE',
  'tab.shift': 'Takings',
  'slot.headset': 'Eyes',
  'slot.trinket': 'Accessory',
  'slot.mug': 'Bar tool',
  'stat.energy': 'energy',

  'jobs.none': 'No jobs yet. Talk to people.',

  'inv.empty': 'Your beach bag is empty. Apart from sand.',

  'stats.title': 'Statistics',
  'stats.allTime': 'All summer',
  'stats.rep': '⭐ Reputation',
  'stats.colleagues': 'Islanders',
  'stats.town': 'Around the island',

  'stat.empathy': 'charm',
  'stat.knowledge': 'mixology',
  'stat.patience': 'nerve',
  'stat.bullshit': 'smooth talk',
  'stat.chaos': 'mischief',

  'statNote.empathy': 'How well you read a person.',
  'statNote.knowledge': 'How well you make a drink.',
  'statNote.patience': 'How long you can keep your cool.',
  'statNote.bullshit': 'How good your lines are.',
  'statNote.chaos': 'Willingness to do something reckless and fun.',

  'hit.dart': ['Oi!', 'Right. It’s on.', 'That was my ear.', 'Very mature.'],
  'hit.band': ['OW.', 'That actually stings.'],
  'hit.water': ['Oh, it’s like THAT, is it?', 'Refreshing, actually. Thank you.', 'You’re going in the sea for that.'],
  'hit.noodle': ['En garde!', 'Do that again and see what happens.'],
  'hit.pack': ['Careful.', 'Hey!'],
  'hit.ped': ['Hey!', 'Excuse me?', 'I saw that.', 'Cheeky.']
};

/* The ladder the player climbs. `lv` is the level a rank arrives at; `face`
   is the emoji the player wears from then on. */
const RANKS = [
  { n: 'Newcomer', e: '🧳', face: '😎', lv: 1 },
  { n: 'Barback', e: '🧊', face: '😎', lv: 3 },
  { n: 'Bartender', e: '🍹', face: '🍹', lv: 6 },
  { n: 'Mixologist', e: '🍸', face: '🍸', lv: 9 },
  { n: 'Host with the Most', e: '🌺', face: '🌺', lv: 12 },
  { n: 'Beach Royalty', e: '👑', face: '👑', lv: 15 },
  { n: 'Legend of the Isle', e: '🌅', face: '🌅', lv: 18 }
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* Game code on engine events, for anything a table cannot say. Every entry is
   optional; the engine calls `Hook(name, …)` and a missing one is a no-op.
     zoneEnter(z)        you walked into a zone
     callWon(E)          an ordinary encounter was won
     bossWon(key, E)     a boss was beaten
     dayEnd(day)         the report has been shown
     bought(id)          something was bought in a shop
     second()            once a second of play, from the game loop */
const HOOKS = {
  zoneEnter(z) {
    /* First time through the bar door is the first step of Mari's job. */
    if (z === 'barroom' && !G.flags.foundBar) {
      G.flags.foundBar = true;
      if (Q.active('q_arrive')) Q.step('q_arrive');
      UI.objective('Say hello to Mari behind the bar.');
    }
    if (z === 'lagoon' && !G.flags.foundLagoon) {
      G.flags.foundLagoon = true;
      Player.xp(25);
      UI.toast('💎', 'You found the <b>Hidden Lagoon</b>. Nobody told you about this. Now you have a secret.', 'gold');
      Ach.get('a_lagoon');
      if (qAt('q_kai', 1)) Q.step('q_kai');
    }
    if (z === 'cove' && !G.flags.foundCove) {
      G.flags.foundCove = true;
      Player.xp(15);
      UI.toast('💕', 'Lovers’ Cove. The lantern is lit even in daylight, as if it is waiting for somebody.', 'gold');
    }
  },
  callWon() {
    if (qAt('q_bar', 1)) { Q.step('q_bar'); Ach.get('a_settled'); }
  },
  dayEnd() { Orders.refresh(); },
  bought(id) {
    if (ITEMS[id] && ITEMS[id].crop) qTo('q_garden', 1);
  },
  /* The farm and the workshop catch up from the island's own minutes. */
  second() {
    Farm.update(); Garden.refresh();
    Craft.update(); Craft.refresh();
  },
  bossWon(key) {
    if (key === 'critic') {
      Q.complete('q_critic');
      Texts.push('Sienna Vale', '🤳', 'Review’s up 🔥 “The Driftwood: the sexiest little bar in the Caribbean. Go for the cocktails, stay for the owner.” ⭐⭐⭐⭐⭐');
      UI.objective('Somebody in a white suit is waiting by the fountain.');
    }
    if (key === 'offer') Q.complete('q_offer');
  }
};
