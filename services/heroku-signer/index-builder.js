import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

export async function buildLibraryIndexes({ s3Client, scopes, onProgress = () => {} }) {
  const results = [];

  for (const scope of scopes) {
    onProgress({ phase: "building", scope: scope.name });
    const result = await buildLibraryIndex({ s3Client, scope });
    results.push(result);
    onProgress({ phase: "completed-scope", scope: scope.name, result });
  }

  return results;
}

export async function buildLibraryIndex({ s3Client, scope }) {
  const temporaryPath = join(tmpdir(), `impala-${scope.name}-${randomUUID()}.ndjson`);
  const output = createWriteStream(temporaryPath, { encoding: "utf8" });
  let continuationToken;
  let count = 0;
  const videoTitleKeys = new Set();
  const excludedPrefixes = (scope.excludedPrefixes || []).map(normalizeScanPrefix).filter(Boolean);

  try {
    do {
      const page = await s3Client.send(new ListObjectsV2Command({
        Bucket: scope.bucket,
        Prefix: scope.prefix,
        ContinuationToken: continuationToken
      }));

      for (const object of page.Contents || []) {
        const objectKey = String(object.Key || "");
        if (!isMediaObjectKey(objectKey) || isExcludedObjectKey(objectKey, scope.prefix, excludedPrefixes)) {
          continue;
        }

        const metadata = parseMediaPath(objectKey, scope.prefix);
        const videoTitleKey = scope.name === "video"
          ? getVideoTitleKey(objectKey, scope.prefix, metadata)
          : "";
        if (videoTitleKey) {
          videoTitleKeys.add(videoTitleKey);
        }
        const record = {
          objectKey,
          artist: metadata.artist,
          album: metadata.album,
          title: metadata.title,
          type: scope.name,
          size: Number(object.Size || 0),
          modified: object.LastModified ? new Date(object.LastModified).toISOString() : null
        };

        if (!output.write(`${JSON.stringify(record)}\n`)) {
          await once(output, "drain");
        }
        count += 1;
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    output.end();
    await once(output, "finish");
    const fileStats = await stat(temporaryPath);
    const uploadedAt = new Date().toISOString();
    const result = await s3Client.send(new PutObjectCommand({
      Bucket: scope.bucket,
      Key: scope.indexKey,
      Body: createReadStream(temporaryPath),
      ContentLength: fileStats.size,
      ContentType: "application/x-ndjson",
      Metadata: {
        records: String(count),
        generated: uploadedAt
      }
    }));

    return {
      name: scope.name,
      bucket: scope.bucket,
      indexKey: scope.indexKey,
      records: count,
      titleCount: scope.name === "video" ? videoTitleKeys.size : null,
      etag: result.ETag || null,
      generatedAt: uploadedAt
    };
  } finally {
    output.destroy();
    await unlink(temporaryPath).catch(() => {});
  }
}

export function normalizeScanPrefix(value) {
  return String(value || "").trim().replace(/^\/+/, "");
}

function isMediaObjectKey(objectKey) {
  return /\.(flac|mp3|m4a|mp4|m4v|wav|ogg|aac|webm|mov)$/i.test(objectKey);
}

function parseMediaPath(objectKey, scanPrefix) {
  const relativeKey = objectKey.startsWith(scanPrefix) ? objectKey.slice(scanPrefix.length) : objectKey;
  const segments = relativeKey.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1] || objectKey;
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const artist = segments.length > 1 ? segments[0] : "Unknown artist";
  const album = segments.length > 2 ? segments[segments.length - 2] : "";
  let title = withoutExtension.replace(/^\d+\s*[-._)]*\s*/, "").trim();
  const artistPrefix = `${artist.toLowerCase()} - `;

  if (title.toLowerCase().startsWith(artistPrefix)) {
    title = title.slice(artistPrefix.length).trim();
  }

  return { artist, album, title: title || withoutExtension || fileName };
}

function getVideoTitleKey(objectKey, scanPrefix, metadata) {
  const relativeKey = objectKey.startsWith(scanPrefix) ? objectKey.slice(scanPrefix.length) : objectKey;
  const segments = relativeKey.split("/").filter(Boolean);

  if (segments.length > 1) {
    return segments[0].trim().toLowerCase();
  }

  return String(metadata.title || segments[0] || objectKey).trim().toLowerCase();
}

function isExcludedObjectKey(objectKey, scanPrefix, excludedPrefixes) {
  const relativeKey = objectKey.startsWith(scanPrefix) ? objectKey.slice(scanPrefix.length) : objectKey;
  return excludedPrefixes.some((prefix) => (
    objectKey.startsWith(prefix) || relativeKey.startsWith(prefix)
  ));
}
