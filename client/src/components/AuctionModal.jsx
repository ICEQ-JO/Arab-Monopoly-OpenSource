import { useEffect, useState } from "react";
import { socket } from "../socket";
import { IconClock } from "./icons";
import PlayerAvatar from "./PlayerAvatar";
import PropertyCardDetail from "./PropertyCardDetail";
import TransitCardDetail from "./TransitCardDetail";

const BID_INCREMENTS = [1, 10, 100];

function AuctionTimer({ deadline }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));
  const urgent = secondsLeft <= 3;
  return (
    <div className={`auction-timer${urgent ? " urgent" : ""}`}>
      <IconClock /> Closes in {secondsLeft}s{urgent ? " -- bid now to extend" : ""}
    </div>
  );
}

// Left column -- same title-deed card used everywhere else a tile's price/rent
// needs showing (board click, My Properties), just with no owner and actions
// hidden -- nothing to manage yet, this tile isn't owned by anyone until the
// auction resolves.
function AuctionTileCard({ tile }) {
  if (tile.type === "transit") {
    return <TransitCardDetail tile={tile} showActions={false} />;
  }
  return <PropertyCardDetail tile={tile} showActions={false} />;
}

function AuctionCard({ auction, board, players, myId }) {
  const tile = board[auction.tileId];
  const me = players.find((p) => p.id === myId);
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

  return (
    <div className="auction-layout">
      <div className="auction-info-col">
        <AuctionTileCard tile={tile} />
      </div>

      <div className="auction-bid-col">
        <AuctionTimer deadline={auction.deadline} />

        <div className="auction-highbid">
          {highBidder ? (
            <>
              High bid <strong>${auction.highestBid}</strong> by{" "}
              <PlayerAvatar player={highBidder} sizeClass="log-avatar" />{" "}
              {highBidder.id === myId ? "you" : highBidder.name}
            </>
          ) : (
            "No bids yet"
          )}
        </div>

        {hasPassed ? (
          <p className="hint" style={{ margin: 0 }}>You passed on this auction.</p>
        ) : (
          <div className="auction-bid-actions">
            {BID_INCREMENTS.map((inc) => (
              <button
                key={inc}
                className="primary"
                onClick={() => bidBy(inc)}
                disabled={(me?.balance ?? 0) < auction.highestBid + inc}
              >
                +${inc}
              </button>
            ))}
          </div>
        )}

        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

        <div className="auction-log">
          {auction.log.length === 0 ? (
            <p className="auction-log-empty">No bids yet -- be the first.</p>
          ) : (
            // Newest first -- see Room.placeBid/passAuction, which unshift.
            auction.log.map((entry, i) => {
              const bidder = players.find((p) => p.id === entry.playerId);
              return (
                <p key={i} className="auction-log-row">
                  <PlayerAvatar player={bidder} sizeClass="log-avatar" />
                  <span>
                    {bidder?.name ?? "A player"} {entry.passed ? "passed." : `bid $${entry.amount}.`}
                  </span>
                </p>
              );
            })
          )}
        </div>
      </div>
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
      <div className="trade-modal auction-modal">
        <div className="trade-modal-header">
          <h2>{auctions.length > 1 ? "Auctions" : `${board[auctions[0].tileId].name} -- Auction`}</h2>
        </div>
        <div className="trade-modal-body">
          {auctions.map((a, i) => (
            <div key={a.id} className={i > 0 ? "auction-card-block" : undefined}>
              {auctions.length > 1 && <p className="trade-section-label">{board[a.tileId].name}</p>}
              <AuctionCard auction={a} board={board} players={players} myId={myId} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
