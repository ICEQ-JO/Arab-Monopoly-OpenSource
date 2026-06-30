// Arab World — Arab cities board. 32 tiles.
import { TILE_TYPES } from "../tile-types.js";

// Groups by region
const COLOR_GROUPS = {
  copper:  { color: "#b5651d", rentLevels: [2, 10, 30, 90, 160, 250],   housePrice: 50,  label: "Arabian Peninsula" },
  teal:    { color: "#16a596", rentLevels: [4, 20, 60, 180, 320, 450],   housePrice: 50,  label: "Levant" },
  violet:  { color: "#8e44ad", rentLevels: [6, 30, 90, 270, 400, 550],   housePrice: 100, label: "Nile Valley" },
  amber:   { color: "#f39c12", rentLevels: [6, 30, 90, 270, 400, 550],   housePrice: 100, label: "Gulf" },
  crimson: { color: "#c0392b", rentLevels: [8, 40, 100, 300, 450, 600],  housePrice: 150, label: "Mesopotamia" },
  azure:   { color: "#2980b9", rentLevels: [8, 40, 100, 300, 450, 600],  housePrice: 150, label: "Maghreb" },
  jade:    { color: "#27ae60", rentLevels: [10, 50, 150, 450, 625, 750], housePrice: 200, label: "Horn of Africa" },
};

function G(group) {
  return { group, groupColor: COLOR_GROUPS[group].color, rent: COLOR_GROUPS[group].rentLevels, housePrice: COLOR_GROUPS[group].housePrice };
}

export const BOARD = [
  // Bottom row (ids 0-8)
  { id: 0,  type: TILE_TYPES.START,         name: "البداية" },
  { id: 1,  type: TILE_TYPES.PROPERTY,      name: "الرياض",        price: 60,  ...G("copper") },
  { id: 2,  type: TILE_TYPES.TREASURE,      name: "كنز" },
  { id: 3,  type: TILE_TYPES.PROPERTY,      name: "مكة",           price: 60,  ...G("copper") },
  { id: 4,  type: TILE_TYPES.TAX,           name: "ضريبة",         amount: 75 },
  { id: 5,  type: TILE_TYPES.PROPERTY,      name: "عمّان",          price: 100, ...G("teal") },
  { id: 6,  type: TILE_TYPES.TRANSIT,       name: "مطار الملكة علياء", price: 150, rent: [25,50,100,200] },
  { id: 7,  type: TILE_TYPES.PROPERTY,      name: "بيروت",         price: 120, ...G("teal") },
  { id: 8,  type: TILE_TYPES.HOLDING,       name: "السجن" },

  // Left column (ids 9-16, bottom to top)
  { id: 9,  type: TILE_TYPES.PROPERTY,      name: "القاهرة",       price: 140, ...G("violet") },
  { id: 10, type: TILE_TYPES.TAX,           name: "ضريبة دخل",    amount: 75 },
  { id: 11, type: TILE_TYPES.PROPERTY,      name: "الإسكندرية",   price: 160, ...G("violet") },
  { id: 12, type: TILE_TYPES.SURPRISE,      name: "مفاجأة" },
  { id: 13, type: TILE_TYPES.PROPERTY,      name: "دبي",           price: 200, ...G("amber") },
  { id: 14, type: TILE_TYPES.TRANSIT,       name: "مطار دبي الدولي", price: 150, rent: [25,50,100,200] },
  { id: 15, type: TILE_TYPES.PROPERTY,      name: "أبوظبي",        price: 180, ...G("amber") },
  { id: 16, type: TILE_TYPES.REST,          name: "الراحة" },

  // Top row (ids 17-24, left to right)
  { id: 17, type: TILE_TYPES.PROPERTY,      name: "بغداد",         price: 220, ...G("crimson") },
  { id: 18, type: TILE_TYPES.PROPERTY,      name: "البصرة",        price: 220, ...G("crimson") },
  { id: 19, type: TILE_TYPES.TREASURE,      name: "كنز" },
  { id: 20, type: TILE_TYPES.TRANSIT,       name: "مطار الكويت",   price: 150, rent: [25,50,100,200] },
  { id: 21, type: TILE_TYPES.PROPERTY,      name: "تونس",          price: 240, ...G("azure") },
  { id: 22, type: TILE_TYPES.PROPERTY,      name: "الدار البيضاء", price: 260, ...G("azure") },
  { id: 23, type: TILE_TYPES.PROPERTY,      name: "الجزائر",       price: 260, ...G("azure") },
  { id: 24, type: TILE_TYPES.GO_TO_HOLDING, name: "اذهب للسجن" },

  // Right column (ids 25-31, top to bottom)
  { id: 25, type: TILE_TYPES.PROPERTY,      name: "الخرطوم",       price: 280, ...G("jade") },
  { id: 26, type: TILE_TYPES.SURPRISE,      name: "مفاجأة" },
  { id: 27, type: TILE_TYPES.UTILITY,       name: "أرامكو",        price: 150, multiplier: [4,10] },
  { id: 28, type: TILE_TYPES.PROPERTY,      name: "الدوحة",        price: 300, ...G("amber") },
  { id: 29, type: TILE_TYPES.PROPERTY,      name: "المنامة",       price: 300, ...G("amber") },
  { id: 30, type: TILE_TYPES.UTILITY,       name: "زين للاتصالات", price: 150, multiplier: [4,10] },
  { id: 31, type: TILE_TYPES.TRANSIT,       name: "مطار الملك خالد", price: 150, rent: [25,50,100,200] },
];

export const COLOR_GROUP_DEFS = COLOR_GROUPS;
export const TOTAL_TILES = BOARD.length;
export function propertiesByGroup(group) {
  return BOARD.filter((t) => t.type === TILE_TYPES.PROPERTY && t.group === group);
}
