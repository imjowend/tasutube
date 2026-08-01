package downloader

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"tasutube/internal/proc"
	"tasutube/internal/ytdlp"
	"testing"
	"time"
)

// fakeYtdlp escribe un script ejecutable que reemplaza a yt-dlp y devuelve un
// Manager que resuelve a ese script.
func fakeYtdlp(t *testing.T, script string) *ytdlp.Manager {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("el script falso de yt-dlp requiere un shell POSIX")
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "yt-dlp")
	// La autoactualización en segundo plano invoca el binario con -U; se responde
	// de inmediato para que no interfiera con lo que verifica cada test.
	body := "#!/bin/sh\nif [ \"$1\" = \"-U\" ]; then exit 0; fi\n" + script
	if err := os.WriteFile(path, []byte(body), 0755); err != nil {
		t.Fatalf("no se pudo escribir el script falso: %v", err)
	}

	// El servidor cubre la actualización en segundo plano que dispara NewManagerAt.
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(ts.Close)

	return ytdlp.NewManagerAt(context.Background(), path, ts.URL)
}

// unresolvableYtdlp devuelve un Manager cuya descarga siempre falla.
func unresolvableYtdlp(t *testing.T) *ytdlp.Manager {
	t.Helper()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(ts.Close)

	m := ytdlp.NewManagerAt(context.Background(), filepath.Join(t.TempDir(), "yt-dlp"), ts.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := m.Resolve(ctx); err == nil {
		t.Fatalf("Resolve() error = nil; se esperaba un fallo de descarga")
	}
	return m
}

type recordedProgress struct {
	mu     sync.Mutex
	values []float64
}

func (r *recordedProgress) emit(_ int, percent float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.values = append(r.values, percent)
}

func (r *recordedProgress) snapshot() []float64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]float64(nil), r.values...)
}

func TestRunDownloadSuccessEmitsProgress(t *testing.T) {
	mgr := fakeYtdlp(t, `
echo "[youtube] Extracting URL: https://example.com"
echo "[download]  10.0% of 1.00MiB at 1.00MiB/s ETA 00:01"
echo "[download]  55.5% of 1.00MiB at 1.00MiB/s ETA 00:01"
exit 0
`)

	dest := t.TempDir()
	prog := &recordedProgress{}

	result := RunDownload(context.Background(), 7, "https://example.com/v", "mp3", "alta", dest, mgr, prog.emit)

	if !result.Success {
		t.Fatalf("RunDownload() success = false, message = %q", result.Message)
	}
	if result.FilePath != dest {
		t.Errorf("FilePath = %q; want %q", result.FilePath, dest)
	}

	got := prog.snapshot()
	want := []float64{10.0, 55.5, 100.0}
	if len(got) != len(want) {
		t.Fatalf("progreso = %v; want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("progreso[%d] = %v; want %v", i, got[i], want[i])
		}
	}
}

func TestRunDownloadNilEmitterIsAllowed(t *testing.T) {
	mgr := fakeYtdlp(t, `
echo "[download]  42.0% of 1.00MiB at 1.00MiB/s ETA 00:01"
exit 0
`)

	result := RunDownload(context.Background(), 1, "https://example.com/v", "mp4", "720p", t.TempDir(), mgr, nil)
	if !result.Success {
		t.Fatalf("RunDownload() success = false, message = %q", result.Message)
	}
}

func TestRunDownloadPassesFormatArgs(t *testing.T) {
	argsFile := filepath.Join(t.TempDir(), "args.txt")
	mgr := fakeYtdlp(t, fmt.Sprintf("printf '%%s\\n' \"$@\" > %s\nexit 0\n", argsFile))

	dest := t.TempDir()

	t.Run("mp3", func(t *testing.T) {
		if !RunDownload(context.Background(), 1, "https://example.com/a", "mp3", "baja", dest, mgr, nil).Success {
			t.Fatal("RunDownload() success = false")
		}
		args := readLines(t, argsFile)
		assertContains(t, args, "--audio-format", "mp3", "--audio-quality", AudioQuality("baja"))
		assertContains(t, args, filepath.Join(dest, "%(title)s.%(ext)s"), "https://example.com/a")
	})

	t.Run("mp4", func(t *testing.T) {
		if !RunDownload(context.Background(), 2, "https://example.com/b", "mp4", "1080p", dest, mgr, nil).Success {
			t.Fatal("RunDownload() success = false")
		}
		args := readLines(t, argsFile)
		assertContains(t, args, "--merge-output-format", "mp4", VideoFormat("1080p"))
	})
}

func TestRunDownloadCommandFailure(t *testing.T) {
	mgr := fakeYtdlp(t, `
echo "ERROR: video no disponible" 1>&2
exit 1
`)

	result := RunDownload(context.Background(), 1, "https://example.com/v", "mp3", "alta", t.TempDir(), mgr, nil)
	if result.Success {
		t.Fatal("RunDownload() success = true; want false")
	}
	if !strings.Contains(result.Message, "video no disponible") {
		t.Errorf("Message = %q; se esperaba el stderr de yt-dlp", result.Message)
	}
}

func TestRunDownloadCancelledContext(t *testing.T) {
	// exec para que el proceso que sostiene el pipe sea el que recibe el kill.
	mgr := fakeYtdlp(t, "exec sleep 30\n")

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(200 * time.Millisecond)
		cancel()
	}()
	defer cancel()

	result := RunDownload(ctx, 1, "https://example.com/v", "mp3", "alta", t.TempDir(), mgr, nil)
	if result.Success {
		t.Fatal("RunDownload() success = true; want false")
	}
	if result.Message != "Descarga cancelada" {
		t.Errorf("Message = %q; want \"Descarga cancelada\"", result.Message)
	}
}

func TestRunDownloadUnavailableYtdlp(t *testing.T) {
	result := RunDownload(context.Background(), 1, "https://example.com/v", "mp3", "alta", t.TempDir(), unresolvableYtdlp(t), nil)
	if result.Success {
		t.Fatal("RunDownload() success = true; want false")
	}
	if !strings.Contains(result.Message, "yt-dlp") {
		t.Errorf("Message = %q; se esperaba un error de preparación de yt-dlp", result.Message)
	}
}

func TestFetchVideoMetadata(t *testing.T) {
	mgr := fakeYtdlp(t, `
cat <<'JSON'
{
  "title": "Un video",
  "thumbnail": "https://img.example.com/t.jpg",
  "duration": 212.5,
  "formats": [
    {"height": 720, "abr": 128, "acodec": "opus", "asr": 48000},
    {"height": 1080, "abr": 96, "acodec": "none", "asr": 44100},
    {"height": 0, "abr": 160, "acodec": "mp4a.40.2", "asr": 44100}
  ]
}
JSON
exit 0
`)

	meta, err := FetchVideoMetadata(context.Background(), uniqueURL(t), mgr)
	if err != nil {
		t.Fatalf("FetchVideoMetadata() error = %v", err)
	}
	if meta.Title != "Un video" || meta.Thumbnail != "https://img.example.com/t.jpg" || meta.Duration != 212.5 {
		t.Errorf("metadata basica = %+v", meta)
	}
	if meta.MaxHeight != 1080 {
		t.Errorf("MaxHeight = %d; want 1080", meta.MaxHeight)
	}
	if meta.MaxAudioBitrate != 160 {
		t.Errorf("MaxAudioBitrate = %d; want 160", meta.MaxAudioBitrate)
	}
	if meta.SampleRate != 48000 {
		t.Errorf("SampleRate = %d; want 48000", meta.SampleRate)
	}
	if meta.AudioCodec != "mp4a.40.2" {
		t.Errorf("AudioCodec = %q; want mp4a.40.2", meta.AudioCodec)
	}
	wantRes := []int{1080, 720, 480, 360, 240, 144}
	if len(meta.AvailableRes) != len(wantRes) {
		t.Fatalf("AvailableRes = %v; want %v", meta.AvailableRes, wantRes)
	}
	for i := range wantRes {
		if meta.AvailableRes[i] != wantRes[i] {
			t.Fatalf("AvailableRes = %v; want %v", meta.AvailableRes, wantRes)
		}
	}
}

func TestFetchVideoMetadataUsesCache(t *testing.T) {
	counter := filepath.Join(t.TempDir(), "calls.txt")
	mgr := fakeYtdlp(t, fmt.Sprintf("echo x >> %s\necho '{\"title\":\"cacheado\"}'\n", counter))

	url := uniqueURL(t)
	for i := 0; i < 2; i++ {
		meta, err := FetchVideoMetadata(context.Background(), url, mgr)
		if err != nil {
			t.Fatalf("FetchVideoMetadata() error = %v", err)
		}
		if meta.Title != "cacheado" {
			t.Fatalf("Title = %q; want cacheado", meta.Title)
		}
	}

	if calls := len(readLines(t, counter)); calls != 1 {
		t.Errorf("yt-dlp fue invocado %d veces; want 1 (el resto desde cache)", calls)
	}
}

func TestFetchVideoMetadataInvalidJSON(t *testing.T) {
	mgr := fakeYtdlp(t, "echo 'no soy json'\nexit 0\n")

	if _, err := FetchVideoMetadata(context.Background(), "https://example.com/meta-bad", mgr); err == nil {
		t.Fatal("FetchVideoMetadata() error = nil; want error de parseo")
	}
}

func TestFetchVideoMetadataUnavailableYtdlp(t *testing.T) {
	_, err := FetchVideoMetadata(context.Background(), "https://example.com/meta-no-ytdlp", unresolvableYtdlp(t))
	if err == nil {
		t.Fatal("FetchVideoMetadata() error = nil; want error")
	}
	if !strings.Contains(err.Error(), "yt-dlp") {
		t.Errorf("error = %v; se esperaba un error de preparación de yt-dlp", err)
	}
}

func TestGetOutputPath(t *testing.T) {
	if got, want := getOutputPath("/tmp/dl"), filepath.Join("/tmp/dl", "%(title)s.%(ext)s"); got != want {
		t.Errorf("getOutputPath(/tmp/dl) = %q; want %q", got, want)
	}
	if got, want := getOutputPath(""), DefaultDownloadPath(); got != want {
		t.Errorf("getOutputPath(\"\") = %q; want %q", got, want)
	}
}

func TestGetBaseDownloadPath(t *testing.T) {
	if got := getBaseDownloadPath("/tmp/dl"); got != "/tmp/dl" {
		t.Errorf("getBaseDownloadPath(/tmp/dl) = %q; want /tmp/dl", got)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no hay home dir disponible")
	}
	if got, want := getBaseDownloadPath(""), filepath.Join(home, "Downloads"); got != want {
		t.Errorf("getBaseDownloadPath(\"\") = %q; want %q", got, want)
	}
}

func TestHideWindowDoesNotBreakCommand(t *testing.T) {
	cmd := exec.Command("echo", "hola")
	proc.HideWindow(cmd)
	if err := cmd.Run(); err != nil {
		t.Errorf("Run() error = %v; HideWindow no debería alterar el comando", err)
	}
}

// uniqueURL evita colisiones con el cache global de metadata entre ejecuciones.
func uniqueURL(t *testing.T) string {
	t.Helper()
	return fmt.Sprintf("https://example.com/%s-%d", t.Name(), time.Now().UnixNano())
}

func readLines(t *testing.T, path string) []string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("no se pudo leer %q: %v", path, err)
	}
	var lines []string
	for _, line := range strings.Split(string(data), "\n") {
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func assertContains(t *testing.T, haystack []string, needles ...string) {
	t.Helper()
	for _, needle := range needles {
		found := false
		for _, item := range haystack {
			if item == needle {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("args %v no contienen %q", haystack, needle)
		}
	}
}
