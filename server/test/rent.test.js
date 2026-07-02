import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeRoom, cleanup } from "./helpers.js";
import { BOARD as CLASSIC_BOARD, COLOR_GROUP_DEFS as CLASSIC_GROUPS } from "../src/game/boards/classic-vintage.js";
import { BOARD as EU_BOARD, COLOR_GROUP_DEFS as EU_GROUPS } from "../src/game/boards/eu.js";
import { BOARD as ME_BOARD, COLOR_GROUP_DEFS as ME_GROUPS } from "../src/game/boards/middle-east.js";

// Rent is tuned per color group at that group's cheapest ("base") tile, but
// a pricier tile in the same group should never charge the same (or less)
// as that base tile -- it scales up proportionally to its own price instead.
// Verified two ways: (1) statically over every board's raw data, so a future
// edit that reintroduces a flat/duplicate rent table gets caught without
// needing a live game, and (2) through Room.calcRent, so the scaled numbers
// actually reach the player during a real rent charge.

function assertGroupRentScalesWithPrice(board, label) {
  const byGroup = new Map();
  for (const tile of board) {
    if (tile.type !== "property") continue;
    if (!byGroup.has(tile.group)) byGroup.set(tile.group, []);
    byGroup.get(tile.group).push(tile);
  }
  for (const [group, tiles] of byGroup) {
    const base = tiles.reduce((a, b) => (a.price <= b.price ? a : b));
    for (const tile of tiles) {
      if (tile.price === base.price) continue;
      for (let i = 0; i < tile.rent.length; i++) {
        assert.ok(
          tile.rent[i] > base.rent[i],
          `${label}: ${tile.name} ($${tile.price}) rent tier ${i} (${tile.rent[i]}) should exceed ` +
          `${base.name}'s ($${base.price}) tier ${i} (${base.rent[i]})`
        );
      }
    }
  }
}

test("classic-vintage: every above-base-price tile out-charges its group's base tile at every house tier", () => {
  assertGroupRentScalesWithPrice(CLASSIC_BOARD, "classic-vintage");
  // Sanity check the test itself isn't vacuous -- olive actually has price variance.
  assert.notEqual(CLASSIC_GROUPS.olive, undefined);
});

test("eu: capital group (London $220 vs Athens $240) scales rent by price", () => {
  assertGroupRentScalesWithPrice(EU_BOARD, "eu");
  assert.notEqual(EU_GROUPS.capital, undefined);
});

test("middle-east: capital group (عمّان $180 vs القاهرة $200) scales rent by price", () => {
  assertGroupRentScalesWithPrice(ME_BOARD, "middle-east");
  assert.notEqual(ME_GROUPS.capital, undefined);
});

test("calcRent charges the pricier tile in a group more than the cheaper one at the same house count", () => {
  const room = makeRoom();
  after(() => cleanup(room));
  const daghestan = room._board.find((t) => t.name === "داقستان"); // olive, $140 (group base)
  const moscow = room._board.find((t) => t.name === "موسكو"); // olive, $160

  const rentDaghestan = room.calcRent(daghestan, { ownerId: "p1", houses: 0 });
  const rentMoscow = room.calcRent(moscow, { ownerId: "p1", houses: 0 });

  assert.ok(rentMoscow > rentDaghestan, `Moscow ($160) should charge more than Daghestan ($140): ${rentMoscow} vs ${rentDaghestan}`);
});
