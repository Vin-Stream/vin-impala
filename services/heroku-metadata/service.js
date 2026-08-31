function year(value) {
  return /^\d{4}/.test(String(value || "")) ? String(value).slice(0, 4) : "";
}

function normalizeMovieTitle(value) {
  return String(value || "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[._]+/g, " ")
    .replace(/\b(?:2160p|1080p|720p|4k|uhd|bluray|blu-ray|webrip|web-dl|hdr|x26[45]|h26[45])\b/gi, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleAndYear(value, suppliedYear = "") {
  const raw = normalizeMovieTitle(value);
  const embeddedYear = raw.match(/\b(19\d{2}|20\d{2})\b/)?.[1] || "";
  return {
    title: raw.replace(/\b(?:19\d{2}|20\d{2})\b/g, " ").replace(/\s+/g, " ").trim(),
    year: year(suppliedYear) || embeddedYear
  };
}

async function fetchJson(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Metadata provider returned ${response.status}`);
  return response.json();
}

function formatAlbum(release, fallbackArtist = "") {
  if (!release) return null;
  return {
    kind: "album",
    providerId: release.id,
    title: release.title,
    artist: release["artist-credit"]?.map((credit) => credit.name).join(", ") || fallbackArtist,
    year: year(release.date),
    artworkUrl: `https://coverartarchive.org/release/${release.id}/front-500`,
    sourceUrl: `https://musicbrainz.org/release/${release.id}`,
    provider: "MusicBrainz"
  };
}

async function findAlbum(fetchImpl, title, artist) {
  const query = [`release:${JSON.stringify(title)}`];
  if (artist) query.push(`artist:${JSON.stringify(artist)}`);
  const url = new URL("https://musicbrainz.org/ws/2/release/");
  url.searchParams.set("query", query.join(" AND "));
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "1");
  const data = await fetchJson(fetchImpl, url, { "user-agent": "ImpalaStreamer/1.2 (personal media metadata)" });
  return formatAlbum(data.releases?.[0], artist);
}

async function findAlbumById(fetchImpl, providerId) {
  const url = new URL(`https://musicbrainz.org/ws/2/release/${encodeURIComponent(providerId)}`);
  url.searchParams.set("fmt", "json");
  const release = await fetchJson(fetchImpl, url, { "user-agent": "ImpalaStreamer/1.2 (personal media metadata)" });
  return formatAlbum(release);
}

function formatMovie(movie) {
  if (!movie) return null;
  const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "";
  return {
    kind: "movie",
    providerId: String(movie.id),
    title: movie.title,
    year: year(movie.release_date),
    summary: movie.overview,
    posterUrl,
    artworkUrl: posterUrl,
    backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : "",
    rating: Number.isFinite(movie.vote_average) ? Number(movie.vote_average.toFixed(1)) : null,
    sourceUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    provider: "TMDB"
  };
}

async function findMovie(fetchImpl, title, releaseYear, env) {
  const token = env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return { unavailable: "Movie metadata is owner-disabled until TMDB_READ_ACCESS_TOKEN is configured." };
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("query", title);
  url.searchParams.set("include_adult", "false");
  if (releaseYear) url.searchParams.set("year", releaseYear);
  const data = await fetchJson(fetchImpl, url, { Authorization: `Bearer ${token}` });
  return formatMovie(data.results?.[0]);
}

async function findMovieById(fetchImpl, providerId, env) {
  const token = env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return { unavailable: "Movie metadata is owner-disabled until TMDB_READ_ACCESS_TOKEN is configured." };
  const url = new URL(`https://api.themoviedb.org/3/movie/${encodeURIComponent(providerId)}`);
  const movie = await fetchJson(fetchImpl, url, { Authorization: `Bearer ${token}` });
  return formatMovie(movie);
}

async function lookupMetadata(query = {}, options = {}) {
  const kind = String(query.kind || "").toLowerCase();
  const rawTitle = String(query.title || "").trim().slice(0, 160);
  const artist = String(query.artist || "").trim().slice(0, 160);
  const provider = String(query.provider || "").trim().toLowerCase();
  const providerId = String(query.providerId || "").trim().slice(0, 100);
  const parsed = kind === "movie"
    ? extractTitleAndYear(rawTitle, String(query.year || "").trim())
    : { title: rawTitle, year: "" };
  if ((!parsed.title && !providerId) || !["album", "movie"].includes(kind)) {
    return { status: 400, body: { error: "kind (album|movie) and title are required" } };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  let metadata;
  if (providerId && kind === "album" && (!provider || provider === "musicbrainz")) {
    metadata = await findAlbumById(fetchImpl, providerId);
  } else if (providerId && kind === "movie" && (!provider || provider === "tmdb")) {
    metadata = await findMovieById(fetchImpl, providerId, env);
  } else {
    metadata = kind === "album"
      ? await findAlbum(fetchImpl, parsed.title, artist)
      : await findMovie(fetchImpl, parsed.title, parsed.year, env);
  }
  if (metadata?.unavailable) return { status: 503, body: metadata };
  if (!metadata) return { status: 404, body: { error: "No metadata match" } };
  return { status: 200, body: { metadata } };
}

module.exports = { extractTitleAndYear, lookupMetadata, normalizeMovieTitle, year };
