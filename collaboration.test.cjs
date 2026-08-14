const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule() {
  const window = { setTimeout };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/collaboration.js"), "utf8"),
    { window, decodeURIComponent, Number, console },
    { filename: "modules/collaboration.js" }
  );
  return window.ImpalaCollaboration.create;
}

test("enforces shared-session transport permissions", () => {
  const controller = loadModule()({
    syncControllerApi: { init() { return { active: true, canControl: false }; } },
    coastControllerApi: { init() { return { active: false, canControl: true }; } }
  });
  controller.initialize();
  assert.equal(controller.authorize("next").allowed, false);
  assert.match(controller.authorize("next").message, /Leave the shared session/);
  assert.equal(controller.authorize("pause").allowed, false);
  assert.match(controller.authorize("pause").message, /Only the host/);
});

test("shares only cloud video titles outside live playback", () => {
  let song = { objectKey: "Videos/movie.mp4", source: "cloud" };
  let live = false;
  const controller = loadModule()({
    callbacks: {
      getCurrentSong() { return song; },
      getMediaInfo() { return { mediaKind: "video" }; },
      isLivePlaybackActive() { return live; }
    }
  });
  assert.deepEqual({ ...controller.getCurrentVideo() }, { mediaId: "Videos/movie.mp4" });
  song = { ...song, source: "local-service" };
  assert.equal(controller.getCurrentVideo(), null);
  song = { objectKey: "Videos/movie.mp4", source: "cloud" };
  live = true;
  assert.equal(controller.getCurrentVideo(), null);
});

test("loads an existing shared video and restores its position", async () => {
  const selected = [];
  const played = [];
  const video = { readyState: 1, currentTime: 0 };
  const song = { objectKey: "Videos/movie.mp4", source: "cloud" };
  const playlist = { id: "videos", songs: [song] };
  const controller = loadModule()({
    videoElement: video,
    callbacks: {
      refreshPlaylists() { return [playlist]; },
      getMediaInfo() { return { mediaKind: "video" }; },
      getCurrentSong() { return null; },
      getSongIdentity(value) { return value?.objectKey || ""; },
      selectPlaylist(id, index) { selected.push({ id, index }); },
      async playSong(index, position) { played.push({ index, position }); }
    }
  });
  await controller.ensureVideo("Videos/movie.mp4", 42);
  assert.deepEqual(selected, [{ id: "videos", index: 0 }]);
  assert.deepEqual(played, [{ index: 0, position: 42 }]);
  assert.equal(video.currentTime, 42);
});

test("creates one runtime playlist when the shared video is absent", async () => {
  let playlists = [];
  const controller = loadModule()({
    videoElement: { readyState: 1, currentTime: 0 },
    callbacks: {
      refreshPlaylists() { return playlists; },
      setPlaylists(value) { playlists = value; },
      getMediaInfo() { return { mediaKind: "video" }; },
      getCurrentSong() { return null; },
      getSongIdentity() { return ""; },
      selectPlaylist() {},
      async playSong() {}
    }
  });
  await controller.ensureVideo("Films/My%20Movie.mp4", 0);
  assert.equal(playlists.length, 1);
  assert.equal(playlists[0].id, "sync-play-runtime");
  assert.equal(playlists[0].songs[0].name, "My Movie");
});

test("loads collaboration before the main player", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/collaboration.js") < html.indexOf("script.js?v="));
  assert.match(player, /ImpalaCollaboration\?\.create/);
  assert.match(player, /collaborationController\.initialize/);
});
