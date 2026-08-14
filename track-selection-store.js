(() => {
  function getSongIdentity(song) {
    return String(song?.objectKey || song?.file || song?.id || "");
  }

  function getTrackSelectionKey(playlistId, song, songIndex) {
    const identity = getSongIdentity(song);
    return `${playlistId}:${identity || `index-${songIndex}`}`;
  }

  function getSelectionSet() {
    return new Set(PlaylistStore.loadTransientTrackSelections());
  }

  function saveSelectionSet(selectionSet) {
    PlaylistStore.saveTransientTrackSelections([...selectionSet]);
  }

  function clear() {
    PlaylistStore.clearTransientTrackSelections();
  }

  function isSelected(playlistId, song, songIndex) {
    return getSelectionSet().has(getTrackSelectionKey(playlistId, song, songIndex));
  }

  function toggle(playlistId, song, songIndex) {
    const selectionSet = getSelectionSet();
    const key = getTrackSelectionKey(playlistId, song, songIndex);

    if (selectionSet.has(key)) {
      selectionSet.delete(key);
    } else {
      selectionSet.add(key);
    }

    saveSelectionSet(selectionSet);
  }

  function countSelected(playlist) {
    if (!playlist || !Array.isArray(playlist.songs)) {
      return 0;
    }

    return playlist.songs.reduce((count, song, songIndex) => (
      isSelected(playlist.id, song, songIndex) ? count + 1 : count
    ), 0);
  }

  function getSelectedSongs(playlist) {
    if (!playlist || !Array.isArray(playlist.songs)) {
      return [];
    }

    return playlist.songs
      .filter((song, songIndex) => isSelected(playlist.id, song, songIndex))
      .map((song) => ({ ...song }));
  }

  window.TrackSelectionStore = {
    getSongIdentity,
    getTrackSelectionKey,
    getSelectionSet,
    saveSelectionSet,
    clear,
    isSelected,
    toggle,
    countSelected,
    getSelectedSongs
  };
})();
