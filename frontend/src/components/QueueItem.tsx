import { useState } from "react"
import { qualityLabel, type DownloadItemWithProgress } from "../types"

interface QueueItemProps {
    item: DownloadItemWithProgress
    onCancel: (id: number) => void
}

function truncateMiddle(url: string, maxLen = 56): string {
    if (url.length <= maxLen) return url
    try {
        const u = new URL(url)
        const host = u.hostname.replace(/^www\./, "")
        const tail = (u.pathname + u.search).slice(-Math.max(8, maxLen - host.length - 3))
        const result = `${host}…${tail}`
        return result.length > maxLen ? `${host}…${tail.slice(-(maxLen - host.length - 1))}` : result
    } catch {
        const head = url.slice(0, Math.floor(maxLen / 2) - 1)
        const tail = url.slice(-(Math.ceil(maxLen / 2) - 2))
        return `${head}…${tail}`
    }
}

export function QueueItem({ item, onCancel }: QueueItemProps) {
    const [showFullError, setShowFullError] = useState(false)

    const formatBadgeClasses =
        item.format === "mp3"
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
            : "bg-sky-500/15 text-sky-300 border border-sky-500/30"

    const cancellable = item.status === "pending" || item.status === "downloading"

    return (
        <li className="bg-zinc-800/60 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide ${formatBadgeClasses}`}
                >
                    {item.format.toUpperCase()}
                </span>
                <span className="px-2 py-1 rounded-md text-xs font-semibold bg-zinc-700/60 text-zinc-300 border border-zinc-700">
                    {qualityLabel(item.format, item.quality)}
                </span>
                <span
                    className="text-sm text-zinc-400 truncate flex-1 text-left"
                    title={item.url}
                >
                    {truncateMiddle(item.url)}
                </span>
                {cancellable && (
                    <button
                        onClick={() => onCancel(item.id)}
                        aria-label="Cancelar descarga"
                        className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md bg-zinc-700/60 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-4 h-4"
                        >
                            <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>
                )}
            </div>

            {/* Status row */}
            <StatusRow item={item} showFullError={showFullError} setShowFullError={setShowFullError} />
        </li>
    )
}

function StatusRow({
    item,
    showFullError,
    setShowFullError,
}: {
    item: DownloadItemWithProgress
    showFullError: boolean
    setShowFullError: (v: boolean) => void
}) {
    if (item.status === "pending") {
        return (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
                <ClockIcon className="w-4 h-4" />
                <span>En cola…</span>
            </div>
        )
    }

    if (item.status === "downloading") {
        const pct = Math.max(0, Math.min(100, Math.round(item.percent || 0)))
        return (
            <div className="space-y-1.5">
                <div className="h-2 w-full rounded-full bg-zinc-700/60 overflow-hidden">
                    <div
                        className="h-full bg-indigo-500 transition-[width] duration-200"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Descargando…</span>
                    <span className="font-semibold text-indigo-300">{pct}%</span>
                </div>
            </div>
        )
    }

    if (item.status === "completed") {
        return (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckIcon className="w-4 h-4" />
                <span>Completado</span>
            </div>
        )
    }

    if (item.status === "cancelled") {
        return (
            <div className="flex items-center gap-2 text-sm text-yellow-400">
                <WarnIcon className="w-4 h-4" />
                <span>Cancelado</span>
            </div>
        )
    }

    // error
    const message = item.error || "Error desconocido"
    const truncated = message.length > 80 ? message.slice(0, 80) + "…" : message
    const canExpand = message.length > 80
    return (
        <button
            type="button"
            onClick={() => canExpand && setShowFullError(!showFullError)}
            className="flex items-start gap-2 text-sm text-red-400 text-left w-full"
            title={canExpand ? "Click para ver el error completo" : undefined}
        >
            <XCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className={showFullError ? "" : "line-clamp-2"}>
                {showFullError ? message : truncated}
            </span>
        </button>
    )
}

function ClockIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
            <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06l-2.78-2.78V5z"
                clipRule="evenodd"
            />
        </svg>
    )
}

function CheckIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
            <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z"
                clipRule="evenodd"
            />
        </svg>
    )
}

function WarnIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
            <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
            />
        </svg>
    )
}

function XCircleIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
            <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
            />
        </svg>
    )
}
