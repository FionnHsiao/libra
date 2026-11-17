import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export const libraTheme = EditorView.theme(
  {
    '&': {
      color: '#35322b',
      backgroundColor: '#fbfaf6',
      height: '100%',
      fontSize: '13px'
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Sarasa Mono SC', Consolas, monospace",
      lineHeight: '1.75',
      padding: '14px 0 48px'
    },
    '.cm-content': { caretColor: '#a9743f', padding: '0 6px' },
    '.cm-gutters': {
      backgroundColor: '#fbfaf6',
      color: '#c2b9a7',
      border: 'none',
      paddingRight: '12px',
      paddingLeft: '8px'
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8c8477' },
    '.cm-activeLine': { backgroundColor: 'rgba(169, 116, 63, 0.055)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(169, 116, 63, 0.18)'
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#a9743f', borderLeftWidth: '2px' },
    '.cm-foldPlaceholder': {
      backgroundColor: '#efe9db',
      border: 'none',
      color: '#8c8477',
      padding: '0 6px',
      borderRadius: '4px'
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(169, 116, 63, 0.16)',
      outline: 'none'
    },
    '&.cm-focused': { outline: 'none' }
  },
  { dark: false }
)

export const libraHighlight = HighlightStyle.define([
  { tag: t.comment, color: '#a49b8a', fontStyle: 'italic' },
  { tag: t.tagName, color: '#a6523b' },
  { tag: t.attributeName, color: '#8a6a2f' },
  { tag: [t.string, t.attributeValue], color: '#5f7a44' },
  { tag: [t.number, t.bool, t.null], color: '#b0723a' },
  { tag: [t.keyword, t.operatorKeyword], color: '#7c5a88' },
  { tag: t.propertyName, color: '#40657d' },
  { tag: [t.typeName, t.className], color: '#8c6a2b' },
  { tag: [t.bracket, t.angleBracket, t.squareBracket, t.paren], color: '#b3aa97' },
  { tag: t.invalid, color: '#c0392b' },
  { tag: t.heading, color: '#a9743f', fontWeight: '600' }
])