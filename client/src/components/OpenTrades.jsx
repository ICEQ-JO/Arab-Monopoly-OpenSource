// Right-panel at-a-glance list of the current player's open trades (both
// incoming offers awaiting a response and outgoing offers still pending).
// Clicking a row opens the full Trade modal, which already lists every
// trade the player is party to in detail (accept/decline/counter/cancel).
export default function OpenTrades({ state, myId, onOpen }) {
  const { players, trades = [] } = state;
  if (!state.started) return null;

  const mine = trades.filter((t) => t.fromId === myId || t.toId === myId);

  function itemCount(t) {
    return {
      offer: t.offerProperties.length + (t.offerMoney > 0 ? 1 : 0),
      request: t.requestProperties.length + (t.requestMoney > 0 ? 1 : 0),
    };
  }

  return (
    <div className="open-trades-panel">
      <span className="open-trades-title">⇄ Open Trades</span>
      {mine.length === 0 ? (
        <p className="open-trades-empty">No open trades</p>
      ) : (
        <div className="open-trades-list">
          {mine.map((t) => {
            const incoming = t.toId === myId;
            const counterpart = players.find((p) => p.id === (incoming ? t.fromId : t.toId));
            const { offer, request } = itemCount(t);
            return (
              <button key={t.id} className="open-trade-row" onClick={onOpen}>
                <span className="open-trade-dot" style={{ background: counterpart?.color }} />
                <span className="open-trade-info">
                  <span className="open-trade-name">{counterpart?.name}</span>
                  <span className="open-trade-summary">
                    {incoming
                      ? `Offers you ${offer} item${offer === 1 ? "" : "s"} for ${request}`
                      : `You offered ${offer} item${offer === 1 ? "" : "s"} for ${request}`}
                  </span>
                </span>
                <span className={`open-trade-status${incoming ? " incoming" : ""}`}>
                  {incoming ? "Respond" : "Pending"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
