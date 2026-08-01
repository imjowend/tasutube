// Package userpath centraliza las rutas del usuario que usa la app.
package userpath

import (
	"fmt"
	"os"
	"path/filepath"
)

// DownloadsDir devuelve la carpeta de descargas del usuario.
func DownloadsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("no se pudo determinar la carpeta del usuario: %w", err)
	}
	return filepath.Join(home, "Downloads"), nil
}
