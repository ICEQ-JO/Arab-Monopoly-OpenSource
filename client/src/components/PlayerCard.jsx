import { useState } from "react";
import { CHARACTERS } from "../data/characters";

export default function PlayerCard({ player, onLeave }) {
  const [flipped, setFlipped] = useState(false);
  if (!player) return null;
  const char = CHARACTERS.find((c) => c.id === player.characterId);
  if (!char) return null;
  const imgSrc = player.balance >= 3000 ? char.v2 : char.v1;

  return (
    <div
      className={`player-card ${flipped ? "flipped" : ""}`}
      onClick={() => setFlipped((f) => !f)}
      title={flipped ? "Click to flip back" : "Click to read abilities"}
    >
      <div className="player-card-inner">
        <div className="player-card-front">
          <button
            className="player-card-leave-btn"
            onClick={(e) => { e.stopPropagation(); onLeave?.(); }}
          >
            Leave
          </button>
          <div className="player-card-portrait">
            <img src={imgSrc} alt={char.name} />
          </div>
          <div className="player-card-label">
            <span className="player-card-name">{char.name}</span>
            <span className="player-card-desc">{char.description}</span>
          </div>
          <div className="player-card-tracker" />
        </div>

        <div className="player-card-back">
          <div className="player-card-back-name">{char.name}</div>
          <div className="player-card-abilities">
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
        </div>
      </div>
    </div>
  );
}
