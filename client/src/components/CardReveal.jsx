import { useEffect, useRef, useState } from "react";
import { TreasureIcon, SurpriseIcon } from "./BoardClassic";

const AUTO_DISMISS_MS = 5000;
const WASTA_TITLE = "كرت الواسطة";
const WASTA_BODY = "بس توصل رنلي";

// Eagerly fetches the Wasta card's badge art the instant this module loads,
// same reasoning as the corner-tile icons in BoardClassic.jsx -- decoded
// and cached well before a player ever actually draws this card.
const wastaBadgeImg = new Image();
wastaBadgeImg.src = "/phone-call.png";

// Non-interactive, centered on the board (rendered inside BoardClassic's
// .cv2-board so it's not accidentally centered on the full viewport, whose
// center drifts away from the board's once the side panels' widths diverge).
// No buttons of its own -- the existing "Continue" button already lives in
// the board's center action zone for a movement card's pendingAction, this
// only adds the visual. Deliberately `pointer-events: none` at the overlay
// level (see classicVintage.css) so even sitting dead center over the
// board, it can never intercept a click on the roll/continue button
// underneath it.
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
  // times out on its own after a beat.
  useEffect(() => {
    if (!visible) return undefined;
    if (pendingAction?.type === "awaitCardMove" && pendingAction.playerId === lastCard?.playerId) {
      return undefined;
    }
    dismissTimerRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimerRef.current);
  }, [visible, pendingAction, lastCard]);

  // A click anywhere dismisses the reveal early, same as the timeout --
  // listened for on window rather than the overlay itself (which stays
  // pointer-events:none) so this never swallows the click; whatever's
  // underneath (the board, the Continue button) still gets it too.
  useEffect(() => {
    if (!visible) return undefined;
    const dismiss = () => setVisible(false);
    window.addEventListener("click", dismiss);
    return () => window.removeEventListener("click", dismiss);
  }, [visible]);

  if (!visible || !lastCard) return null;

  // The Get Out of Jail Free card gets its own bespoke face (a landscape
  // ID-badge layout, not the standard portrait one) instead of the generic
  // deck text -- it's a card a player holds onto rather than one that
  // resolves immediately, so it's meant to stand out from an ordinary
  // Surprise/Treasure pull while still sharing the same parchment/diamond-
  // corner/rule-divider material. `effectType` (not the card's id) is what
  // singles it out -- see drawCard in Room.js.
  if (lastCard.effectType === "getOutFree") {
    return (
      <div className="card-reveal-overlay">
        <div className="card-reveal card-reveal--wasta">
          <div className="card-reveal-frame">
            <span className="card-reveal-corner card-reveal-corner--tl">◆</span>
            <span className="card-reveal-corner card-reveal-corner--tr">◆</span>
            <span className="card-reveal-corner card-reveal-corner--bl">◆</span>
            <span className="card-reveal-corner card-reveal-corner--br">◆</span>
          </div>
          <div className="card-reveal-wasta-content">
            <span className="card-reveal-label">{WASTA_TITLE}</span>
            <div className="card-reveal-rule">
              <span className="card-reveal-diamond card-reveal-diamond--edge">◆</span>
              <span className="card-reveal-line" />
              <span className="card-reveal-diamond">◆</span>
              <span className="card-reveal-line" />
              <span className="card-reveal-diamond card-reveal-diamond--edge">◆</span>
            </div>
            <div className="card-reveal-wasta-row">
              <img src="/phone-call.png" className="card-reveal-wasta-badge" alt="" />
              <span className="card-reveal-wasta-body">{WASTA_BODY}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isSurprise = lastCard.deck === "surprise";
  const drawnBy = players.find((p) => p.id === lastCard.playerId);

  // Same parchment/black-border/gold-diamond-rule card stock as the title-deed
  // cards, not a distinct look of its own -- the deck's own icon art sits as a
  // large, faint watermark behind the text instead of a solid color band, and
  // treasure/surprise each get a full accent-color pass (title, diamonds,
  // rules, "drawn by" line) off a single CSS variable rather than duplicated
  // per-variant rules.
  return (
    <div className="card-reveal-overlay">
      <div className={`card-reveal${isSurprise ? " card-reveal--surprise" : " card-reveal--treasure"}`}>
        <div className="card-reveal-icon-bg">{isSurprise ? <SurpriseIcon /> : <TreasureIcon />}</div>
        <div className="card-reveal-frame">
          <span className="card-reveal-corner card-reveal-corner--tl">◆</span>
          <span className="card-reveal-corner card-reveal-corner--tr">◆</span>
          <span className="card-reveal-corner card-reveal-corner--bl">◆</span>
          <span className="card-reveal-corner card-reveal-corner--br">◆</span>
        </div>
        <span className="card-reveal-label">{isSurprise ? "Surprise" : "Treasure"}</span>
        <div className="card-reveal-rule">
          <span className="card-reveal-diamond card-reveal-diamond--edge">◆</span>
          <span className="card-reveal-line" />
          <span className="card-reveal-diamond">◆</span>
          <span className="card-reveal-line" />
          <span className="card-reveal-diamond card-reveal-diamond--edge">◆</span>
        </div>
        <div className="card-reveal-text">{lastCard.text}</div>
        {drawnBy && (
          <>
            <div className="card-reveal-rule card-reveal-rule--thin" />
            <div className="card-reveal-by">
              Drawn by {drawnBy.id === myId ? "you" : drawnBy.name}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
