import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { redo, undo } from '@codemirror/commands'
import { openSearchPanel } from '@codemirror/search'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { DocumentData, JarEntry, OutlineItem, PreviewRect, ViewMode } from '../../shared/protocol'
import { Editor } from './Editor'
import { createEditorState, editorHooks } from './editorState'
import { baseName, isInside } from './paths'
import { GitIcon, HomeIcon, LibraMark, MenuBar, OutlineIcon, type MenuGroup } from './MenuBar'
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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, '')
  }
  return String(error)
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
  const [entries, setEntries] = useState<JarEntry[]>([])
  const [mode, setMode] = useState<ViewMode>('read')
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1 })
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [filesVisible, setFilesVisible] = useState(true)
  const [outlineVisible, setOutlineVisible] = useState(false)

  const tabsRef = useRef<Tab[]>([])
  const activePathRef = useRef<string | null>(null)
  const entriesRef = useRef<JarEntry[]>([])
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

  const commitEntries = useCallback((next: JarEntry[]) => {
    entriesRef.current = next
    setEntries(next)
    window.libra.setEntries(next)
  }, [])

  /** 打开单个文件时，只往星星罐里放一条"文件"，不展开它所在的目录 */
  const ensureEntry = useCallback(
    (path: string) => {
      const list = entriesRef.current
      const covered = list.some((entry) => entry.kind === 'dir' && isInside(entry.path, path))
      if (covered) return
      if (list.some((entry) => entry.kind === 'file' && entry.path.toLowerCase() === path.toLowerCase())) return
      commitEntries([...list, { kind: 'file', path }])
    },
    [commitEntries]
  )

  const addDir = useCallback(async () => {
    try {
      const dir = await window.libra.pickFolder()
      if (!dir) return
      setFilesVisible(true)
      if (entriesRef.current.some((entry) => entry.kind === 'dir' && entry.path.toLowerCase() === dir.toLowerCase())) return
      // 加目录时，把已经被这个目录覆盖的独立文件条目去掉，避免重复
      const kept = entriesRef.current.filter(
        (entry) => !(entry.kind === 'file' && isInside(dir, entry.path))
      )
      commitEntries([...kept, { kind: 'dir', path: dir }])
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [commitEntries])

  const handleRenamed = useCallback(
    (from: string, to: string) => {
      const mapPath = (path: string): string | null => {
        if (path.toLowerCase() === from.toLowerCase()) return to
        if (isInside(from, path)) return to + path.slice(from.length)
        return null
      }

      let entriesChanged = false
      const nextEntries = entriesRef.current.map((entry) => {
        const mapped = mapPath(entry.path)
        if (!mapped) return entry
        entriesChanged = true
        return { ...entry, path: mapped }
      })
      if (entriesChanged) commitEntries(nextEntries)

      let tabsChanged = false
      const nextTabs = tabsRef.current.map((tab) => {
        const mapped = mapPath(tab.path)
        if (!mapped) return tab
        tabsChanged = true
        return { ...tab, path: mapped, data: { ...tab.data, path: mapped } }
      })
      if (tabsChanged) commit(nextTabs)

      const current = activePathRef.current
      const mapped = current ? mapPath(current) : null
      if (mapped) {
        activePathRef.current = mapped
        setActivePath(mapped)
      }
    },
    [commit, commitEntries]
  )

  const removeEntry = useCallback(
    (path: string) => {
      commitEntries(entriesRef.current.filter((entry) => entry.path.toLowerCase() !== path.toLowerCase()))
      setStatus('已移出星星罐（磁盘文件未删除）')
    },
    [commitEntries]
  )

  const openFile = useCallback(
    async (path: string) => {
      const existing = tabsRef.current.find((item) => item.path === path)
      if (existing) {
        ensureEntry(path)
        activate(path)
        return
      }

      try {
        const data = await window.libra.read(path)
        const tab: Tab = { path: data.path, data, state: null, dirty: false }
        commit([...tabsRef.current, tab])
        ensureEntry(data.path)
        activate(data.path)
      } catch (error) {
        setStatus(describeError(error))
      }
    },
    [activate, commit, ensureEntry]
  )

  const openViaDialog = useCallback(async () => {
    try {
      const data = await window.libra.openDialog()
      if (!data) return
      const existing = tabsRef.current.find((item) => item.path === data.path)
      if (existing) {
        existing.data = data
        existing.state = null
        ensureEntry(data.path)
        activate(data.path)
        return
      }
      const tab: Tab = { path: data.path, data, state: null, dirty: false }
      commit([...tabsRef.current, tab])
      ensureEntry(data.path)
      activate(data.path)
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [activate, commit, ensureEntry])

  const addFile = useCallback(async () => {
    try {
      const path = await window.libra.pickFile()
      if (!path) return
      setFilesVisible(true)
      await openFile(path)
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [openFile])

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
      ensureEntry(result.path)
      setStatus(`已另存为 ${baseName(result.path)}`)
      return true
    } catch (error) {
      setStatus(describeError(error))
      return false
    }
  }, [commit, ensureEntry])

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

  const editorCommand = useCallback((action: 'undo' | 'redo') => {
    const view = viewRef.current
    if (!view) return
    if (action === 'undo') undo(view)
    else redo(view)
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
    window.libra
      .getEntries()
      .then((list) => {
        const merged = [...list]
        for (const item of entriesRef.current) {
          if (!merged.some((existing) => existing.path.toLowerCase() === item.path.toLowerCase())) merged.push(item)
        }
        entriesRef.current = merged
        setEntries(merged)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (window.libra.platform === 'darwin') document.body.classList.add('platform-mac')
  }, [])

  useEffect(() => {
    window.libra.setDirty(tabs.some((tab) => tab.dirty))
  }, [tabs])

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
      if (message.id === 'save-all') {
        void saveAll().then((ok) => window.libra.reportSave(ok))
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
  const hasTab = activeTab !== null

  const menus: MenuGroup[] = [
    {
      label: '文件',
      items: [
        { type: 'item', label: '打开…', accelerator: 'Ctrl+O', onSelect: () => void openViaDialog() },
        {
          type: 'item',
          label: '在文件夹中显示',
          disabled: !hasTab,
          onSelect: () => {
            if (activeTab) window.libra.revealInFolder(activeTab.path)
          }
        },
        { type: 'separator' },
        { type: 'item', label: '保存', accelerator: 'Ctrl+S', disabled: !hasTab, onSelect: () => void saveActive() },
        {
          type: 'item',
          label: '另存为…',
          accelerator: 'Ctrl+Shift+S',
          disabled: !hasTab,
          onSelect: () => void saveDocumentAs()
        },
        {
          type: 'item',
          label: '关闭标签页',
          accelerator: 'Ctrl+W',
          disabled: !hasTab,
          onSelect: () => {
            if (activeTab) void closeTab(activeTab.path)
          }
        },
        { type: 'separator' },
        { type: 'item', label: '退出', accelerator: 'Alt+F4', onSelect: () => window.libra.appAction('quit') }
      ]
    },
    {
      label: '编辑',
      items: [
        {
          type: 'item',
          label: '撤销',
          accelerator: 'Ctrl+Z',
          disabled: !hasTab,
          onSelect: () => editorCommand('undo')
        },
        {
          type: 'item',
          label: '重做',
          accelerator: 'Ctrl+Y',
          disabled: !hasTab,
          onSelect: () => editorCommand('redo')
        },
        { type: 'separator' },
        { type: 'item', label: '剪切', accelerator: 'Ctrl+X', onSelect: () => window.libra.appAction('cut') },
        { type: 'item', label: '复制', accelerator: 'Ctrl+C', onSelect: () => window.libra.appAction('copy') },
        { type: 'item', label: '粘贴', accelerator: 'Ctrl+V', onSelect: () => window.libra.appAction('paste') },
        { type: 'item', label: '全选', accelerator: 'Ctrl+A', onSelect: () => window.libra.appAction('select-all') },
        { type: 'separator' },
        {
          type: 'item',
          label: '查找 / 替换…',
          accelerator: 'Ctrl+F',
          disabled: !hasTab,
          onSelect: () => openFind()
        }
      ]
    },
    {
      label: '视图',
      items: [
        {
          type: 'item',
          label: '文件列表',
          accelerator: 'Ctrl+B',
          checked: filesVisible,
          onSelect: () => setFilesVisible((current) => !current)
        },
        {
          type: 'item',
          label: '大纲',
          accelerator: 'Ctrl+Shift+B',
          checked: outlineVisible,
          onSelect: () => setOutlineVisible((current) => !current)
        },
        {
          type: 'item',
          label: '编辑模式',
          accelerator: 'Ctrl+E',
          checked: mode === 'edit',
          onSelect: () => setMode((current) => (current === 'read' ? 'edit' : 'read'))
        },
        { type: 'separator' },
        { type: 'item', label: '实际大小', accelerator: 'Ctrl+0', onSelect: () => window.libra.appAction('zoom-reset') },
        { type: 'item', label: '放大', accelerator: 'Ctrl+=', onSelect: () => window.libra.appAction('zoom-in') },
        { type: 'item', label: '缩小', accelerator: 'Ctrl+-', onSelect: () => window.libra.appAction('zoom-out') },
        { type: 'separator' },
        { type: 'item', label: '全屏', accelerator: 'F11', onSelect: () => window.libra.appAction('toggle-fullscreen') },
        { type: 'item', label: '刷新预览', accelerator: 'Ctrl+R', onSelect: () => window.libra.reloadPreview() },
        { type: 'item', label: '开发者工具', onSelect: () => window.libra.appAction('toggle-devtools') }
      ]
    },
    {
      label: '帮助',
      items: [
        { type: 'item', label: '快捷键', onSelect: () => window.libra.appAction('shortcuts') },
        { type: 'item', label: '项目主页', onSelect: () => window.libra.appAction('homepage') },
        { type: 'separator' },
        { type: 'item', label: '关于 Libra', onSelect: () => window.libra.appAction('about') }
      ]
    }
  ]

  const activeName = activeTab ? baseName(activeTab.path) : 'Libra'
  const titleText = status ?? (activeTab ? `${activeName}${activeTab.dirty ? ' •' : ''}` : 'Libra')

  return (
    <div className="app">
      <header className="titlebar">
        <div className="titlebar-left">
          <LibraMark />
          <MenuBar groups={menus} />
        </div>
        <div className={status ? 'titlebar-title status' : 'titlebar-title'}>{titleText}</div>
        <div className="titlebar-fill" />
      </header>

      <div className="body">
        <nav className="rail" aria-label="主导航">
          <button
            type="button"
            className={mode === 'read' ? 'rail-btn on' : 'rail-btn'}
            title="主页：回到阅读视图"
            aria-label="主页"
            onClick={() => {
              setMode('read')
              setFilesVisible(true)
            }}
          >
            <HomeIcon />
          </button>
          <button
            type="button"
            className="rail-btn"
            title="Git 同步（尚未实现）"
            aria-label="Git 同步"
            onClick={() => setStatus('Git 同步还没做，先占个位置')}
          >
            <GitIcon />
          </button>
          <div className="rail-fill" />
        </nav>

        <div className="workspace">
          {filesVisible ? (
            <FileTree
              entries={entries}
              activePath={activePath}
              onOpenFile={(path) => void openFile(path)}
              onAddDir={() => void addDir()}
              onAddFile={() => void addFile()}
              onRemoveEntry={removeEntry}
              onHide={() => setFilesVisible(false)}
              onRenamed={handleRenamed}
              onError={setStatus}
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
            </div>

            <div className="tab-actions">
              {mode === 'edit' && activeTab ? (
                <span className="cursor-pos" title="光标位置">
                  {cursor.line}:{cursor.column}
                </span>
              ) : null}
              <div className="segmented" role="group" aria-label="视图模式">
                <button type="button" className={mode === 'read' ? 'on' : ''} onClick={() => setMode('read')}>
                  阅读
                </button>
                <button type="button" className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
                  编辑
                </button>
              </div>
              <button
                className="primary save-btn"
                type="button"
                disabled={!hasTab || !activeTab?.dirty}
                onClick={() => void saveActive()}
              >
                保存
              </button>
              <button
                type="button"
                className={outlineVisible ? 'icon-btn outline-toggle on' : 'icon-btn outline-toggle'}
                title={outlineVisible ? '隐藏大纲' : '显示大纲'}
                aria-label={outlineVisible ? '隐藏大纲' : '显示大纲'}
                onClick={() => setOutlineVisible((current) => !current)}
              >
                <OutlineIcon active={outlineVisible} />
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

          {outlineVisible && activeTab ? <OutlinePanel outline={outline} onJump={handleOutlineJump} /> : null}
        </div>
      </div>
    </div>
  )
}