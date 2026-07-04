// Shared sound-effect module. Owns a single lazily-created AudioContext so
// all game sounds share one mute flag and one context.
const KEY = "richman-sound-enabled";

let ctx = null;
// Default ON -- gameplay is expected to have sound, and the browser's autoplay
// policy only blocks audio before the first user gesture.
let enabled = localStorage.getItem(KEY) !== "false";

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(v) {
  enabled = v;
  localStorage.setItem(KEY, String(v));
}

// Call from a real user gesture (click) to create/resume the shared context.
export function primeAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function getAudioContext() {
  return ctx;
}

function safeCtx() {
  if (!enabled || !ctx || ctx.state !== "running") return null;
  return ctx;
}

const clipBufferCache = new Map();
function loadClipBuffer(c, src) {
  if (clipBufferCache.has(src)) return clipBufferCache.get(src);
  const promise = fetch(src)
    .then((res) => res.arrayBuffer())
    .then((data) => c.decodeAudioData(data));
  clipBufferCache.set(src, promise);
  return promise;
}

function makeClipPlayer(src, volume = 1) {
  return () => {
    const c = safeCtx();
    if (!c) return;
    loadClipBuffer(c, src).then((buffer) => {
      const node = c.createBufferSource();
      node.buffer = buffer;
      const gain = c.createGain();
      gain.gain.value = volume;
      node.connect(gain);
      gain.connect(c.destination);
      node.start();
    }).catch(() => {});
  };
}

export const playDiceThrow      = makeClipPlayer("/sounds/dice_throw.mp3", 0.8);
export const playDoubleDice     = makeClipPlayer("/sounds/doubleDice.mp3", 0.8);
export const playThirdDouble    = makeClipPlayer("/sounds/thirdDouble.mp3");
export const playGoToPrison     = makeClipPlayer("/sounds/when_player_goes_to_priosn.mp3");
export const playMoneyGained    = makeClipPlayer("/sounds/money_gained.mp3");
export const playMoneyLost      = makeClipPlayer("/sounds/money_lost.mp3");
export const playAuctionStart   = makeClipPlayer("/sounds/auction_start.mp3");
export const playWin            = makeClipPlayer("/sounds/win.mp3");
export const playBuild          = makeClipPlayer("/sounds/build_house_hotel.mp3");
export const playSellBuilding   = makeClipPlayer("/sounds/build_sell.mp3");
export const playMortgage       = makeClipPlayer("/sounds/mortgaged.mp3");
export const playCardPull       = makeClipPlayer("/sounds/card-pull.mp3");
export const playGameStart      = makeClipPlayer("/sounds/gameStart.mp3");
export const playError          = makeClipPlayer("/sounds/error.mp3");

// Backwards-compatible aliases for existing callers.
export const playTradePopup     = playMoneyGained;   // ponytail: old trade-offer sound removed; reuse gain chime
export const playTradeAccepted  = playMoneyGained;   // ponytail: old trade-accept sound removed; reuse gain chime
export const playTradeDeclined  = playMoneyLost;     // ponytail: old trade-decline sound removed; reuse loss chime
export const playBoughtTile     = playMoneyLost;     // ponytail: old buy sound removed; reuse loss chime (purchase = cash out)

// Token movement swoosh (synthesized, per-step).
export function playMoveSwoosh() {
  const c = safeCtx();
  if (!c) return;
  const dur = 0.18 + Math.random() * 0.08;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, t0);
  osc.frequency.exponentialRampToValueAtTime(140, t0 + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.001, t0);
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
