import { useEffect, useRef, useState, type ReactElement } from 'react'

export interface MenuAction {
  label: string
  accelerator?: string
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}

export type MenuEntry = { type: 'separator' } | ({ type: 'item' } & MenuAction)

export interface MenuGroup {
  label: string
  items: MenuEntry[]
}

interface MenuBarProps {
  groups: MenuGroup[]
}

export function MenuBar({ groups }: MenuBarProps): ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (openIndex === null) return undefined

    const handlePointerDown = (event: MouseEvent): void => {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) setOpenIndex(null)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenIndex(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openIndex])

  return (
    <div className="menubar" ref={rootRef}>
      {groups.map((group, index) => (
        <div className="menubar-group" key={group.label}>
          <button
            type="button"
            className={openIndex === index ? 'menubar-button open' : 'menubar-button'}
            onClick={() => setOpenIndex((current) => (current === index ? null : index))}
            onMouseEnter={() => {
              if (openIndex !== null) setOpenIndex(index)
            }}
          >
            {group.label}
          </button>

          {openIndex === index ? (
            <div className="menu-dropdown">
              {group.items.map((entry, itemIndex) =>
                entry.type === 'separator' ? (
                  <div className="menu-separator" key={`sep-${itemIndex}`} />
                ) : (
                  <button
                    key={entry.label}
                    type="button"
                    className="menu-item"
                    disabled={entry.disabled === true}
                    onClick={() => {
                      setOpenIndex(null)
                      entry.onSelect()
                    }}
                  >
                    <span className="menu-check">{entry.checked ? '✓' : ''}</span>
                    <span className="menu-label">{entry.label}</span>
                    {entry.accelerator ? <span className="menu-accel">{entry.accelerator}</span> : null}
                  </button>
                )
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function HomeIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
      <path
        d="M2.5 6.9 8 2.3l5.5 4.6V13a1 1 0 0 1-1 1h-3V9.4H6.5V14h-3a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
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
      <rect
        x="1.8"
        y="2.6"
        width="12.4"
        height="10.8"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M10 2.8v10.4" stroke="currentColor" strokeWidth="1.3" opacity={active ? 1 : 0.5} />
    </svg>
  )
}