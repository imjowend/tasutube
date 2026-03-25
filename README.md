# TasuTube 🎵🎬

> *para mi viejo, que le decía Tasu ❤️*

Aplicación de escritorio para descargar videos de YouTube en MP3 o MP4. Hecha con amor para uso personal y familiar.

---

## Stack

- **[Wails v2](https://wails.io/)** — framework para apps de escritorio con Go + Web
- **Go** — backend y lógica de descarga
- **React + TypeScript** — frontend
- **Tailwind CSS** — estilos
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — motor de descarga
- **ffmpeg** — conversión de audio/video

---

## Funcionalidades

- Descargar audio en **MP3** (máxima calidad)
- Descargar video en **MP4** (compatible con reproductores estándar)
- Las descargas van directo a la carpeta **Descargas** del usuario
- Interfaz simple pensada para cualquier persona

---

## Requisitos previos

Tener instalado en el sistema:

- [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases)
- [ffmpeg](https://www.gyan.dev/ffmpeg/builds/)
- Ambos deben estar en el **PATH** del sistema

---

## Desarrollo local

```bash
# Clonar el repo
git clone https://github.com/imjowend/tasutube.git
cd tasutube

# Instalar dependencias y levantar en modo desarrollo
wails dev
```

Requisitos para desarrollar:
- Go 1.21+
- Node.js 18+
- Wails CLI v2

---

## Compilar

```bash
wails build
```

El ejecutable queda en `build/bin/`.

---

## Roadmap v2

- [ ] Descarga de múltiples links simultáneos (concurrencia)
- [ ] Barra de progreso con porcentaje
- [ ] Selector de carpeta de destino

---

## Aviso legal

Esta app es para **uso personal y privado**. Respetar los términos de servicio de YouTube y los derechos de autor del contenido descargado.

---

*Hecho con Go, React y mucho cariño* ❤️