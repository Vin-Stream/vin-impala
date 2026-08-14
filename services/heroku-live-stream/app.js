import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import {
  buildLiveStreamPayload,
  createInitialLiveStreamState,
  reduceLiveStreamAction
} from "./session-state.js";
import { publicStreamCatalog } from "./stream-catalog.js";
import {
  authorizeSession,
  createSessionToken,
  sendAuthError,
  verifySessionToken
} from "./session-token.js";

export { createSessionToken, verifySessionToken };

export function createLiveStreamApp(options = {}) {
  const sessionSecret = String(options.sessionSecret || "");
  const liveStreamEnabled = options.liveStreamEnabled === true;
  const allowedOrigins = Array.isArray(options.allowedOrigins) ? options.allowedOrigins : [];
  const users = Array.isArray(options.users) ? options.users : [];
  const streamCatalog = Array.isArray(options.streamCatalog) ? options.streamCatalog : [];

  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required.");
  }

  const app = express();
  let liveStreamState = createInitialLiveStreamState();

  app.use(express.json({ limit: "32kb" }));
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

      const corsError = new Error("Origin not allowed by CORS.");
      corsError.status = 403;
      callback(corsError);
    }
  }));

  app.get("/healthz", (_request, response) => {
    response.json({
      ok: true,
      liveStreamEnabled,
      users: users.length
    });
  });

  app.get("/api/live/session", requireAuth, (_request, response) => {
    response.json(buildLiveStreamPayload({
      enabled: liveStreamEnabled,
      state: liveStreamState
    }));
  });

  app.get("/api/streams", requireAuth, (_request, response) => {
    response.json({
      streams: publicStreamCatalog(streamCatalog)
    });
  });

  app.post("/api/live/session", requireAuth, (request, response) => {
    if (!liveStreamEnabled) {
      response.status(503).json({
        enabled: false,
        error: "Live stream service is not enabled."
      });
      return;
    }

    const result = reduceLiveStreamAction(liveStreamState, {
      action: request.body?.action,
      title: request.body?.title,
      streamUrl: request.body?.streamUrl,
      username: request.user.username,
      now: new Date().toISOString(),
      sessionId: crypto.randomUUID()
    });

    if (!result.ok) {
      response.status(result.statusCode).json({ error: result.error });
      return;
    }

    liveStreamState = result.state;
    response.status(result.statusCode).json(buildLiveStreamPayload({
      enabled: liveStreamEnabled,
      state: liveStreamState
    }));
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(error.status || 500).json({
      error: error.message || "Unexpected server error."
    });
  });

  return app;

  function requireAuth(request, response, next) {
    try {
      const { payload, configuredUser: allowedUser, username } = authorizeSession({
        authorization: request.headers.authorization,
        sessionSecret,
        users
      });

      request.user = {
        ...payload,
        username,
        isAdmin: allowedUser.isAdmin === true
      };
      next();
    } catch (error) {
      sendAuthError(response, error);
    }
  }
}
