import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export const libraTheme = EditorView.theme(
  {
    '&': {
      color: '#d7dae0',
      backgroundColor: 'transparent',
      height: '100%',
      fontSize: '13.5px'
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Sarasa Mono SC', Consolas, monospace",
      lineHeight: '1.72',
      padding: '16px 0 40px'
    },
    '.cm-content': { caretColor: '#e0b070', padding: '0 6px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#454b54',
      border: 'none',
      paddingRight: '14px',
      paddingLeft: '10px'
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8b929c' },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.028)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(224, 176, 112, 0.22)'
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#e0b070', borderLeftWidth: '2px' },
    '.cm-foldPlaceholder': {
      backgroundColor: '#262a32',
      border: 'none',
      color: '#8b929c',
      padding: '0 6px',
      borderRadius: '4px'
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(224, 176, 112, 0.16)',
      outline: 'none'
    },
    '&.cm-focused': { outline: 'none' }
  },
  { dark: true }
)

export const libraHighlight = HighlightStyle.define([
  { tag: t.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: t.tagName, color: '#e0707f' },
  { tag: t.attributeName, color: '#d9a066' },
  { tag: [t.string, t.attributeValue], color: '#98c379' },
  { tag: [t.number, t.bool, t.null], color: '#d9a066' },
  { tag: [t.keyword, t.operatorKeyword], color: '#c58bd6' },
  { tag: [t.propertyName], color: '#8ab4d8' },
  { tag: [t.typeName, t.className], color: '#e5c07b' },
  { tag: [t.bracket, t.angleBracket, t.squareBracket, t.paren], color: '#6b7280' },
  { tag: t.invalid, color: '#ef4444' },
  { tag: t.heading, color: '#e0b070', fontWeight: '600' }
])