import { readFileSync } from "node:fs";
import { createLiveStreamApp } from "./app.js";
import { sanitizeStreamCatalog } from "./stream-catalog.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const sessionSecret = process.env.SESSION_SECRET || "";
const liveStreamEnabled = parseBooleanEnv(process.env.LIVE_STREAM_ENABLED, false);
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "");
const users = parseUsers(process.env.ALLOWED_USERS_JSON || "[]");
const streamCatalog = loadStreamCatalog();

const app = createLiveStreamApp({
  sessionSecret,
  liveStreamEnabled,
  allowedOrigins,
  users,
  streamCatalog
});

app.listen(port, () => {
  console.log(`impala-live-stream service listening on port ${port}`);
});

function parseBooleanEnv(rawValue, fallback = false) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseAllowedOrigins(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseUsers(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((user) => ({
        username: String(user.username || "").trim().toLowerCase(),
        isAdmin: user.isAdmin === true
      }))
      .filter((user) => user.username);
  } catch (error) {
    throw new Error(`Unable to parse ALLOWED_USERS_JSON: ${error.message}`);
  }
}

function loadStreamCatalog() {
  const catalogPath = new URL("./streams.json", import.meta.url);
  try {
    const rawCatalog = readFileSync(catalogPath, "utf8");
    return sanitizeStreamCatalog(JSON.parse(rawCatalog));
  } catch (error) {
    throw new Error(`Unable to load streams.json: ${error.message}`);
  }
}
