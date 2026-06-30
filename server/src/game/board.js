// Board router — returns the right board data for a given mapType.
// Also re-exports the Fortune City board under the original names so
// existing imports in Room.js and tests don't break before they're updated.

export { TILE_TYPES } from "./tile-types.js";

import * as FC from "./boards/fortune-city.js";
import * as WW from "./boards/worldwide.js";
import * as AW from "./boards/arab-world.js";
import * as AE from "./boards/arab-empire.js";
import * as CV from "./boards/classic-vintage.js";

const MAP_BOARDS = {
  "fortune-city":    FC,
  "worldwide":       WW,
  "arab-world":      AW,
  "arab-empire":     AE,
  "classic-vintage": CV,
};

export function getBoard(mapType = "fortune-city") {
  return MAP_BOARDS[mapType] ?? FC;
}

// Backward-compat re-exports pointing to Fortune City
export const BOARD             = FC.BOARD;
export const TOTAL_TILES       = FC.TOTAL_TILES;
export const COLOR_GROUP_DEFS  = FC.COLOR_GROUP_DEFS;
export const propertiesByGroup = FC.propertiesByGroup;
