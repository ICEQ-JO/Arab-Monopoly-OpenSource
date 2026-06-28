// Fortune City - an original board game inspired by classic property-trading games.
// 32 tiles laid out in a square loop. Index 0 is "Start".

export const TILE_TYPES = {
  START: "start",
  PROPERTY: "property",
  TRANSIT: "transit",
  UTILITY: "utility",
  SURPRISE: "surprise",
  TREASURE: "treasure",
  TAX: "tax",
  REST: "rest", // free-parking style safe tile
  HOLDING: "holding", // jail-style tile
  GO_TO_HOLDING: "go_to_holding",
};

const COLOR_GROUPS = {
  copper: { color: "#b5651d", rentLevels: [2, 10, 30, 90, 160, 250], housePrice: 50 },
  teal: { color: "#16a596", rentLevels: [4, 20, 60, 180, 320, 450], housePrice: 50 },
  violet: { color: "#8e44ad", rentLevels: [6, 30, 90, 270, 400, 550], housePrice: 100 },
  amber: { color: "#f39c12", rentLevels: [6, 30, 90, 270, 400, 550], housePrice: 100 },
  crimson: { color: "#c0392b", rentLevels: [8, 40, 100, 300, 450, 600], housePrice: 150 },
  azure: { color: "#2980b9", rentLevels: [8, 40, 100, 300, 450, 600], housePrice: 150 },
  jade: { color: "#27ae60", rentLevels: [10, 50, 150, 450, 625, 750], housePrice: 200 },
  obsidian: { color: "#2c3e50", rentLevels: [12, 60, 180, 500, 700, 900], housePrice: 200 },
};

export const BOARD = [
  { id: 0, type: TILE_TYPES.START, name: "Start Plaza" },
  { id: 1, type: TILE_TYPES.PROPERTY, name: "Cobble Row", group: "copper", price: 60, rent: COLOR_GROUPS.copper.rentLevels, housePrice: COLOR_GROUPS.copper.housePrice },
  { id: 2, type: TILE_TYPES.TREASURE, name: "Treasure Chest" },
  { id: 3, type: TILE_TYPES.PROPERTY, name: "Foundry Lane", group: "copper", price: 60, rent: COLOR_GROUPS.copper.rentLevels, housePrice: COLOR_GROUPS.copper.housePrice },
  { id: 4, type: TILE_TYPES.TAX, name: "Toll Gate", amount: 100 },
  { id: 5, type: TILE_TYPES.TRANSIT, name: "Harbor Station", price: 150, rent: [25, 50, 100, 200] },
  { id: 6, type: TILE_TYPES.PROPERTY, name: "Teal Quay", group: "teal", price: 100, rent: COLOR_GROUPS.teal.rentLevels, housePrice: COLOR_GROUPS.teal.housePrice },
  { id: 7, type: TILE_TYPES.SURPRISE, name: "Surprise" },
  { id: 8, type: TILE_TYPES.PROPERTY, name: "Lagoon Walk", group: "teal", price: 100, rent: COLOR_GROUPS.teal.rentLevels, housePrice: COLOR_GROUPS.teal.housePrice },
  { id: 9, type: TILE_TYPES.PROPERTY, name: "Mariner Ave", group: "teal", price: 120, rent: COLOR_GROUPS.teal.rentLevels, housePrice: COLOR_GROUPS.teal.housePrice },
  { id: 10, type: TILE_TYPES.HOLDING, name: "Holding Pen" },
  { id: 11, type: TILE_TYPES.PROPERTY, name: "Violet Court", group: "violet", price: 140, rent: COLOR_GROUPS.violet.rentLevels, housePrice: COLOR_GROUPS.violet.housePrice },
  { id: 12, type: TILE_TYPES.UTILITY, name: "Power Grid", price: 150, multiplier: [4, 10] },
  { id: 13, type: TILE_TYPES.PROPERTY, name: "Amethyst Sq", group: "violet", price: 140, rent: COLOR_GROUPS.violet.rentLevels, housePrice: COLOR_GROUPS.violet.housePrice },
  { id: 14, type: TILE_TYPES.PROPERTY, name: "Orchid Blvd", group: "violet", price: 160, rent: COLOR_GROUPS.violet.rentLevels, housePrice: COLOR_GROUPS.violet.housePrice },
  { id: 15, type: TILE_TYPES.TRANSIT, name: "Central Station", price: 150, rent: [25, 50, 100, 200] },
  { id: 16, type: TILE_TYPES.PROPERTY, name: "Amber Heights", group: "amber", price: 180, rent: COLOR_GROUPS.amber.rentLevels, housePrice: COLOR_GROUPS.amber.housePrice },
  { id: 17, type: TILE_TYPES.TREASURE, name: "Treasure Chest" },
  { id: 18, type: TILE_TYPES.PROPERTY, name: "Goldleaf St", group: "amber", price: 180, rent: COLOR_GROUPS.amber.rentLevels, housePrice: COLOR_GROUPS.amber.housePrice },
  { id: 19, type: TILE_TYPES.PROPERTY, name: "Sunspire Rd", group: "amber", price: 200, rent: COLOR_GROUPS.amber.rentLevels, housePrice: COLOR_GROUPS.amber.housePrice },
  { id: 20, type: TILE_TYPES.REST, name: "Garden Rest" },
  { id: 21, type: TILE_TYPES.PROPERTY, name: "Crimson Park", group: "crimson", price: 220, rent: COLOR_GROUPS.crimson.rentLevels, housePrice: COLOR_GROUPS.crimson.housePrice },
  { id: 22, type: TILE_TYPES.SURPRISE, name: "Surprise" },
  { id: 23, type: TILE_TYPES.PROPERTY, name: "Scarlet Way", group: "crimson", price: 220, rent: COLOR_GROUPS.crimson.rentLevels, housePrice: COLOR_GROUPS.crimson.housePrice },
  { id: 24, type: TILE_TYPES.PROPERTY, name: "Ruby Terrace", group: "crimson", price: 240, rent: COLOR_GROUPS.crimson.rentLevels, housePrice: COLOR_GROUPS.crimson.housePrice },
  { id: 25, type: TILE_TYPES.TRANSIT, name: "North Station", price: 150, rent: [25, 50, 100, 200] },
  { id: 26, type: TILE_TYPES.PROPERTY, name: "Azure Crescent", group: "azure", price: 260, rent: COLOR_GROUPS.azure.rentLevels, housePrice: COLOR_GROUPS.azure.housePrice },
  { id: 27, type: TILE_TYPES.PROPERTY, name: "Cobalt Pier", group: "azure", price: 260, rent: COLOR_GROUPS.azure.rentLevels, housePrice: COLOR_GROUPS.azure.housePrice },
  { id: 28, type: TILE_TYPES.UTILITY, name: "Aqueduct Co.", price: 150, multiplier: [4, 10] },
  { id: 29, type: TILE_TYPES.PROPERTY, name: "Sapphire Hill", group: "azure", price: 280, rent: COLOR_GROUPS.azure.rentLevels, housePrice: COLOR_GROUPS.azure.housePrice },
  { id: 30, type: TILE_TYPES.GO_TO_HOLDING, name: "Send to Holding" },
  { id: 31, type: TILE_TYPES.PROPERTY, name: "Jade Summit", group: "jade", price: 300, rent: COLOR_GROUPS.jade.rentLevels, housePrice: COLOR_GROUPS.jade.housePrice },
];

export const TOTAL_TILES = BOARD.length;
export const COLOR_GROUP_DEFS = COLOR_GROUPS;

export function propertiesByGroup(group) {
  return BOARD.filter((t) => t.type === TILE_TYPES.PROPERTY && t.group === group);
}
