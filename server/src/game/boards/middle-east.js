// Middle East — Gulf-to-Maghreb city board. 32 tiles laid out in a square
// loop (8 per side, corners at 0/8/16/24). Index 0 is "Start" (top-left
// corner). Same shape and price/rent balance as eu.js, reskinned across 8
// Arab regions instead of 8 European ones. Paired with the same generic
// cv2-* client theme (board rendering is fully data-driven, no per-map
// client code).
import { TILE_TYPES } from "../tile-types.js";

// `basePrice` is the group's cheapest tile -- rentLevels is tuned for that
// price point, and any pricier tile in the same group scales up from it (see
// the per-tile rent scaling pass below BOARD). Values mirror eu.js one-for-one
// so both 32-tile boards play at the same pace/economy.
const COLOR_GROUPS = {
  gulf:         { color: "#16a596", basePrice: 60,  rentLevels: [2, 10, 30, 90, 160, 250],     housePrice: 50 },
  hijaz:        { color: "#e67e22", basePrice: 100, rentLevels: [6, 30, 90, 270, 400, 550],    housePrice: 50 },
  najd:         { color: "#c9a227", basePrice: 120, rentLevels: [8, 40, 100, 300, 450, 600],   housePrice: 100 },
  levant:       { color: "#8e44ad", basePrice: 140, rentLevels: [10, 50, 150, 450, 625, 750],  housePrice: 100 },
  mesopotamia:  { color: "#457b9d", basePrice: 160, rentLevels: [12, 60, 180, 500, 700, 900],  housePrice: 150 },
  nile:         { color: "#2a9d8f", basePrice: 180, rentLevels: [14, 70, 200, 550, 750, 950],  housePrice: 150 },
  maghreb:      { color: "#d62828", basePrice: 200, rentLevels: [16, 80, 220, 600, 800, 1000], housePrice: 200 },
  capital:      { color: "#1d3557", basePrice: 220, rentLevels: [18, 90, 250, 700, 875, 1050], housePrice: 200 },
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

// Same layout convention as eu.js: 4 corners (ids 0, 8, 16, 24) hold
// Start/Holding/Rest/Go-to-Holding; ids increase clockwise from Start; within
// each side, color-group tiles stay contiguous.
export const BOARD = [
  { id: 0,  type: TILE_TYPES.START,         name: "Start" },
  { id: 1,  type: TILE_TYPES.PROPERTY,      name: "Doha",          price: 60,  ...G("gulf") },
  { id: 2,  type: TILE_TYPES.TREASURE,      name: "Chest of Good Fortune" },
  { id: 3,  type: TILE_TYPES.PROPERTY,      name: "Manama",        price: 60,  ...G("gulf") },
  { id: 4,  type: TILE_TYPES.TAX,           name: "Customs",       amount: 80 },
  { id: 5,  type: TILE_TYPES.PROPERTY,      name: "Jeddah",        price: 100, ...G("hijaz") },
  { id: 6,  type: TILE_TYPES.TRANSIT,       name: "Gulf Station",  price: 150, rent: STATION_RENT },
  { id: 7,  type: TILE_TYPES.PROPERTY,      name: "Taif",          price: 100, ...G("hijaz") },

  { id: 8,  type: TILE_TYPES.HOLDING,       name: "Holding Pen" },
  { id: 9,  type: TILE_TYPES.PROPERTY,      name: "Riyadh",        price: 120, ...G("najd") },
  { id: 10, type: TILE_TYPES.SURPRISE,      name: "Fate" },
  { id: 11, type: TILE_TYPES.PROPERTY,      name: "Dammam",        price: 120, ...G("najd") },
  { id: 12, type: TILE_TYPES.TRANSIT,       name: "Gulf Station",  price: 150, rent: STATION_RENT },
  { id: 13, type: TILE_TYPES.PROPERTY,      name: "Beirut",        price: 140, ...G("levant") },
  { id: 14, type: TILE_TYPES.TAX,           name: "Customs",       amount: 100 },
  { id: 15, type: TILE_TYPES.PROPERTY,      name: "Amman",         price: 140, ...G("levant") },

  { id: 16, type: TILE_TYPES.REST,          name: "Rest Stop" },
  { id: 17, type: TILE_TYPES.PROPERTY,      name: "Baghdad",       price: 160, ...G("mesopotamia") },
  { id: 18, type: TILE_TYPES.TREASURE,      name: "Chest of Good Fortune" },
  { id: 19, type: TILE_TYPES.PROPERTY,      name: "Basra",         price: 160, ...G("mesopotamia") },
  { id: 20, type: TILE_TYPES.TRANSIT,       name: "Gulf Station",  price: 150, rent: STATION_RENT },
  { id: 21, type: TILE_TYPES.PROPERTY,      name: "Cairo",         price: 180, ...G("nile") },
  { id: 22, type: TILE_TYPES.SURPRISE,      name: "Fate" },
  { id: 23, type: TILE_TYPES.PROPERTY,      name: "Alexandria",    price: 180, ...G("nile") },

  { id: 24, type: TILE_TYPES.GO_TO_HOLDING, name: "Off to the Holding Pen" },
  { id: 25, type: TILE_TYPES.PROPERTY,      name: "Casablanca",    price: 200, ...G("maghreb") },
  { id: 26, type: TILE_TYPES.PROPERTY,      name: "Marrakesh",     price: 200, ...G("maghreb") },
  { id: 27, type: TILE_TYPES.TRANSIT,       name: "Gulf Station",  price: 150, rent: STATION_RENT },
  { id: 28, type: TILE_TYPES.PROPERTY,      name: "Muscat",        price: 220, ...G("capital") },
  { id: 29, type: TILE_TYPES.PROPERTY,      name: "Kuwait City",   price: 240, ...G("capital") },
  { id: 30, type: TILE_TYPES.TAX,           name: "Customs",       amount: 120 },
  { id: 31, type: TILE_TYPES.TREASURE,      name: "Chest of Good Fortune" },
];

// Rent scales per tile, not just per group -- see classic-vintage.js for the
// full explanation. Here it only actually changes anything for "capital"
// (Muscat $220 vs Kuwait City $240); every other group is priced identically
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
