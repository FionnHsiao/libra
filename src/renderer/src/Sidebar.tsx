import type { ReactElement } from 'react'
import type { FileEntry, OutlineItem } from '../../shared/protocol'

interface SidebarProps {
  dir: string
  files: FileEntry[]
  activePath: string
  outline: OutlineItem[]
  onSelect: (path: string) => void
  onOutlineJump: (index: number) => void
}

function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

export function Sidebar({ dir, files, activePath, outline, onSelect, onOutlineJump }: SidebarProps): ReactElement {
  const levels = outline.length > 0 ? Math.min(...outline.map((item) => item.level)) : 1
  const fileCount = files.length

  return (
    <aside className="sidebar">
      <section className="panel outline-panel">
        <div className="panel-head">
          <span className="panel-title">目录</span>
          <span className="panel-count">{outline.length}</span>
        </div>
        <div className="panel-body">
          {outline.length === 0 ? (
            <p className="panel-empty">这个文档没有标题</p>
          ) : (
            outline.map((item) => (
              <button
                key={item.index}
                type="button"
                className={`outline-item level-${item.level}`}
                style={{ paddingLeft: `${8 + (item.level - levels) * 12}px` }}
                title={item.text}
                onClick={() => onOutlineJump(item.index)}
              >
                {item.text}
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel files-panel">
        <div className="panel-head">
          <span className="panel-title" title={dir}>
            {baseName(dir)}
          </span>
          <span className="panel-count">{fileCount}</span>
        </div>
        <div className="panel-body">
          {fileCount === 0 ? (
            <p className="panel-empty">这个文件夹里没有 HTML 文件</p>
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
      </section>
    </aside>
  )
}