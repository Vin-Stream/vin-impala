const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadResolver(preferences = {}, fetchImpl = globalThis.fetch) {
  const source = fs.readFileSync(path.join(__dirname, "media-resolver.js"), "utf8");
  const context = {
    fetch: fetchImpl,
    URL,
    URLSearchParams,
    window: {
      setTimeout: (callback) => setTimeout(callback, 0),
      UiPreferences: {
        getPreferences: () => preferences
      }
    }
  };
  vm.runInNewContext(source, context, { filename: "media-resolver.js" });
  return context.window.MediaResolver;
}

test("classifies MKV files as Matroska video", () => {
  const resolver = loadResolver();
  const mediaInfo = resolver.getMediaInfo({
    objectKey: "Films/Feature.mkv"
  });

  assert.equal(mediaInfo.extension, "mkv");
  assert.equal(mediaInfo.mediaKind, "video");
  assert.equal(mediaInfo.preferredMimeType, "video/x-matroska");
  assert.deepEqual(
    Array.from(mediaInfo.mimeCandidates),
    ["video/x-matroska", "video/matroska"]
  );
});

test("prepares a local MKV through the Companion and reports progress", async () => {
  const requests = [];
  const responses = [
    {
      ok: true,
      json: async () => ({ preparation: { status: "preparing", progress: 25 } })
    },
    {
      ok: true,
      json: async () => ({
        preparation: { status: "ready", progress: 100 },
        mediaUrl: "/library/mkv/file?id=Films%2FFeature.mkv"
      })
    }
  ];
  const resolver = loadResolver(
    { localHelperEnabled: true, localHelperPort: "8089" },
    async (url, options) => {
      requests.push({ url, method: options.method });
      return responses.shift();
    }
  );
  const progress = [];

  const mediaUrl = await resolver.prepareLocalMkv({
    source: "local-service",
    objectKey: "Films/Feature.mkv"
  }, {
    voiceSyncMs: 125,
    onProgress: (status) => progress.push(status.progress)
  });

  assert.equal(mediaUrl, "http://127.0.0.1:8089/library/mkv/file?id=Films%2FFeature.mkv");
  assert.deepEqual(requests.map((request) => request.method), ["POST", "GET"]);
  assert.match(requests[0].url, /voiceSyncMs=150/);
  assert.deepEqual(progress, [25, 100]);
});

test("builds the existing local helper URL for an MKV title", () => {
  const resolver = loadResolver({
    localHelperEnabled: true,
    localHelperPort: "8089"
  });

  assert.equal(
    resolver.resolveLocalServiceUrl({
      source: "local-service",
      objectKey: "Films/Feature.mkv"
    }),
    "http://127.0.0.1:8089/library/file?id=Films%2FFeature.mkv"
  );
});

test("saves the selected Voice Sync timing through the Companion", async () => {
  let request = null;
  const resolver = loadResolver(
    { localHelperEnabled: true, localHelperPort: "8089" },
    async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true, voiceSyncMs: -150 }) };
    }
  );

  const result = await resolver.saveLocalMkvTiming({
    source: "local-service",
    objectKey: "Series/Season 1/Episode.mkv"
  }, -125);

  assert.equal(request.url, "http://127.0.0.1:8089/library/mkv/timing");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    id: "Series/Season 1/Episode.mkv",
    voiceSyncMs: -150
  });
  assert.equal(result.voiceSyncMs, -150);
});
