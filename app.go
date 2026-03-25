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

func (a *App) Download(url string, format string) DownloadResult {
	if url == "" {
		return DownloadResult{false, "Ingresá una URL"}
	}

	var args []string

	outputPath := getDownloadPath()

	if format == "mp3" {
		args = []string{
			"-x",
			"--audio-format", "mp3",
			"--audio-quality", "0",
			"-o", outputPath,
			url,
		}
	} else {
		args = []string{
			"-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
			"--merge-output-format", "mp4",
			"--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac",
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
