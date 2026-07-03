import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup } from "./helpers.js";

test("a player in debt can request money via trade while offering none (Pass 14 regression)", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  const bob = room.players[1];
  alice.balance = -50;
  bob.balance = 200;

  const propose = room.proposeTrade("p0", { toId: "p1", offerMoney: 0, requestMoney: 80 });
  assert.equal(propose.ok, true);

  const accept = room.respondTrade("p1", propose.tradeId, true);

  assert.deepEqual(accept, { ok: true });
  assert.equal(alice.balance, 30);
  assert.equal(bob.balance, 120);
});

test("a player in debt is still blocked from offering money they don't have", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = -50;
  room.players[1].balance = 200;

  const propose = room.proposeTrade("p0", { toId: "p1", offerMoney: 30, requestMoney: 0 });
  const accept = room.respondTrade("p1", propose.tradeId, true);

  assert.equal(accept.error, "One of the players can no longer afford this trade");
  assert.equal(alice.balance, -50, "untouched -- the trade never executed");
});

test("offering a mortgaged property is rejected", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[0].properties = [3];
  room.ownership[3] = { ownerId: "p0", houses: 0, mortgaged: true };

  const propose = room.proposeTrade("p0", { toId: "p1", offerProperties: [3] });

  assert.equal(propose.error, "You can only offer undeveloped properties you own");
});

test("offering a developed property is rejected", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[0].properties = [3];
  room.ownership[3] = { ownerId: "p0", houses: 2 };

  const propose = room.proposeTrade("p0", { toId: "p1", offerProperties: [3] });

  assert.equal(propose.error, "You can only offer undeveloped properties you own");
});

test("a Get Out of Jail Free card can be offered in a trade and transfers on acceptance", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  const bob = room.players[1];
  alice.holdingFreeCard = true;

  const propose = room.proposeTrade("p0", { toId: "p1", offerJailCard: true });
  assert.equal(propose.ok, true);

  const accept = room.respondTrade("p1", propose.tradeId, true);

  assert.deepEqual(accept, { ok: true });
  assert.equal(alice.holdingFreeCard, false);
  assert.equal(bob.holdingFreeCard, true);
});

test("offering a Get Out of Jail Free card you don't have is rejected", () => {
  const room = makeRoom();
  after(() => cleanup(room));

  const propose = room.proposeTrade("p0", { toId: "p1", offerJailCard: true });

  assert.equal(propose.error, "You don't have a Get Out of Jail Free card to offer");
});

test("requesting a Get Out of Jail Free card the other player no longer has is rejected on acceptance", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const bob = room.players[1];
  bob.holdingFreeCard = true;

  const propose = room.proposeTrade("p0", { toId: "p1", requestJailCard: true });
  assert.equal(propose.ok, true);

  bob.holdingFreeCard = false; // spent it (e.g. used to leave the Holding Pen) before responding
  const accept = room.respondTrade("p1", propose.tradeId, true);

  assert.equal(accept.error, "The request is no longer valid");
});

test("counterTrade replaces the original offer and flips the direction", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[1].balance = 500;

  const propose = room.proposeTrade("p0", { toId: "p1", requestMoney: 50 });
  const counter = room.counterTrade("p1", propose.tradeId, { requestMoney: 20 });

  assert.equal(counter.ok, true);
  assert.equal(room.trades.length, 1, "the original was replaced, not appended alongside");
  const trade = room.trades[0];
  assert.equal(trade.fromId, "p1", "counterer becomes the new proposer");
  assert.equal(trade.toId, "p0");
  assert.equal(trade.counterOf, propose.tradeId);
});

test("only the trade's recipient may counter it", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const propose = room.proposeTrade("p0", { toId: "p1", requestMoney: 50 });

  const result = room.counterTrade("p0", propose.tradeId, { requestMoney: 20 });

  assert.equal(result.error, "Trade not found");
});

test("accepting re-validates ownership at acceptance time, not proposal time", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[0].properties = [3];
  room.ownership[3] = { ownerId: "p0", houses: 0 };

  const propose = room.proposeTrade("p0", { toId: "p1", offerProperties: [3] });

  // Alice sells the property to the bank (mortgages it) before Bob responds.
  room.mortgageProperty("p0", 3);

  const accept = room.respondTrade("p1", propose.tradeId, true);

  assert.equal(accept.error, "The offer is no longer valid");
});

test("kicking a player clears any trade they're party to", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  room.proposeTrade("p0", { toId: "p1", requestMoney: 10 });
  assert.equal(room.trades.length, 1);

  room.kickPlayer("p0", "left the game");

  assert.equal(room.trades.length, 0);
});

test("completing a trade auto-cancels another pending trade offering the same property", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.properties = [3];
  room.ownership[3] = { ownerId: "p0", houses: 0, mortgaged: false };

  const toBob = room.proposeTrade("p0", { toId: "p1", offerProperties: [3], requestMoney: 50 });
  const toCarol = room.proposeTrade("p0", { toId: "p2", offerProperties: [3], requestMoney: 60 });
  assert.equal(toBob.ok, true);
  assert.equal(toCarol.ok, true);
  assert.equal(room.trades.length, 2);

  const accept = room.respondTrade("p1", toBob.tradeId, true);

  assert.deepEqual(accept, { ok: true });
  assert.equal(room.trades.length, 0, "the stale offer to Carol on the now-traded-away property was auto-cancelled");
  assert.match(room.log[0], /no longer valid/);
});

test("completing a trade auto-cancels another pending trade offering the same Get Out of Jail Free card", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.holdingFreeCard = true;

  const toBob = room.proposeTrade("p0", { toId: "p1", offerJailCard: true, requestMoney: 10 });
  const toCarol = room.proposeTrade("p0", { toId: "p2", offerJailCard: true, requestMoney: 10 });
  assert.equal(toBob.ok, true);
  assert.equal(toCarol.ok, true);

  const accept = room.respondTrade("p1", toBob.tradeId, true);

  assert.deepEqual(accept, { ok: true });
  assert.equal(room.trades.length, 0, "the stale jail-card offer to Carol was auto-cancelled");
  assert.equal(room.players[1].holdingFreeCard, true);
  assert.equal(alice.holdingFreeCard, false);
});

test("completing a trade auto-cancels another pending trade the proposer can no longer afford", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = 100;

  const toBob = room.proposeTrade("p0", { toId: "p1", offerMoney: 80 });
  const toCarol = room.proposeTrade("p0", { toId: "p2", offerMoney: 80 });
  assert.equal(toBob.ok, true);
  assert.equal(toCarol.ok, true);

  const accept = room.respondTrade("p1", toBob.tradeId, true);

  assert.deepEqual(accept, { ok: true });
  assert.equal(alice.balance, 20);
  assert.equal(room.trades.length, 0, "the stale offer to Carol ($80, Alice only has $20 left) was auto-cancelled");
});

test("a time-limited trade carries a deadline and auto-expires once it passes", async () => {
  const room = makeRoom();
  after(() => cleanup(room));

  const propose = room.proposeTrade("p0", { toId: "p1", requestMoney: 10, timeLimitSec: 10 });
  assert.equal(propose.ok, true);
  const trade = room.trades[0];
  assert.ok(trade.deadline > Date.now(), "deadline is set in the future");

  // Fast-forward past the deadline directly rather than actually waiting --
  // scheduleTradeTimer clamps a past deadline's delay to 0, so re-arming it
  // now fires on the next tick same as if real time had passed.
  trade.deadline = Date.now() - 1;
  room.scheduleTradeTimer(trade.id);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(room.trades.length, 0, "the expired trade is gone");
  assert.match(room.log[0], /expired/);
});

test("a trade with no time limit never gets a deadline", () => {
  const room = makeRoom();
  after(() => cleanup(room));

  const propose = room.proposeTrade("p0", { toId: "p1", requestMoney: 10 });

  assert.equal(room.trades.find((t) => t.id === propose.tradeId).deadline, null);
});

test("an out-of-range time limit is rejected", () => {
  const room = makeRoom();
  after(() => cleanup(room));

  const tooShort = room.proposeTrade("p0", { toId: "p1", requestMoney: 10, timeLimitSec: 1 });
  const tooLong = room.proposeTrade("p0", { toId: "p1", requestMoney: 10, timeLimitSec: 99999 });

  assert.equal(tooShort.error, "Invalid time limit");
  assert.equal(tooLong.error, "Invalid time limit");
});

test("accepting a time-limited trade before it expires cancels the pending timer", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[1].balance = 500;

  const propose = room.proposeTrade("p0", { toId: "p1", requestMoney: 10, timeLimitSec: 30 });
  const accept = room.respondTrade("p1", propose.tradeId, true);

  assert.equal(accept.ok, true);
  assert.equal(room.trades.length, 0);
});

// Trade timers live entirely on each trade object (trade.timer/trade.deadline) --
// this asserts they never touch the room's own turn timer (this.turnTimer/
// this.turnDeadline), which is the 4-minute-per-turn clock that kicks an
// idle current player. A trade expiring should never shorten, restart, or
// clear that clock.
test("a time-limited trade expiring does not touch the turn timer", async () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const turnDeadlineBefore = room.turnDeadline;
  const turnTimerBefore = room.turnTimer;

  const propose = room.proposeTrade("p0", { toId: "p1", requestMoney: 10, timeLimitSec: 10 });
  const trade = room.trades.find((t) => t.id === propose.tradeId);
  trade.deadline = Date.now() - 1;
  room.scheduleTradeTimer(trade.id);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(room.trades.length, 0, "the trade did expire");
  assert.equal(room.turnDeadline, turnDeadlineBefore, "turn deadline is untouched");
  assert.equal(room.turnTimer, turnTimerBefore, "turn timer handle is untouched");
  assert.equal(room.turnIndex, 0, "turn did not advance");
});
