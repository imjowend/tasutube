import { useState } from "react"
import { OpenFolderDialog, SetDownloadPath } from "../lib/wailsBridge"

interface SettingsPanelProps {
    path: string
    onPathSaved: (path: string) => void
}

export function SettingsPanel({ path, onPathSaved }: SettingsPanelProps) {
    const [open, setOpen] = useState(false)
    const [picking, setPicking] = useState(false)

    async function handlePickFolder() {
        setPicking(true)
        try {
            const selected = await OpenFolderDialog()
            if (selected) {
                await SetDownloadPath(selected)
                onPathSaved(selected)
            }
        } catch (err) {
            console.error("[v0] OpenFolderDialog failed:", err)
        } finally {
            setPicking(false)
        }
    }

    return (
        <div className="px-10 pb-6 border-t border-zinc-800 pt-4">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
                <GearIcon className="w-4 h-4" />
                <span>Ajustes</span>
                <ChevronIcon
                    className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open && (
                <div className="mt-4 space-y-2">
                    <p className="block text-sm text-zinc-400 text-left">Carpeta de destino</p>
                    <button
                        type="button"
                        onClick={handlePickFolder}
                        disabled={picking}
                        className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-left text-sm transition-colors hover:bg-zinc-700 hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className={path ? "text-zinc-100" : "text-zinc-500"}>
                            {picking ? "Abriendo…" : path || "Elegir carpeta..."}
                        </span>
                    </button>
                </div>
            )}
        </div>
    )
}

function GearIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path
                fillRule="evenodd"
                d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473a6.95 6.95 0 011.564.9l1.453-.387a1 1 0 011.054.461l.68 1.18a1 1 0 01-.157 1.143l-1.024 1.124a6.974 6.974 0 010 1.806l1.024 1.124a1 1 0 01.157 1.143l-.68 1.18a1 1 0 01-1.054.46l-1.453-.386a6.95 6.95 0 01-1.564.9l-.295 1.473A1 1 0 0110.68 19H9.32a1 1 0 01-.98-.804l-.295-1.473a6.95 6.95 0 01-1.564-.9l-1.453.386a1 1 0 01-1.054-.46l-.68-1.18a1 1 0 01.157-1.143L4.475 12.3a6.974 6.974 0 010-1.806L3.45 9.37a1 1 0 01-.157-1.143l.68-1.18a1 1 0 011.054-.46l1.453.386a6.95 6.95 0 011.564-.9l.295-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
            />
        </svg>
    )
}

function ChevronIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
            />
        </svg>
    )
}
