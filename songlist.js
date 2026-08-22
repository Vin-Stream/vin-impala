document.addEventListener("DOMContentLoaded", () => {
  const songList = document.getElementById("song-list");
  const playlistTitle = document.getElementById("playlist-title");
  const editorPlaylistSelector = document.getElementById("editor-playlist-selector");
  const createPlaylistButton = document.getElementById("create-playlist-btn");
  const importPlaylistButton = document.getElementById("import-playlist-btn");
  const exportPlaylistButton = document.getElementById("export-playlist-btn");
  const playlistList = document.getElementById("playlist-list");
  const combinePlaylistsButton = document.getElementById("combine-playlists-btn");
  const cancelCombinePlaylistsButton = document.getElementById("cancel-combine-playlists-btn");
  const playAllPlaylistsButton = document.getElementById("play-all-playlists-btn");
  const importPlaylistPanel = document.getElementById("import-playlist-panel");
  const importPlaylistText = document.getElementById("import-playlist-text");
  const importPlaylistApplyButton = document.getElementById("import-playlist-apply-btn");
  const importPlaylistMergeButton = document.getElementById("import-playlist-merge-btn");
  const importPlaylistCancelButton = document.getElementById("import-playlist-cancel-btn");
  const renamePlaylistButton = document.getElementById("rename-playlist-btn");
  const deletePlaylistButton = document.getElementById("delete-playlist-btn");
  const deletePlaylistPanel = document.getElementById("delete-playlist-panel");
  const deletePlaylistSelector = document.getElementById("delete-playlist-selector");
  const deletePlaylistApplyButton = document.getElementById("delete-playlist-apply-btn");
  const deletePlaylistCancelButton = document.getElementById("delete-playlist-cancel-btn");
  const editorMessage = document.getElementById("editor-message");
  const customLibraryPanel = document.getElementById("custom-library-panel");
  const libraryStatus = document.getElementById("library-status");
  const librarySearchInput = document.getElementById("library-search-input");
  const libraryModeAudioButton = document.getElementById("library-mode-audio-btn");
  const libraryModeVideoButton = document.getElementById("library-mode-video-btn");
  const libraryCurrentHeading = document.getElementById("library-current-heading");
  const libraryPlayHint = document.getElementById("library-play-hint");
  const libraryCurrentTitle = document.getElementById("library-current-title");
  const libraryPreviewHeading = document.getElementById("library-preview-heading");
  const libraryPreviewTitle = document.getElementById("library-preview-title");
  const libraryTracksHeading = document.getElementById("library-tracks-heading");
  const libraryTracksTitle = document.getElementById("library-tracks-title");
  const libraryCurrentList = document.getElementById("library-current-list");
  const libraryArtistScrollbar = document.getElementById("library-artist-scrollbar");
  const libraryArtistScrollThumb = document.getElementById("library-artist-scroll-thumb");
  const libraryPreviewList = document.getElementById("library-preview-list");
  const libraryTracksList = document.getElementById("library-tracks-list");
  const selectedTracksCount = document.getElementById("selected-tracks-count");
  const selectedTracksTarget = document.getElementById("selected-tracks-target");
  const selectedTracksAddButton = document.getElementById("selected-tracks-add-btn");
  const selectedTracksNewButton = document.getElementById("selected-tracks-new-btn");
  const selectedTracksClearButton = document.getElementById("selected-tracks-clear-btn");
  const playlistExpandButton = document.getElementById("playlist-expand-btn");
  const rebuildAudioIndexButton = document.getElementById("rebuild-audio-index-btn");
  const rebuildVideoIndexButton = document.getElementById("rebuild-video-index-btn");
  const rebuildIndexStatus = document.getElementById("rebuild-index-status");
  const playlistEditorView = document.getElementById("playlist-editor-view");
  const playlistViewButton = document.getElementById("playlist-view-btn");
  const libraryViewButton = document.getElementById("library-view-btn");
  const authNotice = window.ImpalaAuthNotice;

  const playerConfig = window.KW_PLAYER_CONFIG || {};
  const authStorageKey = window.ImpalaConfig?.getAuthStorageKey?.()
    || playerConfig.authStorageKey
    || "impalaStreamer.authSession";
  const MAX_IMPORT_CHARS = 2000000;
  const PLAYLIST_EXPORT_SCHEMA = "impala.playlist.v1";
  const LIBRARY_SEARCH_DEBOUNCE_MS = 220;
  const storagePrefix = window.ImpalaConfig?.getStoragePrefix?.()
    || playerConfig.playlistStoragePrefix
    || "impalaStreamer";
  const EDITOR_VIEW_KEY = `${storagePrefix}.songListView`;
  const LIBRARY_MODE_ROOT_PREFIXES = {
    audio: ["audio/", ""],
    video: [""]
  };

  let playlistRegistry = [];
  let currentPlaylistId = PlaylistStore.loadPlayerState().playlistId;
  let currentPrefix = "";
  let selectedArtistPrefix = "";
  let selectedAlbumPrefix = "";
  let currentEntries = [];
  let previewEntries = [];
  let trackEntries = [];
  let currentLoading = false;
  let previewLoading = false;
  let trackLoading = false;
  let importLoading = false;
  let activeEditorView = loadEditorView();
  let libraryBrowseMode = "audio";
  let currentLibrarySource = "s4";
  let librarySearchTerm = "";
  let librarySearchDebounceHandle = null;
  let dragListListenersBound = false;
  let rebuildStatusTimer = null;
  let activeRebuildScope = "";
  let playlistExpanded = false;
  let combinePlaylistMode = false;
  const selectedPlaylistIds = new Set();
  let artistScrollbarDrag = null;
  let localServiceTracks = [];
  const folderCache = new Map();
  const videoCollectionCache = new Map();
  const trackSelectionStore = window.TrackSelectionStore;
  const librarySelectionMap = new Map();
  const selectedArtistPrefixes = new Set();

  function loadEditorView() {
    try {
      return localStorage.getItem(EDITOR_VIEW_KEY) === "playlists" ? "playlists" : "library";
    } catch {
      return "library";
    }
  }

  function saveEditorView(view) {
    try {
      localStorage.setItem(EDITOR_VIEW_KEY, view);
    } catch {
      // View preference is only a convenience.
    }
  }

  function setEditorView(view, options = {}) {
    const normalizedView = view === "playlists" ? "playlists" : "library";
    activeEditorView = normalizedView;
    saveEditorView(normalizedView);

    if (playlistEditorView) {
      playlistEditorView.hidden = normalizedView !== "playlists";
    }
    if (customLibraryPanel) {
      customLibraryPanel.hidden = normalizedView !== "library";
    }
    if (playlistViewButton) {
      playlistViewButton.classList.toggle("is-active", normalizedView === "playlists");
      playlistViewButton.setAttribute("aria-pressed", normalizedView === "playlists" ? "true" : "false");
    }
    if (libraryViewButton) {
      libraryViewButton.classList.toggle("is-active", normalizedView === "library");
      libraryViewButton.setAttribute("aria-pressed", normalizedView === "library" ? "true" : "false");
    }
    if (playlistTitle) {
      playlistTitle.textContent = normalizedView === "playlists" ? "Playlists" : "Library";
    }
    document.body.classList.toggle("is-playlist-editor-view", normalizedView === "playlists");
    document.body.classList.toggle("is-library-editor-view", normalizedView === "library");

    if (options.render) {
      renderPage();
    }
  }

  function getApiBaseUrl() {
    return window.ImpalaConfig?.getCloudApiBaseUrl?.()
      || String(playerConfig.apiBaseUrl || "").replace(/\/+$/, "");
  }

  function setMessage(message) {
    editorMessage.textContent = message;
  }

  function setLibraryStatus(message) {
    libraryStatus.textContent = message;
  }

  function hasAuthSession() {
    return Boolean(loadAuthSession()?.token);
  }

  function getApiMediaScope() {
    return libraryBrowseMode === "video" ? "video" : "audio";
  }

  function getLibraryRootCandidates(mode) {
    const fallback = [""];
    return LIBRARY_MODE_ROOT_PREFIXES[mode] || fallback;
  }

  function updateLibraryModeButtons() {
    const isAudioMode = libraryBrowseMode === "audio";

    if (libraryModeAudioButton) {
      libraryModeAudioButton.classList.toggle("is-active", isAudioMode);
      libraryModeAudioButton.setAttribute("aria-pressed", isAudioMode ? "true" : "false");
    }

    if (libraryModeVideoButton) {
      libraryModeVideoButton.classList.toggle("is-active", !isAudioMode);
      libraryModeVideoButton.setAttribute("aria-pressed", !isAudioMode ? "true" : "false");
    }
  }

  async function resolveRootPayloadForMode(mode, options = {}) {
    const candidates = getLibraryRootCandidates(mode);
    let firstSuccessfulResult = null;
    let lastError = null;

    for (const prefix of candidates) {
      try {
        const payload = await fetchFolderEntries(prefix, options);
        const result = {
          prefix,
          payload
        };

        if (!firstSuccessfulResult) {
          firstSuccessfulResult = result;
        }

        if ((payload.entries || []).length) {
          return result;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (firstSuccessfulResult) {
      return firstSuccessfulResult;
    }

    if (lastError) {
      throw lastError;
    }

    return {
      prefix: "",
      payload: {
        prefix: "",
        entries: []
      }
    };
  }

  function setLibraryBrowseMode(mode) {
    const normalizedMode = mode === "video" ? "video" : "audio";
    if (libraryBrowseMode === normalizedMode) {
      return;
    }

    libraryBrowseMode = normalizedMode;
    currentLibrarySource = "s4";
    currentPrefix = "";
    selectedArtistPrefix = "";
    selectedAlbumPrefix = "";
    currentEntries = [];
    previewEntries = [];
    trackEntries = [];
    folderCache.clear();
    videoCollectionCache.clear();
    updateLibraryModeButtons();
    renderPreviewPane();
    loadCurrentLevel({ force: true });
  }

  function loadAuthSession() {
    try {
      const rawValue = localStorage.getItem(authStorageKey);
      if (!rawValue) {
        return null;
      }

      const parsedValue = JSON.parse(rawValue);
      if (!parsedValue || !parsedValue.token) {
        return null;
      }

      if (parsedValue.expiresAt && Date.parse(parsedValue.expiresAt) <= Date.now()) {
        localStorage.removeItem(authStorageKey);
        return null;
      }

      return parsedValue;
    } catch (error) {
      console.error("Unable to load auth session:", error);
      localStorage.removeItem(authStorageKey);
      return null;
    }
  }

  async function apiRequest(path, options = {}) {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error("No API base URL configured.");
    }

    const authSession = loadAuthSession();
    const headers = new Headers(options.headers || {});
    const instanceId = window.ImpalaConfig?.getInstanceId?.() || "";
    if (instanceId) {
      headers.set("X-Impala-Instance-Id", instanceId);
    }

    if (authSession && authSession.token) {
      headers.set("Authorization", `Bearer ${authSession.token}`);
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
      cache: "no-store"
    });

    if (response.status === 401) {
      localStorage.removeItem(authStorageKey);
      authNotice?.render?.({
        targetSelector: ".titles-row",
        needsPrivateAccess: true
      });
      throw new Error("Please sign in. Your private library session expired.");
    }

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;

      try {
        const payload = await response.json();
        if (payload && payload.error) {
          message = payload.error;
        }
      } catch (error) {
        console.error("Unable to parse API error response:", error);
      }

      throw new Error(message);
    }

    return response.json();
  }

  function setRebuildStatus(message) {
    if (rebuildIndexStatus) {
      rebuildIndexStatus.textContent = message;
    }
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return `${Number(count || 0).toLocaleString()} ${Number(count || 0) === 1 ? singular : plural}`;
  }

  function formatRebuildSummary(results = []) {
    const byName = new Map(results.map((result) => [result.name, result]));
    const audio = byName.get("audio");
    const video = byName.get("video");
    const parts = [];

    if (audio) {
      parts.push(`Audio: ${pluralize(audio.records, "track")}`);
    }

    if (video) {
      const videoTitleCount = Number.isFinite(Number(video.titleCount))
        ? Number(video.titleCount)
        : Number(video.records || 0);
      parts.push(`Video: ${pluralize(videoTitleCount, "title")}`);
    }

    return parts.join(". ");
  }

  function scheduleRebuildStatusCheck() {
    if (rebuildStatusTimer) {
      clearTimeout(rebuildStatusTimer);
    }

    rebuildStatusTimer = setTimeout(() => {
      rebuildStatusTimer = null;
      refreshRebuildStatus();
    }, 3000);
  }

  function renderRebuildStatus(status) {
    const rebuildButtons = [rebuildAudioIndexButton, rebuildVideoIndexButton].filter(Boolean);
    if (!rebuildButtons.length) {
      return;
    }

    const isRunning = status?.status === "running";
    rebuildButtons.forEach((button) => {
      button.disabled = isRunning;
    });
    if (rebuildAudioIndexButton) {
      rebuildAudioIndexButton.textContent = isRunning && activeRebuildScope === "audio" ? "Indexing..." : "Index Audio";
    }
    if (rebuildVideoIndexButton) {
      rebuildVideoIndexButton.textContent = isRunning && activeRebuildScope === "video" ? "Indexing..." : "Index Video";
    }

    if (isRunning) {
      const scope = status.currentScope ? ` ${status.currentScope}` : "";
      setRebuildStatus(`Rebuilding${scope} index...`);
      scheduleRebuildStatusCheck();
      return;
    }

    if (status?.status === "completed") {
      const completedScope = activeRebuildScope;
      const summary = formatRebuildSummary(status.results || []);
      setRebuildStatus(summary || "Index rebuild completed.");
      folderCache.clear();
      videoCollectionCache.clear();
      activeRebuildScope = "";
      if (completedScope === libraryBrowseMode && !currentLoading) {
        loadCurrentLevel({ force: true });
      }
      return;
    }

    if (status?.status === "failed") {
      setRebuildStatus(status.error || "Index rebuild failed.");
      activeRebuildScope = "";
      return;
    }

    setRebuildStatus("");
  }

  async function refreshRebuildStatus() {
    try {
      const status = await apiRequest("/api/admin/rebuild-index");
      renderRebuildStatus(status);
    } catch (error) {
      [rebuildAudioIndexButton, rebuildVideoIndexButton].filter(Boolean).forEach((button) => {
        button.disabled = false;
      });
      if (rebuildAudioIndexButton) rebuildAudioIndexButton.textContent = "Index Audio";
      if (rebuildVideoIndexButton) rebuildVideoIndexButton.textContent = "Index Video";
      setRebuildStatus(error.message || "Unable to check rebuild status.");
    }
  }

  async function initializeRebuildControl() {
    const rebuildButtons = [rebuildAudioIndexButton, rebuildVideoIndexButton].filter(Boolean);
    if (!rebuildButtons.length || !getApiBaseUrl()) {
      return;
    }

    try {
      const session = await apiRequest("/api/auth/session");
      if (session.isAdmin !== true) {
        return;
      }

      rebuildButtons.forEach((button) => {
        button.hidden = false;
      });
      await refreshRebuildStatus();
    } catch {
      rebuildButtons.forEach((button) => {
        button.hidden = true;
      });
    }
  }

  async function requestIndexRebuild(scope) {
    const normalizedScope = scope === "video" ? "video" : "audio";
    const label = normalizedScope === "video" ? "video" : "audio";
    const confirmed = window.confirm(
      `Rebuild the ${label} index now?`
    );
    if (!confirmed) {
      return;
    }

    activeRebuildScope = normalizedScope;
    [rebuildAudioIndexButton, rebuildVideoIndexButton].filter(Boolean).forEach((button) => {
      button.disabled = true;
    });
    if (normalizedScope === "audio" && rebuildAudioIndexButton) rebuildAudioIndexButton.textContent = "Starting...";
    if (normalizedScope === "video" && rebuildVideoIndexButton) rebuildVideoIndexButton.textContent = "Starting...";
    setRebuildStatus(`Starting ${label} index rebuild...`);

    try {
      const status = await apiRequest(`/api/admin/rebuild-index?scope=${encodeURIComponent(normalizedScope)}`, { method: "POST" });
      renderRebuildStatus(status);
    } catch (error) {
      [rebuildAudioIndexButton, rebuildVideoIndexButton].filter(Boolean).forEach((button) => {
        button.disabled = false;
      });
      if (rebuildAudioIndexButton) rebuildAudioIndexButton.textContent = "Index Audio";
      if (rebuildVideoIndexButton) rebuildVideoIndexButton.textContent = "Index Video";
      activeRebuildScope = "";
      setRebuildStatus(error.message || "Unable to start index rebuild.");
    }
  }

  function getLibraryPathLabel(prefix) {
    const normalizedPath = String(prefix || "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!normalizedPath) {
      return "/";
    }

    const segments = normalizedPath.split("/").filter(Boolean);
    const rootSegment = String(segments[0] || "").toLowerCase();
    const displaySegments = ["audio", "videos", "video", "local-service"].includes(rootSegment)
      ? segments.slice(1)
      : segments;

    return displaySegments.length ? `/${displaySegments.join("/")}` : "/";
  }

  function getLibraryLeafName(prefix) {
    const segments = getLibraryPathLabel(prefix).split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  }

  function getParentPrefix(prefix) {
    const normalizedPath = String(prefix || "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!normalizedPath) {
      return "";
    }

    const slashIndex = normalizedPath.lastIndexOf("/");
    return slashIndex >= 0 ? `${normalizedPath.slice(0, slashIndex)}/` : "";
  }

  function isCloudVideoMode() {
    return libraryBrowseMode === "video" && currentLibrarySource === "s4";
  }

  function createVideoBackEntry() {
    return {
      type: "folder",
      name: "Back",
      prefix: getParentPrefix(currentPrefix),
      isNavigation: true
    };
  }

  function getVideoRootFolderFromEntry(entry) {
    const sourcePath = String(entry?.prefix || entry?.objectKey || entry?.file || "").replace(/^\/+/, "");
    const segments = sourcePath.split("/").filter(Boolean);
    if (!segments.length) {
      return null;
    }

    const rootSegment = String(segments[0] || "").toLowerCase();
    const contentSegments = ["video", "videos"].includes(rootSegment)
      ? segments.slice(1)
      : segments;
    if (contentSegments.length <= 1) {
      return null;
    }

    const rootPrefix = ["video", "videos"].includes(rootSegment) ? `${segments[0]}/` : "";
    const titleName = contentSegments[0];
    return {
      type: "folder",
      name: titleName,
      prefix: `${rootPrefix}${titleName}/`,
      isVideoCollection: true
    };
  }

  function collapseVideoRootEntries(entries) {
    if (!isCloudVideoMode() || currentPrefix || librarySearchTerm) {
      return entries;
    }

    const collapsedEntries = new Map();
    const directFileEntries = [];
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const rootFolder = getVideoRootFolderFromEntry(entry);
      if (rootFolder) {
        if (!collapsedEntries.has(rootFolder.prefix)) {
          collapsedEntries.set(rootFolder.prefix, rootFolder);
        }
        return;
      }

      if (entry?.type === "file") {
        directFileEntries.push(entry);
        return;
      }

      if (entry?.type === "folder" && !collapsedEntries.has(entry.prefix)) {
        collapsedEntries.set(entry.prefix, entry);
      }
    });

    return [...collapsedEntries.values(), ...directFileEntries]
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  }

  async function markVideoRootCollections(entries, options = {}) {
    const { force = false } = options;
    if (!isCloudVideoMode() || currentPrefix || librarySearchTerm) {
      return entries;
    }

    const sourceEntries = Array.isArray(entries) ? entries : [];
    return Promise.all(sourceEntries.map(async (entry) => {
      if (entry?.type !== "folder" || entry.isNavigation || entry.isVideoCollection) {
        return entry;
      }

      const cacheKey = String(entry.prefix || "");
      if (!cacheKey) {
        return entry;
      }

      if (!force && videoCollectionCache.has(cacheKey)) {
        return videoCollectionCache.get(cacheKey)
          ? { ...entry, isVideoCollection: true }
          : entry;
      }

      try {
        const payload = await fetchFolderEntries(cacheKey, { force });
        const isCollection = payload.entries.some((candidate) => candidate.type === "folder");
        videoCollectionCache.set(cacheKey, isCollection);
        return isCollection ? { ...entry, isVideoCollection: true } : entry;
      } catch {
        return entry;
      }
    }));
  }

  function stripTrackNumberPrefix(value) {
    return String(value || "").replace(/^\d{1,3}\s*[-._)]\s*/, "").trim();
  }

  function parseSongFromObjectKey(objectKey) {
    const normalizedKey = String(objectKey || "");
    const segments = normalizedKey.split("/").filter(Boolean);
    const rootSegment = String(segments[0] || "").toLowerCase();
    const contentSegments = ["audio", "videos", "video"].includes(rootSegment)
      ? segments.slice(1)
      : segments;
    const fileName = contentSegments[contentSegments.length - 1] || normalizedKey;
    const withoutExtension = fileName.replace(/\.[^.]+$/, "");
    const artist = contentSegments[0] || "Unknown artist";
    const album = contentSegments.length > 2 ? contentSegments[contentSegments.length - 2] : "";

    let trackName = stripTrackNumberPrefix(withoutExtension);
    const artistPrefix = `${artist.toLowerCase()} - `;
    if (trackName.toLowerCase().startsWith(artistPrefix)) {
      trackName = trackName.slice(artistPrefix.length).trim();
    }

    return {
      name: trackName || withoutExtension || fileName,
      artist,
      album
    };
  }

  function inferArtistPrefixFromObjectKey(objectKey) {
    const normalizedKey = String(objectKey || "").replace(/^\/+/, "");
    const segments = normalizedKey.split("/").filter(Boolean);
    if (!segments.length) {
      return "";
    }

    const rootSegment = String(segments[0] || "").toLowerCase();
    const hasMediaRoot = ["audio", "video", "videos"].includes(rootSegment);
    const artistSegment = hasMediaRoot ? segments[1] : segments[0];
    if (!artistSegment) {
      return "";
    }

    const rootPrefix = hasMediaRoot ? `${segments[0].replace(/\/+$/, "")}/` : "";
    return `${rootPrefix}${artistSegment.replace(/\/+$/, "")}/`;
  }

  function normalizeSearchTerm(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getLocalLibraryJson() {
    const preferencesApi = window.UiPreferences;
    if (!preferencesApi?.getPreferences) {
      return "";
    }

    return String(preferencesApi.getPreferences().localLibraryJson || "").trim();
  }

  function getLocalHelperPreferences() {
    const preferencesApi = window.UiPreferences;
    const preferences = preferencesApi?.getPreferences?.() || {};
    const port = String(preferences.localHelperPort || "8089").trim();
    const parsedPort = Number.parseInt(port, 10);

    return {
      enabled: preferences.localHelperEnabled === true,
      root: String(preferences.localHelperRoot || "").trim(),
      port: Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535
        ? String(parsedPort)
        : "8089"
    };
  }

  function getLocalHelperBaseUrl() {
    return `http://127.0.0.1:${getLocalHelperPreferences().port}`;
  }

  function getPreferredLibrarySource() {
    if (getLocalHelperPreferences().enabled) {
      return "local-service";
    }

    if (getLocalLibraryJson()) {
      return "local-json";
    }

    return "s4";
  }

  function getLocalServicePrefix(artist = "", album = "") {
    const segments = ["local-service", artist, album]
      .map((segment) => String(segment || "").trim())
      .filter(Boolean);
    return `${segments.join("/")}${segments.length ? "/" : ""}`;
  }

  function parseLocalServicePrefix(prefix) {
    const segments = String(prefix || "").replace(/^\/+/, "").replace(/\/+$/, "").split("/").filter(Boolean);
    if (segments[0] !== "local-service") {
      return { artist: "", album: "" };
    }

    return {
      artist: segments[1] || "",
      album: segments[2] || ""
    };
  }

  function normalizeLocalLibraryEntry(entry, index, mode) {
    const isStringEntry = typeof entry === "string";
    const sourcePath = isStringEntry
      ? entry.trim()
      : String(entry?.objectKey || entry?.file || entry?.path || "").trim();

    if (!sourcePath) {
      return null;
    }

    const parsedSong = parseSongFromObjectKey(sourcePath);
    const name = String(isStringEntry ? "" : (entry?.name || entry?.title || "")).trim() || parsedSong.name;
    const artist = String(isStringEntry ? "" : (entry?.artist || "")).trim() || parsedSong.artist;
    const album = String(isStringEntry ? "" : (entry?.album || "")).trim() || parsedSong.album;
    const objectKey = String(isStringEntry ? "" : (entry?.objectKey || "")).trim();
    const file = String(isStringEntry ? sourcePath : (entry?.file || entry?.path || "")).trim() || sourcePath;
    const mediaType = String(isStringEntry ? "" : (entry?.mediaType || entry?.kind || "")).trim().toLowerCase();
    const contentType = String(isStringEntry ? "" : (entry?.contentType || "")).trim();
    const metadataRef = isStringEntry ? null : (entry?.metadataRef || null);
    const artworkOverride = String(isStringEntry ? "" : (entry?.artworkOverride || entry?.posterOverride || "")).trim();

    return {
      id: `local-${mode}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      type: "file",
      name,
      artist,
      album,
      objectKey,
      file,
      mediaType,
      contentType,
      metadataRef,
      artworkOverride
    };
  }

  function getLocalLibraryEntriesForMode(mode) {
    const rawJson = getLocalLibraryJson();
    if (!rawJson) {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (error) {
      throw new Error("Local library JSON is not valid JSON. Clear it or replace it with a valid manifest.");
    }

    let rawEntries = [];
    if (Array.isArray(parsed)) {
      rawEntries = parsed;
    } else if (parsed && typeof parsed === "object") {
      const modeKey = mode === "video" ? "video" : "audio";
      const candidateEntries = [
        parsed[modeKey],
        parsed[`${modeKey}Entries`],
        parsed.entries,
        parsed.files,
        parsed.items
      ];

      rawEntries = candidateEntries.find(Array.isArray) || [];
    } else {
      throw new Error("Local library JSON must be an array or an object with audio/video arrays.");
    }

    return rawEntries
      .map((entry, index) => normalizeLocalLibraryEntry(entry, index, mode))
      .filter(Boolean);
  }

  function normalizeSearchKey(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function getSearchTokens(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function normalizeLocalServiceTrack(entry, index) {
    const objectKey = String(entry?.objectKey || entry?.file || entry?.id || "").trim();
    if (!objectKey) {
      return null;
    }

    const parsedSong = parseSongFromObjectKey(objectKey);
    const mediaType = String(entry?.mediaType || entry?.kind || parsedSong.mediaType || "").trim().toLowerCase();

    return {
      id: String(entry?.id || objectKey || `local-service-${index}`),
      type: "file",
      name: String(entry?.name || entry?.title || "").trim() || parsedSong.name,
      artist: String(entry?.artist || "").trim() || parsedSong.artist,
      album: String(entry?.album || "").trim() || parsedSong.album,
      objectKey,
      file: String(entry?.file || objectKey).trim(),
      mediaType,
      contentType: String(entry?.contentType || "").trim(),
      metadataRef: entry?.metadataRef || null,
      artworkOverride: String(entry?.artworkOverride || entry?.posterOverride || "").trim(),
      source: "local-service"
    };
  }

  function localServiceTrackMatchesMode(track, mode) {
    const mediaType = String(track?.mediaType || "").trim().toLowerCase();
    if (mediaType === "audio" || mediaType === "video") {
      return mediaType === mode;
    }

    return mode === "video"
      ? /\.(mp4|m4v|webm|mov|mkv)$/i.test(track?.objectKey || track?.file || "")
      : !/\.(mp4|m4v|webm|mov|mkv)$/i.test(track?.objectKey || track?.file || "");
  }

  async function fetchLocalServiceTracks({ force = false } = {}) {
    if (!force && localServiceTracks.length) {
      return localServiceTracks;
    }

    const helper = getLocalHelperPreferences();
    if (!helper.enabled) {
      return [];
    }

    const response = await fetch(`${getLocalHelperBaseUrl()}/library/list`, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Local Library Companion responded with ${response.status}.`);
    }

    const payload = await response.json();
    const rawTracks = Array.isArray(payload) ? payload : (Array.isArray(payload?.tracks) ? payload.tracks : []);
    localServiceTracks = rawTracks
      .map((entry, index) => normalizeLocalServiceTrack(entry, index))
      .filter(Boolean);

    return localServiceTracks;
  }

  function buildLocalServiceFolderEntries(prefix = "", mode = libraryBrowseMode) {
    const { artist, album } = parseLocalServicePrefix(prefix);
    const matchingTracks = localServiceTracks.filter((track) => localServiceTrackMatchesMode(track, mode));

    if (!artist) {
      const artists = new Map();
      matchingTracks.forEach((track) => {
        const name = track.artist || "Unknown artist";
        if (!artists.has(name)) {
          artists.set(name, {
            type: "folder",
            name,
            prefix: getLocalServicePrefix(name)
          });
        }
      });
      return [...artists.values()].sort((left, right) => left.name.localeCompare(right.name));
    }

    if (!album) {
      const albums = new Map();
      matchingTracks
        .filter((track) => track.artist === artist)
        .forEach((track) => {
          const name = track.album || "Unknown album";
          if (!albums.has(name)) {
            albums.set(name, {
              type: "folder",
              name,
              prefix: getLocalServicePrefix(artist, name),
              metadataRef: track.metadataRef || null,
              artworkOverride: track.artworkOverride || ""
            });
          }
        });
      return [...albums.values()].sort((left, right) => left.name.localeCompare(right.name));
    }

    return matchingTracks
      .filter((track) => track.artist === artist && track.album === album)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function getLocalServicePayload(prefix = "", mode = libraryBrowseMode) {
    return {
      prefix,
      entries: buildLocalServiceFolderEntries(prefix, mode)
    };
  }

  function isShortSearchTerm(normalizedSearchTerm) {
    return normalizedSearchTerm.length > 0 && normalizedSearchTerm.length <= 2;
  }

  function hasSearchTokenPrefix(value, normalizedSearchTerm) {
    return getSearchTokens(value).some((token) => token.startsWith(normalizedSearchTerm));
  }

  function getSearchVariants(value) {
    const base = normalizeSearchKey(value);
    if (!base) {
      return [];
    }

    const variants = new Set([base]);
    if (base.length > 2 && base.endsWith("s")) {
      variants.add(base.slice(0, -1));
    }

    return [...variants];
  }

  function useHorizontalArtistRow() {
    return false;
  }

  function syncSongListModeClass() {
    document.body.classList.toggle("is-video-mode", libraryBrowseMode === "video");
    document.body.classList.toggle("is-audio-mode", libraryBrowseMode !== "video");

    const shouldUseHorizontalArtistRow = useHorizontalArtistRow();
    libraryCurrentList.classList.toggle("library-artists-row", shouldUseHorizontalArtistRow);
    libraryCurrentList.classList.toggle("is-vertical-artist-list", !shouldUseHorizontalArtistRow);
  }

  function normalizeWheelDistance(event) {
    const lineHeight = 32;
    const pageHeight = libraryCurrentList?.clientHeight || window.innerHeight || 800;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? pageHeight
      : event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? lineHeight
        : 1;

    return event.deltaY * unit;
  }

  function handleHorizontalLibraryWheel(event) {
    if (!useHorizontalArtistRow() || !libraryCurrentList) {
      return;
    }

    const maxScrollLeft = libraryCurrentList.scrollWidth - libraryCurrentList.clientWidth;
    if (maxScrollLeft <= 0) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : normalizeWheelDistance(event);
    if (!delta) {
      return;
    }

    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, libraryCurrentList.scrollLeft + delta));
    if (nextScrollLeft === libraryCurrentList.scrollLeft) {
      return;
    }

    event.preventDefault();
    libraryCurrentList.scrollLeft = nextScrollLeft;
    updateArtistScrollRail();
  }

  function updateArtistScrollRail() {
    if (!libraryArtistScrollbar || !libraryArtistScrollThumb || !libraryCurrentList) {
      return;
    }

    const isHorizontal = useHorizontalArtistRow();
    const maxScrollLeft = Math.max(0, libraryCurrentList.scrollWidth - libraryCurrentList.clientWidth);
    const canScroll = isHorizontal && maxScrollLeft > 4;
    libraryArtistScrollbar.hidden = !canScroll;

    if (!canScroll) {
      libraryArtistScrollThumb.style.width = "";
      libraryArtistScrollThumb.style.transform = "";
      return;
    }

    const railWidth = libraryArtistScrollbar.clientWidth || libraryCurrentList.clientWidth;
    const minimumThumbWidth = Math.min(railWidth, 96);
    const proportionalWidth = Math.round(railWidth * (libraryCurrentList.clientWidth / libraryCurrentList.scrollWidth));
    const thumbWidth = Math.max(minimumThumbWidth, proportionalWidth);
    const travel = Math.max(0, railWidth - thumbWidth);
    const progress = maxScrollLeft ? libraryCurrentList.scrollLeft / maxScrollLeft : 0;

    libraryArtistScrollThumb.style.width = `${thumbWidth}px`;
    libraryArtistScrollThumb.style.transform = `translateX(${Math.round(travel * progress)}px)`;
  }

  function syncArtistScrollFromPointer(clientX) {
    if (!artistScrollbarDrag || !libraryCurrentList || !libraryArtistScrollbar || !libraryArtistScrollThumb) {
      return;
    }

    const maxScrollLeft = Math.max(0, libraryCurrentList.scrollWidth - libraryCurrentList.clientWidth);
    if (!maxScrollLeft) {
      return;
    }

    const railRect = libraryArtistScrollbar.getBoundingClientRect();
    const thumbWidth = libraryArtistScrollThumb.getBoundingClientRect().width;
    const travel = Math.max(1, railRect.width - thumbWidth);
    const nextThumbLeft = Math.max(
      0,
      Math.min(travel, clientX - railRect.left - artistScrollbarDrag.offsetX)
    );

    libraryCurrentList.scrollLeft = Math.round(maxScrollLeft * (nextThumbLeft / travel));
    updateArtistScrollRail();
  }

  function beginArtistScrollbarDrag(event) {
    if (!libraryArtistScrollbar || !libraryArtistScrollThumb || !libraryCurrentList || libraryArtistScrollbar.hidden) {
      return;
    }

    const thumbRect = libraryArtistScrollThumb.getBoundingClientRect();
    const offsetX = event.target === libraryArtistScrollThumb
      ? event.clientX - thumbRect.left
      : thumbRect.width / 2;

    artistScrollbarDrag = { pointerId: event.pointerId, offsetX };
    libraryArtistScrollbar.classList.add("is-dragging");
    libraryArtistScrollbar.setPointerCapture?.(event.pointerId);
    syncArtistScrollFromPointer(event.clientX);
    event.preventDefault();
  }

  function dragArtistScrollbar(event) {
    if (!artistScrollbarDrag || artistScrollbarDrag.pointerId !== event.pointerId) {
      return;
    }

    syncArtistScrollFromPointer(event.clientX);
    event.preventDefault();
  }

  function endArtistScrollbarDrag(event) {
    if (!artistScrollbarDrag || artistScrollbarDrag.pointerId !== event.pointerId) {
      return;
    }

    artistScrollbarDrag = null;
    libraryArtistScrollbar?.classList.remove("is-dragging");
    libraryArtistScrollbar?.releasePointerCapture?.(event.pointerId);
  }

  function includesSearchTerm(value, searchTerm) {
    const candidate = String(value || "").toLowerCase();
    if (!candidate) {
      return false;
    }

    if (candidate.includes(searchTerm)) {
      return true;
    }

    const normalizedSearchTerm = normalizeSearchKey(searchTerm);
    if (!normalizedSearchTerm) {
      return false;
    }

    if (isShortSearchTerm(normalizedSearchTerm)) {
      return hasSearchTokenPrefix(candidate, normalizedSearchTerm);
    }

    const normalizedCandidate = normalizeSearchKey(candidate);
    if (normalizedCandidate.includes(normalizedSearchTerm)) {
      return true;
    }

    const candidateVariants = getSearchVariants(normalizedCandidate);
    const searchVariants = getSearchVariants(normalizedSearchTerm);
    return searchVariants.some((searchVariant) =>
      candidateVariants.some((candidateVariant) => candidateVariant.includes(searchVariant))
    );
  }

  function filterEntriesBySearch(entries) {
    if (!librarySearchTerm) {
      return entries;
    }

    return entries.filter((entry) => {
      const searchableFields = [
        entry.name,
        entry.type === "folder" ? entry.prefix : "",
        entry.type === "file" ? entry.artist : "",
        entry.type === "file" ? entry.album : "",
        entry.type === "file" ? entry.objectKey : ""
      ];

      return searchableFields
        .filter(Boolean)
        .some((value) => includesSearchTerm(value, librarySearchTerm));
    });
  }

  function createPlaylistSongFromObjectKey(objectKey, playlistId = currentPlaylistId) {
    const parsedSong = parseSongFromObjectKey(objectKey);
    return {
      id: `${playlistId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: parsedSong.name,
      artist: parsedSong.artist,
      album: parsedSong.album,
      objectKey,
      mediaType: getApiMediaScope(),
      source: "s4"
    };
  }

  function createLibraryFileEntryFromObjectKey(objectKey, options = {}) {
    const normalizedObjectKey = String(objectKey || "").trim();
    if (!normalizedObjectKey) {
      return null;
    }

    const parsedSong = parseSongFromObjectKey(normalizedObjectKey);
    return {
      type: "file",
      objectKey: normalizedObjectKey,
      name: String(options.name || options.title || "").trim() || parsedSong.name,
      artist: String(options.artist || "").trim() || parsedSong.artist,
      album: String(options.album || "").trim() || parsedSong.album,
      mediaType: String(options.mediaType || getApiMediaScope()).trim(),
      contentType: String(options.contentType || "").trim(),
      metadataRef: options.metadataRef || null,
      artworkOverride: String(options.artworkOverride || options.posterOverride || "").trim(),
      source: String(options.source || "s4").trim()
    };
  }

  function createPlaylistSongFromLibraryEntry(entry, playlistId = currentPlaylistId, fallbackIndex = 0) {
    if (!entry || entry.type !== "file") {
      return null;
    }

    const objectKey = String(entry.objectKey || "").trim();
    const parsedSong = parseSongFromObjectKey(objectKey || entry.file || entry.name || "");

    return {
      id: `${playlistId || "custom"}-${Date.now()}-${fallbackIndex}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(entry.name || entry.title || "").trim() || parsedSong.name,
      artist: String(entry.artist || "").trim() || parsedSong.artist,
      album: String(entry.album || "").trim() || parsedSong.album,
      objectKey,
      file: String(entry.file || "").trim(),
      mediaType: String(entry.mediaType || "").trim(),
      contentType: String(entry.contentType || "").trim(),
      metadataRef: entry.metadataRef || null,
      artworkOverride: String(entry.artworkOverride || entry.posterOverride || "").trim(),
      source: String(entry.source || "").trim()
    };
  }

  function getSongIdentity(song) {
    return trackSelectionStore.getSongIdentity(song);
  }

  function isTrackSelected(playlistId, song, songIndex) {
    return trackSelectionStore.isSelected(playlistId, song, songIndex);
  }

  function getSelectedSongCount(playlist) {
    return trackSelectionStore.countSelected(playlist);
  }

  function clearTrackSelections() {
    trackSelectionStore.clear();
    librarySelectionMap.clear();
    selectedArtistPrefixes.clear();
  }

  function toggleTrackSelection(playlistId, song, songIndex) {
    trackSelectionStore.toggle(playlistId, song, songIndex);
  }

  function getSelectedSongsFromCurrentPlaylist() {
    const playlist = getCurrentPlaylist();
    return trackSelectionStore.getSelectedSongs(playlist);
  }

  function getLibrarySongKey(song, fallbackIndex = 0) {
    return trackSelectionStore.getSongIdentity(song) || `library-${fallbackIndex}-${song?.name || "track"}`;
  }

  function isLibrarySongSelected(song, fallbackIndex = 0) {
    return librarySelectionMap.has(getLibrarySongKey(song, fallbackIndex));
  }

  function setLibrarySongSelection(song, fallbackIndex, selected) {
    const key = getLibrarySongKey(song, fallbackIndex);
    if (selected) {
      librarySelectionMap.set(key, { ...song });
    } else {
      librarySelectionMap.delete(key);
    }
  }

  function toggleLibrarySongSelection(song, fallbackIndex = 0) {
    setLibrarySongSelection(song, fallbackIndex, !isLibrarySongSelected(song, fallbackIndex));
  }

  function getSelectedSongsForActions() {
    const byKey = new Map();
    getSelectedSongsFromCurrentPlaylist().forEach((song, index) => {
      byKey.set(getLibrarySongKey(song, index), { ...song });
    });
    librarySelectionMap.forEach((song, key) => {
      byKey.set(key, { ...song });
    });
    return [...byKey.values()];
  }

  function updateSelectedTracksUi() {
    if (!selectedTracksCount || !selectedTracksAddButton || !selectedTracksNewButton || !selectedTracksClearButton) {
      return;
    }

    const playlist = getCurrentPlaylist();
    const selectedCount = getSelectedSongCount(playlist) + librarySelectionMap.size;
    selectedTracksCount.textContent = `${selectedCount} selected`;
    if (selectedTracksTarget) {
      selectedTracksTarget.textContent = "Choose destination when adding";
    }

    const hasSelection = selectedCount > 0;
    selectedTracksAddButton.disabled = !hasSelection;
    selectedTracksNewButton.disabled = !hasSelection;
    selectedTracksClearButton.disabled = !hasSelection;
  }

  function createTrackSelectionButton(playlistId, song, songIndex) {
    const selected = isTrackSelected(playlistId, song, songIndex);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `song-entry-pick-btn${selected ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.setAttribute("aria-label", selected ? "Remove star" : "Star track");
    button.setAttribute("title", selected ? "Remove star" : "Star track");
    button.textContent = selected ? "★" : "☆";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTrackSelection(playlistId, song, songIndex);
      renderPage();
    });

    return button;
  }

  function createLibrarySelectionButton(song, songIndex) {
    const selected = isLibrarySongSelected(song, songIndex);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `song-entry-pick-btn library-pick-btn${selected ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.setAttribute("aria-label", selected ? "Remove star" : "Star track");
    button.setAttribute("title", selected ? "Remove star" : "Star track");
    button.textContent = selected ? "\u2605" : "\u2606";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLibrarySongSelection(song, songIndex);
      renderTracksPane();
      updateSelectedTracksUi();
    });

    return button;
  }

  async function toggleAlbumSelection(entry) {
    if (!entry?.prefix || importLoading) {
      return;
    }

    try {
      setLibraryStatus("Loading album selection...");
      const payload = await fetchFolderEntries(entry.prefix);
      const albumTracks = (payload.entries || []).filter((albumEntry) => albumEntry.type === "file");
      const songs = albumTracks
        .map((albumEntry, index) => createPlaylistSongFromLibraryEntry(albumEntry, currentPlaylistId, index))
        .filter(Boolean);
      const shouldSelect = songs.some((song, index) => !isLibrarySongSelected(song, index));

      songs.forEach((song, index) => setLibrarySongSelection(song, index, shouldSelect));
      selectedAlbumPrefix = entry.prefix;
      trackEntries = albumTracks;
      renderPreviewPane();
      renderTracksPane();
      updateSelectedTracksUi();
      setLibraryStatus(shouldSelect
        ? `Starred ${songs.length} track${songs.length === 1 ? "" : "s"} from ${entry.name}.`
        : `Cleared stars from ${entry.name}.`);
    } catch (error) {
      setLibraryStatus(error.message || "Unable to select album.");
    }
  }

  function createAlbumSelectionButton(entry) {
    const isCurrentAlbum = entry.prefix && entry.prefix === selectedAlbumPrefix;
    const selectedCount = isCurrentAlbum
      ? trackEntries.filter((trackEntry, index) => {
        const song = createPlaylistSongFromLibraryEntry(trackEntry, currentPlaylistId, index);
        return isLibrarySongSelected(song, index);
      }).length
      : 0;
    const selected = Boolean(isCurrentAlbum && trackEntries.length && selectedCount === trackEntries.length);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `song-entry-pick-btn library-pick-btn${selected ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.setAttribute("aria-label", selected ? "Clear album stars" : "Star album");
    button.setAttribute("title", selected ? "Clear album stars" : "Star album");
    button.textContent = selected ? "\u2605" : "\u2606";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleAlbumSelection(entry);
    });

    return button;
  }

  async function toggleArtistSelection(entry) {
    if (!entry?.prefix || importLoading) {
      return;
    }

    importLoading = true;
    try {
      setLibraryStatus(`Loading ${entry.name} catalog...`);
      const catalogEntries = await fetchAllTracksForPrefix(entry.prefix);
      const songs = catalogEntries
        .map((catalogEntry, index) => (
          catalogEntry?.type === "file"
            ? createPlaylistSongFromLibraryEntry(catalogEntry, currentPlaylistId, index)
            : catalogEntry
        ))
        .filter(Boolean);

      if (!songs.length) {
        setLibraryStatus(`No playable tracks found for ${entry.name}.`);
        return;
      }

      const shouldSelect = songs.some((song, index) => !isLibrarySongSelected(song, index));
      songs.forEach((song, index) => setLibrarySongSelection(song, index, shouldSelect));

      if (shouldSelect) {
        selectedArtistPrefixes.add(entry.prefix);
      } else {
        selectedArtistPrefixes.delete(entry.prefix);
      }

      renderLibraryPanel();
      updateSelectedTracksUi();
      setLibraryStatus(shouldSelect
        ? `Starred ${songs.length} track${songs.length === 1 ? "" : "s"} from ${entry.name}.`
        : `Cleared stars from ${entry.name}.`);
    } catch (error) {
      setLibraryStatus(error.message || `Unable to select ${entry.name}.`);
    } finally {
      importLoading = false;
    }
  }

  function createArtistSelectionButton(entry) {
    const selected = selectedArtistPrefixes.has(entry.prefix);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `song-entry-pick-btn library-pick-btn${selected ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.setAttribute("aria-label", selected ? "Clear artist catalog stars" : "Star artist catalog");
    button.setAttribute("title", selected ? "Clear artist catalog stars" : "Star artist catalog");
    button.textContent = selected ? "\u2605" : "\u2606";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleArtistSelection(entry);
    });

    return button;
  }

  function refreshRegistry() {
    playlistRegistry = PlaylistStore.getPlaylistRegistry();
    if (!playlistRegistry.find((playlist) => playlist.id === currentPlaylistId)) {
      currentPlaylistId = playlistRegistry[0] ? playlistRegistry[0].id : "";
    }
  }

  function getCurrentPlaylist() {
    return playlistRegistry.find((playlist) => playlist.id === currentPlaylistId) || null;
  }

  function isLocalServiceSong(song) {
    return song?.source === "local-service";
  }

  function isLocalServicePlaylist(playlist) {
    return Array.isArray(playlist?.songs) && playlist.songs.some(isLocalServiceSong);
  }

  function getPlaylistKindLabel(playlist) {
    if (playlist.kind === "custom") {
      return "Custom";
    }

    if (playlist.kind === "local" || isLocalServicePlaylist(playlist)) {
      return "Local";
    }

    return "Built-in";
  }

  function getCustomPlaylists() {
    return playlistRegistry.filter((playlist) => playlist.kind === "custom");
  }

  function renderPlaylistSelector() {
    editorPlaylistSelector.innerHTML = "";
    playlistRegistry.forEach((playlist) => {
      const option = document.createElement("option");
      option.value = playlist.id;
      option.textContent = `${playlist.name}${isLocalServicePlaylist(playlist) ? " (Local)" : ""}`;
      if (isLocalServicePlaylist(playlist)) {
        option.title = "Local Library Companion playlist";
      }
      option.selected = playlist.id === currentPlaylistId;
      editorPlaylistSelector.appendChild(option);
    });
  }

  function renderPlaylistList() {
    if (!playlistList) {
      return;
    }

    playlistList.innerHTML = "";
    if (!playlistRegistry.length) {
      const empty = document.createElement("p");
      empty.className = "playlist-list-empty";
      empty.textContent = "No playlists available.";
      playlistList.appendChild(empty);
      updatePlaylistToolControls();
      return;
    }

    playlistRegistry.forEach((playlist) => {
      const songCount = Array.isArray(playlist.songs) ? playlist.songs.length : 0;
      const row = document.createElement("div");
      row.className = `playlist-list-row${combinePlaylistMode ? " is-combine-mode" : ""}`;

      if (combinePlaylistMode) {
        const pickButton = document.createElement("button");
        const isSelected = selectedPlaylistIds.has(playlist.id);
        pickButton.type = "button";
        pickButton.className = `playlist-list-pick${isSelected ? " is-selected" : ""}`;
        pickButton.setAttribute("aria-label", `${isSelected ? "Remove" : "Add"} ${playlist.name} ${isSelected ? "from" : "to"} combined playlist`);
        pickButton.setAttribute("aria-pressed", isSelected ? "true" : "false");
        pickButton.title = isSelected ? "Remove from combination" : "Add to combination";
        pickButton.addEventListener("click", () => {
          if (isSelected) {
            selectedPlaylistIds.delete(playlist.id);
          } else {
            selectedPlaylistIds.add(playlist.id);
          }
          renderPlaylistList();
        });
        row.appendChild(pickButton);
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = `playlist-list-item${playlist.id === currentPlaylistId ? " is-active" : ""}`;
      button.setAttribute("aria-pressed", playlist.id === currentPlaylistId ? "true" : "false");
      button.title = playlist.name;

      const name = document.createElement("strong");
      name.textContent = playlist.name;

      const meta = document.createElement("span");
      const kindLabel = getPlaylistKindLabel(playlist);
      meta.textContent = `${kindLabel} - ${songCount} track${songCount === 1 ? "" : "s"}`;

      button.appendChild(name);
      button.appendChild(meta);
      button.addEventListener("click", () => {
        currentPlaylistId = playlist.id;
        playlistExpanded = false;
        PlaylistStore.savePlayerState({
          playlistId: currentPlaylistId,
          songIndex: 0,
          playbackState: "paused"
        });
        setMessage("");
        renderPage();
      });

      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "playlist-list-play";
      playButton.disabled = songCount === 0;
      playButton.setAttribute("aria-label", `Play ${playlist.name}`);
      playButton.title = songCount ? `Play ${playlist.name}` : `${playlist.name} is empty`;
      playButton.addEventListener("click", () => {
        playPlaylistInPlayer(playlist);
      });

      row.appendChild(button);
      row.appendChild(playButton);
      playlistList.appendChild(row);
    });

    updatePlaylistToolControls();
  }

  function updatePlaylistToolControls() {
    const nonEmptyPlaylistCount = playlistRegistry.filter((playlist) => playlist.songs?.length).length;
    if (combinePlaylistsButton) {
      combinePlaylistsButton.disabled = playlistRegistry.length < 2;
      combinePlaylistsButton.textContent = combinePlaylistMode
        ? `Create Combined (${selectedPlaylistIds.size})`
        : "Combine";
    }
    if (cancelCombinePlaylistsButton) {
      cancelCombinePlaylistsButton.hidden = !combinePlaylistMode;
    }
    if (playAllPlaylistsButton) {
      playAllPlaylistsButton.disabled = nonEmptyPlaylistCount === 0;
    }
  }

  function cancelCombinePlaylists() {
    combinePlaylistMode = false;
    selectedPlaylistIds.clear();
    renderPlaylistList();
    setMessage("");
  }

  async function combineSelectedPlaylists() {
    if (!combinePlaylistMode) {
      combinePlaylistMode = true;
      selectedPlaylistIds.clear();
      renderPlaylistList();
      setMessage("Select at least two playlists, then choose Create Combined.");
      return;
    }

    const selectedPlaylists = playlistRegistry.filter((playlist) => selectedPlaylistIds.has(playlist.id));
    if (selectedPlaylists.length < 2) {
      setMessage("Select at least two playlists to combine.");
      return;
    }

    const defaultName = selectedPlaylists.map((playlist) => playlist.name).join(" + ").slice(0, 80);
    const name = await promptForPlaylistName(defaultName || "Combined Playlist");
    if (!name) {
      return;
    }

    const playlistId = PlaylistStore.createCustomPlaylist(name);
    const combinedSongs = selectedPlaylists.flatMap((playlist) => playlist.songs || []);
    PlaylistStore.updateCustomPlaylist(playlistId, (playlist) => ({
      ...playlist,
      name,
      songs: combinedSongs.map((song, index) => ({
        ...song,
        id: `${playlistId}-${Date.now()}-${index}`
      }))
    }));

    combinePlaylistMode = false;
    selectedPlaylistIds.clear();
    currentPlaylistId = playlistId;
    renderPage({ allowLibraryLoad: false });
    setMessage(`Created "${name}" with ${combinedSongs.length} tracks. The original playlists were not changed.`);
  }

  function playAllPlaylists() {
    const queueName = "All Playlists Queue";
    const sourcePlaylists = playlistRegistry.filter((playlist) => (
      playlist.name !== queueName && Array.isArray(playlist.songs) && playlist.songs.length
    ));
    const seenSongs = new Set();
    const queueSongs = [];

    sourcePlaylists.forEach((playlist) => {
      playlist.songs.forEach((song) => {
        const identity = getSongIdentity(song);
        if (identity && seenSongs.has(identity)) {
          return;
        }
        if (identity) {
          seenSongs.add(identity);
        }
        queueSongs.push(song);
      });
    });

    if (!queueSongs.length) {
      setMessage("No playable playlist tracks are available.");
      return;
    }

    const existingQueue = getCustomPlaylists().find((playlist) => playlist.name === queueName);
    const playlistId = existingQueue ? existingQueue.id : PlaylistStore.createCustomPlaylist(queueName);
    PlaylistStore.updateCustomPlaylist(playlistId, (playlist) => ({
      ...playlist,
      name: queueName,
      songs: queueSongs.map((song, index) => ({
        ...song,
        id: `${playlistId}-${Date.now()}-${index}`
      }))
    }));
    PlaylistStore.savePlayerState({
      playlistId,
      songIndex: 0,
      playbackState: "playing"
    });
    window.location.href = "index.html";
  }

  function playPlaylistInPlayer(playlist) {
    if (!playlist || !Array.isArray(playlist.songs) || !playlist.songs.length) {
      return;
    }

    PlaylistStore.savePlayerState({
      playlistId: playlist.id,
      songIndex: 0,
      playbackState: "playing"
    });
    window.location.href = "index.html";
  }

  function openPlaylistInPlayer(songIndex = 0) {
    const playlist = getCurrentPlaylist();
    if (!playlist) {
      return;
    }

    PlaylistStore.savePlayerState({
      playlistId: playlist.id,
      songIndex,
      playbackState: "paused"
    });
    window.location.href = "index.html";
  }

  function renderBuiltInPlaylist(playlist) {
    playlist.songs.forEach((song, index) => {
      const li = document.createElement("li");
      li.className = `song-entry${isLocalServiceSong(song) ? " is-local-service" : ""}`;

      const button = document.createElement("button");
      button.className = "song-entry-select";
      if (isLocalServiceSong(song)) {
        const sourceBadge = document.createElement("span");
        sourceBadge.className = "song-entry-source-pill";
        sourceBadge.textContent = "L";
        sourceBadge.title = "Local Library Companion";
        button.appendChild(sourceBadge);
      }
      const titleText = document.createElement("span");
      titleText.className = "song-entry-title-text";
      titleText.textContent = `${song.name} - ${song.artist || "Unknown artist"}`;
      button.appendChild(titleText);
      button.addEventListener("click", () => {
        openPlaylistInPlayer(index);
      });

      const controls = document.createElement("div");
      controls.className = "song-entry-controls";
      controls.appendChild(createTrackSelectionButton(playlist.id, song, index));

      li.appendChild(button);
      li.appendChild(controls);
      songList.appendChild(li);
    });
  }

  function reorderCustomSong(fromIndex, toIndex) {
    const playlist = getCurrentPlaylist();
    if (!playlist || playlist.kind !== "custom") {
      return;
    }

    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return;
    }

    const boundedToIndex = Math.min(toIndex, playlist.songs.length - 1);
    if (fromIndex >= playlist.songs.length || boundedToIndex >= playlist.songs.length) {
      return;
    }

    PlaylistStore.updateCustomPlaylist(playlist.id, (current) => {
      const nextSongs = current.songs.map((song) => ({ ...song }));
      const [movedSong] = nextSongs.splice(fromIndex, 1);
      nextSongs.splice(boundedToIndex, 0, movedSong);
      return { ...current, songs: nextSongs };
    });

    refreshRegistry();
    renderPage({ allowLibraryLoad: false });
  }

  function removeCustomSong(songIndex) {
    const playlist = getCurrentPlaylist();
    if (!playlist || playlist.kind !== "custom") {
      return;
    }

    PlaylistStore.updateCustomPlaylist(playlist.id, (current) => ({
      ...current,
      songs: current.songs.filter((_, index) => index !== songIndex)
    }));

    refreshRegistry();
    renderPage();
    setMessage("Song removed from playlist.");
  }

  function autoScrollDuringDrag(clientY) {
    const bounds = songList.getBoundingClientRect();
    const edgeThreshold = 56;
    const maxStep = 18;

    if (clientY < bounds.top + edgeThreshold) {
      const ratio = Math.min(1, (bounds.top + edgeThreshold - clientY) / edgeThreshold);
      songList.scrollTop -= Math.ceil(maxStep * ratio);
      return;
    }

    if (clientY > bounds.bottom - edgeThreshold) {
      const ratio = Math.min(1, (clientY - (bounds.bottom - edgeThreshold)) / edgeThreshold);
      songList.scrollTop += Math.ceil(maxStep * ratio);
    }
  }

  function bindSongListDragHandlers() {
    if (dragListListenersBound) {
      return;
    }

    songList.addEventListener("dragover", (event) => {
      event.preventDefault();
      autoScrollDuringDrag(event.clientY);
    });

    songList.addEventListener("drop", (event) => {
      event.preventDefault();
      const sourceIndex = Number.parseInt(event.dataTransfer?.getData("text/plain") || "", 10);
      const currentPlaylist = getCurrentPlaylist();
      if (!Number.isFinite(sourceIndex) || !currentPlaylist?.songs?.length) {
        return;
      }
      reorderCustomSong(sourceIndex, currentPlaylist.songs.length - 1);
    });

    dragListListenersBound = true;
  }

  function renderCustomPlaylist(playlist) {
    bindSongListDragHandlers();

    if (!playlist.songs.length) {
      const li = document.createElement("li");
      li.className = "song-list-empty";
      li.innerHTML = "<p>This custom playlist is empty. Add songs or folders from the library below.</p>";
      songList.appendChild(li);
      return;
    }

    playlist.songs.forEach((song, index) => {
      const li = document.createElement("li");
      li.className = `song-entry song-entry-custom${isLocalServiceSong(song) ? " is-local-service" : ""}`;
      li.draggable = true;
      li.dataset.songIndex = String(index);

      const button = document.createElement("button");
      button.className = "song-entry-select";
      if (isLocalServiceSong(song)) {
        const sourceBadge = document.createElement("span");
        sourceBadge.className = "song-entry-source-pill";
        sourceBadge.textContent = "L";
        sourceBadge.title = "Local Library Companion";
        button.appendChild(sourceBadge);
      }
      const titleText = document.createElement("span");
      titleText.className = "song-entry-title-text";
      titleText.textContent = `${song.name} - ${song.artist || "Unknown artist"}`;
      button.appendChild(titleText);
      button.addEventListener("click", () => {
        openPlaylistInPlayer(index);
      });

      const controls = document.createElement("div");
      controls.className = "song-entry-controls";

      const dragHandle = document.createElement("span");
      dragHandle.className = "song-entry-drag-handle";
      dragHandle.innerHTML = "<span></span><span></span><span></span>";
      dragHandle.setAttribute("aria-hidden", "true");

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "song-entry-remove-btn";
      removeButton.setAttribute("aria-label", "Remove song from playlist");
      removeButton.setAttribute("title", "Remove song");
      removeButton.innerHTML = "<span aria-hidden=\"true\"></span>";
      removeButton.addEventListener("click", () => removeCustomSong(index));

      const pickButton = createTrackSelectionButton(playlist.id, song, index);

      li.addEventListener("dragstart", (event) => {
        li.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(index));
        }
      });

      li.addEventListener("dragend", () => {
        li.classList.remove("is-dragging");
        songList.querySelectorAll(".song-entry-custom.is-drag-over").forEach((item) => {
          item.classList.remove("is-drag-over");
        });
      });

      li.addEventListener("dragover", (event) => {
        event.preventDefault();
        autoScrollDuringDrag(event.clientY);
        li.classList.add("is-drag-over");
      });

      li.addEventListener("dragleave", () => {
        li.classList.remove("is-drag-over");
      });

      li.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        li.classList.remove("is-drag-over");
        const sourceIndex = Number.parseInt(event.dataTransfer?.getData("text/plain") || "", 10);
        if (!Number.isFinite(sourceIndex)) {
          return;
        }
        reorderCustomSong(sourceIndex, index);
      });

      controls.appendChild(pickButton);
      controls.appendChild(removeButton);

      li.appendChild(dragHandle);
      li.appendChild(button);
      li.appendChild(controls);
      songList.appendChild(li);
    });

  }

  async function promptForPlaylistName(defaultName) {
    const input = await window.ImpalaDialog.prompt({
      title: "New Playlist",
      message: "Name the new playlist:",
      defaultValue: defaultName,
      confirmLabel: "Create"
    });
    if (input === null) {
      return null;
    }

    const trimmed = input.trim();
    return trimmed || defaultName || "New Playlist";
  }

  function appendSongsToCustomPlaylist(playlistId, songs) {
    let addedCount = 0;
    let duplicateCount = 0;

    PlaylistStore.updateCustomPlaylist(playlistId, (current) => {
      const existingKeys = new Set(current.songs.map((song) => getSongIdentity(song)).filter(Boolean));
      const songsToAdd = [];

      songs.forEach((song, index) => {
        const identity = getSongIdentity(song);
        if (identity && existingKeys.has(identity)) {
          duplicateCount += 1;
          return;
        }

        if (identity) {
          existingKeys.add(identity);
        }

        addedCount += 1;
        songsToAdd.push({
          ...song,
          id: `${playlistId}-${Date.now()}-${index}`
        });
      });

      return {
        ...current,
        songs: [...current.songs, ...songsToAdd]
      };
    });

    return { addedCount, duplicateCount };
  }

  function refreshPlaylistEditor() {
    refreshRegistry();
    renderPlaylistPanel();
  }

  function addSongsToCurrentPlaylist(songs, label) {
    const playlist = getCurrentPlaylist();
    if (!playlist || playlist.kind !== "custom") {
      setMessage("Select or create a custom playlist before adding to the current playlist.");
      return;
    }

    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(playlist.id, songs);
    refreshPlaylistEditor();
    setMessage(buildImportMessage(label, playlist.name, addedCount, duplicateCount));
  }

  async function createNewPlaylistFromSongs(songs, suggestedName, label) {
    const name = await promptForPlaylistName(suggestedName);
    if (!name) {
      return;
    }

    const playlistId = PlaylistStore.createCustomPlaylist(name);
    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(playlistId, songs);
    currentPlaylistId = playlistId;
    refreshRegistry();
    renderPage({ allowLibraryLoad: false });
    setMessage(buildImportMessage(label, name, addedCount, duplicateCount));
  }

  function resolveExistingPlaylistChoice(customPlaylists, rawInput) {
    const trimmed = String(rawInput || "").trim();
    if (!trimmed) {
      return null;
    }

    const byIndex = Number.parseInt(trimmed, 10);
    if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= customPlaylists.length) {
      return customPlaylists[byIndex - 1];
    }

    return customPlaylists.find((playlist) => (
      playlist.id === trimmed || playlist.name.toLowerCase() === trimmed.toLowerCase()
    )) || null;
  }

  async function addSelectedTracksToExistingPlaylist() {
    const selectedSongs = getSelectedSongsForActions();
    if (!selectedSongs.length) {
      setMessage("Select tracks first.");
      return;
    }

    const customPlaylists = getCustomPlaylists();
    if (!customPlaylists.length) {
      setMessage("Create a custom playlist first.");
      return;
    }

    const currentPlaylist = getCurrentPlaylist();
    const defaultName = currentPlaylist?.kind === "custom"
      ? currentPlaylist.name
      : customPlaylists[0].name;
    const choices = customPlaylists
      .map((playlist, index) => `${index + 1}. ${playlist.name}`)
      .join("\n");
    const input = await window.ImpalaDialog.prompt({
      title: "Add Selected Tracks",
      message: `Add selected tracks to which playlist?\n\n${choices}\n\nType a number or exact playlist name:`,
      defaultValue: defaultName,
      confirmLabel: "Add"
    });

    if (input === null) {
      return;
    }

    const targetPlaylist = resolveExistingPlaylistChoice(customPlaylists, input);
    if (!targetPlaylist) {
      setMessage("Playlist not found. Enter one of the listed numbers or names.");
      return;
    }

    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(targetPlaylist.id, selectedSongs);
    clearTrackSelections();
    refreshRegistry();
    renderPage({ allowLibraryLoad: false });
    setMessage(buildImportMessage("selected tracks", targetPlaylist.name, addedCount, duplicateCount));
  }

  async function addSelectedTracksToNewPlaylist() {
    const selectedSongs = getSelectedSongsForActions();
    if (!selectedSongs.length) {
      setMessage("Select tracks first.");
      return;
    }

    const currentPlaylist = getCurrentPlaylist();
    const suggestedName = currentPlaylist ? `${currentPlaylist.name} Selected` : "Selected Tracks";
    const chosenName = await promptForPlaylistName(suggestedName);

    if (!chosenName) {
      return;
    }

    const playlistId = PlaylistStore.createCustomPlaylist(chosenName);

    PlaylistStore.updateCustomPlaylist(playlistId, (playlist) => ({
      ...playlist,
      name: chosenName
    }));

    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(playlistId, selectedSongs);
    currentPlaylistId = playlistId;
    clearTrackSelections();
    refreshRegistry();
    renderPage({ allowLibraryLoad: false });
    setMessage(buildImportMessage("selected tracks", chosenName, addedCount, duplicateCount));
  }

  function buildImportMessage(label, playlistName, addedCount, duplicateCount) {
    if (!addedCount && duplicateCount) {
      return `${label} is already in ${playlistName}.`;
    }

    const duplicateSuffix = duplicateCount ? ` Skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}.` : "";
    return `Added ${addedCount} track${addedCount === 1 ? "" : "s"} from ${label} to ${playlistName}.${duplicateSuffix}`;
  }

  function normalizeImportedSong(song, playlistId, index) {
    const title = String(song?.name || song?.title || "").trim();
    const artist = String(song?.artist || "Unknown artist").trim() || "Unknown artist";
    const album = String(song?.album || "").trim();
    const objectKey = String(song?.objectKey || "").trim();
    const file = String(song?.file || "").trim();
    const mediaType = String(song?.mediaType || song?.kind || "").trim();
    const contentType = String(song?.contentType || "").trim();
    const source = String(song?.source || "").trim();

    return {
      id: `${playlistId}-${Date.now()}-${index}`,
      name: title || "Untitled Track",
      artist,
      album,
      objectKey,
      file,
      mediaType,
      contentType,
      source
    };
  }

  function stripJsComments(input) {
    let output = "";
    let inString = false;
    let stringQuote = "";
    let escaped = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const nextChar = input[index + 1];

      if (inString) {
        output += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === stringQuote) {
          inString = false;
          stringQuote = "";
        }
        continue;
      }

      if (char === "\"" || char === "'" || char === "`") {
        inString = true;
        stringQuote = char;
        output += char;
        continue;
      }

      if (char === "/" && nextChar === "/") {
        while (index < input.length && input[index] !== "\n") {
          index += 1;
        }
        output += "\n";
        continue;
      }

      if (char === "/" && nextChar === "*") {
        index += 2;
        while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
          output += input[index] === "\n" ? "\n" : " ";
          index += 1;
        }
        index += 1;
        continue;
      }

      output += char;
    }

    return output;
  }

  function findMatchingEnclosure(input, startIndex) {
    const openingChar = input[startIndex];
    const closingChar = openingChar === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let stringQuote = "";
    let escaped = false;

    for (let index = startIndex; index < input.length; index += 1) {
      const char = input[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === stringQuote) {
          inString = false;
          stringQuote = "";
        }
        continue;
      }

      if (char === "\"" || char === "'" || char === "`") {
        inString = true;
        stringQuote = char;
        continue;
      }

      if (char === openingChar) {
        depth += 1;
      } else if (char === closingChar) {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  function findMatchingBracket(input, startIndex) {
    return findMatchingEnclosure(input, startIndex);
  }

  function convertJsStringsToJson(input) {
    let output = "";

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];

      if (char !== "'" && char !== "`") {
        output += char;
        continue;
      }

      const quote = char;
      let value = "";
      let escaped = false;
      index += 1;

      for (; index < input.length; index += 1) {
        const stringChar = input[index];
        if (escaped) {
          value += stringChar;
          escaped = false;
          continue;
        }

        if (stringChar === "\\") {
          escaped = true;
          continue;
        }

        if (stringChar === quote) {
          break;
        }

        value += stringChar;
      }

      output += JSON.stringify(value);
    }

    return output;
  }

  function readOutsideStrings(input, onNormalChar) {
    let output = "";
    let inString = false;
    let escaped = false;

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];

      if (inString) {
        output += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        output += char;
        continue;
      }

      const result = onNormalChar(input, index);
      if (result) {
        output += result.text;
        index = result.index;
      } else {
        output += char;
      }
    }

    return output;
  }

  function quoteBareObjectKeys(input) {
    return readOutsideStrings(input, (source, index) => {
      const char = source[index];
      if (char !== "{" && char !== ",") {
        return null;
      }

      let cursor = index + 1;
      while (/\s/.test(source[cursor] || "")) {
        cursor += 1;
      }

      const keyMatch = source.slice(cursor).match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (!keyMatch) {
        return null;
      }

      const key = keyMatch[1];
      const keyEnd = cursor + key.length;
      const colonIndex = source.indexOf(":", keyEnd);
      return {
        text: `${char}${source.slice(index + 1, cursor)}"${key}"${source.slice(keyEnd, colonIndex + 1)}`,
        index: colonIndex
      };
    });
  }

  function replaceUndefinedValues(input) {
    return readOutsideStrings(input, (source, index) => {
      if (source.slice(index, index + 9) !== "undefined") {
        return null;
      }

      const previous = source[index - 1] || "";
      const next = source[index + 9] || "";
      if (/[\w$]/.test(previous) || /[\w$]/.test(next)) {
        return null;
      }

      return {
        text: "null",
        index: index + 8
      };
    });
  }

  function removeTrailingCommas(input) {
    return readOutsideStrings(input, (source, index) => {
      if (source[index] !== ",") {
        return null;
      }

      let cursor = index + 1;
      while (/\s/.test(source[cursor] || "")) {
        cursor += 1;
      }

      if (source[cursor] !== "}" && source[cursor] !== "]") {
        return null;
      }

      return {
        text: "",
        index
      };
    });
  }

  function normalizeLoosePlaylistJson(input) {
    return removeTrailingCommas(
      replaceUndefinedValues(
        quoteBareObjectKeys(
          convertJsStringsToJson(input)
        )
      )
    );
  }

  function firstPlaylistExpressionStart(input, searchStart = 0) {
    const arrayStart = input.indexOf("[", searchStart);
    const objectStart = input.indexOf("{", searchStart);

    if (arrayStart === -1) {
      return objectStart;
    }
    if (objectStart === -1) {
      return arrayStart;
    }
    return Math.min(arrayStart, objectStart);
  }

  function extractSongsFromImportedValue(parsedValue, fallbackPlaylistName) {
    if (Array.isArray(parsedValue)) {
      return {
        playlistName: fallbackPlaylistName,
        songs: parsedValue
      };
    }

    if (!parsedValue || typeof parsedValue !== "object") {
      throw new Error("Playlist value must be an array of songs or a playlist export object.");
    }

    const songs = ["songs", "tracks", "items", "entries"]
      .map((key) => parsedValue[key])
      .find((value) => Array.isArray(value));

    if (!songs) {
      throw new Error("Playlist export must include a songs array.");
    }

    const playlistName = String(parsedValue.playlistName || parsedValue.name || fallbackPlaylistName).trim()
      || fallbackPlaylistName;

    return {
      playlistName,
      songs
    };
  }

  function parseJsPlaylistInput(rawInput) {
    const text = String(rawInput || "").trim();
    if (!text) {
      throw new Error("Paste a playlist before importing.");
    }

    try {
      return extractSongsFromImportedValue(JSON.parse(text), "Imported Playlist");
    } catch (error) {
      // Fall through to the loose parser for older JS playlist templates.
    }

    const withoutComments = stripJsComments(text).trim();
    const declarationMatch = withoutComments.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    const playlistName = declarationMatch ? declarationMatch[1] : "Imported Playlist";
    const expressionStart = firstPlaylistExpressionStart(withoutComments, declarationMatch ? declarationMatch[0].length : 0);

    if (expressionStart === -1) {
      throw new Error("Could not find a playlist. Paste export JSON or an array like [ { name: \"Song\", artist: \"Artist\", objectKey: \"folder/song.mp3\" } ].");
    }

    const expressionEnd = findMatchingEnclosure(withoutComments, expressionStart);
    if (expressionEnd === -1) {
      throw new Error("The playlist looks incomplete. Check for a missing closing bracket.");
    }

    const playlistExpression = withoutComments.slice(expressionStart, expressionEnd + 1);
    let parsedValue;

    try {
      parsedValue = JSON.parse(normalizeLoosePlaylistJson(playlistExpression));
    } catch (error) {
      throw new Error("Could not read that playlist. Check quotes, commas, and braces near the pasted song list.");
    }

    return extractSongsFromImportedValue(parsedValue, playlistName);
  }

  function sanitizePlaylistExportFilename(name) {
    const baseName = String(name || "playlist")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return `${baseName || "playlist"}.playlist.json`;
  }

  function buildPortableSong(song) {
    return Object.entries({
      name: String(song?.name || song?.title || "").trim(),
      artist: String(song?.artist || "").trim(),
      album: String(song?.album || "").trim(),
      objectKey: String(song?.objectKey || "").trim(),
      file: String(song?.file || "").trim(),
      mediaType: String(song?.mediaType || song?.kind || "").trim(),
      contentType: String(song?.contentType || "").trim(),
      source: String(song?.source || "").trim(),
      play: song?.play === false ? false : ""
    }).reduce((portableSong, [key, value]) => {
      if (value !== "") {
        portableSong[key] = value;
      }
      return portableSong;
    }, {});
  }

  function downloadTextFile(filename, text, type = "application/json") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportCurrentPlaylist() {
    const playlist = getCurrentPlaylist();
    if (!playlist) {
      setMessage("Choose a playlist to export.");
      return;
    }

    const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
    if (!songs.length) {
      setMessage("This playlist has no tracks to export.");
      return;
    }

    const payload = {
      schema: PLAYLIST_EXPORT_SCHEMA,
      name: playlist.name || "Imported Playlist",
      songs: songs.map(buildPortableSong)
    };
    const filename = sanitizePlaylistExportFilename(payload.name);

    downloadTextFile(
      filename,
      `${JSON.stringify(payload, null, 2)}\n`
    );
    setMessage(`Exported "${payload.name}" with ${songs.length} track${songs.length === 1 ? "" : "s"} to your browser Downloads folder as ${filename}.`);
  }

  function openImportPlaylistPanel() {
    if (!importPlaylistPanel || !importPlaylistText) {
      return;
    }

    closeDeletePlaylistPanel();
    importPlaylistPanel.hidden = false;
    importPlaylistText.focus();
  }

  function closeImportPlaylistPanel(options = {}) {
    const { clear = false } = options;
    if (!importPlaylistPanel || !importPlaylistText) {
      return;
    }

    importPlaylistPanel.hidden = true;
    if (clear) {
      importPlaylistText.value = "";
    }
  }

  function renderDeletePlaylistOptions(selectedPlaylistId = currentPlaylistId) {
    if (!deletePlaylistSelector || !deletePlaylistApplyButton) {
      return;
    }

    const customPlaylists = getCustomPlaylists();
    deletePlaylistSelector.innerHTML = "";

    customPlaylists.forEach((playlist) => {
      const option = document.createElement("option");
      option.value = playlist.id;
      const trackCount = Array.isArray(playlist.songs) ? playlist.songs.length : 0;
      option.textContent = `${playlist.name} (${trackCount} track${trackCount === 1 ? "" : "s"})`;
      option.selected = playlist.id === selectedPlaylistId;
      deletePlaylistSelector.appendChild(option);
    });

    if (customPlaylists.length && !deletePlaylistSelector.value) {
      deletePlaylistSelector.value = customPlaylists[0].id;
    }

    deletePlaylistApplyButton.disabled = !customPlaylists.length;
  }

  function openDeletePlaylistPanel() {
    if (!deletePlaylistPanel || !deletePlaylistSelector) {
      return;
    }

    closeImportPlaylistPanel();
    renderDeletePlaylistOptions();
    deletePlaylistPanel.hidden = false;
    deletePlaylistSelector.focus();
  }

  function closeDeletePlaylistPanel(options = {}) {
    const { clearSelection = false } = options;

    if (!deletePlaylistPanel || !deletePlaylistSelector) {
      return;
    }

    deletePlaylistPanel.hidden = true;

    if (clearSelection) {
      deletePlaylistSelector.innerHTML = "";
    }
  }

  function deleteSelectedPlaylist() {
    if (!deletePlaylistSelector) {
      return;
    }

    const playlistId = String(deletePlaylistSelector.value || "");
    const playlist = playlistRegistry.find((entry) => entry.id === playlistId) || null;
    if (!playlist || playlist.kind !== "custom") {
      setMessage("Select a custom playlist to delete.");
      return;
    }

    const confirmed = window.confirm(`Delete playlist \"${playlist.name}\"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    PlaylistStore.deleteCustomPlaylist(playlist.id);
    closeDeletePlaylistPanel({ clearSelection: true });
    refreshRegistry();

    if (!playlistRegistry.find((entry) => entry.id === currentPlaylistId)) {
      currentPlaylistId = playlistRegistry[0] ? playlistRegistry[0].id : "";
    }

    renderPage();
    setMessage(`Deleted \"${playlist.name}\".`);
  }

  function importPlaylistFromJsText(pastedText) {
    const text = String(pastedText || "");
    if (text.length > MAX_IMPORT_CHARS) {
      throw new Error(`Import exceeds ${MAX_IMPORT_CHARS.toLocaleString()} characters.`);
    }

    const { playlistName, songs } = parseJsPlaylistInput(text);
    if (!songs.length) {
      throw new Error("Playlist array is empty.");
    }

    const playlistId = PlaylistStore.createCustomPlaylist(playlistName);
    const normalizedSongs = songs.map((song, index) => normalizeImportedSong(song, playlistId, index));
    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(playlistId, normalizedSongs);
    const missingKeyCount = normalizedSongs.filter((song) => !song.objectKey && !song.file).length;

    currentPlaylistId = playlistId;
    refreshRegistry();
    renderPage();

    const missingKeySuffix = missingKeyCount
      ? ` ${missingKeyCount} track${missingKeyCount === 1 ? "" : "s"} missing objectKey/file may not play.`
      : "";

    setMessage(buildImportMessage("import", playlistName, addedCount, duplicateCount) + missingKeySuffix);
  }

  function mergePlaylistFromJsText(pastedText) {
    const playlist = getCurrentPlaylist();
    if (!playlist || playlist.kind !== "custom") {
      throw new Error("Select or create a custom playlist before merging.");
    }

    const text = String(pastedText || "");
    if (text.length > MAX_IMPORT_CHARS) {
      throw new Error(`Import exceeds ${MAX_IMPORT_CHARS.toLocaleString()} characters.`);
    }

    const { playlistName, songs } = parseJsPlaylistInput(text);
    if (!songs.length) {
      throw new Error("Playlist array is empty.");
    }

    const normalizedSongs = songs.map((song, index) => normalizeImportedSong(song, playlist.id, index));
    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(playlist.id, normalizedSongs);
    const missingKeyCount = normalizedSongs.filter((song) => !song.objectKey && !song.file).length;
    const missingKeySuffix = missingKeyCount
      ? ` ${missingKeyCount} track${missingKeyCount === 1 ? "" : "s"} missing objectKey/file may not play.`
      : "";

    refreshRegistry();
    renderPage();
    setMessage(buildImportMessage(playlistName, playlist.name, addedCount, duplicateCount) + missingKeySuffix);
  }

  async function fetchFolderEntries(prefix, options = {}) {
    const { force = false, searchTerm = "" } = options;
    const normalizedPrefix = String(prefix || "");
    const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

    if (currentLibrarySource === "local-service" || normalizedPrefix.startsWith("local-service/")) {
      await fetchLocalServiceTracks({ force });
      return getLocalServicePayload(normalizedPrefix, libraryBrowseMode);
    }

    if (!normalizedSearchTerm && !force && folderCache.has(normalizedPrefix)) {
      return folderCache.get(normalizedPrefix);
    }

    const query = new URLSearchParams({
      prefix: normalizedPrefix,
      limit: "1000",
      media: getApiMediaScope()
    });

    if (normalizedSearchTerm) {
      query.set("search", normalizedSearchTerm);
    }

    const payload = await apiRequest(`/api/library?${query.toString()}`);
    const folderEntries = (payload.folders || []).map((folder) => ({
      type: "folder",
      name: folder.name,
      prefix: folder.prefix
    }));

    const fileEntries = (payload.files || [])
      .map((file) => createLibraryFileEntryFromObjectKey(file.objectKey, file))
      .filter(Boolean);

    // Some environments return files at root without a folders list.
    // Build a synthetic artist root so the artist row still populates.
    if (!normalizedPrefix && !folderEntries.length && fileEntries.length) {
      const artistsByPrefix = new Map();
      fileEntries.forEach((fileEntry) => {
        const artistPrefix = inferArtistPrefixFromObjectKey(fileEntry.objectKey);
        if (!artistPrefix) {
          return;
        }

        if (!artistsByPrefix.has(artistPrefix)) {
          artistsByPrefix.set(artistPrefix, {
            type: "folder",
            name: fileEntry.artist || "Unknown artist",
            prefix: artistPrefix
          });
        }
      });

      folderEntries.push(...artistsByPrefix.values());
      folderEntries.sort((left, right) => left.name.localeCompare(right.name));
    }

    const normalizedPayload = {
      prefix: payload.prefix || normalizedPrefix,
      entries: [
        ...folderEntries,
        ...fileEntries
      ]
    };

    if (!normalizedSearchTerm) {
      folderCache.set(normalizedPrefix, normalizedPayload);
    }

    return normalizedPayload;
  }

  async function fetchAllTracksForPrefix(prefix, options = {}) {
    const { force = false, searchTerm = "" } = options;
    const tracks = [];
    let cursor = "";
    const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

    if (currentLibrarySource === "local-service" || String(prefix || "").startsWith("local-service/")) {
      await fetchLocalServiceTracks({ force });
      return buildLocalServiceFolderEntries(prefix, libraryBrowseMode)
        .filter((entry) => entry.type === "file")
        .filter((entry) => !normalizedSearchTerm || filterEntriesBySearch([entry]).length)
        .map((entry, index) => createPlaylistSongFromLibraryEntry(entry, currentPlaylistId || "custom", index))
        .filter(Boolean);
    }

    do {
      const query = new URLSearchParams({
        prefix,
        limit: "1000",
        recursive: "1",
        media: getApiMediaScope()
      });

      if (normalizedSearchTerm) {
        query.set("search", normalizedSearchTerm);
      }

      if (cursor) {
        query.set("cursor", cursor);
      }

      const payload = await apiRequest(`/api/library?${query.toString()}`);
      (payload.files || []).forEach((file) => {
        const entry = createLibraryFileEntryFromObjectKey(file.objectKey, file);
        if (entry) {
          tracks.push(entry);
        }
      });
      cursor = payload.nextCursor || "";
    } while (cursor);

    return tracks;
  }

  function playVideoFromHere(entries, startIndex) {
    const playableEntries = Array.isArray(entries)
      ? entries.filter((entry) => entry && entry.type === "file")
      : [];

    if (!playableEntries.length) {
      setLibraryStatus("No playable videos were found.");
      return;
    }

    const queueName = "Playback Queue";
    const existingQueue = getCustomPlaylists().find((playlist) => playlist.name === queueName);
    const playlistId = existingQueue ? existingQueue.id : PlaylistStore.createCustomPlaylist(queueName);
    const safeStartIndex = Number.isInteger(startIndex)
      ? Math.max(0, Math.min(startIndex, playableEntries.length - 1))
      : 0;

    PlaylistStore.updateCustomPlaylist(playlistId, (playlist) => ({
      ...playlist,
      name: queueName,
      songs: playableEntries.map((song, index) => ({
        ...song,
        id: `${playlistId}-${Date.now()}-${index}`
      }))
    }));

    PlaylistStore.savePlayerState({
      playlistId,
      songIndex: safeStartIndex,
      playbackState: "playing"
    });

    window.location.href = "index.html";
  }

  function playVideoEntryFromEntries(entries, entry) {
    const playableEntries = Array.isArray(entries)
      ? entries.filter((candidate) => candidate && candidate.type === "file")
      : [];
    const entryKey = String(entry?.objectKey || entry?.file || "");
    const startIndex = playableEntries.findIndex((candidate) => (
      String(candidate.objectKey || candidate.file || "") === entryKey
    ));

    playVideoFromHere(entries, startIndex >= 0 ? startIndex : 0);
  }

  function openVideoFolder(prefix) {
    currentPrefix = String(prefix || "");
    selectedArtistPrefix = "";
    selectedAlbumPrefix = "";
    previewEntries = [];
    trackEntries = [];
    renderPreviewPane();
    renderTracksPane();
    loadCurrentLevel({ force: true });
  }

  async function openVideoFolderOrPlaySingle(entry) {
    if (!entry || entry.isNavigation) {
      openVideoFolder(entry?.prefix || "");
      return;
    }

    try {
      setLibraryStatus("Opening title...");
      const payload = await fetchFolderEntries(entry.prefix, { force: true });
      const playableEntries = payload.entries.filter((candidate) => candidate.type === "file");
      const childFolders = payload.entries.filter((candidate) => candidate.type === "folder");

      if (playableEntries.length === 1 && childFolders.length === 0) {
        playVideoFromHere(playableEntries, 0);
        return;
      }
    } catch (error) {
      setLibraryStatus(error.message || "Unable to inspect title. Opening folder.");
    }

    openVideoFolder(entry.prefix);
  }

  function renderLibraryPath() {
    const modeLabel = libraryBrowseMode === "video" ? "Video" : "Audio";
    const isVideoMode = libraryBrowseMode === "video";
    const isCloudVideo = isCloudVideoMode();
    const isLocalJsonLibrary = currentLibrarySource === "local-json";

    if (libraryCurrentHeading) {
      libraryCurrentHeading.textContent = isCloudVideo
        ? (currentPrefix ? "Folder" : "Titles")
        : (isVideoMode ? "Videos" : "Artists");
    }
    if (libraryPlayHint) {
      libraryPlayHint.hidden = !isVideoMode;
      libraryPlayHint.textContent = isCloudVideo
        ? "Click a folder to open. Click a video to play."
        : "Click on title to play";
    }
    if (libraryPreviewHeading) {
      libraryPreviewHeading.textContent = isCloudVideo ? "Folders" : (isVideoMode ? "Preview" : "Albums");
    }

    libraryCurrentTitle.textContent = isLocalJsonLibrary
      ? `Local ${modeLabel}`
      : (isCloudVideo
        ? (currentPrefix ? getLibraryPathLabel(currentPrefix) : "All Titles")
        : (isVideoMode ? "All Videos" : "Select an artist"));
    libraryPreviewTitle.textContent = isLocalJsonLibrary
      ? "JSON manifest"
      : (isCloudVideo
        ? "Open folders in the title list"
        : (selectedArtistPrefix
        ? getLibraryPathLabel(selectedArtistPrefix)
        : (isVideoMode ? "Choose a title above" : "Choose an artist above")));
    if (libraryTracksHeading) {
      libraryTracksHeading.textContent = isCloudVideo
        ? "Videos"
        : (isVideoMode ? "Episodes" : (selectedAlbumPrefix ? "Tracks" : "Album"));
    }
    if (libraryTracksTitle) {
      libraryTracksTitle.textContent = isCloudVideo
        ? "Click a video to play"
        : (selectedAlbumPrefix
        ? getLibraryPathLabel(selectedAlbumPrefix)
        : (isVideoMode ? "Select a season to display episodes" : "Select Album to display tracks"));
    }
  }

  function renderLibraryEmptyState(target, message) {
    target.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "song-list-empty";
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    empty.appendChild(paragraph);
    target.appendChild(empty);
  }

  function renderLibraryEntries(target, entries, options = {}) {
    const {
      folderClickAction = "preview",
      selectedPrefix = "",
      isArtistRow = false,
      hideSubtitle = false,
      openFolderOnRowClick = false,
      suppressFolderActions = false
    } = options;
    target.innerHTML = "";

    if (!entries.length) {
      renderLibraryEmptyState(
        target,
        librarySearchTerm ? "No matches for the current filter." : "Nothing here yet."
      );
      return;
    }

    entries.forEach((entry, index) => {
      const item = document.createElement("div");
      const isSelected = entry.type === "folder" && entry.prefix === selectedPrefix;
      item.className = `library-song${isSelected ? " is-selected" : ""}${isArtistRow ? " library-artist-item" : ""}${entry.isVideoCollection ? " is-video-collection" : ""}`;
      const metadataKind = libraryBrowseMode === "video"
        ? ((!currentPrefix || entry.isVideoCollection) ? "movie" : "")
        : (!isArtistRow && entry.type === "folder" ? "album" : "");
      const artworkOverride = String(entry.artworkOverride || entry.posterOverride || "").trim();
      if (metadataKind || artworkOverride) {
        item.classList.add("has-metadata-artwork");
        item.dataset.metadataKind = metadataKind;
        item.dataset.metadataTitle = entry.name || "";
        item.dataset.metadataArtist = String(entry.artist || (metadataKind === "album" ? getLibraryLeafName(selectedArtistPrefix) : ""));
        const metadataRef = entry.metadataRef && typeof entry.metadataRef === "object" ? entry.metadataRef : null;
        if (metadataRef?.provider) item.dataset.metadataProvider = String(metadataRef.provider);
        if (metadataRef?.providerId) item.dataset.metadataProviderId = String(metadataRef.providerId);
        const image = document.createElement("img");
        image.className = "library-metadata-artwork";
        image.alt = "";
        image.loading = "lazy";
        image.hidden = true;
        image.addEventListener("load", () => { image.hidden = false; });
        image.addEventListener("error", () => { image.hidden = true; });
        if (artworkOverride) image.src = artworkOverride;
        item.appendChild(image);
      }
      if (openFolderOnRowClick && entry.type === "folder") {
        item.classList.add("is-clickable-folder");
        item.addEventListener("click", () => {
          if (folderClickAction === "open") {
            options.onOpen?.(entry.prefix, entry);
          } else {
            options.onSelect?.(entry.prefix);
          }
        });
      }

      const body = document.createElement("div");
      body.className = "library-song-body";

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "library-song-select";

      const title = document.createElement("strong");
      title.textContent = entry.name;

      const subtitle = document.createElement("span");
      if (entry.type === "folder") {
        subtitle.textContent = getLibraryPathLabel(entry.prefix);
        copy.addEventListener("click", (event) => {
          event.stopPropagation();
          if (folderClickAction === "open") {
            options.onOpen?.(entry.prefix, entry);
          } else {
            options.onSelect?.(entry.prefix);
          }
        });
      } else {
        subtitle.textContent = entry.album
          ? `${entry.artist || "Unknown artist"} • ${entry.album}`
          : (entry.artist || "Unknown artist");
        if (options.onFileClick) {
          copy.addEventListener("click", (event) => {
            event.stopPropagation();
            options.onFileClick(entry, index);
          });
        }
      }

      copy.appendChild(title);
      if (!hideSubtitle) copy.appendChild(subtitle);
      body.appendChild(copy);
      if (isArtistRow && libraryBrowseMode !== "video" && entry.type === "folder") {
        body.classList.add("library-song-body-with-star");
        body.appendChild(createArtistSelectionButton(entry));
      } else if (options.enableFolderStar && entry.type === "folder") {
        body.classList.add("library-song-body-with-star");
        body.appendChild(createAlbumSelectionButton(entry));
      } else if (options.enableFileStar && entry.type === "file") {
        body.classList.add("library-song-body-with-star");
        body.appendChild(createLibrarySelectionButton(createPlaylistSongFromLibraryEntry(entry, currentPlaylistId, index), index));
      } else if (suppressFolderActions && entry.type === "folder") {
        // Folder rows are already direct navigation controls in cloud video mode.
      }
      item.appendChild(body);
      target.appendChild(item);
    });

    if (target === libraryCurrentList) {
      requestAnimationFrame(updateArtistScrollRail);
    }
    document.dispatchEvent(new CustomEvent("impala:libraryrender", { detail: { root: target } }));
  }

  async function loadCurrentLevel(options = {}) {
    const { force = false } = options;
    const lastGoodLibraryState = {
      entries: currentEntries,
      previewEntries,
      trackEntries,
      prefix: currentPrefix
    };
    const hasSearchTerm = Boolean(librarySearchTerm);
    const localLibraryJson = getLocalLibraryJson();
    const localHelper = getLocalHelperPreferences();

    syncSongListModeClass();

    currentLoading = true;
    renderLibraryPath();

    if (localHelper.enabled) {
      currentLibrarySource = "local-service";
      currentPrefix = "";

      try {
        await fetchLocalServiceTracks({ force: true });
        const payload = getLocalServicePayload("", libraryBrowseMode);
        currentEntries = payload.entries;
        previewEntries = [];
        trackEntries = [];
        selectedArtistPrefix = "";
        selectedAlbumPrefix = "";

        renderLibraryPath();
        if (libraryBrowseMode === "video") {
          const visibleEntries = filterEntriesBySearch(localServiceTracks.filter((track) => localServiceTrackMatchesMode(track, "video")));
          currentEntries = visibleEntries;
          renderLibraryEntries(libraryCurrentList, visibleEntries, {
            hideNavigationActions: true,
            enableFileStar: true,
            onFileClick: (_, rowIndex) => playVideoFromHere(visibleEntries, rowIndex)
          });
        } else {
          renderLibraryEntries(libraryCurrentList, filterEntriesBySearch(currentEntries), {
            selectedPrefix: selectedArtistPrefix,
            isArtistRow: true,
            onSelect: selectArtist,
            onOpen: openArtist
          });
        }
        renderPreviewPane();
        renderTracksPane();
        setLibraryStatus(currentEntries.length
          ? "Using Local Library Companion."
          : "Local Library Companion is connected, but no media items are indexed. Open Settings and connect/rescan your Media Folder.");
      } catch (error) {
        currentEntries = [];
        previewEntries = [];
        trackEntries = [];
        renderLibraryPath();
        renderLibraryEntries(libraryCurrentList, []);
        renderPreviewPane();
        renderTracksPane();
        setLibraryStatus(`Local Library Companion is enabled but not reachable at ${getLocalHelperBaseUrl()}. Start the helper from C:\\Users\\<you>\\Impala-Helper, then use Settings to connect.`);
      } finally {
        currentLoading = false;
      }

      return;
    }

    if (localLibraryJson) {
      currentLibrarySource = "local-json";

      try {
        currentEntries = getLocalLibraryEntriesForMode(libraryBrowseMode);
        previewEntries = [];
        trackEntries = [];
        selectedArtistPrefix = "";
        selectedAlbumPrefix = "";

        renderLibraryPath();
        if (libraryBrowseMode === "video") {
          const visibleEntries = filterEntriesBySearch(currentEntries);
          renderLibraryEntries(libraryCurrentList, visibleEntries, {
            hideNavigationActions: true,
            enableFileStar: true,
            onFileClick: (_, rowIndex) => playVideoFromHere(visibleEntries, rowIndex)
          });
        } else {
          renderLibraryEntries(libraryCurrentList, filterEntriesBySearch(currentEntries), {
            selectedPrefix: selectedArtistPrefix,
            isArtistRow: true,
            onSelect: selectArtist,
            onOpen: openArtist
          });
        }
        renderPreviewPane();
        renderTracksPane();
        setLibraryStatus(currentEntries.length ? "" : `No local ${getApiMediaScope()} entries were found in the JSON manifest.`);
      } catch (error) {
        currentEntries = [];
        previewEntries = [];
        trackEntries = [];
        renderLibraryPath();
        renderLibraryEntries(libraryCurrentList, []);
        renderPreviewPane();
        renderTracksPane();
        setLibraryStatus(error.message || "Unable to load local library JSON.");
      } finally {
        currentLoading = false;
      }

      return;
    }

    currentLibrarySource = "s4";

    if (!getApiBaseUrl()) {
      currentEntries = [];
      previewEntries = [];
      trackEntries = [];
      renderLibraryPath();
      renderLibraryEntries(libraryCurrentList, []);
      renderPreviewPane();
      renderTracksPane();
      setLibraryStatus("Configure app-config.js with the signer API URL to browse S4.");
      currentLoading = false;
      return;
    }

    if (!hasAuthSession()) {
      currentEntries = [];
      previewEntries = [];
      trackEntries = [];
      renderLibraryPath();
      renderLibraryEntries(libraryCurrentList, []);
      renderPreviewPane();
      renderTracksPane();
      setLibraryStatus("Please sign in to browse the private cloud library.");
      authNotice?.render?.({
        targetSelector: ".titles-row",
        needsPrivateAccess: true
      });
      currentLoading = false;
      return;
    }

    renderLibraryEmptyState(libraryCurrentList, "Loading...");
    setLibraryStatus(hasSearchTerm ? "Searching library..." : "Loading library...");

    try {
      let payload;

      if (!currentPrefix) {
        const resolvedRoot = await resolveRootPayloadForMode(libraryBrowseMode, {
          force,
          searchTerm: librarySearchTerm
        });
        currentPrefix = resolvedRoot.prefix;
        payload = resolvedRoot.payload;
      } else {
        payload = await fetchFolderEntries(currentPrefix, {
          force,
          searchTerm: librarySearchTerm
        });
      }

      currentEntries = await markVideoRootCollections(collapseVideoRootEntries(payload.entries), { force });
      if (currentLibrarySource !== "local-json" && libraryBrowseMode !== "video") {
        currentEntries = currentEntries.filter((entry) => entry.type === "folder");
      }
      if (isCloudVideoMode() && currentPrefix) {
        currentEntries = [createVideoBackEntry(), ...currentEntries];
      }

      if (hasSearchTerm && libraryBrowseMode !== "video") {
        selectedArtistPrefix = "";
        selectedAlbumPrefix = "";
        previewEntries = [];
        trackEntries = [];
      }

      renderLibraryPath();
      if (libraryBrowseMode === "video") {
        const visibleEntries = filterEntriesBySearch(currentEntries);
        renderLibraryEntries(libraryCurrentList, visibleEntries, {
          folderClickAction: "open",
          openFolderOnRowClick: true,
          suppressFolderActions: true,
          enableFileStar: true,
          onSelect: openVideoFolder,
          onOpen: (_prefix, entry) => openVideoFolderOrPlaySingle(entry),
          onFileClick: (entry) => playVideoEntryFromEntries(visibleEntries, entry)
        });
      } else {
        renderLibraryEntries(libraryCurrentList, currentEntries, {
          selectedPrefix: selectedArtistPrefix,
          isArtistRow: true,
          onSelect: selectArtist,
          onOpen: openArtist
        });
      }
      renderPreviewPane();
      renderTracksPane();
      setLibraryStatus("");
    } catch (error) {
      currentEntries = lastGoodLibraryState.entries;
      previewEntries = lastGoodLibraryState.previewEntries;
      trackEntries = lastGoodLibraryState.trackEntries;
      currentPrefix = lastGoodLibraryState.prefix;
      currentLoading = false;
      renderLibraryPanel({ allowLoad: false });
      setLibraryStatus(currentEntries.length
        ? `Library refresh interrupted; showing the last loaded catalog. ${error.message || ""}`.trim()
        : (error.message || "Unable to load library."));
    } finally {
      currentLoading = false;
    }
  }

  async function loadAlbumsLevel(prefix, options = {}) {
    const { force = false } = options;
    if (!prefix) {
      previewEntries = [];
      trackEntries = [];
      selectedAlbumPrefix = "";
      renderPreviewPane();
      renderTracksPane();
      return;
    }

    previewLoading = true;
    renderPreviewPane(true);
    renderTracksPane(true);

    try {
      const payload = await fetchFolderEntries(prefix, { force });
      previewEntries = libraryBrowseMode === "video"
        ? payload.entries
        : payload.entries.filter((entry) => entry.type === "folder");
      trackEntries = [];
      selectedAlbumPrefix = "";
      renderPreviewPane();
      renderTracksPane();
      setLibraryStatus("");
    } catch (error) {
      previewEntries = [];
      trackEntries = [];
      selectedAlbumPrefix = "";
      renderPreviewPane();
      renderTracksPane();
      setLibraryStatus(error.message || "Unable to load albums.");
    } finally {
      previewLoading = false;
    }
  }

  async function loadTracksLevel(prefix, options = {}) {
    const { force = false } = options;
    if (!prefix) {
      trackEntries = [];
      renderTracksPane();
      return;
    }

    trackLoading = true;
    renderTracksPane(true);

    try {
      const payload = await fetchFolderEntries(prefix, { force });
      trackEntries = payload.entries.filter((entry) => entry.type === "file");
      renderTracksPane();
      setLibraryStatus("");
    } catch (error) {
      trackEntries = [];
      renderTracksPane();
      setLibraryStatus(error.message || "Unable to load tracks.");
    } finally {
      trackLoading = false;
    }
  }

  function renderPreviewPane(showLoading = false) {
    renderLibraryPath();
    if (isCloudVideoMode()) {
      renderLibraryEmptyState(
        libraryPreviewList,
        currentPrefix ? "Use the folder list to open seasons or videos." : "Open a title in the Titles list."
      );
      return;
    }

    if (currentLibrarySource === "local-json") {
      renderLibraryEmptyState(
        libraryPreviewList,
        librarySearchTerm
          ? "Local JSON manifest is filtered in the left pane."
          : "Local JSON manifest loaded. Use the left pane to add tracks."
      );
      return;
    }

    if (!selectedArtistPrefix) {
      renderLibraryEmptyState(
        libraryPreviewList,
        libraryBrowseMode === "video"
          ? "Choose a title above to see seasons or videos."
          : "Choose an artist above to see albums."
      );
      return;
    }

    if (showLoading) {
      renderLibraryEmptyState(libraryPreviewList, "Loading...");
      return;
    }

    const visibleEntries = filterEntriesBySearch(previewEntries);
    renderLibraryEntries(libraryPreviewList, visibleEntries, {
      folderClickAction: "preview",
      selectedPrefix: selectedAlbumPrefix,
      hideSubtitle: true,
      hideNavigationActions: libraryBrowseMode !== "video",
      enableFolderStar: libraryBrowseMode !== "video",
      onSelect: selectAlbum,
      onOpen: openAlbum,
      openFolderOnRowClick: libraryBrowseMode === "video",
      onFileClick: (entry) => playVideoEntryFromEntries(visibleEntries, entry)
    });
  }

  function renderTracksPane(showLoading = false) {
    renderLibraryPath();
    if (isCloudVideoMode()) {
      renderLibraryEmptyState(libraryTracksList, "Select a video file to play.");
      return;
    }

    if (currentLibrarySource === "local-json") {
      renderLibraryEmptyState(libraryTracksList, "Tracks from local JSON appear in the Albums column.");
      return;
    }

    if (!selectedAlbumPrefix) {
      if (libraryBrowseMode === "video") {
        renderLibraryEmptyState(libraryTracksList, "Select a season to see episodes.");
      } else {
        libraryTracksList.innerHTML = "";
      }
      return;
    }

    if (showLoading) {
      renderLibraryEmptyState(libraryTracksList, "Loading...");
      return;
    }

    const visibleEntries = filterEntriesBySearch(trackEntries);
    renderLibraryEntries(libraryTracksList, visibleEntries, {
      folderClickAction: "open",
      hideSubtitle: true,
      hideNavigationActions: libraryBrowseMode !== "video",
      enableFileStar: libraryBrowseMode !== "video",
      onSelect: selectAlbum,
      onOpen: openAlbum,
      onFileClick: (entry) => playVideoEntryFromEntries(visibleEntries, entry)
    });
  }

  function selectArtist(prefix) {
    if (!prefix || selectedArtistPrefix === prefix) {
      return;
    }

    selectedArtistPrefix = prefix;
    selectedAlbumPrefix = "";
    previewEntries = [];
    trackEntries = [];
    renderPreviewPane(true);
    renderTracksPane();
    loadAlbumsLevel(prefix);
    scrollLibrarySectionIntoView(libraryPreviewHeading);
  }

  function openArtist(prefix) {
    selectArtist(prefix);
  }

  function scrollLibrarySectionIntoView(element) {
    if (!element || !window.matchMedia("(max-width: 880px)").matches) {
      return;
    }

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior, block: "start" });
    });
  }

  function selectAlbum(prefix) {
    if (!prefix || selectedAlbumPrefix === prefix) {
      return;
    }

    selectedAlbumPrefix = prefix;
    trackEntries = [];
    renderPreviewPane();
    renderTracksPane(true);
    loadTracksLevel(prefix);
    scrollLibrarySectionIntoView(libraryTracksHeading);
  }

  function openAlbum(prefix) {
    selectAlbum(prefix);
  }

  function renderLibraryPanel(options = {}) {
    const allowLoad = options.allowLoad !== false;
    updateLibraryModeButtons();
    syncSongListModeClass();
    renderLibraryPath();

    const preferredLibrarySource = getPreferredLibrarySource();

    if (allowLoad && preferredLibrarySource !== currentLibrarySource && !currentLoading) {
      currentLibrarySource = preferredLibrarySource;
      currentPrefix = "";
      selectedArtistPrefix = "";
      selectedAlbumPrefix = "";
      currentEntries = [];
      previewEntries = [];
      trackEntries = [];
      localServiceTracks = [];
      folderCache.clear();
      videoCollectionCache.clear();
      loadCurrentLevel({ force: true });
      return;
    }

    if (libraryBrowseMode === "video") {
      if (currentLoading) {
        renderLibraryEmptyState(libraryCurrentList, "Loading videos...");
      } else if (allowLoad && librarySearchTerm && !currentLoading) {
        loadCurrentLevel({ force: true });
        return;
      } else if (allowLoad && !currentEntries.length) {
        loadCurrentLevel();
        return;
      } else {
        const visibleEntries = filterEntriesBySearch(currentEntries);
        if (isCloudVideoMode()) {
          renderLibraryEntries(libraryCurrentList, visibleEntries, {
            folderClickAction: "open",
            openFolderOnRowClick: true,
            suppressFolderActions: true,
            enableFileStar: true,
            onSelect: openVideoFolder,
            onOpen: (_prefix, entry) => openVideoFolderOrPlaySingle(entry),
            onFileClick: (entry) => playVideoEntryFromEntries(visibleEntries, entry)
          });
        } else {
          renderLibraryEntries(libraryCurrentList, visibleEntries, {
            hideNavigationActions: true,
            enableFileStar: true,
            onFileClick: (_, rowIndex) => playVideoFromHere(visibleEntries, rowIndex)
          });
        }
      }

      renderPreviewPane();
      renderTracksPane();
      return;
    }

    if (currentLibrarySource === "local-json") {
      renderLibraryEntries(libraryCurrentList, filterEntriesBySearch(currentEntries), {
        selectedPrefix: selectedArtistPrefix,
        isArtistRow: true,
        onSelect: selectArtist,
        onOpen: openArtist
      });
      renderPreviewPane();
      renderTracksPane();
      return;
    }

    if (currentLibrarySource === "local-service") {
      if (libraryBrowseMode === "video") {
        const visibleEntries = filterEntriesBySearch(currentEntries);
        renderLibraryEntries(libraryCurrentList, visibleEntries, {
          hideNavigationActions: true,
          enableFileStar: true,
          onFileClick: (_, rowIndex) => playVideoFromHere(visibleEntries, rowIndex)
        });
        renderPreviewPane();
        renderTracksPane();
        return;
      }

      renderLibraryEntries(libraryCurrentList, filterEntriesBySearch(currentEntries), {
        selectedPrefix: selectedArtistPrefix,
        isArtistRow: true,
        onSelect: selectArtist,
        onOpen: openArtist
      });
      renderPreviewPane();
      renderTracksPane();
      updateArtistScrollRail();
      return;
    }

    if (allowLoad && librarySearchTerm && !currentLoading) {
      loadCurrentLevel({ force: true });
      return;
    }

    if (allowLoad && !folderCache.has(currentPrefix) && !currentLoading) {
      loadCurrentLevel();
      return;
    }

    renderLibraryEntries(libraryCurrentList, filterEntriesBySearch(currentEntries), {
      selectedPrefix: selectedArtistPrefix,
      isArtistRow: true,
      onSelect: selectArtist,
      onOpen: openArtist
    });
    renderPreviewPane();
    renderTracksPane();
    updateArtistScrollRail();
  }

  function renderPlaylistPanel() {
    refreshRegistry();
    renderPlaylistSelector();
    renderPlaylistList();
    syncSongListModeClass();

    const playlist = getCurrentPlaylist();
    songList.innerHTML = "";

    renamePlaylistButton.disabled = !playlist || playlist.kind !== "custom";
    if (exportPlaylistButton) {
      exportPlaylistButton.disabled = !playlist || !Array.isArray(playlist.songs) || !playlist.songs.length;
    }
    const customPlaylists = getCustomPlaylists();
    if (deletePlaylistButton) {
      deletePlaylistButton.disabled = !customPlaylists.length;
    }

    if (deletePlaylistPanel && !deletePlaylistPanel.hidden) {
      if (!customPlaylists.length) {
        closeDeletePlaylistPanel({ clearSelection: true });
      } else {
        renderDeletePlaylistOptions();
      }
    }
    if (!playlist) {
      songList.innerHTML = "<li class='song-list-empty'><p>No playlists available.</p></li>";
      return;
    }

    if (playlist.kind === "custom") {
      renderCustomPlaylist(playlist);
    } else {
      renderBuiltInPlaylist(playlist);
    }

    updateSelectedTracksUi();
    updatePlaylistExpandUi(playlist);

    PlaylistStore.savePlayerState({
      playlistId: playlist.id,
      songIndex: 0,
      playbackState: "paused"
    });
  }

  function updatePlaylistExpandUi(playlist) {
    if (!playlistExpandButton || !songList) {
      return;
    }

    const count = Array.isArray(playlist?.songs) ? playlist.songs.length : 0;
    const canExpand = count > 5;
    playlistExpandButton.hidden = !canExpand;
    songList.classList.toggle("is-collapsed", canExpand && !playlistExpanded);
    playlistExpandButton.textContent = playlistExpanded ? "Show 5 Tracks" : "Show Full Playlist";
  }

  function renderPage(options = {}) {
    renderPlaylistPanel();
    renderLibraryPanel({ allowLoad: options.allowLibraryLoad !== false });
    setEditorView(activeEditorView);
  }

  editorPlaylistSelector.addEventListener("change", (event) => {
    currentPlaylistId = event.target.value;
    playlistExpanded = false;
    PlaylistStore.savePlayerState({
      playlistId: currentPlaylistId,
      songIndex: 0,
      playbackState: "paused"
    });
    setMessage("");
    renderPage();
  });

  playlistViewButton?.addEventListener("click", () => {
    setEditorView("playlists", { render: true });
  });
  combinePlaylistsButton?.addEventListener("click", combineSelectedPlaylists);
  cancelCombinePlaylistsButton?.addEventListener("click", cancelCombinePlaylists);
  playAllPlaylistsButton?.addEventListener("click", playAllPlaylists);

  libraryViewButton?.addEventListener("click", () => {
    setEditorView("library", { render: true });
  });

  createPlaylistButton.addEventListener("click", async () => {
    const name = await promptForPlaylistName(`Custom Playlist ${PlaylistStore.getCustomPlaylists().length + 1}`);
    if (!name) {
      return;
    }

    const playlistId = PlaylistStore.createCustomPlaylist(name);
    currentPlaylistId = playlistId;
    setMessage(`Created "${name}".`);
    renderPage();
  });

  importPlaylistButton?.addEventListener("click", () => {
    openImportPlaylistPanel();
  });

  exportPlaylistButton?.addEventListener("click", () => {
    exportCurrentPlaylist();
  });

  deletePlaylistButton?.addEventListener("click", () => {
    openDeletePlaylistPanel();
  });

  importPlaylistApplyButton?.addEventListener("click", () => {
    try {
      importPlaylistFromJsText(importPlaylistText?.value || "");
      closeImportPlaylistPanel({ clear: true });
    } catch (error) {
      setMessage(error.message || "Unable to import playlist.");
    }
  });

  importPlaylistMergeButton?.addEventListener("click", () => {
    try {
      mergePlaylistFromJsText(importPlaylistText?.value || "");
      closeImportPlaylistPanel({ clear: true });
    } catch (error) {
      setMessage(error.message || "Unable to merge playlist.");
    }
  });

  importPlaylistCancelButton?.addEventListener("click", () => {
    closeImportPlaylistPanel();
  });

  deletePlaylistApplyButton?.addEventListener("click", () => {
    deleteSelectedPlaylist();
  });

  deletePlaylistCancelButton?.addEventListener("click", () => {
    closeDeletePlaylistPanel();
  });

  renamePlaylistButton.addEventListener("click", async () => {
    const playlist = getCurrentPlaylist();
    if (!playlist || playlist.kind !== "custom") {
      return;
    }

    const name = await window.ImpalaDialog.prompt({
      title: "Rename Playlist",
      message: "Rename this playlist:",
      defaultValue: playlist.name,
      confirmLabel: "Rename"
    });
    if (name === null) {
      return;
    }

    PlaylistStore.updateCustomPlaylist(playlist.id, (current) => ({
      ...current,
      name: name.trim() || current.name
    }));
    setMessage("Playlist renamed.");
    renderPage();
  });

  librarySearchInput?.addEventListener("input", (event) => {
    librarySearchTerm = normalizeSearchTerm(event.target.value);
    selectedArtistPrefix = "";
    selectedAlbumPrefix = "";
    previewEntries = [];
    trackEntries = [];

    if (librarySearchDebounceHandle) {
      clearTimeout(librarySearchDebounceHandle);
    }

    librarySearchDebounceHandle = setTimeout(() => {
      librarySearchDebounceHandle = null;
      loadCurrentLevel({ force: Boolean(librarySearchTerm) });
    }, LIBRARY_SEARCH_DEBOUNCE_MS);
  });

  libraryModeAudioButton?.addEventListener("click", () => {
    setLibraryBrowseMode("audio");
  });

  libraryModeVideoButton?.addEventListener("click", () => {
    setLibraryBrowseMode("video");
  });

  libraryCurrentList?.addEventListener("wheel", handleHorizontalLibraryWheel, { passive: false });
  libraryCurrentList?.addEventListener("scroll", updateArtistScrollRail, { passive: true });
  libraryArtistScrollbar?.addEventListener("pointerdown", beginArtistScrollbarDrag);
  libraryArtistScrollbar?.addEventListener("pointermove", dragArtistScrollbar);
  libraryArtistScrollbar?.addEventListener("pointerup", endArtistScrollbarDrag);
  libraryArtistScrollbar?.addEventListener("pointercancel", endArtistScrollbarDrag);
  window.addEventListener("resize", updateArtistScrollRail);

  selectedTracksAddButton?.addEventListener("click", () => {
    addSelectedTracksToExistingPlaylist();
  });

  selectedTracksNewButton?.addEventListener("click", () => {
    addSelectedTracksToNewPlaylist();
  });

  selectedTracksClearButton?.addEventListener("click", () => {
    clearTrackSelections();
    renderPage();
    setMessage("Cleared selected tracks.");
  });

  playlistExpandButton?.addEventListener("click", () => {
    playlistExpanded = !playlistExpanded;
    renderPage();
  });

  rebuildAudioIndexButton?.addEventListener("click", () => {
    requestIndexRebuild("audio");
  });

  rebuildVideoIndexButton?.addEventListener("click", () => {
    requestIndexRebuild("video");
  });

  renderPage();
  authNotice?.watch?.({
    targetSelector: ".titles-row",
    needsPrivateAccess: true
  });
  initializeRebuildControl();
});
