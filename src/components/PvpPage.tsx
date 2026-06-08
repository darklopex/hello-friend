import React from "react";
import { ArrowLeft, Shield, History, Wallet2, X, Lock } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import CoinImg from "./Coin";

const API = "https://lit-api.test-hub.xyz";
const TILES = 30;

type Status = {
  round_id: number;
  status: "open" | "locked";
  time_left_ms: number;
  total_pool: number;
  drand_target_round: number | string;
  drand_verify_url: string;
};

type MyBet = { round_id: number; tile: number; amount: number };
type EndedRound = {
  round_id: number;
  winning_tile: number;
  drand_verify_url?: string;
  drand_round?: number | string;
};

function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

// polar → cartesian for SVG segment paths
function pt(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}
function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number) {
  const [x0, y0] = pt(cx, cy, rOuter, a0);
  const [x1, y1] = pt(cx, cy, rOuter, a1);
  const [x2, y2] = pt(cx, cy, rInner, a1);
  const [x3, y3] = pt(cx, cy, rInner, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3} Z`;
}

export default function PvpPage({ onBack }: { onBack: () => void }) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const addr = isConnected && address ? address.toLowerCase() : null;

  const [status, setStatus] = React.useState<Status | null>(null);
  const [statusFetchedAt, setStatusFetchedAt] = React.useState<number>(Date.now());
  const [history, setHistory] = React.useState<EndedRound[]>([]);
  const [myBets, setMyBets] = React.useState<MyBet[]>([]);
  const [selectedTile, setSelectedTile] = React.useState<number | null>(null);
  const [amount, setAmount] = React.useState("0.01");
  const [placing, setPlacing] = React.useState(false);
  const [betError, setBetError] = React.useState<string | null>(null);
  const [resolveModal, setResolveModal] = React.useState<EndedRound | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [spinAngle, setSpinAngle] = React.useState(0);
  const [stopOnTile, setStopOnTile] = React.useState<number | null>(null);

  const prevRoundRef = React.useRef<number | null>(null);

  // tick for countdown
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // poll status every 3s
  const loadStatus = React.useCallback(async () => {
    try {
      const r = await fetch(`${API}/bets/status`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setStatus(j);
      setStatusFetchedAt(Date.now());
    } catch { /* */ }
  }, []);
  React.useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 3000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // poll history every 10s
  const loadHistory = React.useCallback(async () => {
    try {
      const r = await fetch(`${API}/bets/history`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const arr: EndedRound[] = Array.isArray(j) ? j : (j.history || j.rounds || []);
      setHistory(arr.slice(0, 10));
    } catch { /* */ }
  }, []);
  React.useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, 10000);
    return () => clearInterval(id);
  }, [loadHistory]);

  // poll user's bets when connected
  const loadMyBets = React.useCallback(async () => {
    if (!addr) { setMyBets([]); return; }
    try {
      const r = await fetch(`${API}/bets/wallet/${addr}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const arr: MyBet[] = Array.isArray(j) ? j : (j.bets || []);
      setMyBets(arr);
    } catch { /* */ }
  }, [addr]);
  React.useEffect(() => {
    loadMyBets();
    const id = setInterval(loadMyBets, 3000);
    return () => clearInterval(id);
  }, [loadMyBets]);

  // detect round change → show resolve modal w/ last winner
  React.useEffect(() => {
    if (!status) return;
    if (prevRoundRef.current == null) { prevRoundRef.current = status.round_id; return; }
    if (prevRoundRef.current !== status.round_id) {
      const last = history[0];
      if (last && last.round_id === prevRoundRef.current) {
        triggerSpinTo(last.winning_tile, last);
      }
      prevRoundRef.current = status.round_id;
    }
  }, [status, history]);

  // wheel slow spin while open
  React.useEffect(() => {
    if (stopOnTile != null) return;
    if (status?.status !== "open") return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last; last = t;
      setSpinAngle((a) => (a + dt * 0.02) % 360); // slow drift
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [status?.status, stopOnTile]);

  function triggerSpinTo(tile: number, ended: EndedRound) {
    // spin a few rotations then land
    const segDeg = 360 / TILES;
    // center of tile i is at angle (i-1)*segDeg + segDeg/2 from top
    const target = -(((tile - 1) * segDeg) + segDeg / 2) + 360 * 6;
    setStopOnTile(tile);
    setSpinAngle(target);
    setTimeout(() => {
      setResolveModal(ended);
    }, 3200);
    setTimeout(() => {
      setStopOnTile(null);
      setResolveModal(null);
      setSpinAngle(0);
    }, 8200);
  }

  // derived
  const timeLeftMs = status
    ? Math.max(0, status.time_left_ms - (Date.now() - statusFetchedAt))
    : 0;
  const isLocked = status?.status === "locked" || timeLeftMs < 30_000;
  const isOpen = status?.status === "open" && timeLeftMs >= 30_000;
  const myBetsThisRound = myBets.filter((b) => status && b.round_id === status.round_id);
  const myTilesThisRound = new Set(myBetsThisRound.map((b) => b.tile));

  const onSegmentClick = (tile: number) => {
    if (!addr) { openConnectModal?.(); return; }
    if (isLocked) return;
    if (myTilesThisRound.has(tile)) {
      setBetError("Already bet on this tile");
      setSelectedTile(tile);
      return;
    }
    setBetError(null);
    setSelectedTile(tile);
    setAmount("0.01");
  };

  const placeBet = async () => {
    if (selectedTile == null || !addr) return;
    if (myTilesThisRound.has(selectedTile)) { setBetError("Already bet on this tile"); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setBetError("Enter a valid amount"); return; }
    setPlacing(true); setBetError(null);
    try {
      const r = await fetch(`${API}/bets/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: addr, tile: selectedTile, amount: amt }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) { setBetError(j?.error || `http_${r.status}`); }
      else {
        setSelectedTile(null);
        loadMyBets();
        loadStatus();
      }
    } catch (e: any) {
      setBetError(e?.message || "Failed to place bet");
    } finally { setPlacing(false); }
  };

  // wheel geometry
  const SIZE = 560;
  const cx = SIZE / 2, cy = SIZE / 2;
  const rOuter = 250;
  const rInner = 110;
  const segDeg = 360 / TILES;

  return (
    <div className="app zone-mode" style={{ minHeight: "100vh" }}>
      <div className="topbar">
        <div className="logo" style={{ cursor: "pointer" }} onClick={onBack}>
          <img src="https://raw.githubusercontent.com/dopedopex/your-friendly-helper/main/logo.png" alt="" width={36} height={36} style={{ borderRadius: 10, objectFit: "cover" }} />
          <div><h1>Bets<b>On</b>Block</h1></div>
        </div>
        <div style={{ flex: 1 }} />
        <div className="top-right">
          <div className="live-head"><span className="pulse" /> PVP <b className="mono" style={{ marginLeft: 4 }}>#{status?.round_id ?? "…"}</b></div>
        </div>
      </div>

      <div className="wrap">
        <button className="back-link" onClick={onBack}><ArrowLeft size={14} /> Back to home</button>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h1 className="page-title">PVP Wheel</h1>
            <p className="page-sub">Bet on tiles 1–30. Drand decides the winner. One bet per tile per round.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 22, alignItems: "start" }}>
          {/* WHEEL */}
          <div style={{
            background: "#fff", border: "4px solid #000", borderRadius: 18,
            boxShadow: "8px 8px 0 0 #000", padding: 24,
            display: "flex", justifyContent: "center", alignItems: "center",
            position: "relative", minHeight: 600,
          }}>
            {/* pointer */}
            <div style={{
              position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "16px solid transparent", borderRight: "16px solid transparent",
              borderTop: "26px solid #000", zIndex: 5,
            }} />

            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ maxWidth: "100%", height: "auto" }}>
              <g
                style={{
                  transformOrigin: `${cx}px ${cy}px`,
                  transform: `rotate(${spinAngle}deg)`,
                  transition: stopOnTile != null
                    ? "transform 3s cubic-bezier(.16,.84,.3,1)"
                    : "none",
                }}
              >
                {Array.from({ length: TILES }, (_, i) => {
                  const tile = i + 1;
                  const a0 = i * segDeg;
                  const a1 = a0 + segDeg;
                  const mine = myTilesThisRound.has(tile);
                  const isWinner = stopOnTile === tile;
                  const base = i % 2 === 0 ? "#fff7ed" : "#fde68a";
                  const fill = isWinner ? "#22c55e" : mine ? "#3b82f6" : base;
                  const [tx, ty] = pt(cx, cy, (rOuter + rInner) / 2, a0 + segDeg / 2);
                  return (
                    <g key={tile} onClick={() => onSegmentClick(tile)} style={{ cursor: isLocked ? "not-allowed" : "pointer" }}>
                      <path
                        d={arcPath(cx, cy, rOuter, rInner, a0, a1)}
                        fill={fill}
                        stroke="#000"
                        strokeWidth={2}
                      />
                      <text
                        x={tx} y={ty}
                        textAnchor="middle" dominantBaseline="central"
                        fontFamily="'JetBrains Mono',monospace"
                        fontWeight={900}
                        fontSize={18}
                        fill={mine || isWinner ? "#fff" : "#0a0a0a"}
                        style={{ pointerEvents: "none" }}
                        transform={`rotate(${a0 + segDeg / 2}, ${tx}, ${ty})`}
                      >
                        {tile}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* center disc */}
              <circle cx={cx} cy={cy} r={rInner - 4} fill="#0a0a0a" stroke="#000" strokeWidth={3} />
              <text x={cx} y={cy - 14} textAnchor="middle"
                fill="#fff7ed" fontFamily="'Space Grotesk',system-ui,sans-serif"
                fontSize={11} fontWeight={800} letterSpacing={2}>TOTAL POOL</text>
              <text x={cx} y={cy + 16} textAnchor="middle"
                fill="#fde047" fontFamily="'JetBrains Mono',monospace"
                fontSize={28} fontWeight={900}>
                {(status?.total_pool ?? 0).toFixed(2)}
              </text>
              <text x={cx} y={cy + 38} textAnchor="middle"
                fill="#fff7ed" fontFamily="'Space Grotesk',system-ui,sans-serif"
                fontSize={10} fontWeight={700} letterSpacing={2}>zkLTC</text>
            </svg>

            {isLocked && (
              <div style={{
                position: "absolute", top: 24, right: 24,
                background: "#ef4444", color: "#fff",
                border: "3px solid #000", borderRadius: 10,
                boxShadow: "4px 4px 0 0 #000",
                padding: "8px 14px", fontFamily: "'Space Grotesk',system-ui,sans-serif",
                fontWeight: 900, letterSpacing: ".14em",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                <Lock size={14} /> LOCKED
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Countdown / round */}
            <div style={{
              background: "#fff", border: "3px solid #000", borderRadius: 14,
              boxShadow: "5px 5px 0 0 #000", padding: 18,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#6b7280", fontWeight: 800 }}>Round</span>
                <span className="mono" style={{ color: "#0a0a0a", fontWeight: 900, fontSize: 14 }}>#{status?.round_id ?? "—"}</span>
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontWeight: 900, fontSize: 42, textAlign: "center",
                color: isLocked ? "#ef4444" : "#16a34a",
                textShadow: isLocked ? "0 0 12px rgba(239,68,68,.4)" : "0 0 12px rgba(22,163,74,.3)",
                lineHeight: 1,
              }}>
                {fmtClock(timeLeftMs)}
              </div>
              <div style={{ textAlign: "center", marginTop: 6, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: isLocked ? "#ef4444" : "#16a34a", fontWeight: 800 }}>
                {isLocked ? "Locking — no new bets" : "Open — place your bets"}
              </div>
            </div>

            {/* Drand */}
            <div style={{
              background: "#fff7ed", border: "3px solid #000", borderRadius: 14,
              boxShadow: "5px 5px 0 0 #000", padding: 14,
            }}>
              <div style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#6b7280", fontWeight: 800, marginBottom: 6 }}>
                <Shield size={11} style={{ verticalAlign: "middle", marginRight: 4 }} /> Drand Target
              </div>
              <div className="mono" style={{ color: "#0a0a0a", fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
                #{status?.drand_target_round ?? "—"}
              </div>
              {status?.drand_verify_url && (
                <a href={status.drand_verify_url} target="_blank" rel="noreferrer"
                  className="verify-btn" style={{ display: "inline-flex", textDecoration: "none" }}>
                  Verify on Drand
                </a>
              )}
            </div>

            {/* My bets */}
            <div style={{
              background: "#fff", border: "3px solid #000", borderRadius: 14,
              boxShadow: "5px 5px 0 0 #000", padding: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "#0a0a0a", fontWeight: 900, marginBottom: 10 }}>
                <Wallet2 size={13} /> My Bets · Round
              </div>
              {!addr && <div style={{ fontSize: 12, color: "#6b7280" }}>Connect wallet to bet.</div>}
              {addr && myBetsThisRound.length === 0 && <div style={{ fontSize: 12, color: "#6b7280" }}>No bets yet this round.</div>}
              {myBetsThisRound.map((b) => (
                <div key={b.tile} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", background: "#eff6ff", border: "2px solid #000",
                  borderRadius: 8, marginBottom: 6, fontFamily: "'JetBrains Mono',monospace",
                  fontWeight: 800, fontSize: 13,
                }}>
                  <span style={{ color: "#3b82f6" }}>Tile #{b.tile}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#0a0a0a" }}>
                    <CoinImg size={12} /> {Number(b.amount).toFixed(3)}
                  </span>
                </div>
              ))}
            </div>

            {/* Ended Rounds */}
            <div style={{
              background: "#fff", border: "3px solid #000", borderRadius: 14,
              boxShadow: "5px 5px 0 0 #000", padding: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "#0a0a0a", fontWeight: 900, marginBottom: 10 }}>
                <History size={13} /> Ended Rounds
              </div>
              {history.length === 0 && <div style={{ fontSize: 12, color: "#6b7280" }}>No settled rounds yet.</div>}
              {history.map((r) => (
                <div key={r.round_id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#fafafa", border: "2px solid #000", borderRadius: 8,
                  padding: "8px 10px", marginBottom: 6, gap: 8,
                }}>
                  <span className="mono" style={{ color: "#0a0a0a", fontWeight: 900, fontSize: 12 }}>
                    #{r.round_id}
                  </span>
                  <span style={{
                    background: "#22c55e", color: "#04130a", border: "2px solid #000",
                    borderRadius: 7, padding: "3px 9px", fontFamily: "'JetBrains Mono',monospace",
                    fontWeight: 900, fontSize: 12,
                  }}>
                    Tile {r.winning_tile}
                  </span>
                  {r.drand_verify_url && (
                    <a href={r.drand_verify_url} target="_blank" rel="noreferrer"
                      className="verify-btn" style={{ textDecoration: "none", fontSize: 11, padding: "5px 10px" }}>
                      Verify
                    </a>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {/* BET MODAL */}
      {selectedTile != null && (
        <div className="modal-bg" onClick={() => !placing && setSelectedTile(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{
            background: "#fff", color: "#0a0a0a", border: "4px solid #000",
            boxShadow: "8px 8px 0 0 #000", maxWidth: 420,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ color: "#0a0a0a", fontWeight: 900 }}>Tile #{selectedTile}</h3>
              <button onClick={() => !placing && setSelectedTile(null)}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "#0a0a0a" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ color: "#374151", fontSize: 13, marginBottom: 14 }}>
              Enter the amount in zkLTC you want to bet on this tile.
            </div>

            <label style={{ color: "#374151" }}>Amount (zkLTC)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setBetError(null); }}
              disabled={placing || isLocked}
              style={{
                background: "#fafafa", color: "#0a0a0a",
                border: "3px solid #000", borderRadius: 10,
                padding: "12px 14px", fontFamily: "'JetBrains Mono',monospace",
                fontWeight: 900, fontSize: 18,
              }}
            />

            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {["0.01", "0.05", "0.1", "0.5"].map((v) => (
                <button key={v}
                  onClick={() => setAmount(v)}
                  style={{
                    background: "#fff7ed", color: "#0a0a0a",
                    border: "2px solid #000", borderRadius: 8, padding: "6px 12px",
                    fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 12,
                    boxShadow: "2px 2px 0 0 #000", cursor: "pointer",
                  }}>{v}</button>
              ))}
            </div>

            {betError && (
              <div style={{
                marginTop: 12, padding: "10px 12px", borderRadius: 8,
                background: "#fee2e2", border: "2px solid #ef4444",
                color: "#991b1b", fontWeight: 700, fontSize: 13,
              }}>{betError}</div>
            )}

            {isLocked && (
              <div style={{
                marginTop: 12, padding: "10px 12px", borderRadius: 8,
                background: "#fee2e2", border: "2px solid #ef4444",
                color: "#991b1b", fontWeight: 800, fontSize: 13,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}><Lock size={14} /> Round is locked</div>
            )}

            <button
              onClick={placeBet}
              disabled={placing || isLocked || myTilesThisRound.has(selectedTile)}
              style={{
                width: "100%", marginTop: 16,
                background: "#22c55e", color: "#04130a",
                border: "3px solid #000", borderRadius: 12,
                padding: "14px", fontFamily: "'Space Grotesk',system-ui,sans-serif",
                fontWeight: 900, fontSize: 15, letterSpacing: ".04em",
                textTransform: "uppercase", cursor: "pointer",
                boxShadow: "5px 5px 0 0 #000",
                opacity: (placing || isLocked || myTilesThisRound.has(selectedTile)) ? 0.5 : 1,
              }}
            >
              {placing ? "Placing…" : "Place Bet"}
            </button>
          </div>
        </div>
      )}

      {/* RESOLVE MODAL */}
      {resolveModal && (
        <div className="modal-bg">
          <div className="modal" style={{
            background: "#fff", color: "#0a0a0a", border: "4px solid #000",
            boxShadow: "8px 8px 0 0 #000", maxWidth: 460, textAlign: "center",
          }}>
            <div style={{
              fontSize: 11, letterSpacing: ".22em", color: "#6b7280", fontWeight: 800,
            }}>ROUND #{resolveModal.round_id} RESULT</div>
            <div style={{
              fontFamily: "'Space Grotesk',system-ui,sans-serif",
              fontSize: 40, fontWeight: 900, color: "#16a34a",
              margin: "10px 0 6px",
            }}>
              Tile {resolveModal.winning_tile} Wins! 🎉
            </div>
            {(() => {
              const myWin = myBets.find(
                (b) => b.round_id === resolveModal.round_id && b.tile === resolveModal.winning_tile,
              );
              if (myWin) {
                return (
                  <div style={{
                    background: "#dcfce7", border: "3px solid #000", borderRadius: 10,
                    padding: "12px", margin: "10px 0",
                    fontFamily: "'JetBrains Mono',monospace", fontWeight: 900, color: "#04130a",
                  }}>
                    You won on tile {myWin.tile} ({Number(myWin.amount).toFixed(3)} zkLTC bet)
                  </div>
                );
              }
              return (
                <div style={{ color: "#6b7280", fontSize: 13, margin: "10px 0 14px" }}>
                  Better luck next round.
                </div>
              );
            })()}
            {resolveModal.drand_verify_url && (
              <a href={resolveModal.drand_verify_url} target="_blank" rel="noreferrer"
                className="verify-btn" style={{ display: "inline-flex", textDecoration: "none" }}>
                <Shield size={12} style={{ marginRight: 6 }} /> Verify on Drand
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}