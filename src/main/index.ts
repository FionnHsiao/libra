import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { CH } from '../shared/protocol'
import { installMenu } from './menu'
import { isDirty, registerIpc, requestSaveFromRenderer } from './ipc'
import { createPreviewHost, disposePreviewHost } from './preview'
import { installPreviewProtocol, registerPreviewScheme } from './protocol'
import { createMainWindow } from './window'

const OPENABLE = /\.(html?|xhtml)$/i

let mainWindow: BrowserWindow | null = null
let pendingFile: string | null = null
let rendererReady = false
let allowClose = false

registerPreviewScheme()

function fileFromArgv(argv: readonly string[]): string | null {
  for (const raw of argv.slice(1)) {
    if (!raw || raw.startsWith('-')) continue
    if (!OPENABLE.test(raw)) continue
    const candidate = isAbsolute(raw) ? raw : resolve(raw)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function deliverFile(filePath: string): void {
  if (mainWindow && rendererReady) {
    mainWindow.webContents.send(CH.fileOpened, filePath)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    return
  }
  pendingFile = filePath
}

async function confirmClose(win: BrowserWindow): Promise<void> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    message: '文档有未保存的修改',
    detail: '关闭前要保存吗？'
  })

  if (response === 2) return
  if (response === 0) {
    const saved = await requestSaveFromRenderer(win)
    if (!saved) return
  }

  allowClose = true
  win.close()
}

function createWindow(): void {
  const win = createMainWindow()
  mainWindow = win
  rendererReady = false

  const contentsId = win.webContents.id
  createPreviewHost(win)

  win.on('close', (event) => {
    if (allowClose || !isDirty()) return
    event.preventDefault()
    void confirmClose(win)
  })

  win.on('closed', () => {
    disposePreviewHost(contentsId)
    mainWindow = null
    rendererReady = false
  })
}

ipcMain.on(CH.ready, () => {
  rendererReady = true
  console.log('[libra] renderer ready')

  if (pendingFile && mainWindow) {
    const file = pendingFile
    pendingFile = null
    mainWindow.webContents.send(CH.fileOpened, file)
  }
})

const hasLock = app.requestSingleInstanceLock()

if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = fileFromArgv(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    if (file) deliverFile(file)
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (app.isReady() && mainWindow) deliverFile(filePath)
    else pendingFile = filePath
  })

  void app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.fionnhsiao.libra')
    }

    installSecurityPolicy()
    installPreviewProtocol()
    registerIpc()
    installMenu()

    const fromArgv = fileFromArgv(process.argv)
    if (fromArgv && !pendingFile) pendingFile = fromArgv

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

function installSecurityPolicy(): void {
  if (!app.isPackaged) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"
        ]
      }
    })
  })
}