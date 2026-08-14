(() => {
  const content = document.getElementById("diagnostics-content");
  const updated = document.getElementById("diagnostics-updated");
  const refreshButton = document.getElementById("diagnostics-refresh");
  const sendButton = document.getElementById("diagnostics-send");
  const config = window.KW_PLAYER_CONFIG || {};
  let toastTimer = null;

  function getApiBaseUrl() {
    return window.ImpalaConfig?.getCloudApiBaseUrl?.()
      || String(config.apiBaseUrl || "").replace(/\/+$/, "");
  }

  function escapeHtml(value) {
    return String(value ?? "—").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[character]));
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  function rows(entries) {
    return `<dl class="diagnostics-list">${entries.map(([label, value, className = ""]) => (
      `<dt>${escapeHtml(label)}</dt><dd class="${className}">${escapeHtml(value)}</dd>`
    )).join("")}</dl>`;
  }

  function panel(title, body, wide = false) {
    return `<section class="diagnostics-panel${wide ? " diagnostics-panel-wide" : ""}"><h2>${title}</h2>${body}</section>`;
  }

  function buildFunctionalErrors(errors) {
    return errors.slice(-20).map((entry) => ({
      time: entry.time || "",
      category: entry.category || "Application error",
      message: entry.message || "Unknown error"
    }));
  }

  function buildReport() {
    const storage = window.DiagnosticStore.getStorageHealth();
    const errors = window.DiagnosticStore.readErrors();
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    // Pilot-only functional support report. Do not send listener behavior,
    // playlist identity, track position, object paths, or broad snapshots.
    return {
      purpose: "pilot-functional-support",
      timestamp: new Date().toISOString(),
      appVersion: config.appVersion || "unknown",
      appBuildDate: config.appBuildDate || "unknown",
      browser: navigator.userAgent || "",
      platform: navigator.platform || "",
      connection: connection?.effectiveType || "unknown",
      online: navigator.onLine,
      uptimeSeconds: Math.round(performance.now() / 1000),
      warnings: storage.warning ? ["Local storage exceeds 4 MB"] : [],
      errors: buildFunctionalErrors(errors),
      storage: {
        totalBytes: storage.totalBytes,
        warning: storage.warning,
        keyCount: storage.keys.length,
        lastWrite: storage.lastWrite
          ? {
              time: storage.lastWrite.time,
              success: storage.lastWrite.success
            }
          : null
      }
    };
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    document.querySelector(".toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    toastTimer = window.setTimeout(() => toast.remove(), 2500);
  }

  async function sendDiagnostics() {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      showToast("Send Failed");
      return;
    }

    sendButton.disabled = true;
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const instanceId = window.ImpalaConfig?.getInstanceId?.() || "";
      if (instanceId) {
        headers.set("X-Impala-Instance-Id", instanceId);
      }
      const response = await fetch(`${apiBaseUrl}/api/diagnostics`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildReport())
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Diagnostics could not be sent.");
      }
      showToast("Diagnostics Sent");
    } catch (error) {
      console.error("Unable to send diagnostics:", error);
      showToast("Send Failed");
    } finally {
      sendButton.disabled = false;
    }
  }

  function render() {
    const snapshot = window.DiagnosticStore.getSnapshot() || {};
    const storage = window.DiagnosticStore.getStorageHealth();
    const errors = window.DiagnosticStore.readErrors().slice().reverse();
    const player = snapshot.player || {};
    const registry = snapshot.registry || {};
    const media = snapshot.media || {};
    const lastWrite = snapshot.storage?.lastWrite || storage.lastWrite;

    updated.textContent = snapshot.updatedAt
      ? `Player snapshot: ${new Date(snapshot.updatedAt).toLocaleString()}`
      : "Open the player to begin collecting runtime data.";

    const storageRows = storage.keys.length
      ? `<div class="diagnostics-key-list">${storage.keys.map((item) => `<div><code>${escapeHtml(item.key)}</code><span>${formatBytes(item.bytes)}</span></div>`).join("")}</div>`
      : `<p class="diagnostics-empty">No local storage keys found.</p>`;
    const errorRows = errors.length
      ? `<div class="diagnostics-errors">${errors.map((entry) => `<article><time>${escapeHtml(new Date(entry.time).toLocaleString())}</time><strong>${escapeHtml(entry.category)}</strong><span>${escapeHtml(entry.message)}</span>${entry.detail ? `<code>${escapeHtml(entry.detail)}</code>` : ""}</article>`).join("")}</div>`
      : `<p class="diagnostics-empty">No errors logged.</p>`;

    content.innerHTML = [
      panel("A. Player State Snapshot", rows([
        ["Current playlist ID", player.playlistId], ["Current song index", player.songIndex],
        ["Playback state", player.playbackState], ["Repeat mode", player.repeatMode],
        ["Last error", player.lastError || "None"]
      ])),
      panel("B. Playlist Registry Overview", rows([
        ["Built-in playlists", registry.builtInCount ?? 0], ["Custom playlists", registry.customCount ?? 0],
        ["Local library playlists", registry.localCount ?? 0], ["Active mode", registry.activeMode || "—"]
      ])),
      panel("C. Local Storage Health", `${rows([
        ["Total bytes used", formatBytes(storage.totalBytes), storage.warning ? "diagnostics-warning" : ""],
        ["4 MB warning", storage.warning ? "WARNING: storage exceeds 4 MB" : "Healthy"],
        ["Last write", lastWrite ? `${lastWrite.success ? "Success" : "Failure"} · ${lastWrite.key} · ${new Date(lastWrite.time).toLocaleString()}` : "No tracked writes"]
      ])}${storageRows}`, true),
      panel("D. Media Resolver Debug Info", rows([
        ["Resolved path", media.resolvedPath], ["Detected extension", media.extension],
        ["Detected MIME", media.mime], ["Source", media.source],
        ["Load time", media.loadTimeMs == null ? "—" : `${media.loadTimeMs} ms`],
        ["Video vs audio detection", media.detectionPath]
      ]), true),
      panel("E. Error Log (rolling buffer)", errorRows, true)
    ].join("");
  }

  refreshButton.addEventListener("click", render);
  sendButton?.addEventListener("click", sendDiagnostics);
  window.addEventListener("storage", render);
  render();
  window.setInterval(render, 1000);
})();
