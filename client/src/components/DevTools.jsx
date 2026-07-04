import { useState } from "react";
import { socket } from "../socket";

// Dev-build only (caller in App.jsx gates this behind import.meta.env.DEV,
// stripped from production builds). Draws a card directly, without needing
// to land on a Surprise/Treasure tile, so the card-reveal UI and full deck
// content can be exercised repeatedly during an actual game -- unlike the
// other debug tools in RulesPanel, this has to live in the started game
// screen itself (not the pre-game waitroom), since CardReveal isn't even
// mounted until then. See Room.debugDrawCard for why clicking this
// repeatedly cycles the whole deck once rather than drawing truly randomly,
// and why it's restricted to the current turn's player.
export default function DevTools() {
  const [error, setError] = useState("");

  // Every emit here used to fire-and-forget with no ack, so a rejected draw
  // (e.g. not your turn, or a card move still pending confirmation) failed
  // completely silently -- clicking the button just appeared to do nothing,
  // which is exactly what made the underlying off-turn-softlock bug this
  // restriction fixes so hard to notice in the first place.
  function draw(deck) {
    setError("");
    socket.emit("debugDrawCard", { deck }, (res) => {
      if (res?.error) setError(res.error);
    });
  }

  function grantJailCard() {
    setError("");
    socket.emit("debugGrantJailCard", (res) => {
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="dev-tools">
      <span className="dev-tools-label">🛠 DEV</span>
      <button className="dev-tools-btn" onClick={() => draw("surprise")}>Draw Surprise</button>
      <button className="dev-tools-btn" onClick={() => draw("treasure")}>Draw Treasure</button>
      <button className="dev-tools-btn" onClick={grantJailCard}>Get Wasta Card</button>
      {error && <span className="dev-tools-error">{error}</span>}
    </div>
  );
}
