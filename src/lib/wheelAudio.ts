// Web Audio API custom synthesizer for retro-futuristic sound effects without dependencies

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

const getAudioContext = (): AudioContext => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const setSoundEnabled = (enabled: boolean) => {
  soundEnabled = enabled;
  if (!enabled && audioCtx) {
    // suspension is a graceful way to mute
    audioCtx.suspend();
  } else if (enabled && audioCtx) {
    audioCtx.resume();
  }
};

export const isSoundEnabled = () => soundEnabled;

// Play a quick high-frequency woodblock or tick sound for segment highlight transition
export const playTick = (step: number, totalSteps: number) => {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Create a rising pitch frequency sweep depending on the spin progress for dynamic feedback!
    const progress = step / totalSteps;
    const baseFreq = 300 + progress * 500; // between 300Hz and 800Hz

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch (e) {
    // fallback if audio blocked
  }
};

// Play standard interface click
export const playClick = () => {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (e) {
    // ignore
  }
};

// Play a triumphant success fanfare
export const playSuccessChime = () => {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Play a lovely major chord arpeggio!
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 (major chord!)
    
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      
      // Dynamic vibrato!
      osc.frequency.linearRampToValueAtTime(freq * 1.01, now + idx * 0.1 + 0.2);
      
      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.6);
    });
  } catch (e) {
    // ignore
  }
};

// Play round started whoosh / sweep
export const playRoundStarted = () => {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.3);

    // Filter to sweep lowpass
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // ignore
  }
};

// Play tick down warning (urgent heartbeat sound)
export const playHeartbeat = () => {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(70, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    // ignore
  }
};
