import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { closeOverlayMenu, openOverlayMenu, type MenuGroup } from './overlayMenu'

export type { MenuGroup } from './overlayMenu'

interface MenuBarProps {
  groups: MenuGroup[]
}

export function MenuBar({ groups }: MenuBarProps): ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => {
    closeOverlayMenu()
    setOpenIndex(null)
  }, [])

  const openAt = useCallback(
    (index: number, element: HTMLElement) => {
      const group = groups[index]
      if (!group) return
      const rect = element.getBoundingClientRect()
      openOverlayMenu(
        group.items,
        { x: Math.round(rect.left), y: Math.round(rect.bottom + 6), width: 224 },
        () => setOpenIndex(null)
      )
      setOpenIndex(index)
    },
    [groups]
  )

  useEffect(() => {
    if (openIndex === null) return undefined
    const handleDown = (event: MouseEvent): void => {
      const root = rootRef.current
      if (root && root.contains(event.target as Node)) return
      close()
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [openIndex, close])

  return (
    <div className="menubar" ref={rootRef}>
      {groups.map((group, index) => (
        <div className="menubar-group" key={group.label}>
          <button
            type="button"
            className={openIndex === index ? 'menubar-button open' : 'menubar-button'}
            onClick={(event) => {
              if (openIndex === index) close()
              else openAt(index, event.currentTarget)
            }}
            onMouseEnter={(event) => {
              if (openIndex !== null && openIndex !== index) openAt(index, event.currentTarget)
            }}
          >
            {group.label}
          </button>
        </div>
      ))}
    </div>
  )
}

export function ChevronDownIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 6.2 8 10.2l4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LibraMark(): ReactElement {
  return (
    <svg className="libra-mark" viewBox="0 0 32 32" width="21" height="21" aria-hidden="true">
      <defs>
        <linearGradient id="libra-mark-tile" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#104346" />
          <stop offset="1" stopColor="#05161d" />
        </linearGradient>
        <linearGradient id="libra-mark-glyph" gradientUnits="userSpaceOnUse" x1="9" y1="15" x2="23" y2="24">
          <stop offset="0" stopColor="#5ff0e4" />
          <stop offset="1" stopColor="#2f5af0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#libra-mark-tile)" />
      <g fill="none" stroke="url(#libra-mark-glyph)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.4 19.6V15.6A4.6 4.6 0 0 1 20.6 15.6V19.6" />
        <path d="M9.2 19.6H22.8" />
        <path d="M10.4 24.4H21.6" />
      </g>
    </svg>
  )
}

export function HomeIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
      <path d="M2.5 6.9 8 2.3l5.5 4.6V13a1 1 0 0 1-1 1h-3V9.4H6.5V14h-3a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function GitIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
      <circle cx="8" cy="3.6" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="12.4" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.4v5.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function FilesIcon({ active }: { active: boolean }): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 2.8v10.4" stroke="currentColor" strokeWidth="1.3" opacity={active ? 1 : 0.5} />
    </svg>
  )
}

export function OutlineIcon({ active }: { active: boolean }): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 2.8v10.4" stroke="currentColor" strokeWidth="1.3" opacity={active ? 1 : 0.5} />
    </svg>
  )
}