'use strict';
/* ---------------- Mind: what the islanders want ----------------
   Until this, an islander's day was a timetable. Mari was behind the bar
   because data/npcs.js said so, went to the deck at one because it said so,
   and nothing that happened to her — a downpour, a slow afternoon, you — made
   the slightest difference to where she stood or how she stood there.

   This is the other half, and it is the half the colony games get right:
   Oxygen Not Included's needs and stress responses, RimWorld's moods built out
   of thoughts. Every islander has five needs that run down with the clock and
   fill back up where they stand; a mood made of those needs and of the things
   that have happened to them lately; opinions of each other; and, when the
   timetable leaves them free, the sense to go and do something about it.

   THE TIMETABLE STILL WINS. Nothing here moves anybody the schedule, an `out:`
   window, home time or a drill has a claim on — the mind is asked only when
   the day says "your own spot", which is most of the day. On shift it speaks
   up only for something critical; off shift, or for somebody with no shift at
   all, it runs their afternoon. And when it does send somebody somewhere, it
   is the same errand the timetable makes — the same commitment, the same walk,
   the same routes — so nothing downstream had to learn a new kind of person.

   THE CHARM IS IN data/minds.js. This file is the arithmetic; that one is Kai
   being delighted by rain because rain means waves, Blake sweating through a
   linen suit, and Pepe telling you about 1974 because nobody else will listen.

   COST. Needs tick four times a second for the whole roster, in a loop of
   nine. Deciding where to go is the dear part — it asks the routes how far
   every candidate is — so each person thinks every three seconds or so, on
   their own phase, and no more than three of them in any one frame. */
const Mind = {
  now: 0, acc: 0, TICK: .25, lastClock: null,
  /* Per person, not saved: what they are thinking about right now. Needs,
     mood, thoughts and opinions are in G.minds and are saved with everything
     else; a plan to go and sit on the deck is not worth remembering across a
     reload, and nobody is half way to the deck after one. */
  rts: new Map(),
  reset() { this.rts.clear(); this.lastClock = null; this.acc = 0; },
  clock() { return (G.day || 1) * 1440 + (G.minutes || 0); },
  persona(id) { return (typeof MINDS !== 'undefined' && MINDS[id]) || this.NOBODY; },
  NOBODY: {},
  WORDS: ['Happy', 'Good', 'Okay', 'Low', 'Miserable'],
  /* Where the mood bands start, best first. */
  BANDS: [80, 62, 40, 22],
  band(v) { const b = this.BANDS; return v >= b[0] ? 0 : v >= b[1] ? 1 : v >= b[2] ? 2 : v >= b[3] ? 3 : 4; },

  /* ONE PERSON'S MIND, made on first asking. Needs start well fed and a little
     different for everybody — stable per person, so a new game's Tuesday is
     the same Tuesday — which keeps the whole island from getting thirsty in
     the same minute of the first afternoon. */
  of(id) {
    if (!G.minds) G.minds = {};
    let m = G.minds[id];
    if (!m) {
      const h = NPCM.hash(id + ':mind'), needs = {};
      let i = 0;
      for (const k in MIND_NEEDS) needs[k] = 64 + ((h >>> (i++ * 5)) & 31) * .9;
      m = G.minds[id] = { needs, mood: 58 + (this.persona(id).base || 0), thoughts: [], op: {}, insp: 0 };
    }
    return m;
  },
  rt(n) {
    let r = this.rts.get(n.id);
    if (!r) {
      r = { next: this.now + (NPCM.hash(n.id) % 30) / 10, last: this.now, plan: null, cool: 0,
        lowFor: 0, highFor: 0, moment: 0, say: null, icon: null, pace: 1, target: this.of(n.id).mood };
      this.rts.set(n.id, r);
    }
    return r;
  },
  inspired(id) { const m = G.minds && G.minds[id]; return !!m && m.insp > this.clock(); },

  /* ---- the clock ---- */
  update(dt) {
    this.now += dt;
    if (!NPCM.all.length || typeof MIND_NEEDS === 'undefined') return;
    const c = this.clock();
    /* A clock that went backwards or leapt — a load, a new game, a night
       skipped — is not twelve hours of thirst. It is a fresh start from here. */
    if (this.lastClock === null || c < this.lastClock || c - this.lastClock > 240) this.lastClock = c;
    this.acc += dt;
    if (this.acc >= this.TICK) {
      const real = Math.min(this.acc, 1), gm = c - this.lastClock;
      this.acc = 0; this.lastClock = c;
      for (const n of NPCM.all) this.tick(n, real, gm);
    }
    /* Thinking, staggered. Three a frame is plenty for nine people and would
       still be plenty for ninety. */
    let budget = 3;
    for (const n of NPCM.all) {
      const r = this.rt(n);
      if (this.now < r.next) continue;
      if (budget-- <= 0) break;
      r.next = this.now + 2.6 + Math.random() * 1.8;
      this.think(n, r);
    }
    /* The Islanders tab is live while it is open, like the map: a panel about
       how people are doing that only knew how they were doing when you opened
       it would be a photograph. Once a second is often enough to watch a bar
       fill up. */
    if (typeof Panels !== 'undefined' && Panels.on && Panels.tab === 'people') {
      this.panelT = (this.panelT || 0) - dt;
      if (this.panelT <= 0) { this.panelT = 1; Panels.render(); }
    }
  },

  /* WHERE SOMEBODY IS, as far as their needs are concerned: a waypoint name,
     'desk', 'out', 'home', or null while they are on their way somewhere.

     OFF YOUR LEVEL is the colony games' other trick. Nobody there is simulated
     on foot — nothing is — so without help they stood at their posts all day
     and ran dry: an island of people parched, exhausted and furious by the
     time you walked out of the bar to meet them. So off camera a plan is a
     place they simply ARE for as long as it would have taken, walk included
     (see `away` in choose()), and the plan is still there when you arrive —
     at which point they walk it, because now somebody can see. */
  spotOf(n) {
    if (n.away || n.level === 'away') return 'home';
    if (n.level !== World.level) {
      if (NPCM.errandFor(n)) return 'out';
      const r = this.rts.get(n.id);
      if (r && r.plan && r.plan.away && this.now >= r.plan.arrive) return r.plan.wp;
      return r && r.plan && r.plan.away ? null : this.post(n);
    }
    if (n.walking || !n.parked) return null;
    return n.dest === 'desk' ? this.post(n) : n.dest;
  },
  /* Their own spot, which at night is somewhere to doze for anybody who never
     goes home — Kai does not stand to attention at his shack until dawn. */
  post(n) {
    if (typeof Sky === 'undefined') return 'desk';
    const m = Sky.m();
    return (m >= 1380 || m < 420) ? 'home' : 'desk';
  },
  working(n) {
    const p = this.persona(n.id);
    return p.works !== false && typeof Sky !== 'undefined' && Sky.working();
  },

  tick(n, real, gm) {
    const m = this.of(n.id), p = this.persona(n.id), r = this.rt(n);
    const rates = p.rates || this.NOBODY, like = p.spots || this.NOBODY;
    const spot = this.spotOf(n);
    /* A post can have comforts of its own — Coco has a shop full of juice and
       a radio, Teo has a boat with rum on it — written as `post:` in
       data/minds.js. Everybody else's post gives them nothing but work. */
    const eff = spot === 'desk' && p.post ? p.post : spot && MIND_SPOTS[spot];
    const atWork = spot === 'desk' && this.working(n);
    for (const k in MIND_NEEDS) {
      const decay = (k === 'passion' && p.passion && p.passion.decay) || MIND_NEEDS[k].decay;
      let d = decay * (rates[k] || 1) * gm / 60;
      if (atWork && MIND_WORK[k]) d *= MIND_WORK[k];
      /* Asleep, everything runs down at a third of the pace. Nobody wakes up
         lonelier than they have ever been because they slept alone. */
      if (spot === 'home') d *= .33;
      if ((n.walking || spot === null) && k === 'energy') d *= 1.25;
      let v = m.needs[k] - d;
      if (eff && eff[k]) v += eff[k] * real * (like[spot] || 1);
      m.needs[k] = v < 0 ? 0 : v > 100 ? 100 : v;
    }
    /* An off-camera plan is over when what it was for is fixed, or its time is
       up, whichever is first. */
    const pl = r.plan;
    if (pl && pl.away && this.now >= pl.arrive && (this.now >= pl.leave || m.needs[pl.why] >= 95)) this.done(n);
    /* Their passion, where it lives. Mari's is behind the bar, Kai's is in the
       water, and a person doing the thing they love is refilled by it faster
       than by anything a spot can offer. */
    if (spot && p.passion && p.passion.at && p.passion.at.includes(spot)) {
      m.needs.passion = Math.min(100, m.needs.passion + 4.5 * real);
    }
    /* Company. Standing near people fills it slowly, and standing near people
       you like fills it faster — a crowded bar is not company if it is full of
       Blake. */
    if (!n.walking && n.level === World.level && NPCM.list.includes(n)) {
      let c = 0;
      for (const o of NPCM.list) {
        if (o === n || o.walking) continue;
        if (Math.abs(o.x - n.x) > TILE * 3 || Math.abs(o.y - n.y) > TILE * 3) continue;
        c += this.opinion(n.id, o.id) < -25 ? 0 : 1;
      }
      if (G.state !== 'title' && Math.hypot(P.x - n.x, P.y - n.y) < TILE * 3) c++;
      if (c) m.needs.social = Math.min(100, m.needs.social + .9 * real * Math.min(3, c));
    }
    /* Mood follows its target rather than jumping to it: a person does not go
       from glowing to miserable because a cloud went over. */
    m.mood += (r.target - m.mood) * Math.min(1, real * .12);
  },

  /* ---- thinking ---- */
  think(n, r) {
    const m = this.of(n.id), p = this.persona(n.id), clk = this.clock();
    const since = this.now - r.last; r.last = this.now;
    if (m.thoughts.length) m.thoughts = m.thoughts.filter(t => t.until > clk);
    const here = n.level === World.level && NPCM.list.includes(n);
    /* You have just walked in on somebody who was off doing something by the
       clock. From here it is a plan like any other, and they walk it. */
    if (here && r.plan && r.plan.away) { r.plan.away = false; r.plan.until = this.now + 75; }
    this.feel(n, m, here);
    r.target = this.target(m, p);

    /* THE ENDS OF THE SCALE. Too low for too long and something gives — ONI's
       stress response, RimWorld's mental break — though nothing on this
       island breaks anything but their own afternoon. Too high for long enough
       and they are inspired, which you will notice the next time you flirt. */
    r.lowFor = m.mood < 18 ? r.lowFor + since : 0;
    r.highFor = m.mood > 84 ? r.highFor + since : 0;
    if (r.moment && this.now >= r.moment) this.endMoment(n, r);
    if (!r.moment && r.lowFor > 25) this.startMoment(n, r, here);
    /* Rare, and it has to be: a mood that stays high would otherwise be
       inspired from breakfast to bed, and something that is always on is not
       an event. Half a day before the next one at the earliest. */
    if (r.highFor > 30 && m.insp <= clk && !(m.inspNext > clk)) {
      m.insp = clk + 180; m.inspNext = clk + 720;
      this.add(n.id, 'inspired');
      const l = p.lines && p.lines.inspired;
      if (here && l && n.sayT <= 0 && Cam.visible(n.x, n.y)) { n.say = pick(l); n.sayT = 3.6; }
    }

    /* What they would do about it, if they were free to — here on foot, or
       anywhere else by the clock. */
    if (!r.moment && this.free(n) && n.level !== 'away') {
      if (r.plan && !r.plan.away && this.now > r.plan.until && !(n.errand && n.errand.mind)) { r.plan = null; r.cool = this.now + rnd(4, 10); }
      if (!r.plan && this.now >= r.cool) r.plan = this.choose(n, m, p, !here);
    } else if (r.plan && !(n.errand && n.errand.mind)) r.plan = null;

    /* And what shows: the icon over their head, what they say next, how fast
       they walk. Decided here, three times a minute, and read every frame. */
    const insp = m.insp > clk;
    let low = null, lv = 101;
    for (const k in MIND_NEEDS) if (m.needs[k] < lv) { lv = m.needs[k]; low = k; }
    r.icon = r.moment ? '💢' : insp ? '✨'
      : lv < 20 ? (low === 'passion' && p.passion ? p.passion.e : MIND_NEEDS[low].e)
      : m.mood < 22 ? '🌧️' : null;
    r.pace = m.needs.energy < 20 ? .86 : insp ? 1.12 : r.moment ? 1.08 : 1;
    const L = p.lines || this.NOBODY;
    r.say = r.moment ? L.moment
      : insp && L.inspired && chance(.5) ? L.inspired
      : m.mood >= 78 && L.great && chance(.45) ? L.great
      : m.mood < 30 && L.low && chance(.55) ? L.low
      : lv < 25 && L[low] && chance(.6) ? L[low] : null;
  },

  /* THE WORLD, AS IT LANDS ON SOMEBODY: the weather where they are standing,
     the sunset, and who they are standing next to. */
  feel(n, m, here) {
    if (typeof Sky === 'undefined') return;
    const outdoors = MIND_OUTDOORS.levels.includes(n.level) || (here && MIND_OUTDOORS.spots.includes(n.dest));
    if (outdoors && !n.away) {
      const k = Sky.kind(), sm = Sky.m();
      if (k.fall) this.add(n.id, 'rained');
      else if (!Sky.dark() && k.dim < .05) this.add(n.id, 'sunshine');
      if (sm >= 1150 && sm < 1290 && !k.fall && k.dim < .2) this.add(n.id, 'sunset');
    }
    if (!here) return;
    for (const o of NPCM.list) {
      if (o === n || Math.hypot(o.x - n.x, o.y - n.y) > TILE * 3.2) continue;
      const op = this.opinion(n.id, o.id);
      if (op >= 30) this.add(n.id, 'friend', o.id);
      else if (op <= -30) this.add(n.id, 'rival', o.id);
    }
  },
  target(m, p) {
    const w = p.weights || this.NOBODY;
    let sw = 0, s = 0, crit = 0, th = 0;
    for (const k in MIND_NEEDS) {
      const wk = w[k] === undefined ? 1 : w[k];
      sw += wk; s += wk * (m.needs[k] - 50);
      if (m.needs[k] < 12) crit += 5 * wk;
    }
    for (const t of m.thoughts) th += t.v;
    th = clamp(th, -40, 40);
    return clamp(55 + (p.base || 0) + (sw ? s / sw * .5 : 0) - crit + th, 0, 100);
  },

  /* ---- thoughts ---- */
  /* A thing that happened to somebody. Ambient ones — the sun, the rain, who
     they are standing near — are refreshed rather than repeated; events stack
     up to their limit, so being soaked three times is worse than once and the
     fourth time is not worse than the third. */
  add(id, key, who) {
    const T = MIND_THOUGHTS[key];
    if (!T || !id) return;
    const m = this.of(id), p = this.persona(id), clk = this.clock();
    const v = p.thoughts && p.thoughts[key] !== undefined ? p.thoughts[key] : T.v;
    const until = clk + T.mins;
    who = who || '';
    const same = m.thoughts.filter(t => t.k === key && t.who === who);
    if (!T.stack || same.length >= T.stack) {
      if (same.length) { same.sort((a, b) => a.until - b.until)[0].until = until; return; }
    }
    m.thoughts.push({ k: key, who, v, until });
    if (m.thoughts.length > 14) {
      m.thoughts.sort((a, b) => b.until - a.until);
      m.thoughts.length = 14;
    }
  },
  label(id, t) {
    const p = this.persona(id);
    const s = (p.named && p.named[t.k]) || (MIND_THOUGHTS[t.k] || {}).n || t.k;
    const who = t.who && (NPCS.find(x => x.id === t.who) || {}).name;
    return s.replace('{who}', who || 'somebody').replace('{you}', (P && P.name) || 'you');
  },

  /* ---- opinions ---- */
  /* What one islander thinks of another, -100..100. Seeded from data/minds.js
     and from chemistry — a stable number per pair, so two people nobody wrote
     a history for still get on or do not, the same way every game — and
     moved by what happens between them. */
  opinion(a, b) {
    const m = this.of(a);
    let v = m.op[b];
    if (v === undefined) {
      const p = this.persona(a);
      const base = (p.likes && p.likes[b]) || 0;
      const chem = (NPCM.hash(a < b ? a + '|' + b : b + '|' + a) % 31) - 15;
      v = m.op[b] = clamp(base + chem, -100, 100);
    }
    return v;
  },
  warm(a, b, by) {
    const v = this.opinion(a, b);
    /* Chatting makes friends, up to a point. It does not make best friends —
       that takes somebody writing it into data/minds.js. */
    if (by > 0 && v >= 70) return;
    this.of(a).op[b] = clamp(v + by, -100, 100);
  },
  friends(id) {
    return NPCS.filter(x => x.id !== id).map(x => [x, this.opinion(id, x.id)]).sort((a, b) => b[1] - a[1]);
  },

  /* ---- conversations between islanders ---- */
  /* Would these two talk. A rival is somebody you stand near and resent, not
     somebody you start a conversation with. */
  canChat(a, b) {
    if (typeof MINDS === 'undefined') return true;
    if (this.opinion(a, b) < -25 || this.opinion(b, a) < -25) return false;
    return true;
  },
  /* How much this person would like to talk to that one, for picking a partner
     out of a room: friends first, then whoever is lonelier. */
  chatPull(a, b) { return this.opinion(a, b) + (100 - this.of(b).needs.social) * .2; },
  chatStart(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      const m = this.of(x), p = this.persona(x);
      m.needs.social = Math.min(100, m.needs.social + 10);
      if (p.passion && p.passion.chat) m.needs.passion = Math.min(100, m.needs.passion + 12);
      this.add(x, 'chat', y);
      this.warm(x, y, 2);
    }
  },
  chatLine(id) {
    const m = this.of(id), p = this.persona(id);
    m.needs.social = Math.min(100, m.needs.social + 4);
    if (p.passion && p.passion.chat) m.needs.passion = Math.min(100, m.needs.passion + 5);
  },

  /* ---- you ---- */
  /* What you did to somebody. Called from the shared islander moves in
     data/npcs.js, the dialogue box and the water pistol. */
  event(id, key) {
    if (typeof MIND_NEEDS === 'undefined' || !NPCS.some(x => x.id === id)) return;
    const m = this.of(id), p = this.persona(id);
    if (key === 'talked') {
      m.needs.social = Math.min(100, m.needs.social + 8);
      if (p.passion && p.passion.chat) m.needs.passion = Math.min(100, m.needs.passion + 10);
    }
    if (key === 'flirted') m.needs.fun = Math.min(100, m.needs.fun + 8);
    if (key === 'gift') m.needs.thirst = Math.min(100, m.needs.thirst + 60);
    this.add(id, key);
    /* So it shows on the next frame and not in three seconds' time. */
    const n = NPCM.get(id), r = n && this.rts.get(id);
    if (r) r.target = this.target(m, p);
  },
  /* How much further a flirt or a drink goes today: one more, when they are
     glowing. Nothing less when they are low — being in a mood is not your
     fault, and the game should not charge you for it. */
  charm(id) {
    const m = G.minds && G.minds[id];
    return m && (m.mood >= 80 || this.inspired(id)) ? 1 : 0;
  },
  /* A flirt, as it lands on the day they are having. Null when they are
     neither glowing nor low, and the dialogue says what it always said. */
  flirtLine(id) {
    const m = G.minds && G.minds[id], f = this.persona(id).flirt;
    if (!m || !f) return null;
    if ((m.mood >= 80 || this.inspired(id)) && f.great && f.great.length && chance(.7)) return pick(f.great);
    if (m.mood < 22 && f.low && f.low.length) return pick(f.low);
    return null;
  },

  /* ---- deciding where to go ---- */
  free(n) {
    if (NPCM.drill || n.callOut || n.away || n.outward || n.leaving || n.homeward || n.lift) return false;
    if (n.stunTimer > 0 || NPCM.errandFor(n)) return false;
    if (NPCM.scheduled(n) !== 'desk') return false;
    if (n.errand && !n.errand.mind) return false;
    if (typeof Dialogue !== 'undefined' && Dialogue.on && Dialogue.npc && Dialogue.npc.id === n.id) return false;
    return true;
  },
  /* THE CHOICE. Every waypoint on their level scored by what it would do for
     them — each need's urgency times what the spot gives, their passion five
     times over — divided by how far it is to walk, lifted by friends already
     there and weighed down by a crowd. Their own spot is a candidate too,
     when their passion lives there: Mari tired of a quiet afternoon does not
     wander off to the deck, she goes back behind the bar.

     On shift only a need under about a fifth gets them off their post, which
     is a break and not a stroll. Off shift they are pickier about staying
     put than about going: a person with nothing much wrong stays where they
     are, and the island does not turn into a game of musical chairs. */
  choose(n, m, p, away) {
    const working = this.working(n);
    const w = p.weights || this.NOBODY, like = p.spots || this.NOBODY;
    const urg = {};
    let top = 0, worst = 101, why = null;
    for (const k in MIND_NEEDS) {
      const v = m.needs[k];
      urg[k] = Math.pow((100 - v) / 100, 1.6) * (w[k] === undefined ? 1 : w[k]);
      if (urg[k] > top) { top = urg[k]; why = k; }
      if (v < worst) worst = v;
    }
    if (working ? worst >= 22 : top < .12) return null;
    const [fx, fy] = away ? [Math.floor(n.x / TILE), Math.floor(n.y / TILE)] : this.origin(n);
    /* How far, in steps. On your level the routes know; anywhere else the
       level is not loaded and there are no routes to ask, so it is the
       straight line with a third on for the corners — which is only ever used
       to rank places and time an absence nobody is watching. */
    const far = (x, y) => away ? Math.hypot(x - fx, y - fy) * 1.3 : Nav.steps(fx, fy, x, y, true);
    const passionAt = (p.passion && p.passion.at) || [];
    const others = away ? NPCM.all.filter(o => o !== n && o.level === n.level) : NPCM.list;
    let best = null, bs = working ? .04 : .08, bSteps = 0, bWhy = why;
    for (const wp in WP) {
      const s = MIND_SPOTS[wp];
      if (!s || NPCM.wpLevel(wp) !== n.level) continue;
      /* And WHY this one, which is whichever need it would do most for —
         not whichever need is worst, or a drinks stall is somewhere you go
         for a rest. */
      let gain = 0, most = 0, what = null;
      for (const k in s) if (s[k] > 0 && urg[k]) {
        const g = urg[k] * s[k];
        gain += g;
        if (g > most) { most = g; what = k; }
      }
      if (passionAt.includes(wp) && urg.passion * 5 > most) { most = urg.passion * 5; what = 'passion'; }
      if (passionAt.includes(wp)) gain += urg.passion * 5;
      if (!gain) continue;
      gain *= like[wp] || 1;
      const at = WP[wp], steps = far(at[0], at[1]);
      if (steps === null) continue;
      let crowd = 0, company = 0;
      for (const o of others) {
        const ro = this.rts.get(o.id);
        if (!((ro && ro.plan && ro.plan.wp === wp) || (o.dest === wp && !o.walking))) continue;
        crowd++; company += this.opinion(n.id, o.id) / 100;
      }
      let score = gain / (1 + steps / 45) * (1 + company * .5) / (1 + crowd * .35);
      /* Taste: a stable tilt per person per spot, so two people with the same
         need do not always pick the same place. */
      score *= .85 + (NPCM.hash(n.id + wp) % 100) / 100 * .3;
      if (score > bs) { bs = score; best = wp; bSteps = steps; bWhy = what; }
    }
    if (passionAt.includes('desk') && urg.passion > 0) {
      const d = n.def.desk, steps = far(d[0], d[1]);
      if (steps !== null && urg.passion * 5 / (1 + steps / 45) >= bs) return null;
    }
    if (!best) return null;
    const plan = { wp: best, why: bWhy, until: this.now + 75 };
    if (away) {
      /* Gone for as long as the walk and the stay would have taken. */
      plan.away = true;
      plan.arrive = this.now + bSteps / Math.max(.5, (n.t && n.t.pace) || 1);
      plan.leave = plan.arrive + this.dwell(n, best) * 1.5;
    }
    return plan;
  },
  /* Where somebody is standing, for the routes — or the nearest square that is
     actually floor, for anybody the data has put a foot into the furniture. A
     post inside a counter used to mean no route from it to anywhere, and so a
     person who could never go for a drink however thirsty they got. */
  origin(n) {
    const fx = Math.floor(n.x / TILE), fy = Math.floor(n.y / TILE);
    Nav.fresh();
    const p = Nav.passable();
    if (p[fy * MAPW + fx]) return [fx, fy];
    for (let r = 1; r <= 2; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const x = fx + ox, y = fy + oy;
      if (x >= 0 && y >= 0 && x < MAPW && y < MAPH && p[y * MAPW + x]) return [x, y];
    }
    return [fx, fy];
  },
  /* Read by NPCM.destTile() when the timetable says "your own spot". */
  want(n) {
    const r = this.rts.get(n.id);
    if (!r || !r.plan) return null;
    if (this.now > r.plan.until && !(n.errand && n.errand.mind)) { r.plan = null; return null; }
    return r.plan.wp;
  },
  /* How long to stay: long enough to have fixed what they came for. */
  dwell(n, wp) {
    const m = this.of(n.id), s = MIND_SPOTS[wp] || this.NOBODY;
    let need = 0;
    for (const k in s) if (s[k] > 0) need = Math.max(need, (100 - m.needs[k]) / s[k]);
    return clamp(need * .8, 8, 24);
  },
  /* The errand it made is over. A breather before the next idea. */
  done(n) {
    const r = this.rts.get(n.id);
    if (!r) return;
    r.plan = null; r.cool = this.now + rnd(6, 16);
  },

  /* ---- a moment ---- */
  startMoment(n, r, here) {
    const p = this.persona(n.id), mo = p.moment;
    /* Off your level it happens where you cannot see it, which is where most
       of anybody's worst afternoons happen. They come back having had it. */
    if (!here || !mo || !this.free(n)) { this.add(n.id, 'moment'); r.lowFor = 0; return; }
    let tile = null;
    if (mo.at === 'desk') tile = n.def.desk;
    else if (WP[mo.at] && NPCM.wpLevel(mo.at) === n.level) tile = WP[mo.at];
    if (!tile) { this.add(n.id, 'moment'); r.lowFor = 0; return; }
    n.errand = null; r.plan = null;
    NPCM.hangUp(n);
    n.callOut = { wp: mo.at, tile, until: NPCM.now + 28, haste: 1.08 };
    r.moment = this.now + 28;
    const l = p.lines && p.lines.moment;
    if (l && Cam.visible(n.x, n.y)) { n.say = pick(l); n.sayT = 3.8; }
  },
  endMoment(n, r) {
    r.moment = 0; r.lowFor = 0;
    this.add(n.id, 'moment');
    const m = this.of(n.id);
    r.target = this.target(m, this.persona(n.id));
    r.cool = this.now + rnd(10, 20);
  },

  /* ---- what the rest of the game reads ---- */
  lines(n) { const r = this.rts.get(n.id); return r && r.say && r.say.length ? r.say : null; },
  icon(n) { const r = this.rts.get(n.id); return r ? r.icon : null; },
  pace(n) { const r = this.rts.get(n.id); return r ? r.pace : 1; },
  /* A face for the day they are having — only at the ends of the scale, which
     is where Faces.mood() draws the line for how they feel about YOU. */
  face(id) {
    const m = G.minds && G.minds[id];
    if (!m) return null;
    const r = this.rts.get(id);
    if (r && r.moment) return 'anger';
    if (m.mood >= 80 || m.insp > this.clock()) return 'happy';
    if (m.mood < 22) return 'sad';
    return null;
  },
  word(id) {
    const m = this.of(id), w = this.persona(id).words || this.WORDS;
    return w[this.band(m.mood)] || this.WORDS[this.band(m.mood)];
  },
  EMO: ['😄', '🙂', '😐', '😕', '😣'],
  badge(id) {
    if (typeof MIND_NEEDS === 'undefined' || !NPCS.some(x => x.id === id)) return '';
    const m = this.of(id);
    return this.EMO[this.band(m.mood)] + ' ' + this.word(id) + (this.inspired(id) ? ' ✨' : '');
  },
  spotName(wp) { return (typeof MIND_SPOT_NAMES !== 'undefined' && MIND_SPOT_NAMES[wp]) || wp; },
  WHY: { energy: 'for a rest', thirst: 'for a drink', fun: 'for some fun', social: 'for some company', passion: '' },
  doing(n) {
    const p = this.persona(n.id), r = this.rts.get(n.id), m = this.of(n.id);
    if (n.away || n.level === 'away') return m.needs.energy < 80 ? 'Asleep at home' : 'At home';
    if (r && r.moment) return (p.moment && p.moment.n) || 'Having a moment';
    if (n.chat) { const o = NPCM.get(n.chat.with); return 'Chatting with ' + (o ? o.name : 'somebody'); }
    if (r && r.plan) {
      const why = r.plan.why === 'passion' ? (p.passion ? 'for some ' + p.passion.n.toLowerCase() : '') : this.WHY[r.plan.why] || '';
      const going = r.plan.away ? this.now < r.plan.arrive : n.walking || n.dest !== r.plan.wp;
      return (going ? 'Heading to ' : 'At ') + this.spotName(r.plan.wp) + (why ? ' ' + why : '');
    }
    if (n.dest === 'out' || NPCM.errandFor(n)) return 'Out and about';
    if (n.errand) return 'On a break at ' + this.spotName(n.errand.wp);
    if (n.dest === 'desk' || n.level !== World.level) {
      if (this.post(n) === 'home') return 'Dozing at their spot';
      return p.works === false ? 'At their usual spot' : this.working(n) ? 'Working' : 'Hanging about';
    }
    return n.walking ? 'On the move' : 'Taking it easy';
  },
  where(n) {
    if (n.away || n.level === 'away') return (n.def.home && n.def.home.where) || 'Home';
    const d = Levels.def(n.level);
    return (d && d.name) || n.level;
  },

  /* ---- the Islanders tab ---- */
  /* RimWorld's needs tab, on a beach: how everybody you have met is doing,
     why, and what they are doing about it. Only people you have met — the
     panel is gossip, and you have to know somebody to gossip about them. */
  panel() {
    const known = NPCS.filter(d => G.rel[d.id] !== undefined);
    if (!known.length) return '<div class="h2">Islanders</div><p class="idesc">Nobody yet. Say hello to somebody.</p>';
    const bar = (v, cls) => '<span class="mb' + (cls ? ' ' + cls : '') + '"><i style="width:' + Math.round(clamp(v, 0, 100)) + '%"></i></span>';
    const tone = v => v >= 62 ? 'ok' : v >= 30 ? 'mid' : 'bad';
    let h = '<div class="h2">Islanders</div><p class="idesc mind-intro">How everybody is doing today — and why. Moods rise and fall with sun, rain, company, drinks and you.</p><div class="mind-grid">';
    known.forEach(d => {
      const n = NPCM.get(d.id);
      if (!n) return;
      const m = this.of(d.id), p = this.persona(d.id), clk = this.clock();
      const needs = Object.keys(MIND_NEEDS).map(k => {
        const nm = k === 'passion' && p.passion ? p.passion.n : MIND_NEEDS[k].n;
        const e = k === 'passion' && p.passion ? p.passion.e : MIND_NEEDS[k].e;
        return '<div class="mn"><span class="mk" title="' + esc(nm) + '">' + e + ' ' + esc(nm) + '</span>' + bar(m.needs[k], tone(m.needs[k])) + '</div>';
      }).join('');
      const th = m.thoughts.filter(t => t.until > clk && t.v).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4)
        .map(t => '<li class="' + (t.v > 0 ? 'up' : 'dn') + '"><b>' + (t.v > 0 ? '+' : '') + t.v + '</b> ' + esc(this.label(d.id, t)) + '</li>').join('');
      const fr = this.friends(d.id), best = fr[0], worst = fr[fr.length - 1];
      const ties = (best && best[1] >= 25 ? '♥ ' + esc(best[0].name) : '')
        + (worst && worst[1] <= -25 ? (best && best[1] >= 25 ? ' · ' : '') + '⚡ ' + esc(worst[0].name) : '');
      h += '<div class="mind-card">'
        + '<div class="mh"><span class="mf">' + d.face + '</span><div class="mt"><div class="mnm" style="color:' + (d.colour || 'inherit') + '">' + esc(d.name) + '</div>'
        + '<div class="mw">' + esc(this.badge(d.id)) + '</div></div></div>'
        + '<div class="mood-row">' + bar(m.mood, 'mood ' + tone(m.mood)) + '</div>'
        + '<div class="mdo">' + esc(this.doing(n)) + ' <span>· ' + esc(this.where(n)) + '</span></div>'
        + '<div class="mneeds">' + needs + '</div>'
        + (th ? '<ul class="mth">' + th + '</ul>' : '<ul class="mth"><li class="nil">Nothing much on their mind.</li></ul>')
        + (ties ? '<div class="mties">' + ties + '</div>' : '')
        + '<div class="mrel">With you: ' + esc(Rel.label(G.rel[d.id])) + '</div>'
        + '</div>';
    });
    return h + '</div>';
  }
};
