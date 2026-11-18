import { useEffect, useRef, type ReactElement } from 'react'
import type { PreviewRect } from '../../shared/protocol'

interface PreviewPaneProps {
  onBounds: (rect: PreviewRect | null) => void
  /** 变化时补报一次尺寸（进出全屏用） */
  revision?: number
}

export function PreviewPane({ onBounds, revision = 0 }: PreviewPaneProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const reportRef = useRef<() => void>(() => undefined)
  const lastRef = useRef('')

  useEffect(() => {
    const element = hostRef.current
    if (!element) return undefined

    const report = (): void => {
      const rect = element.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) {
        lastRef.current = ''
        onBounds(null)
        return
      }
      const next = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
      const key = `${next.x},${next.y},${next.width},${next.height}`
      if (key === lastRef.current) return
      lastRef.current = key
      onBounds(next)
    }

    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    reportRef.current = report
    report()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      onBounds(null)
    }
  }, [onBounds])

  // 进出系统全屏时窗口尺寸是系统异步改的，而预览是原生视图：这段过渡里
  // ResizeObserver / resize 可能一次都不回调，原生视图就会停在旧位置
  // （退出全屏后正文还铺满整个窗口）。过渡期间轮询几秒钟，尺寸一变就重新上报。
  useEffect(() => {
    let stopped = false
    const started = performance.now()
    const tick = (): void => {
      if (stopped) return
      reportRef.current()
      if (performance.now() - started < 1500) setTimeout(tick, 80)
    }
    tick()
    return () => {
      stopped = true
    }
  }, [revision])

  return <div className="preview-host" ref={hostRef} />
}