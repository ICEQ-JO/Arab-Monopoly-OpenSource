# 🎲 Monoboly عرب (Arab Monopoly)

Real-time multiplayer property trading, dice-rolling, rent-collecting,
friendship-ending chaos, all in your browser, with your friends, for free.

Inspired by the genre of games like Monopoly/RichUp (original theme, no
assets or text copied from any existing game; we drew our own maps and
wrote our own flavor text, we're not trying to get a strongly-worded
letter from a toy company's legal department).

Buy Kuwait City. Bankrupt your cousin. Land on a Surprise card that sends
you straight to the Holding Pen for absolutely no reason. Refuse to trade
that one property everyone needs even though you're never going to use
it. You know the drill.

## Why this even exists

We just wanted to play Arab Monopoly online with our friends, and
couldn't find anywhere to actually do that with rules we actually liked.
So we built one. That's genuinely the whole origin story: three friends,
a shared annoyance, and way too many late nights arguing over rent prices
and whether a hotel icon looked centered enough. No grand business plan,
no funding, just a game we wanted to exist.

**Status: actively developed, feature-complete core loop.** Trading,
auctions, mortgaging, building, the Holding Pen, and Surprise/Treasure
cards have all survived multiple real playtests with actual humans
yelling at each other, not just isolated unit tests. See
[progress.md](progress.md) for the full pass-by-pass history and
[systemDesign.md](systemDesign.md) for the architecture, wire protocol,
and known gaps.

## What you actually get

- 🗺️ **Four boards**, pick one when you create a room:
  - **Classic** (48 tiles): the original Arab-themed board
  - **Worldwide** (48 tiles): a round-the-globe trip from Rio to Dubai
  - **Middle East** (32 tiles): Gulf to Maghreb
  - **Europe** (32 tiles): European capitals
  - All four are rendered by the exact same board component off pure
    data, so nobody had to hand-draw four different UIs
- 🎲 Full turn flow: roll, move, auto-resolve whatever you land on (buy
  prompt, rent, tax, cards), doubles earn a bonus roll, three doubles in a
  row lands you in the Holding Pen (you brought this on yourself)
- 🃏 "Surprise" and "Treasure" decks (14 cards each) with an actual
  card-reveal popup the whole room sees, no more squinting at a log line
  to find out you just paid a parking fine
- ⛓️ The Holding Pen: escape via doubles, a forced-pay cap after 3 turns,
  voluntary pay-to-leave, or a kept "Get Out Free" card if you're holding one
- 🏠 Houses and hotels, rent scaling, monopoly doubling, mortgaging (with
  interest) when you're short on cash
- 🔨 Auctions when someone declines to buy, with a soft-close timer so
  bidding wars can't camp open forever
- 🤝 Player-to-player trading, counter-offers included
- 💸 Bankruptcy is only checked at the end of *your own* turn, so a bad
  roll gives you a real shot at mortgaging/selling/trading your way back
  before it's game over
- 🔌 Disconnect grace window and persistent rooms that survive a server
  restart, so one flaky wifi connection doesn't end the game for everyone

## 🚧 Coming soon

- **Characters mode**: pick a character before the game starts, each with
  their own ability that bends the normal rules in your favor (or someone
  else's, if it's that kind of ability). Still designing this, but it's
  next.
- **A modified Monopoly ruleset**: our own house rules turned into an
  actual selectable mode, not just something we argue about at 2am. Think
  of it as the "we've been playing this too long and have opinions"
  version of the game.

Nothing here yet, just letting you know it's on the way.

## Stack

- `server/`: Node.js + Express + Socket.io. All game state and rules
  logic lives here (`server/src/game/Room.js`, `board.js`, `cards.js`).
  The client never decides anything, it just renders what the server says
  happened.
- `client/`: React + Vite, talks to the server over `socket.io-client`.

## Running it locally

**Playtesting (single URL, recommended):** the server can serve the
client's production build directly, so the whole game lives on one port.
No separate dev server, no CORS headaches.

```bash
cd client
npm install
npm run build      # writes client/dist

cd ../server
npm install
npm run start       # http://localhost:4000 -- serves the built client too
```

Open `http://localhost:4000` in two or more browser tabs/devices (use
genuinely different browsers, not two windows of the same one, see "Local
testing gotcha" below), create a room in one, and join with the room code
from the others. If you change any client file, re-run `npm run build` in
`client/` before restarting the server, or it'll keep serving the old
bundle and you'll wonder why your fix "isn't working."

**Active development (hot reload):** two terminals instead.

```bash
cd server
npm install
npm run dev      # http://localhost:4000
```

```bash
cd client
npm install
npm run dev       # http://localhost:5173
```

Open `http://localhost:5173` for this mode instead of port 4000.

### Local testing gotcha

Two windows of the *same* browser (including two incognito windows from
the same incognito session) share one `localStorage` partition. The app
saves your session there to support reconnecting after a refresh, so a
second window will silently rejoin as the *same* player instead of
letting you join fresh as a second one, and then you'll spend ten minutes
wondering why "player 2" keeps stealing player 1's money. Use two
different browsers (e.g. Chrome and Firefox) to test multiple players on
one machine.

## Who built this

- **Khalid Khudari**
- **Mohamad Muhaisen**
- **Ameen Alrawabdeh**

Three friends, one repo, zero funding, and a lot of arguing about whether
the hotel icon was centered.

## Contributing

New work should branch off the tip of `main`. Run `npm test` in `server/`
before opening a PR, there's a real regression suite in there, use it.

## License

MIT, see [LICENSE](LICENSE). Clone it, fork it, host it for your own
friend group, whatever. Just don't try to sue us if your friendship
doesn't survive a rent payment.
