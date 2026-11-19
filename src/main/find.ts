import { BrowserWindow, WebContentsView } from 'electron'
import { join } from 'node:path'
import { CH } from '../shared/protocol'
import type { PreviewHost } from './preview'

const VIEW_WIDTH = 396
const VIEW_HEIGHT = 58
const MARGIN = 12

const hosts = new Map<number, FindHost>()
const hostByView = new Map<number, FindHost>()

/**
 * 正文上方的查找栏。
 * 预览是原生视图，会把主窗口的 DOM 盖住，所以查找栏只能自己是另一个视图，
 * 叠在预览上面（跟菜单弹层同一个思路）。
 */
export class FindHost {
  private view: WebContentsView | null = null
  private visible = false

  constructor(
    private readonly win: BrowserWindow,
    private readonly preview: PreviewHost
  ) {
    preview.webContents.on('found-in-page', (_event, result) => {
      this.view?.webContents.send(CH.findResult, {
        active: result.activeMatchOrdinal || 0,
        matches: result.matches || 0
      })
    })

    // 换文档、刷新之后旧的查找会话已经失效
    preview.webContents.on('did-start-loading', () => this.close())
    // 窗口大小变了，预览位置跟着变，查找栏也要挪
    preview.onBoundsChanged(() => this.layout())
  }

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

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) void view.webContents.loadURL(`${devUrl}/find.html`)
    else void view.webContents.loadFile(join(__dirname, '../renderer/find.html'))

    hostByView.set(view.webContents.id, this)
    this.view = view
    return view
  }

  openBar(): void {
    if (!this.preview.getBounds()) return
    const view = this.ensureView()
    this.layout()
    view.setVisible(true)
    this.visible = true
    view.webContents.focus()
  }

  close(): void {
    if (!this.visible) return
    this.visible = false
    try {
      this.preview.webContents.stopFindInPage('clearSelection')
    } catch {
      /* 页面已经没了 */
    }
    this.view?.setVisible(false)
    // 关掉查找栏之后把焦点还给正文，否则键盘没有落点
    try {
      this.preview.webContents.focus()
    } catch {
      /* 窗口已经关了 */
    }
  }

  query(text: unknown, forward: unknown, mode: unknown): void {
    if (!this.visible || typeof text !== 'string') return
    if (!text) {
      this.preview.webContents.stopFindInPage('clearSelection')
      this.view?.webContents.send(CH.findResult, { active: 0, matches: 0 })
      return
    }
    // Electron 的 findNext 含义是「开启新的查找会话」，不是「找下一个」
    this.preview.webContents.findInPage(text, {
      forward: forward !== false,
      findNext: mode === 'new'
    })
  }

  private layout(): void {
    const bounds = this.preview.getBounds()
    if (!bounds) {
      this.close()
      return
    }
    const width = Math.min(VIEW_WIDTH, Math.max(160, bounds.width - MARGIN * 2))
    this.view?.setBounds({
      x: Math.round(Math.max(bounds.x + 8, bounds.x + bounds.width - width - MARGIN)),
      y: Math.round(bounds.y + MARGIN),
      width,
      height: VIEW_HEIGHT
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

export function createFindHost(win: BrowserWindow, preview: PreviewHost): FindHost {
  const host = new FindHost(win, preview)
  hosts.set(win.webContents.id, host)
  return host
}

export function getFindHost(webContentsId: number): FindHost | undefined {
  return hosts.get(webContentsId)
}

export function getFindHostBySender(webContentsId: number): FindHost | undefined {
  return hosts.get(webContentsId) ?? hostByView.get(webContentsId)
}

export function disposeFindHost(webContentsId: number): void {
  const host = hosts.get(webContentsId)
  if (!host) return
  hosts.delete(webContentsId)
  host.destroy()
}
