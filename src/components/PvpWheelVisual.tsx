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
type WheelPhase = "idle" | "sequence" | "blink-all" | "blink-even" | "blink-odd" | "sweep" | "winner" | "new-round";

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
  animationRoundId,
  myTiles,
  tilesWithBets,
  myPayout,
  onTileClick,
  soundOn = true,
  onAnimationComplete,
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
  animationRoundId?: number | null;
  myTiles: Set<number>;
  tilesWithBets?: Set<number>;
  myPayout?: number | null;
  onTileClick: (tile: number) => void;
  soundOn?: boolean;
  onAnimationComplete?: () => void;
}) {
  // ---- animation state ----
  const [highlighted, setHighlighted] = React.useState<number | null>(null);
  const [blinkSet, setBlinkSet] = React.useState<Set<number> | null>(null);
  const [winnerTile, setWinnerTile] = React.useState<number | null>(null);
  const [dimOthers, setDimOthers] = React.useState(false);
  const [shake, setShake] = React.useState(false);
  const [flash, setFlash] = React.useState(false);
  const [center, setCenter] = React.useState<CenterContent>({ line1: "ROUND OPEN", timer: true });
  const [animating, setAnimating] = React.useState(false);
  const [phase, setPhase] = React.useState<WheelPhase>("idle");
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const tooltipTimerRef = React.useRef<number | null>(null);
  const animRanForRoundRef = React.useRef<number | null>(null);
  const lastTickSecRef = React.useRef<number>(-1);
  const winningTileRef = React.useRef<number | null>(null);
  const animationRunningRef = React.useRef<boolean>(false);

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

  // ---- trigger animation as soon as parent finds resolved winner ----
  React.useEffect(() => {
    const animationKey = animationRoundId ?? (isCooldown ? roundId : null);
    if (winningTile == null || animationKey == null) return;
    if (animRanForRoundRef.current === animationKey) return;

    // Validate winning tile before doing anything
    const wt = Number(winningTile);
    if (!Number.isFinite(wt) || wt < 1 || wt > 30) {
      console.error("[Animation] Invalid winning tile, aborting:", winningTile);
      return;
    }

    animRanForRoundRef.current = animationKey;
    winningTileRef.current = wt;
    animationRunningRef.current = true;
    let cancelled = false;

    const run = async () => {
      const winningTile = wt; // local stable copy used throughout
      console.log("[Animation] Starting for round", animationKey, "winning tile:", winningTile);
      setAnimating(true);
      setPhase("sequence");
      setWinnerTile(null);
      setDimOthers(false);
      setShake(false);
      setBlinkSet(null);
      setCenter({ line1: `ROUND #${animationKey}`, line2: "RESOLVING", line3: "SCANNING TILES" });

      // PHASE A — click each tile one by one 1..30
      for (let i = 1; i <= TILE_COUNT; i++) {
        if (cancelled) return;
        setHighlighted(i);
        play(() => sounds.tick(280 + i * 12));
        await sleep(22);
      }
      setHighlighted(null);
      await sleep(50);

      // PHASE B — all tiles blink together
      if (cancelled) return;
      setPhase("blink-all");
      const all = new Set<number>(Array.from({ length: TILE_COUNT }, (_, i) => i + 1));
      for (let b = 0; b < 2; b++) {
        if (cancelled) return;
        setBlinkSet(all);
        play(() => sounds.tick(520));
        await sleep(80);
        setBlinkSet(null);
        await sleep(45);
      }

      // PHASE C — even tiles blink
      if (cancelled) return;
      setPhase("blink-even");
      const evens = new Set<number>(Array.from({ length: TILE_COUNT }, (_, i) => i + 1).filter((n) => n % 2 === 0));
      for (let b = 0; b < 2; b++) {
        if (cancelled) return;
        setBlinkSet(evens);
        play(() => sounds.tick(620));
        await sleep(70);
        setBlinkSet(null);
        await sleep(40);
      }

      // PHASE D — odd tiles blink
      if (cancelled) return;
      setPhase("blink-odd");
      const odds = new Set<number>(Array.from({ length: TILE_COUNT }, (_, i) => i + 1).filter((n) => n % 2 === 1));
      for (let b = 0; b < 2; b++) {
        if (cancelled) return;
        setBlinkSet(odds);
        play(() => sounds.tick(720));
        await sleep(70);
        setBlinkSet(null);
        await sleep(40);
      }

      // PHASE E — fast sweep + slowdown landing exactly on winningTile
      if (cancelled) return;
      setPhase("sweep");
      setCenter({ line1: `ROUND #${animationKey}`, line2: "DRAND", line3: "PICKING WINNER" });

      let cur = 1;
      setHighlighted(cur);

      // Fast spin: short full lap so the already-known drand winner is picked quickly
      const fastTicks = TILE_COUNT;
      for (let i = 0; i < fastTicks; i++) {
        if (cancelled) return;
        cur = (cur % TILE_COUNT) + 1;
        setHighlighted(cur);
        if (i % 2 === 0) play(() => sounds.tick(560));
        await sleep(16);
      }

      // Final sweep — exact number of ticks, no waiting loop, always lands on winningTile
      const distanceToWinner = (winningTile - cur + TILE_COUNT) % TILE_COUNT;
      const finalTicks = TILE_COUNT + (distanceToWinner === 0 ? TILE_COUNT : distanceToWinner);
      const slowWindow = Math.min(12, finalTicks);
      for (let step = 1; step <= finalTicks; step++) {
        if (cancelled) return;
        cur = (cur % TILE_COUNT) + 1;
        setHighlighted(cur);
        const slowProgress = Math.max(0, step - (finalTicks - slowWindow)) / slowWindow;
        const delay = Math.round(18 + 150 * slowProgress * slowProgress);
        play(() => sounds.tick(Math.max(240, 640 - step * 9)));
        await sleep(delay);
      }

      // Hard-guarantee final position
      cur = winningTile;
      setHighlighted(winningTile);
      console.log("[Animation] Stopped on tile:", cur, "| Target was:", winningTile);
      await sleep(180);

      // PHASE F — land on winner
      if (cancelled) return;
      setPhase("winner");
      setWinnerTile(winningTile);
      setHighlighted(null);
      setDimOthers(true);
      setShake(true);
      play(() => sounds.winner());
      const youWon = myTiles.has(winningTile);
      setCenter({
        line1: `🏆 TILE ${winningTile} WINS`,
        line2: `Pool: ${pot.toFixed(3)} zkLTC`,
        line3: youWon ? `YOU WON! +${(myPayout ?? pot).toFixed(3)} zkLTC` : "",
      });
      setTimeout(() => setShake(false), 600);
      await sleep(1100);


      // PHASE G — new round loader
      setPhase("new-round");
      setDimOthers(false);
      setWinnerTile(null);
      for (let c = 5; c >= 1; c--) {
        if (cancelled) return;
        setCenter({ line1: "NEW ROUND IN", line2: String(c), countdown: true });
        play(() => sounds.tick(400 + (6 - c) * 40));
        await sleep(360);
      }

      // PHASE H — reset + flash
      if (cancelled) return;
      setFlash(true);
      await sleep(260);
      setFlash(false);
      setHighlighted(null);
      setWinnerTile(null);
      setDimOthers(false);
      setBlinkSet(null);
      setPhase("idle");
      setCenter({ line1: "ROUND OPEN", timer: true });
      setAnimating(false);
      animationRunningRef.current = false;
      onAnimationComplete?.();
    };

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationRoundId, winningTile]);

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
    const blink = blinkSet?.has(tileLabel) ?? false;
    const dim = dimOthers && !isWin;
    const phaseGlow = phase === "sweep" || phase === "new-round";

    if (isWin) {
      return {
        fill: "rgba(34,197,94,0.55)",
        stroke: "rgba(52,211,153,1)",
        strokeWidth: 3,
        glow: "drop-shadow(0 0 30px rgba(52,211,153,0.95))",
        opacity: 1,
        transform: "scale(1.09)",
      };
    }
    if (dim) {
      return { fill: "rgba(15,23,42,0.5)", stroke: "rgba(148,163,184,0.15)", strokeWidth: 1, glow: "", opacity: 0.25, transform: "none" };
    }
    if (blink) {
      return { fill: "rgba(249,115,22,0.45)", stroke: "rgba(249,115,22,1)", strokeWidth: 2, glow: "drop-shadow(0 0 16px rgba(249,115,22,0.7))", opacity: 1, transform: "none" };
    }
    if (isHi) {
      return {
        fill: phase === "sweep" ? "rgba(168,85,247,0.42)" : "rgba(249,115,22,0.4)",
        stroke: phase === "sweep" ? "rgba(217,70,239,1)" : "rgba(249,115,22,1)",
        strokeWidth: 2.4,
        glow: phase === "sweep" ? "drop-shadow(0 0 22px rgba(168,85,247,0.85))" : "drop-shadow(0 0 20px rgba(249,115,22,0.7))",
        opacity: 1,
        transform: "none"
      };
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
    return { fill: phaseGlow ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.02)", stroke: phaseGlow ? "rgba(245,158,11,0.55)" : "rgba(255,255,255,0.16)", strokeWidth: 1.1, glow: "", opacity: 0.7, transform: "none" };
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
                  transition: "filter 180ms ease, transform 400ms cubic-bezier(.2,.9,.2,1), opacity 240ms ease",
                  transform: s.transform,
                  transformOrigin: "290px 290px",
                  opacity: s.opacity,
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
                  style={{ transition: "fill 140ms ease, stroke 140ms ease, opacity 140ms ease" }}
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
            opacity: 1,
            transform: phase === "winner" ? "scale(1.04)" : "scale(1)",
            transition: "opacity 240ms ease, transform 240ms ease",
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
        .pvp-sol-loader {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          z-index: 24;
          pointer-events: none;
          animation: pvpLogoIn 900ms ease both;
        }
        .pvp-sol-loader span {
          width: 72px;
          height: 16px;
          border-radius: 3px;
          transform: skewX(-22deg);
          background: linear-gradient(90deg, #7c3aed, #22d3ee, #34d399);
          box-shadow: 0 0 26px rgba(168,85,247,.75);
        }
        .pvp-sol-loader span:nth-child(2) { background: linear-gradient(90deg, #22d3ee, #34d399); transform: skewX(-22deg) translateX(-8px); }
        .pvp-sol-loader span:nth-child(3) { background: linear-gradient(90deg, #a855f7, #7c3aed); transform: skewX(-22deg) translateX(8px); }
        @keyframes pvpLogoIn { from { opacity: 0; transform: scale(.86); } 35% { opacity: 1; } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
