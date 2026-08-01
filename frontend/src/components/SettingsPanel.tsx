import { useEffect, useState } from "react"
import { useFolderPicker } from "../hooks/useFolderPicker"
import { BACK_BUTTON_CLASSES } from "../lib/ui"
import {
    ForceUpdateYtdlp,
    GetWindowSize,
    IsAutostartEnabled,
    SetAutostart,
    SetWindowSize,
} from "../lib/wailsBridge"
import { GearIcon, RefreshIcon } from "./icons"

interface SettingsPanelProps {
    path: string
    onPathSaved: (path: string) => void
    onBack: () => void
}

const PRESET_RESOLUTIONS = [
    { value: "1600x900", width: 1600, height: 900, label: "1600 x 900 (Grande / Predeterminado)" },
    { value: "1280x720", width: 1280, height: 720, label: "1280 x 720 (Mediano)" },
    { value: "1024x768", width: 1024, height: 768, label: "1024 x 768 (Pequeño)" },
]

export function SettingsPanel({
    path,
    onPathSaved,
    onBack,
}: SettingsPanelProps) {
    const { picking, pickFolder } = useFolderPicker(onPathSaved)

    // yt-dlp update state
    const [updatingYtdlp, setUpdatingYtdlp] = useState(false)
    const [ytdlpMsg, setYtdlpMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

    // autostart state
    const [autostart, setAutostartState] = useState(false)

    // window size state
    const [currentSize, setCurrentSize] = useState<{ width: number; height: number }>({
        width: 1600,
        height: 900,
    })

    useEffect(() => {
        IsAutostartEnabled().then((enabled) => setAutostartState(enabled))
        refreshWindowSize()

        const handleResize = () => {
            refreshWindowSize()
        }
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    async function refreshWindowSize() {
        try {
            const size = await GetWindowSize()
            if (size && size.width > 0 && size.height > 0) {
                setCurrentSize(size)
            } else {
                setCurrentSize({ width: window.innerWidth, height: window.innerHeight })
            }
        } catch {
            setCurrentSize({ width: window.innerWidth, height: window.innerHeight })
        }
    }

    const matchedPreset = PRESET_RESOLUTIONS.find(
        (r) => r.width === currentSize.width && r.height === currentSize.height,
    )
    const activeResValue = matchedPreset ? matchedPreset.value : "custom"

    async function handleResolutionChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const val = e.target.value
        if (val === "custom") return
        const target = PRESET_RESOLUTIONS.find((r) => r.value === val)
        if (target) {
            try {
                await SetWindowSize(target.width, target.height)
                setCurrentSize({ width: target.width, height: target.height })
            } catch (err) {
                console.error("[v0] SetWindowSize failed:", err)
            }
        }
    }

    async function handleForceUpdateYtdlp() {
        setUpdatingYtdlp(true)
        setYtdlpMsg(null)
        try {
            const msg = await ForceUpdateYtdlp()
            setYtdlpMsg({ type: "success", text: msg || "yt-dlp fue actualizado con éxito." })
        } catch (err) {
            setYtdlpMsg({
                type: "error",
                text: err instanceof Error ? err.message : "Error al actualizar yt-dlp desde GitHub.",
            })
        } finally {
            setUpdatingYtdlp(false)
        }
    }

    async function handleToggleAutostart() {
        const next = !autostart
        try {
            await SetAutostart(next)
            setAutostartState(next)
        } catch (err) {
            console.error("[v0] SetAutostart failed:", err)
        }
    }

    return (
        <div className="flex flex-col flex-1 justify-between space-y-6">
            <div className="space-y-5 text-left">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                        <GearIcon className="w-5 h-5 text-red-500" />
                        <span>Ajustes</span>
                    </h2>
                    <button
                        type="button"
                        onClick={onBack}
                        className={BACK_BUTTON_CLASSES}
                    >
                        ← Volver a Descargar
                    </button>
                </div>

                {/* Folder selection */}
                <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                        Carpeta de destino predeterminada
                    </label>
                    <button
                        type="button"
                        onClick={pickFolder}
                        disabled={picking}
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-left text-sm transition-all hover:bg-zinc-700/80 hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className={path ? "text-zinc-100 font-mono text-xs" : "text-zinc-500"}>
                            {picking ? "Abriendo selector..." : path || "Elegir carpeta..."}
                        </span>
                    </button>
                </div>

                {/* Window Size Resolution */}
                <div className="pt-3 border-t border-zinc-800/80">
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                        Tamaño de la ventana de la aplicación
                    </label>
                    <select
                        value={activeResValue}
                        onChange={handleResolutionChange}
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-red-500/50 cursor-pointer"
                    >
                        {PRESET_RESOLUTIONS.map((res) => (
                            <option key={res.value} value={res.value}>
                                {res.label}
                            </option>
                        ))}
                        {!matchedPreset && (
                            <option value="custom">
                                Personalizado ({currentSize.width} x {currentSize.height})
                            </option>
                        )}
                    </select>
                    <p className="text-[11px] text-zinc-500 mt-1.5">
                        Podés achicar o agrandar la ventana manualmente. Si cambia el tamaño, se ajustará automáticamente a Personalizado.
                    </p>
                </div>

                {/* Motor yt-dlp */}
                <div className="pt-3 border-t border-zinc-800/80">
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                        Motor de descargas (yt-dlp)
                    </label>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleForceUpdateYtdlp}
                            disabled={updatingYtdlp}
                            className="w-full px-4 py-3 bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700 rounded-xl text-xs font-semibold text-zinc-200 transition-all hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <RefreshIcon className={`w-4 h-4 ${updatingYtdlp ? "animate-spin text-red-400" : ""}`} />
                            {updatingYtdlp ? "Actualizando desde GitHub Releases..." : "Forzar actualización de yt-dlp"}
                        </button>
                    </div>
                    {ytdlpMsg && (
                        <p
                            className={`mt-2 text-xs font-medium ${
                                ytdlpMsg.type === "success" ? "text-emerald-400" : "text-red-400"
                            }`}
                        >
                            {ytdlpMsg.text}
                        </p>
                    )}
                </div>

                {/* Windows Autostart */}
                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-zinc-200">Iniciar con Windows</p>
                        <p className="text-[11px] text-zinc-500">
                            Iniciar TasuTube automáticamente al encender la PC
                        </p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={autostart}
                        onClick={handleToggleAutostart}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            autostart ? "bg-red-600" : "bg-zinc-700"
                        }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                autostart ? "translate-x-5" : "translate-x-0"
                            }`}
                        />
                    </button>
                </div>
            </div>

            {/* Back Button */}
            <button
                type="button"
                onClick={onBack}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold rounded-xl transition-all active:scale-[0.98]"
            >
                Guardar y Volver
            </button>
        </div>
    )
}
