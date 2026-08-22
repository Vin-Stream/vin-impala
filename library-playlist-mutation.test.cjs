const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "songlist.js"), "utf8");
const libraryMetadataSource = fs.readFileSync(path.join(__dirname, "library-metadata-client.js"), "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

test("selection playlist mutations do not reconnect the library", () => {
  const addExisting = functionSource("addSelectedTracksToExistingPlaylist", "addSelectedTracksToNewPlaylist");
  const addNew = functionSource("addSelectedTracksToNewPlaylist", "buildImportMessage");
  assert.match(addExisting, /renderPage\(\{ allowLibraryLoad: false \}\)/);
  assert.match(addNew, /renderPage\(\{ allowLibraryLoad: false \}\)/);
});

test("failed library refresh preserves the last loaded catalog", () => {
  assert.match(source, /lastGoodLibraryState/);
  assert.match(source, /Library refresh interrupted; showing the last loaded catalog/);
  assert.match(source, /renderLibraryPanel\(\{ allowLoad: false \}\)/);
});

test("browser library metadata uses its locally defined path helper", () => {
  assert.match(source, /function getLibraryLeafName\(/);
  assert.doesNotMatch(source, /\bgetLeafName\(/);
});

test("playlist cards build lazy four-album artwork mosaics", () => {
  assert.match(libraryMetadataSource, /albums\.length === 4/);
  assert.match(libraryMetadataSource, /ImpalaPlaylistArtwork/);
  assert.match(source, /playlist-artwork-poster/);
  assert.match(source, /ImpalaPlaylistArtwork\?\.watch/);
});

