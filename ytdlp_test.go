package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestYtdlpAssetName(t *testing.T) {
	cases := []struct {
		goos string
		want string
	}{
		{"windows", "yt-dlp.exe"},
		{"darwin", "yt-dlp_macos"},
		{"linux", "yt-dlp"},
	}
	for _, c := range cases {
		if got := ytdlpAssetName(c.goos); got != c.want {
			t.Errorf("ytdlpAssetName(%q) = %q, want %q", c.goos, got, c.want)
		}
	}
}

func TestYtdlpBinaryName(t *testing.T) {
	cases := []struct {
		goos string
		want string
	}{
		{"windows", "yt-dlp.exe"},
		{"darwin", "yt-dlp"},
		{"linux", "yt-dlp"},
	}
	for _, c := range cases {
		if got := ytdlpBinaryName(c.goos); got != c.want {
			t.Errorf("ytdlpBinaryName(%q) = %q, want %q", c.goos, got, c.want)
		}
	}
}

func TestYtdlpTargetPath(t *testing.T) {
	got := ytdlpTargetPath("/home/user/.cache", "linux")
	want := "/home/user/.cache/Tasutube/bin/yt-dlp"
	if got != want {
		t.Errorf("ytdlpTargetPath() = %q, want %q", got, want)
	}

	// filepath.Join usa el separador del SO donde corre el test, así que para
	// el caso "windows" no podemos afirmar barras invertidas literales desde
	// una corrida en macOS/Linux. Solo verificamos el mapeo de nombre/carpeta.
	winPath := ytdlpTargetPath("C:/Users/papa/AppData/Local", "windows")
	if len(winPath) < len("yt-dlp.exe") || winPath[len(winPath)-len("yt-dlp.exe"):] != "yt-dlp.exe" {
		t.Errorf("ytdlpTargetPath() para windows = %q, esperaba que terminara en yt-dlp.exe", winPath)
	}
}

func TestIsReasonableYtdlpSize(t *testing.T) {
	cases := []struct {
		name string
		size int64
		want bool
	}{
		{"archivo vacío", 0, false},
		{"tamaño de página de error", 50 * 1024, false},
		{"tamaño de binario real", 20 * 1024 * 1024, true},
		{"justo en el umbral", ytdlpMinValidSize, true},
		{"justo debajo del umbral", ytdlpMinValidSize - 1, false},
	}
	for _, c := range cases {
		if got := isReasonableYtdlpSize(c.size); got != c.want {
			t.Errorf("%s: isReasonableYtdlpSize(%d) = %v, want %v", c.name, c.size, got, c.want)
		}
	}
}

func TestDownloadYtdlp_Success(t *testing.T) {
	body := bytes.Repeat([]byte("a"), 2*1024*1024) // 2MB, por encima del umbral
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(body)
	}))
	defer server.Close()

	destPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	if err := downloadYtdlp(context.Background(), server.URL, destPath); err != nil {
		t.Fatalf("downloadYtdlp() error = %v", err)
	}

	info, err := os.Stat(destPath)
	if err != nil {
		t.Fatalf("esperaba archivo en %q, stat error: %v", destPath, err)
	}
	if info.Size() != int64(len(body)) {
		t.Errorf("tamaño del archivo = %d, want %d", info.Size(), len(body))
	}
	if info.Mode().Perm()&0111 == 0 {
		t.Errorf("esperaba que el archivo fuera ejecutable, mode = %v", info.Mode())
	}
	if _, err := os.Stat(destPath + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("esperaba que el archivo temporal se limpiara")
	}
}

func TestDownloadYtdlp_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	destPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	if err := downloadYtdlp(context.Background(), server.URL, destPath); err == nil {
		t.Fatal("esperaba error para respuesta 404")
	}
	if _, statErr := os.Stat(destPath); !os.IsNotExist(statErr) {
		t.Errorf("esperaba que no se creara ningún archivo si falla la descarga")
	}
}

func TestDownloadYtdlp_TooSmall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not found"))
	}))
	defer server.Close()

	destPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	if err := downloadYtdlp(context.Background(), server.URL, destPath); err == nil {
		t.Fatal("esperaba error para respuesta más chica que el umbral")
	}
	if _, statErr := os.Stat(destPath); !os.IsNotExist(statErr) {
		t.Errorf("esperaba que no quedara archivo para una descarga muy chica")
	}
	if _, statErr := os.Stat(destPath + ".tmp"); !os.IsNotExist(statErr) {
		t.Errorf("esperaba que el archivo temporal se limpiara")
	}
}
