const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("video library provides poster-ready tiles while metadata remains optional", () => {
  const library = fs.readFileSync(path.join(__dirname, "songlist.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  const metadata = fs.readFileSync(path.join(__dirname, "library-metadata-client.js"), "utf8");

  assert.match(library, /is-video-tile-grid/);
  assert.match(library, /library-video-poster/);
  assert.match(styles, /aspect-ratio:\s*2\s*\/\s*3/);
  assert.match(styles, /repeat\(auto-fill, minmax\(9\.5rem, 1fr\)\)/);
  assert.match(styles, /grid-auto-rows:\s*max-content/);
  assert.match(styles, /height:\s*max-content/);
  assert.match(metadata, /metadata\?\.posterUrl \|\| metadata\?\.artworkUrl/);
});
