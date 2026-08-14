package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestOriginMatchesExactProductionOrigin(t *testing.T) {
	if !originMatches("https://impala.discrete-dev.com", "https://impala.discrete-dev.com") {
		t.Fatal("expected the production Impala origin to match")
	}
	if originMatches("https://impala.discrete-dev.com.attacker.example", "https://impala.discrete-dev.com") {
		t.Fatal("expected a suffix-confusion origin to be rejected")
	}
}

func TestOriginMatchesLocalPreviewPort(t *testing.T) {
	if !originMatches("http://127.0.0.1:5500", "http://127.0.0.1:*") {
		t.Fatal("expected a numeric local preview port to match")
	}
	if originMatches("http://127.0.0.1:5500.attacker.example", "http://127.0.0.1:*") {
		t.Fatal("expected a nonnumeric local preview port to be rejected")
	}
}

func TestMkvIsSupportedVideo(t *testing.T) {
	if !isSupportedMedia("Feature.MKV") {
		t.Fatal("expected MKV media to be supported")
	}
	if mediaTypeFor("Feature.mkv") != "video" {
		t.Fatal("expected MKV media to be classified as video")
	}
	if contentTypeFor("Feature.mkv") != "video/x-matroska" {
		t.Fatal("expected the Matroska content type")
	}
}

func TestTranscodePlanCopiesH264AndConvertsAC3(t *testing.T) {
	plan := buildTranscodePlan(probedMedia{Streams: []probedMediaStream{
		{CodecType: "video", CodecName: "h264", PixelFmt: "yuv420p"},
		{CodecType: "audio", CodecName: "ac3"},
	}})
	if !plan.CopyVideo {
		t.Fatal("expected browser-compatible H.264 video to be copied")
	}
	if plan.CopyAudio {
		t.Fatal("expected AC3 audio to be converted")
	}
}

func TestCompatibilityReasonExplainsH264AC3SixChannelConversion(t *testing.T) {
	probe := probedMedia{Streams: []probedMediaStream{
		{CodecType: "video", CodecName: "h264", PixelFmt: "yuv420p"},
		{CodecType: "audio", CodecName: "ac3", Channels: 6},
	}}
	reason := compatibilityReason("Paradise S01E01.mp4", probe, buildTranscodePlan(probe))
	for _, expected := range []string{"MP4", "H.264", "AC3 6-channel", "preserving", "AAC stereo"} {
		if !strings.Contains(reason, expected) {
			t.Fatalf("expected compatibility explanation to contain %q; got %q", expected, reason)
		}
	}
}

func TestTranscodePlanConvertsHEVCAndCopiesAAC(t *testing.T) {
	plan := buildTranscodePlan(probedMedia{Streams: []probedMediaStream{
		{CodecType: "video", CodecName: "hevc", PixelFmt: "yuv420p"},
		{CodecType: "audio", CodecName: "aac"},
	}})
	if plan.CopyVideo {
		t.Fatal("expected HEVC video to be converted")
	}
	if !plan.CopyAudio {
		t.Fatal("expected AAC audio to be copied")
	}
}

func TestVoiceSyncOffsetValidation(t *testing.T) {
	for _, value := range []string{"-2000", "-50", "0", "50", "2000"} {
		if _, err := normalizeVoiceSyncOffset(value); err != nil {
			t.Fatalf("expected %s to be accepted: %v", value, err)
		}
	}
	for _, value := range []string{"-2050", "25", "2001", "later"} {
		if _, err := normalizeVoiceSyncOffset(value); err == nil {
			t.Fatalf("expected %s to be rejected", value)
		}
	}
}

func TestVoiceSyncCacheVariantsDoNotReplaceBase(t *testing.T) {
	base := `C:\cache\feature.mp4`
	if voiceSyncCachePath(base, 0) != base {
		t.Fatal("expected original timing to use the base compatibility copy")
	}
	if voiceSyncCachePath(base, 50) == base || voiceSyncCachePath(base, -50) == base {
		t.Fatal("expected adjusted timing to use separate cache variants")
	}
}

func TestVoiceSyncCachePrunesOldestVariantOnly(t *testing.T) {
	cacheRoot := t.TempDir()
	oldVariant := filepath.Join(cacheRoot, "feature.sync-50.mp4")
	newVariant := filepath.Join(cacheRoot, "feature.sync-100.mp4")
	legacyBase := filepath.Join(cacheRoot, "feature.mp4")
	for _, path := range []string{oldVariant, newVariant, legacyBase} {
		if err := os.WriteFile(path, []byte("123456"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	oldTime := time.Now().Add(-time.Hour)
	if err := os.Chtimes(oldVariant, oldTime, oldTime); err != nil {
		t.Fatal(err)
	}

	state := &serverState{cacheRoot: cacheRoot, cacheLimitBytes: 6}
	state.pruneVoiceSyncCache(newVariant)

	if _, err := os.Stat(oldVariant); !os.IsNotExist(err) {
		t.Fatal("expected the oldest timing variant to be pruned")
	}
	if _, err := os.Stat(newVariant); err != nil {
		t.Fatal("expected the active timing variant to be preserved")
	}
	if _, err := os.Stat(legacyBase); err != nil {
		t.Fatal("expected non-timing cache files to remain untouched")
	}
}

func TestPreparedCopyLivesBesideOriginal(t *testing.T) {
	selected := track{path: filepath.Join(`C:\Media`, "Feature.mkv")}
	if preparedPathFor(selected) != filepath.Join(`C:\Media`, "Feature.impala.mp4") {
		t.Fatalf("unexpected prepared path: %s", preparedPathFor(selected))
	}
}

func TestCorrectedCopyLivesBesideOriginal(t *testing.T) {
	selected := track{path: filepath.Join(`C:\Media`, "Feature.mp4")}
	if correctedVideoPathFor(selected) != filepath.Join(`C:\Media`, "Feature.impala-synced.mp4") {
		t.Fatalf("unexpected corrected path: %s", correctedVideoPathFor(selected))
	}
}

func TestTimingManifestStopsMatchingWhenVideoChanges(t *testing.T) {
	root := t.TempDir()
	selected := track{path: filepath.Join(root, "Feature.mp4")}
	if err := os.WriteFile(selected.path, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeTimingManifest(selected, -100); err != nil {
		t.Fatal(err)
	}
	if manifest, valid := readTimingManifest(selected); !valid || manifest.VoiceSyncMs != -100 {
		t.Fatal("expected saved local-video timing to match")
	}
	if err := os.WriteFile(selected.path, []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, valid := readTimingManifest(selected); valid {
		t.Fatal("expected timing metadata to invalidate after source change")
	}
}

func TestCorrectedManifestRecordsCommittedTiming(t *testing.T) {
	root := t.TempDir()
	selected := track{path: filepath.Join(root, "Feature.mp4")}
	if err := os.WriteFile(selected.path, []byte("source"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeCorrectedManifest(selected, 250); err != nil {
		t.Fatal(err)
	}
	manifest, valid := readCorrectedManifest(selected)
	if !valid || manifest.VoiceSyncMs != 250 {
		t.Fatal("expected corrected-copy metadata to preserve committed timing")
	}
}

func TestPathWithinSeriesFolder(t *testing.T) {
	series := filepath.Join(`C:\Media`, "Silo")
	if !pathWithin(filepath.Join(series, "Season 1", "Episode.mkv"), series) {
		t.Fatal("expected episode to be inside series folder")
	}
	if pathWithin(filepath.Join(`C:\Media`, "Other", "Episode.mkv"), series) {
		t.Fatal("expected unrelated title to remain outside series folder")
	}
}

func TestRecursiveScanIncludesDirectMediaAndIgnoresPreparedCopies(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "Direct.mkv"), []byte("mkv"), 0600); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "Series", "Season 1")
	if err := os.MkdirAll(nested, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, "Episode.mp4"), []byte("mp4"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "Direct.impala.mp4"), []byte("prepared"), 0600); err != nil {
		t.Fatal(err)
	}

	state := &serverState{}
	items, err := state.scanLibrary(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("expected two user media entries, got %d", len(items))
	}
}

func TestRejectsBroadLibraryRoots(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("user home unavailable")
	}
	if validateLibraryRoot(home) == nil {
		t.Fatal("expected the entire user profile to be rejected")
	}
}

func TestPreparedManifestStopsMatchingWhenSourceChanges(t *testing.T) {
	root := t.TempDir()
	selected := track{path: filepath.Join(root, "Feature.mkv")}
	if err := os.WriteFile(selected.path, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writePreparedManifest(selected, 150); err != nil {
		t.Fatal(err)
	}
	if manifest, valid := readPreparedManifest(selected); !valid || manifest.VoiceSyncMs != 150 {
		t.Fatal("expected the new manifest to match its source")
	}
	if err := os.WriteFile(selected.path, []byte("changed source"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, valid := readPreparedManifest(selected); valid {
		t.Fatal("expected the manifest to stop matching after the source changed")
	}
}
