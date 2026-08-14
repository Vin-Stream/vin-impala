(() => {
  const SUPPORTED_ACTIONS = ["play", "pause", "previoustrack", "nexttrack"];

  function getArtworkType(source) {
    const pathname = String(source || "").split(/[?#]/, 1)[0].toLowerCase();
    if (pathname.endsWith(".ico")) return "image/x-icon";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
    if (pathname.endsWith(".webp")) return "image/webp";
    return "";
  }

  function create(options = {}) {
    const mediaSession = navigator?.mediaSession;
    if (!mediaSession || typeof window.MediaMetadata !== "function") {
      return {
        available: false,
        setMetadata() {},
        refreshMetadata() {},
        setPlaybackState() {},
        setPositionState() {},
        destroy() {}
      };
    }

    const resumeButton = options.resumeButton || null;
    const pageDocument = window.document || (typeof document !== "undefined" ? document : null);
    const cleanup = [];
    let wasPlayingBeforeInterruption = false;

    function hideResume() {
      if (resumeButton) resumeButton.hidden = true;
    }

    function prepareForResume() {
      hideResume();
      wasPlayingBeforeInterruption = false;
    }

    const handlers = {
      play() {
        prepareForResume();
        return options.onPlay?.();
      },
      pause: options.onPause,
      previoustrack: options.onPrevious,
      nexttrack: options.onNext
    };

    SUPPORTED_ACTIONS.forEach((action) => {
      try {
        const handler = handlers[action];
        mediaSession.setActionHandler(action, typeof handler === "function"
          ? () => Promise.resolve(handler()).catch((error) => {
              console.error(`Impala media-session ${action} command failed:`, error);
            })
          : null);
      } catch (error) {
        console.debug(`Media-session action ${action} is unavailable:`, error);
      }
    });

    function setMetadata(item = {}) {
      const title = String(item.title || "Impala Streamer")
        .trim()
        .replace(/\.(mp3|m4a|aac|flac|wav|ogg|opus|mp4|mkv|webm)$/i, "");
      const artist = String(item.artist || "Impala").trim();
      const album = String(item.album || "").trim();
      const artworkUrl = String(item.artworkUrl || "").trim();
      const artwork = artworkUrl
        ? [{ src: new URL(artworkUrl, window.location.href).href, type: getArtworkType(artworkUrl) }]
        : [];

      mediaSession.metadata = new window.MediaMetadata({ title, artist, album, artwork });
    }

    function refreshMetadata() {
      const item = options.getMetadata?.();
      if (item) setMetadata(item);
    }

    function setPlaybackState(state) {
      if (!["playing", "paused", "none"].includes(state)) return;
      try {
        mediaSession.playbackState = state;
        if (state === "playing") prepareForResume();
      } catch (error) {
        console.debug("Media-session playback state is unavailable:", error);
      }
    }

    function rememberInterruption() {
      const active = options.getActiveMediaElement?.();
      if (active && !active.paused && !active.ended) {
        wasPlayingBeforeInterruption = true;
      }
    }

    function restoreIdentity() {
      refreshMetadata();
      const active = options.getActiveMediaElement?.();
      setPlaybackState(active && !active.paused ? "playing" : "paused");
      setPositionState(active);
      if (!wasPlayingBeforeInterruption || !active || !active.paused || active.ended) return;
      if (resumeButton) resumeButton.hidden = false;
      options.onResumeNeeded?.();
    }

    function addListener(target, event, handler) {
      if (!target?.addEventListener) return;
      target.addEventListener(event, handler);
      cleanup.push(() => target.removeEventListener?.(event, handler));
    }

    if (typeof options.getActiveMediaElement === "function") {
      const restoreSoon = () => window.setTimeout(restoreIdentity, 0);
      addListener(window, "blur", rememberInterruption);
      addListener(window, "pagehide", rememberInterruption);
      addListener(window, "pageshow", restoreSoon);
      addListener(window, "focus", restoreSoon);
      addListener(pageDocument, "visibilitychange", () => {
        if (pageDocument.hidden) rememberInterruption();
        else restoreSoon();
      });
      addListener(resumeButton, "click", handlers.play);
    }

    function setPositionState(mediaElement) {
      if (!mediaElement || typeof mediaSession.setPositionState !== "function") return;
      const duration = Number(mediaElement.duration);
      const position = Number(mediaElement.currentTime);
      const playbackRate = Number(mediaElement.playbackRate) || 1;
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
      try {
        mediaSession.setPositionState({
          duration,
          playbackRate,
          position: Math.min(Math.max(0, position), duration)
        });
      } catch (error) {
        console.debug("Media-session position state is unavailable:", error);
      }
    }

    function destroy() {
      cleanup.splice(0).forEach((remove) => remove());
      SUPPORTED_ACTIONS.forEach((action) => {
        try {
          mediaSession.setActionHandler(action, null);
        } catch (_) {
          // The browser does not expose every Media Session action.
        }
      });
      mediaSession.metadata = null;
      setPlaybackState("none");
    }

    return { available: true, setMetadata, refreshMetadata, setPlaybackState, setPositionState, destroy };
  }

  window.ImpalaMediaSession = { create };
})();
