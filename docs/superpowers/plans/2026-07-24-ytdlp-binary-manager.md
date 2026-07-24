# yt-dlp Binario Autogestionado — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Tasutube descargue y actualice su propia copia de `yt-dlp` en el cache del usuario, en vez de depender de una instalación global en el `PATH`.

**Architecture:** Un `ytdlpManager` (nuevo archivo `ytdlp.go`, `package main`) resuelve la ruta del binario gestionado: si existe, la usa de inmediato y dispara un `-U` silencioso en background; si no existe, la descarga desde GitHub Releases antes de dejarla disponible. `App` lo posee como campo (`a.ytdlp`), inicializado en `NewApp()`. `downloader.go` reemplaza la llamada estática `"yt-dlp"` por `a.ytdlp.resolve(ctx)`.

**Tech Stack:** Go 1.23, solo librería estándar (`net/http`, `os`, `os/exec`, `context`). Sin dependencias nuevas en `go.mod`.

**Spec de referencia:** `docs/superpowers/specs/2026-07-24-ytdlp-binary-manager-design.md`

## Global Constraints

- Go 1.23 (según `go.mod`), sin agregar ninguna dependencia nueva a `go.mod`.
- Ubicación del binario: `os.UserCacheDir()` (NO `os.UserConfigDir()` — ver corrección en la spec).
- Reusar el helper `hideWindow(cmd *exec.Cmd)` ya existente en `procattr_windows.go`/`procattr_default.go` para CUALQUIER subproceso nuevo (incluido `yt-dlp -U`) — no reimplementar el ocultamiento de ventana.
- Mensajes de error visibles al usuario en español, en el mismo estilo que ya usa `downloader.go` (ver `DownloadResult{false, "..."}`).
- Debe compilar tanto en el SO de desarrollo (darwin) como cross-compilado a `windows/amd64` (`GOOS=windows GOARCH=amd64 go build`).
- `gofmt -l .` y `go vet ./...` sin salida/warnings en todo momento.
- Fuera de alcance: gestión de `ffmpeg` (sigue requiriendo instalación global), verificación de checksum SHA-256, cualquier UI/feedback visible sobre el estado de la actualización.
- Ningún test automático debe pegarle a la red real (github.com) — eso se verifica solo manualmente (Task 8).

---

### Task 1: Funciones puras de mapeo SO → nombre/ruta, y validación de tamaño

**Files:**
- Create: `ytdlp.go`
- Create: `ytdlp_test.go`

**Interfaces:**
- Produces: `ytdlpAssetName(goos string) string`, `ytdlpBinaryName(goos string) string`, `ytdlpTargetPath(cacheDir, goos string) string`, `isReasonableYtdlpSize(n int64) bool`, const `ytdlpMinValidSize`

- [ ] **Step 1: Escribir los tests que van a fallar**

Crear `ytdlp_test.go`:

```go
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
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `go test -run 'TestYtdlpAssetName|TestYtdlpBinaryName|TestYtdlpTargetPath|TestIsReasonableYtdlpSize' -v .`
Expected: FAIL — `undefined: ytdlpAssetName` (el archivo `ytdlp.go` todavía no existe)

- [ ] **Step 3: Implementación mínima**

Crear `ytdlp.go`:

```go
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
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `go test -run 'TestYtdlpAssetName|TestYtdlpBinaryName|TestYtdlpTargetPath|TestIsReasonableYtdlpSize' -v .`
Expected: PASS (los 4 tests)

- [ ] **Step 5: Commit**

```bash
git add ytdlp.go ytdlp_test.go
git commit -m "feat: agregar funciones puras de mapeo SO para yt-dlp gestionado"
```

---

### Task 2: `downloadYtdlp` — descarga con validación y rename atómico

**Files:**
- Modify: `ytdlp.go` (agregar función)
- Modify: `ytdlp_test.go` (agregar tests)

**Interfaces:**
- Consumes: `isReasonableYtdlpSize(n int64) bool` (Task 1)
- Produces: `downloadYtdlp(ctx context.Context, url, destPath string) error`

- [ ] **Step 1: Escribir los tests que van a fallar**

Agregar al final de `ytdlp_test.go` (y actualizar el bloque `import` al inicio del archivo):

```go
import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)
```

```go
func TestDownloadYtdlp_Success(t *testing.T) {
	body := bytes.Repeat([]byte("a"), 2*1024*1024) // 2MB, por encima del umbral
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(body)
	}))
	defer server.Close()

	destPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	if err := downloadYtdlp(context.Background(), server.URL, destPath); err != nil {
		t.Fatalf("downloadYtdlp() error = %v", err)
	}

	info, err := os.Stat(destPath)
	if err != nil {
		t.Fatalf("esperaba archivo en %q, stat error: %v", destPath, err)
	}
	if info.Size() != int64(len(body)) {
		t.Errorf("tamaño del archivo = %d, want %d", info.Size(), len(body))
	}
	if info.Mode().Perm()&0111 == 0 {
		t.Errorf("esperaba que el archivo fuera ejecutable, mode = %v", info.Mode())
	}
	if _, err := os.Stat(destPath + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("esperaba que el archivo temporal se limpiara")
	}
}

func TestDownloadYtdlp_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	destPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	if err := downloadYtdlp(context.Background(), server.URL, destPath); err == nil {
		t.Fatal("esperaba error para respuesta 404")
	}
	if _, statErr := os.Stat(destPath); !os.IsNotExist(statErr) {
		t.Errorf("esperaba que no se creara ningún archivo si falla la descarga")
	}
}

func TestDownloadYtdlp_TooSmall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not found"))
	}))
	defer server.Close()

	destPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	if err := downloadYtdlp(context.Background(), server.URL, destPath); err == nil {
		t.Fatal("esperaba error para respuesta más chica que el umbral")
	}
	if _, statErr := os.Stat(destPath); !os.IsNotExist(statErr) {
		t.Errorf("esperaba que no quedara archivo para una descarga muy chica")
	}
	if _, statErr := os.Stat(destPath + ".tmp"); !os.IsNotExist(statErr) {
		t.Errorf("esperaba que el archivo temporal se limpiara")
	}
}
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `go test -run TestDownloadYtdlp -v .`
Expected: FAIL — `undefined: downloadYtdlp`

- [ ] **Step 3: Implementación mínima**

Actualizar el bloque `import` de `ytdlp.go`:

```go
import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)
```

Agregar al final de `ytdlp.go`:

```go
func downloadYtdlp(ctx context.Context, url, destPath string) error {
	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return fmt.Errorf("no se pudo crear el directorio destino: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 3 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("descarga de yt-dlp falló con status %d", resp.StatusCode)
	}

	tmpPath := destPath + ".tmp"
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		return err
	}

	written, copyErr := io.Copy(tmpFile, resp.Body)
	closeErr := tmpFile.Close()
	if copyErr != nil {
		os.Remove(tmpPath)
		return copyErr
	}
	if closeErr != nil {
		os.Remove(tmpPath)
		return closeErr
	}

	if !isReasonableYtdlpSize(written) {
		os.Remove(tmpPath)
		return fmt.Errorf("descarga de yt-dlp incompleta (%d bytes)", written)
	}

	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		return err
	}

	if err := os.Rename(tmpPath, destPath); err != nil {
		os.Remove(tmpPath)
		return err
	}

	return nil
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `go test -run TestDownloadYtdlp -v .`
Expected: PASS (los 3 tests)

- [ ] **Step 5: Commit**

```bash
git add ytdlp.go ytdlp_test.go
git commit -m "feat: agregar downloadYtdlp con validacion de tamaño y rename atomico"
```

---

### Task 3: `selfUpdateYtdlp` — autoactualización silenciosa

**Files:**
- Modify: `ytdlp.go` (agregar función)
- Modify: `ytdlp_test.go` (agregar test)

**Interfaces:**
- Consumes: `hideWindow(cmd *exec.Cmd)` (ya existente en `procattr_windows.go`/`procattr_default.go`)
- Produces: `selfUpdateYtdlp(ctx context.Context, path string) error`

- [ ] **Step 1: Escribir el test que va a fallar**

Agregar al final de `ytdlp_test.go`:

```go
func TestSelfUpdateYtdlp_MissingBinary(t *testing.T) {
	fakePath := filepath.Join(t.TempDir(), "no-such-binary")

	if err := selfUpdateYtdlp(context.Background(), fakePath); err == nil {
		t.Fatal("esperaba error cuando el binario no existe")
	}
}
```

(No hace falta un test contra el `yt-dlp -U` real ni contra GitHub — la spec lo excluye explícitamente del suite automático.)

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `go test -run TestSelfUpdateYtdlp_MissingBinary -v .`
Expected: FAIL — `undefined: selfUpdateYtdlp`

- [ ] **Step 3: Implementación mínima**

Actualizar el bloque `import` de `ytdlp.go` (agregar `os/exec`):

```go
import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)
```

Agregar al final de `ytdlp.go`:

```go
func selfUpdateYtdlp(ctx context.Context, path string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, "-U")
	hideWindow(cmd)
	return cmd.Run()
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `go test -run TestSelfUpdateYtdlp_MissingBinary -v .`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ytdlp.go ytdlp_test.go
git commit -m "feat: agregar selfUpdateYtdlp para autoactualizacion silenciosa"
```

---

### Task 4: `ytdlpManager` — coordinación exists/download + `resolve()`

**Files:**
- Modify: `ytdlp.go` (agregar tipo + funciones)
- Modify: `ytdlp_test.go` (agregar tests)

**Interfaces:**
- Consumes: `downloadYtdlp` (Task 2), `selfUpdateYtdlp` (Task 3)
- Produces: `type ytdlpManager struct { path string; err error; ready chan struct{} }`, `newYtdlpManagerAt(ctx context.Context, targetPath, downloadURL string) *ytdlpManager`, `(m *ytdlpManager) resolve(ctx context.Context) (string, error)`

- [ ] **Step 1: Escribir los tests que van a fallar**

Actualizar el bloque `import` de `ytdlp_test.go` (agregar `time`):

```go
import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)
```

Agregar al final de `ytdlp_test.go`:

```go
func TestYtdlpManager_ExistingBinary_ResolvesImmediately(t *testing.T) {
	targetPath := filepath.Join(t.TempDir(), "yt-dlp")
	if err := os.WriteFile(targetPath, []byte("fake binary"), 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}

	m := newYtdlpManagerAt(context.Background(), targetPath, "http://127.0.0.1:0/unused")

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	path, err := m.resolve(ctx)
	if err != nil {
		t.Fatalf("resolve() error = %v", err)
	}
	if path != targetPath {
		t.Errorf("resolve() path = %q, want %q", path, targetPath)
	}
}

func TestYtdlpManager_MissingBinary_DownloadsThenResolves(t *testing.T) {
	body := bytes.Repeat([]byte("a"), 2*1024*1024)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write(body)
	}))
	defer server.Close()

	targetPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	m := newYtdlpManagerAt(context.Background(), targetPath, server.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	path, err := m.resolve(ctx)
	if err != nil {
		t.Fatalf("resolve() error = %v", err)
	}
	if path != targetPath {
		t.Errorf("resolve() path = %q, want %q", path, targetPath)
	}
	if _, statErr := os.Stat(targetPath); statErr != nil {
		t.Errorf("esperaba binario descargado en %q: %v", targetPath, statErr)
	}
}

func TestYtdlpManager_DownloadFails_ResolveReturnsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	targetPath := filepath.Join(t.TempDir(), "bin", "yt-dlp")

	m := newYtdlpManagerAt(context.Background(), targetPath, server.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := m.resolve(ctx); err == nil {
		t.Fatal("esperaba que resolve() devolviera error si falla la descarga")
	}
}

func TestYtdlpManager_ResolveRespectsContextCancellation(t *testing.T) {
	m := &ytdlpManager{ready: make(chan struct{})} // nunca se cierra, a propósito

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := m.resolve(ctx); err == nil {
		t.Fatal("esperaba que resolve() devolviera error para un contexto ya cancelado")
	}
}
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `go test -run TestYtdlpManager -v .`
Expected: FAIL — `undefined: ytdlpManager`

- [ ] **Step 3: Implementación mínima**

Actualizar el bloque `import` de `ytdlp.go` (agregar `log`):

```go
import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)
```

Agregar al final de `ytdlp.go`:

```go
type ytdlpManager struct {
	path  string
	err   error
	ready chan struct{}
}

func newYtdlpManagerAt(ctx context.Context, targetPath, downloadURL string) *ytdlpManager {
	m := &ytdlpManager{ready: make(chan struct{})}

	if _, err := os.Stat(targetPath); err == nil {
		m.path = targetPath
		close(m.ready)

		go func() {
			if updateErr := selfUpdateYtdlp(context.Background(), targetPath); updateErr != nil {
				log.Printf("yt-dlp: no se pudo autoactualizar, se sigue usando la version existente: %v", updateErr)
			}
		}()

		return m
	}

	go func() {
		if downloadErr := downloadYtdlp(ctx, downloadURL, targetPath); downloadErr != nil {
			m.err = fmt.Errorf("no se pudo descargar yt-dlp: %w", downloadErr)
		} else {
			m.path = targetPath
		}
		close(m.ready)
	}()

	return m
}

func (m *ytdlpManager) resolve(ctx context.Context) (string, error) {
	select {
	case <-m.ready:
		return m.path, m.err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `go test -run TestYtdlpManager -v .`
Expected: PASS (los 4 tests)

- [ ] **Step 5: Commit**

```bash
git add ytdlp.go ytdlp_test.go
git commit -m "feat: agregar ytdlpManager con resolve() coordinado sin mutex"
```

---

### Task 5: `newYtdlpManager` — wiring con rutas y URL reales

**Files:**
- Modify: `ytdlp.go` (agregar función)

**Interfaces:**
- Consumes: `ytdlpTargetPath` (Task 1), `ytdlpAssetName` (Task 1), `newYtdlpManagerAt` (Task 4)
- Produces: `newYtdlpManager() *ytdlpManager`

**Nota sobre testing:** esta función usa `os.UserCacheDir()` y `runtime.GOOS` reales, y si el binario no existe todavía dispara una descarga real desde `github.com`. Por diseño (ver spec, sección Testing) NO se escribe un test automático para esto — haría que `go test ./...` pegue contra la red real y escriba en el cache real de quien corra los tests. La verificación real ocurre en el Task 8 (manual).

- [ ] **Step 1: Implementación**

Actualizar el bloque `import` de `ytdlp.go` (agregar `runtime`):

```go
import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)
```

Agregar al final de `ytdlp.go`:

```go
func newYtdlpManager() *ytdlpManager {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		m := &ytdlpManager{ready: make(chan struct{})}
		m.err = fmt.Errorf("no se pudo determinar el directorio de cache: %w", err)
		close(m.ready)
		return m
	}

	targetPath := ytdlpTargetPath(cacheDir, runtime.GOOS)
	downloadURL := "https://github.com/yt-dlp/yt-dlp/releases/latest/download/" + ytdlpAssetName(runtime.GOOS)

	return newYtdlpManagerAt(context.Background(), targetPath, downloadURL)
}
```

- [ ] **Step 2: Verificar que compila y que los tests existentes siguen pasando**

Run: `gofmt -l . && go vet ./... && go test ./...`
Expected: sin salida de `gofmt -l`, sin warnings de `go vet`, todos los tests existentes en PASS (esta función no tiene test propio, pero no debe romper nada)

- [ ] **Step 3: Commit**

```bash
git add ytdlp.go
git commit -m "feat: agregar newYtdlpManager con rutas y URL reales de GitHub"
```

---

### Task 6: Integrar `ytdlpManager` en `App`

**Files:**
- Modify: `app.go:35-54`

**Interfaces:**
- Consumes: `newYtdlpManager() *ytdlpManager` (Task 5)
- Produces: campo `App.ytdlp *ytdlpManager`

- [ ] **Step 1: Agregar el campo al struct `App`**

En `app.go`, reemplazar:

```go
type App struct {
	ctx          context.Context
	jobs         chan job
	mu           sync.Mutex
	queue        []*DownloadItem
	nextID       int
	cancels      map[int]context.CancelFunc
	downloadPath string
}
```

por:

```go
type App struct {
	ctx          context.Context
	jobs         chan job
	mu           sync.Mutex
	queue        []*DownloadItem
	nextID       int
	cancels      map[int]context.CancelFunc
	downloadPath string
	ytdlp        *ytdlpManager
}
```

- [ ] **Step 2: Inicializarlo en `NewApp()`**

Reemplazar:

```go
func NewApp() *App {
	a := &App{
		jobs:    make(chan job, 10),
		cancels: make(map[int]context.CancelFunc),
	}
	for i := 0; i < 3; i++ {
		go a.worker()
	}
	return a
}
```

por:

```go
func NewApp() *App {
	a := &App{
		jobs:    make(chan job, 10),
		cancels: make(map[int]context.CancelFunc),
		ytdlp:   newYtdlpManager(),
	}
	for i := 0; i < 3; i++ {
		go a.worker()
	}
	return a
}
```

- [ ] **Step 3: Verificar que compila**

Run: `gofmt -l . && go vet ./... && go build -o /dev/null .`
Expected: sin salida de `gofmt -l`, sin warnings, build exitoso

- [ ] **Step 4: Commit**

```bash
git add app.go
git commit -m "feat: inicializar ytdlpManager en NewApp"
```

---

### Task 7: Reemplazar la llamada estática `"yt-dlp"` en `downloader.go`

**Files:**
- Modify: `downloader.go:44-47`

**Interfaces:**
- Consumes: `(a *App) ytdlp.resolve(ctx context.Context) (string, error)` (Task 4/6)

- [ ] **Step 1: Reemplazar la construcción del comando**

En `downloader.go`, dentro de `(a *App) run(...)`, reemplazar:

```go
	cmd := exec.CommandContext(ctx, "yt-dlp", args...)
	hideWindow(cmd)

	stdout, err := cmd.StdoutPipe()
```

por:

```go
	ytdlpPath, err := a.ytdlp.resolve(ctx)
	if err != nil {
		return DownloadResult{false, "No se pudo preparar yt-dlp. Revisá tu conexión a internet."}
	}

	cmd := exec.CommandContext(ctx, ytdlpPath, args...)
	hideWindow(cmd)

	stdout, err := cmd.StdoutPipe()
```

(La reasignación de `err` con `:=` en la línea de `stdout` sigue siendo válida porque `stdout` es una variable nueva.)

- [ ] **Step 2: Verificar que compila para macOS y para Windows**

Run: `gofmt -l . && go vet ./... && go build -o /dev/null . && GOOS=windows GOARCH=amd64 go build -o /dev/null .`
Expected: sin salida de `gofmt -l`, sin warnings, ambos builds exitosos

- [ ] **Step 3: Correr el suite completo de tests**

Run: `go test ./...`
Expected: PASS (todos los tests de `ytdlp_test.go`; `downloader.go` no tiene tests propios, como ya era el caso antes de esta feature)

- [ ] **Step 4: Commit**

```bash
git add downloader.go
git commit -m "feat: usar yt-dlp gestionado localmente en vez del PATH del sistema"
```

---

### Task 8: Verificación manual de punta a punta

**Files:**
- Create: `ytdlp_manual_test.go`

Este test es deliberadamente **manual** (no corre en `go test ./...` normal) porque pega contra `github.com` real y escribe en el cache real de quien lo corre — exactamente lo que la spec excluye del suite automático, pero es la única forma de confirmar de punta a punta que la descarga real funciona.

- [ ] **Step 1: Crear el test manual**

Crear `ytdlp_manual_test.go`:

```go
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
//   TASUTUBE_MANUAL_YTDLP_TEST=1 go test -run TestManualYtdlpDownload -v .
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
```

- [ ] **Step 2: Correr el smoke test real (descarga real desde GitHub)**

Run: `TASUTUBE_MANUAL_YTDLP_TEST=1 go test -run TestManualYtdlpDownload -v .`
Expected: PASS, con un log tipo `yt-dlp descargado correctamente en: /Users/<tu-usuario>/Library/Caches/Tasutube/bin/yt-dlp`

- [ ] **Step 3: Confirmar que el binario descargado funciona de verdad**

Run: `"$(go env HOME)/Library/Caches/Tasutube/bin/yt-dlp" --version`
Expected: imprime un número de versión reciente de yt-dlp (confirma que el binario descargado no está corrupto y es ejecutable)

- [ ] **Step 4: Correr el smoke test de nuevo para probar la rama "ya existe" + self-update**

Run: `TASUTUBE_MANUAL_YTDLP_TEST=1 go test -run TestManualYtdlpDownload -v .`
Expected: PASS de nuevo, esta vez tomando la rama "ya existe" (no vuelve a descargar) y disparando `-U` en background — revisar que no haya errores logueados sobre autoactualización

- [ ] **Step 5: Cross-compilar para Windows una vez más con todo el feature integrado**

Run: `GOOS=windows GOARCH=amd64 go build -o /dev/null .`
Expected: build exitoso, sin errores

- [ ] **Step 6: Limpiar el cache de prueba (opcional)**

Run: `rm -rf "$(go env HOME)/Library/Caches/Tasutube"`

(Opcional: podés dejarlo — es exactamente donde va a vivir en producción.)

- [ ] **Step 7: Commit**

```bash
git add ytdlp_manual_test.go
git commit -m "test: agregar smoke test manual opt-in para descarga real de yt-dlp"
```

---

### Task 9: Actualizar documentación (README.md, ARCHITECTURE.md)

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md:185`

- [ ] **Step 1: Actualizar "Requisitos previos" en README.md**

Reemplazar:

```markdown
## Requisitos previos

Tener instalados en el sistema y disponibles en el **PATH**:

- [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases)
- [ffmpeg](https://ffmpeg.org/download.html)

### Verificar instalación

```bash
yt-dlp --version
ffmpeg -version
```

### Instalación rápida (macOS con Homebrew)

```bash
brew install yt-dlp ffmpeg
```

### Instalación rápida (Windows con winget)

```powershell
winget install yt-dlp
winget install Gyan.FFmpeg
```
```

por:

```markdown
## Requisitos previos

`yt-dlp` se gestiona automáticamente: la primera vez que hace falta, la app lo descarga a `os.UserCacheDir()/Tasutube/bin/` y después se autoactualiza en cada inicio. No hace falta instalarlo a mano ni tenerlo en el PATH.

Sí hay que tener instalado y disponible en el **PATH**:

- [ffmpeg](https://ffmpeg.org/download.html) — usado por yt-dlp para convertir/mezclar audio y video

### Verificar instalación

```bash
ffmpeg -version
```

### Instalación rápida (macOS con Homebrew)

```bash
brew install ffmpeg
```

### Instalación rápida (Windows con winget)

```powershell
winget install Gyan.FFmpeg
```
```

- [ ] **Step 2: Corregir la descripción de la ruta de salida en ARCHITECTURE.md**

En `ARCHITECTURE.md`, reemplazar la línea 185:

```markdown
**Ruta de salida:** si el usuario configuró una carpeta mediante `SetDownloadPath`, el archivo se escribe en `<ruta>/%(title)s.%(ext)s`. En caso contrario, `defaultDownloadPath()` devuelve `~/Downloads/%(title)s.%(ext)s` (macOS/Linux) o `%USERPROFILE%\Downloads\%(title)s.%(ext)s` (Windows). yt-dlp expande `%(title)s` y `%(ext)s` al título del video y la extensión del contenedor.
```

por:

```markdown
**Ruta de salida:** si el usuario configuró una carpeta mediante `SetDownloadPath`, el archivo se escribe en `filepath.Join(<ruta>, "%(title)s.%(ext)s")`. En caso contrario, `defaultDownloadPath()` usa `os.UserHomeDir()` + `filepath.Join(home, "Downloads", "%(title)s.%(ext)s")` — una ruta ya resuelta por Go, no un placeholder de entorno como `%USERPROFILE%` que yt-dlp no expande. yt-dlp expande `%(title)s` y `%(ext)s` al título del video y la extensión del contenedor.

**Binario de yt-dlp:** ya no depende de una instalación global en el PATH. `ytdlpManager` (`ytdlp.go`) lo descarga a `os.UserCacheDir()/Tasutube/bin/` la primera vez que hace falta, y lo autoactualiza (`yt-dlp -U`) en background en cada inicio si ya existe. Ver `docs/superpowers/specs/2026-07-24-ytdlp-binary-manager-design.md` para el diseño completo.
```

- [ ] **Step 3: Commit**

```bash
git add README.md ARCHITECTURE.md
git commit -m "docs: reflejar yt-dlp autogestionado y corregir ruta de descarga por defecto"
```

---

## Self-Review

**Cobertura de la spec:** ubicación del binario (Task 1/5), mapeo de asset por SO (Task 1), `ytdlpManager` sin mutex (Task 4), `resolve()` (Task 4), integración en `NewApp()` (Task 6) y en `downloader.go` (Task 7), decisiones de timing/fallback/verificación ya validadas (Task 4/5), manejo de errores con timeouts y rename atómico (Task 2/3), fix de `os.MkdirAll` encontrado en la autorevisión de la spec (Task 2), testing puro + httptest + exclusión explícita de red real (Task 1/2/3/4/8), alcance fuera (ffmpeg, checksum, UI) documentado en Global Constraints y Task 9. Sin huecos encontrados.

**Placeholders:** ninguno — todo el código de cada step está completo.

**Consistencia de tipos:** verificado que las firmas se usan igual en todas las tasks: `ytdlpAssetName(goos string) string`, `ytdlpBinaryName(goos string) string`, `ytdlpTargetPath(cacheDir, goos string) string`, `isReasonableYtdlpSize(n int64) bool`, `downloadYtdlp(ctx context.Context, url, destPath string) error`, `selfUpdateYtdlp(ctx context.Context, path string) error`, `newYtdlpManagerAt(ctx context.Context, targetPath, downloadURL string) *ytdlpManager`, `newYtdlpManager() *ytdlpManager`, `(m *ytdlpManager) resolve(ctx context.Context) (string, error)`.
