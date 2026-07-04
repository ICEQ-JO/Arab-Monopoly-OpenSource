import { useEffect, useRef, useState } from "react";

const AUTO_DISMISS_MS = 5000;
const WASTA_TITLE = "كرت الواسطة";
const SUCCESS_BODY = "وصلت الواسطة";
const FAIL_BODY = "والله يا غالي كنت باجتماع مسكر وتلفوني سايلنت، حقك علي.";
const SUCCESS_BADGE_SRC = "/phone-call.png";
const FAIL_BADGE_SRC = "/phone-call-fail.png";

// Eagerly decoded the same way CardReveal.jsx preloads phone-call.png --
// this badge only ever appears the first time a wasta attempt actually
// fails, well after the game has started, so without this it would pop in
// visibly on that first failure instead of already being cached.
const failBadgeImg = new Image();
failBadgeImg.src = FAIL_BADGE_SRC;

// Reveal for a resolved useHoldingFreeCard attempt (Room.WASTA_SUCCESS_RATE --
// the card no longer guarantees release). Reuses the exact same "Wasta card"
// shell CardReveal.jsx already built for the card-draw reveal (frame,
// corners, rule, phone-call badge) since this is still the same card's
// identity, just a different moment -- only the body line changes with the
// outcome. A separate component (not folded into CardReveal) because the two
// are driven by unrelated trigger sources (cardSeq vs wastaSeq) that could in
// principle fire independently; keeping them apart avoids one's dismiss timer
// fighting the other's.
export default function WastaAttemptReveal({ state, myId }) {
  const { lastWastaAttempt, wastaSeq, players } = state;
  const [visible, setVisible] = useState(false);
  const prevSeqRef = useRef(wastaSeq);
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    if (wastaSeq === prevSeqRef.current) return;
    prevSeqRef.current = wastaSeq;
    if (lastWastaAttempt) setVisible(true);
  }, [wastaSeq, lastWastaAttempt]);

  useEffect(() => {
    if (!visible) return undefined;
    dismissTimerRef.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimerRef.current);
  }, [visible]);

  // Same early-dismiss-on-click behavior as CardReveal, listened for on
  // window (not the overlay, which stays pointer-events:none) so it never
  // swallows a click meant for the board underneath.
  useEffect(() => {
    if (!visible) return undefined;
    const dismiss = () => setVisible(false);
    window.addEventListener("click", dismiss);
    return () => window.removeEventListener("click", dismiss);
  }, [visible]);

  if (!visible || !lastWastaAttempt) return null;

  const attemptedBy = players.find((p) => p.id === lastWastaAttempt.playerId);
  const body = lastWastaAttempt.success ? SUCCESS_BODY : FAIL_BODY;
  const badgeSrc = lastWastaAttempt.success ? SUCCESS_BADGE_SRC : FAIL_BADGE_SRC;

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
            <img src={badgeSrc} className="card-reveal-wasta-badge" alt="" />
            <span className="card-reveal-wasta-body">{body}</span>
          </div>
          {attemptedBy && (
            <>
              <div className="card-reveal-rule card-reveal-rule--thin" />
              <div className="card-reveal-by">
                {attemptedBy.id === myId ? "You" : attemptedBy.name} tried the wasta
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
