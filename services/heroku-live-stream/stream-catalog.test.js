import assert from "node:assert/strict";
import test from "node:test";
import {
  publicStreamCatalog,
  sanitizeStreamCatalog,
  sanitizeStreamCatalogEntry
} from "./stream-catalog.js";

test("sanitizes stream catalog entries", () => {
  assert.deepEqual(sanitizeStreamCatalogEntry({
    id: " NASA Public ",
    title: "  NASA   TV  ",
    description: "  Public   science stream  ",
    category: " Science ",
    streamUrl: " https://example.com/live/master.m3u8 ",
    enabled: true,
    reviewStatus: "approved",
    notes: " ok "
  }), {
    id: "nasa-public",
    title: "NASA TV",
    description: "Public science stream",
    category: "Science",
    streamUrl: "https://example.com/live/master.m3u8",
    enabled: true,
    reviewStatus: "approved",
    notes: "ok"
  });
});

test("drops catalog entries without valid ids or stream URLs", () => {
  assert.equal(sanitizeStreamCatalogEntry({
    id: "",
    streamUrl: "https://example.com/live/master.m3u8"
  }), null);
  assert.equal(sanitizeStreamCatalogEntry({
    id: "bad-url",
    streamUrl: "not a url"
  }), null);
  assert.equal(sanitizeStreamCatalogEntry({
    id: "bad-protocol",
    streamUrl: "ftp://example.com/live"
  }), null);
});

test("public catalog exposes only enabled safe fields", () => {
  const catalog = publicStreamCatalog([
    {
      id: "enabled-stream",
      title: "Enabled Stream",
      description: "Visible",
      category: "Test",
      streamUrl: "https://example.com/enabled.m3u8",
      enabled: true,
      reviewStatus: "approved",
      notes: "private note"
    },
    {
      id: "pending-stream",
      title: "Pending Stream",
      streamUrl: "https://example.com/pending.m3u8",
      enabled: false
    }
  ]);

  assert.deepEqual(catalog, [{
    id: "enabled-stream",
    title: "Enabled Stream",
    description: "Visible",
    category: "Test",
    streamUrl: "https://example.com/enabled.m3u8",
    enabled: true
  }]);
});

test("sanitizes non-array catalogs to an empty list", () => {
  assert.deepEqual(sanitizeStreamCatalog(null), []);
});
