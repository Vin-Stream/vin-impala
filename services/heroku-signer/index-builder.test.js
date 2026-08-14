import assert from "node:assert/strict";
import test from "node:test";
import { buildLibraryIndex } from "./index-builder.js";

test("builds an NDJSON index from media objects and ignores other files", async () => {
  let uploadedBody = "";
  const fakeS3Client = {
    async send(command) {
      if (command.constructor.name === "ListObjectsV2Command") {
        return {
          Contents: [
            {
              Key: "Artist/Album/01 First Song.mp3",
              Size: 123,
              LastModified: new Date("2026-06-19T12:00:00Z")
            },
            { Key: "Artist/Album/cover.jpg", Size: 456 }
          ],
          IsTruncated: false
        };
      }

      for await (const chunk of command.input.Body) {
        uploadedBody += chunk.toString();
      }
      assert.equal(command.input.Bucket, "audio-bucket");
      assert.equal(command.input.Key, "indexes/audio.ndjson");
      return { ETag: '"index-version"' };
    }
  };

  const result = await buildLibraryIndex({
    s3Client: fakeS3Client,
    scope: {
      name: "audio",
      bucket: "audio-bucket",
      prefix: "",
      indexKey: "indexes/audio.ndjson"
    }
  });

  assert.equal(result.records, 1);
  assert.equal(result.etag, '"index-version"');
  assert.deepEqual(JSON.parse(uploadedBody.trim()), {
    objectKey: "Artist/Album/01 First Song.mp3",
    artist: "Artist",
    album: "Album",
    title: "First Song",
    type: "audio",
    size: 123,
    modified: "2026-06-19T12:00:00.000Z"
  });
});

test("counts video title folders once during index build", async () => {
  const fakeS3Client = {
    async send(command) {
      if (command.constructor.name === "ListObjectsV2Command") {
        return {
          Contents: [
            { Key: "Series One/Season 1/Episode 1.mp4", Size: 100 },
            { Key: "Series One/Season 1/Episode 2.mp4", Size: 100 },
            { Key: "Movie One/Movie One.mp4", Size: 100 },
            { Key: "Loose Feature.mp4", Size: 100 },
            { Key: "indexes/old-preview.mp4", Size: 100 },
            { Key: "test/Test Pattern.mp4", Size: 100 }
          ],
          IsTruncated: false
        };
      }

      for await (const _chunk of command.input.Body) {
        // Drain the stream so the builder can finish.
      }
      return { ETag: '"video-index-version"' };
    }
  };

  const result = await buildLibraryIndex({
    s3Client: fakeS3Client,
    scope: {
      name: "video",
      bucket: "video-bucket",
      prefix: "",
      indexKey: "indexes/video.ndjson",
      excludedPrefixes: ["indexes/", "test/"]
    }
  });

  assert.equal(result.records, 4);
  assert.equal(result.titleCount, 3);
});
