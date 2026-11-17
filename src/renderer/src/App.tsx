import type { EditorView } from '@codemirror/view'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { DocumentData, FolderListing, PreviewRect } from '../../shared/protocol'
import { Editor } from './Editor'
import { PreviewPane } from './PreviewPane'
import { Sidebar } from './Sidebar'

type Mode = 'read' | 'edit'

interface Cursor {
  line: number
  column: number
}

function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function dirName(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index > 0 ? path.slice(0, index) : path
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, '')
  }
  return String(error)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function EmptyState({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div className="empty">
      <div className="empty-mark">L</div>
      <h1>把一个 HTML 文件交给 Libra</h1>
      <p>拖进来，或按 Ctrl+O。默认以渲染后的样子打开，想看源码按 Ctrl+E。</p>
      <button className="primary" type="button" onClick={onOpen}>
        打开文档
      </button>
    </div>
  )
}

export function App(): ReactElement {
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [docKey, setDocKey] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<Mode>('read')
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1 })
  const [folder, setFolder] = useState<FolderListing | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const viewRef = useRef<EditorView | null>(null)
  const docRef = useRef<DocumentData | null>(null)
  const dirtyRef = useRef(false)

  const markDirty = useCallback((value: boolean) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])

  const applyDocument = useCallback(
    (next: DocumentData) => {
      docRef.current = next
      setDoc(next)
      markDirty(false)
      setCursor({ line: 1, column: 1 })
      setDocKey((key) => key + 1)
      void window.libra.loadPreview(next.path).catch(() => undefined)
      window.libra
        .listFolder(dirName(next.path))
        .then((listing) => setFolder(listing))
        .catch(() => setFolder(null))
    },
    [markDirty]
  )

  const confirmIfDirty = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true
    return window.libra.confirmDiscard()
  }, [])

  const openPath = useCallback(
    async (path: string) => {
      if (docRef.current?.path === path) return
      if (!(await confirmIfDirty())) return
      try {
        applyDocument(await window.libra.read(path))
      } catch (error) {
        setStatus(describeError(error))
      }
    },
    [applyDocument, confirmIfDirty]
  )

  const openViaDialog = useCallback(async () => {
    if (!(await confirmIfDirty())) return
    try {
      const data = await window.libra.openDialog()
      if (data) applyDocument(data)
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [applyDocument, confirmIfDirty])

  const saveDocument = useCallback(async (): Promise<boolean> => {
    const view = viewRef.current
    const current = docRef.current
    if (!view || !current) return false

    try {
      const text = view.state.doc.toString()
      const result = await window.libra.save({
        path: current.path,
        text,
        encoding: current.encoding,
        bom: current.bom,
        eol: current.eol
      })
      docRef.current = { ...current, text, size: result.bytes }
      markDirty(false)
      setStatus('已保存')
      window.libra.reloadPreview()
      return true
    } catch (error) {
      setStatus(describeError(error))
      return false
    }
  }, [markDirty])

  const saveDocumentAs = useCallback(async (): Promise<boolean> => {
    const view = viewRef.current
    const current = docRef.current
    if (!view) return false

    try {
      const result = await window.libra.saveAs({
        text: view.state.doc.toString(),
        encoding: current?.encoding ?? 'utf8',
        bom: current?.bom ?? false,
        eol: current?.eol ?? 'LF',
        suggestedPath: current?.path ?? null
      })
      if (!result) return true
      applyDocument(await window.libra.read(result.path))
      setStatus(`已另存为 ${baseName(result.path)}`)
      return true
    } catch (error) {
      setStatus(describeError(error))
      return false
    }
  }, [applyDocument])

  const handleChange = useCallback(() => {
    markDirty(true)
  }, [markDirty])

  const handleCursor = useCallback((line: number, column: number) => {
    setCursor({ line, column })
  }, [])

  const handleBounds = useCallback((rect: PreviewRect | null) => {
    window.libra.setPreviewBounds(rect)
  }, [])

  useEffect(() => {
    window.libra.setDirty(dirty)
  }, [dirty])

  useEffect(() => {
    const name = doc ? baseName(doc.path) : '未打开文件'
    document.title = doc ? `Libra — ${name}${dirty ? ' •' : ''}` : 'Libra'
  }, [doc, dirty])

  useEffect(() => {
    if (!doc) window.libra.setPreviewBounds(null)
  }, [doc])

  useEffect(() => {
    const offCommand = window.libra.onCommand((message) => {
      if (message.id === 'open') {
        void openViaDialog()
        return
      }
      if (message.id === 'save-as') {
        void saveDocumentAs()
        return
      }
      if (message.id === 'toggle-mode') {
        setMode((current) => (current === 'read' ? 'edit' : 'read'))
        return
      }
      void saveDocument().then((ok) => window.libra.reportSave(ok))
    })
    const offOpened = window.libra.onFileOpened((path) => {
      void openPath(path)
    })
    const offNavigate = window.libra.onPreviewNavigate((path) => {
      void openPath(path)
    })
    window.libra.ready()

    return () => {
      offCommand()
      offOpened()
      offNavigate()
    }
  }, [openPath, openViaDialog, saveDocument, saveDocumentAs])

  useEffect(() => {
    const handleDragOver = (event: DragEvent): void => {
      event.preventDefault()
    }
    const handleDrop = (event: DragEvent): void => {
      event.preventDefault()
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      const path = window.libra.pathForFile(file)
      if (!path) {
        setStatus('无法读取这个文件的路径')
        return
      }
      void openPath(path)
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [openPath])

  useEffect(() => {
    if (!status) return undefined
    const timer = window.setTimeout(() => setStatus(null), 2600)
    return () => window.clearTimeout(timer)
  }, [status])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <span className="brand-name">Libra</span>
        </div>

        <div className="doc-title">
          {doc ? baseName(doc.path) : '未打开文件'}
          {dirty ? <span className="dot" title="有未保存的修改" /> : null}
        </div>

        <div className="actions">
          {doc ? (
            <div className="segmented" role="group" aria-label="视图模式">
              <button
                type="button"
                className={mode === 'read' ? 'on' : ''}
                onClick={() => setMode('read')}
              >
                阅读
              </button>
              <button
                type="button"
                className={mode === 'edit' ? 'on' : ''}
                onClick={() => setMode('edit')}
              >
                编辑
              </button>
            </div>
          ) : null}
          <button type="button" onClick={() => void openViaDialog()}>
            打开
          </button>
          <button className="primary" type="button" disabled={!doc || !dirty} onClick={() => void saveDocument()}>
            保存
          </button>
        </div>
      </header>

      <div className="body">
        {doc && folder ? (
          <Sidebar
            dir={folder.dir}
            files={folder.files}
            activePath={doc.path}
            onSelect={(path) => void openPath(path)}
          />
        ) : null}

        <main className={doc && mode === 'edit' ? 'content edit' : 'content'}>
          {doc ? (
            <>
              <div className={mode === 'edit' ? 'editor-pane' : 'editor-pane is-hidden'}>
                <Editor
                  key={docKey}
                  initialText={doc.text}
                  viewRef={viewRef}
                  onChange={handleChange}
                  onCursor={handleCursor}
                />
              </div>
              <div className="preview-pane">
                <PreviewPane onBounds={handleBounds} />
              </div>
            </>
          ) : (
            <EmptyState onOpen={() => void openViaDialog()} />
          )}
        </main>
      </div>

      <footer className="statusbar">
        <span className="status-path" title={status ?? doc?.path ?? ''}>
          {status ?? doc?.path ?? '—'}
        </span>
        <span className="status-meta">
          {doc ? <span>{doc.encoding.toUpperCase()}</span> : null}
          {doc ? <span>{doc.eol}</span> : null}
          {doc && mode === 'edit' ? (
            <span>
              行 {cursor.line}，列 {cursor.column}
            </span>
          ) : null}
          {doc ? <span>{formatSize(doc.size)}</span> : null}
        </span>
      </footer>
    </div>
  )
}