(() => {
  function create(options = {}) {
    const store = options.store;
    const historyLimit = Math.max(1, Number(options.randomHistoryLimit) || 100);
    const random = typeof options.random === "function" ? options.random : Math.random;
    let repeatMode = store?.loadRepeatMode?.() || "off";
    let randomMode = Boolean(store?.loadRandomMode?.());
    let randomHistory = [];
    let randomHistoryCursor = -1;

    function getRepeatMode() { return repeatMode; }
    function getRandomMode() { return randomMode; }

    function saveRepeatMode(mode) {
      repeatMode = store?.saveRepeatMode?.(mode) || (["off", "one", "all"].includes(mode) ? mode : "off");
      return repeatMode;
    }

    function cycleRepeatMode() {
      return saveRepeatMode(repeatMode === "off" ? "one" : repeatMode === "one" ? "all" : "off");
    }

    function saveRandomMode(enabled) {
      randomMode = store?.saveRandomMode?.(enabled) ?? Boolean(enabled);
      return randomMode;
    }

    function toggleRandomMode(seedIndex) {
      saveRandomMode(!randomMode);
      if (randomMode) resetRandomHistory(seedIndex);
      return randomMode;
    }

    function resetRandomHistory(seedIndex) {
      randomHistory = [];
      randomHistoryCursor = -1;
      if (Number.isInteger(seedIndex) && seedIndex >= 0) {
        randomHistory.push(seedIndex);
        randomHistoryCursor = 0;
      }
    }

    function pushRandomHistory(index) {
      if (!Number.isInteger(index) || index < 0) return;
      if (randomHistoryCursor < randomHistory.length - 1) {
        randomHistory = randomHistory.slice(0, randomHistoryCursor + 1);
      }
      if (randomHistory[randomHistoryCursor] === index) return;
      randomHistory.push(index);
      randomHistoryCursor = randomHistory.length - 1;
      if (randomHistory.length > historyLimit) {
        const overflow = randomHistory.length - historyLimit;
        randomHistory = randomHistory.slice(overflow);
        randomHistoryCursor = Math.max(0, randomHistoryCursor - overflow);
      }
    }

    function getNextRandomHistoryIndex() {
      if (randomHistoryCursor >= 0 && randomHistoryCursor < randomHistory.length - 1) {
        randomHistoryCursor += 1;
        return randomHistory[randomHistoryCursor];
      }
      return null;
    }

    function getPreviousRandomHistoryIndex() {
      if (randomHistoryCursor > 0) {
        randomHistoryCursor -= 1;
        return randomHistory[randomHistoryCursor];
      }
      return null;
    }

    function generateRandomTrackIndex(total, currentIndex) {
      if (!Number.isInteger(total) || total <= 0) return -1;
      let index = Math.floor(random() * total);
      if (total > 1 && index === currentIndex) index = (index + 1) % total;
      return index;
    }

    function getRandomNextIndex(total, currentIndex) {
      const historyIndex = getNextRandomHistoryIndex();
      if (Number.isInteger(historyIndex)) return historyIndex;
      const index = generateRandomTrackIndex(total, currentIndex);
      if (index >= 0) pushRandomHistory(index);
      return index;
    }

    return {
      getRepeatMode, getRandomMode, saveRepeatMode, cycleRepeatMode,
      saveRandomMode, toggleRandomMode, resetRandomHistory, pushRandomHistory,
      getPreviousRandomHistoryIndex, generateRandomTrackIndex, getRandomNextIndex
    };
  }

  window.ImpalaPlayerState = { create };
})();
