(() => {
  function baseUrl() {
    return window.ImpalaConfig?.getCoastApiBaseUrl?.() || "";
  }
  function token() {
    const value = window.AuthSession?.load?.()?.token;
    if (!value) throw new Error("Sign in before using Coast to Coast.");
    return value;
  }
  async function request(path, options = {}) {
    const base = baseUrl();
    if (!base) throw new Error("Coast to Coast service is not configured.");
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token()}`);
    const response = await fetch(`${base}${path}`, { ...options, cache: "no-store", headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Coast request failed (${response.status}).`);
    return payload;
  }
  function json(path, method, body = {}) {
    return request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  window.CoastClient = {
    createRoom(mediaId) { return json("/api/coast/rooms", "POST", { mediaId }); },
    joinRoom(code) { return json(`/api/coast/rooms/${encodeURIComponent(code)}/join`, "POST"); },
    leaveRoom(code) { return request(`/api/coast/rooms/${encodeURIComponent(code)}`, { method: "DELETE" }); },
    connect(code) {
      const url = new URL(baseUrl());
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/ws";
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => socket.send(JSON.stringify({
        type: "authenticate",
        code,
        token: token()
      })), { once: true });
      return socket;
    }
  };
})();
