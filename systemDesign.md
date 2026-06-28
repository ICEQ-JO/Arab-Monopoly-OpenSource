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
- `players[]` — `{ id, token, name, color, connected, balance, position,
  inHolding, holdingTurns, holdingFreeCard, bankrupt, properties[] }`.
  `id` is a stable identity (nanoid) independent of any socket — see §2.4.
  `token` is a private secret used only to authorize a reconnect; it is
  stripped before the state is ever broadcast (`toState()` omits it).
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
  that player's properties back to the bank (deletes ownership entries),
  marks them bankrupt, and declares a winner if only one player remains.
- `endTurn` advances `turnIndex`, skipping bankrupt players.
- `toState()` is the **entire wire contract** — see §4.

### 2.4 `index.js` — Socket.io wiring
Thin glue only — no game logic. Each socket event handler calls the matching
`Room` method, then `broadcastState(roomCode)` re-serializes and emits
`state` to every socket in that room. Rooms live in an in-memory `Map<code,
Room>` (module-level state); nothing is persisted to disk or a database, so
a server restart drops all active games.

**Identity model (decoupled from `socket.id`):** a player's stable identity
is a server-generated `playerId` (nanoid), not their socket id — sockets
come and go (refresh, network blip, reconnect), identities don't. Two
module-level maps translate between them per connection:
- `socketToRoom: Map<socket.id, roomCode>`
- `socketToPlayer: Map<socket.id, playerId>`

`createRoom`/`joinRoom` mint a fresh `{ playerId, token }` pair (both
nanoid) and return them in the ack — `token` is a write-once secret the
client must hold onto (localStorage) to reclaim that seat later. Every
other handler resolves the caller's `playerId` via `socketToPlayer.get(socket.id)`
before calling into `Room` — `Room` methods never see a raw socket id.

**Reconnect (`rejoinRoom` event):** client sends back `{ code, playerId,
token }`. Server looks up the room, calls `room.verifyToken(playerId,
token)`, and on success re-binds the *new* socket to the *existing*
`playerId` (updates both maps, re-joins the Socket.io room channel) and
flips `connected: true` on that player. No game state is touched — same
balance, position, properties, turn order.

**Disconnect handling:** on `disconnect`, the server looks at
`room.started`:
- **not started** (still in the lobby) → no reason to hold a seat for a
  game that hasn't begun, so the player is removed outright via
  `room.removePlayer()` (host reassignment happens here too, see below).
- **started** → the player is *not* removed; `room.setConnected(playerId,
  false)` just flags them, the room/turn order/ownership are untouched, and
  they can rejoin at any time with their saved token.
- There is **no abandonment timeout** — a disconnected player's seat is
  held indefinitely once the game has started. If it's their turn, the
  game will simply wait for them to come back (see §6).

**Host reassignment:** `hostId` is a `playerId`, not a socket id. If the
host disconnects pre-start and is removed, `Room.removePlayer` reassigns
`hostId` to the next remaining player automatically.

## 3. Client (`client/src/`)

- `socket.js` — one shared `socket.io-client` instance for the whole app.
- `session.js` — thin localStorage wrapper (`saveSession`/`loadSession`/
  `clearSession`) for the single key holding `{ code, playerId, token }`.
  This is the only client-side persistence in the app.
- `App.jsx` — top-level: on every socket `connect` event (first connect
  *and* any auto-reconnect), checks `loadSession()` and, if present,
  immediately emits `rejoinRoom` before showing anything else (a brief
  "Reconnecting..." screen covers this). If there's no saved session, or
  the rejoin is rejected (expired/invalid → `clearSession()` is called),
  falls through to `Lobby`. Once joined, listens for the `state` event and
  re-renders `Board` + `Hud` with whatever was last received; also tracks
  the live `socket.connected` flag to show a "Connection lost..." banner.
  Holds no derived game state of its own — `myId` is the stable `playerId`
  returned by the server, never `socket.id`.
- `components/Lobby.jsx` — create-room / join-room form. On a successful
  ack from `createRoom`/`joinRoom`, calls `saveSession(res)` before
  notifying `App` — so the very first join already has a durable session.
- `components/Board.jsx` — `getGridPos(i)` maps each of the 32 tile indices
  onto a 9×9 CSS grid perimeter (tiles 0/8/16/24 are the four corners).
  Purely presentational: reads `board`, `ownership`, `players`,
  `pendingAction` props and renders tiles, ownership color strip, house
  count, and player tokens.
- `components/Hud.jsx` — turn indicator, dice/card display, roll/buy/decline
  /build/end-turn buttons (each gated on `isMyTurn` and `pendingAction`),
  player list with balances/badges, and the log feed. Every interactive
  control just emits a socket event; it never mutates local state directly.

## 4. Wire protocol (Socket.io events)

**Client → Server**
| Event | Payload | Notes |
|---|---|---|
| `createRoom` | `{ name }` | ack: `{ ok, code, playerId, token }` or `{ error }` |
| `joinRoom` | `{ code, name }` | ack: `{ ok, code, playerId, token }` or `{ error }`; rejects if started/full |
| `rejoinRoom` | `{ code, playerId, token }` | ack: `{ ok, code, playerId, token }` or `{ error }`; rebinds this socket to an existing player |
| `startGame` | — | host-only, requires ≥2 players |
| `rollDice` | — | current-player-only; rejected if `pendingAction` set |
| `buyProperty` | — | resolves `pendingAction: awaitBuy` |
| `declineBuy` | — | resolves `pendingAction: awaitBuy` |
| `buyHouse` | `{ tileId }` | requires full color-group ownership |
| `endTurn` | — | current-player-only; rejected if `pendingAction` set |

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
- **Player identity ≠ socket id** — `playerId` (public) + `token` (private,
  never broadcast) are the durable identity; `socket.id` is just whichever
  transport happens to be carrying that player right now. This is what
  makes reconnect possible without touching any game-state shape.
- **No abandonment timeout** — once a game has started, a disconnected
  player's seat is held forever (or until they rejoin). Simpler than
  building a grace-period/eviction timer, at the cost of a game being able
  to stall indefinitely on an absent player's turn (see gap below).

## 6. Known gaps (not yet built)
- Player-to-player trading
- Mortgaging properties
- Auctions when a player declines to buy
- Persistent rooms (everything is wiped on server restart)
- Abandonment handling: nothing currently auto-skips or forfeits a
  disconnected player's turn, so a player who never reconnects mid-game
  can stall the room indefinitely. A reasonable next step would be an
  inactivity timer that auto-ends a disconnected player's turn (or, after
  a longer grace period, marks them bankrupt) — `Room.setConnected` is
  already the hook point to start/clear such a timer from.
