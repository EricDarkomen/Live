'use strict';
/* ---------------- AudioSystem ---------------- */
const Sfx = {
  ctx: null, on: true, music: true, holdTimer: null, master: null, volume: 0.32,
  init() {
    if (this.ctx) {
      /* Browsers suspend the context when the tab is backgrounded, and start it
         suspended if it was ever created outside a gesture. Always try to wake it. */
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) { this.on = false; }
  },
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  },
  tone(freq, dur = 0.12, type = 'square', vol = 0.5, delay = 0, glide = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + glide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur = 0.16, vol = 0.25, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const n = this.ctx.sampleRate * dur, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(this.master); s.start(t);
  },
  step() { this.noise(0.05, 0.045); },
  blip() { this.tone(520, 0.06, 'square', 0.28); },
  talk() { this.tone(ri(300, 460), 0.035, 'square', 0.12); },
  /* The opening types its captions like the dialogue box does, but a whole
     minute of them at dialogue volume is a chattering machine rather than a
     film. Lower and a good deal quieter — under the room, not on top of it. */
  type() { this.tone(ri(196, 240), 0.03, 'square', 0.05); },
  /* A beat landing. One low note with a fifth under it, short enough that
     twelve of them in ninety seconds do not become a rhythm. */
  cut() { this.tone(174, 0.34, 'sine', 0.11); this.tone(116, 0.4, 'sine', 0.07, 0.02); },
  select() { this.tone(680, 0.07, 'triangle', 0.3); this.tone(920, 0.06, 'triangle', 0.22, 0.05); },
  deny() { this.tone(180, 0.16, 'sawtooth', 0.25, 0, -60); },
  ring() {
    for (let i = 0; i < 2; i++) {
      this.tone(880, 0.09, 'sine', 0.3, i * 0.22); this.tone(660, 0.09, 'sine', 0.3, i * 0.22 + 0.1);
    }
  },
  xp() { this.tone(700, 0.07, 'triangle', 0.25); this.tone(1050, 0.1, 'triangle', 0.22, 0.06); },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.3, i * 0.09)); },
  coffee() { this.noise(0.5, 0.14); this.tone(140, 0.4, 'sawtooth', 0.12, 0.05, 40); },
  printer() { this.noise(0.28, 0.3); this.tone(90, 0.3, 'square', 0.2, 0.1, 30); this.noise(0.2, 0.22, 0.34); },
  door() { this.tone(220, 0.1, 'sine', 0.22); this.noise(0.1, 0.12, 0.05); },
  key() { this.tone(ri(900, 1400), 0.02, 'square', 0.06); },
  notify() { this.tone(988, 0.08, 'sine', 0.28); this.tone(1319, 0.12, 'sine', 0.24, 0.07); },
  bad() { this.tone(200, 0.2, 'sawtooth', 0.28); this.tone(150, 0.3, 'sawtooth', 0.24, 0.12); },
  cash() { this.tone(1200, 0.05, 'square', 0.2); this.tone(1600, 0.08, 'square', 0.18, 0.05); },
  /* ---- the car ----
     An engine is the one sound in this game that is HELD rather than struck,
     so it is the one that owns a node instead of making one and letting it
     stop. Two oscillators a fifth apart through a lowpass, quiet enough to sit
     under everything: the point of it is that you notice when it stops. */
  engine(on, rev) {
    if (!this.ctx) return;
    /* Turning the sound off mid-drive has to stop a note that is already
       playing, which is the one thing a held sound needs that a struck one
       does not — hence the test here rather than at the top. */
    if (!on || !this.on) {
      if (this.eng) { try { this.eng.g.gain.cancelScheduledValues(this.ctx.currentTime); this.eng.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08); this.eng.o.stop(this.ctx.currentTime + 0.4); this.eng.o2.stop(this.ctx.currentTime + 0.4); } catch (e) { /* already gone */ } this.eng = null; }
      return;
    }
    if (!this.eng) {
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 520;
      g.gain.value = 0.0001;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o.start(); o2.start();
      this.eng = { o, o2, g, f };
      g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.15);
    }
    /* Idle at the bottom, and never quite in tune with itself — a flat drone
       reads as a fridge rather than as an engine. */
    const t = this.ctx.currentTime, r = clamp(rev || 0, 0, 1);
    this.eng.o.frequency.setTargetAtTime(52 + r * 104, t, 0.09);
    this.eng.o2.frequency.setTargetAtTime(78 + r * 157, t, 0.09);
    this.eng.f.frequency.setTargetAtTime(420 + r * 900, t, 0.12);
    this.eng.g.gain.setTargetAtTime(0.035 + r * 0.045, t, 0.12);
  },
  /* ---- the away-day box ----
     Three guns, three noises, none of them a gunshot: a dart blaster is a
     spring and a thump of air, a band is a snap, and a water pistol is a hiss
     with nothing behind it. The whole joke is in the sound, so it is written
     out here beside everything else rather than hidden in engine/guns.js. */
  gun(id) {
    if (id === 'band') { this.tone(900, 0.04, 'square', 0.16, 0, -500); this.noise(0.04, 0.08); return; }
    if (id === 'water') { this.noise(0.09, 0.055); this.tone(320, 0.05, 'sine', 0.05, 0, 180); return; }
    this.noise(0.06, 0.13); this.tone(220, 0.09, 'square', 0.13, 0, -90);
  },
  /* Something soft arriving on something that is not. */
  plink() { this.tone(ri(420, 620), 0.04, 'triangle', 0.12); this.noise(0.04, 0.05); },
  splat() { this.noise(0.12, 0.09); },
  /* The fumbling. Two clicks and a clunk, which is six darts going back in. */
  reload() { this.tone(170, 0.05, 'square', 0.12); this.tone(140, 0.06, 'square', 0.1, 0.14); this.noise(0.06, 0.06, 0.28); },
  /* Taking it out of a drawer it should not be in. */
  draw() { this.tone(300, 0.05, 'triangle', 0.14); this.tone(460, 0.06, 'triangle', 0.12, 0.05); },
  /* A swing is air and nothing else — foam through an office, or five hundred
     and one pages of policy through the same air, which is heavier and slower
     and should sound like it. */
  swing(id) {
    if (id === 'pack') { this.noise(0.22, 0.1); this.tone(120, 0.16, 'sine', 0.07, 0, -40); return; }
    this.noise(0.14, 0.06); this.tone(260, 0.1, 'sine', 0.05, 0, -90);
  },
  /* And a swing that finds somebody. Soft, because everything in that box is
     soft, and low enough to be felt rather than heard. */
  bonk() { this.tone(150, 0.09, 'sine', 0.2); this.noise(0.07, 0.09); },
  horn() { this.tone(392, 0.3, 'sawtooth', 0.16); this.tone(330, 0.3, 'sawtooth', 0.14, 0.01); },
  /* THE BLEEPER on a pelican crossing. Deliberately the ugliest noise in this
     file: a hard square wave at 2.5kHz, which is where the ear is sharpest and
     which is exactly why the real ones are pitched there. It is the only sound
     in this game made for people who cannot see the thing making it. */
  bleep() { this.tone(2500, 0.09, 'square', 0.09); },
  thud(force) {
    const v = clamp(force || 0.5, 0.1, 1);
    this.noise(0.14 + v * 0.1, 0.16 + v * 0.24);
    this.tone(70 + v * 40, 0.16, 'square', 0.1 + v * 0.16, 0, -30);
  },
  scrape() { this.noise(0.1, 0.07); },
  /* Hold music: a MIDI keyboard demo of Greensleeves, played by a machine
     that has never been outdoors. */
  holdMusic(start) {
    clearTimeout(this.holdTimer); this.holdTimer = null;
    if (!start || !this.music || !this.on || !this.ctx) return;
    const mel = [440, 523, 587, 659, 698, 659, 587, 494, 440, 392, 440, 494, 523, 494, 440, 415];
    let i = 0;
    const loop = () => {
      if (!this.music || !this.on) return;
      const f = mel[i % mel.length];
      this.tone(f * (chance(0.06) ? 1.06 : 1), 0.26, 'triangle', 0.09);
      this.tone(f / 2, 0.3, 'sine', 0.05);
      i++;
      this.holdTimer = setTimeout(loop, i % 8 === 0 ? 420 : 300);
    };
    loop();
  }
};
