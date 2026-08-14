import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createLibraryIndexCache, parseNdjsonBody, queryLibraryIndex } from "./library-index.js";

const records = [
  { objectKey: "audio/Alpha/First/01 Opening.mp3" },
  { objectKey: "audio/Alpha/First/02 Closing.mp3" },
  { objectKey: "audio/Alpha/Second/01 Return.flac" },
  { objectKey: "audio/Beta/Only/01 Other.m4a" },
  { objectKey: "audio/Ren/Collection/01 Blind Eyed.mp3" },
  { objectKey: "audio/Florence/Collection/01 Never Let Me Go.mp3" },
  { objectKey: "audio/Hozier/Collection/01 Work Song.mp3" },
  { objectKey: "audio/The Heavy/Collection/01 Short Change Hero.mp3" },
  { objectKey: "private/Hidden/Album/01 Secret.mp3" },
  { objectKey: "test/Patterns/01 Bars.mp4" }
];

test("lists immediate folders without returning the full index", () => {
  const result = queryLibraryIndex(records, {
    requestedPrefix: "audio/",
    limit: 1000
  });

  assert.deepEqual(result.folders, [
    { name: "Alpha", prefix: "audio/Alpha/" },
    { name: "Beta", prefix: "audio/Beta/" },
    { name: "Ren", prefix: "audio/Ren/" },
    { name: "Florence", prefix: "audio/Florence/" },
    { name: "Hozier", prefix: "audio/Hozier/" },
    { name: "The Heavy", prefix: "audio/The Heavy/" }
  ]);
  assert.deepEqual(result.files, []);
});

test("lists an album's immediate media files", () => {
  const result = queryLibraryIndex(records, {
    requestedPrefix: "audio/Alpha/First/",
    limit: 1000
  });

  assert.deepEqual(result.files.map((file) => file.objectKey), [
    "audio/Alpha/First/01 Opening.mp3",
    "audio/Alpha/First/02 Closing.mp3"
  ]);
});

test("filters search results through all allowed prefixes", () => {
  const result = queryLibraryIndex(records, {
    allowedPrefixes: ["audio/Alpha/", "audio/Beta/"],
    searchTerm: "return",
    limit: 1000
  });

  assert.deepEqual(result.files.map((file) => file.objectKey), [
    "audio/Alpha/Second/01 Return.flac"
  ]);
  assert.equal(result.files.some((file) => file.objectKey.startsWith("private/")), false);
});

test("prioritizes exact short artist folder matches over broad substring matches", () => {
  const result = queryLibraryIndex(records, {
    allowedPrefixes: ["audio/"],
    searchTerm: "Ren",
    limit: 1000
  });

  assert.equal(result.folders[0].prefix, "audio/Ren/");
});

test("matches short search terms at word starts instead of anywhere", () => {
  const result = queryLibraryIndex(records, {
    allowedPrefixes: ["audio/"],
    searchTerm: "h",
    limit: 1000
  });

  assert.deepEqual(result.folders.map((folder) => folder.prefix), [
    "audio/Hozier/",
    "audio/The Heavy/"
  ]);
  assert.equal(result.folders.some((folder) => folder.prefix === "audio/Alpha/"), false);
});

test("excludes private prefixes from listings, searches, and recursive results", () => {
  const listing = queryLibraryIndex(records, {
    excludedPrefixes: ["test/"],
    limit: 1000
  });
  const search = queryLibraryIndex(records, {
    excludedPrefixes: ["test/"],
    searchTerm: "bars",
    limit: 1000
  });
  const recursive = queryLibraryIndex(records, {
    excludedPrefixes: ["test/"],
    recursive: true,
    limit: 1000
  });

  assert.equal(listing.folders.some((folder) => folder.prefix === "test/"), false);
  assert.deepEqual(search.files, []);
  assert.equal(recursive.files.some((file) => file.objectKey.startsWith("test/")), false);
});

test("paginates recursive folder imports with an opaque cursor", () => {
  const firstPage = queryLibraryIndex(records, {
    requestedPrefix: "audio/Alpha/",
    recursive: true,
    limit: 2
  });
  const secondPage = queryLibraryIndex(records, {
    requestedPrefix: "audio/Alpha/",
    recursive: true,
    limit: 2,
    cursor: firstPage.nextCursor
  });

  assert.equal(firstPage.files.length, 2);
  assert.ok(firstPage.nextCursor);
  assert.deepEqual(secondPage.files.map((file) => file.objectKey), [
    "audio/Alpha/Second/01 Return.flac"
  ]);
  assert.equal(secondPage.nextCursor, null);
});

test("parses valid media records from NDJSON", async () => {
  const body = Readable.from([
    '{"objectKey":"audio/Alpha/First/01 Opening.mp3"}\n',
    '{"objectKey":"indexes/notes.json"}\n',
    "\n"
  ]);

  const result = await parseNdjsonBody(body);
  assert.deepEqual(result, [
    { objectKey: "audio/Alpha/First/01 Opening.mp3" }
  ]);
});

test("loads an index once inside the ETag check interval", async () => {
  const commands = [];
  const fakeS3Client = {
    async send(command) {
      commands.push(command.constructor.name);
      if (command.constructor.name === "HeadObjectCommand") {
        return { ETag: '"version-1"' };
      }
      return {
        Body: Readable.from(['{"objectKey":"audio/Alpha/First/01 Opening.mp3"}\n'])
      };
    }
  };
  const cache = createLibraryIndexCache({
    s3Client: fakeS3Client,
    scopes: { audio: { bucket: "audio", key: "indexes/audio.ndjson" } },
    checkIntervalMs: 60000,
    logger: { log() {}, warn() {} }
  });

  await Promise.all([cache.load("audio"), cache.load("audio")]);
  await cache.load("audio");

  assert.deepEqual(commands, ["HeadObjectCommand", "GetObjectCommand"]);
  assert.equal(cache.getStatus().audio.records, 1);
  assert.equal(cache.getStatus().audio.version, '"version-1"');

  cache.invalidate("audio");
  await cache.load("audio");
  assert.deepEqual(commands, ["HeadObjectCommand", "GetObjectCommand", "HeadObjectCommand"]);
});
