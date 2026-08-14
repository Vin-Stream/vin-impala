# Impala Session Token Specification

Impala uses a native, signed session token shared by independently deployed services. It does not use OAuth, JWT, or an external identity provider.

## Wire format

```text
base64url(JSON payload) + "." + base64url(HMAC-SHA256(encoded payload))
```

`SESSION_SECRET` is the HMAC secret. Services that accept the same browser session must use the same secret.

## Canonical payload

New sessions use:

```json
{
  "sub": "normalized username",
  "exp": "ISO-8601 timestamp",
  "roles": ["viewer"],
  "deviceId": "browser instance ID when available",
  "sessionId": "random session UUID"
}
```

The verifier temporarily accepts legacy `username` and `expiresAt` aliases during rollout. Authorization never trusts token roles, administrator flags, display names, or library prefixes; each service derives current permissions from its active allow-list.

## Required authorization behavior

1. Verify the bearer-token shape.
2. Verify the HMAC signature with constant-time comparison.
3. Parse the payload.
4. Require a valid, future expiration timestamp.
5. Normalize the username to lowercase.
6. Require the user to remain in the service's current `ALLOWED_USERS_JSON`.
7. Derive current permissions from that allow-list, not from stale token claims.

An empty or missing allow-list authorizes nobody.

## Error model

- `401 { "error": "Authentication required." }` — bearer token is missing.
- `401 { "error": "Invalid session." }` — token is malformed, forged, invalid, or expired.
- `403 { "error": "User is not authorized." }` — token is valid but the user is absent from the active allow-list.
- `403` with a capability-specific message — authenticated user lacks a required role.
- `503` — optional service is disabled or unavailable.

## Deployment copies

Each Heroku service is deployed from its own Git subtree, so it must contain its own copy of `session-token.js`. The canonical source is:

```text
services/shared-auth/session-token.js
```

Update deployment copies:

```powershell
node scripts/sync-session-token.mjs
```

Verify that no copy drifted:

```powershell
node scripts/sync-session-token.mjs --check
node --test services/shared-auth/session-token.test.js
```
