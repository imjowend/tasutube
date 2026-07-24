# TasuTube 🎵🎬

> *para mi viejo, que le decía Tasu ❤️*

Aplicación de escritorio para descargar videos de YouTube en MP3 o MP4. Hecha con amor para uso personal y familiar.

---

## Stack

- **[Wails v2](https://wails.io/)** — framework para apps de escritorio con Go + Web
- **Go 1.23** — backend, cola de descargas y lógica de procesos
- **React 18 + TypeScript** — frontend
- **Tailwind CSS** — estilos
- **Vite** — bundler del frontend
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — motor de descarga
- **ffmpeg** — conversión de audio/video (requerido por yt-dlp)

---

## Funcionalidades

- Descargar audio en **MP3** con selección de calidad (Alta / Media / Baja)
- Descargar video en **MP4** con selección de resolución (1080p / 720p / 480p / Auto)
- **Cola de descargas** con hasta 3 descargas en paralelo
- **Cancelación** de descargas en curso o en cola
- **Progreso en tiempo real** por ítem (barra de porcentaje)
- **Carpeta de destino configurable** mediante el selector de carpeta nativo del sistema operativo
- Por defecto las descargas van a la carpeta `~/Downloads` (o `%USERPROFILE%\Downloads` en Windows)
- Interfaz de dos columnas pensada para escritorio: formulario a la izquierda, cola a la derecha

---

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

---

## Desarrollo local

### Requisitos

- Go 1.23+
- Node.js 18+
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Levantar en modo desarrollo

```bash
git clone https://github.com/imjowend/tasutube.git
cd tasutube
wails dev
```

Wails levanta el backend en Go y el frontend con Vite en modo hot-reload. La app se abre como ventana de escritorio nativa (1024×768).

---

## Compilar

```bash
wails build
```

El binario/bundle queda en `build/bin/`. En macOS produce `tasutube.app`.

---

## Estructura del proyecto

```
tasutube/
├── main.go              # Punto de entrada: inicializa Wails y embeds del frontend
├── app.go               # Struct App: API expuesta al frontend, cola, worker pool
├── downloader.go        # Lógica de invocación de yt-dlp, parsing de progreso
├── go.mod / go.sum
├── wails.json           # Configuración del proyecto Wails
├── build/               # Assets de build (íconos, manifests, Info.plist)
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── src/
    │   ├── main.tsx         # Punto de entrada React
    │   ├── App.tsx          # Componente raíz, layout de dos columnas
    │   ├── App.css          # Estilos globales (Tailwind + overflow hidden)
    │   ├── types.ts         # Tipos compartidos (DownloadItem, formatos, calidades)
    │   ├── components/
    │   │   ├── DownloadForm.tsx   # Formulario: URL, formato, calidad, botón descargar
    │   │   ├── QueueList.tsx      # Columna derecha: lista de descargas
    │   │   └── QueueItem.tsx      # Ítem individual con progreso y estado
    │   ├── hooks/
    │   │   └── useDownloadQueue.ts  # Hook: sincroniza cola con el backend vía eventos
    │   └── lib/
    │       └── wailsBridge.ts     # Abstracción Wails runtime / simulador de browser
    └── wailsjs/             # Bindings autogenerados por Wails (no editar)
        ├── go/main/App.js
        ├── go/main/App.d.ts
        ├── go/models.ts
        └── runtime/
```

---

## Aviso legal

Esta app es de **uso personal y privado**. Respetar los términos de servicio de YouTube y los derechos de autor del contenido descargado.

---

*Hecho con Go, React y mucho cariño* ❤️
