const assert = require("node:assert/strict");
const test = require("node:test");
const { createMetadataServer } = require("./server.js");

async function withServer(options, callback) {
  const server = createMetadataServer(options);
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("reports provider readiness without exposing secrets", async () => {
  await withServer({ env: { TMDB_READ_ACCESS_TOKEN: "secret" } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.movieMetadata, true);
    assert.equal(JSON.stringify(payload).includes("secret"), false);
  });
});

test("serves public read-only metadata with cache headers", async () => {
  await withServer({
    env: {},
    async lookupMetadata(query) {
      return { status: 200, body: { metadata: { kind: query.kind, title: query.title } } };
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/metadata?kind=movie&title=Moon`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("cache-control"), /s-maxage=86400/);
    assert.deepEqual(payload.metadata, { kind: "movie", title: "Moon" });
  });
});

test("supports CORS preflight and rejects writes", async () => {
  await withServer({}, async (baseUrl) => {
    const preflight = await fetch(`${baseUrl}/api/metadata`, { method: "OPTIONS" });
    const write = await fetch(`${baseUrl}/api/metadata`, { method: "POST" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.equal(write.status, 405);
  });
});
