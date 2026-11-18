import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
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
        {
          x: Math.round(rect.left),
          y: Math.round(rect.bottom + 6),
          width: 224,
          trigger: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        },
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

export function FullscreenIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.4" y="3.1" width="13.2" height="9.8" rx="1.9" />
      <path d="M4.9 6.7V5.6c0-.35.25-.6.6-.6h1.1" />
      <path d="M11.1 6.7V5.6c0-.35-.25-.6-.6-.6H9.4" />
      <path d="M4.9 9.3v1.1c0 .35.25.6.6.6h1.1" />
      <path d="M11.1 9.3v1.1c0 .35-.25.6-.6.6H9.4" />
    </svg>
  )
}

export function BackIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M3.2 8h9.4" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path
        d="M7.2 3.8 3.1 8l4.1 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronDownIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 6.2 8 10.2l4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface MarkGeom {
  ringCy: number
  ringR: number
  ringW: number
  beamY: number
  beamH: number
  baseY: number
  baseH: number
  slotW: number
  barX: number
  barW: number
  clipH: number
}

// 48 以上用和 resources/icon.svg 一致的比例（实心钥匙孔）。
// 小尺寸另画一版：拱形和第一条横线之间留出空隙，不然 26px 下会粘成一块。
const MARK_FULL: MarkGeom = {
  ringCy: 14.08, ringR: 5.18, ringW: 4.01,
  beamY: 16.65, beamH: 3.34, baseY: 21.46, baseH: 3.66,
  slotW: 3.08, barX: 6.7, barW: 18.6, clipH: 19.99
}

/**
 * 品牌标记（标题栏左上角 / 空状态）。
 *
 * 和 resources/icon.svg 是同一套设计，但不是同一个文件：
 * - resources/icon.svg 是"应用图标"母版（1024 画布、532 颗星、实心钥匙孔），
 *   给任务栏 / exe / 空状态用，走 scripts/make-icons.mjs 光栅化；
 * - 这里把同一套几何压到 32 单位画布上，26px 下把拱形和第一条横线分开、
 *   星星减到 5 颗，否则缩到 26px 会糊成一块。
 *
 * 改配色或比例时两边都要动，别只改一处。
 */
export function LibraMark({ size = 21 }: { size?: number }): ReactElement {
  const uid = useId().replace(/:/g, '')
  const id = (name: string): string => `${name}-${uid}`
  const detailed = size >= 32
  const g = MARK_FULL
  return (
    <svg className="libra-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={id('sky')} gradientUnits="userSpaceOnUse" x1="5" y1="1" x2="27" y2="32">
          <stop offset="0" stopColor="#12203f" />
          <stop offset="52%" stopColor="#0d1430" />
          <stop offset="1" stopColor="#070a18" />
        </linearGradient>
        <radialGradient id={id('nebA')} cx="0.14" cy="0.96" r="0.85">
          <stop offset="0" stopColor="#4d8ae8" stopOpacity="0.8" />
          <stop offset="0.55" stopColor="#2f5aa8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2f5aa8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('nebB')} cx="0.95" cy="0.9" r="0.7">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.7" />
          <stop offset="1" stopColor="#6b4499" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('frame')}>
          <rect width="32" height="32" rx="7.2" />
        </clipPath>
        <clipPath id={id('dome')}>
          <rect x="0" y="0" width="32" height={g.clipH} />
        </clipPath>
        <mask id={id('glyph')} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <rect width="32" height="32" fill="#000" />
          <g clipPath={`url(#${id('dome')})`}>
            <circle cx="16" cy={g.ringCy} r={g.ringR} fill="none" stroke="#ffffff" strokeWidth={g.ringW} />
          </g>
          <rect x={g.barX} y={g.beamY} width={g.barW} height={g.beamH} fill="#ffffff" />
          <rect x={g.barX} y={g.baseY} width={g.barW} height={g.baseH} fill="#ffffff" />
          <rect
            x={16 - g.slotW / 2}
            y={g.ringCy}
            width={g.slotW}
            height={g.beamY + g.beamH - g.ringCy}
            fill="#000000"
          />
        </mask>
      </defs>
      <g clipPath={`url(#${id('frame')})`}>
        <rect width="32" height="32" fill={`url(#${id('sky')})`} />
        <rect width="32" height="32" fill={`url(#${id('nebA')})`} />
        <rect width="32" height="32" fill={`url(#${id('nebB')})`} />
        <circle cx="9.2" cy="6.2" r="0.62" fill="#ffffff" opacity="0.95" />
        <circle cx="24.6" cy="9.2" r="0.42" fill="#ffffff" opacity="0.8" />
        <circle cx="26.2" cy="22.6" r="0.46" fill="#dbe8ff" opacity="0.7" />
        <circle cx="6.6" cy="21.4" r="0.38" fill="#ffffff" opacity="0.6" />
        <circle cx="18.6" cy="4.6" r="0.3" fill="#ffffff" opacity="0.55" />
      </g>
      {detailed ? (
        <rect width="32" height="32" fill="#ffffff" mask={`url(#${id('glyph')})`} />
      ) : (
        <g fill="#ffffff">
          {/* 拱形带两条短腿，两端圆头，和下面第一条横线之间留出空隙 */}
          <path
            d="M 11.1 13.25 L 11.1 11.25 A 4.9 4.9 0 0 1 20.9 11.25 L 20.9 13.25"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="6.9" y="16.75" width="18.2" height="4" />
          <rect x="6.9" y="23.75" width="18.2" height="4" />
        </g>
      )}
    </svg>
  )
}

// 文件图标（原图 1024 画布的单条 path，来自 html.svg）
const HTML_FILE_PATH =
  'M434.12811 654.18527l-16.884181 16.884181c-4.707105 4.707105-12.279404 4.707105-16.884181 0l-118.496253-118.496253c-4.707105-4.707105-4.707105-12.279404 0-16.884181l118.496253-118.496253c4.707105-4.707105 12.279404-4.707105 16.884181 0l16.884181 16.884181c4.707105 4.707105 4.707105 12.279404 0 16.884181l-93.118817 93.118817 93.118817 93.118817C438.835215 642.008194 438.835215 649.580494 434.12811 654.18527zM473.115219 744.848206l-21.591286-6.037374c-5.935045-1.637254-9.618867-7.572299-8.18627-13.20036l96.188668-369.917058c1.534926-5.730389 7.981613-9.004897 14.325972-7.265314l23.126212 6.242031c6.344359 1.739582 10.335165 7.776956 8.80024 13.507345l-99.258519 369.610073C485.087639 743.313281 479.050265 746.48546 473.115219 744.848206zM749.401819 552.675527l-118.496253 118.496253c-4.707105 4.707105-12.279404 4.707105-16.884181 0l-16.884181-16.884181c-4.707105-4.707105-4.707105-12.279404 0-16.884181l93.118817-93.118817-93.118817-93.118817c-4.707105-4.707105-4.707105-12.279404 0-16.884181l16.884181-16.884181c4.707105-4.707105 12.279404-4.707105 16.884181 0l118.496253 118.496253C754.006595 540.396123 754.006595 547.968422 749.401819 552.675527zM823.794544 919.522734l-628.500849 0 0-814.533826 455.668232 0 0 128.012791c0 16.065554 14.121315 29.061257 31.41481 29.061257L823.794544 262.062956 823.794544 919.522734 823.794544 919.522734zM722.080144 145.203957l59.759768 58.634156-59.759768 0L722.080144 145.203957zM886.624163 231.364445c0-0.102328 0-0.102328 0-0.204657 0-0.61397-0.102328-1.22794-0.204657-1.841911 0-0.102328 0-0.204657 0-0.306985-0.409313-2.865194-1.22794-5.525732-2.455881-7.981613l0 0c-0.61397-1.22794-1.330269-2.455881-2.046567-3.581493-0.102328-0.102328-0.204657-0.204657-0.204657-0.409313-0.306985-0.511642-0.716299-0.920955-1.023284-1.432597-0.102328-0.204657-0.306985-0.306985-0.409313-0.511642-0.306985-0.306985-0.511642-0.61397-0.818627-1.023284-0.204657-0.204657-0.409313-0.511642-0.61397-0.716299-0.204657-0.204657-0.409313-0.409313-0.61397-0.61397-0.204657-0.204657-0.409313-0.409313-0.716299-0.716299l-171.40002-156.767063c-4.809433-4.604777-11.358449-7.674628-18.521435-8.493255 0 0 0 0-0.102328 0-0.716299-0.102328-1.432597-0.102328-2.148896-0.204657-0.204657 0-0.306985 0-0.511642 0-0.306985 0-0.61397 0-1.023284 0l-515.223344 0c-17.293495 0-31.210153 12.995703-31.210153 29.061257l0 872.758669c0 16.065554 14.018987 29.061257 31.210153 29.061257l686.82802 0c17.293495 0 31.210153-12.995703 31.210153-29.061257l0-715.684621C886.624163 232.490057 886.624163 231.876087 886.624163 231.364445z'

export function HtmlFileIcon({ size = 15, className }: { size?: number; className?: string }): ReactElement {
  return (
    <svg className={className} viewBox="0 0 1024 1024" width={size} height={size} aria-hidden="true">
      <path d={HTML_FILE_PATH} fill="currentColor" />
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
