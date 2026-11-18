let depth = 0

function hostRect(): DOMRect | null {
  const host = document.querySelector('.preview-host')
  if (!host) return null
  const rect = host.getBoundingClientRect()
  return rect.width < 8 ? null : rect
}

/** 弹层是否会盖到预览区域（原生视图） */
export function popupOverlapsPreview(left: number, width: number): boolean {
  const rect = hostRect()
  if (!rect) return false
  return left + width > rect.left && left < rect.right
}

export function suppressPreview(): void {
  depth += 1
  if (depth === 1) window.libra.setPreviewSuppressed(true)
}

export function releasePreview(): void {
  depth = Math.max(0, depth - 1)
  if (depth === 0) window.libra.setPreviewSuppressed(false)
}