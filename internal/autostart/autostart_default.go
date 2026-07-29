//go:build !windows

package autostart

func SetEnabled(enabled bool) error {
	return nil
}

func IsEnabled() bool {
	return false
}
