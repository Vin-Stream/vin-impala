(() => {
  const link = document.getElementById("activity-admin-link");
  if (link) link.hidden = window.AuthSession?.load()?.isAdmin !== true;
})();
