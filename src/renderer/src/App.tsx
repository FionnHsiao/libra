import type { EditorView } from '@codemirror/view'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { DocumentData } from '../../shared/protocol'
import { Editor } from './Editor'

interface Cursor {
  line: number
  column: number
}

function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments[segments.length - 1] ?? path
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
      <p>拖进来，或按 Ctrl+O。Libra 只改你动过的地方，其余的字节原样保留。</p>
      <button className="primary" onClick={onOpen}>
        打开文档
      </button>
    </div>
  )
}

export function App(): ReactElement {
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [docKey, setDocKey] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1 })
  const [notice, setNotice] = useState<string | null>(null)

  const viewRef = useRef<EditorView | null>(null)
  const docRef = useRef<DocumentData | null>(null)

  const applyDocument = useCallback((next: DocumentData) => {
    docRef.current = next
    setDoc(next)
    setDirty(false)
    setCursor({ line: 1, column: 1 })
    setDocKey((key) => key + 1)
  }, [])

  const openPath = useCallback(
    async (path: string) => {
      try {
        applyDocument(await window.libra.read(path))
      } catch (error) {
        setNotice(describeError(error))
      }
    },
    [applyDocument]
  )

  const openViaDialog = useCallback(async () => {
    try {
      const data = await window.libra.openDialog()
      if (data) applyDocument(data)
    } catch (error) {
      setNotice(describeError(error))
    }
  }, [applyDocument])

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
      setDirty(false)
      setNotice('已保存')
      return true
    } catch (error) {
      setNotice(describeError(error))
      return false
    }
  }, [])

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
      setNotice('已另存为 ' + fileNameOf(result.path))
      return true
    } catch (error) {
      setNotice(describeError(error))
      return false
    }
  }, [applyDocument])

  const handleChange = useCallback(() => {
    setDirty(true)
  }, [])

  const handleCursor = useCallback((line: number, column: number) => {
    setCursor({ line, column })
  }, [])

  useEffect(() => {
    window.libra.setDirty(dirty)
  }, [dirty])

  useEffect(() => {
    const name = doc ? fileNameOf(doc.path) : '未打开文件'
    document.title = doc ? `Libra — ${name}${dirty ? ' •' : ''}` : 'Libra'
  }, [doc, dirty])

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
      void saveDocument().then((ok) => window.libra.reportSave(ok))
    })
    const offOpened = window.libra.onFileOpened((path) => {
      void openPath(path)
    })
    window.libra.ready()

    return () => {
      offCommand()
      offOpened()
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
        setNotice('无法读取这个文件的路径')
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
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(null), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">L</span>
          <span className="brand-name">Libra</span>
        </div>
        <div className="doc-title">
          {doc ? fileNameOf(doc.path) : '未打开文件'}
          {dirty ? <span className="dot" title="有未保存的修改" /> : null}
        </div>
        <div className="actions">
          <button onClick={() => void openViaDialog()}>打开</button>
          <button className="primary" disabled={!doc} onClick={() => void saveDocument()}>
            保存
          </button>
        </div>
      </header>

      <main className="canvas">
        {doc ? (
          <Editor
            key={docKey}
            initialText={doc.text}
            viewRef={viewRef}
            onChange={handleChange}
            onCursor={handleCursor}
          />
        ) : (
          <EmptyState onOpen={() => void openViaDialog()} />
        )}
      </main>

      <footer className="statusbar">
        <span className="status-path" title={doc?.path ?? ''}>
          {doc?.path ?? '—'}
        </span>
        <span className="status-meta">
          {doc ? <span>{doc.encoding.toUpperCase()}</span> : null}
          {doc ? <span>{doc.eol}</span> : null}
          <span>
            行 {cursor.line}，列 {cursor.column}
          </span>
          {doc ? <span>{formatSize(doc.size)}</span> : null}
        </span>
      </footer>

      {notice ? <div className="notice">{notice}</div> : null}
    </div>
  )
}