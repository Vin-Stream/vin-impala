# Impala Coast to Coast

An optional, isolated signaling service for private two-person viewing.

- Exactly one host and one guest per ephemeral room.
- The host controls video playback.
- Each browser streams the shared-library video independently.
- WebRTC carries microphone audio directly between the browsers.
- The service relays WebRTC setup and playback commands only. It does not receive,
  record, or retain media, conversations, habits, or room history.
- Rooms are memory-only and expire after `SESSION_TTL_SECONDS` (six hours by default).

## Required configuration

`SESSION_SECRET`, `ALLOWED_USERS_JSON`, `CORS_ORIGINS`, and
`COAST_TO_COAST_ENABLED`. Keep the feature flag `false` until deployment and
authentication checks pass.

Optional: `SESSION_TTL_SECONDS` (default `21600`).

## Deploy this subtree

```powershell
git subtree push --prefix services/heroku-coast heroku-coast main
```

The initial release uses browser ICE discovery. A self-hosted TURN server can be
added later for restrictive networks without changing room or authentication design.
