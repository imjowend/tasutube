package autostart

import (
	"testing"
)

func TestAutostart(t *testing.T) {
	// IsEnabled should return a boolean without panicking
	enabled := IsEnabled()
	t.Logf("Autostart status: %v", enabled)

	// SetEnabled(false) should complete without unhandled error
	err := SetEnabled(false)
	if err != nil {
		t.Logf("SetEnabled(false) returned: %v", err)
	}
}
