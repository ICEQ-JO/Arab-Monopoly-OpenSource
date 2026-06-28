import { useState } from "react";
import { socket } from "../socket";

function tradeableTiles(board, ownership, playerId) {
  return board.filter((t) => {
    const owned = ownership[t.id];
    return owned?.ownerId === playerId && !owned.houses;
  });
}

function TradeSummary({ trade, board, players }) {
  const from = players.find((p) => p.id === trade.fromId);
  const to = players.find((p) => p.id === trade.toId);
  const offerNames = trade.offerProperties.map((id) => board[id].name);
  const requestNames = trade.requestProperties.map((id) => board[id].name);
  return (
    <div className="trade-summary">
      <p>
        <strong>{from?.name}</strong> → <strong>{to?.name}</strong>
      </p>
      <p className="trade-side">
        Gives: {[...offerNames, trade.offerMoney > 0 ? `$${trade.offerMoney}` : null].filter(Boolean).join(", ") || "nothing"}
      </p>
      <p className="trade-side">
        Wants: {[...requestNames, trade.requestMoney > 0 ? `$${trade.requestMoney}` : null].filter(Boolean).join(", ") || "nothing"}
      </p>
    </div>
  );
}

export default function Trade({ state, myId }) {
  const { board, ownership, players, trades } = state;
  const others = players.filter((p) => p.id !== myId && !p.bankrupt && !p.left);
  const [targetId, setTargetId] = useState(others[0]?.id || "");
  const [offerIds, setOfferIds] = useState([]);
  const [requestIds, setRequestIds] = useState([]);
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);
  const [error, setError] = useState("");

  const myTiles = tradeableTiles(board, ownership, myId);
  const theirTiles = targetId ? tradeableTiles(board, ownership, targetId) : [];

  const incoming = trades.filter((t) => t.toId === myId);
  const outgoing = trades.filter((t) => t.fromId === myId);

  function toggle(list, setList, id) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function sendOffer() {
    setError("");
    if (!targetId) return setError("Pick someone to trade with");
    socket.emit(
      "proposeTrade",
      {
        toId: targetId,
        offerProperties: offerIds,
        offerMoney: Number(offerMoney) || 0,
        requestProperties: requestIds,
        requestMoney: Number(requestMoney) || 0,
      },
      (res) => {
        if (res?.error) return setError(res.error);
        setOfferIds([]);
        setRequestIds([]);
        setOfferMoney(0);
        setRequestMoney(0);
      }
    );
  }

  if (others.length === 0) return null;

  return (
    <div className="hud-section">
      <h3>Trade</h3>

      {incoming.length > 0 && (
        <div className="trade-list">
          {incoming.map((t) => (
            <div key={t.id} className="trade-card">
              <TradeSummary trade={t} board={board} players={players} />
              <div className="action-row">
                <button className="primary" onClick={() => socket.emit("respondTrade", { tradeId: t.id, accept: true })}>
                  Accept
                </button>
                <button onClick={() => socket.emit("respondTrade", { tradeId: t.id, accept: false })}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="trade-list">
          {outgoing.map((t) => (
            <div key={t.id} className="trade-card">
              <TradeSummary trade={t} board={board} players={players} />
              <span className="hint">Waiting for a response...</span>
              <div className="action-row">
                <button onClick={() => socket.emit("cancelTrade", { tradeId: t.id })}>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="build-panel">
        <summary>Propose a trade</summary>
        <label className="trade-field">
          Trade with
          <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setRequestIds([]); }}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="trade-columns">
          <div>
            <p className="trade-col-title">You give</p>
            {myTiles.length === 0 && <p className="hint">No tradeable properties</p>}
            {myTiles.map((t) => (
              <label key={t.id} className="trade-checkbox">
                <input type="checkbox" checked={offerIds.includes(t.id)} onChange={() => toggle(offerIds, setOfferIds, t.id)} />
                {t.name}
              </label>
            ))}
            <label className="trade-field">
              Coins
              <input type="number" min="0" value={offerMoney} onChange={(e) => setOfferMoney(e.target.value)} />
            </label>
          </div>

          <div>
            <p className="trade-col-title">You get</p>
            {theirTiles.length === 0 && <p className="hint">No tradeable properties</p>}
            {theirTiles.map((t) => (
              <label key={t.id} className="trade-checkbox">
                <input type="checkbox" checked={requestIds.includes(t.id)} onChange={() => toggle(requestIds, setRequestIds, t.id)} />
                {t.name}
              </label>
            ))}
            <label className="trade-field">
              Coins
              <input type="number" min="0" value={requestMoney} onChange={(e) => setRequestMoney(e.target.value)} />
            </label>
          </div>
        </div>

        <button className="primary" onClick={sendOffer}>
          Send offer
        </button>
        {error && <p className="error">{error}</p>}
      </details>
    </div>
  );
}
