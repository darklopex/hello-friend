import React from "react";
import { TILE_ANGLES } from "../lib/wheelMath";
import { sounds } from "../lib/pvpSounds";

const TILE_COUNT = 30;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type CenterContent = {
  line1: string;
  line2?: string;
  line3?: string;
  countdown?: boolean;
  timer?: boolean;
};

export default function PvpWheelVisual({
  size = 560,
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
  // ---- animation state ----
  const [highlighted, setHighlighted] = React.useState<number | null>(null);
  const [allBlink, setAllBlink] = React.useState(false);
  const [winnerTile, setWinnerTile] = React.useState<number | null>(null);
  const [dimOthers, setDimOthers] = React.useState(false);
  const [shake, setShake] = React.useState(false);
  const [flash, setFlash] = React.useState(false);
  const [center, setCenter] = React.useState<CenterContent>({ line1: "ROUND OPEN", timer: true });
  const [animating, setAnimating] = React.useState(false);
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const tooltipTimerRef = React.useRef<number | null>(null);
  const animRanForRoundRef = React.useRef<number | null>(null);
  const lastTickSecRef = React.useRef<number>(-1);

  const play = React.useCallback((fn: () => void) => { if (soundOn) fn(); }, [soundOn]);

  // ---- countdown tick during open ----
  const secsLeft = Math.max(0, Math.ceil(timeLeftMs / 1000));
  React.useEffect(() => {
    if (!isOpen || animating) return;
    if (secsLeft === lastTickSecRef.current) return;
    lastTickSecRef.current = secsLeft;
    if (secsLeft > 0 && secsLeft <= 10) play(() => sounds.tick(440));
  }, [secsLeft, isOpen, animating, play]);

  // ---- update center based on status when not animating ----
  React.useEffect(() => {
    if (animating) return;
    if (isOpen) setCenter({ line1: "ROUND OPEN", timer: true });
    else if (isLocked) setCenter({ line1: "VERIFYING", timer: true });
    else if (isCooldown) setCenter({ line1: "RESOLVING", timer: true });
  }, [isOpen, isLocked, isCooldown, animating]);

  // ---- trigger animation when cooldown starts and we know the winning tile ----
  React.useEffect(() => {
    if (!isCooldown || winningTile == null || roundId == null) return;
    if (animRanForRoundRef.current === roundId) return;
    animRanForRoundRef.current = roundId;
    let cancelled = false;

    const run = async () => {
      setAnimating(true);
      setWinnerTile(null);
      setDimOthers(false);
      setShake(false);

      // PHASE A — sequential highlight 1..30 (1.5s)
      for (let i = 1; i <= 30; i++) {
        if (cancelled) return;
        setHighlighted(i);
        play(() => sounds.tick(200 + i * 15));
        await sleep(50);
      }
      await sleep(200);

      // PHASE B — blink x3 (0.9s)
      for (let b = 0; b < 3; b++) {
        if (cancelled) return;
        setAllBlink(true); await sleep(150);
        setAllBlink(false); await sleep(150);
      }

      // PHASE C — fast rotation 3 loops (1.5s)
      let current = 1;
      for (let t = 0; t < 90; t++) {
        if (cancelled) return;
        setHighlighted(current);
        if (t % 2 === 0) play(() => sounds.tick(600));
        await sleep(17);
        current = (current % 30) + 1;
      }

      // PHASE D — slowdown to winning tile
      const speeds = [17, 17, 25, 35, 50, 70, 100, 150, 200, 280, 350, 420];
      let speedIdx = 0;
      // step until we reach winningTile after at least one full extra loop has begun
      let safety = 0;
      while (safety++ < 200) {
        if (cancelled) return;
        setHighlighted(current);
        const sp = speeds[Math.min(speedIdx, speeds.length - 1)];
        play(() => sounds.tick(Math.max(200, 600 - speedIdx * 35)));
        await sleep(sp);
        if (current === winningTile && speedIdx >= speeds.length - 1) break;
        current = (current % 30) + 1;
        speedIdx++;
      }

      // PHASE E — land on winner
      if (cancelled) return;
      setWinnerTile(winningTile);
      setHighlighted(null);
      setDimOthers(true);
      setShake(true);
      play(() => sounds.winner());
      const youWon = myTiles.has(winningTile);
      setCenter({
        line1: `🏆 TILE ${winningTile} WINS!`,
        line2: `Pool: ${pot.toFixed(3)} zkLTC`,
        line3: youWon ? `YOU WON! +${(myPayout ?? pot).toFixed(3)} zkLTC` : "",
      });
      setTimeout(() => setShake(false), 600);
      await sleep(3000);

      // PHASE F — countdown 5..1
      for (let c = 5; c >= 1; c--) {
        if (cancelled) return;
        setCenter({ line1: "NEW ROUND IN", line2: String(c), countdown: true });
        play(() => sounds.tick(400 + (6 - c) * 40));
        await sleep(1000);
      }

      // PHASE G — reset + flash
      if (cancelled) return;
      setFlash(true);
      await sleep(300);
      setFlash(false);
      setHighlighted(null);
      setWinnerTile(null);
      setDimOthers(false);
      setCenter({ line1: "ROUND OPEN", timer: true });
      setAnimating(false);
    };

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCooldown, winningTile, roundId]);

  // ---- tooltip hover delay ----
  const onTileEnter = (tile: number) => {
    if (!isOpen || animating) return;
    setHovered(tile);
    play(() => sounds.hover());
    if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = window.setTimeout(() => setTooltipVisible(true), 100);
  };
  const onTileLeave = () => {
    setHovered(null);
    setTooltipVisible(false);
    if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
  };

  // ---- tile styling ----
  const getTileStyles = (tileId0: number) => {
    const tileLabel = tileId0 + 1;
    const isMine = myTiles.has(tileLabel);
    const isHi = highlighted === tileLabel;
    const isWin = winnerTile === tileLabel;
    const blink = allBlink;
    const dim = dimOthers && !isWin;

    if (isWin) {
      return {
        fill: "rgba(251,191,36,0.55)",
        stroke: "rgba(251,191,36,1)",
        strokeWidth: 3,
        glow: "drop-shadow(0 0 30px rgba(251,191,36,0.95))",
        opacity: 1,
        transform: "scale(1.08)",
      };
    }
    if (dim) {
      return { fill: "rgba(15,23,42,0.5)", stroke: "rgba(148,163,184,0.15)", strokeWidth: 1, glow: "", opacity: 0.25, transform: "none" };
    }
    if (blink) {
      return { fill: "rgba(249,115,22,0.45)", stroke: "rgba(249,115,22,1)", strokeWidth: 2, glow: "drop-shadow(0 0 16px rgba(249,115,22,0.7))", opacity: 1, transform: "none" };
    }
    if (isHi) {
      return { fill: "rgba(249,115,22,0.4)", stroke: "rgba(249,115,22,1)", strokeWidth: 2.4, glow: "drop-shadow(0 0 20px rgba(249,115,22,0.7))", opacity: 1, transform: "none" };
    }
    if (isMine) {
      return { fill: "rgba(34,197,94,0.18)", stroke: "rgba(34,197,94,0.9)", strokeWidth: 2, glow: "drop-shadow(0 0 12px rgba(34,197,94,0.4))", opacity: 1, transform: "none" };
    }
    if (tilesWithBets?.has(tileLabel)) {
      return { fill: "rgba(168,85,247,0.1)", stroke: "rgba(168,85,247,0.5)", strokeWidth: 1.2, glow: "", opacity: 0.95, transform: "none" };
    }
    if (hovered === tileLabel && isOpen && !animating) {
      return { fill: "rgba(255,255,255,0.08)", stroke: "rgba(255,255,255,0.5)", strokeWidth: 1.6, glow: "drop-shadow(0 0 10px rgba(255,255,255,0.2))", opacity: 1, transform: "none" };
    }
    return { fill: "rgba(255,255,255,0.02)", stroke: "rgba(255,255,255,0.16)", strokeWidth: 1.1, glow: "", opacity: 0.7, transform: "none" };
  };

  const fmtClock = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s/60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const cdSecs = Math.max(0, Math.ceil(cooldownMs / 1000));

  // tooltip data
  const tooltipTile = hovered;
  const tooltipPos = (() => {
    if (tooltipTile == null) return null;
    const t = TILE_ANGLES[tooltipTile - 1];
    if (!t) return null;
    // labelX/Y are in 580-viewbox space, convert to %
    return { x: (t.labelX / 580) * 100, y: (t.labelY / 580) * 100 };
  })();

  return (
    <div className="flex flex-col items-center" style={{ width: size, maxWidth: "100%" }}>
      <div
        className="relative w-full aspect-square flex items-center justify-center p-4 rounded-full overflow-visible"
        style={{
          border: "1px dashed rgba(63,63,70,0.7)",
          background: "rgba(9,9,11,0.4)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.02)",
          animation: shake ? "pvpShake 0.5s ease-in-out" : undefined,
        }}
      >
        {flash && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(255,255,255,0.85)", zIndex: 30, pointerEvents: "none",
            animation: "pvpFlash 300ms ease-out",
          }} />
        )}

        <svg
          viewBox="0 0 580 580"
          style={{ position: "relative", zIndex: 10, width: "100%", height: "100%", overflow: "visible", userSelect: "none", filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.5))" }}
        >
          {TILE_ANGLES.map((tile) => {
            const s = getTileStyles(tile.id);
            const tileLabel = tile.id + 1;
            const isMine = myTiles.has(tileLabel);
            const interactive = isOpen && !animating;
            return (
              <g
                key={tile.id}
                style={{
                  cursor: interactive ? "pointer" : "default",
                  filter: s.glow,
                  transition: "filter 180ms ease, transform 220ms ease",
                  transform: s.transform,
                  transformOrigin: `${tile.labelX}px ${tile.labelY}px`,
                }}
                onPointerEnter={() => onTileEnter(tileLabel)}
                onPointerLeave={onTileLeave}
                onClick={() => {
                  if (!interactive) return;
                  play(() => sounds.click());
                  onTileClick(tileLabel);
                }}
              >
                <path
                  d={tile.path}
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  opacity={s.opacity}
                  style={{ transition: "fill 160ms ease, stroke 160ms ease, opacity 160ms ease" }}
                />
                {isMine && (
                  <circle cx={tile.labelX} cy={tile.labelY - 8} r={3} fill="#22c55e">
                    <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <text
                  x={tile.labelX}
                  y={tile.labelY + 4}
                  textAnchor="middle"
                  fill={winnerTile === tileLabel ? "#fff" : "#a1a1aa"}
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.65rem", fontWeight: winnerTile === tileLabel ? 900 : 400 }}
                >
                  {tileLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {/* HOVER TOOLTIP */}
        {tooltipVisible && tooltipTile != null && tooltipPos && (
          <div
            style={{
              position: "absolute",
              left: `${tooltipPos.x}%`,
              top: `${tooltipPos.y}%`,
              transform: "translate(-50%, calc(-100% - 12px))",
              background: "rgba(9,9,11,0.92)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 10,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "#fff",
              pointerEvents: "none",
              zIndex: 25,
              whiteSpace: "nowrap",
              backdropFilter: "blur(4px)",
            }}
          >
            <div style={{ fontWeight: 700 }}>Tile {tooltipTile}</div>
            {myTiles.has(tooltipTile) && <div style={{ color: "#22c55e" }}>✓ Your bet</div>}
            {tilesWithBets?.has(tooltipTile) && !myTiles.has(tooltipTile) && <div style={{ color: "#a78bfa" }}>Has bets</div>}
          </div>
        )}

        {/* CENTER OVERLAY */}
        <div
          style={{
            position: "absolute",
            inset: "33%",
            borderRadius: "50%",
            background: "rgba(9,9,11,0.92)",
            border: "1px solid rgba(63,63,70,0.8)",
            boxShadow: "inset 0 4px 30px rgba(0,0,0,0.8), 0 20px 50px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 14,
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          <span style={{
            fontSize: "0.58rem", fontWeight: 800, textTransform: "uppercase",
            letterSpacing: "0.2em", color: "#71717a",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            animation: isLocked ? "pvpPulse 1.4s ease-in-out infinite" : undefined,
          }}>
            {center.line1}
          </span>

          <div style={{ margin: "6px 0", minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {center.timer ? (
              <span style={{
                fontSize: 30, fontWeight: 900,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: isOpen ? "#fb923c" : isLocked ? "#fbbf24" : "#a1a1aa",
              }}>{isLocked ? "00:00" : fmtClock(timeLeftMs)}</span>
            ) : (
              <span style={{
                fontSize: center.countdown ? 44 : 22,
                fontWeight: 900,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: center.countdown ? "#fbbf24" : "#34d399",
                animation: center.countdown ? "pvpPulse 1s ease-in-out infinite" : undefined,
              }}>{center.line2}</span>
            )}
          </div>

          {center.line3 && (
            <div style={{
              fontSize: 11, fontWeight: 800, color: "#34d399",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              marginTop: 2,
            }}>{center.line3}</div>
          )}

          {!center.line3 && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 2, fontSize: 10,
              color: "#a1a1aa",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              marginTop: 4,
            }}>
              <span>POOL <b style={{ color: "#fff" }}>{pot.toFixed(3)}</b> zkLTC</span>
              <span>ROUND <b style={{ color: "#fb923c" }}>#{roundId ?? "—"}</b></span>
              {isCooldown && cdSecs > 0 && !animating && (
                <span>NEXT IN {cdSecs}s</span>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pvpPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes pvpShake {
          0%, 100% { transform: translate(0,0); }
          20% { transform: translate(-6px, 2px); }
          40% { transform: translate(6px, -2px); }
          60% { transform: translate(-4px, 3px); }
          80% { transform: translate(4px, -3px); }
        }
        @keyframes pvpFlash { 0% { opacity: 0.9; } 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}
