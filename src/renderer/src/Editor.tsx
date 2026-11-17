import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { html } from '@codemirror/lang-html'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  crosshairCursor
} from '@codemirror/view'
import { useEffect, useRef, type ReactElement, type MutableRefObject } from 'react'
import { libraHighlight, libraTheme } from './theme'

interface EditorProps {
  initialText: string
  viewRef: MutableRefObject<EditorView | null>
  onChange: () => void
  onCursor: (line: number, column: number) => void
}

export function Editor({ initialText, viewRef, onChange, onCursor }: EditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  onChangeRef.current = onChange
  onCursorRef.current = onCursor

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            indentWithTab
          ]),
          html(),
          libraTheme,
          syntaxHighlighting(libraHighlight),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current()
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head
              const line = update.state.doc.lineAt(head)
              onCursorRef.current(line.number, head - line.from + 1)
            }
          })
        ]
      })
    })

    viewRef.current = view
    onCursorRef.current(1, 1)

    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [initialText, viewRef])

  return <div className="editor-host" ref={hostRef} />
}