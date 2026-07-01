import { socket } from "../socket";

// Client-side mirror of server/src/game/Room.js `calcRent()` — the server
// never broadcasts a rent preview, so this panel recomputes it from data
// that's already in `state` (board, ownership, rules, lastRoll). Keep this
// in sync with Room.js if rent rules ever change there.
function estimateRent(tile, owned, board, ownership, rules, lastRoll) {
  if (owned.mortgaged) return 0;
  if (tile.type === "property") {
    const houses = owned.houses || 0;
    const groupTiles = board.filter((t) => t.group === tile.group);
    const ownsAll = groupTiles.every((t) => ownership[t.id]?.ownerId === owned.ownerId);
    let rent = tile.rent[houses];
    if (houses === 0 && ownsAll && rules?.doubleRentFullSet) rent *= 2;
    return rent;
  }
  if (tile.type === "transit") {
    const count = board.filter((t) => t.type === "transit" && ownership[t.id]?.ownerId === owned.ownerId).length;
    return tile.rent[Math.min(count - 1, tile.rent.length - 1)];
  }
  if (tile.type === "utility") {
    const count = board.filter((t) => t.type === "utility" && ownership[t.id]?.ownerId === owned.ownerId).length;
    const mult = tile.multiplier[Math.min(count - 1, tile.multiplier.length - 1)];
    const roll = (lastRoll?.[0] || 0) + (lastRoll?.[1] || 0);
    return mult * roll;
  }
  return 0;
}

export default function TileInfoPanel({ state, myId }) {
  const me = state.players.find((p) => p.id === myId);
  const current = state.players[state.turnIndex];
  const isMyTurn = current?.id === myId;
  if (!isMyTurn || !me) return null;

  const tile = state.board[me.position];
  const isOwnable = tile.type === "property" || tile.type === "transit" || tile.type === "utility";
  if (!isOwnable) return null;

  const owned = state.ownership[tile.id];
  const pending = state.pendingAction;
  const isPendingBuy = pending?.type === "awaitBuy" && pending.tileId === tile.id;
  const owner = owned ? state.players.find((p) => p.id === owned.ownerId) : null;

  return (
    <div className="buy-prompt tile-info-panel">
      <div className="tile-info-header" style={{ borderColor: tile.groupColor }}>
        <strong>{tile.name}</strong>
      </div>

      {!owned && (
        <>
          {tile.price != null && <p>Price: ${tile.price}</p>}
          {Array.isArray(tile.rent) && <p className="hint">Rent: {tile.rent.join(" / ")}</p>}
        </>
      )}

      {owned && (
        <>
          <p>
            Owner: <span style={{ color: owner?.color, fontWeight: 700 }}>{owner?.name}</span>
            {owned.ownerId === myId && " (you)"}
          </p>
          <p>
            Rent: ${estimateRent(tile, owned, state.board, state.ownership, state.rules, state.lastRoll)}
            {owned.mortgaged && " (mortgaged)"}
          </p>
        </>
      )}

      {isPendingBuy && (
        <div className="action-row">
          <button className="primary" onClick={() => socket.emit("buyProperty")}>Buy</button>
          <button onClick={() => socket.emit("declineBuy")}>Decline</button>
        </div>
      )}
    </div>
  );
}
