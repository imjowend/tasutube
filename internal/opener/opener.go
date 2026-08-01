// Package opener abre archivos y carpetas con el explorador o la aplicación
// predeterminada del sistema operativo.
package opener

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"tasutube/internal/proc"
)

// Open abre target con la aplicación predeterminada del sistema.
func Open(target string) error {
	switch runtime.GOOS {
	case "windows":
		return start(exec.Command("cmd", "/c", "start", "", filepath.Clean(target)))
	case "darwin":
		return exec.Command("open", target).Run()
	default:
		return exec.Command("xdg-open", target).Run()
	}
}

// Reveal muestra target en el explorador de archivos. Si target es un archivo,
// lo selecciona (Windows) o abre la carpeta que lo contiene.
func Reveal(target string) error {
	isFile := func() bool {
		fi, err := os.Stat(target)
		return err == nil && !fi.IsDir()
	}

	switch runtime.GOOS {
	case "windows":
		clean := filepath.Clean(target)
		if isFile() {
			return start(exec.Command("explorer", "/select,", clean))
		}
		return start(exec.Command("explorer", clean))
	case "darwin":
		return exec.Command("open", target).Run()
	default:
		if isFile() {
			target = filepath.Dir(target)
		}
		return exec.Command("xdg-open", target).Run()
	}
}

func start(cmd *exec.Cmd) error {
	proc.HideWindow(cmd)
	return cmd.Start()
}
