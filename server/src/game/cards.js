// Original "Surprise" and "Treasure" card decks.
//
// Card ids are load-bearing -- server/test/cardMove.test.js forces specific
// ids ("s4", "s5", "s6") to the top of a deck to make card-draw scenarios
// deterministic, and asserts on their exact `text`. Never change an existing
// card's id, text, or effect; only append new ones with new ids.
//
// Effect `tile`/`advanceTo` targets are restricted to tile 0 (Start) --
// it's the one position guaranteed to exist at the same meaning on every
// board (classic/worldwide are 48 tiles, middle-east/eu are 32), so a card
// naming any other absolute tile index would go out of bounds on the
// smaller boards. A `move` effect is always relative, so it's safe anywhere.

export const SURPRISE_CARDS = [
  { id: "s1", text: "Parking fine! Pay 40 coins.", effect: { type: "pay", amount: 40 } },
  { id: "s2", text: "Pothole damage! Pay 15 coins per house, 50 per hotel.", effect: { type: "repair", house: 15, hotel: 50 } },
  { id: "s3", text: "Jaywalking ticket. Pay 50 coins.", effect: { type: "pay", amount: 50 } },
  { id: "s4", text: "Advance to Start Plaza and collect 200 coins.", effect: { type: "advanceTo", tile: 0, collectStart: true } },
  { id: "s5", text: "Go directly to Holding Pen.", effect: { type: "goToHolding" } },
  { id: "s6", text: "Move back 3 spaces.", effect: { type: "move", steps: -3 } },
  { id: "s7", text: "Pay each player 25 coins.", effect: { type: "payEachPlayer", amount: 25 } },
  { id: "s8", text: "Speeding ticket! Pay 30 coins.", effect: { type: "pay", amount: 30 } },
  { id: "s9", text: "Property tax audit! Pay 100 coins.", effect: { type: "pay", amount: 100 } },
  { id: "s10", text: "Road closed ahead -- move forward 4 spaces.", effect: { type: "move", steps: 4 } },
  { id: "s11", text: "Utility bill due. Pay 25 coins per house, 75 per hotel.", effect: { type: "repair", house: 25, hotel: 75 } },
  { id: "s12", text: "Traffic jam! Move back 2 spaces.", effect: { type: "move", steps: -2 } },
  { id: "s13", text: "Building inspection failed! Pay 60 coins.", effect: { type: "pay", amount: 60 } },
  { id: "s14", text: "Charity drive -- pay each player 15 coins.", effect: { type: "payEachPlayer", amount: 15 } },
];

export const TREASURE_CARDS = [
  { id: "t1", text: "Tax refund! Collect 20 coins.", effect: { type: "collect", amount: 20 } },
  { id: "t2", text: "You found a lottery ticket! Collect 100 coins.", effect: { type: "collect", amount: 100 } },
  { id: "t3", text: "Birthday gift! Collect 10 coins from every player.", effect: { type: "collectFromEachPlayer", amount: 10 } },
  { id: "t4", text: "Sold an old painting. Collect 50 coins.", effect: { type: "collect", amount: 50 } },
  { id: "t5", text: "Advance to Start Plaza and collect 200 coins.", effect: { type: "advanceTo", tile: 0, collectStart: true } },
  { id: "t6", text: "Get out of the Holding Pen free.", effect: { type: "getOutFree" } },
  { id: "t7", text: "Investment matured! Collect 150 coins.", effect: { type: "collect", amount: 150 } },
  { id: "t8", text: "Found cash in an old coat! Collect 30 coins.", effect: { type: "collect", amount: 30 } },
  { id: "t9", text: "Won a raffle! Collect 75 coins.", effect: { type: "collect", amount: 75 } },
  { id: "t10", text: "A shortcut appears -- move forward 4 spaces.", effect: { type: "move", steps: 4 } },
  { id: "t11", text: "Stock dividend! Collect 40 coins.", effect: { type: "collect", amount: 40 } },
  { id: "t12", text: "Friends chip in for your birthday! Collect 15 coins from every player.", effect: { type: "collectFromEachPlayer", amount: 15 } },
  { id: "t13", text: "Freelance gig paid off! Collect 60 coins.", effect: { type: "collect", amount: 60 } },
  { id: "t14", text: "Won the local trivia contest! Collect 90 coins.", effect: { type: "collect", amount: 90 } },
];

export function shuffledDeck(cards) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
