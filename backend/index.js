import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import axios from "axios";
import Database from "better-sqlite3";

const app = express();

const server = http.createServer(app);
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim())
  : ["http://localhost:5173"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
  },
});

const rooms = new Map();
const allowedLanguages = new Set(["javascript", "python", "java"]);
const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const databasePath =
  process.env.DATABASE_PATH ||
  path.join(backendDirectory, "data", "editor.sqlite");
mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    room_id TEXT PRIMARY KEY,
    code TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const getDocument = database.prepare("SELECT code FROM documents WHERE room_id = ?");
const saveDocument = database.prepare(`
  INSERT INTO documents (room_id, code, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(room_id) DO UPDATE SET
    code = excluded.code,
    updated_at = CURRENT_TIMESTAMP
`);

io.on("connection", (socket) => {
  console.log("Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", (payload = {}, acknowledge) => {
    const roomId = typeof payload.roomId === "string" ? payload.roomId.trim() : "";
    const userName = typeof payload.userName === "string" ? payload.userName.trim() : "";

    if (!roomId || roomId.length > 128 || !userName || userName.length > 40) {
      acknowledge?.({
        error: "Enter a room name and username within the allowed length.",
      });
      return;
    }

    if (currentRoom) {
      socket.leave(currentRoom);
      const previousRoom = rooms.get(currentRoom);
      previousRoom?.users.delete(currentUser);
      if (previousRoom) {
        io.to(currentRoom).emit("userJoined", Array.from(previousRoom.users));
      }
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      const savedDocument = getDocument.get(roomId);
      rooms.set(roomId, { users: new Set(), code: savedDocument?.code ?? "" });
    }

    rooms.get(roomId).users.add(userName);

    socket.emit("codeUpdate", rooms.get(roomId).code);

    io.to(roomId).emit("userJoined", Array.from(rooms.get(currentRoom).users));
    acknowledge?.({ ok: true });
  });

  socket.on("codeChange", (payload = {}) => {
    if (!currentRoom || typeof payload.code !== "string" || payload.code.length > 500_000) {
      return;
    }

    rooms.get(currentRoom).code = payload.code;
    saveDocument.run(currentRoom, payload.code);
    socket.to(currentRoom).emit("codeUpdate", payload.code);
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser) {
      const room = rooms.get(currentRoom);
      room?.users.delete(currentUser);
      if (room) {
        io.to(currentRoom).emit("userJoined", Array.from(room.users));
      }

      socket.leave(currentRoom);

      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("typing", () => {
    if (currentRoom && currentUser) {
      socket.to(currentRoom).emit("userTyping", currentUser);
    }
  });

  socket.on("languageChange", (payload = {}) => {
    if (currentRoom && allowedLanguages.has(payload.language)) {
      io.to(currentRoom).emit("languageUpdate", payload.language);
    }
  });

  socket.on(
    "compileCode",
    async (payload = {}) => {
      const { code, language, version, input } = payload;
      const roomId = currentRoom;
      if (
        roomId &&
        typeof code === "string" &&
        code.length <= 100_000 &&
        allowedLanguages.has(language) &&
        typeof version === "string" &&
        typeof input === "string" &&
        input.length <= 100_000
      ) {
        const response = await axios.post(
          "https://emkc.org/api/v2/piston/execute",
          {
            language,
            version,
            files: [
              {
                content: code,
              },
            ],
            stdin: input,
          },
          { timeout: 15_000 }
        );

        io.to(roomId).emit("codeResponse", response.data);
      }
    }
  );

  socket.on("disconnect", () => {
    if (currentRoom && currentUser) {
      const room = rooms.get(currentRoom);
      room?.users.delete(currentUser);
      if (room) {
        io.to(currentRoom).emit("userJoined", Array.from(room.users));
      }
    }
    console.log("Disconnected", socket.id);
  });
});

const port = process.env.PORT || 5000;

const projectDirectory = path.resolve(backendDirectory, "..");

app.use(express.static(path.join(projectDirectory, "frontend", "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(projectDirectory, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log(`server listening on port ${port}`);
});
