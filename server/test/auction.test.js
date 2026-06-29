import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup } from "./helpers.js";
import { AUCTION_EXTEND_MS } from "../src/game/Room.js";

test("declining a purchase opens an auction and blocks the decliner's own turn", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };

  const result = room.declineBuy("p0");

  assert.deepEqual(result, { ok: true });
  assert.equal(room.auctions.length, 1);
  assert.equal(room.pendingAction.type, "auction");
  assert.equal(room.rollDice("p0").error, "Resolve the current action first");
  assert.equal(room.playerEndTurn("p0").error, "Resolve the current action first");
});

test("a bid that doesn't beat the current highest is rejected", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };
  room.declineBuy("p0");
  const auctionId = room.auctions[0].id;
  room.players[1].balance = 1000;

  room.placeBid("p1", auctionId, 50);
  const result = room.placeBid("p0", auctionId, 50);

  assert.equal(result.error, "Bid must be higher than the current highest bid");
});

test("bidding more than you have is rejected", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };
  room.declineBuy("p0");
  const auctionId = room.auctions[0].id;
  room.players[1].balance = 10;

  const result = room.placeBid("p1", auctionId, 50);

  assert.equal(result.error, "Not enough coins");
});

test("an auction resolves once the sole remaining bidder is already the high bidder", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };
  room.declineBuy("p0");
  const auctionId = room.auctions[0].id;
  room.players[1].balance = 1000;

  room.placeBid("p1", auctionId, 50);
  room.passAuction("p0", auctionId);
  room.passAuction("p2", auctionId);

  assert.equal(room.auctions.length, 0, "resolved immediately, no need to wait for the timer");
  assert.equal(room.ownership[1].ownerId, "p1");
  assert.equal(room.players[1].balance, 950);
  assert.equal(room.pendingAction, null, "the original decliner's turn is unblocked");
});

test("the auction does NOT auto-award to the last remaining player if they haven't bid yet", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };
  room.declineBuy("p0");
  const auctionId = room.auctions[0].id;

  room.passAuction("p0", auctionId);
  room.passAuction("p2", auctionId);

  assert.equal(room.auctions.length, 1, "Bob is still owed a chance to bid or pass");
  assert.equal(room.ownership[1], undefined);
});

test("an all-pass auction leaves the tile unowned", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };
  room.declineBuy("p0");
  const auctionId = room.auctions[0].id;

  room.passAuction("p0", auctionId);
  room.passAuction("p1", auctionId);

  assert.equal(room.auctions.length, 0);
  assert.equal(room.ownership[1], undefined);
});

test("a kicked high bidder's winning bid is voided rather than letting them win posthumously", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };
  room.declineBuy("p0");
  const auctionId = room.auctions[0].id;
  room.players[1].balance = 1000;
  room.placeBid("p1", auctionId, 50);

  room.kickPlayer("p1", "disconnected");

  const auction = room.auctions.find((a) => a.id === auctionId);
  assert.equal(auction.highestBidderId, null);
  assert.equal(auction.highestBid, 0);
  assert.ok(auction.passedIds.includes("p1"));
});

test("placing a bid extends the deadline but never shortens an already-later one", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitBuy", tileId: 1, playerId: "p0" };
  room.declineBuy("p0");
  const auctionId = room.auctions[0].id;
  const auction = room.auctions[0];
  room.players[1].balance = 1000;

  const farFutureDeadline = Date.now() + 60 * 1000;
  auction.deadline = farFutureDeadline;

  room.placeBid("p1", auctionId, 50);

  assert.equal(auction.deadline, farFutureDeadline, "a far-future deadline isn't shortened by a new bid");

  auction.deadline = Date.now() - 1000; // simulate a deadline that's effectively already passed
  room.placeBid("p1", auctionId, 60);

  assert.ok(
    auction.deadline >= Date.now() + AUCTION_EXTEND_MS - 50,
    "a near/past deadline is extended forward by at least AUCTION_EXTEND_MS"
  );
});
