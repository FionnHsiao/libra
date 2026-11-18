export function baseName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

/**
 * 取父目录。注意盘符根目录：E:\a.html 的父目录是 E:\ 而不是 E:
 * （"E:" 在 Windows 上是"驱动器相对路径"，不是绝对路径，很多 API 会拒绝）
 */
export function dirName(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  if (index < 0) return path
  if (index === 2 && /^[A-Za-z]:$/.test(path.slice(0, 2))) return path.slice(0, 3)
  if (index === 0) return path.slice(0, 1)
  return path.slice(0, index)
}

export function isInside(root: string, target: string): boolean {
  const normalize = (value: string): string => value.replace(/[\\/]+$/, '').toLowerCase()
  const base = normalize(root)
  const path = normalize(target)
  return path === base || path.startsWith(`${base}\\`) || path.startsWith(`${base}/`)
}