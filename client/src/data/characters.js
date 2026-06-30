export const CHARACTERS = [
  {
    id: "D",
    name: "دروبي",
    description: "Controls a territory of the board and taxes the bank itself.",
    passive:
      "Claims a zone — anyone who lands there pays a personal toll on top of normal rent. Also pockets 50% of every tax the bank collects, anywhere on the board.",
    active: null,
    v1: "/characters/D/v1.jpg",
    v2: "/characters/D/v2.png",
  },
  {
    id: "Z",
    name: "هرم الزرقا",
    description: "A silent skimmer. Earns nothing unless the table stays busy.",
    passive:
      "Takes 5% off every completed trade and 5% of every tax payment — all drawn from the bank, never from the players directly.",
    active: null,
    v1: "/characters/Z/v1.png",
    v2: "/characters/Z/v2.png",
  },
  {
    id: "Y",
    name: "Big Yahu",
    description: "Levels anything in his path. One strike, all floors.",
    passive: null,
    active:
      "Demolishes every building on any property at once — a full hotel gone in a single move. If the lot is empty, forces it into mortgage instead. Recharges based on how much was destroyed.",
    v1: "/characters/Y/v1.jpg",
    v2: "/characters/Y/v2.webp",
  },
  {
    id: "H",
    name: "Hitler",
    description: "An expander. Borders are just suggestions.",
    passive: null,
    active:
      "Seizes the nearest property adjacent to his holdings — buys it freely if unowned, or forces a purchase from a rival at full listed price. Two uses total. No recharge.",
    v1: "/characters/H/v1.jpg",
    v2: "/characters/H/v2.webp",
  },
  {
    id: "SD",
    name: "صدام حسين",
    description: "Owns every station. Targets the richest board.",
    passive:
      "Skims a cut whenever anyone pays rent on a transit station, regardless of who owns it. Owns a station himself? Collects 1.5× rent.",
    active:
      "Targets whoever holds the most developed board — demolishes their buildings or forces a mortgage. Recharges like Y's power.",
    v1: "/characters/SD/v1.png",
    v2: "/characters/SD/v2.jpg",
  },
  {
    id: "SE",
    name: "السيسي",
    description: "Loves the bank. Makes friends with the dangerous ones.",
    passive:
      "Receives a flat bonus every time the bank pays out directly — passing Start, card rewards, anything.",
    active:
      "Once per game: forge a permanent alliance with Big Yahu or Saddam. Your ally can never target you with their attack power again.",
    v1: "/characters/SE/v1.jpg",
    v2: "/characters/SE/v2.jpg",
  },
];
