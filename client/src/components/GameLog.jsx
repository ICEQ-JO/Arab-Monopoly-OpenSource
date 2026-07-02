// Right-sidebar game log, below Open Trades -- was previously rendered
// inside the board's center panel (see BoardClassic.jsx history), moved
// here to free that space up for the dice/action zones.
export default function GameLog({ state }) {
  if (!state.started) return null;

  const entries = [...(state.log || [])].reverse().slice(0, 25);

  return (
    <div className="game-log-panel">
      <span className="game-log-title">📋 Game Log</span>
      <div className="game-log-list">
        {entries.map((entry, i) => (
          <div key={i} className={`game-log-entry${i === 0 ? " game-log-newest" : ""}`}>
            {entry}
          </div>
        ))}
        {entries.length === 0 && <div className="game-log-empty">Game started!</div>}
      </div>
    </div>
  );
}
