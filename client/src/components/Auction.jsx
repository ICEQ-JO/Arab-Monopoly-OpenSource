import { useEffect, useState } from "react";
import { socket } from "../socket";

function AuctionCountdown({ deadline }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));
  return (
    <p className={`turn-countdown ${secondsLeft <= 3 ? "turn-countdown-urgent" : ""}`}>
      ⏱ closes in {secondsLeft}s{secondsLeft <= 3 ? " -- bid now to extend" : ""}
    </p>
  );
}

function AuctionCard({ auction, board, players, myId }) {
  const tile = board[auction.tileId];
  const highBidder = players.find((p) => p.id === auction.highestBidderId);
  const hasPassed = auction.passedIds.includes(myId);
  const [bid, setBid] = useState(auction.highestBid + 10);
  const [error, setError] = useState("");

  function placeBid() {
    setError("");
    socket.emit("placeBid", { auctionId: auction.id, amount: Number(bid) }, (res) => {
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
          <input
            type="number"
            min={auction.highestBid + 1}
            value={bid}
            onChange={(e) => setBid(e.target.value)}
            style={{ width: 90 }}
          />
          <button className="primary" onClick={placeBid}>
            Bid
          </button>
          <button onClick={pass}>Pass</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function Auction({ state, myId }) {
  const { auctions, board, players } = state;
  if (!auctions || auctions.length === 0) return null;

  return (
    <div className="hud-section">
      <h3>Auctions</h3>
      <div className="trade-list">
        {auctions.map((a) => (
          <AuctionCard key={a.id} auction={a} board={board} players={players} myId={myId} />
        ))}
      </div>
    </div>
  );
}
