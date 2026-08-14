const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule() {
  const window = { sessionStorage: { getItem() { return null; }, setItem() {} } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/local-library.js"), "utf8"),
    { window, console },
    { filename: "modules/local-library.js" }
  );
  return window.ImpalaLocalLibrary.create;
}

function createStore(offset = 0) {
  return {
    getVoiceSyncOffset() { return offset; },
    normalizeVoiceSyncOffset(value) { return value; },
    saveVoiceSyncOffset() {}
  };
}

test("resolves ordinary local media without invoking the Companion", async () => {
  const create = loadModule();
  const resolver = {
    isLocalServiceMkv() { return false; },
    isLocalServiceVideo() { return false; },
    resolveLocalMediaUrl() { return "file:///C:/Media/song.mp3"; }
  };
  const controller = create({ mediaResolver: resolver, playerStateStore: createStore() });
  const result = await controller.resolveLocalMedia({ file: "song.mp3" }, { mediaKind: "audio" }, "song.mp3");
  assert.deepEqual({ ...result }, { url: "file:///C:/Media/song.mp3", source: "local" });
});

test("prepares local MKV through the existing resolver with saved timing", async () => {
  const create = loadModule();
  const calls = [];
  const song = { source: "local-service", objectKey: "Series/Episode.mkv" };
  const resolver = {
    isLocalHelperEnabled() { return true; },
    isLocalServiceMkv() { return true; },
    isLocalServiceVideo() { return true; },
    async getLocalMkvGroup() { return null; },
    async prepareLocalMkv(value, options) {
      calls.push({ value, options });
      return "http://127.0.0.1/prepared.mp4";
    }
  };
  const controller = create({
    mediaResolver: resolver,
    playerStateStore: createStore(150),
    config: { isMkvPlaybackEnabled() { return true; } },
    sessionStorage: { getItem() { return null; }, setItem() {} }
  });
  const result = await controller.resolveLocalMedia(song, { extension: "mkv", mediaKind: "video" }, song.objectKey);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.voiceSyncMs, 150);
  assert.deepEqual({ ...result }, {
    url: "http://127.0.0.1/prepared.mp4",
    source: "local",
    contentType: "video/mp4"
  });
});

test("keeps cloud object keys outside local-library resolution", async () => {
  const create = loadModule();
  const controller = create({
    mediaResolver: {
      isLocalServiceMkv() { return false; },
      isLocalServiceVideo() { return false; },
      resolveLocalMediaUrl() { return ""; }
    },
    playerStateStore: createStore()
  });
  const result = await controller.resolveLocalMedia(
    { objectKey: "Music/song.mp3" },
    { mediaKind: "audio" },
    "Music/song.mp3"
  );
  assert.equal(result, null);
});
