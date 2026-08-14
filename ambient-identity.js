window.AmbientIdentity = (() => {
  const pulseClass = "is-about-invite";
  const recentActivityMs = 10 * 60 * 1000;
  const gateIntervalMs = 30 * 1000;

  function getTodayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function createSchedule() {
    const totalMinutes = randomInt(20, 40);
    const sessionCount = randomInt(2, 4);
    const sessions = [];
    let remainingMinutes = totalMinutes;

    for (let index = 0; index < sessionCount; index += 1) {
      const remainingSessions = sessionCount - index;
      const minimumAfterThis = (remainingSessions - 1) * 5;
      const maxDuration = Math.min(12, remainingMinutes - minimumAfterThis);
      const durationMinutes = remainingSessions === 1
        ? remainingMinutes
        : randomInt(5, Math.max(5, maxDuration));

      remainingMinutes -= durationMinutes;
      sessions.push({
        startAfterMs: randomInt(5, 8 * 60) * 60 * 1000,
        durationMs: durationMinutes * 60 * 1000
      });
    }

    sessions.sort((first, second) => first.startAfterMs - second.startAfterMs);
    return {
      day: getTodayKey(),
      createdAt: Date.now(),
      sessions
    };
  }

  function readSchedule(storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved?.day === getTodayKey() && Array.isArray(saved.sessions)) {
        return saved;
      }
    } catch (error) {
      console.warn("Unable to read ambient identity schedule:", error);
    }

    const schedule = createSchedule();
    try {
      localStorage.setItem(storageKey, JSON.stringify(schedule));
    } catch (error) {
      console.warn("Unable to save ambient identity schedule:", error);
    }

    return schedule;
  }

  function init(options = {}) {
    const titleElement = options.titleElement || null;
    const aboutDialog = options.aboutDialog || null;
    const storagePrefix = options.storagePrefix || "impalaStreamer";
    const storageKey = `${storagePrefix}.ambientIdentitySchedule`;
    const timeoutIds = [];
    let lastActivityAt = Date.now();
    let activeTimer = null;
    let activeGateTimer = null;

    if (!titleElement) {
      return { stop() {} };
    }

    titleElement.dataset.ambientIdentity = "ready";

    function canRun() {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const compactViewport = window.matchMedia?.("(max-width: 500px)")?.matches;
      const recentlyActive = Date.now() - lastActivityAt <= recentActivityMs;

      return Boolean(
        document.visibilityState !== "hidden"
        && !document.fullscreenElement
        && !aboutDialog?.open
        && !reducedMotion
        && !compactViewport
        && recentlyActive
      );
    }

    function stop() {
      titleElement.classList.remove(pulseClass);

      if (activeTimer) {
        window.clearTimeout(activeTimer);
        activeTimer = null;
      }

      if (activeGateTimer) {
        window.clearInterval(activeGateTimer);
        activeGateTimer = null;
      }
    }

    function start(durationMs) {
      if (durationMs <= 0) return;
      stop();

      const endAt = Date.now() + durationMs;
      const syncPulseState = () => {
        titleElement.classList.toggle(pulseClass, canRun() && Date.now() < endAt);
      };

      syncPulseState();
      activeGateTimer = window.setInterval(syncPulseState, gateIntervalMs);
      activeTimer = window.setTimeout(stop, durationMs);
    }

    function trackActivity() {
      lastActivityAt = Date.now();
    }

    function schedule() {
      const dailySchedule = readSchedule(storageKey);
      const elapsedMs = Date.now() - Number(dailySchedule.createdAt || Date.now());

      dailySchedule.sessions.forEach((session) => {
        const startAfterMs = Number(session.startAfterMs || 0);
        const durationMs = Number(session.durationMs || 0);
        const remainingDelayMs = startAfterMs - elapsedMs;
        const remainingDurationMs = durationMs + remainingDelayMs;

        if (durationMs <= 0 || remainingDurationMs <= 0) {
          return;
        }

        const timeoutId = window.setTimeout(
          () => start(Math.min(durationMs, remainingDurationMs)),
          Math.max(0, remainingDelayMs)
        );
        timeoutIds.push(timeoutId);
      });
    }

    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((eventName) => {
      document.addEventListener(eventName, trackActivity, { passive: true });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        stop();
      }
    });

    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        stop();
      }
    });

    aboutDialog?.addEventListener("close", stop);
    schedule();

    return {
      stop() {
        timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
        timeoutIds.length = 0;
        stop();
      }
    };
  }

  return { init };
})();
