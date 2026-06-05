import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Search, ExternalLink } from "lucide-react";
import { MODES, MODE_MAP, signals as deriveSignals } from "../lib/modes";
import { EXPLORER } from "../lib/wagmi";
import type { LiveBet } from "./YourBets";
import Coin from "./Coin";

type EndedBet = {
  roundId: number;
  block: number;
  mode: string;
  pick: string;
  stake: number;
  win: boolean;
  payout: number;
  settledAt: number;
  payoutTx?: string | null;
};

type LiveGroup = {
  roundId: number;
  estBlock: number | null;
  isLocked: boolean;
  bets: LiveBet[];
};
type EndedGroup = {
  block: number;
  bets: EndedBet[];
  totalStake: number;
  totalPayout: number;
  net: number;
};

const API_BASE = (import.meta as any).env?.VITE_API_URL || "";

const wrap: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center",
  background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", padding: 16,
};
const panel: React.CSSProperties = {
  background: "#f5f5f5", color: "#0a0a0a", borderRadius: 18, border: "4px solid #000",
  boxShadow: "10px 10px 0 0 rgba(0,0,0,.9)",
  width: "min(980px,100%)", maxHeight: "92vh", overflow: "auto",
  padding: "28px 26px", fontFamily: "'Space Grotesk',system-ui,sans-serif",
  backgroundImage: "linear-gradient(rgba(0,0,0,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.04) 1px,transparent 1px)",
  backgroundSize: "22px 22px",
};
const titleBox: React.CSSProperties = {
  display: "inline-block", background: "#fff", border: "4px solid #000",
  borderRadius: 14, padding: "14px 28px",
  boxShadow: "8px 8px 0 0 rgba(0,0,0,.9)", fontWeight: 900,
  fontSize: "clamp(28px,4vw,42px)", letterSpacing: "-.02em", color: "#0f172a",
};
const toggleWrap: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 14, margin: "22px 0 26px",
};
const toggleBtn = (on: boolean): React.CSSProperties => ({
  fontWeight: on ? 900 : 600, color: on ? "#000" : "#6b7280", cursor: "pointer",
  background: "none", border: 0, fontSize: 15, fontFamily: "inherit",
});
const toggleTrack: React.CSSProperties = {
  width: 64, height: 32, background: "#e5e7eb", borderRadius: 999,
  border: "2px solid #000", boxShadow: "2px 2px 0 0 rgba(0,0,0,.9)",
  padding: 3, cursor: "pointer", display: "flex", alignItems: "center",
};
const cardGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 18,
};
const card = (highlight?: boolean): React.CSSProperties => ({
  position: "relative", background: "#fff", border: "4px solid #000", borderRadius: 14,
  padding: "22px 18px 18px",
  boxShadow: highlight ? "10px 10px 0 0 #f97316" : "6px 6px 0 0 rgba(0,0,0,.9)",
});
const blockTitle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 22, letterSpacing: "-.01em",
};
const priceBadge = (win: boolean): React.CSSProperties => ({
  position: "absolute", top: -18, right: -10, width: 78, height: 78, borderRadius: "50%",
  background: win ? "#22c55e" : "#ef4444", color: "#fff", border: "3px solid #000",
  boxShadow: "3px 3px 0 0 rgba(0,0,0,.9)",
  display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1, fontWeight: 900,
  fontFamily: "'JetBrains Mono',monospace",
});
const modeRow = (active: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  border: "2px solid #000", borderRadius: 10, padding: "9px 11px", marginTop: 8,
  background: active ? "#3b82f6" : "#fff", color: active ? "#fff" : "#0a0a0a",
  boxShadow: "2px 2px 0 0 rgba(0,0,0,.9)", cursor: "pointer", fontWeight: 700, fontSize: 13,
  fontFamily: "inherit",
});
const checkBox = (active: boolean): React.CSSProperties => ({
  width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center",
  border: "2px solid #000", background: active ? "#fff" : "#e5e7eb", color: "#000",
});

function ScopeAnim() {
  return (
    <div style={{ position: "relative", height: 48, overflow: "hidden", marginTop: 8 }}>
      <motion.div
        animate={{ x: ["-10%", "110%"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
        style={{ position: "absolute", top: 6 }}
      >
        <Search size={34} strokeWidth={3} />
      </motion.div>
      <div style={{
        position: "absolute", bottom: 6, left: 0, right: 0, height: 6, borderRadius: 6,
        background: "repeating-linear-gradient(90deg,#000 0 8px,transparent 8px 16px)", opacity: .4,
      }} />
    </div>
  );
}

export default function YourBetsModal({
  address, liveBets, rounds, head, onClose,
}: {
  address: string | null;
  liveBets: LiveBet[];
  rounds: Array<{ id: number; lockAt: number; settleAt: number }>;
  head: number | null;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState<"live" | "ended">("live");
  const [ended, setEnded] = React.useState<EndedBet[]>([]);
  const [endedPage, setEndedPage] = React.useState(1);
  const ENDED_PER_PAGE = 20;
  const [detail, setDetail] = React.useState<{ blockKey: string; mode: string } | null>(null);
  const [verifyCache, setVerifyCache] = React.useState<Record<number, any>>({});

  React.useEffect(() => {
    if (!address) return; // never clear on disconnect: keep history visible until remount
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/bets/${address}?page=1&limit=200`);
        if (!r.ok) return;
        const j = await r.json();
        if (alive && Array.isArray(j.bets)) setEnded(j.bets);
      } catch { /* */ }
    };
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [address]);

  const fetchVerify = async (block: number) => {
    if (verifyCache[block]) return;
    try {
      const r = await fetch(`${API_BASE}/api/verify/${block}`);
      if (!r.ok) return;
      const j = await r.json();
      setVerifyCache((p) => ({ ...p, [block]: j }));
    } catch { /* */ }
  };

  // group live bets per round
  const liveGroups: LiveGroup[] = React.useMemo(() => {
    const map = new Map<number, LiveBet[]>();
    liveBets.forEach((b) => {
      const arr = map.get(b.roundId) || [];
      arr.push(b);
      map.set(b.roundId, arr);
    });
    return Array.from(map.entries()).map(([roundId, bets]) => {
      const r = rounds.find((x) => x.id === roundId);
      const msToSettle = r ? Math.max(0, r.settleAt - Date.now()) : 0;
      const msToLock = r ? Math.max(0, r.lockAt - Date.now()) : 0;
      const estBlock = head != null && r ? head + Math.round(msToSettle / 200) : null;
      return { roundId, estBlock, isLocked: msToLock <= 0, bets };
    });
  }, [liveBets, rounds, head]);

  // group ended bets per block
  const endedGroups: EndedGroup[] = React.useMemo(() => {
    const map = new Map<number, EndedBet[]>();
    ended.forEach((b) => {
      const arr = map.get(b.block) || [];
      arr.push(b);
      map.set(b.block, arr);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([block, bets]) => {
        const totalStake = bets.reduce((s, b) => s + b.stake, 0);
        const totalPayout = bets.reduce((s, b) => s + (b.win ? b.payout : 0), 0);
        return { block, bets, totalStake, totalPayout, net: totalPayout - totalStake };
      });
  }, [ended]);

  const openDetail = (blockKey: string, mode: string, block?: number) => {
    setDetail({ blockKey, mode });
    if (block) fetchVerify(block);
  };

  return (
    <div style={wrap} onClick={onClose}>
      <motion.div
        initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        style={panel} onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* close */}
        <button onClick={onClose} aria-label="Close"
          style={{ position: "absolute", top: 18, right: 22, background: "#fff",
            border: "3px solid #000", borderRadius: 10, padding: 8, cursor: "pointer",
            boxShadow: "3px 3px 0 0 rgba(0,0,0,.9)" }}>
          <X size={18} />
        </button>

        {/* header */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={titleBox}>YOUR BETS</div>
          <div style={{ height: 6, background: "linear-gradient(90deg,#000,#666,#000)",
            borderRadius: 999, marginTop: 10, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }} />
        </div>

        {/* toggle */}
        <div style={toggleWrap}>
          <button style={toggleBtn(tab === "live")} onClick={() => setTab("live")}>Live</button>
          <div style={toggleTrack} onClick={() => setTab(tab === "live" ? "ended" : "live")}>
            <motion.div
              animate={{ x: tab === "ended" ? 32 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              style={{ width: 22, height: 22, background: "#fff", borderRadius: "50%", border: "2px solid #000" }}
            />
          </div>
          <button style={toggleBtn(tab === "ended")} onClick={() => setTab("ended")}>Ended</button>
        </div>

        {/* cards */}
        {tab === "live" ? (
          liveGroups.length === 0 ? (
            <EmptyState text="No live bets. Place a bet on an open round." />
          ) : (
            <div style={cardGrid}>
              {liveGroups.map((g) => (
                <BetCard
                  key={`live-${g.roundId}`}
                  blockKey={`live-${g.roundId}`}
                  blockLabel={g.estBlock != null ? `#${g.estBlock.toLocaleString()} ~` : "#…"}
                  highlightOrange={g.isLocked}
                  badgeKind="live"
                  betsByMode={Object.fromEntries(g.bets.map((b) => [b.mode, b]))}
                  onModeClick={(m) => openDetail(`live-${g.roundId}`, m)}
                  liveBadge={<ScopeAnim />}
                />
              ))}
            </div>
          )
        ) : (
          endedGroups.length === 0 ? (
            <EmptyState text="No settled bets yet." />
          ) : (() => {
            const totalPages = Math.max(1, Math.ceil(endedGroups.length / ENDED_PER_PAGE));
            const safePage = Math.min(endedPage, totalPages);
            const start = (safePage - 1) * ENDED_PER_PAGE;
            const pageGroups = endedGroups.slice(start, start + ENDED_PER_PAGE);
            return (
              <>
                <div style={cardGrid}>
                  {pageGroups.map((g) => {
                    const won = g.net >= 0;
                    return (
                      <BetCard
                        key={`ended-${g.block}`}
                        blockKey={`ended-${g.block}`}
                        blockLabel={`#${g.block.toLocaleString()}`}
                        badgeKind={won ? "win" : "loss"}
                        badgeValue={<><>{won ? "+" : "-"}</><Coin size={11} />{Math.abs(g.net).toFixed(4)}</>}
                        betsByMode={Object.fromEntries(g.bets.map((b) => [b.mode, b]))}
                        showPointsBadge
                        onModeClick={(m) => openDetail(`ended-${g.block}`, m, g.block)}
                        footer={
                          <a href={`${EXPLORER}/block/${g.block}`} target="_blank" rel="noreferrer"
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                              marginTop: 14, background: won ? "#22c55e" : "#ef4444", color: "#fff",
                              border: "3px solid #000", borderRadius: 10, padding: "10px 12px",
                              fontWeight: 800, textDecoration: "none",
                              boxShadow: "3px 3px 0 0 rgba(0,0,0,.9)" }}>
                            VERIFY <ExternalLink size={14} />
                          </a>
                        }
                      />
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
                    gap: 12, marginTop: 22 }}>
                    <button
                      onClick={() => setEndedPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      style={{ background: "#fff", color: "#000", border: "3px solid #000",
                        borderRadius: 10, padding: "8px 14px", fontWeight: 800, cursor: "pointer",
                        boxShadow: "3px 3px 0 0 rgba(0,0,0,.9)",
                        opacity: safePage <= 1 ? 0.4 : 1 }}>← Previous</button>
                    <span style={{ fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>
                      Page {safePage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setEndedPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      style={{ background: "#fff", color: "#000", border: "3px solid #000",
                        borderRadius: 10, padding: "8px 14px", fontWeight: 800, cursor: "pointer",
                        boxShadow: "3px 3px 0 0 rgba(0,0,0,.9)",
                        opacity: safePage >= totalPages ? 0.4 : 1 }}>Next →</button>
                  </div>
                )}
              </>
            );
          })()
        )}

        {/* detail popup */}
        <AnimatePresence>
          {detail && (
            <ModeDetail
              detail={detail}
              liveGroups={liveGroups}
              endedGroups={endedGroups}
              verifyCache={verifyCache}
              onClose={() => setDetail(null)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ background: "#fff", border: "3px dashed #000", borderRadius: 14,
      padding: 40, textAlign: "center", fontWeight: 700, color: "#374151" }}>
      {text}
    </div>
  );
}

function BetCard({
  blockKey, blockLabel, badgeKind, badgeValue, betsByMode, onModeClick, highlightOrange, liveBadge, footer, showPointsBadge,
}: {
  blockKey: string;
  blockLabel: string;
  badgeKind: "live" | "win" | "loss";
  badgeValue?: React.ReactNode;
  betsByMode: Record<string, any>;
  onModeClick: (mode: string) => void;
  highlightOrange?: boolean;
  liveBadge?: React.ReactNode;
  footer?: React.ReactNode;
  showPointsBadge?: boolean;
}) {
  const badge =
    badgeKind === "live"
      ? <div style={priceBadge(true)}><div style={{ fontSize: 11 }}>LIVE</div><div style={{ fontSize: 10, opacity: .9 }}>~ est</div></div>
      : <div style={priceBadge(badgeKind === "win")}>
          <div style={{ fontSize: 11 }}>{badgeKind === "win" ? "WIN" : "LOSS"}</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>{badgeValue}</div>
        </div>;
  const ptsPill = (label: string, bonus?: boolean): React.CSSProperties => ({
    background: bonus ? "#facc15" : "#22c55e",
    color: bonus ? "#0a0a0a" : "#fff",
    border: "1.5px solid #000",
    borderRadius: 999,
    padding: "2px 7px",
    fontSize: 10,
    fontWeight: 900,
    fontFamily: "'JetBrains Mono',monospace",
    letterSpacing: ".02em",
    lineHeight: 1.2,
    boxShadow: "1.5px 1.5px 0 0 rgba(0,0,0,.85)",
    whiteSpace: "nowrap",
  });
  return (
    <div style={card(highlightOrange)}>
      {badge}
      <div style={{ ...blockTitle, color: highlightOrange ? "#ea580c" : "#0a0a0a" }}>{blockLabel}</div>
      {liveBadge}
      <div style={{ marginTop: 12 }}>
        {MODES.map((m) => {
          const bet = betsByMode[m.id];
          const active = !!bet;
          return (
            <button key={m.id} className="ybets-row" style={modeRow(active)} onClick={() => onModeClick(m.id)}>
              <span style={checkBox(active)}>{active && <Check size={14} strokeWidth={3} />}</span>
              <span>{m.label}</span>
              {showPointsBadge && active && (
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <span style={ptsPill("+10 pts")}>+10 pts</span>
                  {bet?.win && <span style={ptsPill("+10 pts 🏆", true)}>+10 pts 🏆</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

function ModeDetail({
  detail, liveGroups, endedGroups, verifyCache, onClose,
}: {
  detail: { blockKey: string; mode: string };
  liveGroups: LiveGroup[];
  endedGroups: EndedGroup[];
  verifyCache: Record<number, any>;
  onClose: () => void;
}) {
  const meta = MODE_MAP[detail.mode];
  const isLive = detail.blockKey.startsWith("live-");
  let body: React.ReactNode = null;
  let title = meta?.label ?? detail.mode;

  if (isLive) {
    const id = Number(detail.blockKey.slice(5));
    const g = liveGroups.find((x) => x.roundId === id);
    const bet = g?.bets.find((b) => b.mode === detail.mode);
    body = bet ? (
      <>
        <Row k="Your pick" v={bet.pick.toUpperCase()} mono />
        <Row k="Stake" v={<><Coin size={13} /> {bet.stake.toFixed(4)}</>} mono />
        <Row k="Est. target block" v={g?.estBlock ? `#${g.estBlock.toLocaleString()} ~` : "—"} mono />
        <Row k="Status" v="PENDING" />
        {meta && meta.multiplier > 0 && <Row k="Potential win" v={<><Coin size={13} /> {(bet.stake * meta.multiplier).toFixed(4)}</>} mono />}
      </>
    ) : <NoBet />;
  } else {
    const block = Number(detail.blockKey.slice(6));
    const g = endedGroups.find((x) => x.block === block);
    const bet = g?.bets.find((b) => b.mode === detail.mode);
    const v = verifyCache[block];
    let actual: React.ReactNode = "—";
    if (v?.block) {
      const s = deriveSignals(v.block);
      switch (detail.mode) {
        case "coinflip": actual = s.even ? "EVEN" : "ODD"; break;
        case "hilo": actual = s.hilo.toUpperCase(); break;
        case "digit": actual = s.digit.toUpperCase(); break;
        case "number": actual = s.mod100; break;
        case "txou": actual = s.txou.toUpperCase(); break;
        case "gasou": actual = s.gasou.toUpperCase(); break;
        case "closest": actual = s.mod1000; break;
        case "perfectblock": actual = `#${Number(v.block.number).toLocaleString()}`; break;
      }
    }
    if (!v?.block && detail.mode === "perfectblock") actual = `#${block.toLocaleString()}`;
    body = bet ? (
      <>
        <Row k="Block" v={`#${block.toLocaleString()}`} mono />
        {v?.block?.hash && <Row k="Hash" v={v.block.hash} mono small />}
        <Row k="Your pick" v={bet.pick.toUpperCase()} mono />
        <Row k="Block produced" v={String(actual)} mono />
        <Row k="Stake" v={<><Coin size={13} /> {bet.stake.toFixed(4)}</>} mono />
        <Row k="Result" v={bet.win ? <>WIN +<Coin size={13} />{bet.payout.toFixed(4)}</> : <>LOSS -<Coin size={13} />{bet.stake.toFixed(4)}</>}
          color={bet.win ? "#16a34a" : "#dc2626"} />
      </>
    ) : <NoBet />;
  }

  return (
    <div style={{ ...wrap, background: "rgba(0,0,0,.5)" }} onClick={onClose}>
      <motion.div
        initial={{ scale: .85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .85, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        style={{ ...panel, width: "min(420px,100%)", padding: 24 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...titleBox, fontSize: 22, padding: "8px 16px" }}>{title}</div>
          <button onClick={onClose} style={{ background: "#fff", border: "3px solid #000", borderRadius: 10,
            padding: 6, cursor: "pointer", boxShadow: "3px 3px 0 0 rgba(0,0,0,.9)" }}>
            <X size={16} />
          </button>
        </div>
        {meta && <div style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>{meta.desc}</div>}
        <div style={{ background: "#fff", border: "3px solid #000", borderRadius: 12, padding: 14,
          boxShadow: "4px 4px 0 0 rgba(0,0,0,.9)" }}>
          {body}
        </div>
      </motion.div>
    </div>
  );
}

function NoBet() {
  return <div style={{ textAlign: "center", padding: "12px 0", fontWeight: 700, color: "#6b7280" }}>
    You did not bet on this mode.
  </div>;
}
function Row({ k, v, mono, small, color }: { k: string; v: React.ReactNode; mono?: boolean; small?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 12, padding: "8px 0", borderBottom: "1px dashed rgba(0,0,0,.15)" }}>
      <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>{k}</span>
      <span style={{
        fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
        fontWeight: 800, fontSize: small ? 11 : 14, color: color || "#0a0a0a",
        wordBreak: "break-all", textAlign: "right", maxWidth: "65%",
      }}>{v}</span>
    </div>
  );
}