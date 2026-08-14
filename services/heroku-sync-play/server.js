import { createSyncPlayApp } from "./app.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const sessionTtlSeconds = Number.parseInt(process.env.SESSION_TTL_SECONDS || "21600", 10);

const app = createSyncPlayApp({
  sessionSecret: process.env.SESSION_SECRET || "",
  syncPlayEnabled: parseBooleanEnv(process.env.SYNC_PLAY_ENABLED, false),
  allowedOrigins: parseAllowedOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || ""),
  users: parseUsers(process.env.ALLOWED_USERS_JSON || "[]"),
  sessionTtlMs: sessionTtlSeconds * 1000
});

app.listen(port, () => {
  console.log(`impala-sync-play service listening on port ${port}`);
});

function parseBooleanEnv(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return fallback;
  const value = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function parseAllowedOrigins(rawValue) {
  return String(rawValue || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function parseUsers(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((user) => ({ username: String(user.username || "").trim().toLowerCase() }))
      .filter((user) => user.username);
  } catch (error) {
    throw new Error(`Unable to parse ALLOWED_USERS_JSON: ${error.message}`);
  }
}
