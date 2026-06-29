import { TILE_ICON, IconDice } from "./icons";

const BIG_ICON_TYPES = ["start", "holding", "go_to_holding"];

function getGridPos(i) {
  if (i <= 8) return { row: 9, col: 9 - i };
  if (i <= 16) return { row: 9 - (i - 8), col: 1 };
  if (i <= 24) return { row: 1, col: 1 + (i - 16) };
  return { row: 1 + (i - 24), col: 9 };
}

export default function Board({ board, ownership, players, pendingAction, lastRoll }) {
  return (
    <div className="board">
      {board.map((tile) => {
        const pos = getGridPos(tile.id);
        const owned = ownership[tile.id];
        const ownerColor = owned ? players.find((p) => p.id === owned.ownerId)?.color : null;
        const occupants = players.filter((p) => p.position === tile.id && !p.bankrupt);
        const isPending = pendingAction?.tileId === tile.id;
        const Icon = TILE_ICON[tile.type];
        const isBigIcon = BIG_ICON_TYPES.includes(tile.type);
        const priceValue = tile.price ?? tile.amount;
        return (
          <div
            key={tile.id}
            className={`tile tile-${tile.type} ${tile.group ? `tile-colored tile-group-${tile.group}` : ""} ${isPending ? "tile-pending" : ""}`}
            style={{ gridRow: pos.row, gridColumn: pos.col, background: tile.group ? `var(--g-${tile.group})` : undefined }}
          >
            {Icon && isBigIcon && (
              <div className="tile-icon tile-icon-lg">
                <Icon />
              </div>
            )}
            {Icon && !isBigIcon && (
              <div className="tile-icon-badge">
                <Icon />
              </div>
            )}
            <div className="tile-name">{tile.name}</div>
            {priceValue !== undefined && <div className="tile-price-badge">${priceValue}</div>}
            {owned && (
              <div className={`tile-owner ${owned.mortgaged ? "tile-owner-mortgaged" : ""}`} style={{ background: ownerColor }}>
                {owned.mortgaged ? "M" : owned.houses > 0 ? <span className="house-count">{owned.houses === 5 ? "H" : owned.houses}</span> : null}
              </div>
            )}
            <div className="tile-tokens">
              {occupants.map((p) => (
                <span key={p.id} className="token" style={{ background: p.color }} title={p.name} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="board-center">
        <h2>Monoboly عرب</h2>
        {lastRoll && (
          <p className="board-center-dice">
            <IconDice /> {lastRoll[0]} + {lastRoll[1]} = {lastRoll[0] + lastRoll[1]}
          </p>
        )}
      </div>
    </div>
  );
}
