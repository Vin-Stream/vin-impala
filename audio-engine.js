(() => {
  const BACKGROUND_HANDOFF_SECONDS = 0.4;

  function createPlaybackTransitionController() {
    let preparedTrack = null;
    let transitionKey = "";

    function clearPreparedTrack() {
      preparedTrack = null;
    }

    function prepareTrack(key, resolver) {
      if (!key || typeof resolver !== "function") {
        clearPreparedTrack();
        return;
      }

      if (preparedTrack?.key === key) {
        return;
      }

      const entry = {
        key,
        value: null,
        promise: null
      };
      entry.promise = Promise.resolve()
        .then(resolver)
        .then((value) => {
          if (preparedTrack === entry) {
            entry.value = value;
          }
          return value;
        })
        .catch((error) => {
          if (preparedTrack === entry) {
            preparedTrack = null;
          }
          console.debug("Unable to prepare the next track:", error);
          return null;
        });
      preparedTrack = entry;
    }

    function takePreparedTrack(key) {
      if (!preparedTrack || preparedTrack.key !== key) {
        return null;
      }

      const value = preparedTrack.value;
      preparedTrack = null;
      return value;
    }

    function shouldRequestBackgroundHandoff(mediaElement) {
      if (
        !document.hidden
        || !mediaElement
        || mediaElement.paused
        || mediaElement.ended
        || !Number.isFinite(mediaElement.duration)
      ) {
        return false;
      }

      const remainingSeconds = mediaElement.duration - mediaElement.currentTime;
      return remainingSeconds > 0 && remainingSeconds <= BACKGROUND_HANDOFF_SECONDS;
    }

    function shouldSkipAnalyzedTail(mediaElement, audibleEndSeconds, enabled) {
      const audibleEnd = Number(audibleEndSeconds);
      if (
        enabled !== true
        || !mediaElement
        || mediaElement.paused
        || mediaElement.ended
        || !Number.isFinite(audibleEnd)
        || audibleEnd <= 0
      ) {
        return false;
      }

      return mediaElement.currentTime >= audibleEnd;
    }

    function beginTransition(key) {
      if (!key || transitionKey === key) {
        return false;
      }
      transitionKey = key;
      return true;
    }

    function finishTransition(key) {
      if (transitionKey === key) {
        transitionKey = "";
      }
    }

    return {
      prepareTrack,
      takePreparedTrack,
      clearPreparedTrack,
      shouldRequestBackgroundHandoff,
      shouldSkipAnalyzedTail,
      beginTransition,
      finishTransition
    };
  }

  window.ImpalaAudioEngine = {
    createPlaybackTransitionController
  };
})();
