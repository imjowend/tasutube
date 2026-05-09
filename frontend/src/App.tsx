import { useEffect, useRef, useState } from "react"
import "./App.css"
import { DownloadForm, type FormStatus } from "./components/DownloadForm"
import { QueueList } from "./components/QueueList"
import { useDownloadQueue } from "./hooks/useDownloadQueue"
import type { DownloadFormat } from "./types"

export default function App() {
    const { items, enqueue, cancel } = useDownloadQueue()

    const [status, setStatus] = useState<FormStatus>({ type: null, message: "" })
    const [downloadPath, setDownloadPath] = useState("")
    const dismissTimer = useRef<number | null>(null)

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
        setStatus((prev) =>
            prev.type !== null && prev.persistent ? { type: null, message: "" } : prev,
        )
    }

    return (
        <div className="h-screen overflow-hidden bg-zinc-950 flex items-stretch justify-center p-6 font-sans">
            <div className="w-full max-w-5xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="text-center pb-5 shrink-0">
                    <h1 className="text-5xl font-bold text-zinc-100 tracking-tight">
                        Tasu<span className="text-red-500">Tube</span>
                    </h1>
                    <p className="mt-2 text-base text-zinc-500 italic">
                        para mi viejo, que le decía Tasu ❤️
                    </p>
                </div>

                {/* Two-column layout */}
                <div className="flex-1 flex gap-5 overflow-hidden min-h-0">
                    {/* Left: Form */}
                    <div className="flex-1 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl p-8 flex flex-col">
                        <DownloadForm
                            onSubmit={handleSubmit}
                            status={status}
                            onUserTyping={clearTransientStatus}
                            downloadPath={downloadPath}
                            onPathChanged={setDownloadPath}
                        />
                    </div>

                    {/* Right: Queue */}
                    <div className="flex-1 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl p-8 flex flex-col overflow-hidden">
                        <QueueList items={items} onCancel={cancel} />
                    </div>
                </div>
            </div>
        </div>
    )
}
