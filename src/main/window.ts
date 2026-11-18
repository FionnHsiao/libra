import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { handleShortcutInput } from './menu'
import { join } from 'node:path'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']

export function createMainWindow(): BrowserWindow {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Libra',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: '#ececee',
            symbolColor: '#1d1d1f',
            height: 40
          }
        }),
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

  // ready-to-show 在某些情况下不会触发（例如窗口创建时合成器繁忙），
  // 这里补两条兜底，避免"进程起来了但看不到窗口"。
  const showWindow = (): void => {
    if (win.isDestroyed() || win.isVisible()) return
    win.show()
  }
  win.once('ready-to-show', showWindow)
  win.webContents.once('did-finish-load', showWindow)
  const showTimer = setTimeout(showWindow, 1500)
  win.on('closed', () => clearTimeout(showTimer))

  if (isMac) {
    app.dock?.setIcon(iconPath)
  }

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