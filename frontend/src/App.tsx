import { useState, useEffect } from "react"
import { Download, Cancel, SetDownloadPath } from "../wailsjs/go/main/App"
import { EventsOn, OpenDirectoryDialog } from "../wailsjs/runtime/runtime"
import "./App.css"

type DownloadStatus = "pending" | "downloading" | "completed" | "cancelled" | "error"

type DownloadItem = {
    id: number
    url: string
    format: string
    quality: string
    status: DownloadStatus
    progress: number
    error?: string
}

export default function App() {
    const [url, setUrl] = useState("")
    const [downloads, setDownloads] = useState<DownloadItem[]>([])
    const [downloadPath, setDownloadPath] = useState("")

    useEffect(() => {
        const offProgress = EventsOn("download:progress", (id: number, percent: number) => {
            setDownloads(prev =>
                prev.map(d => (d.id === id ? { ...d, progress: percent } : d))
            )
        })

        const offStatus = EventsOn("download:status", (id: number, status: string, error?: string) => {
            setDownloads(prev =>
                prev.map(d =>
                    d.id === id ? { ...d, status: status as DownloadStatus, error } : d
                )
            )
        })

        return () => {
            offProgress()
            offStatus()
        }
    }, [])

    async function handleDownload(format: "mp3" | "mp4") {
        if (!url.trim()) return
        if (!url.includes("youtube.com") && !url.includes("youtu.be")) return

        try {
            const id = await Download(url, format, "best")
            setDownloads(prev => [
                { id, url, format, quality: "best", status: "pending", progress: 0 },
                ...prev,
            ])
            setUrl("")
        } catch {
            // status event will carry any error from the backend
        }
    }

    async function handleCancel(id: number) {
        await Cancel(id)
    }

    async function handleSelectFolder() {
        const path = await OpenDirectoryDialog({ Title: "Seleccionar carpeta de descargas" })
        if (path) {
            setDownloadPath(path)
            await SetDownloadPath(path)
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl flex flex-col gap-4">

                {/* Main Card */}
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">

                    {/* Header */}
                    <div className="px-10 pt-10 pb-8 text-center border-b border-zinc-800">
                        <h1 className="text-6xl font-bold text-zinc-100 tracking-tight">
                            Tasu<span className="text-red-500">Tube</span>
                        </h1>
                        <p className="mt-3 text-lg text-zinc-500 italic">
                            para mi viejo, que le decía Tasu ❤️
                        </p>
                    </div>

                    {/* Content */}
                    <div className="p-10 space-y-8">

                        {/* URL Input */}
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Pegá el link de YouTube acá..."
                            className="w-full px-6 py-5 text-xl bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all duration-200"
                        />

                        {/* Buttons */}
                        <div className="flex gap-5">
                            <button
                                onClick={() => handleDownload("mp3")}
                                className="flex-1 px-6 py-6 text-xl bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3"
                            >
                                Descargar MP3 🎵
                            </button>
                            <button
                                onClick={() => handleDownload("mp4")}
                                className="flex-1 px-6 py-6 text-xl bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3"
                            >
                                Descargar MP4 🎬
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-10 py-5 bg-zinc-900/50 border-t border-zinc-800 flex items-center justify-center gap-3">
                        <button
                            onClick={handleSelectFolder}
                            className="text-base text-zinc-600 hover:text-zinc-400 transition-colors duration-200"
                        >
                            📁 Cambiar carpeta de descargas
                        </button>
                        {downloadPath && (
                            <span className="text-sm text-zinc-500 truncate max-w-xs">{downloadPath}</span>
                        )}
                    </div>

                </div>

                {/* Downloads list */}
                {downloads.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {downloads.map(d => (
                            <DownloadRow key={d.id} item={d} onCancel={handleCancel} />
                        ))}
                    </div>
                )}

            </div>
        </div>
    )
}

function DownloadRow({ item, onCancel }: { item: DownloadItem; onCancel: (id: number) => void }) {
    const label = item.url.length > 52 ? item.url.slice(0, 49) + "..." : item.url

    const statusColor: Record<DownloadStatus, string> = {
        pending: "text-zinc-400",
        downloading: "text-blue-400",
        completed: "text-emerald-400",
        cancelled: "text-zinc-500",
        error: "text-red-400",
    }

    const statusLabel: Record<DownloadStatus, string> = {
        pending: "Pendiente",
        downloading: `${item.progress}%`,
        completed: "Completado ✓",
        cancelled: "Cancelado",
        error: item.error ?? "Error",
    }

    const canCancel = item.status === "pending" || item.status === "downloading"

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-zinc-500 uppercase shrink-0">{item.format}</span>
                    <span className="text-sm text-zinc-300 truncate">{label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-semibold ${statusColor[item.status]}`}>
                        {statusLabel[item.status]}
                    </span>
                    {canCancel && (
                        <button
                            onClick={() => onCancel(item.id)}
                            className="text-xs text-zinc-500 hover:text-red-400 transition-colors duration-200"
                        >
                            Cancelar
                        </button>
                    )}
                </div>
            </div>

            {(item.status === "downloading" || item.status === "pending") && (
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-red-500 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                    />
                </div>
            )}
        </div>
    )
}
