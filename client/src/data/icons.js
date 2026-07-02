// Each icon has a fixed color -- picking an icon also sets the player's
// token/owner-bar color, so the two always match (server/src/game/icons.js
// mirrors this same mapping as ICON_COLORS). `scale` nudges an individual
// icon's rendered size relative to the others, since the source art isn't
// cropped to matching bounds -- most sit at 1, tweak per-icon as needed.
export const ICONS = [
  { id: "italian", name: "Italian", img: "/icons/italian.png", color: "#9b59b6", scale: 0.85 },
  { id: "american", name: "American", img: "/icons/american.png", color: "#e74c3c", scale: 1.15 },
  { id: "russian", name: "Russian", img: "/icons/russian.png", color: "#3498db", scale: 1.15 },
  { id: "arab", name: "Arab", img: "/icons/arab.png", color: "#2ecc71", scale: 1 },
  { id: "japanese", name: "Japanese", img: "/icons/japanese.png", color: "#f1c40f", scale: 1 },
];
