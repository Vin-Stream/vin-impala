const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function element() {
  const classes = new Set();
  return {
    textContent: "",
    hidden: false,
    attributes: {},
    children: [],
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
      contains(value) { return classes.has(value); }
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...values) { this.children.push(...values); }
  };
}

function loadView() {
  const body = element();
  const document = {
    body,
    createTextNode(value) { return { textContent: value }; },
    createElement(tagName) { return { tagName }; }
  };
  const window = { document };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/player-view.js"), "utf8"),
    { window }
  );
  return { create: window.ImpalaPlayerView.create, document, element };
}

test("renders media, repeat, and shuffle modes", () => {
  const { create, document } = loadView();
  const audioPlayer = element();
  const videoScreen = element();
  const repeatModeButton = element();
  const randomModeButton = element();
  const lcdRepeatIndicator = element();
  const lcdShuffleIndicator = element();
  const view = create({ document, elements: {
    audioPlayer, videoScreen, repeatModeButton, randomModeButton,
    lcdRepeatIndicator, lcdShuffleIndicator
  }});
  assert.equal(view.setMediaMode("video"), "video");
  assert.equal(audioPlayer.hidden, true);
  assert.equal(videoScreen.hidden, false);
  view.renderRepeatMode("one");
  assert.equal(repeatModeButton.textContent, "Repeat One");
  assert.equal(lcdRepeatIndicator.textContent, "Repeat 1");
  view.renderRandomMode(true);
  assert.equal(randomModeButton.classList.contains("is-active"), true);
  assert.equal(lcdShuffleIndicator.hidden, false);
});

test("renders Now Playing and source details", () => {
  const { create, document } = loadView();
  const elements = {
    statusDisplay: element(), currentSongDisplay: element(), playlistDisplay: element(),
    asideText: element(), mediaSourceBadge: element()
  };
  const view = create({ document, elements });
  const source = view.renderStatus({
    status: "Playing",
    playlist: { name: "Road Mix" },
    song: { name: "The Distance", artist: "Cake" },
    mediaSource: "cloud",
    mediaUrl: "https://signed.example/song",
    isLocalServicePlaylist: false,
    isLocalServiceSong: false
  });
  assert.equal(source, "cloud");
  assert.equal(elements.statusDisplay.textContent, "Playing");
  assert.equal(elements.currentSongDisplay.children[0].textContent, "The Distance");
  assert.equal(elements.playlistDisplay.textContent, "Road Mix");
  assert.equal(elements.mediaSourceBadge.textContent, "Cloud");
  assert.match(elements.mediaSourceBadge.attributes.title, /signed cloud URL/);
});

test("loads player view before the main player", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/player-view.js") < html.indexOf("script.js?v="));
  assert.match(player, /ImpalaPlayerView\?\.create/);
  assert.match(player, /playerView\.renderStatus/);
  assert.match(player, /playerView\.renderHero/);
});
