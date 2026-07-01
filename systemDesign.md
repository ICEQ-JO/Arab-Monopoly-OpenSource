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
- Re-exports the single board (`game/boards/classic-vintage.js`) under the
  names `Room.js` expects. The project has exactly one map now — earlier
  passes briefly supported multiple selectable maps via a `getBoard(mapType)`
  router; that was removed in favor of a single fixed board.
- Exports `BOARD`: an array of 48 tile objects (index = tile id = board
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

Also `game/characters.js`, same static-data pattern: `CHARACTER_IDS` (the
six playable codenames — `D`, `Z`, `Y`, `H`, `SD`, `SE`) and
`CHARACTER_NAMES` (codename → real display name, e.g. `D: "دروبي"`). This
is **identity data only** — there is no ability logic anywhere server-side
yet; the full ability spec lives in `characters.md` as a design doc not
yet implemented (see §6).

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
- `pendingAction` — `null` or one of `{ type: 'awaitBuy', tileId, playerId }`,
  `{ type: 'awaitCardMove', playerId, effect, rolledDoubles, wasInHolding }`,
  or `{ type: 'auction', tileId, auctionId, playerId }`. This is the
  turn-blocking mechanism: while set, no other action (roll, end turn) is
  accepted from that player until it resolves.
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
- `characterSelections{}` — `playerId -> characterId`, populated only
  before `started` becomes true. Not cleared automatically once the game
  starts; `start()` reads it once to assign each player's final
  `characterId`/`name`, after which it's just inert history for that room.
- `rollSeq` — an integer, starts at 0, incremented once per actual
  `rollDice()` call (not per broadcast). Exists purely so the client can
  detect "a new roll genuinely just happened" independent of the dice
  values themselves — `lastRoll`'s *value* alone isn't a reliable signal
  for this, since rolling the same double twice in a row produces two
  broadcasts with identical numbers, and every broadcast re-serializes a
  brand-new array over the wire regardless of whether anything changed.
  Used client-side to trigger the dice-roll animation exactly once per
  real roll (see `Dice.jsx` below), never to gate any server-side logic.

**Core flow:**
```
rollDice(playerId)
  -> rejects if !canRollAgain (already used this turn's roll -- see below)
  -> logs "<name> rolled a/an <total>." regardless of what happens next
  -> handles Holding Pen logic (doubles to escape / 3-turn cap / pay to leave)
       -> if still stuck (no escape, not yet at the 3-turn cap): finishTurn(player), return early
  -> tracks consecutiveDoubles; 3 in a row -> sendToHolding(player), skip the move entirely
  -> movePlayer(player, steps)
       -> wraps position around the 32 tiles, pays 200 on passing Start
       -> resolveTile(player)
            -> branches on tile type:
                 property/transit/utility -> open awaitBuy, or charge rent if owned by someone else
                 tax                      -> deduct fixed amount
                 surprise/treasure        -> drawCard -> applyCardEffect
                 go_to_holding            -> sendToHolding
  -> if a card just opened pendingAction: 'awaitCardMove', stash rolledDoubles/wasInHolding
     on it and return early -- the bonus-roll decision waits for confirmCardMove (see below)
  -> sets canRollAgain = rolledDoubles && !wasInHolding && !player.inHolding
     (a bonus roll, but not for doubles that just escaped the Holding Pen,
     not on the 3rd-in-a-row case above which already returned early, and
     not if *this same move* just sent them to the Holding Pen via the
     "go to Holding" tile or a card effect)
```

Note `resolveTile` itself no longer checks bankruptcy — see "Bankruptcy is
deferred to turn-end" below; a negative balance from rent/tax/a card is
tolerated until whoever's turn it is finishes their turn.

**Roll gating (`canRollAgain`) and the three-doubles rule:** the original
implementation let a player call `rollDice` repeatedly within their own
turn with no restriction beyond `pendingAction` being clear — there was no
check on whether their *previous* roll had actually earned them another
one. Fixed by tracking two pieces of room-level state, both reset to
`true`/`0` at the start of every turn (`start()` and `endTurn()`):
- `canRollAgain` — `rollDice` now rejects outright (`"You already rolled
  this turn"`) if this is `false`. It's only ever set back to `true` by
  rolling doubles in free play (`rolledDoubles && !wasInHolding &&
  !player.inHolding`) — rolling doubles *to escape* the Holding Pen does
  **not** earn a bonus roll (different mechanic, same word "doubles"), and
  neither does rolling doubles that happen to land the player *on* the
  Holding Pen via the `go_to_holding` tile or a card effect within that
  same move — this last condition specifically re-checks `player.inHolding`
  **after** `movePlayer` runs, rather than trusting the pre-move
  `wasInHolding` snapshot, since `movePlayer` → `resolveTile` →
  `sendToHolding` can flip it during the call. An earlier version of this
  fix checked only the pre-move snapshot and missed this case — same root
  cause as the bug being fixed (a decision based on stale state instead of
  current state), just one line further down the same method. Caught
  during a deliberate follow-up sweep for the same pattern, not by the
  original test suite.
- `consecutiveDoubles` — increments on each free-play double, resets to 0
  on any non-double. Hitting 3 sends the player straight to the Holding
  Pen via `sendToHolding` *before* `movePlayer` ever runs for that roll —
  they don't move by that third roll's distance or resolve whatever tile
  it would have landed on, matching the real rule that three-in-a-row
  ends your move immediately, not just your turn.
- **Movement cards pause for confirmation instead of resolving instantly.**
  `applyCardEffect`'s `advanceTo`/`move` cases (e.g. "Advance to Start
  Plaza", "Move back 3 spaces") no longer move the player in the same beat
  the card is drawn — they set `pendingAction = { type: 'awaitCardMove',
  playerId, effect }` and stop there. `confirmCardMove(playerId)` is the
  only way to resolve it: the player can't decline (it's not a real
  choice), but they get an explicit beat to read the card's text before the
  board updates, instead of the move completing invisibly inside the same
  `rollDice` call. Once confirmed, it actually runs `movePlayer`/
  `resolveTile` for that effect and — if nothing else (a fresh `awaitBuy`,
  or another `awaitCardMove` from a chained card draw) is now blocking the
  turn — finishes the bonus-roll calculation that `rollDice` deferred onto
  the pending action (`rolledDoubles`/`wasInHolding`, stashed there right
  after the original `movePlayer` call returned). `goToHolding` is *not*
  deferred this way — only effects that move the player to a tile other
  than the Holding Pen wait on confirmation.
- `calcRent` handles the three rent shapes: flat property rent (with
  monopoly doubling when unimproved and the owner holds the whole color
  group), transit rent (scales with how many transit tiles the owner holds),
  utility rent (multiplier × last dice roll, scales with utilities owned).
- `buyProperty` resolves a pending `awaitBuy` by purchase. `declineBuy`
  resolves it by instead calling `startAuction(tileId)` — see "Auctions"
  below.
- `payToLeaveHolding`/`useHoldingFreeCard` — voluntary alternatives to
  rolling for doubles while stuck in the Holding Pen: pay the
  `HOLDING_RELEASE_RENT` fine immediately, or consume a banked
  `holdingFreeCard`, either of which sets `inHolding = false` so the
  player's *next* `rollDice` this same turn behaves as ordinary free-play
  movement rather than another holding-escape attempt. Both require it
  being the player's own turn and that they're actually `inHolding`. The
  client only *offers* these two buttons (and the "roll for doubles or
  pay/use a card" choice generally) starting on the player's **next** turn,
  not the turn they were sent to the Holding Pen on — gated client-side on
  `!state.lastRoll` (i.e. they haven't rolled yet this turn), since
  `lastRoll` is non-null the instant they're freshly confined mid-roll but
  resets to `null` at the start of their following turn.
- `playerEndTurn(playerId)` is the player-facing "End turn" action,
  distinct from the internal `endTurn()` below (also called by
  `kickPlayer`, which shouldn't require a prior roll). It enforces that
  rolling is mandatory each turn: rejects with `"Roll the dice before
  ending your turn"` if `this.lastRoll` is still `null` for the current
  turn. This also resolves a structural inconsistency flagged in an
  earlier pass — every other player action's primary guard lived inside
  `Room.js`, but `endTurn`'s guards used to live in `index.js` instead;
  they now live here, alongside the new roll requirement. Once past that
  guard, it hands off to `finishTurn(player)` rather than calling
  `endTurn()` directly — see "Bankruptcy is deferred to turn-end" below.
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
- **Bankruptcy is deferred to turn-end, not triggered the instant a balance
  goes negative.** `checkBankruptcy(player)` still does the actual
  forfeiture *when called* — releases all of that player's properties back
  to the bank, marks them bankrupt, clears their trades/auction bids, and
  calls `checkWinner()` — but it's no longer called automatically after
  every rent/tax/card payment, auction win, or trade. Those all freely
  allow a negative `balance` to sit there, since mortgaging, selling
  houses, and trading are all *not* turn-gated (see their own bullets
  above/below) — a player in the red has a real window to fix it before
  anyone actually enforces the rule. `finishTurn(player)` is the one place
  that enforcement happens: `if (player.balance < 0) this.checkBankruptcy
  (player); if (!this.winnerId) this.endTurn();` — called from both
  `playerEndTurn` (the normal "End turn" button) and the stuck-in-Holding
  -Pen auto-end path inside `rollDice` (the other way a turn can end
  without an explicit `endTurn` click). This means a player whose balance
  went negative because of *someone else's* turn (e.g. a `payEachPlayer`/
  `collectFromEachPlayer` card effect landing on them) isn't bankrupted
  until *their own* next turn ends — they get that entire gap, even though
  it wasn't their turn that caused the debt. Deliberate, not an oversight:
  see the invariant below.
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

**Character selection (pre-game only):** a player has no name of their own
choosing in this game — identity comes entirely from the character they
pick. `addPlayer` assigns a throwaway placeholder name (`"Seat N"`,
ordinal = join order) purely so the lobby has *something* to display
before anyone's picked; it's never shown once `start()` runs.
- `selectCharacter(playerId, characterId)` — rejected if the game has
  already started, if `characterId` isn't one of `CHARACTER_IDS`, or if a
  *different* player already holds it (re-selecting your own current pick
  is a harmless no-op overwrite of the same map entry, not an error).
- `resetCharacterSelections(playerId)` — host-only, pre-start-only; empties
  the whole map so everyone has to pick again. Used by the host to force a
  re-pick if, e.g., someone wants to swap characters around before
  starting.
- `start()` now does one extra pass before flipping `started`: for every
  player with an entry in `characterSelections`, sets `player.characterId`
  and overwrites `player.name` with `CHARACTER_NAMES[characterId]` — this
  is the actual mechanism by which "the character you picked becomes who
  you are" takes effect. A player with no selection (shouldn't be
  reachable in practice — see the `startGame` precondition in §2.4) simply
  keeps their placeholder name.

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
`index.js`'s `proposeTrade`/`counterTrade` socket handlers acknowledge the
client's callback with the `Room` method's result (`{ ok, tradeId }` or
`{ error }`) — an earlier version of both handlers silently dropped the
ack entirely, so a failed proposal (e.g. offering a property that had
already changed hands since the form was last filled out) produced no
visible error and the form's fields never cleared, making trading look
like it had stopped working after the first attempt with any given player.
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
  money proposer→target, request money target→proposer). No bankruptcy
  check runs afterward — the funds check just below already guarantees
  neither side goes negative *because of* this trade. The funds check
  itself only requires affordability for a **non-zero** amount
  (`offerMoney > 0 && fromPlayer.balance < offerMoney`, same shape for
  `requestMoney`/`toPlayer`) — an earlier version compared the player's
  raw balance against the amount unconditionally, which meant a player
  already in debt (balance negative, allowed since the bankruptcy
  redesign) got rejected from *any* trade, even one offering $0 and only
  requesting money, since `-50 < 0` is true regardless of what's actually
  being given away. Trading is one of the few legitimate ways an indebted
  player can recover before their own turn ends, so this needed fixing
  once negative balances became a normal, expected state rather than an
  impossible one.
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
  highestBid, highestBidderId, passedIds, deadline, timer }`) and sets
  `pendingAction = { type: "auction", tileId, auctionId, playerId:
  currentPlayer.id }`. Because `rollDice`/`endTurn` already refuse to act
  while *any* `pendingAction` is set, this one line is enough to block the
  declining player from rolling again or ending their turn until the
  auction they caused is resolved — no new gating logic needed, just
  reusing the existing mechanism with a new `pendingAction.type`.
- **Auctions auto-resolve on a deadline rather than relying solely on
  unanimous explicit passes.** Originally an auction only ever ended when
  every active player but one had clicked Pass — fine in principle, but a
  player who's lost interest mid-auction has no obligation to actually
  click anything, so the auction could sit open indefinitely with no way
  to force a close. Fixed with a soft-close timer, the same pattern eBay
  -style auctions use: `AUCTION_BASE_MS` (10s) from when the auction
  opens, and each `placeBid` extends the deadline to at least
  `AUCTION_EXTEND_MS` (3s) from that bid (`Math.max(currentDeadline, now +
  3000)` — never shortens an already-later deadline). `scheduleAuctionTimer`
  clears any existing timer for that auction and arms a fresh `setTimeout`
  for whatever the current deadline computes to; when it actually fires,
  it calls `resolveAuction` with whatever the current state is (highest
  bidder wins, or the property stays unowned if nobody ever bid) and
  `this.notify?.()` to push the resulting state to clients with no client
  request having triggered it (same pattern as the turn timer and grace
  -window timer). The early-resolve-on-unanimous-pass path
  (`maybeResolveAuction`) still exists alongside this and can close an
  auction *before* the timer fires — the timer is a backstop for the case
  where players go quiet without explicitly passing, not a replacement
  for the existing logic.
- `resolveAuction` clears the auction's timer handle before removing it
  from `auctions[]`, and `clearAllAuctionTimers()` (called from
  `cleanupIfDone` in `index.js`) sweeps any remaining timers when a room
  is deleted, mirroring `clearTurnTimer`'s role for the turn timer.
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
`Room` method, then `broadcastState(roomCode)` re-serializes, emits
`state` to every socket in that room, **and persists every room to disk**
(see §2.5) — so unlike earlier passes, a server restart no longer drops
active games. Rooms live in an in-memory `Map<code, Room>` (module-level
state) that's rebuilt from disk on startup before the server starts
accepting connections.

**Identity model (decoupled from `socket.id`):** a player's stable identity
is a server-generated `playerId` (nanoid), not their socket id. Two
module-level maps translate between them per connection:
- `socketToRoom: Map<socket.id, roomCode>`
- `socketToPlayer: Map<socket.id, playerId>`

`createRoom`/`joinRoom` mint a fresh `{ playerId, token }` pair and return
both in the ack — `token` is a write-once secret the client holds onto
(localStorage) purely to reclaim a seat within the 20-second disconnect
grace window (§2.3); it has no other purpose and is never broadcast to
other clients. Neither event takes a `name` anymore — a player's eventual
display name comes from the character they pick (§2.3 "Character
selection"), not from anything typed at join time.

**Character selection requires every seat filled before `startGame`
works.** On top of its existing host-only/2-player-minimum checks,
`startGame` now also requires `room.characterSelections` to have an entry
for every current player — if not, the request is just silently ignored
(no error ack needed; the client already disables its own Start button
under the same condition, so a legitimate client never sends this request
in the first place). Every other handler resolves the caller's `playerId` via
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
`bankrupt || left` (in-progress case) and, if so, clears the turn timer,
deletes the room from the `rooms` map, and persists immediately (so the
deleted room doesn't reappear on the next restart) — otherwise it
broadcasts the new state as usual.

### 2.5 `persistence.js` — surviving a server restart
A small, deliberately dumb module: `loadSnapshots()` reads
`server/data/rooms.json` (returns `{}` if missing or unparsable — a bad
file just means a cold start, never a crash) and `saveSnapshots(obj)`
writes it back, via a temp-file-then-rename so a crash mid-write can't
leave a half-written, unparsable file behind. No database, no schema
migrations, no partial updates — the whole `rooms` map is serialized and
overwritten as one JSON blob every time anything changes.

**When it's called:**
- **On startup**, before the server starts accepting connections:
  `index.js` calls `loadSnapshots()`, and for each entry calls
  `Room.fromSnapshot()` (§2.3) to rebuild a live `Room`, wires its
  `notify` callback, and adds it to the `rooms` map. Each restoration is
  wrapped in its own `try/catch` — one corrupted or schema-mismatched room
  entry logs an error and is skipped rather than taking down the whole
  server's startup.
- **After every `broadcastState()` call** — i.e. after literally any
  state-changing socket event — `persistRooms()` re-serializes every room
  via `toSnapshot()` and overwrites the file. There's no debouncing or
  batching: at this game's pace (human-paced turns, not a tight tick
  loop), writing a small JSON file on every action is cheap enough not to
  matter, and it means there's never a window where the in-memory state
  and the on-disk state disagree.
- **On room deletion** (`cleanupIfDone`, §2.4) — same `persistRooms()`
  call, so a room that's actually over gets removed from the file
  immediately rather than lingering until the next unrelated write.
- **On `SIGINT`/`SIGTERM`** — an explicit final `persistRooms()` before
  `process.exit(0)`. Given the point above, this is mostly belt-and
  -suspenders (there's essentially never an unsaved-changes window to
  begin with) rather than a load-bearing part of the design.

**What does *not* survive a restart as-is** (see `Room.fromSnapshot` in
§2.3 for the actual mechanics): a player who was mid-disconnect-grace
when the snapshot was taken gets kicked on restore rather than resuming
their countdown (there's no way to know how much of the 20 seconds was
left, and no socket is bound to them yet anyway), and the current
player's turn timer restarts at a fresh full 4 minutes rather than
preserving the exact remaining time. Both are deliberate simplifications,
not bugs — see §5.

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
  stable `playerId` returned by the server, never `socket.id`. Three
  render phases now instead of two: `!joined` → `Lobby`; `joined &&
  !state.started` → `CharacterSelect` (new — see below); `joined &&
  state.started` → the board/HUD game screen.
- `components/Lobby.jsx` — create-room / join-room form. **No name field**
  — a player's eventual display name comes entirely from the character
  they pick on the next screen, not from anything typed here. On a
  successful ack, hands the full `{ code, playerId, token }` up to `App`,
  which saves it via `saveSession` before moving to character selection.
- `data/characters.js` — client-side display data for the six characters:
  `id`, real `name`, a one-line `description`, `passive`/`active` ability
  flavor text (placeholder wording — the real ability spec lives only in
  `characters.md` until a future implementation pass), and `v1`/`v2`
  portrait image paths (served from `public/characters/<id>/`). This is
  purely presentational data, independent of and not synced with the
  server's `characters.js` (which only knows ids and real names, no
  images or descriptions).
- `components/CharacterCard.jsx` — a click-to-flip card for one character.
  Front: balance-gated portrait (`player.balance >= 3000 ? v2 : v1`),
  name, description. Back: passive/active text plus a context-sensitive
  control — `Play as <name>` if unclaimed, `Change character` if it's the
  viewer's own current pick, or a plain `Taken by <name>` label (no
  button) if someone else already has it. Used in both `CharacterSelect`
  (pre-game) and `PlayerCard` (in-game, see below).
- `components/CharacterSelect.jsx` — the pre-game lobby screen. Shows the
  room code, a chip per player (color swatch, their picked character's
  name or "picking…", a Host badge), the full 6-card grid via
  `CharacterCard`, and host-only Reset-selections/Start-game controls —
  Start is disabled (client-side) until every current player has a pick,
  mirroring the server's own `startGame` precondition (§2.4). Emits
  `selectCharacter`/`resetCharacterSelections`/`startGame`; renders
  nothing it doesn't already have from `state.characterSelections` and
  `state.players`.
- `components/PlayerCard.jsx` — the viewer's *own* character card, shown
  in-game (not during selection) in a dedicated column to the left of the
  board. Same flip/portrait-swap behavior as `CharacterCard`'s front face,
  but simplified to display-only (no select/change controls — the pick is
  already locked in once the game has started). The front face's lower
  portion is an intentionally empty `.player-card-tracker` div — reserved
  for a future per-character ability-cooldown/use-count display once
  abilities are implemented (§6), not built out yet.
- `components/BoardClassic.jsx` — the sole board component (a prior
  `Board.jsx`, tied to now-deleted maps, was removed). `getGridPos(i)` maps
  each of the 48 tile indices onto a 9×9 CSS grid perimeter (tiles
  0/12/24/36 are the four corners). Purely presentational: reads `board`,
  `ownership`, `players`,
  `pendingAction`, `lastRoll`, `rollSeq` props and renders tiles, ownership
  color strip, house count (or an "M" badge in place of the house count
  when `owned.mortgaged` is true), player tokens, and the board-center
  title/dice display (see `Dice.jsx` below).
- `components/Dice.jsx` — replaces what used to be a static "🎲 3+4=7" text
  line with two animated CSS 3D cubes. Each die is six absolutely
  -positioned faces (`translateZ` + a per-face `rotate`) forming a real
  cube, each showing the classic 6-value pip layout. `FACE_ORIENTATION`
  maps each value 1-6 to the `{x, y}` cube rotation that brings that face
  to point at the viewer — derived as the inverse of each face's own
  placement transform, since CSS composes parent-rotation-then-child
  -placement. On every `rollSeq` change (not `lastRoll` directly — see
  §2.3 for why), computes a forward-only delta from the cube's current
  resting angle to the new target, adds 1-2 random extra full spins for
  flourish, and lets a plain CSS `transition` interpolate through it —
  this works because the CSS transform spec interpolates matching
  rotate-function lists component-wise rather than via shortest-angular
  -path, so a multi-hundred-degree target genuinely animates through
  several visible spins instead of snapping straight there. A small idle
  tilt (`IDLE_TILT`, a fixed `{x, y}` offset added to every target) keeps
  the cube resting at an angle instead of dead-on, so more than one face
  is visible at rest; a `.die3d-filler` — a static, identically-styled
  square sitting directly behind the spinning cube — plugs the visual gap
  that would otherwise let the board show through mid-spin, without
  needing a separate backdrop panel. The dark backdrop that *was* tried
  as a separate `.dice-stage` panel was relocated, not kept: it now lives
  on `.board-center` itself (the inner area holding the title and the
  dice), not as its own floating element — see `progress.md` Pass 16 for
  the iteration history.
- `components/Hud.jsx` — turn indicator, a live countdown derived from
  `state.turnDeadline` (`TurnCountdown`, ticks every second client-side
  purely for display — the server enforces the actual cutoff regardless of
  what the client shows or does), dice/card display, roll/buy/decline
  /build/end-turn buttons (each gated on `isMyTurn` and `pendingAction`), a
  "Continue" button for `pendingAction: awaitCardMove` showing the card's
  text (the only way to resolve it — no decline option), a build panel that
  pairs each developable property with both a "Build" and (once it has
  houses) a "Sell" button, a separate mortgage panel listing mortgageable
  properties (with their payout) and already-mortgaged ones (with their
  payoff cost) — **not turn-gated**, since managing your own finances isn't
  a turn action — a "Leave" button (emits `leaveRoom`, clears the saved
  session, then resets local state), player list with balances/badges — a
  permanent "left/kicked" badge for anyone fully removed, a separate
  transient "reconnecting..." badge for `connected: false && !left` (i.e.
  someone else's disconnect grace window currently ticking), and an "in
  debt" badge for anyone with `balance < 0` who isn't already bankrupt or
  left (purely informational; the actual enforcement is server-side and
  deferred to that player's own turn-end, see §2.3 "Bankruptcy is deferred
  to turn-end"). The Pay/Use-card Holding Pen options and the in-debt hint
  above the End Turn button are both gated on `!state.lastRoll` /
  `me.balance < 0` respectively — and the log feed.
  Every interactive control just emits a socket event; it never mutates
  local state directly.
- `components/Trade.jsx` — rendered in the `Hud` whenever the game is
  started and there's no winner yet. The give/get checkbox-and-coins
  picker is its own `TradeForm` sub-component (`tradeableTiles()` computes
  tradeable tiles client-side — owned, undeveloped, **and unmortgaged** —
  mirroring the server's `isTradeable()` purely to avoid offering
  something that'll just get rejected; the server re-checks all of this
  regardless, so this list is a UX nicety, never the actual authority. An
  earlier version of this filter omitted the mortgaged check, letting the
  form show a mortgaged property as selectable when the server would
  always reject trading it — fixed to match the server's predicate
  exactly), reused in two places: the collapsible
  "Propose a trade" panel (target player + the form), and an inline
  "Counter" form on each incoming offer (`IncomingTradeCard`, target fixed
  to the original proposer). Incoming offers show Accept/Decline/Counter;
  clicking Counter swaps in the `TradeForm` in place of those three
  buttons rather than opening a separate dialog. Outgoing offers show
  Cancel. A `counterOf` field on a trade renders as a small "counter
  -offer" badge in `TradeSummary`, purely cosmetic. Like every other
  control, it only emits events (`proposeTrade`/`counterTrade`
  /`respondTrade`/`cancelTrade`) and renders whatever `state.trades`
  comes back. The two coin amounts ("you give" / "you get") are sliders,
  not typed numbers — each is capped at `0` to the relevant player's
  actual current balance (`players` is now threaded into every `TradeForm`
  call site specifically so it can look these up), clamped to `0` rather
  than going negative if that player is currently in debt. This both makes
  picking an amount faster and structurally prevents ever submitting an
  offer the server would reject as unaffordable, since the slider simply
  can't be dragged past what the relevant player has.
- `components/Auction.jsx` — rendered above `Trade` in the `Hud`, same
  gating (started, no winner). Lists every entry in `state.auctions`,
  **not turn-gated** — any active player can bid or pass on any open
  auction regardless of whose turn it is, since that's the whole point of
  an auction. Each card shows the tile, current high bid/bidder (or "No
  bids yet"), an `AuctionCountdown` (same ticks-every-second-purely-for
  -display pattern as `TurnCountdown`) derived from `auction.deadline`,
  turning urgent-red in the last 3 seconds — purely informational, the
  server's own timer is what actually closes it — and either three
  increment buttons (`+$1`/`+$10`/`+$100`, each immediately submitting a
  bid of *the current highest bid plus that amount* with no separate
  confirm step — replaced a typed-amount-plus-"Bid"-button pair so a live
  bidding war can move at one-click-per-raise speed) and a Pass button, or
  "You passed on this auction" if `myId` is already in that auction's
  `passedIds`.

## 4. Wire protocol (Socket.io events)

**Client → Server**
| Event | Payload | Notes |
|---|---|---|
| `createRoom` | — | no `name` — identity comes from the chosen character (see `selectCharacter`); ack: `{ ok, code, playerId, token }` or `{ error }` |
| `joinRoom` | `{ code }` | ack: `{ ok, code, playerId, token }` or `{ error }`; rejects if started/full |
| `rejoinRoom` | `{ code, playerId, token }` | ack: `{ ok, code, playerId, token }` or `{ error }`; only succeeds within the 20s disconnect grace window |
| `selectCharacter` | `{ characterId }` | pre-start-only; rejects if already taken by someone else; ack: `{ ok }` or `{ error }` |
| `resetCharacterSelections` | — | host-only, pre-start-only; clears every player's pick |
| `startGame` | — | host-only, requires ≥2 players **and** every player having a `characterSelections` entry |
| `rollDice` | — | current-player-only; rejected if `pendingAction` set |
| `buyProperty` | — | resolves `pendingAction: awaitBuy` |
| `declineBuy` | — | resolves `pendingAction: awaitBuy`; opens an auction on that tile |
| `placeBid` | `{ auctionId, amount }` | not turn-gated; any active player not already passed |
| `passAuction` | `{ auctionId }` | not turn-gated; idempotent |
| `buyHouse` | `{ tileId }` | requires full color-group ownership, property unmortgaged |
| `sellHouse` | `{ tileId }` | no full-group requirement to sell down |
| `mortgageProperty` | `{ tileId }` | requires undeveloped, not already mortgaged; not turn-gated |
| `unmortgageProperty` | `{ tileId }` | requires enough coins for value + 10% interest; not turn-gated |
| `payToLeaveHolding` | — | current-player-only; requires `player.inHolding`; costs `HOLDING_RELEASE_RENT` |
| `useHoldingFreeCard` | — | current-player-only; requires `player.inHolding && holdingFreeCard` |
| `confirmCardMove` | — | resolves `pendingAction: awaitCardMove`; current-player-only, no decline option |
| `endTurn` | — | current-player-only; rejected if `pendingAction` set **or no roll yet this turn**; finalizes bankruptcy via `finishTurn` if balance is still negative |
| `leaveRoom` | — | graceful manual exit; forfeits the seat exactly like a disconnect would |
| `proposeTrade` | `{ toId, offerProperties, offerMoney, requestProperties, requestMoney }` | not turn-gated; either side can be any active player; ack: `{ ok, tradeId }` or `{ error }` |
| `respondTrade` | `{ tradeId, accept }` | only the trade's `toId` may respond |
| `counterTrade` | `{ tradeId, offerProperties, offerMoney, requestProperties, requestMoney }` | only the trade's `toId` may counter; replaces the original; ack: `{ ok, tradeId }` or `{ error }` |
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
  rollSeq: number,        // increments once per real rollDice() call -- drives the dice animation, not a gameplay signal
  canRollAgain: boolean,  // client only shows "Roll dice" when true
  lastCard: { deck, text } | null,
  pendingAction: {...} | null,
  turnDeadline: <epoch ms> | null,  // for the client's countdown display only
  trades: [...],         // see §2.3 "Trading"
  auctions: [...],       // see §2.3 "Auctions"
  characterSelections: {...},  // playerId -> characterId, see §2.3 "Character selection"
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
- **Bankruptcy is deferred to turn-end, but still final once it happens.**
  A negative balance is tolerated mid-turn (rent, tax, card penalties, and
  auction wins never check it) specifically so a player can mortgage, sell
  houses, or trade their way back to solvent before it's enforced — none of
  those actions are turn-gated, so this is possible even on someone else's
  turn. The actual check happens once, in `finishTurn`, at the moment
  whichever player currently holds the negative balance has *their own*
  turn end (via `playerEndTurn` or the stuck-in-Holding-Pen auto-end). If
  they're still negative at that instant, bankruptcy is immediate and final
  from there — there's no second chance once that specific check fires.
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
- **A turn's roll is one-shot unless doubles earn another.** `canRollAgain`
  is the single source of truth `rollDice` checks before doing anything
  else — there's no separate "have I rolled yet this turn" flag to keep in
  sync, just this one boolean that's reset every turn and flipped by the
  outcome of each roll.
- **Doubles to escape the Holding Pen don't count toward the three
  -in-a-row rule, and don't earn a bonus roll.** It's the same word
  ("doubles") describing two different mechanics — escaping confinement
  vs. free-play momentum — and conflating them would mean a player stuck
  in the Holding Pen could chain bonus rolls just by getting lucky on the
  escape roll, which isn't how the rule is meant to work.
- **Three doubles in a row skips the move, not just the rest of the
  turn.** `sendToHolding` is called instead of `movePlayer` for that third
  roll — the player never resolves whatever tile that roll's distance
  would have landed them on (no rent, no card draw, no passing-Start
  bonus). This matches the convention that speeding catches you
  immediately, not after one more move.
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
- **An auction closes on a deadline even if nobody explicitly passes.**
  The unanimous-pass path can still close it early; the 10s-base/3s
  -extension timer is the backstop that guarantees it closes *eventually*
  regardless of whether players bother clicking Pass once they're done
  bidding.
- **Mortgaging waives rent entirely rather than reducing it.** Simpler
  than a partial-rent rule, and matches the usual convention that a
  mortgaged property generates no income for its owner until it's paid off.
- **Rolling the dice is mandatory, not optional, before ending a turn.**
  `playerEndTurn` checks `this.lastRoll` rather than, say, a separate
  "hasRolled" flag — `lastRoll` is already reset to `null` at the start of
  every turn and only ever set by a successful roll, so it's already
  exactly the signal needed with no new state to introduce or keep in sync.
- **Paying to leave the Holding Pen and using a Get Out of Jail Free card
  are alternatives to rolling, not additional actions on top of it.**
  Neither one moves the player or consumes their roll for the turn — they
  just clear `inHolding`, so the player's *next* `rollDice` call behaves
  as ordinary free-play movement instead of attempting another
  holding-escape roll. A player can still choose to just roll for doubles
  instead of paying/using a card, exactly as before this fix.
- **Persistence is "always-save, no debounce," not "save periodically."**
  Every state-changing event re-serializes and overwrites the entire
  `rooms.json` file. At this game's pace that's cheap and means in-memory
  state and on-disk state are never out of sync — there's no batching
  window where a crash could lose an action that already happened.
- **A snapshot restore treats the restart itself as the disconnect grace
  window expiring**, for anyone who was mid-grace when the snapshot was
  taken — there's no way to know how much of their 20 seconds was actually
  left, so the simplest correct choice is to just kick them rather than
  guess. The current player's turn timer similarly restarts at a fresh
  full 4 minutes rather than trying to preserve exact remaining time —
  tracking "how much time was left" durably would mean persisting
  wall-clock deadlines and reasoning about clock drift across a restart,
  for a edge case (server restarting mid-turn) that doesn't need that
  precision.
- **Tokens are persisted in plaintext on disk**, same as they already live
  in plaintext in memory — no new exposure introduced, just an explicit
  acknowledgment that "secret" here means "not broadcast to other
  players," not "encrypted at rest." Fine for a casual game between
  friends; would need revisiting for anything more sensitive.
- **A player's display name is entirely derived from their chosen
  character, never typed.** `createRoom`/`joinRoom` no longer accept a
  `name` at all; the placeholder name `addPlayer` assigns (`"Seat N"`) is
  only ever visible pre-game and is overwritten by `start()` from
  `CHARACTER_NAMES` once everyone's picked. There is no path for a player
  to end up with any other display name.
- **Character selection is enforced once, at `startGame` time, not
  continuously.** `selectCharacter`'s own uniqueness check (can't take a
  character someone else already holds) is the only ongoing guard;
  nothing re-validates `characterSelections` between picks and the start
  of the game beyond that, since the only way entries get added or
  removed pre-start is through `selectCharacter`/`resetCharacterSelections`
  themselves, both of which already enforce it on the way in.

## 6. Known gaps (not yet built)
- **Character abilities are entirely unimplemented.** `characters.md`
  has the full locked design (D's toll zone, Z's trade/tax skim, Y's
  seize/demolish, H's territory expansion, SD's station toll plus attack
  power, SE's bank bonus plus alliance) but none of it is wired into
  `Room.js` yet — picking a character currently only changes a player's
  name/portrait, with zero gameplay effect. This was an explicit scope
  boundary for the pass that built selection, not an oversight.
- The flavor-text `passive`/`active` descriptions in `client/src/data/
  characters.js` are placeholder wording the user asked to fill in "for
  now" — not the real ability spec, which stays in `characters.md` until
  an implementation pass exists to consume it.
- `PlayerCard.jsx`'s `.player-card-tracker` div is intentionally empty —
  reserved for a future per-character ability-cooldown/use-count display,
  not built out yet since there are no abilities to track.
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
- Voiding a kicked/bankrupt high bidder's bid drops straight to $0/no
  -bidder instead of falling back to the next-highest actual bid, since
  bid history isn't tracked. In practice this just means the auction
  re-opens from scratch rather than resuming at the second-best offer.
- A mid-disconnect-grace player loses their seat on a server restart even
  if they would have reconnected well within their 20-second window —
  there's no way to distinguish "the server happened to restart during my
  grace period" from "I'm genuinely gone," so it's treated the same as the
  window expiring. Rare in practice (restarts aren't frequent, and the
  grace window is short), but a real edge case.
- The current player's turn timer resets to a fresh 4 minutes on restart
  rather than preserving exact remaining time — someone who'd used 3:50 of
  their 4 minutes right before a restart gets a brand new 4:00 afterward.
  A minor, one-time grace per restart, not something abusable repeatedly.
- `rooms.json` is a single flat file holding every room — fine at the
  scale of a few concurrent casual games, but it means every single state
  change rewrites *all* rooms' data, not just the one that changed. Would
  need splitting into per-room files (or a real database) before this
  scales past a small number of simultaneous games.
- No data migration story: if a future pass changes a `Room` field's
  shape, an old `rooms.json` from before that change would either fail to
  restore (caught by the per-room `try/catch` in `index.js`, so it fails
  safely rather than crashing) or restore with a now-stale shape. No
  versioning scheme exists yet for the snapshot format.
- An auction's deadline resets to a fresh full base window on a server
  restart, same simplification as the turn timer — exact remaining time
  (including any extension already in effect) isn't preserved across a
  restart.
- No minimum bid increment on auctions remains unaddressed by the new
  timer — the timer fixes "auctions can hang forever," not "a $1 raise is
  a valid bid," which is still true.
- Paying to leave the Holding Pen or using a Get Out of Jail Free card are
  only exposed as their own buttons when `inHolding` is true; there's no
  unified "what are my options right now" affordance distinguishing
  "must act" states (it's your turn, you're confined) from optional ones.
  Minor UX gap, not a rules gap.
- A player whose balance goes negative on *someone else's* turn (e.g. a
  `payEachPlayer`/`collectFromEachPlayer` card effect) isn't bankrupted
  until their own next turn ends — but if they're kicked for disconnect,
  AFK timeout, or a manual leave before that turn ever comes around,
  `kickPlayer` doesn't check balance at all, so they exit as `left` rather
  than `bankrupt` regardless of how deep in the red they were. Both states
  are equally terminal in this game, so it's cosmetic today, but worth
  naming since the two paths now disagree on when debt is "settled."
- No cap on how negative a balance can go before it's actually checked —
  a player can rack up several rent/tax/card hits across a single turn
  (especially with bonus rolls from doubles) with no warning until the
  "you're in debt" hint appears right before they'd otherwise end their
  turn. Not a correctness issue, just a UX gap: no running "you're about to
  owe X" indicator mid-turn.
- A chain of movement cards (a "move" effect landing on another
  surprise/treasure tile that itself draws a movement card) requires one
  `confirmCardMove` click per card in the chain, with no batch-confirm —
  each click is its own server round-trip. Fine at this game's pace, just
  worth naming as a minor friction point if chains turn out to be common.
