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

import type { DownloadFormat, DownloadItem, DownloadStatus, VideoMetadata } from "../types"

type StatusListener = (id: number, status: string, errMsg: string, filePath?: string) => void
type ProgressListener = (id: number, percent: number) => void
type AnyListener = StatusListener | ProgressListener

/** Métodos que expone el backend Go, tanto en Wails como en el simulador. */
export interface WailsApp {
    Download: (url: string, format: string, quality: string) => Promise<number>
    Cancel: (id: number) => Promise<void>
    GetQueue: () => Promise<DownloadItem[]>
    GetDownloadPath: () => Promise<string>
    SetDownloadPath: (path: string) => Promise<void>
    OpenFolderDialog: () => Promise<string>
    OpenFolder: (path?: string) => Promise<void>
    OpenDownloadedFile: (filePath: string) => Promise<void>
    ForceUpdateYtdlp: () => Promise<string>
    SetAutostart: (enabled: boolean) => Promise<void>
    IsAutostartEnabled: () => Promise<boolean>
    SetWindowSize: (width: number, height: number) => Promise<void>
    GetWindowSize: () => Promise<{ width: number; height: number }>
    GetVideoInfo: (url: string) => Promise<VideoMetadata>
}

declare global {
    interface Window {
        go?: {
            main?: {
                App?: WailsApp
            }
        }
        runtime?: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            EventsOn: (name: string, cb: (...args: any[]) => void) => () => void
            EventsOff: (name: string, ...rest: string[]) => void
        }
    }
}

function wailsApp(): WailsApp | undefined {
    return typeof window !== "undefined" ? window.go?.main?.App : undefined
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
    autostart: false,
    winWidth: 1600,
    winHeight: 900,
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

function simSetStatus(id: number, status: DownloadStatus, error?: string, filePath?: string) {
    const item = sim.queue.get(id)
    if (!item) return
    item.status = status
    item.error = error
    if (filePath) item.filePath = filePath
    simEmit("download:status", id, status, error ?? "", filePath ?? "")
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
                    simSetStatus(id, "completed", undefined, "C:\\Users\\Joaquin\\Downloads\\video.mp4")
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

const simBridge: WailsApp & {
    EventsOn: (event: string, cb: AnyListener) => () => void
} = {
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
    GetDownloadPath(): Promise<string> {
        return Promise.resolve("C:\\Users\\Joaquin\\Downloads")
    },
    SetDownloadPath(_path: string): Promise<void> {
        return Promise.resolve()
    },
    OpenFolderDialog(): Promise<string> {
        return Promise.resolve("")
    },
    OpenFolder(_path?: string): Promise<void> {
        return Promise.resolve()
    },
    OpenDownloadedFile(_filePath: string): Promise<void> {
        return Promise.resolve()
    },
    ForceUpdateYtdlp(): Promise<string> {
        return Promise.resolve("✓ yt-dlp fue actualizado a la última versión desde GitHub Releases.")
    },
    SetAutostart(enabled: boolean): Promise<void> {
        sim.autostart = enabled
        return Promise.resolve()
    },
    IsAutostartEnabled(): Promise<boolean> {
        return Promise.resolve(sim.autostart)
    },
    SetWindowSize(w: number, h: number): Promise<void> {
        sim.winWidth = w
        sim.winHeight = h
        return Promise.resolve()
    },
    GetWindowSize(): Promise<{ width: number; height: number }> {
        return Promise.resolve({ width: sim.winWidth, height: sim.winHeight })
    },
    GetVideoInfo(_url: string): Promise<VideoMetadata> {
        return Promise.resolve({
            title: "YouTube Video de Ejemplo (1080p 60fps)",
            thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            duration: 212,
            maxHeight: 1080,
            availableRes: [1080, 720, 480, 360],
            maxAudioBitrate: 160,
            audioCodec: "opus",
            sampleRate: 48000,
        })
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
    return !!wailsApp()
}

/**
 * Delega un método del backend en Wails, o en el simulador cuando la app corre
 * en el navegador.
 */
function bridge<K extends keyof WailsApp>(name: K): WailsApp[K] {
    return ((...args: unknown[]) => {
        const app = wailsApp()
        const target: WailsApp = app ?? simBridge
        const method = target[name] as (...a: unknown[]) => unknown
        return method.apply(target, args)
    }) as WailsApp[K]
}

export const Download: (
    url: string,
    format: DownloadFormat,
    quality: string,
) => Promise<number> = bridge("Download")
export const Cancel = bridge("Cancel")
export const GetDownloadPath = bridge("GetDownloadPath")
export const SetDownloadPath = bridge("SetDownloadPath")
export const OpenFolderDialog = bridge("OpenFolderDialog")
export const OpenDownloadedFile = bridge("OpenDownloadedFile")
export const ForceUpdateYtdlp = bridge("ForceUpdateYtdlp")
export const SetAutostart = bridge("SetAutostart")
export const IsAutostartEnabled = bridge("IsAutostartEnabled")
export const SetWindowSize = bridge("SetWindowSize")
export const GetVideoInfo = bridge("GetVideoInfo")

export async function OpenFolder(path?: string): Promise<void> {
    return bridge("OpenFolder")(path ?? "")
}

export async function GetQueue(): Promise<DownloadItem[]> {
    return (await bridge("GetQueue")()) ?? []
}

export async function GetWindowSize(): Promise<{ width: number; height: number }> {
    const size = await bridge("GetWindowSize")()
    return size ?? { width: window.innerWidth, height: window.innerHeight }
}

/**
 * Subscribe to a backend event. Returns an unsubscribe function.
 * Falls back to the in-memory simulator when the Wails runtime is missing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EventsOn(eventName: string, callback: (...args: any[]) => void): () => void {
    if (typeof window !== "undefined" && window.runtime?.EventsOn) {
        const off = window.runtime!.EventsOn(eventName, callback)
        if (typeof off === "function") return off
        return () => {
            window.runtime?.EventsOff(eventName)
        }
    }
    return simBridge.EventsOn(eventName, callback as AnyListener)
}
