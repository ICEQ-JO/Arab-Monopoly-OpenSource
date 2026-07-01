export default function CharacterCard({ char, takenBy, isMe, onSelect }) {
  const isTaken = !!takenBy;

  function handleSelect() {
    if (!isTaken && onSelect) onSelect(char.id);
  }

  return (
    <div className={`char-card ${isMe ? "char-card-mine" : ""} ${isTaken && !isMe ? "char-card-taken" : ""}`}>
      <div className="char-card-portrait">
        <img src={char.img} alt={char.name} />
      </div>
      <div className="char-card-label">
        <span className="char-card-name">{char.name}</span>
      </div>
      {isMe && <div className="char-card-badge char-card-badge-mine">Yours</div>}
      {isTaken && !isMe && (
        <div className="char-card-badge char-card-badge-taken">
          {takenBy}
        </div>
      )}
      {isMe ? (
        <button className="char-select-btn" onClick={handleSelect}>
          Change character
        </button>
      ) : isTaken ? (
        <p className="char-taken-label">Taken by {takenBy}</p>
      ) : (
        <button className="primary char-select-btn" onClick={handleSelect}>
          Play as {char.name}
        </button>
      )}
    </div>
  );
}
