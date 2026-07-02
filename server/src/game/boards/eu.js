// EU — European city board. 32 tiles laid out in a square loop (8 per side,
// corners at 0/8/16/24). Index 0 is "Start" (top-left corner). Smaller than
// Classic Vintage (48 tiles); paired with the same generic cv2-* client
// theme (board rendering is fully data-driven, no per-map client code).
import { TILE_TYPES } from "../tile-types.js";

// `basePrice` is the group's cheapest tile -- rentLevels is tuned for that
// price point, and any pricier tile in the same group scales up from it (see
// the per-tile rent scaling pass below BOARD).
const COLOR_GROUPS = {
  iberian: { color: "#8e44ad", basePrice: 60,  rentLevels: [2, 10, 30, 90, 160, 250],     housePrice: 50 },
  western: { color: "#2980b9", basePrice: 100, rentLevels: [6, 30, 90, 270, 400, 550],    housePrice: 50 },
  central: { color: "#16a085", basePrice: 120, rentLevels: [8, 40, 100, 300, 450, 600],   housePrice: 100 },
  eastern: { color: "#d35400", basePrice: 140, rentLevels: [10, 50, 150, 450, 625, 750],  housePrice: 100 },
  benelux:  { color: "#f39c12", basePrice: 160, rentLevels: [12, 60, 180, 500, 700, 900], housePrice: 150 },
  nordic:  { color: "#27ae60", basePrice: 180, rentLevels: [14, 70, 200, 550, 750, 950],  housePrice: 150 },
  alpine:  { color: "#c0392b", basePrice: 200, rentLevels: [16, 80, 220, 600, 800, 1000], housePrice: 200 },
  capital: { color: "#2c3e50", basePrice: 220, rentLevels: [18, 90, 250, 700, 875, 1050], housePrice: 200 },
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

// Same layout convention as classic-vintage.js: 4 corners (ids 0, 8, 16, 24)
// hold Start/Holding/Rest/Go-to-Holding; ids increase clockwise from Start;
// within each side, color-group tiles stay contiguous (a 2-tile group may
// still have a single card/tax tile between its two members, matching the
// real board's opening-sequence convention), non-group tiles only sit
// between groups or around them, never splitting a longer run.
export const BOARD = [
  { id: 0,  type: TILE_TYPES.START,         name: "بداية أوروبا" },
  { id: 1,  type: TILE_TYPES.PROPERTY,      name: "لشبونة",   price: 60,  ...G("iberian") },
  { id: 2,  type: TILE_TYPES.TREASURE,      name: "صندوق الاتحاد" },
  { id: 3,  type: TILE_TYPES.PROPERTY,      name: "مدريد",    price: 60,  ...G("iberian") },
  { id: 4,  type: TILE_TYPES.TAX,           name: "ضريبة الاتحاد", amount: 80 },
  { id: 5,  type: TILE_TYPES.PROPERTY,      name: "باريس",    price: 100, ...G("western") },
  { id: 6,  type: TILE_TYPES.TRANSIT,       name: "محطة القطار الأوروبي", price: 150, rent: STATION_RENT },
  { id: 7,  type: TILE_TYPES.PROPERTY,      name: "روما",     price: 100, ...G("western") },

  { id: 8,  type: TILE_TYPES.HOLDING,       name: "استراحة قسرية" },
  { id: 9,  type: TILE_TYPES.PROPERTY,      name: "برلين",    price: 120, ...G("central") },
  { id: 10, type: TILE_TYPES.SURPRISE,      name: "الحظ الأوروبي" },
  { id: 11, type: TILE_TYPES.PROPERTY,      name: "فيينا",    price: 120, ...G("central") },
  { id: 12, type: TILE_TYPES.TRANSIT,       name: "محطة القطار الأوروبي", price: 150, rent: STATION_RENT },
  { id: 13, type: TILE_TYPES.PROPERTY,      name: "براغ",     price: 140, ...G("eastern") },
  { id: 14, type: TILE_TYPES.TAX,           name: "ضريبة الجمارك", amount: 100 },
  { id: 15, type: TILE_TYPES.PROPERTY,      name: "وارسو",    price: 140, ...G("eastern") },

  { id: 16, type: TILE_TYPES.REST,          name: "استراحة المسافر" },
  { id: 17, type: TILE_TYPES.PROPERTY,      name: "أمستردام", price: 160, ...G("benelux") },
  { id: 18, type: TILE_TYPES.TREASURE,      name: "صندوق الاتحاد" },
  { id: 19, type: TILE_TYPES.PROPERTY,      name: "بروكسل",   price: 160, ...G("benelux") },
  { id: 20, type: TILE_TYPES.TRANSIT,       name: "محطة القطار الأوروبي", price: 150, rent: STATION_RENT },
  { id: 21, type: TILE_TYPES.PROPERTY,      name: "ستوكهولم", price: 180, ...G("nordic") },
  { id: 22, type: TILE_TYPES.SURPRISE,      name: "الحظ الأوروبي" },
  { id: 23, type: TILE_TYPES.PROPERTY,      name: "أوسلو",    price: 180, ...G("nordic") },

  { id: 24, type: TILE_TYPES.GO_TO_HOLDING, name: "تأخر القطار" },
  { id: 25, type: TILE_TYPES.PROPERTY,      name: "زيوريخ",   price: 200, ...G("alpine") },
  { id: 26, type: TILE_TYPES.PROPERTY,      name: "جنيف",     price: 200, ...G("alpine") },
  { id: 27, type: TILE_TYPES.TRANSIT,       name: "محطة القطار الأوروبي", price: 150, rent: STATION_RENT },
  { id: 28, type: TILE_TYPES.PROPERTY,      name: "لندن",     price: 220, ...G("capital") },
  { id: 29, type: TILE_TYPES.PROPERTY,      name: "أثينا",    price: 240, ...G("capital") },
  { id: 30, type: TILE_TYPES.TAX,           name: "ضريبة الجمارك", amount: 120 },
  { id: 31, type: TILE_TYPES.TREASURE,      name: "صندوق الاتحاد" },
];

// Rent scales per tile, not just per group -- see classic-vintage.js for the
// full explanation. Here it only actually changes anything for "capital"
// (London $220 vs Athens $240); every other group is priced identically
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
