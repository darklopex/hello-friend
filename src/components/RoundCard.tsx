import React from "react";
import { motion } from "framer-motion";
import { Shield, Flame, Zap, ChevronLeft, ArrowUpRight, Blocks, Sparkles, HelpCircle } from "lucide-react";
import { api, type RoundView } from "../lib/api";
import { MODES, HEX, signals, type ModeMeta, type ModeId } from "../lib/modes";
import Coin from "./Coin";
import ModeHelpModal from "./ModeHelpModal";
import * as W from "../lib/wallet";
import LeverSwitch from "./LeverSwitch";
import BetToast, { type BetToastData } from "./BetToast";

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
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [toast, setToast] = React.useState<BetToastData | null>(null);
  // lever state: which side is pulled? resets when user goes Back or after confirm.
  const [leverPulled, setLeverPulled] = React.useState<string | null>(null);
  const [confirmPulled, setConfirmPulled] = React.useState(false);
  // perfect block state
  const [pbCelebrate, setPbCelebrate] = React.useState(false);
  const [pbPrefix, setPbPrefix] = React.useState("");
  const settledRef = React.useRef<number | null>(null);

  const msToLock = Math.max(0, round.lockAt - now);
  const msToSettle = Math.max(0, round.settleAt - now);
  const settled = round.status === "settled" || !!round.result;
  const isOpen = !settled && msToLock > 0;
  const isLocked = !settled && msToLock <= 0;
  const alreadyBetModes = React.useMemo(() => new Set(myBets.map((b) => b.mode)), [myBets]);
  const modeAlreadyBet = alreadyBetModes.has(mode.id);

  React.useEffect(() => {
    if (round.result && settledRef.current !== round.id) {
      settledRef.current = round.id;
      setRevealStep(1);
      const t = setTimeout(() => setRevealStep(2), 1800);
      return () => clearTimeout(t);
    }
  }, [round.result, round.id]);

  // celebrate perfect-block 50× win when this round settles
  React.useEffect(() => {
    if (!round.result || !addr) return;
    const perBet: any[] = round.result.perBet || [];
    const won = perBet.some(
      (b) => b.mode === "perfectblock" && b.win && String(b.wallet).toLowerCase() === addr,
    );
    if (won) {
      setPbCelebrate(true);
      const t = setTimeout(() => setPbCelebrate(false), 6000);
      return () => clearTimeout(t);
    }
  }, [round.result, addr]);

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
    else if (mode.kind === "number" || mode.kind === "pvp" || mode.kind === "perfectblock") setPick("");
    // for "digit" we deliberately keep the current pick (user picked from grid)
    setLeverPulled(side);            // pull the lever inside the side button
    setConfirmPulled(false);
    setShowBet(true);
  };

  const finalPick =
    mode.kind === "perfectblock" ? (pbPrefix + num) :
    (mode.kind === "number" || mode.kind === "pvp") ? num : pick;
  const validPick =
    mode.kind === "binary" ? mode.picks!.includes(finalPick) :
    mode.kind === "digit" ? HEX.includes(finalPick) :
    mode.kind === "perfectblock" ? (pbPrefix !== "" && num.length === 3) :
    finalPick !== "";
  const canConfirm = isOpen && !!addr && validPick && !placing && !modeAlreadyBet;

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
        window.dispatchEvent(new CustomEvent("bob:points-credited", { detail: { points: 10 } }));
        const last4 = addr!.slice(-4);
        const ts4 = String(Date.now()).slice(-4);
        setToast({
          kind: "success",
          mode: mode.id,
          pick: String(finalPick).toUpperCase(),
          stake: BET,
          roundId: round.id,
          refId: `BOB-${round.id}-${last4}-${ts4}`,
          blockNumber: head != null ? head + Math.round(msToSettle / 200) : null,
          roundSettled: false,
        });
        // close after a brief moment so the user sees the lever animation finish
        setTimeout(() => {
          setShowBet(false); setNum("");
          setLeverPulled(null); setConfirmPulled(false);
        }, 700);
      } else {
        setConfirmPulled(false);
        setToast({ kind: "error", message: res.error || "Bet was rejected." });
      }
    } catch (e: any) {
      setConfirmPulled(false);
      setToast({ kind: "error", message: e?.message || "Transaction failed." });
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
            <div className="pm-icon" style={{ background: "transparent", boxShadow: "none", padding: 0, overflow: "hidden" }}><img src="https://raw.githubusercontent.com/dopedopex/your-friendly-helper/main/logo.png" alt="" width={40} height={40} style={{ borderRadius: 10, objectFit: "cover", display: "block" }} /></div>
            <h3 style={{ flex: 1 }}>{mode.desc}</h3>
            <button
              onClick={() => setHelpOpen(true)}
              aria-label="Mode help"
              title="What is this mode?"
              style={{
                background: "#fff", border: "2px solid #000", borderRadius: 999,
                width: 28, height: 28, display: "grid", placeItems: "center",
                cursor: "pointer", boxShadow: "2px 2px 0 0 #000", flexShrink: 0,
                color: "#0a0a0a",
              }}
            >
              <HelpCircle size={15} />
            </button>
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
                color: "#00e5ff",
                textShadow: "0 0 12px rgba(0,229,255,.45)",
              }}>#{(head + Math.round(msToSettle / 200)).toLocaleString()} <span style={{ opacity: .6, color: "#00e5ff" }}>~</span></span>
            </div>
          )}

          {/* Perfect Block win celebration overlay */}
          {pbCelebrate && (
            <motion.div
              initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 14 }}
              style={{
                margin: "12px 0", padding: "16px 14px", borderRadius: 12,
                background: "rgba(253,224,71,.92)", color: "#0a0a0a",
                fontWeight: 900, fontFamily: "'Space Grotesk',system-ui,sans-serif",
                textAlign: "center",
              }}>
              <div style={{ fontSize: 11, letterSpacing: ".22em" }}>
                <Sparkles size={11} style={{ verticalAlign: "middle" }} /> PERFECT BLOCK
              </div>
              <div style={{ fontSize: 28, letterSpacing: "-.02em" }}>50× WIN! 🎉</div>
            </motion.div>
          )}

          {/* banks */}
          <div className="pm-banks">
            <div><p>Total Pot</p><b style={{color:"#000"}}><Coin size={14} /> {totalPot.toFixed(2)}</b></div>
            <div><p>Bank {sideA.toUpperCase()}</p><b className="em"><Coin size={14} /> {bankA.toFixed(2)}</b></div>
            <div><p>Bank {sideB.toUpperCase()}</p><b className="ro"><Coin size={14} /> {bankB.toFixed(2)}</b></div>
          </div>

          {/* mode selector */}
          <div className="pm-modes">
            {MODES.map((m) => {
              const done = alreadyBetModes.has(m.id);
              return (
                <button
                  key={m.id}
                  className={`pm-mode ${mode.id === m.id ? "on" : ""} ${done ? "done" : ""}`}
                  disabled={done}
                  onClick={() => {
                    if (done) return;
                    setMode(m);
                    if (m.kind === "binary" && m.picks) setPick(m.picks[0]);
                    else setPick("");
                    setNum("");
                    if (m.kind === "perfectblock" && head != null) {
                      const est = head + Math.round(Math.max(0, round.settleAt - Date.now()) / 200);
                      const s = String(est);
                      setPbPrefix(s.length > 3 ? s.slice(0, -3) : "");
                    } else {
                      setPbPrefix("");
                    }
                  }}>
                  {done && <span style={{ marginRight: 4, color: "#22c55e" }}>✓</span>}
                  {m.label}
                </button>
              );
            })}
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
              {mode.kind === "perfectblock" && (() => {
                const prefixStr = "#" + (pbPrefix ? Number(pbPrefix).toLocaleString() : "");
                const padLeft = 14 + prefixStr.length * 10;
                return (
                  <div className="pb-input-wrap">
                    <span className="pb-prefix">{prefixStr}</span>
                    <input
                      className="num-input pb-input"
                      style={{ paddingLeft: padLeft }}
                      type="text"
                      inputMode="numeric"
                      placeholder="000"
                      maxLength={3}
                      value={num}
                      onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    />
                  </div>
                );
              })()}
              {(mode.kind === "number" || mode.kind === "pvp") && (
                <input
                  className="num-input"
                  type="text"
                  inputMode="numeric"
                  placeholder={`Enter ${mode.hint}`}
                  value={num}
                  onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
                />
              )}
              {mode.kind === "perfectblock" && (
                <div style={{ fontSize: 12, color: "var(--text-2)", margin: "-2px 0 12px" }}>
                  <span>If you win: <b style={{ color: "#00e5ff" }}><Coin size={13} /> {(BET * mode.multiplier).toFixed(4)} zkLTC</b> (50×)</span>
                </div>
              )}
              {mode.kind === "number" && (
                <div style={{ fontSize: 12, color: "var(--text-2)", margin: "-2px 0 12px" }}>
                  <span>If you win: <b style={{ color: "#00e5ff" }}><Coin size={13} /> {(BET * mode.multiplier).toFixed(4)} zkLTC</b> ({mode.multiplier}×)</span>
                </div>
              )}
              {mode.kind === "pvp" && (
                <div style={{ fontSize: 12, color: "var(--text-2)", margin: "-2px 0 12px" }}>
                  <span>If you win: <b style={{ color: "#00e5ff" }}><Coin size={13} /> {Math.max(0.0196, round.players * BET * 0.98).toFixed(4)} zkLTC</b> (winner takes pot)</span>
                </div>
              )}
              <button
                className="pm-yes full glow"
                disabled={
                  !isOpen ||
                  modeAlreadyBet ||
                  (!!addr && mode.kind === "digit" && !HEX.includes(pick)) ||
                  (!!addr && (mode.kind === "number" || mode.kind === "pvp") && num === "") ||
                  (!!addr && mode.kind === "perfectblock" && (num.length !== 3 || pbPrefix === ""))
                }
                onClick={() => openBet(pick)}
              >
                {!isOpen
                  ? "Locked"
                  : modeAlreadyBet
                    ? "✓ Already bet this round"
                    : !addr
                      ? "Connect wallet to place bets"
                      : mode.kind === "digit" && !HEX.includes(pick)
                        ? "Pick a digit"
                        : <>Place Bet <Coin size={14} /> 0.01</>}
              </button>
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
          <div className="pm-bv-stake"><span>Stake (fixed)</span><b><Coin size={14} /> 0.01 zkLTC</b></div>
          {mode.multiplier > 0 && <div className="pm-bv-win"><span>If you win</span><b className="em"><Coin size={14} /> {(BET * mode.multiplier).toFixed(4)} zkLTC</b></div>}
          <button className="pm-confirm" disabled={!canConfirm} onClick={confirm}>
            <LeverSwitch pulled={confirmPulled} side={finalPick} size={26} />
            <span className="pm-confirm-txt">{placing ? "Confirm in wallet…" : "Confirm Bet"}</span>
          </button>
        </motion.div>
      </div>
      {helpOpen && <ModeHelpModal modeId={mode.id as ModeId} onClose={() => setHelpOpen(false)} />}
      <BetToast data={toast} onClose={() => setToast(null)} />
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
  return <div className="rstats"><div className="c"><div className="k">Players</div><div className="v">{s.players}</div></div><div className="c"><div className="k">Winners</div><div className="v g">{s.winners}</div></div><div className="c"><div className="k">Losers</div><div className="v r">{s.losers}</div></div><div className="c"><div className="k">Paid</div><div className="v"><Coin size={13} /> {s.totalPaidOut}</div></div></div>;
}
function rand() { const h = "0123456789abcdef"; let s = "0x"; for (let i = 0; i < 24; i++) s += h[Math.floor(Math.random() * 16)]; return s + "…"; }
