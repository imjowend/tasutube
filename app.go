package main

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type job struct {
	url, format, quality string
	result               chan DownloadResult
}

type App struct {
	ctx  context.Context
	jobs chan job
}

func NewApp() *App {
	a := &App{jobs: make(chan job, 10)}
	for i := 0; i < 3; i++ {
		go a.worker()
	}
	return a
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) worker() {
	for j := range a.jobs {
		j.result <- a.run(j.url, j.format, j.quality)
	}
}

type DownloadResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func (a *App) Download(url string, format string, quality string) DownloadResult {
	if url == "" {
		return DownloadResult{false, "Ingresá una URL"}
	}
	result := make(chan DownloadResult, 1)
	a.jobs <- job{url, format, quality, result}
	return <-result
}

func (a *App) run(url, format, quality string) DownloadResult {
	var args []string

	outputPath := getDownloadPath()

	if format == "mp3" {
		args = []string{
			"--newline",
			"-x", "--audio-format", "mp3", "--audio-quality", audioQuality(quality),
			"-o", outputPath,
			url,
		}
	} else {
		args = []string{
			"--newline",
			"-f", videoFormat(quality), "--merge-output-format", "mp4",
			"-o", outputPath,
			url,
		}
	}

	cmd := exec.Command("yt-dlp", args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return DownloadResult{false, "Error al iniciar descarga"}
	}
	var errBuf strings.Builder
	cmd.Stderr = &errBuf

	if err := cmd.Start(); err != nil {
		return DownloadResult{false, "Error al iniciar descarga"}
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if p, ok := extractPercent(line); ok {
			wailsruntime.EventsEmit(a.ctx, "download:progress", url, p)
		}
	}

	if err := cmd.Wait(); err != nil {
		return DownloadResult{false, fmt.Sprintf("Error: %s", errBuf.String())}
	}

	wailsruntime.EventsEmit(a.ctx, "download:progress", url, 100.0)
	return DownloadResult{true, "✓ Descarga completada, revisá tu carpeta Descargas"}
}

// extractPercent parsea líneas como: [download]  45.3% of 10.00MiB at 1.23MiB/s ETA 00:05
func extractPercent(line string) (float64, bool) {
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

func videoFormat(quality string) string {
	switch quality {
	case "1080p":
		return "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best"
	case "720p":
		return "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best"
	case "480p":
		return "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best"
	default: // "auto"
		return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
	}
}

func audioQuality(quality string) string {
	switch quality {
	case "media":
		return "5"
	case "baja":
		return "9"
	default: // "alta"
		return "0"
	}
}

func getDownloadPath() string {
	if runtime.GOOS == "windows" {
		return "%USERPROFILE%\\Downloads\\%(title)s.%(ext)s"
	}
	return "~/Downloads/%(title)s.%(ext)s"
}
