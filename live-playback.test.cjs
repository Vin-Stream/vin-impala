const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule() {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/live-playback.js"), "utf8"),
    { window, console: { error() {} } },
    { filename: "modules/live-playback.js" }
  );
  return window.ImpalaLivePlayback.create;
}

function createVideo() {
  return {
    currentSrc: "",
    src: "",
    loadCount: 0,
    playCount: 0,
    getAttribute(name) { return name === "src" ? this.src : null; },
    load() { this.loadCount += 1; },
    async play() { this.playCount += 1; }
  };
}

test("loads and normalizes a live session", async () => {
  const loaded = [];
  const controller = loadModule()({
    videoPlayer: createVideo(),
    callbacks: { onSessionLoaded(session, autoPlay) { loaded.push({ session, autoPlay }); } }
  });
  assert.equal(await controller.loadSession({ streamUrl: " https://radio.example/live.m3u8 " }), true);
  assert.equal(controller.isActive(), true);
  assert.equal(controller.getSession().streamUrl, "https://radio.example/live.m3u8");
  assert.equal(controller.getSession().title, "Live Stream");
  assert.equal(loaded[0].autoPlay, false);
});

test("refreshes an enabled active session from the existing client", async () => {
  const controller = loadModule()({
    preferences: { getPreferences() { return { liveStreamEnabled: true }; } },
    client: {
      async getSession() {
        return { enabled: true, session: { status: "live", streamUrl: "https://radio.example/live.m3u8" } };
      }
    },
    videoPlayer: createVideo()
  });
  assert.equal(await controller.refresh(), true);
  assert.equal(controller.isActive(), true);
});

test("loads HLS through the adapter and starts playback", async () => {
  const video = createVideo();
  const adapterLoads = [];
  const statuses = [];
  const controller = loadModule()({
    videoPlayer: video,
    hlsAdapter: {
      canUseFor() { return true; },
      async load(element, url) { adapterLoads.push({ element, url }); }
    },
    callbacks: { onStatus(value) { statuses.push(value); } }
  });
  await controller.loadSession({ streamUrl: "https://radio.example/live.m3u8" });
  await controller.startPlayback();
  assert.equal(adapterLoads.length, 1);
  assert.equal(adapterLoads[0].url, "https://radio.example/live.m3u8");
  assert.equal(video.playCount, 1);
  assert.equal(statuses[0], "Loading");
});

test("falls back to the native media source when HLS initialization fails", async () => {
  const video = createVideo();
  const controller = loadModule()({
    videoPlayer: video,
    hlsAdapter: {
      canUseFor() { return true; },
      async load() { throw new Error("adapter failed"); }
    }
  });
  await controller.loadSession({ streamUrl: "https://radio.example/live.m3u8" });
  await controller.startPlayback();
  assert.equal(video.src, "https://radio.example/live.m3u8");
  assert.equal(video.loadCount, 1);
  assert.equal(video.playCount, 1);
});

test("loads live playback before the main player", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/live-playback.js") < html.indexOf("script.js?v="));
  assert.match(player, /ImpalaLivePlayback\?\.create/);
  assert.match(player, /livePlaybackController\.refresh/);
});
