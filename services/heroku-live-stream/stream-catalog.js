export function sanitizeStreamCatalog(entries = []) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map(sanitizeStreamCatalogEntry)
    .filter(Boolean);
}

export function publicStreamCatalog(entries = []) {
  return sanitizeStreamCatalog(entries)
    .filter((entry) => entry.enabled)
    .map(({ id, title, description, category, streamUrl, enabled }) => ({
      id,
      title,
      description,
      category,
      streamUrl,
      enabled
    }));
}

export function sanitizeStreamCatalogEntry(entry = {}) {
  const id = sanitizeId(entry.id);
  const streamUrl = sanitizeCatalogUrl(entry.streamUrl);
  if (!id || !streamUrl) {
    return null;
  }

  return {
    id,
    title: sanitizeText(entry.title, 120) || id,
    description: sanitizeText(entry.description, 240),
    category: sanitizeText(entry.category, 80) || "General",
    streamUrl,
    enabled: entry.enabled === true,
    reviewStatus: sanitizeText(entry.reviewStatus, 40) || "pending",
    notes: sanitizeText(entry.notes, 500)
  };
}

function sanitizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function sanitizeCatalogUrl(value) {
  const streamUrl = String(value || "").trim().slice(0, 2048);
  if (!streamUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(streamUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "";
    }
    return parsedUrl.toString();
  } catch (_error) {
    return "";
  }
}
