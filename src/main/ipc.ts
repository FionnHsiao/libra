import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import {
  ALLOWED_EXTENSIONS,
  CH,
  HTML_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  type DirListing,
  type FileEntry,
  type FolderListing,
  type PreviewRect,
  type SaveAsPayload,
  type SavePayload
} from '../shared/protocol'
import { readDocument, writeTextAtomic } from './files'
import { loadJars, saveJars } from './settings'
import { syncWatchers } from './watcher'
import { adjustZoom, showShortcutsDialog } from './menu'
import { getPreviewHost } from './preview'

const allowedExtensions = new Set<string>(ALLOWED_EXTENSIONS)
const htmlExtensions = new Set<string>(HTML_EXTENSIONS)
const MAX_LISTED_FILES = 500

let dirty = false
let pendingSave: ((ok: boolean) => void) | null = null

export function isDirty(): boolean {
  return dirty
}

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

function assertText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('文档内容必须是字符串')
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new Error('文档过大')
  }
  return value
}

function assertEncoding(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32) {
    throw new Error('非法的编码')
  }
  return value
}

function assertSavePayload(value: unknown): SavePayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error('保存参数不合法')
  }
  const payload = value as Partial<SavePayload>
  return {
    path: assertDocumentPath(payload.path),
    text: assertText(payload.text),
    encoding: assertEncoding(payload.encoding),
    bom: payload.bom === true,
    eol: payload.eol === 'CRLF' ? 'CRLF' : 'LF'
  }
}

function assertSaveAsPayload(value: unknown): SaveAsPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error('另存为参数不合法')
  }
  const payload = value as Partial<SaveAsPayload>
  const suggested = payload.suggestedPath
  return {
    text: assertText(payload.text),
    encoding: assertEncoding(payload.encoding),
    bom: payload.bom === true,
    eol: payload.eol === 'CRLF' ? 'CRLF' : 'LF',
    suggestedPath: typeof suggested === 'string' && isAbsolute(suggested) ? suggested : null
  }
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

export function requestSaveFromRenderer(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    if (pendingSave) pendingSave(false)
    const timer = setTimeout(() => {
      pendingSave = null
      resolve(false)
    }, 15000)
    pendingSave = (ok) => {
      clearTimeout(timer)
      pendingSave = null
      resolve(ok)
    }
    win.webContents.send(CH.command, { id: 'save-all' })
  })
}

const openFilters = [
  { name: 'HTML 文档', extensions: ['html', 'htm', 'xhtml'] },
  { name: '样式与脚本', extensions: ['css', 'js'] },
  { name: '文本', extensions: ['txt', 'md'] }
]

export function registerIpc(): void {
  ipcMain.handle(CH.read, async (_event, rawPath: unknown) => {
    return readDocument(assertDocumentPath(rawPath))
  })

  ipcMain.handle(CH.openDialog, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: '打开文档', properties: ['openFile' as const], filters: openFilters }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return readDocument(assertDocumentPath(result.filePaths[0]))
  })

  ipcMain.handle(CH.save, async (_event, rawPayload: unknown) => {
    const payload = assertSavePayload(rawPayload)
    const bytes = await writeTextAtomic(payload.path, payload.text, payload.encoding, payload.bom, payload.eol)
    return { ok: true, bytes }
  })

  ipcMain.handle(CH.saveAs, async (event, rawPayload: unknown) => {
    const payload = assertSaveAsPayload(rawPayload)
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: '另存为',
      defaultPath: payload.suggestedPath ?? 'untitled.html',
      filters: [
        { name: 'HTML 文档', extensions: ['html'] },
        { name: '文本', extensions: ['txt', 'md'] }
      ]
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    const target = assertDocumentPath(result.filePath)
    await writeTextAtomic(target, payload.text, payload.encoding, payload.bom, payload.eol)
    return { path: target }
  })

  ipcMain.handle(CH.readDir, async (_event, rawDir: unknown): Promise<DirListing> => {
    const dir = assertDirectoryPath(rawDir)
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    const entries: DirListing['entries'] = []

    for (const entry of dirents) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        entries.push({ name: entry.name, path: fullPath, kind: 'dir' })
      } else if (entry.isFile() && htmlExtensions.has(extname(entry.name).toLowerCase())) {
        entries.push({ name: entry.name, path: fullPath, kind: 'file' })
      }
    }

    entries.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })

    return { dir, entries }
  })

  ipcMain.handle(CH.jarsGet, async (): Promise<string[]> => {
    return loadJars()
  })

  ipcMain.on(CH.jarsSet, (_event, rawJars: unknown) => {
    if (!Array.isArray(rawJars)) return
    const jars = rawJars.filter((item): item is string => typeof item === 'string')
    saveJars(jars)
    syncWatchers(jars)
  })

  ipcMain.handle(CH.renamePath, async (_event, rawPath: unknown, rawName: unknown): Promise<string> => {
    const target = await assertExistingPath(rawPath)
    const name = assertNewName(rawName)
    const next = join(dirname(target), name)
    if (next.toLowerCase() === target.toLowerCase()) return target
    await fs.rename(target, next)
    return next
  })

  ipcMain.handle(CH.pickFolder, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: '添加文件夹', properties: ['openDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return resolve(result.filePaths[0])
  })

  ipcMain.handle(CH.listFolder, async (_event, rawDir: unknown): Promise<FolderListing> => {
    const dir = assertDirectoryPath(rawDir)
    const dirents = await fs.readdir(dir, { withFileTypes: true })

    const candidates = dirents
      .filter((entry) => entry.isFile() && htmlExtensions.has(extname(entry.name).toLowerCase()))
      .slice(0, MAX_LISTED_FILES)

    const files: FileEntry[] = await Promise.all(
      candidates.map(async (entry) => {
        const fullPath = join(dir, entry.name)
        let size = 0
        try {
          size = (await fs.stat(fullPath)).size
        } catch {
          size = 0
        }
        return { name: entry.name, path: fullPath, size }
      })
    )

    files.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    return { dir, files }
  })

  ipcMain.handle(CH.confirmDiscard, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'question' as const,
      buttons: ['放弃修改', '取消'],
      defaultId: 1,
      cancelId: 1,
      message: '有未保存的修改',
      detail: '继续操作会丢弃这些修改。'
    }
    const result = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return result.response === 0
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

  ipcMain.on(CH.appAction, (event, rawAction: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || typeof rawAction !== 'string') return

    switch (rawAction) {
      case 'quit':
        app.quit()
        break
      case 'toggle-devtools':
        win.webContents.toggleDevTools()
        break
      case 'toggle-fullscreen':
        win.setFullScreen(!win.isFullScreen())
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
        void shell.openExternal('https://github.com/FionnHsiao/libra')
        break
      case 'cut':
        win.webContents.cut()
        break
      case 'copy':
        win.webContents.copy()
        break
      case 'paste':
        win.webContents.paste()
        break
      case 'select-all':
        win.webContents.selectAll()
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

  ipcMain.on(CH.setDirty, (_event, value: unknown) => {
    dirty = value === true
  })

  ipcMain.on(CH.saveDone, (_event, value: unknown) => {
    const ok = typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === true
    pendingSave?.(ok)
  })
}