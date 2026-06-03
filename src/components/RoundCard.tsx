import React from "react";
import { motion } from "framer-motion";
import { Shield, Flame, Zap, ChevronLeft, ArrowUpRight, Blocks } from "lucide-react";
import { api, type RoundView } from "../lib/api";
import { MODES, HEX, signals, type ModeMeta } from "../lib/modes";
import * as W from "../lib/wallet";
import LeverSwitch from "./LeverSwitch";

const BET = 0.01;

function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
function useNow() {
  const [, f] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { const id = setInterval(f, 1000); return () => clearInterval(id); }, []);
  return Date.now();
}

export default function RoundCard({
  round, slot, addr, head, onNeedConnect, onOpenPF, onBet,
}: {
  round: RoundView; slot: "closing" | "open"; addr: string | null;
  head: number | null;
  onNeedConnect: () => void; onOpenPF: (b: number) => void;
  onBet: (i: { mode: string; pick: string; txHash: string }) => void;
}) {
  const now = useNow();
  const [mode, setMode] = React.useState<ModeMeta>(MODES[0]);
  const [showBet, setShowBet] = React.useState(false);
  const [pick, setPick] = React.useState("even");
  const [num, setNum] = React.useState("");
  const [placing, setPlacing] = React.useState(false);
  const [myBets, setMyBets] = React.useState<Array<{ mode: string; pick: string }>>([]);
  const [revealStep, setRevealStep] = React.useState(0);
  // lever state: which side is pulled? resets when user goes Back or after confirm.
  const [leverPulled, setLeverPulled] = React.useState<string | null>(null);
  const [confirmPulled, setConfirmPulled] = React.useState(false);
  const settledRef = React.useRef<number | null>(null);

  const msToLock = Math.max(0, round.lockAt - now);
  const msToSettle = Math.max(0, round.settleAt - now);
  const settled = round.status === "settled" || !!round.result;
  const isOpen = !settled && msToLock > 0;
  const isLocked = !settled && msToLock <= 0;

  React.useEffect(() => {
    if (round.result && settledRef.current !== round.id) {
      settledRef.current = round.id;
      setRevealStep(1);
      const t = setTimeout(() => setRevealStep(2), 1800);
      return () => clearTimeout(t);
    }
  }, [round.result, round.id]);

  // --- bank split for current binary mode (EVEN vs ODD style) ---
  const sideA = mode.kind === "binary" && mode.picks ? mode.picks[0] : "a";
  const sideB = mode.kind === "binary" && mode.picks ? mode.picks[1] : "b";
  const pools = round.pools || [];
  const bankA = pools.filter((p) => p.mode === mode.id && p.pick === sideA).reduce((s, p) => s + p.stake, 0);
  const bankB = pools.filter((p) => p.mode === mode.id && p.pick === sideB).reduce((s, p) => s + p.stake, 0);
  const playersA = pools.filter((p) => p.mode === mode.id && p.pick === sideA).reduce((s, p) => s + p.players, 0);
  const playersB = pools.filter((p) => p.mode === mode.id && p.pick === sideB).reduce((s, p) => s + p.players, 0);
  const totBank = bankA + bankB;
  const votedA = totBank > 0 ? Math.round((bankA / totBank) * 100) : 50;
  const votedB = 100 - votedA;
  const totalPot = round.totalStaked;

  const openBet = (side: string) => {
    if (!addr) { onNeedConnect(); return; }
    if (!isOpen) return;
    if (mode.kind === "binary") setPick(side);
    // digit mode: keep whatever the user already selected from the pick grid
    else if (mode.kind === "number" || mode.kind === "pvp") setPick("");
    // for "digit" we deliberately keep the current pick (user picked from grid)
    setLeverPulled(side);            // pull the lever inside the side button
    setConfirmPulled(false);
    setShowBet(true);
  };

  const finalPick = mode.kind === "number" || mode.kind === "pvp" ? num : pick;
  const validPick =
    mode.kind === "binary" ? mode.picks!.includes(finalPick) :
    mode.kind === "digit" ? HEX.includes(finalPick) :
    finalPick !== "";
  const canConfirm = isOpen && !!addr && validPick && !placing;

  const confirm = async () => {
    if (!canConfirm) return;
    setPlacing(true);
    setConfirmPulled(true);
    try {
      const txHash = await W.sendStake();
      const res = await api.bet({ wallet: addr!, roundId: round.id, mode: mode.id, pick: String(finalPick), stake: BET });
      if (res.ok) {
        setMyBets((p) => [...p, { mode: mode.id, pick: String(finalPick) }]);
        onBet({ mode: mode.id, pick: String(finalPick), txHash });
        // close after a brief moment so the user sees the lever animation finish
        setTimeout(() => {
          setShowBet(false); setNum("");
          setLeverPulled(null); setConfirmPulled(false);
        }, 700);
      } else {
        setConfirmPulled(false);
      }
    } catch {
      setConfirmPulled(false);
    } finally { setPlacing(false); }
  };

  const clockMs = isOpen ? msToLock : msToSettle;
  const clockCls = clockMs < 30000 ? "danger" : clockMs < 90000 ? "warn" : "";
  const totalWindow = isOpen ? (round.lockAt - round.openAt) : (round.settleAt - round.lockAt);
  const pct = Math.max(0, Math.min(100, ((isOpen ? msToLock : msToSettle) / totalWindow) * 100));

  // ---------- SETTLED VIEW ----------
  if (settled && round.result) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`pm-card`}>
        <div className="pm-top">
          <span className="pm-badge live"><Blocks size={12} /> SETTLED</span>
          <span className="pm-clock done">#{round.result.block.number.toLocaleString()}</span>
        </div>
        <div className="reveal">
          <RevealHash hash={round.result.block.hash} step={revealStep} />
          <RevealGrid block={round.result.block} step={revealStep} />
          {revealStep === 2 && <ResultStats result={round.result} />}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <button className="pf-btn" onClick={() => onOpenPF(round.result.block.number)}><Shield size={11} /> Provably Fair</button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ---------- LIVE / BETTING VIEW ----------
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`pm-card ${slot === "closing" ? "closing" : ""} ${isLocked ? "locked" : ""}`}>
      <div className="pm-inner">
        {/* MAIN */}
        <motion.div animate={{ opacity: showBet ? 0.25 : 1, scale: showBet ? 0.97 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="pm-main">
          <div className="pm-top">
            <div className="pm-badges">
              <span className="pm-badge hot"><Flame size={11} /> {slot === "closing" ? "CLOSING" : "HOT"}</span>
              <span className="pm-badge mode">{mode.label.toUpperCase()}</span>
            </div>
            <span className={`pm-clock ${clockCls} ${isLocked ? "lock" : ""}`}>{isLocked ? "LOCKED" : fmtClock(clockMs)}</span>
          </div>

          <div className="pm-q">
            <div className="pm-icon"><Zap size={18} /></div>
            <h3>{mode.desc}</h3>
          </div>

          <div className="pm-prog-thin"><div className="fill" style={{ width: `${pct}%` }} /></div>

          {/* EST. TARGET BLOCK */}
          {head != null && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              margin: "10px 0 4px", padding: "8px 12px", borderRadius: 10,
              background: isLocked ? "rgba(249,115,22,.14)" : "rgba(255,255,255,.04)",
              border: `1px solid ${isLocked ? "rgba(249,115,22,.5)" : "var(--line)"}`,
            }}>
              <span style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase",
                color: "var(--muted)", fontWeight: 700 }}>Est. Target Block</span>
              <span className="mono" style={{
                fontSize: 14, fontWeight: 700,
                color: isLocked ? "#fb923c" : "#fff",
                textShadow: isLocked ? "0 0 12px rgba(249,115,22,.6)" : "none",
              }}>#{(head + Math.round(msToSettle / 200)).toLocaleString()} <span style={{ opacity: .6 }}>~</span></span>
            </div>
          )}

          {/* banks */}
          <div className="pm-banks">
            <div><p>Total Pot</p><b className="gold">◆ {totalPot.toFixed(2)}</b></div>
            <div><p>Bank {sideA.toUpperCase()}</p><b className="em">◆ {bankA.toFixed(2)}</b></div>
            <div><p>Bank {sideB.toUpperCase()}</p><b className="ro">◆ {bankB.toFixed(2)}</b></div>
          </div>

          {/* mode selector */}
          <div className="pm-modes">
            {MODES.map((m) => (
              <button key={m.id} className={`pm-mode ${mode.id === m.id ? "on" : ""}`} onClick={() => {
                setMode(m);
                // reset pick when switching mode so digits don't inherit "even" etc.
                if (m.kind === "binary" && m.picks) setPick(m.picks[0]);
                else setPick("");
                setNum("");
              }}>{m.label}</button>
            ))}
          </div>

          {/* binary → voted bar + two big buttons (prediction market look) */}
          {mode.kind === "binary" && mode.picks && (
            <>
              <div className="pm-voted">
                <div><p>Voted {sideA.toUpperCase()}</p><b className="em">{votedA}%</b></div>
                <div className="r"><p>Voted {sideB.toUpperCase()}</p><b className="ro">{votedB}%</b></div>
              </div>
              <div className="pm-bar"><div className="em-fill" style={{ width: `${votedA}%` }} /></div>
              <div className="pm-players"><span>{playersA} players</span><span>{playersB} players</span></div>
              <div className="pm-actions">
                <button className="pm-yes glow" disabled={!isOpen} onClick={() => openBet(sideA)}>
                  <LeverSwitch pulled={leverPulled === sideA} side={sideA} size={26} />
                  <span>{sideA.toUpperCase()}</span>
                  <ArrowUpRight size={16} />
                </button>
                <button className="pm-no glow" disabled={!isOpen} onClick={() => openBet(sideB)}>
                  <LeverSwitch pulled={leverPulled === sideB} side={sideB} size={26} />
                  <span>{sideB.toUpperCase()}</span>
                </button>
              </div>
              {!addr && <div className="pm-connect-hint">Connect wallet to place bets</div>}
            </>
          )}

          {/* digit / number / pvp → grid or input, single bet button */}
          {mode.kind !== "binary" && (
            <div className="pm-other">
              {mode.kind === "digit" && (
                <div className="pick-grid">{HEX.map((d) => (
                  <button key={d} className={`pick ${pick === d ? "sel" : ""}`}
                    onClick={() => { console.log('digit clicked:', d); setPick(d); }}>
                    {d}
                  </button>
                ))}</div>
              )}
              {(mode.kind === "number" || mode.kind === "pvp") && (
                <input className="num-input" type="number" placeholder={`Enter ${mode.hint}`} value={num} onChange={(e) => setNum(e.target.value)} />
              )}
              <button
                className="pm-yes full glow"
                disabled={
                  !isOpen ||
                  (!!addr && mode.kind === "digit" && !HEX.includes(pick)) ||
                  (!!addr && (mode.kind === "number" || mode.kind === "pvp") && num === "")
                }
                onClick={() => openBet(pick)}
              >
                {!isOpen
                  ? "Locked"
                  : !addr
                    ? "Connect wallet to place bets"
                    : mode.kind === "digit" && !HEX.includes(pick)
                      ? "Pick a digit"
                      : "Place Bet ◆ 0.01"}
              </button>
            </div>
          )}

          {myBets.length > 0 && (
            <div className="mybets">
              <div className="h">Your bets this round</div>
              {myBets.map((b, i) => <div className="mybet" key={i}><span>{MODES.find((m) => m.id === b.mode)?.label} · <span className="pk">{b.pick}</span></span><span>◆ 0.01</span></div>)}
            </div>
          )}
        </motion.div>

        {/* SLIDE-UP BETTING CONFIRM */}
        <motion.div initial={false} animate={{ y: showBet ? "0%" : "100%", opacity: showBet ? 1 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} className="pm-betview">
          <div className="pm-bv-top">
            <button className="pm-back" onClick={() => { setShowBet(false); setLeverPulled(null); setConfirmPulled(false); }}><ChevronLeft size={16} /> Back</button>
            <span className={`pm-clock ${clockCls}`}>{fmtClock(clockMs)}</span>
          </div>
          <p className="pm-bv-lbl">YOUR BET</p>
          <div className={`pm-bv-pill ${["even","high","over"].includes(finalPick) ? "em" : "ro"}`}>
            {mode.label}: {String(finalPick).toUpperCase() || "—"}
          </div>
          <div className="pm-bv-stake"><span>Stake (fixed)</span><b>◆ 0.01 zkLTC</b></div>
          {mode.multiplier > 0 && <div className="pm-bv-win"><span>If you win</span><b className="em">◆ {(BET * mode.multiplier).toFixed(4)} zkLTC</b></div>}
          <button className="pm-confirm" disabled={!canConfirm} onClick={confirm}>
            <LeverSwitch pulled={confirmPulled} side={finalPick} size={26} />
            <span className="pm-confirm-txt">{placing ? "Confirm in wallet…" : "Confirm Bet"}</span>
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function RevealHash({ hash, step }: { hash: string; step: number }) {
  if (step === 1) return <div className="hash"><span className="shuffling">{rand()}</span></div>;
  return <div className="hash">{hash.slice(0, -1)}<span className="lit">{hash.slice(-1)}</span></div>;
}
function RevealGrid({ block, step }: { block: any; step: number }) {
  const s = signals(block);
  const c = (k: string, v: React.ReactNode) => <div className="c"><div className="k">{k}</div><div className="v">{step === 1 ? <span className="shuffling">??</span> : v}</div></div>;
  return <div className="reveal-grid">{c("Even/Odd", s.even ? "EVEN" : "ODD")}{c("Last Digit", s.digit)}{c("Hi-Lo", s.hilo.toUpperCase())}{c("Num 0-99", s.mod100)}{c("Txns", block.txCount)}{c("Closest", s.mod1000)}</div>;
}
function ResultStats({ result }: { result: any }) {
  const s = result.stats;
  return <div className="rstats"><div className="c"><div className="k">Players</div><div className="v">{s.players}</div></div><div className="c"><div className="k">Winners</div><div className="v g">{s.winners}</div></div><div className="c"><div className="k">Losers</div><div className="v r">{s.losers}</div></div><div className="c"><div className="k">Paid</div><div className="v">◆ {s.totalPaidOut}</div></div></div>;
}
function rand() { const h = "0123456789abcdef"; let s = "0x"; for (let i = 0; i < 24; i++) s += h[Math.floor(Math.random() * 16)]; return s + "…"; }
