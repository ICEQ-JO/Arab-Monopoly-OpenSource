import { socket } from "../socket";
import { ICONS } from "../data/icons";

// In-room icon picker for the on-board token image -- like ColorPicker,
// icons are exclusive: each active player must have a distinct one, so
// icons already taken by another player are disabled here.
export default function IconPicker({ players, myId }) {
  const me = players.find((p) => p.id === myId);
  const takenIds = new Set(
    players.filter((p) => p.id !== myId && !p.left && p.icon).map((p) => p.icon)
  );

  function pick(iconId) {
    if (iconId === me?.icon) return;
    if (takenIds.has(iconId)) return;
    socket.emit("setIcon", { iconId });
  }

  return (
    <div className="lobby-icon-picker">
      {ICONS.map((icon) => {
        const isTaken = takenIds.has(icon.id);
        return (
          <button
            key={icon.id}
            className={`lobby-icon-swatch${me?.icon === icon.id ? " selected" : ""}${isTaken ? " taken" : ""}`}
            style={{ "--icon-color": icon.color, "--icon-scale": icon.scale ?? 1 }}
            onClick={() => pick(icon.id)}
            disabled={isTaken}
            title={isTaken ? `${icon.name} (taken)` : icon.name}
          >
            <img src={icon.img} alt={icon.name} />
          </button>
        );
      })}
    </div>
  );
}
