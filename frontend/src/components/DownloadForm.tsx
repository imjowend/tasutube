import { useEffect, useMemo, useState } from "react"
import {
    MP3_QUALITIES,
    MP4_QUALITIES,
    type DownloadFormat,
    type VideoMetadata,
} from "../types"
import { useFolderPicker } from "../hooks/useFolderPicker"
import { errorMessage } from "../lib/errors"
import { selectableClasses } from "../lib/ui"
import { GetDownloadPath, GetVideoInfo } from "../lib/wailsBridge"
import { isValidYoutubeUrl } from "../lib/youtube"
import { FolderIcon, GearIcon } from "./icons"

export type FormStatus =
    | {
          type: "success" | "loading" | "error" | "info"
          message: string
          /** When true, the banner does NOT auto-dismiss (used for validation errors). */
          persistent?: boolean
      }
    | { type: null; message: "" }

interface DownloadFormProps {
    url: string
    onUrlChange: (url: string) => void
    onSubmit: (url: string, format: DownloadFormat, quality: string) => Promise<void> | void
    status: FormStatus
    onUserTyping: () => void
    downloadPath: string
    onPathChanged: (path: string) => void
    onOpenSettings: () => void
    onOpenAdvanced: () => void
    metadata: VideoMetadata | null
    onMetadataLoaded: (meta: VideoMetadata | null) => void
    activeFormat: DownloadFormat
    onFormatChange: (fmt: DownloadFormat) => void
    selectedQuality: string
    onQualityChange: (q: string) => void
}

export function DownloadForm({
    url,
    onUrlChange,
    onSubmit,
    status,
    onUserTyping,
    downloadPath,
    onPathChanged,
    onOpenSettings,
    onOpenAdvanced,
    metadata,
    onMetadataLoaded,
    activeFormat,
    onFormatChange,
    selectedQuality,
    onQualityChange,
}: DownloadFormProps) {
    const [analyzedUrl, setAnalyzedUrl] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const { picking, pickFolder, folderError, setFolderError } = useFolderPicker(onPathChanged)
    const [analyzeError, setAnalyzeError] = useState<string | null>(null)

    const qualities = useMemo(
        () => (activeFormat === "mp3" ? MP3_QUALITIES : MP4_QUALITIES),
        [activeFormat],
    )

    const trimmed = url.trim()
    const urlInvalid = trimmed === "" || !isValidYoutubeUrl(trimmed)

    useEffect(() => {
        if (!downloadPath) {
            GetDownloadPath()
                .then((p) => {
                    if (p) onPathChanged(p)
                })
                .catch((err) => {
                    setFolderError(
                        errorMessage(err, "No se pudo leer la carpeta de destino"),
                    )
                })
        }
    }, [downloadPath, onPathChanged])

    // Auto-analyze video metadata when URL changes
    useEffect(() => {
        if (isValidYoutubeUrl(trimmed)) {
            if (trimmed === analyzedUrl) return

            setAnalyzedUrl(trimmed)
            setAnalyzing(true)
            setAnalyzeError(null)
            GetVideoInfo(trimmed)
                .then((meta) => {
                    onMetadataLoaded(meta)
                })
                .catch((err) => {
                    console.error("[tasutube] GetVideoInfo failed:", err)
                    onMetadataLoaded(null)
                    setAnalyzeError(
                        errorMessage(
                            err,
                            "No se pudo analizar el video. Igual podés intentar descargarlo.",
                        ),
                    )
                })
                .finally(() => {
                    setAnalyzing(false)
                })
        } else {
            if (analyzedUrl !== "") {
                setAnalyzedUrl("")
                onMetadataLoaded(null)
                setAnalyzeError(null)
            }
        }
    }, [trimmed, analyzedUrl, onMetadataLoaded])

    useEffect(() => {
        if (status.type !== null && status.persistent) {
            onUserTyping()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url])

    async function handleDownload() {
        if (trimmed === "" || !isValidYoutubeUrl(trimmed)) {
            onSubmit(trimmed, activeFormat, selectedQuality)
            return
        }

        setSubmitting(true)
        try {
            await onSubmit(trimmed, activeFormat, selectedQuality)
            onUrlChange("")
            setAnalyzedUrl("")
            onMetadataLoaded(null)
        } finally {
            setSubmitting(false)
        }
    }


    // Is the currently selected quality a custom/advanced resolution (like 2160p or 1440p or custom bitrate)?
    const isCustomQualitySelected = useMemo(() => {
        if (activeFormat === "mp4") {
            return !["1080p", "720p", "480p", "auto"].includes(selectedQuality)
        }
        return !["alta", "media", "baja"].includes(selectedQuality)
    }, [activeFormat, selectedQuality])

    const customQualityLabel = useMemo(() => {
        if (activeFormat === "mp4") {
            if (selectedQuality === "2160p") return "✨ 4K (2160p)"
            if (selectedQuality === "1440p") return "✨ 2K (1440p)"
            if (selectedQuality === "360p") return "360p SD"
            if (selectedQuality === "240p") return "240p SD"
            if (selectedQuality === "144p") return "144p SD"
            return `✨ ${selectedQuality}`
        }
        if (selectedQuality === "0") return "🎵 320 kbps (Máxima V0)"
        if (selectedQuality === "2") return "🎵 256 kbps (Alta)"
        return `🎵 ${selectedQuality}`
    }, [activeFormat, selectedQuality])

    return (
        <div className="space-y-6 flex flex-col flex-1 justify-between">
            <div className="space-y-5">
                {/* URL Input */}
                <div className="relative">
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        placeholder="Pegá el link de YouTube acá..."
                        className="w-full px-5 py-4 pr-14 text-sm sm:text-base font-mono bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all duration-200"
                    />
                    <button
                        type="button"
                        onClick={pickFolder}
                        disabled={picking}
                        title="Elegir carpeta de destino"
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <FolderIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Video Metadata Preview Card */}
                {analyzing ? (
                    <div className="p-3.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-xs text-zinc-400 flex items-center justify-center gap-2 animate-pulse">
                        <span className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        <span>Analizando calidad del video de YouTube...</span>
                    </div>
                ) : analyzeError ? (
                    <p
                        role="alert"
                        className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 text-left"
                    >
                        {analyzeError}
                    </p>
                ) : metadata ? (
                    <div className="p-3 bg-zinc-800/80 border border-zinc-700 rounded-xl flex items-center gap-3">
                        {metadata.thumbnail && (
                            <img
                                src={metadata.thumbnail}
                                alt={metadata.title}
                                className="w-16 h-12 object-cover rounded-lg shrink-0 border border-zinc-700"
                            />
                        )}
                        <div className="overflow-hidden text-left">
                            <p className="text-xs font-semibold text-zinc-100 truncate">{metadata.title || "Video de YouTube"}</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                                {metadata.maxHeight > 0 ? (
                                    <>Res. Máxima: <span className="text-red-400 font-bold">{metadata.maxHeight}p</span></>
                                ) : (
                                    <>Audio Nativo: <span className="text-red-400 font-bold">{metadata.maxAudioBitrate || 160} kbps</span> ({metadata.audioCodec || "Opus"})</>
                                )}
                                {metadata.maxHeight > 0 && metadata.maxAudioBitrate > 0 && (
                                    <span> • Audio: <span className="text-zinc-300 font-mono">{metadata.maxAudioBitrate} kbps</span></span>
                                )}
                            </p>
                        </div>
                    </div>
                ) : null}

                {/* Format Selector */}
                <div className="text-left">
                    <p className="text-base font-semibold text-zinc-200 mb-2">Formato</p>
                    <div
                        role="radiogroup"
                        aria-label="Selector de formato"
                        className="flex gap-2"
                    >
                        {(["mp3", "mp4"] as DownloadFormat[]).map((fmt) => {
                            const active = activeFormat === fmt
                            return (
                                <button
                                    key={fmt}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => onFormatChange(fmt)}
                                    className={selectableClasses(
                                        "px-5 py-2.5 rounded-xl text-sm font-bold border transition-all duration-150 active:scale-95",
                                        { selected: active },
                                    )}
                                >
                                    {fmt.toUpperCase()}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Quality Selector */}
                <div className="text-left">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-base font-semibold text-zinc-200">
                            Calidad ({activeFormat.toUpperCase()})
                        </p>
                        <button
                            type="button"
                            onClick={onOpenAdvanced}
                            className="text-xs font-semibold text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 transition-colors"
                        >
                            <span>⚙️ Opciones avanzadas</span>
                        </button>
                    </div>

                    <div
                        role="radiogroup"
                        aria-label="Selector de calidad"
                        className="flex flex-wrap gap-2"
                    >
                        {qualities.map((q) => {
                            const active = selectedQuality === q.value
                            // Lock video resolution if it exceeds video's max height
                            let isLocked = false
                            if (activeFormat === "mp4" && metadata && metadata.maxHeight > 0) {
                                const heightVal = parseInt(q.value.replace("p", ""), 10)
                                if (!isNaN(heightVal) && heightVal > metadata.maxHeight) {
                                    isLocked = true
                                }
                            }

                            return (
                                <button
                                    key={q.value}
                                    type="button"
                                    role="radio"
                                    disabled={isLocked}
                                    aria-checked={active}
                                    onClick={() => onQualityChange(q.value)}
                                    className={selectableClasses(
                                        "px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-150 active:scale-95",
                                        { selected: active, disabled: isLocked },
                                    )}
                                >
                                    {q.label} {isLocked && "🔒"}
                                </button>
                            )
                        })}

                        {/* Custom Advanced Quality Badge when selected */}
                        {isCustomQualitySelected && (
                            <button
                                type="button"
                                onClick={onOpenAdvanced}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold border bg-emerald-600/90 border-emerald-500 text-white shadow-lg flex items-center gap-1.5 animate-pulse"
                            >
                                <span>{customQualityLabel}</span>
                                <span className="text-xs bg-emerald-700 px-1.5 py-0.5 rounded font-mono">Activo</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Download Button */}
                <button
                    onClick={handleDownload}
                    disabled={urlInvalid || submitting}
                    className="w-full px-6 py-5 text-lg bg-red-600 hover:bg-red-500 disabled:bg-red-600/40 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed active:scale-[0.99] shadow-xl"
                >
                    Descargar
                </button>
            </div>

            {/* Bottom bar: Folder path & Settings button with LARGER typography */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                <div className="flex items-center gap-2 truncate">
                    <span className="text-base">📁</span>
                    {folderError ? (
                        <span role="alert" className="text-sm font-medium text-red-400 truncate max-w-[280px]" title={folderError}>
                            {folderError}
                        </span>
                    ) : (
                        <span className="text-sm font-medium text-zinc-200 font-mono truncate max-w-[280px]" title={downloadPath}>
                            {downloadPath || "Cargando ruta..."}
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300 hover:text-white transition-all hover:scale-105 active:scale-95 shrink-0 px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80"
                >
                    <GearIcon className="w-4 h-4 text-zinc-400" />
                    <span>Ajustes</span>
                </button>
            </div>

            {/* Status banner */}
            {status.type && (
                <div
                    role="status"
                    className={
                        "p-4 rounded-xl text-center text-base font-medium border transition-all duration-200 " +
                        (status.type === "success"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : status.type === "loading"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : status.type === "info"
                                ? "bg-zinc-700/30 text-zinc-300 border-zinc-700"
                                : "bg-red-500/10 text-red-400 border-red-500/20")
                    }
                >
                    {status.message}
                </div>
            )}
        </div>
    )
}
