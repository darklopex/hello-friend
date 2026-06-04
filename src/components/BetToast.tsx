import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export type BetToastData =
  | {
      kind: "success";
      mode: string;
      pick: string;
      stake: number;
      roundId: number;
      refId: string;
    }
  | { kind: "error"; message: string };

const DURATION = 5000;

export default function BetToast({
  data,
  onClose,
}: {
  data: BetToastData | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!data) return;
    const t = setTimeout(onClose, DURATION);
    return () => clearTimeout(t);
  }, [data, onClose]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key="bet-toast"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="bet-toast"
          style={{
            position: "fixed",
            zIndex: 200,
            right: 20,
            bottom: 20,
            width: "min(360px, calc(100vw - 24px))",
            background: "#0d0d0d",
            color: "#fff",
            borderLeft: `5px solid ${data.kind === "success" ? "#f97316" : "#ef4444"}`,
            borderRadius: 12,
            boxShadow: "0 12px 30px rgba(0,0,0,.5)",
            overflow: "hidden",
            fontFamily: "'Space Grotesk',system-ui,sans-serif",
          }}
        >
          <div style={{ padding: "14px 16px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {data.kind === "success" ? "✅ Bet Confirmed!" : "❌ Bet Failed"}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{ background: "transparent", border: 0, color: "#9ca3af", cursor: "pointer", padding: 2 }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,.1)", margin: "10px 0" }} />
            {data.kind === "success" ? (
              <>
                <Row k="Mode" v={data.mode} />
                <Row k="Pick" v={data.pick} />
                <Row k="Stake" v={`${data.stake.toFixed(4)} zkLTC`} />
                <Row k="Round" v={`#${data.roundId}`} />
                <div style={{ height: 1, background: "rgba(255,255,255,.1)", margin: "10px 0" }} />
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#9ca3af" }}>
                  Ref: <span style={{ color: "#f97316" }}>{data.refId}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#fca5a5" }}>{data.message}</div>
            )}
          </div>
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: DURATION / 1000, ease: "linear" }}
            style={{
              height: 3,
              background: data.kind === "success" ? "#f97316" : "#ef4444",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13 }}>
      <span style={{ color: "#9ca3af" }}>{k}:</span>
      <span style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
}
