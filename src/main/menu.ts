import { app, BrowserWindow, dialog, Menu, type Event as ElectronEvent, type MenuItemConstructorOptions, type Input } from 'electron'
import { CH, type CommandId } from '../shared/protocol'

const SHORTCUTS_TEXT = [
  '打开              Ctrl+O',
  '关闭标签页         Ctrl+W',
  '文件列表           Ctrl+B',
  '大纲              Ctrl+Shift+B',
  '放大 / 缩小        Ctrl+= / Ctrl+-',
  '实际大小          Ctrl+0',
  '刷新预览          Ctrl+R',
  '全屏阅读          F11 / Esc 退出'
].join('\n')

/** 没有原生菜单了：菜单由渲染进程自绘在标题栏里。 */
export function installMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 Libra' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 Libra' },
        { role: 'hideOthers', label: '隐藏其他' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Libra' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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
    send(win, 'toggle-immersive')
    return
  }

  // Esc 只负责"退出全屏阅读"，不拦按键：重命名输入框还要用它取消
  if (key === 'escape') {
    send(win, 'exit-immersive')
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
  if (key === 'w' && !shift) {
    event.preventDefault()
    send(win, 'close-tab')
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
  if (key === 'r' && !shift) {
    event.preventDefault()
    send(win, 'reload-preview')
  }

  if (process.platform === 'darwin' && input.meta && key === 'q') {
    event.preventDefault()
    app.quit()
  }
}