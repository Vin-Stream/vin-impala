(() => {
  function bind(options = {}) {
    const elements = options.elements || {};
    const actions = options.actions || {};
    const pageDocument = options.document || window.document;

    elements.playlistSelector?.addEventListener("change", (event) => actions.onPlaylistChange?.(event.target.value));
    elements.playerAddStarredButton?.addEventListener("click", () => actions.onAddStarred?.());
    elements.playerNewStarredButton?.addEventListener("click", () => actions.onNewStarred?.());
    elements.playerManageStarredButton?.addEventListener("click", () => actions.onManageStarred?.());
    elements.playerClearStarredButton?.addEventListener("click", () => actions.onClearStarred?.());
    elements.trackFilterInput?.addEventListener("input", (event) => actions.onTrackFilter?.(event.target.value));
    elements.scrollPlayingButton?.addEventListener("click", () => actions.onScrollPlaying?.());
    elements.videoResumeButton?.addEventListener("click", () => actions.onVideoResume?.());

    elements.transportButtons?.forEach?.((button) => {
      button.addEventListener("click", () => actions.onTransport?.(button.getAttribute("data-action")));
    });

    elements.authForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      actions.onAuthSubmit?.({
        username: String(elements.authUsername?.value || "").trim(),
        password: String(elements.authPassword?.value || "")
      });
    });
    elements.authLogoutButton?.addEventListener("click", () => actions.onLogout?.());

    elements.aboutTitle?.addEventListener("click", () => actions.onOpenAbout?.());
    elements.aboutLink?.addEventListener("click", () => actions.onOpenAbout?.());
    elements.aboutCloseButton?.addEventListener("click", () => actions.onCloseAbout?.());
    elements.aboutDialog?.addEventListener("click", (event) => {
      if (event.target === elements.aboutDialog) actions.onCloseAbout?.();
    });
    elements.aboutDialog?.addEventListener("close", () => actions.onAboutClosed?.());
    elements.aboutPromoCloseButton?.addEventListener("click", () => actions.onClosePromo?.());
    elements.aboutPromoDialog?.addEventListener("click", (event) => {
      if (event.target === elements.aboutPromoDialog) actions.onClosePromo?.();
    });
    elements.aboutPromoDialog?.addEventListener("close", () => actions.onPromoClosed?.());

    pageDocument?.addEventListener("keydown", (event) => actions.onGlobalKeydown?.(event));
    pageDocument?.addEventListener("keydown", (event) => {
      if (
        event.defaultPrevented
        || event.repeat
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || event.key.toLowerCase() !== "p"
        || !elements.aboutDialog?.open
        || elements.aboutPromoDialog?.open
      ) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      actions.onOpenPromo?.();
    }, true);
  }

  window.ImpalaUiEvents = { bind };
})();
