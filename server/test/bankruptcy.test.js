import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup, withDice } from "./helpers.js";

test("a negative balance mid-turn does not trigger immediate bankruptcy or release properties", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = 5;
  alice.properties = [31];
  room.ownership[31] = { ownerId: "p0", houses: 0 };
  alice.position = 4; // a fixed 100-coin tax tile

  room.resolveTile(alice);

  assert.equal(alice.balance, -95);
  assert.equal(alice.bankrupt, false);
  assert.deepEqual(alice.properties, [31], "still owns what they owned");
  assert.notEqual(room.ownership[31], undefined, "ownership untouched");
});

test("mortgaging enough to cover the debt before ending the turn avoids bankruptcy", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = -20;
  alice.properties = [1]; // price 60 -> mortgage value 30
  room.ownership[1] = { ownerId: "p0", houses: 0 };
  room.lastRoll = [2, 2];

  const mortgageResult = room.mortgageProperty("p0", 1);
  assert.deepEqual(mortgageResult, { ok: true });
  assert.equal(alice.balance, 10);

  const endResult = room.playerEndTurn("p0");
  assert.deepEqual(endResult, { ok: true });
  assert.equal(alice.bankrupt, false);
  assert.equal(room.turnIndex, 1);
});

test("mortgaging not enough to cover the debt still bankrupts at turn end", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = -50;
  alice.properties = [3]; // price 60 -> mortgage value 30
  room.ownership[3] = { ownerId: "p0", houses: 0 };
  room.lastRoll = [1, 1];

  room.mortgageProperty("p0", 3); // +30, still -20 overall
  room.playerEndTurn("p0");

  assert.equal(alice.bankrupt, true);
  assert.equal(room.ownership[3], undefined, "property released back to the bank");
  assert.equal(room.turnIndex, 1, "turn advanced past the now-bankrupt player");
});

test("ending a turn while solvent never bankrupts, regardless of past negative dips", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = 200;
  room.lastRoll = [1, 1];

  room.playerEndTurn("p0");

  assert.equal(alice.bankrupt, false);
});

test("staying stuck in the Holding Pen still leaves the same mortgage/trade window before End Turn enforces bankruptcy", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = -20;
  alice.inHolding = true;
  alice.holdingTurns = 0;

  withDice([[2, 5]], () => room.rollDice("p0"));

  assert.equal(alice.bankrupt, false, "not bankrupted yet -- same chance to mortgage/trade as any other roll");
  assert.equal(room.turnIndex, 0, "turn stays open until End Turn is clicked, so the roll is actually visible");

  room.playerEndTurn("p0");

  assert.equal(alice.bankrupt, true);
  assert.equal(room.winnerId, null, "two other active players remain");
  assert.equal(room.turnIndex, 1);
});

test("bankrupting the second-to-last player declares the survivor the winner instead of advancing the turn", () => {
  const room = makeRoom(["Alice", "Bob"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  const bob = room.players[1];
  alice.balance = -100;
  room.lastRoll = [1, 1];

  room.playerEndTurn("p0");

  assert.equal(alice.bankrupt, true);
  assert.equal(room.winnerId, bob.id);
  assert.equal(room.turnIndex, 0, "no next player to advance to -- the game already ended");
});
