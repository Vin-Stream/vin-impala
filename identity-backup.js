(() => {
  const BACKUP_SCHEMA = "impala.identity.backup.v1";
  const playerConfig = window.KW_PLAYER_CONFIG || {};
  const storagePrefix = window.ImpalaConfig?.getStoragePrefix?.()
    || playerConfig.playlistStoragePrefix
    || "impalaStreamer";

  function readJson(key, fallbackValue) {
    try {
      const rawValue = localStorage.getItem(key);
      return rawValue ? JSON.parse(rawValue) : fallbackValue;
    } catch (error) {
      console.error(`Unable to read ${key} for backup:`, error);
      return fallbackValue;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      window.DiagnosticStore?.recordStorageWrite(key, true);
      return true;
    } catch (error) {
      window.DiagnosticStore?.recordStorageWrite(key, false, error);
      console.error(`Unable to restore ${key}:`, error);
      return false;
    }
  }

  function collectBuiltInPlayStates(prefix) {
    const states = {};

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(prefix)) {
          continue;
        }

        const playlistId = key.slice(prefix.length);
        if (playlistId) {
          states[playlistId] = readJson(key, []);
        }
      }
    } catch (error) {
      console.error("Unable to inspect built-in play states for backup:", error);
    }

    return states;
  }

  function createBackup() {
    const playlistKeys = window.PlaylistStore?.STORAGE_KEYS || {
      customPlaylists: `${storagePrefix}.customPlaylists`,
      playerState: `${storagePrefix}.playerState`,
      builtInPlayStatesPrefix: `${storagePrefix}.playStates.`
    };
    const stateKeys = window.PlayerStateStore?.STORAGE_KEYS || {
      playbackPositions: `${storagePrefix}.playbackPositions`,
      repeatMode: `${storagePrefix}.repeatMode`,
      randomMode: `${storagePrefix}.randomMode`
    };
    const preferencesKey = window.UiPreferences?.storageKey || `${storagePrefix}.uiPreferences`;

    return {
      schema: BACKUP_SCHEMA,
      appVersion: playerConfig.appVersion || "unknown",
      appBuildDate: playerConfig.appBuildDate || "unknown",
      exportedAt: new Date().toISOString(),
      storagePrefix,
      preferences: readJson(preferencesKey, null),
      customPlaylists: readJson(playlistKeys.customPlaylists, []),
      builtInPlayStates: collectBuiltInPlayStates(playlistKeys.builtInPlayStatesPrefix),
      playerState: readJson(playlistKeys.playerState, null),
      playerSettings: {
        repeatMode: localStorage.getItem(stateKeys.repeatMode) || "off",
        randomMode: localStorage.getItem(stateKeys.randomMode) === "true"
      },
      playbackPositions: readJson(stateKeys.playbackPositions, {})
    };
  }

  function downloadBackup() {
    const backup = createBackup();
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `impala-backup-${dateStamp}.json`;
    const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    Object.defineProperty(backup, "downloadFilename", {
      value: filename,
      enumerable: false
    });
    return backup;
  }

  function validateBackup(candidate) {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("Backup file is not a JSON object.");
    }

    if (candidate.schema !== BACKUP_SCHEMA) {
      throw new Error("Backup schema is not supported by this version of Impala.");
    }

    if (candidate.preferences !== null && typeof candidate.preferences !== "object") {
      throw new Error("Backup preferences are invalid.");
    }

    if (!Array.isArray(candidate.customPlaylists)) {
      throw new Error("Backup custom playlists are invalid.");
    }

    if (candidate.builtInPlayStates && typeof candidate.builtInPlayStates !== "object") {
      throw new Error("Backup built-in play states are invalid.");
    }

    if (candidate.playerState !== null && candidate.playerState !== undefined && typeof candidate.playerState !== "object") {
      throw new Error("Backup player state is invalid.");
    }

    if (candidate.playbackPositions && typeof candidate.playbackPositions !== "object") {
      throw new Error("Backup playback positions are invalid.");
    }

    return candidate;
  }

  function restoreBackup(rawBackup) {
    const backup = validateBackup(rawBackup);
    const playlistKeys = window.PlaylistStore?.STORAGE_KEYS || {
      customPlaylists: `${storagePrefix}.customPlaylists`,
      playerState: `${storagePrefix}.playerState`,
      builtInPlayStatesPrefix: `${storagePrefix}.playStates.`
    };
    const stateKeys = window.PlayerStateStore?.STORAGE_KEYS || {
      playbackPositions: `${storagePrefix}.playbackPositions`,
      repeatMode: `${storagePrefix}.repeatMode`,
      randomMode: `${storagePrefix}.randomMode`
    };
    const preferencesKey = window.UiPreferences?.storageKey || `${storagePrefix}.uiPreferences`;
    const restoredKeys = [];

    if (backup.preferences) {
      writeJson(preferencesKey, backup.preferences);
      restoredKeys.push("preferences");
    }

    writeJson(playlistKeys.customPlaylists, backup.customPlaylists || []);
    restoredKeys.push("custom playlists");

    if (backup.playerState) {
      writeJson(playlistKeys.playerState, backup.playerState);
      restoredKeys.push("player state");
    }

    Object.entries(backup.builtInPlayStates || {}).forEach(([playlistId, playStates]) => {
      if (!playlistId || !Array.isArray(playStates)) {
        return;
      }

      writeJson(`${playlistKeys.builtInPlayStatesPrefix}${playlistId}`, playStates);
    });

    if (backup.builtInPlayStates && Object.keys(backup.builtInPlayStates).length) {
      restoredKeys.push("built-in play states");
    }

    const playerSettings = backup.playerSettings || {};
    const repeatMode = ["off", "one", "all"].includes(playerSettings.repeatMode)
      ? playerSettings.repeatMode
      : "off";
    localStorage.setItem(stateKeys.repeatMode, repeatMode);
    localStorage.setItem(stateKeys.randomMode, playerSettings.randomMode ? "true" : "false");
    restoredKeys.push("player settings");

    writeJson(stateKeys.playbackPositions, backup.playbackPositions || {});
    restoredKeys.push("playback positions");

    window.UiPreferences?.applyPreferences?.();
    return { restoredKeys };
  }

  window.IdentityBackup = {
    schema: BACKUP_SCHEMA,
    createBackup,
    downloadBackup,
    validateBackup,
    restoreBackup
  };
})();
