import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { openSearchPanel } from '@codemirror/search'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { DocumentData, OutlineItem, PreviewRect, ViewMode } from '../../shared/protocol'
import { Editor } from './Editor'
import { createEditorState, editorHooks } from './editorState'
import { PreviewPane } from './PreviewPane'
import { FileTree, OutlinePanel } from './Sidebar'

interface Tab {
  path: string
  data: DocumentData
  state: EditorState | null
  dirty: boolean
}

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

function isInside(root: string, target: string): boolean {
  const normalize = (value: string): string => value.replace(/[\\/]+$/, '').toLowerCase()
  const base = normalize(root)
  const path = normalize(target)
  return path === base || path.startsWith(`${base}\\`) || path.startsWith(`${base}/`)
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
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [rootDir, setRootDir] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>('read')
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1 })
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [filesVisible, setFilesVisible] = useState(true)
  const [outlineVisible, setOutlineVisible] = useState(true)

  const tabsRef = useRef<Tab[]>([])
  const activePathRef = useRef<string | null>(null)
  const rootDirRef = useRef<string | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  const commit = useCallback((next: Tab[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])

  const markDirty = useCallback(
    (path: string) => {
      const current = tabsRef.current
      const tab = current.find((item) => item.path === path)
      if (!tab || tab.dirty) return
      commit(current.map((item) => (item.path === path ? { ...item, dirty: true } : item)))
    },
    [commit]
  )

  const activate = useCallback((path: string) => {
    if (activePathRef.current === path) return
    activePathRef.current = path
    setActivePath(path)
  }, [])

  const setRoot = useCallback((path: string) => {
    const dir = dirName(path)
    if (rootDirRef.current && isInside(rootDirRef.current, path)) return
    rootDirRef.current = dir
    setRootDir(dir)
  }, [])

  const openFile = useCallback(
    async (path: string) => {
      const existing = tabsRef.current.find((item) => item.path === path)
      if (existing) {
        setRoot(path)
        activate(path)
        return
      }

      try {
        const data = await window.libra.read(path)
        const tab: Tab = { path: data.path, data, state: null, dirty: false }
        commit([...tabsRef.current, tab])
        setRoot(data.path)
        activate(data.path)
      } catch (error) {
        setStatus(describeError(error))
      }
    },
    [activate, commit, setRoot]
  )

  const openViaDialog = useCallback(async () => {
    try {
      const data = await window.libra.openDialog()
      if (!data) return
      const existing = tabsRef.current.find((item) => item.path === data.path)
      if (existing) {
        existing.data = data
        existing.state = null
        setRoot(data.path)
        activate(data.path)
        return
      }
      const tab: Tab = { path: data.path, data, state: null, dirty: false }
      commit([...tabsRef.current, tab])
      setRoot(data.path)
      activate(data.path)
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [activate, commit, setRoot])

  const saveTab = useCallback(
    async (tab: Tab): Promise<boolean> => {
      if (!tab.state) return true
      try {
        const text = tab.state.doc.toString()
        const result = await window.libra.save({
          path: tab.path,
          text,
          encoding: tab.data.encoding,
          bom: tab.data.bom,
          eol: tab.data.eol
        })
        commit(
          tabsRef.current.map((item) =>
            item.path === tab.path
              ? { ...item, dirty: false, data: { ...item.data, text, size: result.bytes } }
              : item
          )
        )
        return true
      } catch (error) {
        setStatus(describeError(error))
        return false
      }
    },
    [commit]
  )

  const saveActive = useCallback(async (): Promise<boolean> => {
    const path = activePathRef.current
    if (!path) return false
    const tab = tabsRef.current.find((item) => item.path === path)
    if (!tab) return false
    const ok = await saveTab(tab)
    if (ok) {
      setStatus('已保存')
      window.libra.reloadPreview()
    }
    return ok
  }, [saveTab])

  const saveAll = useCallback(async (): Promise<boolean> => {
    for (const tab of tabsRef.current) {
      if (!tab.dirty) continue
      const ok = await saveTab(tab)
      if (!ok) return false
    }
    window.libra.reloadPreview()
    return true
  }, [saveTab])

  const closeTab = useCallback(
    async (path: string) => {
      const tab = tabsRef.current.find((item) => item.path === path)
      if (!tab) return
      if (tab.dirty) {
        const confirmed = await window.libra.confirmDiscard()
        if (!confirmed) return
      }

      const next = tabsRef.current.filter((item) => item.path !== path)
      commit(next)

      if (activePathRef.current === path) {
        const fallback = next[next.length - 1] ?? null
        activePathRef.current = fallback ? fallback.path : null
        setActivePath(activePathRef.current)
      }
    },
    [commit]
  )

  const saveDocumentAs = useCallback(async (): Promise<boolean> => {
    const path = activePathRef.current
    const view = viewRef.current
    if (!path || !view) return false
    const tab = tabsRef.current.find((item) => item.path === path)
    if (!tab) return false

    try {
      const result = await window.libra.saveAs({
        text: view.state.doc.toString(),
        encoding: tab.data.encoding,
        bom: tab.data.bom,
        eol: tab.data.eol,
        suggestedPath: tab.path
      })
      if (!result) return true
      const data = await window.libra.read(result.path)
      commit([
        ...tabsRef.current.filter((item) => item.path !== path),
        { path: result.path, data, state: null, dirty: false }
      ])
      activePathRef.current = result.path
      setActivePath(result.path)
      setRoot(result.path)
      setStatus(`已另存为 ${baseName(result.path)}`)
      return true
    } catch (error) {
      setStatus(describeError(error))
      return false
    }
  }, [commit, setRoot])

  const handleBounds = useCallback((rect: PreviewRect | null) => {
    window.libra.setPreviewBounds(rect)
  }, [])

  const handleOutlineJump = useCallback((index: number) => {
    window.libra.scrollPreviewTo(index)
  }, [])

  const openFind = useCallback(() => {
    setMode('edit')
    window.setTimeout(() => {
      const view = viewRef.current
      if (!view) return
      view.focus()
      openSearchPanel(view)
    }, 80)
  }, [])

  useEffect(() => {
    editorHooks.onCursor = (line, column) => setCursor({ line, column })
    editorHooks.onState = (state) => {
      const path = activePathRef.current
      if (!path) return
      const tab = tabsRef.current.find((item) => item.path === path)
      if (tab) tab.state = state
    }
    editorHooks.onChange = () => {
      const path = activePathRef.current
      if (path) markDirty(path)
    }
  }, [markDirty])

  useEffect(() => {
    window.libra.setViewMode(mode)
  }, [mode])

  useEffect(() => {
    window.libra.setPanelsVisible({ files: filesVisible, outline: outlineVisible })
  }, [filesVisible, outlineVisible])

  useEffect(() => {
    window.libra.setDirty(tabs.some((tab) => tab.dirty))
  }, [tabs])

  useEffect(() => {
    const active = tabs.find((tab) => tab.path === activePath) ?? null
    const name = active ? baseName(active.path) : '未打开文件'
    document.title = active ? `Libra — ${name}${active.dirty ? ' •' : ''}` : 'Libra'
  }, [tabs, activePath])

  useEffect(() => {
    if (!activePath) {
      window.libra.setPreviewBounds(null)
      return
    }
    const tab = tabsRef.current.find((item) => item.path === activePath)
    const view = viewRef.current
    if (!tab || !view) return

    const state = tab.state ?? createEditorState(tab.data.text)
    tab.state = state
    view.setState(state)
    setOutline([])
    void window.libra.loadPreview(tab.path).catch(() => undefined)
  }, [activePath])

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
      if (message.id === 'close-tab') {
        const current = activePathRef.current
        if (current) void closeTab(current)
        return
      }
      if (message.id === 'toggle-mode') {
        setMode((current) => (current === 'read' ? 'edit' : 'read'))
        return
      }
      if (message.id === 'toggle-files') {
        setFilesVisible((current) => !current)
        return
      }
      if (message.id === 'toggle-outline') {
        setOutlineVisible((current) => !current)
        return
      }
      if (message.id === 'save-all') {
        void saveAll().then((ok) => window.libra.reportSave(ok))
        return
      }
      if (message.id === 'find') {
        openFind()
        return
      }
      if (message.id === 'reveal') {
        const current = activePathRef.current
        if (current) window.libra.revealInFolder(current)
        return
      }
      if (message.id === 'reload-preview') {
        window.libra.reloadPreview()
        return
      }
      void saveActive().then((ok) => window.libra.reportSave(ok))
    })
    const offOpened = window.libra.onFileOpened((path) => {
      void openFile(path)
    })
    const offNavigate = window.libra.onPreviewNavigate((path) => {
      void openFile(path)
    })
    const offOutline = window.libra.onOutline((items) => {
      setOutline(items)
    })
    window.libra.ready()

    return () => {
      offCommand()
      offOpened()
      offNavigate()
      offOutline()
    }
  }, [openFile, openViaDialog, saveActive, saveAll, saveDocumentAs, openFind, closeTab])

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
      void openFile(path)
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [openFile])

  useEffect(() => {
    if (!status) return undefined
    const timer = window.setTimeout(() => setStatus(null), 2600)
    return () => window.clearTimeout(timer)
  }, [status])

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null

  return (
    <div className="app">
      <div className="body">
        {filesVisible && rootDir ? (
          <FileTree
            rootDir={rootDir}
            activePath={activePath}
            onOpenFile={(path) => void openFile(path)}
          />
        ) : null}

        <section className="center">
          <div className="tabbar">
            <div className="tabs">
              {tabs.map((tab) => (
                <div
                  key={tab.path}
                  className={tab.path === activePath ? 'tab active' : 'tab'}
                  title={tab.path}
                  onClick={() => activate(tab.path)}
                >
                  <span className="tab-name">{baseName(tab.path)}</span>
                  {tab.dirty ? <span className="tab-dot" /> : null}
                  <button
                    type="button"
                    className="tab-close"
                    aria-label="关闭标签页"
                    onClick={(event) => {
                      event.stopPropagation()
                      void closeTab(tab.path)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="tab-new" title="打开文件 (Ctrl+O)" onClick={() => void openViaDialog()}>
                +
              </button>
            </div>

            <div className="tab-actions">
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
              <button
                className="primary save-btn"
                type="button"
                disabled={!activeTab || !activeTab.dirty}
                onClick={() => void saveActive()}
              >
                保存
              </button>
            </div>
          </div>

          <main className={activeTab && mode === 'edit' ? 'content edit' : 'content'}>
            {activeTab ? (
              <>
                <div className={mode === 'edit' ? 'editor-pane' : 'editor-pane is-hidden'}>
                  <Editor viewRef={viewRef} />
                </div>
                <div className="preview-pane">
                  <PreviewPane onBounds={handleBounds} />
                </div>
              </>
            ) : (
              <EmptyState onOpen={() => void openViaDialog()} />
            )}
          </main>
        </section>

        {outlineVisible && activeTab ? (
          <OutlinePanel outline={outline} onJump={handleOutlineJump} />
        ) : null}
      </div>

      <footer className="statusbar">
        <span className="status-path" title={status ?? activeTab?.path ?? ''}>
          {status ?? activeTab?.path ?? '—'}
        </span>
        <span className="status-meta">
          {activeTab ? <span>{activeTab.data.encoding.toUpperCase()}</span> : null}
          {activeTab ? <span>{activeTab.data.eol}</span> : null}
          {activeTab && mode === 'edit' ? (
            <span>
              行 {cursor.line}，列 {cursor.column}
            </span>
          ) : null}
          {activeTab ? <span>{formatSize(activeTab.data.size)}</span> : null}
        </span>
      </footer>
    </div>
  )
}