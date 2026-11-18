export type Eol = 'LF' | 'CRLF'

export type ViewMode = 'read' | 'edit'

export interface OverlayItem {
  id: string
  label?: string
  accelerator?: string
  checked?: boolean
  disabled?: boolean
  separator?: boolean
  secondary?: { id: string; label: string }
}

export interface OverlayOpenPayload {
  items: OverlayItem[]
  x: number
  y: number
  width: number
  minWidth?: number
}

export interface JarEntry {
  kind: 'dir' | 'file'
  path: string
}

export interface DocumentData {
  path: string
  text: string
  encoding: string
  bom: boolean
  eol: Eol
  size: number
}

export interface FileEntry {
  name: string
  path: string
  size: number
}

export interface TreeEntry {
  name: string
  path: string
  kind: 'dir' | 'file'
}

export interface DirListing {
  dir: string
  entries: TreeEntry[]
}

export interface FolderListing {
  dir: string
  files: FileEntry[]
}

export interface OutlineItem {
  index: number
  level: number
  text: string
}

export interface PreviewRect {
  x: number
  y: number
  width: number
  height: number
}

export type CommandId = 'open' | 'close-tab' | 'toggle-files' | 'toggle-outline' | 'reveal' | 'reload-preview'

export type AppAction =
  | 'quit'
  | 'toggle-devtools'
  | 'toggle-fullscreen'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'shortcuts'
  | 'about'
  | 'homepage'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'select-all'

export interface CommandMessage {
  id: CommandId
}

export interface LibraApi {
  platform: string
  openDialog(): Promise<DocumentData | null>
  read(path: string): Promise<DocumentData>
  listFolder(dir: string): Promise<FolderListing>
  pickFolder(): Promise<string | null>
  pickFile(): Promise<string | null>
  renamePath(path: string, name: string): Promise<string>
  getEntries(): Promise<JarEntry[]>
  setEntries(entries: JarEntry[]): void
  readDir(dir: string): Promise<DirListing>
  confirmDiscard(): Promise<boolean>
  loadPreview(path: string): Promise<void>
  reloadPreview(): void
  setPreviewBounds(rect: PreviewRect | null): void
  openOverlay(payload: OverlayOpenPayload): void
  closeOverlay(): void
  onOverlaySelect(callback: (id: string) => void): () => void
  onOverlayDismiss(callback: () => void): () => void
  scrollPreviewTo(index: number): void
  revealInFolder(path: string): void
  appAction(action: AppAction): void
  ready(): void
  pathForFile(file: File): string
  onFileOpened(callback: (path: string) => void): () => void
  onPreviewNavigate(callback: (path: string) => void): () => void
  onOutline(callback: (items: OutlineItem[]) => void): () => void
  onTreeChanged(callback: (payload: { dir: string }) => void): () => void
  onCommand(callback: (message: CommandMessage) => void): () => void
}

export const ALLOWED_EXTENSIONS = ['.html', '.htm', '.xhtml', '.css', '.js', '.txt', '.md'] as const

export const HTML_EXTENSIONS = ['.html', '.htm', '.xhtml'] as const

export const CH = {
  openDialog: 'libra:file:open-dialog',
  read: 'libra:file:read',
  listFolder: 'libra:folder:list',
  pickFolder: 'libra:folder:pick',
  pickFile: 'libra:file:pick',
  renamePath: 'libra:file:rename',
  treeChanged: 'libra:tree:changed',
  entriesGet: 'libra:entries:get',
  entriesSet: 'libra:entries:set',
  readDir: 'libra:folder:read-dir',
  confirmDiscard: 'libra:editor:confirm-discard',
  fileOpened: 'libra:file:opened',
  previewLoad: 'libra:preview:load',
  previewReload: 'libra:preview:reload',
  previewBounds: 'libra:preview:bounds',
  overlayOpen: 'libra:overlay:open',
  overlayClose: 'libra:overlay:close',
  overlayData: 'libra:overlay:data',
  overlayMeasure: 'libra:overlay:measure',
  overlaySelect: 'libra:overlay:select',
  overlaySelected: 'libra:overlay:selected',
  overlayDismissed: 'libra:overlay:dismissed',
  overlayReady: 'libra:overlay:ready',
  previewNavigate: 'libra:preview:navigate',
  previewOutline: 'libra:preview:outline',
  previewScrollTo: 'libra:preview:scroll-to',
  reveal: 'libra:file:reveal',
  appAction: 'libra:app:action',
  command: 'libra:command',
  ready: 'libra:app:ready'
} as const

export const MAX_DOCUMENT_BYTES = 512 * 1024 * 1024