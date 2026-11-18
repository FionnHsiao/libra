import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import { CH } from '../shared/protocol'

const watchers = new Map<string, FSWatcher>()
const timers = new Map<string, NodeJS.Timeout>()

function notify(dir: string, path: string): void {
  const win = BrowserWindow.getAllWindows()[0]
  win?.webContents.send(CH.treeChanged, { dir, path })
}

function schedule(dir: string, path: string): void {
  const key = dir.toLowerCase()
  const pending = timers.get(key)
  if (pending) clearTimeout(pending)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      notify(dir, path)
    }, 250)
  )
}

/**
 * 监听星星罐根目录及其子目录。Windows / macOS 的 fs.watch 支持递归，
 * 变化后按目录去抖，再通知渲染进程重新读取那一层。
 */
export function syncWatchers(roots: string[]): void {
  const wanted = new Set(roots.map((root) => root.toLowerCase()))

  for (const [root, watcher] of [...watchers]) {
    if (wanted.has(root.toLowerCase())) continue
    watcher.close()
    watchers.delete(root)
  }

  for (const root of roots) {
    if (watchers.has(root)) continue
    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        const relative = filename ? filename.toString() : ''
        const changedPath = relative ? join(root, relative) : root
        schedule(dirname(changedPath), changedPath)
      })
      watcher.on('error', () => {
        watcher.close()
        watchers.delete(root)
      })
      watchers.set(root, watcher)
    } catch {
      /* 权限不足或网络盘，跳过监听 */
    }
  }
}