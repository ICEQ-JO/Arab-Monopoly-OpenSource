import { Room } from "../src/game/Room.js";

// Builds a started Room with the given player names, ids "p0", "p1", ... in order.
export function makeRoom(names = ["Alice", "Bob"]) {
  const room = new Room("TEST", "p0");
  names.forEach((name, i) => room.addPlayer(`p${i}`, name, `t${i}`));
  room.start();
  return room;
}

// Always clear timers a test may have armed (turn timer, any open auctions, any
// disconnect grace periods) -- node:test runs everything in one process, so a
// leaked setTimeout (the 4-minute turn timer, a 10s auction) keeps the process
// alive and can make an unrelated later test look like it's hanging.
export function cleanup(room) {
  room.clearTurnTimer();
  room.clearAllAuctionTimers();
  for (const player of room.players) {
    if (player.graceTimer) clearTimeout(player.graceTimer);
  }
}

// Runs fn with Math.random patched to deterministically produce the given
// [d1, d2] pairs in order, two Math.random() calls consumed per die (matching
// how Room.rollDice actually rolls). Restores Math.random afterward even if fn
// throws. Replays the final pair forever if fn calls rollDice more times than
// there are pairs provided.
export function withDice(pairs, fn) {
  const seq = [];
  for (const [d1, d2] of pairs) {
    seq.push(toRandom(d1), toRandom(d2));
  }
  const lastPair = pairs[pairs.length - 1] ?? [1, 1];
  const fallback = [toRandom(lastPair[0]), toRandom(lastPair[1])];
  const orig = Math.random;
  let i = 0;
  Math.random = () => {
    if (i < seq.length) return seq[i++];
    return fallback[(i++ - seq.length) % 2];
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

// Math.floor(Math.random() * 6) + 1 === d  <=>  Math.random() in [(d-1)/6, d/6).
// Picks a value safely inside that interval.
function toRandom(d) {
  return (d - 1) / 6 + 1 / 12;
}
