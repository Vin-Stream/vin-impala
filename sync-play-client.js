(() => {
  const authSessionApi = window.AuthSession;

  function getApiBaseUrl() {
    return window.ImpalaConfig?.getSyncPlayApiBaseUrl?.() || "";
  }

  async function request(path, options = {}) {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) throw new Error("Sync Play service is not configured.");
    const authSession = authSessionApi?.load();
    if (!authSession?.token) throw new Error("Sign in before using Sync Play.");

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${authSession.token}`);
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      cache: "no-store",
      headers
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Sync Play request failed (${response.status}).`);
    return payload;
  }

  function jsonRequest(path, method, body) {
    return request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
  }

  window.SyncPlayClient = {
    createSession(mediaId, controlMode) {
      return jsonRequest("/api/sync/sessions", "POST", { mediaId, controlMode });
    },
    joinSession(code) {
      return jsonRequest(`/api/sync/sessions/${encodeURIComponent(code)}/join`, "POST");
    },
    getSession(code) {
      return request(`/api/sync/sessions/${encodeURIComponent(code)}`);
    },
    sendCommand(code, action, positionSeconds, playbackRate = 1) {
      return jsonRequest(`/api/sync/sessions/${encodeURIComponent(code)}/commands`, "POST", {
        action,
        positionSeconds,
        playbackRate
      });
    },
    reportState(code, positionSeconds, status, ready) {
      return jsonRequest(`/api/sync/sessions/${encodeURIComponent(code)}/reports`, "POST", {
        positionSeconds,
        status,
        ready
      });
    },
    leaveSession(code) {
      return request(`/api/sync/sessions/${encodeURIComponent(code)}`, { method: "DELETE" });
    }
  };
})();
