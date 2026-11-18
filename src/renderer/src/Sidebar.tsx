import { useCallback, useEffect, useReducer, useRef, useState, type ReactElement } from 'react'
import type { JarEntry, OutlineItem, TreeEntry } from '../../shared/protocol'
import { FilesIcon } from './MenuBar'
import { baseName, dirName } from './paths'

function ChevronIcon({ open }: { open: boolean }): ReactElement {
  return (
    <svg className={open ? 'chev open' : 'chev'} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }): ReactElement {
  if (open) {
    return (
      <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M1.6 6.4h11.2l-1.4 6H3z" fill="currentColor" opacity="0.22" />
        <path d="M1.6 6.4h11.2l-1.4 6H3z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M2.2 6.4V4.6a1 1 0 0 1 1-1h2.4l1.2 1.2h5.4a1 1 0 0 1 1 1v.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M1.8 4.6a1 1 0 0 1 1-1h2.5l1.2 1.3h5.7a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" fill="currentColor" opacity="0.22" />
      <path d="M1.8 4.6a1 1 0 0 1 1-1h2.5l1.2 1.3h5.7a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function FileIcon(): ReactElement {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 2.6h5l3 3v7.8H4z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9 2.6v3h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M8 3.4v9.2M3.4 8h9.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function RefreshIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.6-3.7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.2 2.6v3.1H10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FoldIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        d="M8 3.2v9.6M5.2 6 8 3.2 10.8 6M5.2 10 8 12.8 10.8 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RenameInput({
  defaultValue,
  onCommit,
  onCancel
}: {
  defaultValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}): ReactElement {
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    const dot = defaultValue.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : defaultValue.length)
  }, [defaultValue])

  return (
    <input
      ref={ref}
      className="rename-input"
      defaultValue={defaultValue}
      spellCheck={false}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') onCommit(event.currentTarget.value)
        if (event.key === 'Escape') onCancel()
      }}
      onBlur={(event) => onCommit(event.currentTarget.value)}
    />
  )
}

interface TreeNodeProps {
  entry: TreeEntry
  depth: number
  activePath: string | null
  isRoot?: boolean
  expanded: Set<string>
  entries: Record<string, TreeEntry[]>
  renaming: string | null
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onContextMenu: (event: React.MouseEvent, entry: TreeEntry, isRoot: boolean) => void
  onRenameCommit: (entry: TreeEntry, value: string) => void
  onRenameCancel: () => void
  onRemove?: (path: string) => void
}

function TreeNode(props: TreeNodeProps): ReactElement {
  const {
    entry,
    depth,
    activePath,
    isRoot,
    expanded,
    entries,
    renaming,
    onToggle,
    onOpenFile,
    onContextMenu,
    onRenameCommit,
    onRenameCancel,
    onRemove
  } = props

  const isDir = entry.kind === 'dir'
  const open = isDir && expanded.has(entry.path)
  const isActive = !isDir && entry.path === activePath
  const indent = isRoot ? 8 : 6 + depth * 13
  const children = entries[entry.path]
  const isRenaming = renaming === entry.path

  return (
    <div className="tree-node">
      <div
        className={['tree-row', isRoot ? 'tree-root-row' : '', isActive ? 'active' : ''].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${indent}px` }}
        title={entry.path}
        onContextMenu={(event) => onContextMenu(event, entry, Boolean(isRoot))}
        onClick={() => {
          if (isRenaming) return
          if (isDir) onToggle(entry.path)
          else onOpenFile(entry.path)
        }}
      >
        <span className="tree-chevron">{isDir ? <ChevronIcon open={open} /> : null}</span>
        {isDir ? <FolderIcon open={open} /> : <FileIcon />}
        {isRenaming ? (
          <RenameInput defaultValue={entry.name} onCommit={(value) => onRenameCommit(entry, value)} onCancel={onRenameCancel} />
        ) : (
          <span className="tree-label">{isRoot ? baseName(entry.path) : entry.name}</span>
        )}
        {isRoot && onRemove && !isRenaming ? (
          <span className="tree-remove">
            <button
              type="button"
              title="移出星星罐（不会删除磁盘文件）"
              aria-label="移出星星罐"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(entry.path)
              }}
            >
              ×
            </button>
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="tree-children">
          {children === undefined ? null : children.length === 0 ? (
            <div className="tree-empty" style={{ paddingLeft: `${indent + 26}px` }}>
              空
            </div>
          ) : (
            children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                activePath={activePath}
                expanded={expanded}
                entries={entries}
                renaming={renaming}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
                onContextMenu={onContextMenu}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

interface FileTreeProps {
  entries: JarEntry[]
  activePath: string | null
  onOpenFile: (path: string) => void
  onAddDir: () => void
  onRemoveEntry: (path: string) => void
  onHide: () => void
  onRenamed: (from: string, to: string) => void
  onError: (message: string) => void
}

const EXPAND_BUDGET = 200

export function FileTree(props: FileTreeProps): ReactElement {
  const { entries, activePath, onOpenFile, onAddDir, onRemoveEntry, onHide, onRenamed, onError } = props
  const roots = entries.filter((entry) => entry.kind === 'dir').map((entry) => entry.path)

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(roots))
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: TreeEntry; isRoot: boolean } | null>(null)

  const entriesRef = useRef<Record<string, TreeEntry[]>>({})
  const [, bump] = useReducer((value: number) => value + 1, 0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const ensureLoaded = useCallback(async (path: string) => {
    if (entriesRef.current[path]) return
    entriesRef.current[path] = []
    try {
      const listing = await window.libra.readDir(path)
      entriesRef.current[path] = listing.entries
    } catch {
      entriesRef.current[path] = []
    }
    bump()
  }, [])

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const root of roots) next.add(root)
      return next
    })
    for (const root of roots) void ensureLoaded(root)
  }, [roots.join('|'), ensureLoaded])

  // 磁盘变化 → 重新读取对应目录
  useEffect(() => {
    const off = window.libra.onTreeChanged((payload) => {
      for (const key of Object.keys(entriesRef.current)) {
        if (key.toLowerCase() === payload.dir.toLowerCase()) {
          delete entriesRef.current[key]
          void ensureLoaded(key)
        }
      }
    })
    return off
  }, [ensureLoaded])

  const toggle = useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
          void ensureLoaded(path)
        }
        return next
      })
    },
    [ensureLoaded]
  )

  const toggleAll = useCallback(async () => {
    const hasOpenSub = [...expanded].some((path) => !roots.includes(path))
    if (hasOpenSub) {
      setExpanded(new Set(roots))
      return
    }

    const next = new Set(expanded)
    const queue = [...roots]
    let budget = EXPAND_BUDGET

    while (queue.length > 0 && budget > 0) {
      const dir = queue.shift() as string
      if (!entriesRef.current[dir]) await ensureLoaded(dir)
      next.add(dir)
      budget -= 1
      for (const entry of entriesRef.current[dir] ?? []) {
        if (entry.kind === 'dir') queue.push(entry.path)
      }
    }

    setExpanded(next)
  }, [ensureLoaded, expanded, roots.join('|')])

  const refreshAll = useCallback(async () => {
    const dirs = [...expanded]
    for (const dir of dirs) delete entriesRef.current[dir]
    for (const dir of dirs) await ensureLoaded(dir)
    bump()
  }, [ensureLoaded, expanded])

  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return undefined
    const handleDown = (): void => setMenu(null)
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('resize', handleDown)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('resize', handleDown)
    }
  }, [menu])

  const openMenu = useCallback((event: React.MouseEvent, entry: TreeEntry, isRoot: boolean) => {
    event.preventDefault()
    event.stopPropagation()
    const width = 180
    const height = isRoot ? 116 : 78
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      entry,
      isRoot
    })
  }, [])

  const commitRename = useCallback(
    async (entry: TreeEntry, value: string) => {
      setRenaming(null)
      const name = value.trim()
      if (!name || name === entry.name) return

      try {
        const next = await window.libra.renamePath(entry.path, name)
        onRenamed(entry.path, next)
        const parent = dirName(entry.path)
        delete entriesRef.current[parent]
        void ensureLoaded(parent)
      } catch (error) {
        onError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+':\s*/, '') : String(error))
      }
    },
    [ensureLoaded, onError, onRenamed]
  )

  return (
    <aside className="panel-left">
      <div className="jar-header">
        <span className="jar-title">星星罐</span>
        <span className="jar-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" title="添加文件夹（展开成目录树）" aria-label="添加文件夹" onClick={onAddDir}>
            <PlusIcon />
          </button>
          <button type="button" title="刷新文件列表" aria-label="刷新文件列表" onClick={() => void refreshAll()}>
            <RefreshIcon />
          </button>
          <button type="button" title="折叠 / 展开全部" aria-label="折叠或展开全部" onClick={() => void toggleAll()}>
            <FoldIcon />
          </button>
          <button type="button" title="隐藏文件列表" aria-label="隐藏文件列表" onClick={onHide}>
            <FilesIcon active={false} />
          </button>
        </span>
      </div>

      <div className="tree-list" ref={listRef}>
        {entries.length === 0 ? (
          <p className="jar-empty">还没有内容。点上面的 + 添加文件夹，或者按 Ctrl+O 打开单个文件。</p>
        ) : (
          entries.map((entry) =>
            entry.kind === 'dir' ? (
              <TreeNode
                key={entry.path}
                entry={{ name: baseName(entry.path), path: entry.path, kind: 'dir' }}
                depth={0}
                activePath={activePath}
                isRoot
                expanded={expanded}
                entries={entriesRef.current}
                renaming={renaming}
                onToggle={toggle}
                onOpenFile={onOpenFile}
                onContextMenu={openMenu}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenaming(null)}
                onRemove={onRemoveEntry}
              />
            ) : (
              <div
                key={entry.path}
                className={entry.path === activePath ? 'tree-row tree-file-row active' : 'tree-row tree-file-row'}
                style={{ paddingLeft: '8px' }}
                title={entry.path}
                onContextMenu={(event) => openMenu(event, { name: baseName(entry.path), path: entry.path, kind: 'file' }, false)}
                onClick={() => {
                  if (renaming !== entry.path) onOpenFile(entry.path)
                }}
              >
                <span className="tree-chevron" />
                <FileIcon />
                {renaming === entry.path ? (
                  <RenameInput
                    defaultValue={baseName(entry.path)}
                    onCommit={(value) => void commitRename({ name: baseName(entry.path), path: entry.path, kind: 'file' }, value)}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <span className="tree-label">{baseName(entry.path)}</span>
                )}
                <span className="tree-remove">
                  <button
                    type="button"
                    title="移出星星罐（不删除文件）"
                    aria-label="移出星星罐"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveEntry(entry.path)
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
            )
          )
        )}
      </div>

      {menu ? (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              closeMenu()
              setRenaming(menu.entry.path)
            }}
          >
            <span className="menu-check" />
            <span className="menu-label">重命名</span>
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              closeMenu()
              window.libra.revealInFolder(menu.entry.path)
            }}
          >
            <span className="menu-check" />
            <span className="menu-label">在文件夹中显示</span>
          </button>
          {menu.isRoot ? (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                closeMenu()
                onRemoveEntry(menu.entry.path)
              }}
            >
              <span className="menu-check" />
              <span className="menu-label">移出星星罐</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}

interface OutlinePanelProps {
  outline: OutlineItem[]
  onJump: (index: number) => void
}

export function OutlinePanel({ outline, onJump }: OutlinePanelProps): ReactElement {
  const baseLevel = outline.length > 0 ? Math.min(...outline.map((item) => item.level)) : 1

  return (
    <aside className="panel-right">
      <div className="panel-head">
        <span className="panel-title">大纲</span>
      </div>
      <div className="panel-body">
        {outline.length === 0 ? (
          <p className="panel-empty">没有找到标题</p>
        ) : (
          outline.map((item) => (
            <button
              key={item.index}
              type="button"
              className={`outline-item level-${item.level}`}
              style={{ paddingLeft: `${10 + (item.level - baseLevel) * 12}px` }}
              title={item.text}
              onClick={() => onJump(item.index)}
            >
              {item.text}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}