import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "";

export default function YourPointsModal({
  address, onClose,
}: { address: string; onClose: () => void }) {
  const [points, setPoints] = React.useState<number | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/points/${address}`);
        if (!r.ok) throw new Error("http_" + r.status);
        const j = await r.json();
        if (!alive) return;
        const v = typeof j.points === "number" ? j.points
                : typeof j.balance === "number" ? j.balance
                : typeof j === "number" ? j : 0;
        setPoints(v);
      } catch (e: any) {
        if (alive) setErr(e?.message || "failed");
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [address]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center",
        background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: .85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f5f5f5", color: "#0a0a0a", borderRadius: 18,
          border: "4px solid #000", boxShadow: "10px 10px 0 0 rgba(0,0,0,.9)",
          width: "min(440px,100%)", padding: 30, position: "relative",
          fontFamily: "'Space Grotesk',system-ui,sans-serif",
          backgroundImage: "linear-gradient(rgba(0,0,0,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.04) 1px,transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 14, right: 16, background: "#fff",
            border: "3px solid #000", borderRadius: 10, padding: 8, cursor: "pointer",
            boxShadow: "3px 3px 0 0 rgba(0,0,0,.9)",
          }}
        ><X size={16} /></button>

        <div style={{
          display: "inline-block", background: "#fff", border: "4px solid #000",
          borderRadius: 14, padding: "10px 22px", boxShadow: "6px 6px 0 0 rgba(0,0,0,.9)",
          fontWeight: 900, fontSize: 22, letterSpacing: "-.02em", marginBottom: 24,
        }}>YOUR POINTS</div>

        <div style={{
          background: "#fff", border: "4px solid #000", borderRadius: 18,
          padding: "32px 24px", textAlign: "center",
          boxShadow: "6px 6px 0 0 rgba(0,0,0,.9)",
        }}>
          <div style={{
            fontSize: 12, letterSpacing: ".22em", textTransform: "uppercase",
            color: "#6b7280", fontWeight: 800, marginBottom: 10,
          }}>LitDeX Balance</div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 14,
            fontWeight: 900, fontSize: 56, color: "#0a0a0a",
            fontFamily: "'JetBrains Mono',monospace", letterSpacing: "-.04em",
          }}>
            <span style={{ color: "#f59e0b", fontSize: 48, lineHeight: 1 }}>◆</span>
            {err ? "—" : points == null ? "…" : points.toLocaleString()}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: "#374151", fontWeight: 600 }}>
            {err ? "Could not load points." : "Earn +10 pts per bet · +10 bonus per win"}
          </div>
        </div>

        <div style={{
          marginTop: 18, fontSize: 11, color: "#6b7280", textAlign: "center",
          fontFamily: "'JetBrains Mono',monospace", wordBreak: "break-all",
        }}>{address}</div>
      </motion.div>
    </div>
  );
}
