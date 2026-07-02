import { useEffect, useRef, useState } from "react";
import { TreasureIcon, SurpriseIcon } from "./BoardClassic";

const AUTO_DISMISS_MS = 3000;

// Non-interactive, centered on screen (no buttons of its own -- the existing
// "Continue" button already lives in the board's center action zone for a
// movement card's pendingAction, this only adds the visual). Deliberately
// `pointer-events: none` at the overlay level (see App.css) so even sitting
// dead center over the board, it can never intercept a click on the
// roll/continue button underneath it.
export default function CardReveal({ state, myId, tokenMoving }) {
  const { lastCard, cardSeq, pendingAction, players } = state;
  const [visible, setVisible] = useState(false);
  const prevSeqRef = useRef(cardSeq);
  const dismissTimerRef = useRef(null);

  // A genuinely new draw is only ever signaled by cardSeq changing --
  // lastCard itself gets resent verbatim on every unrelated state broadcast
  // for the rest of the turn (chat, another player's action, etc.), and
  // re-triggering the reveal animation on those would be wrong. The server
  // sets lastCard/cardSeq as soon as it resolves the tile the player landed
  // on, which is well before the client-side token glide finishes -- so
  // prevSeqRef is deliberately left un-advanced while tokenMoving is true;
  // this effect just re-fires (without revealing) on every render until
  // tokenMoving flips back to false, at which point it reveals for real.
  useEffect(() => {
    if (cardSeq === prevSeqRef.current) return;
    if (tokenMoving) return;
    prevSeqRef.current = cardSeq;
    if (lastCard) setVisible(true);
  }, [cardSeq, tokenMoving, lastCard]);

  // A movement card holds the reveal open (so its text is still readable)
  // until the board actually updates via confirmCardMove; anything else
  // just times out on its own after a beat.
  useEffect(() => {
    if (!visible) return undefined;
    if (pendingAction?.type === "awaitCardMove" && pendingAction.playerId === lastCard?.playerId) {
      return undefined;
    }
    dismissTimerRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimerRef.current);
  }, [visible, pendingAction, lastCard]);

  if (!visible || !lastCard) return null;

  const isSurprise = lastCard.deck === "surprise";
  const drawnBy = players.find((p) => p.id === lastCard.playerId);

  return (
    <div className="card-reveal-overlay">
      <div className={`card-reveal${isSurprise ? " card-reveal--surprise" : " card-reveal--treasure"}`}>
        <div className="card-reveal-band">
          <div className="card-reveal-icon">{isSurprise ? <SurpriseIcon /> : <TreasureIcon />}</div>
          <span className="card-reveal-label">{isSurprise ? "Surprise" : "Treasure"}</span>
        </div>
        <div className="card-reveal-body">
          <div className="card-reveal-text">{lastCard.text}</div>
          {drawnBy && (
            <div className="card-reveal-by">
              Drawn by {drawnBy.id === myId ? "you" : drawnBy.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
