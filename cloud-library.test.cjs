const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule() {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/cloud-library.js"), "utf8"),
    { window, URLSearchParams },
    { filename: "modules/cloud-library.js" }
  );
  return window.ImpalaCloudLibrary.create;
}

test("requests a signed cloud URL with the object key and media kind", async () => {
  const requests = [];
  const controller = loadModule()({
    getApiBaseUrl() { return "https://signer.example"; },
    async request(requestPath) {
      requests.push(requestPath);
      return { url: "https://storage.example/signed" };
    }
  });
  const result = await controller.resolveCloudMedia(
    { objectKey: "Albums/A Song.mp3" },
    { mediaKind: "audio", preferredMimeType: "audio/mpeg" }
  );
  const query = new URL(requests[0], "https://signer.example").searchParams;
  assert.equal(query.get("key"), "Albums/A Song.mp3");
  assert.equal(query.get("media"), "audio");
  assert.equal(query.has("contentType"), false);
  assert.deepEqual({ ...result }, { url: "https://storage.example/signed", source: "cloud" });
});

test("sends explicit content type and inferred video MIME type", async () => {
  const requests = [];
  const controller = loadModule()({
    getApiBaseUrl() { return "https://signer.example"; },
    async request(requestPath) {
      requests.push(requestPath);
      return { url: "https://storage.example/signed" };
    }
  });
  await controller.resolveCloudMedia(
    { objectKey: "Videos/one.mp4", contentType: "VIDEO/CUSTOM" },
    { mediaKind: "video", preferredMimeType: "video/mp4" }
  );
  await controller.resolveCloudMedia(
    { objectKey: "Videos/two.mp4" },
    { mediaKind: "video", preferredMimeType: "video/mp4" }
  );
  assert.equal(new URL(requests[0], "https://signer.example").searchParams.get("contentType"), "video/custom");
  assert.equal(new URL(requests[1], "https://signer.example").searchParams.get("contentType"), "video/mp4");
});

test("honors forced signer content type for audio", async () => {
  let requestPath = "";
  const controller = loadModule()({
    forceSignerContentType: true,
    getApiBaseUrl() { return "https://signer.example"; },
    async request(value) {
      requestPath = value;
      return { url: "https://storage.example/signed" };
    }
  });
  await controller.resolveCloudMedia(
    { objectKey: "Music/song.flac" },
    { mediaKind: "audio", preferredMimeType: "audio/flac" }
  );
  assert.equal(new URL(requestPath, "https://signer.example").searchParams.get("contentType"), "audio/flac");
});

test("rejects missing object keys, signer configuration, and signer URLs", async () => {
  const create = loadModule();
  await assert.rejects(
    create({ getApiBaseUrl() { return "https://signer.example"; } }).resolveCloudMedia({}, {}),
    /missing both objectKey and file path/
  );
  await assert.rejects(
    create({ getApiBaseUrl() { return ""; } }).resolveCloudMedia({ objectKey: "song.mp3" }, { mediaKind: "audio" }),
    /no API signer is configured/
  );
  await assert.rejects(
    create({
      getApiBaseUrl() { return "https://signer.example"; },
      async request() { return {}; }
    }).resolveCloudMedia({ objectKey: "song.mp3" }, { mediaKind: "audio" }),
    /did not return a media URL/
  );
});

test("loads cloud-library orchestration before the main player", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/cloud-library.js") < html.indexOf("script.js?v="));
  assert.match(player, /ImpalaCloudLibrary\?\.create/);
  assert.match(player, /cloudLibraryController\.resolveCloudMedia/);
});
