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

// Short percussive rattle: 2-4 quick noise-burst clicks with randomized
// pitch/timing, over ~150-250ms.
export function playDiceRoll() {
  const c = safeCtx();
  if (!c) return;
  const clicks = 2 + Math.floor(Math.random() * 3);
  let t = c.currentTime;
  for (let i = 0; i < clicks; i++) {
    const dur = 0.03 + Math.random() * 0.02;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200 + Math.random() * 2000;
    bp.Q.value = 1.2;
    const gain = c.createGain();
    gain.gain.value = 0.25;
    src.connect(bp);
    bp.connect(gain);
    gain.connect(c.destination);
    src.start(t);
    t += 0.03 + Math.random() * 0.05;
  }
}

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
