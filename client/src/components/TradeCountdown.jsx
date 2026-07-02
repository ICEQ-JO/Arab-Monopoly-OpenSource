import { useEffect, useState } from "react";

// Ticking "time left" readout for a trade's deadline -- shared by the Trade
// modal (open trades list + read-only view) and the HUD's OpenTrades panel,
// so a proposer's "30 seconds to accept or it's gone" reads as the same live
// countdown everywhere the trade shows up.
export default function TradeCountdown({ deadline }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");
  return (
    <span className={`trade-countdown${secondsLeft <= 10 ? " urgent" : ""}`}>
      ⏱ {mins}:{secs}
    </span>
  );
}
