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

	ytdlpPath, err := ytdlpMgr.Resolve(ctx)
	if err != nil {
		return nil, fmt.Errorf("no se pudo preparar yt-dlp: %w", err)
	}

	cmd := exec.CommandContext(ctx, ytdlpPath,
		"-J",
		"--no-playlist",
		"--socket-timeout", "5",
		"--no-warnings",
		url,
	)
	HideWindow(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("no se pudo leer la salida de yt-dlp: %w", err)
	}
	var errBuf strings.Builder
	cmd.Stderr = &errBuf

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("no se pudo ejecutar yt-dlp: %w", err)
	}

	var raw rawYtdlpMeta
	parseErr := json.NewDecoder(stdout).Decode(&raw)
	waitErr := cmd.Wait()

	// El error del proceso explica mejor el fallo que el error de parseo:
	// cuando yt-dlp falla, stdout viene vacío y el JSON nunca llega.
	if waitErr != nil {
		return nil, fmt.Errorf("yt-dlp no pudo obtener los datos del video: %w%s", waitErr, formatStderr(errBuf.String()))
	}
	if parseErr != nil {
		return nil, fmt.Errorf("error al procesar datos del video: %w%s", parseErr, formatStderr(errBuf.String()))
	}

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

// formatStderr devuelve la salida de error del proceso lista para adjuntar a
// un mensaje de error, o una cadena vacía si el proceso no escribió nada.
func formatStderr(stderr string) string {
	trimmed := strings.TrimSpace(stderr)
	if trimmed == "" {
		return ""
	}
	return ": " + trimmed
}

type ProgressEmitter func(id int, percent float64)

func RunDownload(ctx context.Context, id int, url, format, quality, downloadPath string, ytdlpMgr *ytdlp.Manager, emitProgress ProgressEmitter) DownloadResult {
	var args []string

	outputPath := getOutputPath(downloadPath)

	if format == "mp3" {
		args = []string{
			"--newline",
			"-x", "--audio-format", "mp3", "--audio-quality", AudioQuality(quality),
			"-o", outputPath,
			url,
		}
	} else {
		args = []string{
			"--newline",
			"-f", VideoFormat(quality), "--merge-output-format", "mp4",
			"-o", outputPath,
			url,
		}
	}

	ytdlpPath, err := ytdlpMgr.Resolve(ctx)
	if err != nil {
		log.Printf("downloader: no se pudo resolver yt-dlp: %v", err)
		return DownloadResult{false, fmt.Sprintf("No se pudo preparar yt-dlp (%v). Revisá tu conexión a internet.", err), ""}
	}

	cmd := exec.CommandContext(ctx, ytdlpPath, args...)
	HideWindow(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("downloader: no se pudo abrir stdout de yt-dlp: %v", err)
		return DownloadResult{false, fmt.Sprintf("Error al iniciar descarga: %v", err), ""}
	}
	var errBuf strings.Builder
	cmd.Stderr = &errBuf

	if err := cmd.Start(); err != nil {
		log.Printf("downloader: no se pudo ejecutar yt-dlp: %v", err)
		return DownloadResult{false, fmt.Sprintf("Error al iniciar descarga: %v", err), ""}
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
	scanErr := scanner.Err()
	if scanErr != nil {
		log.Printf("downloader: error leyendo stdout: %v", scanErr)
	}

	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return DownloadResult{false, "Descarga cancelada", ""}
		}
		errMsg := strings.TrimSpace(errBuf.String())
		if strings.Contains(errMsg, "ExtractorError") || strings.Contains(errMsg, "Unable to extract") || strings.Contains(errMsg, "Sign in to confirm") {
			log.Println("yt-dlp: error de extractor detectado, re-descargando versión de GitHub...")
			if redownloadErr := ytdlpMgr.ForceRedownload(ctx); redownloadErr != nil {
				log.Printf("yt-dlp: la re-descarga automática falló: %v", redownloadErr)
			}
		}
		if errMsg == "" {
			errMsg = err.Error()
		}
		return DownloadResult{false, fmt.Sprintf("Error: %s", errMsg), ""}
	}

	// yt-dlp terminó bien pero perdimos parte de su salida: no podemos afirmar
	// que el progreso reportado fue completo.
	if scanErr != nil {
		return DownloadResult{false, fmt.Sprintf("Error al leer el progreso de la descarga: %v", scanErr), ""}
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
		log.Printf("downloader: no se pudo determinar la carpeta del usuario: %v", err)
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
		log.Printf("downloader: no se pudo determinar la carpeta del usuario, se usa el directorio actual: %v", err)
		return "%(title)s.%(ext)s"
	}
	return filepath.Join(home, "Downloads", "%(title)s.%(ext)s")
}
