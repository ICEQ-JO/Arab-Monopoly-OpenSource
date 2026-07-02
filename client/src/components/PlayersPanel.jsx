import { useEffect, useState } from "react";
import { socket } from "../socket";
import ThemeToggle from "./ThemeToggle";
import PlayerAvatar from "./PlayerAvatar";
import { IconClock } from "./icons";

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
    <span className={`panel-turn-countdown${secondsLeft <= 30 ? " urgent" : ""}`}>
      <IconClock /> {mins}:{secs}
    </span>
  );
}

export default function PlayersPanel({ state, myId, onOpenTrade, onLeave, theme, onToggleTheme }) {
  const { players, roomCode, hostId, started, winnerId } = state;
  const isHost = hostId === myId;
  const currentPlayerId = started ? players[state.turnIndex]?.id : null;
  const activePlayers = players.filter((p) => !p.left);
  const allIconsChosen = activePlayers.every((p) => p.icon);
  const [startError, setStartError] = useState("");

  function startGame() {
    setStartError("");
    socket.emit("startGame", (res) => {
      if (res?.error) setStartError(res.error);
    });
  }

  const pendingTrades = (state.trades || []).filter((t) => t.toId === myId).length;

  return (
    <div className="players-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-room-code">
          <span className="panel-room-label">Room</span>
          <span className="panel-room-value">{roomCode}</span>
        </div>
        <div className="panel-header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} inline />
          <button className="panel-leave-btn" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {/* Winner banner */}
      {winnerId && (
        <div className="panel-winner-banner">
          🏆 {players.find((p) => p.id === winnerId)?.name} wins!
        </div>
      )}

      {/* Pre-game start button */}
      {!started && isHost && players.length >= 2 && allIconsChosen && (
        <button className="panel-start-btn" onClick={startGame}>
          ▶ Start Game
        </button>
      )}
      {!started && isHost && players.length < 2 && (
        <p className="panel-waiting-hint">Waiting for more players…</p>
      )}
      {!started && isHost && players.length >= 2 && !allIconsChosen && (
        <p className="panel-waiting-hint">Waiting for everyone to pick an icon…</p>
      )}
      {!started && !isHost && (
        <p className="panel-waiting-hint">Waiting for the host to start…</p>
      )}
      {!started && startError && <p className="error">{startError}</p>}

      {/* Player list */}
      <div className="panel-list-header">
        <span className="panel-list-label">Players</span>
      </div>
      <div className="panel-player-list">
        {players.map((p) => {
          const isCurrent = started && !state.winnerId && currentPlayerId === p.id;
          const isMe = p.id === myId;
          return (
            <div
              key={p.id}
              className={`panel-player-row${isCurrent ? " current-turn" : ""}${p.bankrupt ? " bankrupt" : ""}${p.left ? " left" : ""}`}
            >
              <PlayerAvatar player={p} sizeClass="panel-player-dot" />
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
              {isCurrent && <TurnCountdown deadline={state.turnDeadline} />}
              <span className={`panel-player-balance${p.balance < 0 ? " negative" : ""}`}>
                ${p.balance}
              </span>
            </div>
          );
        })}
      </div>

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
    </div>
  );
}
