# Progress Log — Fortune City

Append-only log, one entry per work pass. Newest entry on top. Each entry
should say what was done and **why**, not just what files changed — for the
*what changed* see git history / diffs once this is under version control.

If the architecture itself changed, also update [systemDesign.md](systemDesign.md)
in the same pass.

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
