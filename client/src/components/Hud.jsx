import { useEffect, useState } from "react";
import { socket } from "../socket";
import Trade from "./Trade";
import Auction from "./Auction";

function TurnCountdown({ deadline }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!deadline) return null;
  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");
  return (
    <p className={`turn-countdown ${secondsLeft <= 30 ? "turn-countdown-urgent" : ""}`}>
      ⏱ {mins}:{secs} left to act
    </p>
  );
}

export default function Hud({ state, myId, onLeave }) {
  const me = state.players.find((p) => p.id === myId);
  const current = state.players[state.turnIndex];
  const isMyTurn = current?.id === myId;
  const pending = state.pendingAction;
  const board = state.board;
  const pendingTile = pending ? board[pending.tileId] : null;

  const myOwnedBuildable = board.filter((t) => {
    const owned = state.ownership[t.id];
    return t.type === "property" && owned?.ownerId === myId;
  });
  const isOwnable = (t) => t.type === "property" || t.type === "transit" || t.type === "utility";
  const myMortgageable = board.filter((t) => {
    const owned = state.ownership[t.id];
    return isOwnable(t) && owned?.ownerId === myId && !owned.houses && !owned.mortgaged;
  });
  const myMortgaged = board.filter((t) => {
    const owned = state.ownership[t.id];
    return isOwnable(t) && owned?.ownerId === myId && owned.mortgaged;
  });
  const mortgageValue = (t) => Math.floor(t.price / 2);
  const unmortgageCost = (t) => mortgageValue(t) + Math.ceil(mortgageValue(t) * 0.1);

  return (
    <div className="hud">
      <div className="hud-section">
        <div className="room-header">
          <h3>Room {state.code}</h3>
          <button className="leave-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
        {!state.started && (
          <div>
            <p>Waiting for players ({state.players.length}/6)...</p>
            {state.hostId === myId && state.players.length >= 2 && (
              <button className="primary" onClick={() => socket.emit("startGame")}>
                Start game
              </button>
            )}
            {state.hostId === myId && state.players.length < 2 && <p className="hint">Need at least 2 players.</p>}
          </div>
        )}
      </div>

      {state.started && !state.winnerId && (
        <div className="hud-section">
          <h3>{isMyTurn ? "Your turn" : `${current?.name}'s turn`}</h3>
          <TurnCountdown deadline={state.turnDeadline} />
          {state.lastRoll && (
            <p className="dice-display">
              🎲 {state.lastRoll[0]} + {state.lastRoll[1]} = {state.lastRoll[0] + state.lastRoll[1]}
            </p>
          )}
          {state.lastCard && <p className="card-display">{state.lastCard.deck === "surprise" ? "❓" : "🎁"} {state.lastCard.text}</p>}

          {isMyTurn && !pending && me?.inHolding && !state.lastRoll && (
            <div className="buy-prompt">
              <p>You're in the Holding Pen. Roll for doubles, or:</p>
              <div className="action-row">
                <button onClick={() => socket.emit("payToLeaveHolding")}>Pay $50 to leave</button>
                {me.holdingFreeCard && (
                  <button onClick={() => socket.emit("useHoldingFreeCard")}>Use Get Out of Jail Free</button>
                )}
              </div>
            </div>
          )}

          {isMyTurn && !pending && me?.balance < 0 && (
            <p className="hint debt-warning">
              You're ${Math.abs(me.balance)} in debt -- mortgage, sell houses, or trade before ending your turn, or
              you'll be disqualified.
            </p>
          )}

          {isMyTurn && !pending && (
            <div className="action-row">
              {state.canRollAgain && (
                <button className="primary" onClick={() => socket.emit("rollDice")}>
                  Roll dice
                </button>
              )}
              <button onClick={() => socket.emit("endTurn")}>End turn</button>
            </div>
          )}

          {isMyTurn && pending?.type === "awaitCardMove" && (
            <div className="buy-prompt">
              <p>{state.lastCard?.text}</p>
              <div className="action-row">
                <button className="primary" onClick={() => socket.emit("confirmCardMove")}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {isMyTurn && pending?.type === "awaitBuy" && (
            <div className="buy-prompt">
              <p>
                Buy <strong>{pendingTile.name}</strong> for ${pendingTile.price}?
              </p>
              <div className="action-row">
                <button className="primary" onClick={() => socket.emit("buyProperty")}>
                  Buy
                </button>
                <button onClick={() => socket.emit("declineBuy")}>Decline</button>
              </div>
            </div>
          )}

          {isMyTurn && !pending && myOwnedBuildable.length > 0 && (
            <details className="build-panel">
              <summary>Build / sell houses</summary>
              {myOwnedBuildable.map((t) => {
                const owned = state.ownership[t.id];
                return (
                  <div key={t.id} className="action-row build-row">
                    <span className="build-row-name">
                      {t.name} {owned.houses > 0 && `(level ${owned.houses})`}
                    </span>
                    <button className="build-btn" onClick={() => socket.emit("buyHouse", { tileId: t.id })}>
                      Build (+${t.housePrice})
                    </button>
                    {owned.houses > 0 && (
                      <button className="build-btn" onClick={() => socket.emit("sellHouse", { tileId: t.id })}>
                        Sell (+${Math.floor(t.housePrice / 2)})
                      </button>
                    )}
                  </div>
                );
              })}
            </details>
          )}

          {(myMortgageable.length > 0 || myMortgaged.length > 0) && (
            <details className="build-panel">
              <summary>Mortgage</summary>
              {myMortgageable.map((t) => (
                <div key={t.id} className="action-row build-row">
                  <span className="build-row-name">{t.name}</span>
                  <button className="build-btn" onClick={() => socket.emit("mortgageProperty", { tileId: t.id })}>
                    Mortgage (+${mortgageValue(t)})
                  </button>
                </div>
              ))}
              {myMortgaged.map((t) => (
                <div key={t.id} className="action-row build-row">
                  <span className="build-row-name">{t.name} (mortgaged)</span>
                  <button className="build-btn" onClick={() => socket.emit("unmortgageProperty", { tileId: t.id })}>
                    Pay off (-${unmortgageCost(t)})
                  </button>
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {state.started && !state.winnerId && <Auction state={state} myId={myId} />}
      {state.started && !state.winnerId && <Trade state={state} myId={myId} />}

      {state.winnerId && (
        <div className="hud-section winner-banner">
          <h2>🏆 {state.players.find((p) => p.id === state.winnerId)?.name} wins!</h2>
        </div>
      )}

      <div className="hud-section">
        <h3>Players</h3>
        <ul className="player-list">
          {state.players.map((p) => (
            <li key={p.id} className={p.bankrupt || p.left ? "bankrupt" : ""}>
              <span className="swatch" style={{ background: p.color }} />
              <span className="p-name">
                {p.name} {p.id === myId && "(you)"}
              </span>
              <span className="p-balance">${p.balance}</span>
              {p.inHolding && <span className="badge">in holding</span>}
              {!p.bankrupt && !p.left && p.balance < 0 && <span className="badge badge-warn">in debt</span>}
              {p.bankrupt && <span className="badge">bankrupt</span>}
              {p.left && <span className="badge badge-warn">left/kicked</span>}
              {!p.left && !p.bankrupt && !p.connected && (
                <span className="badge badge-warn">reconnecting...</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="hud-section log">
        <h3>Log</h3>
        <ul>
          {state.log.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
