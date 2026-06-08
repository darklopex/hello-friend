import React from "react";

/**
 * PvpWheel — circular 60-segment wheel inspired by the user's reference video.
 * Shows live round progress (countdown in center), fills outer segments as
 * time elapses, then plays a "round complete" sweep + chime, then a "new
 * round" whoosh when it resets. Pure SVG + Web Audio API (no assets).
 */

type Phase = "open" | "complete" | "reset";

function useAudio() {
  const ctxRef = React.useRef<AudioContext | null>(null);
  const get = () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) ctxRef.current = new AC();
    }
    return ctxRef.current;
  };
  const tone = (freq: number, dur = 0.08, type: OscillatorType = "sine", gain = 0.06, glide?: number) => {
    const ctx = get(); if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  };
  return {
    tick: () => tone(880, 0.05, "square", 0.025),
    click: () => tone(1200, 0.04, "triangle", 0.03),
    whoosh: () => tone(220, 0.45, "sawtooth", 0.05, 880),
    chime: () => {
      tone(660, 0.18, "sine", 0.06);
      setTimeout(() => tone(880, 0.18, "sine", 0.06), 120);
      setTimeout(() => tone(1320, 0.32, "sine", 0.07), 260);
    },
  };
}

export default function PvpWheel({
  msLeft,
  totalMs,
  players,
  pot,
  estBlock,
  locked,
  settled,
  winnerIndex,
  size = 280,
  soundOn = true,
}: {
  msLeft: number;
  totalMs: number;
  players: number;
  pot: number;
  estBlock: number | null;
  locked: boolean;
  settled: boolean;
  winnerIndex?: number | null;
  size?: number;
  soundOn?: boolean;
}) {
  const SEG = 60;
  const audio = useAudio();
  const lastTickSec = React.useRef<number>(-1);
  const lastFilled = React.useRef<number>(0);
  const phaseRef = React.useRef<Phase>("open");
  const [sweep, setSweep] = React.useState(-1); // sweep highlight index for complete anim
  const [pulseKey, setPulseKey] = React.useState(0);

  const elapsed = Math.max(0, totalMs - msLeft);
  const progress = totalMs > 0 ? Math.min(1, elapsed / totalMs) : 0;
  const filled = Math.min(SEG, Math.floor(progress * SEG));
  const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));

  // tick sound every second when <=10s, and click on segment fill
  React.useEffect(() => {
    if (!soundOn) return;
    if (filled > lastFilled.current) {
      lastFilled.current = filled;
      audio.click();
    }
  }, [filled, soundOn]);

  React.useEffect(() => {
    if (!soundOn || locked || settled) return;
    if (secsLeft !== lastTickSec.current && secsLeft <= 10 && secsLeft > 0) {
      lastTickSec.current = secsLeft;
      audio.tick();
    }
  }, [secsLeft, soundOn, locked, settled]);

  // round complete: sweep + chime
  React.useEffect(() => {
    if (settled && phaseRef.current !== "complete") {
      phaseRef.current = "complete";
      if (soundOn) audio.chime();
      let i = 0;
      const id = setInterval(() => {
        i++;
        setSweep(i);
        if (i >= SEG) clearInterval(id);
      }, 18);
      return () => clearInterval(id);
    }
    if (!settled && phaseRef.current === "complete") {
      // new round
      phaseRef.current = "open";
      lastFilled.current = 0;
      setSweep(-1);
      setPulseKey((k) => k + 1);
      if (soundOn) audio.whoosh();
    }
  }, [settled, soundOn]);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.46;
  const rOuterIn = size * 0.36;
  const rInner = size * 0.34;
  const rInnerIn = size * 0.28;
  const segAngle = (Math.PI * 2) / SEG;

  const seg = (i: number, r1: number, r2: number, gap = 0.012) => {
    const a0 = i * segAngle - Math.PI / 2 + gap;
    const a1 = (i + 1) * segAngle - Math.PI / 2 - gap;
    const p = (a: number, r: number) => `${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
    return `M ${p(a0, r2)} L ${p(a0, r1)} A ${r1} ${r1} 0 0 1 ${p(a1, r1)} L ${p(a1, r2)} A ${r2} ${r2} 0 0 0 ${p(a0, r2)} Z`;
  };

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "grid", placeItems: "center", padding: "8px 0 12px", position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} key={pulseKey} style={{ display: "block" }}>
        <defs>
          <radialGradient id="pvpGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(249,115,22,0.18)" />
            <stop offset="100%" stopColor="rgba(249,115,22,0)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={rOuter + 4} fill="url(#pvpGlow)" />

        {/* outer ring */}
        {Array.from({ length: SEG }).map((_, i) => {
          const lit = settled ? true : i < filled;
          const isSweep = settled && sweep >= 0 && i <= sweep;
          const isWinner = settled && winnerIndex != null && i === winnerIndex;
          const fill = isWinner
            ? "#22c55e"
            : isSweep
              ? "#fde047"
              : lit
                ? "#f97316"
                : "rgba(255,255,255,0.05)";
          const stroke = isWinner ? "#16a34a" : "rgba(255,255,255,0.08)";
          return (
            <path
              key={`o-${i}`}
              d={seg(i, rOuterIn, rOuter)}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.5}
              style={{ transition: "fill 240ms ease" }}
            />
          );
        })}

        {/* inner ring (decorative) */}
        {Array.from({ length: SEG }).map((_, i) => {
          const lit = settled || i < Math.floor(filled * 0.85);
          return (
            <path
              key={`i-${i}`}
              d={seg(i, rInnerIn, rInner, 0.02)}
              fill={lit ? "rgba(249,115,22,0.35)" : "rgba(255,255,255,0.03)"}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={0.3}
              style={{ transition: "fill 240ms ease" }}
            />
          );
        })}

        {/* center disc */}
        <circle cx={cx} cy={cy} r={rInnerIn - 6} fill="#0a0a0a" stroke="rgba(255,255,255,0.08)" />
      </svg>

      {/* center HUD overlay */}
      <div style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center",
        pointerEvents: "none", textAlign: "center",
      }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: ".2em", color: "#f97316",
            fontWeight: 800, marginBottom: 4,
          }}>
            {settled ? "ROUND COMPLETE" : locked ? "LOCKED" : "ROUND OPEN"}
          </div>
          <div className="mono" style={{
            fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: "-.02em",
            textShadow: "0 0 18px rgba(249,115,22,.4)",
          }}>{fmt(msLeft)}</div>
          <div style={{ marginTop: 8, display: "grid", gap: 2, fontSize: 11, color: "rgba(255,255,255,.7)" }}>
            <div>Pot <b style={{ color: "#fff" }}>{pot.toFixed(3)}</b></div>
            <div>Players <b style={{ color: "#fff" }}>{players}</b></div>
            {estBlock != null && <div style={{ color: "#00e5ff" }}>#{estBlock.toLocaleString()}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}