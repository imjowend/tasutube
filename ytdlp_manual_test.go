package main

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestManualYtdlpDownload es un test de verificacion manual, fuera del
// suite automatico (ver docs/superpowers/specs/2026-07-24-ytdlp-binary-manager-design.md).
// Pega contra GitHub real y escribe en el cache real de quien lo corre.
// Correr explicitamente con:
//
//	TASUTUBE_MANUAL_YTDLP_TEST=1 go test -run TestManualYtdlpDownload -v .
func TestManualYtdlpDownload(t *testing.T) {
	if os.Getenv("TASUTUBE_MANUAL_YTDLP_TEST") == "" {
		t.Skip("test manual: setear TASUTUBE_MANUAL_YTDLP_TEST=1 para correrlo contra GitHub real")
	}

	m := newYtdlpManager()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	path, err := m.resolve(ctx)
	if err != nil {
		t.Fatalf("resolve() error = %v", err)
	}

	if _, statErr := os.Stat(path); statErr != nil {
		t.Fatalf("esperaba yt-dlp descargado en %q: %v", path, statErr)
	}

	t.Logf("yt-dlp descargado correctamente en: %s", path)
}
