window.KW_PLAYER_CONFIG = window.KW_PLAYER_CONFIG || {
  apiBaseUrl: "https://vin-impala-signer-36d6ffefaed5.herokuapp.com/",
  liveStreamApiBaseUrl: "https://family-impala-live-248de01b2798.herokuapp.com",
  localLiveStreamApiBaseUrl:
    "https://family-impala-live-248de01b2798.herokuapp.com",
  syncPlayApiBaseUrl: "",
  coastApiBaseUrl: "",
  // Public, read-only metadata sidecar; private playback remains on Family services.
  metadataApiUrl:
    "https://family-impala-metadata-93d758b55ecd.herokuapp.com/api/metadata",
  authStorageKey: "vinImpala.authSession",
  playlistStoragePrefix: "vinImpala",
  instanceStorageId: "",
  builtInPlaylistsEnabled: true,
  enabledBuiltInPlaylistIds: ["songs"],
  brandName: "Impala Streamer",
  editionName: "Impala Streamer (Vin Edition)",
  appVersion: "1.2.0",
  appBuildDate: "2026.08.13",
  mkvPlaybackEnabled: true,
  localHelperDownloadUrl:
    "https://www.discrete-dev.com/downloads.html#impalaHelper",
};

window.ImpalaConfig =
  window.ImpalaConfig ||
  (() => {
    const config = window.KW_PLAYER_CONFIG || {};

    function cleanStorageSegment(value) {
      return String(value || "")
        .trim()
        .replace(/[^a-z0-9._:-]/gi, "-")
        .replace(/^-+|-+$/g, "");
    }

    function getStoragePrefix() {
      const basePrefix =
        cleanStorageSegment(config.playlistStoragePrefix) || "impalaStreamer";
      const instanceStorageId = cleanStorageSegment(config.instanceStorageId);
      return instanceStorageId
        ? `${basePrefix}.${instanceStorageId}`
        : basePrefix;
    }

    function getAuthStorageKey() {
      if (config.authStorageKey && !config.instanceStorageId) {
        return String(config.authStorageKey);
      }

      return `${getStoragePrefix()}.authSession`;
    }

    const preferencesKey = `${getStoragePrefix()}.uiPreferences`;

    function readPreferences() {
      try {
        const rawPreferences = localStorage.getItem(preferencesKey);
        return rawPreferences ? JSON.parse(rawPreferences) : {};
      } catch (error) {
        console.error("Unable to read Impala runtime preferences:", error);
        return {};
      }
    }

    function cleanUrl(value) {
      return String(value || "")
        .trim()
        .replace(/\/+$/, "");
    }

    function getCloudApiBaseUrl() {
      const preferences = readPreferences();
      return cleanUrl(preferences.cloudApiBaseUrl || config.apiBaseUrl || "");
    }

    function getLiveStreamApiBaseUrl() {
      const hostname = window.location?.hostname || "";
      const isLocalPreview =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";
      const configuredUrl =
        config.liveStreamApiBaseUrl ||
        (isLocalPreview ? config.localLiveStreamApiBaseUrl : "");
      return cleanUrl(configuredUrl);
    }

    function getSyncPlayApiBaseUrl() {
      const preferences = readPreferences();
      return cleanUrl(
        preferences.syncPlayApiBaseUrl || config.syncPlayApiBaseUrl || "",
      );
    }

    function getCoastApiBaseUrl() {
      const preferences = readPreferences();
      return cleanUrl(
        preferences.coastApiBaseUrl || config.coastApiBaseUrl || "",
      );
    }

    function getInstanceId() {
      const preferences = readPreferences();
      return String(preferences.instanceId || "").trim();
    }

    function getMetadataApiUrl() {
      const preferences = readPreferences();
      if (preferences.metadataEnabled !== true) return "";
      return cleanUrl(config.metadataApiUrl || "");
    }

    function isMkvPlaybackEnabled() {
      return config.mkvPlaybackEnabled === true;
    }

    function areBuiltInPlaylistsEnabled() {
      return config.builtInPlaylistsEnabled === true;
    }

    function getEnabledBuiltInPlaylistIds() {
      if (!areBuiltInPlaylistsEnabled()) {
        return [];
      }

      return Array.isArray(config.enabledBuiltInPlaylistIds)
        ? config.enabledBuiltInPlaylistIds.map((playlistId) =>
            String(playlistId),
          )
        : [];
    }

    return {
      preferencesKey,
      getStoragePrefix,
      getAuthStorageKey,
      getCloudApiBaseUrl,
      getLiveStreamApiBaseUrl,
      getSyncPlayApiBaseUrl,
      getCoastApiBaseUrl,
      getMetadataApiUrl,
      getInstanceId,
      isMkvPlaybackEnabled,
      areBuiltInPlaylistsEnabled,
      getEnabledBuiltInPlaylistIds,
    };
  })();
