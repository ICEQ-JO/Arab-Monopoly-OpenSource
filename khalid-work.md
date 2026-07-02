# Khalid's Work Log — khalid-pre-main

Summary of everything done on this branch in this working session, in order.
Commits referenced are on `khalid-pre-main`.

## 1. New maps + map picker

- **`server/src/game/boards/worldwide.js`** (new) — 48-tile board, same
  shape and price/rent balance as `classic-vintage.js` (12 tiles/side, 9
  color groups), reskinned continent by continent (Latin America, Oceania,
  Africa, South/East Asia, North America, Mediterranean, Northern Europe,
  Gulf megacities). Airports as the transit tiles. English city names.
- **`server/src/game/boards/middle-east.js`** (redesigned) — expanded from
  24 to 32 tiles, same shape/balance as `eu.js` (8 tiles/side, 8 regional
  groups: Gulf/Hijaz/Najd/Levant/Mesopotamia/Nile/Maghreb/capitals).
  English city names (Doha, Jeddah, Riyadh, Beirut, Baghdad, Cairo,
  Casablanca, Muscat, Kuwait City, etc.).
- **`server/src/game/board.js`** — registered `worldwide` in the `MAPS`
  registry alongside `classic`/`eu`/`middle-east`.
- **`client/src/components/Lobby.jsx`** — added a map picker (2x2 grid of
  cards: Classic / Middle East / Worldwide / Europe) to the room-creation
  flow; selection is sent as `rules.map` on `createRoom`.
- Fixed `.cv2-center` (the title/dice/roll-button box in the middle of the
  board) being off-center on the 32-tile maps — its grid span was
  hardcoded for the 48-tile board's 13-track grid; now computed inline from
  the board's actual track count.

_Commit: "Add Worldwide map, expand Middle East map, add map picker to room
creation"_

## 2. Movement animation smoothing

- Custom cubic-bezier easing per leg (sharp accelerate-in, snappy
  expo-out) instead of generic CSS `ease-in`/`ease-out` keywords.
- Trimmed leg timing (`MS_PER_TILE` 90→70, `LEG_MAX_MS` 900→650).
- Added a brief "landing" transition state so the token eases down from
  its elevated float to idle instead of snapping the instant a move
  finishes (the `--floating` class had a transition in, but removing it
  had none out, so the idle bob animation just cut in instantly).

_Rolled into the same commit as the maps work._

## 3. Building UI + mortgage rendering bugs

- **Building badge**: redesigned from a single icon+count pill to a row of
  individual house icons packed into the tile's own color band from the
  outer corner (one per house, white-on-color for contrast against every
  group color), swapping to a single centered hotel icon at the hotel
  tier. Fixed twice — first pass collided with the price tag/band on
  top/bottom edges (fixed with edge-scoped positioning), second pass the
  hotel-centering override lost to a more-specific CSS rule regardless of
  source order (fixed by matching selector specificity).
- **Mortgaged tile band leak**: `.cv2-band` (the tile's group-color stripe)
  was rendered unconditionally, so a colored strip stayed visible even on
  a mortgaged (greyed-out) tile. Now suppressed whenever
  `owned.mortgaged` is true.
- **Room-code copy button**: `navigator.clipboard` is undefined in
  non-secure contexts (e.g. testing over a plain-http LAN IP instead of
  localhost/https), which silently broke the copy button with no
  fallback. Added a legacy `execCommand("copy")` fallback path.
- **Removed the "Turn Order" sort toggle** from the Players panel (button,
  state, sort logic, and its CSS) per request — it let you re-sort the
  player list by balance, deemed unnecessary.
- Added a dev-only (`import.meta.env.DEV`, stripped from prod builds)
  "Grant Group" button in the pre-game Rules panel to instantly own a full
  color group for testing building/mortgage UI without playing a full game.

_Commit: "Fix building badge, mortgage band leak, room-code copy; remove
Turn Order toggle"_

## 4. Surprise/Treasure card system

- **`server/src/game/cards.js`** — doubled both decks (7→14 cards each)
  with new flavor text. All new cards use only effect types that are safe
  across every board size (relative `move`, `advanceTo` tile 0 only —
  never an absolute tile index that could go out of bounds on the
  32-tile maps). Existing card ids/text/effects were never touched —
  `server/test/cardMove.test.js` forces specific ids to the top of a deck
  deterministically and asserts on their exact text.
- **`server/src/game/Room.js`** — added `cardSeq` (mirrors the existing
  `rollSeq` pattern) so the client can tell "a genuinely new card was just
  drawn" apart from `lastCard` being resent verbatim in later, unrelated
  state broadcasts within the same turn. `lastCard` now also carries
  `playerId`.
- **`client/src/components/CardReveal.jsx`** (new) — a card-reveal popup,
  shown to everyone in the room when a card is drawn: icon, deck label,
  card text, "drawn by" line. Non-interactive and `pointer-events: none`
  on its overlay so it can never block a click on the roll/continue button
  even sitting dead center over the board. Stays open through a movement
  card's confirm step, otherwise auto-dismisses after 3 seconds.
  - First pass was a small top-anchored toast with a generic soft-pastel
    rounded-pill look; redesigned per feedback to be bigger, dead-centered
    on screen, and restyled to match the board's actual vintage theme
    (ivory card stock, thick black border, solid offset shadow, Georgia
    serif, banded header) instead of a generic app-toast look — moved its
    CSS from `App.css` into `classicVintage.css` alongside the board's
    other vintage-themed components (`.pcard-detail`, `.cv2-title`, etc.).
- **"Get Out of Holding Free" is now visually kept, not just logged** — a
  persistent badge in the My Properties panel for as long as
  `player.holdingFreeCard` is true (the flag already existed server-side,
  just had no visual before).
- **Dev test tools**: `Room.debugDrawCard` + a new floating dev-only panel
  (`client/src/components/DevTools.jsx`, bottom-left corner, visible
  during an actual game unlike the pre-game-only Rules-panel dev tools)
  with "Draw Surprise" / "Draw Treasure" buttons. Since a deck is a
  shuffled queue only reshuffled once empty, clicking repeatedly cycles
  through every distinct card in the deck once before repeating — a
  deliberate way to review the whole deck's content, not true-random
  sampling.

_Commit: "Add Surprise/Treasure card-reveal UI and expand deck content",
plus follow-up uncommitted fixes for hotel centering / card-reveal
theming (see below)._

## 5. Start-game icon-selection bug

- The host could previously start the game before every player had
  chosen an on-board icon, leaving latecomers with no token image and no
  distinct board color (icon selection also assigns the player's color).
- **`server/src/game/Room.js`** — added `playerStartGame(playerId)`,
  which enforces host-only / min-2-players / all-active-players-have-an-icon
  before calling the (still rule-free) `start()`. Deliberately not folded
  into `start()` itself, since the test suite's `makeRoom()` helper calls
  `start()` directly without ever picking icons.
- **`server/src/index.js`** — `startGame` handler now goes through
  `playerStartGame` and reports errors back via an ack callback instead of
  silently no-op'ing.
- **`client/src/components/PlayersPanel.jsx`** — the Start Game button is
  now hidden (replaced with a "Waiting for everyone to pick an icon…"
  hint) until every active player has one; also surfaces any server-side
  start error inline.

## Not yet committed as of writing this file

The card-reveal re-theme (item 4's redesign) and the start-game icon fix
(item 5) are implemented and build/test clean but not yet committed —
commit them together as the next step.

## Still open on `to-do.md`

- Add visuals for the remaining three corner tiles (Holding, Rest,
  Go-to-Holding — Start already has something). Same data-driven icon
  pattern as the treasure/surprise tile icons.

Everything else on the original to-do list is done and checked off.
