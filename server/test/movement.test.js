import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup, withDice } from "./helpers.js";

test("landing exactly on Start pays double the pass-through bonus", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.position = 44; // 4 tiles from Start (tile 0) on the 48-tile board
  const balanceBefore = alice.balance;

  withDice([[2, 2]], () => room.rollDice("p0")); // rolls a 4, lands exactly on Start

  assert.equal(alice.position, 0);
  assert.equal(alice.balance, balanceBefore + 400);
});

test("passing over Start without landing on it still pays the normal bonus", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.position = 44; // 4 tiles from Start
  const balanceBefore = alice.balance;

  withDice([[2, 3]], () => room.rollDice("p0")); // rolls a 5, wraps past Start onto tile 1

  assert.equal(alice.position, 1);
  assert.equal(alice.balance, balanceBefore + 200);
});
