import PlayerAvatar from "./PlayerAvatar";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Swaps every occurrence of a player's name in a log line for their icon
// instead -- "Bob rolled a 9" reads as "[icon] rolled a 9". Longest names
// first in the pattern so a name that's a substring of another player's
// (e.g. "Ann" inside "Anna") can't shadow the longer match.
function renderEntry(text, players, key) {
  const named = (players || []).filter((p) => p.name);
  if (named.length === 0) return text;
  const sorted = [...named].sort((a, b) => b.name.length - a.name.length);
  const pattern = sorted.map((p) => escapeRegExp(p.name)).join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "g"));
  return parts.map((part, i) => {
    const player = named.find((p) => p.name === part);
    return player ? <PlayerAvatar key={`${key}-${i}`} player={player} sizeClass="log-avatar" /> : part;
  });
}

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
            {renderEntry(entry, state.players, i)}
          </div>
        ))}
        {entries.length === 0 && <div className="game-log-empty">Game started!</div>}
      </div>
    </div>
  );
}
