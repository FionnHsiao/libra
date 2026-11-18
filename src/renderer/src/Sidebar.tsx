import { useEffect, useState, type ReactElement } from 'react'
import type { OutlineItem, TreeEntry } from '../../shared/protocol'

function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function ChevronIcon({ open }: { open: boolean }): ReactElement {
  return (
    <svg className={open ? 'chev open' : 'chev'} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }): ReactElement {
  if (open) {
    return (
      <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M1.6 6.4h11.2l-1.4 6H3z"
          fill="currentColor"
          opacity="0.28"
        />
        <path
          d="M1.6 6.4h11.2l-1.4 6H3z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M2.2 6.4V4.6a1 1 0 0 1 1-1h2.4l1.2 1.2h5.4a1 1 0 0 1 1 1v.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M1.8 4.6a1 1 0 0 1 1-1h2.5l1.2 1.3h5.7a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M1.8 4.6a1 1 0 0 1 1-1h2.5l1.2 1.3h5.7a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FileIcon(): ReactElement {
  return (
    <svg className="tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M4 2.6h5l3 3v7.8H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9 2.6v3h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

interface TreeNodeProps {
  entry: TreeEntry
  depth: number
  activePath: string | null
  defaultOpen: boolean
  isRoot?: boolean
  onOpenFile: (path: string) => void
}

function TreeNode({ entry, depth, activePath, defaultOpen, isRoot, onOpenFile }: TreeNodeProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  const [children, setChildren] = useState<TreeEntry[] | null>(null)

  useEffect(() => {
    if (entry.kind !== 'dir' || !open) return undefined
    let cancelled = false
    window.libra
      .readDir(entry.path)
      .then((listing) => {
        if (!cancelled) setChildren(listing.entries)
      })
      .catch(() => {
        if (!cancelled) setChildren([])
      })
    return () => {
      cancelled = true
    }
  }, [entry.kind, entry.path, open])

  const isDir = entry.kind === 'dir'
  const isActive = !isDir && entry.path === activePath
  const indent = isRoot ? 8 : 6 + depth * 13

  return (
    <div className="tree-node">
      <div
        className={isRoot ? 'tree-row tree-root-row' : isActive ? 'tree-row active' : 'tree-row'}
        style={{ paddingLeft: `${indent}px` }}
        title={entry.path}
        onClick={() => {
          if (isDir) setOpen((value) => !value)
          else onOpenFile(entry.path)
        }}
      >
        <span className="tree-chevron">{isDir ? <ChevronIcon open={open} /> : null}</span>
        {isDir ? <FolderIcon open={open} /> : <FileIcon />}
        <span className="tree-label">{isRoot ? baseName(entry.path) : entry.name}</span>
      </div>

      {isDir && open ? (
        <div className="tree-children">
          {children === null ? null : children.length === 0 ? (
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
                defaultOpen={false}
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
  rootDir: string
  activePath: string | null
  onOpenFile: (path: string) => void
}

export function FileTree({ rootDir, activePath, onOpenFile }: FileTreeProps): ReactElement {
  return (
    <aside className="panel-left">
      <TreeNode
        key={rootDir}
        entry={{ name: baseName(rootDir), path: rootDir, kind: 'dir' }}
        depth={0}
        activePath={activePath}
        defaultOpen
        isRoot
        onOpenFile={onOpenFile}
      />
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
        <span className="panel-count">{outline.length}</span>
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