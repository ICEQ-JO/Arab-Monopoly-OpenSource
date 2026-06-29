import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup, withDice } from "./helpers.js";

test("rolling again without doubles is rejected", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[0].position = 12;

  // From tile 12, (1,2) lands on tile 15 (Toll Gate, a fixed-amount tax tile)
  // -- no buy prompt or random card draw that could otherwise set a
  // pendingAction and mask the "already rolled" rejection behind a different
  // error.
  withDice([[1, 2]], () => room.rollDice("p0"));
  const second = room.rollDice("p0");

  assert.equal(second.error, "You already rolled this turn");
});

test("doubles in free play grants exactly one bonus roll", () => {
  const room = makeRoom();
  after(() => cleanup(room));

  // (4,4) from tile 0 lands on tile 8 (the Holding Pen tile itself -- a safe
  // rest stop when landed on directly, not the go_to_holding tile). No buy
  // prompt or random card draw to keep the next roll deterministic.
  const first = withDice([[4, 4]], () => room.rollDice("p0"));
  assert.equal(first.doubles, true);
  assert.equal(room.canRollAgain, true);

  // (3,4) from tile 8 lands on tile 15 (Toll Gate, also safe/deterministic).
  const second = withDice([[3, 4]], () => room.rollDice("p0"));
  assert.equal(second.error, undefined);
  assert.equal(room.canRollAgain, false);

  const third = room.rollDice("p0");
  assert.equal(third.error, "You already rolled this turn");
});

test("three consecutive doubles sends the player to the Holding Pen without moving that roll, and grants no bonus roll", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];

  // (4,4) from tile 0 -> tile 8 (Holding Pen tile, safe/deterministic when
  // landed on directly).
  withDice([[4, 4]], () => room.rollDice("p0"));
  assert.equal(alice.inHolding, false);
  assert.equal(room.canRollAgain, true, "first double earns the normal bonus roll");
  const positionAfterFirst = alice.position;

  // (4,4) from tile 8 -> tile 16 (Garden Rest, also safe/deterministic).
  withDice([[4, 4]], () => room.rollDice("p0"));
  assert.equal(alice.inHolding, false);
  assert.equal(room.canRollAgain, true, "second double also earns a bonus roll -- the cap is 3, not 2");
  const positionAfterSecond = alice.position;
  assert.notEqual(positionAfterSecond, positionAfterFirst);

  const third = withDice([[5, 5]], () => room.rollDice("p0"));

  assert.equal(third.sentToHoldingForSpeeding, true);
  assert.equal(alice.inHolding, true);
  assert.equal(alice.position, 8, "teleported straight to the Holding Pen tile, not moved by the third roll");
  assert.equal(room.canRollAgain, false, "no bonus roll for the third double, since it caught them instead");
});

test("doubles to escape the Holding Pen do not grant a bonus roll (Pass 10 regression)", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.inHolding = true;
  alice.holdingTurns = 0;

  const res = withDice([[3, 3]], () => room.rollDice("p0"));

  assert.equal(res.doubles, true);
  assert.equal(alice.inHolding, false, "doubles freed them");
  assert.equal(room.canRollAgain, false, "but escaping is not the same mechanic as a free-play bonus roll");
});

test("landing on the Holding Pen via a bonus-double move voids that bonus roll (Pass 11 regression)", () => {
  // Pass 11's bug: canRollAgain was decided from the pre-move wasInHolding
  // snapshot, missing the case where the move *itself* (via movePlayer ->
  // resolveTile -> sendToHolding) put the player in the Holding Pen. Reproduce
  // that exact shape: roll doubles in free play, land on the "go to Holding" tile.
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.position = 22; // tile 24 ("Send to Holding") is 2 tiles away

  const res = withDice([[1, 1]], () => room.rollDice("p0"));

  assert.equal(res.doubles, true);
  assert.equal(alice.inHolding, true, "landed on the go_to_holding tile");
  assert.equal(room.canRollAgain, false, "must not grant a bonus roll for landing in the Pen this same move");
});
