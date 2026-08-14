# **Impala Streamer**  
A sovereign, personal media player for **impala.kevin-wagner.org**.  
Designed for clarity, predictability, and zero hidden side‑effects.

Impala Streamer is a static frontend + a private signer API.  
Each instance maintains its own **auth session**, **preferences**, and **playlist storage**, ensuring isolation between deployments.

---

# **Project Structure**

```
/
├── index.html              # Player UI (requires valid auth session)
├── signin.html             # Dedicated sign‑in page
├── diagnostics.html        # Runtime diagnostics viewer
├── styles.css
├── app-config.js           # Instance configuration
├── auth-guard.js           # Redirects to sign‑in when session is invalid
├── diagnostics-store.js    # Error logging + storage health + snapshots
├── diagnostics.js          # Diagnostics UI renderer
├── ui-preferences.js       # Palette + custom content + local media roots
├── playlist-store.js       # Custom playlist persistence
├── media-resolver.js       # Local/remote path resolution + MIME inference
├── player-engine.js        # Playback state machine
├── script.js               # Main player orchestration
├── modules/                # Player feature modules plus explicit boot coordination
└── services/
    └── heroku-signer/      # Private signer API (auth + signed S4 URLs)
```

---

# **Features**

### **Authentication**
- Dedicated sign‑in page  
- Local session storage with expiry  
- Automatic redirect when session is missing or invalid  

### **Playback**
- Audio + video support  
- Built‑in playlists  
- Custom playlists  
- Local library override via JSON manifest  
- Persistent playback state  

### **Preferences**
- Color palettes  
- Custom player message  
- Custom medallion image  
- Local audio/video root directories  
- Local library JSON (optional)  

### **Local MKV + Voice Sync**
- Local MKV preparation through the user-owned Companion and FFmpeg
- Original MKV files remain unchanged
- Reusable `.impala.mp4` and metadata sidecar saved beside each prepared title
- Per-title Voice Sync with durable saved timing
- Codec-aware preparation preserves compatible H.264 video and converts only unsupported audio
- Voice Sync for every Companion-served local video
- Automatic first-play audio compatibility for H.264 videos containing AC3/E-AC3
- iPhone system Now Playing metadata and play/pause/previous/next vehicle controls
- Upload-ready corrected MP4 copies without modifying originals
- Named season/folder and full-series MKV preparation queues
- Windows, macOS, and Linux builds for x64 and ARM64

MKV preparation is deliberately local-only. Cloud libraries continue to use
browser-native formats in this release.

### **Diagnostics**
A built‑in diagnostics system provides:

- Player state snapshot  
- Playlist registry overview  
- Local storage usage + warnings  
- Media resolver debug info  
- Rolling error log  
- Last storage write status  

Diagnostics never interferes with playback.

---

# **Minimal Setup**

1. Serve the root folder as a static site  
   (Five Server, Python `http.server`, nginx, etc.)
2. In `app-config.js`, set:
   ```js
   apiBaseUrl: "https://your-signer-api"
   ```
   Or open **Settings -> Cloud Library Connection** and enter the signer API URL for this browser.
   The user's S4 bucket, endpoint, region, and credentials belong on the signer service as server environment variables; do not put S4 access keys in browser config or local storage.

   For a separate cloned/static instance, set `instanceStorageId` in `app-config.js` to a stable short value such as `artistPilot` or `piDemo`. Impala appends it to `playlistStoragePrefix` so browser-local preferences, playlists, auth sessions, diagnostics, and playback state do not overlap with other Impala instances on the same browser.

   Each browser installation creates a local Instance ID in Settings. It is included in backups and sent as a request header so future services can distinguish one Impala installation from another without exposing S4 credentials.
3. Open `signin.html` and authenticate.  
4. You will be redirected to `index.html` after sign‑in.

---

# **Hotkeys (Player View)**

- **S** — Star/unstar current track  
- **A** — Add starred tracks to an existing playlist  
- **N** — Create new playlist from starred tracks  
- **M** — Open manage view in song editor  
- **C** — Clear all starred tracks  
- **H** or **?** — Show hotkey help  

---

# **Local Library JSON (Optional)**

You may override built‑in playlists by providing a JSON manifest in **Preferences → Local Library JSON**.

Supported structure:

```json
{
  "audio": [ ... ],
  "video": [ ... ]
}
```

If present, Impala Streamer uses local entries for that mode.  
If empty or invalid, it falls back to built‑ins.

---

# **Diagnostics (Optional but Recommended)**

Open `diagnostics.html` to view:

- current player snapshot  
- playlist registry counts  
- storage usage  
- media resolver details  
- error log  

Snapshots are published automatically while the player is open.

---

# **Signer Service (Heroku)**

The signer API handles:

- user authentication  
- signed S4 URLs for media  
- optional video bucket separation  
- fast manifest generation  

Environment variables (Heroku config vars):

- `SESSION_SECRET`  
- `S4_BUCKET`  
- `S4_VIDEO_BUCKET` (optional)  
- `S4_ACCESS_KEY_ID`  
- `S4_SECRET_ACCESS_KEY`  
- `ALLOWED_USERS_JSON`  
- `S4_BUCKET_RULES_JSON` (optional exact per-user bucket access)  

Deploy signer only:

```bash
git subtree push --prefix services/heroku-signer heroku main
```

Or, if your Heroku app uses `master`:

```bash
git subtree push --prefix services/heroku-signer heroku master
```

---

# **Live Stream Service (Heroku)**

The live stream control API is isolated under `services/heroku-live-stream`.
It uses the same signed auth session format as the signer service, but it does not touch S4 or core playback.

Environment variables:

- `SESSION_SECRET` (must match the signer service so existing sessions verify)
- `ALLOWED_USERS_JSON` (same usernames; admin users can start/stop sessions)
- `CORS_ORIGINS`
- `LIVE_STREAM_ENABLED` (set `true` only when testing live stream control sessions)

Frontend configuration:

```js
liveStreamApiBaseUrl: "https://your-live-stream-service.herokuapp.com"
```

Deploy live stream service only:

```bash
git subtree push --prefix services/heroku-live-stream heroku-live main
```

---

# **Sync Play Service (Heroku)**

Sync Play is an optional, video-only control layer. The host selects a video already loaded from the shared library. Each participant streams that same object independently through their own signed URL while the Sync Play service supplies the authoritative play, pause, seek, and clock state.

Enable it per browser in **Settings → Sync Play**. Creating a session supports:

- **Master** — only the host controls playback.
- **Shared** — any participant can control playback.

The service holds sessions only in memory and expires them automatically. If Sync Play is disabled or unavailable, ordinary Impala playback is unchanged.

Frontend configuration:

```js
syncPlayApiBaseUrl: "https://your-sync-play-service.herokuapp.com"
```

Deploy the service independently:

```bash
git subtree push --prefix services/heroku-sync-play heroku-sync main
```

---

# **Security Quick Checks**

- No S4 credentials live in the frontend.  
- Keep `CORS_ORIGINS` tight.  
- Keep signed URL TTL short (10–30 minutes).  
- Keep token TTL reasonable.  
- Rotate secrets immediately if exposed.  

Verify nothing sensitive is committed:

```bash
git grep -nE "S4_SECRET_ACCESS_KEY=|SESSION_SECRET=" -- . \
  ":(exclude)services/heroku-signer/.env.example"
```

---

# **Philosophy**

Impala Streamer is built around:

- **Sovereignty** — your media, your rules  
- **Predictability** — no hidden behavior  
- **Local-first** — browser storage, local roots, local JSON  
- **Zero friction** — clean UI, intentional interactions  
- **Transparency** — diagnostics for everything  
