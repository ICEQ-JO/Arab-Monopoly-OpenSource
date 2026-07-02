import PropertyCardDetail from "./PropertyCardDetail";
import TransitCardDetail from "./TransitCardDetail";
import { SurpriseIcon } from "./BoardClassic";

// Left-panel grid of the current player's own title-deed cards, two per row
// with the grid itself scrolling vertically to reveal further pairs -- reuses
// PropertyCardDetail/TransitCardDetail (the same components the board's
// tile-click card uses). Read-only (showActions=false) -- build/sell/mortgage
// controls live on the tile-click card now, so clicking a tile is the one
// place those actions happen. Covers `property` and `transit` tiles -- this
// board has no utility tiles, so those two account for everything ownable.
// Owner info is hidden throughout (showOwner=false) -- every card here is
// already known to be the viewing player's own, so repeating their
// name/avatar on each one would be pure noise.
export default function MyProperties({ state, myId }) {
  const me = state.players.find((p) => p.id === myId);
  if (!state.started || !me) return null;

  const owned = (me.properties || [])
    .map((tileId) => state.board[tileId])
    .filter((tile) => tile?.type === "property" || tile?.type === "transit");

  const stationsOwned = owned.filter((tile) => tile.type === "transit").length;

  // Default sort: most expensive group first, with each group's tiles kept
  // together (then by price within the group) rather than interleaving
  // groups by individual tile price. Stations have no color `group`, so
  // they're keyed by tile type instead and sort in among the color groups
  // by their own price like any other group would.
  const groupMaxPrice = new Map();
  for (const tile of owned) {
    const key = tile.group || tile.type;
    const prev = groupMaxPrice.get(key) ?? -Infinity;
    if (tile.price > prev) groupMaxPrice.set(key, tile.price);
  }
  owned.sort((a, b) => {
    const aKey = a.group || a.type;
    const bKey = b.group || b.type;
    if (aKey !== bKey) {
      return groupMaxPrice.get(bKey) - groupMaxPrice.get(aKey);
    }
    return b.price - a.price;
  });

  // A completed color group (every tile of that group owned by this player)
  // gets a pulsing halo in the group's own color -- a quick "you monopolized
  // this" glance without having to check the board. Stations/utilities have
  // no color group to complete, so this only ever applies to `property` tiles.
  const groupTileIds = new Map();
  for (const tile of state.board) {
    if (tile.type !== "property" || !tile.group) continue;
    if (!groupTileIds.has(tile.group)) groupTileIds.set(tile.group, []);
    groupTileIds.get(tile.group).push(tile.id);
  }
  const myTileIds = new Set(me.properties || []);
  const completedGroups = new Set(
    [...groupTileIds.entries()]
      .filter(([, ids]) => ids.every((id) => myTileIds.has(id)))
      .map(([group]) => group)
  );

  return (
    <div className="my-properties-panel">
      <span className="my-properties-title">🏠 My Properties</span>
      {/* A drawn "get out free" card is kept, not spent, the moment it's
          drawn -- unlike every other card effect, which resolves and is
          gone -- so unlike the passing card-reveal toast, this needs a
          persistent reminder the player actually still holds it. */}
      {me.holdingFreeCard && (
        <div className="my-properties-kept-card">
          <SurpriseIcon />
          <span>Get Out of Holding Free</span>
        </div>
      )}
      {owned.length === 0 ? (
        <p className="my-properties-empty">No properties yet</p>
      ) : (
        <div className="my-properties-grid">
          {owned.map((tile) => {
            const ownedInfo = state.ownership[tile.id];
            const houses = ownedInfo?.houses || 0;
            const mortgaged = !!ownedInfo?.mortgaged;
            const isComplete = tile.type === "property" && completedGroups.has(tile.group);
            return (
              <div
                key={tile.id}
                className={`my-properties-card${isComplete ? " my-properties-card--complete" : ""}`}
                style={isComplete ? { "--halo-color": tile.groupColor } : undefined}
              >
                {tile.type === "transit" ? (
                  <TransitCardDetail
                    tile={tile}
                    mortgaged={mortgaged}
                    ownedCount={stationsOwned}
                    showOwner={false}
                    showActions={false}
                  />
                ) : (
                  <PropertyCardDetail
                    tile={tile}
                    houses={houses}
                    mortgaged={mortgaged}
                    showOwner={false}
                    showActions={false}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
