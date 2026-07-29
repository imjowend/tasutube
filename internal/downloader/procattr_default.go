//go:build !windows

package downloader

import "os/exec"

func HideWindow(cmd *exec.Cmd) {}
