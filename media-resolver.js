(() => {
  function isVideoExtension(extension) {
    return ["mp4", "m4v", "webm", "mov", "mkv"].includes(extension);
  }

  function getMediaPath(song) {
    if (song?.source === "local-library" && song?.file) {
      return String(song.file).trim();
    }

    return String(song?.objectKey || song?.file || "").trim();
  }

  function isAbsoluteMediaUrl(mediaPath) {
    return /^(https?:|file:|blob:|data:)/i.test(String(mediaPath || ""));
  }

  function getLocalMediaRoots() {
    const preferencesApi = window.UiPreferences;
    if (!preferencesApi?.getPreferences) {
      return { audio: "", video: "" };
    }

    const preferences = preferencesApi.getPreferences() || {};
    return {
      audio: String(preferences.localAudioDir || "").trim().replace(/\/+$/, ""),
      video: String(preferences.localVideoDir || "").trim().replace(/\/+$/, "")
    };
  }

  function getLocalHelperBaseUrl() {
    const preferencesApi = window.UiPreferences;
    const preferences = preferencesApi?.getPreferences?.() || {};
    const parsedPort = Number.parseInt(String(preferences.localHelperPort || "8089").trim(), 10);
    const safePort = Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535
      ? parsedPort
      : 8089;
    return `http://127.0.0.1:${safePort}`;
  }

  function isLocalHelperEnabled() {
    const preferencesApi = window.UiPreferences;
    const preferences = preferencesApi?.getPreferences?.() || {};
    return preferences.localHelperEnabled === true;
  }

  function resolveLocalServiceUrl(song) {
    if (song?.source !== "local-service" || !isLocalHelperEnabled()) {
      return "";
    }

    const id = String(song.objectKey || song.file || song.id || "").trim();
    return id ? `${getLocalHelperBaseUrl()}/library/file?id=${encodeURIComponent(id)}` : "";
  }

  function isLocalServiceMkv(song, mediaInfo = getMediaInfo(song)) {
	return song?.source === "local-service" && mediaInfo.extension === "mkv";
  }

  function isLocalServiceVideo(song, mediaInfo = getMediaInfo(song)) {
	return song?.source === "local-service" && mediaInfo.mediaKind === "video";
  }

  function wait(milliseconds) {
	return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function normalizeVoiceSyncOffset(value) {
	const parsedOffset = Number(value || 0);
	if (!Number.isFinite(parsedOffset)) {
		return 0;
	}
	const boundedOffset = Math.max(-2000, Math.min(2000, parsedOffset));
	return Math.sign(boundedOffset) * Math.round(Math.abs(boundedOffset) / 50) * 50;
  }

  async function prepareLocalMkv(song, options = {}) {
	const mediaInfo = getMediaInfo(song);
	if (!isLocalServiceMkv(song, mediaInfo)) {
		throw new Error("Local MKV preparation requires a Companion MKV library entry.");
	}

	const id = String(song.objectKey || song.file || song.id || "").trim();
	if (!id) {
		throw new Error("This MKV is missing its local library identifier.");
	}

	const baseUrl = getLocalHelperBaseUrl();
	const voiceSyncMs = normalizeVoiceSyncOffset(options.voiceSyncMs);
	const query = new URLSearchParams({ id, voiceSyncMs: String(voiceSyncMs) });
	const endpoint = `${baseUrl}/library/mkv/prepare?${query.toString()}`;
	const startedAt = Date.now();
	// Full-length video preparation can take several hours on modest hardware.
	// The Companion owns the durable background job, so the browser should not
	// report a false failure while FFmpeg is still making forward progress.
	const timeoutMs = Math.max(60000, Number(options.timeoutMs || 6 * 60 * 60 * 1000));
	let method = "POST";

	while (Date.now() - startedAt < timeoutMs) {
		const response = await fetch(endpoint, {
			method,
			cache: "no-store",
			signal: options.signal
		});
		if (!response.ok) {
			const detail = String(await response.text()).trim();
			throw new Error(detail || `Local Library Companion returned ${response.status}.`);
		}

		const payload = await response.json();
		const preparation = payload?.preparation || {};
		const status = String(preparation.status || "").trim().toLowerCase();
		const progress = Math.max(0, Math.min(100, Number(preparation.progress || 0)));
		options.onProgress?.({ status, progress, message: String(preparation.message || "") });

		if (status === "ready") {
			const mediaUrl = String(payload.mediaUrl || "").trim();
			if (!mediaUrl) {
				throw new Error("The Companion prepared this MKV but did not return its playback URL.");
			}
			return new URL(mediaUrl, `${baseUrl}/`).href;
		}
		if (status === "error") {
			throw new Error(preparation.message || "The Companion could not prepare this MKV.");
		}

		method = "GET";
		await wait(1000);
	}

	throw new Error("The browser stopped waiting for MKV preparation. The Companion may still be working; the original file was not changed.");
  }

  async function saveLocalMkvTiming(song, voiceSyncMs) {
	const mediaInfo = getMediaInfo(song);
	if (!isLocalServiceMkv(song, mediaInfo)) {
		throw new Error("Saved Voice Sync requires a Companion MKV library entry.");
	}
	const id = String(song.objectKey || song.file || song.id || "").trim();
	const normalizedOffset = normalizeVoiceSyncOffset(voiceSyncMs);
	const response = await fetch(`${getLocalHelperBaseUrl()}/library/mkv/timing`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id, voiceSyncMs: normalizedOffset })
	});
	if (!response.ok) {
		const detail = String(await response.text()).trim();
		throw new Error(detail || `Local Library Companion returned ${response.status}.`);
	}
	return response.json();
  }

  async function pollCompanionJob(endpoint, options = {}) {
	const startedAt = Date.now();
	const timeoutMs = Math.max(60000, Number(options.timeoutMs || 6 * 60 * 60 * 1000));
	let method = "POST";
	while (Date.now() - startedAt < timeoutMs) {
		const response = await fetch(endpoint, { method, cache: "no-store", signal: options.signal });
		if (!response.ok) {
			const detail = String(await response.text()).trim();
			throw new Error(detail || `Local Library Companion returned ${response.status}.`);
		}
		const payload = await response.json();
		const preparation = payload?.preparation || {};
		const status = String(preparation.status || "").trim().toLowerCase();
		options.onProgress?.({
			status,
			progress: Math.max(0, Math.min(100, Number(preparation.progress || 0))),
			message: String(preparation.message || ""),
			payload
		});
		if (status === "ready") {
			return payload;
		}
		if (status === "error") {
			throw new Error(preparation.message || "The Companion could not complete this video job.");
		}
		method = "GET";
		await wait(1000);
	}
	throw new Error("The browser stopped waiting. The Companion may still be working in the background.");
  }

  async function prepareLocalVideoTiming(song, options = {}) {
	const mediaInfo = getMediaInfo(song);
	if (!isLocalServiceVideo(song, mediaInfo)) {
		throw new Error("Voice Sync requires a Companion local-video entry.");
	}
	if (isLocalServiceMkv(song, mediaInfo)) {
		return prepareLocalMkv(song, options);
	}
	const id = String(song.objectKey || song.file || song.id || "").trim();
	const voiceSyncMs = normalizeVoiceSyncOffset(options.voiceSyncMs);
	const query = new URLSearchParams({ id, voiceSyncMs: String(voiceSyncMs) });
	const payload = await pollCompanionJob(`${getLocalHelperBaseUrl()}/library/video/sync?${query}`, options);
	const mediaUrl = String(payload.mediaUrl || "").trim();
	if (!mediaUrl) {
		throw new Error("The Companion did not return the adjusted video URL.");
	}
	return new URL(mediaUrl, `${getLocalHelperBaseUrl()}/`).href;
  }

  async function saveLocalVideoTiming(song, voiceSyncMs) {
	const id = String(song?.objectKey || song?.file || song?.id || "").trim();
	const response = await fetch(`${getLocalHelperBaseUrl()}/library/video/timing`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id, voiceSyncMs: normalizeVoiceSyncOffset(voiceSyncMs) })
	});
	if (!response.ok) {
		throw new Error(String(await response.text()).trim() || "Voice Sync timing could not be saved.");
	}
	return response.json();
  }

  async function createCorrectedLocalVideo(song, voiceSyncMs, options = {}) {
	const id = String(song?.objectKey || song?.file || song?.id || "").trim();
	const query = new URLSearchParams({ id, voiceSyncMs: String(normalizeVoiceSyncOffset(voiceSyncMs)) });
	return pollCompanionJob(`${getLocalHelperBaseUrl()}/library/video/corrected?${query}`, options);
  }

  async function getLocalMkvGroup(song) {
	const id = String(song?.objectKey || song?.file || song?.id || "").trim();
	const response = await fetch(`${getLocalHelperBaseUrl()}/library/mkv/group?id=${encodeURIComponent(id)}`, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(String(await response.text()).trim() || "Related MKV titles could not be inspected.");
	}
	return response.json();
  }

  function buildLocalMediaUrl(baseRoot, mediaPath, mediaKind) {
    if (isAbsoluteMediaUrl(mediaPath)) {
      return String(mediaPath).trim();
    }

    const base = String(baseRoot || "").trim().replace(/\/+$/, "");
    if (!base || !mediaPath) {
      return "";
    }

    const normalizedPath = String(mediaPath).replace(/^\/+/, "");
    const relativePath = mediaKind === "video"
      ? normalizedPath.replace(/^videos?\//i, "")
      : normalizedPath.replace(/^audio\//i, "");

    if (!relativePath) {
      return "";
    }

    const encodedPath = relativePath
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return encodedPath ? `${base}/${encodedPath}` : "";
  }

  function getMimeCandidates(extension) {
    switch (extension) {
      case "flac":
        return ["audio/flac", "audio/x-flac"];
      case "mp3":
        return ["audio/mpeg"];
      case "m4a":
        return ["audio/mp4"];
      case "mp4":
        return ["video/mp4", "audio/mp4"];
      case "mkv":
        return ["video/x-matroska", "video/matroska"];
      case "wav":
        return ["audio/wav", "audio/wave"];
      case "ogg":
        return ["audio/ogg"];
      case "opus":
        return ["audio/ogg; codecs=opus", "audio/opus"];
      case "aac":
        return ["audio/aac"];
      default:
        return [];
    }
  }

  function getMediaInfo(song) {
    const mediaPath = getMediaPath(song);
    const match = mediaPath.match(/\.([a-z0-9]+)$/i);
    const extension = match ? match[1].toLowerCase() : "";
    const mimeCandidates = getMimeCandidates(extension);
    const declaredMediaType = String(song?.mediaType || "").trim().toLowerCase();

    let detectionPath = "defaulted to audio";
    if (declaredMediaType === "video") {
      detectionPath = "declared mediaType=video";
    } else if (declaredMediaType === "audio") {
      detectionPath = "declared mediaType=audio";
    } else if (isVideoExtension(extension)) {
      detectionPath = `video extension .${extension}`;
    } else if (extension) {
      detectionPath = `audio/default extension .${extension}`;
    }

    return {
      path: mediaPath,
      extension,
      mediaKind: declaredMediaType === "video" || isVideoExtension(extension)
        ? "video"
        : "audio",
      mimeCandidates,
      preferredMimeType: mimeCandidates[0] || "",
      detectionPath
    };
  }

  function resolveLocalMediaUrl(song, mediaInfo = getMediaInfo(song)) {
    const localServiceUrl = resolveLocalServiceUrl(song);
    if (localServiceUrl) {
      return localServiceUrl;
    }

    const mediaPath = getMediaPath(song);
    const localMediaRoots = getLocalMediaRoots();
    const localRoot = mediaInfo.mediaKind === "video" ? localMediaRoots.video : localMediaRoots.audio;
    return buildLocalMediaUrl(localRoot, mediaPath, mediaInfo.mediaKind);
  }

  window.MediaResolver = {
    isVideoExtension,
    getMediaPath,
    isAbsoluteMediaUrl,
    getLocalMediaRoots,
    getLocalHelperBaseUrl,
    isLocalHelperEnabled,
	isLocalServiceMkv,
	prepareLocalMkv,
	prepareLocalVideoTiming,
	saveLocalMkvTiming,
	saveLocalVideoTiming,
	createCorrectedLocalVideo,
	getLocalMkvGroup,
	isLocalServiceVideo,
    buildLocalMediaUrl,
    getMimeCandidates,
    getMediaInfo,
    resolveLocalServiceUrl,
    resolveLocalMediaUrl
  };
})();
