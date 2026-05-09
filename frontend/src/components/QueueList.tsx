import type { DownloadItemWithProgress } from "../types"
import { QueueItem } from "./QueueItem"

interface QueueListProps {
    items: DownloadItemWithProgress[]
    onCancel: (id: number) => void
}

export function QueueList({ items, onCancel }: QueueListProps) {
    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
                    Descargas
                </h2>
                {items.length > 0 && (
                    <span className="text-xs text-zinc-500">
                        {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                )}
            </div>

            {items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-zinc-600 italic">No hay descargas aún</p>
                </div>
            ) : (
                <ul className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {items.map((item) => (
                        <QueueItem key={item.id} item={item} onCancel={onCancel} />
                    ))}
                </ul>
            )}
        </div>
    )
}
