import { ICONS } from "../data/icons";

export default function PlayerToken({ player, stackIndex, stackTotal, leftPct, topPct, glideMs, glideEase, isMoving, isLanding, justBought, isActiveTurn }) {
  const wrapStyle = {
    "--c": player.color,
    "--i": stackIndex,
    "--n": stackTotal,
    "--glide-ms": `${glideMs || 220}ms`,
    "--glide-ease": glideEase || "ease",
    left: `${leftPct}%`,
    top: `${topPct}%`,
  };
  const innerCls = [
    "cv2-token-inner",
    isActiveTurn && "cv2-token--active",
    isMoving && "cv2-token--floating",
    !isMoving && isLanding && "cv2-token--landing",
    justBought && "cv2-token--celebrate",
  ].filter(Boolean).join(" ");
  const innerStyle = { "--delay": `${(stackIndex * 0.3).toFixed(2)}s` };

  const icon = player.icon ? ICONS.find((i) => i.id === player.icon) : null;

  return (
    <span className="cv2-token" style={wrapStyle} title={player.name}>
      <span className={innerCls} style={innerStyle}>
        {icon ? (
          <span
            className="cv2-token-face cv2-token-face--icon"
            style={{ backgroundImage: `url(${icon.img})` }}
          />
        ) : (
          <span className="cv2-token-face">
            <span className="cv2-token-eye cv2-token-eye--l" />
            <span className="cv2-token-eye cv2-token-eye--r" />
            <span className="cv2-token-mouth" />
          </span>
        )}
      </span>
    </span>
  );
}
