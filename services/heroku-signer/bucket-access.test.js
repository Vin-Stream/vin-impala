import assert from "node:assert/strict";
import test from "node:test";
import {
  canUserAccessBucket,
  getAllowedBuckets,
  parseBucketRules
} from "./bucket-access.js";

test("missing bucket rules preserve existing unrestricted behavior", () => {
  const rules = parseBucketRules("");
  assert.equal(rules, null);
  assert.equal(canUserAccessBucket(rules, "kevin", "audio-bucket"), true);
});

test("wrapped bucket rules use exact normalized usernames and bucket names", () => {
  const rules = parseBucketRules(JSON.stringify({
    bucketRules: {
      Kevin: ["Audio-Bucket"],
      guest: ["video-bucket"]
    }
  }));

  assert.equal(canUserAccessBucket(rules, "KEVIN", "audio-bucket"), true);
  assert.equal(canUserAccessBucket(rules, "kev", "audio-bucket"), false);
  assert.equal(canUserAccessBucket(rules, "kevin-extra", "audio-bucket"), false);
  assert.equal(canUserAccessBucket(rules, "kevin", "video-bucket"), false);
  assert.deepEqual(getAllowedBuckets(rules, "guest"), ["video-bucket"]);
});

test("direct username mapping is accepted", () => {
  const rules = parseBucketRules('{"kevin":["audio-bucket","video-bucket"]}');
  assert.equal(canUserAccessBucket(rules, "kevin", "video-bucket"), true);
});

test("configured rules deny users without an entry", () => {
  const rules = parseBucketRules('{"bucketRules":{}}');
  assert.equal(canUserAccessBucket(rules, "kevin", "audio-bucket"), false);
  assert.deepEqual(getAllowedBuckets(rules, "kevin"), []);
});

test("malformed bucket rules fail closed at startup", () => {
  assert.throws(
    () => parseBucketRules('{"bucketRules":{"kevin":"audio-bucket"}}'),
    /array of bucket names/
  );
  assert.throws(
    () => parseBucketRules("[]"),
    /must be a JSON object/
  );
  assert.throws(
    () => parseBucketRules("{"),
    /Unable to parse/
  );
});
