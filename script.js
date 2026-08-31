document.addEventListener("DOMContentLoaded", () => {
  const audioPlayer = document.getElementById("audioPlayer");
  const videoPlayer = document.getElementById("videoPlayer");
  videoPlayer?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  const videoScreen = document.getElementById("video-screen");
  const videoResumeButton = document.getElementById("video-resume-btn");
  const resumeImpalaButton = document.getElementById("resume-impala-btn");
  const voiceSyncPanel = document.getElementById("voice-sync-panel");
  const voiceSyncEarlierButton = document.getElementById("voice-sync-earlier-btn");
  const voiceSyncLaterButton = document.getElementById("voice-sync-later-btn");
  const voiceSyncResetButton = document.getElementById("voice-sync-reset-btn");
  const voiceSyncSaveButton = document.getElementById("voice-sync-save-btn");
  const voiceSyncCorrectedButton = document.getElementById("voice-sync-corrected-btn");
  const mkvBulkStatus = document.getElementById("mkv-bulk-status");
  const mkvBulkStatusText = document.getElementById("mkv-bulk-status-text");
  const mkvBulkStopButton = document.getElementById("mkv-bulk-stop-btn");
  const voiceSyncValue = document.getElementById("voice-sync-value");
  const statusDisplay = document.getElementById("status");
  const mediaSourceBadge = document.getElementById("media-source-badge");
  const currentSongDisplay = document.getElementById("current-song");
  const playlistSelector = document.getElementById("playlist-selector");
  const playlistDisplay = document.getElementById("playlist");
  const trackList = document.getElementById("track-list");
  const trackCount = document.getElementById("track-count");
  const trackFilterInput = document.getElementById("track-filter-input");
  const scrollPlayingButton = document.getElementById("scroll-playing-btn");
  const playerStarredCount = document.getElementById("player-starred-count");
  const playerAddStarredButton = document.getElementById("player-add-starred-btn");
  const playerNewStarredButton = document.getElementById("player-new-starred-btn");
  const playerManageStarredButton = document.getElementById("player-manage-starred-btn");
  const playerClearStarredButton = document.getElementById("player-clear-starred-btn");
  const mobileCurrentStarButton = document.getElementById("mobile-current-star-btn");
  const mobileStarredCount = document.getElementById("mobile-starred-count");
  const mobileAddStarredButton = document.getElementById("mobile-add-starred-btn");
  const mobileNewStarredButton = document.getElementById("mobile-new-starred-btn");
  const transportButtons = document.querySelectorAll("[data-action]");
  const repeatModeButton = document.getElementById("repeat-mode-btn");
  const randomModeButton = document.querySelector('[data-action="random"]');
  const lcdShuffleIndicator = document.getElementById("lcd-shuffle-indicator");
  const lcdRepeatIndicator = document.getElementById("lcd-repeat-indicator");
  const cardTitle = document.getElementById("card-title");
  const cardSubtitle = document.querySelector(".card-subtitle");
  const asideText = document.querySelector(".player-aside-text");
  const authPanel = document.getElementById("auth-panel");
  const authStatus = document.getElementById("auth-status");
  const authForm = document.getElementById("auth-form");
  const authUsername = document.getElementById("auth-username");
  const authPassword = document.getElementById("auth-password");
  const authLogoutButton = document.getElementById("auth-logout-btn");
  const accountLink = document.getElementById("account-link");
  const aboutTitle = document.getElementById("impala-title");
  const editionName = document.getElementById("impala-edition-name");
  const compactLibraryName = document.getElementById("compact-library-name");
  const heroMeta = document.querySelector(".hero-meta");
  const heroActions = document.querySelector(".hero-actions");
  const playerFooterLinks = document.querySelector(".userGuideLink");
  const aboutLink = document.getElementById("about-link");
  const aboutDialog = document.getElementById("about-dialog");
  const aboutCloseButton = document.getElementById("about-close");
  const aboutPromoDialog = document.getElementById("about-promo-dialog");
  const aboutPromoCloseButton = document.getElementById("about-promo-close");
  const aboutPromoFrameHost = document.getElementById("about-promo-frame-host");

  const playerConfig = window.KW_PLAYER_CONFIG || {};
  const forceSignerContentType = Boolean(playerConfig.forceSignerContentType);
  const storagePrefix = window.ImpalaConfig?.getStoragePrefix?.()
    || playerConfig.playlistStoragePrefix
    || "impalaStreamer";
  const mediaResolver = window.MediaResolver;
  const playerEngine = window.PlayerEngine;
  const playbackTransitionController = window.ImpalaAudioEngine?.createPlaybackTransitionController?.() || null;
  const authSessionApi = window.AuthSession;
  const apiClient = window.ImpalaApiClient;
  const liveStreamClient = window.LiveStreamClient;
  const preferencesApi = window.UiPreferences;
  const hlsAdapter = window.ImpalaHlsAdapter;
  const trackSelectionStore = window.TrackSelectionStore;
  const playerStateStore = window.PlayerStateStore;
  const uiEvents = window.ImpalaUiEvents;
  const boot = window.ImpalaBoot;
  const playerView = window.ImpalaPlayerView?.create?.({
    document,
    elements: {
      audioPlayer,
      videoScreen,
      repeatModeButton,
      randomModeButton,
      lcdRepeatIndicator,
      lcdShuffleIndicator,
      mediaSourceBadge,
      statusDisplay,
      currentSongDisplay,
      playlistDisplay,
      asideText,
      cardTitle,
      cardSubtitle,
      compactLibraryName
    }
  });
  const authNotice = window.ImpalaAuthNotice;
  const RESUME_THRESHOLD_SECONDS = 12;
  const FINISHED_THRESHOLD_SECONDS = 20;
  const ERROR_RETRY_LIMIT = 2;
  const RANDOM_HISTORY_LIMIT = 100;
  const playerRuntimeState = window.ImpalaPlayerState?.create?.({
    store: playerStateStore,
    randomHistoryLimit: RANDOM_HISTORY_LIMIT
  });

  if (!mediaResolver) {
    console.error("MediaResolver module is missing.");
    return;
  }

  if (!playerEngine) {
    console.error("PlayerEngine module is missing.");
    return;
  }

  if (!playerView || !playerRuntimeState || !uiEvents || !boot) {
    console.error("Player view, runtime state, UI events, or boot module is missing.");
    return;
  }

  let playlistRegistry = [];
  let currentPlaylist = null;
  let currentSongIndex = 0;
  let trackFilterTerm = "";
  let playbackIntent = "paused";
  let activeObjectKey = "";
  let activeMediaKind = "audio";
  let authSession = authSessionApi.load();
  let playerToastTimer = null;
  let errorRetryCount = 0;
  let restoringPosition = false;
  let activeMediaSource = "unknown";
  let activeMediaUrl = "";
  let lastPlayerError = "";
  let mediaLoadStartedAt = 0;
  let activeMediaDebug = {};
  let ambientIdentityController = null;
  let mediaSessionController = null;
  const localLibraryController = window.ImpalaLocalLibrary?.create?.({
    mediaResolver,
    playerStateStore,
    config: window.ImpalaConfig,
    dialog: window.ImpalaDialog,
    sessionStorage,
    elements: {
      videoPlayer,
      voiceSyncPanel,
      voiceSyncEarlierButton,
      voiceSyncLaterButton,
      voiceSyncResetButton,
      voiceSyncSaveButton,
      voiceSyncCorrectedButton,
      voiceSyncValue,
      mkvBulkStatus,
      mkvBulkStatusText,
      mkvBulkStopButton
    },
    getCurrentSong: () => currentPlaylist?.songs?.[currentSongIndex] || null,
    getMediaInfo,
    getActiveMediaKind: () => activeMediaKind,
    playCurrentSong: (autoPlay, options) => playSong(currentSongIndex, autoPlay, options),
    updateDisplayText,
    showToast: showPlayerToast
  });

  if (!localLibraryController) {
    console.error("Local library module is missing.");
    return;
  }

  const cloudLibraryController = window.ImpalaCloudLibrary?.create?.({
    request: apiRequest,
    getApiBaseUrl,
    forceSignerContentType
  });

  if (!cloudLibraryController) {
    console.error("Cloud library module is missing.");
    return;
  }

  const livePlaybackController = window.ImpalaLivePlayback?.create?.({
    client: liveStreamClient,
    preferences: preferencesApi,
    hlsAdapter,
    videoPlayer,
    callbacks: {
      onSessionLoaded(session, autoPlay) {
        snapshotCurrentVideoPosition();
        mediaSessionController?.refreshMetadata();
        activeObjectKey = `live:${session.sessionId || session.streamUrl}`;
        lastPlayerError = "";
        errorRetryCount = 0;
        mediaLoadStartedAt = performance.now();
        activeMediaSource = "live";
        activeMediaUrl = session.streamUrl;
        activeMediaDebug = {
          resolvedPath: session.streamUrl,
          extension: "m3u8",
          mime: "application/vnd.apple.mpegurl",
          source: "live",
          loadTimeMs: null,
          detectionPath: "live stream session"
        };
        setMediaMode("video");
        clearAllMediaSources();
        updateDisplayText(autoPlay ? "Loading" : "Live Ready");
        publishDiagnostics();
      },
      onInactive() { updateDisplayText("Paused"); },
      onStatus: updateDisplayText,
      onPlaybackError(error) { updateAuthUi(getFriendlyPlaybackMessage(error)); }
    }
  });

  if (!livePlaybackController) {
    console.error("Live playback module is missing.");
    return;
  }

  const collaborationController = window.ImpalaCollaboration?.create?.({
    videoElement: videoPlayer,
    syncControllerApi: window.SyncPlayController,
    coastControllerApi: window.CoastController,
    callbacks: {
      getCurrentSong: () => currentPlaylist?.songs?.[currentSongIndex] || null,
      getMediaInfo,
      getSongIdentity,
      isLivePlaybackActive,
      refreshPlaylists() {
        refreshRegistry();
        return playlistRegistry;
      },
      setPlaylists(playlists) { playlistRegistry = playlists; },
      selectPlaylist(playlistId, songIndex) { setCurrentPlaylist(playlistId, { songIndex }); },
      playSong(songIndex, positionSeconds) {
        return playSong(songIndex, false, { resumePosition: positionSeconds });
      }
    }
  });

  if (!collaborationController) {
    console.error("Collaboration module is missing.");
    return;
  }

  function getApiBaseUrl() {
    return apiClient?.getApiBaseUrl?.()
      || window.ImpalaConfig?.getCloudApiBaseUrl?.()
      || String(playerConfig.apiBaseUrl || "").replace(/\/+$/, "");
  }

  function getDiagnosticSource(song) {
    if (song?.source === "local-library" || currentPlaylist?.kind === "local") return "local-library";
    if (currentPlaylist?.kind === "custom") return "custom";
    return "built-in";
  }

  function publishDiagnostics() {
    if (!window.DiagnosticStore) return;

    const builtInCount = PlaylistStore.getBuiltInPlaylists().length;
    const customCount = PlaylistStore.getCustomPlaylists().length;
    const localCount = playlistRegistry.filter((playlist) => playlist.kind === "local").length;
    window.DiagnosticStore.publish({
      player: {
        playlistId: currentPlaylist?.id || "",
        songIndex: currentSongIndex,
        playbackState: playbackIntent,
        repeatMode: playerRuntimeState.getRepeatMode(),
        lastError: lastPlayerError
      },
      registry: {
        builtInCount,
        customCount,
        localCount,
        activeMode: localCount ? "local" : "built-in"
      },
      media: activeMediaDebug
    });
  }

  function updateAboutSystemInfo() {
    const browser = document.getElementById("about-browser");
    const platform = document.getElementById("about-platform");
    const connection = document.getElementById("about-connection");
    const mediaSource = document.getElementById("about-media-source");
    const version = document.getElementById("about-version");
    const connectionInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (version) {
      const appVersion = playerConfig.appVersion || "1.2.0";
      const appBuildDate = playerConfig.appBuildDate || "unknown";
      version.textContent = `v${appVersion} · Build ${appBuildDate}`;
    }
    if (browser) browser.textContent = navigator.userAgent || "Unknown";
    if (platform) platform.textContent = navigator.platform || "Unknown";
    if (connection) connection.textContent = connectionInfo?.effectiveType || "Unknown";
    if (mediaSource) mediaSource.textContent = activeMediaSource === "cloud" || activeMediaSource === "local"
      ? activeMediaSource
      : "Unknown";
  }

  function openAboutDialog() {
    if (!aboutDialog) return;
    ambientIdentityController?.stop();
    updateAboutSystemInfo();
    aboutDialog.showModal();
  }

  function clearAboutPromo() {
    aboutPromoFrameHost?.replaceChildren();
  }

  function closeAboutPromo() {
    if (aboutPromoDialog?.open) {
      aboutPromoDialog.close();
      return;
    }
    clearAboutPromo();
  }

  function openAboutPromo() {
    if (!aboutPromoDialog || !aboutPromoFrameHost || aboutPromoDialog.open) {
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.src = "https://mega.nz/embed/eloSlIDT#6dsQyoDZVPyroKYRZ-9K1ATKp7enhixE7pAAH0_oBDM!1a";
    iframe.title = "Valued artifact from our history.";
    iframe.allow = "autoplay; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "no-referrer";
    aboutPromoFrameHost.replaceChildren(iframe);
    aboutPromoDialog.showModal();
  }

  function getMediaElementForKind(kind) {
    if (kind === "video") {
      return videoPlayer || audioPlayer;
    }

    return audioPlayer || videoPlayer;
  }

  function getActiveMediaElement() {
    return getMediaElementForKind(activeMediaKind);
  }

  function getPrimaryPlaybackElement(mediaInfo) {
    if (mediaInfo.mediaKind === "video") {
      return videoPlayer || audioPlayer;
    }

    return audioPlayer || videoPlayer;
  }

  function getFallbackPlaybackElement(primaryElement) {
    if (!primaryElement) {
      return null;
    }

    if (primaryElement === videoPlayer) {
      return audioPlayer || null;
    }

    if (primaryElement === audioPlayer) {
      return videoPlayer || null;
    }

    return null;
  }

  function stopAndClearMediaElement(mediaElement) {
    if (!mediaElement) {
      return;
    }

    mediaElement.pause();
    hlsAdapter?.destroy?.(mediaElement);
    mediaElement.removeAttribute("src");
    mediaElement.load();
  }

  function pauseMediaElement(mediaElement) {
    if (!mediaElement) {
      return;
    }

    mediaElement.pause();
  }

  function stopAllMediaPlayback() {
    pauseMediaElement(audioPlayer);
    pauseMediaElement(videoPlayer);
  }

  function clearAllMediaSources() {
    stopAndClearMediaElement(audioPlayer);
    stopAndClearMediaElement(videoPlayer);
  }

  function isLivePlaybackActive() {
    return livePlaybackController.isActive();
  }

  function enforceExclusivePlayback(activeElement) {
    if (activeElement === videoPlayer) {
      pauseMediaElement(audioPlayer);
      return;
    }

    if (activeElement === audioPlayer) {
      pauseMediaElement(videoPlayer);
    }
  }

  function setMediaMode(kind) {
    activeMediaKind = playerView.setMediaMode(kind);
    updateVideoResumeButton();
    localLibraryController.updateVoiceSyncUi();
  }

  if (!playerView) {
    console.error("ImpalaPlayerView module is missing.");
    return;
  }

  function getSystemMediaMetadata() {
    if (isLivePlaybackActive()) {
      const currentLiveSession = livePlaybackController.getSession();
      return {
        title: currentLiveSession?.title || "Live Stream",
        artist: "Impala Live",
        album: "Live Stream",
        artworkUrl: "assets/ddMusic.ico"
      };
    }
    const song = currentPlaylist?.songs?.[currentSongIndex];
    if (!song) return null;
    return {
      title: song.title || song.name,
      artist: song.artist || "Unknown artist",
      album: song.album || currentPlaylist?.name || "Impala Streamer",
      artworkUrl: "assets/ddMusic.ico"
    };
  }

  function updateRepeatModeUi() {
    playerView.renderRepeatMode(playerRuntimeState.getRepeatMode());
  }

  function cycleRepeatMode() {
    playerRuntimeState.cycleRepeatMode();
    updateRepeatModeUi();
    publishDiagnostics();
    showPlayerToast(repeatModeButton?.textContent || "Repeat mode updated.");
  }

  function updateRandomModeUi() {
    playerView.renderRandomMode(playerRuntimeState.getRandomMode());
  }

  function toggleRandomMode() {
    const nextMode = playerRuntimeState.toggleRandomMode(currentSongIndex);
    updateRandomModeUi();
    publishDiagnostics();

    if (nextMode) {
      showPlayerToast("Shuffle on · starts after this track.");
      return;
    }

    showPlayerToast("Shuffle off.");
  }

  function playRandomHistoryNext() {
    const totalSongs = currentPlaylist?.songs?.length || 0;
    if (!totalSongs) {
      getActiveMediaElement().pause();
      updateDisplayText("No songs available");
      persistPlayerState("paused");
      return;
    }

    const randomIndex = playerRuntimeState.getRandomNextIndex(totalSongs, currentSongIndex);
    if (randomIndex < 0) {
      return;
    }

    playSong(randomIndex, true);
  }

  function saveAuthSession(session) {
    authSession = authSessionApi.save(session);
  }

  function updateAuthUi(message) {
    const usesPrivateApi = Boolean(getApiBaseUrl());
    const isLoggedIn = Boolean(authSession && authSession.token);
    authNotice?.render?.({
      targetSelector: ".hero-meta",
      needsPrivateAccess: usesPrivateApi && !isLoggedIn
    });

    if (accountLink) {
      accountLink.textContent = isLoggedIn ? "Current User" : "Sign In";
      accountLink.classList.toggle("is-authorized", isLoggedIn);
      accountLink.title = isLoggedIn
        ? `Signed in as ${authSession.displayName || authSession.username}`
        : "Sign in for private playback";
    }

    if (!authPanel || !authStatus || !authForm || !authLogoutButton) {
      if (message) showPlayerToast(message);
      return;
    }

    authPanel.hidden = (!usesPrivateApi && !message) || (usesPrivateApi && isLoggedIn && !message);

    if (message) {
      authStatus.textContent = message;
    } else if (!usesPrivateApi) {
      authStatus.textContent = "Private MEGA playback requires a configured signer API.";
    } else if (isLoggedIn) {
      authStatus.textContent = `Authorized for ${authSession.displayName || authSession.username}.`;
    } else {
      authStatus.textContent = "Private library access requires sign-in.";
    }

    authForm.hidden = !usesPrivateApi || isLoggedIn;
    authLogoutButton.hidden = !usesPrivateApi || !isLoggedIn;
  }

  async function apiRequest(path, options = {}) {
    try {
      return await apiClient.request(path, options);
    } finally {
      authSession = authSessionApi.load();
    }
  }

  async function login(username, password) {
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    saveAuthSession(payload);
    updateAuthUi();
  }

  function logout() {
    saveAuthSession(null);
    PlaylistStore.clearTransientTrackSelections();
    updateAuthUi("Authorized playback disabled.");
    renderTrackList();
  }

  function getMediaPath(song) {
    return mediaResolver.getMediaPath(song);
  }

  function getSongIdentity(song) {
    return trackSelectionStore.getSongIdentity(song);
  }

  function clearTrackSelections() {
    trackSelectionStore.clear();
  }

  function isTrackSelected(playlistId, song, songIndex) {
    return trackSelectionStore.isSelected(playlistId, song, songIndex);
  }

  function toggleTrackSelection(playlistId, song, songIndex) {
    trackSelectionStore.toggle(playlistId, song, songIndex);
  }

  function getSelectedSongCount(playlist) {
    return trackSelectionStore.countSelected(playlist);
  }

  function getSelectedSongsFromCurrentPlaylist() {
    return trackSelectionStore.getSelectedSongs(currentPlaylist);
  }

  function getPlayerToastElement() {
    let element = document.getElementById("player-toast");
    if (element) {
      return element;
    }

    element = document.createElement("div");
    element.id = "player-toast";
    element.className = "player-toast";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    document.body.appendChild(element);
    return element;
  }

  function showPlayerToast(message) {
    const toast = getPlayerToastElement();
    toast.textContent = message;
    toast.classList.add("is-visible");

    if (playerToastTimer) {
      window.clearTimeout(playerToastTimer);
    }

    playerToastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2200);
  }

  function appendSongsToCustomPlaylist(playlistId, songs) {
    let addedCount = 0;
    let duplicateCount = 0;

    PlaylistStore.updateCustomPlaylist(playlistId, (playlist) => {
      const existingKeys = new Set(playlist.songs.map((song) => getSongIdentity(song)).filter(Boolean));
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
        ...playlist,
        songs: [...playlist.songs, ...songsToAdd]
      };
    });

    return { addedCount, duplicateCount };
  }

  function buildImportMessage(label, playlistName, addedCount, duplicateCount) {
    if (!addedCount && duplicateCount) {
      return `${label} already exists in ${playlistName}.`;
    }

    const duplicateSuffix = duplicateCount
      ? ` Skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}.`
      : "";
    return `Added ${addedCount} track${addedCount === 1 ? "" : "s"} from ${label} to ${playlistName}.${duplicateSuffix}`;
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

  async function addStarredToExistingPlaylist() {
    const selectedSongs = getSelectedSongsFromCurrentPlaylist();
    if (!selectedSongs.length) {
      showPlayerToast("Star tracks first.");
      return;
    }

    const customPlaylists = PlaylistStore.getCustomPlaylists();
    if (!customPlaylists.length) {
      showPlayerToast("Create a custom playlist first.");
      return;
    }

    const choices = customPlaylists.map((playlist, index) => `${index + 1}. ${playlist.name}`).join("\n");
    const defaultName = customPlaylists[0].name;
    const input = await window.ImpalaDialog.prompt({
      title: "Add Starred Tracks",
      message: `Add starred tracks to which playlist?\n\n${choices}\n\nType a number or exact playlist name:`,
      defaultValue: defaultName,
      confirmLabel: "Add"
    });

    if (input === null) {
      return;
    }

    const targetPlaylist = resolveExistingPlaylistChoice(customPlaylists, input);
    if (!targetPlaylist) {
      showPlayerToast("Playlist not found.");
      return;
    }

    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(targetPlaylist.id, selectedSongs);
    clearTrackSelections();
    refreshRegistry();
    currentPlaylist = getPlaylistById(currentPlaylist?.id || "") || currentPlaylist;
    renderTrackList();
    showPlayerToast(buildImportMessage("starred tracks", targetPlaylist.name, addedCount, duplicateCount));
  }

  async function createPlaylistFromStarred() {
    const selectedSongs = getSelectedSongsFromCurrentPlaylist();
    if (!selectedSongs.length) {
      showPlayerToast("Star tracks first.");
      return;
    }

    const defaultName = currentPlaylist ? `${currentPlaylist.name} Starred` : "Starred Tracks";
    const playlistNameInput = await window.ImpalaDialog.prompt({
      title: "New Playlist",
      message: "Name the new playlist:",
      defaultValue: defaultName,
      confirmLabel: "Create"
    });
    if (playlistNameInput === null) {
      return;
    }

    const playlistName = playlistNameInput.trim() || defaultName;
    const playlistId = PlaylistStore.createCustomPlaylist(playlistName);
    const { addedCount, duplicateCount } = appendSongsToCustomPlaylist(playlistId, selectedSongs);
    clearTrackSelections();
    refreshRegistry();
    setCurrentPlaylist(playlistId, { songIndex: 0, playbackState: "paused" });
    showPlayerToast(buildImportMessage("starred tracks", playlistName, addedCount, duplicateCount));
  }

  function canUseGlobalHotkeys(event) {
    if (event.defaultPrevented || event.repeat) {
      return false;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return true;
    }

    if (target.closest("input, textarea, select, [contenteditable='true']")) {
      return false;
    }

    return true;
  }

  function toggleCurrentTrackStar() {
    if (!currentPlaylist || !currentPlaylist.songs[currentSongIndex]) {
      return;
    }

    const song = currentPlaylist.songs[currentSongIndex];
    const nextIsSelected = !isTrackSelected(currentPlaylist.id, song, currentSongIndex);
    toggleTrackSelection(currentPlaylist.id, song, currentSongIndex);
    renderTrackList();
    showPlayerToast(nextIsSelected ? "Starred current track." : "Removed star from current track.");
  }

  function handleGlobalHotkeys(event) {
    if (!canUseGlobalHotkeys(event)) {
      return;
    }

    const key = String(event.key || "").toLowerCase();

    switch (key) {
      case "s":
        event.preventDefault();
        toggleCurrentTrackStar();
        break;
      case "a":
        event.preventDefault();
        addStarredToExistingPlaylist();
        break;
      case "n":
        event.preventDefault();
        createPlaylistFromStarred();
        break;
      case "m":
        event.preventDefault();
        window.location.href = "songlist.html";
        break;
      case "c":
        event.preventDefault();
        clearTrackSelections();
        renderTrackList();
        showPlayerToast("Cleared starred tracks.");
        break;
      case "h":
      case "?":
        event.preventDefault();
        showPlayerToast("Hotkeys: S star current, A add starred, N new playlist, M manage starred, C clear starred.");
        break;
      default:
        break;
    }
  }

  function updatePlayerStarredUi() {
    const selectedCount = getSelectedSongCount(currentPlaylist);
    const hasSelection = selectedCount > 0;
    const currentSong = currentPlaylist?.songs?.[currentSongIndex] || null;
    const currentIsStarred = Boolean(
      currentSong && isTrackSelected(currentPlaylist.id, currentSong, currentSongIndex)
    );

    if (playerStarredCount) playerStarredCount.textContent = `${selectedCount} starred`;
    if (mobileStarredCount) mobileStarredCount.textContent = `${selectedCount} starred`;
    if (playerAddStarredButton) playerAddStarredButton.disabled = !hasSelection;
    if (playerNewStarredButton) playerNewStarredButton.disabled = !hasSelection;
    if (playerManageStarredButton) playerManageStarredButton.disabled = !hasSelection;
    if (playerClearStarredButton) playerClearStarredButton.disabled = !hasSelection;
    if (mobileAddStarredButton) mobileAddStarredButton.disabled = !hasSelection;
    if (mobileNewStarredButton) mobileNewStarredButton.disabled = !hasSelection;

    if (mobileCurrentStarButton) {
      mobileCurrentStarButton.disabled = !currentSong;
      mobileCurrentStarButton.textContent = currentIsStarred ? "\u2605" : "\u2606";
      mobileCurrentStarButton.setAttribute("aria-pressed", String(currentIsStarred));
      mobileCurrentStarButton.setAttribute(
        "aria-label",
        currentIsStarred ? "Remove star from current track" : "Star current track"
      );
      mobileCurrentStarButton.title = currentIsStarred
        ? "Remove star from current track"
        : "Star current track";
    }
  }

  function getMediaInfo(song) {
    return mediaResolver.getMediaInfo(song);
  }

  function getSavedPlaybackPosition(song) {
    return playerStateStore.getSavedPlaybackPosition(song);
  }

  function savePlaybackPosition(song, positionSeconds, durationSeconds = 0) {
    playerStateStore.savePlaybackPosition(song, positionSeconds, durationSeconds, {
      resumeThresholdSeconds: RESUME_THRESHOLD_SECONDS,
      finishedThresholdSeconds: FINISHED_THRESHOLD_SECONDS
    });
  }

  function getCurrentVideoResumePosition() {
    const song = currentPlaylist?.songs?.[currentSongIndex];
    if (!song || getMediaInfo(song).mediaKind !== "video") {
      return 0;
    }

    return getSavedPlaybackPosition(song);
  }

  function snapshotCurrentVideoPosition() {
    const song = currentPlaylist?.songs?.[currentSongIndex];
    if (!song || !videoPlayer || getMediaInfo(song).mediaKind !== "video") {
      return;
    }

    savePlaybackPosition(song, videoPlayer.currentTime || 0, videoPlayer.duration || 0);
  }

  function updateVideoResumeButton() {
    if (!videoResumeButton) {
      return;
    }

    const position = getCurrentVideoResumePosition();
    const isVideoPlaying = activeMediaKind === "video"
      && Boolean(videoPlayer)
      && !videoPlayer.paused
      && !videoPlayer.ended;
    videoResumeButton.hidden = activeMediaKind !== "video"
      || position < RESUME_THRESHOLD_SECONDS
      || isVideoPlaying;
    if (!videoResumeButton.hidden) {
      const minutes = Math.floor(position / 60);
      const seconds = Math.floor(position % 60).toString().padStart(2, "0");
      videoResumeButton.textContent = `Resume ${minutes}:${seconds}`;
    }
  }

  function canPlaySong(song) {
    const mediaInfo = getMediaInfo(song);
    if (
      mediaResolver.isLocalServiceMkv?.(song, mediaInfo)
      && window.ImpalaConfig?.isMkvPlaybackEnabled?.() === true
    ) {
      return true;
    }

    const { mimeCandidates } = mediaInfo;
    const mediaElements = [videoPlayer, audioPlayer].filter(Boolean);

    if (!mediaElements.length) {
      return false;
    }

    if (!mimeCandidates.length) {
      return true;
    }

    return mediaElements.some((mediaElement) => (
      mimeCandidates.some((mimeType) => mediaElement.canPlayType(mimeType) !== "")
    ));
  }

  async function resolveMediaUrl(song) {
    const mediaInfo = getMediaInfo(song);
    const mediaPath = getMediaPath(song);
    const localMedia = await localLibraryController.resolveLocalMedia(song, mediaInfo, mediaPath);
    if (localMedia) return localMedia;
    return cloudLibraryController.resolveCloudMedia(song, mediaInfo);
  }

  function updateMediaSourceBadge(source = activeMediaSource) {
    const currentSong = currentPlaylist?.songs?.[currentSongIndex] || null;
    activeMediaSource = playerView.renderMediaSourceBadge({
      source,
      url: activeMediaUrl,
      isLocalService: isLocalServiceSong(currentSong)
    });
  }

  function refreshRegistry() {
    playlistRegistry = PlaylistStore.getPlaylistRegistry();
  }

  function getPlaylistById(playlistId) {
    return playlistRegistry.find((playlist) => playlist.id === playlistId) || null;
  }

  function isLocalServiceSong(song) {
    return song?.source === "local-service";
  }

  function isLocalServicePlaylist(playlist) {
    return Array.isArray(playlist?.songs) && playlist.songs.some(isLocalServiceSong);
  }

  function buildPlaylistSelector(selectedPlaylistId) {
    playlistSelector.innerHTML = "";

    playlistRegistry.forEach((playlist) => {
      const option = document.createElement("option");
      option.value = playlist.id;
      option.textContent = `${playlist.name}${isLocalServicePlaylist(playlist) ? " (Local)" : ""}`;
      if (isLocalServicePlaylist(playlist)) {
        option.title = "Local Library Companion playlist";
      }
      option.selected = playlist.id === selectedPlaylistId;
      playlistSelector.appendChild(option);
    });
  }

  function persistPlayerState(nextPlaybackState = playbackIntent) {
    if (!currentPlaylist) {
      return;
    }

    playbackIntent = nextPlaybackState === "playing" ? "playing" : "paused";
    PlaylistStore.savePlayerState({
      playlistId: currentPlaylist.id,
      songIndex: currentSongIndex,
      playbackState: playbackIntent
    });
    publishDiagnostics();
  }

  function updateDisplayText(status) {
    const song = currentPlaylist?.songs?.[currentSongIndex] || null;
    activeMediaSource = playerView.renderStatus({
      status,
      liveSession: isLivePlaybackActive() ? livePlaybackController.getSession() : null,
      playlist: currentPlaylist,
      song,
      isLocalServicePlaylist: isLocalServicePlaylist(currentPlaylist),
      isLocalServiceSong: isLocalServiceSong(song),
      mediaSource: activeMediaSource,
      mediaUrl: activeMediaUrl
    });
    document.dispatchEvent(new CustomEvent("impala:mediachange", {
      detail: { media: song, mediaKind: getMediaInfo(song)?.mediaKind }
    }));
    updatePlayerStarredUi();
  }

  if (editionName) {
    editionName.textContent = String(playerConfig.editionName || playerConfig.brandName || "Impala Streamer").trim();
  }

  const compactHeaderQuery = window.matchMedia?.("(max-width: 600px) and (orientation: portrait)");
  function placeAccountActionsForViewport() {
    if (!heroActions || !heroMeta || !playerFooterLinks || !compactLibraryName) return;
    if (compactHeaderQuery?.matches) {
      heroActions.classList.add("is-mobile-footer");
      playerFooterLinks.appendChild(heroActions);
      return;
    }
    heroActions.classList.remove("is-mobile-footer");
    heroMeta.insertBefore(heroActions, compactLibraryName);
  }
  placeAccountActionsForViewport();
  compactHeaderQuery?.addEventListener?.("change", placeAccountActionsForViewport);

  function updateHeroCopy() {
    playerView.renderHero({
      playlist: currentPlaylist,
      isLocalServicePlaylist: isLocalServicePlaylist(currentPlaylist)
    });
  }

  function renderTrackList() {
    if (!trackList || !trackCount) {
      return;
    }

    if (!currentPlaylist || !currentPlaylist.songs.length) {
      trackCount.textContent = "0 titles";
      trackList.innerHTML = `
        <div class="track-item track-item-empty">
          <div class="track-number">0</div>
          <div class="track-meta">
            <strong>No titles yet</strong>
            <span>Add titles in the editor to build this playlist.</span>
          </div>
        </div>
      `;
      updatePlayerStarredUi();
      return;
    }

    trackCount.textContent = `${currentPlaylist.songs.length} title${currentPlaylist.songs.length === 1 ? "" : "s"}`;
    trackList.innerHTML = "";

    const visibleSongs = currentPlaylist.songs
      .map((song, index) => ({ song, index }))
      .filter(({ song }) => trackMatchesFilter(song, trackFilterTerm));

    if (!visibleSongs.length) {
      const empty = document.createElement("div");
      empty.className = "track-item track-item-empty";
      empty.innerHTML = `
        <span class="track-number">0</span>
        <span class="track-meta">
          <strong>No matches</strong>
          <span>Try another first-letter filter.</span>
        </span>
      `;
      trackList.appendChild(empty);
      updatePlayerStarredUi();
      return;
    }

    visibleSongs.forEach(({ song, index }) => {
      const row = document.createElement("div");
      row.className = `track-item-row${isLocalServiceSong(song) ? " is-local-service" : ""}`;

      const item = document.createElement("button");
      item.type = "button";
      item.className = `track-item${index === currentSongIndex ? " is-active" : ""}${isLocalServiceSong(song) ? " is-local-service" : ""}`;
      const number = document.createElement("span");
      number.className = "track-number";
      number.textContent = String(index + 1);

      const meta = document.createElement("span");
      meta.className = "track-meta";

      const title = document.createElement("strong");
      title.textContent = song.name;

      const artist = document.createElement("span");
      artist.textContent = song.artist || "Unknown artist";

      if (isLocalServiceSong(song)) {
        const sourceBadge = document.createElement("span");
        sourceBadge.className = "track-source-pill";
        sourceBadge.textContent = "L";
        sourceBadge.title = "Local Library Companion";
        meta.appendChild(sourceBadge);
      }
      meta.appendChild(title);
      meta.appendChild(artist);
      item.appendChild(number);
      item.appendChild(meta);
      item.addEventListener("click", () => {
        playSong(index, true);
      });

      const starred = isTrackSelected(currentPlaylist.id, song, index);
      const starButton = document.createElement("button");
      starButton.type = "button";
      starButton.className = `track-star-btn${starred ? " is-selected" : ""}`;
      starButton.setAttribute("aria-pressed", starred ? "true" : "false");
      starButton.setAttribute("aria-label", starred ? "Remove star" : "Star track");
      starButton.setAttribute("title", starred ? "Remove star" : "Star track");
      starButton.textContent = starred ? "★" : "☆";
      starButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleTrackSelection(currentPlaylist.id, song, index);
        renderTrackList();
      });

      row.appendChild(item);
      row.appendChild(starButton);
      trackList.appendChild(row);
    });

    updatePlayerStarredUi();
  }

  function normalizeTrackFilter(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getTrackSearchTokens(value) {
    return String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function trackFieldMatches(value, term) {
    if (!term) return true;
    return getTrackSearchTokens(value).some((token) => token.startsWith(term));
  }

  function trackMatchesFilter(song, term) {
    if (!term) return true;
    return (
      trackFieldMatches(song?.name, term) ||
      trackFieldMatches(song?.artist, term) ||
      trackFieldMatches(song?.album, term)
    );
  }

  function scrollCurrentTrackIntoView() {
    if (!trackList || !currentPlaylist) return;
    if (trackFilterInput && trackFilterTerm) {
      trackFilterTerm = "";
      trackFilterInput.value = "";
      renderTrackList();
    }

    const active = trackList.querySelector(".track-item.is-active");
    active?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function setCurrentPlaylist(playlistId, options = {}) {
    const playlist = getPlaylistById(playlistId) || playlistRegistry[0] || null;

    currentPlaylist = playlist;
    currentSongIndex = options.songIndex || 0;

    if (currentPlaylist && currentSongIndex >= currentPlaylist.songs.length) {
      currentSongIndex = 0;
    }

    localLibraryController.updateVoiceSyncUi();

    buildPlaylistSelector(currentPlaylist ? currentPlaylist.id : "");
    updateHeroCopy();
    renderTrackList();
    updateDisplayText("Paused");
    persistPlayerState(options.playbackState || "paused");
  }

  function getFriendlyPlaybackMessage(error) {
    const rawMessage = String(error?.message || "").toLowerCase();
    if (error?.name === "AbortError" || rawMessage.includes("interrupted by a call to pause")) {
      return "click Play.";
    }

    return error?.message || "click Play.";
  }

  async function playSong(index, autoPlay = true, options = {}) {
    if (!currentPlaylist || !currentPlaylist.songs[index]) {
      return;
    }

    livePlaybackController.deactivate(false);
    snapshotCurrentVideoPosition();
    currentSongIndex = index;
    const song = currentPlaylist.songs[currentSongIndex];
    mediaSessionController?.refreshMetadata();
    localLibraryController.updateVoiceSyncUi();
    const songIdentity = getSongIdentity(song);
    activeObjectKey = songIdentity;
    lastPlayerError = "";
    mediaLoadStartedAt = performance.now();
    updateDisplayText("Loading");

    try {
      const mediaInfo = getMediaInfo(song);
      activeMediaDebug = {
        resolvedPath: "Resolving…",
        extension: mediaInfo.extension || "unknown",
        mime: String(song.contentType || "").trim() || mediaInfo.preferredMimeType || "unknown",
        source: getDiagnosticSource(song),
        loadTimeMs: null,
        detectionPath: `${mediaInfo.mediaKind} via ${mediaInfo.detectionPath}`
      };
      publishDiagnostics();
      if (mediaInfo.extension === "mkv" && song?.source !== "local-service") {
        throw new Error("Cloud MKV playback currently requires H.264/AAC compatibility support. This title remains available through the Local Library Companion.");
      }
      if (!canPlaySong(song)) {
        throw new Error(`This browser cannot play ${mediaInfo.extension ? mediaInfo.extension.toUpperCase() : "this"} media files.`);
      }

      const resolvedMedia = options.preparedMedia || await resolveMediaUrl(song);
      activeMediaSource = resolvedMedia.source;
      activeMediaUrl = resolvedMedia.url;
      activeMediaDebug.resolvedPath = resolvedMedia.url;
      activeMediaDebug.source = resolvedMedia.source;
      activeMediaDebug.loadTimeMs = Math.round(performance.now() - mediaLoadStartedAt);
      updateMediaSourceBadge(resolvedMedia.source);
      publishDiagnostics();
      setMediaMode(mediaInfo.mediaKind);

      let activeMediaElement = getPrimaryPlaybackElement(mediaInfo);
      const fallbackMediaElement = getFallbackPlaybackElement(activeMediaElement);
      clearAllMediaSources();

      activeMediaElement.pause();
      activeMediaElement.removeAttribute("src");
      activeMediaElement.src = resolvedMedia.url;
      activeMediaElement.load();

      const savedResumePosition = options.useSavedPosition ? getSavedPlaybackPosition(song) : 0;
      const resumePosition = Number(options.resumePosition || savedResumePosition || 0);
      if (resumePosition > 0) {
        restoringPosition = true;
        activeMediaElement.addEventListener("loadedmetadata", () => {
          try {
            activeMediaElement.currentTime = resumePosition;
          } catch (error) {
            console.error("Unable to restore playback position:", error);
          } finally {
            restoringPosition = false;
          }
        }, { once: true });
      } else {
        activeMediaElement.currentTime = 0;
      }

      if (autoPlay) {
        try {
          await activeMediaElement.play();
        } catch (primaryPlayError) {
          // Keep audio playback audio-only so the video surface does not appear for music.
          const allowFallback = false;
          if (!fallbackMediaElement || !allowFallback) {
            throw primaryPlayError;
          }

          fallbackMediaElement.pause();
          fallbackMediaElement.removeAttribute("src");
          fallbackMediaElement.src = resolvedMedia.url;
          fallbackMediaElement.load();
          if (resumePosition > 0) {
            fallbackMediaElement.addEventListener("loadedmetadata", () => {
              try {
                fallbackMediaElement.currentTime = resumePosition;
              } catch (error) {
                console.error("Unable to restore fallback playback position:", error);
              }
            }, { once: true });
          } else {
            fallbackMediaElement.currentTime = 0;
          }
          await fallbackMediaElement.play();
          activeMediaElement = fallbackMediaElement;
        }
      } else {
        updateDisplayText("Paused");
        persistPlayerState("paused");
      }

      setMediaMode(activeMediaElement === videoPlayer ? "video" : "audio");
      enforceExclusivePlayback(activeMediaElement);
      errorRetryCount = 0;

      renderTrackList();
      prepareUpcomingTrack();
    } catch (error) {
      console.error("Error playing song:", error);
      lastPlayerError = getFriendlyPlaybackMessage(error);
      activeMediaDebug.loadTimeMs = Math.round(performance.now() - mediaLoadStartedAt);
      activeMediaSource = "unknown";
      activeMediaUrl = "";
      updateDisplayText("Playback Error");
      persistPlayerState("paused");
      updateAuthUi(getFriendlyPlaybackMessage(error));
      publishDiagnostics();
    }
  }

  function getUpcomingTrackDecision() {
    if (isLivePlaybackActive() || playerRuntimeState.getRandomMode()) {
      return null;
    }

    const decision = playerEngine.getNextTrackDecision({
      repeatMode: playerRuntimeState.getRepeatMode(),
      currentIndex: currentSongIndex,
      total: currentPlaylist?.songs?.length || 0
    });
    return decision.action === "next" || decision.action === "replay" ? decision : null;
  }

  function prepareUpcomingTrack() {
    if (!playbackTransitionController || activeMediaKind !== "audio") {
      return;
    }

    const decision = getUpcomingTrackDecision();
    const nextSong = decision ? currentPlaylist?.songs?.[decision.index] : null;
    if (!nextSong) {
      playbackTransitionController.clearPreparedTrack();
      return;
    }

    const key = getSongIdentity(nextSong);
    playbackTransitionController.prepareTrack(key, () => resolveMediaUrl(nextSong));
  }

  function playNextSong() {
    if (isLivePlaybackActive()) {
      updateDisplayText("Live");
      return;
    }

    if (playerRuntimeState.getRandomMode()) {
      return playRandomHistoryNext();
    }

    const decision = playerEngine.getNextTrackDecision({
      repeatMode: playerRuntimeState.getRepeatMode(),
      currentIndex: currentSongIndex,
      total: currentPlaylist?.songs?.length || 0
    });

    if (decision.action === "none") {
      getActiveMediaElement().pause();
      updateDisplayText("No songs available");
      persistPlayerState("paused");
      return;
    }

    if (decision.action === "finished") {
      getActiveMediaElement().pause();
      updateDisplayText("Finished");
      persistPlayerState("paused");
      return;
    }

    const nextSong = currentPlaylist?.songs?.[decision.index];
    const preparedMedia = nextSong
      ? playbackTransitionController?.takePreparedTrack(getSongIdentity(nextSong))
      : null;
    return playSong(decision.index, true, { preparedMedia });
  }

  function requestAutomaticNext(mediaElement) {
    const transitionKey = `${activeObjectKey}:${mediaElement?.duration || 0}`;
    if (!playbackTransitionController?.beginTransition(transitionKey)) {
      return;
    }

    Promise.resolve(playNextSong()).finally(() => {
      playbackTransitionController.finishTransition(transitionKey);
    });
  }

  function playPrevSong() {
    if (isLivePlaybackActive()) {
      updateDisplayText("Live");
      return;
    }

    if (playerRuntimeState.getRandomMode()) {
      const previousRandomIndex = playerRuntimeState.getPreviousRandomHistoryIndex();
      if (Number.isInteger(previousRandomIndex)) {
        playSong(previousRandomIndex, true);
        return;
      }
    }

    const decision = playerEngine.getPreviousTrackDecision({
      currentIndex: currentSongIndex,
      total: currentPlaylist?.songs?.length || 0
    });

    if (decision.action === "none") {
      getActiveMediaElement().pause();
      updateDisplayText("No songs available");
      persistPlayerState("paused");
      return;
    }

    playSong(decision.index, true);
  }

  function systemMediaControlAllowed(action) {
    const decision = collaborationController.authorize(action, "titles");
    if (!decision.allowed) showPlayerToast(decision.message);
    return decision.allowed;
  }

  function handleSystemMediaPlay() {
    if (!systemMediaControlAllowed("play")) return;
    if (isLivePlaybackActive()) return livePlaybackController.startPlayback();
    const song = currentPlaylist?.songs?.[currentSongIndex];
    if (!song) return;
    const active = getActiveMediaElement();
    if (!active || activeObjectKey !== getSongIdentity(song)) {
      return playSong(currentSongIndex, true, { useSavedPosition: true });
    }
    return active.play();
  }

  function handleSystemMediaPause() {
    if (!systemMediaControlAllowed("pause")) return;
    stopAllMediaPlayback();
  }

  mediaSessionController = window.ImpalaMediaSession?.create?.({
    resumeButton: resumeImpalaButton,
    getMetadata: getSystemMediaMetadata,
    getActiveMediaElement,
    onResumeNeeded() {
      showPlayerToast("A call or another audio app interrupted Impala. Tap Resume Impala to continue.");
    },
    onPlay: handleSystemMediaPlay,
    onPause: handleSystemMediaPause,
    onPrevious() {
      if (systemMediaControlAllowed("previous")) return playPrevSong();
    },
    onNext() {
      if (systemMediaControlAllowed("next")) return playNextSong();
    }
  }) || null;

  function handlePlaylistChange(playlistId) {
    refreshRegistry();
    setCurrentPlaylist(playlistId);
    playerRuntimeState.resetRandomHistory(currentSongIndex);
    playSong(currentSongIndex, false);
  }

  function clearStarredTracks() {
    clearTrackSelections();
    renderTrackList();
  }

  function filterTracks(value) {
    trackFilterTerm = normalizeTrackFilter(value);
    renderTrackList();
  }

  function resumeCurrentVideo() {
    const position = getCurrentVideoResumePosition();
    if (position >= RESUME_THRESHOLD_SECONDS) {
      playSong(currentSongIndex, true, { resumePosition: position });
    }
  }

  localLibraryController.bindControls();

  function handleTransportAction(action) {
    const collaborationDecision = collaborationController.authorize(action, "videos");
    if (!collaborationDecision.allowed) {
      showPlayerToast(collaborationDecision.message);
      return;
    }

    switch (action) {
      case "prev":
        playPrevSong();
        break;

      case "toggle":
        if (isLivePlaybackActive()) {
          const active = getActiveMediaElement();
          if (active && !active.paused) {
            stopAllMediaPlayback();
          } else if (active) {
            livePlaybackController.startPlayback();
          }
          break;
        }

        if (!currentPlaylist || !currentPlaylist.songs.length) return;

        const active = getActiveMediaElement();

        if (active && !active.paused) {
          // currently playing → pause
          stopAllMediaPlayback();
        } else {
          // currently paused → play
          if (activeObjectKey !== getSongIdentity(currentPlaylist.songs[currentSongIndex])) {
            playSong(currentSongIndex, true);
          } else {
            active.play().catch((error) => {
              console.error("Error playing song:", error);
              updateAuthUi(getFriendlyPlaybackMessage(error));
            });
          }
        }
        break;

      case "next":
        playNextSong();
        break;

      case "repeat":
        cycleRepeatMode();
        break;

      case "random":
        toggleRandomMode();
        break;

      default:
        break;
    }
  }


  async function handleAuthSubmit({ username, password }) {
    if (!username || !password) {
      updateAuthUi("Enter both username and password.");
      return;
    }

    updateAuthUi("Signing in...");

    try {
      await login(username, password);
      authPassword.value = "";
    } catch (error) {
      console.error("Unable to sign in:", error);
      updateAuthUi(error.message);
    }
  }

  uiEvents.bind({
    document,
    elements: {
      playlistSelector,
      playerAddStarredButton,
      playerNewStarredButton,
      playerManageStarredButton,
      playerClearStarredButton,
      mobileCurrentStarButton,
      mobileAddStarredButton,
      mobileNewStarredButton,
      trackFilterInput,
      scrollPlayingButton,
      videoResumeButton,
      transportButtons,
      authForm,
      authUsername,
      authPassword,
      authLogoutButton,
      aboutTitle,
      aboutLink,
      aboutCloseButton,
      aboutDialog,
      aboutPromoCloseButton,
      aboutPromoDialog
    },
    actions: {
      onPlaylistChange: handlePlaylistChange,
      onAddStarred: addStarredToExistingPlaylist,
      onNewStarred: createPlaylistFromStarred,
      onManageStarred() { window.location.href = "songlist.html"; },
      onClearStarred: clearStarredTracks,
      onToggleCurrentStar: toggleCurrentTrackStar,
      onTrackFilter: filterTracks,
      onScrollPlaying: scrollCurrentTrackIntoView,
      onVideoResume: resumeCurrentVideo,
      onTransport: handleTransportAction,
      onAuthSubmit: handleAuthSubmit,
      onLogout: logout,
      onOpenAbout: openAboutDialog,
      onCloseAbout() { aboutDialog?.close(); },
      onAboutClosed: closeAboutPromo,
      onClosePromo: closeAboutPromo,
      onPromoClosed: clearAboutPromo,
      onGlobalKeydown: handleGlobalHotkeys,
      onOpenPromo: openAboutPromo
    }
  });
  ambientIdentityController = window.AmbientIdentity?.init({
    titleElement: aboutTitle,
    aboutDialog,
    storagePrefix
  });


  function bindMediaEvents(mediaElement, label) {
    if (!mediaElement) {
      return;
    }

    mediaElement.addEventListener("ended", () => {
      if (isLivePlaybackActive()) {
        updateDisplayText("Live Ended");
        updateVideoResumeButton();
        return;
      }

      const currentSong = currentPlaylist?.songs?.[currentSongIndex];
      if (currentSong) {
        savePlaybackPosition(currentSong, 0, mediaElement.duration || 0);
      }
      updateVideoResumeButton();
      requestAutomaticNext(mediaElement);
    });

    mediaElement.addEventListener("play", () => {
      enforceExclusivePlayback(mediaElement);
      setMediaMode(mediaElement === videoPlayer ? "video" : "audio");
      updateDisplayText("Playing");
      mediaSessionController?.setPlaybackState("playing");
      if (isLivePlaybackActive()) {
        updateVideoResumeButton();
        return;
      }
      persistPlayerState("playing");
      updateVideoResumeButton();
    });

    mediaElement.addEventListener("loadedmetadata", () => {
      if (mediaElement !== getActiveMediaElement()) return;
      activeMediaDebug.loadTimeMs = Math.round(performance.now() - mediaLoadStartedAt);
      publishDiagnostics();
      mediaSessionController?.setPositionState(mediaElement);
    });

    mediaElement.addEventListener("pause", () => {
      if (mediaElement.ended) {
        return;
      }

      updateDisplayText("Paused");
      if (mediaElement === getActiveMediaElement()) {
        mediaSessionController?.setPlaybackState("paused");
        mediaSessionController?.setPositionState(mediaElement);
      }
      if (isLivePlaybackActive()) {
        updateVideoResumeButton();
        return;
      }
      persistPlayerState("paused");
      updateVideoResumeButton();
    });

    mediaElement.addEventListener("timeupdate", () => {
      const currentSong = currentPlaylist?.songs?.[currentSongIndex];
      const audibleEndSeconds = Number(currentSong?.audibleEndSeconds || currentSong?.audibleEnd || 0);
      const skipTailSilenceEnabled = preferencesApi?.getPreferences?.().skipTailSilenceEnabled === true;
      if (
        mediaElement === audioPlayer
        && playbackTransitionController?.shouldSkipAnalyzedTail(
          mediaElement,
          audibleEndSeconds,
          skipTailSilenceEnabled
        )
      ) {
        requestAutomaticNext(mediaElement);
        return;
      }

      if (
        mediaElement === audioPlayer
        && playbackTransitionController?.shouldRequestBackgroundHandoff(mediaElement)
      ) {
        requestAutomaticNext(mediaElement);
        return;
      }

      if (mediaElement === getActiveMediaElement()) {
        mediaSessionController?.setPositionState(mediaElement);
      }

      if (mediaElement !== videoPlayer || restoringPosition) {
        return;
      }

      if (!currentSong) {
        return;
      }

      savePlaybackPosition(currentSong, mediaElement.currentTime || 0, mediaElement.duration || 0);
      updateVideoResumeButton();
    });

    mediaElement.addEventListener("error", () => {
      if (isLivePlaybackActive()) {
        const mediaError = mediaElement.error;
        const errorCode = mediaError?.code || 0;
        const messageMap = {
          1: "Live playback was interrupted.",
          2: "Network error while loading live stream.",
          3: "Live stream decoded unsuccessfully.",
          4: "This browser could not play the live stream URL."
        };
        const message = messageMap[errorCode] || "Unable to load live stream.";
        lastPlayerError = message;
        console.error(`${label} live stream error:`, {
          errorCode,
          currentSrc: mediaElement.currentSrc
        });
        updateDisplayText("Playback Error");
        updateAuthUi(message);
        publishDiagnostics();
        return;
      }

      const currentSong = currentPlaylist?.songs?.[currentSongIndex];
      const mediaError = mediaElement.error;
      const errorCode = mediaError?.code || 0;
      const mediaPath = currentSong?.objectKey || currentSong?.file || "";
      const messageMap = {
        1: "Playback was interrupted.",
        2: "Network error while loading media.",
        3: "Media decoded unsuccessfully.",
        4: "The signed media URL did not return playable media."
      };
      const message = messageMap[errorCode] || "Unable to load media.";

      const retryPosition = Math.max(
        mediaElement.currentTime || 0,
        currentSong ? getSavedPlaybackPosition(currentSong) : 0
      );
      const canRetry = mediaElement === videoPlayer
        && currentSong
        && errorRetryCount < ERROR_RETRY_LIMIT
        && (errorCode === 2 || errorCode === 4);

      if (canRetry) {
        errorRetryCount += 1;
        lastPlayerError = "";
        activeMediaDebug.recovery = {
          status: "retrying",
          reason: message,
          retry: errorRetryCount,
          retryLimit: ERROR_RETRY_LIMIT,
          resumePosition: Math.round(retryPosition),
          mediaPath
        };
        updateDisplayText("Reconnecting");
        showPlayerToast("Network interrupted. Retrying from last position...");
        publishDiagnostics();
        console.warn(`${label} network interruption; retrying media load.`, activeMediaDebug.recovery);
        window.setTimeout(() => {
          playSong(currentSongIndex, true, { resumePosition: retryPosition });
        }, 700);
        return;
      }

      lastPlayerError = message;
      console.error(`${label} element error:`, {
        errorCode,
        mediaPath,
        currentSrc: mediaElement.currentSrc
      });
      updateDisplayText("Playback Error");
      persistPlayerState("paused");
      updateAuthUi(message);
      publishDiagnostics();
    });
  }

  bindMediaEvents(audioPlayer, "Audio");
  bindMediaEvents(videoPlayer, "Video");

  boot.run({
    actions: {
      initializeCollaboration() { collaborationController.initialize(); },
      setInitialMediaMode: setMediaMode,
      renderRepeatMode: updateRepeatModeUi,
      renderRandomMode: updateRandomModeUi,
      renderMediaSource: updateMediaSourceBadge,
      refreshRegistry() {
        refreshRegistry();
        return playlistRegistry;
      },
      updateAuthUi,
      watchAuthNotice() {
        authNotice?.watch?.({
          targetSelector: ".hero-meta",
          needsPrivateAccess: true
        });
      },
      updateStatus: updateDisplayText,
      loadPlayerState: PlaylistStore.loadPlayerState,
      selectPlaylist(savedState) {
        setCurrentPlaylist(savedState.playlistId, {
          songIndex: savedState.songIndex,
          playbackState: savedState.playbackState
        });
      },
      resetRandomHistory() { playerRuntimeState.resetRandomHistory(currentSongIndex); },
      refreshLiveSession() { return livePlaybackController.refresh(); },
      hasCurrentPlaylistSongs() { return Boolean(currentPlaylist?.songs?.length); },
      restorePlayback({ autoPlay, useSavedPosition }) {
        return playSong(currentSongIndex, autoPlay, { useSavedPosition });
      }
    }
  }).catch((error) => {
    console.error("Unable to initialize Impala player:", error);
    updateDisplayText("Initialization Error");
  });
});
