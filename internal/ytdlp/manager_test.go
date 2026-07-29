package ytdlp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestYtdlpAssetName(t *testing.T) {
	tests := []struct {
		goos string
		want string
	}{
		{"windows", "yt-dlp.exe"},
		{"darwin", "yt-dlp_macos"},
		{"linux", "yt-dlp"},
	}

	for _, tt := range tests {
		got := YtdlpAssetName(tt.goos)
		if got != tt.want {
			t.Errorf("YtdlpAssetName(%q) = %q; want %q", tt.goos, got, tt.want)
		}
	}
}

func TestYtdlpBinaryName(t *testing.T) {
	if got := YtdlpBinaryName("windows"); got != "yt-dlp.exe" {
		t.Errorf("YtdlpBinaryName(windows) = %q; want yt-dlp.exe", got)
	}
	if got := YtdlpBinaryName("linux"); got != "yt-dlp" {
		t.Errorf("YtdlpBinaryName(linux) = %q; want yt-dlp", got)
	}
}

func TestYtdlpTargetPath(t *testing.T) {
	got := YtdlpTargetPath("/cache", "linux")
	want := filepath.Join("/cache", "Tasutube", "bin", "yt-dlp")
	if got != want {
		t.Errorf("YtdlpTargetPath() = %q; want %q", got, want)
	}
}

func TestIsReasonableYtdlpSize(t *testing.T) {
	if IsReasonableYtdlpSize(500) {
		t.Errorf("IsReasonableYtdlpSize(500) = true; want false")
	}
	if !IsReasonableYtdlpSize(2 << 20) {
		t.Errorf("IsReasonableYtdlpSize(2MB) = false; want true")
	}
}

func TestDownloadYtdlpSuccess(t *testing.T) {
	payload := make([]byte, YtdlpMinValidSize+100)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payload)
	}))
	defer ts.Close()

	tmpDir := t.TempDir()
	dest := filepath.Join(tmpDir, "bin", "yt-dlp")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := DownloadYtdlp(ctx, ts.URL, dest)
	if err != nil {
		t.Fatalf("DownloadYtdlp() error = %v", err)
	}

	info, err := os.Stat(dest)
	if err != nil {
		t.Fatalf("os.Stat() error = %v", err)
	}
	if info.Size() != int64(len(payload)) {
		t.Errorf("Downloaded size = %d; want %d", info.Size(), len(payload))
	}
}
