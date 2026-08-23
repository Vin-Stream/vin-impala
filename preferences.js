(() => {
  const paletteSelect = document.getElementById("palette-select");
  const applyButton = document.getElementById("palette-apply-btn");
  const resetButton = document.getElementById("palette-reset-btn");
  const statusNode = document.getElementById("prefs-status");
  const backupStatusNode = document.getElementById("backup-status");
  const previewContainer = document.getElementById("palette-preview");
  const previewName = document.getElementById("palette-preview-name");
  const customNoteInput = document.getElementById("custom-note-input");
  const medallionFileInput = document.getElementById("medallion-file-input");
  const medallionSrcInput = document.getElementById("medallion-src-input");
  const medallionPreviewImg = document.getElementById("medallion-preview-img");
  const customizeApplyButton = document.getElementById("customize-apply-btn");
  const customizeResetButton = document.getElementById("customize-reset-btn");
  const settingsResetButton = document.getElementById("settings-reset-btn");
  const cloudApiUrlInput = document.getElementById("cloud-api-url-input");
  const cloudApiApplyButton = document.getElementById("cloud-api-apply-btn");
  const cloudApiResetButton = document.getElementById("cloud-api-reset-btn");
  const cloudApiTestButton = document.getElementById("cloud-api-test-btn");
  const cloudApiStatusNode = document.getElementById("cloud-api-status");
  const instanceIdOutput = document.getElementById("instance-id-output");
  const instanceIdConfirmInput = document.getElementById("instance-id-confirm-input");
  const instanceIdRegenerateButton = document.getElementById("instance-id-regenerate-btn");
  const localAudioDirInput = document.getElementById("local-audio-dir-input");
  const localVideoDirInput = document.getElementById("local-video-dir-input");
  const localLibraryJsonInput = document.getElementById("local-library-json-input");
  const localLibraryApplyButton = document.getElementById("local-library-apply-btn");
  const localLibraryResetButton = document.getElementById("local-library-reset-btn");
  const localHelperEnabledInput = document.getElementById("local-helper-enabled-input");
  const localHelperRootInput = document.getElementById("local-helper-root-input");
  const localHelperPortInput = document.getElementById("local-helper-port-input");
  const localHelperDownloadLink = document.getElementById("local-helper-download-link");
  const localHelperCheckButton = document.getElementById("local-helper-check-btn");
  const localHelperConnectButton = document.getElementById("local-helper-connect-btn");
  const localHelperStatusNode = document.getElementById("local-helper-status");
  const metadataEnabledInput = document.getElementById("metadata-enabled-input");
  const metadataStatusNode = document.getElementById("metadata-status");
  const mediaRootsApplyButton = document.getElementById("media-roots-apply-btn");
  const mediaRootsResetButton = document.getElementById("media-roots-reset-btn");
  const mediaRootsTestAudioButton = document.getElementById("media-roots-test-audio-btn");
  const mediaRootsTestVideoButton = document.getElementById("media-roots-test-video-btn");
  const backupExportButton = document.getElementById("backup-export-btn");
  const backupImportInput = document.getElementById("backup-import-input");
  const backupRestoreButton = document.getElementById("backup-restore-btn");
  const liveStreamEnabledInput = document.getElementById("live-stream-enabled-input");
  const liveStreamStatusNode = document.getElementById("live-stream-status");
  const skipTailSilenceEnabledInput = document.getElementById("skip-tail-silence-enabled-input");
  const playbackTransitionStatusNode = document.getElementById("playback-transition-status");
  const syncPlayEnabledInput = document.getElementById("sync-play-enabled-input");
  const syncPlayApiUrlInput = document.getElementById("sync-play-api-url-input");
  const syncPlayApplyButton = document.getElementById("sync-play-apply-btn");
  const syncPlayStatusNode = document.getElementById("sync-play-status");
  const coastEnabledInput = document.getElementById("coast-enabled-input");
  const coastApiUrlInput = document.getElementById("coast-api-url-input");
  const coastApplyButton = document.getElementById("coast-apply-btn");
  const coastStatusNode = document.getElementById("coast-status");

  const preferencesApi = window.UiPreferences;
  const backupApi = window.IdentityBackup;
  if (!preferencesApi) {
    if (statusNode) {
      statusNode.textContent = "Preferences service is unavailable.";
    }
    return;
  }

  function enhancePreferencePanels() {
    document.querySelectorAll(".preferences-main > .prefs-panel, .preferences-grid > .prefs-panel").forEach((panel) => {
      if (panel.closest(".prefs-disclosure")) return;
      const heading = panel.querySelector(":scope > h2");
      if (!heading) return;
      const disclosure = document.createElement("details");
      disclosure.className = `prefs-disclosure${panel.classList.contains("prefs-danger-panel") ? " prefs-danger-panel" : ""}`;
      disclosure.open = false;
      const summary = document.createElement("summary");
      summary.id = heading.id;
      summary.innerHTML = `<span>${heading.textContent}</span><small>${panel.querySelector(":scope > p")?.textContent || "Configure this section"}</small>`;
      disclosure.append(summary);
      heading.remove();
      panel.classList.remove("prefs-panel", "prefs-danger-panel");
      panel.classList.add("prefs-disclosure-content");
      panel.parentNode.insertBefore(disclosure, panel);
      disclosure.append(panel);
    });
  }

  enhancePreferencePanels();

  const paletteOptions = preferencesApi.getPaletteOptions();
  const previewKeys = [
    "--theme-bg-main-a",
    "--theme-bg-main-b",
    "--accent",
    "--button-start",
    "--button-end"
  ];

  function setStatus(message) {
    if (statusNode) {
      statusNode.textContent = message;
    }
  }

  function setBackupStatus(message) {
    if (backupStatusNode) {
      backupStatusNode.textContent = message;
      return;
    }

    setStatus(message);
  }

  function setLiveStreamStatus(message) {
    if (liveStreamStatusNode) {
      liveStreamStatusNode.textContent = message;
      return;
    }

    setStatus(message);
  }

  function setSyncPlayStatus(message) {
    if (syncPlayStatusNode) {
      syncPlayStatusNode.textContent = message;
      return;
    }
    setStatus(message);
  }

  function setCoastStatus(message) {
    if (coastStatusNode) coastStatusNode.textContent = message;
    else setStatus(message);
  }

  function setCloudApiStatus(message) {
    if (cloudApiStatusNode) {
      cloudApiStatusNode.textContent = message;
      return;
    }

    setStatus(message);
  }

  function setLocalHelperStatus(message) {
    if (localHelperStatusNode) {
      localHelperStatusNode.textContent = message;
      return;
    }

    setStatus(message);
  }

  function getLocalHelperBaseUrl(port = localHelperPortInput?.value) {
    const parsedPort = Number.parseInt(String(port || "8089").trim(), 10);
    const safePort = Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535
      ? parsedPort
      : 8089;
    return `http://127.0.0.1:${safePort}`;
  }

  function setMetadataStatus(enabled) {
    if (!metadataStatusNode) return;
    metadataStatusNode.textContent = enabled
      ? "External metadata is on. Limited album and movie search terms may leave this Impala instance. Reload Player or Library to apply."
      : "External metadata is off. No metadata or artwork lookups will be made. Reload Player or Library to apply.";
  }

  function applyMetadataPreference() {
    if (!metadataEnabledInput) return;
    const nextPreferences = preferencesApi.setMetadataEnabled(metadataEnabledInput.checked);
    metadataEnabledInput.checked = nextPreferences.metadataEnabled === true;
    setMetadataStatus(nextPreferences.metadataEnabled === true);
  }

  function configureLocalHelperDownloadLink() {
    const downloadUrl = String(window.KW_PLAYER_CONFIG?.localHelperDownloadUrl || "").trim();
    if (!localHelperDownloadLink) {
      return;
    }

    if (downloadUrl) {
      localHelperDownloadLink.href = downloadUrl;
      localHelperDownloadLink.removeAttribute("aria-disabled");
      localHelperDownloadLink.setAttribute("target", "_blank");
      localHelperDownloadLink.setAttribute("rel", "noopener");
      return;
    }

    localHelperDownloadLink.href = "#";
    localHelperDownloadLink.setAttribute("aria-disabled", "true");
    localHelperDownloadLink.removeAttribute("target");
    localHelperDownloadLink.removeAttribute("rel");
  }

  function renderPalettePreview(paletteId) {
    if (!previewContainer) {
      return;
    }

    const palette = paletteOptions.find((entry) => entry.id === paletteId) || paletteOptions[0];
    previewContainer.innerHTML = "";

    const swatchRow = document.createElement("div");
    swatchRow.className = "palette-preview-row";

    previewKeys.forEach((cssVar) => {
      const swatch = document.createElement("div");
      swatch.className = "palette-swatch";
      swatch.style.background = palette.vars[cssVar] || "transparent";
      swatch.title = cssVar;
      swatchRow.appendChild(swatch);
    });

    previewContainer.appendChild(swatchRow);

    if (previewName) {
      previewName.textContent = `${palette.label} preview`;
    }
  }

  function applySelectedPalette() {
    const selectedValue = paletteSelect?.value;
    if (!selectedValue) {
      return;
    }

    const nextPreferences = preferencesApi.setPalette(selectedValue);
    renderPalettePreview(nextPreferences.palette);
    setStatus("Palette updated.");
  }

  function resetToDefault() {
    const nextPreferences = preferencesApi.resetPreferences();
    if (paletteSelect) {
      paletteSelect.value = nextPreferences.palette;
    }

    renderPalettePreview(nextPreferences.palette);
    setStatus("Palette reset to default.");
  }

  function restoreAllSettingsToDefault() {
    const confirmed = window.confirm(
      "Restore Impala settings on this browser to defaults? Custom playlists and sign-in are not changed."
    );
    if (!confirmed) {
      return;
    }

    const nextPreferences = preferencesApi.resetPreferences();
    refreshFormFromPreferences(nextPreferences);
    setStatus("Settings restored to defaults for this browser.");
  }

  function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type || "")) {
        reject(new Error("Choose a PNG, JPG, or WebP image."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the selected image."));
      reader.readAsDataURL(file);
    });
  }

  async function applyMedallionFile() {
    const file = medallionFileInput?.files?.[0] || null;
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const nextPreferences = preferencesApi.setCustomContent({
        customNote: customNoteInput?.value,
        medallionSrc: dataUrl
      });

      if (medallionSrcInput) {
        medallionSrcInput.value = nextPreferences.medallionSrc;
      }
      if (medallionPreviewImg) {
        medallionPreviewImg.src = nextPreferences.medallionSrc;
      }

      setStatus("Medallion image saved for this browser.");
    } catch (error) {
      setStatus(error.message || "Unable to save medallion image.");
    }
  }

  function applyCustomContent() {
    const nextPreferences = preferencesApi.setCustomContent({
      customNote: customNoteInput?.value,
      medallionSrc: medallionSrcInput?.value
    });

    if (customNoteInput) {
      customNoteInput.value = nextPreferences.customNote;
    }

    if (medallionSrcInput) {
      medallionSrcInput.value = nextPreferences.medallionSrc;
    }

    if (medallionPreviewImg) {
      medallionPreviewImg.src = nextPreferences.medallionSrc;
    }

    setStatus("Player message and medallion updated.");
  }

  function resetCustomContent() {
    const nextPreferences = preferencesApi.setCustomContent({
      customNote: "",
      medallionSrc: ""
    });

    if (customNoteInput) {
      customNoteInput.value = nextPreferences.customNote;
    }

    if (medallionSrcInput) {
      medallionSrcInput.value = nextPreferences.medallionSrc;
    }

    if (medallionPreviewImg) {
      medallionPreviewImg.src = nextPreferences.medallionSrc;
    }

    setStatus("Player message and medallion reset.");
  }

  function applyCloudConnection() {
    if (!preferencesApi.setCloudConnection) {
      setCloudApiStatus("This build does not support configurable cloud connections yet.");
      return;
    }

    const result = preferencesApi.setCloudConnection({
      cloudApiBaseUrl: cloudApiUrlInput?.value || ""
    });
    const nextPreferences = result.preferences || preferencesApi.getPreferences();

    if (cloudApiUrlInput) {
      cloudApiUrlInput.value = nextPreferences.cloudApiBaseUrl || "";
    }

    setCloudApiStatus(result.sessionCleared
      ? "Cloud connection updated. Current cloud sign-in was cleared; sign in again before browsing S4."
      : "Cloud connection saved.");
  }

  function resetCloudConnection() {
    if (!preferencesApi.resetCloudConnection) {
      setCloudApiStatus("This build does not support configurable cloud connections yet.");
      return;
    }

    const result = preferencesApi.resetCloudConnection();
    const nextPreferences = result.preferences || preferencesApi.getPreferences();

    if (cloudApiUrlInput) {
      cloudApiUrlInput.value = nextPreferences.cloudApiBaseUrl || "";
    }

    setCloudApiStatus(result.sessionCleared
      ? "Default cloud connection restored. Current cloud sign-in was cleared."
      : "Default cloud connection restored.");
  }

  async function testCloudConnection() {
    const baseUrl = String(cloudApiUrlInput?.value || "").trim().replace(/\/+$/, "");
    if (!baseUrl) {
      setCloudApiStatus("Enter a signer API URL first.");
      return;
    }

    setCloudApiStatus("Checking cloud connection...");
    try {
      const response = await fetch(`${baseUrl}/healthz`, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`service returned ${response.status}`);
      }

      setCloudApiStatus("Cloud signer is reachable.");
    } catch (error) {
      setCloudApiStatus(`Cloud signer check failed: ${error?.message || "not reachable"}.`);
    }
  }

  function updateInstanceIdControls(preferences = preferencesApi.getPreferences()) {
    if (instanceIdOutput) {
      instanceIdOutput.value = preferences.instanceId || "";
    }

    if (instanceIdRegenerateButton) {
      instanceIdRegenerateButton.disabled = instanceIdConfirmInput?.checked !== true;
    }
  }

  function regenerateInstanceId() {
    if (!preferencesApi.regenerateInstanceId) {
      setCloudApiStatus("This build does not support Instance ID regeneration yet.");
      return;
    }

    const nextPreferences = preferencesApi.regenerateInstanceId();
    if (instanceIdConfirmInput) {
      instanceIdConfirmInput.checked = false;
    }
    updateInstanceIdControls(nextPreferences);
    setCloudApiStatus("Instance ID regenerated for this browser.");
  }

  function applyLocalMediaDirectories() {
    if (!preferencesApi.setLocalMediaDirectories) {
      setStatus("This build does not support local media directories yet.");
      return;
    }

    const nextPreferences = preferencesApi.setLocalMediaDirectories({
      localAudioDir: localAudioDirInput?.value,
      localVideoDir: localVideoDirInput?.value
    });

    if (localAudioDirInput) {
      localAudioDirInput.value = nextPreferences.localAudioDir || "";
    }

    if (localVideoDirInput) {
      localVideoDirInput.value = nextPreferences.localVideoDir || "";
    }

    setStatus("Local audio/video directories updated.");
  }

  function resetLocalMediaDirectories() {
    if (!preferencesApi.setLocalMediaDirectories) {
      setStatus("This build does not support local media directories yet.");
      return;
    }

    const nextPreferences = preferencesApi.setLocalMediaDirectories({
      localAudioDir: "",
      localVideoDir: ""
    });

    if (localAudioDirInput) {
      localAudioDirInput.value = nextPreferences.localAudioDir || "";
    }

    if (localVideoDirInput) {
      localVideoDirInput.value = nextPreferences.localVideoDir || "";
    }

    setStatus("Local media directories cleared.");
  }

  function applyLocalLibraryJson() {
    if (!preferencesApi.setLocalLibraryJson) {
      setStatus("This build does not support local library JSON yet.");
      return;
    }

    const previousPreferences = preferencesApi.getPreferences?.() || {};
    const previousLocalLibraryJson = String(previousPreferences.localLibraryJson || "").trim();

    const nextPreferences = preferencesApi.setLocalLibraryJson(localLibraryJsonInput?.value || "");
    const nextLocalLibraryJson = String(nextPreferences.localLibraryJson || "").trim();
    const manifestChanged = previousLocalLibraryJson !== nextLocalLibraryJson;

    if (localLibraryJsonInput) {
      localLibraryJsonInput.value = nextPreferences.localLibraryJson || "";
    }

    if (manifestChanged) {
      setStatus("Local library JSON updated. Saved player state was reset to avoid stale track restores.");
      return;
    }

    setStatus("Local library JSON updated.");
  }

  function resetLocalLibraryJson() {
    if (!preferencesApi.setLocalLibraryJson) {
      setStatus("This build does not support local library JSON yet.");
      return;
    }

    const nextPreferences = preferencesApi.setLocalLibraryJson("");

    if (localLibraryJsonInput) {
      localLibraryJsonInput.value = nextPreferences.localLibraryJson || "";
    }

    setStatus("Local library JSON cleared.");
  }

  function applyLiveStreamPreference() {
    if (!preferencesApi.setLiveStreamEnabled || !liveStreamEnabledInput) {
      setLiveStreamStatus("This build does not support live stream controls yet.");
      return;
    }

    const nextPreferences = preferencesApi.setLiveStreamEnabled(liveStreamEnabledInput.checked);
    liveStreamEnabledInput.checked = nextPreferences.liveStreamEnabled === true;
    setLiveStreamStatus(nextPreferences.liveStreamEnabled
      ? "Live Stream controls enabled. A Live Stream link is now available on the player."
      : "Live Stream controls disabled. The core player remains unchanged.");
  }

  function applyPlaybackTransitionPreference() {
    if (!preferencesApi.setSkipTailSilenceEnabled || !skipTailSilenceEnabledInput) {
      return;
    }

    const nextPreferences = preferencesApi.setSkipTailSilenceEnabled(skipTailSilenceEnabledInput.checked);
    skipTailSilenceEnabledInput.checked = nextPreferences.skipTailSilenceEnabled === true;
    if (playbackTransitionStatusNode) {
      playbackTransitionStatusNode.textContent = nextPreferences.skipTailSilenceEnabled
        ? "Excessive tail silence will be skipped when a track provides an analyzed audible endpoint."
        : "Tail-silence skipping is off.";
    }
  }

  function applySyncPlaySettings() {
    if (!preferencesApi.setSyncPlaySettings) {
      setSyncPlayStatus("This build does not support Sync Play yet.");
      return;
    }
    const nextPreferences = preferencesApi.setSyncPlaySettings({
      enabled: syncPlayEnabledInput?.checked === true,
      apiBaseUrl: syncPlayApiUrlInput?.value
    });
    if (syncPlayEnabledInput) syncPlayEnabledInput.checked = nextPreferences.syncPlayEnabled;
    if (syncPlayApiUrlInput) syncPlayApiUrlInput.value = nextPreferences.syncPlayApiBaseUrl;
    setSyncPlayStatus(nextPreferences.syncPlayEnabled
      ? "Sync Play controls enabled on the video player."
      : "Sync Play is off. Core playback remains independent.");
  }

  function applyCoastSettings() {
    const next = preferencesApi.setCoastSettings?.({
      enabled: coastEnabledInput?.checked === true,
      apiBaseUrl: coastApiUrlInput?.value
    });
    if (!next) return setCoastStatus("This build does not support Coast to Coast yet.");
    coastEnabledInput.checked = next.coastEnabled;
    coastApiUrlInput.value = next.coastApiBaseUrl;
    setCoastStatus(next.coastEnabled ? "Coast to Coast controls enabled on the video player." : "Coast to Coast is off.");
  }

  function saveLocalHelperSettings(options = {}) {
    const { includeEnabled = true, forceEnabled = false } = options;
    if (!preferencesApi.setLocalHelperSettings) {
      setLocalHelperStatus("This build does not support Local Library Companion settings yet.");
      return null;
    }

    const currentPreferences = preferencesApi.getPreferences?.() || {};
    const nextPreferences = preferencesApi.setLocalHelperSettings({
      localHelperEnabled: forceEnabled
        ? true
        : (includeEnabled ? localHelperEnabledInput?.checked === true : currentPreferences.localHelperEnabled === true),
      localHelperRoot: localHelperRootInput?.value || "",
      localHelperPort: localHelperPortInput?.value || "8089"
    });

    if (localHelperEnabledInput) {
      localHelperEnabledInput.checked = nextPreferences.localHelperEnabled === true;
    }
    if (localHelperRootInput) {
      localHelperRootInput.value = nextPreferences.localHelperRoot || "";
    }
    if (localHelperPortInput) {
      localHelperPortInput.value = nextPreferences.localHelperPort || "8089";
    }

    return nextPreferences;
  }

  async function checkLocalHelperConnection({ quiet = false } = {}) {
    const preferences = saveLocalHelperSettings({ includeEnabled: false });
    if (!preferences) {
      return null;
    }

    const baseUrl = getLocalHelperBaseUrl(preferences.localHelperPort);
    if (!quiet) {
      setLocalHelperStatus(`Checking ${baseUrl}...`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`helper returned ${response.status}`);
      }

      const payload = await response.json();
      const trackCount = Number.isFinite(payload?.trackCount) ? payload.trackCount : 0;
      const mkvStatus = payload?.mkvReady === true
        ? " MKV tools ready; prepared copies are saved beside their originals."
        : " MKV tools unavailable; install FFmpeg and FFprobe for local MKV playback.";
      const timingCacheBytes = Number(payload?.timingCacheBytes || 0);
      const timingCacheLimitBytes = Number(payload?.timingCacheLimitBytes || 0);
      const timingCacheStatus = timingCacheLimitBytes > 0
        ? ` Voice Sync cache: ${(timingCacheBytes / 1073741824).toFixed(1)} of ${(timingCacheLimitBytes / 1073741824).toFixed(0)} GB.`
        : "";
      setLocalHelperStatus(preferences.localHelperEnabled
        ? `Connected to Local Library Companion. ${trackCount} media item${trackCount === 1 ? "" : "s"} indexed.${mkvStatus}${timingCacheStatus}`
        : `Helper is running with ${trackCount} indexed media item${trackCount === 1 ? "" : "s"}, but Local Library Companion is off. Turn it on or use Connect / Rescan to activate it.${mkvStatus}${timingCacheStatus}`);
      return { baseUrl, payload };
    } catch (error) {
      setLocalHelperStatus(`Local Library Companion is not running at ${baseUrl}. Download/start it, then check again.`);
      return null;
    }
  }

  async function connectLocalHelper() {
    const preferences = saveLocalHelperSettings({ forceEnabled: true });
    if (!preferences) {
      return;
    }

    if (!preferences.localHelperRoot) {
      setLocalHelperStatus("Enter the Media Folder for this PC first.");
      return;
    }

    const baseUrl = getLocalHelperBaseUrl(preferences.localHelperPort);
    setLocalHelperStatus("Connecting and scanning local library...");

    try {
      const response = await fetch(`${baseUrl}/library/set-root`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ root: preferences.localHelperRoot })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      const trackCount = Number.isFinite(payload?.trackCount) ? payload.trackCount : 0;
      setLocalHelperStatus(`Local library connected and enabled. ${trackCount} media item${trackCount === 1 ? "" : "s"} indexed. Open Library & Playlists to use it.`);
    } catch (error) {
      setLocalHelperStatus(`Unable to connect local library: ${error?.message || "helper unavailable"}`);
    }
  }

  function readDroppedTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read the dropped JSON file."));
      reader.readAsText(file);
    });
  }

  function readSelectedBackupFile() {
    return new Promise((resolve, reject) => {
      const file = backupImportInput?.files?.[0] || null;
      if (!file) {
        reject(new Error("Choose a backup JSON file first."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result || "")));
        } catch (error) {
          reject(new Error(`Backup file is not valid JSON: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error("Unable to read the backup file."));
      reader.readAsText(file);
    });
  }

  function refreshFormFromPreferences(preferences) {
    const currentPreferences = preferences || preferencesApi.getPreferences();

    if (paletteSelect) {
      paletteSelect.value = currentPreferences.palette;
      renderPalettePreview(currentPreferences.palette);
    }

    if (customNoteInput) {
      customNoteInput.value = currentPreferences.customNote || "";
    }

    if (medallionSrcInput) {
      medallionSrcInput.value = currentPreferences.medallionSrc || "";
    }

    if (medallionPreviewImg) {
      medallionPreviewImg.src = currentPreferences.medallionSrc || "assets/ddMusic.ico";
    }

    if (cloudApiUrlInput) {
      cloudApiUrlInput.value = currentPreferences.cloudApiBaseUrl || "";
    }

    updateInstanceIdControls(currentPreferences);

    if (localAudioDirInput) {
      localAudioDirInput.value = currentPreferences.localAudioDir || "";
    }

    if (localVideoDirInput) {
      localVideoDirInput.value = currentPreferences.localVideoDir || "";
    }

    if (localLibraryJsonInput) {
      localLibraryJsonInput.value = currentPreferences.localLibraryJson || "";
    }

    if (localHelperEnabledInput) {
      localHelperEnabledInput.checked = currentPreferences.localHelperEnabled === true;
    }
    if (metadataEnabledInput) metadataEnabledInput.checked = currentPreferences.metadataEnabled === true;
    setMetadataStatus(currentPreferences.metadataEnabled === true);

    if (localHelperRootInput) {
      localHelperRootInput.value = currentPreferences.localHelperRoot || "";
    }

    if (localHelperPortInput) {
      localHelperPortInput.value = currentPreferences.localHelperPort || "8089";
    }

    setLocalHelperStatus(currentPreferences.localHelperEnabled === true
      ? "Local Library Companion enabled. Start the helper, then connect or rescan."
      : "Local Library Companion is off.");

    if (liveStreamEnabledInput) {
      liveStreamEnabledInput.checked = currentPreferences.liveStreamEnabled === true;
    }
    if (skipTailSilenceEnabledInput) {
      skipTailSilenceEnabledInput.checked = currentPreferences.skipTailSilenceEnabled === true;
    }
    if (syncPlayEnabledInput) {
      syncPlayEnabledInput.checked = currentPreferences.syncPlayEnabled === true;
    }
    if (syncPlayApiUrlInput) {
      syncPlayApiUrlInput.value = currentPreferences.syncPlayApiBaseUrl || "";
    }
    if (coastEnabledInput) coastEnabledInput.checked = currentPreferences.coastEnabled === true;
    if (coastApiUrlInput) coastApiUrlInput.value = currentPreferences.coastApiBaseUrl || "";
  }

  function exportBackupJson() {
    if (!backupApi?.downloadBackup) {
      setBackupStatus("Backup service is unavailable.");
      return;
    }

    const backup = backupApi.downloadBackup();
    const playlistCount = Array.isArray(backup.customPlaylists) ? backup.customPlaylists.length : 0;
    const filename = backup.downloadFilename || "impala-backup.json";
    setBackupStatus(`Backup exported with ${playlistCount} custom playlist${playlistCount === 1 ? "" : "s"} to your browser Downloads folder as ${filename}.`);
  }

  async function restoreBackupJson() {
    if (!backupApi?.restoreBackup) {
      setBackupStatus("Backup service is unavailable.");
      return;
    }

    try {
      const backup = await readSelectedBackupFile();
      const result = backupApi.restoreBackup(backup);
      refreshFormFromPreferences();
      setBackupStatus(`Backup restored: ${result.restoredKeys.join(", ")}. Reload the player to use restored state.`);
    } catch (error) {
      setBackupStatus(error.message || "Unable to restore backup.");
    }
  }

  async function loadLocalLibraryJsonFromDrop(event) {
    event.preventDefault();

    if (!localLibraryJsonInput) {
      return;
    }

    localLibraryJsonInput.classList.remove("is-dragover");

    const file = event.dataTransfer?.files?.[0] || null;
    let droppedText = "";

    if (file) {
      droppedText = await readDroppedTextFile(file);
    } else {
      droppedText = event.dataTransfer?.getData("text/plain") || "";
    }

    const trimmedText = String(droppedText || "").trim();
    if (!trimmedText) {
      setStatus("Drop a JSON file or paste JSON into the box.");
      return;
    }

    localLibraryJsonInput.value = trimmedText;
    applyLocalLibraryJson();
  }

  function normalizeProbeTarget(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }

    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }

  async function testLocalMediaDirectory(kind) {
    const isVideo = kind === "video";
    const label = isVideo ? "video" : "audio";
    const inputNode = isVideo ? localVideoDirInput : localAudioDirInput;
    const probeTarget = normalizeProbeTarget(inputNode?.value);

    if (!probeTarget) {
      setStatus(`Enter a local ${label} directory first.`);
      return;
    }

    if (/^file:\/\//i.test(probeTarget)) {
      setStatus(`Saved ${label} file:// path. Browser checks for file:// are limited from hosted pages, so test playback in the player page.`);
      return;
    }

    try {
      const response = await fetch(probeTarget, {
        method: "GET",
        cache: "no-store"
      });

      if (response.ok) {
        setStatus(`Local ${label} root reachable (${response.status}).`);
      } else {
        setStatus(`Local ${label} root responded with ${response.status}. Path may still be valid if files under it are reachable.`);
      }
    } catch (error) {
      setStatus(`Could not reach local ${label} root: ${error?.message || "network/CORS blocked"}.`);
    }
  }

  function initialize() {
    if (!paletteSelect) {
      return;
    }

    const currentPreferences = preferencesApi.getPreferences();

    paletteOptions.forEach((option) => {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.label;
      paletteSelect.appendChild(node);
    });

    paletteSelect.value = currentPreferences.palette;
    renderPalettePreview(currentPreferences.palette);

    if (customNoteInput) {
      customNoteInput.value = currentPreferences.customNote || "";
    }

    if (medallionSrcInput) {
      medallionSrcInput.value = currentPreferences.medallionSrc || "";
    }

    if (cloudApiUrlInput) {
      cloudApiUrlInput.value = currentPreferences.cloudApiBaseUrl || "";
    }

    updateInstanceIdControls(currentPreferences);

    if (localAudioDirInput) {
      localAudioDirInput.value = currentPreferences.localAudioDir || "";
    }

    if (localVideoDirInput) {
      localVideoDirInput.value = currentPreferences.localVideoDir || "";
    }

    if (localLibraryJsonInput) {
      localLibraryJsonInput.value = currentPreferences.localLibraryJson || "";
    }

    if (localHelperEnabledInput) {
      localHelperEnabledInput.checked = currentPreferences.localHelperEnabled === true;
    }
    if (metadataEnabledInput) metadataEnabledInput.checked = currentPreferences.metadataEnabled === true;
    setMetadataStatus(currentPreferences.metadataEnabled === true);

    if (localHelperRootInput) {
      localHelperRootInput.value = currentPreferences.localHelperRoot || "";
    }

    if (localHelperPortInput) {
      localHelperPortInput.value = currentPreferences.localHelperPort || "8089";
    }

    configureLocalHelperDownloadLink();
    setLocalHelperStatus(currentPreferences.localHelperEnabled === true
      ? "Local Library Companion enabled. Start the helper, then connect or rescan."
      : "Local Library Companion is off.");

    if (liveStreamEnabledInput) {
      liveStreamEnabledInput.checked = currentPreferences.liveStreamEnabled === true;
    }
    if (skipTailSilenceEnabledInput) {
      skipTailSilenceEnabledInput.checked = currentPreferences.skipTailSilenceEnabled === true;
    }
    if (syncPlayEnabledInput) {
      syncPlayEnabledInput.checked = currentPreferences.syncPlayEnabled === true;
    }
    if (syncPlayApiUrlInput) {
      syncPlayApiUrlInput.value = currentPreferences.syncPlayApiBaseUrl || "";
    }
    if (coastEnabledInput) coastEnabledInput.checked = currentPreferences.coastEnabled === true;
    if (coastApiUrlInput) coastApiUrlInput.value = currentPreferences.coastApiBaseUrl || "";

    paletteSelect.addEventListener("change", () => {
      const previewPalette = paletteSelect.value;
      preferencesApi.applyPreferences({ palette: previewPalette });
      renderPalettePreview(previewPalette);
      setStatus("Previewing selected palette. Click Apply Palette to save.");
    });

    applyButton?.addEventListener("click", applySelectedPalette);
    resetButton?.addEventListener("click", resetToDefault);
    settingsResetButton?.addEventListener("click", restoreAllSettingsToDefault);
    customizeApplyButton?.addEventListener("click", applyCustomContent);
    customizeResetButton?.addEventListener("click", resetCustomContent);
    medallionFileInput?.addEventListener("change", applyMedallionFile);
    cloudApiApplyButton?.addEventListener("click", applyCloudConnection);
    cloudApiResetButton?.addEventListener("click", resetCloudConnection);
    cloudApiTestButton?.addEventListener("click", testCloudConnection);
    instanceIdConfirmInput?.addEventListener("change", () => {
      updateInstanceIdControls();
    });
    instanceIdRegenerateButton?.addEventListener("click", regenerateInstanceId);
    mediaRootsApplyButton?.addEventListener("click", applyLocalMediaDirectories);
    mediaRootsResetButton?.addEventListener("click", resetLocalMediaDirectories);
    mediaRootsTestAudioButton?.addEventListener("click", () => {
      testLocalMediaDirectory("audio");
    });
    mediaRootsTestVideoButton?.addEventListener("click", () => {
      testLocalMediaDirectory("video");
    });
    localLibraryApplyButton?.addEventListener("click", applyLocalLibraryJson);
    localLibraryResetButton?.addEventListener("click", resetLocalLibraryJson);
    localHelperEnabledInput?.addEventListener("change", () => {
      const nextPreferences = saveLocalHelperSettings();
      setLocalHelperStatus(nextPreferences?.localHelperEnabled
        ? "Local Library Companion enabled. Start the helper, then connect or rescan."
        : "Local Library Companion is off.");
    });
    metadataEnabledInput?.addEventListener("change", applyMetadataPreference);
    localHelperRootInput?.addEventListener("change", saveLocalHelperSettings);
    localHelperPortInput?.addEventListener("change", saveLocalHelperSettings);
    localHelperDownloadLink?.addEventListener("click", (event) => {
      if (localHelperDownloadLink.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        setLocalHelperStatus("Companion download is not published yet. For pilot, place Impala-Helper.exe in C:\\Users\\<you>\\Impala-Helper and start it there.");
      }
    });
    localHelperCheckButton?.addEventListener("click", () => {
      checkLocalHelperConnection();
    });
    localHelperConnectButton?.addEventListener("click", connectLocalHelper);
    liveStreamEnabledInput?.addEventListener("change", applyLiveStreamPreference);
    skipTailSilenceEnabledInput?.addEventListener("change", applyPlaybackTransitionPreference);
    syncPlayApplyButton?.addEventListener("click", applySyncPlaySettings);
    coastApplyButton?.addEventListener("click", applyCoastSettings);
    backupExportButton?.addEventListener("click", exportBackupJson);
    backupRestoreButton?.addEventListener("click", restoreBackupJson);

    localLibraryJsonInput?.addEventListener("dragover", (event) => {
      event.preventDefault();
      localLibraryJsonInput.classList.add("is-dragover");
    });

    localLibraryJsonInput?.addEventListener("dragleave", () => {
      localLibraryJsonInput.classList.remove("is-dragover");
    });

    localLibraryJsonInput?.addEventListener("drop", loadLocalLibraryJsonFromDrop);
  }

  initialize();
})();
