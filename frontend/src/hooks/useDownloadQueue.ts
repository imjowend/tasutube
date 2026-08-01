import { useCallback, useEffect, useRef, useState } from "react"
import { Cancel, Download, GetQueue } from "../../wailsjs/go/main/App"
import { EventsOn } from "../../wailsjs/runtime/runtime"
import { errorMessage } from "../lib/errors"
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
 *
 * Backend failures that the user can't otherwise notice (hydration, cancel) are
 * reported through `onError` instead of being swallowed into the console.
 */
export function useDownloadQueue(onError?: (message: string) => void) {
    // Keep the latest callback without re-subscribing to backend events.
    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    const reportError = useCallback((err: unknown, fallback: string) => {
        const message = errorMessage(err, fallback)
        console.error(`[tasutube] ${fallback}:`, err)
        onErrorRef.current?.(message)
    }, [])

    const [items, setItems] = useState<Map<number, DownloadItemWithProgress>>(
        () => new Map(),
    )

    // Use a ref to keep the createdAt for items that arrived via GetQueue() stable
    // across re-renders, so list ordering doesn't shuffle.
    const createdAtRef = useRef<Map<number, number>>(new Map())

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
                        const createdAt =
                            createdAtRef.current.get(id) ?? Date.now()
                        createdAtRef.current.set(id, createdAt)
                        next.set(id, {
                            id,
                            url: patch.url,
                            format: patch.format,
                            quality: patch.quality,
                            status: patch.status,
                            error: patch.error,
                            percent: patch.percent ?? 0,
                            createdAt,
                        })
                    }
                    return next
                }

                next.set(id, { ...existing, ...patch, id })
                return next
            })
        },
        [],
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
                        const createdAt =
                            createdAtRef.current.get(item.id) ?? Date.now()
                        createdAtRef.current.set(item.id, createdAt)
                        // Preserve any progress we may already have for this id.
                        const existing = next.get(item.id)
                        next.set(item.id, {
                            id: item.id,
                            url: item.url,
                            format: item.format,
                            quality: item.quality,
                            status: item.status,
                            error: item.error,
                            percent: existing?.percent ?? 0,
                            createdAt,
                        })
                    })
                    return next
                })
            })
            .catch((err) => {
                if (cancelled) return
                reportError(err, "No se pudo leer la cola de descargas")
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
    }, [upsert, reportError])

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

    const cancel = useCallback(
        async (id: number) => {
            try {
                await Cancel(id)
            } catch (err) {
                reportError(err, "No se pudo cancelar la descarga")
            }
        },
        [reportError],
    )

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
