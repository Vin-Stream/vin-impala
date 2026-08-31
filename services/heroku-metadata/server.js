const http = require("node:http");
const { lookupMetadata } = require("./service.js");

const JSON_TYPE = "application/json; charset=utf-8";
const PUBLIC_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function writeJson(response, statusCode, body, options = {}) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Accept",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": options.cacheControl || "no-store",
    "Content-Type": JSON_TYPE,
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function createMetadataServer(options = {}) {
  const lookup = options.lookupMetadata || lookupMetadata;
  const env = options.env || process.env;
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://metadata.local");

    if (request.method === "OPTIONS" && url.pathname === "/api/metadata") {
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Accept",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      writeJson(response, 200, {
        ok: true,
        service: "impala-family-metadata",
        albumMetadata: true,
        movieMetadata: Boolean(env.TMDB_READ_ACCESS_TOKEN)
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      writeJson(response, 200, {
        service: "Impala Family Metadata",
        status: "ready",
        health: "/healthz",
        metadata: "/api/metadata"
      });
      return;
    }

    if (url.pathname !== "/api/metadata") {
      writeJson(response, 404, { error: "Not found" });
      return;
    }

    if (request.method !== "GET") {
      writeJson(response, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const query = Object.fromEntries(url.searchParams.entries());
      const result = await lookup(query, { env });
      writeJson(response, result.status, result.body, {
        cacheControl: result.status === 200 ? PUBLIC_CACHE : "no-store"
      });
    } catch (error) {
      console.error("Metadata lookup failed", error);
      writeJson(response, 502, { error: "Metadata provider unavailable" });
    }
  });
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  createMetadataServer().listen(port, () => {
    console.log(`Impala Family Metadata listening on port ${port}`);
  });
}

module.exports = { createMetadataServer };
