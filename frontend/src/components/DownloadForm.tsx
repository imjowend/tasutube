import { useEffect, useMemo, useState } from "react"
import {
    DEFAULT_QUALITY,
    MP3_QUALITIES,
    MP4_QUALITIES,
    type DownloadFormat,
} from "../types"

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
}

function isValidYoutubeUrl(url: string): boolean {
    return url.includes("youtube.com") || url.includes("youtu.be")
}

export function DownloadForm({ onSubmit, status, onUserTyping }: DownloadFormProps) {
    const [url, setUrl] = useState("")
    const [activeFormat, setActiveFormat] = useState<DownloadFormat>("mp3")
    const [mp3Quality, setMp3Quality] = useState<string>(DEFAULT_QUALITY.mp3)
    const [mp4Quality, setMp4Quality] = useState<string>(DEFAULT_QUALITY.mp4)
    const [submitting, setSubmitting] = useState(false)

    const qualities = useMemo(
        () => (activeFormat === "mp3" ? MP3_QUALITIES : MP4_QUALITIES),
        [activeFormat],
    )

    const selectedQuality = activeFormat === "mp3" ? mp3Quality : mp4Quality
    const setSelectedQuality = (q: string) =>
        activeFormat === "mp3" ? setMp3Quality(q) : setMp4Quality(q)

    const trimmed = url.trim()
    const urlInvalid = trimmed === "" || !isValidYoutubeUrl(trimmed)

    // If the URL changes, clear persistent validation banners by signalling upstream.
    useEffect(() => {
        if (status.type !== null && status.persistent) {
            onUserTyping()
        }
        // We intentionally only react to url changes here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url])

    async function handleClick(format: DownloadFormat) {
        setActiveFormat(format)

        if (trimmed === "") {
            // Surface validation via parent banner system
            onSubmit("", format, format === "mp3" ? mp3Quality : mp4Quality)
            return
        }
        if (!isValidYoutubeUrl(trimmed)) {
            onSubmit(trimmed, format, format === "mp3" ? mp3Quality : mp4Quality)
            return
        }

        setSubmitting(true)
        try {
            await onSubmit(trimmed, format, format === "mp3" ? mp3Quality : mp4Quality)
            setUrl("")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* URL Input */}
            <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Pegá el link de YouTube acá..."
                className="w-full px-6 py-5 text-xl bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all duration-200"
            />

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

            {/* Buttons */}
            <div className="flex gap-4">
                <button
                    onClick={() => handleClick("mp3")}
                    disabled={urlInvalid || submitting}
                    className="flex-1 px-6 py-5 text-lg bg-red-600 hover:bg-red-500 disabled:bg-red-600/40 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed"
                >
                    Descargar MP3
                </button>
                <button
                    onClick={() => handleClick("mp4")}
                    disabled={urlInvalid || submitting}
                    className="flex-1 px-6 py-5 text-lg bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-700/40 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed"
                >
                    Descargar MP4
                </button>
            </div>

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
