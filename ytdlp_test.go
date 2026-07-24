package main

import "testing"

func TestYtdlpAssetName(t *testing.T) {
	cases := []struct {
		goos string
		want string
	}{
		{"windows", "yt-dlp.exe"},
		{"darwin", "yt-dlp_macos"},
		{"linux", "yt-dlp"},
	}
	for _, c := range cases {
		if got := ytdlpAssetName(c.goos); got != c.want {
			t.Errorf("ytdlpAssetName(%q) = %q, want %q", c.goos, got, c.want)
		}
	}
}

func TestYtdlpBinaryName(t *testing.T) {
	cases := []struct {
		goos string
		want string
	}{
		{"windows", "yt-dlp.exe"},
		{"darwin", "yt-dlp"},
		{"linux", "yt-dlp"},
	}
	for _, c := range cases {
		if got := ytdlpBinaryName(c.goos); got != c.want {
			t.Errorf("ytdlpBinaryName(%q) = %q, want %q", c.goos, got, c.want)
		}
	}
}

func TestYtdlpTargetPath(t *testing.T) {
	got := ytdlpTargetPath("/home/user/.cache", "linux")
	want := "/home/user/.cache/Tasutube/bin/yt-dlp"
	if got != want {
		t.Errorf("ytdlpTargetPath() = %q, want %q", got, want)
	}

	// filepath.Join usa el separador del SO donde corre el test, así que para
	// el caso "windows" no podemos afirmar barras invertidas literales desde
	// una corrida en macOS/Linux. Solo verificamos el mapeo de nombre/carpeta.
	winPath := ytdlpTargetPath("C:/Users/papa/AppData/Local", "windows")
	if len(winPath) < len("yt-dlp.exe") || winPath[len(winPath)-len("yt-dlp.exe"):] != "yt-dlp.exe" {
		t.Errorf("ytdlpTargetPath() para windows = %q, esperaba que terminara en yt-dlp.exe", winPath)
	}
}

func TestIsReasonableYtdlpSize(t *testing.T) {
	cases := []struct {
		name string
		size int64
		want bool
	}{
		{"archivo vacío", 0, false},
		{"tamaño de página de error", 50 * 1024, false},
		{"tamaño de binario real", 20 * 1024 * 1024, true},
		{"justo en el umbral", ytdlpMinValidSize, true},
		{"justo debajo del umbral", ytdlpMinValidSize - 1, false},
	}
	for _, c := range cases {
		if got := isReasonableYtdlpSize(c.size); got != c.want {
			t.Errorf("%s: isReasonableYtdlpSize(%d) = %v, want %v", c.name, c.size, got, c.want)
		}
	}
}
