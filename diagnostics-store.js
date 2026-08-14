(() => {
  const playerConfig = window.KW_PLAYER_CONFIG || {};
  const prefix = window.ImpalaConfig?.getStoragePrefix?.()
    || playerConfig.playlistStoragePrefix
    || "impalaStreamer";
  const SNAPSHOT_KEY = `${prefix}.diagnostics.snapshot`;
  const ERROR_LOG_KEY = `${prefix}.diagnostics.errors`;
  const MAX_ERRORS = 100;
  const MAX_LOGS = 50;
  const recentLogs = [];
  let lastWrite = null;

  function stringifyDetail(detail) {
    if (detail instanceof Error) {
      return detail.message;
    }
    if (typeof detail === "string") {
      return detail;
    }
    try {
      return JSON.stringify(detail);
    } catch (_) {
      return String(detail);
    }
  }

  function classify(message) {
    const value = String(message || "").toLowerCase();
    if (value.includes("json") || value.includes("parse")) return "JSON parse error";
    if (value.includes("save") || value.includes("storage") || value.includes("write")) return "Storage write failure";
    if (value.includes("registry") || value.includes("playlist") && value.includes("mismatch")) return "Playlist registry mismatch";
    if (value.includes("media") || value.includes("playing song") || value.includes("element error")) return "Media load error";
    return "Application error";
  }

  function readErrors() {
    try {
      const value = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function recordError(category, message, detail) {
    const entry = {
      time: new Date().toISOString(),
      category: category || classify(message),
      message: String(message || "Unknown error"),
      detail: detail === undefined ? "" : stringifyDetail(detail)
    };
    try {
      const errors = readErrors();
      errors.push(entry);
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(errors.slice(-MAX_ERRORS)));
    } catch (_) {
      // Diagnostics must never interfere with playback when storage is unavailable.
    }
    return entry;
  }

  function recordLog(level, args) {
    recentLogs.push({
      time: new Date().toISOString(),
      level,
      message: args.map(stringifyDetail).join(" ").slice(0, 1000)
    });
    if (recentLogs.length > MAX_LOGS) recentLogs.splice(0, recentLogs.length - MAX_LOGS);
  }

  function readLogs() {
    return recentLogs.slice();
  }

  function recordStorageWrite(key, success, error) {
    lastWrite = {
      time: new Date().toISOString(),
      key: String(key || ""),
      success: Boolean(success),
      error: error ? stringifyDetail(error) : ""
    };
    if (!success) {
      recordError("Storage write failure", `Unable to write ${key}`, error);
    }
  }

  function getStorageHealth() {
    const keys = [];
    let totalBytes = 0;
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        const value = localStorage.getItem(key) || "";
        const bytes = (String(key).length + value.length) * 2;
        keys.push({ key, bytes });
        totalBytes += bytes;
      }
    } catch (error) {
      recordError("Storage write failure", "Unable to inspect local storage", error);
    }
    return {
      totalBytes,
      warning: totalBytes > 4 * 1024 * 1024,
      keys: keys.sort((a, b) => b.bytes - a.bytes),
      lastWrite
    };
  }

  function publish(snapshot) {
    const payload = {
      ...snapshot,
      updatedAt: new Date().toISOString(),
      storage: getStorageHealth(),
      errors: readErrors()
    };
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
    } catch (error) {
      recordStorageWrite(SNAPSHOT_KEY, false, error);
    }
    return payload;
  }

  function getSnapshot() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
      return snapshot && typeof snapshot === "object" ? snapshot : null;
    } catch (error) {
      recordError("JSON parse error", "Unable to parse diagnostics snapshot", error);
      return null;
    }
  }

  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    originalConsoleError(...args);
    recordLog("error", args);
    const message = stringifyDetail(args[0]);
    const searchableMessage = args.map(stringifyDetail).join(" ");
    recordError(classify(searchableMessage), message, args.slice(1));
  };
  const originalConsoleWarn = console.warn.bind(console);
  console.warn = (...args) => {
    originalConsoleWarn(...args);
    recordLog("warn", args);
  };
  const originalConsoleLog = console.log.bind(console);
  console.log = (...args) => {
    originalConsoleLog(...args);
    recordLog("log", args);
  };

  window.addEventListener("error", (event) => {
    recordError("Application error", event.message, event.error || `${event.filename}:${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordError("Application error", "Unhandled promise rejection", event.reason);
  });

  window.DiagnosticStore = {
    SNAPSHOT_KEY,
    ERROR_LOG_KEY,
    publish,
    getSnapshot,
    getStorageHealth,
    readErrors,
    readLogs,
    recordError,
    recordStorageWrite
  };
})();
