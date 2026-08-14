import assert from "node:assert/strict";
import test from "node:test";
import { createSyncPlayApp, createSessionToken } from "./app.js";
import { createSyncSessionStore } from "./session-store.js";

const sessionSecret = "test-session-secret";
const users = [{ username: "host" }, { username: "follower" }];

async function withServer(options, callback) {
  const app = createSyncPlayApp({
    sessionSecret,
    users,
    allowedOrigins: ["https://impala.example"],
    ...options
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function authHeaders(username) {
  return {
    Authorization: `Bearer ${createSessionToken({
      username,
      expiresAt: "2099-01-01T00:00:00.000Z"
    }, sessionSecret)}`,
    "Content-Type": "application/json",
    Origin: "https://impala.example"
  };
}

test("keeps Sync Play disabled by default", async () => {
  await withServer({ syncPlayEnabled: false }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sync/sessions`, {
      method: "POST",
      headers: authHeaders("host"),
      body: JSON.stringify({ mediaId: "media-1" })
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).enabled, false);
  });
});

test("requires an existing signed Impala session", async () => {
  await withServer({ syncPlayEnabled: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sync/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: "media-1" })
    });
    assert.equal(response.status, 401);
  });
});

test("rejects a valid signed user who is not on the active allow-list", async () => {
  await withServer({ syncPlayEnabled: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sync/sessions`, {
      method: "POST",
      headers: authHeaders("removed-user"),
      body: JSON.stringify({ mediaId: "media-1" })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "User is not authorized.");
  });
});

test("creates and joins an ephemeral session through the API", async () => {
  const store = createSyncSessionStore({
    now: () => Date.parse("2026-07-24T12:00:00.000Z"),
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4])
  });
  await withServer({ syncPlayEnabled: true, store }, async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/sync/sessions`, {
      method: "POST",
      headers: authHeaders("host"),
      body: JSON.stringify({ mediaId: "video/example.mp4", controlMode: "host" })
    });
    assert.equal(createdResponse.status, 201);
    assert.match(createdResponse.headers.get("cache-control"), /no-store/);
    const created = await createdResponse.json();

    const joinedResponse = await fetch(
      `${baseUrl}/api/sync/sessions/${created.session.code}/join`,
      { method: "POST", headers: authHeaders("follower"), body: "{}" }
    );
    assert.equal(joinedResponse.status, 200);
    const joined = await joinedResponse.json();
    assert.equal(joined.session.participants.length, 2);
    assert.equal(joined.session.playback.targetPositionSeconds, 0);
  });
});
