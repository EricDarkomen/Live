'use strict';
/* The people of Isla Solana and everything they say.
 *
 * A person is a definition plus a dialogue tree. Dialogue.choose() resolves a
 * choice's `to` as a node id or an object and never as a function, so a branch
 * that depends on game state is two choices with mutually exclusive `if:`s.
 *
 *   level     the level they spend their day on (there is no lift: nobody
 *             changes level on foot, so a trip elsewhere is an `out:` window)
 *   desk      their spot on it — behind the bar, the lifeguard tower, the jetty
 *   schedule  [minute, waypoint] pairs; 'desk' is their own spot
 *   stays     they do not go home when the bar shuts
 *   home      where they walk to at closing time, on the island
 *   out       [{ from, to, level, tile, face, lines }] — somewhere else, then
 *   look      the character-creator parts they are dressed in
 *
 * `islander()` at the top gives everybody who can be flirted with the same
 * four things to do — flirt, share a drink, ask them to the cove, and say
 * goodbye — so each person's own nodes are only what is theirs. */

const PLAYER_LOOK = { base: 'base:fem/Tan', eyes: 'eyes:Brown',
  hair: 'hair:Medium 07 - Bob, Side Part/Chestnut', torso: 'torso:fem/Swim 02 - Tank Top/Teal',
  legs: 'legs:fem/Swim 01 - Shorts/White', feet: 'feet:fem/Shoes 01 - Shoes/White' };

const hasDrink = () => P.inventory.some(x => ITEMS[x] && ITEMS[x].drink);
const takeDrink = () => { const d = P.inventory.find(x => ITEMS[x] && ITEMS[x].drink); Item.take(d); return d; };

/* THE SHARED MOVES. Flirting counts once a day; a drink always counts; a
   date needs somebody who likes you (4+) and a free evening. */
function islander(id, who, o) {
  const flirted = () => G.flags['flirt_' + id] === G.day;
  const common = [
    { t: 'Flirt.', to: 'flirt', if: () => !flirted() },
    { t: 'Offer them a drink.', to: 'gift', if: hasDrink },
    { t: 'Meet me at the cove tonight? After sunset.', to: 'date', if: () => Rel.get(id) >= 4 && !G.flags.date && G.minutes % 1440 < 1260 },
    /* Developing them: once a day, spend some time on the thing they love.
       They get better at it (see Mind.event 'practise'), and they remember
       who they got better with. */
    { t: 'Show me how you do that.', to: 'practise', if: () => G.flags['prac_' + id] !== G.day && Rel.get(id) >= 1 },
    { t: 'See you later.', to: null }
  ];
  /* A flirt lands on the day they are having — see data/minds.js — and goes
     one further when they are glowing. Looked up when it is used rather than
     now: this file loads before the engine does. */
  const mind = () => (typeof Mind !== 'undefined' ? Mind : null);
  o.nodes.flirt = {
    text: () => (mind() && mind().flirtLine(id)) || pick(o.flirt),
    do() { G.flags['flirt_' + id] = G.day; Rel.add(id, 1 + (mind() ? mind().charm(id) : 0)); Player.xp(3); if (mind()) mind().event(id, 'flirted'); },
    choices: [{ t: '😏', to: null }]
  };
  o.nodes.gift = {
    text: () => pick(o.gift),
    do() { const d = takeDrink(); Rel.add(id, (ITEMS[d].v >= 24 ? 3 : 2) + (mind() ? mind().charm(id) : 0)); Player.xp(5); if (mind()) mind().event(id, 'gift'); o.onGift && o.onGift(d); },
    to: null
  };
  o.nodes.practise = {
    text: () => (mind() && mind().teachLine(id)) || pick(o.again),
    do() { G.flags['prac_' + id] = G.day; Rel.add(id, 1); Player.xp(4); if (mind()) mind().event(id, 'practise'); },
    choices: [{ t: 'Same time tomorrow?', to: null }]
  };
  o.nodes.date = {
    text: () => pick(o.dateYes),
    do() { Dates.ask(id, who); if (mind()) mind().event(id, 'date'); },
    choices: [{ t: 'It’s a date.', to: null }]
  };
  o.nodes.again = o.nodes.again || {
    text: () => Dates.today(id) ? pick(['Tonight. The cove. Don’t be late.', 'I’m still thinking about tonight. In a good way.'])
      : G.flags.partner === id ? pick(o.partner || o.again) : pick(o.again),
    choices: (o.more || []).concat(common)
  };
  return o;
}

const NPCS = [
islander('mari', 'Mari', {
  id: 'mari', name: 'Mari', face: '💃', role: 'Bartender · The Driftwood',
  desk: [13, 3], colour: '#ff5f8f',
  level: 'bar',
  home: { at: [58, 76], where: 'A cabin behind the beach, three doors from the sea' },
  out: [{ from: 1150, to: 1290, level: 'island', tile: [47, 77], face: 's',
    lines: ['This is the best part of the day.', 'Look at that sky.', 'Shh. Listen to the waves.'] }],
  look: { base: 'base:fem/Bronze', eyes: 'eyes:Brown', hair: 'hair:Medium 04 - Bangs & Bun/Raven', torso: 'torso:fem/Swim 02 - Tank Top/Red', legs: 'legs:fem/Swim 01 - Shorts/Black', feet: 'feet:fem/Shoes 01 - Shoes/Black' },
  schedule: [[660, 'desk'], [780, 'deck'], [800, 'desk'], [960, 'jukebox'], [975, 'desk']],
  lines: ['Ice. We need more ice.', 'Who ordered the thing with the sparkler?', 'Two mojitos, one with extra attitude.', 'Mm-hm.'],
  flirt: ['“Careful. I’ve had better lines from the pelican.” She is smiling, though.', '“You keep looking at me like that and I’ll start charging you for it.”', 'She flicks a bar towel at you. It is, somehow, the most flirtatious thing that has ever happened to you.'],
  gift: ['She sniffs it, sips it, and raises an eyebrow. “Okay. You’re learning.”', '“You made this? For me?” She drinks half of it in one go. “Don’t tell the customers.”'],
  dateYes: ['“The cove? At sunset?” She pretends to think about it for a whole second. “Bring the good rum.”'],
  again: ['Busy one. I like busy.', 'Rafa would be proud of you. Don’t let it go to your head.', 'If you’re not pouring, you’re in my way. Cutely.'],
  partner: ['Hey, you.', 'Later, after close. The deck. Just us.', 'Stop smiling at me, the customers will talk.'],
  more: [
    { t: 'Anything I should know?', to: 'gossip' },
    { t: 'Any news about Sienna Vale?', to: 'critic', if: () => Q.active('q_critic') }
  ],
  entry() {
    if (qAt('q_arrive', 1) || (!G.flags.metMari && !Q.complete2('q_arrive'))) return 'first';
    if (qAt('q_bar', 2)) return 'barDone';
    if (Q.active('q_bar')) return 'barWait';
    if (Q.complete2('q_bar') && G.day >= 2 && !G.quests.q_critic) return 'criticStart';
    return 'again';
  },
  nodes: {
    first: {
      text: [
        '(A woman behind the bar looks up from slicing limes, clocks your suitcase, and does not stop slicing.)',
        '“Let me guess. You’re the nephew. Niece. The heir.” A pause. “Rafa said you were cute. He undersold it.”',
        '“I’m Mari. I’ve run this bar for six years while your uncle ran around with it. The roof leaks, the fridge sulks, and a man called Sterling keeps trying to buy it. Welcome to paradise.”'],
      do() {
        G.flags.metMari = true; Rel.add('mari', 1); Player.xp(10);
        if (Q.active('q_arrive')) Q.complete('q_arrive');
        Q.start('q_bar');
      },
      choices: [
        { t: 'So… where do I start?', to: 'start' },
        { t: 'Rafa talked about you too.', to: 'rafa' }
      ]
    },
    rafa: {
      text: ['“Did he.” She stops slicing. “Nothing good, I hope. Good is boring.”', '“Get behind the bar. Open the till. Let’s see what you’re made of.”'],
      do() { Rel.add('mari', 1); },
      to: null
    },
    start: {
      text: ['“Behind the bar. The till first — it sticks, hit it on the left. Then when a bell rings on a stool, that’s a guest. You go, you charm, you pour.”', '“Read them. Everybody wants something, and it’s never just a drink.”'],
      to: null
    },
    barWait: {
      text: () => pick(['“Till, then a guest. Bell rings, you go. Chop chop, gorgeous.”', '“Watch what they do before they order. That’s the tell.”']),
      choices: [{ t: 'On it.', to: null }]
    },
    barDone: {
      text: ['“Well, well. They left smiling, and they tipped.” She slides something cold across to you.', '“Here. My spare shaker. You’ve earned it. Mostly.”'],
      do() { Q.complete('q_bar'); Rel.add('mari', 2); Ach.get('a_settled'); if (!G.quests.q_garden) UI.objective('Talk to Mama Coco about Rafa’s garden.'); },
      to: null
    },
    criticStart: {
      text: ['“Code red.” Mari shoves her phone at you. “Sienna Vale. Two million followers. She’s staying on the island all week and she’s reviewing the bars.”',
        '“If she likes us, we’re made. If she doesn’t, Sterling gets the bar for pocket change. So: three good cocktails ready to go, then go and charm her on the deck.”'],
      do() { Q.start('q_critic'); },
      choices: [{ t: 'No pressure, then.', to: null }]
    },
    critic: {
      text: () => qAt('q_critic', 0) ? ['“Three cocktails. Use the blender. Fruit from the garden. Go.”'] : ['“She’s on the deck. Sunglasses on, phone out. Go get her.”'],
      to: null
    },
    gossip: {
      text: () => pick([
        '“Kai at the surf shack knows a secret lagoon in the jungle. He tells everyone it’s a secret.”',
        '“Jade on the lifeguard tower has saved eleven people this season. Four of them were faking.”',
        '“Luca does yoga on the deck in the mornings and DJs here at night. The yoga is more popular. Don’t tell him.”',
        '“Mama Coco knows everything that happens on this island. Everything. Choose your words.”',
        '“The supply boat takes orders for the other islands. Teo pays cash. Teo always pays cash.”',
        '“Sterling’s been sniffing round again. Suit, in this heat. Tells you everything.”']),
      to: null
    }
  }
}),
islander('kai', 'Kai', {
  id: 'kai', name: 'Kai', face: '🏄', role: 'Surf instructor · the shack',
  desk: [91, 77], colour: '#4dd4ff',
  level: 'island',
  stays: true,
  look: { base: 'base:masc/Tan', eyes: 'eyes:Green', hair: 'hair:Medium 03 - Idol/Blonde', torso: 'torso:masc/Swim 00 - Nothing/Skin', legs: 'legs:masc/Swim 01 - Shorts/Teal', feet: 'feet:masc/Shoes 01 - Shoes/White' },
  schedule: [[660, 'desk'], [840, 'sands'], [890, 'desk']],
  lines: ['Surf’s up.', 'Duuude.', 'Wax on. Wax on. Wax on.', 'You ever just… look at the sea?'],
  flirt: ['He grins, pushes his hair out of his eyes, and forgets what he was saying. “Sorry — what? You’re distracting.”', '“Has anyone told you you’ve got really good balance? For surfing. And stuff.”', 'He flexes, badly on purpose, and you both laugh.'],
  gift: ['“For me? No way.” He drinks it with his eyes shut. “That’s like… a sunset in a glass.”', 'He clinks your glass even though you do not have one. “Legend.”'],
  dateYes: ['“The cove? With you? Tonight?” He tries to play it cool and fails completely. “Yeah. Yes. Totally.”'],
  again: ['Waves are clean today.', 'You should come out on a board. I’ll hold you up.', 'Sun, sea, you. Good day.'],
  partner: ['Hey, beautiful.', 'Come out on the board with me later?', 'I told the pelican about you.'],
  entry() {
    if (qAt('q_kai', 1) && G.flags.foundLagoon) return 'lagoonDone';
    if (qAt('q_kai', 2)) return 'lagoonDone';
    if (!G.flags.metKai) return 'first';
    return 'again';
  },
  nodes: {
    first: {
      text: ['“Hey! You’re the new Driftwood person! Everybody’s talking about you.” He is wet, shirtless and apparently incapable of standing still.',
        '“I’m Kai. I teach surfing. Well — I teach people to fall off, beautifully. Grab a board from the shack sometime.”',
        '“And hey… if you ever want to see the best place on the island, there’s a lagoon up in the jungle. Secret. Well. Semi-secret.”'],
      do() { G.flags.metKai = true; Rel.add('kai', 1); Q.start('q_kai'); },
      choices: [{ t: 'I’ll find it.', to: null }, { t: 'Only if you show me.', to: null, do() { Rel.add('kai', 1); } }]
    },
    lagoonDone: {
      text: ['“You FOUND it? Isn’t it unreal?” He looks at you for a second too long. “Not many people I’d tell about that place.”', 'He pulls a shell necklace from his pocket. “Made this. For… whoever found it. Which is you.”'],
      do() { Q.complete('q_kai'); Rel.add('kai', 2); },
      to: null
    }
  }
}),
islander('jade', 'Jade', {
  id: 'jade', name: 'Jade', face: '🛟', role: 'Lifeguard · Honeymoon Sands',
  desk: [61, 78], colour: '#ff5f56',
  level: 'island',
  stays: true,
  look: { base: 'base:fem/Peach', eyes: 'eyes:Blue', hair: 'hair:Medium 01 - Page/Blonde', torso: 'torso:fem/Swim 01 - Bikini Top/Red', legs: 'legs:fem/Swim 02 - Bikini Bottoms/Red', feet: 'feet:fem/Shoes 01 - Shoes/White' },
  schedule: [[660, 'desk'], [900, 'fountain'], [930, 'desk']],
  lines: ['Stay between the flags!', 'Nobody drown, please. I’m on my break in an hour.', 'That’s not a jellyfish, that’s a bag.'],
  flirt: ['She lowers her sunglasses. “Are you drowning? Because you’re staring like you need rescuing.”', '“I’ve done the kiss of life forty times this summer. Professionally.” A pause. “Mostly professionally.”', 'She spins her whistle round one finger and looks you up and down, slowly.'],
  gift: ['“On duty. Technically.” She takes it anyway. “Don’t tell my boss. I don’t have a boss. Don’t tell anyone.”', 'She presses the cold glass to her neck and closes her eyes. “You’re a lifesaver. That’s my job, you know.”'],
  dateYes: ['“Off-duty Jade is a very different Jade,” she says. “Cove. Sunset. Don’t make me come and find you.”'],
  again: ['Water’s perfect today.', 'Seen three sharks. All of them were Kai.', 'Put some sun cream on. You’re going pink.'],
  partner: ['There you are. I was scanning the beach for you.', 'Later I’m teaching you to bodysurf. No arguments.', 'You look good in the sun. Just saying.'],
  onGift() { if (qAt('q_jade', 0)) { Q.step('q_jade'); Dates.ask('jade', 'Jade'); } },
  entry() {
    if (!G.flags.metJade) return 'first';
    return 'again';
  },
  nodes: {
    first: {
      text: ['A woman in red swimwear drops down the lifeguard tower ladder in one move. “You’re the Driftwood person. Rafa’s kid.”',
        '“Jade. I watch the water. And the people. Mostly the people.” She looks at you for exactly as long as she means to.',
        '“It’s hot up on that tower. If somebody brought me something cold from the bar… I’d owe them.”'],
      do() { G.flags.metJade = true; Rel.add('jade', 1); Q.start('q_jade'); },
      choices: [{ t: 'I’ll see what I can do.', to: null }, { t: 'What would you owe them, exactly?', to: 'owe' }]
    },
    owe: {
      text: ['“Bring the drink and find out.” She climbs back up the tower without looking back. She is definitely smiling.'],
      do() { Rel.add('jade', 1); },
      to: null
    }
  }
}),
islander('luca', 'Luca', {
  id: 'luca', name: 'Luca', face: '🧘', role: 'Yoga by day · DJ by night',
  desk: [25, 11], colour: '#b48cff',
  level: 'bar',
  home: { at: [86, 77], where: 'A boat he calls a house, moored off the Sands' },
  out: [{ from: 600, to: 700, level: 'island', tile: [85, 32], face: 's',
    lines: ['Breathe in… and out.', 'Downward dog, everybody.', 'Feel the sun on your face.'] }],
  look: { base: 'base:masc/Ivory', eyes: 'eyes:Green', hair: 'hair:Short 02 - Parted/Black', beard: 'beard:Facial Hair 06 - Trimmed Beard/Black', torso: 'torso:masc/Swim 03 - Open Shirt/White', legs: 'legs:masc/Swim 01 - Shorts/Sky', feet: 'feet:masc/Shoes 01 - Shoes/Brown' },
  schedule: [[660, 'desk'], [840, 'rail'], [870, 'desk']],
  lines: ['Ciao, bella.', 'This track — this TRACK.', 'The sea is my metronome.', 'Mm, yes, the vibe is very correct.'],
  flirt: ['“You know,” he says, very close to your ear over the music, “you have a very good energy. Very… warm.”', 'He takes your hand, spins you once, lets go. “Scusa. The music made me do it.”', '“In yoga we open the heart.” He taps your chest lightly. “Yours is very open. I like it.”'],
  gift: ['He tastes it like a sommelier, eyes closed. “Perfetto. You have hands of gold.”', '“Salute.” He kisses the rim of the glass, then winks at you. Outrageous.'],
  dateYes: ['“A sunset with you?” He puts his hand on his heart. “I will bring the wine. You bring… you.”'],
  again: ['Stay for my set tonight.', 'The deck is the best place on the island. After the cove.', 'Ciao, bello. Ciao, bella. Ciao, everybody.'],
  partner: ['Amore.', 'Every song tonight is for you.', 'Come here, dance with me.'],
  entry() {
    if (qAt('q_luca', 2)) return 'lucaDone';
    if (!G.flags.metLuca) return 'first';
    return 'again';
  },
  nodes: {
    first: {
      text: ['A man in an unbuttoned shirt is nodding to music only he can hear. “Ah! The new owner. Luca. I play the music here, and in the mornings I teach yoga on the deck by the plaza.”',
        '“Come to class before the bar opens. Then choose me a record from the jukebox for tonight. We will see if we are compatible.” He says compatible like it is a flavour.'],
      do() { G.flags.metLuca = true; Rel.add('luca', 1); Q.start('q_luca'); },
      choices: [{ t: 'I’ve never done yoga.', to: null }, { t: 'Compatible how?', to: null, do() { Rel.add('luca', 1); } }]
    },
    lucaDone: {
      text: ['“You came to class, you chose THAT record — molto bene.” He pulls you into a hug that lasts a beat too long.', '“We are very compatible. I knew it.”'],
      do() { Q.complete('q_luca'); Rel.add('luca', 2); },
      to: null
    }
  }
}),
{
  id: 'coco', name: 'Mama Coco', face: '👵', role: 'Mama Coco’s · knows everything',
  desk: [6, 3], colour: '#5ad48a',
  level: 'market',
  stays: true,
  look: { base: 'base:fem/Coffee', eyes: 'eyes:Brown', hair: 'hair:Medium 09 - Twists/Gray', torso: 'torso:fem/Swim 02 - Tank Top/Yellow', legs: 'legs:fem/Pants 03 - Pants/Beige', feet: 'feet:fem/Shoes 01 - Shoes/Brown' },
  schedule: [[600, 'desk']],
  lines: ['Mm-hmm.', 'I heard about that.', 'Two euros, sweetheart.', 'You look thin. Eat something.'],
  entry() {
    if (!G.flags.metCoco) return 'first';
    return 'hello';
  },
  nodes: {
    first: {
      text: ['“So you’re Rafa’s.” A tiny woman with enormous earrings looks you up and down and decides something. “You’ve got his eyes. Hopefully not his luck.”',
        '“That garden of his is going to waste inside the loop. Buy some seeds, plant them, and you’ll have fruit for your cocktails. Lime and mint grow quickest.”'],
      do() { G.flags.metCoco = true; Rel.add('coco', 1); if (!G.quests.q_garden) Q.start('q_garden'); },
      choices: [{ t: 'Let me see the seeds.', to: null, do() { Shop.open('coco'); } }, { t: 'Thank you, Mama Coco.', to: null }]
    },
    buyFruit: {
      text: () => ['She turns your fruit over one piece at a time, sniffing each one. “Mm. Mm-hm. This one has seen better days. So have I.”',
        '“' + cash(Larder.sellValue()) + ' for the lot. It is a good price. It is MY price.”'],
      choices: [
        { t: 'Deal.', to: null, do() { Larder.sellToCoco(); } },
        { t: 'I’ll keep it, thanks.', to: null }
      ]
    },
    hello: {
      text: () => pick(['“What can I get you, sweetheart?”', '“Kai was in here buying hair gel. For a surfer. Mm-hmm.”', '“Jade bought two sun creams yesterday. Two. Who is the second one for, I wonder.”', '“That Sterling man bought a newspaper and didn’t say thank you. I have written it down.”', '“Luca’s been humming since you arrived. Take from that what you will.”', '“Mari has never once smiled at a customer. She smiles at you. I’m just saying.”']),
      choices: [
        { t: 'Let me see what you’ve got.', to: null, do() { Shop.open('coco'); } },
        /* She buys what you grew and cannot use before it turns — see Larder
           in data/farm.js. */
        { t: 'Want to buy some fruit?', to: 'buyFruit', if: () => typeof Larder !== 'undefined' && Larder.sellable().length > 0 },
        { t: 'Just saying hello.', to: null }
      ]
    }
  }
},
{
  id: 'teo', name: 'Captain Teo', face: '⚓', role: 'The supply boat',
  desk: [111, 47], colour: '#ffb347',
  level: 'island',
  stays: true,
  look: { base: 'base:masc/Brown', eyes: 'eyes:Brown', hair: 'hair:Short 06 - Balding/Gray', beard: 'beard:Facial Hair 07 - Medium Beard/Gray', torso: 'torso:masc/Swim 02 - Tank Top/White', legs: 'legs:masc/Swim 01 - Shorts/Cerulean', feet: 'feet:masc/Shoes 01 - Shoes/Black' },
  schedule: [[480, 'desk']],
  lines: ['Tide’s turning.', 'Cash only.', 'Hrm.', 'Seen worse weather. Seen better boats.'],
  entry() {
    if (!G.flags.metTeo) return 'first';
    if (Q.complete2('q_bar') && !G.quests.q_boat) return 'cargo';
    return 'hello';
  },
  nodes: {
    first: {
      text: ['(The boat bumps the jetty. A weathered man with a grey beard throws you a rope, then your suitcase.)',
        '“Isla Solana. End of the line.” He looks at you properly. “Rafa’s kid. Sorry about your uncle. He owed me forty euros. Don’t worry about it.”',
        '“The Driftwood’s on the Promenade — follow the road round to the south side, the beach side. Mari will be behind the bar. Mari is always behind the bar.”'],
      do() { G.flags.metTeo = true; Rel.add('teo', 1); Item.give('letter'); Q.start('q_arrive'); },
      choices: [{ t: 'Thanks, Captain.', to: null }]
    },
    cargo: {
      text: ['“You’ve found your feet.” He jerks a thumb at the board on the jetty. “The other islands want things. Fruit, drinks. Rafa’s cocktails were famous. Fill an order and I’ll pay you cash.”'],
      do() { Q.start('q_boat'); },
      to: null
    },
    hello: {
      text: () => pick(['“Board’s on the jetty. Cash on delivery.”', '“Storm coming Thursday. Or not. Sea never tells you straight.”', '“Your uncle once swam here from San Tomás for a bet. Lost the bet. Won the bar.”']),
      choices: [{ t: 'Show me the board.', to: null, do() { Orders.open(); } }, { t: 'Just saying hello.', to: null }]
    }
  }
},
{
  id: 'pepe', name: 'Old Pepe', face: '👴', role: 'A regular · the corner table',
  desk: [4, 10], colour: '#9fb3c8',
  level: 'bar',
  home: { at: [30, 77], where: 'Nobody knows. He is always here.' },
  look: { base: 'base:masc/Tawny', eyes: 'eyes:Gray', hair: 'hair:Short 06 - Balding/White', beard: 'beard:Facial Hair 07 - Medium Beard/White', torso: 'torso:masc/Shirt 09 - Polo/Forest', legs: 'legs:masc/Pants 04 - Cuffed Pants/Beige', feet: 'feet:masc/Shoes 01 - Shoes/Brown' },
  schedule: [[660, 'desk'], [900, 'deck'], [930, 'desk']],
  lines: ['In my day…', 'Another, please.', 'Hm? What? Yes.', 'I knew your uncle when he had hair.'],
  entry() { return 'hello'; },
  nodes: {
    hello: {
      text: () => pick([
        '“In 1974 I kissed a film star on that deck. She said I was the best kisser in the Caribbean. I have not stopped since.”',
        '“The secret to a long life? Rum, sun, and never marry a man who wears socks with sandals.”',
        '“Rafa and Mari? Ha! Never. He was like a father to her. She is waiting for somebody better. Somebody new, maybe.” He winks. Horribly.',
        '“Sterling? His father tried to buy this island in ’88. Rafa beat him at dominoes. The whole island. Dominoes.”',
        '“You know what the lantern in the cove is for? Two people light it, together, and then…” He mimes something. You leave.']),
      choices: [{ t: 'Pepe, you’re a legend.', to: null }]
    }
  }
},
{
  id: 'sienna', name: 'Sienna Vale', face: '🤳', role: 'Influencer · 2.1M followers',
  desk: [28, 6], colour: '#ff7eb6',
  level: 'bar',
  boss: true,
  home: { at: [104, 76], where: 'The Coral Resort, on the next island' },
  look: { base: 'base:fem/Porcelain', eyes: 'eyes:Blue', hair: 'hair:Medium 03 - Idol/Platinum', torso: 'torso:fem/Swim 01 - Bikini Top/White', legs: 'legs:fem/Swim 01 - Shorts/White', feet: 'feet:fem/Shoes 01 - Shoes/White' },
  schedule: [[660, 'desk'], [840, 'rail'], [880, 'desk']],
  lines: ['Golden hour. Everybody move.', 'Can we get this with less… sea?', 'Is this cruelty-free? The mojito.', 'Ugh, the light.'],
  entry() {
    if (G.flags.criticDone) return 'after';
    if (qAt('q_critic', 1)) return 'ready';
    return 'aloof';
  },
  nodes: {
    aloof: {
      text: () => pick(['(She holds up one finger without looking up from her phone.)', '“Sorry, are you the waiter? I’ll wave.”', '“Love the rustic thing. Very… authentic.” It does not sound like a compliment.']),
      to: null
    },
    ready: {
      text: ['Sienna lowers her phone. For the first time she actually looks at you. “So you’re the owner. Impress me. You’ve got one drink and about four minutes.”'],
      choices: [
        { t: 'Challenge accepted.', to: null, do() { setTimeout(() => Combat.startBoss('critic'), 400); } },
        { t: 'Give me a minute.', to: null }
      ]
    },
    after: {
      text: () => pick(['“Tagged you, by the way. Your phone is going to explode.”', '“Honestly? Best bar I’ve been to all year. Don’t quote me. Actually, do.”', 'She blows you a kiss without looking up from her phone.']),
      to: null
    }
  }
},
{
  id: 'blake', name: 'Blake Sterling', face: '💼', role: 'Sterling Resorts · Chief Executive',
  desk: [66, 46], colour: '#9fb3c8',
  level: 'island',
  boss: true,
  stays: true,
  look: { base: 'base:masc/Ivory', eyes: 'eyes:Gray', hair: 'hair:Short 02 - Parted/Blonde', torso: 'torso:masc/Shirt 07 - Buttoned Longsleeve Shirt/White', legs: 'legs:masc/Pants 03 - Pants/Charcoal', feet: 'feet:masc/Shoes 01 - Shoes/Black' },
  schedule: [[660, 'desk']],
  lines: ['Imagine it. Glass. Chrome. Valet.', 'Is it always this hot?', 'Everything has a price.', 'My people will call your people.'],
  entry() {
    if (G.flags.finalDone) return 'after';
    if (G.flags.criticDone) return 'offer';
    return 'early';
  },
  nodes: {
    early: {
      text: ['A man in a white linen suit, sweating magnificently, smiles like a shark who has read a book about smiling.',
        '“Blake Sterling. Sterling Resorts. You must be the new owner of that… charming shack.” He hands you a card. It is metal. It burns your fingers in the sun.',
        '“Get settled. Enjoy it. We’ll talk soon.”'],
      to: null
    },
    offer: {
      text: ['“I saw the review. Congratulations — you’ve made The Driftwood worth something. Which is perfect timing.”',
        '“Sterling Resorts would like to buy it. The bar, the beach, the cove. We’ll put up a four-hundred-room paradise with an infinity pool. Two million euros. Let’s talk.”'],
      do() { if (!G.quests.q_offer) Q.start('q_offer'); },
      choices: [
        { t: 'Let’s talk.', to: null, do() { setTimeout(() => Combat.startBoss('offer'), 400); } },
        { t: 'Not today.', to: null }
      ]
    },
    after: {
      text: () => pick(['“You drive a hard bargain.” He loosens his tie at last. “Maybe I’ll just… have a drink sometime.”', '“Don’t tell anyone, but I ordered one of your mojitos. It was very good.”']),
      to: null
    }
  }
},
];
