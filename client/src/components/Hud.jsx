import { useEffect, useState } from "react";
import { socket } from "../socket";
import { primeAudio } from "../sfx";
import Auction from "./Auction";
import TileInfoPanel from "./TileInfoPanel";
import { IconClock, IconDice, IconSurprise, IconTreasure } from "./icons";

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
      <IconClock /> {mins}:{secs} left to act
    </p>
  );
}

export default function Hud({ state, myId }) {
  const me = state.players.find((p) => p.id === myId);
  const current = state.players[state.turnIndex];
  const isMyTurn = current?.id === myId;
  const pending = state.pendingAction;
  const board = state.board;

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
  const mortgageValue  = (t) => Math.floor(t.price / 2);
  const unmortgageCost = (t) => mortgageValue(t) + Math.ceil(mortgageValue(t) * 0.1);

  if (!state.started) return null;

  return (
    <div className="hud">
      {/* Turn section */}
      {!state.winnerId && (
        <div className="hud-section">
          <div className="hud-turn-header">
            <h3>{isMyTurn ? "Your Turn" : `${current?.name}'s Turn`}</h3>
            {me && (
              <span className="hud-balance">${me.balance}</span>
            )}
          </div>
          <TurnCountdown deadline={state.turnDeadline} />

          {state.lastRoll && (
            <p className="dice-display">
              <IconDice /> {state.lastRoll[0]} + {state.lastRoll[1]} = {state.lastRoll[0] + state.lastRoll[1]}
            </p>
          )}
          {state.lastCard && (
            <p className="card-display">
              {state.lastCard.deck === "surprise" ? <IconSurprise /> : <IconTreasure />} {state.lastCard.text}
            </p>
          )}

          {isMyTurn && !pending && me?.inHolding && !state.lastRoll && (
            <div className="buy-prompt">
              <p>You're in the Holding Pen. Roll for doubles, or:</p>
              <div className="action-row">
                <button onClick={() => socket.emit("payToLeaveHolding")}>Pay $50 to leave</button>
                {me.holdingFreeCard && (
                  <button onClick={() => socket.emit("useHoldingFreeCard")}>Use Free Card</button>
                )}
              </div>
            </div>
          )}

          {isMyTurn && !pending && me?.balance < 0 && (
            <p className="hint debt-warning">
              You're ${Math.abs(me.balance)} in debt — mortgage or trade before ending your turn.
            </p>
          )}

          {isMyTurn && !pending && (
            <div className="action-row">
              {state.canRollAgain && (
                <button className="primary" onClick={() => { primeAudio(); socket.emit("rollDice"); }}>Roll Dice</button>
              )}
              <button onClick={() => socket.emit("endTurn")}>End Turn</button>
            </div>
          )}

          {isMyTurn && pending?.type === "awaitCardMove" && (
            <div className="buy-prompt">
              <p>{state.lastCard?.text}</p>
              <div className="action-row">
                <button className="primary" onClick={() => socket.emit("confirmCardMove")}>Continue</button>
              </div>
            </div>
          )}

          <TileInfoPanel state={state} myId={myId} />

          {isMyTurn && !pending && myOwnedBuildable.length > 0 && (
            <details className="build-panel">
              <summary>Build / Sell Houses</summary>
              {myOwnedBuildable.map((t) => {
                const owned = state.ownership[t.id];
                return (
                  <div key={t.id} className="action-row build-row">
                    <span className="build-row-name">{t.name} {owned.houses > 0 && `(lvl ${owned.houses})`}</span>
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

      {/* Auction */}
      <Auction state={state} myId={myId} />
    </div>
  );
}
