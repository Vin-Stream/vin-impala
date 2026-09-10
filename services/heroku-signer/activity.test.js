import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { activityRows, activityPipeline, mountActivity, RECENT_MS } from "./activity.js";
import { authorizeSession, createSessionToken, sendAuthError } from "./session-token.js";

test("activity list includes unused invitees and excludes credentials and removed users", () => {
  const now = Date.now();
  const users = [{ username: "unused", passwordHash: "secret" }, { username: "old", isAdmin: true }];
  const result = activityRows(users, [
    { _id: "removed", lastSeenAt: new Date() },
    { _id: "old", lastSeenAt: new Date(now - RECENT_MS - 1), devices: [
      { id: "expired", lastSeenAt: new Date(now - RECENT_MS - 1) }
    ] }
  ], now);
  assert.equal(result.length, 2);
  assert.equal(result[0].lastSeenAt, null);
  assert.equal(result[0].inactive, false);
  assert.equal(result[1].inactive, true);
  assert.equal(result[1].deviceCount, 0);
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("pipeline bounds device retention, protects literal input and distinguishes logins", () => {
  const now = new Date();
  const event = { deviceId: "browser", userAgent: "$malicious.field" };
  const heartbeat = activityPipeline(event, now);
  const login = activityPipeline({ ...event, login: true }, now);
  assert.equal(heartbeat[0].$set.loginCount.$add[1], 0);
  assert.equal(login[0].$set.loginCount.$add[1], 1);
  assert.equal(login[0].$set.lastLoginAt, now);
  assert.equal(heartbeat[1].$set.devices.$slice[1], -32);
  assert.equal(heartbeat[1].$set.devices.$slice[0].$concatArrays[1].$literal[0].userAgent, "$malicious.field");
  assert.notEqual(heartbeat[1].$set.devices.$slice[0].$concatArrays[1].$literal[0].id, "browser");
});

test("routes enforce signed identity, current allow-list and admin role; outages are explicit", async (t) => {
  const secret = "activity-test-secret";
  const users = [{ username: "alice" }, { username: "admin", isAdmin: true }];
  const recorded = [];
  let unavailable = false;
  const store = {
    async record(...args) { if (unavailable) throw Error("sensitive URI"); recorded.push(args); },
    async list() { if (unavailable) throw Error("sensitive URI"); return []; }
  };
  const app = express();
  app.use(express.json());
  mountActivity(app, {
    users, store,
    requireAuth(req, res, next) {
      try {
        const { payload, configuredUser } = authorizeSession({ authorization: req.get("authorization"), sessionSecret: secret, users });
        req.user = { ...payload, isAdmin: configuredUser.isAdmin === true };
        next();
      } catch (error) { sendAuthError(res, error); }
    },
    requireAdmin(req, res, next) { if (!req.user.isAdmin) return res.sendStatus(403); next(); }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (username) => createSessionToken({ sub: username, exp: new Date(Date.now() + 60000).toISOString(), roles: ["admin"] }, secret);
  const call = (path, user, method = "GET") => fetch(base + path, {
    method, headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), "Content-Type": "application/json", "X-Impala-Instance-Id": "browser" },
    ...(method === "POST" ? { body: JSON.stringify({ username: "admin" }) } : {})
  });
  assert.equal((await call("/api/activity/heartbeat", null, "POST")).status, 401);
  assert.equal((await call("/api/activity/heartbeat", "removed", "POST")).status, 403);
  assert.equal((await call("/api/activity/heartbeat", "alice", "POST")).status, 200);
  assert.equal(recorded[0][0], "alice");
  assert.equal((await call("/api/admin/activity", "alice")).status, 403);
  assert.equal((await call("/api/admin/activity", "admin")).status, 200);
  unavailable = true;
  const failed = await call("/api/activity/heartbeat", "alice", "POST");
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("sensitive"));
  assert.equal((await call("/api/admin/activity", "admin")).status, 503);
});
