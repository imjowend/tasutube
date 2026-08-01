// Package opener abre archivos y carpetas con el explorador o la aplicación
// predeterminada del sistema operativo.
package opener

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"tasutube/internal/proc"
)

// Open abre target con la aplicación predeterminada del sistema.
func Open(target string) error {
	switch runtime.GOOS {
	case "windows":
		return start(exec.Command("cmd", "/c", "start", "", filepath.Clean(target)), target)
	case "darwin":
		return run(exec.Command("open", target), target)
	default:
		return run(exec.Command("xdg-open", target), target)
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
			return start(exec.Command("explorer", "/select,", clean), target)
		}
		return start(exec.Command("explorer", clean), target)
	case "darwin":
		return run(exec.Command("open", target), target)
	default:
		if isFile() {
			target = filepath.Dir(target)
		}
		return run(exec.Command("xdg-open", target), target)
	}
}

// start lanza el explorador del sistema sin esperar a que termine, devolviendo
// un error con contexto si el proceso no pudo arrancar.
func start(cmd *exec.Cmd, target string) error {
	proc.HideWindow(cmd)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("no se pudo abrir %q: %w", target, err)
	}
	return nil
}

// run ejecuta el comando y devuelve un error que incluye su salida de error.
func run(cmd *exec.Cmd, target string) error {
	var errBuf strings.Builder
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		if detail := strings.TrimSpace(errBuf.String()); detail != "" {
			return fmt.Errorf("no se pudo abrir %q: %w: %s", target, err, detail)
		}
		return fmt.Errorf("no se pudo abrir %q: %w", target, err)
	}
	return nil
}
