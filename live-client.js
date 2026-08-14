(() => {
  const config = window.KW_PLAYER_CONFIG || {};
  const authSessionApi = window.AuthSession;

  function getLiveStreamApiBaseUrl() {
    return window.ImpalaConfig?.getLiveStreamApiBaseUrl?.()
      || String(config.liveStreamApiBaseUrl || "").replace(/\/+$/, "");
  }

  async function request(path, options = {}) {
    const liveStreamApiBaseUrl = getLiveStreamApiBaseUrl();
    if (!liveStreamApiBaseUrl) {
      throw new Error("Live stream service is not configured yet.");
    }

    const headers = new Headers(options.headers || {});
    const instanceId = window.ImpalaConfig?.getInstanceId?.() || "";
    if (instanceId) {
      headers.set("X-Impala-Instance-Id", instanceId);
    }
    const authSession = authSessionApi?.load();
    if (authSession?.token) {
      headers.set("Authorization", `Bearer ${authSession.token}`);
    }

    const response = await fetch(`${liveStreamApiBaseUrl}${path}`, {
      ...options,
      cache: "no-store",
      headers
    });

    if (response.status === 401) {
      authSessionApi?.clear();
      window.location.replace("signin.html");
      throw new Error("Session expired. Redirecting to sign in.");
    }

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const errorPayload = await response.json();
        if (errorPayload?.error) {
          message = errorPayload.error;
        }
      } catch (error) {
        console.error("Unable to parse live stream API error response:", error);
      }
      throw new Error(message);
    }

    return response.json();
  }

  function getSession() {
    return request("/api/live/session");
  }

  function getStreams() {
    return request("/api/streams");
  }

  function updateSession(action, payload = {}) {
    return request("/api/live/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });
  }

  window.LiveStreamClient = {
    get liveStreamApiBaseUrl() {
      return getLiveStreamApiBaseUrl();
    },
    getLiveStreamApiBaseUrl,
    getStreams,
    getSession,
    updateSession
  };
})();
