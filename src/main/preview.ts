import { BrowserWindow, shell, WebContentsView } from 'electron'
import { dirname } from 'node:path'
import { CH, type PreviewRect } from '../shared/protocol'
import { PREVIEW_PARTITION, allowRoot, fromPreviewUrl, toPreviewUrl } from './protocol'

const hosts = new Map<number, PreviewHost>()
const HTML_LIKE = /\.(html?|xhtml)$/i

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