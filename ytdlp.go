package main

import "path/filepath"

// ytdlpMinValidSize es el tamaño mínimo (bytes) que se considera una
// descarga válida de yt-dlp. Por debajo de esto asumimos una descarga
// corrupta o una página de error HTML servida en lugar del binario.
const ytdlpMinValidSize = 1 << 20 // 1MB

func ytdlpAssetName(goos string) string {
	switch goos {
	case "windows":
		return "yt-dlp.exe"
	case "darwin":
		return "yt-dlp_macos"
	default:
		return "yt-dlp"
	}
}

func ytdlpBinaryName(goos string) string {
	if goos == "windows" {
		return "yt-dlp.exe"
	}
	return "yt-dlp"
}

func ytdlpTargetPath(cacheDir, goos string) string {
	return filepath.Join(cacheDir, "Tasutube", "bin", ytdlpBinaryName(goos))
}

func isReasonableYtdlpSize(n int64) bool {
	return n >= ytdlpMinValidSize
}
