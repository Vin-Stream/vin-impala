const PlaylistStore = (() => {
  const playerConfig = window.KW_PLAYER_CONFIG || {};
  const storagePrefix = window.ImpalaConfig?.getStoragePrefix?.()
    || playerConfig.playlistStoragePrefix
    || "impalaStreamer";
  const STORAGE_KEYS = {
    customPlaylists: `${storagePrefix}.customPlaylists`,
    playerState: `${storagePrefix}.playerState`,
    builtInPlayStatesPrefix: `${storagePrefix}.playStates.`,
    transientTrackSelections: `${storagePrefix}.transientTrackSelections`
  };

  const builtInDefinitions = [
    {
      id: "songsKw",
      name: "Shared Playlist 1",
      source: () => (typeof songsKw !== "undefined" && Array.isArray(songsKw) ? songsKw : [])
    },
    {
      id: "songs",
      name: "Shared Playlist 2",
      source: () => (typeof songs !== "undefined" && Array.isArray(songs) ? songs : [])
    }
  ];

  function areBuiltInPlaylistsEnabled() {
    if (window.ImpalaConfig?.areBuiltInPlaylistsEnabled) {
      return window.ImpalaConfig.areBuiltInPlaylistsEnabled();
    }

    return playerConfig.builtInPlaylistsEnabled === true;
  }

  function getEnabledBuiltInPlaylistIds() {
    if (!areBuiltInPlaylistsEnabled()) {
      return [];
    }

    if (window.ImpalaConfig?.getEnabledBuiltInPlaylistIds) {
      return window.ImpalaConfig.getEnabledBuiltInPlaylistIds();
    }

    return Array.isArray(playerConfig.enabledBuiltInPlaylistIds)
      ? playerConfig.enabledBuiltInPlaylistIds.map((playlistId) => String(playlistId))
      : [];
  }

  function cloneSong(song, fallbackId) {
    const source = song && typeof song === "object" ? song : {};
    return {
      id: String(source.id || fallbackId || ""),
      name: String(source.name || source.title || "Untitled Track"),
      artist: String(source.artist || "Unknown artist"),
      album: String(source.album || ""),
      file: String(source.file || ""),
      objectKey: String(source.objectKey || ""),
      mediaType: String(source.mediaType || source.kind || ""),
      contentType: String(source.contentType || ""),
      source: String(source.source || ""),
      play: source.play !== false
    };
  }

  function stripTrackNumberPrefix(value) {
    return String(value || "").replace(/^\d{1,3}\s*[-._)]\s*/, "").trim();
  }

  function parseSongFromPath(mediaPath) {
    const normalizedPath = String(mediaPath || "");
    const segments = normalizedPath.split("/").filter(Boolean);
    const rootSegment = String(segments[0] || "").toLowerCase();
    const contentSegments = ["audio", "videos", "video"].includes(rootSegment)
      ? segments.slice(1)
      : segments;
    const fileName = contentSegments[contentSegments.length - 1] || normalizedPath;
    const withoutExtension = fileName.replace(/\.[^.]+$/, "");
    const artist = contentSegments.length > 1 ? contentSegments[0] : "Unknown artist";
    const album = contentSegments.length > 2 ? contentSegments[contentSegments.length - 2] : "";
    let trackName = stripTrackNumberPrefix(withoutExtension);
    const artistPrefix = `${artist.toLowerCase()} - `;

    if (trackName.toLowerCase().startsWith(artistPrefix)) {
      trackName = trackName.slice(artistPrefix.length).trim();
    }

    return {
      name: trackName || withoutExtension || fileName || "Untitled Track",
      artist,
      album
    };
  }

  function isVideoMediaPath(mediaPath) {
    return /\.(mp4|m4v|webm|mov)$/i.test(String(mediaPath || ""));
  }

  function getLibraryEntryPath(entry) {
    return typeof entry === "string"
      ? entry.trim()
      : String(entry?.file || entry?.path || entry?.objectKey || "").trim();
  }

  function libraryEntryMatchesMode(entry, mode) {
    const declaredType = typeof entry === "string"
      ? ""
      : String(entry?.mediaType || entry?.kind || "").trim().toLowerCase();

    if (declaredType === "audio" || declaredType === "video") {
      return declaredType === mode;
    }

    return mode === "video" ? isVideoMediaPath(getLibraryEntryPath(entry)) : !isVideoMediaPath(getLibraryEntryPath(entry));
  }

  function getLocalLibraryJson() {
    const preferencesApi = window.UiPreferences;
    if (!preferencesApi?.getPreferences) {
      return "";
    }

    return String(preferencesApi.getPreferences().localLibraryJson || "").trim();
  }

  function normalizeLocalLibrarySong(entry, index, mode) {
    const isStringEntry = typeof entry === "string";
    const sourcePath = getLibraryEntryPath(entry);

    if (!sourcePath) {
      return null;
    }

    const parsedSong = parseSongFromPath(sourcePath);
    const objectKey = String(isStringEntry ? "" : (entry?.objectKey || "")).trim();
    const file = String(isStringEntry ? sourcePath : (entry?.file || entry?.path || "")).trim() || sourcePath;
    const mediaType = String(isStringEntry ? mode : (entry?.mediaType || entry?.kind || mode)).trim().toLowerCase();

    return cloneSong({
      id: `local-${mode}-${index}-${sourcePath}`,
      name: String(isStringEntry ? "" : (entry?.name || entry?.title || "")).trim() || parsedSong.name,
      artist: String(isStringEntry ? "" : (entry?.artist || "")).trim() || parsedSong.artist,
      album: String(isStringEntry ? "" : (entry?.album || "")).trim() || parsedSong.album,
      file,
      objectKey,
      mediaType,
      contentType: isStringEntry ? "" : entry?.contentType,
      source: "local-library",
      play: isStringEntry ? true : entry?.play
    }, `local-${mode}-${index}`);
  }

  function getLocalLibrarySongsForMode(parsedLibrary, mode) {
    if (Array.isArray(parsedLibrary)) {
      return parsedLibrary.filter((entry) => libraryEntryMatchesMode(entry, mode));
    }

    if (!parsedLibrary || typeof parsedLibrary !== "object") {
      return [];
    }

    const modeKey = mode === "video" ? "video" : "audio";
    const explicitEntries = [
      parsedLibrary[modeKey],
      parsedLibrary[`${modeKey}Entries`]
    ].find(Array.isArray);

    if (explicitEntries) {
      return explicitEntries;
    }

    const genericEntries = [
      parsedLibrary.entries,
      parsedLibrary.files,
      parsedLibrary.items
    ].find(Array.isArray) || [];

    return genericEntries.filter((entry) => libraryEntryMatchesMode(entry, mode));
  }

  function getLocalLibraryPlaylists() {
    const rawJson = getLocalLibraryJson();
    if (!rawJson) {
      return [];
    }

    let parsedLibrary;
    try {
      parsedLibrary = JSON.parse(rawJson);
    } catch (error) {
      console.error("Local library JSON is not valid JSON:", error);
      return [];
    }

    return [
      { id: "localAudio", name: "Local Audio", mode: "audio" },
      { id: "localVideo", name: "Local Video", mode: "video" }
    ].map((definition) => ({
      id: definition.id,
      name: definition.name,
      kind: "local",
      songs: getLocalLibrarySongsForMode(parsedLibrary, definition.mode)
        .map((entry, index) => normalizeLocalLibrarySong(entry, index, definition.mode))
        .filter(Boolean)
    })).filter((playlist) => playlist.songs.length);
  }

  function readJson(key, fallbackValue) {
    try {
      const rawValue = localStorage.getItem(key);
      return rawValue ? JSON.parse(rawValue) : fallbackValue;
    } catch (error) {
      console.error(`Unable to read ${key}:`, error);
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
      console.error(`Unable to save ${key}:`, error);
      return false;
    }
  }

  function loadTransientTrackSelections() {
    try {
      const rawValue = sessionStorage.getItem(STORAGE_KEYS.transientTrackSelections);
      if (!rawValue) {
        return [];
      }

      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch (error) {
      console.error("Unable to read transient track selections:", error);
      return [];
    }
  }

  function saveTransientTrackSelections(selectionKeys) {
    const normalized = Array.isArray(selectionKeys)
      ? selectionKeys.map((entry) => String(entry))
      : [];

    try {
      sessionStorage.setItem(STORAGE_KEYS.transientTrackSelections, JSON.stringify(normalized));
    } catch (error) {
      console.error("Unable to save transient track selections:", error);
    }

    return normalized;
  }

  function clearTransientTrackSelections() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.transientTrackSelections);
    } catch (error) {
      console.error("Unable to clear transient track selections:", error);
    }
  }

  function getBuiltInPlayStates(playlistId) {
    return readJson(`${STORAGE_KEYS.builtInPlayStatesPrefix}${playlistId}`, []);
  }

  function getBuiltInPlaylists() {
    const enabledPlaylistIds = getEnabledBuiltInPlaylistIds();
    if (!enabledPlaylistIds.length) {
      return [];
    }

    return builtInDefinitions.filter((definition) => enabledPlaylistIds.includes(definition.id)).map((definition) => {
      const savedPlayStates = getBuiltInPlayStates(definition.id);
      const songsWithState = definition.source()
        .map((song, index) => ({ song, index }))
        .map(({ song, index }) => {
          const clonedSong = cloneSong(song, `${definition.id}-${index}`);
          return {
            ...clonedSong,
            play: typeof savedPlayStates[index] === "boolean" ? savedPlayStates[index] : clonedSong.play
          };
        });

      return {
        id: definition.id,
        name: definition.name,
        kind: "built-in",
        songs: songsWithState
      };
    }).filter((playlist) => playlist.songs.length);
  }

  function getCustomPlaylists() {
    const storedPlaylists = readJson(STORAGE_KEYS.customPlaylists, []);

    if (!Array.isArray(storedPlaylists)) {
      return [];
    }

    return storedPlaylists.map((playlist, playlistIndex) => ({
      id: playlist.id || `custom-${playlistIndex + 1}`,
      name: playlist.name || `Custom Playlist ${playlistIndex + 1}`,
      kind: "custom",
      songs: Array.isArray(playlist.songs)
        ? playlist.songs.map((song, songIndex) => ({
            ...cloneSong(song, `${playlist.id || `custom-${playlistIndex + 1}`}-${songIndex}`),
            play: true
          }))
        : []
    }));
  }

  function saveCustomPlaylists(playlists) {
    const sourcePlaylists = Array.isArray(playlists) ? playlists : [];
    const sanitizedPlaylists = sourcePlaylists.map((playlist, playlistIndex) => {
      const sourcePlaylist = playlist && typeof playlist === "object" ? playlist : {};
      const playlistId = String(sourcePlaylist.id || `custom-${Date.now()}-${playlistIndex}`);

      return {
        id: playlistId,
        name: String(sourcePlaylist.name || `Custom Playlist ${playlistIndex + 1}`),
        songs: Array.isArray(sourcePlaylist.songs)
          ? sourcePlaylist.songs.map((song, songIndex) => {
            const clonedSong = cloneSong(song, `${playlistId}-${songIndex}`);
            return {
              id: clonedSong.id,
              name: clonedSong.name,
              artist: clonedSong.artist,
              album: clonedSong.album,
              file: clonedSong.file,
              objectKey: clonedSong.objectKey,
              mediaType: clonedSong.mediaType,
              contentType: clonedSong.contentType,
              source: clonedSong.source
            };
          })
          : []
      };
    });

    if (!writeJson(STORAGE_KEYS.customPlaylists, sanitizedPlaylists)) {
      return getCustomPlaylists();
    }

    return getCustomPlaylists();
  }

  function getPlaylistRegistry() {
    const localLibraryPlaylists = getLocalLibraryPlaylists();
    return [...getBuiltInPlaylists(), ...localLibraryPlaylists, ...getCustomPlaylists()];
  }

  function getPlaylistById(playlistId) {
    return getPlaylistRegistry().find((playlist) => playlist.id === playlistId) || null;
  }

  function createCustomPlaylist(name) {
    const customPlaylists = getCustomPlaylists();
    const trimmedName = (name || "").trim();
    const playlist = {
      id: `custom-${Date.now()}`,
      name: trimmedName || `Custom Playlist ${customPlaylists.length + 1}`,
      songs: []
    };

    saveCustomPlaylists([...customPlaylists, playlist]);
    return playlist.id;
  }

  function updateCustomPlaylist(playlistId, updater) {
    const customPlaylists = getCustomPlaylists();
    const nextPlaylists = customPlaylists.map((playlist) => {
      if (playlist.id !== playlistId) {
        return playlist;
      }

      const updatedPlaylist = updater({
        ...playlist,
        songs: playlist.songs.map((song) => ({ ...song }))
      });

      return {
        ...updatedPlaylist,
        id: playlist.id
      };
    });

    return saveCustomPlaylists(nextPlaylists);
  }

  function deleteCustomPlaylist(playlistId) {
    const remainingPlaylists = getCustomPlaylists().filter((playlist) => playlist.id !== playlistId);
    return saveCustomPlaylists(remainingPlaylists);
  }

  function saveBuiltInPlayStates(playlistId, songs) {
    writeJson(
      `${STORAGE_KEYS.builtInPlayStatesPrefix}${playlistId}`,
      songs.map((song) => song.play !== false)
    );
  }

  function loadPlayerState() {
    const fallbackPlaylist = getPlaylistRegistry()[0];
    const savedState = readJson(STORAGE_KEYS.playerState, null);
    const fallbackPlaylistId = fallbackPlaylist ? fallbackPlaylist.id : "";

    if (!savedState || typeof savedState !== "object") {
      return {
        playlistId: fallbackPlaylistId,
        songIndex: 0,
        playbackState: "paused"
      };
    }

    const playlist = getPlaylistById(savedState.playlistId);
    const songIndex = Number.isInteger(savedState.songIndex) ? savedState.songIndex : 0;

    if (savedState.playlistId && !playlist) {
      window.DiagnosticStore?.recordError(
        "Playlist registry mismatch",
        `Saved playlist ${savedState.playlistId} is not present in the registry`
      );
    }

    return {
      playlistId: playlist ? playlist.id : fallbackPlaylistId,
      songIndex: songIndex >= 0 ? songIndex : 0,
      playbackState: savedState.playbackState === "playing" ? "playing" : "paused"
    };
  }

  function savePlayerState(state) {
    const nextState = {
      playlistId: state.playlistId,
      songIndex: Number.isInteger(state.songIndex) ? state.songIndex : 0,
      playbackState: state.playbackState === "playing" ? "playing" : "paused"
    };

    writeJson(STORAGE_KEYS.playerState, nextState);
    return nextState;
  }

  return {
    STORAGE_KEYS,
    cloneSong,
    getPlaylistRegistry,
    getPlaylistById,
    getBuiltInPlaylists,
    getCustomPlaylists,
    saveCustomPlaylists,
    createCustomPlaylist,
    updateCustomPlaylist,
    deleteCustomPlaylist,
    saveBuiltInPlayStates,
    loadPlayerState,
    savePlayerState,
    loadTransientTrackSelections,
    saveTransientTrackSelections,
    clearTransientTrackSelections
  };
})();
