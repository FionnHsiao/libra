import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CH, type CommandMessage, type LibraApi } from '../shared/protocol'

const api: LibraApi = {
  openDialog: () => ipcRenderer.invoke(CH.openDialog),
  read: (path) => ipcRenderer.invoke(CH.read, path),
  save: (payload) => ipcRenderer.invoke(CH.save, payload),
  saveAs: (payload) => ipcRenderer.invoke(CH.saveAs, payload),
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
  onCommand: (callback) => {
    const handler = (_event: unknown, message: CommandMessage): void => callback(message)
    ipcRenderer.on(CH.command, handler)
    return () => {
      ipcRenderer.removeListener(CH.command, handler)
    }
  }
}

contextBridge.exposeInMainWorld('libra', api)