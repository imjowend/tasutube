//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// hideWindow prevents the yt-dlp subprocess from flashing a console window
// on screen when launched from the Wails GUI process.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
