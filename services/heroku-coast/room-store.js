import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class CoastError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function createCoastRoomStore(options = {}) {
  const rooms = new Map();
  const now = options.now || (() => Date.now());
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const ttlMs = Math.min(Number(options.ttlMs) || 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000);

  function sweep() {
    const time = now();
    for (const [code, room] of rooms) if (room.expiresAtMs <= time) rooms.delete(code);
  }

  function requireRoom(code) {
    sweep();
    const room = rooms.get(String(code || "").trim().toUpperCase());
    if (!room) throw new CoastError(404, "Coast to Coast room was not found or has expired.");
    return room;
  }

  function create({ username, mediaId }) {
    sweep();
    const host = normalize(username);
    const media = String(mediaId || "").trim().slice(0, 1024);
    if (!host || !media) throw new CoastError(400, "A host and shared-library video are required.");
    let code;
    do {
      code = `COAST-${[...randomBytes(5)].map((byte) => ALPHABET[byte % ALPHABET.length]).join("")}`;
    } while (rooms.has(code));
    const createdAtMs = now();
    const room = { code, host, guest: "", mediaId: media, createdAtMs, expiresAtMs: createdAtMs + ttlMs };
    rooms.set(code, room);
    return publicRoom(room);
  }

  function join({ code, username }) {
    const room = requireRoom(code);
    const user = normalize(username);
    if (!user) throw new CoastError(400, "A participant is required.");
    if (user !== room.host && room.guest && room.guest !== user) {
      throw new CoastError(409, "This private Coast to Coast room already has two people.");
    }
    if (user !== room.host) room.guest = user;
    return publicRoom(room);
  }

  function authorize(code, username) {
    const room = requireRoom(code);
    const user = normalize(username);
    if (user !== room.host && user !== room.guest) throw new CoastError(403, "Join this room before connecting.");
    return room;
  }

  function leave({ code, username }) {
    const room = authorize(code, username);
    const user = normalize(username);
    if (user === room.host) {
      rooms.delete(room.code);
      return { ended: true };
    }
    room.guest = "";
    return { ended: false };
  }

  return { create, join, authorize, leave, sweep, get size() { sweep(); return rooms.size; } };
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().slice(0, 120);
}

function publicRoom(room) {
  return {
    code: room.code,
    mediaId: room.mediaId,
    role: undefined,
    participants: room.guest ? 2 : 1,
    expiresAt: new Date(room.expiresAtMs).toISOString()
  };
}
