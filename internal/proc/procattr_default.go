//go:build !windows

package proc

import "os/exec"

func HideWindow(cmd *exec.Cmd) {}
