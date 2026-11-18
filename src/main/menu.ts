import { BrowserWindow, dialog, Menu, type Event as ElectronEvent, type Input } from 'electron'
import { CH, type CommandId } from '../shared/protocol'

const SHORTCUTS_TEXT = [
  '打开              Ctrl+O',
  '保存              Ctrl+S',
  '另存为            Ctrl+Shift+S',
  '关闭标签页         Ctrl+W',
  '切换阅读 / 编辑    Ctrl+E',
  '文件列表           Ctrl+B',
  '大纲              Ctrl+Shift+B',
  '在编辑模式查找      Ctrl+F',
  '放大 / 缩小        Ctrl+= / Ctrl+-',
  '实际大小          Ctrl+0',
  '全屏              F11'
].join('\n')

/** 没有原生菜单了：菜单由渲染进程自绘在标题栏里。 */
export function installMenu(): void {
  Menu.setApplicationMenu(null)
}

export function showShortcutsDialog(win: BrowserWindow | null): void {
  const options = {
    type: 'info' as const,
    title: '快捷键',
    message: 'Libra 快捷键',
    detail: SHORTCUTS_TEXT,
    buttons: ['知道了']
  }
  if (win) void dialog.showMessageBox(win, options)
  else void dialog.showMessageBox(options)
}

export function adjustZoom(win: BrowserWindow, delta: number): void {
  const current = win.webContents.getZoomFactor()
  const next = Math.min(2, Math.max(0.5, Math.round((current + delta) * 10) / 10))
  win.webContents.setZoomFactor(next)
}

function send(win: BrowserWindow, id: CommandId): void {
  win.webContents.send(CH.command, { id })
}

/**
 * 原生菜单去掉后，快捷键由 here 统一接管。
 * 主窗口和预览视图都会挂这个处理，保证在阅读时按键也有效。
 */
export function handleShortcutInput(event: ElectronEvent, input: Input, win: BrowserWindow): void {
  if (input.type !== 'keyDown') return

  const key = (input.key ?? '').toLowerCase()

  if (key === 'f11') {
    event.preventDefault()
    win.setFullScreen(!win.isFullScreen())
    return
  }

  const mod = process.platform === 'darwin' ? input.meta : input.control
  if (!mod || input.alt) return

  const shift = input.shift

  if (key === '=' || key === '+') {
    event.preventDefault()
    adjustZoom(win, 0.1)
    return
  }
  if (key === '-') {
    event.preventDefault()
    adjustZoom(win, -0.1)
    return
  }
  if (key === '0') {
    event.preventDefault()
    win.webContents.setZoomFactor(1)
    return
  }

  if (key === 'o' && !shift) {
    event.preventDefault()
    send(win, 'open')
    return
  }
  if (key === 's' && shift) {
    event.preventDefault()
    send(win, 'save-as')
    return
  }
  if (key === 's') {
    event.preventDefault()
    send(win, 'save')
    return
  }
  if (key === 'w' && !shift) {
    event.preventDefault()
    send(win, 'close-tab')
    return
  }
  if (key === 'e' && !shift) {
    event.preventDefault()
    send(win, 'toggle-mode')
    return
  }
  if (key === 'b' && shift) {
    event.preventDefault()
    send(win, 'toggle-outline')
    return
  }
  if (key === 'b') {
    event.preventDefault()
    send(win, 'toggle-files')
    return
  }
  if (key === 'f' && !shift) {
    event.preventDefault()
    send(win, 'find')
    return
  }
  if (key === 'r' && !shift) {
    event.preventDefault()
    send(win, 'reload-preview')
  }
}