import { ICONS } from "../data/icons";

// Small circular player identifier reused anywhere a player needs to be
// shown at a glance (player ranking, trade player picker, trade header).
// Shows the icon art they picked -- same background-image cover/center crop
// PlayerToken.jsx uses for the board token's face -- or falls back to their
// plain color with an initial letter if they haven't picked one yet.
// `sizeClass` supplies the width/height/border for whichever context this
// is rendered in (e.g. "panel-player-dot", "swatch"); this component only
// adds the icon-vs-fallback rendering on top of that.
export default function PlayerAvatar({ player, sizeClass = "" }) {
  const icon = player?.icon ? ICONS.find((i) => i.id === player.icon) : null;

  if (icon) {
    return (
      <span
        className={`player-avatar player-avatar--icon ${sizeClass}`.trim()}
        style={{ backgroundImage: `url(${icon.img})` }}
        title={player?.name}
      />
    );
  }

  return (
    <span
      className={`player-avatar player-avatar--fallback ${sizeClass}`.trim()}
      style={{ background: player?.color }}
      title={player?.name}
    >
      {player?.name?.charAt(0).toUpperCase()}
    </span>
  );
}
