package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"tasutube/internal/autostart"
	"tasutube/internal/downloader"
	"tasutube/internal/opener"
	"tasutube/internal/userpath"
	"tasutube/internal/ytdlp"

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
	ID       int    `json:"id"`
	URL      string `json:"url"`
	Format   string `json:"format"`
	Quality  string `json:"quality"`
	Status   Status `json:"status"`
	Error    string `json:"error,omitempty"`
	FilePath string `json:"filePath,omitempty"`
}

type job struct {
	id                   int
	url, format, quality string
	ctx                  context.Context
}

type App struct {
	ctx          context.Context
	jobs         chan job
	mu           sync.Mutex
	queue        []*DownloadItem
	nextID       int
	cancels      map[int]context.CancelFunc
	downloadPath string
	ytdlp        *ytdlp.Manager
}

func NewApp() *App {
	return newAppWithYtdlp(ytdlp.NewManager())
}

func newAppWithYtdlp(mgr *ytdlp.Manager) *App {
	a := &App{
		jobs:    make(chan job, 10),
		cancels: make(map[int]context.CancelFunc),
		ytdlp:   mgr,
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
		if j.ctx.Err() != nil {
			a.setStatus(j.id, StatusCancelled, "", "")
			continue
		}

		a.setStatus(j.id, StatusDownloading, "", "")
		a.mu.Lock()
		dlPath := a.downloadPath
		a.mu.Unlock()

		result := downloader.RunDownload(j.ctx, j.id, j.url, j.format, j.quality, dlPath, a.ytdlp, a.emitProgress)

		a.mu.Lock()
		delete(a.cancels, j.id)
		a.mu.Unlock()

		if j.ctx.Err() != nil {
			a.setStatus(j.id, StatusCancelled, "", "")
		} else if result.Success {
			a.setStatus(j.id, StatusCompleted, "", result.FilePath)
		} else {
			a.setStatus(j.id, StatusError, result.Message, "")
		}
	}
}

func (a *App) Download(url string, format string, quality string) (int, error) {
	if strings.TrimSpace(url) == "" {
		return 0, fmt.Errorf("la URL está vacía")
	}
	item := a.addItem(url, format, quality)

	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	a.cancels[item.ID] = cancel
	a.mu.Unlock()

	select {
	case a.jobs <- job{item.ID, url, format, quality, ctx}:
		return item.ID, nil
	default:
		// No pudimos encolar: descartamos el ítem para que la UI no muestre
		// una descarga que nunca va a arrancar.
		cancel()
		a.removeItem(item.ID)
		return 0, fmt.Errorf("la cola de descargas está llena, esperá a que terminen algunas descargas")
	}
}

func (a *App) GetDownloadPath() (string, error) {
	a.mu.Lock()
	p := a.downloadPath
	a.mu.Unlock()
	if p != "" {
		return p, nil
	}
	return userpath.DownloadsDir()
}

func (a *App) SetDownloadPath(path string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.downloadPath = path
}

func (a *App) OpenFolder(path string) error {
	target := strings.TrimSpace(path)
	if target == "" {
		defaultPath, err := a.GetDownloadPath()
		if err != nil {
			return err
		}
		target = defaultPath
	}
	return opener.Reveal(target)
}

func (a *App) OpenDownloadedFile(filePath string) error {
	target := strings.TrimSpace(filePath)
	if target == "" {
		return fmt.Errorf("ruta invalida")
	}
	return opener.Open(target)
}

func (a *App) ForceUpdateYtdlp() (string, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	if err := a.ytdlp.ForceRedownload(ctx); err != nil {
		return "", err
	}
	return "✓ yt-dlp fue actualizado a la última versión desde GitHub Releases.", nil
}

func (a *App) GetVideoInfo(url string) (*downloader.VideoMetadata, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return downloader.FetchVideoMetadata(ctx, url, a.ytdlp)
}

func (a *App) SetAutostart(enabled bool) error {
	return autostart.SetEnabled(enabled)
}

func (a *App) IsAutostartEnabled() (bool, error) {
	return autostart.IsEnabled()
}

func (a *App) SetWindowSize(width, height int) {
	wailsruntime.WindowSetSize(a.ctx, width, height)
}

func (a *App) GetWindowSize() map[string]int {
	w, h := wailsruntime.WindowGetSize(a.ctx)
	return map[string]int{"width": w, "height": h}
}

func (a *App) OpenFolderDialog() (string, error) {
	path, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Elegí la carpeta de destino",
	})
	if err != nil {
		return "", fmt.Errorf("no se pudo abrir el selector de carpetas: %w", err)
	}
	return path, nil
}

func (a *App) Cancel(id int) error {
	a.mu.Lock()
	cancel, ok := a.cancels[id]
	a.mu.Unlock()
	if !ok {
		return fmt.Errorf("no hay una descarga activa con id %d", id)
	}
	cancel()
	return nil
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

func (a *App) removeItem(id int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.cancels, id)
	for i, item := range a.queue {
		if item.ID == id {
			a.queue = append(a.queue[:i], a.queue[i+1:]...)
			return
		}
	}
}

func (a *App) setStatus(id int, status Status, errMsg string, filePath string) {
	a.mu.Lock()
	for _, item := range a.queue {
		if item.ID == id {
			item.Status = status
			item.Error = errMsg
			if filePath != "" {
				item.FilePath = filePath
			}
			break
		}
	}
	a.mu.Unlock()
	a.emitStatus(id, status, errMsg, filePath)
}

func (a *App) emitStatus(id int, status Status, errMsg string, filePath string) {
	if a.ctx == nil {
		log.Printf("app: evento download:status descartado (runtime no iniciado): id=%d status=%s err=%q", id, status, errMsg)
		return
	}
	wailsruntime.EventsEmit(a.ctx, "download:status", id, status, errMsg, filePath)
}

func (a *App) emitProgress(id int, percent float64) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, "download:progress", id, percent)
}
