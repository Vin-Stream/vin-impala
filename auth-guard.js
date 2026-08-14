(function guardPlayerRoute() {
  const authSession = window.AuthSession;

  try {
    if (authSession?.load()) return;
  } catch (_) {}

  window.location.replace("signin.html");
})();
