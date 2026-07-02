// Worldwide — round-the-globe city board. 48 tiles laid out in a square loop
// (12 per side, corners at 0/12/24/36), same shape and price/rent balance as
// classic-vintage.js, just reskinned continent by continent (Latin America
// through the Gulf megacities). Paired with the same generic cv2-* client
// theme (board rendering is fully data-driven, no per-map client code).
import { TILE_TYPES } from "../tile-types.js";

// `basePrice` is the group's cheapest tile -- rentLevels is tuned for that
// price point, and any pricier tile in the same group scales up from it (see
// the per-tile rent scaling pass below BOARD). Values mirror classic-vintage.js
// one-for-one so both 48-tile boards play at the same pace/economy.
const COLOR_GROUPS = {
  latinAmerica:   { color: "#ff6f61", basePrice: 60,  rentLevels: [2, 10, 30, 90, 160, 250],     housePrice: 50 },
  oceania:        { color: "#00b4d8", basePrice: 100, rentLevels: [6, 30, 90, 270, 400, 550],    housePrice: 50 },
  africa:         { color: "#d4a017", basePrice: 140, rentLevels: [10, 50, 150, 450, 625, 750],  housePrice: 100 },
  southAsia:      { color: "#e67e22", basePrice: 180, rentLevels: [14, 70, 200, 550, 750, 950],  housePrice: 100 },
  eastAsia:       { color: "#e63946", basePrice: 220, rentLevels: [18, 90, 250, 700, 875, 1050], housePrice: 150 },
  northAmerica:   { color: "#3a86ff", basePrice: 260, rentLevels: [22, 110, 330, 800, 975, 1150], housePrice: 150 },
  mediterranean:  { color: "#2a9d8f", basePrice: 300, rentLevels: [26, 130, 390, 900, 1100, 1275], housePrice: 200 },
  northernEurope: { color: "#588157", basePrice: 340, rentLevels: [28, 150, 450, 1000, 1200, 1400], housePrice: 200 },
  megacapitals:   { color: "#6a4c93", basePrice: 380, rentLevels: [35, 175, 500, 1100, 1400, 1700], housePrice: 250 },
};

const STATION_RENT = [25, 50, 150, 200, 250, 300]; // by count of the 6 airports owned

function G(group) {
  return {
    group,
    groupColor: COLOR_GROUPS[group].color,
    rent: COLOR_GROUPS[group].rentLevels,
    housePrice: COLOR_GROUPS[group].housePrice,
  };
}

// Same layout convention as classic-vintage.js: 4 corners (ids 0, 12, 24, 36)
// hold Start/Holding/Rest/Go-to-Holding; ids increase clockwise from Start
// (top-left); within each side, every color group's tiles stay contiguous,
// non-property tiles only sit between groups as separators.
export const BOARD = [
  { id: 0,  type: TILE_TYPES.START,         name: "Start" },
  { id: 1,  type: TILE_TYPES.PROPERTY,      name: "Rio de Janeiro", price: 60,  ...G("latinAmerica") },
  { id: 2,  type: TILE_TYPES.TREASURE,      name: "World Treasure Chest" },
  { id: 3,  type: TILE_TYPES.PROPERTY,      name: "Buenos Aires",   price: 60,  ...G("latinAmerica") },
  { id: 4,  type: TILE_TYPES.TAX,           name: "Customs Duty",   amount: 100 },
  { id: 5,  type: TILE_TYPES.PROPERTY,      name: "Sydney",         price: 100, ...G("oceania") },
  { id: 6,  type: TILE_TYPES.TRANSIT,       name: "International Airport", price: 150, rent: STATION_RENT },
  { id: 7,  type: TILE_TYPES.PROPERTY,      name: "Auckland",       price: 100, ...G("oceania") },
  { id: 8,  type: TILE_TYPES.PROPERTY,      name: "Wellington",     price: 120, ...G("oceania") },
  { id: 9,  type: TILE_TYPES.TRANSIT,       name: "International Airport", price: 150, rent: STATION_RENT },
  { id: 10, type: TILE_TYPES.PROPERTY,      name: "Nairobi",        price: 140, ...G("africa") },
  { id: 11, type: TILE_TYPES.PROPERTY,      name: "Cape Town",      price: 160, ...G("africa") },
  { id: 12, type: TILE_TYPES.HOLDING,       name: "Customs Hold" },
  { id: 13, type: TILE_TYPES.PROPERTY,      name: "Mumbai",         price: 180, ...G("southAsia") },
  { id: 14, type: TILE_TYPES.PROPERTY,      name: "New Delhi",      price: 180, ...G("southAsia") },
  { id: 15, type: TILE_TYPES.SURPRISE,      name: "Travel Surprise" },
  { id: 16, type: TILE_TYPES.PROPERTY,      name: "Bangkok",        price: 200, ...G("southAsia") },
  { id: 17, type: TILE_TYPES.REST,          name: "Layover" },
  { id: 18, type: TILE_TYPES.TRANSIT,       name: "International Airport", price: 150, rent: STATION_RENT },
  { id: 19, type: TILE_TYPES.PROPERTY,      name: "Seoul",          price: 220, ...G("eastAsia") },
  { id: 20, type: TILE_TYPES.TREASURE,      name: "World Treasure Chest" },
  { id: 21, type: TILE_TYPES.PROPERTY,      name: "Hong Kong",      price: 220, ...G("eastAsia") },
  { id: 22, type: TILE_TYPES.TAX,           name: "Customs Duty",   amount: 150 },
  { id: 23, type: TILE_TYPES.PROPERTY,      name: "Tokyo",          price: 240, ...G("eastAsia") },
  { id: 24, type: TILE_TYPES.REST,          name: "Wanderer's Rest" },
  { id: 25, type: TILE_TYPES.PROPERTY,      name: "Toronto",        price: 260, ...G("northAmerica") },
  { id: 26, type: TILE_TYPES.SURPRISE,      name: "Travel Surprise" },
  { id: 27, type: TILE_TYPES.PROPERTY,      name: "Chicago",        price: 260, ...G("northAmerica") },
  { id: 28, type: TILE_TYPES.TREASURE,      name: "World Treasure Chest" },
  { id: 29, type: TILE_TYPES.PROPERTY,      name: "Vancouver",      price: 280, ...G("northAmerica") },
  { id: 30, type: TILE_TYPES.TRANSIT,       name: "International Airport", price: 150, rent: STATION_RENT },
  { id: 31, type: TILE_TYPES.PROPERTY,      name: "Barcelona",      price: 300, ...G("mediterranean") },
  { id: 32, type: TILE_TYPES.PROPERTY,      name: "Milan",          price: 300, ...G("mediterranean") },
  { id: 33, type: TILE_TYPES.TAX,           name: "Customs Duty",   amount: 200 },
  { id: 34, type: TILE_TYPES.PROPERTY,      name: "Lisbon",         price: 320, ...G("mediterranean") },
  { id: 35, type: TILE_TYPES.TRANSIT,       name: "International Airport", price: 150, rent: STATION_RENT },
  { id: 36, type: TILE_TYPES.GO_TO_HOLDING, name: "Flight Cancelled" },
  { id: 37, type: TILE_TYPES.PROPERTY,      name: "Copenhagen",     price: 340, ...G("northernEurope") },
  { id: 38, type: TILE_TYPES.PROPERTY,      name: "Oslo",           price: 340, ...G("northernEurope") },
  { id: 39, type: TILE_TYPES.PROPERTY,      name: "Helsinki",       price: 360, ...G("northernEurope") },
  { id: 40, type: TILE_TYPES.SURPRISE,      name: "Travel Surprise" },
  { id: 41, type: TILE_TYPES.PROPERTY,      name: "Reykjavik",      price: 360, ...G("northernEurope") },
  { id: 42, type: TILE_TYPES.TRANSIT,       name: "International Airport", price: 150, rent: STATION_RENT },
  { id: 43, type: TILE_TYPES.TREASURE,      name: "World Treasure Chest" },
  { id: 44, type: TILE_TYPES.PROPERTY,      name: "New York",       price: 380, ...G("megacapitals") },
  { id: 45, type: TILE_TYPES.PROPERTY,      name: "Singapore",      price: 400, ...G("megacapitals") },
  { id: 46, type: TILE_TYPES.REST,          name: "Layover" },
  { id: 47, type: TILE_TYPES.PROPERTY,      name: "Dubai",          price: 420, ...G("megacapitals") },
];

// Rent scales per tile, not just per group -- see classic-vintage.js for the
// full explanation. Here it changes anything wherever a group's tiles aren't
// all priced identically (e.g. "oceania" Wellington $120 vs the $100 pair).
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
