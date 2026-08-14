const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadController() {
  function createEventTarget(initial = {}) {
    const listeners = new Map();
    return Object.assign(initial, {
      addEventListener(event, handler) {
        const values = listeners.get(event) || [];
        values.push(handler);
        listeners.set(event, values);
      },
      removeEventListener(event, handler) {
        listeners.set(event, (listeners.get(event) || []).filter((value) => value !== handler));
      },
      emit(event) {
        for (const handler of listeners.get(event) || []) handler({ type: event });
      }
    });
  }
  const actions = new Map();
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    positionState: null,
    setActionHandler(action, handler) { actions.set(action, handler); },
    setPositionState(state) { this.positionState = state; }
  };
  class MediaMetadata {
    constructor(value) { Object.assign(this, value); }
  }
  const document = createEventTarget({ hidden: false });
  const window = createEventTarget({
    location: { href: "https://impala.discrete-dev.com/index.html" },
    MediaMetadata,
    document,
    setTimeout(handler) { handler(); }
  });
  const context = { window, document, navigator: { mediaSession }, URL, Promise, console };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "modules/media-session.js"), "utf8"),
    context
  );
  return { controller: window.ImpalaMediaSession, mediaSession, actions, window, document, createEventTarget };
}

test("publishes Impala metadata and logo artwork", () => {
  const { controller, mediaSession } = loadController();
  const session = controller.create();
  session.setMetadata({
    title: "The Distance",
    artist: "Cake",
    album: "Fashion Nugget",
    artworkUrl: "assets/ddMusic.ico"
  });
  assert.equal(mediaSession.metadata.title, "The Distance");
  assert.equal(mediaSession.metadata.artist, "Cake");
  assert.equal(mediaSession.metadata.album, "Fashion Nugget");
  assert.equal(mediaSession.metadata.artwork[0].src, "https://impala.discrete-dev.com/assets/ddMusic.ico");
  assert.equal(mediaSession.metadata.artwork[0].type, "image/x-icon");
});

test("routes system transport commands to Impala handlers", async () => {
  const called = [];
  const { controller, actions } = loadController();
  controller.create({
    onPlay: () => called.push("play"),
    onPause: () => called.push("pause"),
    onPrevious: () => called.push("previous"),
    onNext: () => called.push("next")
  });
  for (const action of ["play", "pause", "previoustrack", "nexttrack"]) {
    await actions.get(action)();
  }
  assert.deepEqual(called, ["play", "pause", "previous", "next"]);
});

test("publishes playback and position state", () => {
  const { controller, mediaSession } = loadController();
  const session = controller.create();
  session.setPlaybackState("playing");
  session.setPositionState({ duration: 300, currentTime: 42, playbackRate: 1 });
  assert.equal(mediaSession.playbackState, "playing");
  assert.equal(mediaSession.positionState.duration, 300);
  assert.equal(mediaSession.positionState.playbackRate, 1);
  assert.equal(mediaSession.positionState.position, 42);
});

test("loads the controller before the player and integrates system metadata", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.ok(html.indexOf("modules/media-session.js") < html.indexOf("script.js?v="));
  assert.doesNotMatch(html, /src=["']media-session-controller\.js/);
  assert.match(player, /ImpalaMediaSession\?\.create/);
  assert.match(player, /onPrevious[\s\S]*playPrevSong/);
  assert.match(player, /onNext[\s\S]*playNextSong/);
  assert.match(player, /assets\/ddMusic\.ico/);
});

test("reasserts Now Playing identity and offers explicit interruption recovery", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const player = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  const controllerSource = fs.readFileSync(path.join(__dirname, "modules/media-session.js"), "utf8");
  assert.match(html, /id="resume-impala-btn"[^>]*hidden/);
  assert.match(controllerSource, /function restoreIdentity/);
  assert.match(controllerSource, /addListener\(window, "pageshow"/);
  assert.match(controllerSource, /addListener\(pageDocument, "visibilitychange"/);
  assert.match(player, /resumeButton:\s*resumeImpalaButton/);
});

test("offers one-tap recovery after an interruption", async () => {
  const { controller, window, createEventTarget } = loadController();
  const active = { paused: false, ended: false, duration: 240, currentTime: 91, playbackRate: 1 };
  const resumeButton = createEventTarget({ hidden: true });
  let resumeMessages = 0;
  let playRequests = 0;
  controller.create({
    resumeButton,
    getActiveMediaElement: () => active,
    getMetadata: () => ({ title: "Road Song.mp3", artist: "Impala" }),
    onResumeNeeded: () => { resumeMessages += 1; },
    onPlay: () => { playRequests += 1; }
  });
  window.emit("blur");
  active.paused = true;
  window.emit("focus");
  assert.equal(resumeButton.hidden, false);
  assert.equal(resumeMessages, 1);
  resumeButton.emit("click");
  await Promise.resolve();
  assert.equal(resumeButton.hidden, true);
  assert.equal(playRequests, 1);
});
