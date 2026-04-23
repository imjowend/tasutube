package main

import (
	"context"
	"sync"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Status string

const (
	StatusPending     Status = "pending"
	StatusDownloading Status = "downloading"
	StatusCompleted   Status = "completed"
	StatusCancelled   Status = "cancelled"
	StatusError       Status = "error"
)

type DownloadItem struct {
	ID      int    `json:"id"`
	URL     string `json:"url"`
	Format  string `json:"format"`
	Quality string `json:"quality"`
	Status  Status `json:"status"`
	Error   string `json:"error,omitempty"`
}

type job struct {
	id           int
	url, format, quality string
	ctx          context.Context
	result       chan DownloadResult
}

type App struct {
	ctx     context.Context
	jobs    chan job
	mu      sync.Mutex
	queue   []*DownloadItem
	nextID  int
	cancels map[int]context.CancelFunc
}

func NewApp() *App {
	a := &App{
		jobs:    make(chan job, 10),
		cancels: make(map[int]context.CancelFunc),
	}
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
		// El job pudo haber sido cancelado mientras esperaba en la cola
		if j.ctx.Err() != nil {
			a.setStatus(j.id, StatusCancelled, "")
			j.result <- DownloadResult{false, "Descarga cancelada"}
			continue
		}

		a.setStatus(j.id, StatusDownloading, "")
		result := a.run(j.ctx, j.url, j.format, j.quality)

		a.mu.Lock()
		delete(a.cancels, j.id)
		a.mu.Unlock()

		if j.ctx.Err() != nil {
			a.setStatus(j.id, StatusCancelled, "")
		} else if result.Success {
			a.setStatus(j.id, StatusCompleted, "")
		} else {
			a.setStatus(j.id, StatusError, result.Message)
		}
		j.result <- result
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
	item := a.addItem(url, format, quality)

	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	a.cancels[item.ID] = cancel
	a.mu.Unlock()

	result := make(chan DownloadResult, 1)
	a.jobs <- job{item.ID, url, format, quality, ctx, result}
	return <-result
}

func (a *App) Cancel(id int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if cancel, ok := a.cancels[id]; ok {
		cancel()
	}
}

func (a *App) GetQueue() []DownloadItem {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]DownloadItem, len(a.queue))
	for i, item := range a.queue {
		out[i] = *item
	}
	return out
}

func (a *App) addItem(url, format, quality string) *DownloadItem {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.nextID++
	item := &DownloadItem{
		ID:      a.nextID,
		URL:     url,
		Format:  format,
		Quality: quality,
		Status:  StatusPending,
	}
	a.queue = append(a.queue, item)
	return item
}

func (a *App) setStatus(id int, status Status, errMsg string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, item := range a.queue {
		if item.ID == id {
			item.Status = status
			item.Error = errMsg
			return
		}
	}
}

func (a *App) emitProgress(url string, percent float64) {
	wailsruntime.EventsEmit(a.ctx, "download:progress", url, percent)
}
