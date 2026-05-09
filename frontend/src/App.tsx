import { useEffect, useRef, useState } from "react"
import "./App.css"
import { DownloadForm, type FormStatus } from "./components/DownloadForm"
import { QueueList } from "./components/QueueList"
import { SettingsPanel } from "./components/SettingsPanel"
import { useDownloadQueue } from "./hooks/useDownloadQueue"
import type { DownloadFormat } from "./types"

const DEFAULT_PATH_LABEL = "carpeta Descargas"

export default function App() {
    const { items, enqueue, cancel } = useDownloadQueue()

    const [status, setStatus] = useState<FormStatus>({ type: null, message: "" })
    const [downloadPath, setDownloadPath] = useState("")
    const dismissTimer = useRef<number | null>(null)

    // Auto-dismiss any non-persistent banner after 3s.
    // Validation errors are marked persistent and stay until the user starts typing again.
    useEffect(() => {
        if (dismissTimer.current) {
            window.clearTimeout(dismissTimer.current)
            dismissTimer.current = null
        }
        if (status.type !== null && !status.persistent) {
            dismissTimer.current = window.setTimeout(() => {
                setStatus({ type: null, message: "" })
            }, 3000)
        }
        return () => {
            if (dismissTimer.current) {
                window.clearTimeout(dismissTimer.current)
                dismissTimer.current = null
            }
        }
    }, [status])

    async function handleSubmit(url: string, format: DownloadFormat, quality: string) {
        if (!url) {
            setStatus({
                type: "error",
                message: "Por favor, pegá un link de YouTube",
                persistent: true,
            })
            return
        }
        if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
            setStatus({
                type: "error",
                message: "El link no parece ser de YouTube",
                persistent: true,
            })
            return
        }

        try {
            await enqueue(url, format, quality)
            setStatus({
                type: "success",
                message: `Agregado a la cola: ${format.toUpperCase()}`,
            })
        } catch (err) {
            console.error("[v0] enqueue failed:", err)
            setStatus({
                type: "error",
                message: "Hubo un error al iniciar la descarga. Intentá de nuevo.",
            })
        }
    }

    function clearTransientStatus() {
        // Called by the form when the user types: clear persistent validation errors.
        setStatus((prev) => (prev.type !== null && prev.persistent ? { type: null, message: "" } : prev))
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex items-start justify-center p-6 font-sans">
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

                    {/* Form */}
                    <div className="p-10">
                        <DownloadForm
                            onSubmit={handleSubmit}
                            status={status}
                            onUserTyping={clearTransientStatus}
                        />
                    </div>

                    {/* Queue */}
                    <QueueList items={items} onCancel={cancel} />

                    {/* Settings */}
                    <SettingsPanel path={downloadPath} onPathSaved={setDownloadPath} />

                    {/* Footer */}
                    <div className="px-10 py-5 bg-zinc-900/50 border-t border-zinc-800">
                        <p className="text-center text-base text-zinc-600">
                            📁 Tus descargas van a{" "}
                            <span className="text-zinc-400">
                                {downloadPath || DEFAULT_PATH_LABEL}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
