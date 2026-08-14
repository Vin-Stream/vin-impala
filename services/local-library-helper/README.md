# Impala Local Library Companion

Small localhost service for private local-library playback. It listens only on
the loopback interface and does not upload local media.

The selected root may contain media directly or in nested folders. A dedicated
media folder is required; entire drives and user-profile roots are rejected.

```text
C:\Users\<you>\Music\
  Artist\
    Album\
      Track.mp3
```

Default address:

```text
http://127.0.0.1:8089
```

Build for Windows from a machine with Go installed:

```powershell
go build -o Impala-Helper.exe .
```

## Multi-platform releases

The project release builder tests the Companion and produces native executables
for Windows, macOS, and Linux on both Intel/AMD and ARM64 systems:

```powershell
.\scripts\build-companion-releases.ps1
```

Packages are written to `dist/companion`. The GitHub Actions **Companion
releases** workflow builds the same six targets when run manually. Pushing a tag
such as `companion-v1.1.0` also publishes the executables on a GitHub Release.

Suggested pilot install folder:

```text
C:\Users\<you>\Impala-Helper\
```

Run:

```powershell
.\Impala-Helper.exe
```

Optional custom port:

```powershell
$env:IMPALA_HELPER_ADDR="127.0.0.1:8090"
.\Impala-Helper.exe
```

Impala Settings should use the same port if a custom port is needed.

## Browser origins

The Companion accepts browser requests from the production Impala site and
localhost previews. Add another trusted Impala origin only when needed:

```powershell
$env:IMPALA_HELPER_ALLOWED_ORIGINS="https://your-impala.example"
```

Multiple additional origins may be separated with commas. Do not add unrelated
sites; this boundary protects the local-library API from other browser pages.

## Local MKV preparation

When `ffmpeg` and `ffprobe` are on `PATH`, the Companion prepares an MKV as a
browser-compatible H.264/AAC MP4 beside the original media. The user owns the
prepared result and the original MKV is never changed:

```text
Silo S03E01.mkv
Silo S03E01.impala.mp4
Silo S03E01.impala.json
```

The small JSON sidecar associates the two files and stores only source identity
and the saved Voice Sync offset. Generated `.impala` files are not shown as
duplicate library titles. A legacy completed cache copy is migrated into the
library instead of being transcoded again.

Long preparations continue as durable Companion jobs even if the browser is
closed or stops waiting. Reopening Impala reconnects to the active job, and a
completed preparation is reused immediately.

Preparation is codec-aware. Compatible H.264/YUV420P video is copied without
re-encoding or quality loss. If its audio is AC3, E-AC3, or another unsupported
format, only the audio is converted to AAC. HEVC and other incompatible video
streams still receive the full H.264/AAC compatibility conversion.
While preparation runs, Impala identifies the source container, video codec,
audio codec, and channel count, then explains which streams it is preserving or
converting. For example, H.264 video with six-channel AC3 explicitly reports that
the video is preserved while the audio is converted to AAC stereo.

Voice Sync ranges from 2000 ms earlier to 2000 ms later in 50 ms steps. The
Companion makes a fast temporary stream-copy timing variant from the durable
prepared copy, so changing the offset does not transcode the source MKV again.
"Save This Timing" writes the selected default to the title's sidecar manifest.

## Voice Sync for local video

Voice Sync is available for every video served by the Companion, not only MKV.
For a normal local video, the selected offset is stored in a small
`Title.impala-timing.json` file beside the source. The original video is never
changed. Temporary playback variants remain in the bounded private timing cache.

**Create Corrected Copy** commits the selected timing into a separate
`Title.impala-synced.mp4`. This normal MP4 can be copied to an optional cloud
library and plays with the corrected timing without requiring live adjustment.
The Companion never overwrites an existing corrected copy.

Every Companion local video is inspected at first play, including at original
0 ms timing. If H.264 video already contains AAC audio, the source plays
immediately. If its audio is AC3, E-AC3, or otherwise browser-incompatible, the
video is preserved and a durable AAC-compatible `.impala.mp4` is created
automatically. This avoids silent playback before the user adjusts Voice Sync.

When related MKVs are found, the Companion reports the real folder and series
names. Impala can prepare only the selected title, the current folder/season, or
the full series. Bulk preparation is explicitly approved, runs one title at a
time, skips valid prepared titles, and can stop safely after the current title.

The cache contains timing variants only. For testing or managed installations,
its directory may be overridden. The Companion automatically removes the oldest
timing variants when this cache exceeds 25 GB; durable `.impala.mp4` files beside
the originals are never part of this cleanup. The limit may be set from 1–500 GB:

```powershell
$env:IMPALA_HELPER_CACHE_ROOT="D:\Impala Cache"
$env:IMPALA_HELPER_TIMING_CACHE_GB="10"
```
