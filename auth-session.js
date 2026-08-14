(() => {
  const config = window.KW_PLAYER_CONFIG || {};
  const storageKey = window.ImpalaConfig?.getAuthStorageKey?.()
    || config.authStorageKey
    || "impalaStreamer.authSession";

  function isExpired(session) {
    return Boolean(session?.expiresAt && Date.parse(session.expiresAt) <= Date.now());
  }

  function hasValidToken(session) {
    return Boolean(session?.token && !isExpired(session));
  }

  function clear() {
    localStorage.removeItem(storageKey);
  }

  function load() {
    try {
      const rawValue = localStorage.getItem(storageKey);
      if (!rawValue) {
        return null;
      }

      const session = JSON.parse(rawValue);
      if (!hasValidToken(session)) {
        clear();
        return null;
      }

      return session;
    } catch (error) {
      console.error("Unable to load auth session:", error);
      clear();
      return null;
    }
  }

  function save(session) {
    if (!session) {
      clear();
      return null;
    }

    localStorage.setItem(storageKey, JSON.stringify(session));
    return session;
  }

  window.AuthSession = {
    storageKey,
    isExpired,
    hasValidToken,
    load,
    save,
    clear
  };
})();
