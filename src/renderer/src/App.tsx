import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { JarEntry, OutlineItem, PreviewRect } from '../../shared/protocol'
import {
  BackIcon,
  ChevronDownIcon,
  FilesIcon,
  FullscreenIcon,
  HomeIcon,
  HtmlFileIcon,
  LibraMark,
  MenuBar,
  OutlineIcon,
  type MenuGroup
} from './MenuBar'
import { closeOverlayMenu, installOverlayBridge, openOverlayList } from './overlayMenu'
import { baseName, isInside } from './paths'
import { PreviewPane } from './PreviewPane'
import { FileTree, OutlinePanel } from './Sidebar'

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, '')
  }
  return String(error)
}

function EmptyState({
  onOpen,
  onAddFolder
}: {
  onOpen: () => void
  onAddFolder: () => void
}): ReactElement {
  return (
    <div className="empty">
      <div className="empty-mark">
        <LibraMark size={64} />
      </div>
      <h1>打开一个文件夹，或者一个 HTML 文件</h1>
      <p>
        文件夹整棵放进「星星罐」，左边列出全部文件，磁盘上增删改会自动同步；
        单个 HTML 只加一条，不会把同级目录一起拉进来。也可以直接把 HTML{' '}
        <span className="nowrap">拖进窗口</span>，或按 <span className="nowrap">Ctrl+O</span>。
      </p>
      <div className="empty-actions">
        <button className="primary" type="button" onClick={onOpen}>
          打开文件…
        </button>
        <button type="button" onClick={onAddFolder}>
          添加文件夹…
        </button>
      </div>
    </div>
  )
}

export function App(): ReactElement {
  const [tabs, setTabs] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [entries, setEntries] = useState<JarEntry[]>([])
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [filesVisible, setFilesVisible] = useState(true)
  const [outlineVisible, setOutlineVisible] = useState(false)
  const [leftWidth, setLeftWidth] = useState(244)
  const [rightWidth, setRightWidth] = useState(204)
  const [tabListOpen, setTabListOpen] = useState(false)
  // 全屏阅读：只留渲染出来的网页
  const [immersive, setImmersive] = useState(false)
  // 预览是原生视图，窗口尺寸变化后需要重新上报一次它的位置
  const [boundsRev, setBoundsRev] = useState(0)

  // 菜单里显示的加速键：mac 上换成 ⌘ / ⇧ / ⌥ / ⌃，Windows/Linux 保持 Ctrl 文案
  const acc = (label: string): string =>
    window.libra.platform === 'darwin'
      ? label
          .replace(/Ctrl\+/g, '⌘')
          .replace(/Shift\+/g, '⇧')
          .replace(/Alt\+/g, '⌥')
      : label

  const tabsRef = useRef<string[]>([])
  const activePathRef = useRef<string | null>(null)
  const entriesRef = useRef<JarEntry[]>([])
  // 访问过（激活过）的文件，栈顶是当前文件；返回就是回到栈里的上一个
  const historyRef = useRef<string[]>([])
  const [canGoBack, setCanGoBack] = useState(false)

  const commit = useCallback((next: string[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])

  const pushHistory = useCallback((path: string) => {
    const stack = historyRef.current
    if (stack[stack.length - 1] === path) return
    stack.push(path)
    if (stack.length > 60) stack.shift()
    setCanGoBack(stack.length > 1)
  }, [])

  const activate = useCallback(
    (path: string) => {
      if (activePathRef.current === path) return
      activePathRef.current = path
      setActivePath(path)
      pushHistory(path)
    },
    [pushHistory]
  )

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
      if (tabsRef.current.includes(path)) {
        activate(path)
        return
      }
      try {
        await window.libra.checkPath(path)
        commit([...tabsRef.current, path])
        ensureEntry(path)
        activate(path)
      } catch (error) {
        setStatus(describeError(error))
      }
    },
    [activate, commit, ensureEntry]
  )

  /** 回到上一个打开过的文件：栈里退一格，文件还在就直接切，关掉了就重新读 */
  const goBack = useCallback(() => {
    const stack = historyRef.current
    if (stack.length < 2) return
    stack.pop()
    setCanGoBack(stack.length > 1)
    const target = stack[stack.length - 1]
    if (target) void openFile(target)
  }, [openFile])

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
      const path = await window.libra.openDialog()
      if (path) await openFile(path)
    } catch (error) {
      setStatus(describeError(error))
    }
  }, [openFile])

  const closeTab = useCallback(
    (path: string) => {
      if (!tabsRef.current.includes(path)) return
      const next = tabsRef.current.filter((item) => item !== path)
      commit(next)

      if (historyRef.current.includes(path)) {
        historyRef.current = historyRef.current.filter((item) => item !== path)
        setCanGoBack(historyRef.current.length > 1)
      }

      if (activePathRef.current === path) {
        const fallback = next[next.length - 1] ?? null
        activePathRef.current = fallback
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
        const mapped = mapPath(tab)
        if (!mapped) return tab
        tabsChanged = true
        return mapped
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
        label: baseName(tab),
        checked: tab === activePathRef.current,
        closeLabel: '×',
        onSelect: () => {
          activate(tab)
          setTabListOpen(false)
        },
        onClose: () => {
          setTabListOpen(false)
          closeTab(tab)
        }
      }))

      openOverlayList(
        rows,
        {
          x: Math.round(x),
          y: Math.round(rect.bottom + 8),
          width,
          trigger: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        },
        () => setTabListOpen(false)
      )
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
    document.title = activePath ? `Libra — ${baseName(activePath)}` : 'Libra'
  }, [activePath])

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
      if (message.id === 'refresh-preview-bounds') {
        setBoundsRev((current) => current + 1)
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
        return
      }
      if (message.id === 'toggle-immersive') {
        setImmersive((current) => !current)
        return
      }
      if (message.id === 'exit-immersive') {
        setImmersive(false)
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

  // 全屏阅读期间窗口也切到全屏；退出时由主进程还原之前的状态
  useEffect(() => {
    window.libra.setImmersive(immersive)
    // 全屏后标题栏没了，用预览页里的一条提示告诉用户怎么退出去
    if (immersive) window.libra.showPreviewHint('按 Esc 退出全屏')
    setBoundsRev((current) => current + 1)
  }, [immersive])

  // 没有文档可读时不该停在全屏阅读里
  useEffect(() => {
    if (immersive && !activePath) setImmersive(false)
  }, [immersive, activePath])

  // 焦点在界面这边时，Esc 也能退出（焦点在网页里时由主进程接管）
  useEffect(() => {
    if (!immersive) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setImmersive(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [immersive])

  useEffect(() => {
    if (!status) return undefined
    const timer = window.setTimeout(() => setStatus(null), 2600)
    return () => window.clearTimeout(timer)
  }, [status])

  const hasTab = activePath !== null

  const menus: MenuGroup[] = [
    {
      label: '文件',
      items: [
        { type: 'item', label: '打开…', accelerator: acc('Ctrl+O'), onSelect: () => void openViaDialog() },
        {
          type: 'item',
          label: '在文件夹中显示',
          disabled: !hasTab,
          onSelect: () => {
            if (activePath) window.libra.revealInFolder(activePath)
          }
        },
        { type: 'separator' },
        {
          type: 'item',
          label: '关闭标签页',
          accelerator: acc('Ctrl+W'),
          disabled: !hasTab,
          onSelect: () => {
            if (activePath) closeTab(activePath)
          }
        },
        { type: 'separator' },
        { type: 'item', label: '退出', accelerator: acc('Alt+F4'), onSelect: () => window.libra.appAction('quit') }
      ]
    },
    {
      label: '视图',
      items: [
        {
          type: 'item',
          label: '文件列表',
          accelerator: acc('Ctrl+B'),
          checked: filesVisible,
          onSelect: () => setFilesVisible((current) => !current)
        },
        {
          type: 'item',
          label: '大纲',
          accelerator: acc('Ctrl+Shift+B'),
          checked: outlineVisible,
          onSelect: () => setOutlineVisible((current) => !current)
        },
        { type: 'separator' },
        { type: 'item', label: '实际大小', accelerator: acc('Ctrl+0'), onSelect: () => window.libra.appAction('zoom-reset') },
        { type: 'item', label: '放大', accelerator: acc('Ctrl+='), onSelect: () => window.libra.appAction('zoom-in') },
        { type: 'item', label: '缩小', accelerator: acc('Ctrl+-'), onSelect: () => window.libra.appAction('zoom-out') },
        { type: 'separator' },
        {
          type: 'item',
          label: '全屏阅读',
          accelerator: window.libra.platform === 'darwin' ? '⌃⌘F' : 'F11',
          checked: immersive,
          disabled: !hasTab,
          onSelect: () => setImmersive((current) => !current)
        },
        { type: 'item', label: '刷新预览', accelerator: acc('Ctrl+R'), onSelect: () => window.libra.reloadPreview() }
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

  const titleText = status ?? (activePath ? baseName(activePath) : 'Libra')

  return (
    <div className={immersive ? 'app immersive' : 'app'}>
      <header className="titlebar">
        <div className="titlebar-left">
          <button
            type="button"
            className="icon-btn titlebar-back"
            title="返回上一个打开的文件"
            aria-label="返回上一个打开的文件"
            disabled={!canGoBack}
            onClick={goBack}
          >
            <BackIcon />
          </button>
          <button
            type="button"
            className={filesVisible ? 'icon-btn titlebar-toggle on' : 'icon-btn titlebar-toggle'}
            title={filesVisible ? '折叠目录（Ctrl+B）' : '展开目录（Ctrl+B）'}
            aria-label={filesVisible ? '折叠目录' : '展开目录'}
            aria-pressed={filesVisible}
            onClick={() => setFilesVisible((current) => !current)}
          >
            <FilesIcon active={filesVisible} />
          </button>
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
                    key={tab}
                    className={tab === activePath ? 'tab active' : 'tab'}
                    title={tab}
                    onClick={() => activate(tab)}
                  >
                    <HtmlFileIcon className="tab-icon" size={13} />
                    <span className="tab-name">{baseName(tab)}</span>
                    <button
                      type="button"
                      className="tab-close"
                      aria-label="关闭标签页"
                      onClick={(event) => {
                        event.stopPropagation()
                        closeTab(tab)
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
                  className={immersive ? 'icon-btn fullscreen-toggle on' : 'icon-btn fullscreen-toggle'}
                  title="全屏阅读（Esc 退出）"
                  aria-label="全屏阅读"
                  disabled={!hasTab}
                  onClick={() => setImmersive((current) => !current)}
                >
                  <FullscreenIcon />
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
              {hasTab ? (
                <div className="preview-pane">
                  <PreviewPane onBounds={handleBounds} revision={boundsRev} />
                </div>
              ) : (
                <EmptyState onOpen={() => void openViaDialog()} onAddFolder={() => void addDir()} />
              )}
            </main>
          </section>

          {outlineVisible && hasTab ? (
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