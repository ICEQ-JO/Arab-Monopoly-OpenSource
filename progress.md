# Progress Log — Fortune City

Append-only log, one entry per work pass. Newest entry on top. Each entry
should say what was done and **why**, not just what files changed — for the
*what changed* see git history / diffs once this is under version control.

If the architecture itself changed, also update [systemDesign.md](systemDesign.md)
in the same pass.

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
