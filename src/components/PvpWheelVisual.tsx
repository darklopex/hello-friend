import React from "react";
import { TILE_ANGLES } from "../lib/wheelMath";
import {
  setSoundEnabled,
  playTick,
  playClick,
  playSuccessChime,
  playRoundStarted,
  playHeartbeat,
} from "../lib/wheelAudio";

/**
 * PvpWheelVisual — port of the reference MiningWheel from /server/src/components/MiningWheel.tsx.
 * Uses the same TILE_ANGLES geometry, color palette, spin-glow sweep, and audio cues.
 * Backend props are unchanged so PvpPage.tsx wiring keeps working.
 */

type Phase =
  | "idle"        // ACTIVE — accepting bets
  | "closing"     // LOCKED — about to resolve
  | "spin"        // SPIN_GLOW — sequential tile sweep
  | "winner"      // WINNER_REVEALED — green flash on winner
  | "showing";    // SHOWING_WINNERS — cooldown / persistent winner display

const TILE_COUNT = 30;
const SPIN_STEP_MS = 40;            // 40ms * 30 = 1200ms full spin
const WINNER_HOLD_MS = 1100;

export default function PvpWheelVisual({
  size = 560,
  roundId,
  timeLeftMs,
  isOpen,
  isLocked,
  isCooldown,
  cooldownMs,
  pot,
  winningTile,           // 1-based from API
  myTiles,               // 1-based set
  tilesWithBets,         // 1-based set
  myPayout,
  onTileClick,           // receives 1-based tile
  soundOn = true,
}: {
  size?: number;
  tiles?: number;
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
  // honor soundOn toggle through the audio module's global flag
  React.useEffect(() => { setSoundEnabled(soundOn); }, [soundOn]);

  const [hovered, setHovered] = React.useState<number | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [spotlight, setSpotlight] = React.useState<number | null>(null);
  const lastWinnerRef = React.useRef<number | null>(null);
  const lastRoundRef = React.useRef<number | null>(null);
  const lastTickSec = React.useRef<number>(-1);

  // derive simple top-level phase from props (idle vs closing); animation overrides
  React.useEffect(() => {
    if (isOpen) {
      if (phase !== "spin" && phase !== "winner" && phase !== "showing") setPhase("idle");
    } else if (isLocked && phase === "idle") {
      setPhase("closing");
    }
    // when winner finishes and we are in cooldown, stay in "showing"
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isLocked]);

  // detect new winning tile (and ensure round is no longer open) → run spin sequence
  React.useEffect(() => {
    if (winningTile == null || isOpen) return;
    if (lastWinnerRef.current === winningTile && phase !== "idle") return;
    lastWinnerRef.current = winningTile;

    const winIdx0 = (winningTile - 1 + TILE_COUNT) % TILE_COUNT;
    setPhase("spin");

    // build path: (winIdx+1, winIdx+2, ..., winIdx) wrapping — ends ON the winner
    const order: number[] = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      order.push((winIdx0 + 1 + i) % TILE_COUNT);
    }

    let i = 0;
    const timers: number[] = [];
    const interval = window.setInterval(() => {
      const next = order[i];
      setSpotlight(next);
      if (soundOn) playTick(i, order.length);
      i++;
      if (i >= order.length) {
        window.clearInterval(interval);
        setPhase("winner");
        setSpotlight(winIdx0);
        if (soundOn) playSuccessChime();
        timers.push(
          window.setTimeout(() => {
            setPhase("showing");
          }, WINNER_HOLD_MS),
        );
      }
    }, SPIN_STEP_MS);

    return () => {
      window.clearInterval(interval);
      timers.forEach((t) => window.clearTimeout(t));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winningTile, isOpen, soundOn]);

  // new round → reset + whoosh
  React.useEffect(() => {
    if (roundId == null) return;
    if (lastRoundRef.current === null) { lastRoundRef.current = roundId; return; }
    if (roundId !== lastRoundRef.current) {
      lastRoundRef.current = roundId;
      lastWinnerRef.current = null;
      setSpotlight(null);
      setPhase(isOpen ? "idle" : "closing");
      if (soundOn) playRoundStarted();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // heartbeat for last 4 seconds of open
  const secsLeft = Math.max(0, Math.ceil(timeLeftMs / 1000));
  React.useEffect(() => {
    if (!soundOn || !isOpen) return;
    if (secsLeft === lastTickSec.current) return;
    lastTickSec.current = secsLeft;
    if (secsLeft > 0 && secsLeft <= 4) playHeartbeat();
  }, [secsLeft, soundOn, isOpen]);

  // ----- styling helpers (mirror MiningWheel.getTileStyles) -----
  type TileStyle = {
    fill: string;
    stroke: string;
    strokeWidth: number;
    glow: string;
    opacity: number;
  };
  const getTileStyles = (tileId0: number): TileStyle => {
    const tileLabel = tileId0 + 1;
    const isPlayerSelected = myTiles.has(tileLabel);
    const isSpotlight = spotlight === tileId0;
    const winIdx0 = winningTile != null ? winningTile - 1 : -1;
    const isWinner = (phase === "winner" || phase === "showing") && tileId0 === winIdx0;

    if (isWinner) {
      return {
        fill: "rgba(16, 185, 129, 0.24)",
        stroke: "rgba(16, 185, 129, 0.98)",
        strokeWidth: 2.8,
        glow: "drop-shadow(0 0 25px rgba(16,185,129,0.5))",
        opacity: 1,
      };
    }
    if (isSpotlight && phase === "spin") {
      return {
        fill: "rgba(245, 158, 11, 0.28)",
        stroke: "rgba(245, 158, 11, 0.98)",
        strokeWidth: 2.5,
        glow: "drop-shadow(0 0 22px rgba(245,158,11,0.45))",
        opacity: 1,
      };
    }
    if (isPlayerSelected) {
      return {
        fill: "rgba(244, 63, 94, 0.18)",
        stroke: "rgba(244, 63, 94, 0.88)",
        strokeWidth: 1.8,
        glow: "drop-shadow(0 0 15px rgba(244,63,94,0.3))",
        opacity: 1,
      };
    }
    if (tilesWithBets?.has(tileLabel) && phase === "idle") {
      return {
        fill: "rgba(168, 85, 247, 0.10)",
        stroke: "rgba(168, 85, 247, 0.45)",
        strokeWidth: 1.2,
        glow: "",
        opacity: 0.9,
      };
    }
    if (hovered === tileId0 && phase === "idle" && isOpen) {
      return {
        fill: "rgba(255,255,255,0.08)",
        stroke: "rgba(255,255,255,0.45)",
        strokeWidth: 1.5,
        glow: "drop-shadow(0 0 12px rgba(255,255,255,0.15))",
        opacity: 1,
      };
    }
    if (phase === "closing") {
      return {
        fill: "rgba(15,23,42,0.15)",
        stroke: "rgba(148,163,184,0.08)",
        strokeWidth: 1.0,
        glow: "",
        opacity: 0.3,
      };
    }
    return {
      fill: "rgba(255,255,255,0.02)",
      stroke: "rgba(255,255,255,0.16)",
      strokeWidth: 1.1,
      glow: "",
      opacity: 0.65,
    };
  };

  // ----- center HUD text -----
  const fmtClock = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `00:${String(s % 60).padStart(2, "0")}`;
  };
  const winIdx0 = winningTile != null ? winningTile - 1 : -1;
  const youWon = winningTile != null && myTiles.has(winningTile);

  const center = (() => {
    if (phase === "spin") {
      return {
        header: "SOLVER SPINNING",
        title: spotlight !== null ? `TILE #${spotlight + 1}` : "ROLLING",
        sub: "SELECTING WINNING COORDINATE",
        color: "#facc15",
        pulse: true,
      };
    }
    if (phase === "winner" || phase === "showing") {
      return {
        header: "WINNER DETERMINED",
        title: `TILE #${winIdx0 + 1}`,
        sub: youWon ? "🎉 YOU WON THIS ROUND!" : "ROUND COMPLETE",
        color: "#34d399",
        pulse: phase === "winner",
      };
    }
    if (phase === "closing" || isLocked) {
      return {
        header: "CLOSING ROUND",
        title: "VERIFYING",
        sub: "COMPILING DRAND SEED",
        color: "#fbbf24",
        pulse: true,
      };
    }
    // idle / open
    return {
      header: isOpen ? "ROUND OPEN" : "WAITING",
      title: fmtClock(timeLeftMs),
      sub: isOpen ? "PLACE YOUR BETS" : "NEXT ROUND INCOMING",
      color: isOpen ? "#fb923c" : "#a1a1aa",
      pulse: false,
    };
  })();

  const cdSecs = Math.max(0, Math.ceil(cooldownMs / 1000));

  return (
    <div className="flex flex-col items-center" style={{ width: size, maxWidth: "100%" }}>
      <div
        className="relative w-full aspect-square flex items-center justify-center p-4 rounded-full overflow-visible"
        style={{
          border: "1px dashed rgba(63,63,70,0.7)",
          background: "rgba(9,9,11,0.4)",
          boxShadow:
            "0 25px 50px -12px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.02)",
        }}
      >
        {/* radial backdrops */}
        <div
          style={{
            position: "absolute",
            inset: "6%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(249,115,22,0.03), rgba(15,23,42,0) 64%, transparent 75%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "15%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(168,85,247,0.04), rgba(15,23,42,0) 56%, transparent 72%)",
            pointerEvents: "none",
          }}
        />
        {phase === "idle" && isOpen && (
          <div
            style={{
              position: "absolute",
              inset: "4%",
              borderRadius: "50%",
              border: "1px solid rgba(249,115,22,0.10)",
              pointerEvents: "none",
              animation: "pvpHaloSpin 18s linear infinite",
            }}
          />
        )}

        <svg
          viewBox="0 0 580 580"
          style={{ position: "relative", zIndex: 10, width: "100%", height: "100%", overflow: "visible", userSelect: "none", filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.5))" }}
          aria-label="PVP Wheel"
        >
          <g>
            {TILE_ANGLES.map((tile) => {
              const s = getTileStyles(tile.id);
              const tileLabel = tile.id + 1;
              const isMine = myTiles.has(tileLabel);
              const interactive = phase === "idle" && isOpen;
              return (
                <g
                  key={tile.id}
                  style={{ cursor: interactive ? "pointer" : "default", filter: s.glow, transition: "filter 200ms ease" }}
                  onPointerEnter={() => { if (interactive) setHovered(tile.id); }}
                  onPointerLeave={() => { if (interactive) setHovered(null); }}
                  onClick={() => {
                    if (!interactive) return;
                    playClick();
                    onTileClick(tileLabel);
                  }}
                >
                  <path
                    d={tile.path}
                    fill={s.fill}
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                    opacity={s.opacity}
                    style={{ transition: "fill 180ms ease, stroke 180ms ease, stroke-width 180ms ease, opacity 180ms ease" }}
                  />
                  <g pointerEvents="none">
                    {(isMine || s.strokeWidth > 2) && (
                      <circle
                        cx={tile.labelX}
                        cy={tile.labelY}
                        r={isMine ? 3.5 : 2.5}
                        fill={isMine ? "#f43f5e" : "#f59e0b"}
                      >
                        <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <text
                      x={tile.labelX}
                      y={tile.labelY + (isMine || s.strokeWidth > 2 ? 14 : 4)}
                      textAnchor="middle"
                      fill="#a1a1aa"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.62rem" }}
                    >
                      {tileLabel}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>

        {/* CENTER OVERLAY */}
        <div
          style={{
            position: "absolute",
            inset: "33%",
            borderRadius: "50%",
            background: "rgba(9,9,11,0.9)",
            border: "1px solid rgba(63,63,70,0.8)",
            boxShadow: "inset 0 4px 30px rgba(0,0,0,0.8), 0 20px 50px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 16,
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontSize: "0.58rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#71717a",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {center.header}
          </span>
          <div style={{ margin: "6px 0", height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                letterSpacing: "0.04em",
                color: center.color,
                animation: center.pulse ? "pvpPulse 1.2s ease-in-out infinite" : undefined,
              }}
            >
              {center.title}
            </span>
          </div>
          <p
            style={{
              fontSize: "0.58rem",
              lineHeight: 1.4,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#a1a1aa",
              maxWidth: "12rem",
              margin: 0,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {center.sub}
          </p>

          {/* live stats / round meta */}
          {phase === "idle" && (
            <div
              style={{
                position: "absolute",
                bottom: 16,
                display: "flex",
                gap: 10,
                fontSize: "0.6rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#a1a1aa",
              }}
            >
              <span style={{ color: "#fb923c" }}>#{roundId ?? "—"}</span>
              <span>•</span>
              <span>POOL {pot.toFixed(3)}</span>
              <span>•</span>
              <span>MINE {myTiles.size}/30</span>
            </div>
          )}
          {(phase === "winner" || phase === "showing") && (
            <div
              style={{
                position: "absolute",
                bottom: 14,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                fontSize: "0.6rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              <span style={{ color: youWon ? "#34d399" : "#71717a", fontWeight: 700 }}>
                {youWon
                  ? `+${(myPayout ?? pot).toFixed(3)} zkLTC`
                  : `POOL ${pot.toFixed(3)}`}
              </span>
              {isCooldown && cdSecs > 0 && (
                <span style={{ color: "#a1a1aa" }}>NEXT IN {cdSecs}s</span>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pvpHaloSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pvpPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
      `}</style>
    </div>
  );
}