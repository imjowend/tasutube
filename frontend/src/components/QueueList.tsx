import type { DownloadItemWithProgress } from "../types"
import { QueueItem } from "./QueueItem"

interface QueueListProps {
    items: DownloadItemWithProgress[]
    onCancel: (id: number) => void
}

export function QueueList({ items, onCancel }: QueueListProps) {
    if (items.length === 0) {
        return null
    }

    return (
        <section className="px-10 py-6 border-t border-zinc-800">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
                    Descargas
                </h2>
                <span className="text-xs text-zinc-500">
                    {items.length} {items.length === 1 ? "item" : "items"}
                </span>
            </div>
            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {items.map((item) => (
                    <QueueItem key={item.id} item={item} onCancel={onCancel} />
                ))}
            </ul>
        </section>
    )
}
