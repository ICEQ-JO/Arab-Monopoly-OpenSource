import TradeCountdown from "./TradeCountdown";

// Right-panel at-a-glance list of the current player's open trades (both
// incoming offers awaiting a response and outgoing offers still pending).
// Clicking a row opens the full Trade modal, which already lists every
// trade the player is party to in detail (accept/decline/counter/cancel).
export default function OpenTrades({ state, myId, onOpen }) {
  const { players, trades = [] } = state;
  if (!state.started) return null;

  const mine = trades.filter((t) => t.fromId === myId || t.toId === myId);

  function playerLabel(id) {
    const p = players.find((pl) => pl.id === id);
    return `${p?.name ?? "?"}${id === myId ? " (you)" : ""}`;
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
            return (
              <button key={t.id} className="open-trade-row" onClick={onOpen}>
                <span className="open-trade-dot" style={{ background: counterpart?.color }} />
                <span className="open-trade-name">
                  {playerLabel(t.fromId)} ⇄ {playerLabel(t.toId)}
                </span>
                {t.deadline && <TradeCountdown deadline={t.deadline} />}
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
