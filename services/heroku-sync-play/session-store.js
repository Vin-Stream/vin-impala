import crypto from "node:crypto";

const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_POSITION_SECONDS = 7 * 24 * 60 * 60;

export function createSyncSessionStore(options = {}) {
  const sessions = new Map();
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const sessionTtlMs = normalizeTtl(options.sessionTtlMs);

  function createSession({ hostUsername, mediaId, controlMode = "host" } = {}) {
    removeExpiredSessions();
    const host = normalizeUsername(hostUsername);
    const normalizedMediaId = normalizeMediaId(mediaId);
    const normalizedControlMode = normalizeControlMode(controlMode);

    if (!host) throw new SyncPlayError(400, "A host user is required.");
    if (!normalizedMediaId) throw new SyncPlayError(400, "A library media identifier is required.");

    const createdAtMs = now();
    const session = {
      code: createUniqueCode(sessions, randomBytes),
      host,
      mediaId: normalizedMediaId,
      controlMode: normalizedControlMode,
      createdAtMs,
      updatedAtMs: createdAtMs,
      expiresAtMs: createdAtMs + sessionTtlMs,
      sequence: 0,
      playback: {
        status: "paused",
        positionSeconds: 0,
        playbackRate: 1,
        effectiveAtMs: createdAtMs
      },
      participants: new Map([
        [host, createParticipant(host, "host", createdAtMs)]
      ])
    };

    sessions.set(session.code, session);
    return buildSessionPayload(session, createdAtMs);
  }

  function joinSession({ code, username } = {}) {
    const session = requireSession(code);
    const participantUsername = normalizeUsername(username);
    if (!participantUsername) throw new SyncPlayError(400, "A participant user is required.");

    const joinedAtMs = now();
    const role = participantUsername === session.host ? "host" : "follower";
    const existing = session.participants.get(participantUsername);
    session.participants.set(
      participantUsername,
      existing || createParticipant(participantUsername, role, joinedAtMs)
    );
    session.updatedAtMs = joinedAtMs;
    return buildSessionPayload(session, joinedAtMs);
  }

  function leaveSession({ code, username } = {}) {
    const session = requireSession(code);
    const participantUsername = normalizeUsername(username);
    if (!session.participants.has(participantUsername)) {
      throw new SyncPlayError(404, "Participant is not in this Sync Play session.");
    }

    if (participantUsername === session.host) {
      sessions.delete(session.code);
      return { ended: true, code: session.code };
    }

    session.participants.delete(participantUsername);
    session.updatedAtMs = now();
    return { ended: false, code: session.code };
  }

  function applyCommand({ code, username, action, positionSeconds, playbackRate } = {}) {
    const session = requireSession(code);
    const participantUsername = requireParticipant(session, username);
    if (session.controlMode === "host" && participantUsername !== session.host) {
      throw new SyncPlayError(403, "Only the host can control this Sync Play session.");
    }

    const commandTimeMs = now();
    const currentPosition = authoritativePosition(session.playback, commandTimeMs);
    const normalizedAction = String(action || "").trim().toLowerCase();
    const requestedPosition = positionSeconds === undefined
      ? currentPosition
      : normalizePosition(positionSeconds);
    const requestedRate = playbackRate === undefined
      ? session.playback.playbackRate
      : normalizePlaybackRate(playbackRate);

    if (!["play", "pause", "seek"].includes(normalizedAction)) {
      throw new SyncPlayError(400, "Sync Play action must be play, pause, or seek.");
    }

    session.sequence += 1;
    session.updatedAtMs = commandTimeMs;
    session.playback = {
      status: normalizedAction === "play"
        ? "playing"
        : normalizedAction === "pause"
          ? "paused"
          : session.playback.status,
      positionSeconds: requestedPosition,
      playbackRate: requestedRate,
      effectiveAtMs: commandTimeMs
    };

    return buildSessionPayload(session, commandTimeMs);
  }

  function reportState({ code, username, positionSeconds, status, ready = true } = {}) {
    const session = requireSession(code);
    const participantUsername = requireParticipant(session, username);
    const reportTimeMs = now();
    const participant = session.participants.get(participantUsername);
    const normalizedStatus = normalizePlaybackStatus(status);
    const normalizedPosition = normalizePosition(positionSeconds);
    const targetPosition = authoritativePosition(session.playback, reportTimeMs);

    participant.lastSeenAtMs = reportTimeMs;
    participant.ready = ready === true;
    participant.status = normalizedStatus;
    participant.positionSeconds = normalizedPosition;
    participant.driftSeconds = roundMilliseconds(normalizedPosition - targetPosition);
    participant.lastSequence = session.sequence;

    return {
      sequence: session.sequence,
      serverTime: toIso(reportTimeMs),
      targetPositionSeconds: targetPosition,
      driftSeconds: participant.driftSeconds,
      correctionRequired: Math.abs(participant.driftSeconds) > 0.5
    };
  }

  function getSession({ code, username } = {}) {
    const session = requireSession(code);
    requireParticipant(session, username);
    return buildSessionPayload(session, now());
  }

  function removeExpiredSessions() {
    const currentTimeMs = now();
    let removed = 0;
    for (const [code, session] of sessions) {
      if (session.expiresAtMs <= currentTimeMs) {
        sessions.delete(code);
        removed += 1;
      }
    }
    return removed;
  }

  function requireSession(code) {
    removeExpiredSessions();
    const normalizedCode = String(code || "").trim().toUpperCase();
    const session = sessions.get(normalizedCode);
    if (!session) throw new SyncPlayError(404, "Sync Play session was not found or has expired.");
    return session;
  }

  return {
    createSession,
    joinSession,
    leaveSession,
    applyCommand,
    reportState,
    getSession,
    removeExpiredSessions,
    get size() {
      removeExpiredSessions();
      return sessions.size;
    }
  };
}

export class SyncPlayError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "SyncPlayError";
    this.statusCode = statusCode;
  }
}

export function authoritativePosition(playback, atMs) {
  const basePosition = normalizePosition(playback?.positionSeconds);
  if (playback?.status !== "playing") return basePosition;
  const elapsedSeconds = Math.max(0, Number(atMs) - Number(playback.effectiveAtMs || atMs)) / 1000;
  return roundMilliseconds(basePosition + (elapsedSeconds * normalizePlaybackRate(playback.playbackRate)));
}

function requireParticipant(session, username) {
  const participantUsername = normalizeUsername(username);
  if (!session.participants.has(participantUsername)) {
    throw new SyncPlayError(403, "Join this Sync Play session before accessing it.");
  }
  return participantUsername;
}

function buildSessionPayload(session, serverTimeMs) {
  return {
    code: session.code,
    mediaId: session.mediaId,
    controlMode: session.controlMode,
    host: session.host,
    sequence: session.sequence,
    serverTime: toIso(serverTimeMs),
    createdAt: toIso(session.createdAtMs),
    updatedAt: toIso(session.updatedAtMs),
    expiresAt: toIso(session.expiresAtMs),
    playback: {
      ...session.playback,
      effectiveAt: toIso(session.playback.effectiveAtMs),
      effectiveAtMs: undefined,
      targetPositionSeconds: authoritativePosition(session.playback, serverTimeMs)
    },
    participants: [...session.participants.values()].map((participant) => ({
      role: participant.role,
      ready: participant.ready,
      status: participant.status,
      driftSeconds: participant.driftSeconds
    }))
  };
}

function createParticipant(username, role, joinedAtMs) {
  return {
    username,
    role,
    joinedAtMs,
    lastSeenAtMs: joinedAtMs,
    ready: false,
    status: "paused",
    positionSeconds: 0,
    driftSeconds: 0,
    lastSequence: 0
  };
}

function createUniqueCode(sessions, randomBytes) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = randomBytes(5);
    let suffix = "";
    for (const byte of bytes) suffix += SESSION_CODE_ALPHABET[byte % SESSION_CODE_ALPHABET.length];
    const code = `IMPALA-${suffix}`;
    if (!sessions.has(code)) return code;
  }
  throw new SyncPlayError(503, "Unable to create a unique Sync Play code.");
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().slice(0, 120);
}

function normalizeMediaId(value) {
  return String(value || "").trim().slice(0, 1024);
}

function normalizeControlMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "shared" || mode === "host") return mode;
  throw new SyncPlayError(400, "Control mode must be host or shared.");
}

function normalizePlaybackStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "playing" || status === "paused" || status === "buffering") return status;
  throw new SyncPlayError(400, "Player status must be playing, paused, or buffering.");
}

function normalizePosition(value) {
  const position = Number(value);
  if (!Number.isFinite(position) || position < 0 || position > MAX_POSITION_SECONDS) {
    throw new SyncPlayError(400, "Playback position is invalid.");
  }
  return roundMilliseconds(position);
}

function normalizePlaybackRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
    throw new SyncPlayError(400, "Playback rate is invalid.");
  }
  return rate;
}

function normalizeTtl(value) {
  const ttl = Number(value ?? DEFAULT_SESSION_TTL_MS);
  if (!Number.isFinite(ttl) || ttl <= 0) return DEFAULT_SESSION_TTL_MS;
  return Math.min(ttl, MAX_SESSION_TTL_MS);
}

function roundMilliseconds(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function toIso(milliseconds) {
  return new Date(milliseconds).toISOString();
}
