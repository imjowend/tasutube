import { useEffect, useRef, useState } from "react"
import { SetDownloadPath } from "../../wailsjs/go/main/App"

interface SettingsPanelProps {
    path: string
    onPathSaved: (path: string) => void
}

export function SettingsPanel({ path, onPathSaved }: SettingsPanelProps) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState(path)
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<number | null>(null)
    const timerRef = useRef<number | null>(null)

    // Keep the local draft in sync if parent path changes (e.g. on first load).
    useEffect(() => {
        setDraft(path)
    }, [path])

    // Auto-clear the "✓ Guardado" confirmation after 2s.
    useEffect(() => {
        if (savedAt === null) return
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setSavedAt(null), 2000)
        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
        }
    }, [savedAt])

    async function handleSave() {
        setSaving(true)
        try {
            await SetDownloadPath(draft)
            onPathSaved(draft)
            setSavedAt(Date.now())
        } catch (err) {
            console.error("[v0] SetDownloadPath failed:", err)
        } finally {
            setSaving(false)
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
                    <label
                        htmlFor="download-path"
                        className="block text-sm text-zinc-400 text-left"
                    >
                        Carpeta de destino
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="download-path"
                            type="text"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Por defecto: carpeta Descargas"
                            className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 text-sm"
                        />
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-red-600/40 text-white text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                        >
                            {saving ? "Guardando…" : "Guardar"}
                        </button>
                    </div>
                    {savedAt !== null && (
                        <p className="text-xs text-emerald-400 text-left">✓ Guardado</p>
                    )}
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
