let depth = 0

function hostElement(): HTMLElement | null {
  return document.querySelector('.preview-host') as HTMLElement | null
}

function hostRect(): DOMRect | null {
  const host = hostElement()
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

/**
 * 原生视图永远画在 DOM 之上，弹层要显示就只能先把它藏起来。
 * 但直接藏会白屏，所以先截一张当前画面贴到预览区当背景，视觉上文档"冻结"了。
 */
export function suppressPreview(): void {
  depth += 1
  if (depth > 1) return

  const host = hostElement()
  if (!host) {
    window.libra.setPreviewSuppressed(true)
    return
  }

  void window.libra
    .capturePreview()
    .then((snapshot) => {
      // 拿不到快照就不隐藏视图：宁可菜单被压住，也不要白屏
      if (!snapshot) {
        depth = Math.max(0, depth - 1)
        return
      }
      host.style.backgroundImage = `url(${snapshot})`
      host.style.backgroundSize = '100% 100%'
      host.style.backgroundRepeat = 'no-repeat'
      window.libra.setPreviewSuppressed(true)
    })
    .catch(() => {
      depth = Math.max(0, depth - 1)
    })
}

export function releasePreview(): void {
  depth = Math.max(0, depth - 1)
  if (depth > 0) return

  const host = hostElement()
  if (host) {
    host.style.backgroundImage = ''
    host.style.backgroundSize = ''
    host.style.backgroundRepeat = ''
  }
  window.libra.setPreviewSuppressed(false)
}