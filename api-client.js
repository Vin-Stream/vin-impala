(() => {
  const config = window.KW_PLAYER_CONFIG || {};
  const authSessionApi = window.AuthSession;

  function getApiBaseUrl() {
    return window.ImpalaConfig?.getCloudApiBaseUrl?.()
      || String(config.apiBaseUrl || "").replace(/\/+$/, "");
  }

  async function request(path, options = {}) {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error("No API base URL configured.");
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

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      cache: "no-store",
      headers
    });

    if (response.status === 401) {
      authSessionApi?.clear();
      window.ImpalaAuthNotice?.render?.({
        targetSelector: ".hero-meta",
        needsPrivateAccess: true
      });
      throw new Error("Please sign in. Your private library session expired.");
    }

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const errorPayload = await response.json();
        if (errorPayload?.error) {
          message = errorPayload.error;
        }
      } catch (error) {
        console.error("Unable to parse API error response:", error);
      }
      throw new Error(message);
    }

    return response.json();
  }

  window.ImpalaApiClient = {
    get apiBaseUrl() {
      return getApiBaseUrl();
    },
    getApiBaseUrl,
    request
  };
})();
