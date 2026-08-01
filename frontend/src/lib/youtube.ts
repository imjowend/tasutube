/** Validación mínima de links de YouTube compartida por la UI. */
export function isValidYoutubeUrl(url: string): boolean {
    return url.includes("youtube.com") || url.includes("youtu.be")
}
