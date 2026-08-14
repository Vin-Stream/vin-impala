const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function read(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

test("ships local MKV playback enabled with Voice Sync controls", () => {
  const config = read("app-config.js");
  const html = read("index.html");

  assert.match(config, /mkvPlaybackEnabled:\s*true/);
  for (const id of [
    "voice-sync-panel",
    "voice-sync-earlier-btn",
    "voice-sync-value",
    "voice-sync-later-btn",
    "voice-sync-reset-btn",
    "voice-sync-save-btn"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("offers local-video corrected copies and named MKV group preparation", () => {
  const html = read("index.html");
  const localLibrary = read("modules/local-library.js");
  const resolver = read("media-resolver.js");
  assert.match(html, /voice-sync-corrected-btn/);
  assert.match(html, /mkv-bulk-status/);
  assert.match(localLibrary, /Prepare Entire.*Series/);
  assert.match(localLibrary, /prepareRelatedMkvQueue/);
  assert.match(resolver, /createCorrectedLocalVideo/);
  assert.match(resolver, /prepareLocalVideoTiming/);
  assert.match(resolver, /getLocalMkvGroup/);
});

test("passes the title offset to the Companion and wires all adjustments", () => {
  const localLibrary = read("modules/local-library.js");

  assert.match(localLibrary, /voiceSyncMs:\s*playerStateStore\.getVoiceSyncOffset\(song\)/);
  assert.match(localLibrary, /voiceSyncEarlierButton\?\.addEventListener/);
  assert.match(localLibrary, /voiceSyncLaterButton\?\.addEventListener/);
  assert.match(localLibrary, /voiceSyncResetButton\?\.addEventListener/);
  assert.match(localLibrary, /voiceSyncSaveButton\?\.addEventListener/);
  assert.match(localLibrary, /const resumePlayback[\s\S]*videoPlayer\?\.pause\(\)[\s\S]*playCurrentSong\(resumePlayback/);
});

test("loads local-library orchestration before the main player", () => {
  const html = read("index.html");
  const script = read("script.js");
  assert.ok(html.indexOf("modules/local-library.js") < html.indexOf("script.js?v="));
  assert.match(script, /ImpalaLocalLibrary\?\.create/);
  assert.match(script, /localLibraryController\.resolveLocalMedia/);
});
