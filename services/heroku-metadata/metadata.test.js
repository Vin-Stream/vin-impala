const assert = require("node:assert/strict");
const test = require("node:test");
const service = require("./service.js");

test("normalizes movie filenames into provider-friendly titles and years", () => {
  assert.deepEqual(service.extractTitleAndYear("Moon.2009.1080p.BluRay.mkv"), {
    title: "Moon",
    year: "2009"
  });
});

test("keeps movie lookup disabled without the owner token", async () => {
  const result = await service.lookupMetadata(
    { kind: "movie", title: "Moon (2009)" },
    { env: {}, fetchImpl: async () => { throw new Error("must not fetch"); } }
  );
  assert.equal(result.status, 503);
});

test("normalizes TMDB poster results", async () => {
  const result = await service.lookupMetadata(
    { kind: "movie", title: "Moon.2009.mkv" },
    {
      env: { TMDB_READ_ACCESS_TOKEN: "owner-token" },
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { results: [{
            id: 17431,
            title: "Moon",
            release_date: "2009-06-12",
            poster_path: "/poster.jpg"
          }] };
        }
      })
    }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.metadata.posterUrl, "https://image.tmdb.org/t/p/w500/poster.jpg");
});
