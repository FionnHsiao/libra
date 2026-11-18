import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { CH, type CommandId, type ViewMode } from '../shared/protocol'

const SIDEBAR_ITEM_ID = 'sidebar-toggle'
const MODE_EDIT_ITEM_ID = 'mode-edit'

let sidebarVisible = true
let viewMode: ViewMode = 'read'

const SHORTCUTS = [
  '打开              Ctrl+O',
  '保存              Ctrl+S',
  '另存为            Ctrl+Shift+S',
  '切换阅读 / 编辑    Ctrl+E',
  '显示侧边栏         Ctrl+B',
  '在编辑模式查找      Ctrl+F',
  '放大 / 缩小        Ctrl+= / Ctrl+-',
  '实际大小          Ctrl+0',
  '全屏              F11'
].join('\n')

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function sendCommand(id: CommandId): void {
  focusedWindow()?.webContents.send(CH.command, { id })
}

export function setSidebarChecked(visible: boolean): void {
  sidebarVisible = visible
  const item = Menu.getApplicationMenu()?.getMenuItemById(SIDEBAR_ITEM_ID)
  if (item) item.checked = visible
}

export function setModeChecked(mode: ViewMode): void {
  viewMode = mode
  const item = Menu.getApplicationMenu()?.getMenuItemById(MODE_EDIT_ITEM_ID)
  if (item) item.checked = mode === 'edit'
}

const macAppMenu: MenuItemConstructorOptions = {
  label: app.name,
  submenu: [
    { role: 'about', label: '关于 Libra' },
    { type: 'separator' },
    { role: 'hide', label: '隐藏 Libra' },
    { role: 'hideOthers', label: '隐藏其他' },
    { type: 'separator' },
    { role: 'quit', label: '退出 Libra' }
  ]
}

export function installMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [macAppMenu] : []),
    {
      label: '文件',
      submenu: [
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
        { label: '在文件夹中显示', click: () => sendCommand('reveal') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('save-as') },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
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
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找 / 替换…', accelerator: 'CmdOrCtrl+F', click: () => sendCommand('find') }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          id: SIDEBAR_ITEM_ID,
          label: '显示侧边栏',
          type: 'checkbox',
          checked: sidebarVisible,
          accelerator: 'CmdOrCtrl+B',
          click: () => sendCommand('toggle-sidebar')
        },
        { type: 'separator' },
        {
          id: MODE_EDIT_ITEM_ID,
          label: '编辑模式（源码 + 预览）',
          type: 'checkbox',
          checked: viewMode === 'edit',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendCommand('toggle-mode')
        },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { type: 'separator' },
        { label: '刷新预览', accelerator: 'CmdOrCtrl+R', click: () => sendCommand('reload-preview') },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '快捷键',
          click: () => {
            const win = focusedWindow()
            const options = {
              type: 'info' as const,
              title: '快捷键',
              message: 'Libra 快捷键',
              detail: SHORTCUTS,
              buttons: ['知道了']
            }
            if (win) void dialog.showMessageBox(win, options)
            else void dialog.showMessageBox(options)
          }
        },
        {
          label: '项目主页',
          click: () => {
            void shell.openExternal('https://github.com/FionnHsiao/libra')
          }
        },
        { type: 'separator' },
        { label: '关于 Libra', click: () => app.showAboutPanel() }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}