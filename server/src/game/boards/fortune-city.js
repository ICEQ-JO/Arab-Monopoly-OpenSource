// Fortune City — original Arab-themed board. 32 tiles.
import { TILE_TYPES } from "../tile-types.js";

const COLOR_GROUPS = {
  copper:   { color: "#b5651d", rentLevels: [2, 10, 30, 90, 160, 250],   housePrice: 50 },
  teal:     { color: "#16a596", rentLevels: [4, 20, 60, 180, 320, 450],   housePrice: 50 },
  violet:   { color: "#8e44ad", rentLevels: [6, 30, 90, 270, 400, 550],   housePrice: 100 },
  amber:    { color: "#f39c12", rentLevels: [6, 30, 90, 270, 400, 550],   housePrice: 100 },
  crimson:  { color: "#c0392b", rentLevels: [8, 40, 100, 300, 450, 600],  housePrice: 150 },
  azure:    { color: "#2980b9", rentLevels: [8, 40, 100, 300, 450, 600],  housePrice: 150 },
  jade:     { color: "#27ae60", rentLevels: [10, 50, 150, 450, 625, 750], housePrice: 200 },
  obsidian: { color: "#2c3e50", rentLevels: [12, 60, 180, 500, 700, 900], housePrice: 200 },
};

function G(group) {
  return { group, groupColor: COLOR_GROUPS[group].color, rent: COLOR_GROUPS[group].rentLevels, housePrice: COLOR_GROUPS[group].housePrice };
}

export const BOARD = [
  { id: 0,  type: TILE_TYPES.START,        name: "Start Plaza" },
  { id: 1,  type: TILE_TYPES.PROPERTY,     name: "Cobble Row",      price: 60,  ...G("copper") },
  { id: 2,  type: TILE_TYPES.PROPERTY,     name: "Foundry Lane",    price: 60,  ...G("copper") },
  { id: 3,  type: TILE_TYPES.TRANSIT,      name: "Harbor Station",  price: 150, rent: [25,50,100,200] },
  { id: 4,  type: TILE_TYPES.PROPERTY,     name: "Teal Quay",       price: 100, ...G("teal") },
  { id: 5,  type: TILE_TYPES.PROPERTY,     name: "Lagoon Walk",     price: 100, ...G("teal") },
  { id: 6,  type: TILE_TYPES.PROPERTY,     name: "Mariner Ave",     price: 120, ...G("teal") },
  { id: 7,  type: TILE_TYPES.SURPRISE,     name: "Surprise" },
  { id: 8,  type: TILE_TYPES.HOLDING,      name: "Holding Pen" },
  { id: 9,  type: TILE_TYPES.PROPERTY,     name: "Violet Court",    price: 140, ...G("violet") },
  { id: 10, type: TILE_TYPES.PROPERTY,     name: "Amethyst Sq",     price: 140, ...G("violet") },
  { id: 11, type: TILE_TYPES.PROPERTY,     name: "Orchid Blvd",     price: 160, ...G("violet") },
  { id: 12, type: TILE_TYPES.TREASURE,     name: "Treasure Chest" },
  { id: 13, type: TILE_TYPES.PROPERTY,     name: "Jade Summit",     price: 300, ...G("jade") },
  { id: 14, type: TILE_TYPES.UTILITY,      name: "Power Grid",      price: 150, multiplier: [4,10] },
  { id: 15, type: TILE_TYPES.TAX,          name: "Toll Gate",       amount: 100 },
  { id: 16, type: TILE_TYPES.REST,         name: "Garden Rest" },
  { id: 17, type: TILE_TYPES.PROPERTY,     name: "Amber Heights",   price: 180, ...G("amber") },
  { id: 18, type: TILE_TYPES.PROPERTY,     name: "Goldleaf St",     price: 180, ...G("amber") },
  { id: 19, type: TILE_TYPES.PROPERTY,     name: "Sunspire Rd",     price: 200, ...G("amber") },
  { id: 20, type: TILE_TYPES.TRANSIT,      name: "Central Station", price: 150, rent: [25,50,100,200] },
  { id: 21, type: TILE_TYPES.PROPERTY,     name: "Crimson Park",    price: 220, ...G("crimson") },
  { id: 22, type: TILE_TYPES.PROPERTY,     name: "Scarlet Way",     price: 220, ...G("crimson") },
  { id: 23, type: TILE_TYPES.PROPERTY,     name: "Ruby Terrace",    price: 240, ...G("crimson") },
  { id: 24, type: TILE_TYPES.GO_TO_HOLDING,name: "Send to Holding" },
  { id: 25, type: TILE_TYPES.TREASURE,     name: "Treasure Chest" },
  { id: 26, type: TILE_TYPES.SURPRISE,     name: "Surprise" },
  { id: 27, type: TILE_TYPES.PROPERTY,     name: "Azure Crescent",  price: 260, ...G("azure") },
  { id: 28, type: TILE_TYPES.PROPERTY,     name: "Cobalt Pier",     price: 260, ...G("azure") },
  { id: 29, type: TILE_TYPES.PROPERTY,     name: "Sapphire Hill",   price: 280, ...G("azure") },
  { id: 30, type: TILE_TYPES.UTILITY,      name: "Aqueduct Co.",    price: 150, multiplier: [4,10] },
  { id: 31, type: TILE_TYPES.TRANSIT,      name: "North Station",   price: 150, rent: [25,50,100,200] },
];

export const COLOR_GROUP_DEFS = COLOR_GROUPS;
export const TOTAL_TILES = BOARD.length;
export function propertiesByGroup(group) {
  return BOARD.filter((t) => t.type === TILE_TYPES.PROPERTY && t.group === group);
}
