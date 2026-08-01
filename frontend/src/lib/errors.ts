/**
 * Normaliza el valor rechazado por una promesa a un mensaje mostrable.
 *
 * Wails rechaza con un string (el `error` devuelto por el método Go), mientras
 * que el runtime del browser rechaza con `Error`.
 */
export function errorMessage(err: unknown, fallback: string): string {
    if (typeof err === "string" && err.trim() !== "") return err
    if (err instanceof Error && err.message.trim() !== "") return err.message
    return fallback
}
