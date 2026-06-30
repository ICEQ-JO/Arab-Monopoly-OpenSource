import { socket } from "../socket";
import { CHARACTERS } from "../data/characters";
import CharacterCard from "./CharacterCard";

export default function CharacterSelect({ state, myId, onLeave }) {
  const me = state.players.find((p) => p.id === myId);
  const isHost = state.hostId === myId;
  const sel = state.characterSelections || {};
  const myChar = sel[myId];
  const allSelected = state.players.length >= 2 && state.players.every((p) => sel[p.id]);

  function selectCharacter(characterId) {
    socket.emit("selectCharacter", { characterId });
  }

  function resetSelections() {
    socket.emit("resetCharacterSelections");
  }

  function startGame() {
    socket.emit("startGame");
  }

  // Build a reverse map: characterId -> player name (seat name before game starts)
  const charToPlayer = {};
  for (const [pid, cid] of Object.entries(sel)) {
    const player = state.players.find((p) => p.id === pid);
    if (player) charToPlayer[cid] = player.name;
  }

  return (
    <div className="char-select-screen">
      <div className="char-select-header">
        <h1 className="char-select-title">Monoboly عرب</h1>
        <div className="char-select-meta">
          <span className="char-select-room-code">Room: <strong>{state.code}</strong></span>
          <button className="leave-btn" onClick={onLeave}>Leave</button>
        </div>
      </div>

      <div className="char-select-players">
        {state.players.map((p) => {
          const charId = sel[p.id];
          const char = CHARACTERS.find((c) => c.id === charId);
          return (
            <div key={p.id} className={`char-select-player-chip ${p.id === myId ? "chip-me" : ""}`}>
              <span className="swatch" style={{ background: p.color }} />
              <span>{p.id === myId ? "You" : p.name}</span>
              {char ? <span className="chip-char-name">{char.name}</span> : <span className="chip-picking">picking…</span>}
              {state.hostId === p.id && <span className="badge">Host</span>}
            </div>
          );
        })}
      </div>

      <h2 className="char-select-subtitle">Choose your character</h2>
      <p className="char-select-hint">Click a card to read abilities — then select from the back.</p>

      <div className="char-grid">
        {CHARACTERS.map((char) => {
          const takenBy = charToPlayer[char.id];
          const takenByMe = sel[myId] === char.id;
          return (
            <CharacterCard
              key={char.id}
              char={char}
              takenBy={takenByMe ? null : takenBy}
              isMe={takenByMe}
              onSelect={selectCharacter}
            />
          );
        })}
      </div>

      <div className="char-select-actions">
        {isHost ? (
          <>
            <button onClick={resetSelections} disabled={Object.keys(sel).length === 0}>
              Reset selections
            </button>
            <button
              className="primary"
              onClick={startGame}
              disabled={!allSelected}
              title={!allSelected ? "All players must choose a character first" : ""}
            >
              Start game
            </button>
          </>
        ) : (
          <p className="hint">
            {myChar ? "Waiting for the host to start the game…" : "Pick a character to get ready."}
          </p>
        )}
      </div>
    </div>
  );
}
