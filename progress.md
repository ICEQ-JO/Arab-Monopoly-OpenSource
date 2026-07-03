# Progress Log — Fortune City

Append-only log, one entry per work pass. Newest entry on top. Each entry
should say what was done and **why**, not just what files changed — for the
*what changed* see git history / diffs once this is under version control.

If the architecture itself changed, also update [systemDesign.md](systemDesign.md)
in the same pass.

---

## Pass 17 — 2026-07-03 — Fix: card-reveal UI, movement/jail animation, jail-card logic, board polish

**Goal:** a long run of small-to-medium UI/UX bug reports and polish
requests against the classic-vintage board, found through the user's own
playtesting rather than a single planned feature.

**What was done (card reveal):**
- The Surprise/Treasure card popup was centered on the full browser
  viewport (`position: fixed`), but the left/right side panels aren't the
  same width (`minmax(280,460)` vs `minmax(240,360)`), so the viewport's
  center drifts away from the board's actual center. Moved `CardReveal`'s
  render out of `App.jsx` and into `BoardClassic.jsx`, inside `.cv2-board`
  itself (`position: relative`), and switched the overlay to
  `position: absolute` — it's now centered on the board regardless of
  panel widths or screen size.
- The reveal only ever auto-dismissed after a fixed 3s, with no way to
  dismiss it early (the overlay is `pointer-events: none` so a click just
  passed through to the board underneath). Bumped the timeout to 5s and
  added a `window` click listener while visible that hides it early
  without swallowing the click — whatever's underneath (e.g. a movement
  card's "Continue" button) still receives it too. The existing
  hold-open-until-`confirmCardMove` behavior for movement cards is
  unchanged.

**What was done (movement/jail animation):**
- Every move (dice roll, card-driven jump, a jailing) animated as walking
  *forward* tile-by-tile around the board, including jailings — which
  should snap straight to the Holding Pen, not walk the whole board to get
  there — and "move back N spaces" cards, which should walk *backward*.
- Added `jailSeq`/`jailedPlayerId`/`jailFromTileId` to `Room` state (same
  "bumped on the real event" pattern as `rollSeq`/`cardSeq`).
  `jailFromTileId` is the tile the player was actually standing on the
  instant `sendToHolding` fired (the Go-to-Holding tile, or wherever a
  jailing card was drawn) — `sendToHolding` overwrites `player.position`
  in that same beat, so without capturing it first the client would never
  see that tile at all.
- Client (`BoardClassic.jsx`): a jailing now plays as an ordinary walk from
  the origin up to `jailFromTileId`, a 500ms pause, then a fast teleport
  hop into the Holding Pen tile — not one long walk from origin to jail,
  and not one long teleport skipping the walk-in either (both were tried
  and rejected mid-pass before landing on this two-phase version). Added
  `computeBackwardPath` (mirrors the existing forward-path walker) and
  threaded a `backward` flag through `computeLegWaypoints`, driven by
  reading the *previous* render's `pendingAction` — `confirmCardMove`
  clears `pendingAction` in the same beat it applies the move, so the
  negative `steps` that signals "walk this one backward" is already gone
  from the *current* broadcast by the time the position change shows up.
- Refactored per-move leg-building into `buildResolvedLegs`, which
  resolves a move into a flat list of legs each carrying its own
  `tileId`/`glideMs`/`glideEase`/`pauseBeforeMs` up front, so the jail
  case's walk-then-pause-then-teleport and every ordinary move share one
  timer-chain implementation instead of two.
- Separately: Buy/Decline/Continue could flash on screen for a single
  frame right when Roll was clicked, then hide, then reappear once the
  glide finished. Cause: the gate used `currentTokenMoving` (derived from
  `movingIds`, which only updates via a `useEffect` one render *after* a
  fresh broadcast lands), so on that broadcast's first render `pending` was
  already set but the gate hadn't caught up. Fixed by also checking the
  `tokenMoving` prop, which `App.jsx` already sets synchronously in its raw
  socket handler (in the same batch as the state update itself) for
  `CardReveal`'s benefit — just wasn't being consulted here too.

**What was done (jail/Get Out of Jail Free card logic):**
- `sendToHolding` used to auto-consume a held `holdingFreeCard` and skip
  jailing entirely — meaning a player could never actually be both
  `inHolding` and still holding the card, so `useHoldingFreeCard` was
  unreachable in practice. Removed that auto-avoid; holding the card no
  longer exempts a player from being sent to the Holding Pen, matching
  real rules (it's spent afterward, by choice).
- The in-Holding-Pen turn options only ever showed "Pay $50" (+ "Use Free
  Card", which — because of the bug above — could never actually appear).
  Added a "Roll Dice" button alongside them: `rollDice` already fully
  supported the "roll for doubles to escape" attempt server-side, it just
  had no button.
- Get Out of Jail Free cards can now be traded. `buildTrade`/`respondTrade`
  accept `offerJailCard`/`requestJailCard` booleans, validated against
  `holdingFreeCard` at proposal and re-validated at acceptance (same
  "everything could have changed since the offer was made" re-check
  properties already get). Client: a `JailCardChip`/`StaticJailCardChip` in
  `TradeModal.jsx` alongside property chips in both the trade builder and
  the read-only trade view.
- Added regression tests for all three (`holdingPen.test.js`,
  `trade.test.js`).

**What was done (board visual polish):**
- Removed the "M" badge on mortgaged tiles (kept the grey color change) —
  purely a "we don't want this element" request, not a bug.
- 4 houses built on a narrow non-corner tile could overflow the tile's own
  colored band and get clipped by its `overflow: hidden`, since the icons
  had a fixed size and `flex-shrink: 0`. Changed to `flex: 0 1 clamp(...)`
  (shrinkable, clamp as the *ideal* size) + `aspect-ratio: 1`, so a full
  row of 4 always shrinks to fit rather than clipping, on any screen size.
- A genuinely strange one: on the left/right side tiles, whenever a
  property's mortgaged state or house count changed, the rotated/vertical-
  writing-mode property-name text would visually break and "mesh" to one
  side until a full page refresh — even though neither change should touch
  that text box's layout at all (the band and building badge are both
  `position: absolute`, out of flow). Concluded this is a browser
  layout-cache bug specific to `writing-mode: vertical-*` + `transform`
  combinations, not anything wrong in the CSS itself. Fixed pragmatically:
  keyed the text container on `` `${mortgaged}-${houses}` `` so React
  remounts it fresh whenever either changes, forcing the browser to lay it
  out from scratch — the same effect a refresh has, without needing one.
- House/hotel badge icons on left/right tiles weren't rotated to face
  outward the way every other bit of a side tile's content (name, price,
  treasure/surprise art) already is, so they looked inconsistent with the
  rest of the tile. Rotated the icons themselves (not the badge, whose
  top-to-bottom packing on a tall/narrow tile was already correct) 90°/
  -90° for left/right respectively. Also replaced `house.svg`/`hotel.svg`
  with simpler, bolder solid pictograms and recolored them via
  `background-color` to classic Monopoly-piece colors (green house, red
  hotel) instead of a single shared off-white tone.
- Bumped the active-player token's glow (blur/spread/opacity in the
  `cv2-token-glow` keyframes) — a "make it more noticeable, not too much"
  request, not a bug.

**What was done (game log & waitroom):**
- The log rendered oldest-first with the newest-highlight style
  (`.game-log-newest`) landing on the wrong entry — `state.log` is already
  newest-first server-side (`pushLog` unshifts), but the client called
  `.reverse()` before rendering. Removed the reversal.
- Player names inside log entries are now swapped for that player's icon
  inline (`renderEntry` in `GameLog.jsx` splits each line on every active
  player's name, longest names checked first so one can't shadow another
  that contains it, and renders `PlayerAvatar` in place of the match).
- Player icon images are now eagerly preloaded (`new Image().src = ...`
  for every entry in `ICONS`, at module load in `App.jsx`) instead of only
  fetching the first time the waitroom's icon picker actually renders one.
- `startGame` failing (e.g. not every player has picked an icon yet) was
  silent — the client called `socket.emit("startGame")` with no callback,
  so the server's `{ error }` response just vanished. Added the callback,
  an error message shown to the host, a "No icon yet" tag next to any
  player who hasn't picked one, and a "Please select a player icon" prompt
  under the picker if *you* haven't. The error also self-clears once the
  blocking condition resolves, rather than waiting for another Start click.

**Why these calls:**
- Two-phase walk-then-teleport for jailing (not "walk the whole board" or
  "teleport the whole distance"): the user explicitly asked for this exact
  shape ("play movement animation, wait 0.5 seconds, play go to jail
  animation") after seeing the first teleport-only attempt cut the walk-in
  off too abruptly — this was an iterative fix across three back-and-forth
  rounds in this same pass, not a one-shot design.
- Remounting via a `key` change instead of chasing the underlying browser
  bug further: no CSS-only fix reliably worked around it (the bug is in
  the engine's layout cache, not in anything this stylesheet does wrong),
  and forcing a fresh mount is a standard, low-risk workaround for exactly
  this class of problem, with no observable behavior loss since
  `ClassicTile` holds no internal state to lose on remount.
- Read icon/rotation intent from the user directly (`AskUserQuestion`)
  rather than guessing: "fill the icons for better appearance" and "fix
  the rotation" both had multiple plausible readings (recolor vs. redraw
  vs. layout-direction vs. glyph-rotation) with meaningfully different
  implementations, and there was no way to visually verify the current
  rendering without running the app (which the user had asked not to use
  tooling for earlier in the session).

**State at end of pass:** server test suite green throughout (53/53 by the
end, up from 49 — 4 new regression tests added this pass); client
`vite build` and `oxlint` run clean after every change. `systemDesign.md`
updated in place — new `jailSeq`/`jailedPlayerId`/`jailFromTileId` and
trade `offerJailCard`/`requestJailCard` wire-protocol entries, the
Get-Out-of-Jail-Free auto-avoid removal noted explicitly, the "Roll Dice"
third Holding Pen option. All changes verified via `npm test` (server) and
`vite build` (client) only — no live playtest in this pass; the user
checked each UI fix visually on their own end.

---

## Pass 16 — 2026-06-30 — Character selection (D/Z/Y/H/SD/SE), board widening, animated dice

**Goal:** the user fleshed out the 6-character design from `characters.md`
with real names, portrait images, and short descriptions, and asked to
build the *selection* layer — pick a character before the game starts,
become that character for the room — explicitly scoped to UI/selection
only; wiring the actual abilities (toll skims, seize/demolish, alliances)
into gameplay is deferred to a future session. Also asked for two
unrelated UI passes in the same session: widen the board, and add a real
animated dice-roll instead of a static "🎲 3+4=7" text line.

**What was done (character selection):**
- Real names assigned to the six codenames from `characters.md`: D = دروبي,
  Z = هرم الزرقا (corrected mid-session from an initial هرم الزرقة), Y = Big
  Yahu, H = Hitler (corrected mid-session from an initial "Hintler"), SD =
  صدام حسين, SE = السيسي — all explicitly confirmed by the user as
  intentional joke names, not a request to second-guess.
- `server/src/game/characters.js` (new): `CHARACTER_IDS` and
  `CHARACTER_NAMES`, the same static-data pattern as `board.js`/`cards.js`.
- `Room.js`: added `characterSelections{}` (`playerId -> characterId`, reset
  on room creation, never auto-cleared otherwise). `selectCharacter
  (playerId, characterId)` validates the game hasn't started, the id is
  real, and no *other* player already holds it (re-selecting your own pick
  is allowed, since it's just an overwrite of the same key).
  `resetCharacterSelections(playerId)` is host-only, pre-start-only, and
  just empties the map. `start()` now walks every player and, if they have
  a selection, sets `player.characterId` and overwrites `player.name` with
  the character's real name — this is *the* mechanism that replaces free
  -text name entry: a player's in-game identity is now their chosen
  character, not anything they typed.
- `index.js`: `createRoom`/`joinRoom` no longer accept or require a `name`
  in their payload — `addPlayer` now assigns a placeholder (`"Seat N"`)
  that only exists pre-game and gets overwritten by `start()` once
  everyone's picked. Added `selectCharacter`/`resetCharacterSelections`
  socket events. `startGame` gained one more precondition alongside the
  existing host-only/2-player-minimum checks: every player must have an
  entry in `characterSelections`, or the request is silently ignored (no
  separate error path needed — the client already disables the Start
  button itself until that's true).
- `client/src/data/characters.js` (new): the six characters' display data
  — name, a one-line description, a short flavor-text `passive`/`active`
  ability summary (placeholder wording, explicitly marked as "edit later"
  by the user — not the real ability spec, which stays in `characters.md`
  until a future implementation pass), and `v1`/`v2` image paths.
- `client/public/characters/{D,Z,Y,H,SD,SE}/v1.*`, `v2.*` (new): real
  portrait images the user supplied, copied in from a top-level
  `characters/` folder with every extension normalized to lowercase (one
  source file was `v1.JPG` — left as-is it would've worked fine on
  Windows but silently 404'd on any case-sensitive deployment filesystem).
  `v1` is the default portrait; `v2` swaps in once that player's balance
  hits $3000+, computed purely client-side (`player.balance >= 3000 ?
  char.v2 : char.v1`) — no server change needed since balance is already
  broadcast.
- `client/src/components/CharacterCard.jsx` (new): a click-to-flip card —
  front shows the balance-gated portrait, name, and description; back
  shows the full passive/active text plus a context-sensitive
  button/label (`Play as X` if unclaimed, `Change character` if it's
  already yours, `Taken by X` — no button — if it's someone else's pick).
- `client/src/components/CharacterSelect.jsx` (new): the pre-game lobby
  screen, replacing the old immediate jump from `Lobby` straight to the
  board. Shows the room code, a chip per player (color swatch, picked
  -character name or "picking…", a Host badge), the 6-card grid, and
  host-only Reset/Start controls — Start is disabled until every current
  player has a selection.
- `client/src/components/Lobby.jsx`: the "Your name" field is gone
  entirely — just Create or enter-a-code-and-Join, matching the new rule
  that identity comes from the character you pick, not free text.
- `client/src/App.jsx`: the `joined && !state.started` window now renders
  `CharacterSelect` instead of jumping straight to the board; `joined &&
  state.started` is unchanged.
- `client/src/components/PlayerCard.jsx` (new) + `App.css`: the user's
  *own* character card now sits in a third, 230px-wide grid column to the
  left of the board during actual gameplay (not just pre-game) —
  click-to-flip like the selection-screen card, same balance-gated
  portrait swap, `align-self: stretch` so it matches the board's rendered
  height instead of leaving a gap below it. The front face currently ends
  in an empty `.player-card-tracker` div below the portrait/description —
  deliberately blank, reserved for a future ability-cooldown/use-count
  display once abilities are actually implemented, not built out this
  pass.

**What was done (board widening):** `.board`'s `max-width` raised from
740px to 900px — explicitly to make room for "new content and upgrades"
or a more bonus the user mentioned wanting room for, not a response to any
specific layout bug.

**What was done (animated dice):** went through several visual iterations
based on direct user feedback before landing on the final version — worth
recording the rejected ones since they explain why the final shape is what
it is, not just what it is.
- Replaced the static "🎲 3 + 4 = 7" board-center text with a real CSS 3D
  cube per die (`Die3D` in the new `client/src/components/Dice.jsx`): six
  absolutely-positioned faces (`translateZ` + per-axis `rotate`) forming an
  actual cube, each showing the classic 6-value pip layout via a 3×3 grid
  of dots (`DOT_POSITIONS`).
- **Detecting a genuine new roll required a server-side change.** `lastRoll`
  alone wasn't a reliable trigger — over the wire, every state broadcast
  produces a brand-new JSON-deserialized array even when the values are
  unchanged (e.g. rolling the same double twice in a row), so naive
  reference/value comparison would either miss real re-rolls or fire on
  irrelevant unrelated broadcasts. Added `Room.rollSeq` — an integer that
  increments once per actual `rollDice()` call, included in `toState()`/
  `toSnapshot()`/`fromSnapshot()` — so the client has an unambiguous
  "a new roll just happened" signal independent of what the numbers are.
- **Landing on the correct face after a spin required solving actual cube
  geometry.** `FACE_ORIENTATION` maps each value 1-6 to the `{x, y}` cube
  rotation that brings that face to point at the viewer, derived as the
  inverse of each face's own placement transform (since CSS composes
  parent-rotation-then-child-placement) — verified by hand for all six
  faces before wiring it in. Each new roll computes a forward-only delta
  from the cube's current resting angle to the target, adds 1-2 random
  full extra spins for flourish, and lets a CSS `transition` (not a
  keyframe animation) interpolate through every intermediate degree —
  this only works because the CSS transform spec interpolates matching
  rotate-function lists component-wise, not via shortest-angular-path, so
  a `rotateX(900deg)` target genuinely animates through multiple visible
  spins instead of snapping.
- **First real bug: the spin never visibly played.** The dice were
  originally only rendered inside `{lastRoll && (...)}`, which goes `null`
  -then-truthy every single turn (`endTurn` clears `lastRoll`) — so the
  `Dice` component fully unmounted and remounted on every turn, and its
  internal "what was the previous rotation" ref reset right along with it,
  meaning every roll after the first looked like a fresh mount with no
  rotation to animate *from*. Fixed by always rendering `Dice` (handling
  `roll == null` as "show the idle/last-known faces" inside the component
  instead of unmounting the whole tree from the outside).
- **Iterated on feel per direct feedback, several times:** spin duration
  1s → 1.8s → 1.4s; easing fast-start → symmetric ease-in-out (the
  in-between fast-start version felt "too fast" at the very start of the
  roll); extra-spin count 2-3 turns → 1-2 (fewer total degrees over the
  same duration reads as calmer without changing the easing curve again).
- **Tried and explicitly reverted a "rectangular blue towers" reskin** (a
  joking reference to Amman's unfinished Abdali towers) — rebuilt the cube
  as a tall square-footprint box with a lit-window pip pattern on its
  faces (1/2 on the small square caps, 3-6 on the four walls) per explicit
  direction, then the user decided after seeing it live that it "wasn't
  worth it" and asked to go back to the plain cube. Reverted fully —
  `FACE_ORIENTATION`, face dimensions, and styling all restored to the
  pre-tower cube state — rather than leaving any tower-specific CSS/JSX
  half-removed.
- **Fixed "I can see the board through the cube mid-spin" without a
  separate backdrop panel**, per explicit instruction not to add one: each
  die now has a `.die3d-filler` — a small static, identically-styled
  square sitting directly behind the spinning cube (same color/border, no
  rotation). It's invisible at rest since it matches the cube's resting
  face exactly, but plugs the visual gap during a spin when the rotating
  cube's silhouette is thinner than its own bounding box, without needing
  a separate panel around the dice.
- **A later, more deliberate dark backdrop was added and then explicitly
  relocated**, not removed outright: the user first asked for a `.dice
  -stage` panel (a separate dark rounded box just around the two dice) to
  fix the same see-through issue more thoroughly, then said it looked "out
  of place" floating on the parchment board, then asked to apply that same
  dark color to the board's own center area instead of a separate floating
  box. Final state: `.board-center` itself (the inner area holding the
  "Monoboly عرب" title and the dice) carries the dark inset gradient
  background directly, with the title's color/shadow adjusted to gold-on
  -dark for contrast — there's no standalone `.dice-stage` element left in
  the CSS or JSX.
- **Per-face shading + a ground-contact shadow (an attempt to make the
  cube read as a solid volume from any angle) was built, tested live, and
  then explicitly reverted** alongside a wider idle-tilt change and a
  reduced random-wobble range — the user's call after seeing it ("still
  wrong... too tall a task... let's just use the trusty 3d cube") was to
  go back to the simple uniform-white-face cube with the original tilt/
  wobble values rather than keep iterating on a more elaborate look.

**Why these calls:**
- Identity-from-character rather than free-text name entry: this was the
  user's own explicit design ("they simply enter a code... they choose a
  card and they become that character"), not something proposed and
  accepted — implemented exactly as specified rather than offering a
  hybrid (e.g. keep a name field *and* a character).
- `rollSeq` as a dedicated counter rather than trying to make `lastRoll`
  itself a reliable change-signal: the real requirement ("did a new roll
  just happen," independent of what the numbers are) doesn't have a
  value-based representation that survives repeated identical rolls
  (doubles), so the simplest correct fix was a monotonic counter purpose
  -built for exactly that question.
- Reverted the tower reskin and the per-face-shading/contact-shadow
  experiment fully rather than leaving partial remnants: both were
  explicit "go back" instructions, not requests to blend the old and new
  — keeping any half-applied CSS from a rejected direction would just be
  confusing dead styling for the next pass to puzzle over.
- Backdrop-on-`board-center` rather than a separate panel: matches the
  user's own stated reasoning ("so it's not out of place") — the fix
  needed to feel like part of the board's existing design language, not a
  bolted-on UI element, which a separate floating dark box couldn't
  achieve no matter how it was styled.

**Known gaps left for later:** character *abilities* are entirely
unimplemented — `characters.md`'s ability spec (D's toll zone, Z's trade
/tax skim, Y's seize/demolish, H's territory expansion, SD's station
toll + attack power, SE's bank bonus + alliance) is still just a design
doc; this pass only built the picking/identity layer. The flavor-text
ability descriptions in `client/src/data/characters.js` are explicitly
placeholder wording the user asked to "write any description for now,
we'll edit it later" — not the real spec. `PlayerCard.jsx`'s
`.player-card-tracker` is an intentionally empty div with no content yet,
reserved for a future cooldown/use-count UI once abilities exist. No
server-side enforcement exists yet for "exactly one character per player
once the game starts" beyond the pre-start `selectCharacter` uniqueness
check — nothing currently stops two players from somehow ending up with
the same `characterId` if `start()` were ever called with a corrupted
`characterSelections` map, though there's no code path that could
actually produce that today. The dice's idle resting angle and per-roll
extra-spin count are hand-tuned constants (`IDLE_TILT`, the 1-2 spins, the
±14° random Z-wobble) with no configurability.

**State at end of pass:** all 40 existing server tests still pass
unchanged (`rollSeq`/character-selection fields are pure additions to
`toState()`/`toSnapshot()`, nothing existing was restructured). Verified
live in the browser across this whole pass — both dev servers were kept
running throughout and every change was checked visually before moving to
the next request, including several iterations on the dice that were
explicitly rejected and rolled back based on what was actually seen on
screen, not just code review.

---

## Pass 15 — 2026-06-29 — Add a server-side regression test suite

**Goal:** every pass so far had verified its fix with a direct `Room` unit
test, then deleted it before committing — including a stale-state bug
(Pass 10/11) that reappeared one line below its own fix, which a kept test
would have caught automatically instead of needing a deliberate re-audit.
Asked directly whether this could actually be built, then built it: a
permanent `server/test/` suite using Node's built-in test runner (no new
dependency — fits a project that only depends on Express/Socket.io/cors
/nanoid), covering the bug classes found across this session's passes.

**What was done:**
- `server/test/helpers.js`: `makeRoom()` builds a started 2-player `Room`;
  `withDice(pairs, fn)` deterministically patches `Math.random` so
  `rollDice` produces exact `[d1, d2]` pairs in sequence, restoring it
  afterward even if `fn` throws; `cleanup(room)` clears the turn timer, any
  open auction timers, and any player grace timers — necessary because
  `node --test` runs everything in one process, so a single leaked
  `setTimeout` (e.g. the 4-minute turn timer) would keep that process
  alive long after the suite finishes.
- Six test files, one per bug category: `rollGating.test.js` (bonus-roll
  -on-doubles, the three-doubles rule, and direct regression tests for both
  Pass 10 and Pass 11's stale-state bugs), `holdingPen.test.js` (the
  3-turn forced-pay cap, doubles-escape, pay/free-card alternatives),
  `bankruptcy.test.js` (the Pass 13 deferred-bankruptcy redesign: debt
  tolerated mid-turn, mortgaging enough vs. not enough, the
  stuck-in-Holding-Pen auto-end path, the 2-player auto-win edge case),
  `trade.test.js` (the Pass 14 debt-trading regression, funds checks,
  mortgaged/developed exclusions, counter-offers, re-validation on
  accept), `auction.test.js` (bid validation, the "last bidder hasn't bid
  yet" edge case from Pass 7, voided bids on kick, deadline extension),
  and `cardMove.test.js` (the deferred-move confirmation flow, wrong
  -player rejection, the deferred bonus-roll handoff, confirming
  `goToHolding` is correctly *not* deferred the same way).
- Exported the previously-internal tuning constants from `Room.js`
  (`HOLDING_RELEASE_RENT`, `MAX_HOLDING_TURNS`, `AUCTION_EXTEND_MS`, etc.)
  so tests reference them by name instead of hardcoding magic numbers that
  would silently drift out of sync if ever retuned.
- Added `"test": "node --test"` to `server/package.json`.
- Several of the test files themselves had bugs on the first pass — mostly
  dice choices that, while satisfying the immediate assertion (e.g. "this
  needs to be a double"), happened to land the player on a tile that
  triggers a random card draw or an unowned-property buy prompt, setting
  an unrelated `pendingAction` that masked the actual behavior being
  tested or made an assertion flaky from run to run (since the deck shuffle
  itself isn't seeded). Fixed by deliberately choosing dice that land on
  deterministic tiles (fixed-amount tax tiles, or the Holding Pen tile
  landed on directly rather than via the jailing tile) wherever a test
  needed a real movement step to happen. Confirmed stable across five
  repeated full runs after these fixes.

**Why these calls:**
- Node's built-in test runner over installing a framework: zero new
  dependencies, and it's the exact same "instantiate a `Room`, monkeypatch
  `Math.random`, assert on state" pattern already used informally in every
  prior pass — formalizing it, not replacing it with something unfamiliar.
- Exporting the tuning constants rather than leaving tests to hardcode the
  same numbers `Room.js` already defines: a future pass that retunes, say,
  `MAX_HOLDING_TURNS` shouldn't also require updating every test that
  happens to know it's currently `3`.
- Fixed the flaky test setups rather than loosening their assertions: a
  test that only passes *because* its dice happened not to hit a random
  tile this run isn't actually verifying the behavior it claims to: the
  goal was deterministic correctness, not a passing run by luck.

**Known gaps left for later:** server-only — the client components touched
this session (`Trade.jsx`'s slider, `Auction.jsx`'s increment buttons)
have no automated coverage; would need a separate frontend test setup
(e.g. Vitest + React Testing Library) to add, and wasn't built this pass.

**State at end of pass:** `npm test` in `server/` passes all 40 tests,
confirmed stable across five repeated runs. No changes to game logic
itself beyond the constant exports (verified backward-compatible — same
values, just newly `export`ed).

---

## Pass 14 — 2026-06-29 — Fix: trade funds check broke under debt; slider/bid UI rework

**Goal:** continue testing Pass 13's deferred-bankruptcy feature. The user
specifically tried using a trade to recover from debt (player A, in the red,
asking player B for coins) and the trade was rejected outright. Separately,
the user asked for two UI changes to make entering coin amounts and
auction bids faster: a slider bounded by actual balance for trade coins,
and `+$1`/`+$10`/`+$100` one-click increment buttons for auction bids
instead of typing an exact amount.

**What was found and fixed:**
- **`respondTrade`'s funds check broke for any indebted player, even when
  they weren't the one giving money away.** The check was
  `fromPlayer.balance < trade.offerMoney || toPlayer.balance <
  trade.requestMoney`. With `offerMoney = 0` and a negative balance (now a
  normal, expected state since Pass 13), `-50 < 0` evaluates to `true`,
  rejecting the trade as unaffordable even though nothing was being
  offered. This made trading — one of the few legitimate ways to recover
  from debt before a turn ends — unusable by the exact players who'd need
  it most. Fixed by only requiring affordability when the amount is
  actually positive: `(offerMoney > 0 && fromPlayer.balance < offerMoney)
  || (requestMoney > 0 && toPlayer.balance < requestMoney)`. Verified with
  a direct test: an indebted player can now request money while offering
  $0, and is still correctly blocked from offering money they don't have.
- This is the second bug Pass 13's deferred-bankruptcy redesign has
  surfaced in code that had simply never been exercised with a negative
  balance before (the first was the jail-pen/holding-pen timing question
  in the same session, which turned out not to be a bug — see below).

**What changed (UI):**
- `Trade.jsx`'s `TradeForm`: replaced the two typed `<input type="number">`
  coin fields with `<input type="range">` sliders, each capped at `0` to
  the relevant player's actual balance (`maxOffer` from the acting
  player's own balance, `maxRequest` from the other party's) — clamped to
  `0` rather than negative if that balance is currently in debt. This
  doubles as a second fix for the same underlying problem the funds-check
  bug came from: a slider physically cannot be dragged past what someone
  has, so there's no longer a way to even construct an offer the server
  would reject as unaffordable. Required threading a new `players` prop
  into every `TradeForm` call site (the "Propose a trade" panel and the
  inline counter-offer form) so it can look up both balances.
- `Auction.jsx`'s `AuctionCard`: replaced the typed bid-amount input plus
  separate "Bid" button with three buttons — `+$1`, `+$10`, `+$100` — each
  immediately submitting a bid of *the current highest bid plus that
  amount*, with no confirm step. One click is one bid, intended to keep up
  with a live bidding war instead of typing an exact number each time.

**What was investigated and found to be correct, not a bug:** the user
reported the Holding Pen's 3-turn escape cap seeming to take 4 stuck turns
instead of 3 before releasing a player. A direct `Room` test forcing three
non-double rolls in a row confirmed the cap fires exactly on the 3rd
attempt (`holdingTurns` 1 → 2 → 3, forced pay-and-move on reaching 3),
matching the documented design. The user also asked whether rolling
doubles to *escape* the Holding Pen should grant a bonus roll afterward;
confirmed this is an intentional, previously-documented decision (Pass
10/11) matching real Monopoly rules — escaping confinement and the
free-play "doubles = roll again" rule are different mechanics, not the
same rule triggered twice. No code change made; the user confirmed this
was their own recollection of the rules being off, not a real bug.

**Why these calls:**
- Fixed the funds check rather than special-casing debt recovery
  elsewhere: the bug was a straightforward boolean-logic error (comparing
  balance to an amount without checking the amount was actually positive)
  that happened to only matter once negative balances became possible —
  the fix is generic and correct regardless of *why* a balance might be
  negative, not specific to the bankruptcy feature that exposed it.
- Slider over input-with-validation for trade coins: a slider that simply
  can't exceed the cap is strictly better than a number input that could
  be typed past the cap and then rejected — it eliminates an entire class
  of "why didn't my trade go through" confusion rather than just
  explaining the error after the fact.
- Bid-by-increment over typed-amount-plus-confirm for auctions: matches
  how the user actually wants to bid in practice (incrementally, reacting
  to whatever the current high bid is) rather than mentally computing and
  typing an exact target number under time pressure from the auction
  countdown.

**Known gaps left for later:** none new from this pass — the funds-check
fix and the UI changes are both complete; the jail-timing question turned
out not to need any change.

**State at end of pass:** funds-check fix verified via a direct `Room`
unit test (temporary file, deleted before committing) covering both the
previously-broken case (requesting money while in debt) and the still
-correctly-blocked case (offering money not had). UI changes verified via
client build (`npm run build`); manually confirmed in the user's live
playtest session. `systemDesign.md` updated in place — `Trade.jsx`/
`Auction.jsx` descriptions rewritten for the new slider/increment-button
UI, the `respondTrade` funds-check description corrected (also fixed a
stale reference to a `checkBankruptcy` call that Pass 13 had already
removed from that method).

---

## Pass 13 — 2026-06-29 — Fix: four more playtest bugs, plus deferred bankruptcy

**Goal:** continue the live playtest from Pass 12. The user found four more
concrete bugs in the newest code (card moves, jail timing, trading), and
then raised a design problem with bankruptcy itself: a player who owes more
than they have loses instantly, with no chance to mortgage/sell/trade their
way out first — unlike real property-trading games, where you only go
bankrupt if you *still* can't cover it after liquidating what you can.

**What was found and fixed (bugs):**
- **No log entry for the dice roll itself.** `rollDice` set `lastRoll` and
  reacted to it, but never actually logged the roll happening. Added
  `pushLog` with a grammatically-correct article (`"Alice rolled a 12."` /
  `"Alice rolled an 8."` — "eight" and "eleven" are the only totals 2–12
  that start with a vowel sound) right after the dice are rolled, before any
  branching on the result.
- **Movement cards ("Advance to X" / "Move N spaces") resolved instantly,**
  with no chance to actually read the card before the board changed under
  the player. `applyCardEffect`'s `advanceTo`/`move` cases now set
  `pendingAction: { type: "awaitCardMove", ... }` instead of moving the
  player immediately; a new `confirmCardMove(playerId)` does the actual
  move once the player clicks the new "Continue" button (no decline option
  — it's not a real choice, just a deliberate beat). `rollDice` had to
  defer its own bonus-roll calculation (`canRollAgain`) onto the pending
  action in this case, since it depends on the player's state *after* the
  move, which hasn't happened yet at the point the card was drawn.
- **Jail pay/use-card options appeared the instant a player arrived in the
  Holding Pen,** even mid-turn, before they'd had any real turn to decide
  with — they should only be offered starting on the player's *next* turn.
  Fixed client-side: gated the option on `!state.lastRoll` in addition to
  `inHolding` — `lastRoll` is non-null the instant they're freshly confined
  (since they just rolled to get there) but resets to `null` at the start
  of their following turn, which turned out to be exactly the right signal
  with no new state needed.
- **Trading silently stopped working after the first attempt with any given
  player.** Root cause: `index.js`'s `proposeTrade`/`counterTrade` socket
  handlers never invoked the client's acknowledgement callback. The trade
  form's success handler (which clears the selected properties/coins) never
  ran, so a second attempt reused stale property IDs that the server then
  rejected — and since the ack never fired, the rejection's error message
  never reached the UI either. It looked completely dead, with no visible
  error. Fixed both handlers to call back with the `Room` method's actual
  result.

**What changed (bankruptcy redesign):**
- `checkBankruptcy(player)` no longer fires automatically after every
  rent/tax/card payment, auction win, or trade completion — those call
  sites were all removed (`resolveTile`, `resolveAuction`, `respondTrade`).
  A negative `balance` is now tolerated indefinitely mid-turn.
- Added `finishTurn(player)`: `if (player.balance < 0)
  this.checkBankruptcy(player); if (!this.winnerId) this.endTurn();` — the
  one place bankruptcy is actually enforced, called from `playerEndTurn`
  (the "End turn" button) and from the stuck-in-Holding-Pen auto-end path
  in `rollDice` (the other way a turn can end without an explicit click).
- Since mortgaging, selling houses, and trading were already not
  turn-gated (Pass 5/6), a player in the red already had every tool needed
  to recover *before* their own turn ends — no new recovery mechanism had
  to be built, just the removal of the premature check.
- This means a player whose balance went negative because of *someone
  else's* turn (a `payEachPlayer`/`collectFromEachPlayer` card) isn't
  bankrupted until *their own* next turn ends, even though it wasn't their
  turn that caused it — confirmed with the user this is the desired
  behavior, not an oversight to special-case away.
- Client: added an "in debt" badge (`balance < 0`, not yet bankrupt/left)
  to the player list, and a warning hint above the "End turn" button when
  it's the player's own turn and their own balance is negative, naming the
  consequence explicitly so it's never a surprise.
- Verified server-side: going negative mid-turn doesn't touch the
  `bankrupt` flag or release properties; mortgaging *enough* before ending
  the turn avoids bankruptcy entirely; mortgaging *not enough* still
  bankrupts at turn-end; the stuck-in-Holding-Pen auto-end path enforces
  the same rule as the explicit "End turn" button, not just the latter.

**Why these calls:**
- Deferred (not removed) bankruptcy checking: the *rule* that a negative
  balance is eventually fatal didn't change, only *when* it's checked —
  this is a timing fix, not a removal of consequences, so the simplest
  correct change was relocating the one call to `checkBankruptcy` rather
  than rewriting how it works.
- `finishTurn` as a new shared method rather than inlining the check at
  each of its two call sites: both `playerEndTurn` and the stuck-in-holding
  path are genuinely "a turn is ending right now" moments, and duplicating
  the same three lines in both places risked exactly the kind of drift
  Pass 11's bug hunt was about.
- No special-casing for "this player's debt came from someone else's
  turn": building a notion of *who* caused a given balance change, just to
  treat it differently at enforcement time, is real complexity for a
  distinction the user explicitly said they liked once it was pointed out
  — simplest correct rule is "whoever's turn it is, when it ends, is on
  the hook for their own balance," full stop.
- Card-move deferral via `pendingAction` rather than a separate timer or
  client-side delay: it's the exact same "block the turn until this one
  thing resolves" mechanism every other turn-blocking action already uses
  (`awaitBuy`, `auction`) — no reason to invent a second pattern for a
  third instance of the same shape of problem.

**Known gaps left for later:** a player kicked (disconnect/AFK/manual
leave) while carrying an unsettled negative balance exits as `left` rather
than `bankrupt`, since `kickPlayer` doesn't check balance — cosmetic today
(both are equally terminal) but the two exit paths now disagree on whether
debt was ever "resolved"; no running mid-turn indicator of accumulating
risk before the in-debt hint appears; a chain of movement cards (one
landing on another card-drawing tile) needs one `confirmCardMove` click per
card in the chain, no batch-confirm. All three logged in
`systemDesign.md` §6, not fixed this pass.

**State at end of pass:** all four bug fixes and the bankruptcy redesign
verified via direct `Room` unit tests (temporary files, deleted before
committing) — including reproducing the exact "move back 3 spaces" card
flow end-to-end and confirming it actually was a stale-client-bundle issue,
not a server bug, before touching any code for that one. Client rebuilt and
server restarted twice during this pass to ship each fix; the user
confirmed each one in their live playtest before moving to the next.
`systemDesign.md` updated in place — new `awaitCardMove` pendingAction
type and `confirmCardMove`/`finishTurn` method descriptions, updated
Holding Pen/bankruptcy/trading sections, wire protocol entries, a fully
rewritten bankruptcy invariant (replacing "immediate and final"), and new
gaps entries.

---

## Pass 12 — 2026-06-29 — Fix: three bugs found in a real playtest

**Goal:** the user ran an actual test session and reported three concrete
bugs, each a genuine missing piece of intended game behavior rather than
a stale-state pattern like Passes 10–11.

**What was found and fixed:**
- **Ending a turn without ever rolling was allowed.** Neither
  `index.js`'s `endTurn` handler nor `Room.endTurn()` checked whether the
  current player had rolled at all this turn — only `pendingAction` was
  checked. Fixed by adding `Room.playerEndTurn(playerId)`, the new
  player-facing entry point (rejects with `"Roll the dice before ending
  your turn"` if `this.lastRoll` is still `null`), while the internal
  `endTurn()` stays usable by `kickPlayer` and the stuck-in-holding path,
  neither of which should require a prior roll. `index.js`'s handler now
  just calls `room.playerEndTurn()` — this also resolved a structural
  inconsistency flagged at the end of Pass 11 (every other action's guard
  lived in `Room.js`; `endTurn`'s lived in `index.js`).
- **Auctions never closed on their own.** The only resolution path was
  `maybeResolveAuction` triggering off unanimous explicit passes — a
  player who simply stopped engaging (no Pass click, no further bids)
  left the auction open forever. Added a soft-close timer per auction:
  `AUCTION_BASE_MS` (10s) from when it opens, extended to at least
  `AUCTION_EXTEND_MS` (3s) from each new bid (never shortened), via
  `scheduleAuctionTimer`. When the timer actually fires, `resolveAuction`
  runs with whatever the current state is and `this.notify?.()` pushes
  the result with no client request having triggered it — same pattern
  already used for the turn timer and grace-window timer. The existing
  unanimous-pass path still works and can close an auction *before* the
  timer; the timer is purely a backstop for when bidding goes quiet
  without anyone bothering to click Pass. Added `clearAllAuctionTimers()`
  (called from `cleanupIfDone`) and timer cleanup in `resolveAuction`
  itself, mirroring how the turn timer is already managed. Updated
  `toState()`/`toSnapshot()` to strip the raw timer handle from each
  auction (same pattern as `graceTimer`), and `fromSnapshot()` to re-arm
  each restored auction with a fresh base window (same simplification
  already applied to the turn timer in Pass 9).
- **No way to voluntarily leave the Holding Pen, and "Get Out of Jail
  Free" cards were never usable to escape.** `holdingFreeCard` only ever
  got *consulted* inside `sendToHolding` to avoid going to jail in the
  first place — there was no path to use a banked card to leave once
  already confined, and no way to pay the fine early instead of waiting
  out doubles/the 3-turn cap. Added `Room.payToLeaveHolding(playerId)`
  (pays `HOLDING_RELEASE_RENT`, same amount as the existing forced-pay
  -after-3-turns case) and `Room.useHoldingFreeCard(playerId)`. Both just
  clear `inHolding`/`holdingTurns` without moving the player or consuming
  their roll — their next `rollDice` call this same turn then behaves as
  ordinary free-play movement, since `wasInHolding` is read fresh from
  current state at the top of every roll. Client: `Hud.jsx` shows both
  options (Pay $50 / Use card, the latter only if `me.holdingFreeCard` is
  true) whenever it's the player's turn and they're `inHolding`, above the
  normal Roll/End-turn row.
- Verified all three with direct `Room` unit tests (temporary files,
  deleted before committing): end-turn-before-rolling rejected, succeeds
  and advances the turn after rolling; pay/use-card both correctly clear
  `inHolding`, charge/consume correctly, reject when not applicable; a
  no-bid auction auto-resolves after the base window with the tile
  staying unowned, and a bid placed near the deadline correctly extends it
  rather than letting the auction close mid-exchange (tested against a
  temporary copy of `Room.js` with shortened timer constants, same
  technique used for the disconnect grace window and turn timer in
  earlier passes).

**Why these calls:**
- `playerEndTurn` as a new method rather than just patching the existing
  `endTurn()`: `endTurn()` is also called internally from contexts where
  "did they roll" isn't a meaningful question (kicking a player, the
  stuck-in-holding auto-advance) — conflating the player-initiated action
  with the internal turn-advancement primitive would have meant
  special-casing those internal callers to bypass a check that doesn't
  apply to them, which is more fragile than just having two clearly
  -scoped methods.
- A soft-close timer (extend-on-bid) rather than a hard fixed-length
  countdown: a hard countdown can cut off an active bidding war
  arbitrarily (someone bids at 9.9s, the timer fires at 10s before anyone
  can respond); extending on each bid guarantees the auction only closes
  once bidding has actually gone quiet, which is the behavior actually
  wanted ("don't let it hang forever" without "cut off live bidding").
- Pay/use-card as alternatives that don't themselves roll or move:
  keeping them orthogonal to `rollDice` (just flipping `inHolding` before
  the player's next roll) avoids duplicating any movement/tile-resolution
  logic — the existing `rollDice` path already does the right thing for a
  free player, so freeing them and letting them roll normally costs zero
  new movement code.

**Known gaps left for later:** no minimum bid increment (separate from
the new timer fix); no exact-time preservation for an auction's deadline
across a server restart (same simplification as the turn timer); no
unified UI affordance distinguishing "must act now" from "optional"
states beyond the new holding-pen buttons appearing conditionally.

**State at end of pass:** all three fixes verified via direct `Room` unit
tests (temporary files, deleted before committing — one used a shortened
-constants copy of `Room.js` to avoid a real 10+ second wait); JSX changes
verified via esbuild bundle checks. `systemDesign.md` updated in place —
new method descriptions, a new auction-timer subsection, wire protocol
entries, invariants, and gaps (removed the now-resolved "no time limit on
an individual auction" line, added new ones for the remaining edges of
this pass's fixes).

---

## Pass 11 — 2026-06-29 — Fix: two more instances of the Pass 10 bug pattern

**Goal:** after fixing the extra-rolls bug in Pass 10, the user pushed
back on treating it as a standalone fix and asked me to check for the
underlying pattern elsewhere before moving on. Ran a targeted audit
(stale state used after a side effect; dead/vestigial state; comments
claiming enforcement that isn't real; missing guards between sibling
methods; client buttons offering actions the server would reject) across
`Room.js`, `index.js`, and the client components. Found two real,
confirmed instances of the same root cause; everything else checked out
clean (see below).

**What was found and fixed:**
- **Same bug, one line further down, in the same method.** Pass 10's fix
  set `this.canRollAgain = rolledDoubles && !wasInHolding;` *after*
  `movePlayer(player, steps)` had already run — but `movePlayer` →
  `resolveTile` can itself call `sendToHolding` (landing on the
  `go_to_holding` tile, or certain card effects), which sets
  `player.inHolding = true` as a side effect of that very call. The
  assignment only checked the **pre-move** `wasInHolding` snapshot, not
  the player's actual current state, so a player who rolled doubles and
  happened to land on the "go to Holding" tile that same move would
  wrongly be granted a bonus roll despite now sitting in the Holding Pen.
  Fixed: `this.canRollAgain = rolledDoubles && !wasInHolding &&
  !player.inHolding;` — re-checks the live value instead of trusting the
  snapshot. Verified with a unit test that deliberately positions a
  player one double-roll away from the `go_to_holding` tile: confirms
  they land in the Holding Pen, get no bonus roll, and a further roll
  attempt is correctly rejected.
- **Client trade-tile filter didn't match the server's.** `Trade.jsx`'s
  `tradeableTiles()` filtered only `!owned.houses`, but the server's
  `isTradeable()` (since Pass 6) also requires `!owned.mortgaged`. The
  trade form could show a mortgaged property as selectable; the server
  would always reject offering/requesting it. Fixed by adding the missing
  `!owned.mortgaged` check to match the server's predicate exactly. Also
  corrected `systemDesign.md`'s description of this component, which had
  been inaccurately claiming the client filter already matched the
  server's — it didn't, until now.

**What was checked and ruled out (no fix needed):**
- No other dead/vestigial state: every `this.x =`/`player.x =` assignment
  in `Room.js` is read somewhere, confirmed by grepping the whole repo per
  property name.
- No comments falsely claiming enforcement exists elsewhere (searched for
  "handled client-side", "TODO", "FIXME", etc. — none found making an
  inaccurate claim).
- `buyHouse`/`sellHouse`/`mortgageProperty`/`unmortgageProperty` all
  consistently lack a turn/pendingAction guard — confirmed intentional
  (managing your own properties isn't a turn action, per Pass 6) and
  mutually consistent across all four, not an oversight in one.
- Money-spending actions consistently check funds before deducting;
  money-gaining actions consistently skip that check. No asymmetry.
- All other client button gating either matches server requirements or is
  *more* restrictive than the server (safe direction) — Build/Sell/
  Mortgage/Buy/Decline/Trade/Auction buttons all checked individually.
- `startGame`/`endTurn` enforce their host/turn checks in `index.js`
  rather than inside the `Room` method itself, unlike every other action
  (whose primary guard lives in `Room.js`). Flagged as a structural
  inconsistency in *where* guards live — not a live bug today since
  current callers are all correct, but logged as a gap rather than
  silently left undocumented.

**Why these calls:**
- Treated this as a pattern-hunt, not a second isolated bug report: the
  user's framing ("I don't think this was standalone") was a reasonable
  challenge to the previous pass's confidence, and a targeted sweep for
  the *specific* failure mode (stale state past a side effect) found a
  second real instance in literally the next line of code from the first
  fix — strong evidence the instinct was correct.
- Fixed both confirmed findings rather than just reporting them: both
  were clear-cut bugs with an unambiguous correct behavior (re-check
  current state; match the server's actual predicate), not design
  questions needing a decision.
- Did not "fix" the `startGame`/`endTurn` guard-location inconsistency:
  it's not a live bug (no current caller is wrong), and moving guards
  into `Room.js` would be a structural change affecting `index.js`'s
  responsibilities, not a bug fix — logged as a gap instead.

**Known gaps left for later:** the `startGame`/`endTurn` guard-location
inconsistency noted above (not a live bug, just inconsistent structure);
everything else from prior passes' gap lists remains unchanged.

**State at end of pass:** both fixes verified with direct `Room`/
component-level checks (deterministic dice for the server fix, direct
predicate comparison for the client fix); temporary test file deleted
before committing. `systemDesign.md` updated in place, including
correcting its own previously-inaccurate claim about the trade-tile
filter.

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
