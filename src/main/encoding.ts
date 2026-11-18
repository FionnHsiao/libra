import * as chardetModule from 'chardet'
import iconv from 'iconv-lite'
import type { Eol } from '../shared/protocol'

export interface DecodedDocument {
  text: string
  encoding: string
  bom: boolean
  eol: Eol
}

interface ChardetLike {
  detect?: (input: Buffer) => string | null
  default?: { detect?: (input: Buffer) => string | null }
}

const chardet = chardetModule as unknown as ChardetLike
const detectCharset = chardet.detect ?? chardet.default?.detect

/** Dominant line ending of a text. Ties resolve to LF. */
export function detectEol(text: string): Eol {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) !== 10) continue
    if (i > 0 && text.charCodeAt(i - 1) === 13) crlf += 1
    else lf += 1
  }
  return crlf > lf ? 'CRLF' : 'LF'
}

const ALIASES: Record<string, string> = {
  'utf-8': 'utf8',
  utf8: 'utf8',
  ascii: 'utf8',
  'us-ascii': 'utf8',
  'gb2312': 'gb18030',
  gbk: 'gb18030',
  gb18030: 'gb18030',
  'gb-18030': 'gb18030',
  big5: 'big5',
  'big5-hkscs': 'big5',
  'shift_jis': 'shift_jis',
  'shift-jis': 'shift_jis',
  sjis: 'shift_jis',
  'windows-31j': 'shift_jis',
  'euc-jp': 'euc-jp',
  'euc-kr': 'euc-kr',
  'iso-8859-1': 'windows-1252',
  latin1: 'windows-1252',
  'windows-1252': 'windows-1252',
  'utf-16le': 'utf16le',
  'utf-16be': 'utf16be',
  'koi8-r': 'koi8-r'
}

export function normalizeEncoding(name: string | null | undefined): string {
  if (!name) return 'gb18030'
  const key = name.trim().toLowerCase()
  return ALIASES[key] ?? (iconv.encodingExists(key) ? key : 'gb18030')
}

function decodeStrictUtf8(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return null
  }
}

export function decodeBuffer(buffer: Buffer): DecodedDocument {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    const text = buffer.subarray(3).toString('utf8')
    return { text, encoding: 'utf8', bom: true, eol: detectEol(text) }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    const text = iconv.decode(buffer.subarray(2), 'utf16le')
    return { text, encoding: 'utf16le', bom: true, eol: detectEol(text) }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const text = iconv.decode(buffer.subarray(2), 'utf16be')
    return { text, encoding: 'utf16be', bom: true, eol: detectEol(text) }
  }

  const strictUtf8 = decodeStrictUtf8(buffer)
  if (strictUtf8 !== null) {
    return { text: strictUtf8, encoding: 'utf8', bom: false, eol: detectEol(strictUtf8) }
  }

  const encoding = normalizeEncoding(detectCharset ? detectCharset(buffer) : null)
  const text = iconv.decode(buffer, encoding)
  return { text, encoding, bom: false, eol: detectEol(text) }
}
