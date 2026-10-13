// Tiny WebAudio SFX: GBA-flavoured square blips and a filtered-noise dig rumble.
let ctx = null;
let rumble = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function blip(freq, dur = 0.06, type = 'square', vol = 0.12, slide = 0) {
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  } catch (e) { /* audio is optional */ }
}

export const sfx = {
  unlock() { try { ac(); } catch (e) {} },
  move() { blip(880, 0.05, 'square', 0.06); },
  select() { blip(660, 0.05, 'square', 0.1); setTimeout(() => blip(990, 0.08, 'square', 0.1), 50); },
  cancel() { blip(440, 0.08, 'square', 0.08, -200); },
  bump() { blip(120, 0.05, 'triangle', 0.1); },
  pop() { blip(300, 0.12, 'square', 0.12, 500); },
  thud() { blip(90, 0.16, 'triangle', 0.18, -60); },
  jingle() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.12, 'square', 0.09), i * 70)); },
  rumbleStart() {
    try {
      const a = ac();
      const len = a.sampleRate * 2;
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = a.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.7;
      const lfo = a.createOscillator();
      const lg = a.createGain();
      lfo.frequency.value = 9; lg.gain.value = 120;
      lfo.connect(lg).connect(f.frequency);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, a.currentTime + 0.3);
      src.connect(f).connect(g).connect(a.destination);
      src.start(); lfo.start();
      rumble = { src, lfo, g };
    } catch (e) {}
  },
  rumbleStop() {
    if (!rumble) return;
    try {
      const a = ac();
      rumble.g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.35);
      const r = rumble;
      setTimeout(() => { try { r.src.stop(); r.lfo.stop(); } catch (e) {} }, 400);
    } catch (e) {}
    rumble = null;
  },
};
