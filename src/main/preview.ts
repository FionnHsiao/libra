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
  private suppressed = false

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

  /** 弹层出现前先截一张当前画面，用来顶替被隐藏的原生视图（避免白屏） */
  async capture(): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const image = await this.view.webContents.capturePage()
        if (!image.isEmpty()) return image.toDataURL()
      } catch {
        /* 窗口还没画出第一帧，等一会再试 */
      }
      await new Promise((resolve) => setTimeout(resolve, 90))
    }
    return null
  }

  /** 弹层（菜单 / 右键菜单）出现时临时让出位置：原生视图永远盖在 DOM 之上，只能先隐藏 */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed
    this.view.setVisible(!suppressed)
  }

  setBounds(rect: PreviewRect | null): void {
    if (this.suppressed) return
    if (!rect || rect.width < 8 || rect.height < 8) {
      this.view.setVisible(false)
      return
    }
    const zoom = this.win.webContents.getZoomFactor() || 1
    this.view.setVisible(true)
    this.view.setBounds({
      x: Math.round(rect.x / zoom),
      y: Math.round(rect.y / zoom),
      width: Math.round(rect.width / zoom),
      height: Math.round(rect.height / zoom)
    })
  }

  reload(): void {
    this.view.webContents.reload()
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