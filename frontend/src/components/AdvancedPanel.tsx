import { type DownloadFormat, type VideoMetadata } from "../types"

interface AdvancedPanelProps {
    activeFormat: DownloadFormat
    selectedQuality: string
    onSelectQuality: (quality: string) => void
    metadata: VideoMetadata | null
    onBack: () => void
}

const ALL_VIDEO_RESOLUTIONS = [
    { value: "2160p", height: 2160, label: "4K (2160p)" },
    { value: "1440p", height: 1440, label: "2K (1440p)" },
    { value: "1080p", height: 1080, label: "1080p Full HD" },
    { value: "720p", height: 720, label: "720p HD" },
    { value: "480p", height: 480, label: "480p SD" },
    { value: "360p", height: 360, label: "360p SD" },
    { value: "240p", height: 240, label: "240p SD" },
    { value: "144p", height: 144, label: "144p SD" },
]

const AUDIO_BITRATES = [
    { value: "0", label: "320 kbps / Máxima (V0)" },
    { value: "2", label: "256 kbps (Alta)" },
    { value: "5", label: "192 kbps (Media)" },
    { value: "9", label: "128 kbps (Baja)" },
]

export function AdvancedPanel({
    activeFormat,
    selectedQuality,
    onSelectQuality,
    metadata,
    onBack,
}: AdvancedPanelProps) {
    return (
        <div className="flex flex-col flex-1 justify-between space-y-6">
            <div className="space-y-6 text-left">
                {/* Top header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                        <span className="text-red-500">⚙️</span>
                        <span>Opciones Avanzadas</span>
                    </h2>
                    <button
                        type="button"
                        onClick={onBack}
                        className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all hover:scale-105 active:scale-95"
                    >
                        ← Volver al Formulario
                    </button>
                </div>

                {/* Metadata Info Card if loaded */}
                {metadata && (
                    <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3.5 flex items-center gap-3">
                        {metadata.thumbnail && (
                            <img
                                src={metadata.thumbnail}
                                alt={metadata.title}
                                className="w-16 h-12 object-cover rounded-lg shrink-0 border border-zinc-700"
                            />
                        )}
                        <div className="overflow-hidden text-xs">
                            <p className="font-semibold text-zinc-200 truncate">{metadata.title}</p>
                            <p className="text-zinc-400 mt-0.5">
                                {metadata.maxHeight > 0 ? (
                                    <>Máxima res: <span className="text-red-400 font-mono font-bold">{metadata.maxHeight}p</span></>
                                ) : (
                                    <>Audio nativo: <span className="text-red-400 font-mono font-bold">{metadata.maxAudioBitrate || 160} kbps</span> ({metadata.audioCodec || "Opus"})</>
                                )}
                                {metadata.maxHeight > 0 && metadata.maxAudioBitrate > 0 && (
                                    <span> • Audio origen: <span className="text-zinc-300 font-mono">{metadata.maxAudioBitrate} kbps</span> ({metadata.audioCodec})</span>
                                )}
                            </p>
                        </div>
                    </div>
                )}

                {/* Video Resolutions Section */}
                {activeFormat === "mp4" ? (
                    <div>
                        <h3 className="text-base font-semibold text-zinc-200 mb-1">
                            Resolución de Video Especificada
                        </h3>
                        <p className="text-xs text-zinc-400 mb-3">
                            Las resoluciones que superan la calidad máxima del video analizado aparecen bloqueadas automáticamente.
                        </p>

                        <div className="grid grid-cols-2 gap-2.5">
                            {ALL_VIDEO_RESOLUTIONS.map((res) => {
                                const isUnavailable = metadata ? res.height > metadata.maxHeight : false
                                const isSelected = selectedQuality === res.value
                                return (
                                    <button
                                        key={res.value}
                                        type="button"
                                        disabled={isUnavailable}
                                        onClick={() => onSelectQuality(res.value)}
                                        className={
                                            "px-4 py-3 rounded-xl text-xs font-semibold border flex items-center justify-between transition-all active:scale-95 " +
                                            (isUnavailable
                                                ? "bg-zinc-800/30 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-50"
                                                : isSelected
                                                  ? "bg-red-600 border-red-500 text-white shadow-lg"
                                                  : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700")
                                        }
                                    >
                                        <span>{res.label}</span>
                                        {isUnavailable ? (
                                            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-mono">🔒 N/A</span>
                                        ) : isSelected ? (
                                            <span className="text-xs">✓</span>
                                        ) : null}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    /* Audio Quality Section */
                    <div>
                        <h3 className="text-base font-semibold text-zinc-200 mb-1">
                            Calidad y Tasa de Bits de Audio (MP3)
                        </h3>
                        <p className="text-xs text-zinc-400 mb-3">
                            Seleccioná la tasa de bits para la conversión. YouTube almacena el audio original en Opus / AAC.
                        </p>

                        <div className="space-y-2">
                            {AUDIO_BITRATES.map((b) => {
                                const isSelected = selectedQuality === b.value || (selectedQuality === "alta" && b.value === "0") || (selectedQuality === "media" && b.value === "5") || (selectedQuality === "baja" && b.value === "9")
                                return (
                                    <button
                                        key={b.value}
                                        type="button"
                                        onClick={() => onSelectQuality(b.value)}
                                        className={
                                            "w-full px-4 py-3 rounded-xl text-xs font-semibold border flex items-center justify-between transition-all active:scale-95 " +
                                            (isSelected
                                                ? "bg-red-600 border-red-500 text-white shadow-lg"
                                                : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700")
                                        }
                                    >
                                        <span>{b.label}</span>
                                        {isSelected && <span className="text-xs font-bold">✓ Seleccionado</span>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Back Button */}
            <button
                type="button"
                onClick={onBack}
                className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg"
            >
                Guardar y Volver al Formulario
            </button>
        </div>
    )
}
