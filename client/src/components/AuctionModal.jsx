import { useEffect, useState } from "react";
import { socket } from "../socket";
import { IconClock } from "./icons";

function AuctionCountdown({ deadline }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));
  return (
    <p className={`turn-countdown ${secondsLeft <= 3 ? "turn-countdown-urgent" : ""}`}>
      <IconClock /> closes in {secondsLeft}s{secondsLeft <= 3 ? " -- bid now to extend" : ""}
    </p>
  );
}

function AuctionCard({ auction, board, players, myId }) {
  const tile = board[auction.tileId];
  const highBidder = players.find((p) => p.id === auction.highestBidderId);
  const hasPassed = auction.passedIds.includes(myId);
  const [error, setError] = useState("");

  // Each button bids directly off whatever the current highest bid is right now,
  // rather than accumulating a typed-in amount first -- one click is one bid, no
  // separate "confirm" step, since the whole point is to be fast and responsive
  // during a live bidding war.
  function bidBy(increment) {
    setError("");
    socket.emit("placeBid", { auctionId: auction.id, amount: auction.highestBid + increment }, (res) => {
      if (res?.error) setError(res.error);
    });
  }

  function pass() {
    socket.emit("passAuction", { auctionId: auction.id });
  }

  return (
    <div className="trade-card">
      <p>
        <strong>{tile.name}</strong> is up for auction
      </p>
      <p className="trade-side">
        {highBidder ? `High bid: $${auction.highestBid} by ${highBidder.name}` : "No bids yet"}
      </p>
      <AuctionCountdown deadline={auction.deadline} />
      {hasPassed ? (
        <p className="hint">You passed on this auction.</p>
      ) : (
        <div className="action-row">
          <button className="primary" onClick={() => bidBy(1)}>
            +$1
          </button>
          <button className="primary" onClick={() => bidBy(10)}>
            +$10
          </button>
          <button className="primary" onClick={() => bidBy(100)}>
            +$100
          </button>
          <button onClick={pass}>Pass</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Auto-opening overlay (no manual open/close, unlike TradeModal) -- mounted
// unconditionally in App.jsx and self-gates on whether any auction is live,
// since there's no "close" while one is active for you to bid or pass on.
export default function AuctionModal({ state, myId }) {
  const { auctions, board, players } = state;
  if (!auctions || auctions.length === 0) return null;

  return (
    <div className="trade-modal-overlay">
      <div className="trade-modal">
        <div className="trade-modal-header">
          <h2>Auctions</h2>
        </div>
        <div className="trade-modal-body">
          <div className="trade-list">
            {auctions.map((a) => (
              <AuctionCard key={a.id} auction={a} board={board} players={players} myId={myId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
