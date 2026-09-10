# Family activity

Sign in as an administrator, then open **Family activity** beside Settings in the player. The table includes every current `ALLOWED_USERS_JSON` entry. Refresh retrieves current data; device details expand inside each row.

The signer records successful logins and authenticated player heartbeats every two minutes while the player tab is visible or media is playing. Hidden idle tabs do not send heartbeats. “Last active” means an open visible player or ongoing playback, not a count of listening time. Multiple tabs on the same browser identity count as one device. Browser identity resets can increase device counts; a copied identity may conceal distinct devices.

Recent devices cover 30 days, bounded to the latest 32 browser identities. Overlap flags indicate that different identities checked in within four minutes. The latest overlap time is retained for later personal follow-up. Old device details are removed on the next write and excluded from reads. No IP addresses, passwords, media titles or detailed event history are stored.

## Configuration

Set `MONGODB_URI` in the repository-root `.env` for local development. The signer loads it automatically; `services/heroku-signer/.env` takes precedence, and existing environment variables always win. On Heroku set the same variable as a config var. `MONGODB_DATABASE` optionally overrides the default dedicated database `impala_family`. The URI must be a complete connection string with any credentials already included and URL-encoded; separate username/password variables are not substituted into it.

Run `npm ci` in `services/heroku-signer` after updating. MongoDB must permit the backend network and the database user must be able to read/write `impala_family.user_activity`. One upserted document per username uses MongoDB's unique `_id` index. The database and collection are created on first write. Tracking failures do not block sign-in or playback; admin reads return an explicit unavailable message.

Deploy the frontend files and updated signer together. Existing sessions start recording activity without signing in again; login count starts at the next successful login. Tracking is not retrospective.

## Reviewing the allow-list

“No activity recorded” means no data has been collected yet. “Inactive for 30+ days” requires an actual last-active timestamp older than 30 days. Allow an observation period after deployment before following up or removing invitees. Update `ALLOWED_USERS_JSON` manually in every participating backend when revoking access. This feature does not change credentials or access lists.

Endpoints: authenticated `POST /api/activity/heartbeat` and administrator-only `GET /api/admin/activity`. The server obtains the username from the verified session and checks the current allow-list and admin setting. No public record editing or individual history pages are added.
