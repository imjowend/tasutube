export type DownloadFormat = "mp3" | "mp4"

export type DownloadStatus =
    | "pending"
    | "downloading"
    | "completed"
    | "cancelled"
    | "error"

export interface VideoMetadata {
    title: string
    thumbnail: string
    duration: number
    maxHeight: number
    availableRes: number[]
    maxAudioBitrate: number
    audioCodec: string
    sampleRate: number
}

export interface DownloadItem {
    id: number
    url: string
    format: DownloadFormat
    quality: string
    status: DownloadStatus
    error?: string
    filePath?: string
}

export interface DownloadItemWithProgress extends DownloadItem {
    /** 0–100, only meaningful when status === "downloading" */
    percent: number
    /** Wall-clock when added/created locally — used to sort newest first */
    createdAt: number
}

export const MP3_QUALITIES = [
    { value: "alta", label: "Alta (320k)" },
    { value: "media", label: "Media (192k)" },
    { value: "baja", label: "Baja (128k)" },
] as const

export const MP4_QUALITIES = [
    { value: "1080p", label: "1080p" },
    { value: "720p", label: "720p" },
    { value: "480p", label: "480p" },
    { value: "auto", label: "Auto" },
] as const

export const DEFAULT_QUALITY: Record<DownloadFormat, string> = {
    mp3: "alta",
    mp4: "auto",
}

export function qualityLabel(format: DownloadFormat, quality: string): string {
    const list: ReadonlyArray<{ value: string; label: string }> =
        format === "mp3" ? MP3_QUALITIES : MP4_QUALITIES
    return list.find((q) => q.value === quality)?.label ?? quality
}
