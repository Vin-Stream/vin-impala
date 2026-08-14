# Impala Streamer Developer Guide

This guide is for developers and maintainers. The user-facing guide lives in `userGuide/userGuide.html`.

Terminology note (release alignment): use the live UI labels `Library & Playlists`, `Copy Join Code`, `Start Session`, and `Send Functional Report`.

## 1) Current Release Snapshot

Version line: `v1.x` (local MKV enhancement)

Core additions in this release:

1. Dedicated sign-in page and auth guard redirect flow.
2. Diagnostics subsystem with snapshot publishing and rolling error logs.
3. Playlist registry that supports built-in, custom, and local-library modes.
4. Persistent repeat mode and playback position recovery.
5. Local media roots + Local Library JSON override.
6. Video playback support and hardened media resolution.
7. Local-only MKV preparation through the Local Library Companion.
8. Durable per-title prepared media and Voice Sync persistence.
9. iPhone system-media integration for vehicle and accessory controls.

## 2) App Topology

Frontend pages:

1. `signin.html`: obtains auth session and stores it in browser storage.
2. `index.html`: main player UI.
3. `songlist.html`: Library & Playlists page (playlist management + S4 browser + optional admin Index Audio/Index Video controls).
4. `preferences.html`: palette/customization/local media/local JSON settings.
5. `diagnostics.html`: runtime health and debug view.
6. `live.html`: optional Live Stream session control surface.
7. `userGuide/userGuide.html`: user documentation.

Core runtime modules:

1. `app-config.js`: environment and behavior flags.
2. `auth-guard.js`: redirects unauthenticated users to sign-in.
3. `script.js`: main player orchestration and cross-module coordination.
4. `modules/player-view.js`: player DOM presentation, status, source, and mode indicators.
5. `modules/player-state.js`: in-memory repeat/shuffle state and random-history decisions.
6. `modules/media-session.js`: iPhone/CarPlay metadata, remote commands, and interruption recovery.
7. `modules/local-library.js`: local playback, Voice Sync, corrected-copy, and related-MKV orchestration.
8. `modules/cloud-library.js`: signer request construction and signed cloud-media URL resolution.
9. `modules/live-playback.js`: active live-session state, HLS preparation, and main-player live playback.
10. `modules/collaboration.js`: shared-video selection and player control policy for Sync Play and Coast.
11. `modules/ui-events.js`: main-player DOM event binding and action routing.
12. `modules/boot.js`: deterministic startup order, saved-state restoration, and live-session handoff.
13. `player-state-store.js`: persistent repeat/shuffle, resume-position, and Voice Sync preferences.
14. `player-engine.js`: playback actions and state machine behavior.
15. `media-resolver.js`: media kind inference + local/cloud URL resolution helpers.
16. `playlist-store.js`: built-in/custom/local playlist registry and persistence.
17. `ui-preferences.js`: preferences normalization, save/load, and DOM application.
18. `diagnostics-store.js`: diagnostics snapshot + storage write telemetry + error capture.
19. `diagnostics.js`: diagnostics page renderer.
20. `songlist.js`: playlist editing and S4 browsing/import tools.
21. `live-stream.js`: dedicated Live Stream control-page logic.
22. `sync-play-controller.js`: Sync Play coordination controls.
23. `coast-controller.js`: Coast to Coast room/voice controls.

Signer backend (separate service):

1. `services/heroku-signer/server.js`
2. `services/heroku-signer/library-index.js`
3. `services/heroku-signer/index-builder.js`

Local Library Companion:

1. `services/local-library-helper/main.go`: loopback service, recursive scanning, MKV preparation, and Voice Sync variants.
2. `services/local-library-helper/main_test.go`: permanent regression coverage; Go excludes it from release executables.
3. `scripts/build-companion-releases.ps1`: local six-platform release builder.
4. `.github/workflows/companion-release.yml`: CI artifacts and tagged Companion releases.

## 3) Authentication Flow

Storage key default: `<activeStoragePrefix>.authSession`. The active prefix comes from `playlistStoragePrefix` plus optional `instanceStorageId` in `app-config.js`.

Lifecycle:

1. User signs in on `signin.html`.
2. Session token payload is stored in localStorage.
3. Protected routes run `auth-guard.js` and redirect to `signin.html` if missing/expired.
4. API requests include `Authorization: Bearer <token>`.
5. On `401`, frontend clears session and redirects back to sign-in.

## 4) Playlist Modes and Registry Behavior

`PlaylistStore.getPlaylistRegistry()` composes the player source list using this priority:

1. Local library playlists (if Local Library JSON parses and has entries).
2. Built-in playlists (`songsKw`, `songs`) when local library is absent/empty.
3. Custom playlists (always appended).

Kinds used in runtime:

1. `built-in`
2. `local`
3. `custom`

Track selection behavior:

1. Star selections are transient and stored in sessionStorage.
2. Starred actions support append-to-existing and create-new custom playlist.
3. Dedupe logic uses `objectKey`/`file` identity when available.

## 5) Media Resolution and Playback

Resolution order in player flow:

1. Attempt local URL via configured local media roots.
2. Fallback to direct local path if present.
3. If song has `objectKey`, request signed URL from signer API.

Additional behavior:

1. Audio and video mode are auto-selected from media metadata/path.
2. Playback keeps media elements mutually exclusive.
3. Repeat mode cycles `off -> one -> all` and persists in localStorage.
4. Video resume button appears only when saved position crosses threshold.

### Local MKV Architecture

MKV support belongs to the Companion, not the cloud signer or browser core:

1. `media-resolver.js` recognizes a local MKV and requests preparation from the Companion.
2. The Companion validates that the source is inside the configured dedicated media root.
3. FFprobe inspects the source and FFmpeg creates a browser-compatible H.264/AAC MP4.
4. The original `Title.mkv` remains unchanged.
5. The durable result is written beside it as `Title.impala.mp4`.
6. `Title.impala.json` records source identity and the saved Voice Sync offset.
7. Later playback reuses the durable copy immediately when the manifest still matches.

The FFprobe result selects the least destructive valid plan:

1. H.264 with YUV420P video is stream-copied into MP4 without quality loss.
2. AAC audio is stream-copied when already compatible.
3. AC3, E-AC3, and other incompatible audio is converted to AAC stereo while compatible video is preserved.
4. HEVC or incompatible pixel formats are converted to H.264/YUV420P.
5. Only the first video and first audio stream are selected in the v1 compatibility copy.
6. The preparation display names the detected container, video/audio codecs, and audio channel count, and explains why conversion is needed.
7. PGS and other advanced subtitle streams are not included in the v1 prepared MP4.

Generated `.impala.mp4` files are excluded from library scans. A source size or
modification-time change invalidates the sidecar. Existing conflicting reserved
files are rejected rather than silently overwritten.

Voice Sync accepts offsets from -2000 through +2000 milliseconds in 50 ms steps.
When an adjustment is applied, Impala pauses the video at its current position.
It resumes automatically only when the video was playing beforehand; a video
that was already paused remains paused after the adjusted stream is ready.
Adjusted stream-copy variants are temporary and live in the Companion timing
cache. The default limit is 25 GB and cleanup removes only the oldest timing
variants, never original or durable prepared media. `Save This Timing` updates
the matching sidecar atomically.

### General Local-Video Voice Sync

Every `local-service` video may use Voice Sync. Non-MKV video is adjusted through
`/library/video/sync`; its saved offset lives in `Title.impala-timing.json` and
is invalidated if the source size or modification time changes. MKV continues to
use its prepared copy and ownership manifest. Generated timing files and corrected
copies contain `.impala.` and are excluded from recursive library scans.

The player calls the local-video preparation endpoint on every initial playback,
including a saved offset of zero. FFprobe returns the original immediately only
when both video and audio are browser-compatible. H.264 with AC3/E-AC3 is prepared
durably by copying the video and converting audio to AAC before a playback URL is
returned. This prevents Original Timing from bypassing audio compatibility.

`/library/video/corrected` creates `Title.impala-synced.mp4` atomically beside
the source. It applies the chosen timing, preserves compatible H.264/AAC streams,
converts incompatible streams only as needed, and refuses to overwrite an existing
corrected copy. That result is a standalone MP4 suitable for optional cloud upload.

### iPhone, Bluetooth, and CarPlay Now Playing

When supported by the iPhone browser, Impala publishes the current title, artist,
album or playlist, playback position, and Impala music logo through the system Media
Session. Vehicle and accessory play, pause, previous, and next commands use the same
player rules as the on-screen controls. A phone-call interruption retains the media
and position. When Impala becomes active again, it republishes its Now Playing
identity. If iOS has handed audio to another app, choose **Resume Impala** once
to reclaim playback at the preserved position.

This browser integration supplies the system Now Playing surface; it does not install
an Impala app icon on the CarPlay home screen. That dedicated surface requires a native
iOS app and Apple's CarPlay audio entitlement.

### Related MKV Groups

`/library/mkv/group` derives scope only from local folder boundaries. A folder
named `Season N` uses its parent as the series folder; otherwise the selected
folder is also the series scope. The API returns folder/series names, counts, and
local IDs. The browser asks before queuing work and supports title-only, folder,
or full-series choices. The queue is sequential and Stop After Current Title
sets a safe between-title cancellation boundary.

Collaboration/live behavior:

1. Sync Play shares a join code (`Copy Join Code`) to invite participants.
2. Live Stream uses `Start Session` / `Stop Session` controls on `live.html`.
3. Coast to Coast uses room codes and optional open-mic or push-to-talk voice modes.
4. Return to ordinary playback by choosing `Leave Session` in Sync Play or
   `Leave Room` in Coast to Coast before changing optional settings.
5. `Settings -> Reset Settings` restores optional features and browser
   preferences to defaults, but it does not terminate an active shared session
   or navigate away from Settings. Choose `Back to Player` afterward to resume
   ordinary playback.

## 6) Preferences Contract

Preferences storage key: `<activeStoragePrefix>.uiPreferences`

Default fields:

1. `palette`
2. `customNote`
3. `medallionSrc`
4. `localAudioDir`
5. `localVideoDir`
6. `localLibraryJson`
7. `cloudApiBaseUrl`
8. `instanceId`

Validation highlights:

1. `javascript:` URIs are rejected for medallion and local directories.
2. Local directory paths are normalized (trimmed, trailing slash removed).
3. Local JSON is stored as raw trimmed text; parsing happens where consumed.

## 7) Local Storage and Session Storage Keys

Given `playlistStoragePrefix = impalaStreamer` and empty `instanceStorageId`, keys include:

1. `impalaStreamer.authSession` (auth session payload)
2. `impalaStreamer.uiPreferences` (palette/content/local settings)
3. `impalaStreamer.customPlaylists`
4. `impalaStreamer.playerState`
5. `impalaStreamer.playStates.<playlistId>`
6. `impalaStreamer.playbackPositions`
7. `impalaStreamer.repeatMode`

Session storage:

1. `impalaStreamer.transientTrackSelections`

If `instanceStorageId = artistPilot`, the active prefix becomes `impalaStreamer.artistPilot`, and browser-local keys use that prefix instead. This isolates cloned/static Impala instances on the same browser.

## 8) Diagnostics Model

The diagnostics store is intentionally non-blocking and should never prevent playback.

Published snapshot groups:

1. `player`: active playlist/song index, playback intent, repeat mode, last error.
2. `registry`: built-in/custom/local counts and active mode.
3. `media`: current URL/source/mime debug information.
4. storage write success/failure tracking.
5. rolling error log with classified categories.

Use `diagnostics.html` during QA and incident triage.

Operational note:

1. The diagnostics page action is `Send Functional Report`.
2. This action reports success/failure in UI and should not imply a guaranteed response SLA.

## 9) Local Library JSON Shape

Supported top-level shapes:

1. Array of entries.
2. Object with one or more of:
	 - `audio`
	 - `video`
	 - `audioEntries`
	 - `videoEntries`
	 - `entries`
	 - `files`
	 - `items`

Entry examples:

```json
{
	"audio": [
		{
			"name": "Track Name",
			"artist": "Artist",
			"album": "Album",
			"file": "Artist/Album/01 Track.mp3"
		}
	],
	"video": [
		{
			"name": "Clip Name",
			"file": "videos/Artist/Clip.mp4",
			"mediaType": "video"
		}
	]
}
```

Accepted fields per entry:

1. `name` or `title`
2. `artist`
3. `album`
4. `file` or `path`
5. `objectKey`
6. `mediaType` or `kind`
7. `contentType`

## 10) Dev Runbook

Local frontend:

1. Serve project root with any static server.
2. Ensure `app-config.js` points to the signer service.
3. Sign in through `signin.html`.

Signer service:

1. Run from `services/heroku-signer`.
2. Required env vars include session secret, S4 credentials, and allowed users JSON.
3. Use existing tests in `services/heroku-signer/*.test.js` before deployment.

Companion:

1. Install Go plus FFmpeg/FFprobe for functional MKV testing.
2. Run `go test ./...` from `services/local-library-helper`.
3. Run `scripts/build-companion-releases.ps1` from the project root to create all supported native binaries.
4. Output packages are written to `dist/companion` and intentionally ignored by Git.
5. Run the GitHub **Companion releases** workflow for downloadable CI artifacts.
6. A tag matching `companion-v*` publishes those artifacts as a GitHub Release.

Supported targets are Windows, macOS, and Linux on AMD64 and ARM64. Builds use
`CGO_ENABLED=0`, `-trimpath`, and stripped linker output.

### Test-File Convention

Files named `*.test.cjs` and `*_test.go` are automated verification for finalized
code; “test” does not indicate an unfinished product variant. Node loads the CJS
files only when its test runner is invoked, and Go automatically excludes
`*_test.go` from compiled release executables. Keep these files in source control
so future changes can be checked against the final MKV behavior.

## 11) QA Checklist (Minimum)

1. Sign-in success, sign-out, and expired-session redirect behavior.
2. Playback for both audio and video media.
3. Repeat mode persistence after reload.
4. Starred-to-playlist workflows (new + add existing).
5. Local media roots fallback behavior.
6. Local library JSON parse error handling and valid override behavior.
7. Diagnostics page refresh and snapshot updates while player is active.
8. Sync Play join/create/leave flow using join codes.
9. Live Stream Start Session and Stop Session behavior.
10. Companion health reports `mkvReady: true` when FFmpeg and FFprobe are installed.
11. First MKV play prepares durable sibling files without modifying the source.
12. A second play and a Companion restart reuse the prepared file immediately.
13. Voice Sync changes playback in 50 ms steps and Save This Timing survives restart.
14. Library rescans do not expose `.impala.mp4` as duplicate titles.
15. H.264/AC3 input copies the video stream and converts only audio to AAC.
16. HEVC input performs the complete H.264 compatibility conversion.
17. Voice Sync appears for a Companion MP4 and persists through its timing sidecar.
18. Create Corrected Copy produces a standalone `.impala-synced.mp4` and preserves the source.
19. Season and series discovery reports real folder names and queues titles sequentially.
20. H.264/AC3 MP4 at 0 ms automatically creates an H.264/AAC durable copy before playback.

## 12) Known Constraints

1. Browser restrictions can block direct probing of `file://` roots from hosted pages.
2. A failed local root probe does not always mean file playback will fail.
3. Local library JSON override can intentionally hide built-in playlists when valid entries exist.
4. MKV compatibility is local-only in this release; cloud MKV transcoding is not implemented.
5. Initial MKV preparation duration depends on source length, codecs, and the user's hardware.
6. Browser-incompatible streams are converted to the supported H.264/AAC prepared copy.
