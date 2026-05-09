import { useEffect, useMemo, useState } from "react"
import {
    DEFAULT_QUALITY,
    MP3_QUALITIES,
    MP4_QUALITIES,
    type DownloadFormat,
} from "../types"
import { OpenFolderDialog, SetDownloadPath } from "../lib/wailsBridge"

export type FormStatus =
    | {
          type: "success" | "loading" | "error" | "info"
          message: string
          /** When true, the banner does NOT auto-dismiss (used for validation errors). */
          persistent?: boolean
      }
    | { type: null; message: "" }

interface DownloadFormProps {
    onSubmit: (url: string, format: DownloadFormat, quality: string) => Promise<void> | void
    status: FormStatus
    onUserTyping: () => void
    downloadPath: string
    onPathChanged: (path: string) => void
}

function isValidYoutubeUrl(url: string): boolean {
    return url.includes("youtube.com") || url.includes("youtu.be")
}

export function DownloadForm({
    onSubmit,
    status,
    onUserTyping,
    downloadPath,
    onPathChanged,
}: DownloadFormProps) {
    const [url, setUrl] = useState("")
    const [activeFormat, setActiveFormat] = useState<DownloadFormat>("mp3")
    const [mp3Quality, setMp3Quality] = useState<string>(DEFAULT_QUALITY.mp3)
    const [mp4Quality, setMp4Quality] = useState<string>(DEFAULT_QUALITY.mp4)
    const [submitting, setSubmitting] = useState(false)
    const [picking, setPicking] = useState(false)

    const qualities = useMemo(
        () => (activeFormat === "mp3" ? MP3_QUALITIES : MP4_QUALITIES),
        [activeFormat],
    )

    const selectedQuality = activeFormat === "mp3" ? mp3Quality : mp4Quality
    const setSelectedQuality = (q: string) =>
        activeFormat === "mp3" ? setMp3Quality(q) : setMp4Quality(q)

    const trimmed = url.trim()
    const urlInvalid = trimmed === "" || !isValidYoutubeUrl(trimmed)

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
            setUrl("")
        } finally {
            setSubmitting(false)
        }
    }

    async function handlePickFolder() {
        setPicking(true)
        try {
            const selected = await OpenFolderDialog()
            if (selected) {
                await SetDownloadPath(selected)
                onPathChanged(selected)
            }
        } catch (err) {
            console.error("[v0] OpenFolderDialog failed:", err)
        } finally {
            setPicking(false)
        }
    }

    return (
        <div className="space-y-6 flex flex-col flex-1">
            {/* URL Input with folder icon */}
            <div className="relative">
                <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Pegá el link de YouTube acá..."
                    className="w-full px-6 py-5 pr-16 text-xl bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all duration-200"
                />
                <button
                    type="button"
                    onClick={handlePickFolder}
                    disabled={picking}
                    title="Elegir carpeta de destino"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <FolderIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Format Selector */}
            <div>
                <p className="text-sm text-zinc-500 mb-2 text-left">Formato</p>
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
                                onClick={() => setActiveFormat(fmt)}
                                className={
                                    "px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-150 " +
                                    (active
                                        ? "bg-red-600 border-red-500 text-white shadow"
                                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white")
                                }
                            >
                                {fmt.toUpperCase()}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Quality Selector */}
            <div>
                <p className="text-sm text-zinc-500 mb-2 text-left">
                    Calidad ({activeFormat.toUpperCase()})
                </p>
                <div
                    role="radiogroup"
                    aria-label="Selector de calidad"
                    className="flex flex-wrap gap-2"
                >
                    {qualities.map((q) => {
                        const active = selectedQuality === q.value
                        return (
                            <button
                                key={q.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setSelectedQuality(q.value)}
                                className={
                                    "px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-150 " +
                                    (active
                                        ? "bg-red-600 border-red-500 text-white shadow"
                                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white")
                                }
                            >
                                {q.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Download Button */}
            <button
                onClick={handleDownload}
                disabled={urlInvalid || submitting}
                className="w-full px-6 py-5 text-lg bg-red-600 hover:bg-red-500 disabled:bg-red-600/40 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed"
            >
                Descargar
            </button>

            {/* Destination folder */}
            <p className="text-sm text-zinc-500 text-center">
                📁 Guardando en:{" "}
                <span className="text-zinc-400">{downloadPath || "carpeta Descargas"}</span>
            </p>

            {/* Status banner */}
            {status.type && (
                <div
                    role="status"
                    className={
                        "p-4 rounded-xl text-center text-base font-medium border " +
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

function FolderIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
    )
}
