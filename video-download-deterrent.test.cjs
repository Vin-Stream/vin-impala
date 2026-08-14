const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;

test("video player removes the casual browser download path", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

  assert.match(
    html,
    /<video\s+id="videoPlayer"[^>]*controlslist="nodownload"[^>]*>/
  );
  assert.match(
    script,
    /videoPlayer\?\.addEventListener\("contextmenu",\s*\(event\)\s*=>\s*{\s*event\.preventDefault\(\);\s*}\);/
  );
});
