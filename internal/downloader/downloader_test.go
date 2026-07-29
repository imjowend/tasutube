package downloader

import (
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestExtractPercent(t *testing.T) {
	tests := []struct {
		name     string
		line     string
		wantP    float64
		wantOk   bool
	}{
		{
			name:   "standard output",
			line:   "[download]  45.3% of 10.00MiB at 1.23MiB/s ETA 00:05",
			wantP:  45.3,
			wantOk: true,
		},
		{
			name:   "100 percent complete",
			line:   "[download] 100.0% of ~ 15.00MiB at 3.50MiB/s ETA 00:00",
			wantP:  100.0,
			wantOk: true,
		},
		{
			name:   "zero percent",
			line:   "[download]   0.0% of 5.00MiB at Unknown speed ETA Unknown",
			wantP:  0.0,
			wantOk: true,
		},
		{
			name:   "non download line",
			line:   "[youtube] Extracting URL: https://youtube.com/watch?v=12345",
			wantP:  0,
			wantOk: false,
		},
		{
			name:   "line without percent",
			line:   "[download] Destination: song.mp3",
			wantP:  0,
			wantOk: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotP, gotOk := ExtractPercent(tt.line)
			if gotOk != tt.wantOk {
				t.Errorf("ExtractPercent() ok = %v; want %v", gotOk, tt.wantOk)
			}
			if gotOk && math.Abs(gotP-tt.wantP) > 0.001 {
				t.Errorf("ExtractPercent() percent = %v; want %v", gotP, tt.wantP)
			}
		})
	}
}

func TestVideoFormat(t *testing.T) {
	if got := VideoFormat("avanzado"); !containsSubstring(got, "best") {
		t.Errorf("VideoFormat(avanzado) = %q; expected to contain best", got)
	}
	if got := VideoFormat("1080p"); !containsSubstring(got, "1080") {
		t.Errorf("VideoFormat(1080p) = %q; expected to contain 1080", got)
	}
	if got := VideoFormat("720p"); !containsSubstring(got, "720") {
		t.Errorf("VideoFormat(720p) = %q; expected to contain 720", got)
	}
	if got := VideoFormat("480p"); !containsSubstring(got, "480") {
		t.Errorf("VideoFormat(480p) = %q; expected to contain 480", got)
	}
	if got := VideoFormat("auto"); !containsSubstring(got, "best") {
		t.Errorf("VideoFormat(auto) = %q; expected to contain best", got)
	}
}

func TestAudioQuality(t *testing.T) {
	if got := AudioQuality("avanzado"); got != "0" {
		t.Errorf("AudioQuality(avanzado) = %q; want 0", got)
	}
	if got := AudioQuality("alta"); got != "0" {
		t.Errorf("AudioQuality(alta) = %q; want 0", got)
	}
	if got := AudioQuality("media"); got != "5" {
		t.Errorf("AudioQuality(media) = %q; want 5", got)
	}
	if got := AudioQuality("baja"); got != "9" {
		t.Errorf("AudioQuality(baja) = %q; want 9", got)
	}
}

func TestDefaultDownloadPath(t *testing.T) {
	path := DefaultDownloadPath()
	home, err := os.UserHomeDir()
	if err == nil {
		expected := filepath.Join(home, "Downloads", "%(title)s.%(ext)s")
		if path != expected {
			t.Errorf("DefaultDownloadPath() = %q; want %q", path, expected)
		}
	}
}

func containsSubstring(s, sub string) bool {
	return filepath.HasPrefix(s, sub) || len(s) >= len(sub) && (s == sub || len(s) > len(sub) && findSub(s, sub))
}

func findSub(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
