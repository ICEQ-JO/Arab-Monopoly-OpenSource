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
  holdingTurns, holdingFreeCard, bankrupt, properties[] }`
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
a server restart drops all active games. Player identity = socket id, so a
page refresh currently disconnects the player from the room (no reconnect
support yet — see §6).

## 3. Client (`client/src/`)

- `socket.js` — one shared `socket.io-client` instance for the whole app.
- `App.jsx` — top-level: shows `Lobby` until `onJoined` fires, then listens
  for the `state` socket event and re-renders `Board` + `Hud` with whatever
  was last received. Holds no derived game state of its own.
- `components/Lobby.jsx` — create-room / join-room form, calls
  `createRoom`/`joinRoom` with an ack callback.
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
| `createRoom` | `{ name }` | ack: `{ ok, code }` or `{ error }` |
| `joinRoom` | `{ code, name }` | ack: `{ ok, code }` or `{ error }`; rejects if started/full |
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

## 6. Known gaps (not yet built)
- Player-to-player trading
- Mortgaging properties
- Auctions when a player declines to buy
- Reconnect handling (refresh = dropped from room; would need a
  player-identity token independent of socket id, stored client-side and
  sent back on reconnect to re-bind to the existing `Room` player entry)
- Persistent rooms (everything is wiped on server restart)
