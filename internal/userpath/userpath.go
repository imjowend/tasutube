// Package userpath centraliza las rutas del usuario que usa la app.
package userpath

import (
	"os"
	"path/filepath"
)

// DownloadsDir devuelve la carpeta de descargas del usuario, o "" si no se
// puede determinar el home.
func DownloadsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Downloads")
}
