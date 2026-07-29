//go:build manual

package ytdlp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestManualRealYtdlpDownload es una prueba opt-in para verificar la descarga real de yt-dlp.
// Ejecutar con: go test -v -tags=manual ./internal/ytdlp -run TestManualRealYtdlpDownload
func TestManualRealYtdlpDownload(t *testing.T) {
	tmpDir := t.TempDir()
	targetPath := filepath.Join(tmpDir, "bin", YtdlpBinaryName("linux"))
	downloadURL := "https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + YtdlpAssetName("linux")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	m := NewManagerAt(ctx, targetPath, downloadURL)
	resolvedPath, err := m.Resolve(ctx)
	if err != nil {
		t.Fatalf("Resolve() failed: %v", err)
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		t.Fatalf("os.Stat() failed on resolved path %q: %v", resolvedPath, err)
	}

	if !IsReasonableYtdlpSize(info.Size()) {
		t.Fatalf("Downloaded file size (%d bytes) is below minimum threshold (%d bytes)", info.Size(), YtdlpMinValidSize)
	}
}
