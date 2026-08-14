(() => {
  async function run(options = {}) {
    const actions = options.actions || {};

    actions.initializeCollaboration?.();
    actions.setInitialMediaMode?.("audio");
    actions.renderRepeatMode?.();
    actions.renderRandomMode?.();
    actions.renderMediaSource?.("unknown");

    const playlists = actions.refreshRegistry?.() || [];
    actions.updateAuthUi?.();
    actions.watchAuthNotice?.();

    if (!playlists.length) {
      actions.updateStatus?.("No playlists");
      return { ready: false, reason: "no-playlists" };
    }

    const savedState = actions.loadPlayerState?.() || {};
    actions.selectPlaylist?.(savedState);
    actions.resetRandomHistory?.();

    const liveSessionActive = await actions.refreshLiveSession?.();
    if (!liveSessionActive && actions.hasCurrentPlaylistSongs?.()) {
      const shouldResume = savedState.playbackState === "playing";
      await actions.restorePlayback?.({
        autoPlay: shouldResume,
        useSavedPosition: shouldResume
      });
    }

    return { ready: true, liveSessionActive: Boolean(liveSessionActive) };
  }

  window.ImpalaBoot = { run };
})();
