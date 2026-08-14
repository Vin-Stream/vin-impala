export function parseBucketRules(rawValue) {
  const source = String(rawValue || "").trim();
  if (!source) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`Unable to parse S4_BUCKET_RULES_JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("S4_BUCKET_RULES_JSON must be a JSON object.");
  }

  const rules = Object.hasOwn(parsed, "bucketRules") ? parsed.bucketRules : parsed;
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    throw new Error("S4_BUCKET_RULES_JSON bucketRules must be a JSON object.");
  }

  const normalizedRules = new Map();
  for (const [rawUsername, rawBuckets] of Object.entries(rules)) {
    const username = normalizeUsername(rawUsername);
    if (!username || !Array.isArray(rawBuckets)) {
      throw new Error("Each S4 bucket rule must map a username to an array of bucket names.");
    }

    const buckets = rawBuckets.map(normalizeBucketName).filter(Boolean);
    if (buckets.length !== rawBuckets.length) {
      throw new Error(`S4 bucket rule for "${username}" contains an invalid bucket name.`);
    }

    normalizedRules.set(username, new Set(buckets));
  }

  return normalizedRules;
}

export function canUserAccessBucket(bucketRules, username, bucket) {
  if (bucketRules === null) {
    return true;
  }

  const allowedBuckets = bucketRules.get(normalizeUsername(username));
  return Boolean(allowedBuckets?.has(normalizeBucketName(bucket)));
}

export function getAllowedBuckets(bucketRules, username) {
  if (bucketRules === null) {
    return null;
  }

  return [...(bucketRules.get(normalizeUsername(username)) || [])];
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeBucketName(value) {
  return String(value || "").trim().toLowerCase();
}
