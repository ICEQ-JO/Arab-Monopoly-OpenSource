import { renderLogEntry } from "../logEntry";

// Right-sidebar game log, below Open Trades -- was previously rendered
// inside the board's center panel (see BoardClassic.jsx history), moved
// here to free that space up for the dice/action zones.
export default function GameLog({ state }) {
  if (!state.started) return null;

  // Server already stores this.log newest-first (pushLog unshifts), so no
  // reversal needed -- entries[0] is genuinely the most recent one.
  const entries = (state.log || []).slice(0, 25);

  return (
    <div className="game-log-panel">
      <span className="game-log-title">📋 Game Log</span>
      <div className="game-log-list">
        {entries.map((entry, i) => (
          <div key={i} className={`game-log-entry${i === 0 ? " game-log-newest" : ""}`}>
            {renderLogEntry(entry, state.players, i)}
          </div>
        ))}
        {entries.length === 0 && <div className="game-log-empty">Game started!</div>}
      </div>
    </div>
  );
}
