// Original "Surprise" and "Treasure" card decks.
//
// Card ids and effects are load-bearing -- server/test/cardMove.test.js
// forces specific ids ("s4", "s5", "s6") to the top of a deck to make
// card-draw scenarios deterministic, and one assertion checks `lastCard.text`
// exactly (s6). Never change an existing card's id or effect; if you reword
// `text` (as this deck was, for Jordanian-flavored Arabic), update that one
// exact-text assertion and its neighboring illustrative comments to match.
//
// Effect `tile`/`advanceTo` targets are restricted to tile 0 (Start) --
// it's the one position guaranteed to exist at the same meaning on every
// board (classic/worldwide are 48 tiles, middle-east/eu are 32), so a card
// naming any other absolute tile index would go out of bounds on the
// smaller boards. A `move` effect is always relative, so it's safe anywhere.

export const SURPRISE_CARDS = [
  { id: "s1", text: "صاف مخالف يخوي, ادفع 40 دينار", effect: { type: "pay", amount: 40 } },
  { id: "s2", text: "فش مهرب من الضريبة خيو, ادفع 15 دينار عن كل بيت و 50 عن كل فندق", effect: { type: "repair", house: 15, hotel: 50 } },
  { id: "s3", text: "ترى في ممر مشاه اه؟ اطلع ب 50 دينار", effect: { type: "pay", amount: 50 } },
  { id: "s4", text: "طريقك خضرة, روح عالبداية وخذ 200 دينار", effect: { type: "advanceTo", tile: 0, collectStart: true } },
  { id: "s5", text: "ميل عالقرايب, زمان ما زرتهم", effect: { type: "goToHolding" } },
  { id: "s6", text: "ارجعلي 3 خطوات اغلبك", effect: { type: "move", steps: -3 } },
  { id: "s7", text: "كلها مراجل مرأشفة اخي, اطلع ب 25 دينار لكل الشباب", effect: { type: "payEachPlayer", amount: 25 } },
  { id: "s8", text: "لويش مسرع؟ ادفع 30 دينار", effect: { type: "pay", amount: 30 } },
  { id: "s9", text: "جاء الوقت تسد اقساط قرض المرأة.. ادفع 100 دينار", effect: { type: "pay", amount: 100 } },
  { id: "s10", text: "اه.. اه قبالك, ثاني دخلة عشمال. اتقدم 4 خطوات", effect: { type: "move", steps: 4 } },
  { id: "s11", text: "فش مهرب من الضريبة خيو, ادفع 25 دينار عن كل بيت و 75 عن كل فندق", effect: { type: "repair", house: 25, hotel: 75 } },
  { id: "s12", text: "ابعدلي شوي بعد اذنك, ارجع خطوتين", effect: { type: "move", steps: -2 } },
  { id: "s13", text: "موبايلك انكسر, ادفع 60 دينار حق تصليح", effect: { type: "pay", amount: 60 } },
  { id: "s14", text: "اعمل خير وكب بالبحر, اعطي كل حد من الشباب 15 دينار", effect: { type: "payEachPlayer", amount: 15 } },
];

export const TREASURE_CARDS = [
  { id: "t1", text: "لقيت 20 دينار عالأرض", effect: { type: "collect", amount: 20 } },
  { id: "t2", text: "اتعيدت 100 دينار.. يلا عيش", effect: { type: "collect", amount: 100 } },
  { id: "t3", text: "خاوات وأتوات... الك توخذ 10 ليرات من الكل", effect: { type: "collectFromEachPlayer", amount: 10 } },
  { id: "t4", text: "بعت صندل النابولي لمتحف اثار ب 50 دينار", effect: { type: "collect", amount: 50 } },
  { id: "t5", text: "طريقك خضرة, روح عالبداية وخذ 200 دينار", effect: { type: "advanceTo", tile: 0, collectStart: true } },
  { id: "t6", text: "Get out of the Holding Pen free.", effect: { type: "getOutFree" } },
  { id: "t7", text: "سرقت صندوق المرأة وطلعت ب 150 دينار", effect: { type: "collect", amount: 150 } },
  { id: "t8", text: "لقيت 30 دينار في حوض السمك", effect: { type: "collect", amount: 30 } },
  { id: "t9", text: "صار دورك بجمعية الديوان, اخذت 75 دينار", effect: { type: "collect", amount: 75 } },
  { id: "t10", text: "حرك لقدام 4 خطوات اغلبك", effect: { type: "move", steps: 4 } },
  { id: "t11", text: "وصلك راتبك بعد اقتطاع الضمان.... 40 دينار", effect: { type: "collect", amount: 40 } },
  { id: "t12", text: "اذا مش خاوة بديش ياها... خد 15 دينار من الكل", effect: { type: "collectFromEachPlayer", amount: 15 } },
  { id: "t13", text: "طلعت ب 60 دينار من دار المسنين!؟", effect: { type: "collect", amount: 60 } },
  { id: "t14", text: "خد 90 دينار, ودير بالك عحالك", effect: { type: "collect", amount: 90 } },
];

export function shuffledDeck(cards) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
