(() => {
  let pending = false;
  let lastSent = 0;
  async function heartbeat() {
    const playing = [...document.querySelectorAll("audio, video")].some((media) => !media.paused && !media.ended);
    if (document.hidden && !playing) return;
    if (pending || Date.now() - lastSent < 110000 || !window.AuthSession?.load()?.token) return;
    const base = window.ImpalaApiClient?.getApiBaseUrl?.();
    const device = window.ImpalaConfig?.getInstanceId?.();
    if (!base || !device) return;
    pending = true;
    lastSent = Date.now();
    try {
      // Telemetry failures must never clear auth or interrupt playback.
      await fetch(`${base}/api/activity/heartbeat`, {
        method: "POST", cache: "no-store",
        headers: {
          Authorization: `Bearer ${window.AuthSession.load().token}`,
          "X-Impala-Instance-Id": device
        },
        signal: AbortSignal.timeout(8000)
      });
    } catch { /* Retry on the next interval. */ }
    finally { pending = false; }
  }
  heartbeat();
  setInterval(heartbeat, 120000);
  document.addEventListener("visibilitychange", heartbeat);
  document.addEventListener("play", heartbeat, true);
})();
