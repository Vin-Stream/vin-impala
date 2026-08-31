# Impala Family Metadata

Public, read-only metadata sidecar for Impala Family Streamer. Album lookups use
MusicBrainz and Cover Art Archive. Movie lookups use TMDB only when the owner
configures `TMDB_READ_ACCESS_TOKEN`.

## Routes

- `GET /healthz`
- `GET /api/metadata?kind=movie&title=Moon%202009`
- `GET /api/metadata?kind=album&title=Kind%20of%20Blue&artist=Miles%20Davis`

## Heroku configuration

```powershell
heroku config:set TMDB_READ_ACCESS_TOKEN="<owner TMDB read access token>" -a family-impala-metadata-93d758b55ecd
```

The service intentionally accepts public cross-origin GET requests. It exposes
no private library paths or credentials; clients send only the limited title,
artist, year, kind, and optional stable provider identifiers required for an
owner-enabled lookup.
