document.addEventListener("DOMContentLoaded", () => {
  const statusNode = document.getElementById("live-status");
  const detailNode = document.getElementById("live-detail");
  const catalogStatusNode = document.getElementById("live-catalog-status");
  const catalogListNode = document.getElementById("live-catalog-list");
  const refreshButton = document.getElementById("live-refresh-btn");
  const startButton = document.getElementById("live-start-btn");
  const stopButton = document.getElementById("live-stop-btn");
  const titleInput = document.getElementById("live-title-input");
  const streamUrlInput = document.getElementById("live-url-input");
  const client = window.LiveStreamClient;
  const preferencesApi = window.UiPreferences;
  let selectedCatalogUrl = "";

  function setStatus(message) {
    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  function setCatalogStatus(message) {
    if (catalogStatusNode) {
      catalogStatusNode.textContent = message;
    }
  }

  function renderCatalog(payload) {
    const streams = Array.isArray(payload?.streams) ? payload.streams : [];
    if (!catalogListNode) {
      return;
    }

    catalogListNode.replaceChildren();
    if (!streams.length) {
      setCatalogStatus("No enabled streams.");
      return;
    }

    const fragment = document.createDocumentFragment();
    streams.forEach((stream) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "live-catalog-item";
      button.dataset.streamId = stream.id || "";
      button.innerHTML = `
        <span class="live-catalog-title"></span>
        <span class="live-catalog-meta"></span>
        <span class="live-catalog-description"></span>
      `;
      button.querySelector(".live-catalog-title").textContent = stream.title || "Untitled stream";
      button.querySelector(".live-catalog-meta").textContent = stream.category || "General";
      button.querySelector(".live-catalog-description").textContent = stream.description || "";
      button.addEventListener("click", () => {
        selectedCatalogUrl = String(stream.streamUrl || "").trim();
        if (titleInput) {
          titleInput.value = stream.title || "";
        }
        if (streamUrlInput) {
          streamUrlInput.value = stream.streamUrl || "";
        }
        setCatalogStatus(`Selected ${stream.title || "stream"}.`);
      });
      fragment.append(button);
    });

    catalogListNode.append(fragment);
    setCatalogStatus(`${streams.length} enabled stream${streams.length === 1 ? "" : "s"}.`);
  }

  async function refreshCatalog() {
    if (!client?.getStreams) {
      setCatalogStatus("Catalog unavailable.");
      return;
    }

    try {
      setCatalogStatus("Loading streams...");
      const payload = await client.getStreams();
      renderCatalog(payload);
    } catch (error) {
      setCatalogStatus(error.message || "Unable to load streams.");
    }
  }

  function renderSession(payload) {
    if (!payload?.enabled) {
      setStatus("Live stream service is not enabled on the server yet.");
      if (detailNode) {
        detailNode.textContent = "Set LIVE_STREAM_ENABLED=true on the Heroku live service when you are ready to test sessions.";
      }
      startButton.disabled = true;
      stopButton.disabled = true;
      return;
    }

    const session = payload.session || {};
    const status = session.status || "idle";
    setStatus(status === "live" ? "Live session is active." : "Live session is idle.");
    if (detailNode) {
      detailNode.textContent = [
        `Session: ${session.sessionId || "none"}`,
        `Title: ${session.title || "Untitled live stream"}`,
        `Stream URL: ${session.streamUrl || "none"}`,
        `Updated: ${session.updatedAt || "never"}`
      ].join("\n");
    }

    if (titleInput && session.title && titleInput.value.trim() === "") {
      titleInput.value = session.title;
    }
    if (streamUrlInput && session.streamUrl && streamUrlInput.value.trim() === "") {
      streamUrlInput.value = session.streamUrl;
    }

    startButton.disabled = status === "live";
    stopButton.disabled = status !== "live";
  }

  async function refreshSession() {
    try {
      setStatus("Checking live stream service...");
      const payload = await client.getSession();
      renderSession(payload);
    } catch (error) {
      const message = error.message || "Unable to reach live stream service.";
      setStatus(message.includes("404")
        ? "Live stream service is not deployed or enabled yet."
        : message);
      if (detailNode) {
        detailNode.textContent = "";
      }
      startButton.disabled = true;
      stopButton.disabled = true;
    }
  }

  async function sendAction(action) {
    const requestedStreamUrl = String(streamUrlInput?.value || "").trim();
    if (action === "start") {
      let parsedUrl;
      try {
        parsedUrl = new URL(requestedStreamUrl);
      } catch {
        streamUrlInput?.setCustomValidity("Enter a complete HTTPS stream URL.");
        streamUrlInput?.reportValidity();
        setStatus("Enter a valid HTTPS stream URL.");
        return;
      }

      if (parsedUrl.protocol !== "https:") {
        streamUrlInput?.setCustomValidity("Impala requires an HTTPS stream URL.");
        streamUrlInput?.reportValidity();
        setStatus("For secure playback, the stream URL must begin with https://.");
        return;
      }
    }

    try {
      setStatus(action === "start" ? "Starting live session..." : "Stopping live session...");
      const payload = await client.updateSession(action, {
        title: action === "start" && requestedStreamUrl !== selectedCatalogUrl
          ? "Personal Stream"
          : titleInput?.value || "",
        streamUrl: requestedStreamUrl
      });
      renderSession(payload);
    } catch (error) {
      setStatus(error.message || "Unable to update live session.");
    }
  }

  if (!client?.getSession || !client?.updateSession) {
    setStatus("Live stream client is unavailable.");
    return;
  }

  const preferences = preferencesApi?.getPreferences?.() || {};
  if (preferences.liveStreamEnabled !== true) {
    setStatus("Live Stream controls are disabled in Preferences.");
    if (detailNode) {
      detailNode.textContent = "Enable Live Stream controls in Preferences before using this screen.";
    }
    startButton.disabled = true;
    stopButton.disabled = true;
    return;
  }

  refreshButton?.addEventListener("click", refreshSession);
  streamUrlInput?.addEventListener("input", () => {
    selectedCatalogUrl = "";
    streamUrlInput.setCustomValidity("");
    if (titleInput) {
      titleInput.value = "Personal Stream";
    }
  });
  startButton?.addEventListener("click", () => sendAction("start"));
  stopButton?.addEventListener("click", () => sendAction("stop"));
  refreshCatalog();
  refreshSession();
});
