import { useCallback, useEffect, useReducer, useRef, useState, type ReactElement } from 'react'
import type { OutlineItem, TreeEntry } from '../../shared/protocol'

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

function LocateIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.6v2.2M8 12.2v2.2M1.6 8h2.2M12.2 8h2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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

function HideIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M2.6 8s2-3.4 5.4-3.4S13.4 8 13.4 8s-2 3.4-5.4 3.4S2.6 8 2.6 8z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 13 13 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

interface TreeNodeProps {
  entry: TreeEntry
  depth: number
  activePath: string | null
  isRoot?: boolean
  expanded: Set<string>
  entries: Record<string, TreeEntry[]>
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onRemove?: (path: string) => void
}

function TreeNode({ entry, depth, activePath, isRoot, expanded, entries, onToggle, onOpenFile, onRemove }: TreeNodeProps): ReactElement {
  const isDir = entry.kind === 'dir'
  const open = isDir && expanded.has(entry.path)
  const isActive = !isDir && entry.path === activePath
  const indent = isRoot ? 8 : 6 + depth * 13
  const children = entries[entry.path]

  return (
    <div className="tree-node">
      <div
        className={[
          'tree-row',
          isRoot ? 'tree-root-row' : '',
          isActive ? 'active' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: `${indent}px` }}
        title={entry.path}
        onClick={() => {
          if (isDir) onToggle(entry.path)
          else onOpenFile(entry.path)
        }}
      >
        <span className="tree-chevron">{isDir ? <ChevronIcon open={open} /> : null}</span>
        {isDir ? <FolderIcon open={open} /> : <FileIcon />}
        <span className="tree-label">{isRoot ? baseName(entry.path) : entry.name}</span>
        {isRoot && onRemove ? (
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
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

interface FileTreeProps {
  jars: string[]
  activePath: string | null
  onOpenFile: (path: string) => void
  onAddJar: () => void
  onRemoveJar: (path: string) => void
  onHide: () => void
}

const EXPAND_BUDGET = 200

export function FileTree({ jars, activePath, onOpenFile, onAddJar, onRemoveJar, onHide }: FileTreeProps): ReactElement {
  const roots = jars
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(roots))
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
  }, [roots, ensureLoaded])

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
  }, [ensureLoaded, expanded, roots])

  const locate = useCallback(async () => {
    if (!activePath) return
    const root = roots.find((item) => isInside(item, activePath))
    if (!root) return

    const chain: string[] = []
    let current = dirName(activePath)
    while (current && isInside(root, current)) {
      chain.unshift(current)
      if (current.toLowerCase() === root.toLowerCase()) break
      current = dirName(current)
    }

    for (const dir of chain) await ensureLoaded(dir)
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const dir of chain) next.add(dir)
      return next
    })

    window.setTimeout(() => {
      listRef.current?.querySelector('.tree-row.active')?.scrollIntoView({ block: 'center' })
    }, 150)
  }, [activePath, ensureLoaded, roots])

  return (
    <aside className="panel-left">
      <div className="jar-header">
        <span className="jar-title">星星罐</span>
        <span className="jar-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" title="添加星星罐（选择一个文件夹）" aria-label="添加星星罐" onClick={onAddJar}>
            <PlusIcon />
          </button>
          <button type="button" title="定位到当前文件" aria-label="定位到当前文件" onClick={() => void locate()}>
            <LocateIcon />
          </button>
          <button type="button" title="折叠 / 展开全部" aria-label="折叠或展开全部" onClick={() => void toggleAll()}>
            <FoldIcon />
          </button>
          <button type="button" title="隐藏文件列表" aria-label="隐藏文件列表" onClick={onHide}>
            <HideIcon />
          </button>
        </span>
      </div>

      <div className="tree-list" ref={listRef}>
        {roots.length === 0 ? (
          <p className="jar-empty">还没有星星罐。点上面的 + 选一个文件夹，它就成了一个星星罐。</p>
        ) : (
          roots.map((root) => (
            <TreeNode
              key={root}
              entry={{ name: baseName(root), path: root, kind: 'dir' }}
              depth={0}
              activePath={activePath}
              isRoot
              expanded={expanded}
              entries={entriesRef.current}
              onToggle={toggle}
              onOpenFile={onOpenFile}
              onRemove={onRemoveJar}
            />
          ))
        )}
      </div>
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