import { BrowserWindow, WebContentsView } from 'electron'
import { join } from 'node:path'
import { CH, type OverlayOpenPayload } from '../shared/protocol'

const hosts = new Map<number, OverlayHost>()
const hostByView = new Map<number, OverlayHost>()
const SHADOW_PADDING = 24

export class OverlayHost {
  private view: WebContentsView | null = null
  private payload: OverlayOpenPayload | null = null
  private loaded = false

  constructor(private readonly win: BrowserWindow) {}

  private ensureView(): WebContentsView {
    if (this.view) return this.view

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })

    view.setBackgroundColor('#00000000')
    view.setVisible(false)
    this.win.contentView.addChildView(view)

    view.webContents.on('did-finish-load', () => {
      this.loaded = true
      this.pushData()
    })

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) void view.webContents.loadURL(`${devUrl}/overlay.html`)
    else void view.webContents.loadFile(join(__dirname, '../renderer/overlay.html'))

    hostByView.set(view.webContents.id, this)
    this.view = view
    return view
  }

  pushData(): void {
    if (!this.view || !this.loaded || !this.payload) return
    this.view.webContents.send(CH.overlayData, {
      items: this.payload.items,
      width: this.payload.width
    })
  }

  open(payload: OverlayOpenPayload): void {
    const view = this.ensureView()
    this.payload = payload
    this.pushData()

    // 先给一个占位尺寸，等页面量出高度再精确调整
    this.applyBounds(Math.min(320, payload.items.length * 30 + 20))
    view.setVisible(true)
    view.webContents.focus()
  }

  setHeight(height: number): void {
    if (!this.payload) return
    this.applyBounds(height)
  }

  close(): void {
    this.payload = null
    this.view?.setVisible(false)
  }

  /** 弹层里点了某一项：告诉主窗口，然后收起 */
  select(id: string): void {
    this.win.webContents.send(CH.overlaySelected, id)
    this.close()
  }

  /** 弹层自己被关掉（点空白 / Esc）：通知主窗口复位状态 */
  dismiss(): void {
    this.close()
    this.win.webContents.send(CH.overlayDismissed)
  }

  isOpen(): boolean {
    return this.payload !== null
  }

  private applyBounds(height: number): void {
    const view = this.view
    const payload = this.payload
    if (!view || !payload) return

    const zoom = this.win.webContents.getZoomFactor() || 1
    const [contentWidth, contentHeight] = this.win.getContentSize()

    const width = payload.width
    let x = payload.x
    let y = payload.y

    if (x + width > contentWidth - 8) x = Math.max(8, contentWidth - width - 8)
    if (y + height > contentHeight - 8) y = Math.max(8, contentHeight - height - 8)

    view.setBounds({
      x: Math.round((x - SHADOW_PADDING) / zoom),
      y: Math.round((y - SHADOW_PADDING) / zoom),
      width: Math.round((width + SHADOW_PADDING * 2) / zoom),
      height: Math.round((height + SHADOW_PADDING * 2) / zoom)
    })
  }

  destroy(): void {
    try {
      this.win.contentView.removeChildView(this.view as WebContentsView)
    } catch {
      /* window already gone */
    }
    try {
      this.view?.webContents.close()
    } catch {
      /* already closed */
    }
    this.view = null
  }
}

export function createOverlayHost(win: BrowserWindow): OverlayHost {
  const host = new OverlayHost(win)
  hosts.set(win.webContents.id, host)
  return host
}

export function getOverlayHost(webContentsId: number): OverlayHost | undefined {
  return hosts.get(webContentsId)
}

export function getOverlayHostBySender(webContentsId: number): OverlayHost | undefined {
  return hosts.get(webContentsId) ?? hostByView.get(webContentsId)
}

export function disposeOverlayHost(webContentsId: number): void {
  const host = hosts.get(webContentsId)
  if (!host) return
  hosts.delete(webContentsId)
  hostByView.delete(webContentsId)
  host.destroy()
}