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
