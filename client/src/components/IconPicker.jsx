import { socket } from "../socket";
import { ICONS } from "../data/icons";

// In-room icon picker for the on-board token image -- unlike ColorPicker,
// icons aren't exclusive: multiple players may pick the same one.
export default function IconPicker({ players, myId }) {
  const me = players.find((p) => p.id === myId);

  function pick(iconId) {
    if (iconId === me?.icon) return;
    socket.emit("setIcon", { iconId });
  }

  return (
    <div className="lobby-icon-picker">
      {ICONS.map((icon) => (
        <button
          key={icon.id}
          className={`lobby-icon-swatch${me?.icon === icon.id ? " selected" : ""}`}
          onClick={() => pick(icon.id)}
          title={icon.name}
        >
          <img src={icon.img} alt={icon.name} />
        </button>
      ))}
    </div>
  );
}
