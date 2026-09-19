import "./local-env.js";
import { createActivityStore, mountActivity } from "./activity.js";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { buildLibraryIndexes, normalizeScanPrefix } from "./index-builder.js";
import { createLibraryIndexCache, queryLibraryIndex } from "./library-index.js";
import {
  canUserAccessBucket,
  getAllowedBuckets,
  parseBucketRules
} from "./bucket-access.js";
import {
  authorizeSession,
  createSessionToken,
  sendAuthError
} from "./session-token.js";

const app = express();

const port = Number.parseInt(process.env.PORT || "3000", 10);
const sessionSecret = process.env.SESSION_SECRET || "";
const tokenTtlSeconds = parsePositiveIntegerEnv(
  ["TOKEN_TTL_SECONDS", "SESSION_TTL_SECONDS", "TOKEN_TTL", "SESSION_TTL"],
  5184000
);
const signedUrlTtlSeconds = parsePositiveIntegerEnv(
  ["SIGNED_URL_TTL_SECONDS", "SIGNED_URL_TTL"],
  1800
);
const allowedOrigins = parseAllowedOrigins(
  process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || ""
);
const feedbackEmail = process.env.FEEDBACK_EMAIL || "kevin@discrete-dev.com";
const resendApiKey = process.env.RESEND_API_KEY || "";
const feedbackFromEmail = process.env.FEEDBACK_FROM_EMAIL || "Impala Feedback <onboarding@resend.dev>";
const diagnosticsFromEmail = process.env.DIAGNOSTICS_FROM_EMAIL || "Impala Diagnostics <onboarding@resend.dev>";
const feedbackRateLimits = new Map();
const s4Buckets = (process.env.S4_BUCKET || "").split(";").map((b) => b.trim()).filter(Boolean);
const s4Bucket = s4Buckets[0] || "";
const s4VideoBucket = String(process.env.S4_VIDEO_BUCKET || s4Buckets[1] || "").trim();
const bucketRules = parseBucketRules(process.env.S4_BUCKET_RULES_JSON || "");
const s4Region = process.env.S4_REGION || "eu-central-1";
const s4Endpoint = process.env.S4_ENDPOINT || "https://s3.g.s4.mega.io";
const privateVideoPrefixes = parsePrefixList(process.env.S4_VIDEO_PRIVATE_PREFIXES || "test/");
const libraryIndexEnabled = !["0", "false", "no"].includes(
  String(process.env.S4_INDEX_ENABLED ?? "true").trim().toLowerCase()
);
const libraryIndexCheckIntervalMs = parsePositiveIntegerEnv(
  ["S4_INDEX_CHECK_SECONDS"],
  60
) * 1000;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required.");
}

if (!s4Bucket) {
  throw new Error("S4_BUCKET is required.");
}

if (!process.env.S4_ACCESS_KEY_ID || !process.env.S4_SECRET_ACCESS_KEY) {
  throw new Error("S4_ACCESS_KEY_ID and S4_SECRET_ACCESS_KEY are required.");
}

const users = parseUsers(process.env.ALLOWED_USERS_JSON || "[]");
const activityStore = createActivityStore({ uri: process.env.MONGODB_URI, database: process.env.MONGODB_DATABASE || "impala_family" });

const s3Client = new S3Client({
  region: s4Region,
  endpoint: s4Endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S4_ACCESS_KEY_ID,
    secretAccessKey: process.env.S4_SECRET_ACCESS_KEY
  }
});
const libraryIndexScopes = [
  {
    name: "audio",
    bucket: s4Bucket,
    prefix: normalizeScanPrefix(process.env.S4_INDEX_AUDIO_PREFIX ?? "audio/"),
    indexKey: process.env.S4_AUDIO_INDEX_KEY || "indexes/audio.ndjson"
  },
  {
    name: "video",
    bucket: s4VideoBucket || s4Bucket,
    prefix: normalizeScanPrefix(
      process.env.S4_INDEX_VIDEO_PREFIX ?? (s4VideoBucket ? "" : "video/")
    ),
    indexKey: process.env.S4_VIDEO_INDEX_KEY || "indexes/video.ndjson",
    excludedPrefixes: ["indexes/", ...privateVideoPrefixes]
  }
];
const libraryIndexCache = createLibraryIndexCache({
  s3Client,
  checkIntervalMs: libraryIndexCheckIntervalMs,
  scopes: Object.fromEntries(libraryIndexScopes.map((scope) => [scope.name, {
    bucket: scope.bucket,
    key: scope.indexKey
  }]))
});
const indexRebuildState = {
  id: null,
  status: "idle",
  currentScope: null,
  startedAt: null,
  finishedAt: null,
  results: [],
  error: null
};

app.use(express.json({ limit: "96kb" }));
app.use("/api", (_request, response, next) => {
  response.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.set("Pragma", "no-cache");
  response.set("Expires", "0");
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!allowedOrigins.length || !origin || isAllowedOrigin(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }

    const corsError = new Error("Origin not allowed by CORS.");
    corsError.status = 403;
    callback(corsError);
  }
}));

mountActivity(app, { store: activityStore, users, requireAuth, requireAdmin });

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    users: users.length,
    bucket: s4Bucket,
    videoBucket: s4VideoBucket || null,
    bucketConfig: s4Buckets.join(";") || null,
    bucketRulesEnabled: bucketRules !== null,
    tokenTtlSeconds,
    signedUrlTtlSeconds,
    libraryIndexEnabled,
    libraryIndexes: libraryIndexCache.getStatus()
  });
});

app.post("/api/feedback", async (request, response) => {
  const message = String(request.body?.message || "").trim().slice(0, 4000);
  const sentiment = String(request.body?.sentiment || "").trim().slice(0, 40);
  const context = sanitizeFeedbackContext(request.body?.context);
  const requestKey = request.ip || "unknown";

  if (!message && !sentiment) {
    response.status(400).json({ error: "Add a note or reaction before sending." });
    return;
  }
  if (!resendApiKey) {
    response.status(503).json({ error: "Feedback delivery is not configured yet." });
    return;
  }
  if (isFeedbackRateLimited(requestKey)) {
    response.status(429).json({ error: "Please wait a moment before sending more feedback." });
    return;
  }

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: feedbackFromEmail,
        to: [feedbackEmail],
        subject: `Impala feedback${sentiment ? `: ${sentiment}` : ""}`,
        text: [message || "(No written message)", "", "Context", JSON.stringify(context, null, 2)].join("\n")
      })
    });
    if (!emailResponse.ok) {
      const detail = await emailResponse.text();
      throw new Error(`Email provider returned ${emailResponse.status}: ${detail.slice(0, 300)}`);
    }
    response.status(202).json({ ok: true });
  } catch (error) {
    console.error("Unable to deliver feedback:", error);
    response.status(502).json({ error: "Feedback could not be delivered. Please try again." });
  }
});

app.post("/api/diagnostics", async (request, response) => {
  const report = sanitizeDiagnosticsReport(request.body);
  const requestKey = `diag:${request.ip || "unknown"}`;

  if (!resendApiKey) {
    response.status(503).json({ error: "Diagnostics delivery is not configured yet." });
    return;
  }
  if (isFeedbackRateLimited(requestKey)) {
    response.status(429).json({ error: "Please wait a moment before sending more diagnostics." });
    return;
  }

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: diagnosticsFromEmail,
        to: [feedbackEmail],
        subject: "[Impala Diagnostics] functional support report",
        text: ["Diagnostics report", "", JSON.stringify(report, null, 2)].join("\n")
      })
    });
    if (!emailResponse.ok) {
      const detail = await emailResponse.text();
      throw new Error(`Email provider returned ${emailResponse.status}: ${detail.slice(0, 300)}`);
    }
    response.status(202).json({ ok: true });
  } catch (error) {
    console.error("Unable to deliver diagnostics:", error);
    response.status(502).json({ error: "Diagnostics could not be delivered. Please try again." });
  }
});

app.post("/api/auth/login", (request, response) => {
  const username = String(request.body?.username || "").trim().toLowerCase();
  const password = String(request.body?.password || "");

  if (!username || !password) {
    response.status(400).json({ error: "Username and password are required." });
    return;
  }

  const user = users.find((candidate) => candidate.username === username);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    response.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const expiresAt = new Date(Date.now() + tokenTtlSeconds * 1000).toISOString();
  const deviceId = String(request.get("x-impala-instance-id") || "")
    .trim()
    .replace(/[^a-z0-9._:-]/gi, "-")
    .slice(0, 96);
  const token = createSessionToken({
    sub: user.username,
    exp: expiresAt,
    roles: user.isAdmin === true ? ["viewer", "admin"] : ["viewer"],
    deviceId,
    sessionId: crypto.randomUUID()
  }, sessionSecret);

  void activityStore.record(user.username, { deviceId: deviceId || "legacy", userAgent: request.get("user-agent"), login: true })
    .catch(() => console.warn("Activity login could not be recorded; check MongoDB availability."));

  response.json({
    token,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin === true,
    expiresAt
  });
});

app.get("/api/auth/session", requireAuth, (request, response) => {
  response.json({
    username: request.user.username,
    displayName: request.user.displayName,
    expiresAt: request.user.expiresAt,
    allowedPrefixes: request.user.allowedPrefixes,
    allowedBuckets: getAllowedBuckets(bucketRules, request.user.username),
    isAdmin: request.user.isAdmin === true
  });
});

app.get("/api/admin/rebuild-index", requireAuth, requireAdmin, (_request, response) => {
  response.json(getIndexRebuildStatus());
});

app.post("/api/admin/rebuild-index", requireAuth, requireAdmin, (request, response) => {
  if (indexRebuildState.status === "running") {
    response.status(202).json({
      accepted: false,
      message: "An index rebuild is already running.",
      ...getIndexRebuildStatus()
    });
    return;
  }

  const mediaScope = parseOptionalMediaScope(request.query.scope);
  const rebuildId = crypto.randomUUID();
  startIndexRebuild(rebuildId, mediaScope);
  response.status(202).json({
    accepted: true,
    message: "Index rebuild started.",
    ...getIndexRebuildStatus()
  });
});

app.get("/api/index-version", requireAuth, async (request, response) => {
  const mediaScope = parseMediaScope(request.query.media);
  const targetBucket = getBucketForScope(mediaScope);

  if (!canUserAccessBucket(bucketRules, request.user.username, targetBucket)) {
    response.status(403).json({ error: "That library bucket is not available to this user." });
    return;
  }

  if (libraryIndexEnabled) {
    try {
      await libraryIndexCache.load(mediaScope);
    } catch (error) {
      console.warn(`Unable to load ${mediaScope} library index status:`, error.message);
    }
  }

  response.json({
    enabled: libraryIndexEnabled,
    ...libraryIndexCache.getStatus()
  });
});

app.get("/api/media-url", requireAuth, async (request, response) => {
  const objectKey = String(request.query.key || "");
  const mediaScope = parseMediaScope(request.query.media);
  const targetBucket = getBucketForScope(mediaScope);
  const requestedContentType = String(request.query.contentType || "").trim().toLowerCase();

  if (!canUserAccessBucket(bucketRules, request.user.username, targetBucket)) {
    response.status(403).json({ error: "That library bucket is not available to this user." });
    return;
  }

  if (!objectKey) {
    response.status(400).json({ error: "Media key is required." });
    return;
  }

  if (!isValidObjectKey(objectKey)) {
    response.status(400).json({ error: "Invalid object key." });
    return;
  }

  const allowedPrefixes = request.user.allowedPrefixes || [];
  const excludedPrefixes = getExcludedPrefixes(mediaScope, request.user);
  const isAllowed = !allowedPrefixes.length || allowedPrefixes.some((prefix) => objectKey.startsWith(prefix));

  if (!isAllowed || isExcludedForPrefixes(objectKey, excludedPrefixes)) {
    response.status(403).json({ error: "That track is outside your allowed library scope." });
    return;
  }

  if (requestedContentType && !isSafeContentType(requestedContentType)) {
    response.status(400).json({ error: "Invalid content type." });
    return;
  }

  try {
    const commandInput = {
      Bucket: targetBucket,
      Key: objectKey
    };

    if (requestedContentType) {
      commandInput.ResponseContentType = requestedContentType;
    }

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand(commandInput),
      { expiresIn: signedUrlTtlSeconds }
    );

    response.json({
      url: signedUrl,
      key: objectKey,
      expiresIn: signedUrlTtlSeconds
    });
  } catch (error) {
    console.error("Unable to sign media URL:", error);
    response.status(500).json({ error: "Unable to sign media URL." });
  }
});

app.get("/api/library", requireAuth, async (request, response) => {
  const requestedPrefix = normalizePrefix(request.query.prefix);
  const continuationToken = String(request.query.cursor || "").trim();
  const searchTerm = normalizeSearchTerm(request.query.search);
  const mediaScope = parseMediaScope(request.query.media);
  const targetBucket = getBucketForScope(mediaScope);
  const recursive = parseBooleanQuery(request.query.recursive);
  const limit = clampLimit(request.query.limit);
  const allowedPrefixes = request.user.allowedPrefixes || [];
  const excludedPrefixes = getExcludedPrefixes(mediaScope, request.user);

  if (!canUserAccessBucket(bucketRules, request.user.username, targetBucket)) {
    response.status(403).json({ error: "That library bucket is not available to this user." });
    return;
  }

  if (
    requestedPrefix
    && (!isAllowedForLibraryPrefix(requestedPrefix, allowedPrefixes)
      || isExcludedForPrefixes(requestedPrefix, excludedPrefixes))
  ) {
    response.status(403).json({ error: "That library path is outside your allowed scope." });
    return;
  }

  if (!requestedPrefix && allowedPrefixes.length && !searchTerm) {
    response.json({
      prefix: "",
      folders: buildVirtualFolders(allowedPrefixes)
        .filter((folder) => !isExcludedForPrefixes(folder.prefix, excludedPrefixes)),
      files: [],
      nextCursor: null
    });
    return;
  }

  try {
    if (libraryIndexEnabled) {
      try {
        const records = await libraryIndexCache.load(mediaScope);
        const indexedPayload = queryLibraryIndex(records, {
          requestedPrefix,
          allowedPrefixes,
          excludedPrefixes,
          searchTerm,
          recursive,
          limit,
          cursor: continuationToken
        });

        response.set("X-Library-Source", "index");
        response.json({
          prefix: requestedPrefix,
          ...indexedPayload
        });
        return;
      } catch (error) {
        console.warn(`Unable to use ${mediaScope} library index; falling back to live S4 listing:`, error.message);
      }
    }

    response.set("X-Library-Source", "live-s4");

    if (searchTerm) {
      const searchResults = await searchLibraryEntries({
        bucket: targetBucket,
        requestedPrefix,
        allowedPrefixes,
        excludedPrefixes,
        limit,
        searchTerm
      });

      response.json({
        prefix: requestedPrefix,
        folders: searchResults.folders,
        files: searchResults.files,
        nextCursor: null
      });
      return;
    }

    if (recursive) {
      const payload = await s3Client.send(new ListObjectsV2Command({
        Bucket: targetBucket,
        Prefix: requestedPrefix,
        ContinuationToken: continuationToken || undefined,
        MaxKeys: limit
      }));

      const files = (payload.Contents || [])
        .map((item) => String(item.Key || ""))
        .filter((key) => key && key !== requestedPrefix)
        .filter((key) => isAllowedForPrefixes(key, allowedPrefixes))
        .filter((key) => !isExcludedForPrefixes(key, excludedPrefixes))
        .filter((key) => isAudioObjectKey(key))
        .map((key) => ({
          name: getLeafName(key),
          objectKey: key
        }));

      response.json({
        prefix: requestedPrefix,
        folders: [],
        files,
        nextCursor: payload.IsTruncated ? payload.NextContinuationToken || null : null
      });
      return;
    }

    const payload = await s3Client.send(new ListObjectsV2Command({
      Bucket: targetBucket,
      Prefix: requestedPrefix,
      Delimiter: "/",
      ContinuationToken: continuationToken || undefined,
      MaxKeys: limit
    }));

    const folders = (payload.CommonPrefixes || [])
      .map((item) => normalizePrefix(item.Prefix))
      .filter(Boolean)
      .filter((prefix) => isAllowedForPrefixes(prefix, allowedPrefixes))
      .filter((prefix) => !isExcludedForPrefixes(prefix, excludedPrefixes))
      .map((prefix) => ({
        name: getLeafName(prefix),
        prefix
      }));

    const files = (payload.Contents || [])
      .map((item) => String(item.Key || ""))
      .filter((key) => key && key !== requestedPrefix)
      .filter((key) => isAllowedForPrefixes(key, allowedPrefixes))
      .filter((key) => !isExcludedForPrefixes(key, excludedPrefixes))
      .filter((key) => isAudioObjectKey(key))
      .map((key) => ({
        name: getLeafName(key),
        objectKey: key
      }));

    response.json({
      prefix: requestedPrefix,
      folders,
      files,
      nextCursor: payload.IsTruncated ? payload.NextContinuationToken || null : null
    });
  } catch (error) {
    console.error("Unable to list library objects:", error);
    response.status(500).json({ error: "Unable to list library objects." });
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: error.message || "Unexpected server error."
  });
});

function sanitizeFeedbackContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowedKeys = [
    "purpose", "appVersion", "appBuildDate", "deviceType", "os", "currentScreen",
    "lastError", "uptimeSeconds", "network", "capturedAt"
  ];
  return Object.fromEntries(allowedKeys
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, value[key]]));
}

function sanitizeDiagnosticsReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowedKeys = [
    "purpose", "timestamp", "appVersion", "appBuildDate", "browser", "platform",
    "connection", "online", "uptimeSeconds", "warnings", "errors", "storage"
  ];
  return clampJson(Object.fromEntries(allowedKeys
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, value[key]])), 24_000);
}

function clampJson(value, maxCharacters) {
  const redacted = redactDiagnosticValue(value);
  const serialized = JSON.stringify(redacted);
  if (serialized.length <= maxCharacters) return redacted;
  return {
    truncated: true,
    preview: serialized.slice(0, maxCharacters)
  };
}

function redactDiagnosticValue(value) {
  if (typeof value === "string") {
    return value
      .replace(/([?&](?:token|signature|x-amz-[^=]+)=)[^&\s]+/gi, "$1[redacted]")
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
      .slice(0, 4000);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map(redactDiagnosticValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDiagnosticValue(item)]));
}

function isFeedbackRateLimited(key) {
  const now = Date.now();
  const recent = (feedbackRateLimits.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 5) return true;
  recent.push(now);
  feedbackRateLimits.set(key, recent);
  return false;
}

app.listen(port, () => {
  console.log(
    `impala-streamer signer listening on port ${port} (token ttl ${tokenTtlSeconds}s, signed-url ttl ${signedUrlTtlSeconds}s)`
  );
});

function parsePositiveIntegerEnv(variableNames, fallback) {
  for (const variableName of variableNames) {
    const rawValue = process.env[variableName];
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
      continue;
    }

    const parsedValue = Number.parseInt(String(rawValue).trim(), 10);
    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }

    console.warn(
      `${variableName}="${rawValue}" is invalid. Falling back to default value ${fallback}.`
    );
    return fallback;
  }

  return fallback;
}

function parseUsers(rawValue) {
  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.map((user) => ({
      username: String(user.username || "").trim().toLowerCase(),
      displayName: String(user.displayName || user.username || "").trim(),
      passwordHash: String(user.passwordHash || ""),
      isAdmin: user.isAdmin === true || user.admin === true,
      allowedPrefixes: Array.isArray(user.allowedPrefixes)
        ? user.allowedPrefixes
          .map((prefix) => normalizePrefix(prefix))
          .filter(Boolean)
        : []
    })).filter((user) => user.username && user.passwordHash);
  } catch (error) {
    throw new Error(`Unable to parse ALLOWED_USERS_JSON: ${error.message}`);
  }
}

function parseAllowedOrigins(rawValue) {
  return parseCsvList(rawValue);
}

function parseCsvList(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parsePrefixList(rawValue) {
  return parseCsvList(rawValue).map(normalizePrefix).filter(Boolean);
}

function isAllowedOrigin(origin, allowedOriginPatterns) {
  if (!origin) {
    return true;
  }

  return allowedOriginPatterns.some((pattern) => originMatchesPattern(origin, pattern));
}

function originMatchesPattern(origin, pattern) {
  if (!pattern) {
    return false;
  }

  if (pattern === "*") {
    return true;
  }

  if (origin === pattern) {
    return true;
  }

  const wildcardPattern = pattern.match(/^(https?:\/\/(?:localhost|127\.0\.0\.1)):\*$/i);
  if (wildcardPattern) {
    return new RegExp(`^${escapeRegExp(wildcardPattern[1])}:\\d+$`, "i").test(origin);
  }

  return false;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePrefix(value) {
  const normalized = String(value || "").trim().replace(/^\/+/, "");
  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function normalizeSearchTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSearchKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getSearchTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isShortSearchTerm(normalizedSearchTerm) {
  return normalizedSearchTerm.length > 0 && normalizedSearchTerm.length <= 2;
}

function getSearchVariants(value) {
  const base = normalizeSearchKey(value);
  if (!base) {
    return [];
  }

  const variants = new Set([base]);
  if (base.length > 2 && base.endsWith("s")) {
    variants.add(base.slice(0, -1));
  }

  return [...variants];
}

function includesSearchTerm(value, rawSearchTerm, normalizedSearchTerm) {
  const candidate = String(value || "").toLowerCase();
  if (!candidate) {
    return false;
  }

  if (candidate.includes(rawSearchTerm)) {
    return true;
  }

  if (!normalizedSearchTerm) {
    return false;
  }

  if (isShortSearchTerm(normalizedSearchTerm)) {
    return getSearchTokens(candidate).some((token) => token.startsWith(normalizedSearchTerm));
  }

  const normalizedCandidate = normalizeSearchKey(candidate);
  if (normalizedCandidate.includes(normalizedSearchTerm)) {
    return true;
  }

  const candidateVariants = getSearchVariants(normalizedCandidate);
  const searchVariants = getSearchVariants(normalizedSearchTerm);
  return searchVariants.some((searchVariant) =>
    candidateVariants.some((candidateVariant) => candidateVariant.includes(searchVariant))
  );
}

function parseBooleanQuery(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseMediaScope(value) {
  return String(value || "").trim().toLowerCase() === "video" ? "video" : "audio";
}

function parseOptionalMediaScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "audio" || normalized === "video" ? normalized : "";
}

function getBucketForScope(scope) {
  if (scope === "video" && s4VideoBucket) {
    return s4VideoBucket;
  }

  return s4Bucket;
}

function clampLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (Number.isNaN(parsed)) {
    return 100;
  }

  return Math.min(Math.max(parsed, 1), 1000);
}

function isAllowedForPrefixes(candidate, allowedPrefixes) {
  if (!allowedPrefixes.length) {
    return true;
  }

  return allowedPrefixes.some((prefix) => String(candidate || "").startsWith(prefix));
}

function isAllowedForLibraryPrefix(candidate, allowedPrefixes) {
  if (!allowedPrefixes.length) {
    return true;
  }

  const normalizedCandidate = normalizePrefix(candidate);
  return allowedPrefixes.some((prefix) => (
    normalizedCandidate.startsWith(prefix) || prefix.startsWith(normalizedCandidate)
  ));
}

function isExcludedForPrefixes(candidate, excludedPrefixes) {
  return excludedPrefixes.some((prefix) => String(candidate || "").startsWith(prefix));
}

function getExcludedPrefixes(mediaScope, user) {
  if (mediaScope !== "video" || user?.isAdmin === true) {
    return [];
  }

  return privateVideoPrefixes;
}

function buildVirtualFolders(prefixes) {
  const foldersByPrefix = new Map();
  prefixes.map((prefix) => getVirtualRootFolder(prefix)).filter(Boolean).forEach((folder) => {
    if (!foldersByPrefix.has(folder.prefix)) {
      foldersByPrefix.set(folder.prefix, folder);
    }
  });
  return [...foldersByPrefix.values()];
}

function getVirtualRootFolder(value) {
  const normalizedPrefix = normalizePrefix(value);
  const segments = normalizedPrefix.split("/").filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const rootSegment = String(segments[0] || "").toLowerCase();
  const hasMediaRoot = ["audio", "video", "videos"].includes(rootSegment);
  const visibleIndex = hasMediaRoot && segments.length > 1 ? 1 : 0;
  const folderPrefix = `${segments.slice(0, visibleIndex + 1).join("/")}/`;
  return {
    name: segments[visibleIndex],
    prefix: folderPrefix
  };
}

function getLeafName(path) {
  const trimmedPath = String(path || "").replace(/\/+$/, "");
  const segments = trimmedPath.split("/").filter(Boolean);
  return segments[segments.length - 1] || trimmedPath;
}

async function searchLibraryEntries({
  bucket,
  requestedPrefix,
  allowedPrefixes,
  excludedPrefixes,
  limit,
  searchTerm
}) {
  const scopePrefixes = requestedPrefix
    ? [requestedPrefix]
    : (allowedPrefixes.length ? allowedPrefixes.map((prefix) => normalizePrefix(prefix)) : [""]);
  const normalizedSearchTerm = normalizeSearchKey(searchTerm);
  const folderMap = new Map();
  const fileMap = new Map();

  for (const scopePrefix of scopePrefixes) {
    let folderContinuationToken;
    let folderPagesScanned = 0;

    do {
      const folderPayload = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: scopePrefix,
        Delimiter: "/",
        ContinuationToken: folderContinuationToken,
        MaxKeys: limit
      }));

      for (const item of folderPayload.CommonPrefixes || []) {
        const folderPrefix = normalizePrefix(item.Prefix);
        const folderName = getLeafName(folderPrefix).toLowerCase();

        if (
          !folderPrefix
          || !isAllowedForPrefixes(folderPrefix, allowedPrefixes)
          || isExcludedForPrefixes(folderPrefix, excludedPrefixes)
        ) {
          continue;
        }

        if (includesSearchTerm(folderName, searchTerm, normalizedSearchTerm) && !folderMap.has(folderPrefix)) {
          folderMap.set(folderPrefix, {
            name: getLeafName(folderPrefix),
            prefix: folderPrefix
          });
        }

        if (folderMap.size + fileMap.size >= limit) {
          break;
        }
      }

      if (folderMap.size + fileMap.size >= limit) {
        break;
      }

      folderContinuationToken = folderPayload.IsTruncated ? folderPayload.NextContinuationToken : undefined;
      folderPagesScanned += 1;
    } while (folderContinuationToken && folderPagesScanned < 10);

    if (folderMap.size + fileMap.size >= limit) {
      break;
    }

    let continuationToken;
    let pagesScanned = 0;

    do {
      const payload = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: scopePrefix,
        ContinuationToken: continuationToken,
        MaxKeys: limit
      }));

      for (const item of payload.Contents || []) {
        const key = String(item.Key || "");
        if (
          !key
          || !isAllowedForPrefixes(key, allowedPrefixes)
          || isExcludedForPrefixes(key, excludedPrefixes)
          || !isAudioObjectKey(key)
        ) {
          continue;
        }

        const relativePath = key.startsWith(scopePrefix) ? key.slice(scopePrefix.length) : key;
        const pathSegments = relativePath.split("/").filter(Boolean);
        const immediateFolder = pathSegments.length > 1 ? `${scopePrefix}${pathSegments[0]}/` : "";

        if (
          immediateFolder
          && includesSearchTerm(immediateFolder, searchTerm, normalizedSearchTerm)
          && !folderMap.has(immediateFolder)
        ) {
          folderMap.set(immediateFolder, {
            name: getLeafName(immediateFolder),
            prefix: immediateFolder
          });
        }

        if (includesSearchTerm(key, searchTerm, normalizedSearchTerm) && !fileMap.has(key)) {
          fileMap.set(key, {
            name: getLeafName(key),
            objectKey: key
          });
        }

        if (folderMap.size + fileMap.size >= limit) {
          break;
        }
      }

      if (folderMap.size + fileMap.size >= limit) {
        break;
      }

      continuationToken = payload.IsTruncated ? payload.NextContinuationToken : undefined;
      pagesScanned += 1;
    } while (continuationToken && pagesScanned < 10);

    if (folderMap.size + fileMap.size >= limit) {
      break;
    }
  }

  return {
    folders: [...folderMap.values()].slice(0, limit),
    files: [...fileMap.values()].slice(0, Math.max(limit - folderMap.size, 0))
  };
}

function isAudioObjectKey(objectKey) {
  return /\.(flac|mp3|m4a|mp4|m4v|wav|ogg|opus|aac|webm|mov)$/i.test(String(objectKey || ""));
}

function verifyPassword(password, encodedHash) {
  const [algorithm, n, r, p, saltBase64, hashBase64] = String(encodedHash).split("$");

  if (algorithm !== "scrypt" || !saltBase64 || !hashBase64) {
    return false;
  }

  const cost = Number.parseInt(n, 10);
  const blockSize = Number.parseInt(r, 10);
  const parallelization = Number.parseInt(p, 10);

  if (!cost || !blockSize || !parallelization) {
    return false;
  }

  try {
    const salt = Buffer.from(saltBase64, "base64");
    const expectedHash = Buffer.from(hashBase64, "base64");
    if (!salt.length || !expectedHash.length) {
      return false;
    }

    const computedHash = crypto.scryptSync(password, salt, expectedHash.length, {
      N: cost,
      r: blockSize,
      p: parallelization
    });

    return crypto.timingSafeEqual(expectedHash, computedHash);
  } catch (error) {
    console.warn("Ignoring invalid password hash:", error.message);
    return false;
  }
}

function requireAuth(request, response, next) {
  try {
    const { payload: sessionUser, configuredUser } = authorizeSession({
      authorization: request.get("authorization"),
      sessionSecret,
      users
    });

    request.user = {
      ...sessionUser,
      displayName: configuredUser.displayName,
      allowedPrefixes: configuredUser.allowedPrefixes,
      isAdmin: configuredUser.isAdmin === true
    };
    next();
  } catch (error) {
    sendAuthError(response, error);
  }
}

function requireAdmin(request, response, next) {
  if (request.user?.isAdmin !== true) {
    response.status(403).json({ error: "Administrator access is required." });
    return;
  }

  next();
}

function startIndexRebuild(rebuildId, mediaScope = "") {
  const scopes = mediaScope
    ? libraryIndexScopes.filter((scope) => scope.name === mediaScope)
    : libraryIndexScopes;
  indexRebuildState.id = rebuildId;
  indexRebuildState.status = "running";
  indexRebuildState.currentScope = null;
  indexRebuildState.startedAt = new Date().toISOString();
  indexRebuildState.finishedAt = null;
  indexRebuildState.results = [];
  indexRebuildState.error = null;

  void buildLibraryIndexes({
    s3Client,
    scopes,
    onProgress(event) {
      indexRebuildState.currentScope = event.phase === "building" ? event.scope : null;
      if (event.result) {
        indexRebuildState.results = [...indexRebuildState.results, event.result];
        libraryIndexCache.invalidate(event.scope);
      }
    }
  }).then((results) => {
    libraryIndexCache.invalidate();
    indexRebuildState.status = "completed";
    indexRebuildState.currentScope = null;
    indexRebuildState.finishedAt = new Date().toISOString();
    indexRebuildState.results = results;
    console.log(`Index rebuild ${rebuildId} completed.`);
  }).catch((error) => {
    indexRebuildState.status = "failed";
    indexRebuildState.currentScope = null;
    indexRebuildState.finishedAt = new Date().toISOString();
    indexRebuildState.error = error.message || "Index rebuild failed.";
    console.error(`Index rebuild ${rebuildId} failed:`, error);
  });
}

function getIndexRebuildStatus() {
  return {
    id: indexRebuildState.id,
    status: indexRebuildState.status,
    currentScope: indexRebuildState.currentScope,
    startedAt: indexRebuildState.startedAt,
    finishedAt: indexRebuildState.finishedAt,
    results: indexRebuildState.results.map((result) => ({
      name: result.name,
      records: result.records,
      titleCount: result.titleCount ?? null,
      generatedAt: result.generatedAt
    })),
    error: indexRebuildState.error
  };
}

function isValidObjectKey(key) {
  if (!key || key.length > 1024) {
    return false;
  }

  if (key === ".." || key.includes("//") || key.includes("/./") || key.includes("/../")) {
    return false;
  }

  return !key.startsWith("../") && !key.endsWith("/..");
}

function isSafeContentType(contentType) {
  if (!contentType || contentType.length > 128) {
    return false;
  }

  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(contentType);
}
