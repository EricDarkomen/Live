'use strict';
/* The encounters: who sits down at the bar (CALLERS), who messages you
 * (INBOUND), what they really want and how they give it away (NEEDS, TELLS),
 * what you can do about it (MOVES), and the big ones (BOSSES).
 *
 * The meters, in the engine's words and ours: their `frus` is their GUARD —
 * how far they are from being won over; `agg` is how hard their mood knocks
 * your NERVE each turn; `pat` is how long they will wait for you. */

/* ---------------- Guests at the bar ---------------- */
const CALLERS = [
  { id: 'honeymoon', name: 'Two honeymooners', face: '🥂', w: 1, frus: 30, agg: 3, pat: 140, first: true,
    issues: [
      'something romantic, with two straws'
    ],
    open: [
      '“We just got married!” They say it together, then kiss. For some time.'
    ],
    mid: [
      '“What would you recommend for… a very special night?”',
      '“Sorry. Sorry. We’ll stop. We won’t stop.”'
    ],
    hot: [
      '“Is it always this slow? We have plans.”'
    ],
    win: [
      '“This is perfect. YOU are perfect. We’re going to name our boat after you.”'
    ] },
  { id: 'hens', name: 'A hen party', face: '👰', w: 10, frus: 55, agg: 6, pat: 90, needs: ['over', 'over', 'serious'],
    issues: [
      'something pink, strong, and immediately',
      'a round of shots and a dare'
    ],
    open: [
      '“WOOOOO!” Eight women in matching sashes arrive at once. The bride is wearing a veil and a snorkel.'
    ],
    mid: [
      '“Is the bartender single? Asking for the bride. The bride is asking.”',
      '“Say something in a sexy accent!”'
    ],
    hot: [
      '“The bar on Cayo Rosa gave us free shots.”'
    ],
    win: [
      '“We LOVE you. Come to the wedding. Seriously. Kerry, give them your number.”'
    ] },
  { id: 'sunburnt', name: 'A very sunburnt tourist', face: '🥵', w: 10, frus: 40, agg: 4, pat: 150, needs: ['heard', 'heard', 'answer'], soft: 0.6,
    issues: [
      'anything cold, and some sympathy'
    ],
    open: [
      '“I fell asleep. On the beach. Face down. For four hours.”'
    ],
    mid: [
      '“Everything hurts. My opinions hurt.”',
      '“Can you put ice on the back of my knees? No? Fair.”'
    ],
    hot: [
      '“Don’t laugh. You’re laughing.”'
    ],
    win: [
      '“You’re an angel. A cold, cold angel.”'
    ] },
  { id: 'stranger', name: 'A handsome stranger', face: '😏', w: 9, frus: 60, agg: 7, pat: 110, needs: ['serious', 'over', 'serious'],
    issues: [
      'something surprising — “surprise me”'
    ],
    open: [
      '“Surprise me.” They say it slowly, looking at you and not at the menu.'
    ],
    mid: [
      '“Do you flirt with everybody, or should I feel special?”',
      '“I’m only on the island for one night.”'
    ],
    hot: [
      '“You’re trying too hard. It’s cute. It’s still trying too hard.”'
    ],
    win: [
      '“Well.” They fold a note under the glass. “Maybe I’ll stay two nights.”'
    ] },
  { id: 'yacht', name: 'Somebody off a yacht', face: '🛥️', w: 7, frus: 70, agg: 8, pat: 80, needs: ['serious', 'answer', 'serious'],
    issues: [
      'champagne, which you do not have',
      'the “VIP section”, which is a beanbag'
    ],
    open: [
      '“Is there a VIP section?” They take off their sunglasses to look disappointed at you.'
    ],
    mid: [
      '“On my yacht we have a bartender who used to work for a prince.”',
      '“Do you take black cards?”'
    ],
    hot: [
      '“I could buy this bar. Genuinely. Right now.”'
    ],
    win: [
      '“Fine. It’s charming. YOU are charming. Keep the change. All of it.”'
    ] },
  { id: 'heartbroken', name: 'Somebody who has just been dumped', face: '💔', w: 8, frus: 45, agg: 3, pat: 180, needs: ['heard', 'heard', 'serious'], soft: 0.7,
    issues: [
      'a strong drink and somebody to talk to'
    ],
    open: [
      '“He dumped me. By text. On our holiday. From the other sun lounger.”'
    ],
    mid: [
      '“Am I unlovable? Don’t answer that. Answer that.”',
      '“He’s over there. With a woman called Chantelle.”'
    ],
    hot: [
      '“You’re just being nice because it’s your job.”'
    ],
    win: [
      '“You know what? I’m going to go and dance. Badly. On purpose. Thank you.”'
    ] },
  { id: 'regulars', name: 'Two fishermen, still in their boots', face: '🎣', w: 6, frus: 35, agg: 4, pat: 160, needs: ['answer', 'over'],
    issues: [
      'two beers and the football on the radio'
    ],
    open: [
      '“Two beers. Rafa knew. Rafa always knew.”'
    ],
    mid: [
      '“Caught a fish this big today.” The fish grows every time they tell it.',
      '“Radio. Football. Please.”'
    ],
    hot: [
      '“Rafa never made us wait.”'
    ],
    win: [
      '“You’ll do. Rafa would be proud.” They leave a fish on the bar as a tip.'
    ] },
];

/* ---------------- Messages ----------------
   What arrives on your phone rather than across the bar: bookings, questions,
   and somebody who got your number off a napkin. They wait; there is no
   abandon timer, and `lines` are what they write back. */
const INBOUND = [
  { id: 'booking', ch: 'mail', w: 10, face: '💍',
    from: 'Priya & Tom <wedding@example.com>',
    subj: 'Wedding party — can you do 40?',
    body: 'Hi!\n\nWe’re getting married on the beach next month and our planner quit. Can The Driftwood do drinks for forty people? And maybe a signature cocktail? And a sunset? Is the sunset included?\n\nPriya (the bride, very stressed) x',
    name: 'PRIYA & TOM', issue: 'Re: Wedding party — can you do 40?',
    frus: 70, agg: 4, pat: 160,
    lines: {
      open: ['OMG thank you for replying. Okay. Questions. So many questions.'],
      mid: ['Tom wants a drink called “The Tom”. Please say no.', 'Is the sunset REALLY guaranteed?'],
      hot: ['The resort on San Tomás said they could do it cheaper…'],
      win: ['You are an actual lifesaver. See you in June!! xxx'] } },
  { id: 'napkin', ch: 'text', w: 8, face: '😘',
    from: 'Unknown number',
    subj: 'hey it’s me from last night',
    body: 'hey it’s me. from the bar. the one who did the limbo 🙈 found your number on a napkin. do you remember me',
    name: 'UNKNOWN NUMBER', issue: 'Re: from last night',
    frus: 50, agg: 3, pat: 140,
    lines: {
      open: ['ok good you replied 😅'],
      mid: ['so do you actually remember me or', 'sorry that was needy lol'],
      hot: ['wow ok'],
      win: ['😍 ok see you tonight then. save me a stool'] } }
];

/* ---- What a guest actually wants ----
   The keys are the engine's; the words are ours. Each turn the guest has a
   NEED and gives a TELL, a turn ahead, as something they do. A move that
   serves the need lands properly and builds chemistry. */
const NEEDS = {
  heard: { e: '👂', n: 'somebody to listen', next: ['answer', 'answer', 'serious'] },
  answer: { e: '🍹', n: 'a proper drink', next: ['over', 'serious', 'heard'] },
  over: { e: '🎉', n: 'a bit of fun', next: ['answer', 'serious'] },
  serious: { e: '💖', n: 'to feel special', next: ['answer', 'heard', 'over'] },
};
const TELLS = {
  heard: [
    'They start with “So, the thing is…” and settle in.',
    'They are turning a coaster over and over in their fingers.',
    'A long look at the sea, waiting for you to ask.'
  ],
  answer: [
    'They are reading the cocktail board with real hunger.',
    'They drum on the bar and glance at the blender.',
    '“What’s good here? Actually good?”'
  ],
  over: [
    'They are dancing in their seat to the jukebox.',
    '“Come on, let’s have some FUN.”',
    'They have already put a paper umbrella behind their ear.'
  ],
  serious: [
    'They check their reflection in the back of a spoon.',
    '“I bet you say that to everyone.”',
    'They are watching you work, chin in hand.'
  ],
};

const MOVES = [
  { id: 'listen', e: '👂', n: 'Lean on the bar and listen.', d: 'Let them say it all. Nod in the right places.', serves: ['heard'], cost: { pat: 2 },
    run(E) {
      return { dmg: 10 + P.eff.empathy * 2 + Sk.rank('empathy') * 3, txt: pick([
        'You lean on the bar, chin on your hand, and let them tell you everything. It helps.',
        'You listen like there is nobody else on the island.']), stat: 'empathy' };
    } },
  { id: 'explain', e: '🍸', n: 'Mix them something perfect.', d: 'The right drink, made properly, with a flourish.', serves: ['answer'], cost: { pat: 1, ene: 2 },
    run(E) {
      return { dmg: 11 + P.eff.knowledge * 2 + Sk.rank('product') * 3, txt: pick([
        'Ice, rum, lime, a twist, a flip of the shaker. They actually gasp.',
        'You make it exactly the way they did not know they wanted it.']), stat: 'knowledge' };
    } },
  { id: 'fast', e: '⚡', n: 'Pour it quick.', d: 'No show, no wait. Cold drink, now.', serves: ['over'], cost: { ene: 3 },
    run(E) {
      return { dmg: 10 + Sk.rank('system') * 3, txt: pick([
        'It is in front of them before they finish the sentence.',
        'Two seconds, one glass, zero drips.']), stat: 'knowledge' };
    } },
  { id: 'respect', e: '💖', n: 'Give them your full attention.', d: 'Eye contact. Their name. Mean it.', serves: ['serious'], cost: { pat: 2 },
    run(E) {
      return { dmg: 11 + P.eff.empathy * 1.5 + Sk.rank('persuade') * 3, txt: pick([
        'You look them right in the eye and ask their name, and remember it.',
        'For thirty seconds they are the only person at the bar, and they know it.']), stat: 'empathy' };
    } },
  { id: 'corporate', e: '😎', n: 'Turn on the charm.', d: 'A line. A good one. Hopefully.', serves: ['serious', 'over'], cost: { ene: 2 },
    run(E) {
      return { dmg: 7 + P.eff.bullshit * 2 + Sk.rank('corp') * 3, txt: pick([
        '“This one’s called a Driftwood Kiss. I just invented it. For you.”',
        '“You know the sunset’s at quarter past eight? Best seat’s right here.”']), stat: 'bullshit' };
    } },
  { id: 'sorry', e: '🎁', n: 'This one’s on the house.', d: 'It costs you a drink. It buys you a lot.', serves: ['heard', 'serious'], cost: { pat: 1 },
    run(E) {
      return { dmg: 8 + P.eff.empathy * 1, txt: 'You wave their money away. “On the house.” Their whole face changes.', stat: 'empathy' };
    } },
  { id: 'joke', e: '😘', n: 'Flirt, shamelessly.', d: 'High risk. Occasionally spectacular.', serves: ['over'], cost: { pat: 3 },
    run(E) {
      return { dmg: 12 + P.eff.chaos * 2 + Sk.rank('sarcasm') * 4, txt: pick([
        'You wink. Actually wink. It works. You are as surprised as they are.',
        'You slide the drink over with one finger and say something you will think about in the shower tomorrow.']), stat: 'chaos' };
    } },
];

const BOSSES = {
  critic: { title: 'THE REVIEW', face: '🤳', sub: 'Sienna Vale · 2.1M followers · the deck',
    phases: [
      { n: 'THE FIRST SIP', frus: 60, agg: 7, lines: [
        '“Hm.” She sips. She films herself sipping. She sips again.',
        '“Is this the house special? It’s very… special.”',
        '“My followers want authentic. Are you authentic?”'
      ] },
      { n: 'THE STORY', frus: 80, agg: 9, lines: [
        '“Tell me why I should care about this place. Thirty seconds. Go.”',
        '“Every beach bar has a sunset. What else have you got?”',
        '“Give me something I can’t get anywhere else.”'
      ] }],
    breather: 'She takes forty photographs of the sea. You get a moment.',
    win: 'criticDone',
    ach: 'a_review',
    pay: { money: 60, rep: 15 },
    rel: { mari: 2 },
    lost: 'She wanders off to film the pelican. It is not over — she will be back.',
    after: { name: 'SIENNA VALE', role: 'Influencer', pages: ['“Okay. Okay. I’m obsessed.” She is typing already.', '“Five stars. The drinks, the view — and the owner. Especially the owner.”'] } },
  offer: { title: 'THE OFFER', face: '💼', sub: 'Blake Sterling · the plaza · two million euros',
    phases: [
      { n: 'THE CHARM', frus: 70, agg: 7, lines: [
        '“Look at you. You’re good at this. Imagine how good you’d be with money.”',
        '“I like you. I do. Which is why I’m making this easy.”',
        '“Let me buy you a drink. Oh — you own the bar. For now.”'
      ] },
      { n: 'THE NUMBER', frus: 90, agg: 9, lines: [
        '“Two million. Two and a half. Name it.”',
        '“Mari keeps her job. Probably. In a uniform.”',
        '“Nobody says no to Sterling Resorts. My father taught me that.”'
      ] },
      { n: 'THE THREAT', frus: 100, agg: 11, lines: [
        '“There are permits. Inspections. Things can go wrong for a little bar.”',
        '“Your uncle beat my father at dominoes. I don’t play dominoes.”',
        '“Last chance. After this, the price goes down.”'
      ] }],
    breather: 'Blake’s phone rings. He turns away to shout at somebody. You breathe.',
    win: 'finalDone',
    ach: 'a_stayed',
    pay: { money: 100, rep: 20 },
    rel: { mari: 2, coco: 2 },
    lost: 'Blake smiles and hands you his card again. “Think about it.”',
    after: { name: 'BLAKE STERLING', role: 'Sterling Resorts', pages: ['He loosens his tie, for the first time since he arrived.', '“Fine. Keep your shack.” A pause. “The mojitos really are very good.”'] } },
};
