# TasuTube — Arquitectura

## Visión general

TasuTube es una aplicación de escritorio construida con Wails v2. Go corre como proceso nativo y es dueño de toda la lógica de descarga: crea subprocesos de `yt-dlp`, gestiona la cola y emite eventos. React corre dentro de un WebView2 (Windows) o WebKit (macOS/Linux) controlado por Wails. Ambas partes se comunican a través de los bindings de Wails (métodos Go invocables desde JS) y del sistema de eventos de Wails (Go → JS, pub/sub).

---

## Frontend

### Árbol de componentes

```
main.tsx
└── App (App.tsx)
    ├── DownloadForm (components/DownloadForm.tsx)
    └── QueueList (components/QueueList.tsx)
        └── QueueItem[] (components/QueueItem.tsx)
```

`App` es la raíz del layout. Posee los dos estados compartidos que cruzan límites de componentes — `status` (el banner de resultado del formulario) y `downloadPath` — y los pasa hacia abajo como props. Todo lo demás es local al componente que lo necesita.

### Flujo de estado

```
App
  │  status: FormStatus          ← lo setea handleSubmit, se descarta automáticamente a los 3s
  │  downloadPath: string        ← lo setea el selector de carpeta de DownloadForm
  │
  ├─► DownloadForm
  │     url, activeFormat,        (estado local)
  │     mp3Quality, mp4Quality,
  │     submitting, picking
  │
  │     onSubmit(url, fmt, q) ──► App.handleSubmit ──► useDownloadQueue.enqueue
  │     onPathChanged(path)  ──► App.setDownloadPath
  │
  └─► QueueList
        items[]  ◄── useDownloadQueue (hook, vive en App)
        onCancel ──► useDownloadQueue.cancel
```

`DownloadForm` maneja todo el estado local del formulario (texto del URL, formato activo, calidad por formato). Al hacer clic en el ícono de carpeta llama a `OpenFolderDialog` y `SetDownloadPath` directamente desde `wailsBridge`, y luego invoca `onPathChanged` para propagar la selección hacia arriba.

### Hook `useDownloadQueue`

`src/hooks/useDownloadQueue.ts`

El hook mantiene un `Map<number, DownloadItemWithProgress>` como estado principal (indexado por el ID que asigna el backend). Un ref paralelo `createdAtRef` guarda los tiempos de inserción reales para que el orden de la lista sea estable entre re-renders.

**Ciclo de vida:**

1. Al montarse, llama a `GetQueue()` para hidratar cualquier ítem que existiera antes de este render (por ejemplo, al hacer hot-reload durante el desarrollo).
2. Se suscribe a dos eventos de Wails vía `EventsOn`:
   - `download:status` → `upsert(id, { status, error })`
   - `download:progress` → `upsert(id, { percent })`
3. Al desmontarse, llama a las funciones de desubscripción devueltas por `EventsOn`.

**`upsert(id, patch)`:** fusiona el patch sobre el ítem existente, o crea uno nuevo si el patch incluye todos los campos base requeridos (`url`, `format`, `quality`, `status`). Esto protege contra eventos de progreso o estado que llegan antes de que el ítem sea conocido localmente.

**`enqueue(url, format, quality)`:** llama a `Download()` en el backend y luego hace un upsert inmediato de un esqueleto `pending` para que el ítem aparezca en la UI sin esperar el primer evento `download:status`.

Los ítems se devuelven ordenados del más nuevo al más viejo por `createdAt`.

### `wailsBridge`

`src/lib/wailsBridge.ts`

Al iniciarse, Wails inyecta `window.go.main.App` (los métodos Go enlazados) y `window.runtime` (el bus de eventos). Ninguno de los dos existe en un browser normal, lo que hace imposible usarlos directamente durante el desarrollo en una preview de browser.

El bridge resuelve esto con un patrón de modo dual:

```
hasWailsApp() ?
  window.go.main.App.Method(...)   ← build real de escritorio
  simBridge.Method(...)            ← preview de browser / simulador
```

El **simulador** (`simBridge`) mantiene una cola en memoria y emula el ciclo de vida completo de una descarga con `setTimeout`/`setInterval`: pending → downloading (ticks de progreso cada 200ms hasta 95%) → completed después de ~3.5s. La cancelación limpia todos los timers. Esto permite desarrollar y probar toda la UI sin un backend corriendo.

**Funciones exportadas:**

| Función | Descripción |
|---|---|
| `Download(url, format, quality)` | Llama a `App.Download`, devuelve el ID del ítem |
| `Cancel(id)` | Llama a `App.Cancel` |
| `GetQueue()` | Llama a `App.GetQueue`, devuelve el snapshot actual |
| `SetDownloadPath(path)` | Llama a `App.SetDownloadPath` |
| `OpenFolderDialog()` | Llama a `App.OpenFolderDialog`, devuelve la ruta seleccionada |
| `EventsOn(event, cb)` | Se suscribe a un evento de Wails, devuelve función de desubscripción |
| `isWailsRuntime()` | Devuelve true cuando corre dentro del shell de escritorio |

### Tipos

`src/types.ts` define todos los tipos compartidos:

- `DownloadFormat` — `"mp3" | "mp4"`
- `DownloadStatus` — `"pending" | "downloading" | "completed" | "cancelled" | "error"`
- `DownloadItem` — refleja el struct Go `DownloadItem` (id, url, format, quality, status, error)
- `DownloadItemWithProgress` — extiende `DownloadItem` con `percent` y `createdAt` (campos solo del frontend)
- `MP3_QUALITIES` / `MP4_QUALITIES` — arrays estáticos de pares `{ value, label }` usados por `DownloadForm`
- `DEFAULT_QUALITY` — calidad por defecto por formato (`"alta"` para mp3, `"auto"` para mp4)

---

## Backend

### Archivos Go

| Archivo | Responsabilidad |
|---|---|
| `main.go` | Bootstrap de Wails: embebe `frontend/dist`, configura la ventana (1024×768), vincula `App` |
| `app.go` | Struct `App` con todos los métodos exportados, worker pool, estado de la cola, mapa de cancelación |
| `downloader.go` | Invocación de `yt-dlp`, parseo de líneas de progreso, helpers de calidad y formato |

### Struct `App`

```go
type App struct {
    ctx          context.Context       // contexto de Wails (se setea en startup())
    jobs         chan job               // canal con buffer, capacidad 10
    mu           sync.Mutex
    queue        []*DownloadItem        // todos los ítems encolados (nunca se limpian)
    nextID       int
    cancels      map[int]context.CancelFunc
    downloadPath string
}
```

`App` es creado por `NewApp()`, que también lanza **3 goroutines worker** antes de que Wails llame a `startup()`. El campo `ctx` se llena en `startup(ctx)` y es necesario para `wailsruntime.EventsEmit` y `wailsruntime.OpenDirectoryDialog`.

### Worker pool

```
Download(url, format, quality)
  │
  ├── crea DownloadItem{status: pending}
  ├── crea contexto cancelable, guarda la fn de cancelación en cancels[id]
  └── envía job{} al canal a.jobs (no bloqueante, cap 10)

                           ┌─────────────────┐
goroutine worker (×3) ◄────┤  canal a.jobs   ├── los jobs se acumulan acá
                           └─────────────────┘
    │
    ├── verifica ctx.Err() → si ya fue cancelado → setStatus(cancelled)
    ├── setStatus(downloading)
    ├── llama a a.run(ctx, ...) → bloquea hasta que yt-dlp termina
    ├── elimina cancels[id]
    └── setStatus(completed | cancelled | error)
```

Los tres workers corren de forma concurrente, por lo que hasta tres descargas se ejecutan en paralelo. Los trabajos adicionales se acumulan en el buffer del canal (hasta 10). Los workers se inician una sola vez y corren durante toda la vida del proceso — no hay lógica de shutdown, ya que Wails se encarga de terminar el proceso.

### Cancelación

`Cancel(id)` busca el `context.CancelFunc` en el mapa `cancels` bajo el mutex y lo llama. Esto cancela el `context.Context` pasado a `exec.CommandContext`, lo que envía `SIGKILL` al proceso `yt-dlp`. El worker detecta `ctx.Err() != nil` después de que `cmd.Wait()` retorna y setea el estado del ítem a `cancelled`.

### Eventos (Go → frontend)

Se emiten dos eventos vía `wailsruntime.EventsEmit(a.ctx, nombre, args...)`:

| Evento | Args | Cuándo |
|---|---|---|
| `download:status` | `id int, status Status, errMsg string` | En cada transición de estado |
| `download:progress` | `id int, percent float64` | Por cada línea de progreso parseada del stdout de yt-dlp |

`setStatus` toma el mutex mientras actualiza el slice `queue` en memoria, y luego llama a `emitStatus` fuera del mutex (la emisión de eventos de Wails es segura para llamar sin el lock).

### Invocación de `yt-dlp` (`downloader.go`)

**MP3:**
```
yt-dlp --newline -x --audio-format mp3 --audio-quality <0|5|9> -o <ruta> <url>
```
Mapeo de calidad de audio: `alta → 0` (mejor), `media → 5`, `baja → 9` (escala VBR).

**MP4:**
```
yt-dlp --newline -f <selector_de_formato> --merge-output-format mp4 -o <ruta> <url>
```
Los selectores de formato priorizan streams nativos mp4+m4a para la resolución objetivo, con fallback a `best`.

**Parseo del progreso:** yt-dlp emite líneas como `[download]  45.3% of 10.00MiB at 1.23MiB/s ETA 00:05`. `extractPercent` identifica las líneas que contienen `[download]` y `%`, separa los campos por espacio y parsea el primer token que termina en `%` como float64.

**Ruta de salida:** si el usuario configuró una carpeta mediante `SetDownloadPath`, el archivo se escribe en `filepath.Join(<ruta>, "%(title)s.%(ext)s")`. En caso contrario, `defaultDownloadPath()` usa `os.UserHomeDir()` + `filepath.Join(home, "Downloads", "%(title)s.%(ext)s")` — una ruta ya resuelta por Go, no un placeholder de entorno como `%USERPROFILE%` que yt-dlp no expande. yt-dlp expande `%(title)s` y `%(ext)s` al título del video y la extensión del contenedor.

**Binario de yt-dlp:** ya no depende de una instalación global en el PATH. `ytdlpManager` (`ytdlp.go`) lo descarga a `os.UserCacheDir()/Tasutube/bin/` la primera vez que hace falta, y lo autoactualiza (`yt-dlp -U`) en background en cada inicio si ya existe. Ver `docs/superpowers/specs/2026-07-24-ytdlp-binary-manager-design.md` para el diseño completo.

### Diálogo nativo de carpetas

`OpenFolderDialog()` llama a `wailsruntime.OpenDirectoryDialog(a.ctx, options)`. En macOS abre un NSOpenPanel nativo; en Windows abre el diálogo estándar de selección de carpetas. Devuelve la ruta seleccionada como string, o un string vacío si ocurre un error o el usuario cancela.

### API exportada (vinculada al frontend)

| Método | Firma | Descripción |
|---|---|---|
| `Download` | `(url, format, quality string) int` | Encola una descarga, devuelve su ID |
| `Cancel` | `(id int)` | Cancela una descarga pendiente o en curso |
| `GetQueue` | `() []DownloadItem` | Devuelve un snapshot completo de la cola |
| `SetDownloadPath` | `(path string)` | Establece el directorio de destino |
| `OpenFolderDialog` | `() string` | Abre el selector de carpetas nativo, devuelve la ruta elegida |
