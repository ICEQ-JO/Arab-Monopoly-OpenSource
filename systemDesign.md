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
- `players[]` — `{ id, token, name, color, connected, graceTimer, balance,
  position, inHolding, holdingTurns, holdingFreeCard, bankrupt, left,
  properties[] }`. `id` is a stable identity (nanoid) independent of any
  socket — see §2.4. `token` is a private secret (stripped before
  `toState()` ever broadcasts it) that authorizes reclaiming a seat within
  the disconnect grace window — see "Disconnect grace window" below.
  `left` is set by `kickPlayer` (disconnect-after-grace-expires, manual
  leave, or turn-timeout) and, like `bankrupt`, permanently removes the
  player from the active rotation while keeping them visible in the player
  list. `connected` and `graceTimer` (also stripped from `toState()`,
  since it's a raw `setTimeout` handle, not JSON-safe) track an *in-progress*
  disconnect that hasn't yet become a kick.
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
- `trades[]` — `{ id, fromId, toId, offerProperties, offerMoney,
  requestProperties, requestMoney }`. Pending trade offers between any two
  active players — see "Trading" below.

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
- `buyProperty` resolves a pending `awaitBuy` by purchase. `declineBuy`
  resolves it by instead calling `startAuction(tileId)` — see "Auctions"
  below.
- `buyHouse` enforces full-color-group ownership, a 5-level cap (level 5 =
  hotel), and that the property isn't mortgaged before allowing a purchase.
- `sellHouse` is the reverse: reduces `houses` by one and refunds half the
  tile's `housePrice` (rounded down). No full-group requirement to sell
  (unlike building) — you can sell down even if you no longer own the rest
  of the group.
- `mortgageProperty` requires the tile be owned, undeveloped (`houses ===
  0`), and not already mortgaged; pays out half the tile's `price`
  (rounded down) and sets `ownership[tileId].mortgaged = true`.
  `unmortgageProperty` reverses it for `unmortgageCost(tileId)` — the
  mortgage value plus 10% interest (`MORTGAGE_INTEREST_RATE`), rounded up.
  While mortgaged: `resolveTile` waives rent entirely (logged, not
  charged), `buyHouse` refuses to build, and `isTradeable` excludes the
  tile from trading.
- `checkBankruptcy` triggers when balance goes negative: releases all of
  that player's properties back to the bank, marks them bankrupt, and calls
  `checkWinner()`.
- `kickPlayer(playerId, reasonLabel)` is the single exit path for an
  expired disconnect grace window, manual leaves, *and* turn-timeouts (see
  below): clears any pending `graceTimer` for that player, releases
  properties back to the bank, sets `left: true`, clears a `pendingAction`
  that belonged to them, clears any `trades` they're party to (see
  "Trading" below), logs `reasonLabel`, calls `checkWinner()`, and — only
  if the kicked player was the current player and the game didn't just
  end — calls `endTurn()` to move play along. Also reassigns `hostId` if
  the host themselves was kicked.
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
the server kicks that player exactly as if a disconnect grace window had
expired, then advances the turn. This is enforced **server-side only**:
the `turnDeadline` sent to clients is purely informational (for a
countdown display) — a player can't extend their time by tampering with
their own clock or socket traffic, since the authoritative `setTimeout`
lives in the `Room` instance on the server. The turn timer and the
disconnect grace window below are independent: if it's your turn and you
disconnect, whichever fires first wins (in practice, almost always the
20-second grace window, since it's much shorter than 4 minutes).

**Disconnect grace window (20 seconds):** a *lost connection* doesn't kick
a player outright anymore — it starts a 20-second (`DISCONNECT_GRACE_MS`)
countdown via `startGracePeriod(playerId)`, which sets `connected: false`
and schedules a `graceTimer`. Two ways out:
- **Reconnect in time** (`cancelGracePeriod`, triggered by a successful
  `rejoinRoom` — see §2.4): clears the `graceTimer`, flips `connected`
  back to `true`. Balance, position, properties, turn order — nothing
  about the game state was ever touched, since the player was never
  actually removed from anything during the grace window.
- **Grace window expires** (the `graceTimer`'s callback fires): calls
  `kickPlayer(playerId, "didn't reconnect in time and was removed from the
  game")` — same end state as any other kick.

A **manual leave is intentionally not routed through the grace window** —
`leaveRoom` calls `kickPlayer` directly. The grace window exists to absorb
involuntary network blips, not to give a deliberate quit a 20-second undo.

**Trading:** any two active (non-bankrupt, non-left) players can trade,
at any time — trading is **not gated on turn order or `pendingAction`**;
it's a side negotiation, not a turn action. A trade offer is one-directional
in shape but two-sided in content: the proposer's `offerProperties` +
`offerMoney` for the target's `requestProperties` + `requestMoney`.
- `proposeTrade(fromId, {...})` validates both players are active, the
  proposer actually owns every `offerProperties` tile and the target owns
  every `requestProperties` tile, both via `isTradeable()` (must be a
  property/transit/utility tile, owned by the right player, **undeveloped**
  — `!owned.houses` — and **unmortgaged** — `!owned.mortgaged` — mirroring
  the classic rules that you sell houses and pay off mortgages before
  trading a property, sidestepping the question of what happens to houses
  or an outstanding mortgage mid-swap), money amounts are non-negative
  integers, and the trade isn't completely empty. On success it's pushed
  onto `trades[]`, untouched until someone responds.
- `respondTrade(playerId, tradeId, accept)` — only the trade's `toId` can
  respond. A decline just removes the trade. An accept **re-validates
  everything from scratch** (ownership, development, and both players'
  funds) before touching any state — anything could have changed in the
  time between the offer being made and being accepted (a property sold
  off, a house built, a balance spent elsewhere, even another trade
  involving the same property executing first). If re-validation fails,
  the trade is dropped with an error rather than partially applied. If it
  passes: ownership flips both directions, each player's `properties[]`
  array is updated, and `transferMoney` runs in both directions (offer
  money proposer→target, request money target→proposer) — then
  `checkBankruptcy` runs on both players defensively (shouldn't ever
  trigger, since funds were just verified, but cheap to call).
- `cancelTrade(playerId, tradeId)` — only the original proposer (`fromId`)
  can withdraw their own pending offer.
- `counterTrade(playerId, tradeId, {...})` — only the trade's `toId` can
  counter (same authorization as responding). It **replaces** the
  original offer rather than coexisting with it: the original is removed
  from `trades[]` and a brand-new trade is built via the same
  `buildTrade()` helper `proposeTrade` uses, but with the direction
  flipped — the counterer becomes the new `fromId`, the original proposer
  becomes the new `toId`. The new trade carries a `counterOf` field
  pointing at the original trade's id, purely for display ("this is a
  counter-offer") — it has no effect on validation or resolution, which
  treat a counter exactly like any other fresh trade from that point on
  (including being itself counterable again, any number of times).
  `buildTrade(fromId, {...})` is the validation logic both `proposeTrade`
  and `counterTrade` share (extracted in this pass): everything
  `proposeTrade` used to do inline — active-player checks, integer/
  non-negative money, non-empty trade, `isTradeable()` on both sides — now
  lives in one place, returning `{ trade }` or `{ error }` without
  mutating `trades[]` itself, so each caller decides what to do with the
  result (push it fresh, or swap it in for what it's replacing).
- `clearTradesInvolving(playerId)` is called from both `kickPlayer` and
  `checkBankruptcy` so a trade never dangles after one side of it leaves
  the game mid-negotiation. This also covers counter-offers, since a
  counter is just another entry in the same `trades[]` array.

**Auctions:** `declineBuy` no longer just walks away from an unowned
property — it calls `startAuction(tileId)`, opening bidding to every
active player (including whoever just declined).
- `startAuction` pushes a new entry onto `auctions[]` (`{ id, tileId,
  highestBid, highestBidderId, passedIds }`) and sets `pendingAction =
  { type: "auction", tileId, auctionId, playerId: currentPlayer.id }`.
  Because `rollDice`/`endTurn` already refuse to act while *any*
  `pendingAction` is set, this one line is enough to block the declining
  player from rolling again or ending their turn until the auction they
  caused is resolved — no new gating logic needed, just reusing the
  existing mechanism with a new `pendingAction.type`.
- **Several auctions can be open at once.** Each gets its own `id` rather
  than the room holding one auction slot — e.g. a turn-timeout kick mid
  -auction hands the turn to a new player who could immediately land on a
  *different* unowned tile and decline that one too, before the first
  auction has closed. Treating auctions as an array sidesteps that
  conflict entirely instead of needing to queue or reject overlapping ones.
- `placeBid(playerId, auctionId, amount)` — any active player not already
  passed on that specific auction can bid, provided the amount is a whole
  number strictly higher than the current `highestBid` and they can afford
  it. After recording the bid, calls `maybeResolveAuction`.
- `passAuction(playerId, auctionId)` — adds the player to `passedIds`
  (idempotent) and also calls `maybeResolveAuction`.
- `maybeResolveAuction(auctionId)` decides whether bidding is actually
  over: it resolves if **nobody** is left who hasn't passed (no winner —
  the property stays unowned), or if **exactly one** active, non-passed
  player remains *and that player is already the highest bidder*. The
  second condition matters: if the last remaining player hasn't bid yet,
  the auction does **not** auto-resolve in their favor — they still get
  the chance to bid (becoming the winner) or pass (ending it with no
  winner) before anything closes. Auto-awarding it to them without that
  choice would be a real bug, not just an edge case.
- `resolveAuction(auctionId)` removes the auction from `auctions[]`, and
  if there's a `highestBidderId`, charges them, gives them the tile, and
  creates the `ownership` entry exactly like a normal purchase (then runs
  `checkBankruptcy` defensively). If `pendingAction` still points at this
  same `auctionId`, clears it — freeing up the original decliner's turn.
  (If that pending action was already cleared by something else in the
  meantime — e.g. they were turn-timer-kicked while the auction was still
  running — this is a no-op; the auction still resolves correctly, it just
  doesn't need to unblock anyone.)
- `clearAuctionBidsFrom(playerId)` — called from both `kickPlayer` and
  `checkBankruptcy`, same pattern as `clearTradesInvolving`. A
  kicked/bankrupt player can't be left holding the winning bid (or even a
  passive seat) on a still-open auction: if they were the high bidder,
  their bid is **voided** (reset to `highestBid: 0`, `highestBidderId:
  null` — *not* rolled back to the next-highest bid, since individual bid
  history isn't tracked, only the current high bid), and either way
  they're added to `passedIds` so they can't be counted as a remaining
  bidder. Then re-checks whether the auction can now resolve.

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

`createRoom`/`joinRoom` mint a fresh `{ playerId, token }` pair and return
both in the ack — `token` is a write-once secret the client holds onto
(localStorage) purely to reclaim a seat within the 20-second disconnect
grace window (§2.3); it has no other purpose and is never broadcast to
other clients. Every other handler resolves the caller's `playerId` via
`socketToPlayer.get(socket.id)` before calling into `Room` — `Room`
methods never see a raw socket id. Right after a room is created,
`index.js` also wires `room.notify = () => broadcastState(code)` so the
room's own internal timers (turn timer, grace-window timer) can push state
on their own, with no client request to respond to.

**Disconnect → 20s grace window → kick if not reconnected.** This is
narrower than an earlier design (see [progress.md](progress.md) Pass 2)
that held a disconnected seat open *indefinitely*, and stricter than the
in-between design (Pass 3) that kicked on *any* disconnect with zero
tolerance. Pass 4 settled here deliberately: enough slack to survive a
momentary wifi blip or a quick refresh, not enough to let a player stall a
game by staying offline. On `socket.io`'s `disconnect` event, the server
looks at `room.started`:
- **not started** (still in the lobby) → `room.removePlayer()` removes
  them outright, same as always — no grace window pre-start, since there's
  no game state worth protecting yet (host reassignment happens here, see
  below).
- **started** → `room.startGracePeriod(playerId)` (§2.3) — *not* an
  immediate kick. The seat is only actually forfeited if the 20-second
  window lapses without a successful `rejoinRoom`.

**Reconnect (`rejoinRoom` event):** client sends `{ code, playerId,
token }`. The server validates the token via `room.verifyToken`, rejects
if the player is already `left` or `bankrupt` (a kicked seat can't be
reclaimed — the grace window is the *only* path back in, and only before
it expires), then re-binds the new socket to the existing `playerId` and
calls `room.cancelGracePeriod(playerId)`.

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
- `session.js` — thin localStorage wrapper (`saveSession`/`loadSession`/
  `clearSession`) for the single key holding `{ code, playerId, token }`.
  The only client-side persistence in the app, scoped entirely to
  supporting the 20-second grace window.
- `App.jsx` — top-level: on every socket `connect` event (first connect
  *and* any underlying socket.io auto-reconnect), checks `loadSession()`
  and, if present, immediately emits `rejoinRoom` (a brief
  "Reconnecting..." screen covers this attempt). If there's no saved
  session, or the rejoin is rejected (grace window already expired, or the
  player was already `left`/`bankrupt`) → `clearSession()` and fall
  through to `Lobby`. On `disconnect`, it does *not* reset to the lobby —
  it just waits, since socket.io will keep retrying the connection on its
  own and `handleConnect` will attempt the rejoin if that succeeds within
  the window. Holds no derived game state of its own — `myId` is the
  stable `playerId` returned by the server, never `socket.id`.
- `components/Lobby.jsx` — create-room / join-room form. On a successful
  ack, hands the full `{ code, playerId, token }` up to `App`, which saves
  it via `saveSession` before entering the game screen.
- `components/Board.jsx` — `getGridPos(i)` maps each of the 32 tile indices
  onto a 9×9 CSS grid perimeter (tiles 0/8/16/24 are the four corners).
  Purely presentational: reads `board`, `ownership`, `players`,
  `pendingAction` props and renders tiles, ownership color strip, house
  count (or an "M" badge in place of the house count when `owned.mortgaged`
  is true), and player tokens.
- `components/Hud.jsx` — turn indicator, a live countdown derived from
  `state.turnDeadline` (`TurnCountdown`, ticks every second client-side
  purely for display — the server enforces the actual cutoff regardless of
  what the client shows or does), dice/card display, roll/buy/decline
  /build/end-turn buttons (each gated on `isMyTurn` and `pendingAction`), a
  build panel that pairs each developable property with both a "Build"
  and (once it has houses) a "Sell" button, a separate mortgage panel
  listing mortgageable properties (with their payout) and already-mortgaged
  ones (with their payoff cost) — **not turn-gated**, since managing your
  own finances isn't a turn action — a "Leave" button (emits `leaveRoom`,
  clears the saved session, then resets local state), player list with
  balances/badges — a permanent
  "left/kicked" badge for anyone fully removed, and a separate transient
  "reconnecting..." badge for `connected: false && !left` (i.e. someone
  else's disconnect grace window currently ticking) — and the log feed.
  Every interactive control just emits a socket event; it never mutates
  local state directly.
- `components/Trade.jsx` — rendered in the `Hud` whenever the game is
  started and there's no winner yet. The give/get checkbox-and-coins
  picker is its own `TradeForm` sub-component (computes tradeable tiles
  client-side the same way the server does — owned, undeveloped — purely
  to avoid offering something that'll just get rejected; the server
  re-checks all of this regardless), reused in two places: the collapsible
  "Propose a trade" panel (target player + the form), and an inline
  "Counter" form on each incoming offer (`IncomingTradeCard`, target fixed
  to the original proposer). Incoming offers show Accept/Decline/Counter;
  clicking Counter swaps in the `TradeForm` in place of those three
  buttons rather than opening a separate dialog. Outgoing offers show
  Cancel. A `counterOf` field on a trade renders as a small "counter
  -offer" badge in `TradeSummary`, purely cosmetic. Like every other
  control, it only emits events (`proposeTrade`/`counterTrade`
  /`respondTrade`/`cancelTrade`) and renders whatever `state.trades`
  comes back.
- `components/Auction.jsx` — rendered above `Trade` in the `Hud`, same
  gating (started, no winner). Lists every entry in `state.auctions`,
  **not turn-gated** — any active player can bid or pass on any open
  auction regardless of whose turn it is, since that's the whole point of
  an auction. Each card shows the tile, current high bid/bidder (or "No
  bids yet"), and either a bid input + Bid/Pass buttons, or "You passed on
  this auction" if `myId` is already in that auction's `passedIds`.

## 4. Wire protocol (Socket.io events)

**Client → Server**
| Event | Payload | Notes |
|---|---|---|
| `createRoom` | `{ name }` | ack: `{ ok, code, playerId, token }` or `{ error }` |
| `joinRoom` | `{ code, name }` | ack: `{ ok, code, playerId, token }` or `{ error }`; rejects if started/full |
| `rejoinRoom` | `{ code, playerId, token }` | ack: `{ ok, code, playerId, token }` or `{ error }`; only succeeds within the 20s disconnect grace window |
| `startGame` | — | host-only, requires ≥2 players |
| `rollDice` | — | current-player-only; rejected if `pendingAction` set |
| `buyProperty` | — | resolves `pendingAction: awaitBuy` |
| `declineBuy` | — | resolves `pendingAction: awaitBuy`; opens an auction on that tile |
| `placeBid` | `{ auctionId, amount }` | not turn-gated; any active player not already passed |
| `passAuction` | `{ auctionId }` | not turn-gated; idempotent |
| `buyHouse` | `{ tileId }` | requires full color-group ownership, property unmortgaged |
| `sellHouse` | `{ tileId }` | no full-group requirement to sell down |
| `mortgageProperty` | `{ tileId }` | requires undeveloped, not already mortgaged; not turn-gated |
| `unmortgageProperty` | `{ tileId }` | requires enough coins for value + 10% interest; not turn-gated |
| `endTurn` | — | current-player-only; rejected if `pendingAction` set |
| `leaveRoom` | — | graceful manual exit; forfeits the seat exactly like a disconnect would |
| `proposeTrade` | `{ toId, offerProperties, offerMoney, requestProperties, requestMoney }` | not turn-gated; either side can be any active player |
| `respondTrade` | `{ tradeId, accept }` | only the trade's `toId` may respond |
| `counterTrade` | `{ tradeId, offerProperties, offerMoney, requestProperties, requestMoney }` | only the trade's `toId` may counter; replaces the original |
| `cancelTrade` | `{ tradeId }` | only the trade's `fromId` may cancel |

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
  trades: [...],         // see §2.3 "Trading"
  auctions: [...],       // see §2.3 "Auctions"
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
  makes the 20-second grace window possible without touching any
  game-state shape on reconnect.
- **A bounded grace window, not unbounded hold *or* zero tolerance.** Two
  earlier designs were tried and explicitly walked back: holding a
  disconnected seat open *indefinitely* (Pass 2 — too complex a payoff for
  an open-ended promise), and kicking on *any* disconnect with *no*
  tolerance at all (Pass 3 — too harsh, a 2-second wifi blip ended your
  game same as quitting on purpose). 20 seconds is a deliberately small,
  fixed compromise: enough to survive a refresh or a brief network hiccup,
  not enough to let someone stall a game by going AFK.
- **Manual leave bypasses the grace window on purpose.** `leaveRoom` kicks
  immediately — the grace window exists to protect against *involuntary*
  disconnects, not to give a deliberate exit a 20-second undo window.
- **A hard 4-minute clock per turn, enforced server-side.** No player,
  connected or not, can stall the game past 4 minutes on their own turn —
  the timer kicks them exactly like a disconnect would. This bounds how
  long a game can ever be stuck waiting on one person.
- **`bankrupt` and `left` are both terminal, both permanent.** Once either
  is set there is no path back into the active rotation for that player in
  that game — by design, mirroring "kicked is kicked" rather than treating
  it as a recoverable state.
- **Trading is not turn-gated.** Unlike rolling/buying/building, a trade
  can be proposed or accepted by anyone, anytime, regardless of whose turn
  it is. Only `respondTrade`/`cancelTrade`'s *authorization* (must be the
  trade's `toId`/`fromId`) is checked, never turn order.
- **A trade offer's validity is re-checked at acceptance time, not trusted
  from proposal time.** The gap between proposing and accepting a trade is
  unbounded (could be the whole game), so anything the offer depends on —
  ownership, development, available funds — could have changed; accepting
  re-derives all of it from current state rather than replaying a stale
  snapshot.
- **A counter-offer replaces the original rather than coexisting with
  it.** There is never more than one live offer for a given negotiation —
  countering removes the trade it's countering and inserts a new one in
  its place, going through the exact same validation a fresh proposal
  would (via the shared `buildTrade` helper). This keeps "what's the
  current state of this negotiation" unambiguous: exactly one trade
  object, with `counterOf` as a breadcrumb back to what it replaced, not a
  chain of competing live offers.
- **A counter can itself be countered, with no limit.** Nothing in
  `counterTrade` distinguishes a fresh proposal from a counter-offer when
  validating or deciding who's allowed to counter it next (whoever is the
  current `toId`) — negotiation can bounce back and forth indefinitely
  until someone accepts, declines, or cancels.
- **Only undeveloped, unmortgaged properties can be traded.** Avoids the
  open question of what happens to houses/hotels or an outstanding
  mortgage mid-swap (and matches the familiar rule that you sell houses
  and clear mortgages before trading a property).
- **Selling houses has no full-group requirement, building does.**
  Deliberately asymmetric: you can always sell down to raise cash even if
  you no longer hold the rest of the color group (e.g. after trading a
  sibling property away before this pass's mortgage/sell restrictions
  existed, or simply choosing to liquidate), but building still requires
  the full group, same as before this pass.
- **Mortgage/unmortgage and sell-house are not turn-gated** (build *is*,
  for consistency with the pre-existing `buyHouse` convention). Managing
  your own properties for cash is a financial decision, not a turn action
  — there's no reason to make a player wait for their turn to mortgage
  something to cover a rent payment that's due right now.
- **Declining a purchase always triggers an auction — there's no "just
  walk away" option.** Once a property is up for auction, the only ways
  it resolves are someone winning it or every active player passing (bank
  keeps it unowned). This mirrors the real reason auctions exist: letting
  a player decline for free would mean never paying full price for
  anything once the group realizes lowballing is risk-free.
- **An auction blocks only the player whose decline caused it**, via the
  same `pendingAction` mechanism every other turn-blocking action uses —
  bidding itself is open to everyone else regardless of turn order, same
  as trading.
- **Multiple auctions can be open simultaneously** (`auctions[]`, not a
  single slot) precisely because a turn-timeout kick mid-auction can hand
  control to a new current player who triggers a second one before the
  first resolves. Modeling this as an array sidesteps having to define
  queueing/rejection behavior for a case that's rare but real.
- **A bid that's about to win can still be voided.** If the current high
  bidder gets kicked or goes bankrupt before the auction closes, their bid
  doesn't count anymore — it's reset to $0/no-bidder rather than falling
  back to whatever the second-highest bid was (full bid history isn't
  tracked), and they're treated as having passed.
- **Mortgaging waives rent entirely rather than reducing it.** Simpler
  than a partial-rent rule, and matches the usual convention that a
  mortgaged property generates no income for its owner until it's paid off.

## 6. Known gaps (not yet built)
- Persistent rooms (everything is wiped on server restart)
- The grace window is a single fixed 20s for everyone, with no visibility
  into it for other players beyond a generic "reconnecting..." badge —
  there's no shared countdown showing exactly how much of the window is
  left, the way the turn timer has one.
- No UI affordance for *why* a player saw themselves dumped back to the
  lobby (ran out of time vs. grace window expired vs. someone else ended
  the game) beyond what's in the shared log — there's no personal "you
  were kicked because X" toast on the client that triggered it.
- No reconnect support pre-start (in the lobby): a disconnect before the
  game begins still removes the player outright, same as it always has —
  the grace window only applies once `started` is true. Probably fine
  (rejoining a lobby is just `joinRoom` again with the same code), but
  worth naming as an intentional asymmetry.
- No limit on how many times a counter-offer can bounce back and forth,
  and no UI distinction between "this is the 1st counter" vs. "this is the
  10th" beyond the most recent trade's `counterOf` pointing one step back
  — there's no full negotiation history visible, just whatever the
  current live offer is.
- No limit on how many trades a player can have open at once, and no
  per-player rate limiting on `proposeTrade` — fine for a casual game
  between friends, not something that's been hardened against spam.
- No minimum bid increment on auctions — any integer strictly above the
  current high bid is accepted, even $1 more. Real auctions often enforce
  a minimum raise; not implemented here.
- No time limit on an individual auction itself — it can sit open
  indefinitely as long as at least two active players haven't passed,
  independent of the 4-minute turn timer (which only ever applies to the
  original decliner, not to other players' bidding).
- Voiding a kicked/bankrupt high bidder's bid drops straight to $0/no
  -bidder instead of falling back to the next-highest actual bid, since
  bid history isn't tracked. In practice this just means the auction
  re-opens from scratch rather than resuming at the second-best offer.
