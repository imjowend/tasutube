import { useCallback, useState } from "react"
import { errorMessage } from "../lib/errors"
import { OpenFolderDialog, SetDownloadPath } from "../lib/wailsBridge"

/**
 * Abre el selector nativo de carpetas y guarda la carpeta elegida como destino
 * de descargas. Expone `picking` para deshabilitar el botón mientras el diálogo
 * está abierto y `folderError` con el error del backend, si hubo.
 */
export function useFolderPicker(onPathChanged: (path: string) => void) {
    const [picking, setPicking] = useState(false)
    const [folderError, setFolderError] = useState<string | null>(null)

    const pickFolder = useCallback(async () => {
        setPicking(true)
        setFolderError(null)
        try {
            const selected = await OpenFolderDialog()
            if (selected) {
                await SetDownloadPath(selected)
                onPathChanged(selected)
            }
        } catch (err) {
            console.error("[tasutube] OpenFolderDialog failed:", err)
            setFolderError(errorMessage(err, "No se pudo elegir la carpeta de destino"))
        } finally {
            setPicking(false)
        }
    }, [onPathChanged])

    return { picking, pickFolder, folderError, setFolderError }
}
