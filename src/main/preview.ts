import { BrowserWindow, shell, WebContentsView } from 'electron'
import { dirname } from 'node:path'
import { CH, type OutlineItem, type PreviewRect } from '../shared/protocol'
import { handleShortcutInput } from './menu'
import { PREVIEW_PARTITION, allowRoot, fromPreviewUrl, toPreviewUrl } from './protocol'

const hosts = new Map<number, PreviewHost>()
const HTML_LIKE = /\.(html?|xhtml)$/i

const OUTLINE_SCRIPT = `(() => {
  const nodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
  const items = []
  let index = 0
  for (const node of nodes) {
    const text = (node.textContent || '').replace(/\\s+/g, ' ').trim()
    if (!text) continue
    node.setAttribute('data-libra-outline', String(index))
    items.push({ index, level: Number(node.tagName.slice(1)), text: text.slice(0, 120) })
    index += 1
  }
  return JSON.stringify(items)
})()`

export class PreviewHost {
  private readonly view: WebContentsView

  constructor(private readonly win: BrowserWindow) {
    this.view = new WebContentsView({
      webPreferences: {
        partition: PREVIEW_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false
      }
    })

    this.view.setBackgroundColor('#ffffff')
    this.view.setVisible(false)
    win.contentView.addChildView(this.view)

    const contents = this.view.webContents

    contents.on('before-input-event', (event, input) => {
      handleShortcutInput(event, input, win)
    })

    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      if (url.startsWith('libra-file://')) {
        event.preventDefault()
        const target = fromPreviewUrl(url)
        if (target && HTML_LIKE.test(target)) {
          win.webContents.send(CH.previewNavigate, target)
        }
        return
      }
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url)
      }
    })

    contents.on('did-finish-load', () => {
      void this.publishOutline()
    })

    contents.on('did-fail-load', () => {
      win.webContents.send(CH.previewOutline, [])
    })
  }

  async load(filePath: string): Promise<void> {
    allowRoot(dirname(filePath))
    await this.view.webContents.loadURL(toPreviewUrl(filePath))
  }

  setBounds(rect: PreviewRect | null): void {
    if (!rect || rect.width < 8 || rect.height < 8) {
      this.view.setVisible(false)
      return
    }
    const zoom = this.win.webContents.getZoomFactor() || 1
    this.view.setVisible(true)
    // rect 是 CSS px，setBounds 要 DIP：缩放 1.2 时 1 CSS px = 1.2 DIP
    this.view.setBounds({
      x: Math.round(rect.x * zoom),
      y: Math.round(rect.y * zoom),
      width: Math.round(rect.width * zoom),
      height: Math.round(rect.height * zoom)
    })
  }

  reload(): void {
    this.view.webContents.reload()
  }

  /** 预览页里的鼠标按下事件（原生视图不会把事件传给主窗口的 DOM） */
  onPointerDown(callback: () => void): void {
    this.view.webContents.on('input-event', (_event, inputEvent) => {
      if (inputEvent.type === 'mouseDown') callback()
    })
  }

  /**
   * 全屏阅读时在预览页里闪一下提示。
   * 预览是原生视图，永远盖在主窗口 DOM 之上，所以提示只能画在预览页内部；
   * 用 closed shadow root + 全部样式走 JS 赋值，避免和用户页面自己的 CSS / CSP 打架。
   */
  flashHint(text: string): void {
    const message = JSON.stringify(String(text).slice(0, 60))
    void this.view.webContents
      .executeJavaScript(
        `(() => {
          try {
            const ID = '__libra_hint__'
            const old = document.getElementById(ID)
            if (old) old.remove()
            const host = document.createElement('div')
            host.id = ID
            host.style.position = 'fixed'
            host.style.inset = 'auto 0 0 0'
            host.style.display = 'flex'
            host.style.justifyContent = 'center'
            host.style.padding = '0 0 56px 0'
            host.style.pointerEvents = 'none'
            host.style.zIndex = '2147483647'
            const root = host.attachShadow({ mode: 'closed' })
            const pill = document.createElement('div')
            pill.style.display = 'flex'
            pill.style.alignItems = 'center'
            pill.style.gap = '12px'
            pill.style.padding = '11px 20px'
            pill.style.borderRadius = '999px'
            pill.style.background = 'rgba(16,18,26,0.88)'
            pill.style.color = '#ffffff'
            pill.style.font = '14px/1.2 "Segoe UI","Microsoft YaHei",system-ui,sans-serif'
            pill.style.boxShadow = '0 16px 40px rgba(0,0,0,0.42)'
            pill.style.border = '1px solid rgba(255,255,255,0.14)'
            pill.style.backdropFilter = 'blur(10px)'
            pill.style.opacity = '0'
            pill.style.transform = 'translateY(8px)'
            pill.style.transition = 'opacity 220ms ease, transform 220ms ease'
            const key = document.createElement('span')
            key.textContent = 'Esc'
            key.style.font = '12px/1 ui-monospace,SFMono-Regular,Consolas,monospace'
            key.style.padding = '5px 8px'
            key.style.borderRadius = '6px'
            key.style.background = 'rgba(255,255,255,0.16)'
            key.style.border = '1px solid rgba(255,255,255,0.2)'
            const label = document.createElement('span')
            label.textContent = ${message}
            pill.appendChild(key)
            pill.appendChild(label)
            root.appendChild(pill)
            document.documentElement.appendChild(host)
            requestAnimationFrame(() => {
              pill.style.opacity = '1'
              pill.style.transform = 'translateY(0)'
            })
            setTimeout(() => {
              pill.style.opacity = '0'
              pill.style.transform = 'translateY(6px)'
              setTimeout(() => host.remove(), 420)
            }, 2400)
          } catch (error) {
            /* 提示失败不影响阅读 */
          }
        })()`,
        true
      )
      .catch(() => undefined)
  }

  scrollTo(index: number): void {
    const safe = Math.max(0, Math.min(99999, Math.floor(index)))
    void this.view.webContents
      .executeJavaScript(`(() => {
        const node = document.querySelector('[data-libra-outline="${safe}"]')
        if (node) node.scrollIntoView({ block: 'start' })
      })()`, true)
      .catch(() => undefined)
  }

  private async publishOutline(): Promise<void> {
    this.win.webContents.send(CH.previewOutline, await this.readOutline())
  }

  private async readOutline(): Promise<OutlineItem[]> {
    try {
      const raw = await this.view.webContents.executeJavaScript(OUTLINE_SCRIPT)
      if (typeof raw !== 'string') return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as OutlineItem[]) : []
    } catch {
      return []
    }
  }

  destroy(): void {
    try {
      this.win.contentView.removeChildView(this.view)
    } catch {
      /* window already gone */
    }
    try {
      this.view.webContents.close()
    } catch {
      /* already closed */
    }
  }
}

export function createPreviewHost(win: BrowserWindow): PreviewHost {
  const host = new PreviewHost(win)
  hosts.set(win.webContents.id, host)
  return host
}

export function getPreviewHost(webContentsId: number): PreviewHost | undefined {
  return hosts.get(webContentsId)
}

export function disposePreviewHost(webContentsId: number): void {
  const host = hosts.get(webContentsId)
  if (!host) return
  hosts.delete(webContentsId)
  host.destroy()
}