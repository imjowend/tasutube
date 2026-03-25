import { useState } from "react"
import { Download } from "../wailsjs/go/main/App"
import "./App.css"

type Status = {
    type: "success" | "error" | "loading" | null
    message: string
}

export default function App() {
    const [url, setUrl] = useState("")
    const [status, setStatus] = useState<Status>({ type: null, message: "" })

    async function handleDownload(format: "mp3" | "mp4") {
        if (!url.trim()) {
            setStatus({ type: "error", message: "Por favor, pegá un link de YouTube" })
            return
        }

        if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
            setStatus({ type: "error", message: "El link no parece ser de YouTube" })
            return
        }

        setStatus({ type: "loading", message: `Descargando ${format.toUpperCase()}... esto puede tardar unos segundos ⏳` })

        try {
            const result = await Download(url, format)
            if (result.success) {
                setStatus({ type: "success", message: result.message })
                setUrl("")
            } else {
                setStatus({ type: "error", message: result.message })
            }
        } catch {
            setStatus({ type: "error", message: "Hubo un error al descargar. Intentá de nuevo." })
        }
    }

    const isLoading = status.type === "loading"

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
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
                            disabled={isLoading}
                            className="w-full px-6 py-5 text-xl bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all duration-200 disabled:opacity-50"
                        />

                        {/* Buttons */}
                        <div className="flex gap-5">
                            <button
                                onClick={() => handleDownload("mp3")}
                                disabled={isLoading}
                                className="flex-1 px-6 py-6 text-xl bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <span className="inline-block w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>Descargar MP3 🎵</>
                                )}
                            </button>
                            <button
                                onClick={() => handleDownload("mp4")}
                                disabled={isLoading}
                                className="flex-1 px-6 py-6 text-xl bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-700/50 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <span className="inline-block w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>Descargar MP4 🎬</>
                                )}
                            </button>
                        </div>

                        {/* Status */}
                        {status.type && (
                            <div className={`p-5 rounded-xl text-center text-lg font-medium ${
                                status.type === "success"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : status.type === "loading"
                                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}>
                                {status.message}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-10 py-5 bg-zinc-900/50 border-t border-zinc-800">
                        <p className="text-center text-base text-zinc-600">
                            📁 Tus descargas van a la carpeta Descargas
                        </p>
                    </div>

                </div>
            </div>
        </div>
    )
}