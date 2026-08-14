PILOT TESTING CHECKLIST (v1.0)


1. Authentication & Session Flow
[ ] Open index.html with no session → redirected to sign‑in

[ ] Sign in successfully → redirected to player

[ ] Expired session (manually set past expiresAt) → redirect to sign‑in

[ ] Corrupted session JSON → redirect to sign‑in

[ ] Browser with blocked storage → sign‑in page shows appropriate message

[ ] Log out → session cleared, cannot access player

2. Player Core Functionality
[ ] Built‑in playlists load correctly

[ ] Playback works for audio

[ ] Playback works for video

[ ] Next/Prev/Repeat behave correctly

[ ] Player state persists across reloads

[ ] Player state recovers gracefully if playlist is deleted

3. Custom Playlists
[ ] Create a new playlist

[ ] Add starred tracks

[ ] Rename playlist

[ ] Delete playlist

[ ] Verify player fallback when active playlist is deleted

[ ] Verify custom playlist persistence after reload

4. Preferences
[ ] Change palette → persists after reload

[ ] Reset palette → returns to default

[ ] Set custom note → appears on player

[ ] Reset custom note → default restored

[ ] Set medallion image → loads correctly

[ ] Reset medallion → default restored

5. Local Media Roots
[ ] Set valid audio root → local files play

[ ] Set valid video root → local videos play

[ ] Set invalid root → player fails gracefully

[ ] Clear roots → built‑ins restored

6. Local Library JSON
[ ] Paste valid JSON → Local Audio/Video playlists appear

[ ] Paste malformed JSON → error logged, built‑ins used

[ ] Clear JSON → built‑ins restored

[ ] Large JSON → verify storage warning in diagnostics

7. Diagnostics
[ ] Open diagnostics → snapshot appears

[ ] Player snapshot updates while player is open

[ ] Storage usage displays correctly

[ ] Error log captures:

JSON parse errors

storage write failures

media load errors

unhandled promise rejections

[ ] Media resolver debug info updates per track

[ ] Refresh button works

[ ] Storage events trigger updates

8. Browser Compatibility
Test in:

[ ] Brave

[ ] Chrome

[ ] Firefox

[ ] Safari

Check:

[ ] localStorage quota

[ ] autoplay restrictions

[ ] file:// behavior

[ ] CORS behavior for remote media

9. General UX
[ ] UI loads cleanly with no console errors

[ ] Hotkeys work (S, A, N, M, C, H/?)

[ ] No layout shifts

[ ] No unexpected reloads

[ ] No “dead buttons”