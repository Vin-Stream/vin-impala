(() => {
  function create(options = {}) {
    const videoElement = options.videoElement;
    const syncControllerApi = options.syncControllerApi;
    const coastControllerApi = options.coastControllerApi;
    const callbacks = options.callbacks || {};
    let syncController = null;
    let coastController = null;

    function controllers() {
      return [syncController, coastController].filter(Boolean);
    }

    function isActive() {
      return controllers().some((controller) => controller.active);
    }

    function canControl() {
      return !controllers().some((controller) => controller.active && !controller.canControl);
    }

    function authorize(action, changeLabel = "titles") {
      if (["previous", "prev", "next"].includes(action) && isActive()) {
        return { allowed: false, message: `Leave the shared session before changing ${changeLabel}.` };
      }
      if (["play", "pause", "toggle"].includes(action) && !canControl()) {
        return { allowed: false, message: "Only the host can control this session." };
      }
      return { allowed: true, message: "" };
    }

    function getCurrentVideo() {
      const song = callbacks.getCurrentSong?.();
      if (
        !song?.objectKey
        || ["local-library", "local-service"].includes(song.source)
        || callbacks.getMediaInfo?.(song)?.mediaKind !== "video"
        || callbacks.isLivePlaybackActive?.()
      ) return null;
      return { mediaId: String(song.objectKey) };
    }

    function createRuntimePlaylist(mediaId) {
      const pathSegments = String(mediaId).split("/").filter(Boolean);
      const fileName = pathSegments[pathSegments.length - 1] || "Shared video";
      let displayName = fileName;
      try {
        displayName = decodeURIComponent(fileName);
      } catch (_error) {
        // Object keys can legally contain unmatched percent characters.
      }
      displayName = displayName.replace(/\.[^.]+$/, "") || "Shared video";
      return {
        id: "sync-play-runtime",
        name: "Sync Play",
        kind: "sync",
        songs: [{
          id: `sync:${mediaId}`,
          name: displayName,
          artist: "Shared library",
          album: "",
          file: "",
          objectKey: mediaId,
          mediaType: "video",
          contentType: "",
          source: "sync-play",
          play: true
        }]
      };
    }

    async function ensureVideo(mediaId, positionSeconds = 0) {
      const playlists = callbacks.refreshPlaylists?.() || [];
      let match = null;
      for (const playlist of playlists) {
        const songIndex = playlist.songs.findIndex((song) => (
          String(song?.objectKey || "") === mediaId
          && !["local-library", "local-service"].includes(song?.source)
          && callbacks.getMediaInfo?.(song)?.mediaKind === "video"
        ));
        if (songIndex >= 0) {
          match = { playlist, songIndex };
          break;
        }
      }
      if (!match) {
        const runtimePlaylist = createRuntimePlaylist(mediaId);
        callbacks.setPlaylists?.(
          playlists.filter((playlist) => playlist.id !== runtimePlaylist.id).concat(runtimePlaylist)
        );
        match = { playlist: runtimePlaylist, songIndex: 0 };
      }

      if (callbacks.getSongIdentity?.(callbacks.getCurrentSong?.()) !== mediaId) {
        callbacks.selectPlaylist?.(match.playlist.id, match.songIndex);
        await callbacks.playSong?.(match.songIndex, positionSeconds);
      }
      if (videoElement?.readyState < 1) {
        await new Promise((resolve) => {
          videoElement.addEventListener("loadedmetadata", resolve, { once: true });
          window.setTimeout(resolve, 5000);
        });
      }
      if (videoElement && Number.isFinite(Number(positionSeconds))) {
        videoElement.currentTime = Math.max(0, Number(positionSeconds));
      }
      return true;
    }

    function initialize() {
      const controllerOptions = { videoElement, getCurrentVideo, ensureVideo };
      syncController = syncControllerApi?.init?.(controllerOptions) || null;
      coastController = coastControllerApi?.init?.(controllerOptions) || null;
      return { syncController, coastController };
    }

    return { authorize, ensureVideo, getCurrentVideo, initialize, isActive };
  }

  window.ImpalaCollaboration = { create };
})();
