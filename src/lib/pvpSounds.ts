// Inline Web Audio sound utility for PVP wheel — no deps.
const ac = () => {
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
};
const beep = (cfg: (a: AudioContext, o: OscillatorNode, g: GainNode) => number) => {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(); const g = a.createGain();
  o.connect(g); g.connect(a.destination);
  const dur = cfg(a, o, g);
  o.start(); o.stop(a.currentTime + dur);
};

export const sounds = {
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
};
