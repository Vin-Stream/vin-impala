package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
)

const (
	defaultAddress = "127.0.0.1:8089"
	serviceName    = "Impala Local Library Helper"
)

type track struct {
	ID          string `json:"id"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	Title       string `json:"title"`
	Name        string `json:"name"`
	ObjectKey   string `json:"objectKey"`
	File        string `json:"file"`
	MediaType   string `json:"mediaType"`
	ContentType string `json:"contentType"`
	Source      string `json:"source"`
	VoiceSyncMs int    `json:"voiceSyncMs,omitempty"`
	path        string
}

type preparedManifest struct {
	Version        int    `json:"version"`
	SourceFile     string `json:"sourceFile"`
	SourceSize     int64  `json:"sourceSize"`
	SourceModified int64  `json:"sourceModified"`
	PreparedFile   string `json:"preparedFile"`
	VoiceSyncMs    int    `json:"voiceSyncMs"`
}

type timingManifest struct {
	Version        int    `json:"version"`
	SourceFile     string `json:"sourceFile"`
	SourceSize     int64  `json:"sourceSize"`
	SourceModified int64  `json:"sourceModified"`
	VoiceSyncMs    int    `json:"voiceSyncMs"`
}

type serverState struct {
	mu              sync.RWMutex
	musicRoot       string
	tracks          []track
	allowedOrigins  []string
	mediaTools      mediaToolCapabilities
	preparations    map[string]*mediaPreparation
	sourceLocks     map[string]*sync.Mutex
	cacheRoot       string
	cacheLimitBytes int64
}

type mediaToolCapability struct {
	Available bool   `json:"available"`
	Path      string `json:"-"`
	Version   string `json:"version,omitempty"`
}

type mediaToolCapabilities struct {
	FFmpeg  mediaToolCapability `json:"ffmpeg"`
	FFprobe mediaToolCapability `json:"ffprobe"`
}

type mediaPreparation struct {
	ID          string  `json:"id"`
	Status      string  `json:"status"`
	Progress    float64 `json:"progress"`
	Message     string  `json:"message,omitempty"`
	VoiceSyncMs int     `json:"voiceSyncMs"`
	OutputPath  string  `json:"-"`
	Reason      string  `json:"-"`
}

type probedMediaStream struct {
	CodecType string `json:"codec_type"`
	CodecName string `json:"codec_name"`
	PixelFmt  string `json:"pix_fmt"`
	Channels  int    `json:"channels,omitempty"`
}

type probedMedia struct {
	Streams []probedMediaStream `json:"streams"`
}

type transcodePlan struct {
	CopyVideo bool
	CopyAudio bool
}

func main() {
	address := strings.TrimSpace(os.Getenv("IMPALA_HELPER_ADDR"))
	if address == "" {
		address = defaultAddress
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("%s could not start on %s: %v", serviceName, address, err)
	}

	cacheRoot := strings.TrimSpace(os.Getenv("IMPALA_HELPER_CACHE_ROOT"))
	if cacheRoot == "" {
		var cacheErr error
		cacheRoot, cacheErr = os.UserCacheDir()
		if cacheErr != nil || strings.TrimSpace(cacheRoot) == "" {
			cacheRoot = os.TempDir()
		}
		cacheRoot = filepath.Join(cacheRoot, "Impala", "mkv-cache")
	}
	if err := os.MkdirAll(cacheRoot, 0700); err != nil {
		log.Fatalf("%s could not create its private media cache: %v", serviceName, err)
	}

	state := &serverState{
		allowedOrigins:  configuredAllowedOrigins(),
		mediaTools:      detectMediaTools(),
		preparations:    make(map[string]*mediaPreparation),
		sourceLocks:     make(map[string]*sync.Mutex),
		cacheRoot:       cacheRoot,
		cacheLimitBytes: configuredCacheLimitBytes(),
	}
	state.pruneVoiceSyncCache("")
	mux := http.NewServeMux()
	mux.HandleFunc("/health", state.healthHandler)
	mux.HandleFunc("/library/list", state.listHandler)
	mux.HandleFunc("/library/file", state.fileHandler)
	mux.HandleFunc("/library/set-root", state.setRootHandler)
	mux.HandleFunc("/library/mkv/prepare", state.mkvPrepareHandler)
	mux.HandleFunc("/library/mkv/file", state.mkvFileHandler)
	mux.HandleFunc("/library/mkv/timing", state.mkvTimingHandler)
	mux.HandleFunc("/library/mkv/group", state.mkvGroupHandler)
	mux.HandleFunc("/library/video/sync", state.videoSyncHandler)
	mux.HandleFunc("/library/video/file", state.videoSyncFileHandler)
	mux.HandleFunc("/library/video/timing", state.videoTimingHandler)
	mux.HandleFunc("/library/video/corrected", state.correctedVideoHandler)

	log.Printf("%s listening on http://%s", serviceName, address)
	log.Printf("Browser access allowed for %s", strings.Join(state.allowedOrigins, ", "))
	if state.mediaTools.FFmpeg.Available && state.mediaTools.FFprobe.Available {
		log.Printf("MKV media tools ready: %s; %s", state.mediaTools.FFmpeg.Version, state.mediaTools.FFprobe.Version)
	} else {
		log.Printf("MKV media tools unavailable; install FFmpeg and ensure ffmpeg and ffprobe are on PATH")
	}
	log.Fatal(http.Serve(listener, mux))
}

func configuredCacheLimitBytes() int64 {
	const defaultLimitGB = 25.0
	limitGB := defaultLimitGB
	if value := strings.TrimSpace(os.Getenv("IMPALA_HELPER_TIMING_CACHE_GB")); value != "" {
		if parsed, err := strconv.ParseFloat(value, 64); err == nil && parsed >= 1 && parsed <= 500 {
			limitGB = parsed
		}
	}
	return int64(limitGB * 1024 * 1024 * 1024)
}

type cacheFile struct {
	path    string
	size    int64
	modTime int64
}

func (state *serverState) voiceSyncCacheStats() (int, int64) {
	entries, _ := os.ReadDir(state.cacheRoot)
	count := 0
	total := int64(0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.Contains(strings.ToLower(entry.Name()), ".sync") || !strings.HasSuffix(strings.ToLower(entry.Name()), ".mp4") {
			continue
		}
		if info, err := entry.Info(); err == nil {
			count++
			total += info.Size()
		}
	}
	return count, total
}

func (state *serverState) pruneVoiceSyncCache(keepPath string) {
	entries, _ := os.ReadDir(state.cacheRoot)
	files := make([]cacheFile, 0)
	total := int64(0)
	for _, entry := range entries {
		lowerName := strings.ToLower(entry.Name())
		if entry.IsDir() || !strings.Contains(lowerName, ".sync") || !strings.HasSuffix(lowerName, ".mp4") {
			continue
		}
		path := filepath.Join(state.cacheRoot, entry.Name())
		if info, err := entry.Info(); err == nil {
			files = append(files, cacheFile{path: path, size: info.Size(), modTime: info.ModTime().UnixNano()})
			total += info.Size()
		}
	}
	sort.Slice(files, func(left, right int) bool { return files[left].modTime < files[right].modTime })
	for _, file := range files {
		if total <= state.cacheLimitBytes {
			break
		}
		if keepPath != "" && strings.EqualFold(file.path, keepPath) {
			continue
		}
		if err := os.Remove(file.path); err == nil {
			total -= file.size
		}
	}
}

func configuredAllowedOrigins() []string {
	origins := []string{"https://impala.discrete-dev.com", "http://localhost:*", "http://127.0.0.1:*"}
	for _, value := range strings.Split(os.Getenv("IMPALA_HELPER_ALLOWED_ORIGINS"), ",") {
		value = strings.TrimSpace(strings.TrimRight(value, "/"))
		if value != "" {
			origins = append(origins, value)
		}
	}
	return origins
}

func originMatches(origin string, allowed string) bool {
	origin = strings.TrimRight(strings.TrimSpace(origin), "/")
	allowed = strings.TrimRight(strings.TrimSpace(allowed), "/")
	if origin == allowed {
		return true
	}
	if strings.HasSuffix(allowed, ":*") {
		prefix := strings.TrimSuffix(allowed, "*")
		if !strings.HasPrefix(origin, prefix) {
			return false
		}
		port := strings.TrimPrefix(origin, prefix)
		if port == "" {
			return false
		}
		for _, character := range port {
			if character < '0' || character > '9' {
				return false
			}
		}
		return true
	}
	return false
}

func firstCommandLine(path string, argument string) string {
	command := exec.Command(path, argument)
	output, err := command.StdoutPipe()
	if err != nil {
		return ""
	}
	command.Stderr = command.Stdout
	if err := command.Start(); err != nil {
		return ""
	}
	scanner := bufio.NewScanner(output)
	line := ""
	if scanner.Scan() {
		line = strings.TrimSpace(scanner.Text())
	}
	_ = command.Wait()
	return line
}

func detectMediaTool(name string) mediaToolCapability {
	path, err := exec.LookPath(name)
	if err != nil {
		return mediaToolCapability{}
	}
	return mediaToolCapability{
		Available: true,
		Path:      path,
		Version:   firstCommandLine(path, "-version"),
	}
}

func detectMediaTools() mediaToolCapabilities {
	return mediaToolCapabilities{
		FFmpeg:  detectMediaTool("ffmpeg"),
		FFprobe: detectMediaTool("ffprobe"),
	}
}

func preparationCopy(value *mediaPreparation) mediaPreparation {
	if value == nil {
		return mediaPreparation{Status: "not-started"}
	}
	return *value
}

func (state *serverState) findTrack(id string) track {
	state.mu.RLock()
	defer state.mu.RUnlock()
	for _, candidate := range state.tracks {
		if candidate.ID == id {
			return candidate
		}
	}
	return track{}
}

func preparedPathFor(selected track) string {
	extension := filepath.Ext(selected.path)
	return strings.TrimSuffix(selected.path, extension) + ".impala.mp4"
}

func preparedManifestPathFor(selected track) string {
	extension := filepath.Ext(selected.path)
	return strings.TrimSuffix(selected.path, extension) + ".impala.json"
}

func timingManifestPathFor(selected track) string {
	extension := filepath.Ext(selected.path)
	return strings.TrimSuffix(selected.path, extension) + ".impala-timing.json"
}

func correctedVideoPathFor(selected track) string {
	extension := filepath.Ext(selected.path)
	return strings.TrimSuffix(selected.path, extension) + ".impala-synced.mp4"
}

func correctedManifestPathFor(selected track) string {
	extension := filepath.Ext(selected.path)
	return strings.TrimSuffix(selected.path, extension) + ".impala-synced.json"
}

func writeTimingManifest(selected track, voiceSyncMs int) error {
	info, err := os.Stat(selected.path)
	if err != nil {
		return err
	}
	manifest := timingManifest{
		Version:        1,
		SourceFile:     filepath.Base(selected.path),
		SourceSize:     info.Size(),
		SourceModified: info.ModTime().UnixNano(),
		VoiceSyncMs:    voiceSyncMs,
	}
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	target := timingManifestPathFor(selected)
	temporary := target + ".part"
	if err := os.WriteFile(temporary, encoded, 0600); err != nil {
		return err
	}
	if err := os.Rename(temporary, target); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

func readTimingManifest(selected track) (timingManifest, bool) {
	encoded, err := os.ReadFile(timingManifestPathFor(selected))
	if err != nil {
		return timingManifest{}, false
	}
	var manifest timingManifest
	if json.Unmarshal(encoded, &manifest) != nil {
		return timingManifest{}, false
	}
	info, err := os.Stat(selected.path)
	if err != nil || manifest.Version != 1 || manifest.SourceFile != filepath.Base(selected.path) || manifest.SourceSize != info.Size() || manifest.SourceModified != info.ModTime().UnixNano() {
		return timingManifest{}, false
	}
	return manifest, true
}

func writeCorrectedManifest(selected track, voiceSyncMs int) error {
	info, err := os.Stat(selected.path)
	if err != nil {
		return err
	}
	manifest := timingManifest{Version: 1, SourceFile: filepath.Base(selected.path), SourceSize: info.Size(), SourceModified: info.ModTime().UnixNano(), VoiceSyncMs: voiceSyncMs}
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	target := correctedManifestPathFor(selected)
	temporary := target + ".part"
	if err := os.WriteFile(temporary, encoded, 0600); err != nil {
		return err
	}
	if err := os.Rename(temporary, target); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

func readCorrectedManifest(selected track) (timingManifest, bool) {
	encoded, err := os.ReadFile(correctedManifestPathFor(selected))
	if err != nil {
		return timingManifest{}, false
	}
	var manifest timingManifest
	if json.Unmarshal(encoded, &manifest) != nil {
		return timingManifest{}, false
	}
	info, err := os.Stat(selected.path)
	if err != nil || manifest.Version != 1 || manifest.SourceFile != filepath.Base(selected.path) || manifest.SourceSize != info.Size() || manifest.SourceModified != info.ModTime().UnixNano() {
		return timingManifest{}, false
	}
	return manifest, true
}

func (state *serverState) legacyCachePathFor(selected track) (string, error) {
	info, err := os.Stat(selected.path)
	if err != nil {
		return "", err
	}
	fingerprint := fmt.Sprintf("%s|%d|%d", selected.path, info.Size(), info.ModTime().UnixNano())
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(fingerprint)))
	return filepath.Join(state.cacheRoot, digest+".mp4"), nil
}

func writePreparedManifest(selected track, voiceSyncMs int) error {
	info, err := os.Stat(selected.path)
	if err != nil {
		return err
	}
	manifest := preparedManifest{
		Version:        1,
		SourceFile:     filepath.Base(selected.path),
		SourceSize:     info.Size(),
		SourceModified: info.ModTime().UnixNano(),
		PreparedFile:   filepath.Base(preparedPathFor(selected)),
		VoiceSyncMs:    voiceSyncMs,
	}
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	manifestPath := preparedManifestPathFor(selected)
	temporaryPath := manifestPath + ".part"
	if err := os.WriteFile(temporaryPath, append(encoded, '\n'), 0600); err != nil {
		return err
	}
	if err := os.Remove(manifestPath); err != nil && !os.IsNotExist(err) {
		_ = os.Remove(temporaryPath)
		return err
	}
	if err := os.Rename(temporaryPath, manifestPath); err != nil {
		_ = os.Remove(temporaryPath)
		return err
	}
	return nil
}

func readPreparedManifest(selected track) (preparedManifest, bool) {
	encoded, err := os.ReadFile(preparedManifestPathFor(selected))
	if err != nil {
		return preparedManifest{}, false
	}
	var manifest preparedManifest
	if json.Unmarshal(encoded, &manifest) != nil || manifest.Version != 1 {
		return preparedManifest{}, false
	}
	info, err := os.Stat(selected.path)
	if err != nil || manifest.SourceFile != filepath.Base(selected.path) || manifest.SourceSize != info.Size() || manifest.SourceModified != info.ModTime().UnixNano() || manifest.PreparedFile != filepath.Base(preparedPathFor(selected)) {
		return preparedManifest{}, false
	}
	if _, err := normalizeVoiceSyncOffset(strconv.Itoa(manifest.VoiceSyncMs)); err != nil {
		return preparedManifest{}, false
	}
	return manifest, true
}

func readPreparedVoiceSync(selected track) int {
	manifest, valid := readPreparedManifest(selected)
	if !valid {
		return 0
	}
	return manifest.VoiceSyncMs
}

func copyFileAtomic(sourcePath string, destinationPath string) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer source.Close()
	temporaryPath := destinationPath + ".part"
	_ = os.Remove(temporaryPath)
	destination, err := os.OpenFile(temporaryPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(destination, source)
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(temporaryPath)
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	if err := os.Rename(temporaryPath, destinationPath); err != nil {
		_ = os.Remove(temporaryPath)
		return err
	}
	return nil
}

func normalizeVoiceSyncOffset(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, nil
	}
	offset, err := strconv.Atoi(value)
	if err != nil || offset < -2000 || offset > 2000 || offset%50 != 0 {
		return 0, errors.New("voiceSyncMs must be between -2000 and 2000 in 50 ms steps")
	}
	return offset, nil
}

func preparationKey(id string, voiceSyncMs int) string {
	return fmt.Sprintf("%s|voice-sync:%d", id, voiceSyncMs)
}

func voiceSyncCachePath(basePath string, voiceSyncMs int) string {
	if voiceSyncMs == 0 {
		return basePath
	}
	return strings.TrimSuffix(basePath, ".mp4") + fmt.Sprintf(".sync%+d.mp4", voiceSyncMs)
}

func (state *serverState) sourceLock(id string) *sync.Mutex {
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.sourceLocks[id] == nil {
		state.sourceLocks[id] = &sync.Mutex{}
	}
	return state.sourceLocks[id]
}

func probeDurationSeconds(ffprobePath string, inputPath string) float64 {
	command := exec.Command(
		ffprobePath,
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		inputPath,
	)
	output, err := command.Output()
	if err != nil {
		return 0
	}
	duration, _ := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	return duration
}

func buildTranscodePlan(probe probedMedia) transcodePlan {
	plan := transcodePlan{}
	for _, stream := range probe.Streams {
		switch stream.CodecType {
		case "video":
			if !plan.CopyVideo {
				codec := strings.ToLower(stream.CodecName)
				pixelFormat := strings.ToLower(stream.PixelFmt)
				plan.CopyVideo = codec == "h264" && (pixelFormat == "yuv420p" || pixelFormat == "yuvj420p")
			}
		case "audio":
			if !plan.CopyAudio {
				plan.CopyAudio = strings.EqualFold(stream.CodecName, "aac")
			}
		}
	}
	return plan
}

func probeMedia(ffprobePath string, inputPath string) (probedMedia, error) {
	command := exec.Command(
		ffprobePath,
		"-v", "error",
		"-show_entries", "stream=codec_type,codec_name,pix_fmt,channels",
		"-of", "json",
		inputPath,
	)
	output, err := command.Output()
	if err != nil {
		return probedMedia{}, errors.New("FFprobe could not inspect the video streams")
	}
	var probe probedMedia
	if err := json.Unmarshal(output, &probe); err != nil {
		return probedMedia{}, errors.New("FFprobe returned unreadable video stream information")
	}
	return probe, nil
}

func probeTranscodePlan(ffprobePath string, inputPath string) (transcodePlan, error) {
	probe, err := probeMedia(ffprobePath, inputPath)
	if err != nil {
		return transcodePlan{}, err
	}
	return buildTranscodePlan(probe), nil
}

func codecDisplayName(codec string) string {
	switch strings.ToLower(strings.TrimSpace(codec)) {
	case "h264":
		return "H.264"
	case "hevc", "h265":
		return "HEVC/H.265"
	case "ac3":
		return "AC3"
	case "eac3":
		return "E-AC3"
	case "aac":
		return "AAC"
	}
	if strings.TrimSpace(codec) == "" {
		return "unknown"
	}
	return strings.ToUpper(codec)
}

func compatibilityReason(inputPath string, probe probedMedia, plan transcodePlan) string {
	container := strings.ToUpper(strings.TrimPrefix(filepath.Ext(inputPath), "."))
	if container == "" {
		container = "Video"
	}
	videoCodec := "unknown"
	audioCodec := "unknown"
	audioChannels := 0
	for _, stream := range probe.Streams {
		if stream.CodecType == "video" && videoCodec == "unknown" {
			videoCodec = codecDisplayName(stream.CodecName)
		}
		if stream.CodecType == "audio" && audioCodec == "unknown" {
			audioCodec = codecDisplayName(stream.CodecName)
			audioChannels = stream.Channels
		}
	}
	channelText := ""
	if audioChannels > 0 {
		channelText = fmt.Sprintf(" %d-channel", audioChannels)
	}
	opening := fmt.Sprintf("%s contains %s video and %s%s audio.", container, videoCodec, audioCodec, channelText)
	switch {
	case plan.CopyVideo && !plan.CopyAudio:
		return opening + " Impala is preserving the compatible video and converting the audio to AAC stereo for reliable browser playback."
	case !plan.CopyVideo && plan.CopyAudio:
		return opening + " Impala is converting the video to H.264 while preserving the compatible audio for reliable browser playback."
	case !plan.CopyVideo && !plan.CopyAudio:
		return opening + " Impala is converting it to H.264 video with AAC stereo audio for reliable browser playback."
	default:
		return opening + " Impala is packaging the compatible streams for browser playback."
	}
}

func (state *serverState) updatePreparation(key string, apply func(*mediaPreparation)) {
	state.mu.Lock()
	defer state.mu.Unlock()
	if preparation := state.preparations[key]; preparation != nil {
		apply(preparation)
	}
}

func (state *serverState) transcodeMkv(selected track, outputPath string, key string) error {
	durationSeconds := probeDurationSeconds(state.mediaTools.FFprobe.Path, selected.path)
	probe, err := probeMedia(state.mediaTools.FFprobe.Path, selected.path)
	if err != nil {
		return err
	}
	plan := buildTranscodePlan(probe)
	reason := compatibilityReason(selected.path, probe, plan)
	temporaryPath := strings.TrimSuffix(outputPath, ".mp4") + ".part.mp4"
	_ = os.Remove(temporaryPath)

	arguments := []string{
		"-y",
		"-i", selected.path,
		"-map", "0:v:0",
		"-map", "0:a:0?",
	}
	if plan.CopyVideo {
		arguments = append(arguments, "-c:v", "copy")
	} else {
		arguments = append(arguments, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p")
	}
	if plan.CopyAudio {
		arguments = append(arguments, "-c:a", "copy")
	} else {
		arguments = append(arguments, "-c:a", "aac", "-b:a", "192k", "-ac", "2")
	}
	arguments = append(arguments, "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", temporaryPath)
	command := exec.Command(state.mediaTools.FFmpeg.Path, arguments...)
	progressOutput, err := command.StdoutPipe()
	if err != nil {
		return errors.New("unable to start FFmpeg progress reporting")
	}
	errorOutput, err := command.StderrPipe()
	if err != nil {
		return errors.New("unable to start FFmpeg error reporting")
	}
	if err := command.Start(); err != nil {
		return errors.New("FFmpeg could not start")
	}
	var ffmpegErrors bytes.Buffer
	go func() { _, _ = io.Copy(&ffmpegErrors, errorOutput) }()

	state.updatePreparation(key, func(value *mediaPreparation) {
		value.Reason = reason
		value.Message = reason
	})

	scanner := bufio.NewScanner(progressOutput)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 || durationSeconds <= 0 {
			continue
		}
		if parts[0] != "out_time_us" && parts[0] != "out_time_ms" {
			continue
		}
		microseconds, parseErr := strconv.ParseFloat(parts[1], 64)
		if parseErr != nil {
			continue
		}
		progress := microseconds / 1000000 / durationSeconds * 100
		if progress < 0 {
			progress = 0
		}
		if progress > 99.9 {
			progress = 99.9
		}
		state.updatePreparation(key, func(value *mediaPreparation) {
			value.Progress = progress * 0.98
			value.Message = value.Reason
		})
	}

	if err := command.Wait(); err != nil {
		_ = os.Remove(temporaryPath)
		log.Printf("MKV preparation failed for %s: %v (%s)", filepath.Base(selected.path), err, strings.TrimSpace(ffmpegErrors.String()))
		return errors.New("FFmpeg could not prepare this MKV")
	}
	if err := os.Rename(temporaryPath, outputPath); err != nil {
		_ = os.Remove(temporaryPath)
		return errors.New("the completed compatibility copy could not be saved")
	}
	return nil
}

func (state *serverState) createVoiceSyncVariant(basePath string, outputPath string, voiceSyncMs int) error {
	temporaryPath := strings.TrimSuffix(outputPath, ".mp4") + ".part.mp4"
	_ = os.Remove(temporaryPath)
	offsetSeconds := strconv.FormatFloat(float64(absInt(voiceSyncMs))/1000, 'f', 3, 64)
	arguments := []string{"-y", "-i", basePath}
	if voiceSyncMs > 0 {
		arguments = append(arguments, "-itsoffset", offsetSeconds, "-i", basePath)
	} else {
		arguments = append(arguments, "-ss", offsetSeconds, "-i", basePath)
	}
	arguments = append(arguments,
		"-map", "0:v:0",
		"-map", "1:a:0?",
		"-c", "copy",
		"-map_metadata", "-1",
		"-movflags", "+faststart",
		temporaryPath,
	)
	command := exec.Command(state.mediaTools.FFmpeg.Path, arguments...)
	if output, err := command.CombinedOutput(); err != nil {
		_ = os.Remove(temporaryPath)
		log.Printf("Voice Sync adjustment failed for %s: %v (%s)", filepath.Base(basePath), err, strings.TrimSpace(string(output)))
		return errors.New("FFmpeg could not apply the Voice Sync adjustment")
	}
	if err := os.Rename(temporaryPath, outputPath); err != nil {
		_ = os.Remove(temporaryPath)
		return errors.New("the Voice Sync copy could not be saved")
	}
	return nil
}

func (state *serverState) createCompatibleTimedVideo(basePath string, outputPath string, voiceSyncMs int) error {
	plan, err := probeTranscodePlan(state.mediaTools.FFprobe.Path, basePath)
	if err != nil {
		return err
	}
	temporaryPath := strings.TrimSuffix(outputPath, ".mp4") + ".part.mp4"
	_ = os.Remove(temporaryPath)
	offsetSeconds := strconv.FormatFloat(float64(absInt(voiceSyncMs))/1000, 'f', 3, 64)
	arguments := []string{"-y", "-i", basePath}
	if voiceSyncMs > 0 {
		arguments = append(arguments, "-itsoffset", offsetSeconds, "-i", basePath)
	} else {
		arguments = append(arguments, "-ss", offsetSeconds, "-i", basePath)
	}
	arguments = append(arguments, "-map", "0:v:0", "-map", "1:a:0?")
	if plan.CopyVideo {
		arguments = append(arguments, "-c:v", "copy")
	} else {
		arguments = append(arguments, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p")
	}
	if plan.CopyAudio {
		arguments = append(arguments, "-c:a", "copy")
	} else {
		arguments = append(arguments, "-c:a", "aac", "-b:a", "192k", "-ac", "2")
	}
	arguments = append(arguments, "-map_metadata", "-1", "-movflags", "+faststart", temporaryPath)
	command := exec.Command(state.mediaTools.FFmpeg.Path, arguments...)
	if output, commandErr := command.CombinedOutput(); commandErr != nil {
		_ = os.Remove(temporaryPath)
		log.Printf("Corrected video creation failed for %s: %v (%s)", filepath.Base(basePath), commandErr, strings.TrimSpace(string(output)))
		return errors.New("FFmpeg could not create the corrected video")
	}
	if err := os.Rename(temporaryPath, outputPath); err != nil {
		_ = os.Remove(temporaryPath)
		return errors.New("the corrected video could not be saved")
	}
	return nil
}

func (state *serverState) runLocalVideoSync(selected track, key string, basePath string, outputPath string, voiceSyncMs int, corrected bool) {
	lock := state.sourceLock(selected.ID)
	lock.Lock()
	defer lock.Unlock()

	if corrected {
		if _, err := os.Stat(outputPath); err == nil {
			state.updatePreparation(key, func(value *mediaPreparation) {
				value.Status = "error"
				value.Message = "A corrected copy already exists; Impala will not overwrite it."
			})
			return
		}
	}
	if err := state.createCompatibleTimedVideo(basePath, outputPath, voiceSyncMs); err != nil {
		state.updatePreparation(key, func(value *mediaPreparation) {
			value.Status = "error"
			value.Message = err.Error() + ". The original file was not changed."
		})
		return
	}
	if corrected {
		if err := writeCorrectedManifest(selected, voiceSyncMs); err != nil {
			state.updatePreparation(key, func(value *mediaPreparation) {
				value.Status = "error"
				value.Message = "The corrected video was created, but its ownership metadata could not be saved."
			})
			return
		}
	}
	state.updatePreparation(key, func(value *mediaPreparation) {
		value.Status = "ready"
		value.Progress = 100
		if corrected {
			value.Message = "Corrected copy ready for upload."
		} else {
			value.Message = "Ready to play."
		}
	})
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func (state *serverState) runMkvPreparation(selected track, key string, basePath string, outputPath string, voiceSyncMs int) {
	lock := state.sourceLock(selected.ID)
	lock.Lock()
	defer lock.Unlock()

	if _, err := os.Stat(basePath); err != nil {
		if err := state.transcodeMkv(selected, basePath, key); err != nil {
			state.updatePreparation(key, func(value *mediaPreparation) {
				value.Status = "error"
				value.Message = err.Error() + ". The original file was not changed."
			})
			return
		}
		if err := writePreparedManifest(selected, 0); err != nil {
			state.updatePreparation(key, func(value *mediaPreparation) {
				value.Status = "error"
				value.Message = "The prepared video was created, but its ownership manifest could not be saved."
			})
			return
		}
	}

	if voiceSyncMs != 0 {
		state.updatePreparation(key, func(value *mediaPreparation) {
			value.Progress = 99
			value.Message = "Applying the Voice Sync adjustment."
		})
		if _, err := os.Stat(outputPath); err != nil {
			if err := state.createVoiceSyncVariant(basePath, outputPath, voiceSyncMs); err != nil {
				state.updatePreparation(key, func(value *mediaPreparation) {
					value.Status = "error"
					value.Message = err.Error() + ". The original file was not changed."
				})
				return
			}
		}
		state.pruneVoiceSyncCache(outputPath)
	}

	state.updatePreparation(key, func(value *mediaPreparation) {
		value.Status = "ready"
		value.Progress = 100
		value.Message = "Ready to play."
	})
}

func isSupportedMedia(filename string) bool {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".mp3", ".flac", ".wav", ".aac", ".m4a", ".ogg", ".mp4", ".m4v", ".webm", ".mov", ".mkv":
		return true
	default:
		return false
	}
}

func mediaTypeFor(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".mp4", ".m4v", ".webm", ".mov", ".mkv":
		return "video"
	default:
		return "audio"
	}
}

func contentTypeFor(filename string) string {
	if strings.EqualFold(filepath.Ext(filename), ".mkv") {
		return "video/x-matroska"
	}

	if value := mime.TypeByExtension(strings.ToLower(filepath.Ext(filename))); value != "" {
		return value
	}
	if mediaTypeFor(filename) == "video" {
		return "video/mp4"
	}
	return "audio/mpeg"
}

func slashPath(parts ...string) string {
	return strings.ReplaceAll(filepath.Join(parts...), string(filepath.Separator), "/")
}

func cleanTitle(filename string) string {
	withoutExtension := strings.TrimSuffix(filename, filepath.Ext(filename))
	withoutNumber := strings.TrimSpace(withoutExtension)
	withoutNumber = strings.TrimLeft(withoutNumber, "0123456789")
	withoutNumber = strings.TrimLeft(withoutNumber, " -._)")
	if withoutNumber != "" {
		return withoutNumber
	}
	if withoutExtension != "" {
		return withoutExtension
	}
	return filename
}

func (state *serverState) scanLibrary(root string) ([]track, error) {
	rootInfo, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !rootInfo.IsDir() {
		return nil, errors.New("root is not a directory")
	}

	var scanned []track
	err = filepath.WalkDir(root, func(fullPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			if fullPath != root && strings.EqualFold(entry.Name(), ".impala") {
				return filepath.SkipDir
			}
			return nil
		}
		filename := entry.Name()
		lowerName := strings.ToLower(filename)
		if strings.Contains(lowerName, ".impala.") || !isSupportedMedia(filename) {
			return nil
		}

		relativePath, relativeErr := filepath.Rel(root, fullPath)
		if relativeErr != nil || strings.HasPrefix(relativePath, "..") {
			return nil
		}
		segments := strings.Split(filepath.ToSlash(relativePath), "/")
		artist := filepath.Base(root)
		album := "Local Library"
		if len(segments) >= 2 {
			artist = segments[len(segments)-2]
		}
		if len(segments) >= 3 {
			artist = segments[len(segments)-3]
			album = segments[len(segments)-2]
		}
		objectKey := strings.Join(segments, "/")
		title := cleanTitle(filename)
		candidate := track{
			ID:          objectKey,
			Artist:      artist,
			Album:       album,
			Title:       title,
			Name:        title,
			ObjectKey:   objectKey,
			File:        objectKey,
			MediaType:   mediaTypeFor(filename),
			ContentType: contentTypeFor(filename),
			Source:      "local-service",
			path:        fullPath,
		}
		if strings.EqualFold(filepath.Ext(filename), ".mkv") {
			candidate.VoiceSyncMs = readPreparedVoiceSync(candidate)
		} else if mediaTypeFor(filename) == "video" {
			if manifest, valid := readTimingManifest(candidate); valid {
				candidate.VoiceSyncMs = manifest.VoiceSyncMs
			}
		}
		scanned = append(scanned, candidate)
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(scanned, func(left, right int) bool {
		return strings.ToLower(scanned[left].ObjectKey) < strings.ToLower(scanned[right].ObjectKey)
	})

	return scanned, nil
}

func validateLibraryRoot(root string) error {
	cleanRoot, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return errors.New("library root is invalid")
	}
	volumeRoot := filepath.VolumeName(cleanRoot) + string(filepath.Separator)
	if strings.EqualFold(cleanRoot, volumeRoot) {
		return errors.New("choose a dedicated media folder, not an entire drive")
	}
	if userHome, homeErr := os.UserHomeDir(); homeErr == nil {
		cleanHome, _ := filepath.Abs(filepath.Clean(userHome))
		if strings.EqualFold(cleanRoot, cleanHome) || strings.EqualFold(cleanRoot, filepath.Dir(cleanHome)) {
			return errors.New("choose a dedicated media folder inside your profile, not the entire user folder")
		}
	}
	return nil
}

func (state *serverState) allowLocalBrowser(w http.ResponseWriter, r *http.Request) bool {
	origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
	if origin != "" {
		allowed := false
		for _, candidate := range state.allowedOrigins {
			if originMatches(origin, candidate) {
				allowed = true
				break
			}
		}
		if !allowed {
			http.Error(w, "browser origin is not allowed", http.StatusForbidden)
			return false
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Add("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	return true
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(value)
}

func (state *serverState) healthHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	cacheCount, cacheBytes := state.voiceSyncCacheStats()
	state.mu.RLock()
	defer state.mu.RUnlock()

	writeJSON(w, map[string]any{
		"ok":                    true,
		"service":               serviceName,
		"root":                  state.musicRoot,
		"trackCount":            len(state.tracks),
		"mediaTools":            state.mediaTools,
		"mkvReady":              state.mediaTools.FFmpeg.Available && state.mediaTools.FFprobe.Available,
		"timingCacheLimitBytes": state.cacheLimitBytes,
		"timingCacheFiles":      cacheCount,
		"timingCacheBytes":      cacheBytes,
	})
}

func (state *serverState) listHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	state.mu.RLock()
	defer state.mu.RUnlock()

	publicTracks := make([]track, len(state.tracks))
	copy(publicTracks, state.tracks)
	for index := range publicTracks {
		publicTracks[index].path = ""
	}

	writeJSON(w, publicTracks)
}

func (state *serverState) fileHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	state.mu.RLock()
	var selected track
	for _, candidate := range state.tracks {
		if candidate.ID == id {
			selected = candidate
			break
		}
	}
	state.mu.RUnlock()

	if selected.ID == "" {
		http.Error(w, "track not found", http.StatusNotFound)
		return
	}

	file, err := os.Open(selected.path)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		http.Error(w, "file unavailable", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", selected.ContentType)
	http.ServeContent(w, r, filepath.Base(selected.path), info.ModTime(), file)
}

func (state *serverState) mkvPrepareHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !state.mediaTools.FFmpeg.Available || !state.mediaTools.FFprobe.Available {
		http.Error(w, "FFmpeg and FFprobe are required to prepare MKV files", http.StatusServiceUnavailable)
		return
	}

	id := strings.TrimSpace(r.URL.Query().Get("id"))
	voiceSyncMs, err := normalizeVoiceSyncOffset(r.URL.Query().Get("voiceSyncMs"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	selected := state.findTrack(id)
	if selected.ID == "" {
		http.Error(w, "media item not found", http.StatusNotFound)
		return
	}
	if !strings.EqualFold(filepath.Ext(selected.path), ".mkv") {
		http.Error(w, "media item is not an MKV", http.StatusBadRequest)
		return
	}

	basePath := preparedPathFor(selected)
	legacyCachePath, err := state.legacyCachePathFor(selected)
	if err != nil {
		http.Error(w, "media item is unavailable", http.StatusNotFound)
		return
	}
	if r.Method == http.MethodPost {
		migratedLegacyCopy := false
		if _, baseErr := os.Stat(basePath); os.IsNotExist(baseErr) {
			if legacyInfo, legacyErr := os.Stat(legacyCachePath); legacyErr == nil && !legacyInfo.IsDir() {
				if err := copyFileAtomic(legacyCachePath, basePath); err != nil {
					http.Error(w, "The existing prepared copy could not be saved into the local library: "+err.Error(), http.StatusInternalServerError)
					return
				}
				migratedLegacyCopy = true
			}
		}
		if _, baseErr := os.Stat(basePath); baseErr == nil {
			_, manifestErr := os.Stat(preparedManifestPathFor(selected))
			if os.IsNotExist(manifestErr) {
				if !migratedLegacyCopy {
					http.Error(w, "A reserved .impala.mp4 file already exists without an Impala ownership manifest", http.StatusConflict)
					return
				}
				if err := writePreparedManifest(selected, 0); err != nil {
					http.Error(w, "The prepared copy exists, but its ownership manifest could not be saved: "+err.Error(), http.StatusInternalServerError)
					return
				}
				_ = os.Remove(legacyCachePath)
			} else if manifestErr != nil {
				http.Error(w, "The prepared-copy manifest is unavailable: "+manifestErr.Error(), http.StatusInternalServerError)
				return
			} else if _, valid := readPreparedManifest(selected); !valid {
				http.Error(w, "The original MKV changed after its prepared copy was created; preserve or remove the stale .impala files before preparing it again", http.StatusConflict)
				return
			}
		}
	}
	outputPath := basePath
	if voiceSyncMs != 0 {
		outputPath = voiceSyncCachePath(legacyCachePath, voiceSyncMs)
	}
	key := preparationKey(id, voiceSyncMs)
	_, durableReady := readPreparedManifest(selected)
	if info, statErr := os.Stat(outputPath); durableReady && statErr == nil && !info.IsDir() {
		state.mu.Lock()
		state.preparations[key] = &mediaPreparation{
			ID:          id,
			Status:      "ready",
			Progress:    100,
			Message:     "Ready to play from the local library.",
			VoiceSyncMs: voiceSyncMs,
			OutputPath:  outputPath,
		}
		ready := preparationCopy(state.preparations[key])
		state.mu.Unlock()
		mediaQuery := url.Values{"id": []string{id}, "voiceSyncMs": []string{strconv.Itoa(voiceSyncMs)}}
		writeJSON(w, map[string]any{
			"ok":          true,
			"preparation": ready,
			"mediaUrl":    "/library/mkv/file?" + mediaQuery.Encode(),
		})
		return
	}

	state.mu.Lock()
	current := state.preparations[key]
	shouldStart := false
	if current == nil || current.OutputPath != outputPath || (r.Method == http.MethodPost && (current.Status == "error" || current.Status == "not-started")) {
		status := "not-started"
		message := "This MKV has not been prepared yet."
		if r.Method == http.MethodPost {
			status = "preparing"
			message = "Preparing a browser-compatible local copy."
		}
		current = &mediaPreparation{
			ID:          id,
			Status:      status,
			Progress:    0,
			Message:     message,
			VoiceSyncMs: voiceSyncMs,
			OutputPath:  outputPath,
		}
		state.preparations[key] = current
		shouldStart = r.Method == http.MethodPost
	}
	publicPreparation := preparationCopy(current)
	state.mu.Unlock()

	if shouldStart {
		go state.runMkvPreparation(selected, key, basePath, outputPath, voiceSyncMs)
	}
	mediaQuery := url.Values{"id": []string{id}, "voiceSyncMs": []string{strconv.Itoa(voiceSyncMs)}}
	writeJSON(w, map[string]any{
		"ok":          true,
		"preparation": publicPreparation,
		"mediaUrl":    "/library/mkv/file?" + mediaQuery.Encode(),
	})
}

func (state *serverState) mkvFileHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimSpace(r.URL.Query().Get("id"))
	voiceSyncMs, err := normalizeVoiceSyncOffset(r.URL.Query().Get("voiceSyncMs"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	key := preparationKey(id, voiceSyncMs)
	state.mu.RLock()
	preparation := preparationCopy(state.preparations[key])
	state.mu.RUnlock()
	if preparation.Status != "ready" || preparation.OutputPath == "" {
		http.Error(w, "MKV compatibility copy is not ready", http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, preparation.OutputPath)
}

func (state *serverState) mkvTimingHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		ID          string `json:"id"`
		VoiceSyncMs int    `json:"voiceSyncMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(body.ID)
	voiceSyncMs, err := normalizeVoiceSyncOffset(strconv.Itoa(body.VoiceSyncMs))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	selected := state.findTrack(id)
	if selected.ID == "" || !strings.EqualFold(filepath.Ext(selected.path), ".mkv") {
		http.Error(w, "MKV media item not found", http.StatusNotFound)
		return
	}
	if _, err := os.Stat(preparedPathFor(selected)); err != nil {
		http.Error(w, "prepare this MKV before saving Voice Sync", http.StatusConflict)
		return
	}
	if _, valid := readPreparedManifest(selected); !valid {
		http.Error(w, "the prepared-copy manifest does not match this MKV", http.StatusConflict)
		return
	}
	if voiceSyncMs != 0 {
		legacyPath, legacyErr := state.legacyCachePathFor(selected)
		if legacyErr != nil {
			http.Error(w, "media item is unavailable", http.StatusNotFound)
			return
		}
		if _, variantErr := os.Stat(voiceSyncCachePath(legacyPath, voiceSyncMs)); variantErr != nil {
			http.Error(w, "play this Voice Sync adjustment before saving it", http.StatusConflict)
			return
		}
	}
	if err := writePreparedManifest(selected, voiceSyncMs); err != nil {
		http.Error(w, "Voice Sync manifest could not be saved: "+err.Error(), http.StatusInternalServerError)
		return
	}

	state.mu.Lock()
	for index := range state.tracks {
		if state.tracks[index].ID == id {
			state.tracks[index].VoiceSyncMs = voiceSyncMs
			break
		}
	}
	state.mu.Unlock()
	writeJSON(w, map[string]any{
		"ok":          true,
		"id":          id,
		"voiceSyncMs": voiceSyncMs,
	})
}

func (state *serverState) localVideoBasePath(selected track) (string, error) {
	if _, valid := readPreparedManifest(selected); valid {
		return preparedPathFor(selected), nil
	}
	if mediaTypeFor(selected.path) != "video" {
		return "", errors.New("media item is not a video")
	}
	plan, err := probeTranscodePlan(state.mediaTools.FFprobe.Path, selected.path)
	if err != nil {
		return "", err
	}
	if !plan.CopyVideo || !plan.CopyAudio {
		return "", errors.New("prepare this local video before applying this action")
	}
	return selected.path, nil
}

func (state *serverState) localVideoCompatibility(selected track) (basePath string, requiresPreparation bool, reason string, err error) {
	if mediaTypeFor(selected.path) != "video" {
		return "", false, "", errors.New("media item is not a video")
	}
	if _, valid := readPreparedManifest(selected); valid {
		return preparedPathFor(selected), false, "", nil
	}
	probe, probeErr := probeMedia(state.mediaTools.FFprobe.Path, selected.path)
	if probeErr != nil {
		return "", false, "", probeErr
	}
	plan := buildTranscodePlan(probe)
	reason = compatibilityReason(selected.path, probe, plan)
	if strings.EqualFold(filepath.Ext(selected.path), ".mkv") {
		return preparedPathFor(selected), true, reason, nil
	}
	if plan.CopyVideo && plan.CopyAudio {
		return selected.path, false, reason, nil
	}
	return preparedPathFor(selected), true, reason, nil
}

func (state *serverState) videoSyncHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !state.mediaTools.FFmpeg.Available || !state.mediaTools.FFprobe.Available {
		http.Error(w, "FFmpeg and FFprobe are required for local-video Voice Sync", http.StatusServiceUnavailable)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	voiceSyncMs, err := normalizeVoiceSyncOffset(r.URL.Query().Get("voiceSyncMs"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	selected := state.findTrack(id)
	if selected.ID == "" || mediaTypeFor(selected.path) != "video" {
		http.Error(w, "local video item not found", http.StatusNotFound)
		return
	}
	basePath, requiresPreparation, compatibilityMessage, err := state.localVideoCompatibility(selected)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	if voiceSyncMs == 0 && !requiresPreparation && strings.EqualFold(basePath, selected.path) {
		query := url.Values{"id": []string{id}}
		writeJSON(w, map[string]any{
			"ok":          true,
			"preparation": mediaPreparation{ID: id, Status: "ready", Progress: 100, Message: "Original timing.", VoiceSyncMs: 0},
			"mediaUrl":    "/library/file?" + query.Encode(),
		})
		return
	}
	outputPath := basePath
	if voiceSyncMs != 0 {
		cacheBase, cacheErr := state.legacyCachePathFor(selected)
		if cacheErr != nil {
			http.Error(w, "media item is unavailable", http.StatusNotFound)
			return
		}
		outputPath = voiceSyncCachePath(cacheBase, voiceSyncMs)
	}
	key := "video-sync|" + preparationKey(id, voiceSyncMs)
	state.mu.Lock()
	current := state.preparations[key]
	shouldStart := false
	if info, statErr := os.Stat(outputPath); !requiresPreparation && statErr == nil && !info.IsDir() {
		current = &mediaPreparation{ID: id, Status: "ready", Progress: 100, Message: "Ready to play.", VoiceSyncMs: voiceSyncMs, OutputPath: outputPath}
		state.preparations[key] = current
	} else if current == nil || (r.Method == http.MethodPost && current.Status == "error") {
		status := "not-started"
		message := "This local video has not been prepared yet."
		if r.Method == http.MethodPost {
			status = "preparing"
			if requiresPreparation {
				message = compatibilityMessage
			} else {
				message = "Applying Voice Sync to this local video."
			}
			shouldStart = true
		}
		current = &mediaPreparation{ID: id, Status: status, Progress: 0, Message: message, VoiceSyncMs: voiceSyncMs, OutputPath: outputPath, Reason: compatibilityMessage}
		state.preparations[key] = current
	}
	publicPreparation := preparationCopy(current)
	state.mu.Unlock()
	if shouldStart {
		if requiresPreparation {
			go state.runMkvPreparation(selected, key, basePath, outputPath, voiceSyncMs)
		} else {
			go state.runLocalVideoSync(selected, key, basePath, outputPath, voiceSyncMs, false)
		}
	}
	query := url.Values{"id": []string{id}, "voiceSyncMs": []string{strconv.Itoa(voiceSyncMs)}}
	writeJSON(w, map[string]any{"ok": true, "preparation": publicPreparation, "mediaUrl": "/library/video/file?" + query.Encode()})
}

func (state *serverState) videoSyncFileHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	voiceSyncMs, err := normalizeVoiceSyncOffset(r.URL.Query().Get("voiceSyncMs"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	key := "video-sync|" + preparationKey(id, voiceSyncMs)
	if r.URL.Query().Get("corrected") == "1" {
		key = "corrected|" + preparationKey(id, voiceSyncMs)
	}
	state.mu.RLock()
	preparation := preparationCopy(state.preparations[key])
	state.mu.RUnlock()
	if preparation.Status != "ready" || preparation.OutputPath == "" {
		http.Error(w, "local video copy is not ready", http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, preparation.OutputPath)
}

func (state *serverState) videoTimingHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ID          string `json:"id"`
		VoiceSyncMs int    `json:"voiceSyncMs"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	voiceSyncMs, err := normalizeVoiceSyncOffset(strconv.Itoa(body.VoiceSyncMs))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	selected := state.findTrack(strings.TrimSpace(body.ID))
	if selected.ID == "" || mediaTypeFor(selected.path) != "video" {
		http.Error(w, "local video item not found", http.StatusNotFound)
		return
	}
	if strings.EqualFold(filepath.Ext(selected.path), ".mkv") {
		if _, valid := readPreparedManifest(selected); !valid {
			http.Error(w, "prepare this MKV before saving Voice Sync", http.StatusConflict)
			return
		}
		if err := writePreparedManifest(selected, voiceSyncMs); err != nil {
			http.Error(w, "Voice Sync manifest could not be saved: "+err.Error(), http.StatusInternalServerError)
			return
		}
	} else if err := writeTimingManifest(selected, voiceSyncMs); err != nil {
		http.Error(w, "Voice Sync timing could not be saved: "+err.Error(), http.StatusInternalServerError)
		return
	}
	state.mu.Lock()
	for index := range state.tracks {
		if state.tracks[index].ID == selected.ID {
			state.tracks[index].VoiceSyncMs = voiceSyncMs
			break
		}
	}
	state.mu.Unlock()
	writeJSON(w, map[string]any{"ok": true, "id": selected.ID, "voiceSyncMs": voiceSyncMs})
}

func (state *serverState) correctedVideoHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !state.mediaTools.FFmpeg.Available || !state.mediaTools.FFprobe.Available {
		http.Error(w, "FFmpeg and FFprobe are required to create a corrected video", http.StatusServiceUnavailable)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	voiceSyncMs, err := normalizeVoiceSyncOffset(r.URL.Query().Get("voiceSyncMs"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	selected := state.findTrack(id)
	if selected.ID == "" || mediaTypeFor(selected.path) != "video" {
		http.Error(w, "local video item not found", http.StatusNotFound)
		return
	}
	basePath, err := state.localVideoBasePath(selected)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	outputPath := correctedVideoPathFor(selected)
	key := "corrected|" + preparationKey(id, voiceSyncMs)
	state.mu.Lock()
	current := state.preparations[key]
	shouldStart := false
	if info, statErr := os.Stat(outputPath); statErr == nil && !info.IsDir() {
		manifest, valid := readCorrectedManifest(selected)
		if valid && manifest.VoiceSyncMs == voiceSyncMs {
			current = &mediaPreparation{ID: id, Status: "ready", Progress: 100, Message: "Corrected copy already exists.", VoiceSyncMs: voiceSyncMs, OutputPath: outputPath}
		} else {
			current = &mediaPreparation{ID: id, Status: "error", Progress: 0, Message: "A corrected copy already exists with different or unverifiable timing; Impala will not overwrite it.", VoiceSyncMs: voiceSyncMs, OutputPath: outputPath}
		}
		state.preparations[key] = current
	} else if current == nil || (r.Method == http.MethodPost && current.Status == "error") {
		status := "not-started"
		message := "Corrected copy has not been created."
		if r.Method == http.MethodPost {
			status = "preparing"
			message = "Creating an upload-ready corrected copy."
			shouldStart = true
		}
		current = &mediaPreparation{ID: id, Status: status, Progress: 0, Message: message, VoiceSyncMs: voiceSyncMs, OutputPath: outputPath}
		state.preparations[key] = current
	}
	publicPreparation := preparationCopy(current)
	state.mu.Unlock()
	if shouldStart {
		go state.runLocalVideoSync(selected, key, basePath, outputPath, voiceSyncMs, true)
	}
	writeJSON(w, map[string]any{"ok": true, "preparation": publicPreparation, "outputFile": filepath.Base(outputPath), "outputPath": outputPath})
}

func pathWithin(child string, parent string) bool {
	relative, err := filepath.Rel(parent, child)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func (state *serverState) mkvGroupHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	selected := state.findTrack(id)
	if selected.ID == "" || !strings.EqualFold(filepath.Ext(selected.path), ".mkv") {
		http.Error(w, "MKV media item not found", http.StatusNotFound)
		return
	}
	folderPath := filepath.Dir(selected.path)
	seriesPath := folderPath
	folderName := filepath.Base(folderPath)
	if strings.HasPrefix(strings.ToLower(folderName), "season ") {
		seriesPath = filepath.Dir(folderPath)
	}
	seriesName := filepath.Base(seriesPath)
	state.mu.RLock()
	folderIDs := []string{}
	seriesIDs := []string{}
	for _, candidate := range state.tracks {
		if !strings.EqualFold(filepath.Ext(candidate.path), ".mkv") {
			continue
		}
		if strings.EqualFold(filepath.Dir(candidate.path), folderPath) {
			folderIDs = append(folderIDs, candidate.ID)
		}
		if pathWithin(candidate.path, seriesPath) {
			seriesIDs = append(seriesIDs, candidate.ID)
		}
	}
	state.mu.RUnlock()
	writeJSON(w, map[string]any{
		"ok": true, "id": id,
		"folder": map[string]any{"name": folderName, "count": len(folderIDs), "ids": folderIDs},
		"series": map[string]any{"name": seriesName, "count": len(seriesIDs), "ids": seriesIDs},
	})
}

func (state *serverState) setRootHandler(w http.ResponseWriter, r *http.Request) {
	if !state.allowLocalBrowser(w, r) {
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Root string `json:"root"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	root := strings.TrimSpace(body.Root)
	if root == "" {
		http.Error(w, "missing root", http.StatusBadRequest)
		return
	}
	if err := validateLibraryRoot(root); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	scanned, err := state.scanLibrary(root)
	if err != nil {
		http.Error(w, "scan failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	state.mu.Lock()
	state.musicRoot = root
	state.tracks = scanned
	state.mu.Unlock()

	writeJSON(w, map[string]any{
		"ok":         true,
		"root":       root,
		"trackCount": len(scanned),
	})
}
