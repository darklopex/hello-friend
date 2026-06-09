// Inline Web Audio sound utility for PVP wheel — no deps.
// Keep one shared context so a user gesture can unlock it once for later winner sounds.
let audioCtx: AudioContext | null = null;

const ac = () => {
  try {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch { return null; }
};

const beep = (cfg: (a: AudioContext, o: OscillatorNode, g: GainNode) => number) => {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(); const g = a.createGain();
  o.connect(g); g.connect(a.destination);
  const dur = cfg(a, o, g);
  o.start(); o.stop(a.currentTime + dur);
};

export const sounds = {
  unlock: () => {
    const a = ac(); if (!a) return;
    void a.resume();
    const o = a.createOscillator();
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, a.currentTime);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.02);
  },
  hover: () => beep((a, o, g) => {
    o.frequency.value = 600;
    g.gain.setValueAtTime(0.04, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.05);
    return 0.05;
  }),
  click: () => beep((a, o, g) => {
    o.frequency.value = 900;
    g.gain.setValueAtTime(0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.08);
    return 0.08;
  }),
  betPlaced: () => beep((a, o, g) => {
    o.type = 'sine';
    o.frequency.setValueAtTime(500, a.currentTime);
    o.frequency.linearRampToValueAtTime(900, a.currentTime + 0.15);
    g.gain.setValueAtTime(0.1, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.3);
    return 0.3;
  }),
  tick: (freq = 440) => beep((a, o, g) => {
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.08);
    return 0.08;
  }),
  winner: () => beep((a, o, g) => {
    o.type = 'sine';
    o.frequency.setValueAtTime(400, a.currentTime);
    o.frequency.linearRampToValueAtTime(1200, a.currentTime + 0.4);
    g.gain.setValueAtTime(0.15, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.6);
    return 0.6;
  }),
  // Triumphant multi-oscillator chord stinger for the winning-tile reveal.
  jackpot: () => {
    const a = ac(); if (!a) return;
    const now = a.currentTime;
    // Major chord arpeggio: C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const start = now + i * 0.07;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = i === notes.length - 1 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
      o.connect(g); g.connect(a.destination);
      o.start(start); o.stop(start + 0.95);
    });
    // Sub bass thump
    const bo = a.createOscillator();
    const bg = a.createGain();
    bo.type = 'sine';
    bo.frequency.setValueAtTime(140, now);
    bo.frequency.exponentialRampToValueAtTime(70, now + 0.35);
    bg.gain.setValueAtTime(0.0001, now);
    bg.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    bo.connect(bg); bg.connect(a.destination);
    bo.start(now); bo.stop(now + 0.55);
    // Sparkle high ping
    const so = a.createOscillator();
    const sg = a.createGain();
    so.type = 'square';
    so.frequency.setValueAtTime(1760, now + 0.25);
    so.frequency.exponentialRampToValueAtTime(2637, now + 0.45);
    sg.gain.setValueAtTime(0.0001, now + 0.25);
    sg.gain.exponentialRampToValueAtTime(0.05, now + 0.27);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    so.connect(sg); sg.connect(a.destination);
    so.start(now + 0.25); so.stop(now + 0.75);
  },
};
