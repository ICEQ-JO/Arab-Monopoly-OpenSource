import { TILE_ICON } from "./icons";
import Dice from "./Dice";

// Map-level flag shown on every tile for the current board theme
const MAP_FLAGS = {
  "fortune-city": "🇦🇪",
  "arab-world":   "🌙",
  "worldwide":    "🌍",
  "arab-empire":  "⚔️",
};

// Per-tile country flags for arab-world and worldwide
const TILE_FLAGS = {
  // arab-world
  "الرياض": "🇸🇦", "مكة": "🇸🇦", "عمّان": "🇯🇴", "بيروت": "🇱🇧",
  "القاهرة": "🇪🇬", "الإسكندرية": "🇪🇬", "دبي": "🇦🇪", "أبوظبي": "🇦🇪",
  "بغداد": "🇮🇶", "البصرة": "🇮🇶", "تونس": "🇹🇳", "الدار البيضاء": "🇲🇦",
  "الجزائر": "🇩🇿", "الخرطوم": "🇸🇩", "الدوحة": "🇶🇦", "المنامة": "🇧🇭",
  // worldwide
  "Salvador": "🇧🇷", "Rio": "🇧🇷", "Istanbul": "🇹🇷", "Johannesburg": "🇿🇦",
  "New York": "🇺🇸", "San Francisco": "🇺🇸", "Los Angeles": "🇺🇸",
  "Cape Town": "🇿🇦", "London": "🇬🇧", "Birmingham": "🇬🇧", "Manchester": "🇬🇧",
  "Shanghai": "🇨🇳", "Beijing": "🇨🇳", "Tokyo": "🇯🇵", "Paris": "🇫🇷",
  "Milan": "🇮🇹",
};

function getGridPos(i) {
  const N = 9;
  if (i >= 0  && i <= 8)  return { row: N,     col: N - i     }; // bottom
  if (i >= 8  && i <= 16) return { row: N - (i - 8), col: 1   }; // left
  if (i >= 16 && i <= 24) return { row: 1,     col: i - 16 + 1 }; // top
  if (i >= 24 && i <= 31) return { row: i - 24 + 1, col: N   }; // right
  return { row: 1, col: 1 };
}

function getEdge(i) {
  if (i === 0 || i === 8 || i === 16 || i === 24) return "corner";
  if (i > 0  && i < 8)  return "bottom";
  if (i > 8  && i < 16) return "left";
  if (i > 16 && i < 24) return "top";
  if (i > 24 && i < 32) return "right";
  return "";
}

function HouseRow({ count }) {
  if (!count) return null;
  return (
    <div className="tile-house-row">
      {count === 5
        ? <span className="tile-hotel">🏩</span>
        : Array.from({ length: count }).map((_, i) => <span key={i} className="tile-house-pip" />)}
    </div>
  );
}

function OwnerStripe({ ownerColor, mortgaged }) {
  if (!ownerColor) return null;
  return (
    <div
      className={`tile-owner-stripe${mortgaged ? " mortgaged" : ""}`}
      style={{ background: mortgaged ? "repeating-linear-gradient(45deg, #444, #444 4px, " + ownerColor + "55 4px, " + ownerColor + "55 8px)" : ownerColor }}
    />
  );
}

function Tile({ tile, owned, players, pendingTileId, mapType }) {
  const { id, type, name, price, amount } = tile;
  const edge = getEdge(id);
  const isCorner = edge === "corner";
  const Icon = TILE_ICON[type];
  const ownerColor = owned?.ownerId
    ? players.find((p) => p.id === owned.ownerId)?.color
    : null;
  const tileFlag = TILE_FLAGS[name] || MAP_FLAGS[mapType] || "🌐";
  const occupants = players.filter((p) => p.position === id && !p.bankrupt && !p.left);
  const isPending = pendingTileId === id;

  const groupColor = tile.groupColor || null;
  // property badge value
  const badge = price || (amount ? `$${amount}` : null);
  const formattedBadge = badge != null
    ? (typeof badge === "number" || !badge.toString().startsWith("$") ? `$${badge}` : badge)
    : null;

  return (
    <div
      className={`tile tile-${type}${isCorner ? " tile-corner" : ""}${isPending ? " tile-pending" : ""}${owned?.mortgaged ? " tile-mortgaged" : ""}`}
      data-edge={edge}
      style={{
        gridRow: getGridPos(id).row,
        gridColumn: getGridPos(id).col,
        "--stripe-color": groupColor || "transparent",
        "--owner-color": ownerColor || "transparent",
        ...(ownerColor ? {
          background: `linear-gradient(to bottom, #1a1630, ${ownerColor}28)`,
          boxShadow: `inset 0 0 0 2px ${ownerColor}60`,
        } : {})
      }}
    >
      {/* Owner stripe: replaces group color bar when owned */}
      {groupColor && !isCorner && (
        <div
          className="tile-color-bar"
          style={{
            background: ownerColor || groupColor,
            opacity: ownerColor ? 1 : 0.85,
            borderColor: ownerColor ? ownerColor : "transparent",
            boxShadow: ownerColor ? `0 0 8px ${ownerColor}88` : "none",
          }}
        />
      )}

      {/* Mortgage overlay */}
      {owned?.mortgaged && <div className="tile-mortgage-overlay">M</div>}

      {/* Main content */}
      <div className="tile-content">
        {/* Flag circle — shown on property/transit/utility tiles */}
        {(type === "property" || type === "transit" || type === "utility") && !isCorner && (
          <div className="tile-flag-circle">
            <span>{tileFlag}</span>
          </div>
        )}

        {Icon && !isCorner && (
          <span className="tile-icon">
            <Icon style={{ width: "1.1em", height: "1.1em" }} />
          </span>
        )}

        {isCorner ? (
          <div className="tile-corner-inner">
            {Icon && <Icon style={{ width: "1.6em", height: "1.6em", opacity: 0.75 }} />}
            <span className="tile-corner-name">{name}</span>
          </div>
        ) : (
          <>
            <span className="tile-name">{name}</span>
            {formattedBadge != null && (
              <span className="tile-price">{formattedBadge}</span>
            )}
          </>
        )}
      </div>

      {/* Houses */}
      {owned && !owned.mortgaged && <HouseRow count={owned.houses} />}

      {/* Player tokens */}
      {occupants.length > 0 && (
        <div className="tile-tokens">
          {occupants.map((p) => (
            <span
              key={p.id}
              className="tile-token"
              style={{ background: p.color, boxShadow: `0 0 0 2.5px #fff, 0 2px 8px rgba(0,0,0,0.55)` }}
              title={p.name}
            >
              {p.name.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Board({ state, myId }) {
  const { board, ownership, players, dice, rollSeq, vacationPot, mapType } = state;

  const pendingAction = state.pendingAction;
  const pendingTileId = pendingAction?.type === "awaitBuy"
    ? players.find((p) => p.id === state.currentPlayerId)?.position
    : undefined;

  return (
    <div className="board-wrap">
      <div className="board">
        {board.map((tile) => (
          <Tile
            key={tile.id}
            tile={tile}
            owned={ownership[tile.id]}
            players={players}
            pendingTileId={pendingTileId}
            mapType={mapType || "fortune-city"}
          />
        ))}

        {/* Center cell */}
        <div className="board-center">
          <div className="board-center-logo">
            <span className="board-logo-main">Monoboly</span>
            <span className="board-logo-arab">عرب</span>
          </div>
          {vacationPot > 0 && (
            <div className="board-vacation-pot">
              <span className="board-pot-label">✨ Vacation Pot</span>
              <span className="board-pot-amount">${vacationPot}</span>
            </div>
          )}
          <div className="board-dice-area">
            <Dice values={dice} rollSeq={rollSeq} />
          </div>
        </div>
      </div>
    </div>
  );
}
