import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { DocumentData, JarEntry, OutlineItem, PreviewRect } from '../../shared/protocol'
import { ChevronDownIcon, HomeIcon, LibraMark, MenuBar, OutlineIcon, type MenuGroup } from './MenuBar'
import { closeOverlayMenu, installOverlayBridge, openOverlayList } from './overlayMenu'
import { baseName, isInside } from './paths'
import { PreviewPane } from './PreviewPane'
import { FileTree, OutlinePanel } from './Sidebar'

interface Tab {
  path: string
  data: DocumentData
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
      <p>拖进来，或按 Ctrl+O。以渲染后的样子打开，左侧是文件树，右侧可以展开大纲。</p>
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
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [filesVisible, setFilesVisible] = useState(true)
  const [outlineVisible, setOutlineVisible] = useState(false)
  const [leftWidth, setLeftWidth] = useState(244)
  const [rightWidth, setRightWidth] = useState(204)
  const [tabListOpen, setTabListOpen] = useState(false)

  const tabsRef = useRef<Tab[]>([])
  const activePathRef = useRef<string | null>(null)
  const entriesRef = useRef<JarEntry[]>([])

  const commit = useCallback((next: Tab[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])

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

  /** 打开单个文件：只往星星罐里放一条"文件"，不展开它所在的目录 */
  const ensureEntry = useCallback(
    (path: string) => {
      const list = entriesRef.current
      if (list.some((entry) => entry.kind === 'dir' && isInside(entry.path, path))) return
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
      const kept = entriesRef.current.filter((entry) => !(entry.kind === 'file' && isInside(dir, entry.path)))
      commitEntries([...kept, { kind: 'dir', path: dir }])
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [commitEntries])

  const openFile = useCallback(
    async (path: string) => {
      const existing = tabsRef.current.find((item) => item.path === path)
      if (existing) {
        activate(path)
        return
      }
      try {
        const data = await window.libra.read(path)
        commit([...tabsRef.current, { path: data.path, data }])
        ensureEntry(data.path)
        activate(data.path)
      } catch (error) {
        setStatus(describeError(error))
      }
    },
    [activate, commit, ensureEntry]
  )

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

  const openViaDialog = useCallback(async () => {
    try {
      const data = await window.libra.openDialog()
      if (!data) return
      const existing = tabsRef.current.find((item) => item.path === data.path)
      if (existing) {
        existing.data = data
        activate(data.path)
        return
      }
      commit([...tabsRef.current, { path: data.path, data }])
      ensureEntry(data.path)
      activate(data.path)
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [activate, commit, ensureEntry])

  const closeTab = useCallback(
    (path: string) => {
      if (!tabsRef.current.some((item) => item.path === path)) return
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

  const removeEntry = useCallback(
    (path: string) => {
      commitEntries(entriesRef.current.filter((entry) => entry.path.toLowerCase() !== path.toLowerCase()))
      setStatus('已移出星星罐（磁盘文件未删除）')
    },
    [commitEntries]
  )

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

  const handleBounds = useCallback((rect: PreviewRect | null) => {
    window.libra.setPreviewBounds(rect)
  }, [])

  const handleOutlineJump = useCallback((index: number) => {
    window.libra.scrollPreviewTo(index)
  }, [])

  const startResize = useCallback(
    (side: 'left' | 'right', event: React.MouseEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = side === 'left' ? leftWidth : rightWidth
      const limit = (): number => Math.max(200, Math.round(window.innerWidth * 0.3))

      const onMove = (moveEvent: MouseEvent): void => {
        const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX
        const next = Math.max(160, Math.min(limit(), startWidth + delta))
        if (side === 'left') setLeftWidth(next)
        else setRightWidth(next)
      }
      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.classList.remove('resizing')
      }

      document.body.classList.add('resizing')
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [leftWidth, rightWidth]
  )

  const openTabList = useCallback(
    (event: React.MouseEvent) => {
      if (tabListOpen) {
        closeOverlayMenu()
        setTabListOpen(false)
        return
      }

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const width = 268
      const x = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))

      const rows = tabsRef.current.map((tab) => ({
        label: baseName(tab.path),
        checked: tab.path === activePathRef.current,
        closeLabel: '×',
        onSelect: () => {
          activate(tab.path)
          setTabListOpen(false)
        },
        onClose: () => {
          setTabListOpen(false)
          closeTab(tab.path)
        }
      }))

      openOverlayList(rows, { x: Math.round(x), y: Math.round(rect.bottom + 8), width }, () => setTabListOpen(false))
      setTabListOpen(true)
    },
    [activate, closeTab, tabListOpen]
  )

  useEffect(() => installOverlayBridge(), [])

  useEffect(() => {
    const handleDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      // 触发按钮自己负责开/关，不要在这里抢先关掉
      if (target?.closest('.menubar, .jar-actions, .tab-list-toggle')) return
      closeOverlayMenu()
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [])

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
    const active = tabs.find((tab) => tab.path === activePath) ?? null
    document.title = active ? `Libra — ${baseName(active.path)}` : 'Libra'
  }, [tabs, activePath])

  useEffect(() => {
    if (!activePath) {
      window.libra.setPreviewBounds(null)
      return
    }
    setOutline([])
    void window.libra.loadPreview(activePath).catch(() => undefined)
  }, [activePath])

  useEffect(() => {
    const off = window.libra.onTreeChanged((payload) => {
      const current = activePathRef.current
      if (!current) return
      if (payload.path.toLowerCase() !== current.toLowerCase()) return
      window.libra.reloadPreview()
    })
    return off
  }, [])

  useEffect(() => {
    const container = document.querySelector('.tabs') as HTMLElement | null
    const active = container?.querySelector('.tab.active') as HTMLElement | null
    if (!container || !active) return

    const box = container.getBoundingClientRect()
    const tab = active.getBoundingClientRect()
    if (tab.left < box.left) container.scrollLeft -= box.left - tab.left + 8
    else if (tab.right > box.right) container.scrollLeft += tab.right - box.right + 8
  }, [activePath, tabs.length])

  useEffect(() => {
    const offCommand = window.libra.onCommand((message) => {
      if (message.id === 'open') {
        void openViaDialog()
        return
      }
      if (message.id === 'close-tab') {
        const current = activePathRef.current
        if (current) closeTab(current)
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
      if (message.id === 'reveal') {
        const current = activePathRef.current
        if (current) window.libra.revealInFolder(current)
        return
      }
      if (message.id === 'reload-preview') {
        window.libra.reloadPreview()
      }
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
  }, [openFile, openViaDialog, closeTab])

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
        {
          type: 'item',
          label: '关闭标签页',
          accelerator: 'Ctrl+W',
          disabled: !hasTab,
          onSelect: () => {
            if (activeTab) closeTab(activeTab.path)
          }
        },
        { type: 'separator' },
        { type: 'item', label: '退出', accelerator: 'Alt+F4', onSelect: () => window.libra.appAction('quit') }
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
        { type: 'separator' },
        { type: 'item', label: '实际大小', accelerator: 'Ctrl+0', onSelect: () => window.libra.appAction('zoom-reset') },
        { type: 'item', label: '放大', accelerator: 'Ctrl+=', onSelect: () => window.libra.appAction('zoom-in') },
        { type: 'item', label: '缩小', accelerator: 'Ctrl+-', onSelect: () => window.libra.appAction('zoom-out') },
        { type: 'separator' },
        { type: 'item', label: '全屏', accelerator: 'F11', onSelect: () => window.libra.appAction('toggle-fullscreen') },
        { type: 'item', label: '刷新预览', accelerator: 'Ctrl+R', onSelect: () => window.libra.reloadPreview() }
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

  const titleText = status ?? (activeTab ? baseName(activeTab.path) : 'Libra')

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
            className="rail-btn on"
            title="主页"
            aria-label="主页"
            onClick={() => setFilesVisible(true)}
          >
            <HomeIcon />
          </button>
          <div className="rail-fill" />
        </nav>

        <div className="workspace">
          {filesVisible ? (
            <>
              <FileTree
                width={leftWidth}
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
              <div className="resizer" onMouseDown={(event) => startResize('left', event)} />
            </>
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
                    <button
                      type="button"
                      className="tab-close"
                      aria-label="关闭标签页"
                      onClick={(event) => {
                        event.stopPropagation()
                        closeTab(tab.path)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="tab-actions">
                <button
                  type="button"
                  className={tabListOpen ? 'icon-btn tab-list-toggle on' : 'icon-btn tab-list-toggle'}
                  title="已打开的文件"
                  aria-label="已打开的文件"
                  onClick={(event) => void openTabList(event)}
                >
                  <ChevronDownIcon />
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

            <main className="content">
              {activeTab ? (
                <div className="preview-pane">
                  <PreviewPane onBounds={handleBounds} />
                </div>
              ) : (
                <EmptyState onOpen={() => void openViaDialog()} />
              )}
            </main>
          </section>

          {outlineVisible && activeTab ? (
            <>
              <div className="resizer" onMouseDown={(event) => startResize('right', event)} />
              <OutlinePanel width={rightWidth} outline={outline} onJump={handleOutlineJump} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}