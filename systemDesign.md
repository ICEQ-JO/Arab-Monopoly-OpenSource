# System Design — Fortune City

This document tracks the **current** architecture. Update it in place when the
architecture changes — it describes what *is*, not what changed or why (that's
[progress.md](progress.md)'s job).

## 1. Overview

Fortune City is a real-time multiplayer property-trading board game (original
theme/board, in the same genre as games like Monopoly/RichUp). Two independent
processes:

```
client/  React + Vite, port 5173   <-- WebSocket (Socket.io) -->   server/  Express + Socket.io, port 4000
```

**Core principle: the server is the sole source of truth.** All game rules,
state transitions, and validation live in the server. The client holds no
game logic — it renders whatever state it last received and emits user
intent as events. This means almost every new feature is primarily a server
change; the client mostly just needs new buttons/views to emit events and
display results.

## 2. Server (`server/src/`)

### 2.1 `game/board.js` — static board data
- Exports `BOARD`: an array of 32 tile objects (index = tile id = board
  position). Each tile has a `type` from `TILE_TYPES` (`start`, `property`,
  `transit`, `utility`, `surprise`, `treasure`, `tax`, `rest`, `holding`,
  `go_to_holding`) plus type-specific fields (`price`, `rent` table, `group`,
  `housePrice`, `multiplier`, `amount`).
- Property `rent` arrays are `[level0..level5]` — level 0 = base rent
  (unimproved), levels 1–4 = houses, level 5 = hotel.
- `propertiesByGroup(group)` — helper used to check monopoly/full-group
  ownership (needed for the rent-doubling and house-building rules).
- Pure data + one pure helper. No state, no side effects.

### 2.2 `game/cards.js` — card decks
- `SURPRISE_CARDS` / `TREASURE_CARDS`: each card is `{ id, text, effect }`,
  where `effect` is `{ type, ...params }` interpreted by
  `Room.applyCardEffect`. Effect types: `pay`, `collect`, `payEachPlayer`,
  `collectFromEachPlayer`, `advanceTo`, `move`, `goToHolding`, `getOutFree`,
  `repair`.
- `shuffledDeck(cards)` — Fisher-Yates shuffle, used to reset a deck once
  it's exhausted (decks are drawn from the front, not replaced after each
  draw).

### 2.3 `game/Room.js` — the game engine
One `Room` instance per active game (keyed by room code).

**State held per room:**
- `players[]` — `{ id, name, color, balance, position, inHolding,
  holdingTurns, holdingFreeCard, bankrupt, left, properties[] }`. `id` is a
  stable identity (nanoid) independent of any socket — see §2.4. `left` is
  set by `kickPlayer` (disconnect, manual leave, or turn-timeout — see
  below) and, like `bankrupt`, permanently removes the player from the
  active rotation while keeping them visible in the player list.
- `ownership{}` — `tileId -> { ownerId, houses }` (sparse; only owned tiles
  have entries)
- `turnIndex`, `started`, `winnerId`
- `surpriseDeck` / `treasureDeck` — shuffled, drawn from front
- `log[]` — rolling list of the last 50 human-readable event strings (most
  recent first)
- `pendingAction` — `null` or `{ type: 'awaitBuy', tileId, playerId }`. This
  is the turn-blocking mechanism: while set, no other action (roll, end
  turn) is accepted from that player until they buy or decline.
- `lastRoll`, `lastCard` — transient, for client display, cleared at the
  start of the next turn
- `turnTimer` / `turnDeadline` — the live `setTimeout` handle and its target
  `Date.now()` value for the current player's 4-minute turn clock (see
  §2.4). `turnDeadline` is the only one of the two sent to the client (for
  the countdown display); `turnTimer` is a server-only handle.
- `notify` — a callback injected by `index.js` (`() => broadcastState(code)`)
  so that a *server-initiated* state change — specifically, the turn timer
  firing on its own, with no client request to respond to — can still push
  the new state to everyone in the room.

**Core flow:**
```
rollDice(playerId)
  -> handles Holding Pen logic (doubles to escape / 3-turn cap / pay to leave)
  -> movePlayer(player, steps)
       -> wraps position around the 32 tiles, pays 200 on passing Start
       -> resolveTile(player)
            -> branches on tile type:
                 property/transit/utility -> open awaitBuy, or charge rent if owned by someone else
                 tax                      -> deduct fixed amount
                 surprise/treasure        -> drawCard -> applyCardEffect
                 go_to_holding            -> sendToHolding
            -> checkBankruptcy(player)
```
- `calcRent` handles the three rent shapes: flat property rent (with
  monopoly doubling when unimproved and the owner holds the whole color
  group), transit rent (scales with how many transit tiles the owner holds),
  utility rent (multiplier × last dice roll, scales with utilities owned).
- `buyProperty` / `declineBuy` resolve a pending `awaitBuy`.
- `buyHouse` enforces full-color-group ownership and a 5-level cap (level 5
  = hotel) before allowing a purchase.
- `checkBankruptcy` triggers when balance goes negative: releases all of
  that player's properties back to the bank, marks them bankrupt, and calls
  `checkWinner()`.
- `kickPlayer(playerId, reasonLabel)` is the single exit path for
  disconnects, manual leaves, *and* turn-timeouts (see below): releases
  properties back to the bank, sets `left: true`, clears a `pendingAction`
  that belonged to them, logs `reasonLabel`, calls `checkWinner()`, and —
  only if the kicked player was the current player and the game didn't
  just end — calls `endTurn()` to move play along. Also reassigns `hostId`
  if the host themselves was kicked.
- `checkWinner()` is shared by `checkBankruptcy` and `kickPlayer`: if one
  or zero non-bankrupt/non-left players remain, the turn timer is cleared
  and a winner is declared (or, in the edge case where literally everyone
  is gone, just logs "No players remaining").
- `endTurn` clears the outgoing player's turn timer, advances `turnIndex`
  (skipping both bankrupt *and* left players), and starts a fresh turn
  timer for whoever's up next.
- `start/startTurnTimer/clearTurnTimer` — `start()` kicks off the first
  turn timer; every `endTurn()` clears the old one and starts a new one;
  `kickPlayer` indirectly does the same via `endTurn` when relevant. There
  is exactly one live timer per room at any moment (Section "Turn timer"
  below has the full rationale).
- `toState()` is the **entire wire contract** — see §4.

**Turn timer (4-minute hard cap):** every player gets exactly
`TURN_TIME_LIMIT_MS` (4 minutes) of wall-clock time to complete their
*entire* turn — covering rolling, any buy/decline decision, and building —
regardless of how many sub-actions happen within it (e.g. doubles re-rolls
don't reset the clock). If the timer fires before the turn ends naturally,
the server kicks that player exactly as if they'd disconnected, then
advances the turn. This is enforced **server-side only**: the
`turnDeadline` sent to clients is purely informational (for a countdown
display) — a player can't extend their time by tampering with their own
clock or socket traffic, since the authoritative `setTimeout` lives in the
`Room` instance on the server.

### 2.4 `index.js` — Socket.io wiring
Thin glue only — no game logic. Each socket event handler calls the matching
`Room` method, then `broadcastState(roomCode)` re-serializes and emits
`state` to every socket in that room. Rooms live in an in-memory `Map<code,
Room>` (module-level state); nothing is persisted to disk or a database, so
a server restart drops all active games.

**Identity model (decoupled from `socket.id`):** a player's stable identity
is a server-generated `playerId` (nanoid), not their socket id. Two
module-level maps translate between them per connection:
- `socketToRoom: Map<socket.id, roomCode>`
- `socketToPlayer: Map<socket.id, playerId>`

`createRoom`/`joinRoom` mint a fresh `playerId` and return it in the ack.
Every other handler resolves the caller's `playerId` via
`socketToPlayer.get(socket.id)` before calling into `Room` — `Room`
methods never see a raw socket id. Right after a room is created,
`index.js` also wires `room.notify = () => broadcastState(code)` so the
room's own internal timer (see §2.3) can push state on its own.

**Disconnect = kick, full stop. There is no reconnect.** This was a
deliberate pivot away from an earlier design (see [progress.md](progress.md)
Pass 2 → Pass 3) that tried to hold a disconnected player's seat
indefinitely so they could rejoin later. That added real complexity (a
private `token` secret, a `connected` flag, a `rejoinRoom` event, client-side
session persistence) for a payoff — recovering from a dropped connection —
that's now explicitly out of scope: **any** lost connection, even a
momentary blip, forfeits the seat immediately, with no grace window. On
`socket.io`'s `disconnect` event, the server looks at `room.started`:
- **not started** (still in the lobby) → `room.removePlayer()` removes
  them outright (host reassignment happens here, see below).
- **started** → `room.kickPlayer(playerId, "disconnected and was removed
  from the game")` — same forfeiture as a manual leave or a turn-timeout
  (§2.3), just with a different log message.

**Manual leave (`leaveRoom` event):** the client's "Leave" button emits
this explicitly (rather than just closing the socket) so the server can
process the exit immediately, on the player's own terms, while their
socket connection to the server stays alive for whatever they do next
(e.g. join a different room without a page reload). Same underlying call —
`room.kickPlayer(playerId, "left the game")` if started, `removePlayer`
otherwise — just a different log message than a disconnect.

**Room cleanup:** after any leave/disconnect, `cleanupIfDone(room)` checks
whether the room is now empty (lobby case) or every remaining player is
`bankrupt || left` (in-progress case) and, if so, clears the turn timer and
deletes the room from the `rooms` map — otherwise it broadcasts the new
state as usual.

**Host reassignment:** `hostId` is a `playerId`, not a socket id. If the
host is removed (pre-start `removePlayer`, or `kickPlayer` mid-game),
the next remaining active player automatically becomes host.

## 3. Client (`client/src/`)

- `socket.js` — one shared `socket.io-client` instance for the whole app.
- `App.jsx` — top-level: shows `Lobby` until `onJoined` fires, then listens
  for the `state` event and re-renders `Board` + `Hud` with whatever was
  last received. There is **no client-side persistence at all** — no
  localStorage, no auto-rejoin. If the underlying socket disconnects for
  any reason, the `disconnect` handler just resets straight back to
  `Lobby`, since the server will already have kicked that player by the
  time any client code could react. Holds no derived game state of its
  own — `myId` is the stable `playerId` returned by the server, never
  `socket.id`.
- `components/Lobby.jsx` — create-room / join-room form, calls
  `createRoom`/`joinRoom` with an ack callback.
- `components/Board.jsx` — `getGridPos(i)` maps each of the 32 tile indices
  onto a 9×9 CSS grid perimeter (tiles 0/8/16/24 are the four corners).
  Purely presentational: reads `board`, `ownership`, `players`,
  `pendingAction` props and renders tiles, ownership color strip, house
  count, and player tokens.
- `components/Hud.jsx` — turn indicator, a live countdown derived from
  `state.turnDeadline` (`TurnCountdown`, ticks every second client-side
  purely for display — the server enforces the actual cutoff regardless of
  what the client shows or does), dice/card display, roll/buy/decline
  /build/end-turn buttons (each gated on `isMyTurn` and `pendingAction`), a
  "Leave" button (emits `leaveRoom`, then resets local state), player list
  with balances/badges (including a "left/kicked" badge for anyone removed
  mid-game), and the log feed. Every interactive control just emits a
  socket event; it never mutates local state directly.

## 4. Wire protocol (Socket.io events)

**Client → Server**
| Event | Payload | Notes |
|---|---|---|
| `createRoom` | `{ name }` | ack: `{ ok, code, playerId }` or `{ error }` |
| `joinRoom` | `{ code, name }` | ack: `{ ok, code, playerId }` or `{ error }`; rejects if started/full |
| `startGame` | — | host-only, requires ≥2 players |
| `rollDice` | — | current-player-only; rejected if `pendingAction` set |
| `buyProperty` | — | resolves `pendingAction: awaitBuy` |
| `declineBuy` | — | resolves `pendingAction: awaitBuy` |
| `buyHouse` | `{ tileId }` | requires full color-group ownership |
| `endTurn` | — | current-player-only; rejected if `pendingAction` set |
| `leaveRoom` | — | graceful manual exit; forfeits the seat exactly like a disconnect would |

**Server → Client**
| Event | Payload |
|---|---|
| `state` | Full `Room.toState()` snapshot (see below), broadcast to the whole room on every change |

`toState()` shape:
```js
{
  code, hostId, started, turnIndex, winnerId,
  players: [...],        // see §2.3
  ownership: {...},
  log: [...up to 20],
  lastRoll: [d1, d2] | null,
  lastCard: { deck, text } | null,
  pendingAction: {...} | null,
  turnDeadline: <epoch ms> | null,  // for the client's countdown display only
  board: BOARD,          // static, sent every time (cheap, simplifies client)
}
```
There is no event-sourcing / diffing — every change re-sends the full state.
Fine at this scale (small JSON, few players); would need rethinking if state
grows much larger or tick rate increases.

## 5. Key invariants / design decisions
- **Server-authoritative, full-state broadcast** — simplest possible sync
  model; client never needs to reconcile or predict.
- **`pendingAction` blocks the turn** — the one piece of explicit turn-state
  machine; everything else is inferred from `turnIndex` + player fields.
- **Bankruptcy is immediate and final** — no partial liquidation/asset-sale
  flow; first negative balance ends a player's game.
- **Decks reshuffle on exhaustion**, not after every draw (cards drawn don't
  recirculate until the deck runs out).
- **No persistence layer** — rooms are pure in-memory JS objects.
- **Player identity ≠ socket id** — `playerId` (nanoid) is the durable
  identity used throughout `Room`; `socket.id` is just whichever transport
  happens to be carrying that player right now. Kept purely so the server
  never has to deal with `socket.id` directly in game logic — there is no
  reconnect mechanism built on top of it (see next point).
- **No reconnect, no grace period — disconnect forfeits the seat,
  immediately, every time.** This is a deliberate simplification: an
  earlier pass tried holding a disconnected player's seat open
  indefinitely so they could rejoin, which added meaningful complexity
  (secret tokens, a `connected` flag, client-side session persistence) to
  solve a problem — recovering gracefully from a dropped connection — that
  isn't actually a current requirement. A momentary wifi blip and a
  deliberate quit now look identical to the server (both end in
  `kickPlayer`); only the log message differs.
- **A hard 4-minute clock per turn, enforced server-side.** No player,
  connected or not, can stall the game past 4 minutes on their own turn —
  the timer kicks them exactly like a disconnect would. This bounds how
  long a game can ever be stuck waiting on one person.
- **`bankrupt` and `left` are both terminal, both permanent.** Once either
  is set there is no path back into the active rotation for that player in
  that game — by design, mirroring "kicked is kicked" rather than treating
  it as a recoverable state.

## 6. Known gaps (not yet built)
- Player-to-player trading
- Mortgaging properties
- Auctions when a player declines to buy
- Persistent rooms (everything is wiped on server restart)
- No tolerance for brief blips: a 2-second wifi hiccup currently ends a
  player's game exactly like quitting on purpose would. If that turns out
  to be too harsh in practice, the fix would be a short server-side grace
  window before calling `kickPlayer` on disconnect (not before — that was
  tried and explicitly walked back, see progress.md Pass 3) rather than
  reviving full reconnect/session support.
- No UI affordance for *why* a player saw themselves dumped back to the
  lobby (ran out of time vs. got disconnected vs. someone else ended the
  game) beyond what's in the shared log — there's no personal "you were
  kicked because X" toast on the client that triggered it.
