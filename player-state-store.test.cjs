const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

function loadStore() {
  const source = fs.readFileSync(path.join(__dirname, "player-state-store.js"), "utf8");
  const context = {
    console,
    localStorage: createStorage(),
    window: {
      KW_PLAYER_CONFIG: { playlistStoragePrefix: "testImpala" },
      TrackSelectionStore: {
        getSongIdentity: (song) => String(song?.objectKey || "")
      }
    }
  };
  vm.runInNewContext(source, context, { filename: "player-state-store.js" });
  return context.window.PlayerStateStore;
}

test("normalizes Voice Sync to 50 ms steps inside a two-second range", () => {
  const store = loadStore();
  assert.equal(store.normalizeVoiceSyncOffset(126), 150);
  assert.equal(store.normalizeVoiceSyncOffset(-126), -150);
  assert.equal(store.normalizeVoiceSyncOffset(9000), 2000);
  assert.equal(store.normalizeVoiceSyncOffset(-9000), -2000);
});

test("stores Voice Sync only for the selected title on this device", () => {
  const store = loadStore();
  const firstTitle = { objectKey: "Films/First.mkv" };
  const secondTitle = { objectKey: "Films/Second.mkv" };

  assert.equal(store.saveVoiceSyncOffset(firstTitle, 135), 150);
  assert.equal(store.getVoiceSyncOffset(firstTitle), 150);
  assert.equal(store.getVoiceSyncOffset(secondTitle), 0);

  store.saveVoiceSyncOffset(firstTitle, 0);
  assert.equal(store.getVoiceSyncOffset(firstTitle), 0);
});

test("uses the title sidecar timing when this browser has no override", () => {
  const store = loadStore();
  const title = { objectKey: "Series/Episode.mkv", voiceSyncMs: -250 };

  assert.equal(store.getVoiceSyncOffset(title), -250);
  store.saveVoiceSyncOffset(title, 100);
  assert.equal(store.getVoiceSyncOffset(title), 100);
});
