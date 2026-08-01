package downloader

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"tasutube/internal/ytdlp"
)

type DownloadResult struct {
	Success  bool   `json:"success"`
	Message  string `json:"message"`
	FilePath string `json:"filePath,omitempty"`
}

type VideoMetadata struct {
	Title           string  `json:"title"`
	Thumbnail       string  `json:"thumbnail"`
	Duration        float64 `json:"duration"`
	MaxHeight       int     `json:"maxHeight"`
	AvailableRes    []int   `json:"availableRes"`
	MaxAudioBitrate int     `json:"maxAudioBitrate"`
	AudioCodec      string  `json:"audioCodec"`
	SampleRate      int     `json:"sampleRate"`
}

type rawYtdlpFormat struct {
	Height int     `json:"height"`
	ABR    float64 `json:"abr"`
	Acodec string  `json:"acodec"`
	ASR    int     `json:"asr"`
}

type rawYtdlpMeta struct {
	Title     string           `json:"title"`
	Thumbnail string           `json:"thumbnail"`
	Duration  float64          `json:"duration"`
	Formats   []rawYtdlpFormat `json:"formats"`
}

var (
	metaCacheMutex sync.Mutex
	metaCache      = make(map[string]*VideoMetadata)
)

func FetchVideoMetadata(ctx context.Context, url string, ytdlpMgr *ytdlp.Manager) (*VideoMetadata, error) {
	metaCacheMutex.Lock()
	if cached, found := metaCache[url]; found {
		metaCacheMutex.Unlock()
		return cached, nil
	}
	metaCacheMutex.Unlock()

	safeURL, err := ValidateURL(url)
	if err != nil {
		return nil, err
	}

	ytdlpPath, err := ytdlpMgr.Resolve(ctx)
	if err != nil {
		return nil, fmt.Errorf("no se pudo preparar yt-dlp: %w", err)
	}

	cmd := exec.CommandContext(ctx, ytdlpPath,
		"--ignore-config",
		"-J",
		"--no-playlist",
		"--socket-timeout", "5",
		"--no-warnings",
		"--",
		safeURL,
	)
	HideWindow(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	var raw rawYtdlpMeta
	if parseErr := json.NewDecoder(stdout).Decode(&raw); parseErr != nil {
		_ = cmd.Wait()
		return nil, fmt.Errorf("error al procesar datos del video: %w", parseErr)
	}
	_ = cmd.Wait()

	meta := &VideoMetadata{
		Title:     raw.Title,
		Thumbnail: raw.Thumbnail,
		Duration:  raw.Duration,
	}

	heightMap := make(map[int]bool)
	maxHeight := 0
	maxAudioBitrate := 0
	sampleRate := 0
	audioCodec := ""

	for _, f := range raw.Formats {
		if f.Height > 0 {
			heightMap[f.Height] = true
			if f.Height > maxHeight {
				maxHeight = f.Height
			}
		}
		if int(f.ABR) > maxAudioBitrate {
			maxAudioBitrate = int(f.ABR)
		}
		if f.ASR > sampleRate {
			sampleRate = f.ASR
		}
		if f.Acodec != "" && f.Acodec != "none" {
			audioCodec = f.Acodec
		}
	}

	var resList []int
	for _, target := range []int{2160, 1440, 1080, 720, 480, 360, 240, 144} {
		if target <= maxHeight || heightMap[target] {
			resList = append(resList, target)
		}
	}

	meta.MaxHeight = maxHeight
	meta.AvailableRes = resList
	meta.MaxAudioBitrate = maxAudioBitrate
	meta.AudioCodec = audioCodec
	meta.SampleRate = sampleRate

	metaCacheMutex.Lock()
	metaCache[url] = meta
	metaCacheMutex.Unlock()

	return meta, nil
}

type ProgressEmitter func(id int, percent float64)

func RunDownload(ctx context.Context, id int, url, format, quality, downloadPath string, ytdlpMgr *ytdlp.Manager, emitProgress ProgressEmitter) DownloadResult {
	var args []string

	safeURL, err := ValidateURL(url)
	if err != nil {
		return DownloadResult{false, err.Error(), ""}
	}

	outputPath := getOutputPath(downloadPath)

	if format == "mp3" {
		args = []string{
			"--ignore-config",
			"--newline",
			"-x", "--audio-format", "mp3", "--audio-quality", AudioQuality(quality),
			"-o", outputPath,
			"--", safeURL,
		}
	} else {
		args = []string{
			"--ignore-config",
			"--newline",
			"-f", VideoFormat(quality), "--merge-output-format", "mp4",
			"-o", outputPath,
			"--", safeURL,
		}
	}

	ytdlpPath, resolveErr := ytdlpMgr.Resolve(ctx)
	if resolveErr != nil {
		return DownloadResult{false, "No se pudo preparar yt-dlp. Revisá tu conexión a internet.", ""}
	}

	cmd := exec.CommandContext(ctx, ytdlpPath, args...)
	HideWindow(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return DownloadResult{false, "Error al iniciar descarga", ""}
	}
	var errBuf strings.Builder
	cmd.Stderr = &errBuf

	if err := cmd.Start(); err != nil {
		return DownloadResult{false, "Error al iniciar descarga", ""}
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if p, ok := ExtractPercent(line); ok {
			if emitProgress != nil {
				emitProgress(id, p)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("downloader: error leyendo stdout: %v", err)
	}

	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return DownloadResult{false, "Descarga cancelada", ""}
		}
		errMsg := errBuf.String()
		if strings.Contains(errMsg, "ExtractorError") || strings.Contains(errMsg, "Unable to extract") || strings.Contains(errMsg, "Sign in to confirm") {
			log.Println("yt-dlp: error de extractor detectado, re-descargando versión de GitHub...")
			_ = ytdlpMgr.ForceRedownload(ctx)
		}
		return DownloadResult{false, fmt.Sprintf("Error: %s", errMsg), ""}
	}

	if emitProgress != nil {
		emitProgress(id, 100.0)
	}
	return DownloadResult{true, "✓ Descarga completada", getBaseDownloadPath(downloadPath)}
}

func getOutputPath(downloadPath string) string {
	if downloadPath != "" {
		return filepath.Join(downloadPath, "%(title)s.%(ext)s")
	}
	return DefaultDownloadPath()
}

func getBaseDownloadPath(downloadPath string) string {
	if downloadPath != "" {
		return downloadPath
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Downloads")
}

// ExtractPercent parsea líneas como: [download]  45.3% of 10.00MiB at 1.23MiB/s ETA 00:05
func ExtractPercent(line string) (float64, bool) {
	if !strings.Contains(line, "[download]") || !strings.Contains(line, "%") {
		return 0, false
	}
	for _, f := range strings.Fields(line) {
		if strings.HasSuffix(f, "%") {
			p, err := strconv.ParseFloat(strings.TrimSuffix(f, "%"), 64)
			if err == nil {
				return p, true
			}
		}
	}
	return 0, false
}

func VideoFormat(quality string) string {
	switch quality {
	case "avanzado":
		return "bestvideo+bestaudio/best"
	case "1080p":
		return "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
	case "720p":
		return "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
	case "480p":
		return "bestvideo[height<=480]+bestaudio/best[height<=480]/best"
	default: // "auto"
		return "bestvideo+bestaudio/best"
	}
}

func AudioQuality(quality string) string {
	switch quality {
	case "avanzado":
		return "0"
	case "media":
		return "5"
	case "baja":
		return "9"
	default: // "alta"
		return "0"
	}
}

func DefaultDownloadPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "%(title)s.%(ext)s"
	}
	return filepath.Join(home, "Downloads", "%(title)s.%(ext)s")
}
