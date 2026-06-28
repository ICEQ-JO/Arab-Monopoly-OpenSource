# Fortune City

A real-time multiplayer property-trading board game (original theme, inspired by the genre of games like RichUp/Monopoly — no assets or text copied from any existing game).

## Stack
- `server/` — Node.js + Express + Socket.io, holds all game state/logic (`server/src/game/Room.js`, `board.js`, `cards.js`)
- `client/` — React + Vite, connects via `socket.io-client`

## Running locally

In two terminals:

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

Open `http://localhost:5173` in two or more browser tabs/devices, create a room in one, and join with the room code from the others.

## Game features implemented
- Room create/join via 6-character codes, up to 6 players
- 32-tile board with 8 color groups, transit stops, utilities, taxes
- Turn flow: roll dice, move, auto-resolve tile (buy prompt, rent, tax, cards)
- "Surprise" and "Treasure" card decks with varied effects
- Holding Pen (jail-equivalent) with doubles-to-escape / 3-turn cap
- Buying houses/hotels once a full color group is owned, rent scaling, monopoly doubling
- Bankruptcy detection and single-winner end condition
- Live state sync to all clients in a room over Socket.io

## Not yet implemented (good next steps)
- Player-to-player trading
- Mortgaging properties
- Auctions when a player declines to buy
- Persistent rooms (currently in-memory, reset on server restart)
- Reconnect handling (a refresh currently drops you from the room)
