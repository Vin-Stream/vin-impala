const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadState(options = {}) {
  const window = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/player-state.js"), "utf8"),
    { window, Math }
  );
  const saved = { repeat: [], random: [] };
  const store = {
    loadRepeatMode: () => options.repeatMode || "off",
    saveRepeatMode(value) { saved.repeat.push(value); return value; },
    loadRandomMode: () => Boolean(options.randomMode),
    saveRandomMode(value) { saved.random.push(Boolean(value)); return Boolean(value); }
  };
  return {
    state: window.ImpalaPlayerState.create({
      store,
      random: options.random || (() => 0),
      randomHistoryLimit: options.randomHistoryLimit || 100
    }),
    saved
  };
}

test("cycles and persists repeat and shuffle modes", () => {
  const { state, saved } = loadState();
  assert.equal(state.cycleRepeatMode(), "one");
  assert.equal(state.cycleRepeatMode(), "all");
  assert.equal(state.toggleRandomMode(3), true);
  assert.deepEqual(saved.repeat, ["one", "all"]);
  assert.deepEqual(saved.random, [true]);
});

test("avoids immediately repeating the current random title", () => {
  const { state } = loadState({ random: () => 0 });
  state.toggleRandomMode(0);
  assert.equal(state.getRandomNextIndex(4, 0), 1);
});

test("moves backward and forward through random history", () => {
  const { state } = loadState({ random: () => 0.6 });
  state.toggleRandomMode(0);
  assert.equal(state.getRandomNextIndex(5, 0), 3);
  assert.equal(state.getPreviousRandomHistoryIndex(), 0);
  assert.equal(state.getRandomNextIndex(5, 0), 3);
});

test("loads runtime state modules before the main player", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/player-state.js") < html.indexOf("script.js?v="));
  assert.match(player, /ImpalaPlayerState\?\.create/);
  assert.doesNotMatch(player, /let randomHistory/);
  assert.doesNotMatch(player, /let repeatMode/);
});
