import type { ReactElement } from 'react'
import type { FileEntry, OutlineItem } from '../../shared/protocol'

function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

interface FileListProps {
  dir: string
  files: FileEntry[]
  activePath: string
  onSelect: (path: string) => void
}

export function FileList({ dir, files, activePath, onSelect }: FileListProps): ReactElement {
  return (
    <aside className="panel-left">
      <div className="panel-head">
        <span className="panel-title" title={dir}>
          {baseName(dir)}
        </span>
        <span className="panel-count">{files.length}</span>
      </div>
      <div className="panel-body">
        {files.length === 0 ? (
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
    </aside>
  )
}

interface OutlineListProps {
  outline: OutlineItem[]
  onJump: (index: number) => void
}

export function OutlineList({ outline, onJump }: OutlineListProps): ReactElement {
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