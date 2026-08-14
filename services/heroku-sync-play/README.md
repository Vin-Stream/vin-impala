# Impala Sync Play Service

Ephemeral upstream playback control for users who independently stream the same item from a shared Impala library.

The service never receives or proxies media. Each Impala player obtains its own short-lived media URL from the existing signer. Sync Play stores only the temporary coordination state needed for the active session.

## Initial milestone

- Runtime-generated `IMPALA-xxxxx` session codes
- Host-only or shared controls
- Service-authoritative playback clock
- Timestamped play, pause, and seek commands
- Participant drift reports and correction guidance
- In-memory sessions with automatic expiry
- Host departure immediately ends the session
- No viewing history or durable participant records

The first transport is intentionally a small authenticated HTTP API. A later milestone can add real-time delivery without changing the state model.

## Configuration

```text
SYNC_PLAY_ENABLED=false
SESSION_SECRET=<same signer session secret>
ALLOWED_USERS_JSON=<same active users as signer>
CORS_ORIGINS=https://impala.discrete-dev.com,http://localhost:8000
SESSION_TTL_SECONDS=21600
```

`SESSION_TTL_SECONDS` is capped at 24 hours. Keep `SYNC_PLAY_ENABLED=false` until the service has been deployed and verified.

## API

All `/api` routes require the existing Impala bearer token and return `Cache-Control: no-store`.

- `POST /api/sync/sessions` — create; body: `{ "mediaId": "...", "controlMode": "host" }`
- `POST /api/sync/sessions/:code/join` — join
- `GET /api/sync/sessions/:code` — current authoritative state
- `POST /api/sync/sessions/:code/commands` — play, pause, or seek
- `POST /api/sync/sessions/:code/reports` — report player position and receive drift guidance
- `DELETE /api/sync/sessions/:code` — leave; the host ends the session

## Privacy boundary

The service keeps the media identifier, host identity, participant identities, playback state, and short-lived drift reports only in process memory. Public session snapshots expose participant roles and readiness but not participant usernames. When a session expires, the process restarts, or the host leaves, its state disappears.

## Verification

```powershell
npm test
node --check app.js
node --check server.js
```
