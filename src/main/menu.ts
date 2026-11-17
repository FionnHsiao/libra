import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { CH, type CommandId } from '../shared/protocol'

function sendCommand(id: CommandId): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(CH.command, { id })
}

export function installMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: '关于 Libra' },
              { type: 'separator' as const },
              { role: 'hide' as const, label: '隐藏 Libra' },
              { role: 'hideOthers' as const, label: '隐藏其他' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: '退出 Libra' }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
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
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '项目主页',
          click: () => {
            void shell.openExternal('https://github.com/FionnHsiao/libra')
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}