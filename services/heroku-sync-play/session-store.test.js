import assert from "node:assert/strict";
import test from "node:test";
import {
  authoritativePosition,
  createSyncSessionStore,
  SyncPlayError
} from "./session-store.js";

function createHarness(options = {}) {
  let clock = Date.parse("2026-07-24T12:00:00.000Z");
  const store = createSyncSessionStore({
    now: () => clock,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    sessionTtlMs: options.sessionTtlMs
  });
  return {
    store,
    advance(milliseconds) {
      clock += milliseconds;
    }
  };
}

test("creates an ephemeral session with an authoritative paused timeline", () => {
  const { store } = createHarness();
  const session = store.createSession({
    hostUsername: "Kevin",
    mediaId: "video/movies/example.mp4",
    controlMode: "host"
  });

  assert.equal(session.code, "IMPALA-ABCDE");
  assert.equal(session.host, "kevin");
  assert.equal(session.mediaId, "video/movies/example.mp4");
  assert.equal(session.playback.status, "paused");
  assert.equal(session.playback.targetPositionSeconds, 0);
  assert.equal(session.participants.length, 1);
  assert.equal(session.participants[0].role, "host");
});

test("joins followers without exposing usernames in participant snapshots", () => {
  const { store } = createHarness();
  const created = store.createSession({ hostUsername: "host", mediaId: "media-1" });
  const joined = store.joinSession({ code: created.code, username: "Follower" });

  assert.equal(joined.participants.length, 2);
  assert.deepEqual(joined.participants.map((participant) => participant.role), ["host", "follower"]);
  assert.equal(Object.hasOwn(joined.participants[1], "username"), false);
});

test("uses the service clock to advance a playing timeline", () => {
  const { store, advance } = createHarness();
  const created = store.createSession({ hostUsername: "host", mediaId: "media-1" });
  store.applyCommand({
    code: created.code,
    username: "host",
    action: "play",
    positionSeconds: 10
  });
  advance(2500);

  const session = store.getSession({ code: created.code, username: "host" });
  assert.equal(session.playback.targetPositionSeconds, 12.5);
});

test("preserves the authoritative position when pausing", () => {
  const { store, advance } = createHarness();
  const created = store.createSession({ hostUsername: "host", mediaId: "media-1" });
  store.applyCommand({ code: created.code, username: "host", action: "play", positionSeconds: 20 });
  advance(3000);
  const paused = store.applyCommand({ code: created.code, username: "host", action: "pause" });
  advance(5000);
  const session = store.getSession({ code: created.code, username: "host" });

  assert.equal(paused.playback.targetPositionSeconds, 23);
  assert.equal(session.playback.targetPositionSeconds, 23);
});

test("enforces host-only controls while allowing shared controls when selected", () => {
  const { store } = createHarness();
  const hostOnly = store.createSession({ hostUsername: "host", mediaId: "media-1" });
  store.joinSession({ code: hostOnly.code, username: "follower" });

  assert.throws(
    () => store.applyCommand({ code: hostOnly.code, username: "follower", action: "play" }),
    (error) => error instanceof SyncPlayError && error.statusCode === 403
  );

  const sharedStore = createSyncSessionStore({
    now: () => Date.parse("2026-07-24T12:00:00.000Z"),
    randomBytes: () => Buffer.from([5, 6, 7, 8, 9])
  });
  const shared = sharedStore.createSession({
    hostUsername: "host",
    mediaId: "media-2",
    controlMode: "shared"
  });
  sharedStore.joinSession({ code: shared.code, username: "follower" });
  const result = sharedStore.applyCommand({
    code: shared.code,
    username: "follower",
    action: "play"
  });
  assert.equal(result.playback.status, "playing");
});

test("calculates drift from participant reports without changing the master clock", () => {
  const { store, advance } = createHarness();
  const created = store.createSession({ hostUsername: "host", mediaId: "media-1" });
  store.joinSession({ code: created.code, username: "follower" });
  store.applyCommand({ code: created.code, username: "host", action: "play", positionSeconds: 40 });
  advance(2000);

  const report = store.reportState({
    code: created.code,
    username: "follower",
    positionSeconds: 41.2,
    status: "playing"
  });

  assert.equal(report.targetPositionSeconds, 42);
  assert.equal(report.driftSeconds, -0.8);
  assert.equal(report.correctionRequired, true);
  assert.equal(
    store.getSession({ code: created.code, username: "host" }).playback.targetPositionSeconds,
    42
  );
});

test("ends a session when its host leaves", () => {
  const { store } = createHarness();
  const created = store.createSession({ hostUsername: "host", mediaId: "media-1" });
  const result = store.leaveSession({ code: created.code, username: "host" });

  assert.deepEqual(result, { ended: true, code: created.code });
  assert.equal(store.size, 0);
});

test("automatically removes expired sessions", () => {
  const { store, advance } = createHarness({ sessionTtlMs: 1000 });
  const created = store.createSession({ hostUsername: "host", mediaId: "media-1" });
  advance(1001);

  assert.equal(store.removeExpiredSessions(), 1);
  assert.throws(
    () => store.getSession({ code: created.code, username: "host" }),
    (error) => error instanceof SyncPlayError && error.statusCode === 404
  );
});

test("computes authoritative positions independently", () => {
  assert.equal(authoritativePosition({
    status: "playing",
    positionSeconds: 5,
    playbackRate: 1.5,
    effectiveAtMs: 1000
  }, 3000), 8);
});
