//go:build windows

package autostart

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

const registryKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
const registryValueName = "Tasutube"

// hideWindow prevents console flashing on Windows
func hideWindow(cmd *exec.Cmd) {
	// Implemented at package level if needed
}

func SetEnabled(enabled bool) error {
	if enabled {
		exePath, err := os.Executable()
		if err != nil {
			return fmt.Errorf("no se pudo determinar la ruta del ejecutable: %w", err)
		}
		cmd := exec.Command("reg", "add", registryKey, "/v", registryValueName, "/t", "REG_SZ", "/d", "\""+exePath+"\" --autostart", "/f")
		hideWindow(cmd)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("no se pudo activar el inicio automático: %w: %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}

	// Borrar una entrada que no existe no es un fallo real.
	present, err := IsEnabled()
	if err != nil {
		return err
	}
	if !present {
		return nil
	}

	cmd := exec.Command("reg", "delete", registryKey, "/v", registryValueName, "/f")
	hideWindow(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("no se pudo desactivar el inicio automático: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func IsEnabled() (bool, error) {
	cmd := exec.Command("reg", "query", registryKey, "/v", registryValueName)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		// reg query sale con código != 0 cuando el valor no existe: eso es "desactivado", no un error.
		if errors.As(err, &exitErr) {
			return false, nil
		}
		return false, fmt.Errorf("no se pudo consultar el inicio automático: %w", err)
	}
	return strings.Contains(string(out), registryValueName), nil
}
