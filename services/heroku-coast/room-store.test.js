import assert from "node:assert/strict";
import test from "node:test";
import { createCoastRoomStore } from "./room-store.js";

test("enforces one host and one guest", () => {
  const store = createCoastRoomStore({ now: () => 1000, randomBytes: () => Buffer.from([0, 1, 2, 3, 4]) });
  const room = store.create({ username: "host", mediaId: "video/movie.mp4" });
  assert.equal(store.join({ code: room.code, username: "guest" }).participants, 2);
  assert.throws(() => store.join({ code: room.code, username: "third" }), /already has two people/);
});

test("host departure immediately deletes the room", () => {
  const store = createCoastRoomStore({ randomBytes: () => Buffer.from([0, 1, 2, 3, 4]) });
  const room = store.create({ username: "host", mediaId: "video/movie.mp4" });
  assert.equal(store.leave({ code: room.code, username: "host" }).ended, true);
  assert.throws(() => store.join({ code: room.code, username: "guest" }), /not found/);
});
