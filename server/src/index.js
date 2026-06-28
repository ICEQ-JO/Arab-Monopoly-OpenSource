import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
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

function broadcastState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("state", room.toState());
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }, cb) => {
    const code = generateRoomCode();
    const room = new Room(code, socket.id);
    room.addPlayer(socket.id, name || "Player");
    rooms.set(code, room);
    socket.join(code);
    socketToRoom.set(socket.id, code);
    cb?.({ ok: true, code });
    broadcastState(code);
  });

  socket.on("joinRoom", ({ code, name }, cb) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room) return cb?.({ error: "Room not found" });
    if (room.started) return cb?.({ error: "Game already started" });
    if (room.players.length >= 6) return cb?.({ error: "Room full" });
    room.addPlayer(socket.id, name || "Player");
    socket.join(room.code);
    socketToRoom.set(socket.id, room.code);
    cb?.({ ok: true, code: room.code });
    broadcastState(room.code);
  });

  socket.on("startGame", () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return;
    room.start();
    broadcastState(room.code);
  });

  socket.on("rollDice", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.rollDice(socket.id);
    broadcastState(room.code);
  });

  socket.on("buyProperty", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.buyProperty(socket.id);
    broadcastState(room.code);
  });

  socket.on("declineBuy", () => {
    const room = getRoom(socket);
    if (!room) return;
    room.declineBuy(socket.id);
    broadcastState(room.code);
  });

  socket.on("buyHouse", ({ tileId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.buyHouse(socket.id, tileId);
    broadcastState(room.code);
  });

  socket.on("endTurn", () => {
    const room = getRoom(socket);
    if (!room) return;
    const player = room.currentPlayer();
    if (!player || player.id !== socket.id) return;
    if (room.pendingAction) return;
    room.endTurn();
    broadcastState(room.code);
  });

  socket.on("disconnect", () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.removePlayer(socket.id);
    socketToRoom.delete(socket.id);
    if (room.players.length === 0) {
      rooms.delete(code);
    } else {
      broadcastState(code);
    }
  });
});

function getRoom(socket) {
  const code = socketToRoom.get(socket.id);
  return code ? rooms.get(code) : null;
}

httpServer.listen(PORT, () => {
  console.log(`Fortune City server listening on port ${PORT}`);
});
