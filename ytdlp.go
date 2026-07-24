package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// ytdlpMinValidSize es el tamaño mínimo (bytes) que se considera una
// descarga válida de yt-dlp. Por debajo de esto asumimos una descarga
// corrupta o una página de error HTML servida en lugar del binario.
const ytdlpMinValidSize = 1 << 20 // 1MB

func ytdlpAssetName(goos string) string {
	switch goos {
	case "windows":
		return "yt-dlp.exe"
	case "darwin":
		return "yt-dlp_macos"
	default:
		return "yt-dlp"
	}
}

func ytdlpBinaryName(goos string) string {
	if goos == "windows" {
		return "yt-dlp.exe"
	}
	return "yt-dlp"
}

func ytdlpTargetPath(cacheDir, goos string) string {
	return filepath.Join(cacheDir, "Tasutube", "bin", ytdlpBinaryName(goos))
}

func isReasonableYtdlpSize(n int64) bool {
	return n >= ytdlpMinValidSize
}

func downloadYtdlp(ctx context.Context, url, destPath string) error {
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return fmt.Errorf("no se pudo crear el directorio destino: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 3 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("descarga de yt-dlp falló con status %d", resp.StatusCode)
	}

	tmpPath := destPath + ".tmp"
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		return err
	}

	written, copyErr := io.Copy(tmpFile, resp.Body)
	closeErr := tmpFile.Close()
	if copyErr != nil {
		os.Remove(tmpPath)
		return copyErr
	}
	if closeErr != nil {
		os.Remove(tmpPath)
		return closeErr
	}

	if !isReasonableYtdlpSize(written) {
		os.Remove(tmpPath)
		return fmt.Errorf("descarga de yt-dlp incompleta (%d bytes)", written)
	}

	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		return err
	}

	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		return err
	}

	return nil
}

func selfUpdateYtdlp(ctx context.Context, path string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, "-U")
	hideWindow(cmd)
	return cmd.Run()
}

type ytdlpManager struct {
	path  string
	err   error
	ready chan struct{}
}

func newYtdlpManagerAt(ctx context.Context, targetPath, downloadURL string) *ytdlpManager {
	m := &ytdlpManager{ready: make(chan struct{})}

	if _, err := os.Stat(targetPath); err == nil {
		m.path = targetPath
		close(m.ready)

		go func() {
			if updateErr := selfUpdateYtdlp(context.Background(), targetPath); updateErr != nil {
				log.Printf("yt-dlp: no se pudo autoactualizar, se sigue usando la version existente: %v", updateErr)
			}
		}()

		return m
	}

	go func() {
		if downloadErr := downloadYtdlp(ctx, downloadURL, targetPath); downloadErr != nil {
			m.err = fmt.Errorf("no se pudo descargar yt-dlp: %w", downloadErr)
		} else {
			m.path = targetPath
		}
		close(m.ready)
	}()

	return m
}

func (m *ytdlpManager) resolve(ctx context.Context) (string, error) {
	select {
	case <-m.ready:
		return m.path, m.err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}
