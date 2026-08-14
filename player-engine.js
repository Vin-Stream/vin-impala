(() => {
  function getWrappedIndex(currentIndex, total, direction) {
    if (!Number.isInteger(total) || total <= 0) {
      return -1;
    }

    const index = Number.isInteger(currentIndex) ? currentIndex : 0;
    const step = Number.isInteger(direction) ? direction : 1;
    return (index + step + total) % total;
  }

  function getNextTrackDecision({ repeatMode, currentIndex, total }) {
    if (!Number.isInteger(total) || total <= 0) {
      return { action: "none", index: -1 };
    }

    if (repeatMode === "one") {
      return { action: "replay", index: currentIndex };
    }

    if (repeatMode === "off" && currentIndex === total - 1) {
      return { action: "finished", index: currentIndex };
    }

    return {
      action: "next",
      index: getWrappedIndex(currentIndex, total, 1)
    };
  }

  function getPreviousTrackDecision({ currentIndex, total }) {
    if (!Number.isInteger(total) || total <= 0) {
      return { action: "none", index: -1 };
    }

    return {
      action: "prev",
      index: getWrappedIndex(currentIndex, total, -1)
    };
  }

  window.PlayerEngine = {
    getWrappedIndex,
    getNextTrackDecision,
    getPreviousTrackDecision
  };
})();
