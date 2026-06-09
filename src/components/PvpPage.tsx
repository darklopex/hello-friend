import React from "react";
import { ArrowLeft, Shield, History, Wallet2, X, Lock, ExternalLink } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import CoinImg from "./Coin";
import PvpWheelVisual from "./PvpWheelVisual";
import { sounds } from "../lib/pvpSounds";

const API = "https://lit-api.test-hub.xyz";
const STATUS_URL = `${API}/bets/status`;
const HISTORY_URL = `${API}/bets/history`;
const PLACE_URL = `${API}/bets/place`;
const TILES = 30;

type Status = {
  round_id?: number | null;
  status: "open" | "locked" | "cooldown" | "starting";
  time_left_ms?: number;
  total_pool?: number;
  drand_target_round?: number | string;
  drand_verify_url?: string;
  cooldown_ms?: number;
  next_round_at?: number;
};

type MyBet = { round_id: number; tile: number; amount: number };
type EndedRound = {
  round_id: number;
  winning_tile: number;
  status?: string;
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

function numOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validWinningTile(value: unknown) {
  const n = numOrNull(value);
  if (n == null || n < 1 || n > TILES) return null;
  return n;
}

function normalizeEndedRound(raw: any): EndedRound | null {
  const roundId = numOrNull(raw?.round_id ?? raw?.id ?? raw?.roundId);
  const winningTile = validWinningTile(raw?.winning_tile);
  const status = String(raw?.status ?? "").toLowerCase();
  const isResolved = status === "resolved" || status === "settled" || status === "complete";
  if (roundId == null || winningTile == null || (status && !isResolved)) return null;
  return {
    round_id: roundId,
    winning_tile: winningTile,
    status,
    drand_verify_url: raw?.drand_verify_url,
    drand_round: raw?.drand_target_round ?? raw?.drand_round,
  };
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
  const [, setNow] = React.useState(Date.now());
  const [lastResolvedRound, setLastResolvedRound] = React.useState<EndedRound | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = React.useState<number>(0);
  const [toast, setToast] = React.useState<string | null>(null);
  const [animationWinner, setAnimationWinner] = React.useState<EndedRound | null>(null);

  const prevRoundRef = React.useRef<number | null>(null);
  const prevStatusRef = React.useRef<string | null>(null);
  const pendingAnimationRoundRef = React.useRef<number | null>(null);
  const animationTriggeredRoundRef = React.useRef<number | null>(null);
  const activeStatusRef = React.useRef<string | null>(null);
  const activeRoundRef = React.useRef<number | null>(null);
  const historyRetryTimerRef = React.useRef<number | null>(null);
  const zeroHoldTimerRef = React.useRef<number | null>(null);
  const zeroHoldCallbacksRef = React.useRef<Array<() => void>>([]);
  const visibleRoundEndsAtRef = React.useRef<number>(0);

  // tick for countdown
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const unlockAudio = () => sounds.unlock();
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // poll status every 1s (fast enough to catch short cooldown window)
  const lastPollStatusRef = React.useRef<string | null>(null);
  const lastPollRoundRef = React.useRef<number | null>(null);
  const loadHistoryRef = React.useRef<(roundId?: number | null) => void>(() => {});
  const clearHistoryRetry = React.useCallback(() => {
    if (historyRetryTimerRef.current != null) {
      window.clearTimeout(historyRetryTimerRef.current);
      historyRetryTimerRef.current = null;
    }
  }, []);
  const startAnimationForWinner = React.useCallback((winner: EndedRound, reason: string) => {
    const roundId = numOrNull(winner.round_id);
    const tile = validWinningTile(winner.winning_tile);
    if (roundId == null || tile == null) return false;
    if (animationTriggeredRoundRef.current === roundId) return false;
    const stableWinner = { ...winner, round_id: roundId, winning_tile: tile };
    console.log("[Animation] winner found — starting wheel animation", { ...stableWinner, reason });
    clearHistoryRetry();
    animationTriggeredRoundRef.current = roundId;
    pendingAnimationRoundRef.current = null;
    setAnimationWinner(stableWinner);
    setLastResolvedRound(stableWinner);
    return true;
  }, [clearHistoryRetry]);
  const scheduleWinnerRetry = React.useCallback((roundId: number) => {
    if (historyRetryTimerRef.current != null) return;
    historyRetryTimerRef.current = window.setTimeout(() => {
      historyRetryTimerRef.current = null;
      if (pendingAnimationRoundRef.current === roundId && animationTriggeredRoundRef.current !== roundId) {
        loadHistoryRef.current?.(roundId);
      }
    }, 650);
  }, []);
  const runAfterVisibleZero = React.useCallback((apiTimeLeftMs: unknown, fn: () => void) => {
    const visibleMsLeft = Math.max(0, visibleRoundEndsAtRef.current - Date.now());
    const apiMsLeft = Math.max(0, Number(apiTimeLeftMs) || 0);
    const msLeft = Math.max(visibleMsLeft, apiMsLeft);
    if (msLeft <= 0) {
      fn();
      return;
    }
    zeroHoldCallbacksRef.current.push(fn);
    if (zeroHoldTimerRef.current != null) return;
    zeroHoldTimerRef.current = window.setTimeout(() => {
      zeroHoldTimerRef.current = null;
      const callbacks = zeroHoldCallbacksRef.current.splice(0);
      callbacks.forEach((callback) => callback());
    }, msLeft + 120);
  }, []);
  const queueAnimationForRound = React.useCallback((roundId: number | null, reason: string) => {
    if (roundId == null) return;
    if (animationTriggeredRoundRef.current === roundId || pendingAnimationRoundRef.current === roundId) return;
    console.log("[Animation] queued round end", { roundId, reason });
    pendingAnimationRoundRef.current = roundId;
    loadHistoryRef.current?.(roundId);
  }, []);
  const loadStatus = React.useCallback(async () => {
    try {
      const r = await fetch(STATUS_URL, { cache: "no-store" });
      if (!r.ok) { console.error("[BetsOnBlock] status http", r.status); return; }
      const j = await r.json();
      const apiRoundId = numOrNull(j.round_id ?? j.id ?? j.roundId);
      const apiTimeLeftMs = Math.max(0, Number(j.time_left_ms) || 0);
      if (j.status === "open" && apiTimeLeftMs > 0) {
        visibleRoundEndsAtRef.current = Date.now() + apiTimeLeftMs;
      }
      console.log("[Poll]", j.status, "round:", apiRoundId ?? j.round_id, "time_left:", j.time_left_ms);

      const statusWinnerTile = validWinningTile(j.winning_tile ?? j.result?.winning_tile);
      if (apiRoundId != null && statusWinnerTile != null && j.status !== "open") {
        const winnerFromStatus = {
          round_id: apiRoundId,
          winning_tile: statusWinnerTile,
          status: String(j.status ?? "").toLowerCase(),
          drand_verify_url: j.drand_verify_url,
          drand_round: j.drand_target_round ?? j.drand_round,
        };
        runAfterVisibleZero(j.time_left_ms, () => startAnimationForWinner(winnerFromStatus, "status"));
      } else if (apiRoundId != null && j.status !== "open" && animationTriggeredRoundRef.current !== apiRoundId) {
        runAfterVisibleZero(j.time_left_ms, () => loadHistoryRef.current?.(apiRoundId));
      }

      const prevStatus = lastPollStatusRef.current;
      const prevRound = lastPollRoundRef.current;

      // TRIGGER 1: entering cooldown / new-round window. Do not queue on locked/verifying;
      // at that point drand often has not returned a winning tile yet.
      const enteringCooldown = j.status === "cooldown" && prevStatus !== "cooldown";
      // TRIGGER 2: round_id changed (previous round just ended)
      const roundChanged = prevRound != null && apiRoundId != null && prevRound !== apiRoundId;

      if (enteringCooldown || roundChanged) {
        const endedRoundId = roundChanged ? prevRound : (apiRoundId ?? prevRound);
        console.log("[Poll] round ended — fetching history for winner", { enteringCooldown, roundChanged, endedRoundId, prevRound, newRound: apiRoundId });
        if (roundChanged) {
          queueAnimationForRound(endedRoundId, "round-change");
        } else {
          runAfterVisibleZero(j.time_left_ms, () => queueAnimationForRound(endedRoundId, "cooldown"));
        }
      }

      lastPollStatusRef.current = j.status ?? null;
      activeStatusRef.current = j.status ?? null;
      activeRoundRef.current = apiRoundId;
      if (apiRoundId != null) lastPollRoundRef.current = apiRoundId;

      setStatus({
        ...j,
        round_id: apiRoundId ?? ((j.status === "locked" || j.status === "cooldown" || j.status === "starting") ? prevRound : null),
        time_left_ms: apiTimeLeftMs,
        total_pool: Number.isFinite(Number(j.total_pool)) ? Number(j.total_pool) : 0,
      });
      setStatusFetchedAt(Date.now());
    } catch (e) { console.error("[BetsOnBlock] status fetch error:", e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueAnimationForRound, runAfterVisibleZero, startAnimationForWinner]);
  React.useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 1000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // poll history every 10s
  const loadHistory = React.useCallback(async (targetRoundId?: number | null) => {
    try {
      const r = await fetch(HISTORY_URL, { cache: "no-store" });
      if (!r.ok) { console.error("[BetsOnBlock] history http", r.status); return; }
      const j = await r.json();
      console.log("[BetsOnBlock] history:", j);
      const arr: any[] = Array.isArray(j) ? j : (j.history || j.rounds || []);
      const normalized = arr
        .map(normalizeEndedRound)
        .filter((r): r is EndedRound => r != null)
        .sort((a, b) => b.round_id - a.round_id);
      setHistory(normalized.slice(0, 10));
      if (normalized[0]) setLastResolvedRound((prev) => prev?.round_id === normalized[0].round_id ? prev : normalized[0]);

      const wantedRound = targetRoundId ?? pendingAnimationRoundRef.current;
      const latestResolvedCurrentRound = normalized[0]?.round_id === activeRoundRef.current ? normalized[0] : null;
      const fallbackWinner = wantedRound == null && activeStatusRef.current !== "open"
        ? (latestResolvedCurrentRound ?? (activeStatusRef.current === "cooldown" ? normalized[0] : null))
        : null;
      const winner = wantedRound != null ? normalized.find((item) => item.round_id === wantedRound) : fallbackWinner;
      if (winner) {
        runAfterVisibleZero(0, () => startAnimationForWinner(winner, wantedRound != null ? "history-exact" : "history-latest"));
      } else if (wantedRound != null) {
        console.log("[Animation] winner not ready yet", { wantedRound });
        scheduleWinnerRetry(wantedRound);
      }
    } catch (e) { console.error("[BetsOnBlock] history fetch error:", e); }
  }, [runAfterVisibleZero, scheduleWinnerRetry, startAnimationForWinner]);
  React.useEffect(() => { loadHistoryRef.current = loadHistory; }, [loadHistory]);
  React.useEffect(() => () => {
    clearHistoryRetry();
    if (zeroHoldTimerRef.current != null) window.clearTimeout(zeroHoldTimerRef.current);
  }, [clearHistoryRetry]);
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

  // keep a stable previous round marker for UI fallbacks
  React.useEffect(() => {
    if (!status?.round_id) return;
    prevRoundRef.current = status.round_id;
  }, [status?.round_id]);

  // cooldown countdown + status transitions
  React.useEffect(() => {
    if (!status) return;
    const prev = prevStatusRef.current;
    if (status.status === "cooldown") {
      const ms = status.cooldown_ms ?? (status.next_round_at ? status.next_round_at - Date.now() : 0);
      setCooldownSeconds(Math.max(0, Math.ceil(ms / 1000)));
      if (prev !== "cooldown") loadHistory(status.round_id ?? prevRoundRef.current);
    } else if (prev === "cooldown" && status.status === "open") {
      setCooldownSeconds(0);
      setToast(`🎲 Round #${status.round_id} Started — Place Your Bets!`);
      setTimeout(() => setToast(null), 3500);
    }
    prevStatusRef.current = status.status;
  }, [status, loadHistory]);

  // tick cooldown each second
  React.useEffect(() => {
    if (status?.status !== "cooldown") return;
    const id = setInterval(() => {
      setCooldownSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [status?.status, status?.round_id]);

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
    ? Math.max(0, (status.time_left_ms ?? 0) - (Date.now() - statusFetchedAt))
    : 0;
  const visibleTimeLeftMs = Math.max(timeLeftMs, visibleRoundEndsAtRef.current - Date.now());
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
      const payload = { wallet: addr, tile: Number(selectedTile), amount: parseFloat(amount) };
      console.log("Bet payload:", payload);
      const r = await fetch(PLACE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        const msg = j?.error || `http_${r.status}`;
        setBetError(msg);
        setToast(`❌ ${msg}`);
        setTimeout(() => setToast(null), 3500);
      }
      else {
        sounds.betPlaced();
        setToast(`✅ Bet placed on Tile ${selectedTile}!`);
        setTimeout(() => setToast(null), 3500);
        setSelectedTile(null);
        loadMyBets();
        loadStatus();
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to place bet";
      setBetError(msg);
      setToast(`❌ ${msg}`);
      setTimeout(() => setToast(null), 3500);
    } finally { setPlacing(false); }
  };

  // wheel geometry
  const SIZE = 560;

  // approximate total round window for progress bar — use whatever we last saw
  const totalRoundMsRef = React.useRef<number>(60000);
  React.useEffect(() => {
    const apiTimeLeft = status?.time_left_ms ?? 0;
    if (status?.status === "open" && apiTimeLeft > totalRoundMsRef.current) {
      totalRoundMsRef.current = apiTimeLeft;
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
              timeLeftMs={visibleTimeLeftMs}
              totalRoundMs={totalRoundMsRef.current}
              isOpen={isOpen}
              isLocked={isLocked}
              isCooldown={isCooldown}
              cooldownMs={cooldownMsLeft || cooldownSeconds * 1000}
              players={myBets.filter((b) => b.round_id === status?.round_id).length}
              pot={status?.total_pool ?? 0}
              winningTile={animationWinner?.winning_tile ?? null}
              animationRoundId={animationWinner?.round_id ?? null}
              myTiles={myTilesThisRound}
              onTileClick={onSegmentClick}
              onAnimationComplete={() => {
                console.log("[Animation] completed", animationWinner);
                clearHistoryRetry();
                setAnimationWinner(null);
                pendingAnimationRoundRef.current = null;
                prevStatusRef.current = "";
                prevRoundRef.current = null;
              }}
            />

          </div>

          {/* SIDEBAR */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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