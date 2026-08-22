(() => {
  const observed = new WeakSet();
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          enrich(entry.target);
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

  document.addEventListener("impala:libraryrender", (event) => watch(event.detail?.root));
})();
