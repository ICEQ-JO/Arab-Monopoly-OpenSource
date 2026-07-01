import { useState } from "react";
import { socket } from "../socket";
import PropertyCardDetail from "./PropertyCardDetail";
import { ICONS } from "../data/icons";

// Left-panel grid of the current player's own title-deed cards, two per row
// with the grid itself scrolling vertically to reveal further pairs -- reuses
// PropertyCardDetail (same component the board's tile-click card uses), so
// build/sell/mortgage stay wired to the identical socket events. Scoped to
// `type === "property"` tiles only, same restriction PropertyCardDetail's
// board-card caller already applies (transit/utility tiles don't share its
// house-price data shape).
export default function MyProperties({ state, myId }) {
  const [errors, setErrors] = useState({});
  const me = state.players.find((p) => p.id === myId);
  if (!state.started || !me) return null;

  const owned = (me.properties || [])
    .map((tileId) => state.board[tileId])
    .filter((tile) => tile?.type === "property");

  function emit(tileId, event) {
    setErrors((e) => ({ ...e, [tileId]: "" }));
    socket.emit(event, { tileId }, (res) => {
      if (res?.error) setErrors((e) => ({ ...e, [tileId]: res.error }));
    });
  }

  return (
    <div className="my-properties-panel">
      <span className="my-properties-title">🏠 My Properties</span>
      {owned.length === 0 ? (
        <p className="my-properties-empty">No properties yet</p>
      ) : (
        <div className="my-properties-grid">
          {owned.map((tile) => {
            const ownedInfo = state.ownership[tile.id];
            const houses = ownedInfo?.houses || 0;
            const mortgaged = !!ownedInfo?.mortgaged;
            return (
              <div key={tile.id} className="my-properties-card">
                <PropertyCardDetail
                  tile={tile}
                  houses={houses}
                  mortgaged={mortgaged}
                  owner={{
                    name: me.name,
                    color: me.color,
                    iconImg: me.icon ? ICONS.find((ic) => ic.id === me.icon)?.img : null,
                  }}
                  onBuildHouse={() => emit(tile.id, "buyHouse")}
                  onSellHouse={() => emit(tile.id, "sellHouse")}
                  onMortgage={() => emit(tile.id, mortgaged ? "unmortgageProperty" : "mortgageProperty")}
                  canBuildHouse={!mortgaged && houses < 5}
                  canSellHouse={houses > 0}
                  canMortgage={mortgaged || houses === 0}
                  error={errors[tile.id]}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
