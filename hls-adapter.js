(() => {
  const hlsByElement = new WeakMap();

  function isHlsUrl(url) {
    return /\.m3u8(?:[?#].*)?$/i.test(String(url || "").trim());
  }

  function canUseFor(url, mediaElement) {
    if (!mediaElement || !isHlsUrl(url)) {
      return false;
    }

    return Boolean(window.Hls?.isSupported?.());
  }

  function destroy(mediaElement) {
    const hls = hlsByElement.get(mediaElement);
    if (!hls) {
      return;
    }

    hls.destroy();
    hlsByElement.delete(mediaElement);
  }

  function load(mediaElement, url) {
    destroy(mediaElement);

    return new Promise((resolve, reject) => {
      if (!canUseFor(url, mediaElement)) {
        reject(new Error("HLS adapter is unavailable."));
        return;
      }

      const hls = new window.Hls({
        enableWorker: true
      });
      let settled = false;

      hlsByElement.set(mediaElement, hls);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      hls.on(window.Hls.Events.ERROR, (_event, data = {}) => {
        if (data.fatal) {
          destroy(mediaElement);
          if (!settled) {
            settled = true;
            reject(new Error(data.details || "Unable to load HLS stream."));
          }
        }
      });
      hls.loadSource(url);
      hls.attachMedia(mediaElement);
    });
  }

  window.ImpalaHlsAdapter = {
    canUseFor,
    destroy,
    load
  };
})();
