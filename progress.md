# Progress Log — Fortune City

Append-only log, one entry per work pass. Newest entry on top. Each entry
should say what was done and **why**, not just what files changed — for the
*what changed* see git history / diffs once this is under version control.

If the architecture itself changed, also update [systemDesign.md](systemDesign.md)
in the same pass.

---

## Pass 10 — 2026-06-29 — Fix: extra rolls per turn + missing three-doubles rule

**Goal:** the user asked me to verify whether a player could roll more
than once per turn beyond the normal doubles/jail rules, ahead of a
friend playtest. Checking confirmed a real bug: `rollDice` had no guard
against rolling again after a non-doubles roll, and the client showed the
"Roll dice" button unconditionally whenever it wasn't blocked by a pending
action. Separately, the classic "three doubles in a row sends you to the
Holding Pen" rule had never been implemented at all — only the unrelated
*escape-the-Holding-Pen-via-doubles* mechanic existed, which happens to
also involve the word "doubles."

**What was done:**
- Added two pieces of room-level state, both reset every turn (in
  `start()` and `endTurn()`): `canRollAgain` (boolean) and
  `consecutiveDoubles` (counter).
- `rollDice` now rejects outright with `"You already rolled this turn"`
  if `canRollAgain` is `false`. After a roll, `canRollAgain` is set to
  `rolledDoubles && !wasInHolding` — true only for a free-play double, not
  for doubles that just escaped the Holding Pen (different mechanic, no
  bonus roll for it).
- `consecutiveDoubles` increments on each free-play double and resets to
  0 on any non-double. Hitting 3 calls `sendToHolding(player)` directly
  and returns *before* `movePlayer` ever runs for that roll — the player
  doesn't move by that third roll's distance or resolve whatever tile it
  would have landed on, matching the real rule that three-in-a-row catches
  you immediately rather than after one more move.
- Exposed `canRollAgain` in `toState()` (and in `toSnapshot()`
  /`fromSnapshot()` from Pass 9, so it survives a restart correctly rather
  than silently resetting).
- Client: `Hud.jsx`'s "Roll dice" button is now only rendered when
  `state.canRollAgain` is true; "End turn" is unaffected (you could always
  end your turn whenever there was no pending action, that part wasn't
  buggy).
- Verified server-side with a direct `Room` unit test (not committed) that
  deterministically controls dice via a `Math.random` monkey-patch: a
  non-doubles roll correctly blocks a second roll attempt; a doubles roll
  correctly grants exactly one bonus roll; three consecutive doubles
  correctly teleports to the Holding Pen instead of moving by the third
  roll's distance, with no bonus roll and the next roll attempt rejected.
  Two of my own test assertions were wrong on the first pass (expected the
  3rd-double case to leave position unchanged, when `sendToHolding`
  correctly teleports to tile 10; and a copy-paste edit accidentally
  dropped one of the three required rolls from the sequence, so the rule
  didn't trigger) — both were test bugs, not code bugs, found and fixed
  before relying on the result.

**Why these calls:**
- A single boolean (`canRollAgain`) rather than, say, counting rolls per
  turn: the actual rule isn't "at most N rolls" (doubles can chain
  multiple bonus rolls), it's "you may roll again only if your last roll
  earned it" — a flag that's recomputed after every roll is the direct
  expression of that rule, not an approximation of it.
- Doubles-to-escape-holding excluded from both the bonus-roll grant and
  the three-in-a-row counter: conflating the two "doubles" concepts would
  let a player stuck in the Holding Pen chain free rolls just by getting
  lucky on the escape roll, which has nothing to do with why the
  three-in-a-row rule exists (discouraging reckless free-play movement).
- Found via an explicit user request to verify behavior before a real
  playtest, not discovered by code review — worth noting that this bug
  had been present since Pass 1 and gone unnoticed through nine passes of
  unit testing, because every prior unit test happened to only roll once
  per turn in its scenarios. A good reminder that unit tests only catch
  what they specifically exercise.

**Known gaps left for later:** none new from this pass — this was a
correctness fix to existing intended behavior, not a new feature with its
own open questions.

**State at end of pass:** server-side logic verified via a direct `Room`
unit test with deterministic dice (temporary file, deleted before
committing); JSX change verified via an esbuild bundle check. No dev
server was needed. `systemDesign.md` updated in place — core flow
description, a new "Roll gating" explanation, `toState()` shape, and new
invariants for the roll-gating and three-doubles behavior.

---

## Pass 9 — 2026-06-28 — Persistent rooms across server restarts

**Goal:** the last item from the original feature gap list — a server
restart used to wipe every active game. Make rooms survive that.

**What was done:**
- Added `Room.toSnapshot()` — a full private dump of everything needed to
  rebuild a room, unlike the already-existing `toState()` (which is the
  *public broadcast* shape and deliberately strips secrets). Critically,
  `toSnapshot()` **keeps each player's `token`** — without it, nobody
  could `rejoinRoom` after a restart, since that's the only thing that
  proves continuity of identity. The only things it drops are live
  `setTimeout` handles (`graceTimer`), which can't survive serialization
  at all.
- Added `Room.fromSnapshot(snapshot)` (static) to rebuild a live `Room`
  from that dump. Two things needed real decisions, not just a direct
  copy: a player who was mid-disconnect-grace when the snapshot was taken
  has no way to resume that exact countdown post-restart, so the restart
  itself is treated as the grace window expiring (`kickPlayer` is called
  for them); and the current player's turn timer is re-armed at a fresh
  full 4 minutes rather than trying to preserve exact remaining
  wall-clock time, since the old timer handle is gone and there's no
  reason to engineer clock-drift-safe persistence for a once-per-restart
  edge case.
- Added `server/src/persistence.js`: `loadSnapshots()`/`saveSnapshots()`
  reading/writing a single `server/data/rooms.json` file, write-then
  -rename so a crash mid-write can't corrupt the file. Added
  `server/data/` to `.gitignore` — persisted game state shouldn't be
  committed.
- `index.js`: on startup, loads and restores every saved room (each in its
  own `try/catch` so one corrupted entry can't take down the whole
  server) before accepting connections. `broadcastState()` now also calls
  a new `persistRooms()` after every emit — i.e. after literally any
  state-changing event, the entire `rooms` map is re-serialized and
  written to disk. `cleanupIfDone` persists immediately on room deletion
  too, so a finished/abandoned room doesn't reappear on the next restart.
  Added `SIGINT`/`SIGTERM` handlers that flush once more before exiting
  (mostly belt-and-suspenders, since the always-save-after-every-change
  approach means there's essentially never an actual unsaved-changes
  window).
- Verified server-side with a direct `Room` unit test (not committed,
  round-tripped through `JSON.parse(JSON.stringify(...))` to catch
  anything that wouldn't actually survive real serialization): ownership
  and balances survive a snapshot/restore round-trip; a player who was
  mid-grace at save time is correctly kicked on restore; tokens survive
  (confirming a post-restart `rejoinRoom` would still work); a fresh turn
  timer gets armed. One assertion in the first draft of the test was
  itself wrong — it expected the turn to simply advance to the other
  player after a mid-grace kick during restore, but in a 2-player room
  that should (and did) immediately declare the survivor the winner via
  the existing `checkWinner` logic, same as any other kick down to one
  active player. Fixed the test, not the code — this was correct behavior
  the first time, the test just hadn't accounted for it.

**Why these calls:**
- Save on *every* state change rather than on an interval: this game has
  no high-frequency tick loop — actions happen at human conversational
  pace — so the "is this too expensive" question that would justify
  debouncing doesn't really apply, and always-consistent on-disk state is
  simpler to reason about than "how stale could the file be right now."
- Kick mid-grace players on restore rather than trying to let them resume:
  preserving an exact countdown across a restart would mean persisting
  wall-clock deadlines and reasoning about clock drift between the
  process that saved and the process that's loading — real complexity for
  a case (server restarts happen to land exactly during someone's 20
  -second grace window) that's rare enough not to justify it. Worth a
  documented gap, not a built feature.
- A single flat `rooms.json` rather than per-room files or a database:
  matches the actual current scale (an in-memory `Map`, casual concurrent
  game count) — splitting into per-room storage or introducing a real
  database is real infrastructure for a scaling problem that doesn't
  exist yet. Logged as a gap for if/when it does.

**Known gaps left for later:** no exact-remaining-time preservation for a
mid-grace disconnect or the current turn timer across a restart; single
-file storage that rewrites everything on every change; no snapshot
schema versioning (a future field-shape change could fail to restore an
old file, though it fails *safely* — per-room `try/catch` skips it rather
than crashing). This closes out every item from the original feature gap
list.

**State at end of pass:** server-side snapshot/restore logic verified via
a direct `Room` unit test (temporary file, deleted before committing,
JSON-round-tripped to simulate real serialization); no dev server was
needed since this pass's logic is entirely server-side. `systemDesign.md`
updated in place — new §2.5 for `persistence.js`, updated §2.3/§2.4
descriptions, new invariants, and gaps (removed the now-resolved
"Persistent rooms" line, added several persistence-specific ones).

---

## Pass 8 — 2026-06-28 — Trade counter-offers

**Goal:** close the last gap flagged from the trading work — declining an
offer was final, with no way to propose something different short of
starting a whole new trade. Let the recipient counter instead.

**What was done:**
- Extracted `proposeTrade`'s inline validation into a shared
  `Room.buildTrade(fromId, {...})` helper that returns `{ trade }` or
  `{ error }` without mutating `trades[]` itself. `proposeTrade` now just
  calls it and pushes the result; this pass's new `counterTrade` calls the
  exact same helper rather than duplicating the validation rules.
- Added `Room.counterTrade(playerId, tradeId, {...})`: only the original
  trade's `toId` can counter (same authorization `respondTrade` already
  enforces). It removes the original trade and replaces it with a new one
  built via `buildTrade`, direction flipped — the counterer becomes the
  new `fromId`, the original proposer becomes the new `toId` — tagged
  with a `counterOf` field pointing back at the trade it replaced (purely
  for display; no effect on validation or resolution). A counter is
  otherwise indistinguishable from a fresh proposal: it can be accepted,
  declined, cancelled, or countered again, with no limit on how many times
  an offer can bounce back and forth.
- `index.js`: added the `counterTrade` socket event.
- Client: refactored `Trade.jsx`'s give/get checkbox-and-coins picker into
  a standalone `TradeForm` sub-component, reused in two places — the
  existing "Propose a trade" panel, and a new inline counter-offer form
  that replaces the Accept/Decline/Counter buttons on an incoming trade
  card when "Counter" is clicked (target player fixed to the original
  proposer, no separate dialog/modal). `TradeSummary` now shows a small
  "counter-offer" badge when a trade has a `counterOf`.
- Verified server-side with a direct `Room` unit test (not committed):
  countering removes the original and replaces it with exactly one new
  trade; the new trade's direction is correctly flipped and linked via
  `counterOf`; accepting the counter correctly swaps ownership and applies
  the (possibly different) money amounts in both directions; the original
  proposer cannot counter their own offer (only the recipient can). All
  passed.

**Why these calls:**
- Replace rather than append: keeping the original offer alive alongside
  a counter would mean two competing live proposals for the same
  negotiation with no clear "current" state — simpler and less ambiguous
  to always have exactly one live trade per negotiation thread, with
  `counterOf` as a breadcrumb rather than a parallel option.
- Reused `buildTrade` instead of writing separate validation for counters:
  a counter-offer has to satisfy the exact same constraints a fresh
  proposal does (ownership, development, mortgage status, funds, non
  -empty) — there was no reason for two copies of that logic to exist and
  risk drifting apart.
- No depth limit on counter-chains: nothing about the mechanism changes
  past the first counter, so adding an artificial cap would be arbitrary
  complexity for a constraint nobody asked for. If spam turns out to be a
  problem in practice, that's the same already-acknowledged gap as
  unlimited concurrent trades generally, not something specific to
  countering.

**Known gaps left for later:** no negotiation history beyond one
`counterOf` hop back, no cap on trade/counter volume per player.
Persistent rooms is the one item left from the original feature list.

**State at end of pass:** server-side logic verified via a direct `Room`
unit test (temporary file, deleted before committing); `Trade.jsx` JSX
syntax verified via an esbuild bundle check; no dev server was needed.
`systemDesign.md` updated in place — new `counterTrade`/`buildTrade`
descriptions, updated `Trade.jsx` client description, wire protocol entry,
invariants, and gaps (removed the now-resolved "no counter-offer flow"
line).

---

## Pass 7 — 2026-06-28 — Auctions on declined purchases

**Goal:** the last item from the original feature gap list — when a player
declines to buy a property they land on, it should go up for auction among
all active players rather than just staying unowned for free.

**What was done:**
- `declineBuy` now calls a new `Room.startAuction(tileId)` instead of just
  clearing `pendingAction` and walking away. `startAuction` pushes an entry
  onto a new `auctions[]` array (`{ id, tileId, highestBid,
  highestBidderId, passedIds }`) and sets `pendingAction = { type:
  "auction", tileId, auctionId, playerId }` — reusing the exact same
  turn-blocking mechanism `awaitBuy` already used, so `rollDice`/`endTurn`
  automatically refuse to act for the decliner until the auction they
  caused resolves, with zero new gating code.
- Modeled auctions as an **array**, not a single slot, specifically to
  handle a real (if rare) interaction with earlier passes: a turn-timeout
  kick mid-auction hands the turn to a new current player, who could
  immediately land on a *different* unowned tile and decline that one too,
  before the first auction has closed. An array means that just works;
  a single-slot design would have needed to define queueing or rejection
  behavior for a case nobody asked to think about.
- Added `placeBid`/`passAuction`, and a `maybeResolveAuction` helper that
  decides when bidding is actually over: zero remaining non-passed bidders
  (no winner), or exactly one remaining *and they're already the high
  bidder*. That second clause matters — if the last non-passed player
  hasn't bid yet, the auction does **not** auto-award it to them; they
  still get an explicit chance to bid or pass. Got this wrong on the first
  pass while writing the test (almost shipped a version that handed the
  property to whoever happened to be the last one left, with no chance to
  decide) and corrected it before finalizing — worth noting since it's the
  kind of bug that's easy to not notice without testing the "last remaining
  bidder hasn't acted yet" path specifically.
- Added `clearAuctionBidsFrom(playerId)`, wired into both `kickPlayer` and
  `checkBankruptcy` (same pattern as Pass 5's `clearTradesInvolving`): a
  kicked/bankrupt player's bid is voided (reset to no-bidder, not rolled
  back to the next-highest actual bid — bid history isn't tracked) and
  they're marked as passed so they stop counting as a live bidder.
- `index.js`: added `placeBid`/`passAuction` socket events.
- Client: new `components/Auction.jsx`, rendered above `Trade` in `Hud`,
  same not-turn-gated treatment — any active player can bid or pass on any
  open auction regardless of whose turn it is, matching how trading
  already works. Reused existing `.trade-card`/`.action-row`/etc. CSS
  classes rather than adding new ones.
- Verified server-side with a direct `Room` unit test (not committed):
  decline correctly opens an auction and blocks the decliner's own
  rollDice/endTurn; underbidding is rejected; the auction correctly
  auto-resolves once the sole remaining bidder is already the high
  bidder; losing bidders' balances are untouched; the decliner's turn
  unblocks once their auction closes; an all-pass auction leaves the
  property unowned; a kicked bidder's winning bid is voided rather than
  letting them win posthumously. All passed.

**Why these calls:**
- No "free walk-away" option: if declining had zero consequence, there'd
  be no reason to ever pay full price — the entire point of the rule (in
  the genre this game is modeled on) is that someone gets the property one
  way or another, just possibly for less than the listed price via
  competitive bidding.
- Reused `pendingAction` for the auction-blocking effect rather than
  inventing a parallel "turn is blocked" flag: it's exactly the same
  shape of problem `awaitBuy` already solved, and keeping one mechanism
  for "block the current player until X resolves" avoids two slightly
  different turn-blocking systems that could drift out of sync.
- Auctions and bidding kept independent of turn order entirely (matching
  Pass 5's trading precedent): an auction that only let people bid on
  their own turn would barely function as an auction — the whole
  mechanism depends on multiple people reacting in roughly the same
  window.

**Known gaps left for later:** no minimum bid increment, no time limit on
an individual auction (only the original decliner's 4-minute turn timer is
affected by it, not the auction itself), voided bids drop to zero rather
than falling back to the next-highest real bid. Persistence is the one
remaining item from the original gap list that hasn't been tackled.

**State at end of pass:** server-side auction logic verified via a direct
`Room` unit test (temporary file, deleted before committing); `Auction.jsx`
JSX syntax verified via an esbuild bundle check; no dev server was needed
since this pass's logic is entirely server-side game rules plus a thin
presentational component. `systemDesign.md` updated in place with a new
"Auctions" subsection, wire protocol entries, invariants, and gaps
(including removing the now-resolved "Auctions when a player declines to
buy" line from the old gaps list).

---

## Pass 6 — 2026-06-28 — Selling houses + mortgaging properties

**Goal:** close the gap flagged right after trading shipped — once a
property had any houses on it, there was no way back down (no
sell-house action existed), which also meant it was permanently locked
out of trading. Add selling houses and mortgaging so players have real
cash-management options instead of only ever spending money forward.

**What was done:**
- Added `Room.sellHouse(playerId, tileId)`: the reverse of `buyHouse` —
  reduces `houses` by one, refunds half the tile's `housePrice` (rounded
  down). Deliberately **no full-color-group requirement to sell**, unlike
  building — you can liquidate down even if you don't hold the rest of the
  group.
- Added `Room.mortgageProperty`/`unmortgageProperty`: mortgaging an
  owned, undeveloped, not-already-mortgaged tile pays out half its
  `price` and sets `ownership[tileId].mortgaged = true`; unmortgaging
  reverses it for `unmortgageCost()` — the mortgage value plus 10%
  interest, rounded up. Added a new `MORTGAGE_INTEREST_RATE` constant.
- Wired mortgage status into the three places that needed to respect it:
  `resolveTile` now waives rent entirely (logs it, doesn't charge) when
  the landed-on tile is mortgaged; `buyHouse` now refuses to build on a
  mortgaged property; `isTradeable` now excludes mortgaged tiles from
  trading, alongside the existing developed-property exclusion from Pass 5.
- `index.js`: added `sellHouse`/`mortgageProperty`/`unmortgageProperty`
  socket events, same thin-wrapper-plus-broadcast pattern as everything
  else.
- Client: extended the existing "Build houses" panel in `Hud.jsx` into a
  build/sell panel — each developable property now shows both a Build and
  (once it has houses) a Sell button with its refund amount. Added a
  separate Mortgage panel listing mortgageable properties (with payout)
  and already-mortgaged ones (with payoff cost) — **not gated on
  `isMyTurn`**, unlike build/sell, since managing your own finances isn't
  a turn action. `Board.jsx` now shows an "M" badge in place of the house
  count on a mortgaged tile.
- Verified server-side with a direct `Room` unit test (not committed):
  build→sell round-trip costs exactly half the house price; selling with
  nothing built is rejected; building on a mortgaged tile is rejected;
  rent is correctly waived landing on a mortgaged tile; the unmortgage
  cost matches value + 10% interest exactly; a mortgaged property is
  correctly excluded from `isTradeable`. All passed.

**Why these calls:**
- No full-group requirement to sell houses: building requires the full
  group because that's what unlocks the ability in the first place: but
  once you've built, there's no reason cashing back out should require
  still owning the rest of the group (you might have lost a sibling
  property to bankruptcy or a trade since building). Selling is strictly
  a "give me money back" action with no group-coordination concern.
- Build/sell kept turn-gated (matching the pre-existing `buyHouse`
  convention) but mortgage/unmortgage/sell deliberately **not**
  turn-gated: the actual motivating scenario for mortgaging is needing
  cash *right now* to cover a rent payment or avoid bankruptcy, which can
  happen on anyone's turn, not just your own. Gating it the same way as
  build would defeat the point.
- Waive rent entirely rather than reduce it on a mortgaged tile: a partial
  -rent rule is real complexity (what fraction, does it interact with the
  monopoly-doubling rule) for a wrinkle nobody asked for; "mortgaged
  property earns nothing until paid off" is the standard convention and
  was the simplest correct rule to implement.
- Excluding mortgaged tiles from trading (on top of the existing
  developed-tile exclusion): transferring a mortgage's obligation to a new
  owner is its own small rule set (who owes the interest, when) that
  wasn't asked for — simplest to require paying it off first, consistent
  with the same reasoning Pass 5 already applied to houses.

**Known gaps left for later:** still no counter-offer flow for trades, no
auctions, no persistence; mortgaging is otherwise feature-complete for
this pass (rent waiver, build-block, trade-block, and interest-bearing
payoff are all in).

**State at end of pass:** server-side logic verified via a direct `Room`
unit test (temporary file, deleted before committing); JSX changes
syntax-checked via `node --check` on the server side (client JSX isn't
directly checkable by `node`, but no dev server was needed to verify the
logic this pass touched, which is entirely server-side game rules).
`systemDesign.md` updated in place — new build/sell/mortgage method
descriptions, updated `isTradeable` note, wire protocol entries, and new
invariants/gaps entries (also fixed an accidental duplicate gaps-list
line from this edit).

---

## Pass 5 — 2026-06-28 — Player-to-player trading

**Goal:** the next item on the open gap list from earlier passes — let
players trade properties and coins with each other directly, rather than
the only economic interactions being buying-from-the-bank and rent.

**What was done:**
- Added `Room.trades[]` and four methods: `proposeTrade(fromId, {...})`,
  `respondTrade(playerId, tradeId, accept)`, `cancelTrade(playerId,
  tradeId)`, and a shared `isTradeable(tileId, ownerId)` check (owned by
  the right player, a property/transit/utility tile, and undeveloped —
  `!owned.houses`).
- Deliberately **not turn-gated**: any two active players can propose or
  respond to a trade regardless of whose turn it is or whether a
  `pendingAction` is open. Trading is a side negotiation, not a turn
  action, so it doesn't interact with `turnIndex`/`pendingAction` at all.
- `respondTrade`'s accept path **re-validates everything from scratch**
  (ownership, development, both players' funds) rather than trusting the
  state captured at proposal time — the gap between propose and accept is
  unbounded, so anything the trade depends on could have changed (a
  property sold, a house built, money spent, even a different trade
  involving the same tile executing first). A stale/invalid trade is
  dropped with an error instead of partially applying.
- Added `Room.clearTradesInvolving(playerId)`, wired into both
  `kickPlayer` and `checkBankruptcy`, so a trade can never dangle
  referencing a player who's no longer in the game.
- `index.js`: added `proposeTrade`/`respondTrade`/`cancelTrade` socket
  events, each a thin call into the matching `Room` method followed by the
  usual `broadcastState`.
- Client: new `components/Trade.jsx`, rendered in `Hud` whenever the game
  is started and there's no winner. Shows incoming offers (accept/decline),
  outgoing offers (cancel), and a form to propose a new one — checkbox
  pickers for both sides' tradeable tiles (computed client-side the same
  way the server does, purely so the UI doesn't offer something that'll
  just bounce; the server is still the actual authority).
- Verified server-side with a direct `Room` unit test (not committed):
  propose→decline leaves ownership untouched; propose→accept correctly
  swaps ownership both directions and moves money both directions;
  offering/requesting a developed property is rejected; kicking a player
  who's party to a pending trade clears that trade automatically. All
  passed.

**Why these calls:**
- Not turn-gated: real trading in this genre of game happens constantly
  between turns, mid-negotiation, sometimes spanning several other
  players' turns — gating it the same way as roll/buy/build would make it
  far less useful and doesn't match how the mechanic is actually used.
- Re-validate at accept rather than lock state at propose: locking would
  mean either blocking the proposer from doing anything else with those
  properties until the offer resolves (intrusive, and trades can sit open
  indefinitely) or allowing it and then having to define what happens to a
  trade referencing a property that got sold/mortgaged/rented out from
  under it. Re-validating at the one moment it actually matters (the
  instant of acceptance) sidesteps both problems.
- Houses-only restriction (no developed properties tradeable): the
  alternative — figuring out what a half-built color group means for the
  recipient, or moving houses along with the property — is real
  complexity for a rule most existing implementations of this genre avoid
  by just requiring you sell first. Took the same shortcut deliberately
  rather than designing a new rule no one asked for.

**Known gaps left for later:** no counter-offer flow (decline is final,
re-propose from scratch); no trade volume/rate limiting; mortgaging,
auctions, and persistence are all still open from earlier passes.

**State at end of pass:** server-side trade logic verified via a direct
`Room` unit test (temporary file, deleted before committing); JSX syntax
for the new `Trade.jsx` verified via an esbuild bundle check (no dev
server was run for this pass). `systemDesign.md` updated in place with a
new "Trading" subsection plus protocol table and gaps-list updates.

---

## Pass 4 — 2026-06-28 — 20-second disconnect grace window (narrows Pass 3's kick policy)

**Goal:** explicit user direction to fix the gap flagged at the end of
Pass 3 — zero tolerance for *any* disconnect was too harsh (a 2-second
wifi blip ended your game exactly like quitting on purpose) — by giving a
disconnected player a fixed 20-second window to reconnect before the seat
is actually forfeited.

**What was done:**
- Reinstated a minimal, deliberately time-boxed version of the
  token/rejoin mechanism Pass 3 removed: `Room.addPlayer` takes a `token`
  again, `Room.verifyToken` is back, and `createRoom`/`joinRoom` mint and
  return one. Unlike Pass 2, this token's *only* job is authorizing a
  `rejoinRoom` within the grace window — there's no indefinite hold behind
  it.
- Added `Room.startGracePeriod(playerId)` / `cancelGracePeriod(playerId)`:
  a disconnect now sets `connected: false` and starts a 20-second
  (`DISCONNECT_GRACE_MS`) `graceTimer` per player (not a room-wide timer —
  multiple players could be mid-grace-window simultaneously) rather than
  calling `kickPlayer` immediately. A successful `rejoinRoom` cancels the
  timer and flips `connected` back to `true`, untouched otherwise.
  Expiry calls `kickPlayer(playerId, "didn't reconnect in time and was
  removed from the game")` — the existing exit path, unchanged.
  `kickPlayer` itself now also clears any leftover `graceTimer` defensively.
- `index.js`: disconnect now calls `room.startGracePeriod` instead of
  `room.kickPlayer` directly (mid-game only — pre-start disconnects still
  remove the player outright, no grace window in the lobby). Added the
  `rejoinRoom` event back, gated on `verifyToken` *and* the player not
  already being `left`/`bankrupt` (a kicked seat — i.e. an *expired* grace
  window — can't be reclaimed; the window is the only door back in, and it
  closes for good once it closes).
- **Manual leave deliberately does *not* go through the grace window** —
  `leaveRoom` still calls `kickPlayer` directly, immediately. The window
  is there to absorb involuntary drops, not to let a deliberate quit be
  undone for 20 seconds.
- Client: reinstated `client/src/session.js` (localStorage wrapper for
  `{ code, playerId, token }`) and rejoin-on-connect logic in `App.jsx`
  (tries `rejoinRoom` on every socket `connect`, including socket.io's own
  auto-reconnect attempts; clears the saved session if the server rejects
  it). `Hud.jsx` now distinguishes a *transient* "reconnecting..." badge
  (`connected: false && !left`) from the *permanent* "left/kicked" badge
  (`left: true`) — these used to be the same concept before Pass 3 removed
  the transient one entirely.
- Verified server-side with a direct `Room` unit test (temporary copy of
  the file with `DISCONNECT_GRACE_MS` shortened to 800ms, deleted after):
  confirmed a reconnect within the window cancels the kick and the seat
  survives even past where the original window would have expired;
  confirmed no-reconnect leads to a kick exactly at window expiry with
  `notify` firing; confirmed a kicked player's token still "matches" at
  the identity level but is correctly blocked by the `left` check that
  `index.js`'s `rejoinRoom` handler applies on top of `verifyToken`.

**Why these calls:**
- A *fixed* 20s window rather than something configurable or scaled to
  game state: simplest thing that addresses the actual complaint (brief
  blips shouldn't be fatal) without re-introducing the open-ended
  complexity Pass 3 walked away from. No one asked for per-room tuning.
- Reinstated the token mechanism rather than inventing a different
  reconnect-auth scheme: it's exactly the right shape for "prove you're
  the same player within a short window" and had already been built once
  (Pass 2) — no reason to design something new for a narrower version of
  the same problem.
- Manual leave still bypasses the grace window: conflating "I meant to
  leave" with "my connection dropped" would mean a deliberate quit briefly
  leaves a phantom warm seat for no reason — the distinction is cheap to
  keep (two call sites, same `kickPlayer`, different timing) and avoids
  confusing behavior (other players seeing "reconnecting..." for someone
  who isn't coming back).
- Pre-start (lobby) disconnects still get no grace window: there's no game
  state worth protecting before the game starts, and rejoining a lobby
  that hasn't begun is just `joinRoom` again with the same code — adding a
  grace window there would protect nothing.

**Known gaps left for later:** the grace window has no shared countdown
visible to other players (just a static "reconnecting..." badge); no
personal "you were kicked because X" client-side notification distinct
from the shared log; trading, mortgaging, auctions, and persistence are
all still open from earlier passes.

**State at end of pass:** server-side grace-window logic verified via a
direct `Room` unit test (temporary file, deleted before committing); no
dev servers were left running. `systemDesign.md` updated in place to
describe the grace window as the current model, not appended alongside
the now-superseded "no reconnect at all" description from Pass 3.

---

## Pass 3 — 2026-06-28 — Strict kick policy + turn timer (supersedes Pass 2's reconnect)

**Goal:** explicit user direction to replace Pass 2's "hold the seat and
allow reconnect" design with a stricter policy: any disconnect kicks the
player out immediately; a manual "Leave" action is handled as a clean,
intentional exit (same end state, friendlier log message); and a player
can't sit on their turn forever — a hard 4-minute server-enforced timer
kicks them if they do.

**What was done:**
- Removed Pass 2's reconnect machinery entirely rather than leaving it
  half-functional alongside the new policy: `Room.verifyToken`,
  `Room.setConnected`, the `connected` player field, the `rejoinRoom`
  socket event, `client/src/session.js`, and the
  load-session/auto-rejoin-on-connect logic in `App.jsx` are all gone.
  `playerId` generation stays (still useful as a stable identity decoupled
  from `socket.id`), but `token` is gone — there's nothing left to
  authenticate a reconnect for, since reconnecting is no longer a thing.
- Added `Room.kickPlayer(playerId, reasonLabel)` — the single exit path now
  used by disconnects, manual leaves, *and* turn-timeouts. Releases
  properties to the bank, sets `left: true` (new field, sits alongside
  `bankrupt` as a second permanent "out" state), clears a stray
  `pendingAction`, advances the turn if the kicked player was current, and
  reassigns host if needed.
- Added `Room.activePlayers()` / `Room.checkWinner()` as shared helpers,
  refactoring `checkBankruptcy`'s inline winner-check into the same path
  `kickPlayer` uses — avoids duplicating the "who's left, did someone win"
  logic across two call sites.
- Added the turn timer: `TURN_TIME_LIMIT_MS = 4 * 60 * 1000`,
  `Room.startTurnTimer()`/`clearTurnTimer()`, wired into `start()` (first
  turn) and `endTurn()` (every subsequent turn, clearing the outgoing
  timer and starting a fresh one). Added `Room.notify` — a callback
  `index.js` wires to `broadcastState` — since a timer firing is the first
  case where the server needs to push a state update **without** a
  client request triggering it.
- `index.js`: disconnect now calls `kickPlayer` (started) or `removePlayer`
  (lobby) instead of flipping a `connected` flag; added a `leaveRoom`
  event for the graceful manual-exit path; added `cleanupIfDone(room)` to
  delete a room once everyone in it is `bankrupt || left` (previously this
  could only happen pre-start).
- Client: `Hud.jsx` got a `TurnCountdown` component (ticks every second
  off `state.turnDeadline`, turns red under 30s) and swapped the
  "disconnected" badge for "left/kicked" (now permanent, not transient).
  `App.jsx`'s `disconnect` handler just resets straight to `Lobby` — no
  reconnect attempt, since the server has already forfeited the seat by
  the time the client could react.
- Verified with a direct unit test against `Room` (not through sockets —
  faster and more precise for this): manual leave of a non-current player
  leaves turn order untouched; kicking the *current* player correctly
  advances the turn while skipping already-left players, and correctly
  detects a win once only one active player remains; a turn timer (tested
  with a temporary `1200ms` copy of the file, deleted after) genuinely
  fires and kicks the idle player, firing `notify`. All three passed. No
  test files were committed.

**Why these calls:**
- Removed rather than left dormant: keeping `rejoinRoom`/`token` around
  "just in case" while disconnects now kick immediately would have meant
  dead code with no reachable success path (by the time a rejoin attempt
  could arrive, the kick has already happened synchronously) — worse than
  having it, since it's misleading about what the system actually does.
- `kickPlayer` as one shared method for three different *triggers*
  (disconnect / manual leave / timeout) rather than three separate
  implementations: the actual game-state consequence is identical in all
  three cases (forfeit seat, release properties, maybe advance turn, maybe
  end the game) — only the human-readable reason differs, so that's the
  only parameter that varies.
- No grace period on disconnect: this was an explicit instruction, not a
  default I chose — noted in systemDesign.md as a real tradeoff (a 2-second
  wifi blip now ends your game) in case it needs revisiting later.
- Turn timer scoped to the whole turn, not reset per sub-action (e.g. per
  dice roll on doubles): simplest rule to state and reason about — "you
  have 4 minutes from when it becomes your turn until it isn't anymore" —
  versus a more permissive but more complex "4 minutes per action."

**Known gaps left for later:** no brief-disconnect tolerance (see
systemDesign.md §6); no personal "you were kicked because X" client-side
notification beyond the shared log; trading, mortgaging, auctions, and
persistence are all still open from Pass 1/2.

**State at end of pass:** server-side logic verified via a direct `Room`
unit test (see above); no dev servers were left running. `systemDesign.md`
fully updated to describe the new model (old reconnect description
removed, not just appended to).

---

## Pass 2 — 2026-06-28 — Reconnect handling

**Goal:** let a player survive a refresh, tab close/reopen, or transient
network drop without losing their seat, balance, or properties — the top
item flagged as a gap after Pass 1.

**What was done:**
- Decoupled player identity from `socket.id`. Each player now gets a
  server-generated `playerId` (public, broadcast in state) and a `token`
  (private, write-once secret, stripped from every `toState()` broadcast)
  on `createRoom`/`joinRoom` — `server/src/game/Room.js`, `server/src/index.js`.
- Added `Room.setConnected()` (flips a `connected` flag + logs it) and
  `Room.verifyToken()` (checks a reconnect attempt's token against the
  stored one) — both pure additions, no existing methods changed shape.
- Added a `rejoinRoom` socket event: given `{ code, playerId, token }`, it
  re-binds the new socket to the existing player and flips
  `connected: true`, without touching any game state (balance, position,
  turn order, ownership all untouched).
- Changed `disconnect` handling to branch on `room.started`: pre-start, a
  disconnecting player is still just removed (no reason to hold a lobby
  seat); once the game has started, they're marked `connected: false`
  instead of being removed, so their turn order and properties survive
  until they come back.
- Added host reassignment in `Room.removePlayer` (if the host is removed
  pre-start, the next remaining player becomes host) — previously the host
  leaving the lobby left `hostId` dangling.
- Client: added `client/src/session.js` (localStorage wrapper for
  `{ code, playerId, token }`). `App.jsx` now attempts `rejoinRoom` on every
  socket `connect` event (covers both first load and any underlying
  socket.io reconnect) before falling back to the `Lobby` screen, and
  tracks `socket.connected` to show a "Connection lost..." banner.
  `Hud.jsx` got a "disconnected" badge per player and a "Leave" button that
  clears the saved session.
- Smoke-tested with a scripted 3-socket scenario (written to a temp file
  in `client/`, deleted after): create+join+start, force-disconnect one
  player's socket, confirm the room keeps them at `connected: false`
  without removing them or touching the game, reconnect with a *new*
  socket using the saved `{code, playerId, token}`, confirm
  `connected: true` again with balance/position intact, and confirm a
  forged token is rejected with `{ error: "Invalid session" }`. All passed.

**Why these calls:**
- `playerId` + `token` instead of just trusting a client-supplied id: a
  client-chosen identity with no secret would let anyone claim anyone
  else's seat by guessing/reusing a `playerId` (which is broadcast to every
  client in the room via `toState()`). The `token` is the only thing that
  proves continuity, and it's never sent to anyone but its owner.
- No abandonment/eviction timer for now: simplest correct behavior for a
  casual game between friends is "your seat is yours until you come back."
  Building a timeout/auto-forfeit system is real added complexity
  (introduces a new failure mode: kicking someone whose wifi blipped for 10
  seconds) and wasn't asked for — logged as a gap instead of building it
  speculatively.
- Pre-start disconnects still remove the player outright (rather than also
  marking them `connected: false`): a lobby seat for a game that hasn't
  begun isn't worth holding open — the player can just rejoin with a fresh
  `createRoom`/`joinRoom`/`joinRoom` flow, no reconnect token needed.

**Known gaps left for later:** no auto-skip/forfeit for a disconnected
player whose turn comes up (the room just waits); everything else from
Pass 1's gap list (trading, mortgaging, auctions, persistence) is still
open.

**State at end of pass:** server and client both manually verified via the
scripted reconnect test above; dev server process stopped afterward, no
long-running processes left behind.

---

## Pass 1 — 2026-06-28 — Initial build: end-to-end MVP

**Goal:** stand up a playable real-time multiplayer property-trading game
from scratch, with an original theme/board (not a copy of any existing
game's assets, names, or text).

**What was done:**
- Chose stack: React + Vite client, Node/Express + Socket.io server,
  real-time rooms with a join code. Decided against single-device/AI-bot
  modes for v1 since the goal was genuine multiplayer.
- Designed an original 32-tile board ("Fortune City") with 8 color groups,
  4 transit tiles, 2 utilities, taxes, two card decks ("Surprise" /
  "Treasure"), a jail-equivalent "Holding Pen", and a "send to holding"
  tile — `server/src/game/board.js`, `cards.js`.
- Implemented the game engine as a `Room` class holding all per-room state
  and rules: dice rolling, movement with pass-Start bonus, tile resolution
  (buy prompt / rent / tax / card draw), monopoly rent doubling, transit/
  utility rent scaling, house/hotel building gated on full color-group
  ownership, Holding Pen escape rules (doubles or 3-turn cap or pay-out),
  bankruptcy (property release + last-player-standing win) —
  `server/src/game/Room.js`.
- Kept `server/src/index.js` as thin Socket.io plumbing only: each event
  handler calls one `Room` method then re-broadcasts the full
  `Room.toState()` to the room. Decided **not** to do incremental
  diffing/event-sourcing — full-state broadcast is simpler and is fine at
  this scale (small player counts, small JSON payloads).
- Built the client as a pure renderer of server state: `Lobby` (create/join
  room), `Board` (32 tiles mapped onto a 9×9 CSS grid perimeter via
  `getGridPos`), `Hud` (turn indicator, roll/buy/decline/build/end-turn
  controls, player list, log feed). No game logic on the client — every
  control just emits a socket event and waits for the next `state` push.
- Replaced all Vite/React boilerplate (default `App.jsx`, `App.css`,
  `index.css`, template assets) with the game's own dark theme and layout.
- Smoke-tested the full loop with a scripted 2-socket test (not committed
  to the repo — written to the scratch/temp dir and deleted after use):
  create room → join → start → roll → buy → pay rent/tax → pass Start
  bonus → end turn, repeated until a stable state. Confirmed balances and
  the log matched expectations, then deleted the script since it wasn't a
  permanent test suite.
- Wrote `README.md` with run instructions and a feature checklist (done vs.
  not-yet-done).

**Why these calls:**
- Server-authoritative + full-state broadcast: prioritized correctness and
  simplicity for a v1 over bandwidth efficiency — there's no AI-bot or
  high-frequency-tick requirement that would justify diffing yet.
- `pendingAction` as the one explicit turn-blocking flag (rather than a
  more general turn-phase enum): the only point in a turn that genuinely
  needs to halt other actions is the buy/decline decision; everything else
  falls out of `turnIndex` + per-player fields, so a heavier state machine
  wasn't justified yet.
- Original board/theme instead of mirroring any existing game's content:
  avoids any IP overlap while keeping the same genre of mechanics (property
  buying, rent, chance-style cards, jail-style holding tile).

**Known gaps left for later** (see systemDesign.md §6 for the live list):
trading, mortgaging, auctions on decline, reconnect-on-refresh, persistence
across server restarts.

**State at end of pass:** both servers run and were manually verified via
the scripted smoke test; dev servers were stopped afterward (no
long-running processes left behind). Project is not yet a git repository.
