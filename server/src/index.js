import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { nanoid } from "nanoid";
import { Room, generateRoomCode } from "./game/Room.js";

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

/** @type {Map<string, Room>} */
const rooms = new Map();
const socketToRoom = new Map();
const socketToPlayer = new Map();

function broadcastState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("state", room.toState());
}

function bindSocket(socket, roomCode, playerId) {
  socket.join(roomCode);
  socketToRoom.set(socket.id, roomCode);
  socketToPlayer.set(socket.id, playerId);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }, cb) => {
    const playerId = nanoid();
    const token = nanoid();
    const code = generateRoomCode();
    const room = new Room(code, playerId);
    room.addPlayer(playerId, name || "Player", token);
    rooms.set(code, room);
    bindSocket(socket, code, playerId);
    cb?.({ ok: true, code, playerId, token });
    broadcastState(code);
  });

  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return cb?.({ error: "Room not found" });
    if (room.started) return cb?.({ error: "Game already started" });
    if (room.players.length >= 6) return cb?.({ error: "Room full" });
    const playerId = nanoid();
    const token = nanoid();
    room.addPlayer(playerId, name || "Player", token);
    bindSocket(socket, room.code, playerId);
    cb?.({ ok: true, code: room.code, playerId, token });
    broadcastState(room.code);
  });

  socket.on("rejoinRoom", ({ code, playerId, token }, cb) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return cb?.({ error: "Room not found" });
    if (!room.verifyToken(playerId, token)) return cb?.({ error: "Invalid session" });
    bindSocket(socket, room.code, playerId);
    room.setConnected(playerId, true);
    cb?.({ ok: true, code: room.code, playerId, token });
    broadcastState(room.code);
  });

  socket.on("startGame", () => {
    const room = getRoom(socket);
    const playerId = getPlayerId(socket);
    if (!room || room.hostId !== playerId) return;
    if (room.players.length < 2) return;
    room.start();
    broadcastState(room.code);
  });

  socket.on("rollDice", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.rollDice(getPlayerId(socket));
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

  socket.on("endTurn", () => {
    const room = getRoom(socket);
    if (!room) return;
    const playerId = getPlayerId(socket);
    const player = room.currentPlayer();
    if (!player || player.id !== playerId) return;
    if (room.pendingAction) return;
    room.endTurn();
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
    if (!room.started) {
      // Game hasn't started yet, no reason to hold the seat for a reconnect.
      room.removePlayer(playerId);
      if (room.players.length === 0) {
        rooms.delete(code);
        return;
      }
    } else {
      room.setConnected(playerId, false);
    }
    broadcastState(code);
  });
});

function getRoom(socket) {
  const code = socketToRoom.get(socket.id);
  return code ? rooms.get(code) : null;
}

function getPlayerId(socket) {
  return socketToPlayer.get(socket.id);
}

httpServer.listen(PORT, () => {
  console.log(`Fortune City server listening on port ${PORT}`);
});
