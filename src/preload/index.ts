import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  CH,
  type CommandMessage,
  type LibraApi,
  type OutlineItem,
  type PreviewRect
} from '../shared/protocol'

const api: LibraApi = {
  openDialog: () => ipcRenderer.invoke(CH.openDialog),
  read: (path) => ipcRenderer.invoke(CH.read, path),
  save: (payload) => ipcRenderer.invoke(CH.save, payload),
  saveAs: (payload) => ipcRenderer.invoke(CH.saveAs, payload),
  listFolder: (dir) => ipcRenderer.invoke(CH.listFolder, dir),
  pickFolder: () => ipcRenderer.invoke(CH.pickFolder),
  readDir: (dir) => ipcRenderer.invoke(CH.readDir, dir),
  confirmDiscard: () => ipcRenderer.invoke(CH.confirmDiscard),
  loadPreview: (path) => ipcRenderer.invoke(CH.previewLoad, path),
  reloadPreview: () => ipcRenderer.send(CH.previewReload),
  setPreviewBounds: (rect: PreviewRect | null) => ipcRenderer.send(CH.previewBounds, rect),
  scrollPreviewTo: (index) => ipcRenderer.send(CH.previewScrollTo, index),
  revealInFolder: (path) => ipcRenderer.send(CH.reveal, path),
  appAction: (action) => ipcRenderer.send(CH.appAction, action),
  setDirty: (dirty) => ipcRenderer.send(CH.setDirty, dirty),
  reportSave: (ok) => ipcRenderer.send(CH.saveDone, { ok }),
  ready: () => ipcRenderer.send(CH.ready),
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
  onCommand: (callback) => {
    const handler = (_event: unknown, message: CommandMessage): void => callback(message)
    ipcRenderer.on(CH.command, handler)
    return () => {
      ipcRenderer.removeListener(CH.command, handler)
    }
  }
}

contextBridge.exposeInMainWorld('libra', api)