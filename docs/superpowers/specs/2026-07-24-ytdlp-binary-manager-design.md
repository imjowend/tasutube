# yt-dlp binario autogestionado — diseño

**Fecha:** 2026-07-24
**Estado:** Aprobado, pendiente de implementación

## Problema

Tasutube depende hoy de que `yt-dlp` esté instalado globalmente y en el `PATH` del sistema (`exec.CommandContext(ctx, "yt-dlp", args...)` en `downloader.go`). En la máquina de destino (Windows, uso del padre del autor) la versión instalada llevaba más de 90 días sin actualizar, y YouTube empezó a devolver `HTTP Error 403: Forbidden` — un problema conocido de versiones viejas de yt-dlp, no de la app en sí.

## Objetivo

Que Tasutube gestione su propia copia de `yt-dlp`, independiente de lo que haya (o no) instalado en el sistema:
- La descarga automáticamente la primera vez que hace falta.
- La mantiene actualizada de forma silenciosa.
- Nunca deja a un usuario no técnico bloqueado por un binario desactualizado o ausente.

Fuera de alcance: `ffmpeg` (también requerido por yt-dlp) sigue dependiendo de instalación global por ahora — no fue la causa del bug reportado y ampliar el alcance a dos binarios es una feature aparte.

## Ubicación del binario gestionado

```
os.UserCacheDir()/Tasutube/bin/yt-dlp[.exe]
```

- Windows: `%LocalAppData%\Tasutube\bin\yt-dlp.exe`
- macOS: `~/Library/Caches/Tasutube/bin/yt-dlp`
- Linux: `$XDG_CACHE_HOME/Tasutube/bin/yt-dlp` (o `~/.cache/Tasutube/bin/yt-dlp`)

**Corrección respecto al pedido original:** se pidió `os.UserConfigDir()` apuntando a `AppData\Local`, pero en Windows `os.UserConfigDir()` resuelve a `%AppData%` (Roaming), no a Local. La función de la stdlib de Go que corresponde a "Local"/cache es `os.UserCacheDir()`, y es semánticamente más apropiada: un binario redescargable es contenido de cache, no configuración de usuario.

Asset de GitHub Releases a descargar, según el SO (yt-dlp publica un binario distinto por plataforma):

| GOOS | Nombre de archivo local | Asset de GitHub |
|---|---|---|
| `windows` | `yt-dlp.exe` | `yt-dlp.exe` |
| `darwin` | `yt-dlp` | `yt-dlp_macos` |
| otro (linux) | `yt-dlp` | `yt-dlp` |

URL base: `https://github.com/yt-dlp/yt-dlp/releases/latest/download/<asset>`

## Componente: `ytdlpManager` (`ytdlp.go`, `package main`)

```go
type ytdlpManager struct {
    path  string        // ruta final resuelta; válida solo después de que ready se cierra
    err   error          // solo si la descarga inicial falla
    ready chan struct{} // se cierra cuando path/err quedan definidos
}
```

Sin mutex: una única goroutine escribe `path`/`err` y lo hace *antes* de cerrar `ready`; todo lector pasa por ese canal antes de leer (happens-before estándar de Go vía cierre/recepción de canal), así que no hace falta sincronización adicional.

### `newYtdlpManager() *ytdlpManager`

1. Calcula la ruta destino (función pura, parametrizada por `GOOS` y cache dir para poder testearla sin importar en qué SO corren los tests).
2. `os.Stat()` sobre esa ruta:
   - **Existe:** setea `path` y cierra `ready` sincrónicamente (uso inmediato, sin esperas). Dispara en background una goroutine que corre `<path> -U` (self-update de yt-dlp) con `context.WithTimeout` de 30s y `hideWindow(cmd)` aplicado (reusa el helper ya existente de la fix de la consola). El resultado de esa goroutine solo se loguea (`log.Printf`); nunca toca `path`/`err` ni la UI.
   - **No existe:** dispara una goroutine que primero crea el directorio destino si hace falta (`os.MkdirAll(dir, 0755)` — en una instalación nueva `Tasutube/bin` todavía no existe), descarga el asset correspondiente a un archivo temporal en ese mismo directorio, valida que el tamaño sea razonable (>1MB — así se detecta si GitHub devolvió una página de error en vez del binario), le da permisos de ejecución (`os.Chmod(path, 0755)`, no-op inofensivo en Windows), y hace un rename atómico al destino final. Al terminar (éxito o error) setea `path`/`err` y cierra `ready`.

### `(m *ytdlpManager) resolve(ctx context.Context) (string, error)`

Si `ready` ya está cerrado, retorna `path`/`err` al instante. Si no, espera a `<-m.ready` o `<-ctx.Done()`. Es el único punto de sincronización real del sistema — solo importa la primerísima vez que se usa la app en una máquina, cuando el binario todavía no existe y una descarga del usuario tiene que esperar a que yt-dlp termine de bajarse.

## Integración

- `App` (`app.go`) gana un campo `ytdlp *ytdlpManager`, creado dentro de `NewApp()` — esto ya dispara el chequeo/descarga en background al arrancar la app, sin necesidad de tocar `startup(ctx)`.
- `downloader.go`, en `a.run()`, reemplaza la llamada estática:
  ```go
  cmd := exec.CommandContext(ctx, "yt-dlp", args...)
  ```
  por:
  ```go
  ytdlpPath, err := a.ytdlp.resolve(ctx)
  if err != nil {
      return DownloadResult{false, "No se pudo preparar yt-dlp. Revisá tu conexión a internet."}
  }
  cmd := exec.CommandContext(ctx, ytdlpPath, args...)
  hideWindow(cmd)
  ```
- Sin cambios en el frontend — todo esto es invisible para React.

## Decisiones de comportamiento (ya validadas con el usuario)

| Decisión | Elegido |
|---|---|
| ¿Cuándo se chequea/actualiza? | Al iniciar la app (disparado desde `NewApp()`), en background |
| Si falla el update y ya había binario | Se sigue usando el binario existente, sin avisar en la UI (solo se loguea) |
| Verificación de la descarga inicial | Básica: tamaño mínimo + permisos de ejecución (sin checksum SHA-256) |

## Manejo de errores

- **Descarga HTTP:** `http.Client{Timeout: 3 * time.Minute}`, request atado al `context.Context` de la app (cancelable si la app cierra a mitad de descarga). Se escribe a un archivo temporal en el mismo directorio destino y se hace `os.Rename` al path final solo si la descarga y la validación de tamaño fueron exitosas — así nunca queda un binario a medio escribir ocupando el path que el resto del código considera "listo".
- **Self-update (`-U`) en background:** timeout de 30s vía `context.WithTimeout`; cualquier error (sin red, GitHub caído, timeout) se loguea y se ignora — el binario existente sigue siendo válido y utilizable.
- **Primer uso sin binario y sin red:** es el único caso que sí debe ser visible para el usuario, porque no hay binario con el cual hacer fallback. `resolve()` devuelve error y `a.run()` lo traduce al mensaje en español ya mencionado, reusando el mismo mecanismo de `DownloadResult` que ya usa el resto del archivo.

## Testing

El proyecto no tiene tests hoy (`*_test.go` no existe). Para esta feature:

- **Unitarios puros, sin red:** funciones de mapeo `GOOS → asset/nombre de binario` y de construcción de ruta destino, escritas como funciones puras parametrizadas (no leen `runtime.GOOS`/`os.UserCacheDir()` directamente) para poder cubrir las tres ramas de SO desde un solo test run. Función de validación de tamaño razonable, con casos límite (0 bytes, ~50KB tipo error page, ~20MB binario real).
- **Integración liviana con `httptest.Server`:** simula el endpoint de descarga (bytes falsos, 404, respuesta cortada) y verifica escritura a temporal + validación de tamaño + rename atómico + permisos, usando `t.TempDir()`, sin red real.
- **Fuera del suite automático:** no se testea invocar el `yt-dlp -U` real ni pegarle a GitHub de verdad (lento, flaky). En su lugar, verificación manual post-implementación: cross-compile a `windows/amd64` para confirmar que compila para la máquina destino, y un smoke test manual en macOS contra un cache dir temporal para confirmar que la descarga real de `yt-dlp_macos` funciona de punta a punta.

## Alcance explícitamente fuera de esta feature

- Gestión de `ffmpeg` (queda dependiendo de instalación global, como hoy).
- Verificación de checksum SHA-256 del binario descargado.
- Cualquier UI/feedback visible al usuario sobre el estado de la actualización (todo el mecanismo es silencioso por diseño).
