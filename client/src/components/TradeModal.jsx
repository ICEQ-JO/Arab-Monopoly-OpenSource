import { useState } from "react";
import { socket } from "../socket";

function tradeableTiles(board, ownership, playerId) {
  return board.filter((t) => {
    const owned = ownership[t.id];
    return owned?.ownerId === playerId && !owned.houses && !owned.mortgaged;
  });
}

function PropChip({ tile, selected, onToggle }) {
  return (
    <div
      className={`trade-prop-chip${selected ? " selected" : ""}`}
      onClick={() => onToggle(tile.id)}
    >
      <span className="prop-dot" style={{ background: tile.color || "#888" }} />
      {tile.name}
    </div>
  );
}

function TradeForm({ board, ownership, players, myId, otherId, onSubmit, submitLabel, onBack }) {
  const [offerIds, setOfferIds] = useState([]);
  const [requestIds, setRequestIds] = useState([]);
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);
  const [error, setError] = useState("");

  const me = players.find((p) => p.id === myId);
  const them = players.find((p) => p.id === otherId);
  const myTiles = tradeableTiles(board, ownership, myId);
  const theirTiles = tradeableTiles(board, ownership, otherId);
  const maxOffer = Math.max(0, me?.balance ?? 0);
  const maxRequest = Math.max(0, them?.balance ?? 0);

  function toggle(list, setList, id) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function submit() {
    setError("");
    onSubmit(
      {
        offerProperties: offerIds,
        offerMoney: Math.min(Number(offerMoney) || 0, maxOffer),
        requestProperties: requestIds,
        requestMoney: Math.min(Number(requestMoney) || 0, maxRequest),
      },
      (res) => {
        if (res?.error) return setError(res.error);
      }
    );
  }

  return (
    <>
      {/* Who we're trading with */}
      <div className="trade-form-header">
        <div className="trade-form-player-chip">
          <span className="swatch" style={{ background: me?.color }} />
          <span className="trade-form-player-name">{me?.name} (you)</span>
          <span className="trade-form-balance-badge">${me?.balance ?? 0}</span>
        </div>
        <span className="trade-form-vs">⇄</span>
        <div className="trade-form-player-chip">
          <span className="swatch" style={{ background: them?.color }} />
          <span className="trade-form-player-name">{them?.name}</span>
          <span className="trade-form-balance-badge">${them?.balance ?? 0}</span>
        </div>
        {onBack && (
          <button onClick={onBack} style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }}>
            ← Back
          </button>
        )}
      </div>

      {/* Two-column property picker */}
      <div className="trade-cols-2">
        <div className="trade-col-side">
          <div className="trade-col-label">You give</div>
          {myTiles.length === 0 && <p className="hint" style={{ margin: 0, fontSize: 12 }}>No tradeable properties</p>}
          {myTiles.map((t) => (
            <PropChip key={t.id} tile={t} selected={offerIds.includes(t.id)} onToggle={(id) => toggle(offerIds, setOfferIds, id)} />
          ))}
          <div className="trade-money-row">
            <div className="trade-money-label">
              <span>Coins</span>
              <span className="trade-money-amount">${offerMoney}</span>
            </div>
            <input type="range" min="0" max={maxOffer} value={Math.min(offerMoney, maxOffer)} onChange={(e) => setOfferMoney(Number(e.target.value))} />
          </div>
        </div>

        <div className="trade-col-divider" />

        <div className="trade-col-side">
          <div className="trade-col-label">You get</div>
          {theirTiles.length === 0 && <p className="hint" style={{ margin: 0, fontSize: 12 }}>No tradeable properties</p>}
          {theirTiles.map((t) => (
            <PropChip key={t.id} tile={t} selected={requestIds.includes(t.id)} onToggle={(id) => toggle(requestIds, setRequestIds, id)} />
          ))}
          <div className="trade-money-row">
            <div className="trade-money-label">
              <span>Coins</span>
              <span className="trade-money-amount">${requestMoney}</span>
            </div>
            <input type="range" min="0" max={maxRequest} value={Math.min(requestMoney, maxRequest)} onChange={(e) => setRequestMoney(Number(e.target.value))} />
          </div>
        </div>
      </div>

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

      <div className="trade-modal-footer">
        <button className="primary" onClick={submit}>{submitLabel}</button>
      </div>
    </>
  );
}

function IncomingCard({ trade, board, ownership, players, myId, onClose }) {
  const [countering, setCountering] = useState(false);
  const from = players.find((p) => p.id === trade.fromId);
  const offerNames = trade.offerProperties.map((id) => board[id].name);
  const requestNames = trade.requestProperties.map((id) => board[id].name);

  function counter(params, ack) {
    socket.emit("counterTrade", { tradeId: trade.id, ...params }, (res) => {
      ack(res);
      if (res?.ok) setCountering(false);
    });
  }

  return (
    <div className="incoming-trade-section">
      <div className="incoming-trade-label">Incoming offer from {from?.name}</div>
      <p style={{ margin: 0, fontSize: 13 }}>
        <strong>Gives you:</strong> {[...offerNames, trade.offerMoney > 0 ? `$${trade.offerMoney}` : null].filter(Boolean).join(", ") || "nothing"}
      </p>
      <p style={{ margin: 0, fontSize: 13 }}>
        <strong>Wants:</strong> {[...requestNames, trade.requestMoney > 0 ? `$${trade.requestMoney}` : null].filter(Boolean).join(", ") || "nothing"}
      </p>
      {!countering ? (
        <div className="action-row">
          <button className="primary" onClick={() => { socket.emit("respondTrade", { tradeId: trade.id, accept: true }); onClose(); }}>Accept</button>
          <button onClick={() => socket.emit("respondTrade", { tradeId: trade.id, accept: false })}>Decline</button>
          <button onClick={() => setCountering(true)}>Counter</button>
        </div>
      ) : (
        <>
          <TradeForm
            board={board} ownership={ownership} players={players}
            myId={myId} otherId={trade.fromId}
            onSubmit={counter} submitLabel="Send counter-offer"
            onBack={() => setCountering(false)}
          />
        </>
      )}
    </div>
  );
}

export default function TradeModal({ state, myId, onClose }) {
  const { board, ownership, players, trades } = state;
  const [step, setStep] = useState("menu"); // "menu" | playerId string
  const others = players.filter((p) => p.id !== myId && !p.bankrupt && !p.left);
  const incoming = trades.filter((t) => t.toId === myId);
  const outgoing = trades.filter((t) => t.fromId === myId);

  function proposeNew(params, ack) {
    socket.emit("proposeTrade", { toId: step, ...params }, (res) => {
      ack(res);
      if (res?.ok) setStep("menu");
    });
  }

  return (
    <div className="trade-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="trade-modal">
        <div className="trade-modal-header">
          <h2>{step === "menu" ? "Trade" : "Propose Trade"}</h2>
          <button className="trade-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="trade-modal-body">
          {/* Incoming trades always visible at top */}
          {incoming.map((t) => (
            <IncomingCard key={t.id} trade={t} board={board} ownership={ownership} players={players} myId={myId} onClose={onClose} />
          ))}

          {/* Outgoing pending */}
          {outgoing.map((t) => {
            const to = players.find((p) => p.id === t.toId);
            return (
              <div key={t.id} className="incoming-trade-section">
                <div className="incoming-trade-label" style={{ color: "var(--text-dim)" }}>Pending offer to {to?.name}</div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>Waiting for response…</p>
                <div className="action-row">
                  <button onClick={() => socket.emit("cancelTrade", { tradeId: t.id })}>Cancel</button>
                </div>
              </div>
            );
          })}

          {/* Step 1: pick player */}
          {step === "menu" && others.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
                Select a player to trade with:
              </p>
              <div className="trade-player-list">
                {others.map((p) => (
                  <button key={p.id} className="trade-player-btn" onClick={() => setStep(p.id)}>
                    <span className="swatch" style={{ background: p.color }} />
                    <span className="trade-player-btn-name">{p.name}</span>
                    <span className="trade-player-btn-balance">
                      <span className="trade-balance-label">Balance</span>
                      <span className="trade-balance-amount">${p.balance}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2: trade form */}
          {step !== "menu" && (
            <TradeForm
              board={board} ownership={ownership} players={players}
              myId={myId} otherId={step}
              onSubmit={proposeNew} submitLabel="Send Offer"
              onBack={() => setStep("menu")}
            />
          )}

          {others.length === 0 && incoming.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>No other active players to trade with.</p>
          )}
        </div>
      </div>
    </div>
  );
}
