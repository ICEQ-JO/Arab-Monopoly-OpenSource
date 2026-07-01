import { socket } from "../socket";

export const COLORS = [
  "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c",
  "#3498db", "#9b59b6", "#e91e63", "#ff5722", "#00bcd4",
];

// In-room color picker -- each player owns their own pick, no host gate.
// Swatches already taken by another (still-seated) player are disabled.
export default function ColorPicker({ players, myId }) {
  const me = players.find((p) => p.id === myId);
  const takenByOthers = new Set(
    players.filter((p) => p.id !== myId && !p.left).map((p) => p.color)
  );

  function pick(color) {
    if (takenByOthers.has(color) || color === me?.color) return;
    socket.emit("setColor", { color });
  }

  return (
    <div className="lobby-color-picker">
      {COLORS.map((c) => {
        const taken = takenByOthers.has(c);
        return (
          <button
            key={c}
            className={`lobby-color-swatch${me?.color === c ? " selected" : ""}${taken ? " taken" : ""}`}
            style={{ background: c }}
            disabled={taken}
            onClick={() => pick(c)}
            title={taken ? "Already taken" : c}
          />
        );
      })}
    </div>
  );
}
