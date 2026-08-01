/** Clases Tailwind compartidas por los botones seleccionables de la app. */

const SELECTED = "bg-red-600 border-red-500 text-white shadow-lg"
const IDLE = "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white"
const DISABLED = "bg-zinc-800/40 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-50"

/** Devuelve `base` más el estado visual del botón (deshabilitado / activo / normal). */
export function selectableClasses(
    base: string,
    { selected, disabled = false }: { selected: boolean; disabled?: boolean },
): string {
    return `${base} ${disabled ? DISABLED : selected ? SELECTED : IDLE}`
}

/** Botón secundario "← Volver ..." usado en los paneles. */
export const BACK_BUTTON_CLASSES =
    "text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-all hover:scale-105 active:scale-95"
