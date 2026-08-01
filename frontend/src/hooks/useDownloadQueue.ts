import { useCallback, useEffect, useRef, useState } from "react"
import { Cancel, Download, EventsOn, GetQueue } from "../lib/wailsBridge"
import type {
    DownloadFormat,
    DownloadItem,
    DownloadItemWithProgress,
    DownloadStatus,
} from "../types"

/**
 * Manages the local mirror of the backend download queue.
 *
 * - Hydrates from GetQueue() on mount.
 * - Listens to "download:status" and "download:progress" events from Wails.
 * - Exposes an enqueue() that calls Download() and immediately tracks the new item.
 */
export function useDownloadQueue() {
    const [items, setItems] = useState<Map<number, DownloadItemWithProgress>>(
        () => new Map(),
    )

    // Use a ref to keep the createdAt for items that arrived via GetQueue() stable
    // across re-renders, so list ordering doesn't shuffle.
    const createdAtRef = useRef<Map<number, number>>(new Map())

    // Devuelve el createdAt estable del ítem, registrándolo la primera vez.
    const createdAtFor = useCallback((id: number): number => {
        const createdAt = createdAtRef.current.get(id) ?? Date.now()
        createdAtRef.current.set(id, createdAt)
        return createdAt
    }, [])

    const upsert = useCallback(
        (id: number, patch: Partial<DownloadItemWithProgress>) => {
            setItems((prev) => {
                const next = new Map(prev)
                const existing = next.get(id)
                if (!existing) {
                    // We don't have the item yet — only meaningful if patch has the
                    // required base fields. Otherwise ignore (status/progress events
                    // for items we somehow missed will be picked up on next GetQueue).
                    if (
                        patch.url !== undefined &&
                        patch.format !== undefined &&
                        patch.quality !== undefined &&
                        patch.status !== undefined
                    ) {
                        next.set(id, {
                            id,
                            url: patch.url,
                            format: patch.format,
                            quality: patch.quality,
                            status: patch.status,
                            error: patch.error,
                            percent: patch.percent ?? 0,
                            createdAt: createdAtFor(id),
                        })
                    }
                    return next
                }

                next.set(id, { ...existing, ...patch, id })
                return next
            })
        },
        [createdAtFor],
    )

    // Hydrate from backend + subscribe to events. Run once.
    useEffect(() => {
        let cancelled = false

        GetQueue()
            .then((queue) => {
                if (cancelled || !queue) return
                setItems((prev) => {
                    const next = new Map(prev)
                    queue.forEach((raw) => {
                        const item = raw as DownloadItem
                        // Preserve any progress we may already have for this id.
                        const existing = next.get(item.id)
                        next.set(item.id, {
                            ...item,
                            percent: existing?.percent ?? 0,
                            createdAt: createdAtFor(item.id),
                        })
                    })
                    return next
                })
            })
            .catch((err) => {
                console.error("[v0] GetQueue failed:", err)
            })

        const offStatus = EventsOn(
            "download:status",
            (id: number, status: string, errMsg: string) => {
                upsert(id, {
                    status: status as DownloadStatus,
                    error: errMsg || undefined,
                })
            },
        )

        const offProgress = EventsOn(
            "download:progress",
            (id: number, percent: number) => {
                upsert(id, { percent })
            },
        )

        return () => {
            cancelled = true
            offStatus?.()
            offProgress?.()
        }
    }, [upsert, createdAtFor])

    const enqueue = useCallback(
        async (
            url: string,
            format: DownloadFormat,
            quality: string,
        ): Promise<number> => {
            const id = await Download(url, format, quality)
            upsert(id, {
                url,
                format,
                quality,
                status: "pending",
                percent: 0,
            })
            return id
        },
        [upsert],
    )

    const cancel = useCallback(async (id: number) => {
        try {
            await Cancel(id)
        } catch (err) {
            console.error("[v0] Cancel failed:", err)
        }
    }, [])

    // Sorted newest first.
    const sortedItems = Array.from(items.values()).sort(
        (a, b) => b.createdAt - a.createdAt,
    )

    return {
        items: sortedItems,
        enqueue,
        cancel,
    }
}
