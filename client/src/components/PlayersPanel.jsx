import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import ThemeToggle from "./ThemeToggle";
import PlayerAvatar from "./PlayerAvatar";
import ConfirmDialog from "./ConfirmDialog";
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

export default function PlayersPanel({ state, myId, onLeave, theme, onToggleTheme, tokenMoving }) {
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

  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [sortByTurn, setSortByTurn] = useState(false);
  const sortedPlayers = sortByTurn ? players : [...players].sort((a, b) => b.balance - a.balance);

  // One-shot "+X"/"-X" popup under a player's balance whenever it changes --
  // purely a client-side diff against the last balance we saw per player
  // (prevBalances), not anything the server tracks. Keyed by a fresh id per
  // change so a second change landing mid-animation restarts the fade
  // instead of the two blending together.
  //
  // Gated on !tokenMoving (same flag CardReveal holds its own reveal on) --
  // a landing tile's rent/tax/card effect is applied server-side, and thus
  // broadcast, the instant the move resolves, well before the token's glide
  // animation actually finishes. Without this gate the flash would fire and
  // fully fade *while the token is still sliding across the board*, so by
  // the time a player's eyes catch up to the balance change (or a card
  // reveal even opens) there'd be nothing left to see. Balances are still
  // diffed against their pre-move snapshot every render, just not flashed
  // (or folded into prevBalances) until the glide -- and any card reveal
  // riding on it -- has actually landed.
  const prevBalances = useRef({});
  const [flashes, setFlashes] = useState({});
  useEffect(() => {
    if (tokenMoving) return;
    const prev = prevBalances.current;
    const next = {};
    const changed = {};
    for (const p of players) {
      next[p.id] = p.balance;
      if (prev[p.id] !== undefined && prev[p.id] !== p.balance) {
        changed[p.id] = { id: `${p.id}-${Date.now()}`, delta: p.balance - prev[p.id] };
      }
    }
    prevBalances.current = next;
    if (Object.keys(changed).length > 0) {
      setFlashes((f) => ({ ...f, ...changed }));
    }
  }, [players, tokenMoving]);

  function clearFlash(playerId, flashId) {
    setFlashes((f) => {
      if (f[playerId]?.id !== flashId) return f;
      const rest = { ...f };
      delete rest[playerId];
      return rest;
    });
  }

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
          <button className="panel-leave-btn" onClick={() => setConfirmingLeave(true)}>Leave</button>
        </div>
      </div>

      {confirmingLeave && (
        <ConfirmDialog
          title="Leave game?"
          message="You'll forfeit your seat and properties -- this can't be undone."
          confirmLabel="Leave"
          cancelLabel="Stay"
          danger
          onCancel={() => setConfirmingLeave(false)}
          onConfirm={() => { setConfirmingLeave(false); onLeave(); }}
        />
      )}

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
        <button
          className="panel-sort-btn"
          onClick={() => setSortByTurn((v) => !v)}
        >
          {sortByTurn ? "By Turn" : "By Balance"}
        </button>
      </div>
      <div className="panel-player-list">
        {sortedPlayers.map((p) => {
          const isCurrent = started && !state.winnerId && currentPlayerId === p.id;
          const isMe = p.id === myId;
          return (
            <div
              key={p.id}
              className={`panel-player-row${isCurrent ? " current-turn" : ""}${p.bankrupt ? " bankrupt" : ""}${p.left ? " left" : ""}`}
              style={isCurrent ? { "--c": p.color } : undefined}
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
                  {!p.connected && !p.left && <span className="panel-badge badge-dc">reconnecting…</span>}
                  {p.balance < 0 && <span className="panel-badge badge-debt">in debt</span>}
                </div>
              </div>
              {isCurrent && <TurnCountdown deadline={state.turnDeadline} />}
              <span className={`panel-player-balance${p.balance < 0 ? " negative" : ""}`}>
                ${p.balance}
                {flashes[p.id] && (
                  <span
                    key={flashes[p.id].id}
                    className={`balance-flash${flashes[p.id].delta > 0 ? " positive" : " negative"}`}
                    onAnimationEnd={() => clearFlash(p.id, flashes[p.id].id)}
                  >
                    {flashes[p.id].delta > 0 ? "+" : "-"}${Math.abs(flashes[p.id].delta)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
