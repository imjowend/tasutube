import { useCallback, useEffect, useRef, useState } from "react"
import "./App.css"
import { AdvancedPanel } from "./components/AdvancedPanel"
import { DownloadForm, type FormStatus } from "./components/DownloadForm"
import { QueueList } from "./components/QueueList"
import { SettingsPanel } from "./components/SettingsPanel"
import { useDownloadQueue } from "./hooks/useDownloadQueue"
import { errorMessage } from "./lib/errors"
import { DEFAULT_QUALITY, type DownloadFormat, type VideoMetadata } from "./types"

export default function App() {
    const [activeView, setActiveView] = useState<"download" | "advanced" | "settings">("download")
    const [url, setUrl] = useState("")
    const [status, setStatus] = useState<FormStatus>({ type: null, message: "" })

    const reportBackendError = useCallback((message: string) => {
        setStatus({ type: "error", message, persistent: true })
    }, [])

    const { items, enqueue, cancel } = useDownloadQueue(reportBackendError)
    const [downloadPath, setDownloadPath] = useState("")
    const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
    const [activeFormat, setActiveFormat] = useState<DownloadFormat>("mp3")
    const [selectedQuality, setSelectedQuality] = useState<string>(DEFAULT_QUALITY.mp3)
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

    function handleFormatChange(fmt: DownloadFormat) {
        setActiveFormat(fmt)
        setSelectedQuality(DEFAULT_QUALITY[fmt])
    }

    async function handleSubmit(submittedUrl: string, format: DownloadFormat, quality: string) {
        if (!submittedUrl) {
            setStatus({
                type: "error",
                message: "Por favor, pegá un link de YouTube",
                persistent: true,
            })
            return
        }
        if (!submittedUrl.includes("youtube.com") && !submittedUrl.includes("youtu.be")) {
            setStatus({
                type: "error",
                message: "El link no parece ser de YouTube",
                persistent: true,
            })
            return
        }

        try {
            await enqueue(submittedUrl, format, quality)
            setStatus({
                type: "success",
                message: `Agregado a la cola: ${format.toUpperCase()}`,
            })
        } catch (err) {
            console.error("[tasutube] enqueue failed:", err)
            setStatus({
                type: "error",
                message: errorMessage(
                    err,
                    "Hubo un error al iniciar la descarga. Intentá de nuevo.",
                ),
                persistent: true,
            })
        }
    }

    function clearTransientStatus() {
        setStatus((prev) =>
            prev.type !== null && prev.persistent ? { type: null, message: "" } : prev,
        )
    }

    return (
        <div className="h-screen overflow-hidden bg-zinc-950 flex items-stretch justify-center p-6 font-sans select-none">
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
                    {/* Left Column Card */}
                    <div className="flex-1 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl p-8 flex flex-col overflow-hidden relative">
                        {activeView === "download" ? (
                            <div className="view-transition flex flex-col flex-1 h-full">
                                <DownloadForm
                                    url={url}
                                    onUrlChange={setUrl}
                                    onSubmit={handleSubmit}
                                    status={status}
                                    onUserTyping={clearTransientStatus}
                                    downloadPath={downloadPath}
                                    onPathChanged={setDownloadPath}
                                    onOpenSettings={() => setActiveView("settings")}
                                    onOpenAdvanced={() => setActiveView("advanced")}
                                    metadata={metadata}
                                    onMetadataLoaded={setMetadata}
                                    activeFormat={activeFormat}
                                    onFormatChange={handleFormatChange}
                                    selectedQuality={selectedQuality}
                                    onQualityChange={setSelectedQuality}
                                />
                            </div>
                        ) : activeView === "advanced" ? (
                            <div className="view-transition flex flex-col flex-1 h-full">
                                <AdvancedPanel
                                    activeFormat={activeFormat}
                                    selectedQuality={selectedQuality}
                                    onSelectQuality={setSelectedQuality}
                                    metadata={metadata}
                                    onBack={() => setActiveView("download")}
                                />
                            </div>
                        ) : (
                            <div className="view-transition flex flex-col flex-1 h-full">
                                <SettingsPanel
                                    path={downloadPath}
                                    onPathSaved={setDownloadPath}
                                    onBack={() => setActiveView("download")}
                                />
                            </div>
                        )}
                    </div>

                    {/* Right Column Card */}
                    <div className="flex-1 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl p-8 flex flex-col overflow-hidden">
                        <QueueList items={items} onCancel={cancel} />
                    </div>
                </div>
            </div>
        </div>
    )
}
