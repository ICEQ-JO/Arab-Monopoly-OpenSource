import { useState } from "react";

export default function CharacterCard({ char, takenBy, isMe, onSelect, playerBalance = 0 }) {
  const [flipped, setFlipped] = useState(false);
  const isTaken = !!takenBy;
  const imgSrc = playerBalance >= 3000 ? char.v2 : char.v1;

  function handleCardClick() {
    setFlipped((f) => !f);
  }

  function handleSelect(e) {
    e.stopPropagation();
    if (!isTaken && onSelect) onSelect(char.id);
  }

  return (
    <div
      className={`char-card ${flipped ? "flipped" : ""} ${isMe ? "char-card-mine" : ""} ${isTaken && !isMe ? "char-card-taken" : ""}`}
      onClick={handleCardClick}
      title={flipped ? "Click to flip back" : "Click to read abilities"}
    >
      <div className="char-card-inner">
        <div className="char-card-front">
          <div className="char-card-portrait">
            <img src={imgSrc} alt={char.name} />
          </div>
          <div className="char-card-label">
            <span className="char-card-name">{char.name}</span>
            <span className="char-card-desc">{char.description}</span>
          </div>
          {isMe && <div className="char-card-badge char-card-badge-mine">Yours</div>}
          {isTaken && !isMe && (
            <div className="char-card-badge char-card-badge-taken">
              {takenBy}
            </div>
          )}
        </div>

        <div className="char-card-back">
          <div className="char-card-back-name">{char.name}</div>
          <div className="char-card-abilities">
            {char.passive && (
              <div className="char-ability">
                <span className="char-ability-tag">Passive</span>
                <p>{char.passive}</p>
              </div>
            )}
            {char.active && (
              <div className="char-ability">
                <span className="char-ability-tag char-ability-tag-active">Active</span>
                <p>{char.active}</p>
              </div>
            )}
          </div>
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
      </div>
    </div>
  );
}
