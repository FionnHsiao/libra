import { EditorView } from '@codemirror/view'
import { useEffect, useRef, type MutableRefObject, type ReactElement } from 'react'
import { createEditorState } from './editorState'

interface EditorProps {
  viewRef: MutableRefObject<EditorView | null>
}

export function Editor({ viewRef }: EditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const view = new EditorView({ parent: host, state: createEditorState('') })
    viewRef.current = view

    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [viewRef])

  return <div className="editor-host" ref={hostRef} />
}