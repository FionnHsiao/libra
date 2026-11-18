import type { OverlayItem } from '../../shared/protocol'

export interface MenuGroup {
  label: string
  items: MenuEntry[]
}

export interface MenuAction {
  label: string
  accelerator?: string
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}

export type MenuEntry = { type: 'separator' } | ({ type: 'item' } & MenuAction)

export interface OverlayAnchor {
  x: number
  y: number
  width: number
  /** 触发按钮的矩形，用于"鼠标离开就收起" */
  trigger?: { x: number; y: number; width: number; height: number }
}

let handlers = new Map<string, () => void>()
let dismissHandler: (() => void) | null = null

function takeHandlers(): { dismiss: (() => void) | null } {
  handlers = new Map()
  const dismiss = dismissHandler
  dismissHandler = null
  return { dismiss }
}

function toItems(entries: MenuEntry[], register: (id: string, action: () => void) => OverlayItem): OverlayItem[] {
  return entries.map((entry, index) => {
    if (entry.type === 'separator') return { id: `sep-${index}`, separator: true }
    const id = `item-${index}`
    return register(id, entry.onSelect)
  })
}

export function openOverlayMenu(entries: MenuEntry[], anchor: OverlayAnchor, onDismiss: () => void): void {
  const nextHandlers = new Map<string, () => void>()

  const items = toItems(entries, (id, action) => {
    const entry = entries[Number(id.split('-')[1])] as { type: 'item' } & MenuAction
    nextHandlers.set(id, action)
    return {
      id,
      label: entry.label,
      accelerator: entry.accelerator,
      checked: entry.checked,
      disabled: entry.disabled
    }
  })

  handlers = nextHandlers
  dismissHandler = onDismiss
  window.libra.openOverlay({ items, x: anchor.x, y: anchor.y, width: anchor.width, anchor: anchor.trigger })
}

export interface OverlayListRow {
  label: string
  checked?: boolean
  closeLabel?: string
  onSelect: () => void
  onClose?: () => void
}

export function openOverlayList(rows: OverlayListRow[], anchor: OverlayAnchor, onDismiss: () => void): void {
  const nextHandlers = new Map<string, () => void>()

  const items: OverlayItem[] = rows.map((row, index) => {
    const selectId = `row-${index}`
    nextHandlers.set(selectId, row.onSelect)

    let secondary: OverlayItem['secondary']
    if (row.closeLabel && row.onClose) {
      const closeId = `close-${index}`
      nextHandlers.set(closeId, row.onClose)
      secondary = { id: closeId, label: row.closeLabel }
    }

    return { id: selectId, label: row.label, checked: row.checked, secondary }
  })

  handlers = nextHandlers
  dismissHandler = onDismiss
  window.libra.openOverlay({ items, x: anchor.x, y: anchor.y, width: anchor.width, anchor: anchor.trigger })
}

export function closeOverlayMenu(): void {
  window.libra.closeOverlay()
}

/** 全局注册一次：弹层里点了某一项 / 弹层自己被关掉 */
export function installOverlayBridge(): () => void {
  const offSelect = window.libra.onOverlaySelect((id) => {
    const handler = handlers.get(id)
    const dismiss = takeHandlers().dismiss
    dismiss?.()
    handler?.()
  })

  const offDismiss = window.libra.onOverlayDismiss(() => {
    const dismiss = takeHandlers().dismiss
    dismiss?.()
  })

  return () => {
    offSelect()
    offDismiss()
  }
}