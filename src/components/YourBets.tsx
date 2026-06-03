import React from "react";
import { Wallet2, ChevronDown, ChevronUp, ExternalLink, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { EXPLORER } from "../lib/wagmi";
import { MODE_MAP, signals as deriveSignals } from "../lib/modes";

export type LiveBet = {
  roundId: number;
  mode: string;
  pick: string;
  stake: number;
  placedAt: number;
};

type EndedBet = {
  roundId: number;
  block: number;
  mode: string;
  pick: string;
  stake: number;
  win: boolean;
  payout: number;
  settledAt: number;
};

const API_BASE = (import.meta as any).env?.VITE_API_URL || "";
const PAGE_SIZE = 3;

function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function useNow() {
  const [, f] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { const id = setInterval(f, 1000); return () => clearInterval(id); }, []);
  return Date.now();
}

export default function YourBets({
  address,
  liveBets,
  rounds,
}: {
  address: string | null;
  liveBets: LiveBet[];
  rounds: Array<{ id: number; lockAt: number; settleAt: number }>;
}) {
  const [tab, setTab] = React.useState<"live" | "ended">("live");
  const [ended, setEnded] = React.useState<EndedBet[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [verifyCache, setVerifyCache] = React.useState<Record<number, any>>({});
  const [livePage, setLivePage] = React.useState(0);
  const [endedPage, setEndedPage] = React.useState(0);
  const now = useNow();

  React.useEffect(() => {
    // Never clear ended on disconnect — fetch fresh whenever address present.
    if (!address) return;
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        const r = await fetch(`${API_BASE}/api/bets/${address}`);
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setEnded(Array.isArray(j.bets) ? j.bets : []);
      } catch { /* */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [address]);

  // Clamp current page when underlying arrays shrink.
  const liveTotalPages = Math.max(1, Math.ceil(liveBets.length / PAGE_SIZE));
  const endedTotalPages = Math.max(1, Math.ceil(ended.length / PAGE_SIZE));
  React.useEffect(() => { if (livePage >= liveTotalPages) setLivePage(liveTotalPages - 1); }, [livePage, liveTotalPages]);
  React.useEffect(() => { if (endedPage >= endedTotalPages) setEndedPage(endedTotalPages - 1); }, [endedPage, endedTotalPages]);

  const fetchVerify = async (block: number) => {
    if (verifyCache[block]) return;
    try {
      const r = await fetch(`${API_BASE}/api/verify/${block}`);
      if (!r.ok) return;
      const j = await r.json();
      setVerifyCache((p) => ({ ...p, [block]: j }));
    } catch { /* */ }
  };

  const toggle = (idx: number, block: number) => {
    setExpanded(expanded === idx ? null : idx);
    if (expanded !== idx) fetchVerify(block);
  };

  if (!address) return null;

  const totalWon = ended.filter((b) => b.win).reduce((s, b) => s + (b.payout || 0), 0);
  const totalLost = ended.filter((b) => !b.win).reduce((s, b) => s + (b.stake || 0), 0);

  const liveSlice = liveBets.slice(livePage * PAGE_SIZE, livePage * PAGE_SIZE + PAGE_SIZE);
  const endedSlice = ended.slice(endedPage * PAGE_SIZE, endedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="your-bets">
      <div className="side-head"><Wallet2 size={15} /> Your Bets</div>

      <div className="yb-summary">
        <div className="yb-stat win">
          <span className="k">Won</span>
          <span className="v">◆ {totalWon.toFixed(4)}</span>
        </div>
        <div className="yb-stat loss">
          <span className="k">Lost</span>
          <span className="v">◆ {totalLost.toFixed(4)}</span>
        </div>
      </div>

      <div className="yb-tabs">
        <button className={`yb-tab ${tab === "live" ? "on" : ""}`} onClick={() => setTab("live")}>
          Live {liveBets.length > 0 && <span className="yb-pill">{liveBets.length}</span>}
        </button>
        <button className={`yb-tab ${tab === "ended" ? "on" : ""}`} onClick={() => setTab("ended")}>
          Ended {ended.length > 0 && <span className="yb-pill">{ended.length}</span>}
        </button>
      </div>

      {tab === "live" && (
        <div className="yb-list">
          {liveBets.length === 0 ? (
            <div className="yb-empty">
              <div className="yb-empty-t">No live bets</div>
              <div className="yb-empty-s">Place a bet on an open round to track it here.</div>
            </div>
          ) : (
            liveSlice.map((b, i) => {
              const r = rounds.find((x) => x.id === b.roundId);
              const ms = r ? Math.max(0, r.settleAt - now) : 0;
              const meta = MODE_MAP[b.mode];
              return (
                <div className="yb-live-card" key={`${b.roundId}-${b.mode}-${b.pick}-${i}`}>
                  <div className="yb-live-top">
                    <span className="yb-mode">{meta?.label ?? b.mode}</span>
                    <span className="yb-pending"><Clock size={10} /> Pending · {fmtClock(ms)}</span>
                  </div>
                  <div className="yb-live-row">
                    <span><i>Picked</i> <b className="mono">{b.pick.toUpperCase()}</b></span>
                    <span><i>Stake</i> <b>◆ {b.stake.toFixed(4)}</b></span>
                  </div>
                </div>
              );
            })
          )}
          {liveBets.length > PAGE_SIZE && (
            <Pager page={livePage} totalPages={liveTotalPages} onPage={setLivePage} />
          )}
        </div>
      )}

      {tab === "ended" && (
        <div className="yb-list">
          {ended.length === 0 ? (
            <div className="yb-empty">
              <div className="yb-empty-t">No bets yet</div>
              <div className="yb-empty-s">{loading ? "Loading…" : "Your settled bets will show up here."}</div>
            </div>
          ) : (
            endedSlice.map((b, idx) => {
              const i = endedPage * PAGE_SIZE + idx;
              const isOpen = expanded === i;
              const meta = MODE_MAP[b.mode];
              const v = verifyCache[b.block];
              const sig = v?.block ? deriveSignals(v.block) : null;
              let actual: React.ReactNode = "—";
              if (sig) {
                switch (b.mode) {
                  case "coinflip": actual = sig.even ? "EVEN" : "ODD"; break;
                  case "hilo": actual = sig.hilo.toUpperCase(); break;
                  case "digit": actual = sig.digit.toUpperCase(); break;
                  case "number": actual = sig.mod100; break;
                  case "txou": actual = sig.txou.toUpperCase(); break;
                  case "gasou": actual = sig.gasou.toUpperCase(); break;
                  case "closest": actual = sig.mod1000; break;
                  case "perfectblock": actual = `#${Number(v.block.number).toLocaleString()}`; break;
                }
              }
              return (
                <div key={i} className={`yb-ended ${b.win ? "win" : "loss"} ${isOpen ? "open" : ""}`}>
                  <button className="yb-ended-row" onClick={() => toggle(i, b.block)}>
                    <span className="yb-block mono">#{b.block}</span>
                    <span className="yb-mode-sm">{meta?.label ?? b.mode}</span>
                    <span className={`yb-result ${b.win ? "win" : "loss"}`}>{b.win ? "WIN" : "LOSS"}</span>
                    <span className="yb-pay mono">◆ {(b.win ? b.payout : 0).toFixed(4)}</span>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {isOpen && (
                    <div className="yb-detail">
                      <div className="yb-d-row"><i>Block</i><b className="mono">#{b.block}</b></div>
                      {v?.block?.hash && (
                        <div className="yb-d-row"><i>Hash</i><b className="mono yb-hash">{v.block.hash}</b></div>
                      )}
                      <div className="yb-d-row"><i>Mode</i><b>{meta?.label ?? b.mode}</b></div>
                      <div className="yb-d-row"><i>Your pick</i><b className="mono">{b.pick.toUpperCase()}</b></div>
                      <div className="yb-d-row"><i>Signal</i><b className="mono">{String(actual)}</b></div>
                      <div className="yb-d-row"><i>Stake</i><b className="mono">◆ {b.stake.toFixed(4)}</b></div>
                      <div className="yb-d-row">
                        <i>Result</i>
                        <b className={b.win ? "win-t" : "loss-t"}>
                          {b.win ? `WIN · +◆ ${b.payout.toFixed(4)}` : `LOSS · −◆ ${b.stake.toFixed(4)}`}
                        </b>
                      </div>
                      <a
                        className="yb-verify"
                        href={`${EXPLORER}/block/${b.block}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={12} /> Verify on chain
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {ended.length > PAGE_SIZE && (
            <Pager page={endedPage} totalPages={endedTotalPages} onPage={setEndedPage} />
          )}
        </div>
      )}
    </div>
  );
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (n: number) => void }) {
  const btn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: 8, background: "var(--panel-2)",
    border: "1px solid var(--line-2)", color: "#fff", cursor: "pointer",
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 8, paddingTop: 6,
    }}>
      <button
        style={{ ...btn, opacity: page <= 0 ? 0.35 : 1 }}
        disabled={page <= 0}
        onClick={() => onPage(Math.max(0, page - 1))}
        aria-label="Previous"
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{
        fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)",
      }}>{page + 1} / {totalPages}</span>
      <button
        style={{ ...btn, opacity: page >= totalPages - 1 ? 0.35 : 1 }}
        disabled={page >= totalPages - 1}
        onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
        aria-label="Next"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
