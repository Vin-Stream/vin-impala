const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function target(attributes = {}) {
  const listeners = {};
  return {
    ...attributes,
    listeners,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    dispatch(type, event = {}) { for (const handler of listeners[type] || []) handler({ target: this, ...event }); },
    getAttribute(name) { return this[name] || null; }
  };
}

function loadModule(document = target()) {
  const window = { document };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/ui-events.js"), "utf8"),
    { window },
    { filename: "modules/ui-events.js" }
  );
  return window.ImpalaUiEvents;
}

test("routes playlist, filter, and transport events to player actions", () => {
  const document = target();
  const playlistSelector = target({ value: "video" });
  const trackFilterInput = target({ value: "arcane" });
  const nextButton = target({ "data-action": "next" });
  const calls = [];
  loadModule(document).bind({
    document,
    elements: { playlistSelector, trackFilterInput, transportButtons: [nextButton] },
    actions: {
      onPlaylistChange(value) { calls.push(["playlist", value]); },
      onTrackFilter(value) { calls.push(["filter", value]); },
      onTransport(value) { calls.push(["transport", value]); }
    }
  });
  playlistSelector.dispatch("change");
  trackFilterInput.dispatch("input");
  nextButton.dispatch("click");
  assert.deepEqual(calls, [["playlist", "video"], ["filter", "arcane"], ["transport", "next"]]);
});

test("normalizes credentials before routing sign in", () => {
  const authForm = target();
  const calls = [];
  let prevented = false;
  loadModule().bind({
    elements: {
      authForm,
      authUsername: { value: "  kevin  " },
      authPassword: { value: " secret " }
    },
    actions: { onAuthSubmit(value) { calls.push(value); } }
  });
  authForm.dispatch("submit", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].username, "kevin");
  assert.equal(calls[0].password, " secret ");
});

test("opens the private About promo only for its guarded key gesture", () => {
  const document = target();
  const aboutDialog = target({ open: true });
  const aboutPromoDialog = target({ open: false });
  let opened = 0;
  let prevented = false;
  loadModule(document).bind({
    document,
    elements: { aboutDialog, aboutPromoDialog },
    actions: { onOpenPromo() { opened += 1; } }
  });
  document.dispatch("keydown", {
    key: "p",
    preventDefault() { prevented = true; },
    stopImmediatePropagation() {}
  });
  assert.equal(opened, 1);
  assert.equal(prevented, true);
});

test("loads UI event binding before the main player", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/ui-events.js") < html.indexOf("script.js?v="));
  assert.match(player, /const uiEvents = window\.ImpalaUiEvents/);
  assert.match(player, /uiEvents\.bind/);
});
