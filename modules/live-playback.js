(() => {
  function create(options = {}) {
    const client = options.client;
    const preferences = options.preferences;
    const hlsAdapter = options.hlsAdapter;
    const videoPlayer = options.videoPlayer;
    const callbacks = options.callbacks || {};
    let currentSession = null;

    function isActive() {
      return Boolean(currentSession?.streamUrl);
    }

    function getSession() {
      return currentSession;
    }

    function deactivate(notify = true) {
      const wasActive = isActive();
      currentSession = null;
      if (wasActive && notify) callbacks.onInactive?.();
    }

    async function loadSession(session, autoPlay = false) {
      const streamUrl = String(session?.streamUrl || "").trim();
      if (!streamUrl) return false;
      currentSession = {
        sessionId: session.sessionId || "",
        title: session.title || "Live Stream",
        streamUrl,
        updatedAt: session.updatedAt || ""
      };
      callbacks.onSessionLoaded?.(currentSession, Boolean(autoPlay));
      if (autoPlay) await startPlayback();
      return true;
    }

    async function refresh() {
      const enabled = preferences?.getPreferences?.().liveStreamEnabled === true;
      if (!enabled || !client?.getSession) return false;
      try {
        const payload = await client.getSession();
        const session = payload?.session || {};
        if (payload?.enabled && session.status === "live" && session.streamUrl) {
          await loadSession(session, false);
          return true;
        }
      } catch (error) {
        console.error("Unable to load live stream session for player:", error);
      }
      deactivate();
      return false;
    }

    async function prepareMediaElement() {
      if (!isActive()) return null;
      if (!videoPlayer) throw new Error("No media player is available for live stream playback.");
      const streamUrl = currentSession.streamUrl;
      if (videoPlayer.currentSrc === streamUrl || videoPlayer.getAttribute("src") === streamUrl) return videoPlayer;

      if (hlsAdapter?.canUseFor?.(streamUrl, videoPlayer)) {
        try {
          await hlsAdapter.load(videoPlayer, streamUrl);
        } catch (error) {
          console.error("Unable to initialize HLS adapter:", error);
          videoPlayer.src = streamUrl;
          videoPlayer.load();
        }
      } else {
        videoPlayer.src = streamUrl;
        videoPlayer.load();
      }
      return videoPlayer;
    }

    async function startPlayback() {
      try {
        callbacks.onStatus?.("Loading");
        const mediaElement = await prepareMediaElement();
        if (!mediaElement) return;
        await mediaElement.play();
      } catch (error) {
        console.error("Error playing live stream:", error);
        callbacks.onPlaybackError?.(error);
        callbacks.onStatus?.("Live Ready");
      }
    }

    return { deactivate, getSession, isActive, loadSession, refresh, startPlayback };
  }

  window.ImpalaLivePlayback = { create };
})();
