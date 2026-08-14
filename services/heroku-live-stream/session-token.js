import crypto from "node:crypto";

export class ImpalaAuthError extends Error {
  constructor(statusCode, publicMessage, detail = "") {
    super(detail || publicMessage);
    this.name = "ImpalaAuthError";
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

export function createSessionToken(payload, sessionSecret) {
  requireSecret(sessionSecret);
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signValue(encodedPayload, sessionSecret)}`;
}

export function verifySessionToken(token, sessionSecret, options = {}) {
  requireSecret(sessionSecret);
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw invalidSession("Malformed token.");
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signValue(encodedPayload, sessionSecret);
  if (
    providedSignature.length !== expectedSignature.length
    || !crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))
  ) {
    throw invalidSession("Invalid token signature.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch (_error) {
    throw invalidSession("Invalid token payload.");
  }

  const expiresAt = payload?.expiresAt || payload?.exp;
  const expiryTime = Date.parse(expiresAt);
  const now = typeof options.now === "function" ? options.now() : Date.now();
  if (!expiresAt || !Number.isFinite(expiryTime) || expiryTime <= now) {
    throw invalidSession("Session expired.");
  }

  const username = normalizeUsername(payload.username || payload.sub);
  if (!username) throw invalidSession("Session user is missing.");

  return {
    ...payload,
    username,
    expiresAt
  };
}

export function authorizeSession({ authorization, sessionSecret, users, now } = {}) {
  const token = extractBearerToken(authorization);
  const payload = verifySessionToken(token, sessionSecret, { now });
  const configuredUsers = Array.isArray(users) ? users : [];
  const configuredUser = configuredUsers.find(
    (user) => normalizeUsername(user?.username) === payload.username
  );

  if (!configuredUser) {
    throw new ImpalaAuthError(403, "User is not authorized.", "User is not on the active allow-list.");
  }

  return {
    payload,
    configuredUser,
    username: payload.username
  };
}

export function extractBearerToken(authorization) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(authorization || "").trim());
  if (!match) {
    throw new ImpalaAuthError(401, "Authentication required.", "Bearer token is missing.");
  }
  return match[1];
}

export function sendAuthError(response, error) {
  const statusCode = error instanceof ImpalaAuthError ? error.statusCode : 401;
  const message = error instanceof ImpalaAuthError ? error.publicMessage : "Invalid session.";
  response.status(statusCode).json({ error: message });
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function signValue(value, sessionSecret) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function requireSecret(sessionSecret) {
  if (!String(sessionSecret || "")) {
    throw new Error("SESSION_SECRET is required.");
  }
}

function invalidSession(detail) {
  return new ImpalaAuthError(401, "Invalid session.", detail);
}
