import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiveStreamPayload,
  createInitialLiveStreamState,
  reduceLiveStreamAction,
  sanitizeLiveStreamTitle,
  sanitizeLiveStreamUrl
} from "./session-state.js";

test("sanitizes live stream titles", () => {
  assert.equal(sanitizeLiveStreamTitle("  Friday   Night   Test  "), "Friday Night Test");
  assert.equal(sanitizeLiveStreamTitle(""), "Impala Live Stream");
  assert.equal(sanitizeLiveStreamTitle("x".repeat(160)).length, 120);
});

test("sanitizes live stream URLs", () => {
  assert.equal(
    sanitizeLiveStreamUrl(" https://example.com/live/master.m3u8 "),
    "https://example.com/live/master.m3u8"
  );
  assert.equal(sanitizeLiveStreamUrl("ftp://example.com/live"), "");
  assert.equal(sanitizeLiveStreamUrl("not a url"), "");
});

test("starts a live stream session", () => {
  const result = reduceLiveStreamAction(createInitialLiveStreamState(), {
    action: "start",
    title: "Pilot Stream",
    streamUrl: "https://example.com/live/master.m3u8",
    username: "Kevin",
    now: "2026-06-27T12:00:00.000Z",
    sessionId: "session-1"
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 202);
  assert.deepEqual(result.state, {
    sessionId: "session-1",
    status: "live",
    title: "Pilot Stream",
    streamUrl: "https://example.com/live/master.m3u8",
    startedAt: "2026-06-27T12:00:00.000Z",
    updatedAt: "2026-06-27T12:00:00.000Z",
    host: "kevin"
  });
});

test("updates and stops a live stream session", () => {
  const started = reduceLiveStreamAction(createInitialLiveStreamState(), {
    action: "start",
    title: "First Title",
    streamUrl: "https://example.com/first.m3u8",
    username: "kevin",
    now: "2026-06-27T12:00:00.000Z",
    sessionId: "session-1"
  }).state;
  const updated = reduceLiveStreamAction(started, {
    action: "update",
    title: "Second Title",
    streamUrl: "https://example.com/second.m3u8",
    now: "2026-06-27T12:02:00.000Z"
  }).state;
  const stopped = reduceLiveStreamAction(updated, {
    action: "stop",
    now: "2026-06-27T12:05:00.000Z"
  }).state;

  assert.equal(updated.title, "Second Title");
  assert.equal(updated.streamUrl, "https://example.com/second.m3u8");
  assert.equal(updated.status, "live");
  assert.equal(stopped.status, "idle");
  assert.equal(stopped.sessionId, "session-1");
  assert.equal(stopped.updatedAt, "2026-06-27T12:05:00.000Z");
});

test("rejects invalid live stream URLs", () => {
  const result = reduceLiveStreamAction(createInitialLiveStreamState(), {
    action: "start",
    title: "Bad Stream",
    streamUrl: "not a stream url"
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.match(result.error, /valid http or https URL/);
});

test("rejects unknown live stream actions", () => {
  const result = reduceLiveStreamAction(createInitialLiveStreamState(), {
    action: "dance"
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.match(result.error, /start, stop, or update/);
});

test("builds a safe live stream payload copy", () => {
  const state = createInitialLiveStreamState();
  const payload = buildLiveStreamPayload({ enabled: true, state });
  payload.session.status = "live";

  assert.equal(payload.enabled, true);
  assert.equal(state.status, "idle");
});
