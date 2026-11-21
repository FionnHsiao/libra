import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import {
  ALLOWED_EXTENSIONS,
  CH,
  HTML_EXTENSIONS,
  type DirListing,
  type OverlayOpenPayload,
  type PreviewRect
} from '../shared/protocol'
import { loadEntries, saveEntries } from './settings'
import { syncWatchers } from './watcher'
import { adjustZoom, showShortcutsDialog } from './menu'
import { getOverlayHost, getOverlayHostBySender } from './overlay'
import { getPreviewHost } from './preview'
import { getFindHost, getFindHostBySender } from './find'

const allowedExtensions = new Set<string>(ALLOWED_EXTENSIONS)
const htmlExtensions = new Set<string>(HTML_EXTENSIONS)

export function assertDocumentPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    throw new Error('非法的文件路径')
  }
  if (!isAbsolute(value)) {
    throw new Error('只接受绝对路径')
  }
  const extension = extname(value).toLowerCase()
  if (!allowedExtensions.has(extension)) {
    throw new Error(`不支持的文件类型：${extension || '(无扩展名)'}`)
  }
  return resolve(value)
}

const INVALID_NAME = /[\\/:*?"<>|]/

async function assertExistingPath(value: unknown): Promise<string> {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    throw new Error('非法的路径')
  }
  if (!isAbsolute(value)) throw new Error('只接受绝对路径')
  try {
    await fs.stat(value)
  } catch {
    throw new Error('目标不存在')
  }
  return resolve(value)
}

function assertNewName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('文件名必须是字符串')
  const name = value.trim()
  if (!name) throw new Error('文件名不能为空')
  if (name === '.' || name === '..') throw new Error('文件名不合法')
  if (name.length > 200) throw new Error('文件名过长')
  if (INVALID_NAME.test(name)) throw new Error('文件名不能包含 \\ / : * ? " < > |')
  if (/[.\s]$/.test(name)) throw new Error('文件名不能以点或空格结尾')
  return name
}

function assertDirectoryPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    throw new Error('非法的目录路径')
  }
  if (!isAbsolute(value)) {
    throw new Error('只接受绝对路径')
  }
  return resolve(value)
}

function parseRect(value: unknown): PreviewRect | null {
  if (typeof value !== 'object' || value === null) return null
  const rect = value as Partial<PreviewRect>
  const numbers = [rect.x, rect.y, rect.width, rect.height]
  if (!numbers.every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  return {
    x: rect.x as number,
    y: rect.y as number,
    width: Math.max(0, rect.width as number),
    height: Math.max(0, rect.height as number)
  }
}

const openFilters = [
  { name: 'HTML 文档', extensions: ['html', 'htm', 'xhtml'] },
  { name: '样式与脚本', extensions: ['css', 'js'] },
  { name: '文本', extensions: ['txt', 'md'] }
]

export function registerIpc(): void {
  ipcMain.handle(CH.checkPath, async (_event, rawPath: unknown) => {
    assertDocumentPath(rawPath)
  })

  ipcMain.handle(CH.openDialog, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: '打开文档', properties: ['openFile' as const], filters: openFilters }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return assertDocumentPath(result.filePaths[0])
  })

  ipcMain.handle(CH.readDir, async (_event, rawDir: unknown): Promise<DirListing> => {
    const dir = assertDirectoryPath(rawDir)
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    const picked = dirents.filter((entry) => {
      if (entry.name.startsWith('.')) return false
      if (entry.isDirectory()) return entry.name !== 'node_modules'
      return entry.isFile() && htmlExtensions.has(extname(entry.name).toLowerCase())
    })

    // 按时间排序需要 mtime；目录条目通常不多，这里顺手 stat 一次
    const entries: DirListing['entries'] = await Promise.all(
      picked.map(async (entry) => {
        const fullPath = join(dir, entry.name)
        let mtimeMs: number | undefined
        try {
          mtimeMs = (await fs.stat(fullPath)).mtimeMs
        } catch {
          /* 读不到时间就不参与时间排序 */
        }
        return {
          name: entry.name,
          path: fullPath,
          kind: entry.isDirectory() ? ('dir' as const) : ('file' as const),
          mtimeMs
        }
      })
    )

    entries.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })

    return { dir, entries }
  })

  ipcMain.handle(CH.entriesGet, async () => {
    const entries = loadEntries()
    // 星星罐根条目也要能按时间排；这里补一次 mtime，不写回设置文件
    return Promise.all(
      entries.map(async (entry) => {
        try {
          return { ...entry, mtimeMs: (await fs.stat(entry.path)).mtimeMs }
        } catch {
          return entry
        }
      })
    )
  })

  ipcMain.on(CH.entriesSet, (_event, rawEntries: unknown) => {
    if (!Array.isArray(rawEntries)) return
    const entries = rawEntries
      .filter((item): item is { kind: 'dir' | 'file'; path: string } => {
        if (typeof item !== 'object' || item === null) return false
        const entry = item as { kind?: unknown; path?: unknown }
        return (entry.kind === 'dir' || entry.kind === 'file') && typeof entry.path === 'string'
      })
    saveEntries(entries)
    syncWatchers(entries.filter((entry) => entry.kind === 'dir').map((entry) => entry.path))
  })

  ipcMain.handle(CH.renamePath, async (_event, rawPath: unknown, rawName: unknown): Promise<string> => {
    const target = await assertExistingPath(rawPath)
    const name = assertNewName(rawName)
    const next = join(dirname(target), name)
    if (next.toLowerCase() === target.toLowerCase()) return target
    await fs.rename(target, next)
    return next
  })

  ipcMain.handle(CH.pickFile, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '添加文件',
      properties: ['openFile' as const],
      filters: [
        { name: 'HTML 文档', extensions: ['html', 'htm', 'xhtml'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return resolve(result.filePaths[0])
  })

  ipcMain.handle(CH.pickFolder, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: '添加文件夹', properties: ['openDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return resolve(result.filePaths[0])
  })

  ipcMain.handle(CH.previewLoad, async (event, rawPath: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const host = getPreviewHost(win.webContents.id)
    if (!host) return
    await host.load(assertDocumentPath(rawPath))
  })

  ipcMain.on(CH.previewReload, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    getPreviewHost(win.webContents.id)?.reload()
  })

  ipcMain.on(CH.overlayOpen, (event, payload: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof payload !== 'object' || payload === null) return
    getOverlayHost(win.webContents.id)?.open(payload as OverlayOpenPayload)
  })

  ipcMain.on(CH.overlayClose, (event) => {
    const host = getOverlayHostBySender(event.sender.id)
    host?.dismiss()
  })

  ipcMain.on(CH.overlayReady, (event) => {
    getOverlayHostBySender(event.sender.id)?.pushData()
  })

  ipcMain.on(CH.overlayMeasure, (event, height: unknown) => {
    if (typeof height !== 'number' || !Number.isFinite(height)) return
    getOverlayHostBySender(event.sender.id)?.setHeight(height)
  })

  ipcMain.on(CH.overlaySelect, (event, id: unknown) => {
    if (typeof id !== 'string') return
    getOverlayHostBySender(event.sender.id)?.select(id)
  })

  ipcMain.on(CH.previewBounds, (event, rawRect: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    getPreviewHost(win.webContents.id)?.setBounds(parseRect(rawRect))
  })

  ipcMain.on(CH.previewScrollTo, (event, rawIndex: unknown) => {
    if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    getPreviewHost(win.webContents.id)?.scrollTo(rawIndex)
  })

  ipcMain.on(CH.previewHint, (event, rawText: unknown) => {
    if (typeof rawText !== 'string') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    getPreviewHost(win.webContents.id)?.flashHint(rawText)
  })

  ipcMain.on(CH.findOpen, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    getFindHost(win.webContents.id)?.openBar()
  })

  ipcMain.on(CH.findQuery, (event, text: unknown, forward: unknown, findNext: unknown) => {
    getFindHostBySender(event.sender.id)?.query(text, forward, findNext)
  })

  ipcMain.on(CH.findClose, (event) => {
    getFindHostBySender(event.sender.id)?.close()
  })

  // 全屏阅读：窗口进全屏，界面上的栏全部由渲染进程隐藏。
  // 记住进全屏之前的状态，退出时还原，避免把用户原本的全屏状态改掉。
  const immersiveByWindow = new Map<number, boolean>()
  const fullscreenBefore = new Map<number, boolean>()
  ipcMain.on(CH.immersive, (event, rawActive: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const active = rawActive === true
    if (immersiveByWindow.get(win.id) === active) return
    immersiveByWindow.set(win.id, active)
    if (active) {
      fullscreenBefore.set(win.id, win.isFullScreen())
      win.setFullScreen(true)
    } else {
      win.setFullScreen(fullscreenBefore.get(win.id) ?? false)
      win.webContents.focus()

      // 系统全屏的进出是异步的，而预览是原生视图：这段过渡里渲染进程可能一次
      // ResizeObserver / resize 回调都收不到，原生视图就会停在旧位置。
      // 过渡结束后主动让渲染进程重新上报一次尺寸。
      const refreshBounds = (): void => {
        if (win.isDestroyed()) return
        win.webContents.send(CH.command, { id: 'refresh-preview-bounds' })
      }
      win.once('leave-full-screen', refreshBounds)
      setTimeout(refreshBounds, 280)
    }
  })

  ipcMain.on(CH.appAction, (event, rawAction: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof rawAction !== 'string') return

    switch (rawAction) {
      case 'quit':
        app.quit()
        break
      case 'zoom-in':
        adjustZoom(win, 0.1)
        break
      case 'zoom-out':
        adjustZoom(win, -0.1)
        break
      case 'zoom-reset':
        win.webContents.setZoomFactor(1)
        break
      case 'shortcuts':
        showShortcutsDialog(win)
        break
      case 'about':
        app.showAboutPanel()
        break
      case 'homepage':
        void shell.openExternal('https://github.com/HsiaoBob/Libra')
        break
      default:
        break
    }
  })

  ipcMain.on(CH.reveal, (_event, rawPath: unknown) => {
    try {
      shell.showItemInFolder(assertDocumentPath(rawPath))
    } catch {
      /* 没有打开的文件，忽略 */
    }
  })

}