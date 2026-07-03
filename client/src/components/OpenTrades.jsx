import PlayerAvatar from "./PlayerAvatar";
import TradeCountdown from "./TradeCountdown";

// Right-panel "Trades" box -- groups the create-trade trigger and the
// at-a-glance list of the current player's open trades (both incoming
// offers awaiting a response and outgoing offers still pending) into one
// panel. Clicking a row jumps straight to that trade's own detail screen
// (accept/decline/counter/cancel) in the Trade modal, skipping the modal's
// own open-trades menu since the row itself already identifies the trade --
// rows stay minimal (who <-> who), no status badge, just a countdown on the
// right for trades that actually have a time limit.
export default function OpenTrades({ state, myId, onOpen, onCreate }) {
  const { players, trades = [] } = state;
  if (!state.started) return null;

  const mine = trades.filter((t) => t.fromId === myId || t.toId === myId);

  function playerLabel(id) {
    const p = players.find((pl) => pl.id === id);
    return `${p?.name ?? "?"}${id === myId ? " (you)" : ""}`;
  }

  return (
    <div className="open-trades-panel">
      <div className="open-trades-header">
        <span className="open-trades-title">Trades</span>
        <button className="primary open-trades-create-btn" onClick={onCreate}>
          + Create
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="open-trades-empty">No open trades</p>
      ) : (
        <div className="open-trades-list">
          {mine.map((t) => {
            const incoming = t.toId === myId;
            const fromP = players.find((p) => p.id === t.fromId);
            const toP = players.find((p) => p.id === t.toId);
            return (
              <button
                key={t.id}
                className={`open-trade-row${incoming ? " incoming" : ""}`}
                style={incoming ? { "--c": fromP?.color } : undefined}
                onClick={() => onOpen(t.id)}
              >
                <PlayerAvatar player={fromP} sizeClass="swatch" />
                <span className="open-trade-name">{playerLabel(t.fromId)}</span>
                <span className="open-trade-arrow">⇄</span>
                <PlayerAvatar player={toP} sizeClass="swatch" />
                <span className="open-trade-name">{playerLabel(t.toId)}</span>
                {t.deadline && <TradeCountdown deadline={t.deadline} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
