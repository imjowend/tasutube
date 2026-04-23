package main

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type DownloadResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
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

func (a *App) Download(url string, format string, quality string) DownloadResult {
	if url == "" {
		return DownloadResult{false, "Ingresá una URL"}
	}

	var args []string

	outputPath := getDownloadPath()

	if format == "mp3" {
		args = []string{
			"-x",
			"--audio-format", "mp3",
			"--audio-quality", audioQuality(quality),
			"-o", outputPath,
			url,
		}
	} else {
		args = []string{
			"-f", videoFormat(quality),
			"--merge-output-format", "mp4",
			"-o", outputPath,
			url,
		}
	}

	cmd := exec.Command("yt-dlp", args...)
	output, err := cmd.CombinedOutput()

	if err != nil {
		return DownloadResult{false, fmt.Sprintf("Error: %s", string(output))}
	}

	return DownloadResult{true, "✓ Descarga completada, revisá tu carpeta Descargas"}
}

func getDownloadPath() string {
	if runtime.GOOS == "windows" {
		return "%USERPROFILE%\\Downloads\\%(title)s.%(ext)s"
	}
	return "~/Downloads/%(title)s.%(ext)s"
}
