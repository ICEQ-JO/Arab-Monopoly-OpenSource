import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup } from "./helpers.js";

// handleTurnTimeout is what startTurnTimer's setTimeout actually calls once
// the real (4-minute) per-turn clock runs out -- tested directly here rather
// than waiting on a real timer.

test("running out of time skips the turn without kicking a solvent player", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = 200;
  alice.properties = [1];
  room.ownership[1] = { ownerId: "p0", houses: 0 };

  room.handleTurnTimeout("p0");

  assert.equal(alice.left, false, "not kicked");
  assert.equal(alice.bankrupt, false, "not bankrupted -- solvent");
  assert.deepEqual(alice.properties, [1], "keeps their properties");
  assert.notEqual(room.ownership[1], undefined, "ownership untouched");
  assert.equal(room.turnIndex, 1, "turn moved on to the next player");
});

test("running out of time while in debt still forces bankruptcy, same as a manual End Turn", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.balance = -50;
  alice.properties = [3];
  room.ownership[3] = { ownerId: "p0", houses: 0 };

  room.handleTurnTimeout("p0");

  assert.equal(alice.left, false, "not kicked -- bankruptcy, not a forced leave");
  assert.equal(alice.bankrupt, true);
  assert.equal(room.ownership[3], undefined, "property released back to the bank");
  assert.equal(room.turnIndex, 1);
});

test("a manual leave (kickPlayer) is unaffected -- still forfeits the seat and properties", () => {
  const room = makeRoom(["Alice", "Bob", "Carol"]);
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.properties = [1];
  room.ownership[1] = { ownerId: "p0", houses: 0 };

  room.kickPlayer("p0", "left the game");

  assert.equal(alice.left, true);
  assert.deepEqual(alice.properties, []);
  assert.equal(room.ownership[1], undefined, "ownership released");
});
