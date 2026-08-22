(() => {
  const observed = new WeakSet();
  const playlistPayloads = new WeakMap();
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          if (entry.target.classList.contains("playlist-artwork-poster")) {
            enrichPlaylistPoster(entry.target, playlistPayloads.get(entry.target));
          } else {
            enrich(entry.target);
          }
        });
      }, { rootMargin: "160px" })
    : null;

  async function enrich(item) {
    const image = item.querySelector(".library-metadata-artwork");
    if (!image || image.src || !item.dataset.metadataKind || !item.dataset.metadataTitle) return;
    try {
      const metadata = await window.ImpalaMetadata?.lookup?.({
        kind: item.dataset.metadataKind,
        title: item.dataset.metadataTitle,
        artist: item.dataset.metadataArtist || "",
        provider: item.dataset.metadataProvider || "",
        providerId: item.dataset.metadataProviderId || ""
      });
      const source = metadata?.posterUrl || metadata?.artworkUrl || "";
      if (source) image.src = source;
    } catch (_) {
      // Library browsing remains fully functional without enrichment.
    }
  }

  function watch(root) {
    root?.querySelectorAll?.(".library-song.has-metadata-artwork").forEach((item) => {
      if (observed.has(item)) return;
      observed.add(item);
      if (observer) observer.observe(item);
      else enrich(item);
    });
  }

  async function enrichPlaylistPoster(poster, playlist) {
    const songs = Array.isArray(playlist?.songs) ? playlist.songs : [];
    const albums = [];
    const seen = new Set();
    for (const song of songs) {
      const title = String(song?.album || "").trim();
      const artist = String(song?.artist || "").trim();
      const key = `${artist}:${title}`.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      albums.push({ kind: "album", title, artist });
      if (albums.length === 4) break;
    }
    if (!albums.length) return;

    try {
      const metadata = await Promise.all(albums.map((album) => window.ImpalaMetadata?.lookup?.(album)));
      const sources = metadata.map((entry) => entry?.artworkUrl || entry?.posterUrl || "").filter(Boolean);
      if (!sources.length || !poster.isConnected) return;
      poster.replaceChildren(...sources.map((source, index) => {
        const image = document.createElement("img");
        image.src = source;
        image.alt = "";
        image.loading = "lazy";
        image.dataset.tile = String(index + 1);
        return image;
      }));
      poster.dataset.coverCount = String(sources.length);
      poster.classList.add("has-covers");
    } catch (_) {
      // A playlist remains usable and keeps its Impala fallback without metadata.
    }
  }

  function watchPlaylist(poster, playlist) {
    if (!poster || observed.has(poster)) return;
    observed.add(poster);
    playlistPayloads.set(poster, playlist);
    if (observer) observer.observe(poster);
    else enrichPlaylistPoster(poster, playlist);
  }

  document.addEventListener("impala:libraryrender", (event) => watch(event.detail?.root));
  window.ImpalaPlaylistArtwork = { watch: watchPlaylist };
})();
