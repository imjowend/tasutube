package downloader

import (
	"fmt"
	"net/url"
	"strings"
)

var allowedHosts = map[string]bool{
	"youtube.com":              true,
	"www.youtube.com":          true,
	"m.youtube.com":            true,
	"music.youtube.com":        true,
	"youtu.be":                 true,
	"www.youtu.be":             true,
	"youtube-nocookie.com":     true,
	"www.youtube-nocookie.com": true,
}

// ValidateURL acepta únicamente URLs http(s) de YouTube. Evita que un valor
// arbitrario llegue a yt-dlp como opción de línea de comandos o como esquema
// de archivo local.
func ValidateURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("la URL está vacía")
	}
	if strings.ContainsAny(trimmed, "\n\r\x00") {
		return "", fmt.Errorf("la URL contiene caracteres inválidos")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return "", fmt.Errorf("URL inválida")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("solo se admiten URLs http o https")
	}

	host := strings.ToLower(parsed.Hostname())
	if !allowedHosts[host] {
		return "", fmt.Errorf("solo se admiten URLs de YouTube")
	}

	return trimmed, nil
}
