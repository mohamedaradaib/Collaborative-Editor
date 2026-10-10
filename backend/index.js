import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import Database from "better-sqlite3";
import * as Y from "yjs";

const app = express();

const server = http.createServer(app);
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim())
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
  },
});

const rooms = new Map();
const allowedLanguages = new Set(["javascript"]);
const pistonExecuteUrl =
  process.env.PISTON_API_URL || "https://emkc.org/api/v2/piston/execute";
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
    language TEXT NOT NULL DEFAULT 'javascript',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
const documentColumns = database.pragma("table_info(documents)");
if (!documentColumns.some((column) => column.name === "language")) {
  database.exec("ALTER TABLE documents ADD COLUMN language TEXT NOT NULL DEFAULT 'javascript'");
}
const getDocument = database.prepare(
  "SELECT code, language FROM documents WHERE room_id = ?"
);
const saveDocument = database.prepare(`
  INSERT INTO documents (room_id, code, language, updated_at)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(room_id) DO UPDATE SET
    code = excluded.code,
    updated_at = CURRENT_TIMESTAMP
`);
const saveLanguage = database.prepare(`
  INSERT INTO documents (room_id, language)
  VALUES (?, ?)
  ON CONFLICT(room_id) DO UPDATE SET
    language = excluded.language,
    updated_at = CURRENT_TIMESTAMP
`);

const createRoom = (savedDocument) => {
  const doc = new Y.Doc();
  const source = doc.getText("source");
  if (savedDocument?.code) {
    source.insert(0, savedDocument.code);
  }

  return {
    users: new Set(),
    doc,
    language: allowedLanguages.has(savedDocument?.language)
      ? savedDocument.language
      : "javascript",
  };
};

io.on("connection", (socket) => {
  console.log("Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;
  let lastExecutionAt = 0;

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
      rooms.set(roomId, createRoom(savedDocument));
    }

    const room = rooms.get(roomId);
    room.users.add(userName);

    socket.emit("documentState", Y.encodeStateAsUpdate(room.doc));
    socket.emit("languageUpdate", room.language);

    io.to(roomId).emit("userJoined", Array.from(rooms.get(currentRoom).users));
    acknowledge?.({ ok: true });
  });

  socket.on("documentUpdate", (payload = {}) => {
    const room = currentRoom && rooms.get(currentRoom);
    if (
      !room ||
      !(payload.update instanceof Uint8Array) ||
      payload.update.byteLength > 750_000
    ) {
      return;
    }

    try {
      Y.applyUpdate(room.doc, payload.update);
    } catch {
      return;
    }

    saveDocument.run(
      currentRoom,
      room.doc.getText("source").toString(),
      room.language
    );
    socket.to(currentRoom).emit("documentUpdate", payload.update);
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
      const room = rooms.get(currentRoom);
      room.language = payload.language;
      saveLanguage.run(currentRoom, payload.language);
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
        const now = Date.now();
        const cooldownMs = 2_000;
        if (now - lastExecutionAt < cooldownMs) {
          socket.emit("executionError", "Please wait a moment before running code again.");
          return;
        }
        lastExecutionAt = now;

        try {
          const response = await fetch(pistonExecuteUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language,
              version,
              files: [{ content: code }],
              stdin: input,
            }),
            signal: AbortSignal.timeout(15_000),
          });

          if (!response.ok) {
            throw new Error(`Piston request failed with status ${response.status}`);
          }

          io.to(roomId).emit("codeResponse", await response.json());
        } catch {
          socket.emit("executionError", "The code execution service is unavailable. Please try again.");
        }
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
