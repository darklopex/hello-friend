import React from "react";

/**
 * PvpWheelVisual — dark, Solana-mining-style wheel matching the reference
 * video. Two concentric rings:
 *   - Outer: 60 chunky tiles that fill orange as miners "deploy" (driven by
 *     time progress + player count, pseudo-randomly placed per round).
 *   - Inner: `tiles` numbered tiles (1..N) — these are the actual bet slots
 *     and are click-targets.
 * On round end the inner ring sweeps gold and the winning tile flashes
 * green, with a chime. In cooldown the wheel tilts back into 3D perspective
 * and a glowing center logo + "STARTS IN" countdown appears, with whoosh
 * sounds when the new round starts.
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
    click: () => tone(1200, 0.04, "triangle", 0.035),
    whoosh: () => tone(220, 0.5, "sawtooth", 0.05, 880),
    chime: () => {
      tone(660, 0.18, "sine", 0.06);
      setTimeout(() => tone(880, 0.18, "sine", 0.06), 120);
      setTimeout(() => tone(1320, 0.34, "sine", 0.07), 260);
    },
  };
}

function shuffleSeeded(n: number, seed: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = (seed * 9301 + 49297) % 233280 || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PvpWheelVisual({
  size = 520,
  tiles,
  roundId,
  timeLeftMs,
  totalRoundMs,
  isOpen,
  isLocked,
  isCooldown,
  cooldownMs,
  players,
  pot,
  winningTile,        // 1..tiles when settled
  myTiles,            // Set<number>
  onTileClick,
  soundOn = true,
}: {
  size?: number;
  tiles: number;
  roundId: number | null;
  timeLeftMs: number;
  totalRoundMs: number;
  isOpen: boolean;
  isLocked: boolean;
  isCooldown: boolean;
  cooldownMs: number;
  players: number;
  pot: number;
  winningTile?: number | null;
  myTiles: Set<number>;
  onTileClick: (tile: number) => void;
  soundOn?: boolean;
}) {
  const OUTER_SEG = 60;
  const audio = useAudio();
  const lastTickSec = React.useRef<number>(-1);
  const lastPlayers = React.useRef<number>(0);
  const phaseRef = React.useRef<Phase>("open");
  const [sweep, setSweep] = React.useState(-1);
  const [pulseKey, setPulseKey] = React.useState(0);

  const elapsed = Math.max(0, totalRoundMs - timeLeftMs);
  const progress = totalRoundMs > 0 ? Math.min(1, elapsed / totalRoundMs) : 0;
  const secsLeft = Math.max(0, Math.ceil(timeLeftMs / 1000));

  // pseudo-random outer tile fill order — stable per round
  const slotOrder = React.useMemo(
    () => shuffleSeeded(OUTER_SEG, roundId ?? 1),
    [roundId],
  );
  const outerFilled = isCooldown
    ? OUTER_SEG
    : Math.min(OUTER_SEG, Math.max(4, players) + Math.floor(progress * 22));
  const outerLit = React.useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < outerFilled; i++) s.add(slotOrder[i]);
    return s;
  }, [outerFilled, slotOrder]);

  // sounds
  React.useEffect(() => {
    if (!soundOn) return;
    if (players > lastPlayers.current) { audio.click(); }
    lastPlayers.current = players;
  }, [players, soundOn]);

  React.useEffect(() => {
    if (!soundOn || isLocked || isCooldown || !isOpen) return;
    if (secsLeft !== lastTickSec.current && secsLeft <= 10 && secsLeft > 0) {
      lastTickSec.current = secsLeft;
      audio.tick();
    }
  }, [secsLeft, soundOn, isOpen, isLocked, isCooldown]);

  // phase transitions: open → complete → reset → open
  React.useEffect(() => {
    if (isCooldown && phaseRef.current !== "complete") {
      phaseRef.current = "complete";
      if (soundOn) audio.chime();
      let i = 0;
      const id = setInterval(() => {
        i += 1;
        setSweep(i);
        if (i >= OUTER_SEG) clearInterval(id);
      }, 22);
      return () => clearInterval(id);
    }
    if (!isCooldown && phaseRef.current === "complete") {
      phaseRef.current = "open";
      setSweep(-1);
      setPulseKey((k) => k + 1);
      lastPlayers.current = 0;
      if (soundOn) audio.whoosh();
    }
  }, [isCooldown, soundOn]);

  // geometry
  const cx = size / 2;
  const cy = size / 2;
  const rOuterOut = size * 0.485;
  const rOuterIn  = size * 0.385;
  const rMid      = size * 0.365;
  const rInnerOut = size * 0.35;
  const rInnerIn  = size * 0.255;
  const rHub      = size * 0.235;

  const segOuter = (Math.PI * 2) / OUTER_SEG;
  const segInner = (Math.PI * 2) / tiles;

  const path = (i: number, segCount: number, r1: number, r2: number, gap = 0.012) => {
    const a = (Math.PI * 2) / segCount;
    const a0 = i * a - Math.PI / 2 + gap;
    const a1 = (i + 1) * a - Math.PI / 2 - gap;
    const p = (ang: number, r: number) =>
      `${cx + Math.cos(ang) * r} ${cy + Math.sin(ang) * r}`;
    return `M ${p(a0, r2)} L ${p(a0, r1)} A ${r1} ${r1} 0 0 1 ${p(a1, r1)} L ${p(a1, r2)} A ${r2} ${r2} 0 0 0 ${p(a0, r2)} Z`;
  };

  const innerLabelPos = (i: number) => {
    const a = (i + 0.5) * segInner - Math.PI / 2;
    const r = (rInnerOut + rInnerIn) / 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, deg: (a * 180) / Math.PI + 90 };
  };

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const wheelTransform = isCooldown
    ? "perspective(1100px) rotateX(58deg) translateY(-4%) scale(.94)"
    : "perspective(1100px) rotateX(0deg)";

  const statusLabel = isCooldown
    ? "ROUND COMPLETE"
    : isLocked
      ? "LOCKED"
      : "ROUND OPEN";
  const statusColor = isCooldown ? "#fbbf24" : isLocked ? "#ef4444" : "#f97316";

  return (
    <div style={{
      position: "relative",
      width: size, maxWidth: "100%",
      aspectRatio: "1 / 1",
      margin: "0 auto",
    }}>
      <svg
        key={pulseKey}
        width="100%" height="100%"
        viewBox={`0 0 ${size} ${size}`}
        style={{
          display: "block",
          transform: wheelTransform,
          transformOrigin: "50% 58%",
          transition: "transform 750ms cubic-bezier(.22,.61,.36,1)",
        }}
      >
        <defs>
          <radialGradient id="pvpHaloO" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="rgba(249,115,22,0)" />
            <stop offset="100%" stopColor="rgba(249,115,22,0.18)" />
          </radialGradient>
          <linearGradient id="pvpTileLit" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#9a3412" />
          </linearGradient>
          <linearGradient id="pvpTileSweep" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="pvpTileMine" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>

        <circle cx={cx} cy={cy} r={rOuterOut + 6} fill="url(#pvpHaloO)" />

        {/* outer chunky ring */}
        {Array.from({ length: OUTER_SEG }).map((_, i) => {
          const lit = outerLit.has(i);
          const isSwept = isCooldown && sweep >= 0 && i <= sweep;
          let fill: string = "rgba(255,255,255,0.04)";
          if (isSwept) fill = "url(#pvpTileSweep)";
          else if (lit) fill = "url(#pvpTileLit)";
          return (
            <path
              key={`o-${i}`}
              d={path(i, OUTER_SEG, rOuterIn, rOuterOut, 0.014)}
              fill={fill}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={0.6}
              style={{ transition: "fill 260ms ease" }}
            />
          );
        })}

        {/* thin separator ring */}
        <circle cx={cx} cy={cy} r={rMid} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

        {/* inner numbered ring — these are the bet tiles */}
        {Array.from({ length: tiles }).map((_, i) => {
          const tile = i + 1;
          const mine = myTiles.has(tile);
          const isWinner = winningTile != null && winningTile === tile;
          const { x, y, deg } = innerLabelPos(i);
          let fill: string = "rgba(255,255,255,0.045)";
          let stroke = "rgba(255,255,255,0.08)";
          if (isWinner) { fill = "#22c55e"; stroke = "#16a34a"; }
          else if (mine) { fill = "url(#pvpTileMine)"; stroke = "rgba(96,165,250,.6)"; }
          else if (isCooldown) { fill = "rgba(249,115,22,0.12)"; }
          return (
            <g key={`i-${tile}`} onClick={() => onTileClick(tile)}
              style={{ cursor: isOpen ? "pointer" : "not-allowed" }}>
              <path
                d={path(i, tiles, rInnerIn, rInnerOut, 0.02)}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.8}
                style={{ transition: "fill 240ms ease" }}
              />
              <text
                x={x} y={y}
                transform={`rotate(${deg} ${x} ${y})`}
                textAnchor="middle" dominantBaseline="central"
                fontSize={size * 0.022}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight={700}
                fill={isWinner || mine ? "#fff" : "rgba(255,255,255,.78)"}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {tile}
              </text>
            </g>
          );
        })}

        {/* center disc */}
        <circle cx={cx} cy={cy} r={rHub} fill="#0a0a0a"
          stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={rHub - 6} fill="none"
          stroke="rgba(249,115,22,0.18)" strokeWidth={1} />
      </svg>

      {/* HUD overlay — countdown + stats (fades on cooldown tilt) */}
      <div style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center",
        pointerEvents: "none", textAlign: "center",
        opacity: isCooldown ? 0 : 1,
        transition: "opacity 300ms ease",
      }}>
        <div>
          <div style={{
            fontSize: 11, letterSpacing: ".22em", color: statusColor,
            fontWeight: 800, marginBottom: 6,
          }}>{statusLabel}</div>
          <div className="mono" style={{
            fontSize: Math.round(size * 0.085), fontWeight: 800, color: "#fff",
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
            <div><span style={{ color: "rgba(255,255,255,.5)" }}>MINERS </span>
              <b style={{ color: "#fff" }}>{Math.max(players, outerFilled)}</b></div>
            <div style={{ color: "#f97316" }}>ROUND #{roundId ?? "—"}</div>
          </div>
        </div>
      </div>

      {/* Cooldown overlay — glowing logo + STARTS IN */}
      {isCooldown && (
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          pointerEvents: "none", textAlign: "center",
          animation: "pvpReveal 600ms ease both",
        }}>
          <div>
            <div style={{
              width: 92, height: 92, margin: "0 auto 14px",
              borderRadius: 22,
              background: "linear-gradient(135deg,#a855f7 0%,#06b6d4 100%)",
              boxShadow: "0 0 40px rgba(168,85,247,.55), 0 0 80px rgba(6,182,212,.4)",
              display: "grid", placeItems: "center",
              fontFamily: "'Space Grotesk',system-ui,sans-serif",
              fontWeight: 900, color: "#fff", fontSize: 52, lineHeight: 1,
              transform: "rotate(-10deg)",
            }}>≡</div>
            <div style={{
              fontSize: 11, letterSpacing: ".24em", color: "#fbbf24",
              fontWeight: 800,
            }}>NEXT ROUND IN</div>
            <div className="mono" style={{
              fontSize: 38, fontWeight: 800, color: "#fff", marginTop: 4,
              textShadow: "0 0 22px rgba(168,85,247,.45)",
            }}>{fmt(cooldownMs)}</div>
            {winningTile != null && (
              <div style={{ marginTop: 12, fontSize: 12,
                color: "rgba(255,255,255,.7)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}>
                WINNER · <span style={{ color: "#22c55e", fontWeight: 800 }}>TILE {winningTile}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pvpReveal {
          0% { opacity: 0; transform: scale(.7); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}