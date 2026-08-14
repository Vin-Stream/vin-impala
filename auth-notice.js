(() => {
  const config = window.KW_PLAYER_CONFIG || {};
  const storageKey = window.ImpalaConfig?.getAuthStorageKey?.()
    || config.authStorageKey
    || "impalaStreamer.authSession";
  const noticeId = "auth-required-notice";

  function getApiBaseUrl() {
    return window.ImpalaConfig?.getCloudApiBaseUrl?.()
      || String(config.apiBaseUrl || "").trim().replace(/\/+$/, "");
  }

  function loadSession() {
    if (window.AuthSession?.load) {
      return window.AuthSession.load();
    }

    try {
      const rawValue = localStorage.getItem(storageKey);
      if (!rawValue) return null;
      const session = JSON.parse(rawValue);
      if (!session?.token) return null;
      if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return session;
    } catch (error) {
      console.error("Unable to load auth session:", error);
      localStorage.removeItem(storageKey);
      return null;
    }
  }

  function getOrCreateNotice(targetSelector) {
    let notice = document.getElementById(noticeId);
    if (notice) return notice;

    notice = document.createElement("section");
    notice.id = noticeId;
    notice.className = "auth-required-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.innerHTML = `
      <div>
        <strong>Sign-in needed</strong>
        <span>Your private library session has expired or is not active.</span>
      </div>
      <a href="signin.html">Sign In</a>
    `;

    const target = document.querySelector(targetSelector);
    if (target) {
      target.insertAdjacentElement("afterend", notice);
    } else {
      document.body.prepend(notice);
    }

    return notice;
  }

  function render(options = {}) {
    const { targetSelector = ".hero-meta", needsPrivateAccess = true } = options;
    const notice = getOrCreateNotice(targetSelector);
    const hasSession = Boolean(loadSession()?.token);
    const shouldShow = Boolean(getApiBaseUrl() && needsPrivateAccess && !hasSession);
    notice.hidden = !shouldShow;
    document.body.classList.toggle("is-auth-required", shouldShow);
    return !shouldShow;
  }

  function watch(options = {}) {
    const refresh = () => render(options);
    window.addEventListener("storage", (event) => {
      if (!event.key || event.key === storageKey) refresh();
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
    refresh();
    return { refresh };
  }

  window.ImpalaAuthNotice = {
    loadSession,
    render,
    watch
  };
})();
