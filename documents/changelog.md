Changelog
v0.9.0 — Pilot Release (2026‑06‑20)
Major Features

Added dedicated sign‑in page with isolated auth session

Implemented auth‑guard redirect for invalid/expired sessions

Added diagnostics subsystem:

player snapshot

playlist registry overview

storage health

media resolver debug info

rolling error log

Added diagnostics.html viewer with auto‑refresh

Added diagnostics-store.js for snapshot publishing and error capture

Player Enhancements

Improved playlist registry with built‑in, custom, and local‑library modes

Added persistent playback state

Added repeat mode

Hardened media resolver (MIME inference, local roots, extension detection)

Added video playback support

Preferences

Added palette selector + live preview

Added custom note + medallion image support

Added local audio/video directory roots

Added Local Library JSON override system

Stability & Safety

Defensive JSON parsing throughout

Storage write tracking

Error classification (JSON, storage, playlist, media, generic)

Non‑intrusive diagnostics (never blocks playback)

Improved fallback logic for missing/invalid data

UI

Cleaned up player layout

Added hotkey help toast

Added Preferences and User Guide links

Added dedicated medallion and custom message areas

v0.9.x — Pre‑Pilot Development
Initial player engine

Basic playlist support

Basic preferences

Initial signer integration

Early UI layout

First working audio playback

First working S4 signed URL flow

v0.1 — Initial Commit
Project scaffolding

Static site structure

Basic HTML/CSS

Placeholder player