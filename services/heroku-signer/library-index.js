import readline from "node:readline";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const MEDIA_EXTENSION_PATTERN = /\.(flac|mp3|m4a|mp4|m4v|wav|ogg|aac|webm|mov)$/i;

export function createLibraryIndexCache({
  s3Client,
  scopes,
  checkIntervalMs = 60000,
  logger = console
}) {
  const states = new Map();

  for (const [scope, config] of Object.entries(scopes)) {
    states.set(scope, {
      config,
      records: null,
      etag: null,
      checkedAt: 0,
      lastError: null,
      loading: null
    });
  }

  async function load(scope) {
    const state = states.get(scope);
    if (!state) {
      throw new Error(`Unknown library index scope: ${scope}`);
    }

    const now = Date.now();
    if (now - state.checkedAt < checkIntervalMs) {
      if (state.records) {
        return state.records;
      }
      if (state.lastError) {
        throw state.lastError;
      }
    }

    if (state.loading) {
      return state.loading;
    }

    state.loading = refreshState(state)
      .catch((error) => {
        state.checkedAt = Date.now();
        state.lastError = error;
        if (state.records) {
          logger.warn(`Unable to refresh ${scope} library index; using cached copy:`, error.message);
          return state.records;
        }
        throw error;
      })
      .finally(() => {
        state.loading = null;
      });

    return state.loading;
  }

  async function refreshState(state) {
    const { bucket, key } = state.config;
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const etag = String(head.ETag || "");
    state.checkedAt = Date.now();

    if (state.records && etag && etag === state.etag) {
      state.lastError = null;
      return state.records;
    }

    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const records = await parseNdjsonBody(response.Body);
    state.records = records;
    state.etag = etag;
    state.lastError = null;
    logger.log(`Loaded ${records.length} records from s4://${bucket}/${key}.`);
    return records;
  }

  function getStatus() {
    return Object.fromEntries([...states.entries()].map(([scope, state]) => [scope, {
      available: Boolean(state.records),
      version: state.etag || null,
      records: state.records?.length || 0,
      checkedAt: state.checkedAt ? new Date(state.checkedAt).toISOString() : null
    }]));
  }

  function invalidate(scope) {
    const targetStates = scope ? [states.get(scope)] : [...states.values()];
    for (const state of targetStates) {
      if (state) {
        state.checkedAt = 0;
        state.lastError = null;
      }
    }
  }

  return { load, getStatus, invalidate };
}

export async function parseNdjsonBody(body) {
  if (!body) {
    throw new Error("Library index object has no response body.");
  }

  const records = [];
  const lines = readline.createInterface({ input: body, crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) {
      continue;
    }

    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid NDJSON on line ${lineNumber}: ${error.message}`);
    }

    const objectKey = String(record?.objectKey || "");
    if (objectKey && MEDIA_EXTENSION_PATTERN.test(objectKey)) {
      records.push({ ...record, objectKey });
    }
  }

  return records;
}

export function queryLibraryIndex(records, options = {}) {
  const requestedPrefix = normalizePrefix(options.requestedPrefix);
  const allowedPrefixes = (options.allowedPrefixes || []).map(normalizePrefix).filter(Boolean);
  const excludedPrefixes = (options.excludedPrefixes || []).map(normalizePrefix).filter(Boolean);
  const searchTerm = normalizeSearchTerm(options.searchTerm);
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 1000);
  const recursive = Boolean(options.recursive);

  if (searchTerm) {
    return searchRecords(records, {
      requestedPrefix,
      allowedPrefixes,
      excludedPrefixes,
      searchTerm,
      limit
    });
  }

  if (recursive) {
    const matchingFiles = records
      .map((record) => record.objectKey)
      .filter((key) => key && key !== requestedPrefix)
      .filter((key) => key.startsWith(requestedPrefix))
      .filter((key) => isAllowedForPrefixes(key, allowedPrefixes))
      .filter((key) => !isExcludedForPrefixes(key, excludedPrefixes));
    const offset = decodeCursor(options.cursor);
    const page = matchingFiles.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return {
      folders: [],
      files: page.map(toFileEntry),
      nextCursor: nextOffset < matchingFiles.length ? encodeCursor(nextOffset) : null
    };
  }

  const folderMap = new Map();
  const fileMap = new Map();

  for (const record of records) {
    const key = record.objectKey;
    if (!key || key === requestedPrefix || !key.startsWith(requestedPrefix)) {
      continue;
    }
    if (!isAllowedForPrefixes(key, allowedPrefixes)) {
      continue;
    }
    if (isExcludedForPrefixes(key, excludedPrefixes)) {
      continue;
    }

    const relativePath = key.slice(requestedPrefix.length);
    const slashIndex = relativePath.indexOf("/");
    if (slashIndex >= 0) {
      const prefix = `${requestedPrefix}${relativePath.slice(0, slashIndex + 1)}`;
      folderMap.set(prefix, { name: getLeafName(prefix), prefix });
    } else {
      fileMap.set(key, toFileEntry(key));
    }
  }

  return {
    folders: [...folderMap.values()].slice(0, limit),
    files: [...fileMap.values()].slice(0, Math.max(limit - folderMap.size, 0)),
    nextCursor: null
  };
}

function searchRecords(records, {
  requestedPrefix,
  allowedPrefixes,
  excludedPrefixes,
  searchTerm,
  limit
}) {
  const scopePrefixes = requestedPrefix
    ? [requestedPrefix]
    : (allowedPrefixes.length ? allowedPrefixes : [""]);
  const normalizedSearchTerm = normalizeSearchKey(searchTerm);
  const folderMap = new Map();
  const fileMap = new Map();

  for (const record of records) {
    const key = record.objectKey;
    if (
      !key
      || !isAllowedForPrefixes(key, allowedPrefixes)
      || isExcludedForPrefixes(key, excludedPrefixes)
    ) {
      continue;
    }

    const scopePrefix = scopePrefixes.find((prefix) => key.startsWith(prefix));
    if (scopePrefix === undefined) {
      continue;
    }

    const relativePath = key.slice(scopePrefix.length);
    const pathSegments = relativePath.split("/").filter(Boolean);
    const immediateFolder = pathSegments.length > 1 ? `${scopePrefix}${pathSegments[0]}/` : "";

    if (immediateFolder && !folderMap.has(immediateFolder)) {
      const folderRank = getSearchMatchRank(getLeafName(immediateFolder), searchTerm, normalizedSearchTerm);
      const folderPathRank = getSearchMatchRank(immediateFolder, searchTerm, normalizedSearchTerm);
      const rank = Math.min(folderRank, folderPathRank + 2);
      if (Number.isFinite(rank)) {
        folderMap.set(immediateFolder, {
          name: getLeafName(immediateFolder),
          prefix: immediateFolder,
          rank
        });
      }
    }

    if (!fileMap.has(key)) {
      const fileRank = getSearchMatchRank(key, searchTerm, normalizedSearchTerm);
      if (Number.isFinite(fileRank)) {
        fileMap.set(key, {
          ...toFileEntry(key),
          rank: fileRank + 4
        });
      }
    }
  }

  const folders = sortRankedResults(folderMap.values()).slice(0, limit);
  const files = sortRankedResults(fileMap.values()).slice(0, Math.max(limit - folders.length, 0));

  return {
    folders: folders.map(stripSearchRank),
    files: files.map(stripSearchRank),
    nextCursor: null
  };
}

function toFileEntry(objectKey) {
  return { name: getLeafName(objectKey), objectKey };
}

function encodeCursor(offset) {
  return Buffer.from(`index:${offset}`, "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) {
    return 0;
  }

  try {
    const decoded = Buffer.from(String(cursor), "base64url").toString("utf8");
    const match = decoded.match(/^index:(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

function normalizePrefix(value) {
  const normalized = String(value || "").trim().replace(/^\/+/, "");
  return normalized && !normalized.endsWith("/") ? `${normalized}/` : normalized;
}

function normalizeSearchTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSearchKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getSearchTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isShortSearchTerm(normalizedSearchTerm) {
  return normalizedSearchTerm.length > 0 && normalizedSearchTerm.length <= 2;
}

function includesSearchTerm(value, rawSearchTerm, normalizedSearchTerm) {
  return Number.isFinite(getSearchMatchRank(value, rawSearchTerm, normalizedSearchTerm));
}

function getSearchMatchRank(value, rawSearchTerm, normalizedSearchTerm) {
  if (!normalizedSearchTerm) {
    return Infinity;
  }

  if (isShortSearchTerm(normalizedSearchTerm)) {
    const tokenRanks = getSearchTokens(value)
      .filter((token) => token.startsWith(normalizedSearchTerm))
      .map((token) => token === normalizedSearchTerm ? 0 : 1);
    return tokenRanks.length ? Math.min(...tokenRanks) : Infinity;
  }

  const candidate = String(value || "").toLowerCase();
  if (candidate.includes(rawSearchTerm)) {
    return candidate === rawSearchTerm ? 0 : 3;
  }

  const normalizedCandidate = normalizeSearchKey(candidate);
  if (normalizedCandidate.includes(normalizedSearchTerm)) {
    return normalizedCandidate === normalizedSearchTerm ? 0 : 3;
  }

  const candidateVariants = getSearchVariants(normalizedCandidate);
  const searchVariants = getSearchVariants(normalizedSearchTerm);
  const hasVariantMatch = searchVariants.some((searchVariant) =>
    candidateVariants.some((candidateVariant) => candidateVariant.includes(searchVariant))
  );
  return hasVariantMatch ? 4 : Infinity;
}

function getSearchVariants(value) {
  const base = normalizeSearchKey(value);
  const variants = new Set(base ? [base] : []);
  if (base.length > 2 && base.endsWith("s")) {
    variants.add(base.slice(0, -1));
  }
  return [...variants];
}

function sortRankedResults(items) {
  return [...items].sort((left, right) => {
    const rankDelta = left.rank - right.rank;
    if (rankDelta) {
      return rankDelta;
    }
    return String(left.name || left.objectKey || left.prefix || "")
      .localeCompare(String(right.name || right.objectKey || right.prefix || ""));
  });
}

function stripSearchRank(item) {
  const { rank, ...publicItem } = item;
  return publicItem;
}

function isAllowedForPrefixes(candidate, allowedPrefixes) {
  return !allowedPrefixes.length
    || allowedPrefixes.some((prefix) => String(candidate || "").startsWith(prefix));
}

function isExcludedForPrefixes(candidate, excludedPrefixes) {
  return excludedPrefixes.some((prefix) => String(candidate || "").startsWith(prefix));
}

function getLeafName(path) {
  const segments = String(path || "").replace(/\/+$/, "").split("/").filter(Boolean);
  return segments[segments.length - 1] || String(path || "");
}
