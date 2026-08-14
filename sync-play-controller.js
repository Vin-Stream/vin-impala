(() => {
  const POLL_INTERVAL_MS = 1000;
  const HARD_DRIFT_SECONDS = 0.75;

  function init(options = {}) {
    const client = window.SyncPlayClient;
    const video = options.videoElement;
    const panel = document.getElementById("sync-play-panel");
    if (!client || !video || !panel) return null;

    const createButton = document.getElementById("sync-play-create-btn");
    const joinButton = document.getElementById("sync-play-join-btn");
    const copyButton = document.getElementById("sync-play-copy-btn");
    const leaveButton = document.getElementById("sync-play-leave-btn");
    const codeInput = document.getElementById("sync-play-code-input");
    const modeSelect = document.getElementById("sync-play-control-mode");
    const sessionCodeNode = document.getElementById("sync-play-session-code");
    const statusNode = document.getElementById("sync-play-status");

    let session = null;
    let pollTimer = null;
    let applyingRemoteState = false;
    let commandInFlight = false;
    const tabSessionKey = `${window.ImpalaConfig?.getStoragePrefix?.() || "impalaStreamer"}.syncPlay.activeCode`;

    function setStatus(message, isError = false) {
      statusNode.textContent = message;
      statusNode.classList.toggle("is-error", isError);
    }

    function isEnabled() {
      return window.UiPreferences?.getPreferences?.().syncPlayEnabled === true;
    }

    function currentUsername() {
      return String(window.AuthSession?.load?.()?.username || "").trim().toLowerCase();
    }

    function canControl() {
      return Boolean(session) && (
        session.controlMode === "shared" || session.host === currentUsername()
      );
    }

    function renderSession() {
      const active = Boolean(session);
      createButton.disabled = active;
      joinButton.disabled = active;
      copyButton.disabled = !active;
      leaveButton.disabled = !active;
      codeInput.disabled = active;
      modeSelect.disabled = active;
      sessionCodeNode.textContent = active ? `Join code: ${session.code}` : "";
      if (active) codeInput.value = session.code;
      panel.dataset.active = active ? "true" : "false";
      if (active) {
        const role = session.host === currentUsername() ? "Host" : "Follower";
        const controls = session.controlMode === "shared" ? "shared controls" : "host controls";
        setStatus(`${role} connected · ${controls} · ${session.participants.length} participant${session.participants.length === 1 ? "" : "s"}`);
      }
    }

    async function activate(nextSession) {
      const loaded = await options.ensureVideo?.(
        nextSession.mediaId,
        nextSession.playback?.targetPositionSeconds || 0
      );
      if (!loaded) throw new Error("The shared video is not available in this library.");
      session = nextSession;
      sessionStorage.setItem(tabSessionKey, nextSession.code);
      renderSession();
      await applySessionState(nextSession);
      schedulePoll();
    }

    async function createSession() {
      if (!isEnabled()) return setStatus("Enable Sync Play in Settings first.", true);
      const currentVideo = options.getCurrentVideo?.();
      if (!currentVideo?.mediaId) return setStatus("Load a shared-library video before creating a session.", true);
      setStatus("Creating session…");
      try {
        const payload = await client.createSession(currentVideo.mediaId, modeSelect.value);
        await activate(payload.session);
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function joinSession() {
      if (!isEnabled()) return setStatus("Enable Sync Play in Settings first.", true);
      const code = String(codeInput.value || "").trim().toUpperCase();
      if (!code) return setStatus("Enter a Sync Play code.", true);
      setStatus("Joining session…");
      try {
        const payload = await client.joinSession(code);
        await activate(payload.session);
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function leaveSession() {
      if (!session) return;
      const code = session.code;
      stopPolling();
      session = null;
      sessionStorage.removeItem(tabSessionKey);
      renderSession();
      setStatus("Leaving session…");
      try {
        await client.leaveSession(code);
        setStatus("Sync Play session left. Playback is independent.");
      } catch (error) {
        setStatus(`Session cleared locally: ${error.message}`, true);
      }
    }

    async function copyJoinCode() {
      if (!session?.code) return;
      try {
        await navigator.clipboard.writeText(session.code);
        setStatus(`Join code ${session.code} copied.`);
      } catch (_error) {
        codeInput.disabled = false;
        codeInput.select();
        setStatus("Join code selected. Copy it from the code field.");
      }
    }

    async function applySessionState(nextSession) {
      session = nextSession;
      renderSession();
      const playback = nextSession.playback || {};
      const target = Number(playback.targetPositionSeconds || 0);
      applyingRemoteState = true;
      try {
        if (Math.abs((video.currentTime || 0) - target) > HARD_DRIFT_SECONDS) {
          video.currentTime = target;
        }
        if (playback.status === "playing" && video.paused) {
          await video.play().catch(() => {
            setStatus("Synchronized and ready. Press Play once to allow playback.");
          });
        } else if (playback.status === "paused" && !video.paused) {
          video.pause();
        }
      } finally {
        window.setTimeout(() => {
          applyingRemoteState = false;
        }, 150);
      }
    }

    async function poll() {
      if (!session) return;
      try {
        const payload = await client.getSession(session.code);
        await applySessionState(payload.session);
        await client.reportState(
          session.code,
          video.currentTime || 0,
          video.readyState < 3 ? "buffering" : video.paused ? "paused" : "playing",
          video.readyState >= 2
        );
      } catch (error) {
        setStatus(`Sync unavailable: ${error.message}`, true);
      } finally {
        schedulePoll();
      }
    }

    function schedulePoll() {
      stopPolling();
      if (session) pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (pollTimer) window.clearTimeout(pollTimer);
      pollTimer = null;
    }

    async function sendLocalCommand(action) {
      if (!session || applyingRemoteState || commandInFlight) return;
      if (!canControl()) {
        setStatus("Only the host can control this session.", true);
        await poll();
        return;
      }
      commandInFlight = true;
      try {
        const payload = await client.sendCommand(
          session.code,
          action,
          video.currentTime || 0,
          video.playbackRate || 1
        );
        session = payload.session;
        renderSession();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        commandInFlight = false;
      }
    }

    createButton.addEventListener("click", createSession);
    joinButton.addEventListener("click", joinSession);
    copyButton.addEventListener("click", copyJoinCode);
    leaveButton.addEventListener("click", leaveSession);
    video.addEventListener("play", () => sendLocalCommand("play"));
    video.addEventListener("pause", () => {
      if (!video.ended) sendLocalCommand("pause");
    });
    video.addEventListener("seeked", () => sendLocalCommand("seek"));
    window.addEventListener("pagehide", stopPolling);
    renderSession();
    const previousCode = sessionStorage.getItem(tabSessionKey);
    if (isEnabled() && previousCode) {
      client.joinSession(previousCode)
        .then((payload) => activate(payload.session))
        .catch(() => sessionStorage.removeItem(tabSessionKey));
    }

    return {
      get active() {
        return Boolean(session);
      },
      get canControl() {
        return canControl();
      }
    };
  }

  window.SyncPlayController = { init };
})();
