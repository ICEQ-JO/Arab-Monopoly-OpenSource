import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup, withDice } from "./helpers.js";
import { SURPRISE_CARDS } from "../src/game/cards.js";

// Force a specific card to the top of the deck so the scenario is deterministic
// rather than depending on shuffle order.
function forceTopCard(room, deckKey, cardId) {
  const card = SURPRISE_CARDS.find((c) => c.id === cardId);
  room[deckKey] = [card, ...room[deckKey].filter((c) => c.id !== cardId)];
}

test("a movement card defers the move until confirmCardMove is called", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  forceTopCard(room, "surpriseDeck", "s6"); // "Move back 3 spaces."
  alice.position = 4; // tile 7 is Surprise, 3 tiles away

  const rollResult = withDice([[2, 1]], () => room.rollDice("p0"));

  assert.equal(rollResult.awaitingCardMove, true);
  assert.equal(alice.position, 7, "still sitting on the card tile -- the move hasn't happened yet");
  assert.equal(room.pendingAction.type, "awaitCardMove");
  assert.equal(room.lastCard.text, "Move back 3 spaces.");

  const confirmResult = room.confirmCardMove("p0");

  assert.deepEqual(confirmResult, { ok: true });
  assert.equal(alice.position, 4, "moved back 3 from the card tile");
  // Tile 4 is an unowned property (Teal Quay) in the post-board-restructure
  // layout, so resolveTile correctly opens a fresh awaitBuy here -- the thing
  // actually under test (the card move itself resolving once confirmed) is
  // done; a new pendingAction for an unrelated decision is expected, not a bug.
  assert.notEqual(room.pendingAction?.type, "awaitCardMove");
});

test("confirmCardMove rejects a player who isn't the one the card is pending for", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  room.pendingAction = { type: "awaitCardMove", playerId: "p0", effect: { type: "move", steps: -3 } };

  const result = room.confirmCardMove("p1");

  assert.equal(result.error, "No card move to confirm");
  assert.notEqual(room.pendingAction, null, "still pending -- the wrong confirm must not have consumed it");
});

test("the deferred bonus-roll calculation completes correctly once confirmed", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  forceTopCard(room, "surpriseDeck", "s6");
  alice.position = 24; // 2 tiles before tile 26, the other Surprise tile (must be an even distance for a double roll)

  // Roll doubles (free play) and land on the card tile in the same move.
  const rollResult = withDice([[1, 1]], () => room.rollDice("p0"));
  assert.equal(rollResult.awaitingCardMove, true);

  room.confirmCardMove("p0");

  assert.equal(room.canRollAgain, true, "the roll really was a free-play double, so the bonus roll is granted once resolved");
});

test("confirmCardMove also handles the advanceTo effect (collecting Start Plaza's bonus)", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  forceTopCard(room, "surpriseDeck", "s4"); // "Advance to Start Plaza and collect 200 coins."
  alice.position = 4;
  const balanceBefore = alice.balance;

  withDice([[2, 1]], () => room.rollDice("p0")); // lands on tile 7, draws s4
  assert.equal(room.pendingAction.type, "awaitCardMove");

  room.confirmCardMove("p0");

  assert.equal(alice.position, 0);
  assert.equal(alice.balance, balanceBefore + 200);
  assert.equal(room.pendingAction, null, "Start Plaza has no further effect, nothing left pending");
});

test("a goToHolding card effect is NOT deferred -- it resolves immediately, not via confirmCardMove", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const alice = room.players[0];
  forceTopCard(room, "surpriseDeck", "s5"); // "Go directly to Holding Pen."
  alice.position = 4;

  withDice([[2, 1]], () => room.rollDice("p0"));

  assert.equal(alice.inHolding, true, "happened immediately, no confirmation step for this effect");
  assert.equal(room.pendingAction, null);
});
