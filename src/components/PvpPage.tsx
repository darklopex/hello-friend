import React from "react";
import { ArrowLeft, Shield, History, Wallet2, X, Lock, ExternalLink } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import CoinImg from "./Coin";
import PvpWheelVisual from "./PvpWheelVisual";

const API = "https://lit-api.test-hub.xyz";
const TILES = 30;

type Status = {
  round_id: number;
  status: "open" | "locked" | "cooldown";
  time_left_ms: number;
  total_pool: number;
  drand_target_round: number | string;
  drand_verify_url: string;
  cooldown_ms?: number;
  next_round_at?: number;
};

type MyBet = { round_id: number; tile: number; amount: number };
type EndedRound = {
  round_id: number;
  winning_tile: number;
  drand_verify_url?: string;
  drand_round?: number | string;
};

type RoundDetails = {
  round_id: number;
  winning_tile: number;
  drand_randomness?: string;
  drand_target_round?: number | string;
  drand_verify_url?: string;
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
  const [verifyModal, setVerifyModal] = React.useState<{ loading: boolean; data: RoundDetails | null; error?: string; round_id: number } | null>(null);
  const [endedOverlay, setEndedOverlay] = React.useState<EndedRound | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [spinAngle, setSpinAngle] = React.useState(0);
  const [stopOnTile, setStopOnTile] = React.useState<number | null>(null);
  const [lastResolvedRound, setLastResolvedRound] = React.useState<EndedRound | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = React.useState<number>(0);
  const [spinInKey, setSpinInKey] = React.useState<number>(0);
  const [toast, setToast] = React.useState<string | null>(null);

  const prevRoundRef = React.useRef<number | null>(null);
  const prevStatusRef = React.useRef<string | null>(null);

  // tick for countdown
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // poll status every 2s
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
    const id = setInterval(loadStatus, 2000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // poll history every 10s
  const loadHistory = React.useCallback(async () => {
    try {
      const r = await fetch(`${API}/bets/history`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const arr: EndedRound[] = Array.isArray(j) ? j : (j.history || j.rounds || []);
      const normalized = arr.map((r: any) => ({
        round_id: r.round_id ?? r.id ?? r.roundId,
        winning_tile: r.winning_tile,
        drand_verify_url: r.drand_verify_url,
        drand_round: r.drand_target_round ?? r.drand_round,
      }));
      setHistory(normalized.slice(0, 10));
      if (normalized[0]) setLastResolvedRound((prev) => prev?.round_id === normalized[0].round_id ? prev : normalized[0]);
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
        setLastResolvedRound(last);
      }
      prevRoundRef.current = status.round_id;
    }
  }, [status, history]);

  // cooldown countdown + status transitions
  React.useEffect(() => {
    if (!status) return;
    const prev = prevStatusRef.current;
    if (status.status === "cooldown") {
      const ms = status.cooldown_ms ?? (status.next_round_at ? status.next_round_at - Date.now() : 0);
      setCooldownSeconds(Math.max(0, Math.ceil(ms / 1000)));
    } else if (prev === "cooldown" && status.status === "open") {
      setCooldownSeconds(0);
      setSpinInKey((k) => k + 1);
      setToast(`🎲 Round #${status.round_id} Started — Place Your Bets!`);
      setTimeout(() => setToast(null), 3500);
    }
    prevStatusRef.current = status.status;
  }, [status]);

  // tick cooldown each second
  React.useEffect(() => {
    if (status?.status !== "cooldown") return;
    const id = setInterval(() => {
      setCooldownSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [status?.status, status?.round_id]);

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
      setEndedOverlay(ended);
    }, 3200);
    setTimeout(() => {
      setStopOnTile(null);
      setEndedOverlay(null);
      setSpinAngle(0);
    }, 7200);
  }

  async function openVerify(round_id: number) {
    setVerifyModal({ loading: true, data: null, round_id });
    try {
      const r = await fetch(`${API}/bets/round/${round_id}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`http_${r.status}`);
      const j = await r.json();
      setVerifyModal({ loading: false, data: j, round_id });
    } catch (e: any) {
      setVerifyModal({ loading: false, data: null, error: e?.message || "Failed to load", round_id });
    }
  }

  // derived
  const timeLeftMs = status
    ? Math.max(0, status.time_left_ms - (Date.now() - statusFetchedAt))
    : 0;
  const isLocked = status?.status === "locked";
  const isOpen = status?.status === "open";
  const isCooldown = status?.status === "cooldown";
  const myBetsThisRound = myBets.filter((b) => status && b.round_id === status.round_id);
  const myTilesThisRound = new Set(myBetsThisRound.map((b) => b.tile));

  const onSegmentClick = (tile: number) => {
    if (!addr) { openConnectModal?.(); return; }
    if (isLocked || isCooldown) return;
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

  // approximate total round window for progress bar — use whatever we last saw
  const totalRoundMsRef = React.useRef<number>(60000);
  React.useEffect(() => {
    if (status?.status === "open" && status.time_left_ms > totalRoundMsRef.current) {
      totalRoundMsRef.current = status.time_left_ms;
    }
  }, [status]);
  const cooldownMsLeft = isCooldown
    ? Math.max(0, (status?.cooldown_ms ?? cooldownSeconds * 1000))
    : 0;

  return (
    <div className="app zone-mode" style={{ minHeight: "100vh" }}>
      <style>{`@keyframes pvpSpinIn { from { transform: rotate(-360deg); } to { transform: rotate(0); } }`}</style>
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
            background: "radial-gradient(ellipse at center, #0f0f12 0%, #050507 75%)",
            border: "1px solid rgba(255,255,255,.08)", borderRadius: 22,
            boxShadow: "0 30px 60px -20px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.02)",
            padding: 24,
            display: "flex", justifyContent: "center", alignItems: "center",
            position: "relative", minHeight: 600,
          }}>
            <PvpWheelVisual
              size={SIZE}
              tiles={TILES}
              roundId={status?.round_id ?? null}
              timeLeftMs={isCooldown ? 0 : timeLeftMs}
              totalRoundMs={totalRoundMsRef.current}
              isOpen={isOpen}
              isLocked={isLocked}
              isCooldown={isCooldown}
              cooldownMs={cooldownMsLeft || cooldownSeconds * 1000}
              players={myBets.filter((b) => b.round_id === status?.round_id).length}
              pot={status?.total_pool ?? 0}
              winningTile={lastResolvedRound?.winning_tile ?? null}
              myTiles={myTilesThisRound}
              onTileClick={onSegmentClick}
            />

            {endedOverlay && (
              <div style={{
                position: "absolute", inset: 0, display: "grid", placeItems: "center",
                background: "rgba(0,0,0,.55)", borderRadius: 14, zIndex: 10,
              }}>
                <div style={{
                  background: "#fff", border: "4px solid #000", borderRadius: 14,
                  boxShadow: "8px 8px 0 0 #000", padding: "18px 22px",
                  textAlign: "center", minWidth: 280,
                }}>
                  <div style={{ fontSize: 11, letterSpacing: ".22em", color: "#6b7280", fontWeight: 800 }}>
                    ROUND #{endedOverlay.round_id} ENDED
                  </div>
                  <div style={{
                    fontFamily: "'Space Grotesk',system-ui,sans-serif",
                    fontSize: 28, fontWeight: 900, color: "#16a34a",
                    margin: "8px 0 4px",
                  }}>
                    🏆 Tile {endedOverlay.winning_tile} Wins!
                  </div>
                  <div style={{ fontSize: 11, letterSpacing: ".16em", color: "#6b7280", fontWeight: 800, textTransform: "uppercase" }}>
                    New Round Starting…
                  </div>
                </div>
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
                color: isCooldown ? "#00d4ff" : isLocked ? "#ef4444" : "#16a34a",
                textShadow: isCooldown ? "0 0 12px rgba(0,212,255,.4)" : isLocked ? "0 0 12px rgba(239,68,68,.4)" : "0 0 12px rgba(22,163,74,.3)",
                lineHeight: 1,
              }}>
                {isCooldown ? `0:${cooldownSeconds.toString().padStart(2, "0")}` : fmtClock(timeLeftMs)}
              </div>
              <div style={{ textAlign: "center", marginTop: 6, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: isCooldown ? "#00d4ff" : isLocked ? "#ef4444" : "#16a34a", fontWeight: 800 }}>
                {isCooldown ? "Cooldown — next round soon" : isLocked ? "Locking — no new bets" : "Open — place your bets"}
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
                  <button onClick={() => openVerify(r.round_id)}
                    className="verify-btn" style={{ fontSize: 11, padding: "5px 10px", cursor: "pointer" }}>
                    Verify
                  </button>
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

      {/* VERIFY MODAL */}
      {verifyModal && (
        <div className="modal-bg" onClick={() => setVerifyModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <Shield size={18} style={{ display: "inline", marginRight: 8, verticalAlign: "-3px" }} />
              How this round resolved
            </h3>
            <p className="sub">
              Round #{verifyModal.round_id} — every step below is derived only from public Drand randomness, so you can re-run it yourself.
            </p>

            {verifyModal.loading && <div className="empty">Loading round #{verifyModal.round_id}…</div>}
            {verifyModal.error && <div className="warn">Could not load round #{verifyModal.round_id}: {verifyModal.error}</div>}

            {verifyModal.data && (() => {
              const d = verifyModal.data!;
              const rand = (d.drand_randomness || "").replace(/^0x/, "");
              let bigStr = "—", remStr = "—";
              try {
                if (rand) {
                  const big = BigInt("0x" + rand);
                  bigStr = big.toString();
                  remStr = (big % 30n).toString();
                }
              } catch { /* */ }
              const shortHex = rand.length > 40 ? rand.slice(0, 40) + "…" : rand;
              const shortBig = bigStr.length > 40 ? bigStr.slice(0, 40) + "…" : bigStr;
              const tile = d.winning_tile;
              return (
                <>
                  <PvpAccordion
                    name="PVP Tiles"
                    result={`Tile ${tile}`}
                    steps={[
                      [`Drand randomness (round #${d.drand_target_round ?? "—"})`, shortHex || "—"],
                      ["Convert hex → BigInt", shortBig],
                      ["BigInt % 30 (get 0-29)", remStr],
                      ["Add 1 (tiles are 1-30)", `${remStr} + 1 = ${tile}`],
                    ]}
                  />

                  {d.drand_verify_url && (
                    <a className="pf-btn" style={{ marginTop: 12 }}
                      href={d.drand_verify_url} target="_blank" rel="noreferrer">
                      Verify on Drand <ExternalLink size={11} />
                    </a>
                  )}
                </>
              );
            })()}

            <button className="modal-close" onClick={() => setVerifyModal(null)}>Close</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#0a0a0a", color: "#fde047",
          border: "3px solid #000", borderRadius: 12,
          boxShadow: "5px 5px 0 0 #000",
          padding: "12px 18px",
          fontFamily: "'Space Grotesk',system-ui,sans-serif",
          fontWeight: 900, fontSize: 14, letterSpacing: ".04em",
          zIndex: 1000,
          animation: "fade-in .3s ease-out",
        }}>{toast}</div>
      )}
    </div>
  );
}

function PvpAccordion({ name, result, steps }: { name: string; result: string; steps: Array<[string, string]> }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="pf-game">
      <button className="pf-game-head" onClick={() => setOpen((o) => !o)}>
        <span className="gn">{name}</span>
        <span className="gr">{result}</span>
        <span className={`chev ${open ? "o" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="pf-steps">
          {steps.map(([label, val], i) => (
            <div className="pf-step" key={i}>
              <span className="si">{i + 1}</span>
              <span className="sl">{label}</span>
              {val && <span className="sv">{val}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}