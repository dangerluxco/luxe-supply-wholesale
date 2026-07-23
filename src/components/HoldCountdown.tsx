"use client";

import { useEffect, useState } from "react";

// Live soft-hold countdown (TTL is HOLD_TTL_MS — currently 7 days).
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function tick() {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setLabel("hold expired");
        return;
      }
      const totalMin = Math.floor(ms / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      // Long holds read in days ("held 6d 23h"), not raw hours ("held 167h 59m").
      if (h >= 48) {
        setLabel(`held ${Math.floor(h / 24)}d ${h % 24}h`);
      } else {
        setLabel(`held ${h}h ${String(m).padStart(2, "0")}m`);
      }
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return <span className="font-mono text-accent">{label}</span>;
}
