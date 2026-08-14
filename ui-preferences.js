(() => {
  const playerConfig = window.KW_PLAYER_CONFIG || {};
  const storagePrefix = window.ImpalaConfig?.getStoragePrefix?.()
    || playerConfig.playlistStoragePrefix
    || "impalaStreamer";
  const STORAGE_KEY = `${storagePrefix}.uiPreferences`;
  const PLAYER_STATE_KEY = `${storagePrefix}.playerState`;
  const authStorageKey = window.ImpalaConfig?.getAuthStorageKey?.()
    || playerConfig.authStorageKey
    || "impalaStreamer.authSession";

  const PALETTES = {
    ember: {
      label: "Ember Night",
      vars: {
        "--theme-text": "#f8f0e4",
        "--theme-bg-1": "rgba(255, 168, 84, 0.2)",
        "--theme-bg-2": "rgba(255, 105, 105, 0.16)",
        "--theme-bg-main-a": "#120f14",
        "--theme-bg-main-b": "#1a1824",
        "--theme-bg-main-c": "#0d1119",
        "--theme-orb-left": "rgba(255, 190, 92, 0.14)",
        "--theme-orb-right": "rgba(140, 188, 255, 0.13)",
        "--card-bg": "rgba(16, 19, 28, 0.86)",
        "--card-border": "rgba(255, 255, 255, 0.08)",
        "--panel-bg": "rgba(255, 255, 255, 0.04)",
        "--panel-border": "rgba(255, 255, 255, 0.06)",
        "--muted": "#d5c2ad",
        "--accent": "#ffc36f",
        "--button-start": "#bec1c4",
        "--button-end": "#5d9376",
        "--button-text": "rgb(50, 31, 42)"
      }
    },
    ocean: {
      label: "Ocean Glass",
      vars: {
        "--theme-text": "#e7f5ff",
        "--theme-bg-1": "rgba(84, 191, 255, 0.2)",
        "--theme-bg-2": "rgba(68, 255, 223, 0.12)",
        "--theme-bg-main-a": "#081626",
        "--theme-bg-main-b": "#102339",
        "--theme-bg-main-c": "#07111d",
        "--theme-orb-left": "rgba(103, 204, 255, 0.16)",
        "--theme-orb-right": "rgba(102, 255, 212, 0.13)",
        "--card-bg": "rgba(10, 28, 40, 0.86)",
        "--card-border": "rgba(167, 228, 255, 0.2)",
        "--panel-bg": "rgba(120, 198, 233, 0.09)",
        "--panel-border": "rgba(160, 234, 255, 0.2)",
        "--muted": "#b7d9ea",
        "--accent": "#7ee4ff",
        "--button-start": "#b0e7ff",
        "--button-end": "#6bb8cb",
        "--button-text": "#123243"
      }
    },
    forest: {
      label: "Forest Glow",
      vars: {
        "--theme-text": "#f0f8ef",
        "--theme-bg-1": "rgba(156, 222, 102, 0.18)",
        "--theme-bg-2": "rgba(255, 214, 120, 0.13)",
        "--theme-bg-main-a": "#10180f",
        "--theme-bg-main-b": "#1a2a1c",
        "--theme-bg-main-c": "#101814",
        "--theme-orb-left": "rgba(160, 228, 117, 0.15)",
        "--theme-orb-right": "rgba(255, 210, 132, 0.12)",
        "--card-bg": "rgba(18, 29, 21, 0.86)",
        "--card-border": "rgba(205, 245, 177, 0.15)",
        "--panel-bg": "rgba(128, 171, 126, 0.1)",
        "--panel-border": "rgba(204, 241, 176, 0.16)",
        "--muted": "#d0dec0",
        "--accent": "#d8f08a",
        "--button-start": "#d8dca8",
        "--button-end": "#83b06e",
        "--button-text": "#23321d"
      }
    },
    neon: {
      label: "Neon Pulse",
      vars: {
        "--theme-text": "#ffeef7",
        "--theme-bg-1": "rgba(255, 92, 201, 0.2)",
        "--theme-bg-2": "rgba(88, 198, 255, 0.17)",
        "--theme-bg-main-a": "#130a21",
        "--theme-bg-main-b": "#23153c",
        "--theme-bg-main-c": "#120a1c",
        "--theme-orb-left": "rgba(255, 112, 219, 0.17)",
        "--theme-orb-right": "rgba(91, 215, 255, 0.14)",
        "--card-bg": "rgba(28, 17, 47, 0.86)",
        "--card-border": "rgba(248, 183, 255, 0.16)",
        "--panel-bg": "rgba(186, 118, 230, 0.11)",
        "--panel-border": "rgba(245, 188, 255, 0.16)",
        "--muted": "#e9c8df",
        "--accent": "#ffb0d8",
        "--button-start": "#f6c3ff",
        "--button-end": "#8ac4ef",
        "--button-text": "#3f204f"
      }
    },
    retro: {
      label: "Retro Cassette",
      vars: {
        "--theme-text": "#fff2d8",
        "--theme-bg-1": "rgba(255, 173, 102, 0.22)",
        "--theme-bg-2": "rgba(115, 199, 181, 0.17)",
        "--theme-bg-main-a": "#2a1d1b",
        "--theme-bg-main-b": "#4a2f2a",
        "--theme-bg-main-c": "#1b2229",
        "--theme-orb-left": "rgba(255, 152, 100, 0.18)",
        "--theme-orb-right": "rgba(125, 216, 196, 0.15)",
        "--card-bg": "rgba(35, 26, 31, 0.86)",
        "--card-border": "rgba(255, 203, 146, 0.15)",
        "--panel-bg": "rgba(255, 236, 190, 0.06)",
        "--panel-border": "rgba(255, 214, 157, 0.18)",
        "--muted": "#f2cfac",
        "--accent": "#ffbe73",
        "--button-start": "#ffd0a1",
        "--button-end": "#79b4a3",
        "--button-text": "#332223"
      }
    },
    pinkRibbon: {
      label: "Pink Ribbon",
      vars: {
        "--theme-text": "#fff2fb",
        "--theme-bg-1": "rgba(255, 110, 196, 0.24)",
        "--theme-bg-2": "rgba(255, 196, 229, 0.18)",
        "--theme-bg-main-a": "#4a1f46",
        "--theme-bg-main-b": "#7a3f70",
        "--theme-bg-main-c": "#a95ca2",
        "--theme-orb-left": "rgba(255, 153, 216, 0.2)",
        "--theme-orb-right": "rgba(255, 229, 245, 0.16)",
        "--card-bg": "rgba(65, 29, 62, 0.8)",
        "--card-border": "rgba(255, 210, 240, 0.28)",
        "--panel-bg": "rgba(255, 255, 255, 0.08)",
        "--panel-border": "rgba(255, 223, 245, 0.24)",
        "--muted": "#ffd7ef",
        "--accent": "#ff7ed5",
        "--button-start": "#ff8fe1",
        "--button-end": "#ff3dbf",
        "--button-text": "#3f1037"
      }
    }
  };

  const DEFAULT_PREFS = {
    palette: "ember",
    customNote: "Be Sovereign, Stay Sovereign.",
    medallionSrc: "assets/ddMusic.ico",
    localAudioDir: "",
    localVideoDir: "",
    localLibraryJson: "",
    localHelperEnabled: false,
    localHelperRoot: "",
    localHelperPort: "8089",
    skipTailSilenceEnabled: false,
    liveStreamEnabled: false,
    syncPlayEnabled: false,
    syncPlayApiBaseUrl: String(playerConfig.syncPlayApiBaseUrl || "").trim().replace(/\/+$/, ""),
    coastEnabled: false,
    coastApiBaseUrl: String(playerConfig.coastApiBaseUrl || "").trim().replace(/\/+$/, ""),
    cloudApiBaseUrl: String(playerConfig.apiBaseUrl || "").trim().replace(/\/+$/, ""),
    instanceId: ""
  };

  function createInstanceId() {
    if (globalThis.crypto?.randomUUID) {
      return `impala-${globalThis.crypto.randomUUID()}`;
    }

    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 12);
    return `impala-${timestamp}-${randomPart}`;
  }

  function sanitizePaletteKey(paletteKey) {
    if (typeof paletteKey !== "string") {
      return DEFAULT_PREFS.palette;
    }

    return Object.prototype.hasOwnProperty.call(PALETTES, paletteKey)
      ? paletteKey
      : DEFAULT_PREFS.palette;
  }

  function sanitizeCustomNote(customNote) {
    if (typeof customNote !== "string") {
      return DEFAULT_PREFS.customNote;
    }

    const trimmed = customNote.trim();
    if (!trimmed) {
      return DEFAULT_PREFS.customNote;
    }

    return trimmed.slice(0, 180);
  }

  function sanitizeMedallionSrc(medallionSrc) {
    if (typeof medallionSrc !== "string") {
      return DEFAULT_PREFS.medallionSrc;
    }

    const trimmed = medallionSrc.trim();
    if (!trimmed) {
      return DEFAULT_PREFS.medallionSrc;
    }

    if (/^javascript:/i.test(trimmed)) {
      return DEFAULT_PREFS.medallionSrc;
    }

    return trimmed;
  }

  function sanitizeLocalDirectory(localDirectory) {
    if (typeof localDirectory !== "string") {
      return "";
    }

    const trimmed = localDirectory.trim();
    if (!trimmed || /^javascript:/i.test(trimmed)) {
      return "";
    }

    return trimmed.replace(/\/+$/, "");
  }

  function sanitizeLocalLibraryJson(localLibraryJson) {
    if (typeof localLibraryJson !== "string") {
      return "";
    }

    return localLibraryJson.trim();
  }

  function sanitizeCloudApiBaseUrl(cloudApiBaseUrl) {
    if (typeof cloudApiBaseUrl !== "string") {
      return DEFAULT_PREFS.cloudApiBaseUrl;
    }

    const trimmed = cloudApiBaseUrl.trim().replace(/\/+$/, "");
    if (!trimmed) {
      return "";
    }

    try {
      const parsedUrl = new URL(trimmed);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return DEFAULT_PREFS.cloudApiBaseUrl;
      }
      return parsedUrl.toString().replace(/\/+$/, "");
    } catch (_error) {
      return DEFAULT_PREFS.cloudApiBaseUrl;
    }
  }

  function sanitizeSyncPlayApiBaseUrl(value) {
    const fallback = String(DEFAULT_PREFS.syncPlayApiBaseUrl || "").trim().replace(/\/+$/, "");
    const trimmed = String(value || "").trim().replace(/\/+$/, "");
    if (!trimmed) return fallback;
    try {
      const parsedUrl = new URL(trimmed);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) return fallback;
      return parsedUrl.toString().replace(/\/+$/, "");
    } catch (_error) {
      return fallback;
    }
  }

  function sanitizeInstanceId(instanceId) {
    const trimmed = String(instanceId || "").trim();
    if (!trimmed) {
      return "";
    }

    return trimmed.replace(/[^a-z0-9._:-]/gi, "-").slice(0, 96);
  }

  function sanitizeLocalHelperPort(port) {
    const normalized = String(port || "").trim();
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
      return DEFAULT_PREFS.localHelperPort;
    }

    return String(parsed);
  }

  function sanitizeBoolean(value) {
    return value === true;
  }

  function normalizePreferences(preferences = {}) {
    return {
      palette: sanitizePaletteKey(preferences.palette),
      customNote: sanitizeCustomNote(preferences.customNote),
      medallionSrc: sanitizeMedallionSrc(preferences.medallionSrc),
      localAudioDir: sanitizeLocalDirectory(preferences.localAudioDir),
      localVideoDir: sanitizeLocalDirectory(preferences.localVideoDir),
      localLibraryJson: sanitizeLocalLibraryJson(preferences.localLibraryJson),
      localHelperEnabled: sanitizeBoolean(preferences.localHelperEnabled),
      localHelperRoot: sanitizeLocalDirectory(preferences.localHelperRoot),
      localHelperPort: sanitizeLocalHelperPort(preferences.localHelperPort),
      skipTailSilenceEnabled: sanitizeBoolean(preferences.skipTailSilenceEnabled),
      liveStreamEnabled: sanitizeBoolean(preferences.liveStreamEnabled),
      syncPlayEnabled: sanitizeBoolean(preferences.syncPlayEnabled),
      syncPlayApiBaseUrl: sanitizeSyncPlayApiBaseUrl(preferences.syncPlayApiBaseUrl),
      coastEnabled: sanitizeBoolean(preferences.coastEnabled),
      coastApiBaseUrl: sanitizeSyncPlayApiBaseUrl(preferences.coastApiBaseUrl || DEFAULT_PREFS.coastApiBaseUrl),
      cloudApiBaseUrl: sanitizeCloudApiBaseUrl(preferences.cloudApiBaseUrl),
      instanceId: sanitizeInstanceId(preferences.instanceId) || createInstanceId()
    };
  }

  function loadPreferences() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initialPreferences = normalizePreferences(DEFAULT_PREFS);
        savePreferences(initialPreferences);
        return initialPreferences;
      }

      const parsed = JSON.parse(raw);
      const normalized = normalizePreferences(parsed || {});
      if (!parsed?.instanceId) {
        savePreferences(normalized);
      }
      return normalized;
    } catch (error) {
      console.error("Unable to load UI preferences:", error);
      return normalizePreferences(DEFAULT_PREFS);
    }
  }

  function savePreferences(nextPreferences) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences));
    return nextPreferences;
  }

  function applyPalette(paletteKey) {
    const normalizedKey = sanitizePaletteKey(paletteKey);
    const palette = PALETTES[normalizedKey];

    Object.entries(palette.vars).forEach(([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar, value);
    });

    document.documentElement.dataset.palette = normalizedKey;
    return normalizedKey;
  }

  function applyCustomContent(preferences) {
    const normalized = normalizePreferences(preferences);

    const customNoteNode = document.getElementById("custom-note-text");
    if (customNoteNode) {
      customNoteNode.textContent = normalized.customNote;
    }

    const medallionNode = document.getElementById("player-medallion");
    if (medallionNode) {
      medallionNode.setAttribute("src", normalized.medallionSrc);
      medallionNode.setAttribute("alt", "Custom player medallion");
    }
  }

  function applyFeatureSurfaces(preferences) {
    const normalized = normalizePreferences(preferences);
    document.documentElement.dataset.liveStreamEnabled = normalized.liveStreamEnabled ? "true" : "false";
    document.documentElement.dataset.syncPlayEnabled = normalized.syncPlayEnabled ? "true" : "false";
    document.documentElement.dataset.coastEnabled = normalized.coastEnabled ? "true" : "false";
    document.querySelectorAll("[data-live-stream-surface]").forEach((element) => {
      element.hidden = !normalized.liveStreamEnabled;
    });
    document.querySelectorAll("[data-sync-play-surface]").forEach((element) => {
      element.hidden = !normalized.syncPlayEnabled;
    });
    document.querySelectorAll("[data-coast-surface]").forEach((element) => {
      element.hidden = !normalized.coastEnabled;
    });
    document.querySelectorAll("[data-collaboration-surface]").forEach((element) => {
      element.hidden = !(normalized.syncPlayEnabled || normalized.coastEnabled);
    });
  }

  function applyPreferences(preferences = loadPreferences()) {
    const normalized = normalizePreferences(preferences);

    applyPalette(normalized.palette);
    applyCustomContent(normalized);
    applyFeatureSurfaces(normalized);
    return normalized;
  }

  function setPalette(paletteKey) {
    const currentPreferences = loadPreferences();
    const normalizedPalette = sanitizePaletteKey(paletteKey);
    const nextPreferences = savePreferences({
      ...currentPreferences,
      palette: normalizedPalette
    });
    applyPreferences(nextPreferences);
    return nextPreferences;
  }

  function setCustomContent(nextContent = {}) {
    const currentPreferences = loadPreferences();
    const nextPreferences = savePreferences({
      ...currentPreferences,
      customNote: sanitizeCustomNote(nextContent.customNote),
      medallionSrc: sanitizeMedallionSrc(nextContent.medallionSrc)
    });

    applyPreferences(nextPreferences);
    return nextPreferences;
  }

  function setLocalMediaDirectories(nextDirectories = {}) {
    const currentPreferences = loadPreferences();
    const nextPreferences = savePreferences({
      ...currentPreferences,
      localAudioDir: sanitizeLocalDirectory(nextDirectories.localAudioDir),
      localVideoDir: sanitizeLocalDirectory(nextDirectories.localVideoDir)
    });

    return nextPreferences;
  }

  function setLocalLibraryJson(nextLibraryJson = "") {
    const currentPreferences = loadPreferences();
    const nextLocalLibraryJson = sanitizeLocalLibraryJson(nextLibraryJson);
    const hasChanged = currentPreferences.localLibraryJson !== nextLocalLibraryJson;
    const nextPreferences = savePreferences({
      ...currentPreferences,
      localLibraryJson: nextLocalLibraryJson
    });

    if (hasChanged) {
      // Prevent stale playlist/song restoration when local manifest changes.
      localStorage.removeItem(PLAYER_STATE_KEY);
    }

    return nextPreferences;
  }

  function setLocalHelperSettings(nextSettings = {}) {
    const currentPreferences = loadPreferences();
    const hasEnabled = Object.prototype.hasOwnProperty.call(nextSettings, "localHelperEnabled");
    const hasRoot = Object.prototype.hasOwnProperty.call(nextSettings, "localHelperRoot");
    const hasPort = Object.prototype.hasOwnProperty.call(nextSettings, "localHelperPort");
    const nextPreferences = savePreferences({
      ...currentPreferences,
      localHelperEnabled: hasEnabled
        ? sanitizeBoolean(nextSettings.localHelperEnabled)
        : sanitizeBoolean(currentPreferences.localHelperEnabled),
      localHelperRoot: hasRoot
        ? sanitizeLocalDirectory(nextSettings.localHelperRoot)
        : sanitizeLocalDirectory(currentPreferences.localHelperRoot),
      localHelperPort: hasPort
        ? sanitizeLocalHelperPort(nextSettings.localHelperPort)
        : sanitizeLocalHelperPort(currentPreferences.localHelperPort)
    });

    return nextPreferences;
  }

  function setLiveStreamEnabled(enabled) {
    const currentPreferences = loadPreferences();
    const nextPreferences = savePreferences({
      ...currentPreferences,
      liveStreamEnabled: sanitizeBoolean(enabled)
    });

    applyPreferences(nextPreferences);
    return nextPreferences;
  }

  function setSkipTailSilenceEnabled(enabled) {
    const currentPreferences = loadPreferences();
    return savePreferences({
      ...currentPreferences,
      skipTailSilenceEnabled: sanitizeBoolean(enabled)
    });
  }

  function setSyncPlaySettings(settings = {}) {
    const currentPreferences = loadPreferences();
    const nextPreferences = savePreferences({
      ...currentPreferences,
      syncPlayEnabled: sanitizeBoolean(settings.enabled),
      syncPlayApiBaseUrl: sanitizeSyncPlayApiBaseUrl(settings.apiBaseUrl)
    });
    applyPreferences(nextPreferences);
    return nextPreferences;
  }

  function setCoastSettings(settings = {}) {
    const currentPreferences = loadPreferences();
    const nextPreferences = savePreferences({
      ...currentPreferences,
      coastEnabled: sanitizeBoolean(settings.enabled),
      coastApiBaseUrl: sanitizeSyncPlayApiBaseUrl(settings.apiBaseUrl || DEFAULT_PREFS.coastApiBaseUrl)
    });
    applyPreferences(nextPreferences);
    return nextPreferences;
  }

  function setCloudConnection(nextConnection = {}) {
    const currentPreferences = loadPreferences();
    const nextCloudApiBaseUrl = sanitizeCloudApiBaseUrl(nextConnection.cloudApiBaseUrl);
    const previousCloudApiBaseUrl = sanitizeCloudApiBaseUrl(currentPreferences.cloudApiBaseUrl);
    const nextPreferences = savePreferences({
      ...currentPreferences,
      cloudApiBaseUrl: nextCloudApiBaseUrl
    });

    if (nextCloudApiBaseUrl !== previousCloudApiBaseUrl) {
      localStorage.removeItem(authStorageKey);
    }

    return {
      preferences: nextPreferences,
      sessionCleared: nextCloudApiBaseUrl !== previousCloudApiBaseUrl
    };
  }

  function resetCloudConnection() {
    return setCloudConnection({
      cloudApiBaseUrl: DEFAULT_PREFS.cloudApiBaseUrl
    });
  }

  function regenerateInstanceId() {
    const currentPreferences = loadPreferences();
    const nextPreferences = savePreferences({
      ...currentPreferences,
      instanceId: createInstanceId()
    });

    return nextPreferences;
  }

  function getCloudApiBaseUrl() {
    return normalizePreferences(loadPreferences()).cloudApiBaseUrl;
  }

  function resetPreferences() {
    const nextPreferences = savePreferences(normalizePreferences(DEFAULT_PREFS));
    applyPreferences(nextPreferences);
    return nextPreferences;
  }

  function getPaletteOptions() {
    return Object.entries(PALETTES).map(([id, value]) => ({
      id,
      label: value.label,
      vars: { ...value.vars }
    }));
  }

  window.UiPreferences = {
    getPreferences: loadPreferences,
    applyPreferences,
    setPalette,
    setCustomContent,
    setLocalMediaDirectories,
    setLocalLibraryJson,
    setLocalHelperSettings,
    setSkipTailSilenceEnabled,
    setLiveStreamEnabled,
    setSyncPlaySettings,
    setCoastSettings,
    setCloudConnection,
    resetCloudConnection,
    regenerateInstanceId,
    getCloudApiBaseUrl,
    resetPreferences,
    getPaletteOptions,
    storageKey: STORAGE_KEY
  };

  applyPreferences(loadPreferences());
})();
