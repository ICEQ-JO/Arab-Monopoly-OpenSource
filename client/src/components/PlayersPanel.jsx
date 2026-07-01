import { useState } from "react";
import { socket } from "../socket";

export default function PlayersPanel({ state, myId, onOpenTrade, onLeave }) {
  const { players, roomCode, hostId, started, log = [], winnerId } = state;
  const me = players.find((p) => p.id === myId);
  const isHost = hostId === myId;

  function startGame() { socket.emit("startGame"); }

  const pendingTrades = (state.trades || []).filter((t) => t.toId === myId).length;

  return (
    <div className="players-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-room-code">
          <span className="panel-room-label">Room</span>
          <span className="panel-room-value">{roomCode}</span>
        </div>
        <button className="panel-leave-btn" onClick={onLeave}>Leave</button>
      </div>

      {/* Winner banner */}
      {winnerId && (
        <div className="panel-winner-banner">
          🏆 {players.find((p) => p.id === winnerId)?.name} wins!
        </div>
      )}

      {/* Trade button (single, canonical location) */}
      {started && (
        <button
          className="panel-trade-btn"
          onClick={onOpenTrade}
        >
          ⇄ Trade
          {pendingTrades > 0 && <span className="panel-trade-badge">{pendingTrades}</span>}
        </button>
      )}

      {/* Pre-game start button */}
      {!started && isHost && players.length >= 2 && (
        <button className="panel-start-btn" onClick={startGame}>
          ▶ Start Game
        </button>
      )}
      {!started && isHost && players.length < 2 && (
        <p className="panel-waiting-hint">Waiting for more players…</p>
      )}
      {!started && !isHost && (
        <p className="panel-waiting-hint">Waiting for the host to start…</p>
      )}

      {/* Player list */}
      <div className="panel-player-list">
        {players.map((p) => {
          const isCurrent = started && state.currentPlayerId === p.id;
          const isMe = p.id === myId;
          return (
            <div
              key={p.id}
              className={`panel-player-row${isCurrent ? " current-turn" : ""}${p.bankrupt ? " bankrupt" : ""}${p.left ? " left" : ""}`}
            >
              <span className="panel-player-dot" style={{ background: p.color }}>
                {p.name.charAt(0).toUpperCase()}
              </span>
              <div className="panel-player-info">
                <span className="panel-player-name">
                  {p.name}{isMe ? " (you)" : ""}
                  {p.id === hostId && <span className="panel-host-badge">host</span>}
                </span>
                <div className="panel-player-status">
                  {p.bankrupt && <span className="panel-badge badge-bankrupt">bankrupt</span>}
                  {p.left && <span className="panel-badge badge-left">left</span>}
                  {p.inHolding && !p.bankrupt && <span className="panel-badge badge-holding">⛓ holding</span>}
                  {!p.connected && !p.left && <span className="panel-badge badge-dc">reconnecting…</span>}
                  {p.balance < 0 && <span className="panel-badge badge-debt">in debt</span>}
                </div>
              </div>
              <span className={`panel-player-balance${p.balance < 0 ? " negative" : ""}`}>
                ${p.balance}
              </span>
            </div>
          );
        })}
      </div>

      {/* Separator */}
      {started && log.length > 0 && <div className="panel-divider" />}

      {/* Game Log — moved here from Hud */}
      {started && (
        <div className="panel-log-section">
          <span className="panel-log-title">📋 Game Log</span>
          <div className="panel-log-list">
            {[...log].reverse().slice(0, 25).map((entry, i) => (
              <div key={i} className={`panel-log-entry${i === 0 ? " log-newest" : ""}`}>
                {entry}
              </div>
            ))}
            {log.length === 0 && <div className="panel-log-empty">Game started!</div>}
          </div>
        </div>
      )}
    </div>
  );
}
