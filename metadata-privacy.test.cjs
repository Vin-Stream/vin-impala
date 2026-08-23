const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");

test("external metadata is owner-controlled and off by default", () => {
  const config = read("app-config.js");
  const preferences = read("ui-preferences.js");
  const settings = read("preferences.html");
  assert.match(preferences, /metadataEnabled: false/);
  assert.match(config, /preferences\.metadataEnabled !== true/);
  assert.match(settings, /If anonymity matters more than posters/);
  assert.match(settings, /Impala credentials, playlists, and file paths are not sent/);
});
