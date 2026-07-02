# Monoboly عرب (Arab Monopoly)

A real-time multiplayer property-trading board game (original theme, inspired by the genre of games like RichUp/Monopoly — no assets or text copied from any existing game).

**Status: actively developed, feature-complete core loop.** Trading,
auctions, mortgaging, building, the Holding Pen, and Surprise/Treasure
cards have all been through multiple real playtests, not just isolated
testing. Bugs found along the way are fixed; see [progress.md](progress.md)
for the full pass-by-pass history and [systemDesign.md](systemDesign.md)
for the current architecture, wire protocol, and known gaps.

## Stack
- `server/` — Node.js + Express + Socket.io, holds all game state/logic (`server/src/game/Room.js`, `board.js`, `cards.js`)
- `client/` — React + Vite, connects via `socket.io-client`

## Running locally

**Playtesting (single URL, recommended):** the server can serve the
client's production build directly, so the whole game is reachable on one
port with no separate dev server or CORS setup.

```bash
cd client
npm install
npm run build      # writes client/dist

cd ../server
npm install
npm run start       # http://localhost:4000 -- serves the built client too
```

Open `http://localhost:4000` in two or more browser tabs/devices (use
genuinely different browsers, not two windows of the same one — see
"Local testing gotcha" below), create a room in one, and join with the room
code from the others. If you change any client file, re-run `npm run build`
in `client/` before restarting the server, or it'll keep serving the old
bundle.

**Active development (hot reload):** in two terminals instead —

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
second window will silently rejoin as the *same* player instead of letting
you join fresh as a second one. Use two different browsers (e.g. Chrome +
Firefox) to test multiple players on one machine.

## Game features implemented
- Room create/join via 6-character codes, up to 6 players; host
  reassignment if the host leaves
- Four selectable boards, picked at room creation: Classic (48 tiles, the
  original Arab-themed board), Worldwide (48 tiles, cities across every
  continent), Middle East (32 tiles, Gulf-to-Maghreb), and Europe (32
  tiles, European capitals) — all data-driven off the same board renderer
- Persistent rooms — survive a server restart (`server/data/rooms.json`)
- Disconnect grace window (20s to reconnect before losing your seat) and a
  hard 4-minute per-turn timer, both server-enforced
- Turn flow: roll dice, move, auto-resolve tile (buy prompt, rent, tax,
  cards); doubles grant a bonus roll, three doubles in a row sends you to
  the Holding Pen
- "Surprise" and "Treasure" card decks (14 cards each) with a card-reveal
  UI shown to the whole room; movement cards pause for an explicit
  confirmation before actually moving you, and a drawn "Get Out of Holding
  Free" card is visibly kept until used
- Holding Pen (jail-equivalent): doubles-to-escape, a 3-turn cap with a
  forced-pay escape, voluntary pay-to-leave, and Get Out of Jail Free cards
- Buying houses/hotels once a full color group is owned (and selling them
  back down), rent scaling, monopoly doubling
- Mortgaging and unmortgaging properties (with interest) for cash on hand
- Auctions when a player declines to buy, with a soft-close timer so
  bidding can't hang open forever
- Player-to-player trading, including counter-offers
- Bankruptcy is deferred to the end of the player's own turn rather than
  triggered the instant a balance goes negative — giving them a real
  chance to mortgage, sell, or trade their way back to solvent first
- Live state sync to all clients in a room over Socket.io
