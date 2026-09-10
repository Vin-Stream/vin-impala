import crypto from "node:crypto";
import { MongoClient } from "mongodb";

export const RECENT_MS = 30 * 86400000;
export const OVERLAP_MS = 4 * 60000;

export function activityPipeline({ deviceId, userAgent = "", login = false }, now = new Date()) {
  const id = crypto.createHash("sha256").update(deviceId).digest("hex").slice(0, 24);
  const recent = { $filter: {
    input: { $ifNull: ["$devices", []] }, as: "device",
    cond: { $and: [
      { $ne: ["$$device.id", id] },
      { $gte: ["$$device.lastSeenAt", new Date(+now - RECENT_MS)] }
    ] }
  } };
  return [
    { $set: {
      firstRecordedAt: { $ifNull: ["$firstRecordedAt", now] },
      lastSeenAt: now,
      loginCount: { $add: [{ $ifNull: ["$loginCount", 0] }, login ? 1 : 0] },
      ...(login ? { lastLoginAt: now } : {}),
      devices: recent
    } },
    { $set: {
      lastOverlapAt: { $cond: [
        { $gt: [{ $size: { $filter: {
          input: "$devices", as: "device",
          cond: { $gte: ["$$device.lastSeenAt", new Date(+now - OVERLAP_MS)] }
        } } }, 0] }, now, { $ifNull: ["$lastOverlapAt", null] }
      ] },
      devices: { $slice: [{ $concatArrays: ["$devices", { $literal: [{
        id, userAgent: String(userAgent).slice(0, 256), lastSeenAt: now
      }] }] }, -32] }
    } }
  ];
}

export function activityRows(users, documents, now = Date.now()) {
  const byUser = new Map(documents.map((doc) => [doc._id, doc]));
  return users.map(({ username, displayName, isAdmin }) => {
    const doc = byUser.get(username);
    const devices = (doc?.devices || []).filter((d) => +new Date(d.lastSeenAt) >= now - RECENT_MS);
    return {
      username, displayName, isAdmin: isAdmin === true,
      firstRecordedAt: doc?.firstRecordedAt || null,
      lastLoginAt: doc?.lastLoginAt || null,
      lastSeenAt: doc?.lastSeenAt || null,
      loginCount: doc?.loginCount || 0,
      devices, deviceCount: devices.length,
      lastOverlapAt: doc?.lastOverlapAt || null,
      inactive: Boolean(doc?.lastSeenAt && +new Date(doc.lastSeenAt) < now - RECENT_MS)
    };
  });
}

export function createActivityStore({ uri, database = "impala_family" }) {
  let client;
  function collection() {
    if (!uri) throw new Error("Activity tracking is not configured.");
    client ||= new MongoClient(uri, {
      serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000, socketTimeoutMS: 5000,
      maxPoolSize: 3
    });
    return client.db(database).collection("user_activity");
  }
  return {
    async record(username, event) {
      const target = collection();
      const pipeline = activityPipeline(event);
      try {
        await target.updateOne({ _id: username }, pipeline, { upsert: true });
      } catch (error) {
        // Concurrent first requests can race on the built-in unique _id index.
        if (error.code !== 11000) throw error;
        await target.updateOne({ _id: username }, pipeline);
      }
    },
    async list(users) {
      const docs = await collection().find({ _id: { $in: users.map((u) => u.username) } }).toArray();
      return activityRows(users, docs);
    },
    close: () => client?.close()
  };
}

export function mountActivity(app, { store, users, requireAuth, requireAdmin }) {
  app.post("/api/activity/heartbeat", requireAuth, async (request, response) => {
    const deviceId = String(request.get("x-impala-instance-id") || request.user.deviceId || "legacy").slice(0, 96);
    try {
      await store.record(request.user.username, { deviceId, userAgent: request.get("user-agent") });
      response.json({ ok: true });
    } catch {
      response.status(503).json({ error: "Activity tracking is temporarily unavailable." });
    }
  });
  app.get("/api/admin/activity", requireAuth, requireAdmin, async (_request, response) => {
    try {
      response.json({ users: await store.list(users), recentDays: 30, overlapMinutes: 4 });
    } catch {
      response.status(503).json({ error: "Activity tracking is unavailable. Check the server MongoDB configuration and connection." });
    }
  });
}
