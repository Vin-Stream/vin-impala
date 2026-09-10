(() => {
  const status = document.getElementById("status");
  const table = document.getElementById("activity-table");
  const rows = document.getElementById("activity-rows");
  const refresh = document.getElementById("refresh");
  const date = (value) => value ? new Date(value).toLocaleString() : "—";
  function cell(row, value) {
    const td = document.createElement("td");
    td.textContent = value;
    row.append(td);
    return td;
  }
  async function load() {
    refresh.disabled = true;
    table.hidden = true;
    rows.replaceChildren();
    status.textContent = "Loading activity…";
    try {
      const result = await window.ImpalaApiClient.request("/api/admin/activity");
      for (const user of result.users) {
        const row = document.createElement("tr");
        cell(row, `${user.displayName || user.username}${user.isAdmin ? " (admin)" : ""}`);
        const username = document.createElement("small");
        username.textContent = user.username;
        row.firstChild.append(username);
        cell(row, date(user.lastLoginAt));
        cell(row, date(user.lastSeenAt));
        cell(row, String(user.loginCount));
        const devices = cell(row, "");
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = String(user.deviceCount);
        details.append(summary);
        for (const device of user.devices) {
          const description = document.createElement("p");
          description.textContent = `${device.id.slice(0, 8)} · ${date(device.lastSeenAt)} · ${device.userAgent || "Unknown browser"}`;
          details.append(description);
        }
        devices.append(details);
        const flags = [];
        if (!user.lastSeenAt) flags.push("No activity recorded");
        if (user.inactive) flags.push("Inactive for 30+ days");
        if (user.deviceCount > 1) flags.push("Multiple recent devices");
        if (user.lastOverlapAt) flags.push(`Last overlap: ${date(user.lastOverlapAt)}`);
        cell(row, flags.join(" · ") || "—");
        rows.append(row);
      }
      table.hidden = false;
      status.textContent = `${result.users.length} allowed users · Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      status.textContent = error.message;
    } finally { refresh.disabled = false; }
  }
  refresh.addEventListener("click", load);
  load();
})();
