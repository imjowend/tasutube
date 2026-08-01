/** Iconos SVG compartidos por los componentes de la app. */

export interface IconProps {
    className?: string
}

function Icon({ className, path }: IconProps & { path: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
            <path fillRule="evenodd" d={path} clipRule="evenodd" />
        </svg>
    )
}

export function FolderIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
    )
}

export function GearIcon({ className }: IconProps) {
    return (
        <Icon
            className={className}
            path="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473a6.95 6.95 0 011.564.9l1.453-.387a1 1 0 011.054.461l.68 1.18a1 1 0 01-.157 1.143l-1.024 1.124a6.974 6.974 0 010 1.806l1.024 1.124a1 1 0 01.157 1.143l-.68 1.18a1 1 0 01-1.054.46l-1.453-.386a6.95 6.95 0 01-1.564.9l-.295 1.473A1 1 0 0110.68 19H9.32a1 1 0 01-.98-.804l-.295-1.473a6.95 6.95 0 01-1.564-.9l-1.453.386a1 1 0 01-1.054-.46l-.68-1.18a1 1 0 01.157-1.143L4.475 12.3a6.974 6.974 0 010-1.806L3.45 9.37a1 1 0 01-.157-1.143l.68-1.18a1 1 0 011.054-.46l1.453.386a6.95 6.95 0 011.564-.9l.295-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z"
        />
    )
}

export function RefreshIcon({ className }: IconProps) {
    return (
        <Icon
            className={className}
            path="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.609-1.276z"
        />
    )
}

export function ClockIcon({ className }: IconProps) {
    return (
        <Icon
            className={className}
            path="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .2.08.39.22.53l3 3a.75.75 0 101.06-1.06l-2.78-2.78V5z"
        />
    )
}

export function CheckIcon({ className }: IconProps) {
    return (
        <Icon
            className={className}
            path="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z"
        />
    )
}

export function WarnIcon({ className }: IconProps) {
    return (
        <Icon
            className={className}
            path="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
        />
    )
}

export function XCircleIcon({ className }: IconProps) {
    return (
        <Icon
            className={className}
            path="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        />
    )
}

export function XIcon({ className }: IconProps) {
    return (
        <Icon
            className={className}
            path="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        />
    )
}
