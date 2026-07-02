import { socket } from "../socket";

// Dev-build only (caller in App.jsx gates this behind import.meta.env.DEV,
// stripped from production builds). Draws a card directly, without needing
// to land on a Surprise/Treasure tile, so the card-reveal UI and full deck
// content can be exercised repeatedly during an actual game -- unlike the
// other debug tools in RulesPanel, this has to live in the started game
// screen itself (not the pre-game waitroom), since CardReveal isn't even
// mounted until then. See Room.debugDrawCard for why clicking this
// repeatedly cycles the whole deck once rather than drawing truly randomly.
export default function DevTools() {
  function draw(deck) {
    socket.emit("debugDrawCard", { deck });
  }

  return (
    <div className="dev-tools">
      <span className="dev-tools-label">🛠 DEV</span>
      <button className="dev-tools-btn" onClick={() => draw("surprise")}>Draw Surprise</button>
      <button className="dev-tools-btn" onClick={() => draw("treasure")}>Draw Treasure</button>
    </div>
  );
}
