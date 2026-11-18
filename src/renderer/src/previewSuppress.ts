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
 * 直接藏会白屏，所以先把当前画面截下来贴到预览区当背景（文档"定格"）。
 *
 * 关键：必须等截图和隐藏都完成之后再显示弹层，
 * 否则会先出现"菜单被正文压住"，随后跳到最上层，看起来就是闪一下。
 *
 * 返回是否真的完成了隐藏；拿不到截图时返回 false，此时调用方不应该隐藏视图。
 */
export async function suppressPreview(): Promise<boolean> {
  depth += 1
  if (depth > 1) return true

  const host = hostElement()
  if (!host) {
    window.libra.setPreviewSuppressed(true)
    return true
  }

  try {
    const snapshot = await window.libra.capturePreview()
    if (!snapshot) {
      depth = Math.max(0, depth - 1)
      return false
    }
    host.style.backgroundImage = `url(${snapshot})`
    host.style.backgroundSize = '100% 100%'
    host.style.backgroundRepeat = 'no-repeat'
    window.libra.setPreviewSuppressed(true)
    return true
  } catch {
    depth = Math.max(0, depth - 1)
    return false
  }
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