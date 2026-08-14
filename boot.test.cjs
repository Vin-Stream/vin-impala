const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule() {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/boot.js"), "utf8"),
    { window },
    { filename: "modules/boot.js" }
  );
  return window.ImpalaBoot;
}

test("initializes modules and restores saved playlist playback in order", async () => {
  const calls = [];
  const savedState = { playlistId: "favorites", songIndex: 3, playbackState: "playing" };
  const result = await loadModule().run({
    actions: {
      initializeCollaboration() { calls.push("collaboration"); },
      setInitialMediaMode(value) { calls.push(`mode:${value}`); },
      renderRepeatMode() { calls.push("repeat"); },
      renderRandomMode() { calls.push("random"); },
      renderMediaSource(value) { calls.push(`source:${value}`); },
      refreshRegistry() { calls.push("registry"); return [{ id: "favorites" }]; },
      updateAuthUi() { calls.push("auth"); },
      watchAuthNotice() { calls.push("auth-watch"); },
      loadPlayerState() { calls.push("load-state"); return savedState; },
      selectPlaylist(value) { calls.push(`playlist:${value.playlistId}:${value.songIndex}`); },
      resetRandomHistory() { calls.push("random-history"); },
      async refreshLiveSession() { calls.push("live"); return false; },
      hasCurrentPlaylistSongs() { return true; },
      async restorePlayback(options) { calls.push(`restore:${options.autoPlay}:${options.useSavedPosition}`); }
    }
  });
  assert.equal(result.ready, true);
  assert.equal(result.liveSessionActive, false);
  assert.deepEqual(calls, [
    "collaboration", "mode:audio", "repeat", "random", "source:unknown",
    "registry", "auth", "auth-watch", "load-state", "playlist:favorites:3",
    "random-history", "live", "restore:true:true"
  ]);
});

test("stops safely when there are no playlists", async () => {
  const statuses = [];
  let loadedState = false;
  const result = await loadModule().run({
    actions: {
      refreshRegistry() { return []; },
      updateStatus(value) { statuses.push(value); },
      loadPlayerState() { loadedState = true; }
    }
  });
  assert.equal(result.ready, false);
  assert.equal(result.reason, "no-playlists");
  assert.deepEqual(statuses, ["No playlists"]);
  assert.equal(loadedState, false);
});

test("does not restore playlist playback over an active live session", async () => {
  let restored = false;
  const result = await loadModule().run({
    actions: {
      refreshRegistry() { return [{ id: "main" }]; },
      loadPlayerState() { return { playlistId: "main", songIndex: 0, playbackState: "playing" }; },
      async refreshLiveSession() { return true; },
      hasCurrentPlaylistSongs() { return true; },
      async restorePlayback() { restored = true; }
    }
  });
  assert.equal(result.liveSessionActive, true);
  assert.equal(restored, false);
});

test("loads boot coordination before the main player", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/boot.js") < html.indexOf("script.js?v="));
  assert.match(player, /const boot = window\.ImpalaBoot/);
  assert.match(player, /boot\.run/);
});
