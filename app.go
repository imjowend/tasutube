package main

import (
	"context"

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

func (a *App) emitProgress(url string, percent float64) {
	wailsruntime.EventsEmit(a.ctx, "download:progress", url, percent)
}
