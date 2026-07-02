// Middle East — Gulf/Levant city board. 24 tiles laid out in a square loop
// (6 per side, corners at 0/6/12/18). Index 0 is "Start" (top-left corner).
// The smallest of the three maps; paired with the same generic cv2-* client
// theme (board rendering is fully data-driven, no per-map client code).
import { TILE_TYPES } from "../tile-types.js";

// `basePrice` is the group's cheapest tile -- rentLevels is tuned for that
// price point, and any pricier tile in the same group scales up from it (see
// the per-tile rent scaling pass below BOARD).
const COLOR_GROUPS = {
  gulf:    { color: "#16a596", basePrice: 60,  rentLevels: [2, 10, 30, 90, 160, 250],    housePrice: 50 },
  hijaz:   { color: "#e67e22", basePrice: 100, rentLevels: [6, 30, 90, 270, 400, 550],   housePrice: 50 },
  levant:  { color: "#8e44ad", basePrice: 140, rentLevels: [10, 50, 150, 450, 625, 750], housePrice: 100 },
  capital: { color: "#c0392b", basePrice: 180, rentLevels: [14, 70, 200, 550, 750, 950], housePrice: 100 },
};

const STATION_RENT = [25, 50, 100, 200]; // by count of the 4 stations owned

function G(group) {
  return {
    group,
    groupColor: COLOR_GROUPS[group].color,
    rent: COLOR_GROUPS[group].rentLevels,
    housePrice: COLOR_GROUPS[group].housePrice,
  };
}

// Same layout convention as classic-vintage.js: 4 corners (ids 0, 6, 12, 18)
// hold Start/Holding/Rest/Go-to-Holding; ids increase clockwise from Start;
// each side's 2-tile color group stays contiguous.
export const BOARD = [
  { id: 0,  type: TILE_TYPES.START,         name: "البداية" },
  { id: 1,  type: TILE_TYPES.PROPERTY,      name: "دبي",    price: 60, ...G("gulf") },
  { id: 2,  type: TILE_TYPES.PROPERTY,      name: "الدوحة", price: 60, ...G("gulf") },
  { id: 3,  type: TILE_TYPES.TREASURE,      name: "صندوق الخير" },
  { id: 4,  type: TILE_TYPES.TRANSIT,       name: "محطة الخليج", price: 150, rent: STATION_RENT },
  { id: 5,  type: TILE_TYPES.TAX,           name: "جمارك", amount: 80 },

  { id: 6,  type: TILE_TYPES.HOLDING,       name: "الحجز" },
  { id: 7,  type: TILE_TYPES.PROPERTY,      name: "الرياض", price: 100, ...G("hijaz") },
  { id: 8,  type: TILE_TYPES.PROPERTY,      name: "جدة",    price: 100, ...G("hijaz") },
  { id: 9,  type: TILE_TYPES.SURPRISE,      name: "قدر" },
  { id: 10, type: TILE_TYPES.TRANSIT,       name: "محطة الخليج", price: 150, rent: STATION_RENT },
  { id: 11, type: TILE_TYPES.TREASURE,      name: "صندوق الخير" },

  { id: 12, type: TILE_TYPES.REST,          name: "استراحة" },
  { id: 13, type: TILE_TYPES.PROPERTY,      name: "بيروت",  price: 140, ...G("levant") },
  { id: 14, type: TILE_TYPES.PROPERTY,      name: "دمشق",   price: 140, ...G("levant") },
  { id: 15, type: TILE_TYPES.TAX,           name: "جمارك", amount: 100 },
  { id: 16, type: TILE_TYPES.TRANSIT,       name: "محطة الخليج", price: 150, rent: STATION_RENT },
  { id: 17, type: TILE_TYPES.SURPRISE,      name: "قدر" },

  { id: 18, type: TILE_TYPES.GO_TO_HOLDING, name: "توجه للحجز" },
  { id: 19, type: TILE_TYPES.PROPERTY,      name: "عمّان",   price: 180, ...G("capital") },
  { id: 20, type: TILE_TYPES.PROPERTY,      name: "القاهرة", price: 200, ...G("capital") },
  { id: 21, type: TILE_TYPES.TREASURE,      name: "صندوق الخير" },
  { id: 22, type: TILE_TYPES.TRANSIT,       name: "محطة الخليج", price: 150, rent: STATION_RENT },
  { id: 23, type: TILE_TYPES.TAX,           name: "جمارك", amount: 120 },
];

// Rent scales per tile, not just per group -- see classic-vintage.js for the
// full explanation. Here it only actually changes anything for "capital"
// (عمّان $180 vs القاهرة $200); every other group is priced identically
// across its own tiles, so the scale factor is 1 and nothing moves.
for (const tile of BOARD) {
  if (tile.type !== TILE_TYPES.PROPERTY) continue;
  const { basePrice } = COLOR_GROUPS[tile.group];
  if (tile.price === basePrice) continue;
  const scale = tile.price / basePrice;
  tile.rent = tile.rent.map((r) => Math.round(r * scale));
}

export const TOTAL_TILES = BOARD.length;
export const COLOR_GROUP_DEFS = COLOR_GROUPS;

export function propertiesByGroup(group) {
  return BOARD.filter((t) => t.type === TILE_TYPES.PROPERTY && t.group === group);
}
