function getGridPos(i) {
  if (i <= 8) return { row: 9, col: 9 - i };
  if (i <= 16) return { row: 9 - (i - 8), col: 1 };
  if (i <= 24) return { row: 1, col: 1 + (i - 16) };
  return { row: 1 + (i - 24), col: 9 };
}

const TYPE_ICON = {
  start: "\u{1F3E0}",
  tax: "\u{1F4B8}",
  surprise: "❓",
  treasure: "\u{1F381}",
  transit: "\u{1F687}",
  utility: "⚡",
  rest: "\u{1F333}",
  holding: "\u{1F512}",
  go_to_holding: "\u{1F46E}",
};

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
            style={{ gridRow: pos.row, gridColumn: pos.col, borderTop: tile.group ? `6px solid var(--g-${tile.group})` : undefined }}
          >
            <div className="tile-name">{tile.name}</div>
            {tile.type !== "property" && TYPE_ICON[tile.type] && (
              <div className="tile-icon">{TYPE_ICON[tile.type]}</div>
            )}
            {"price" in tile && <div className="tile-price">${tile.price}</div>}
            {owned && (
              <div className="tile-owner" style={{ background: ownerColor }}>
                {owned.houses > 0 && <span className="house-count">{owned.houses === 5 ? "\u{1F3E8}" : owned.houses}</span>}
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
