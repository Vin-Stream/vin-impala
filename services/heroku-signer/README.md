# Impala Streamer Signer

The signer authenticates users, lists private MEGA S4 media, and creates short-lived playback URLs.

## Library index

The optional library index avoids repeatedly scanning S4 while users browse or search. Each index is stored as NDJSON in S4, loaded into signer memory, and checked for a new ETag at a controlled interval. If an index is missing or unavailable, `/api/library` automatically falls back to live S4 listing.

Build both indexes with the same Heroku configuration used by the web process:

```bash
npm run build-index
```

The command is suitable for Heroku Scheduler. Run it after bulk media uploads and periodically as reconciliation. Building uses a temporary file so the full catalog is never held in builder memory.

### Required configuration

- `S4_BUCKET`: audio bucket. For backward compatibility, `audio-bucket;video-bucket` is accepted.
- `S4_VIDEO_BUCKET`: optional separate video bucket; preferred over the semicolon form.
- `S4_ACCESS_KEY_ID`
- `S4_SECRET_ACCESS_KEY`
- `S4_ENDPOINT`: defaults to the MEGA S4 endpoint.
- `S4_REGION`: defaults to `eu-central-1`.

### Per-user bucket access

Set `S4_BUCKET_RULES_JSON` when different users should have access to different configured buckets:

```json
{
  "bucketRules": {
    "kevin": ["impalatunes", "impalavideo"],
    "audio-guest": ["impalatunes"]
  }
}
```

Usernames and bucket names are matched exactly after conversion to lowercase. Prefix matching is intentionally not used. The restriction applies to library listings, library-index status, and signed media URLs.

For backward compatibility, omitting `S4_BUCKET_RULES_JSON` leaves bucket access unrestricted for authenticated users. Once the variable is configured, a user without an entry is denied access to every bucket. An empty array intentionally denies that user all bucket access.

PowerShell example:

```powershell
heroku config:set 'S4_BUCKET_RULES_JSON={"bucketRules":{"kevin":["impalatunes","impalavideo"],"audio-guest":["impalatunes"]}}' -a impalastreamer
```

### Optional index configuration

- `S4_INDEX_ENABLED`: defaults to `true`; set to `false` to force live listing.
- `S4_INDEX_CHECK_SECONDS`: ETag check interval, default `60`.
- `S4_INDEX_AUDIO_PREFIX`: audio scan prefix, default `audio/`. Set to an empty value only when audio objects live at the bucket root.
- `S4_INDEX_VIDEO_PREFIX`: video scan prefix. Defaults to the bucket root when a separate video bucket exists, otherwise `video/`.
- `S4_AUDIO_INDEX_KEY`: default `indexes/audio.ndjson`.
- `S4_VIDEO_INDEX_KEY`: default `indexes/video.ndjson`.

### Private video folders

Use `S4_VIDEO_PRIVATE_PREFIXES` to hide one or more comma-separated video prefixes from non-admin users. It defaults to `test/`. Users whose `ALLOWED_USERS_JSON` entry has `"isAdmin": true` can access the private prefixes:

```bash
heroku config:set S4_VIDEO_PRIVATE_PREFIXES=test/
```

The restriction is enforced for index and live listings, searches, recursive imports, and signed media URLs. Non-admin users receive no listing results and cannot access a private object by guessing its key.

The index builder writes one record per media object. The web process keeps the existing `/api/library` folders/files/pagination contract, applies every user's `allowedPrefixes`, and never sends the complete manifest to the browser.

`GET /api/index-version?media=audio` is authenticated and reports cache versions and record counts. `/healthz` reports the same in-memory status without loading an index.

### Rebuild from the playlist page

An administrator can rebuild both indexes from the **Rebuild Index** button on `songlist.html`. The signer starts the shared builder in the web dyno and the page polls its status without holding one long HTTP request open.

Add `"isAdmin": true` to the appropriate entry in `ALLOWED_USERS_JSON`, preserving the existing password hash and prefixes. The user must sign out and back in after this configuration or deployment change because admin access is embedded in the signed session token.

The protected routes are:

- `POST /api/admin/rebuild-index` — start a rebuild, or report one already running.
- `GET /api/admin/rebuild-index` — get in-memory progress and results.

This status model assumes one Heroku web dyno. With multiple web dynos, move rebuild status to a shared store or trigger a dedicated worker instead.

## Verification

```bash
npm test
node --check server.js
node --check scripts/build-index.mjs
```

## Feedback email

The public `POST /api/feedback` route sends the inline player feedback to email through Resend. Configure:

- `RESEND_API_KEY` (required to enable delivery)
- `FEEDBACK_EMAIL` (optional, defaults to `kevin@discrete-dev.com`)
- `FEEDBACK_FROM_EMAIL` (optional; use a sender from a domain verified in Resend)
