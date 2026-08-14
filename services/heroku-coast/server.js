import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { authorizeSession } from "./session-token.js";
import { CoastError, createCoastRoomStore } from "./room-store.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const enabled = /^(1|true|yes|on)$/i.test(process.env.COAST_TO_COAST_ENABLED || "");
const secret = process.env.SESSION_SECRET || "";
const origins = (process.env.CORS_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
const users = parseUsers(process.env.ALLOWED_USERS_JSON || "[]");
const ttlMs = Number.parseInt(process.env.SESSION_TTL_SECONDS || "21600", 10) * 1000;
const store = createCoastRoomStore({ ttlMs });
const sockets = new Map();
if (!secret) throw new Error("SESSION_SECRET is required.");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(cors({ origin: (origin, cb) => cb(null, !origin || !origins.length || origins.includes(origin)) }));
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.get("/healthz", (_req, res) => res.json({ ok: true, coastToCoastEnabled: enabled, users: users.length, activeRooms: store.size }));
app.post("/api/coast/rooms", auth, gate, route((req, res) => {
  res.status(201).json({ room: store.create({ username: req.user.username, mediaId: req.body?.mediaId }) });
}));
app.post("/api/coast/rooms/:code/join", auth, gate, route((req, res) => {
  res.json({ room: store.join({ code: req.params.code, username: req.user.username }) });
}));
app.delete("/api/coast/rooms/:code", auth, gate, route((req, res) => {
  const result = store.leave({ code: req.params.code, username: req.user.username });
  broadcast(req.params.code, { type: result.ended ? "room-ended" : "peer-left" });
  res.json(result);
}));
app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: error.message || "Unexpected server error." }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
server.on("upgrade", (req, socket, head) => {
  if (!enabled || req.url !== "/ws" || (origins.length && !origins.includes(req.headers.origin))) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});
wss.on("connection", (ws) => {
  const timer = setTimeout(() => ws.close(4001, "Authentication required"), 10000);
  ws.once("message", (raw) => {
    try {
      const message = JSON.parse(raw);
      if (message.type !== "authenticate") throw new Error("Authentication required.");
      const { username } = authorizeSession({ authorization: `Bearer ${message.token || ""}`, sessionSecret: secret, users });
      const room = store.authorize(message.code, username);
      clearTimeout(timer);
      ws.coast = { code: room.code, username, host: username === room.host };
      if (!sockets.has(room.code)) sockets.set(room.code, new Set());
      for (const existing of sockets.get(room.code)) {
        if (existing.coast?.username === username) existing.close(4000, "Connected from another tab.");
      }
      sockets.get(room.code).add(ws);
      ws.send(JSON.stringify({ type: "ready", role: ws.coast.host ? "host" : "guest", participants: sockets.get(room.code).size }));
      broadcast(room.code, { type: "peer-ready", participants: sockets.get(room.code).size }, ws);
      ws.on("message", (data) => relay(ws, data));
      ws.on("close", () => disconnect(ws));
    } catch (error) {
      ws.close(4003, error.message);
    }
  });
});

function relay(ws, raw) {
  try {
    const message = JSON.parse(raw);
    const allowed = ["voice-ready", "offer", "answer", "ice-candidate", "playback"];
    if (!allowed.includes(message.type)) return;
    if (message.type === "playback" && !ws.coast.host) return;
    broadcast(ws.coast.code, message, ws);
  } catch {}
}
function broadcast(code, message, except) {
  for (const ws of sockets.get(String(code).toUpperCase()) || []) {
    if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }
}
function disconnect(ws) {
  const set = sockets.get(ws.coast?.code);
  if (!set) return;
  set.delete(ws);
  broadcast(ws.coast.code, { type: "peer-left", participants: set.size });
  if (!set.size) sockets.delete(ws.coast.code);
}
function auth(req, res, next) {
  try {
    const result = authorizeSession({ authorization: req.headers.authorization, sessionSecret: secret, users });
    req.user = result;
    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({ error: error.message });
  }
}
function gate(_req, res, next) {
  enabled ? next() : res.status(503).json({ enabled: false, error: "Coast to Coast service is not enabled." });
}
function route(fn) {
  return (req, res, next) => { try { fn(req, res); } catch (error) { next(error); } };
}
function parseUsers(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.map((u) => ({ username: String(u.username || "").trim().toLowerCase() })).filter((u) => u.username) : [];
}
server.listen(port, () => console.log(`impala-coast service listening on port ${port}`));
