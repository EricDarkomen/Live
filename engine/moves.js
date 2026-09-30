'use strict';
/* ---------------- Moves: jumping, swimming, diving ----------------
   The sheets carry walk, run, sit, breathe and swing, and nothing else: no
   jump, no swim. So these are staged from the poses there are, the way a
   puppeteer would: a hop is the run's widest stride lifted on an arc, with a
   squash on landing; a swimmer is the walk cut off at the chest by a
   waterline, the arms doing the stroke, a ring of ripples round them; a dive
   is the same swimmer going under and coming up again.

   The water is the sea within a few tiles of the shore and the lagoon
   (World.swim, built with the level). Only you swim: the islanders path on
   World.isSolid(), which still says water is water, and so do the cars.

   State lives on P (jz, swim, …) so a save carries it without knowing, and
   nothing here needs a save format of its own. */
const Moves = {
  /* The hop: its length in seconds, its height in pixels. */
  JUMP_T: .5, JUMP_H: 16,
  /* How long the landing squash lasts. */
  SQUASH_T: .16,
  /* Swimming speed as a share of walking. */
  SWIM_SPEED: .64,
  /* How far down a swimmer sits: the waterline is at the chest. */
  SINK: 10,
  /* A duck dive, in seconds: down, along the bottom, up. */
  DIVE_T: 1.1,
  /* After you come out you drip for this long. */
  WET_T: 7,
  ripples: [],

  /* ---- where the water is ---- */
  /* The swimmable tile under a point, at the feet. */
  wetAt(x, y) {
    const sw = World.swim;
    if (!sw) return false;
    const tx = Math.floor(x / TILE), ty = Math.floor((y + Collide.FEET_OY) / TILE);
    if (tx < 0 || ty < 0 || tx >= MAPW || ty >= MAPH) return false;
    return !!sw[ty][tx];
  },
  /* The lagoon, rather than the sea: the moonlit one is an achievement. */
  lagoonAt(x, y) {
    return World.surfAt(Math.floor(x / TILE), Math.floor((y + Collide.FEET_OY) / TILE)) === 'water';
  },

  /* ---- the controls ---- */
  /* Space. On land a hop; in the water a duck dive. */
  jump() {
    if (G.state !== 'play' || Cars.driving) return false;
    if (P.swim) {
      if (P.diveT > 0) return false;
      P.diveT = this.DIVE_T;
      this.splash(P.x, P.y, 8);
      if (Sfx.on) Sfx.tone(300, .18, 'sine', .14, 0, -140);
      return true;
    }
    if (P.jumpT > 0) return false;
    /* You cannot hop out of a chair: stand up first (you already do by moving). */
    if (!P.moving && Sprites.seatedAt(Math.floor(P.x / TILE), Math.floor(P.y / TILE))) return false;
    P.jumpT = this.JUMP_T;
    P.jumpFrom = P.swim ? 'water' : 'land';
    P.squashT = 0;
    this.dust(P.x, P.y, 4);
    if (Sfx.on) { Sfx.tone(330, .09, 'triangle', .16, 0, 260); }
    return true;
  },

  /* ---- every frame, after the walk ---- */
  update(dt) {
    /* Nothing moves while the world is covered. */
    if (G.state !== 'play' && G.state !== 'dialogue' && G.state !== 'panel' && G.state !== 'comms') return;
    this.tickRipples(dt);
    if (Cars.driving) { P.swim = false; P.jz = 0; P.jumpT = 0; P.diveT = 0; return; }

    /* The hop: a parabola, stretched going up and squashed coming down. */
    if (P.jumpT > 0) {
      P.jumpT = Math.max(0, P.jumpT - dt);
      const u = 1 - P.jumpT / this.JUMP_T;
      P.jz = 4 * this.JUMP_H * u * (1 - u);
      if (P.jumpT === 0) this.land();
    } else P.jz = 0;
    if (P.squashT > 0) P.squashT = Math.max(0, P.squashT - dt);

    /* In or out of the water. Mid-air you are neither: you land in it. */
    const wet = P.jz === 0 && this.wetAt(P.x, P.y);
    if (wet !== !!P.swim) {
      P.swim = wet;
      if (wet) this.enter(); else this.leave();
    }
    /* The touch button says DIVE in the water (css/polish.css reads the class). */
    if (this._cls !== !!P.swim) { this._cls = !!P.swim; document.body.classList.toggle('swimming', this._cls); }
    if (P.swim) {
      if (P.diveT > 0) {
        P.diveT = Math.max(0, P.diveT - dt);
        if (P.diveT === 0) { this.splash(P.x, P.y, 10); this.ripple(P.x, P.y + 4, 1.4); }
        else if (FX.motion && chance(dt * 10)) FX.parts.push({ x: P.x + rnd(-6, 6), y: P.y - 2, vx: rnd(-8, 8), vy: -30, life: .5, t: 0, c: 'rgba(220,250,255,.9)' });
      }
      /* A ring every so often; more of them, and closer together, when you swim. */
      P._ripT = (P._ripT || 0) - dt;
      if (P._ripT <= 0) {
        P._ripT = P.moving ? .28 : .9;
        this.ripple(P.x, P.y + 4, P.moving ? 1 : .8);
      }
      /* Swimming is work: a point of energy every few seconds of it. */
      if (P.moving) {
        P._swimE = (P._swimE || 0) + dt;
        if (P._swimE >= 5) { P._swimE = 0; if (P.energy > 5) Player.mod({ energy: -1 }); }
        if (!P._strokeT || (P._strokeT -= dt) <= 0) {
          P._strokeT = .55;
          if (Sfx.on) Sfx.noise(.09, .035);
        }
      }
      /* A moonlit swim in the lagoon is the skinny dip, whichever way you got in. */
      if (typeof night === 'function' && night() && this.lagoonAt(P.x, P.y)) Ach.get('a_dip');
    } else if (P.wetT > 0) {
      /* Out of the water and dripping. */
      P.wetT = Math.max(0, P.wetT - dt);
      if (FX.motion && chance(dt * 6 * (P.wetT / this.WET_T))) {
        FX.parts.push({ x: P.x + rnd(-7, 7), y: P.y - rnd(4, 24), vx: 0, vy: 20, life: .35, t: 0, c: 'rgba(170,225,255,.85)' });
      }
    }
  },

  /* ---- the moments ---- */
  land() {
    P.jz = 0;
    if (this.wetAt(P.x, P.y)) {
      /* Into the water from the land (or off the jetty): the big one. */
      this.splash(P.x, P.y, P.jumpFrom === 'land' ? 18 : 10);
      this.ripple(P.x, P.y + 4, 1.8);
      if (P.jumpFrom === 'land') { Ach.get('a_leap'); FX.shake(2); }
      return;
    }
    P.squashT = this.SQUASH_T;
    this.dust(P.x, P.y, 6);
    if (Sfx.on) Sfx.noise(.06, .08);
  },
  enter() {
    P.diveT = 0; P.wetT = 0;
    Guns.arm(false);
    this.splash(P.x, P.y, 10);
    this.ripple(P.x, P.y + 4, 1.4);
    Ach.get('a_swim');
  },
  leave() {
    P.diveT = 0;
    P.wetT = this.WET_T;
    this.splash(P.x, P.y, 5);
  },

  /* ---- what you see ---- */
  splash(x, y, n) {
    if (Sfx.on) { Sfx.noise(.22, .12); Sfx.tone(520, .12, 'sine', .08, 0, -300); }
    if (!FX.motion) return;
    for (let i = 0; i < n; i++) {
      const a = rnd(Math.PI * 1.05, Math.PI * 1.95), s = rnd(40, 120);
      FX.parts.push({ x: x + rnd(-5, 5), y: y + 2, vx: Math.cos(a) * s * .7, vy: Math.sin(a) * s,
        life: rnd(.35, .7), t: 0, c: i % 3 ? 'rgba(225,248,255,.95)' : 'rgba(140,215,255,.9)' });
    }
  },
  dust(x, y, n) {
    if (!FX.motion) return;
    const wetGround = !!(World.surfAt && ['sand'].includes(World.surfAt(Math.floor(x / TILE), Math.floor(y / TILE))));
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      FX.parts.push({ x: x + side * rnd(3, 8), y: y + 12, vx: side * rnd(20, 50), vy: rnd(-40, -15),
        life: rnd(.25, .45), t: 0, c: wetGround ? 'rgba(244,226,180,.9)' : 'rgba(220,214,200,.8)' });
    }
  },
  ripple(x, y, k) {
    if (!R.animate) return;
    if (this.ripples.length > 40) this.ripples.shift();
    this.ripples.push({ x, y, t: 0, life: 1.3 * (k || 1), k: k || 1 });
  },
  tickRipples(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      if (r.t >= r.life) this.ripples.splice(i, 1);
    }
  },
  /* On the water, under everybody. */
  paintUnder(c) {
    if (!this.ripples.length) return;
    c.save();
    c.lineWidth = 1.5;
    for (const r of this.ripples) {
      if (!Cam.visible(r.x, r.y)) continue;
      const u = r.t / r.life, rad = 6 + u * 22 * r.k;
      c.strokeStyle = 'rgba(235,252,255,' + (.55 * (1 - u)).toFixed(3) + ')';
      c.beginPath(); c.ellipse(r.x, r.y, rad, rad * .42, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  },

  /* ---- drawing the player ----
     Returns how the renderer should draw you this frame: the lift off the
     ground, the frame to use, a squash, and whether you are in the water. */
  pose(dir, still) {
    const out = { lift: 0, sx: 1, sy: 1, frame: null, swim: false, sink: 0, bob: 0 };
    if (P.jz > 0) {
      out.lift = P.jz;
      /* In the air the legs are apart: the run's widest stride, or the walk's. */
      const r = Sprites.at('player'), run = r && r.sheet.run;
      out.frame = run && run.length ? run[1] : 2;
      /* Stretched on the way up, round at the top. */
      const u = 1 - P.jumpT / this.JUMP_T;
      const st = u < .5 ? (1 - u * 2) * .08 : 0;
      out.sy = 1 + st; out.sx = 1 - st * .6;
    } else if (P.squashT > 0) {
      const k = P.squashT / this.SQUASH_T;
      out.sy = 1 - .16 * k; out.sx = 1 + .12 * k;
    }
    if (P.swim) {
      out.swim = true;
      const t = R.t || 0;
      out.bob = R.animate ? Math.sin(t * 3.1) * 1.4 : 0;
      out.sink = this.SINK;
      /* A duck dive: down, a moment under, and back up. */
      if (P.diveT > 0) {
        const u = 1 - P.diveT / this.DIVE_T;
        const under = u < .3 ? u / .3 : u > .75 ? (1 - u) / .25 : 1;
        out.sink += under * 34;
      }
      const r = Sprites.at('player');
      if (!r) return out;
      const m = r.sheet;
      if (!still) {
        /* The stroke: the run's big arm swing side-on, the walk's head-on. */
        const phase = (P.step || 0) * .8;
        if ((dir === 1 || dir === 3) && m.run && m.run.length) out.frame = m.run[Math.floor(phase) % m.run.length];
        else out.frame = 1 + Math.floor(phase) % Math.max(1, m.sit - 1);
      } else {
        /* Treading water: the breathing frames, a little faster. */
        const b = m.breath;
        out.frame = b && b.length ? b[Math.floor(t * 2.2) % b.length] : 0;
      }
    }
    return out;
  },

  /* A swimmer: the sprite drawn low, clear above the waterline and faint
     below it, with a bright ring where the water meets the body. `draw` blits
     the sprite with its top-left `dy` pixels down. */
  paintSwimmer(c, x, y, o, draw) {
    const wl = y + 3 + o.bob;       /* the waterline, in world pixels */
    c.save();
    /* Under the surface: faint and tinted, as if through the water. */
    c.save();
    c.beginPath(); c.rect(x - 60, wl, 120, 80); c.clip();
    c.globalAlpha = .22;
    draw(o.sink + o.bob);
    c.restore();
    /* Above the surface: solid. */
    c.save();
    c.beginPath(); c.rect(x - 60, wl - 120, 120, 120); c.clip();
    draw(o.sink + o.bob);
    c.restore();
    /* The surface round the body. */
    if (o.sink < this.SINK + 26) {
      c.shadowBlur = 0; c.shadowColor = 'transparent';
      c.strokeStyle = 'rgba(240,253,255,.85)'; c.lineWidth = 1.6;
      const w = 12 + (R.animate ? Math.sin((R.t || 0) * 4) * 1.2 : 0);
      c.beginPath(); c.ellipse(x, wl, w, 3.4, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.beginPath(); c.ellipse(x, wl, w + 3, 5, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  },

  /* ---- the islanders ----
     Somebody inspired, or simply having a wonderful day, hops for joy now and
     then while they stand about: two quick bounces every few seconds, each
     person on their own beat. Cosmetic; they are not going anywhere. */
  joy(n) {
    if (!R.animate || n.walking) return 0;
    const m = G.minds && G.minds[n.id];
    if (!m || !(Mind.inspired(n.id) || m.mood >= 90)) return 0;
    let h = 0;
    for (let i = 0; i < n.id.length; i++) h = (h * 31 + n.id.charCodeAt(i)) & 1023;
    const per = 5 + (h % 5), t = ((R.t || 0) + h / 97) % per;
    if (t > .7) return 0;
    const u = (t % .35) / .35;
    return 4 * 7 * u * (1 - u);
  }
};
