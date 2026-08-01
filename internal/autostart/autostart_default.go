//go:build !windows

package autostart

import "errors"

// ErrUnsupported indica que el inicio automático no está implementado en esta plataforma.
var ErrUnsupported = errors.New("el inicio automático solo está soportado en Windows")

func SetEnabled(enabled bool) error {
	if !enabled {
		return nil
	}
	return ErrUnsupported
}

func IsEnabled() (bool, error) {
	return false, nil
}
