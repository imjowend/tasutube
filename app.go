package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"tasutube/internal/autostart"
	"tasutube/internal/downloader"
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
	a := &App{
		jobs:    make(chan job, 10),
		cancels: make(map[int]context.CancelFunc),
		ytdlp:   ytdlp.NewManager(),
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

func (a *App) Download(url string, format string, quality string) int {
	safeURL, err := downloader.ValidateURL(url)
	if err != nil {
		return 0
	}
	url = safeURL
	item := a.addItem(url, format, quality)

	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	a.cancels[item.ID] = cancel
	a.mu.Unlock()

	a.jobs <- job{item.ID, url, format, quality, ctx}
	return item.ID
}

func (a *App) GetDownloadPath() string {
	a.mu.Lock()
	p := a.downloadPath
	a.mu.Unlock()
	if p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Downloads")
}

func (a *App) SetDownloadPath(path string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.downloadPath = path
}

func (a *App) OpenFolder(path string) error {
	target := strings.TrimSpace(path)
	if target == "" {
		target = a.GetDownloadPath()
	}

	switch runtime.GOOS {
	case "windows":
		target = filepath.Clean(target)
		fi, err := os.Stat(target)
		var cmd *exec.Cmd
		if err == nil && !fi.IsDir() {
			cmd = exec.Command("explorer", "/select,", target)
		} else {
			cmd = exec.Command("explorer", target)
		}
		downloader.HideWindow(cmd)
		return cmd.Start()
	case "darwin":
		cmd := exec.Command("open", target)
		return cmd.Run()
	default:
		fi, err := os.Stat(target)
		if err == nil && !fi.IsDir() {
			target = filepath.Dir(target)
		}
		cmd := exec.Command("xdg-open", target)
		return cmd.Run()
	}
}

func (a *App) OpenDownloadedFile(filePath string) error {
	target := strings.TrimSpace(filePath)
	if target == "" {
		return fmt.Errorf("ruta invalida")
	}

	fi, err := os.Stat(target)
	if err != nil || fi.IsDir() {
		return fmt.Errorf("ruta invalida")
	}

	switch runtime.GOOS {
	case "windows":
		target = filepath.Clean(target)
		cmd := exec.Command("cmd", "/c", "start", "", target)
		downloader.HideWindow(cmd)
		return cmd.Start()
	case "darwin":
		cmd := exec.Command("open", target)
		return cmd.Run()
	default:
		cmd := exec.Command("xdg-open", target)
		return cmd.Run()
	}
}

func (a *App) ForceUpdateYtdlp() (string, error) {
	if err := a.ytdlp.ForceRedownload(a.ctx); err != nil {
		return "", err
	}
	return "✓ yt-dlp fue actualizado a la última versión desde GitHub Releases.", nil
}

func (a *App) GetVideoInfo(url string) (*downloader.VideoMetadata, error) {
	return downloader.FetchVideoMetadata(a.ctx, url, a.ytdlp)
}

func (a *App) SetAutostart(enabled bool) error {
	return autostart.SetEnabled(enabled)
}

func (a *App) IsAutostartEnabled() bool {
	return autostart.IsEnabled()
}

func (a *App) SetWindowSize(width, height int) {
	wailsruntime.WindowSetSize(a.ctx, width, height)
}

func (a *App) GetWindowSize() map[string]int {
	w, h := wailsruntime.WindowGetSize(a.ctx)
	return map[string]int{"width": w, "height": h}
}

func (a *App) OpenFolderDialog() string {
	path, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Elegí la carpeta de destino",
	})
	if err != nil {
		return ""
	}
	return path
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
	wailsruntime.EventsEmit(a.ctx, "download:status", id, status, errMsg, filePath)
}

func (a *App) emitProgress(id int, percent float64) {
	wailsruntime.EventsEmit(a.ctx, "download:progress", id, percent)
}
