import React from "react";

/**
 * PvpWheelVisual — clean numbered ring (1..N) on the site's navy theme.
 * On round end runs a casino-style sequence (A→G):
 *   A) sequential blue fill 1→N (50ms per tile)
 *   B) 3 synchronized blinks (130ms each)
 *   C) fast rotation, 3 laps at 30ms/tile
 *   D) easing slowdown landing on the winner
 *   E) winner lock — winner explodes orange, others dim, wheel shakes
 *   F) "NEW ROUND IN" countdown with tick sound
 *   G) white flash + bounce-in reset on new round
 * The wheel always stays circular — never flattens.
 */

type AnimPhase =
  | "idle"
  | "seqFill"
  | "blink"
  | "spinFast"
  | "spinSlow"
  | "winnerLock";

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
  const tone = (
    freq: number, dur = 0.08, type: OscillatorType = "sine",
    gain = 0.06, glide?: number,
  ) => {
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
    tick: () => tone(440, 0.1, "sine", 0.08),
    blip: () => tone(520, 0.04, "square", 0.04),
    whoosh: () => tone(220, 0.5, "sawtooth", 0.05, 880),
    chime: () => {
      tone(660, 0.18, "sine", 0.06);
      setTimeout(() => tone(880, 0.18, "sine", 0.06), 120);
      setTimeout(() => tone(1320, 0.34, "sine", 0.07), 260);
    },
  };
}

export default function PvpWheelVisual({
  size = 520,
  tiles,
  roundId,
  timeLeftMs,
  isOpen,
  isLocked,
  isCooldown,
  cooldownMs,
  pot,
  winningTile,
  myTiles,
  tilesWithBets,
  myPayout,
  onTileClick,
  soundOn = true,
}: {
  size?: number;
  tiles: number;
  roundId: number | null;
  timeLeftMs: number;
  totalRoundMs?: number;
  isOpen: boolean;
  isLocked: boolean;
  isCooldown: boolean;
  cooldownMs: number;
  players?: number;
  pot: number;
  winningTile?: number | null;
  myTiles: Set<number>;
  tilesWithBets?: Set<number>;
  myPayout?: number | null;
  onTileClick: (tile: number) => void;
  soundOn?: boolean;
}) {
  const audio = useAudio();
  const secsLeft = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const cdSecs = Math.max(0, Math.ceil(cooldownMs / 1000));

  const [phase, setPhase] = React.useState<AnimPhase>("idle");
  const [seqIdx, setSeqIdx] = React.useState(0);
  const [blinkOn, setBlinkOn] = React.useState(true);
  const [spinIdx, setSpinIdx] = React.useState(0);
  const [flash, setFlash] = React.useState(false);
  const [shake, setShake] = React.useState(false);
  const [bounceKey, setBounceKey] = React.useState(0);
  const wonRef = React.useRef<number | null>(null);
  const spinIdxRef = React.useRef(0);
  React.useEffect(() => { spinIdxRef.current = spinIdx; }, [spinIdx]);

  const lastTickSec = React.useRef(-1);
  const lastCdSec = React.useRef(-1);

  // beep last 10s of open
  React.useEffect(() => {
    if (!soundOn || isLocked || isCooldown || !isOpen) return;
    if (secsLeft !== lastTickSec.current && secsLeft <= 10 && secsLeft > 0) {
      lastTickSec.current = secsLeft;
      audio.blip();
    }
  }, [secsLeft, soundOn, isOpen, isLocked, isCooldown]);

  // tick every second during cooldown
  React.useEffect(() => {
    if (!soundOn || !isCooldown) return;
    if (cdSecs !== lastCdSec.current && cdSecs > 0) {
      lastCdSec.current = cdSecs;
      audio.tick();
    }
  }, [cdSecs, soundOn, isCooldown]);

  // run sequence A→E once per cooldown winner
  React.useEffect(() => {
    if (!isCooldown || winningTile == null) return;
    if (wonRef.current === winningTile) return;
    wonRef.current = winningTile;

    const timers: number[] = [];
    const intervals: number[] = [];
    let alive = true;

    // PHASE A
    setPhase("seqFill"); setSeqIdx(0);
    if (soundOn) audio.chime();
    let i = 0;
    const seq = window.setInterval(() => {
      if (!alive) return;
      i += 1; setSeqIdx(i);
      if (soundOn) audio.blip();
      if (i >= tiles) window.clearInterval(seq);
    }, 50);
    intervals.push(seq);

    const tA = tiles * 50 + 200;

    // PHASE B — 3 blinks (6 toggles)
    timers.push(window.setTimeout(() => {
      if (!alive) return;
      setPhase("blink"); setBlinkOn(true);
      let n = 0;
      const bi = window.setInterval(() => {
        if (!alive) return;
        n += 1; setBlinkOn((b) => !b);
        if (n >= 5) window.clearInterval(bi);
      }, 130);
      intervals.push(bi);
    }, tA));
    const tB = tA + 6 * 130;

    // PHASE C — fast rotation, 3 laps
    const fastStep = 30;
    const fastSteps = 3 * tiles;
    timers.push(window.setTimeout(() => {
      if (!alive) return;
      setPhase("spinFast");
      let k = 0;
      const ci = window.setInterval(() => {
        if (!alive) return;
        k += 1;
        setSpinIdx(((k - 1) % tiles) + 1);
        if (soundOn && k % 2 === 0) audio.blip();
        if (k >= fastSteps) window.clearInterval(ci);
      }, fastStep);
      intervals.push(ci);
    }, tB));
    const tC = tB + fastSteps * fastStep;

    // PHASE D — slowdown into winner
    timers.push(window.setTimeout(() => {
      if (!alive) return;
      setPhase("spinSlow");
      const baseDurations = [40, 55, 75, 100, 130, 170, 220, 280, 350, 430, 520];
      const start = ((spinIdxRef.current % tiles) || tiles);
      let dist = (winningTile - start + tiles) % tiles;
      if (dist === 0) dist = tiles;
      const stepDurations: number[] = [];
      for (let s = 0; s < dist; s++) {
        const di = Math.floor((s / dist) * baseDurations.length);
        stepDurations.push(baseDurations[Math.min(baseDurations.length - 1, di)]);
      }
      let acc = 0;
      let cur = start;
      stepDurations.forEach((dur) => {
        acc += dur;
        const at = acc;
        timers.push(window.setTimeout(() => {
          if (!alive) return;
          cur = (cur % tiles) + 1;
          setSpinIdx(cur);
          if (soundOn) audio.blip();
        }, at));
      });
      const dTotal = acc;

      // PHASE E
      timers.push(window.setTimeout(() => {
        if (!alive) return;
        setPhase("winnerLock");
        setSpinIdx(winningTile);
        if (soundOn) audio.chime();
        setShake(true);
        timers.push(window.setTimeout(() => setShake(false), 260));
      }, dTotal + 20));
    }, tC));

    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
      intervals.forEach((iv) => window.clearInterval(iv));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCooldown, winningTile, tiles, soundOn]);

  // PHASE G — new round
  React.useEffect(() => {
    if (!isCooldown && phase !== "idle") {
      setFlash(true);
      if (soundOn) audio.whoosh();
      const t1 = window.setTimeout(() => setFlash(false), 320);
      setPhase("idle");
      setSeqIdx(0); setSpinIdx(0);
      wonRef.current = null;
      setBounceKey((k) => k + 1);
      return () => window.clearTimeout(t1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCooldown]);

  // geometry
  const cx = size / 2;
  const cy = size / 2;
  const rOut = size * 0.48;
  const rIn  = size * 0.34;
  const rHub = size * 0.32;
  const segA = (Math.PI * 2) / tiles;

  const path = (i: number, r1: number, r2: number, gap = 0.018) => {
    const a = segA;
    const a0 = i * a - Math.PI / 2 + gap;
    const a1 = (i + 1) * a - Math.PI / 2 - gap;
    const p = (ang: number, r: number) =>
      `${cx + Math.cos(ang) * r} ${cy + Math.sin(ang) * r}`;
    return `M ${p(a0, r2)} L ${p(a0, r1)} A ${r1} ${r1} 0 0 1 ${p(a1, r1)} L ${p(a1, r2)} A ${r2} ${r2} 0 0 0 ${p(a0, r2)} Z`;
  };

  const labelPos = (i: number) => {
    const a = (i + 0.5) * segA - Math.PI / 2;
    const r = (rOut + rIn) / 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, deg: (a * 180) / Math.PI + 90 };
  };
  const dotPos = (i: number) => {
    const a = (i + 0.35) * segA - Math.PI / 2;
    const r = rOut - size * 0.025;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const statusLabel = isLocked ? "LOCKED" : "ROUND OPEN";
  const statusColor = isLocked ? "#ef4444" : "#f97316";

  type TileStyle = {
    fill: string; stroke: string; opacity: number; scale: number;
    glow?: string; textColor: string;
  };
  const tileStyle = (tile: number): TileStyle => {
    const idx = tile - 1;
    const isWinner = winningTile != null && winningTile === tile;
    const mine = myTiles.has(tile);
    const base: TileStyle = {
      fill: "#0f172a", stroke: "#1e3a5f", opacity: 1, scale: 1,
      textColor: "#64748b",
    };

    if (phase === "seqFill") {
      if (idx < seqIdx) return { ...base, fill: "#3b82f6", stroke: "#60a5fa", textColor: "#fff" };
      return base;
    }
    if (phase === "blink") {
      return blinkOn
        ? { ...base, fill: "#3b82f6", stroke: "#60a5fa", textColor: "#fff" }
        : { ...base, fill: "#0b1220", stroke: "#1e293b", textColor: "#475569" };
    }
    if (phase === "spinFast" || phase === "spinSlow") {
      if (tile === spinIdx) {
        return { ...base, fill: "#f97316", stroke: "#fdba74", textColor: "#fff",
          glow: "drop-shadow(0 0 10px rgba(249,115,22,.9))" };
      }
      return { ...base, fill: "#0b1220", stroke: "#1e293b", textColor: "#475569" };
    }
    if (phase === "winnerLock") {
      if (isWinner) {
        return { fill: "#f97316", stroke: "#fdba74", opacity: 1, scale: 1.2,
          textColor: "#fff",
          glow: "drop-shadow(0 0 14px #f97316) drop-shadow(0 0 28px rgba(249,115,22,.6))" };
      }
      return { ...base, opacity: 0.2, scale: 0.92, fill: "#0b1220", stroke: "#1e293b" };
    }
    // idle
    if (mine) return { ...base, fill: "#0f172a", stroke: "#10b981", textColor: "#fff" };
    return base;
  };

  const showWinnerCenter =
    phase === "winnerLock" || (isCooldown && phase === "idle" && winningTile != null);
  const youWon = winningTile != null && myTiles.has(winningTile);

  return (
    <div style={{
      position: "relative",
      width: size, maxWidth: "100%",
      aspectRatio: "1 / 1",
      margin: "0 auto",
      animation: shake ? "pvpShake 240ms linear" : undefined,
    }}>
      <svg
        key={bounceKey}
        width="100%" height="100%"
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <radialGradient id="pvpHaloRing" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="rgba(249,115,22,0)" />
            <stop offset="100%" stopColor="rgba(249,115,22,0.10)" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r={rOut + 6} fill="url(#pvpHaloRing)" />

        {Array.from({ length: tiles }).map((_, i) => {
          const tile = i + 1;
          const t = tileStyle(tile);
          const { x, y, deg } = labelPos(i);
          const mine = myTiles.has(tile);
          const hasBet = tilesWithBets?.has(tile);
          const dot = dotPos(i);
          const enterDelay = phase === "idle" ? i * 20 : 0;
          return (
            <g
              key={`t-${tile}`}
              onClick={() => onTileClick(tile)}
              className="pvpTile"
              data-default={t.fill === "#0f172a" && phase === "idle" ? "1" : "0"}
              style={{
                cursor: isOpen ? "pointer" : "not-allowed",
                transform: `scale(${t.scale})`,
                transformOrigin: `${x}px ${y}px`,
                transition: "transform 260ms cubic-bezier(.22,.61,.36,1), opacity 260ms ease, filter 200ms ease",
                opacity: t.opacity,
                filter: t.glow,
                animation: phase === "idle" ? `pvpTileIn 380ms ${enterDelay}ms both` : undefined,
              }}
            >
              <path
                d={path(i, rIn, rOut, 0.02)}
                fill={t.fill}
                stroke={t.stroke}
                strokeWidth={1}
                style={{ transition: "fill 220ms ease, stroke 220ms ease" }}
              />
              {hasBet && !mine && phase === "idle" && (
                <circle cx={dot.x} cy={dot.y} r={size * 0.012} fill="#06b6d4" />
              )}
              {mine && phase === "idle" && (
                <text
                  x={dot.x} y={dot.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={size * 0.022} fontWeight={900} fill="#10b981"
                  style={{ pointerEvents: "none" }}
                >✓</text>
              )}
              <text
                x={x} y={y}
                transform={`rotate(${deg} ${x} ${y})`}
                textAnchor="middle" dominantBaseline="central"
                fontSize={size * 0.024}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight={700}
                fill={t.textColor}
                style={{ pointerEvents: "none", userSelect: "none",
                  transition: "fill 220ms ease" }}
              >
                {tile}
              </text>
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={rHub} fill="#0a0a0a"
          stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={rHub - 6} fill="none"
          stroke="rgba(249,115,22,0.18)" strokeWidth={1} />
      </svg>

      {/* CENTER HUD */}
      <div style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center",
        pointerEvents: "none", textAlign: "center",
      }}>
        {!isCooldown && (
          <div>
            <div style={{
              fontSize: 11, letterSpacing: ".22em", color: statusColor,
              fontWeight: 800, marginBottom: 6,
            }}>{statusLabel}</div>
            <div className="mono" style={{
              fontSize: Math.round(size * 0.09), fontWeight: 800, color: "#fff",
              letterSpacing: "-.02em",
              textShadow: "0 0 22px rgba(249,115,22,.45)",
            }}>{fmt(timeLeftMs)}</div>
            <div style={{
              marginTop: 10, display: "grid", gap: 4,
              fontSize: 12, color: "rgba(255,255,255,.72)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}>
              <div><span style={{ color: "rgba(255,255,255,.5)" }}>POOL </span>
                <b style={{ color: "#fff" }}>{pot.toFixed(3)}</b></div>
              <div style={{ color: "#f97316" }}>ROUND #{roundId ?? "—"}</div>
            </div>
          </div>
        )}

        {isCooldown && phase !== "winnerLock" && phase !== "idle" && (
          <div style={{
            fontSize: 11, letterSpacing: ".28em", color: "#3b82f6",
            fontWeight: 800,
          }}>RESOLVING…</div>
        )}

        {showWinnerCenter && winningTile != null && (
          <div>
            <div style={{
              fontSize: Math.round(size * 0.06), fontWeight: 900,
              color: "#f97316",
              textShadow: "0 0 22px rgba(249,115,22,.6)",
              fontFamily: "'Space Grotesk',system-ui,sans-serif",
              letterSpacing: ".02em",
            }}>🏆 TILE {winningTile} WINS!</div>
            <div style={{
              marginTop: 8, fontSize: 13, color: "#94a3b8",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}>POOL: {pot.toFixed(3)} zkLTC</div>
            {youWon && (
              <div style={{
                marginTop: 6, fontSize: 15, fontWeight: 900, color: "#10b981",
                textShadow: "0 0 14px rgba(16,185,129,.5)",
              }}>YOU WON!{myPayout ? ` +${myPayout.toFixed(3)} zkLTC` : ""}</div>
            )}
            <div style={{
              marginTop: 14, fontSize: 11, letterSpacing: ".24em",
              color: "#94a3b8", fontWeight: 800,
            }}>NEW ROUND IN</div>
            <div className="mono" style={{
              fontSize: Math.round(size * 0.11), fontWeight: 800,
              color: "#00d4ff", lineHeight: 1, marginTop: 2,
              textShadow: "0 0 20px #00d4ff",
            }}>{cdSecs}</div>
          </div>
        )}
      </div>

      {flash && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(255,255,255,.5)",
          animation: "pvpFlash 320ms ease both",
          pointerEvents: "none",
        }} />
      )}

      <style>{`
        @keyframes pvpFlash {
          0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; }
        }
        @keyframes pvpShake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
        @keyframes pvpTileIn {
          0%   { transform: scale(.9); opacity: 0; }
          60%  { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pvpTile[data-default="1"]:hover path {
          fill: #7c2d12 !important;
          stroke: #f97316 !important;
        }
        .pvpTile[data-default="1"]:hover text {
          fill: #fff !important;
        }
        .pvpTile[data-default="1"]:hover {
          transform: scale(1.08) !important;
          filter: drop-shadow(0 0 12px rgba(249,115,22,.5));
        }
      `}</style>
    </div>
  );
}