// Shared, synthesized (no audio files/libraries) sound-effect module. Owns a
// single lazily-created AudioContext so dice-roll/move sounds and the lobby's
// background ambience (see Lobby.jsx) all share one mute flag and one
// context, rather than each component managing its own.
const KEY = "richman-sound-enabled";

let ctx = null;
// Default OFF, matching the lobby's original default-muted convention --
// nothing can play without a user gesture anyway (browser autoplay policy),
// so defaulting the icon/flag to "on" before any gesture has happened would
// be misleading (looks enabled, plays nothing).
let enabled = localStorage.getItem(KEY) === "true";

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(v) {
  enabled = v;
  localStorage.setItem(KEY, String(v));
}

// Call from a real user gesture (click) to create/resume the shared context.
// Safe to call repeatedly -- creates once, resumes if suspended.
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

// Recorded-clip effects (dice throw, trade lifecycle, buying a tile) are
// decoded once and played through the same shared AudioContext the
// synthesized effects below use, rather than a plain <audio> element. These
// all fire off a game-state broadcast (see App.jsx/BoardClassic.jsx) so every
// player in the room hears them together, including everyone who *didn't*
// click anything themselves this instant -- a plain HTMLMediaElement's
// .play() is what triggers browsers' autoplay block in that case, since it
// isn't running inside the click that caused it. The AudioContext only needs
// resuming once per page (via primeAudio(), itself always called from an
// actual gesture -- the sound toggle or Roll Dice/Buy clicks), and every
// buffer scheduled on it afterwards, sync or async, plays fine.
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

// Dice throw -- fired off the rollSeq broadcast (see Dice.jsx) rather than
// the Roll Dice click itself, so it lands for the whole room together.
export const playDiceThrow = makeClipPlayer("/whoosh.mp3", 0.8);
// A new trade offer landing in everyone's Open Trades list.
export const playTradePopup = makeClipPlayer("/Tradin2.mp3");
// A trade being accepted / declined, or a property being bought (see
// App.jsx's game-log watcher).
export const playTradeAccepted = makeClipPlayer("/TradeAccepted.mp3");
export const playTradeDeclined = makeClipPlayer("/DeclineTrade.mp3");
export const playBoughtTile = makeClipPlayer("/Bought_tile.mp3");

// Quick descending "swoosh": one oscillator with a fast frequency ramp down.
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
