//go:build windows

package autostart

import (
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
			return err
		}
		cmd := exec.Command("reg", "add", registryKey, "/v", registryValueName, "/t", "REG_SZ", "/d", "\""+exePath+"\" --autostart", "/f")
		hideWindow(cmd)
		return cmd.Run()
	}

	cmd := exec.Command("reg", "delete", registryKey, "/v", registryValueName, "/f")
	hideWindow(cmd)
	_ = cmd.Run()
	return nil
}

func IsEnabled() bool {
	cmd := exec.Command("reg", "query", registryKey, "/v", registryValueName)
	hideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), registryValueName)
}
