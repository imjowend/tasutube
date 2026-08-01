/** Validación de links de YouTube compartida por la UI. */
const ALLOWED_HOSTS = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
]

export function isValidYoutubeUrl(url: string): boolean {
    let parsed: URL
    try {
        parsed = new URL(url.trim())
    } catch {
        return false
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    return ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase())
}
