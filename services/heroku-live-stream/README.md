# Impala Live Stream Service

Separate Heroku microservice for live stream session control.

This service intentionally does not touch S4 signing, core playback, playlists, or browser-local app data. It verifies the same signed session token format as the signer service and exposes a small live-session control API.

## Endpoints

- `GET /healthz`
- `GET /api/streams`
- `GET /api/live/session`
- `POST /api/live/session`

Session actions:

```json
{ "action": "start", "title": "Pilot Stream", "streamUrl": "https://example.com/live/master.m3u8" }
{ "action": "update", "title": "Updated Title", "streamUrl": "https://example.com/live/master.m3u8" }
{ "action": "stop" }
```

Any signed user still listed in `ALLOWED_USERS_JSON` can read and mutate live session state. Users removed from `ALLOWED_USERS_JSON` are rejected even if they still have an unexpired browser session.

The stream catalog is loaded from `streams.json`. Only entries with `"enabled": true` are exposed by `GET /api/streams`; review notes and internal review status stay server-side.

## Required Config

Set these on the `impala-livestream` Heroku app:

```powershell
heroku config:set SESSION_SECRET="<same value as signer>" -a impala-livestream
heroku config:set ALLOWED_USERS_JSON="<same users as signer>" -a impala-livestream
heroku config:set CORS_ORIGINS="http://localhost:8000,https://impala.kevin-wagner.org" -a impala-livestream
heroku config:set LIVE_STREAM_ENABLED="false" -a impala-livestream
```

Use the same `SESSION_SECRET` as the existing signer app so existing Impala auth sessions verify. The live service uses `ALLOWED_USERS_JSON` as the access list; extra signer fields are ignored.

Keep `LIVE_STREAM_ENABLED=false` until the service is deployed and verified. The frontend still remains disconnected while `liveStreamApiBaseUrl` is blank.

## Local Checks

```powershell
node --check app.js
node --check server.js
node --test
npm run verify:streams
```

`verify:streams` checks every catalog entry in `streams.json`. Disabled/pending entries are reported but do not fail the command; enabled streams must have a reachable master playlist and media playlist chain.

## Deploy

From the repository root:

```powershell
git subtree push --prefix services/heroku-live-stream heroku-live main
```

Then check:

```powershell
heroku ps -a impala-livestream
heroku logs --tail -a impala-livestream
curl https://impala-livestream-0225c97b1e97.herokuapp.com/healthz
```

## Frontend Connection

Do not point the frontend at this service until the service is healthy.

Later, set:

```js
liveStreamApiBaseUrl: "https://impala-livestream-0225c97b1e97.herokuapp.com"
```

That should be a separate commit after service deployment and health checks pass.
