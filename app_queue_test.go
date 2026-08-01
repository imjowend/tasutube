package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"tasutube/internal/ytdlp"
	"testing"
	"time"
)

// fakeYtdlp devuelve un Manager que resuelve a un script que reemplaza a yt-dlp.
func fakeYtdlp(t *testing.T, script string) *ytdlp.Manager {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("el script falso de yt-dlp requiere un shell POSIX")
	}

	path := filepath.Join(t.TempDir(), "yt-dlp")
	// La autoactualización en segundo plano invoca el binario con -U.
	body := "#!/bin/sh\nif [ \"$1\" = \"-U\" ]; then exit 0; fi\n" + script
	if err := os.WriteFile(path, []byte(body), 0755); err != nil {
		t.Fatalf("no se pudo escribir el script falso: %v", err)
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(ts.Close)

	return ytdlp.NewManagerAt(context.Background(), path, ts.URL)
}

func newTestApp(t *testing.T, script string) *App {
	t.Helper()
	app := newAppWithYtdlp(fakeYtdlp(t, script))
	app.SetDownloadPath(t.TempDir())
	return app
}

// waitForStatus espera a que el ítem alcance un estado terminal.
func waitForStatus(t *testing.T, app *App, id int, want Status) DownloadItem {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	var last DownloadItem
	for time.Now().Before(deadline) {
		for _, item := range app.GetQueue() {
			if item.ID != id {
				continue
			}
			last = item
			if item.Status == want {
				return item
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("el ítem %d quedó en estado %q; want %q (error: %q)", id, last.Status, want, last.Error)
	return last
}

func TestDownloadRejectsEmptyURL(t *testing.T) {
	app := newTestApp(t, "exit 0\n")

	if id := app.Download("", "mp3", "alta"); id != 0 {
		t.Errorf("Download(\"\") = %d; want 0", id)
	}
	if queue := app.GetQueue(); len(queue) != 0 {
		t.Errorf("cola = %v; want vacía", queue)
	}
}

func TestDownloadCompletes(t *testing.T) {
	app := newTestApp(t, "echo \"[download] 50.0% of 1.00MiB at 1.00MiB/s ETA 00:01\"\nexit 0\n")

	id := app.Download("https://example.com/v", "mp3", "alta")
	item := waitForStatus(t, app, id, StatusCompleted)

	if item.FilePath != app.GetDownloadPath() {
		t.Errorf("FilePath = %q; want %q", item.FilePath, app.GetDownloadPath())
	}
	if item.Error != "" {
		t.Errorf("Error = %q; want \"\"", item.Error)
	}
	if item.URL != "https://example.com/v" || item.Format != "mp3" || item.Quality != "alta" {
		t.Errorf("ítem = %+v; no conserva los datos de la petición", item)
	}
}

func TestDownloadFailureRecordsError(t *testing.T) {
	app := newTestApp(t, "echo 'ERROR: video privado' 1>&2\nexit 1\n")

	id := app.Download("https://example.com/v", "mp4", "720p")
	item := waitForStatus(t, app, id, StatusError)

	if !strings.Contains(item.Error, "video privado") {
		t.Errorf("Error = %q; se esperaba el stderr de yt-dlp", item.Error)
	}
}

func TestCancelStopsDownload(t *testing.T) {
	app := newTestApp(t, "exec sleep 30\n")

	id := app.Download("https://example.com/v", "mp3", "alta")
	waitForStatus(t, app, id, StatusDownloading)

	app.Cancel(id)
	waitForStatus(t, app, id, StatusCancelled)
}

func TestCancelUnknownIDIsNoop(t *testing.T) {
	app := newTestApp(t, "exit 0\n")
	app.Cancel(999) // no debe entrar en pánico
}

func TestQueueAssignsIncrementalIDs(t *testing.T) {
	app := newTestApp(t, "exit 0\n")

	first := app.Download("https://example.com/1", "mp3", "alta")
	second := app.Download("https://example.com/2", "mp3", "alta")

	if first != 1 || second != 2 {
		t.Errorf("ids = (%d, %d); want (1, 2)", first, second)
	}
	if queue := app.GetQueue(); len(queue) != 2 {
		t.Errorf("largo de la cola = %d; want 2", len(queue))
	}
}

func TestGetQueueReturnsCopies(t *testing.T) {
	app := newTestApp(t, "exec sleep 30\n")

	id := app.Download("https://example.com/v", "mp3", "alta")
	queue := app.GetQueue()
	queue[0].URL = "mutado"

	for _, item := range app.GetQueue() {
		if item.ID == id && item.URL != "https://example.com/v" {
			t.Errorf("URL = %q; GetQueue() no debería exponer los ítems internos", item.URL)
		}
	}
	app.Cancel(id)
}

func TestDownloadPathDefaultsToHomeDownloads(t *testing.T) {
	app := newAppWithYtdlp(fakeYtdlp(t, "exit 0\n"))

	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no hay home dir disponible")
	}
	if got, want := app.GetDownloadPath(), filepath.Join(home, "Downloads"); got != want {
		t.Errorf("GetDownloadPath() = %q; want %q", got, want)
	}

	app.SetDownloadPath("/tmp/tasutube-destino")
	if got := app.GetDownloadPath(); got != "/tmp/tasutube-destino" {
		t.Errorf("GetDownloadPath() = %q; want /tmp/tasutube-destino", got)
	}
}

func TestOpenDownloadedFileRejectsEmptyPath(t *testing.T) {
	app := newTestApp(t, "exit 0\n")

	if err := app.OpenDownloadedFile("   "); err == nil {
		t.Fatal("OpenDownloadedFile(\"\") error = nil; want error")
	}
}

func TestSetStatusIgnoresUnknownID(t *testing.T) {
	app := newTestApp(t, "exit 0\n")

	app.setStatus(1234, StatusCompleted, "", "/tmp/x")
	if queue := app.GetQueue(); len(queue) != 0 {
		t.Errorf("cola = %v; want vacía", queue)
	}
}

func TestStartupStoresContext(t *testing.T) {
	app := newTestApp(t, "exit 0\n")

	ctx := context.Background()
	app.startup(ctx)
	if app.ctx != ctx {
		t.Error("startup() no guardó el contexto")
	}
}
