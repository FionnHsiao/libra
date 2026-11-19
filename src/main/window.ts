import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { handleShortcutInput } from './menu'
import { join } from 'node:path'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  // Windows 用满幅图标；macOS 用 1024 画布、内容 824 的版本，否则 Dock 里会比别的 App 大一圈
  const iconPath = join(
    __dirname,
    isMac ? '../../resources/icons/icon-mac-1024.png' : '../../resources/icon.png'
  )

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
      ? {
          // 红绿灯默认位置偏高偏左，固定住才能和 40px 标题栏对齐
          trafficLightPosition: { x: 20, y: 14 }
        }
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

  if (isMac && existsSync(iconPath)) {
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