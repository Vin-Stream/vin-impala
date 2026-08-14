(() => {
  const playerConfig = window.KW_PLAYER_CONFIG || {};
  const storagePrefix = window.ImpalaConfig?.getStoragePrefix?.()
    || playerConfig.playlistStoragePrefix
    || "impalaStreamer";
  const STORAGE_KEYS = {
    playbackPositions: `${storagePrefix}.playbackPositions`,
    voiceSyncOffsets: `${storagePrefix}.voiceSyncOffsets`,
    repeatMode: `${storagePrefix}.repeatMode`,
    randomMode: `${storagePrefix}.randomMode`
  };

  function readJson(key, fallbackValue) {
    try {
      const rawValue = localStorage.getItem(key);
      return rawValue ? JSON.parse(rawValue) : fallbackValue;
    } catch (error) {
      console.error(`Unable to load ${key}:`, error);
      return fallbackValue;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      window.DiagnosticStore?.recordStorageWrite(key, true);
    } catch (error) {
      window.DiagnosticStore?.recordStorageWrite(key, false, error);
      console.error(`Unable to save ${key}:`, error);
    }
  }

  function loadRepeatMode() {
    try {
      const value = localStorage.getItem(STORAGE_KEYS.repeatMode);
      return ["off", "one", "all"].includes(value) ? value : "off";
    } catch (error) {
      console.error("Unable to load repeat mode:", error);
      return "off";
    }
  }

  function saveRepeatMode(mode) {
    const repeatMode = ["off", "one", "all"].includes(mode) ? mode : "off";
    try {
      localStorage.setItem(STORAGE_KEYS.repeatMode, repeatMode);
      window.DiagnosticStore?.recordStorageWrite(STORAGE_KEYS.repeatMode, true);
    } catch (error) {
      window.DiagnosticStore?.recordStorageWrite(STORAGE_KEYS.repeatMode, false, error);
      console.error("Unable to save repeat mode:", error);
    }
    return repeatMode;
  }

  function loadRandomMode() {
    try {
      return localStorage.getItem(STORAGE_KEYS.randomMode) === "true";
    } catch (error) {
      console.error("Unable to load random mode:", error);
      return false;
    }
  }

  function saveRandomMode(enabled) {
    const randomMode = Boolean(enabled);
    try {
      localStorage.setItem(STORAGE_KEYS.randomMode, randomMode ? "true" : "false");
      window.DiagnosticStore?.recordStorageWrite(STORAGE_KEYS.randomMode, true);
    } catch (error) {
      window.DiagnosticStore?.recordStorageWrite(STORAGE_KEYS.randomMode, false, error);
      console.error("Unable to save random mode:", error);
    }
    return randomMode;
  }

  function getPlaybackPositionKey(song) {
    return window.TrackSelectionStore?.getSongIdentity(song) || String(song?.objectKey || song?.file || song?.id || "");
  }

  function getSavedPlaybackPosition(song) {
    const key = getPlaybackPositionKey(song);
    if (!key) {
      return 0;
    }

    const positions = readJson(STORAGE_KEYS.playbackPositions, {});
    const position = Number(positions[key] || 0);
    return Number.isFinite(position) && position > 0 ? position : 0;
  }

  function savePlaybackPosition(song, positionSeconds, durationSeconds = 0, options = {}) {
    const key = getPlaybackPositionKey(song);
    const position = Number(positionSeconds || 0);
    if (!key || !Number.isFinite(position)) {
      return;
    }

    const resumeThresholdSeconds = Number(options.resumeThresholdSeconds || 12);
    const finishedThresholdSeconds = Number(options.finishedThresholdSeconds || 20);
    const positions = readJson(STORAGE_KEYS.playbackPositions, {});
    const duration = Number(durationSeconds || 0);
    const isNearEnd = duration > 0 && duration - position <= finishedThresholdSeconds;

    if (position < resumeThresholdSeconds || isNearEnd) {
      delete positions[key];
    } else {
      positions[key] = Math.floor(position);
    }

    writeJson(STORAGE_KEYS.playbackPositions, positions);
  }

  function normalizeVoiceSyncOffset(offsetMs) {
    const parsedOffset = Number(offsetMs || 0);
    if (!Number.isFinite(parsedOffset)) {
      return 0;
    }

    const boundedOffset = Math.max(-2000, Math.min(2000, parsedOffset));
    return Math.sign(boundedOffset) * Math.round(Math.abs(boundedOffset) / 50) * 50;
  }

  function getVoiceSyncOffset(song) {
    const key = getPlaybackPositionKey(song);
    if (!key) {
      return 0;
    }

    const offsets = readJson(STORAGE_KEYS.voiceSyncOffsets, {});
    if (Object.prototype.hasOwnProperty.call(offsets, key)) {
      return normalizeVoiceSyncOffset(offsets[key]);
    }
    return normalizeVoiceSyncOffset(song?.voiceSyncMs);
  }

  function saveVoiceSyncOffset(song, offsetMs) {
    const key = getPlaybackPositionKey(song);
    if (!key) {
      return 0;
    }

    const normalizedOffset = normalizeVoiceSyncOffset(offsetMs);
    const offsets = readJson(STORAGE_KEYS.voiceSyncOffsets, {});
    if (normalizedOffset === 0) {
      delete offsets[key];
    } else {
      offsets[key] = normalizedOffset;
    }
    writeJson(STORAGE_KEYS.voiceSyncOffsets, offsets);
    return normalizedOffset;
  }

  function clearVoiceSyncOffsets() {
    writeJson(STORAGE_KEYS.voiceSyncOffsets, {});
  }

  window.PlayerStateStore = {
    STORAGE_KEYS,
    readJson,
    writeJson,
    loadRepeatMode,
    saveRepeatMode,
    loadRandomMode,
    saveRandomMode,
    getPlaybackPositionKey,
    getSavedPlaybackPosition,
    savePlaybackPosition,
    normalizeVoiceSyncOffset,
    getVoiceSyncOffset,
    saveVoiceSyncOffset,
    clearVoiceSyncOffsets
  };
})();
