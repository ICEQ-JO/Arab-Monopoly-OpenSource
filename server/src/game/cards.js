// Original "Surprise" and "Treasure" card decks.

export const SURPRISE_CARDS = [
  { id: "s1", text: "Parking fine! Pay 40 coins.", effect: { type: "pay", amount: 40 } },
  { id: "s2", text: "Pothole damage! Pay 15 coins per house, 50 per hotel.", effect: { type: "repair", house: 15, hotel: 50 } },
  { id: "s3", text: "Jaywalking ticket. Pay 50 coins.", effect: { type: "pay", amount: 50 } },
  { id: "s4", text: "Advance to Start Plaza and collect 200 coins.", effect: { type: "advanceTo", tile: 0, collectStart: true } },
  { id: "s5", text: "Go directly to Holding Pen.", effect: { type: "goToHolding" } },
  { id: "s6", text: "Move back 3 spaces.", effect: { type: "move", steps: -3 } },
  { id: "s7", text: "Pay each player 25 coins.", effect: { type: "payEachPlayer", amount: 25 } },
];

export const TREASURE_CARDS = [
  { id: "t1", text: "Tax refund! Collect 20 coins.", effect: { type: "collect", amount: 20 } },
  { id: "t2", text: "You found a lottery ticket! Collect 100 coins.", effect: { type: "collect", amount: 100 } },
  { id: "t3", text: "Birthday gift! Collect 10 coins from every player.", effect: { type: "collectFromEachPlayer", amount: 10 } },
  { id: "t4", text: "Sold an old painting. Collect 50 coins.", effect: { type: "collect", amount: 50 } },
  { id: "t5", text: "Advance to Start Plaza and collect 200 coins.", effect: { type: "advanceTo", tile: 0, collectStart: true } },
  { id: "t6", text: "Get out of the Holding Pen free.", effect: { type: "getOutFree" } },
  { id: "t7", text: "Investment matured! Collect 150 coins.", effect: { type: "collect", amount: 150 } },
];

export function shuffledDeck(cards) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
