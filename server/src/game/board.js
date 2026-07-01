// Map registry -- Room.js resolves which board to use per-room via
// rules.map (see resolveBoard()), defaulting to "classic".
import * as classic from "./boards/classic-vintage.js";
import * as eu from "./boards/eu.js";
import * as middleEast from "./boards/middle-east.js";

export const MAPS = {
  classic,
  eu,
  "middle-east": middleEast,
};

export { TILE_TYPES } from "./tile-types.js";
