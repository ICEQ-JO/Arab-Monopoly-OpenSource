import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { Room, generateRoomCode } from "./game/Room.js";
import { loadSnapshots, saveSnapshots } from "./persistence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// If the client has been built (npm run build in client/), serve it directly so
// the whole game is reachable on this one port/origin -- no separate client dev
// server or CORS setup needed, and only one URL to tunnel/share for playtesting.
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/health).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  console.log(`Serving built client from ${clientDist}`);
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

/** @type {Map<string, Room>} */
const rooms = new Map();
const socketToRoom = new Map();
const socketToPlayer = new Map();

// Restore any rooms that were active when the server last shut down. A bad/missing
// file just means an empty object -- nothing to restore, normal cold start.
for (const snapshot of Object.values(loadSnapshots())) {
  try {
    const room = Room.fromSnapshot(snapshot);
    room.notify = () => broadcastState(room.code);
    rooms.set(room.code, room);
  } catch (err) {
    console.error(`Failed to restore room ${snapshot?.code}:`, err.message);
  }
}
if (rooms.size > 0) {
  console.log(`Restored ${rooms.size} room(s) from disk.`);
}

function persistRooms() {
  const snapshots = {};
  for (const [code, room] of rooms) snapshots[code] = room.toSnapshot();
  saveSnapshots(snapshots);
}

function broadcastState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("state", room.toState());
  persistRooms();
}

function bindSocket(socket, roomCode, playerId) {
  socket.join(roomCode);
  socketToRoom.set(socket.id, roomCode);
  socketToPlayer.set(socket.id, playerId);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ gameMode, mapType, name, color, rules } = {}, cb) => {
    const playerId = nanoid();
    const token = nanoid();
    const code = generateRoomCode();
    const room = new Room(code, playerId, gameMode || "normal", mapType || "fortune-city");
    room.notify = () => broadcastState(code);
    room.addPlayer(playerId, token, name, color);
    if (rules) room.updateSettings(playerId, { rules });
    rooms.set(code, room);
    bindSocket(socket, code, playerId);
    cb?.({ ok: true, code, playerId, token });
    broadcastState(code);
  });

  socket.on("joinRoom", ({ code, name, color }, cb) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return cb?.({ error: "Room not found" });
    if (room.started) return cb?.({ error: "Game already started" });
    if (room.players.length >= 6) return cb?.({ error: "Room full" });
    const playerId = nanoid();
    const token = nanoid();
    room.addPlayer(playerId, token, name, color);
    bindSocket(socket, room.code, playerId);
    cb?.({ ok: true, code: room.code, playerId, token });
    broadcastState(room.code);
  });

  socket.on("rejoinRoom", ({ code, playerId, token }, cb) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return cb?.({ error: "Room not found" });
    if (!room.verifyToken(playerId, token)) return cb?.({ error: "Invalid session" });
    const player = room.playerById(playerId);
    if (player.left || player.bankrupt) return cb?.({ error: "You were removed from this game" });
    bindSocket(socket, room.code, playerId);
    room.cancelGracePeriod(playerId);
    cb?.({ ok: true, code: room.code, playerId, token });
    broadcastState(room.code);
  });

  socket.on("leaveRoom", () => {
    const room = getRoom(socket);
    const playerId = getPlayerId(socket);
    if (!room || !playerId) return;
    if (room.started) {
      room.kickPlayer(playerId, "left the game");
    } else {
      room.removePlayer(playerId);
    }
    socket.leave(room.code);
    socketToRoom.delete(socket.id);
    socketToPlayer.delete(socket.id);
    cleanupIfDone(room);
  });

  socket.on("startGame", () => {
    const room = getRoom(socket);
    const playerId = getPlayerId(socket);
    if (!room || room.hostId !== playerId) return;
    if (room.players.length < 2) return;
    if (room.gameMode === "characters") {
      const unselected = room.players.filter((p) => !room.characterSelections[p.id]);
      if (unselected.length > 0) return;
    }
    room.start();
    broadcastState(room.code);
  });

  socket.on("updateRoomSettings", (payload, cb) => {
    const room = getRoom(socket);
    if (!room) return cb?.({ error: "Room not found" });
    const result = room.updateSettings(getPlayerId(socket), payload || {});
    if (result.ok) broadcastState(room.code);
    cb?.(result);
  });

  socket.on("selectCharacter", ({ characterId }, cb) => {
    const room = getRoom(socket);
    if (!room) return cb?.({ error: "Room not found" });
    const result = room.selectCharacter(getPlayerId(socket), characterId);
    if (result.ok) broadcastState(room.code);
    cb?.(result);
  });

  socket.on("resetCharacterSelections", () => {
    const room = getRoom(socket);
    if (!room) return;
    const result = room.resetCharacterSelections(getPlayerId(socket));
    if (result.ok) broadcastState(room.code);
  });

  socket.on("rollDice", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.rollDice(getPlayerId(socket));
    broadcastState(room.code);
  });

  socket.on("payToLeaveHolding", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.payToLeaveHolding(getPlayerId(socket));
    broadcastState(room.code);
  });

  socket.on("useHoldingFreeCard", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.useHoldingFreeCard(getPlayerId(socket));
    broadcastState(room.code);
  });

  socket.on("confirmCardMove", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.confirmCardMove(getPlayerId(socket));
    broadcastState(room.code);
  });

  socket.on("buyProperty", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.buyProperty(getPlayerId(socket));
    broadcastState(room.code);
  });

  socket.on("declineBuy", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.declineBuy(getPlayerId(socket));
    broadcastState(room.code);
  });

  socket.on("buyHouse", ({ tileId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.buyHouse(getPlayerId(socket), tileId);
    broadcastState(room.code);
  });

  socket.on("sellHouse", ({ tileId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.sellHouse(getPlayerId(socket), tileId);
    broadcastState(room.code);
  });

  socket.on("mortgageProperty", ({ tileId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.mortgageProperty(getPlayerId(socket), tileId);
    broadcastState(room.code);
  });

  socket.on("unmortgageProperty", ({ tileId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.unmortgageProperty(getPlayerId(socket), tileId);
    broadcastState(room.code);
  });

  socket.on("placeBid", ({ auctionId, amount }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.placeBid(getPlayerId(socket), auctionId, amount);
    broadcastState(room.code);
  });

  socket.on("passAuction", ({ auctionId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.passAuction(getPlayerId(socket), auctionId);
    broadcastState(room.code);
  });

  socket.on("proposeTrade", (payload, cb) => {
    const room = getRoom(socket);
    if (!room) return cb?.({ error: "Room not found" });
    const result = room.proposeTrade(getPlayerId(socket), payload || {});
    broadcastState(room.code);
    cb?.(result);
  });

  socket.on("respondTrade", ({ tradeId, accept }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.respondTrade(getPlayerId(socket), tradeId, !!accept);
    broadcastState(room.code);
  });

  socket.on("counterTrade", ({ tradeId, ...payload }, cb) => {
    const room = getRoom(socket);
    if (!room) return cb?.({ error: "Room not found" });
    const result = room.counterTrade(getPlayerId(socket), tradeId, payload || {});
    broadcastState(room.code);
    cb?.(result);
  });

  socket.on("cancelTrade", ({ tradeId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.cancelTrade(getPlayerId(socket), tradeId);
    broadcastState(room.code);
  });

  socket.on("endTurn", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.playerEndTurn(getPlayerId(socket));
    broadcastState(room.code);
  });

  socket.on("disconnect", () => {
    const code = socketToRoom.get(socket.id);
    const playerId = socketToPlayer.get(socket.id);
    socketToRoom.delete(socket.id);
    socketToPlayer.delete(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (room.started) {
      // A 20s grace window to reconnect before the seat is forfeited -- see Room.startGracePeriod.
      room.startGracePeriod(playerId);
    } else {
      room.removePlayer(playerId);
    }
    cleanupIfDone(room);
  });
});

function getRoom(socket) {
  const code = socketToRoom.get(socket.id);
  return code ? rooms.get(code) : null;
}

function getPlayerId(socket) {
  return socketToPlayer.get(socket.id);
}

// Drops the room from memory once nobody is left to play (lobby emptied out,
// or every player has been kicked/left/gone bankrupt mid-game).
function cleanupIfDone(room) {
  const allDone = room.players.length === 0 || room.players.every((p) => p.bankrupt || p.left);
  if (allDone) {
    room.clearTurnTimer();
    room.clearAllAuctionTimers();
    rooms.delete(room.code);
    persistRooms();
  } else {
    broadcastState(room.code);
  }
}

httpServer.listen(PORT, () => {
  console.log(`Fortune City server listening on port ${PORT}`);
});

// Every state-changing event already persists synchronously via broadcastState,
// so there's no real "unsaved changes" window -- this is just an explicit final
// flush before exiting on a clean shutdown (e.g. a deploy restart).
function shutdown() {
  persistRooms();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
