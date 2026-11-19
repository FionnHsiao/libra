import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  CH,
  type CommandMessage,
  type LibraApi,
  type OutlineItem,
  type PreviewRect
} from '../shared/protocol'

const api: LibraApi = {
  platform: process.platform,
  openDialog: () => ipcRenderer.invoke(CH.openDialog),
  checkPath: (path) => ipcRenderer.invoke(CH.checkPath, path),
  pickFolder: () => ipcRenderer.invoke(CH.pickFolder),
  pickFile: () => ipcRenderer.invoke(CH.pickFile),
  renamePath: (path, name) => ipcRenderer.invoke(CH.renamePath, path, name),
  getEntries: () => ipcRenderer.invoke(CH.entriesGet),
  setEntries: (entries) => ipcRenderer.send(CH.entriesSet, entries),
  readDir: (dir) => ipcRenderer.invoke(CH.readDir, dir),
  loadPreview: (path) => ipcRenderer.invoke(CH.previewLoad, path),
  reloadPreview: () => ipcRenderer.send(CH.previewReload),
  setPreviewBounds: (rect: PreviewRect | null) => ipcRenderer.send(CH.previewBounds, rect),
  setImmersive: (active) => ipcRenderer.send(CH.immersive, active),
  openOverlay: (payload) => ipcRenderer.send(CH.overlayOpen, payload),
  closeOverlay: () => ipcRenderer.send(CH.overlayClose),
  onOverlaySelect: (callback) => {
    const handler = (_event: unknown, id: string): void => callback(id)
    ipcRenderer.on(CH.overlaySelected, handler)
    return () => {
      ipcRenderer.removeListener(CH.overlaySelected, handler)
    }
  },
  onOverlayDismiss: (callback) => {
    const handler = (): void => callback()
    ipcRenderer.on(CH.overlayDismissed, handler)
    return () => {
      ipcRenderer.removeListener(CH.overlayDismissed, handler)
    }
  },
  scrollPreviewTo: (index) => ipcRenderer.send(CH.previewScrollTo, index),
  showPreviewHint: (text) => ipcRenderer.send(CH.previewHint, text),
  revealInFolder: (path) => ipcRenderer.send(CH.reveal, path),
  appAction: (action) => ipcRenderer.send(CH.appAction, action),
  ready: () => ipcRenderer.send(CH.ready),
  openFind: () => ipcRenderer.send(CH.findOpen),
  closeFind: () => ipcRenderer.send(CH.findClose),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  onFileOpened: (callback) => {
    const handler = (_event: unknown, path: string): void => callback(path)
    ipcRenderer.on(CH.fileOpened, handler)
    return () => {
      ipcRenderer.removeListener(CH.fileOpened, handler)
    }
  },
  onPreviewNavigate: (callback) => {
    const handler = (_event: unknown, path: string): void => callback(path)
    ipcRenderer.on(CH.previewNavigate, handler)
    return () => {
      ipcRenderer.removeListener(CH.previewNavigate, handler)
    }
  },
  onOutline: (callback) => {
    const handler = (_event: unknown, items: OutlineItem[]): void => callback(items)
    ipcRenderer.on(CH.previewOutline, handler)
    return () => {
      ipcRenderer.removeListener(CH.previewOutline, handler)
    }
  },
  onTreeChanged: (callback) => {
    const handler = (_event: unknown, payload: { dir: string; path: string }): void => callback(payload)
    ipcRenderer.on(CH.treeChanged, handler)
    return () => {
      ipcRenderer.removeListener(CH.treeChanged, handler)
    }
  },
  onCommand: (callback) => {
    const handler = (_event: unknown, message: CommandMessage): void => callback(message)
    ipcRenderer.on(CH.command, handler)
    return () => {
      ipcRenderer.removeListener(CH.command, handler)
    }
  }
}

contextBridge.exposeInMainWorld('libra', api)

// 弹层页面复用同一个 preload（沙箱 preload 不能 require 相对模块，
// 所以只能放在同一个文件里，不能拆成第二个入口）
const overlayApi = {
  ready: (): void => ipcRenderer.send(CH.overlayReady),
  measure: (height: number): void => ipcRenderer.send(CH.overlayMeasure, height),
  select: (id: string): void => ipcRenderer.send(CH.overlaySelect, id),
  close: (): void => ipcRenderer.send(CH.overlayClose),
  onData: (callback: (payload: { items: unknown[]; width: number }) => void): (() => void) => {
    const handler = (_event: unknown, payload: { items: unknown[]; width: number }): void => callback(payload)
    ipcRenderer.on(CH.overlayData, handler)
    return () => {
      ipcRenderer.removeListener(CH.overlayData, handler)
    }
  }
}

contextBridge.exposeInMainWorld('overlayApi', overlayApi)

// 查找栏也是独立视图，和弹层一样需要一个很小的专用接口
const findApi = {
  query: (text: string, forward: boolean, mode: 'new' | 'next'): void =>
    ipcRenderer.send(CH.findQuery, text, forward, mode),
  close: (): void => ipcRenderer.send(CH.findClose),
  onResult: (callback: (result: { active: number; matches: number }) => void): (() => void) => {
    const handler = (_event: unknown, result: { active: number; matches: number }): void => callback(result)
    ipcRenderer.on(CH.findResult, handler)
    return () => {
      ipcRenderer.removeListener(CH.findResult, handler)
    }
  }
}

contextBridge.exposeInMainWorld('findApi', findApi)