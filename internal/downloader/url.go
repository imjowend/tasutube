package downloader

import (
	"fmt"
	"net/url"
	"strings"
)

// ValidateURL exige que la entrada sea una URL http(s) sin caracteres de
// control. Evita que un valor arbitrario llegue a yt-dlp como opción de línea
// de comandos (por ejemplo `--exec`) o como esquema de archivo local.
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
	if parsed.Host == "" {
		return "", fmt.Errorf("URL inválida")
	}

	return trimmed, nil
}
