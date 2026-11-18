import { BrowserWindow, screen, WebContentsView } from 'electron'
import { join } from 'node:path'
import { CH, type OverlayOpenPayload } from '../shared/protocol'

const hosts = new Map<number, OverlayHost>()
const hostByView = new Map<number, OverlayHost>()
const SHADOW_PADDING = 28

export class OverlayHost {
  private view: WebContentsView | null = null
  private payload: OverlayOpenPayload | null = null
  private watchTimer: NodeJS.Timeout | null = null
  private outsideTicks = 0
  private loaded = false
  private visible = false

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
    this.startWatching()
    this.pushData()

    // 先给一个占位尺寸，等页面量出高度再精确调整
    this.applyBounds(Math.min(320, payload.items.length * 30 + 20))
    view.setVisible(true)
    this.visible = true
    view.webContents.focus()
  }

  setHeight(height: number): void {
    if (!this.payload) return
    this.applyBounds(height)
  }

  close(): void {
    this.payload = null
    this.stopWatching()
    if (this.visible) {
      this.view?.setVisible(false)
      this.visible = false
      // 焦点要还回主窗口，否则自动收起之后快捷键会失效
      this.win.webContents.focus()
    }
  }

  /** 鼠标离开「触发按钮 + 下拉框」的并集时自动收起 */
  private startWatching(): void {
    this.stopWatching()
    if (!this.payload?.anchor) return
    this.outsideTicks = 0

    this.watchTimer = setInterval(() => {
      if (!this.payload) {
        this.stopWatching()
        return
      }
      if (this.isPointerInside()) {
        this.outsideTicks = 0
        return
      }
      this.outsideTicks += 1
      if (this.outsideTicks >= 3) this.dismiss()
    }, 100)
  }

  private stopWatching(): void {
    if (this.watchTimer) clearInterval(this.watchTimer)
    this.watchTimer = null
    this.outsideTicks = 0
  }

  private isPointerInside(): boolean {
    const view = this.view
    const payload = this.payload
    if (!view || !payload) return true

    const point = screen.getCursorScreenPoint()
    const zoom = this.win.webContents.getZoomFactor() || 1
    const content = this.win.getContentBounds()

    // 按钮和下拉框之间有几像素缝隙，留一点容差，避免"路过缝隙"被误判成离开
    const SLACK = 10

    const anchor = payload.anchor
    if (anchor) {
      const x = content.x + anchor.x / zoom - SLACK
      const y = content.y + anchor.y / zoom - SLACK
      const w = anchor.width / zoom + SLACK * 2
      const h = anchor.height / zoom + SLACK * 2
      if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) return true
    }

    const bounds = view.getBounds()
    const vx = content.x + bounds.x - SLACK
    const vy = content.y + bounds.y - SLACK
    return (
      point.x >= vx &&
      point.x <= vx + bounds.width + SLACK * 2 &&
      point.y >= vy &&
      point.y <= vy + bounds.height + SLACK * 2
    )
  }

  /** 弹层里点了某一项：告诉主窗口，然后收起 */
  select(id: string): void {
    this.win.webContents.send(CH.overlaySelected, id)
    this.close()
  }

  /** 弹层自己被关掉（点空白 / Esc）：通知主窗口复位状态 */
  dismiss(): void {
    if (!this.isOpen()) return
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

    // 只在下方和左右留出阴影空间，顶部不留：
    // 否则视图会盖住触发它的按钮，导致按钮"消失"、也无法再悬停切换
    view.setBounds({
      x: Math.round((x - SHADOW_PADDING) / zoom),
      y: Math.round(y / zoom),
      width: Math.round((width + SHADOW_PADDING * 2) / zoom),
      height: Math.round((height + SHADOW_PADDING) / zoom)
    })
  }

  destroy(): void {
    this.stopWatching()
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