package ytdlp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

func validPayload() []byte {
	return make([]byte, YtdlpMinValidSize+16)
}

// serveBinary devuelve la URL de un servidor que responde con un binario válido
// y un contador de peticiones recibidas.
func serveBinary(t *testing.T) (string, *atomic.Int64) {
	t.Helper()
	var hits atomic.Int64
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write(validPayload())
	}))
	t.Cleanup(ts.Close)
	return ts.URL, &hits
}

func serveStatus(t *testing.T, status int) string {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
	}))
	t.Cleanup(ts.Close)
	return ts.URL
}

// writeExecutable crea un ejecutable de mentira que acepta cualquier argumento.
func writeExecutable(t *testing.T, path, body string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("el ejecutable falso requiere un shell POSIX")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0755); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func TestDownloadYtdlpRejectsShortPayload(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("truncado"))
	}))
	defer ts.Close()

	dest := filepath.Join(t.TempDir(), "yt-dlp")
	if err := DownloadYtdlp(context.Background(), ts.URL, dest); err == nil {
		t.Fatal("DownloadYtdlp() error = nil; want error por descarga incompleta")
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Errorf("el destino no debería existir tras una descarga incompleta (err = %v)", err)
	}
	if _, err := os.Stat(dest + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("el archivo temporal debería borrarse (err = %v)", err)
	}
}

func TestDownloadYtdlpNonOKStatus(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "yt-dlp")
	if err := DownloadYtdlp(context.Background(), serveStatus(t, http.StatusNotFound), dest); err == nil {
		t.Fatal("DownloadYtdlp() error = nil; want error por status 404")
	}
}

func TestDownloadYtdlpUnreachableHost(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := ts.URL
	ts.Close() // el servidor ya no acepta conexiones

	dest := filepath.Join(t.TempDir(), "yt-dlp")
	if err := DownloadYtdlp(context.Background(), url, dest); err == nil {
		t.Fatal("DownloadYtdlp() error = nil; want error de conexión")
	}
}

func TestDownloadYtdlpInvalidURL(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "yt-dlp")
	if err := DownloadYtdlp(context.Background(), "://no-es-una-url", dest); err == nil {
		t.Fatal("DownloadYtdlp() error = nil; want error de request inválido")
	}
}

func TestDownloadYtdlpSetsExecutableBit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("los permisos POSIX no aplican en Windows")
	}
	url, _ := serveBinary(t)
	dest := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	if err := DownloadYtdlp(context.Background(), url, dest); err != nil {
		t.Fatalf("DownloadYtdlp() error = %v", err)
	}
	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if info.Mode().Perm()&0111 == 0 {
		t.Errorf("permisos = %v; el binario debería ser ejecutable", info.Mode().Perm())
	}
}

func TestSelfUpdateYtdlp(t *testing.T) {
	dir := t.TempDir()

	ok := filepath.Join(dir, "ok")
	writeExecutable(t, ok, "exit 0\n")
	if err := SelfUpdateYtdlp(context.Background(), ok); err != nil {
		t.Errorf("SelfUpdateYtdlp() error = %v; want nil", err)
	}

	failing := filepath.Join(dir, "failing")
	writeExecutable(t, failing, "exit 3\n")
	if err := SelfUpdateYtdlp(context.Background(), failing); err == nil {
		t.Error("SelfUpdateYtdlp() error = nil; want error")
	}
}

func TestNewManagerAtDownloadsWhenMissing(t *testing.T) {
	url, _ := serveBinary(t)
	target := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	m := NewManagerAt(context.Background(), target, url)
	path, err := m.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if path != target {
		t.Errorf("Resolve() = %q; want %q", path, target)
	}
	if _, err := os.Stat(target); err != nil {
		t.Errorf("el binario debería existir: %v", err)
	}
}

func TestNewManagerAtDownloadFailure(t *testing.T) {
	target := filepath.Join(t.TempDir(), "bin", "yt-dlp")
	m := NewManagerAt(context.Background(), target, serveStatus(t, http.StatusInternalServerError))

	path, err := m.Resolve(context.Background())
	if err == nil {
		t.Fatal("Resolve() error = nil; want error de descarga")
	}
	if path != "" {
		t.Errorf("Resolve() path = %q; want \"\"", path)
	}
}

func TestNewManagerAtUsesExistingBinary(t *testing.T) {
	target := filepath.Join(t.TempDir(), "bin", "yt-dlp")
	writeExecutable(t, target, "exit 0\n")

	url, hits := serveBinary(t)
	m := NewManagerAt(context.Background(), target, url)

	path, err := m.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if path != target {
		t.Errorf("Resolve() = %q; want %q", path, target)
	}

	// La autoactualización en segundo plano tiene éxito, así que no debería
	// bajar el binario desde la URL de releases.
	time.Sleep(500 * time.Millisecond)
	if got := hits.Load(); got != 0 {
		t.Errorf("peticiones de descarga = %d; want 0 cuando -U funciona", got)
	}
}

func TestNewManagerAtRedownloadsStaleBinary(t *testing.T) {
	target := filepath.Join(t.TempDir(), "bin", "yt-dlp")
	writeExecutable(t, target, "exit 0\n")

	old := time.Now().Add(-30 * 24 * time.Hour)
	if err := os.Chtimes(target, old, old); err != nil {
		t.Fatalf("Chtimes() error = %v", err)
	}

	url, _ := serveBinary(t)
	m := NewManagerAt(context.Background(), target, url)
	if _, err := m.Resolve(context.Background()); err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	waitFor(t, 5*time.Second, func() bool {
		info, err := os.Stat(target)
		return err == nil && IsReasonableYtdlpSize(info.Size())
	}, "el binario viejo debería reemplazarse por la descarga")
}

func TestResolveHonoursContextCancellation(t *testing.T) {
	blocked := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-blocked
	}))
	defer ts.Close()
	defer close(blocked)

	m := NewManagerAt(context.Background(), filepath.Join(t.TempDir(), "yt-dlp"), ts.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	if _, err := m.Resolve(ctx); err != context.DeadlineExceeded {
		t.Errorf("Resolve() error = %v; want %v", err, context.DeadlineExceeded)
	}
}

func TestForceRedownload(t *testing.T) {
	url, hits := serveBinary(t)
	target := filepath.Join(t.TempDir(), "bin", "yt-dlp")
	writeExecutable(t, target, "exit 0\n")

	m := NewManagerAt(context.Background(), target, url)
	if err := m.ForceRedownload(context.Background()); err != nil {
		t.Fatalf("ForceRedownload() error = %v", err)
	}
	if hits.Load() == 0 {
		t.Error("ForceRedownload() no descargó el binario")
	}

	path, err := m.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve() error = %v tras ForceRedownload", err)
	}
	if path != target {
		t.Errorf("Resolve() = %q; want %q", path, target)
	}
}

func TestForceRedownloadPropagatesError(t *testing.T) {
	target := filepath.Join(t.TempDir(), "bin", "yt-dlp")
	writeExecutable(t, target, "exit 0\n")

	m := NewManagerAt(context.Background(), target, serveStatus(t, http.StatusForbidden))
	if err := m.ForceRedownload(context.Background()); err == nil {
		t.Fatal("ForceRedownload() error = nil; want error")
	}
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool, msg string) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timeout esperando: %s", msg)
}
