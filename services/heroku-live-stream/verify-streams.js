import { readFileSync } from "node:fs";
import { sanitizeStreamCatalog } from "./stream-catalog.js";

const catalogPath = new URL("./streams.json", import.meta.url);
const catalog = sanitizeStreamCatalog(JSON.parse(readFileSync(catalogPath, "utf8")));
const timeoutMs = 10_000;

const results = [];
for (const entry of catalog) {
  results.push(await verifyStream(entry));
}

printResults(results);

const enabledFailures = results.filter((result) => result.enabled && !result.ok);
if (enabledFailures.length) {
  process.exitCode = 1;
}

async function verifyStream(entry) {
  const result = {
    id: entry.id,
    title: entry.title,
    enabled: entry.enabled,
    reviewStatus: entry.reviewStatus,
    ok: false,
    masterStatus: null,
    childStatus: null,
    childUrl: "",
    mediaPlaylist: false,
    error: ""
  };

  try {
    const master = await fetchText(entry.streamUrl);
    result.masterStatus = master.status;
    if (!master.ok) {
      result.error = `Master playlist returned HTTP ${master.status}.`;
      return result;
    }

    const childPath = findFirstChildPlaylist(master.text);
    if (!childPath) {
      result.mediaPlaylist = isMediaPlaylist(master.text);
      result.ok = result.mediaPlaylist;
      result.error = result.ok ? "" : "Playlist is not a variant or media playlist.";
      return result;
    }

    result.childUrl = new URL(childPath, entry.streamUrl).href;
    const child = await fetchText(result.childUrl);
    result.childStatus = child.status;
    if (!child.ok) {
      result.error = `Child playlist returned HTTP ${child.status}.`;
      return result;
    }

    result.mediaPlaylist = isMediaPlaylist(child.text);
    result.ok = result.mediaPlaylist;
    result.error = result.ok ? "" : "Child playlist does not contain media segments.";
    return result;
  } catch (error) {
    result.error = error.message || "Unable to verify stream.";
    return result;
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function findFirstChildPlaylist(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && /\.m3u8(?:[?#].*)?$/i.test(line)) || "";
}

function isMediaPlaylist(text) {
  const value = String(text || "");
  return value.includes("#EXTINF") || value.includes("#EXT-X-TARGETDURATION");
}

function printResults(items) {
  console.log("Impala live stream catalog verification");
  console.log("");
  items.forEach((item) => {
    const status = item.ok ? "OK" : "FAIL";
    const enabled = item.enabled ? "enabled" : "disabled";
    const review = item.reviewStatus || "pending";
    console.log(`[${status}] ${item.id} (${enabled}, ${review})`);
    console.log(`  ${item.title}`);
    console.log(`  master: ${item.masterStatus ?? "n/a"}`);
    if (item.childUrl) {
      console.log(`  child: ${item.childStatus ?? "n/a"} ${item.childUrl}`);
    }
    if (item.error) {
      console.log(`  issue: ${item.error}`);
    }
    console.log("");
  });
}
