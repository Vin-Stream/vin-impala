(() => {
  const panel = document.getElementById("media-metadata");
  const artwork = document.getElementById("player-medallion");
  const video = document.getElementById("videoPlayer");
  const videoArtworkPanel = document.getElementById("video-artwork-panel");
  const videoArtwork = document.getElementById("video-artwork");
  const fields = {
    kicker: document.getElementById("media-metadata-kicker"),
    title: document.getElementById("media-metadata-title"),
    detail: document.getElementById("media-metadata-detail"),
    summary: document.getElementById("media-metadata-summary"),
    source: document.getElementById("media-metadata-source")
  };
  const cache = new Map();
  let requestId = 0;
  let activeKey = "";
  let ownerArtworkUrl = "";

  function cleanTitle(value) {
    return String(value || "")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[._]+/g, " ")
      .replace(/\b(?:2160p|1080p|720p|4k|uhd|bluray|blu-ray|webrip|web-dl|hdr|x26[45]|h26[45])\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function render(metadata) {
    if (!metadata) return;
    if (panel) {
      fields.kicker.textContent = metadata.kind === "movie" ? "Film information" : "Album information";
      fields.title.textContent = metadata.title || "";
      fields.detail.textContent = [metadata.artist || metadata.director, metadata.year].filter(Boolean).join(" · ");
      fields.summary.textContent = metadata.summary || "";
      fields.summary.hidden = !metadata.summary;
      fields.source.href = metadata.sourceUrl || "#";
      fields.source.hidden = !metadata.sourceUrl;
    }
    if (metadata.artworkUrl && artwork) {
      if (!ownerArtworkUrl) ownerArtworkUrl = artwork.src;
      artwork.src = metadata.artworkUrl;
      artwork.alt = `${metadata.title || "Media"} artwork`;
    }
    if (metadata.kind === "movie" && videoArtwork && videoArtworkPanel) {
      const posterUrl = metadata.posterUrl || metadata.artworkUrl;
      if (posterUrl) {
        videoArtwork.src = posterUrl;
        videoArtwork.alt = `${metadata.title || "Video"} poster`;
        videoArtworkPanel.hidden = false;
        document.body.classList.add("has-video-artwork");
      }
    }
    if (panel) panel.hidden = false;
  }

  async function lookup({ kind, title = "", artist = "", year = "", provider = "", providerId = "" } = {}) {
    if (!kind || (!title && !providerId)) return null;
    const key = `${kind}:${provider}:${providerId}:${title}:${artist}:${year}`.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const endpoint = window.ImpalaConfig?.getMetadataApiUrl?.() || "";
    if (!endpoint) return null;
    const params = new URLSearchParams({ kind, title });
    if (artist) params.set("artist", artist);
    if (year) params.set("year", year);
    if (provider) params.set("provider", provider);
    if (providerId) params.set("providerId", providerId);
    const response = await fetch(`${endpoint}?${params}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.metadata) return null;
    cache.set(key, payload.metadata);
    return payload.metadata;
  }

  async function showFor(media, mediaKind = "audio") {
    if (!media) return;
    const kind = mediaKind === "video" ? "movie" : "album";
    const title = cleanTitle(kind === "album" ? (media.album || media.name) : (media.title || media.name));
    const artist = kind === "album" ? String(media.artist || "").trim() : "";
    if (!title) return;
    const key = `${kind}:${title}:${artist}`.toLowerCase();
    if (key === activeKey) return;
    activeKey = key;
    const currentRequest = ++requestId;
    if (panel) panel.hidden = true;
    if (videoArtworkPanel) videoArtworkPanel.hidden = true;
    if (videoArtwork) videoArtwork.removeAttribute("src");
    document.body.classList.remove("has-video-artwork");
    video?.removeAttribute("poster");
    if (ownerArtworkUrl && artwork) {
      artwork.src = ownerArtworkUrl;
      artwork.alt = "Impala Streamer artwork";
    }
    try {
      const metadata = await lookup({ kind, title, artist });
      if (currentRequest !== requestId || !metadata) return;
      render(metadata);
    } catch (_) {
      if (currentRequest === requestId) activeKey = "";
      // Enrichment is optional; playback must never depend on a third party.
    }
  }

  document.addEventListener("impala:mediachange", (event) => {
    showFor(event.detail?.media, event.detail?.mediaKind);
  });

  window.ImpalaMetadata = { cleanTitle, lookup, showFor };
})();

