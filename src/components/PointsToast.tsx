import React from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Floating "+10 Points Credited" toast.
 * Listens to a global window event so any component (e.g. RoundCard) can fire it.
 *   window.dispatchEvent(new CustomEvent("bob:points-credited", { detail: { points: 10 } }))
 */
export default function PointsToast() {
  const [items, setItems] = React.useState<{ id: number; points: number }[]>([]);

  React.useEffect(() => {
    const onEvt = (e: Event) => {
      const ce = e as CustomEvent<{ points?: number }>;
      const points = ce.detail?.points ?? 10;
      const id = Date.now() + Math.random();
      setItems((p) => [...p, { id, points }]);
      setTimeout(() => {
        setItems((p) => p.filter((x) => x.id !== id));
      }, 3000);
    };
    window.addEventListener("bob:points-credited", onEvt);
    return () => window.removeEventListener("bob:points-credited", onEvt);
  }, []);

  return (
    <div style={{
      position: "fixed", right: 20, bottom: 20, zIndex: 300,
      display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end",
      pointerEvents: "none",
    }}>
      <AnimatePresence>
        {items.map((it) => (
          <motion.div
            key={it.id}
            initial={{ x: 60, opacity: 0, scale: 0.9 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 60, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            style={{
              background: "#16a34a", color: "#fff",
              border: "3px solid #000", borderRadius: 12,
              padding: "12px 18px", fontWeight: 900, fontSize: 15,
              letterSpacing: ".02em",
              fontFamily: "'Space Grotesk',system-ui,sans-serif",
              boxShadow: "5px 5px 0 0 rgba(0,0,0,.9)",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>⚡</span>
            +{it.points} Points Credited
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
