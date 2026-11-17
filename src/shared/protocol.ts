export type Eol = 'LF' | 'CRLF'

export interface DocumentData {
  path: string
  text: string
  encoding: string
  bom: boolean
  eol: Eol
  size: number
}

export interface SavePayload {
  path: string
  text: string
  encoding: string
  bom: boolean
  eol: Eol
}

export interface SaveAsPayload {
  text: string
  encoding: string
  bom: boolean
  eol: Eol
  suggestedPath: string | null
}

export interface SaveResult {
  ok: boolean
  bytes: number
}

export interface FileEntry {
  name: string
  path: string
  size: number
}

export interface FolderListing {
  dir: string
  files: FileEntry[]
}

export interface PreviewRect {
  x: number
  y: number
  width: number
  height: number
}

export type CommandId = 'open' | 'save' | 'save-as' | 'toggle-mode'

export interface CommandMessage {
  id: CommandId
}

export interface LibraApi {
  openDialog(): Promise<DocumentData | null>
  read(path: string): Promise<DocumentData>
  save(payload: SavePayload): Promise<SaveResult>
  saveAs(payload: SaveAsPayload): Promise<{ path: string } | null>
  listFolder(dir: string): Promise<FolderListing>
  confirmDiscard(): Promise<boolean>
  loadPreview(path: string): Promise<void>
  reloadPreview(): void
  setPreviewBounds(rect: PreviewRect | null): void
  setDirty(dirty: boolean): void
  reportSave(ok: boolean): void
  ready(): void
  pathForFile(file: File): string
  onFileOpened(callback: (path: string) => void): () => void
  onPreviewNavigate(callback: (path: string) => void): () => void
  onCommand(callback: (message: CommandMessage) => void): () => void
}

export const ALLOWED_EXTENSIONS = ['.html', '.htm', '.xhtml', '.css', '.js', '.txt', '.md'] as const

export const HTML_EXTENSIONS = ['.html', '.htm', '.xhtml'] as const

export const CH = {
  openDialog: 'libra:file:open-dialog',
  read: 'libra:file:read',
  save: 'libra:file:save',
  saveAs: 'libra:file:save-as',
  listFolder: 'libra:folder:list',
  confirmDiscard: 'libra:editor:confirm-discard',
  setDirty: 'libra:editor:set-dirty',
  saveDone: 'libra:editor:save-done',
  fileOpened: 'libra:file:opened',
  previewLoad: 'libra:preview:load',
  previewReload: 'libra:preview:reload',
  previewBounds: 'libra:preview:bounds',
  previewNavigate: 'libra:preview:navigate',
  command: 'libra:command',
  ready: 'libra:app:ready'
} as const

export const MAX_DOCUMENT_BYTES = 512 * 1024 * 1024