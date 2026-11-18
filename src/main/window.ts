import { BrowserWindow, shell } from 'electron'
import { handleShortcutInput } from './menu'
import { join } from 'node:path'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Libra',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f7f4ec',
      symbolColor: '#2f2c26',
      height: 40
    },
    backgroundColor: '#12141a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.on('before-input-event', (event, input) => {
    handleShortcutInput(event, input, win)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const isInternal = devServerUrl ? url.startsWith(devServerUrl) : url.startsWith('file://')
    if (isInternal) return
    event.preventDefault()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[libra] renderer gone:', details.reason)
  })

  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[libra] load failed: ${code} ${description}`)
  })

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}