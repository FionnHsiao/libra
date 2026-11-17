import { useEffect, useRef, type ReactElement } from 'react'
import type { PreviewRect } from '../../shared/protocol'

interface PreviewPaneProps {
  onBounds: (rect: PreviewRect | null) => void
}

export function PreviewPane({ onBounds }: PreviewPaneProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = hostRef.current
    if (!element) return undefined

    const report = (): void => {
      const rect = element.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) {
        onBounds(null)
        return
      }
      onBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }

    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    report()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      onBounds(null)
    }
  }, [onBounds])

  return <div className="preview-host" ref={hostRef} />
}