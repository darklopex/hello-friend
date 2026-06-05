import React from "react";
import { Shield, History, ArrowLeft, Wallet2 } from "lucide-react";
import { api, type RoundView } from "./lib/api";
import { useAccount, useBalance } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

import RoundCard from "./components/RoundCard";
import RoundsCarousel from "./components/RoundsCarousel";
import ProvablyFair from "./components/ProvablyFair";
import Home from "./components/Home";
import { type LiveBet } from "./components/YourBets";
import YourBetsModal from "./components/YourBetsModal";
import WalletButton from "./components/WalletButton";
import CoinImg from "./components/Coin";
import WinnersMarquee from "./components/WinnersMarquee";
import PointsToast from "./components/PointsToast";
import YourPointsModal from "./components/YourPointsModal";

export default function App() {
  const [view, setView] = React.useState<"home" | "zone">(
    typeof window !== "undefined" && window.location.pathname.startsWith("/bettingzone") ? "zone" : "home"
  );

  const goView = React.useCallback((next: "home" | "zone") => {
    setView(next);
    const path = next === "zone" ? "/bettingzone" : "/";
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }, []);

  React.useEffect(() => {
    const onPop = () => {
      setView(window.location.pathname.startsWith("/bettingzone") ? "zone" : "home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [rounds, setRounds] = React.useState<RoundView[]>([]);
  const [history, setHistory] = React.useState<RoundView[]>([]);
  const [historyPage, setHistoryPage] = React.useState(1);
  const [historyPages, setHistoryPages] = React.useState(1);
  const [head, setHead] = React.useState<number | null>(null);
  const [pfBlock, setPfBlock] = React.useState<number | null>(null);
  const [liveBets, setLiveBets] = React.useState<LiveBet[]>([]);
  const [showYourBets, setShowYourBets] = React.useState(false);
  const [showYourPoints, setShowYourPoints] = React.useState(false);

  const { address, isConnected } = useAccount();
  const { data: balance, refetch: refetchBal } = useBalance({ address });
  const { openConnectModal } = useConnectModal();

  const addr = isConnected && address ? address.toLowerCase() : null;
  const bal = balance ? Number(balance.formatted) : 0;

  // poll live rounds while in the zone
  React.useEffect(() => {
    if (view !== "zone") return;
    let alive = true;
    const load = async () => {
      try {
        const r = await api.rounds();
        if (!alive) return;
        setRounds(r.rounds);
      } catch { /* */ }
    };
    load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [view]);

  // recent blocks: paginated, refresh current page every 30s, mount → page 1
  React.useEffect(() => {
    if (view !== "zone") return;
    setHistoryPage(1);
  }, [view]);

  React.useEffect(() => {
    if (view !== "zone") return;
    let alive = true;
    const load = async () => {
      try {
        // try paginated endpoint first; fall back to legacy ?n=
        const h: any = await api.historyPage(historyPage, 10).catch(() => null);
        if (h && Array.isArray(h.history)) {
          if (!alive) return;
          setHistory(h.history);
          setHistoryPages(h.pages || 1);
          return;
        }
        const legacy = await api.history(10);
        if (!alive) return;
        setHistory(legacy.history);
        setHistoryPages(1);
      } catch { /* */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [view, historyPage]);

  // prune live bets whose round is no longer active (settled → shows up in ended).
  // never clear ended history.
  React.useEffect(() => {
    if (rounds.length === 0) return;
    const active = new Set(rounds.map((r) => r.id));
    setLiveBets((prev) => prev.filter((b) => active.has(b.roundId)));
  }, [rounds]);

  // live head ticker
  React.useEffect(() => {
    let alive = true;
    const t = async () => { try { const h = await api.head(); if (alive) setHead(h.block); } catch { /* */ } };
    t();
    const id = setInterval(t, 1500);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // wallet change → full reset (clear live bets, force remount of round cards to reset mode/picks)
  const [resetKey, setResetKey] = React.useState(0);
  const prevAddrRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (prevAddrRef.current !== addr) {
      prevAddrRef.current = addr;
      setLiveBets([]);
      setShowYourBets(false);
      setResetKey((k) => k + 1);
      refetchBal();
    }
  }, [addr, refetchBal]);

  const handleBet = (roundId: number, i: { mode: string; pick: string }) => {
    setLiveBets((p) => [...p, { roundId, mode: i.mode, pick: i.pick, stake: 0.01, placedAt: Date.now() }]);
    refetchBal();
  };

  const totalLiveStaked = rounds.reduce((s, r) => s + r.totalStaked, 0);
  const totalLivePlayers = rounds.reduce((s, r) => s + r.players, 0);

  if (view === "home") {
    return (
      <>
        <div className="app zone-mode">
          <div className="topbar">
            <div className="logo">
              <img src="https://raw.githubusercontent.com/dopedopex/your-friendly-helper/main/logo.png" alt="BetsOnBlock" width={36} height={36} style={{ borderRadius: 10, objectFit: "cover" }} />
              <div><h1>Bets<b>On</b>Block</h1></div>
            </div>
            <div className="top-right">
              <div className="live-head"><span className="pulse" /> Block <b className="mono" style={{ marginLeft: 4 }}>#{head?.toLocaleString() ?? "…"}</b></div>
              <button className="btn btn-primary btn-sm" onClick={() => goView("zone")}>Enter Zone</button>
            </div>
          </div>
          <Home onEnter={() => goView("zone")} />
        </div>
        {pfBlock != null && <ProvablyFair block={pfBlock} onClose={() => setPfBlock(null)} />}
      </>
    );
  }


  // ===== BETTING ZONE =====
  return (
    <>
      <div className="app zone-mode">
        <div className="topbar">
          <div className="logo" style={{ cursor: "pointer" }} onClick={() => goView("home")}>
            <img src="https://raw.githubusercontent.com/dopedopex/your-friendly-helper/main/logo.png" alt="BetsOnBlock" width={36} height={36} style={{ borderRadius: 10, objectFit: "cover" }} />
            <div><h1>Bets<b>On</b>Block</h1></div>
          </div>
          <div className="top-right">
            <div className="live-head"><span className="pulse" /> Block <b className="mono" style={{ marginLeft: 4 }}>#{head?.toLocaleString() ?? "…"}</b></div>
            <WalletButton />
          </div>
        </div>


        <div className="ribbon">
          <div className="item"><span className="k">Live Pot</span><span className="v" style={{ color: "#000", display: "inline-flex", alignItems: "center", gap: 6 }}><CoinImg /> {totalLiveStaked.toFixed(2)}</span></div>
          <div className="item"><span className="k">Players In Play</span><span className="v">{totalLivePlayers}</span></div>
          <div className="item"><span className="k">Active Rounds</span><span className="v">{rounds.length}</span></div>
          <div className="item"><span className="k">Bet Size</span><span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CoinImg /> 0.01 zkLTC</span></div>
          <div className="item"><span className="k">Block Time</span><span className="v">~0.2s</span></div>
        </div>

        <WinnersMarquee />

        <div className="wrap">
          <button className="back-link" onClick={() => goView("home")}><ArrowLeft size={14} /> Back to home</button>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 className="page-title">Live Rounds</h1>
              <p className="page-sub">Place bets while a round is open. Stack multiple modes, each is a flat 0.01 zkLTC.</p>
            </div>
            {addr && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => setShowYourBets(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    background: "#fff", color: "#0a0a0a", border: "3px solid #000",
                    borderRadius: 12, padding: "12px 20px", fontWeight: 900,
                    fontFamily: "'Space Grotesk',system-ui,sans-serif",
                    letterSpacing: ".04em", textTransform: "uppercase",
                    boxShadow: "5px 5px 0 0 rgba(0,0,0,.9)", cursor: "pointer",
                    transition: "transform .15s ease, box-shadow .15s ease",
                  }}
                  onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(3px,3px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "2px 2px 0 0 rgba(0,0,0,.9)"; }}
                  onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 0 rgba(0,0,0,.9)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 0 rgba(0,0,0,.9)"; }}
                >
                  <Wallet2 size={16} /> Your Bets
                  {liveBets.length > 0 && (
                    <span style={{ background: "#3b82f6", color: "#fff", borderRadius: 999,
                      padding: "2px 9px", fontSize: 12, border: "2px solid #000" }}>
                      {liveBets.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowYourPoints(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    background: "#fff7ed", color: "#0a0a0a", border: "3px solid #000",
                    borderRadius: 12, padding: "12px 20px", fontWeight: 900,
                    fontFamily: "'Space Grotesk',system-ui,sans-serif",
                    letterSpacing: ".04em", textTransform: "uppercase",
                    boxShadow: "5px 5px 0 0 rgba(0,0,0,.9)", cursor: "pointer",
                    transition: "transform .15s ease, box-shadow .15s ease",
                  }}
                  onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(3px,3px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "2px 2px 0 0 rgba(0,0,0,.9)"; }}
                  onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 0 rgba(0,0,0,.9)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 0 rgba(0,0,0,.9)"; }}
                >
                  <span style={{ color: "#f59e0b", fontSize: 18, lineHeight: 1 }}>◆</span> Your Points
                </button>
              </div>
            )}
          </div>

          <div className="zone-grid">
            <div className="rounds-carousel-wrap">
              {rounds.length === 0 && <div className="empty">Connecting to the round engine…</div>}
              {rounds.length > 0 && (
                <RoundsCarousel
                  key={resetKey}
                  rounds={rounds}
                  addr={addr}
                  head={head}
                  onNeedConnect={() => openConnectModal?.()}
                  onOpenPF={(b) => setPfBlock(b)}
                  onBet={handleBet}
                />
              )}
            </div>

            <aside className="side">
              <div className="side-head">
                <History size={15} /> Ended Rounds
              </div>
              {history.length === 0 && <div className="empty sm">No settled rounds yet.</div>}
              {history.map((r) => {
                const b = r.targetBlock || r.result?.block;
                if (!b) return null;
                return (
                  <div
                    key={r.id}
                    style={{
                      background: "var(--bg-2)", border: "1px solid var(--line)",
                      borderRadius: 11, padding: "10px 12px", marginBottom: 8,
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    }}
                  >
                    <span className="mono" style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13 }}>
                      #{b.number.toLocaleString()}
                    </span>
                    <button className="verify-btn" onClick={() => setPfBlock(b.number)}>Verify</button>
                  </div>
                );
              })}
              {historyPages > 1 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)",
                }}>
                  <button
                    className="verify-btn"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    style={{ opacity: historyPage <= 1 ? 0.4 : 1 }}
                  >← Prev</button>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                    Page {historyPage} / {historyPages}
                  </span>
                  <button
                    className="verify-btn"
                    disabled={historyPage >= historyPages}
                    onClick={() => setHistoryPage((p) => Math.min(historyPages, p + 1))}
                    style={{ opacity: historyPage >= historyPages ? 0.4 : 1 }}
                  >Next →</button>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {pfBlock != null && <ProvablyFair block={pfBlock} onClose={() => setPfBlock(null)} />}
      {showYourBets && (
        <YourBetsModal
          address={addr}
          liveBets={liveBets}
          rounds={rounds.map((r) => ({ id: r.id, lockAt: r.lockAt, settleAt: r.settleAt }))}
          head={head}
          onClose={() => setShowYourBets(false)}
        />
      )}
      {showYourPoints && addr && (
        <YourPointsModal address={addr} onClose={() => setShowYourPoints(false)} />
      )}
      <PointsToast />
    </>
  );
}
