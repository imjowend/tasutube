package ytdlp

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// YtdlpMinValidSize es el tamaño mínimo (bytes) que se considera una
// descarga válida de yt-dlp.
const YtdlpMinValidSize = 1 << 20 // 1MB

func YtdlpAssetName(goos string) string {
	switch goos {
	case "windows":
		return "yt-dlp.exe"
	case "darwin":
		return "yt-dlp_macos"
	default:
		return "yt-dlp"
	}
}

func YtdlpBinaryName(goos string) string {
	if goos == "windows" {
		return "yt-dlp.exe"
	}
	return "yt-dlp"
}

func YtdlpTargetPath(cacheDir, goos string) string {
	return filepath.Join(cacheDir, "Tasutube", "bin", YtdlpBinaryName(goos))
}

func IsReasonableYtdlpSize(n int64) bool {
	return n >= YtdlpMinValidSize
}

func DownloadYtdlp(ctx context.Context, url, destPath string) error {
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

	if !IsReasonableYtdlpSize(written) {
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

func SelfUpdateYtdlp(ctx context.Context, path string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, "-U")
	return cmd.Run()
}

type Manager struct {
	mu          sync.Mutex
	path        string
	targetPath  string
	downloadURL string
	err         error
	ready       chan struct{}
}

func NewManagerAt(ctx context.Context, targetPath, downloadURL string) *Manager {
	m := &Manager{
		targetPath:  targetPath,
		downloadURL: downloadURL,
		ready:       make(chan struct{}),
	}

	info, err := os.Stat(targetPath)
	if err == nil {
		m.path = targetPath
		close(m.ready)

		go func() {
			if time.Since(info.ModTime()) > 7*24*time.Hour {
				log.Println("yt-dlp: binario con más de 7 días, actualizando desde GitHub Releases...")
				if dlErr := DownloadYtdlp(context.Background(), downloadURL, targetPath); dlErr != nil {
					log.Printf("yt-dlp: error al actualizar desde GitHub Releases: %v", dlErr)
				}
			} else {
				if updateErr := SelfUpdateYtdlp(context.Background(), targetPath); updateErr != nil {
					log.Printf("yt-dlp: no se pudo autoactualizar via -U, intentando descarga directa: %v", updateErr)
					_ = DownloadYtdlp(context.Background(), downloadURL, targetPath)
				}
			}
		}()

		return m
	}

	go func() {
		if downloadErr := DownloadYtdlp(ctx, downloadURL, targetPath); downloadErr != nil {
			m.err = fmt.Errorf("no se pudo descargar yt-dlp: %w", downloadErr)
		} else {
			m.path = targetPath
		}
		close(m.ready)
	}()

	return m
}

func (m *Manager) Resolve(ctx context.Context) (string, error) {
	select {
	case <-m.ready:
		m.mu.Lock()
		defer m.mu.Unlock()
		return m.path, m.err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

func (m *Manager) ForceRedownload(ctx context.Context) error {
	m.mu.Lock()
	targetPath := m.targetPath
	downloadURL := m.downloadURL
	m.mu.Unlock()

	if targetPath == "" || downloadURL == "" {
		cacheDir, err := os.UserCacheDir()
		if err != nil {
			return fmt.Errorf("no se pudo determinar directorio de cache: %w", err)
		}
		targetPath = YtdlpTargetPath(cacheDir, runtime.GOOS)
		downloadURL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + YtdlpAssetName(runtime.GOOS)
	}

	if err := DownloadYtdlp(ctx, downloadURL, targetPath); err != nil {
		return fmt.Errorf("error al actualizar yt-dlp desde GitHub: %w", err)
	}

	m.mu.Lock()
	m.path = targetPath
	m.err = nil
	m.mu.Unlock()

	return nil
}

func NewManager() *Manager {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		m := &Manager{ready: make(chan struct{})}
		m.err = fmt.Errorf("no se pudo determinar el directorio de cache: %w", err)
		close(m.ready)
		return m
	}

	targetPath := YtdlpTargetPath(cacheDir, runtime.GOOS)
	downloadURL := "https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + YtdlpAssetName(runtime.GOOS)

	return NewManagerAt(context.Background(), targetPath, downloadURL)
}
