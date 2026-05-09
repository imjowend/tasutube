/**
 * Bridge between the React frontend and the Wails desktop runtime.
 *
 * In the real Wails build, `window.go.main.App` and `window.runtime` are
 * injected by the desktop wrapper and we just delegate to the generated
 * bindings.
 *
 * In the v0 browser preview those globals don't exist, so we provide a small
 * in-memory simulator that mimics the backend behaviour (queue, status
 * transitions, progress events) so the UI is fully testable without a desktop
 * shell.
 */

import type { DownloadFormat, DownloadItem, DownloadStatus } from "../types"

type StatusListener = (id: number, status: string, errMsg: string) => void
type ProgressListener = (id: number, percent: number) => void
type AnyListener = StatusListener | ProgressListener

declare global {
    interface Window {
        go?: {
            main?: {
                App?: {
                    Download: (
                        url: string,
                        format: string,
                        quality: string,
                    ) => Promise<number>
                    Cancel: (id: number) => Promise<void>
                    GetQueue: () => Promise<DownloadItem[]>
                    SetDownloadPath: (path: string) => Promise<void>
                }
            }
        }
        runtime?: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            EventsOn: (name: string, cb: (...args: any[]) => void) => () => void
            EventsOff: (name: string, ...rest: string[]) => void
        }
    }
}

function hasWailsApp(): boolean {
    return typeof window !== "undefined" && !!window.go?.main?.App
}

function hasWailsRuntime(): boolean {
    return typeof window !== "undefined" && !!window.runtime?.EventsOn
}

// ---------------------------------------------------------------------------
// Browser-mode simulator
// ---------------------------------------------------------------------------

interface SimItem extends DownloadItem {
    /** Active timers for this download so we can cancel them. */
    timers: number[]
}

const sim = {
    nextId: 1,
    queue: new Map<number, SimItem>(),
    listeners: new Map<string, Set<AnyListener>>(),
}

function simEmit(event: string, ...args: unknown[]) {
    const set = sim.listeners.get(event)
    if (!set) return
    set.forEach((cb) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(cb as any)(...args)
        } catch (err) {
            console.error("[v0] sim listener threw:", err)
        }
    })
}

function simSetStatus(id: number, status: DownloadStatus, error?: string) {
    const item = sim.queue.get(id)
    if (!item) return
    item.status = status
    item.error = error
    simEmit("download:status", id, status, error ?? "")
}

function simStartDownload(id: number) {
    const item = sim.queue.get(id)
    if (!item) return

    // Move pending -> downloading after a short tick.
    item.timers.push(
        window.setTimeout(() => {
            if (sim.queue.get(id)?.status !== "pending") return
            simSetStatus(id, "downloading")

            // Stream progress every 200ms up to 95%.
            let percent = 0
            const interval = window.setInterval(() => {
                const current = sim.queue.get(id)
                if (!current || current.status !== "downloading") {
                    window.clearInterval(interval)
                    return
                }
                percent = Math.min(95, percent + 5 + Math.random() * 10)
                simEmit("download:progress", id, Math.round(percent))
            }, 200)
            item.timers.push(interval as unknown as number)

            // Complete after ~3.5s.
            item.timers.push(
                window.setTimeout(() => {
                    const current = sim.queue.get(id)
                    if (!current || current.status !== "downloading") return
                    window.clearInterval(interval)
                    simEmit("download:progress", id, 100)
                    simSetStatus(id, "completed")
                }, 3500),
            )
        }, 250),
    )
}

function simClearTimers(id: number) {
    const item = sim.queue.get(id)
    if (!item) return
    item.timers.forEach((t) => {
        window.clearTimeout(t)
        window.clearInterval(t)
    })
    item.timers = []
}

const simBridge = {
    Download(url: string, format: string, quality: string): Promise<number> {
        const id = sim.nextId++
        sim.queue.set(id, {
            id,
            url,
            format: format as DownloadFormat,
            quality,
            status: "pending",
            timers: [],
        })
        // Emit the initial pending status on the next tick so subscribers that
        // register synchronously after Download() resolves still receive it.
        window.setTimeout(() => simEmit("download:status", id, "pending", ""), 0)
        simStartDownload(id)
        return Promise.resolve(id)
    },
    Cancel(id: number): Promise<void> {
        const item = sim.queue.get(id)
        if (!item) return Promise.resolve()
        if (item.status === "pending" || item.status === "downloading") {
            simClearTimers(id)
            simSetStatus(id, "cancelled")
        }
        return Promise.resolve()
    },
    GetQueue(): Promise<DownloadItem[]> {
        return Promise.resolve(
            Array.from(sim.queue.values()).map(({ timers: _t, ...rest }) => rest),
        )
    },
    SetDownloadPath(_path: string): Promise<void> {
        return Promise.resolve()
    },
    EventsOn(event: string, cb: AnyListener): () => void {
        let set = sim.listeners.get(event)
        if (!set) {
            set = new Set()
            sim.listeners.set(event, set)
        }
        set.add(cb)
        return () => {
            set?.delete(cb)
        }
    },
}

// ---------------------------------------------------------------------------
// Public API — auto-selects real Wails or simulator.
// ---------------------------------------------------------------------------

export function isWailsRuntime(): boolean {
    return hasWailsApp()
}

export async function Download(
    url: string,
    format: DownloadFormat,
    quality: string,
): Promise<number> {
    if (hasWailsApp()) {
        return window.go!.main!.App!.Download(url, format, quality)
    }
    return simBridge.Download(url, format, quality)
}

export async function Cancel(id: number): Promise<void> {
    if (hasWailsApp()) {
        return window.go!.main!.App!.Cancel(id)
    }
    return simBridge.Cancel(id)
}

export async function GetQueue(): Promise<DownloadItem[]> {
    if (hasWailsApp()) {
        const result = await window.go!.main!.App!.GetQueue()
        return result ?? []
    }
    return simBridge.GetQueue()
}

export async function SetDownloadPath(path: string): Promise<void> {
    if (hasWailsApp()) {
        return window.go!.main!.App!.SetDownloadPath(path)
    }
    return simBridge.SetDownloadPath(path)
}

/**
 * Subscribe to a backend event. Returns an unsubscribe function.
 * Falls back to the in-memory simulator when the Wails runtime is missing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EventsOn(eventName: string, callback: (...args: any[]) => void): () => void {
    if (hasWailsRuntime()) {
        // The real Wails EventsOn returns an unsubscribe fn.
        const off = window.runtime!.EventsOn(eventName, callback)
        if (typeof off === "function") return off
        return () => {
            window.runtime?.EventsOff(eventName)
        }
    }
    return simBridge.EventsOn(eventName, callback as AnyListener)
}
