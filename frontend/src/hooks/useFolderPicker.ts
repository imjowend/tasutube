import { useCallback, useState } from "react"
import { OpenFolderDialog, SetDownloadPath } from "../lib/wailsBridge"

/**
 * Abre el selector nativo de carpetas y guarda la carpeta elegida como destino
 * de descargas. Expone `picking` para deshabilitar el botón mientras el diálogo
 * está abierto.
 */
export function useFolderPicker(onPathChanged: (path: string) => void) {
    const [picking, setPicking] = useState(false)

    const pickFolder = useCallback(async () => {
        setPicking(true)
        try {
            const selected = await OpenFolderDialog()
            if (selected) {
                await SetDownloadPath(selected)
                onPathChanged(selected)
            }
        } catch (err) {
            console.error("[v0] OpenFolderDialog failed:", err)
        } finally {
            setPicking(false)
        }
    }, [onPathChanged])

    return { picking, pickFolder }
}
