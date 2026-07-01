// Classic Vintage — original Arab-themed board. 48 tiles laid out in a
// square loop (12 per side, corners at 0/12/24/36). Index 0 is "Start"
// (top-left corner). Paired with the cv2-* "Classic Vintage" client theme.
import { TILE_TYPES } from "../tile-types.js";

const COLOR_GROUPS = {
  pink:          { color: "#ff5fa2", rentLevels: [2, 10, 30, 90, 160, 250],     housePrice: 50 },
  blueTop:       { color: "#2980b9", rentLevels: [6, 30, 90, 270, 400, 550],    housePrice: 50 },
  olive:         { color: "#6b6b1f", rentLevels: [10, 50, 150, 450, 625, 750],  housePrice: 100 },
  salmonRight:   { color: "#e57373", rentLevels: [14, 70, 200, 550, 750, 950],  housePrice: 100 },
  goldenrod:     { color: "#b8860b", rentLevels: [18, 90, 250, 700, 875, 1050], housePrice: 150 },
  greenBottom:   { color: "#2ecc71", rentLevels: [22, 110, 330, 800, 975, 1150], housePrice: 150 },
  violetBottom:  { color: "#9b59b6", rentLevels: [26, 130, 390, 900, 1100, 1275], housePrice: 200 },
  salmonLeft:    { color: "#ef9a9a", rentLevels: [28, 150, 450, 1000, 1200, 1400], housePrice: 200 },
  tealLeft:      { color: "#16a596", rentLevels: [35, 175, 500, 1100, 1400, 1700], housePrice: 250 },
};

const STATION_RENT = [25, 50, 75, 100, 150, 200]; // by count of the 6 stations owned

function G(group) {
  return {
    group,
    groupColor: COLOR_GROUPS[group].color,
    rent: COLOR_GROUPS[group].rentLevels,
    housePrice: COLOR_GROUPS[group].housePrice,
  };
}

// Layout convention: the 4 corners (ids 0, 12, 24, 36 -- see BoardClassic.jsx's
// getGridPos) hold the 4 non-property "big" tiles (Start, Holding,
// Rest/free-parking, Go-to-Holding). Ids increase clockwise from Start
// (top-left): rightward across the top, down the right side, leftward
// across the bottom, up the left side back to Start. Within each side,
// every color group's tiles are kept contiguous; non-property tiles
// (treasure/surprise/tax/transit/the mid-edge "safety" rest tiles) sit only
// *between* groups, acting as separators, never inside one.
export const BOARD = [
  { id: 0,  type: TILE_TYPES.START,         name: "البداية" },
  { id: 1,  type: TILE_TYPES.PROPERTY,      name: "سحاب",            price: 60,  ...G("pink") },
  { id: 2,  type: TILE_TYPES.TREASURE,      name: "صنوق الحج" },
  { id: 3,  type: TILE_TYPES.PROPERTY,      name: "رصيفة",           price: 60,  ...G("pink") },
  { id: 4,  type: TILE_TYPES.TAX,           name: "ضريبة",           amount: 100 },
  { id: 5,  type: TILE_TYPES.PROPERTY,      name: "مدينة الكويت",    price: 100, ...G("blueTop") },
  { id: 6,  type: TILE_TYPES.TRANSIT,       name: "محطة الكوستر",    price: 150, rent: STATION_RENT },
  { id: 7,  type: TILE_TYPES.PROPERTY,      name: "الأحمدي",         price: 100, ...G("blueTop") },
  { id: 8,  type: TILE_TYPES.PROPERTY,      name: "الجزر الكويتية",  price: 120, ...G("blueTop") },
  { id: 9,  type: TILE_TYPES.TRANSIT,       name: "محطة كوستر",      price: 150, rent: STATION_RENT },
  { id: 10, type: TILE_TYPES.PROPERTY,      name: "داقستان",         price: 140, ...G("olive") },
  { id: 11, type: TILE_TYPES.PROPERTY,      name: "موسكو",           price: 160, ...G("olive") },
  { id: 12, type: TILE_TYPES.HOLDING,       name: "في الحبس مظاليم" },
  { id: 13, type: TILE_TYPES.PROPERTY,      name: "اغوار الشمال",    price: 180, ...G("salmonRight") },
  { id: 14, type: TILE_TYPES.PROPERTY,      name: "نهر الميراندا",   price: 180, ...G("salmonRight") },
  { id: 15, type: TILE_TYPES.SURPRISE,      name: "الحظ" },
  { id: 16, type: TILE_TYPES.PROPERTY,      name: "اغوار الجنوب",    price: 200, ...G("salmonRight") },
  { id: 17, type: TILE_TYPES.REST,          name: "عليكم الأمان" },
  { id: 18, type: TILE_TYPES.TRANSIT,       name: "محطة كوستر",      price: 150, rent: STATION_RENT },
  { id: 19, type: TILE_TYPES.PROPERTY,      name: "ميونخ",           price: 220, ...G("goldenrod") },
  { id: 20, type: TILE_TYPES.TREASURE,      name: "صندوق المرأة" },
  { id: 21, type: TILE_TYPES.PROPERTY,      name: "فرانكفورت",       price: 220, ...G("goldenrod") },
  { id: 22, type: TILE_TYPES.TAX,           name: "ضريبة",           amount: 150 },
  { id: 23, type: TILE_TYPES.PROPERTY,      name: "بيرلين",          price: 240, ...G("goldenrod") },
  { id: 24, type: TILE_TYPES.REST,          name: "استراحة محارب" },
  { id: 25, type: TILE_TYPES.PROPERTY,      name: "نيتانيا",         price: 260, ...G("greenBottom") },
  { id: 26, type: TILE_TYPES.SURPRISE,      name: "الحظ" },
  { id: 27, type: TILE_TYPES.PROPERTY,      name: "حيفا",            price: 260, ...G("greenBottom") },
  { id: 28, type: TILE_TYPES.TREASURE,      name: "جمعية الديوان" },
  { id: 29, type: TILE_TYPES.PROPERTY,      name: "تل ابيب",         price: 280, ...G("greenBottom") },
  { id: 30, type: TILE_TYPES.TRANSIT,       name: "محطة كوستر",      price: 150, rent: STATION_RENT },
  { id: 31, type: TILE_TYPES.PROPERTY,      name: "سيناء",           price: 300, ...G("violetBottom") },
  { id: 32, type: TILE_TYPES.PROPERTY,      name: "قاهرة",           price: 300, ...G("violetBottom") },
  { id: 33, type: TILE_TYPES.TAX,           name: "ضريبة",           amount: 200 },
  { id: 34, type: TILE_TYPES.PROPERTY,      name: "الاسكندرية",      price: 320, ...G("violetBottom") },
  { id: 35, type: TILE_TYPES.TRANSIT,       name: "محطة كوستر",      price: 150, rent: STATION_RENT },
  { id: 36, type: TILE_TYPES.GO_TO_HOLDING, name: "ميل عأحبابك بالمهجع" },
  { id: 37, type: TILE_TYPES.PROPERTY,      name: "بابل",            price: 340, ...G("salmonLeft") },
  { id: 38, type: TILE_TYPES.PROPERTY,      name: "اربيل",           price: 340, ...G("salmonLeft") },
  { id: 39, type: TILE_TYPES.PROPERTY,      name: "كربلاء",          price: 360, ...G("salmonLeft") },
  { id: 40, type: TILE_TYPES.SURPRISE,      name: "الحظ" },
  { id: 41, type: TILE_TYPES.PROPERTY,      name: "بغداد",           price: 360, ...G("salmonLeft") },
  { id: 42, type: TILE_TYPES.TRANSIT,       name: "محطة كوستر",      price: 150, rent: STATION_RENT },
  { id: 43, type: TILE_TYPES.TREASURE,      name: "صندوق المرأة" },
  { id: 44, type: TILE_TYPES.PROPERTY,      name: "الطفيلة",         price: 380, ...G("tealLeft") },
  { id: 45, type: TILE_TYPES.PROPERTY,      name: "السلط",           price: 400, ...G("tealLeft") },
  { id: 46, type: TILE_TYPES.REST,          name: "عليكم الأمان" },
  { id: 47, type: TILE_TYPES.PROPERTY,      name: "اربد",            price: 420, ...G("tealLeft") },
];

export const TOTAL_TILES = BOARD.length;
export const COLOR_GROUP_DEFS = COLOR_GROUPS;

export function propertiesByGroup(group) {
  return BOARD.filter((t) => t.type === TILE_TYPES.PROPERTY && t.group === group);
}
