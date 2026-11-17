import type { ReactElement } from 'react'
import type { FileEntry } from '../../shared/protocol'

interface SidebarProps {
  dir: string
  files: FileEntry[]
  activePath: string
  onSelect: (path: string) => void
}

function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

export function Sidebar({ dir, files, activePath, onSelect }: SidebarProps): ReactElement {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title" title={dir}>
          {baseName(dir)}
        </span>
        <span className="sidebar-count">{files.length}</span>
      </div>
      <div className="file-list">
        {files.length === 0 ? (
          <p className="file-empty">这个文件夹里没有 HTML 文件</p>
        ) : (
          files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={file.path === activePath ? 'file-item active' : 'file-item'}
              title={file.path}
              onClick={() => onSelect(file.path)}
            >
              {file.name}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}