package autostart

import (
	"testing"
)

func TestAutostart(t *testing.T) {
	// IsEnabled should return a boolean without panicking
	enabled, err := IsEnabled()
	if err != nil {
		t.Logf("IsEnabled() returned: %v", err)
	}
	t.Logf("Autostart status: %v", enabled)

	// SetEnabled(false) should complete without unhandled error
	if err := SetEnabled(false); err != nil {
		t.Logf("SetEnabled(false) returned: %v", err)
	}
}
