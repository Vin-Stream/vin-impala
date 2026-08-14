import express from "express";
import cors from "cors";
import { createSyncSessionStore, SyncPlayError } from "./session-store.js";
import {
  authorizeSession,
  createSessionToken,
  sendAuthError,
  verifySessionToken
} from "./session-token.js";

export { createSessionToken, verifySessionToken };

export function createSyncPlayApp(options = {}) {
  const sessionSecret = String(options.sessionSecret || "");
  const syncPlayEnabled = options.syncPlayEnabled === true;
  const allowedOrigins = Array.isArray(options.allowedOrigins) ? options.allowedOrigins : [];
  const users = Array.isArray(options.users) ? options.users : [];
  const store = options.store || createSyncSessionStore({ sessionTtlMs: options.sessionTtlMs });

  if (!sessionSecret) throw new Error("SESSION_SECRET is required.");

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    response.set("Pragma", "no-cache");
    response.set("Expires", "0");
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!allowedOrigins.length || !origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      const error = new Error("Origin not allowed by CORS.");
      error.status = 403;
      callback(error);
    }
  }));

  app.get("/healthz", (_request, response) => {
    response.json({
      ok: true,
      syncPlayEnabled,
      users: users.length,
      activeSessions: store.size
    });
  });

  app.post("/api/sync/sessions", requireAuth, requireEnabled, (request, response, next) => {
    run(next, () => {
      const session = store.createSession({
        hostUsername: request.user.username,
        mediaId: request.body?.mediaId,
        controlMode: request.body?.controlMode
      });
      response.status(201).json({ session });
    });
  });

  app.post("/api/sync/sessions/:code/join", requireAuth, requireEnabled, (request, response, next) => {
    run(next, () => {
      const session = store.joinSession({
        code: request.params.code,
        username: request.user.username
      });
      response.json({ session });
    });
  });

  app.get("/api/sync/sessions/:code", requireAuth, requireEnabled, (request, response, next) => {
    run(next, () => {
      const session = store.getSession({
        code: request.params.code,
        username: request.user.username
      });
      response.json({ session });
    });
  });

  app.post("/api/sync/sessions/:code/commands", requireAuth, requireEnabled, (request, response, next) => {
    run(next, () => {
      const session = store.applyCommand({
        code: request.params.code,
        username: request.user.username,
        action: request.body?.action,
        positionSeconds: request.body?.positionSeconds,
        playbackRate: request.body?.playbackRate
      });
      response.json({ session });
    });
  });

  app.post("/api/sync/sessions/:code/reports", requireAuth, requireEnabled, (request, response, next) => {
    run(next, () => {
      const correction = store.reportState({
        code: request.params.code,
        username: request.user.username,
        positionSeconds: request.body?.positionSeconds,
        status: request.body?.status,
        ready: request.body?.ready
      });
      response.json({ correction });
    });
  });

  app.delete("/api/sync/sessions/:code", requireAuth, requireEnabled, (request, response, next) => {
    run(next, () => {
      const result = store.leaveSession({
        code: request.params.code,
        username: request.user.username
      });
      response.json(result);
    });
  });

  app.use((error, _request, response, _next) => {
    if (!(error instanceof SyncPlayError)) console.error(error);
    response.status(error.statusCode || error.status || 500).json({
      error: error.message || "Unexpected server error."
    });
  });

  return app;

  function requireEnabled(_request, response, next) {
    if (!syncPlayEnabled) {
      response.status(503).json({
        enabled: false,
        error: "Sync Play service is not enabled."
      });
      return;
    }
    next();
  }

  function requireAuth(request, response, next) {
    try {
      const { payload, username } = authorizeSession({
        authorization: request.headers.authorization,
        sessionSecret,
        users
      });
      request.user = { ...payload, username };
      next();
    } catch (error) {
      sendAuthError(response, error);
    }
  }
}

function run(next, callback) {
  try {
    callback();
  } catch (error) {
    next(error);
  }
}
