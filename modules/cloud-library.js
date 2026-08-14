(() => {
  function create(options = {}) {
    const request = options.request;
    const getApiBaseUrl = options.getApiBaseUrl || (() => "");
    const forceSignerContentType = Boolean(options.forceSignerContentType);

    async function resolveCloudMedia(song, mediaInfo = {}) {
      if (!song?.objectKey) {
        throw new Error("This song is missing both objectKey and file path.");
      }
      if (!getApiBaseUrl()) {
        throw new Error("This song uses a private object key, but no API signer is configured.");
      }

      const query = new URLSearchParams({
        key: song.objectKey,
        media: mediaInfo.mediaKind
      });
      const explicitContentType = String(song.contentType || "").trim().toLowerCase();
      const preferredMimeType = String(mediaInfo.preferredMimeType || "").trim().toLowerCase();

      if (explicitContentType) {
        query.set("contentType", explicitContentType);
      } else if (mediaInfo.mediaKind === "video" && preferredMimeType) {
        query.set("contentType", preferredMimeType);
      } else if (forceSignerContentType && preferredMimeType) {
        query.set("contentType", preferredMimeType);
      }

      const payload = await request(`/api/media-url?${query.toString()}`);
      if (!payload?.url) {
        throw new Error("The signer did not return a media URL.");
      }
      return { url: payload.url, source: "cloud" };
    }

    return { resolveCloudMedia };
  }

  window.ImpalaCloudLibrary = { create };
})();
