import { TILE_ICON } from "./icons";

function getGridPos(i) {
  if (i <= 8) return { row: 9, col: 9 - i };
  if (i <= 16) return { row: 9 - (i - 8), col: 1 };
  if (i <= 24) return { row: 1, col: 1 + (i - 16) };
  return { row: 1 + (i - 24), col: 9 };
}

export default function Board({ board, ownership, players, pendingAction }) {
  return (
    <div className="board">
      {board.map((tile) => {
        const pos = getGridPos(tile.id);
        const owned = ownership[tile.id];
        const ownerColor = owned ? players.find((p) => p.id === owned.ownerId)?.color : null;
        const occupants = players.filter((p) => p.position === tile.id && !p.bankrupt);
        const isPending = pendingAction?.tileId === tile.id;
        return (
          <div
            key={tile.id}
            className={`tile tile-${tile.type} ${isPending ? "tile-pending" : ""}`}
            style={{ gridRow: pos.row, gridColumn: pos.col, borderTop: tile.group ? `10px solid var(--g-${tile.group})` : undefined }}
          >
            <div className="tile-name">{tile.name}</div>
            {tile.type !== "property" &&
              TILE_ICON[tile.type] &&
              (() => {
                const Icon = TILE_ICON[tile.type];
                return (
                  <div className="tile-icon">
                    <Icon />
                  </div>
                );
              })()}
            {"price" in tile && <div className="tile-price">${tile.price}</div>}
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
        <h2>Fortune City</h2>
      </div>
    </div>
  );
}
