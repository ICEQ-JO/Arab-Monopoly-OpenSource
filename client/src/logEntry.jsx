import PlayerAvatar from "./components/PlayerAvatar";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Swaps every occurrence of a player's name in a log line for their icon
// instead -- "Bob rolled a 9" reads as "[icon] rolled a 9". Longest names
// first in the pattern so a name that's a substring of another player's
// (e.g. "Ann" inside "Anna") can't shadow the longer match. Shared by
// GameLog (the main right-sidebar log) and the auction modal's per-tile
// bid log, both of which get plain "<name> did X." strings from the server.
export function renderLogEntry(text, players, key) {
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
