'use strict';
/* The encounters: who is on the other end (CALLERS, INBOUND), what they need
 * and how they give it away (NEEDS, TELLS), what you can say back (MOVES), and
 * the multi-phase ones (BOSSES), whose consequences are fields on their row.
 */

/* ---------------- Callers ---------------- */
const CALLERS = [
  { id: 'polite', name: 'A polite caller', face: '🙂', w: 1, frus: 30, agg: 3, pat: 140, first: true,
    issues: [
      'a bill that is a little higher than expected'
    ],
    open: [
      '“Sorry to bother you. It’s probably nothing.”'
    ],
    mid: [
      '“No, take your time.”',
      '“Is it me?”'
    ],
    hot: [
      '“I don’t want to be difficult.”'
    ],
    win: [
      '“Brilliant, thank you. That’s really helped.”'
    ] },
  { id: 'busy', name: 'Somebody between meetings', face: '🧑‍💼', w: 12, frus: 45, agg: 6, pat: 80, needs: ['over', 'over', 'answer'],
    issues: [
      'an order that has not arrived',
      'a login that does not work'
    ],
    open: [
      '“I’ve got five minutes.”'
    ],
    mid: [
      '“Can we speed this up?”',
      '“Hold on — no, carry on.”'
    ],
    hot: [
      '“This is exactly the problem.”'
    ],
    win: [
      '“Right. Good. Thanks.”'
    ] },
  { id: 'long', name: 'A caller with a long story', face: '🧓', w: 10, frus: 40, agg: 4, pat: 160, needs: ['heard', 'heard', 'answer'], soft: 0.6,
    issues: [
      'a letter that nobody can explain'
    ],
    open: [
      '“It started in March.”'
    ],
    mid: [
      '“Where was I?”',
      '“Anyway.”'
    ],
    hot: [
      '“Nobody ever listens.”'
    ],
    win: [
      '“Well. That’s the first time anyone’s listened.”'
    ] },
  { id: 'cross', name: 'An angry caller', face: '😠', w: 8, frus: 60, agg: 9, pat: 70,
    issues: [
      'being charged twice',
      'being cut off three times'
    ],
    open: [
      '“Finally.”'
    ],
    mid: [
      '“Don’t put me on hold.”',
      '“I want to speak to someone.”'
    ],
    hot: [
      '“I am recording this call.”'
    ],
    win: [
      '“…Fine. Thank you. I suppose.”'
    ] },
  { id: 'formal', name: 'A formal enquiry', face: '🎩', w: 6, frus: 50, agg: 5, pat: 100,
    issues: [
      'a matter that requires escalation'
    ],
    open: [
      '“I should like this noted.”'
    ],
    mid: [
      '“For the record.”'
    ],
    hot: [
      '“I shall be writing to your manager.”'
    ],
    win: [
      '“That is satisfactory. Good day.”'
    ] },
];

/* ---------------- INBOUND: the work that arrives in writing ----------------
   A CALLER IS AN HOUR AND A ROOM. An email is neither, and that is the whole
   reason this is a separate table rather than a flag on CALLERS.

   The phones are the premises: they ring on the fourth floor, they stop when
   you leave the building, and a caller gives up after forty-two seconds. Every
   line in CALLERS is written to be SAID, out loud, at a person who is on the
   other end right now — which is why they are full of "sorry", "one sec" and
   somebody going into a tunnel. None of that survives being typed.

   What arrives in writing has the opposite properties and wants the opposite
   numbers. It has been composed, so it comes in ANGRIER than any phone call
   (`frus` is high) and lands SOFTER per turn (`agg` is low), because prose
   cannot shout at you in real time — it can only be read again. It waits, so
   there is no abandon timer and `pat` is generous: what runs out is not their
   patience with holding, it is their patience with being replied to badly.
   And it follows you: Inbound.tick() does not ask Levels.onSite(), so one of
   these can land while you are standing on a beach, and answering it there is
   the point rather than a loophole.

   `lines` are therefore the replies THEY WRITE BACK, and they are written as
   writing: paragraph breaks, a signature, the passive voice of somebody who
   has looked up a phrase. `win` is the last message in the thread.

   One of each per shift — see Inbound.arrive(). These are pieces rather than a
   deck of statistics, and a second copy of one reads as the game repeating
   itself rather than as a busy inbox. */
const INBOUND = [
  { id: 'complaint', ch: 'mail', w: 10, face: '📄',
    from: 'A customer <customer@example.com>',
    subj: 'Complaint — second attempt',
    body: 'Hello,\n\nI wrote last week and have heard nothing back.\n\nI would like an explanation, and I would like it in writing.\n\nRegards',
    name: 'A CUSTOMER', issue: 'Re: Complaint — second attempt',
    frus: 80, agg: 5, pat: 160,
    lines: {
      open: ['Thank you for replying. It does not answer the question.'],
      mid: ['I have kept a copy of everything.', 'Please do not send me the link again.'],
      hot: ['I will be taking this further.'],
      win: ['Thank you. That is an answer, and it is in writing.\n\nRegards'] } },
  { id: 'textback', ch: 'text', w: 8, face: '📱',
    from: 'Unknown number',
    subj: 'Is this the right number?',
    body: 'Hi is this the right number for support? Got it off a letter',
    name: 'UNKNOWN NUMBER', issue: 'Re: is this the right number',
    frus: 60, agg: 4, pat: 120,
    lines: {
      open: ['ok great so'],
      mid: ['sorry one sec', 'still there?'],
      hot: ['this is taking ages'],
      win: ['brilliant thank you!!'] } }
];


/* ---- What the caller actually wants ----
   Each turn the caller has a NEED and gives a TELL, announced a turn ahead as
   something they do rather than as a number. A move that serves the need lands
   properly and builds rapport; one that serves a different need lands short.
   Moves with no `serves` are neutral — hold, mute and the transfers are about
   you, not them. */
const NEEDS = {
  heard: { e: '👂', n: 'to be heard', next: ['answer', 'answer', 'serious'] },
  answer: { e: '❓', n: 'a straight answer', next: ['over', 'serious', 'heard'] },
  over: { e: '⏱️', n: 'this to be over', next: ['answer', 'serious'] },
  serious: { e: '🎩', n: 'to be taken seriously', next: ['answer', 'heard', 'over'] },
};
const TELLS = {
  heard: [
    'They tell you the whole story, from the beginning.',
    '“I just think somebody should know.”',
    'A long pause, waiting for you to say something.'
  ],
  answer: [
    '“So is it yes or no?”',
    'They read the reference number out twice.',
    '“I don’t need the background, I need to know.”'
  ],
  over: [
    'You can hear them walking somewhere.',
    '“I’ve got five minutes.”',
    'They sigh before you have said anything.'
  ],
  serious: [
    'They give their full title, unprompted.',
    '“I’ve been a customer for eleven years.”',
    '“I’d like this noted.”'
  ],
};

const MOVES = [
  { id: 'listen', e: '👂', n: 'Let them finish.', d: 'Say nothing until they have said everything.', serves: ['heard'], cost: { pat: 2 },
    run(E) {
      return { dmg: 10 + P.eff.empathy * 2 + Sk.rank('empathy') * 3, txt: pick([
        'You let them get to the end. It takes a while. It helps.',
        'You say “mm” in the right places.']), stat: 'empathy' };
    } },
  { id: 'explain', e: '📖', n: 'Explain it plainly.', d: 'The answer, without the background.', serves: ['answer'], cost: { pat: 1, ene: 2 },
    run(E) {
      return { dmg: 11 + P.eff.knowledge * 2 + Sk.rank('product') * 3, txt: pick([
        'You tell them what happened and what happens next.',
        'You give them the answer in one sentence.']), stat: 'knowledge' };
    } },
  { id: 'fast', e: '⏩', n: 'Get to the point.', d: 'Skip everything that can be skipped.', serves: ['over'], cost: { ene: 3 },
    run(E) {
      return { dmg: 10 + Sk.rank('system') * 3, txt: pick([
        'You skip straight to the part that fixes it.',
        'Two clicks, done.']), stat: 'knowledge' };
    } },
  { id: 'respect', e: '🎩', n: 'Take it seriously.', d: 'Say their name. Write it down. Mean it.', serves: ['serious'], cost: { pat: 2 },
    run(E) {
      return { dmg: 11 + P.eff.empathy * 1.5 + Sk.rank('persuade') * 3, txt: pick([
        'You tell them you are writing it down, and you are.',
        'You use their name and their title.']), stat: 'empathy' };
    } },
  { id: 'corporate', e: '💼', n: 'Say something corporate.', d: 'Words that sound like an answer.', serves: ['serious', 'over'], cost: { ene: 2 },
    run(E) {
      return { dmg: 7 + P.eff.bullshit * 2 + Sk.rank('corp') * 3, txt: pick([
        '“I completely understand your frustration.”',
        '“Let me take that away and circle back.”']), stat: 'bullshit' };
    } },
  { id: 'sorry', e: '🙏', n: 'Apologise.', d: 'It costs nothing and it is not nothing.', serves: ['heard', 'serious'], cost: { pat: 1 },
    run(E) {
      return { dmg: 8 + P.eff.empathy * 1, txt: 'You say sorry, and mean it, which they can hear.', stat: 'empathy' };
    } },
  { id: 'joke', e: '😏', n: 'Make a joke.', d: 'High risk. Occasionally brilliant.', serves: ['over'], cost: { pat: 3 },
    run(E) {
      return { dmg: 12 + P.eff.chaos * 2 + Sk.rank('sarcasm') * 4, txt: 'They laugh. You did not expect that. Neither did they.', stat: 'chaos' };
    } },
];

const BOSSES = {
  review: { title: 'THE REVIEW', face: '📊', sub: 'Morgan · the meeting room · half an hour',
    phases: [
      { n: 'THE NUMBERS', frus: 60, agg: 7, lines: [
        '“Let’s look at your numbers.”',
        '“How do you think it’s going?”',
        '“Interesting.”'
      ] },
      { n: 'THE FEEDBACK', frus: 80, agg: 9, lines: [
        '“There’s one small thing.”',
        '“Where do you see yourself?”',
        '“Let’s set some goals.”'
      ] }],
    breather: 'Morgan checks their phone. You get a moment.',
    win: 'finalDone',
    ach: 'a_review',
    pay: { money: 10, rep: 10 },
    rel: { morgan: 2 },
    lost: 'The review is not over. It has been adjourned.',
    after: { name: 'MORGAN', role: 'Manager', pages: ['“Good. That’s the review done.”', '“Now: what’s next for you?”'] } },
};
