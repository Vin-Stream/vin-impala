const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

test("heartbeats skip idle hidden tabs, track background playback, and tolerate failures", async () => {
  let tick;
  let now = 200000;
  let playing = false;
  let session = { token: "signed-token" };
  const calls = [];
  const document = {
    hidden: true,
    querySelectorAll: () => [{ paused: !playing, ended: false }],
    addEventListener() {}
  };
  vm.runInNewContext(fs.readFileSync(__dirname + "/activity-client.js", "utf8"), {
    document,
    window: {
      AuthSession: { load: () => session },
      ImpalaApiClient: { getApiBaseUrl: () => "https://example.test" },
      ImpalaConfig: { getInstanceId: () => "browser-one" }
    },
    Date: { now: () => now }, AbortSignal,
    setInterval: (callback) => { tick = callback; },
    fetch: async (...args) => { calls.push(args); throw Error("offline"); }
  });
  assert.equal(calls.length, 0);
  playing = true;
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].headers.Authorization, "Bearer signed-token");
  await tick();
  assert.equal(calls.length, 1);
  now += 120000;
  playing = false;
  document.hidden = false;
  await tick();
  assert.equal(calls.length, 2);
  now += 120000;
  session = null;
  await tick();
  assert.equal(calls.length, 2);
});
