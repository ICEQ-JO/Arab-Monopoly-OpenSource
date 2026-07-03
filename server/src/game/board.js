// The project has exactly one board -- earlier passes briefly supported
// multiple selectable maps via a `MAPS` registry/`resolveBoard(mapKey)`
// pair on Room, but that added a whole room-creation UI and per-map test
// fixtures for a feature nobody used; removed in favor of a single fixed
// board.
export { BOARD, TOTAL_TILES, COLOR_GROUP_DEFS, propertiesByGroup } from "./boards/classic-vintage.js";
export { TILE_TYPES } from "./tile-types.js";
