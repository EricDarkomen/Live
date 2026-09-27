'use strict';
/* THE GAME ITSELF — what it is called, and every word the ENGINE says.

   Everything else in data/ is a place, a person or a thing. This file is the
   rest: the name on the title screen, the currency, the storage keys, and the
   sentences the engine speaks on its own account — a phone ringing out, the
   end-of-day report, the toast when you level up. They used to be string
   literals scattered through engine/, which meant the engine was one game's
   engine. Now a new title rewrites this file and never opens engine/ to change
   a word.

   `TEXT` is read through `say(key, vars)` (engine/core.js). A value may be a
   string or a list — a list is picked from at random — and `{name}` is filled
   from `vars`. The `content` suite fails on a key the engine asks for that is
   not here, so a missing line is a red test, not a blank toast.

   Loaded FIRST of data/, because GAME.id names the storage keys and nothing
   here may name anything else. */

const GAME = {
  /* Storage keys, save files and the editor's bench are all prefixed with this.
     Every game on the same origin — two repos under one github.io account ARE
     one origin — must have its own, or they overwrite each other's saves. */
  id: 'base',
  title: 'Untitled',
  sub: 'A top-down game',
  company: 'The Company',
  currency: '£',
  version: 1
};

const TEXT = {
  'land.n': 'Land it.', 'land.d': 'Say what you will do, when, and mean it. Ends it well.',
  'land.txt': ['You say what you are going to do and when, and you do not oversell it. “Right,” they say. “Thanks.”',
    'You summarise it back in their own words. They relax. It is all anybody wanted.'],
  'track.stop': 'No longer following <b>{job}</b>.', 'track.on': 'Following <b>{job}</b>.',
  'track.noFix': 'Following <b>{job}</b>. No fix on this step — you will have to ask somebody.',
  /* The engine's own acts — engine/acts.js. */
  'act.genericRole': 'Fixture', 'act.generic': 'It is what it appears to be.',
  'act.doorRole': 'Doorway', 'act.door': 'A door. It leads to {name}.',
  'act.unlockedRole': 'Unlocked', 'act.unlocked': 'The light goes green.',
  'act.lockedRole': 'Locked', 'act.locked': 'It is locked, and nothing you have opens it.',
  'act.parkedCarRole': 'Somebody’s', 'act.parkedCar': 'A parked car. It is locked, and it is not yours.',
  'act.passingCarRole': 'Going past', 'act.passingCar': 'A car, going past, doing what cars do.',
  'act.passerbyRole': 'Passing', 'act.passerby': ['They nod. You nod. Nobody breaks stride.', 'A half-smile, and they are gone.'],
  'act.assemblyName': 'Assembly point', 'act.assemblyRole': 'In case of fire', 'act.assembly': 'The sign everybody gathers under when the alarm is real.',
  'act.crossingName': 'The crossing', 'act.crossingRole': 'Push button', 'act.crossing': 'A push-button unit on a post.',
  'act.crossNowRole': 'Cross now', 'act.crossNow': 'The man is green and the bleeper is going. The traffic has stopped for you.',
  'act.crossFlashRole': 'Finish crossing', 'act.crossFlash': 'The man is flashing. Nobody may start; anybody already out there finishes.',
  'act.crossWaitRole': 'WAIT', 'act.crossWait': 'The WAIT plate lights up. Nothing else happens yet. It is counting.',
  'act.crossAgainRole': 'WAIT — already lit', 'act.crossAgain': 'You press it again. It was already lit. Everybody does this.',
  'act.lightsName': 'The lights', 'act.lights': 'A signal head on a post, and a stop line painted across the lane in front of it.',
  'act.lights.green': 'Green this way', 'act.lights.amber': 'Amber this way', 'act.lights.redamber': 'Red and amber this way', 'act.lights.red': 'Red this way',
  'act.liftName': 'The lift', 'act.liftCar': 'Car at {b}', 'act.lift': 'A pair of steel doors and a light over them showing {b}. Buttons: {rows}.',
  'act.liftHere': 'where you are', 'act.liftHereNow': 'It is already here.', 'act.liftComing': 'You press the button and the light starts counting.',
  'act.liftPress': 'Press {b} — {name}.', 'act.liftPressLocked': 'Press {b}.', 'act.liftLocked': 'The button lights. The car does not move.',
  'act.liftNever': 'Change your mind.',
  tagline: '“A new game.”',
  taglineSmall: 'Everything here is a placeholder.',
  firstObjective: 'Find your desk.',
  yourDesk: 'Your desk',
  firstTip: 'Everything here can be inspected.',
  phoneTip: 'When a phone rings (☎️ glowing amber), walk to it and {press} <span class="kbd">E</span>.',
  overwriteSave: 'There is a saved game in this browser. Starting a new one will overwrite it. Continue?',
  defaultNames: ['Sam', 'Jo', 'Alex', 'Kit', 'Robin', 'Ash'],
  defaultName: 'New starter',
  noSave: 'No saved game',
  noSaveTitle: 'Nothing saved in this browser yet.',
  continueSave: 'Continue — {name}, day {day}, {time}',
  newSave: 'Start a new game',
  helpLabel: 'How to play',
  helpWho: 'The job',
  helpIntro: [
    'Work arrives. You claim it, you resolve it, and at the end of the day it is added up.',
    '<b>The job is not the whole game, and the building is not the whole map.</b> Step outside and the day carries on without you.'
  ],
  helpBody: [
    '<b>Encounters are turn-based.</b> Your <b>Patience</b> is your health and their <b>Frustration</b> is what you are bringing down. Every turn they give something away — the <b>tell</b> — and a reply that answers it lands properly and builds <b>Rapport</b>. Build enough and you can <b>land</b> it, which pays better than grinding it down.',
    '<b>Talk to everybody. Go everywhere.</b> Every person has a day of their own and every object can be pressed.',
    '<b>J</b> jobs · <b>T</b> today’s figures · <b>I</b> inventory · <b>K</b> skills · <b>C</b> chat · <b>M</b> email · <b>P</b> profile · <b>L</b> achievements · <b>Esc</b> menu and settings.',
    'The working day runs 09:00 to 17:00. The clock carries on after it, it gets dark, and the next day starts at nine wherever you are standing.'
  ],
  trialObjective: 'Trying {level} from the editor.',
  trialTip: 'This is your level, with the file’s writing in it — nothing here is saved and your game is untouched. Close the tab to go back.',
  levelUp: '<b>LEVEL {level}</b> — one skill point.',
  promoted: 'PROMOTED: <b>{rank}</b>.',
  burnout: 'You have run out of patience. You stop for a while. It helps, a little.',
  obtained: 'Obtained: <b>{item}</b>',
  unequipped: 'Unequipped {item}',
  equipped: 'Equipped <b>{item}</b>',
  useNothing: 'You look at it. Nothing happens.',
  skillPoint: '+{n} skill point.',
  noSkillPoints: 'No skill points.',
  skillRank: '<b>{skill}</b> → rank {rank}',
  relLabels: [
    'Would do anything for you',
    'Fond of you',
    'Warm',
    'Acquaintance',
    'Cool',
    'Has told someone about you'
  ],
  newJob: 'New job: <b>{job}</b>',
  trackerTip: '{press} the pin beside a job to be shown the way to it.',
  eraseSave: 'Erase this game and start again?',
  saved: 'Game saved.',
  saveFailed: 'Could not save. Your browser has said no.',
  noSaveFound: 'No saved game found.',
  restored: 'Game restored. Day {day}, {time}.',
  saveCorrupt: 'The save file is corrupt.',
  leaving: [
    'The building empties around you.',
    'Somebody says goodnight. You say goodnight.',
    'The lights go off a floor at a time behind you.'
  ],
  verdicts: [
    'Outstanding | You could not have done more.',
    'Exceeds Expectations | A good day.',
    'Meets Expectations | A day.',
    'Developing | There is always tomorrow.',
    'Statistically Acceptable | It is over, at least.'
  ],
  dayOver: '<b>That is five.</b> Your figures for the day are under <b>Shift</b> — {where}.',
  season: 'It is {season} now.',
  dayBanner: 'Day {day} · {name}',
  dayStart: 'Day {day}. {weather}. {line}',
  dayLines: ['A new day.', 'Nine o’clock.'],
  ticker: ['Welcome.', 'Please keep this area tidy.', 'The kettle is not a toy.'],

  'call.what': 'Telephone call',
  'call.end': '📞 End call',
  'call.title': 'Incoming call · queue position {n}',
  'call.said': 'They: ',
  'call.wrote': '▸ ',
  'call.pat': '{n} patience left',
  'call.note': ['♪ hold music', '♪ hold music, again', '♪ still holding'],
  'call.re': 'Re: {issue}',

  'mail.what': 'Email exchange',
  'mail.end': '✉️ Send it',
  'mail.title': 'Unanswered email · in your inbox since {time}',
  'mail.said': 'Reply: ',
  'mail.wrote': '▸ You write: ',
  'mail.pat': '{n} more replies before they escalate',
  'mail.note': ['Thread: 4 messages · 1 unread', 'Draft saved.'],

  'text.what': 'Text conversation',
  'text.end': '📱 Send',
  'text.title': 'Text conversation · {time}',
  'text.said': '',
  'text.wrote': '▸ You: ',
  'text.pat': '{n} before they give up on you',
  'text.note': ['typing…', 'delivered · read'],

  'enc.memGood': 'You have handled one of these before, and it went well. You start on the front foot.',
  'enc.memBad': 'The last one of these went badly. You can hear yourself bracing for it.',
  'enc.noEnergy': 'Not enough energy.',
  'enc.landed': 'You landed it. <b>+{xp} XP</b>',
  'enc.rapport': 'They came off that better than they went on. <b>+{xp} XP</b>',
  'enc.transfer': 'It is somebody else’s now.',
  'enc.hangup': 'They have gone.',
  'enc.angered': 'That went badly.',
  'enc.broken': 'You stop, and take a moment. Nobody says anything.',

  'idle.desk': 'Work until 17:00.',
  'idle.out': 'Out and about. Work carries on without you.',
  'idle.off': 'Off shift. The next one starts at 09:00.',

  'notify.all': 'Notifications: <b>everything</b>. The chat included.',
  'notify.needed': 'Notifications: <b>only what needs you</b>. The chat and the log go to the rail quietly.',

  'report.calls': '📞 Handled',
  'report.satisfied': '😊 Went well',
  'report.angered': '💔 Went badly',
  'report.transfers': '🙈 Passed on',
  'report.written': '✉️ Of those, answered in writing',
  'report.owed': '📨 Still waiting on a reply',
  'report.covered': '🤝 Covered while you were out',
  'report.coffee': '☕ Coffee consumed',
  'report.worked': '⌨️ Minutes of actual work',
  'report.events': '🌩️ Incidents',
  'report.xp': '⭐ XP gained',
  'report.money': '💷 Earned today',

  'endings.name': 'AFTER',
  'endings.role': 'The end of it',
  'endings.pages': ['It is quiet. Whatever happens next is up to you.', 'So: what happens to you now?'],

  'final.title': 'Final numbers',
  'final.level': 'Level',
  'final.calls': 'Handled',
  'final.days': 'Days',
  'final.achs': 'Achievements',
  'final.endings': 'Endings found',
  'final.sign': 'Thank you for playing.',

  'queue.abandonedAway': [
    'A phone rings out on another floor. You are still on shift.',
    'Somewhere in the building, a caller gives up.'
  ],
  'queue.abandoned': [
    'A phone stops ringing on its own. Somebody has given up.',
    'One of the phones goes quiet.'
  ],
  'queue.coveredOne': 'A phone was ringing as you left. Somebody else has taken it.',
  'queue.covered': '{n} phones were ringing as you left. Somebody else has them.',

  'board.0': 'Service level: acceptable',
  'board.1': 'Service level: within tolerance',
  'board.2': 'Service level: degraded',
  'board.3': 'Service level: under review',
  'board.4': 'Service level: no longer being measured',

  'car.crash': 'That will have left a mark.',
  'car.tooFast': 'Not at this speed. Stop the car first.',
  'car.parked': 'Parked. Straight, between the lines, first go.',

  'arcade.quit': 'You put it down.',
  'arcade.crash': 'The machine has crashed.',
  'arcade.mins': '{n} min of the day',
  'arcade.won': 'Cleared',
  'arcade.lost': 'That will do',
  'arcade.leave': 'Back to it',

  'empty.mail': 'Inbox zero.',
  'empty.text': 'Nobody has texted you.',
  'empty.chat': 'Quiet.',
  'empty.log': 'Nothing has happened yet.',
  'empty.calls': 'Nothing handled yet.',

  'comms.reply': '⌨️ Reply',
  'comms.writeBack': '✍️ Write back',

  'shop.pocket': '{money} in your pocket',
  'shop.poor': 'Not enough money.',

  'shift.after': '{time}. The working day is over. These are the figures.',
  'shift.during': '{time}. The day is still running. These are the figures so far.',
  'shift.before': '{time}. Before nine. Nothing has happened yet.',
  'shift.verdict': 'OVERALL PERFORMANCE',
  'shift.rating': 'The rating is worked out at five.',
  'shift.opens': 'Work starts at {time}.',

  'jobs.none': 'No jobs yet. Talk to people.',

  'inv.empty': 'Your pockets are empty.',

  'stats.title': 'Statistics',
  'stats.allTime': 'All time',
  'stats.rep': '⭐ Reputation',
  'stats.colleagues': 'Colleagues',
  'stats.town': 'Around town',

  'stat.empathy': 'empathy',
  'stat.knowledge': 'knowledge',
  'stat.patience': 'patience',
  'stat.bullshit': 'bluff',
  'stat.chaos': 'chaos',

  'statNote.empathy': 'How well you handle a person.',
  'statNote.knowledge': 'How well you handle a system.',
  'statNote.patience': 'How long you can keep going.',
  'statNote.bullshit': 'How convincingly you can say nothing.',
  'statNote.chaos': 'Willingness to make a bad decision quickly.',

  'hit.dart': ['Oi.', 'Right.', 'That was my ear.', 'Very mature.'],
  'hit.band': ['OW.', 'That actually stings.'],
  'hit.water': ['Do you mind.', 'Lovely. Thank you.'],
  'hit.noodle': ['En garde, then.', 'Do that again and I will get mine.'],
  'hit.pack': ['Careful.', 'Read it, don’t swing it.'],
  'hit.ped': ['Alright.', 'Excuse me?', 'I saw that.', 'Wonderful.']
};

/* The ladder the player climbs. `lv` is the level a rank arrives at; `face`
   is the emoji the player wears from then on. */
const RANKS = [
  { n: 'Trainee', e: '🧑‍🎓', face: '🧑‍🎓', lv: 1 },
  { n: 'Junior', e: '📞', face: '🧑‍💻', lv: 3 },
  { n: 'Senior', e: '⭐', face: '🧑‍💻', lv: 6 },
  { n: 'Lead', e: '🧑‍💼', face: '🧑‍💼', lv: 9 },
  { n: 'Expert', e: '🧠', face: '🧑‍💼', lv: 12 },
  { n: 'Manager', e: '👔', face: '👔', lv: 15 },
  { n: 'Director', e: '👑', face: '👑', lv: 18 }
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* Game code on engine events, for anything a table cannot say. Every entry is
   optional; the engine calls `Hook(name, …)` and a missing one is a no-op.
     callWon(E)          an ordinary encounter was won
     bossWon(key, E)     a boss was beaten (after its BOSSES row has paid out)
     dayEnd(day)         the report has been shown
   Keep every hook one-way and flagged: an event you can repeat walks a job
   tracker off the end of its own job. */
const HOOKS = {
  /* Walking into the meeting room is the first step of Pat's job. */
  zoneEnter(z) {
    if (z === 'meeting' && Q.active('q_look') && !G.flags.sawMeeting) {
      G.flags.sawMeeting = true;
      Q.step('q_look');
    }
  }
};
