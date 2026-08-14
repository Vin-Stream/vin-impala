import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createLiveStreamApp, createSessionToken } from "./app.js";

const sessionSecret = "test-secret";
let server;
let baseUrl;

before(async () => {
  const app = createLiveStreamApp({
    sessionSecret,
    liveStreamEnabled: true,
    allowedOrigins: ["http://localhost:8000"],
    users: [
      { username: "admin", isAdmin: true },
      { username: "listener", isAdmin: false }
    ],
    streamCatalog: [
      {
        id: "enabled-stream",
        title: "Enabled Stream",
        description: "Visible stream",
        category: "Test",
        streamUrl: "https://example.com/enabled.m3u8",
        enabled: true,
        reviewStatus: "approved",
        notes: "private"
      },
      {
        id: "pending-stream",
        title: "Pending Stream",
        streamUrl: "https://example.com/pending.m3u8",
        enabled: false
      }
    ]
  });

  server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("requires authentication for session status", async () => {
  const response = await fetch(`${baseUrl}/api/live/session`);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error, "Authentication required.");
});

test("allows signed users to read live stream status", async () => {
  const response = await fetch(`${baseUrl}/api/live/session`, {
    headers: {
      Authorization: `Bearer ${tokenFor("listener", false)}`
    }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.enabled, true);
  assert.equal(payload.session.status, "idle");
});

test("allows signed users to read the enabled stream catalog", async () => {
  const response = await fetch(`${baseUrl}/api/streams`, {
    headers: {
      Authorization: `Bearer ${tokenFor("listener", false)}`
    }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.streams, [{
    id: "enabled-stream",
    title: "Enabled Stream",
    description: "Visible stream",
    category: "Test",
    streamUrl: "https://example.com/enabled.m3u8",
    enabled: true
  }]);
});

test("requires authentication for the stream catalog", async () => {
  const response = await fetch(`${baseUrl}/api/streams`);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error, "Authentication required.");
});

test("rejects signed users who are not in the allowed user list", async () => {
  const response = await fetch(`${baseUrl}/api/live/session`, {
    headers: {
      Authorization: `Bearer ${tokenFor("removed-user", false)}`
    }
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error, "User is not authorized.");
});

test("allows any allowed signed user to start and stop a live stream session", async () => {
  const startResponse = await fetch(`${baseUrl}/api/live/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenFor("listener", false)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "start",
      title: "Listener Stream",
      streamUrl: "https://example.com/listener.m3u8"
    })
  });
  const startPayload = await startResponse.json();

  assert.equal(startResponse.status, 202);
  assert.equal(startPayload.session.status, "live");
  assert.equal(startPayload.session.title, "Listener Stream");
  assert.equal(startPayload.session.streamUrl, "https://example.com/listener.m3u8");
  assert.equal(startPayload.session.host, "listener");

  const stopResponse = await fetch(`${baseUrl}/api/live/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenFor("listener", false)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "stop" })
  });
  const stopPayload = await stopResponse.json();

  assert.equal(stopResponse.status, 200);
  assert.equal(stopPayload.session.status, "idle");
});

test("allows admin users to start and stop a live stream session too", async () => {
  const startResponse = await fetch(`${baseUrl}/api/live/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenFor("admin", true)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "start",
      title: "HTTP Test Stream",
      streamUrl: "https://example.com/live/master.m3u8"
    })
  });
  const startPayload = await startResponse.json();

  assert.equal(startResponse.status, 202);
  assert.equal(startPayload.session.status, "live");
  assert.equal(startPayload.session.title, "HTTP Test Stream");
  assert.equal(startPayload.session.streamUrl, "https://example.com/live/master.m3u8");
  assert.equal(startPayload.session.host, "admin");
  assert.ok(startPayload.session.sessionId);

  const stopResponse = await fetch(`${baseUrl}/api/live/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenFor("admin", true)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "stop" })
  });
  const stopPayload = await stopResponse.json();

  assert.equal(stopResponse.status, 200);
  assert.equal(stopPayload.session.status, "idle");
  assert.equal(stopPayload.session.sessionId, startPayload.session.sessionId);
});

test("reports disabled service without mutating session", async () => {
  const disabledApp = createLiveStreamApp({
    sessionSecret,
    liveStreamEnabled: false,
    users: [{ username: "admin", isAdmin: true }]
  });
  const disabledServer = await new Promise((resolve) => {
    const instance = disabledApp.listen(0, () => resolve(instance));
  });

  try {
    const address = disabledServer.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/live/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenFor("admin", true)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "start",
        streamUrl: "https://example.com/live/master.m3u8"
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.enabled, false);
    assert.equal(payload.error, "Live stream service is not enabled.");
  } finally {
    await new Promise((resolve, reject) => {
      disabledServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function tokenFor(username, isAdmin) {
  return createSessionToken({
    username,
    isAdmin,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }, sessionSecret);
}
