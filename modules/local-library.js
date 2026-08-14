(() => {
  function create(options = {}) {
    const mediaResolver = options.mediaResolver;
    const playerStateStore = options.playerStateStore;
    const elements = options.elements || {};
    const getCurrentSong = options.getCurrentSong || (() => null);
    const getMediaInfo = options.getMediaInfo || (() => ({}));
    const getActiveMediaKind = options.getActiveMediaKind || (() => "audio");
    const playCurrentSong = options.playCurrentSong || (() => Promise.resolve());
    const updateDisplayText = options.updateDisplayText || (() => {});
    const showToast = options.showToast || (() => {});
    const dialog = options.dialog;
    const config = options.config;
    const sessionStore = options.sessionStorage || window.sessionStorage;
    const videoPlayer = elements.videoPlayer;
    let voiceSyncBusy = false;
    let bulkPreparationCancelled = false;

    function isCurrentLocalVideo() {
      const song = getCurrentSong();
      return Boolean(
        song
        && getActiveMediaKind() === "video"
        && mediaResolver.isLocalServiceVideo?.(song, getMediaInfo(song))
      );
    }

    function isCurrentLocalMkv() {
      const song = getCurrentSong();
      return Boolean(isCurrentLocalVideo() && mediaResolver.isLocalServiceMkv?.(song, getMediaInfo(song)));
    }

    function formatVoiceSyncOffset(offsetMs) {
      if (offsetMs === 0) return "Original timing";
      return offsetMs > 0
        ? `Audio ${offsetMs} ms later`
        : `Audio ${Math.abs(offsetMs)} ms earlier`;
    }

    function updateVoiceSyncUi() {
      if (!elements.voiceSyncPanel) return;
      const visible = isCurrentLocalVideo();
      elements.voiceSyncPanel.hidden = !visible;
      if (!visible) return;

      const offsetMs = playerStateStore.getVoiceSyncOffset(getCurrentSong());
      if (elements.voiceSyncValue) elements.voiceSyncValue.textContent = formatVoiceSyncOffset(offsetMs);
      if (elements.voiceSyncEarlierButton) elements.voiceSyncEarlierButton.disabled = voiceSyncBusy || offsetMs <= -2000;
      if (elements.voiceSyncLaterButton) elements.voiceSyncLaterButton.disabled = voiceSyncBusy || offsetMs >= 2000;
      if (elements.voiceSyncResetButton) elements.voiceSyncResetButton.disabled = voiceSyncBusy || offsetMs === 0;
      if (elements.voiceSyncSaveButton) elements.voiceSyncSaveButton.disabled = voiceSyncBusy;
      if (elements.voiceSyncCorrectedButton) elements.voiceSyncCorrectedButton.disabled = voiceSyncBusy;
    }

    async function applyVoiceSyncOffset(nextOffsetMs) {
      if (!isCurrentLocalVideo() || voiceSyncBusy) return;
      const song = getCurrentSong();
      const currentOffset = playerStateStore.getVoiceSyncOffset(song);
      const normalizedOffset = playerStateStore.normalizeVoiceSyncOffset(nextOffsetMs);
      if (normalizedOffset === currentOffset) return;

      const resumePosition = Number(videoPlayer?.currentTime || 0);
      const resumePlayback = Boolean(videoPlayer && !videoPlayer.paused && !videoPlayer.ended);
      videoPlayer?.pause();
      playerStateStore.saveVoiceSyncOffset(song, normalizedOffset);
      voiceSyncBusy = true;
      updateVoiceSyncUi();
      updateDisplayText("Applying Voice Sync...");
      showToast(`${formatVoiceSyncOffset(normalizedOffset)}. Video paused while the timing change is applied.`);
      try {
        await playCurrentSong(resumePlayback, { resumePosition });
      } finally {
        voiceSyncBusy = false;
        updateVoiceSyncUi();
      }
    }

    async function saveCurrentVoiceSyncTiming() {
      if (!isCurrentLocalVideo() || voiceSyncBusy) return;
      const song = getCurrentSong();
      const offsetMs = playerStateStore.getVoiceSyncOffset(song);
      voiceSyncBusy = true;
      updateVoiceSyncUi();
      try {
        await mediaResolver.saveLocalVideoTiming(song, offsetMs);
        song.voiceSyncMs = offsetMs;
        showToast(`${formatVoiceSyncOffset(offsetMs)} saved with this local title.`);
      } catch (error) {
        showToast(error?.message || "Voice Sync timing could not be saved.");
      } finally {
        voiceSyncBusy = false;
        updateVoiceSyncUi();
      }
    }

    async function createCurrentCorrectedCopy() {
      if (!isCurrentLocalVideo() || voiceSyncBusy) return;
      const song = getCurrentSong();
      const offsetMs = playerStateStore.getVoiceSyncOffset(song);
      const choice = await dialog?.choose?.({
        title: "Create corrected copy?",
        message: `${formatVoiceSyncOffset(offsetMs)} will be committed to a separate upload-ready MP4. The original will not be changed.`,
        choices: [
          { label: "Create Corrected Copy", value: "create", primary: true },
          { label: "Cancel", value: "cancel" }
        ],
        cancelValue: "cancel"
      });
      if (choice !== "create") return;
      voiceSyncBusy = true;
      updateVoiceSyncUi();
      try {
        const payload = await mediaResolver.createCorrectedLocalVideo(song, offsetMs, {
          onProgress({ message }) { if (message) showToast(message); }
        });
        showToast(`${payload.outputFile || "Corrected MP4"} is ready beside the original.`);
      } catch (error) {
        showToast(error?.message || "The corrected copy could not be created.");
      } finally {
        voiceSyncBusy = false;
        updateVoiceSyncUi();
      }
    }

    async function offerRelatedMkvPreparation(song) {
      try {
        const group = await mediaResolver.getLocalMkvGroup(song);
        const folder = group?.folder || {};
        const series = group?.series || {};
        if (Number(folder.count || 0) <= 1 && Number(series.count || 0) <= 1) return null;
        const sessionKey = `impala.mkv-group-offered.${series.name || folder.name}.${folder.name}`;
        if (sessionStore.getItem(sessionKey)) return null;
        sessionStore.setItem(sessionKey, "1");
        const choices = [{ label: "This Title Only", value: "title", primary: true }];
        if (folder.count > 1) choices.push({ label: `Prepare ${folder.name} — ${folder.count} Titles`, value: "folder" });
        if (series.count > folder.count) choices.push({ label: `Prepare Entire ${series.name} Series — ${series.count} Titles`, value: "series" });
        choices.push({ label: "Not Now", value: "not-now" });
        const scopeName = series.name === folder.name ? folder.name : `${series.name} — ${folder.name}`;
        const choice = await dialog?.choose?.({
          title: `MKV titles found in “${folder.name}”`,
          message: `Impala found ${folder.count} MKV title${folder.count === 1 ? "" : "s"} in “${scopeName}.” Prepare related titles sequentially?`,
          choices,
          cancelValue: "not-now"
        });
        if (choice === "folder") return { ids: folder.ids, label: folder.name };
        if (choice === "series") return { ids: series.ids, label: series.name };
      } catch (error) {
        console.warn("Related MKV discovery was unavailable.", error);
      }
      return null;
    }

    async function prepareRelatedMkvQueue(group, currentId) {
      const ids = [...new Set(group?.ids || [])].filter((id) => id && id !== currentId);
      bulkPreparationCancelled = false;
      if (elements.mkvBulkStopButton) elements.mkvBulkStopButton.disabled = false;
      if (elements.mkvBulkStatus) elements.mkvBulkStatus.hidden = ids.length === 0;
      for (let index = 0; index < ids.length; index += 1) {
        if (bulkPreparationCancelled) break;
        const id = ids[index];
        if (elements.mkvBulkStatusText) {
          elements.mkvBulkStatusText.textContent = `${group.label}: title ${index + 1} of ${ids.length} — ${id.split("/").pop()}`;
        }
        showToast(`${group.label}: preparing title ${index + 1} of ${ids.length}.`);
        try {
          await mediaResolver.prepareLocalMkv({ source: "local-service", objectKey: id, file: id }, {});
        } catch (error) {
          console.warn(`Bulk MKV preparation skipped ${id}.`, error);
        }
      }
      if (elements.mkvBulkStatusText && bulkPreparationCancelled) {
        elements.mkvBulkStatusText.textContent = `${group.label}: stopped after the current title.`;
      }
      if (ids.length && !bulkPreparationCancelled) showToast(`${group.label}: related MKV preparation complete.`);
      if (!bulkPreparationCancelled && elements.mkvBulkStatus) elements.mkvBulkStatus.hidden = true;
    }

    function stopBulkPreparation() {
      bulkPreparationCancelled = true;
      if (elements.mkvBulkStopButton) elements.mkvBulkStopButton.disabled = true;
      if (elements.mkvBulkStatusText) elements.mkvBulkStatusText.textContent = "Stopping safely after the current title...";
    }

    async function resolveLocalMedia(song, mediaInfo, mediaPath) {
      if (song?.source === "local-service" && !mediaResolver.isLocalHelperEnabled?.()) {
        throw new Error("Local Library Companion is off. Turn it on in Settings to play this local-library playlist.");
      }

      if (mediaResolver.isLocalServiceMkv?.(song, mediaInfo)) {
        if (config?.isMkvPlaybackEnabled?.() !== true) {
          throw new Error("MKV compatibility is not enabled in this Impala build yet.");
        }
        const relatedGroup = await offerRelatedMkvPreparation(song);
        const preparedUrl = await mediaResolver.prepareLocalMkv(song, {
          voiceSyncMs: playerStateStore.getVoiceSyncOffset(song),
          onProgress({ progress }) { updateDisplayText(`Preparing MKV ${Math.round(progress)}%`); }
        });
        if (relatedGroup) void prepareRelatedMkvQueue(relatedGroup, song.objectKey || song.file || song.id);
        return { url: preparedUrl, source: "local", contentType: "video/mp4" };
      }

      if (mediaResolver.isLocalServiceVideo?.(song, mediaInfo)) {
        const offsetMs = playerStateStore.getVoiceSyncOffset(song);
        const adjustedUrl = await mediaResolver.prepareLocalVideoTiming(song, {
          voiceSyncMs: offsetMs,
          onProgress({ progress, message }) {
            const label = offsetMs === 0 ? "Checking video compatibility" : "Applying Voice Sync";
            updateDisplayText(`${label} ${Math.round(progress)}%${message ? ` — ${message}` : ""}`);
          }
        });
        return { url: adjustedUrl, source: "local", contentType: "video/mp4" };
      }

      const localMediaUrl = mediaResolver.resolveLocalMediaUrl(song, mediaInfo);
      if (localMediaUrl) return { url: localMediaUrl, source: "local" };
      if (!song.objectKey && mediaPath) return { url: mediaPath, source: "local" };
      return null;
    }

    function bindControls() {
      elements.voiceSyncEarlierButton?.addEventListener("click", () => {
        applyVoiceSyncOffset(playerStateStore.getVoiceSyncOffset(getCurrentSong()) - 50);
      });
      elements.voiceSyncLaterButton?.addEventListener("click", () => {
        applyVoiceSyncOffset(playerStateStore.getVoiceSyncOffset(getCurrentSong()) + 50);
      });
      elements.voiceSyncResetButton?.addEventListener("click", () => applyVoiceSyncOffset(0));
      elements.voiceSyncSaveButton?.addEventListener("click", saveCurrentVoiceSyncTiming);
      elements.voiceSyncCorrectedButton?.addEventListener("click", createCurrentCorrectedCopy);
      elements.mkvBulkStopButton?.addEventListener("click", stopBulkPreparation);
    }

    return {
      bindControls,
      isCurrentLocalMkv,
      isCurrentLocalVideo,
      resolveLocalMedia,
      updateVoiceSyncUi
    };
  }

  window.ImpalaLocalLibrary = { create };
})();
