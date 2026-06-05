import React from "react";
import { api } from "../lib/api";
import { MODE_MAP } from "../lib/modes";

type Win = { wallet: string; payout: number; mode: string; block: number };

function shortAddr(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function WinnersMarquee() {
  const [wins, setWins] = React.useState<Win[]>([]);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const h: any = await api.historyPage(1, 30).catch(() => null);
        const list = (h && Array.isArray(h.history)) ? h.history : (await api.history(30)).history;
        if (!alive) return;
        const out: Win[] = [];
        for (const r of list) {
          const blockNum = r.result?.block?.number ?? r.targetBlock?.number;
          if (!blockNum) continue;
          const perBet = r.result?.perBet || [];
          for (const b of perBet) {
            if (b.win && b.payout > 0) {
              out.push({ wallet: b.wallet, payout: b.payout, mode: b.mode, block: blockNum });
            }
          }
          const cWinners = r.result?.closest?.winners || [];
          for (const w of cWinners) {
            if (w.payout > 0) out.push({ wallet: w.wallet, payout: w.payout, mode: "closest", block: blockNum });
          }
        }
        setWins(out);
      } catch { /* */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const items = wins.length === 0
    ? [<span key="empty">🎮 Be the first to win on BetsOnBlock!</span>]
    : wins.map((w, i) => (
        <span key={i}>
          🏆 <span style={{ fontFamily: "var(--mono)" }}>{shortAddr(w.wallet)}</span>{" "}
          won <span style={{ color: "#f59e0b", fontWeight: 800 }}>+{w.payout.toFixed(4)} zkLTC</span>{" "}
          <span style={{ color: "#22c55e", fontWeight: 800 }}>+ 20 pts</span>{" "}
          on {MODE_MAP[w.mode]?.label || w.mode} at block{" "}
          <span style={{ fontFamily: "var(--mono)" }}>#{w.block.toLocaleString()}</span>
        </span>
      ));

  // duplicate items for seamless loop
  const renderRow = (keyPrefix: string) => (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 24, paddingRight: 24 }}>
      {items.map((node, i) => (
        <React.Fragment key={`${keyPrefix}-${i}`}>
          {node}
          <span style={{ color: "#4b5563" }}>·</span>
        </React.Fragment>
      ))}
    </div>
  );

  // duration based on ~40px/sec — approximate by item count
  const duration = Math.max(20, items.length * 6);

  return (
    <div style={{
      background: "#0a0a0a", color: "#fff", height: 36, width: "100%",
      overflow: "hidden", borderBottom: "3px solid #000",
      display: "flex", alignItems: "center", position: "relative",
      fontFamily: "'Space Grotesk',system-ui,sans-serif", fontSize: 13, fontWeight: 600,
    }}>
      <style>{`
        @keyframes bob-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div style={{
        display: "inline-flex", whiteSpace: "nowrap",
        animation: `bob-marquee ${duration}s linear infinite`,
        willChange: "transform",
      }}>
        {renderRow("a")}
        {renderRow("b")}
      </div>
    </div>
  );
}
