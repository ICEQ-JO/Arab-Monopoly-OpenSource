import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup, withDice } from "./helpers.js";
import { MAX_HOLDING_TURNS, HOLDING_RELEASE_RENT } from "../src/game/Room.js";

test(`stuck in the Holding Pen for non-doubles rolls, forced out on attempt ${MAX_HOLDING_TURNS}`, () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.inHolding = true;
  alice.holdingTurns = 0;
  const startingBalance = alice.balance;

  for (let attempt = 1; attempt < MAX_HOLDING_TURNS; attempt++) {
    room.turnIndex = 0; // simulate it being Alice's turn again each attempt
    room.pendingAction = null;
    room.canRollAgain = true;
    const res = withDice([[2, 5]], () => room.rollDice("p0"));
    assert.equal(res.stayedInHolding, true, `attempt ${attempt} should stay stuck`);
    assert.equal(alice.inHolding, true);
    assert.equal(alice.holdingTurns, attempt);
    assert.equal(alice.balance, startingBalance, "no charge while still stuck");
  }

  room.turnIndex = 0;
  room.pendingAction = null;
  room.canRollAgain = true;
  // Non-double, and lands exactly on tile 8 (the Holding Pen tile itself, which
  // is just a safe rest stop when landed on directly -- not the go_to_holding
  // tile) from position 0, so the post-escape move can't draw a random card or
  // hit a buy prompt and make the balance assertion below flaky.
  const final = withDice([[3, 5]], () => room.rollDice("p0"));

  assert.equal(final.stayedInHolding, undefined, "this roll actually moves them");
  assert.equal(alice.inHolding, false);
  assert.equal(alice.holdingTurns, 0);
  assert.equal(alice.position, 8);
  assert.equal(alice.balance, startingBalance - HOLDING_RELEASE_RENT, "forced to pay the release fine");
});

test("rolling doubles while stuck escapes immediately and still moves that same turn", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.inHolding = true;
  alice.holdingTurns = 1;
  const positionBefore = alice.position;

  const res = withDice([[3, 3]], () => room.rollDice("p0"));

  assert.equal(res.stayedInHolding, undefined);
  assert.equal(alice.inHolding, false);
  assert.equal(alice.holdingTurns, 0);
  assert.notEqual(alice.position, positionBefore, "moved using the escaping roll, same turn");
});

test("payToLeaveHolding frees the player to roll normally, without consuming their roll", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.inHolding = true;
  alice.balance = 1000;

  const result = room.payToLeaveHolding("p0");
  assert.deepEqual(result, { ok: true });
  assert.equal(alice.balance, 1000 - HOLDING_RELEASE_RENT);
  assert.equal(alice.inHolding, false);

  const roll = withDice([[2, 5]], () => room.rollDice("p0"));
  assert.equal(roll.stayedInHolding, undefined, "treated as ordinary free-play movement, not another escape attempt");
});

test("payToLeaveHolding rejects if not actually in the Holding Pen", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  assert.equal(room.payToLeaveHolding("p0").error, "You're not in the Holding Pen");
});

test("payToLeaveHolding rejects if it isn't that player's turn", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[1].inHolding = true;
  assert.equal(room.payToLeaveHolding("p1").error, "Not your turn");
});

test("holding a Get Out of Jail Free card does not exempt a player from being sent to the Holding Pen", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.holdingFreeCard = true;

  room.sendToHolding(alice);

  assert.equal(alice.inHolding, true, "still sent to the Holding Pen despite holding a free card");
  assert.equal(alice.holdingFreeCard, true, "the card is untouched -- spent later via useHoldingFreeCard, not automatically");
});

test("useHoldingFreeCard consumes the card and clears inHolding without charging coins", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  alice.inHolding = true;
  alice.holdingFreeCard = true;
  const balanceBefore = alice.balance;

  const result = room.useHoldingFreeCard("p0");

  assert.deepEqual(result, { ok: true });
  assert.equal(alice.inHolding, false);
  assert.equal(alice.holdingFreeCard, false);
  assert.equal(alice.balance, balanceBefore);
});

test("useHoldingFreeCard rejects without a banked card", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.players[0].inHolding = true;
  assert.equal(room.useHoldingFreeCard("p0").error, "You don't have a Get Out of Jail Free card");
});
