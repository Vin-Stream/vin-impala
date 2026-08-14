(() => {
  function create(options = {}) {
    const elements = options.elements || {};
    const pageDocument = options.document || window.document;

    function setMediaMode(kind) {
      const normalizedKind = kind === "video" ? "video" : "audio";
      pageDocument?.body?.classList?.toggle("is-video-mode", normalizedKind === "video");
      pageDocument?.body?.classList?.toggle("is-audio-mode", normalizedKind !== "video");
      if (elements.audioPlayer) elements.audioPlayer.hidden = normalizedKind === "video";
      if (elements.videoScreen) elements.videoScreen.hidden = normalizedKind !== "video";
      return normalizedKind;
    }

    function renderRepeatMode(mode) {
      const repeatMode = ["off", "one", "all"].includes(mode) ? mode : "off";
      const labels = { off: "Repeat Off", one: "Repeat One", all: "Repeat All" };
      if (elements.repeatModeButton) {
        elements.repeatModeButton.textContent = labels[repeatMode];
        elements.repeatModeButton.setAttribute("aria-pressed", repeatMode === "off" ? "false" : "true");
      }
      if (elements.lcdRepeatIndicator) {
        elements.lcdRepeatIndicator.hidden = repeatMode === "off";
        elements.lcdRepeatIndicator.textContent = repeatMode === "one" ? "Repeat 1" : "Repeat All";
      }
    }

    function renderRandomMode(enabled) {
      const randomMode = Boolean(enabled);
      if (elements.randomModeButton) {
        elements.randomModeButton.classList.toggle("is-active", randomMode);
        elements.randomModeButton.setAttribute("aria-pressed", randomMode ? "true" : "false");
        elements.randomModeButton.setAttribute("title", randomMode ? "Shuffle on" : "Shuffle off");
      }
      if (elements.lcdShuffleIndicator) elements.lcdShuffleIndicator.hidden = !randomMode;
    }

    function getUrlDetailLabel(url, sourceType) {
      const value = String(url || "").trim();
      if (!value) return "no URL yet";
      if (/^file:\/\//i.test(value)) return "file:// path";
      if (/^blob:/i.test(value)) return "blob URL";
      if (/^https?:\/\//i.test(value)) return sourceType === "cloud" ? "signed cloud URL" : "web URL";
      if (value.startsWith("/")) return "absolute local/web path";
      return "relative path";
    }

    function renderMediaSourceBadge({ source, url, isLocalService = false } = {}) {
      const normalizedSource = ["cloud", "local", "live"].includes(source) ? source : "unknown";
      if (!elements.mediaSourceBadge) return normalizedSource;
      const badgeMap = {
        local: { label: "Local", title: isLocalService ? "Local Library Companion source" : "Local media source" },
        cloud: { label: "Cloud", title: "Cloud media source" },
        live: { label: "LIVE", title: "Live stream source" },
        unknown: { label: "-", title: "Media source unknown" }
      };
      const badge = badgeMap[normalizedSource];
      const detailLabel = getUrlDetailLabel(url, normalizedSource);
      elements.mediaSourceBadge.textContent = badge.label;
      elements.mediaSourceBadge.setAttribute("title", `${badge.title} (${detailLabel})`);
      elements.mediaSourceBadge.setAttribute("aria-label", `${badge.title}; ${detailLabel}`);
      elements.mediaSourceBadge.classList.remove("is-local", "is-cloud", "is-live", "is-unknown");
      elements.mediaSourceBadge.classList.add(`is-${normalizedSource}`);
      return normalizedSource;
    }

    function replaceNowPlaying(title, subtitle) {
      if (!elements.currentSongDisplay) return;
      elements.currentSongDisplay.textContent = "";
      elements.currentSongDisplay.append(
        pageDocument.createTextNode(title),
        pageDocument.createElement("br"),
        pageDocument.createTextNode(subtitle)
      );
    }

    function renderStatus(model = {}) {
      if (elements.statusDisplay) elements.statusDisplay.textContent = model.status || "";
      if (model.liveSession) {
        const title = model.liveSession.title || "Live Stream";
        replaceNowPlaying(title, "Live Stream");
        if (elements.playlistDisplay) elements.playlistDisplay.textContent = "Live";
        if (elements.asideText) elements.asideText.textContent = `${title} is active.`;
        return renderMediaSourceBadge({ source: "live", url: model.mediaUrl });
      }
      if (!model.song || !model.playlist) {
        if (elements.currentSongDisplay) elements.currentSongDisplay.textContent = "No song loaded";
        if (elements.playlistDisplay) elements.playlistDisplay.textContent = "No playlist";
        if (elements.asideText) elements.asideText.textContent = "Choose a playlist to begin listening.";
        return renderMediaSourceBadge({ source: "unknown", url: model.mediaUrl });
      }
      replaceNowPlaying(model.song.name, model.song.artist || "Unknown artist");
      if (elements.playlistDisplay) {
        elements.playlistDisplay.textContent = `${model.isLocalServicePlaylist ? "L " : ""}${model.playlist.name}`;
      }
      if (elements.asideText) {
        elements.asideText.textContent = `${model.song.name} by ${model.song.artist || "Unknown artist"} from the PlayList ${model.playlist.name}.`;
      }
      return renderMediaSourceBadge({
        source: model.mediaSource,
        url: model.mediaUrl,
        isLocalService: model.isLocalServiceSong
      });
    }

    function renderHero({ playlist, isLocalServicePlaylist = false } = {}) {
      if (!playlist) {
        pageDocument?.body?.classList?.remove("is-local-helper-playlist");
        return;
      }
      if (elements.cardTitle) elements.cardTitle.textContent = playlist.name;
      if (elements.cardSubtitle) {
        elements.cardSubtitle.textContent = isLocalServicePlaylist
          ? "Local library playlist served by Impala Helper."
          : playlist.kind === "custom"
            ? "Custom playlist saved on this device."
            : "Built-in catalog playlist.";
      }
      pageDocument?.body?.classList?.toggle("is-local-helper-playlist", isLocalServicePlaylist);
    }

    return { setMediaMode, renderRepeatMode, renderRandomMode, renderMediaSourceBadge, renderStatus, renderHero };
  }

  window.ImpalaPlayerView = { create };
})();
