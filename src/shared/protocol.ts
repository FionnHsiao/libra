export type Eol = 'LF' | 'CRLF'

export interface OverlayItem {
  id: string
  label?: string
  accelerator?: string
  checked?: boolean
  disabled?: boolean
  separator?: boolean
  secondary?: { id: string; label: string }
}

export interface OverlayAnchorRect {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayOpenPayload {
  items: OverlayItem[]
  x: number
  y: number
  width: number
  /** 触发按钮的矩形：鼠标离开它和下拉框的并集时自动收起 */
  anchor?: OverlayAnchorRect
}

export interface JarEntry {
  kind: 'dir' | 'file'
  path: string
  /** 只在读取时补上，不写回设置文件 */
  mtimeMs?: number
}

export interface TreeEntry {
  name: string
  path: string
  kind: 'dir' | 'file'
  /** 修改时间，按时间排序用；拿不到时缺省 */
  mtimeMs?: number
}

export interface DirListing {
  dir: string
  entries: TreeEntry[]
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

export type CommandId =
  | 'open'
  | 'close-tab'
  | 'toggle-files'
  | 'toggle-outline'
  | 'reveal'
  | 'reload-preview'
  | 'toggle-immersive'
  | 'exit-immersive'
  | 'refresh-preview-bounds'
  | 'find'

export type AppAction =
  | 'quit'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'shortcuts'
  | 'about'
  | 'homepage'

export interface CommandMessage {
  id: CommandId
}

export interface LibraApi {
  platform: string
  openDialog(): Promise<string | null>
  checkPath(path: string): Promise<void>
  pickFolder(): Promise<string | null>
  pickFile(): Promise<string | null>
  renamePath(path: string, name: string): Promise<string>
  getEntries(): Promise<JarEntry[]>
  setEntries(entries: JarEntry[]): void
  readDir(dir: string): Promise<DirListing>
  loadPreview(path: string): Promise<void>
  reloadPreview(): void
  setPreviewBounds(rect: PreviewRect | null): void
  setImmersive(active: boolean): void
  openFind(): void
  closeFind(): void
  openOverlay(payload: OverlayOpenPayload): void
  closeOverlay(): void
  onOverlaySelect(callback: (id: string) => void): () => void
  onOverlayDismiss(callback: () => void): () => void
  scrollPreviewTo(index: number): void
  showPreviewHint(text: string): void
  revealInFolder(path: string): void
  appAction(action: AppAction): void
  ready(): void
  pathForFile(file: File): string
  onFileOpened(callback: (path: string) => void): () => void
  onPreviewNavigate(callback: (path: string) => void): () => void
  onOutline(callback: (items: OutlineItem[]) => void): () => void
  onTreeChanged(callback: (payload: { dir: string; path: string }) => void): () => void
  onCommand(callback: (message: CommandMessage) => void): () => void
}

export const ALLOWED_EXTENSIONS = ['.html', '.htm', '.xhtml', '.css', '.js', '.txt', '.md'] as const

export const HTML_EXTENSIONS = ['.html', '.htm', '.xhtml'] as const

export const CH = {
  openDialog: 'libra:file:open-dialog',
  checkPath: 'libra:file:check',
  pickFolder: 'libra:folder:pick',
  pickFile: 'libra:file:pick',
  renamePath: 'libra:file:rename',
  treeChanged: 'libra:tree:changed',
  entriesGet: 'libra:entries:get',
  entriesSet: 'libra:entries:set',
  readDir: 'libra:folder:read-dir',
  fileOpened: 'libra:file:opened',
  previewLoad: 'libra:preview:load',
  previewReload: 'libra:preview:reload',
  previewBounds: 'libra:preview:bounds',
  immersive: 'libra:window:immersive',
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
  previewHint: 'libra:preview:hint',
  findOpen: 'libra:find:open',
  findQuery: 'libra:find:query',
  findClose: 'libra:find:close',
  findResult: 'libra:find:result',
  reveal: 'libra:file:reveal',
  appAction: 'libra:app:action',
  command: 'libra:command',
  ready: 'libra:app:ready'
} as const