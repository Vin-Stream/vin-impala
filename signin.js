document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signin-form");
  const usernameInput = document.getElementById("signin-username");
  const passwordInput = document.getElementById("signin-password");
  const submitButton = document.getElementById("signin-submit");
  const status = document.getElementById("signin-status");
  const signedInPanel = document.getElementById("signed-in-panel");
  const signedInCopy = document.getElementById("signed-in-copy");
  const logoutButton = document.getElementById("signin-logout");
  const config = window.KW_PLAYER_CONFIG || {};
  const authSessionApi = window.AuthSession;

  function getApiBaseUrl() {
    return window.ImpalaConfig?.getCloudApiBaseUrl?.()
      || String(config.apiBaseUrl || "").replace(/\/+$/, "");
  }

  function render(session) {
    const isSignedIn = Boolean(session?.token);
    form.hidden = isSignedIn;
    signedInPanel.hidden = !isSignedIn;
    signedInCopy.textContent = isSignedIn
      ? `Signed in as ${session.displayName || session.username}.`
      : "";
    if (!isSignedIn) usernameInput.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Signing in…";
    submitButton.disabled = true;

    try {
      const apiBaseUrl = getApiBaseUrl();
      if (!apiBaseUrl) throw new Error("The private library service is not configured.");
      const headers = new Headers({ "Content-Type": "application/json" });
      const instanceId = window.ImpalaConfig?.getInstanceId?.() || "";
      if (instanceId) {
        headers.set("X-Impala-Instance-Id", instanceId);
      }
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to sign in.");
      authSessionApi.save(payload);
      passwordInput.value = "";
      status.textContent = "Sign-in successful. Opening player…";
      window.location.replace("index.html");
    } catch (error) {
      status.textContent = error.message;
      passwordInput.focus();
    } finally {
      submitButton.disabled = false;
    }
  });

  logoutButton.addEventListener("click", () => {
    authSessionApi.clear();
    status.textContent = "You have been signed out.";
    render(null);
  });

  render(authSessionApi.load());
});
