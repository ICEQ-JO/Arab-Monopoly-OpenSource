// Mr. Worldwide — global cities board. 32 tiles.
import { TILE_TYPES } from "../tile-types.js";

const COLOR_GROUPS = {
  copper:  { color: "#b5651d", rentLevels: [2, 10, 30, 90, 160, 250],   housePrice: 50  },
  teal:    { color: "#16a596", rentLevels: [4, 20, 60, 180, 320, 450],   housePrice: 50  },
  violet:  { color: "#8e44ad", rentLevels: [6, 30, 90, 270, 400, 550],   housePrice: 100 },
  amber:   { color: "#f39c12", rentLevels: [6, 30, 90, 270, 400, 550],   housePrice: 100 },
  crimson: { color: "#c0392b", rentLevels: [8, 40, 100, 300, 450, 600],  housePrice: 150 },
  azure:   { color: "#2980b9", rentLevels: [8, 40, 100, 300, 450, 600],  housePrice: 150 },
  jade:    { color: "#27ae60", rentLevels: [10, 50, 150, 450, 625, 750], housePrice: 200 },
  obsidian:{ color: "#2c3e50", rentLevels: [12, 60, 180, 500, 700, 900], housePrice: 200 },
};

function G(group) {
  return { group, groupColor: COLOR_GROUPS[group].color, rent: COLOR_GROUPS[group].rentLevels, housePrice: COLOR_GROUPS[group].housePrice };
}

export const BOARD = [
  // Bottom row (ids 0-8, right-to-left on board)
  { id: 0,  type: TILE_TYPES.START,         name: "Go!" },
  { id: 1,  type: TILE_TYPES.PROPERTY,      name: "Salvador",      price: 60,  ...G("copper") },
  { id: 2,  type: TILE_TYPES.TREASURE,      name: "Treasure" },
  { id: 3,  type: TILE_TYPES.PROPERTY,      name: "Rio",           price: 60,  ...G("copper") },
  { id: 4,  type: TILE_TYPES.TAX,           name: "Earnings Tax",  amount: 75 },
  { id: 5,  type: TILE_TYPES.PROPERTY,      name: "Istanbul",      price: 100, ...G("teal") },
  { id: 6,  type: TILE_TYPES.TRANSIT,       name: "Ataturk Airport", price: 150, rent: [25,50,100,200] },
  { id: 7,  type: TILE_TYPES.PROPERTY,      name: "Johannesburg",  price: 120, ...G("teal") },
  { id: 8,  type: TILE_TYPES.HOLDING,       name: "In Prison" },

  // Left column (ids 9-16, bottom to top)
  { id: 9,  type: TILE_TYPES.PROPERTY,      name: "New York",      price: 140, ...G("violet") },
  { id: 10, type: TILE_TYPES.TAX,           name: "Premium Tax",   amount: 75 },
  { id: 11, type: TILE_TYPES.PROPERTY,      name: "San Francisco", price: 160, ...G("violet") },
  { id: 12, type: TILE_TYPES.SURPRISE,      name: "Surprise" },
  { id: 13, type: TILE_TYPES.PROPERTY,      name: "Los Angeles",   price: 200, ...G("amber") },
  { id: 14, type: TILE_TYPES.TRANSIT,       name: "JFK Airport",   price: 150, rent: [25,50,100,200] },
  { id: 15, type: TILE_TYPES.PROPERTY,      name: "Cape Town",     price: 180, ...G("amber") },
  { id: 16, type: TILE_TYPES.REST,          name: "Vacation" },

  // Top row (ids 17-24, left to right)
  { id: 17, type: TILE_TYPES.PROPERTY,      name: "London",        price: 220, ...G("crimson") },
  { id: 18, type: TILE_TYPES.PROPERTY,      name: "Birmingham",    price: 220, ...G("crimson") },
  { id: 19, type: TILE_TYPES.TREASURE,      name: "Treasure" },
  { id: 20, type: TILE_TYPES.TRANSIT,       name: "LHR Airport",   price: 150, rent: [25,50,100,200] },
  { id: 21, type: TILE_TYPES.PROPERTY,      name: "Manchester",    price: 240, ...G("crimson") },
  { id: 22, type: TILE_TYPES.PROPERTY,      name: "Shanghai",      price: 260, ...G("azure") },
  { id: 23, type: TILE_TYPES.PROPERTY,      name: "Beijing",       price: 260, ...G("azure") },
  { id: 24, type: TILE_TYPES.GO_TO_HOLDING, name: "Go to Prison" },

  // Right column (ids 25-31, top to bottom)
  { id: 25, type: TILE_TYPES.PROPERTY,      name: "Tokyo",         price: 280, ...G("azure") },
  { id: 26, type: TILE_TYPES.SURPRISE,      name: "Surprise" },
  { id: 27, type: TILE_TYPES.UTILITY,       name: "Power Co.",     price: 150, multiplier: [4,10] },
  { id: 28, type: TILE_TYPES.PROPERTY,      name: "Paris",         price: 300, ...G("jade") },
  { id: 29, type: TILE_TYPES.PROPERTY,      name: "Milan",         price: 320, ...G("jade") },
  { id: 30, type: TILE_TYPES.UTILITY,       name: "Water Co.",     price: 150, multiplier: [4,10] },
  { id: 31, type: TILE_TYPES.TRANSIT,       name: "MUC Airport",   price: 150, rent: [25,50,100,200] },
];

export const COLOR_GROUP_DEFS = COLOR_GROUPS;
export const TOTAL_TILES = BOARD.length;
export function propertiesByGroup(group) {
  return BOARD.filter((t) => t.type === TILE_TYPES.PROPERTY && t.group === group);
}
