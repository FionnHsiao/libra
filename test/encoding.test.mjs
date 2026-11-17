import assert from 'node:assert/strict'
import test from 'node:test'
import iconv from 'iconv-lite'
import { decodeBuffer, detectEol, encodeBuffer, normalizeEol } from '../src/main/encoding.ts'

test('utf-8 without BOM round-trips byte for byte', () => {
  const original = '<!doctype html>\n<html>\n  <body>你好</body>\n</html>\n'
  const buffer = Buffer.from(original, 'utf8')
  const decoded = decodeBuffer(buffer)
  assert.equal(decoded.encoding, 'utf8')
  assert.equal(decoded.bom, false)
  assert.equal(decoded.eol, 'LF')
  assert.equal(decoded.text, original)
  assert.deepEqual(encodeBuffer(decoded.text, decoded.encoding, decoded.bom, decoded.eol), buffer)
})

test('utf-8 BOM is preserved', () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf])
  const body = Buffer.from('<!doctype html>\n', 'utf8')
  const buffer = Buffer.concat([bom, body])
  const decoded = decodeBuffer(buffer)
  assert.equal(decoded.bom, true)
  assert.equal(decoded.text, body.toString('utf8'))
  assert.deepEqual(encodeBuffer(decoded.text, decoded.encoding, decoded.bom, decoded.eol), buffer)
})

test('CRLF line endings survive a round trip', () => {
  const original = '<html>\r\n  <body>你好</body>\r\n</html>\r\n'
  const buffer = Buffer.from(original, 'utf8')
  const decoded = decodeBuffer(buffer)
  assert.equal(decoded.eol, 'CRLF')
  assert.deepEqual(encodeBuffer(decoded.text, decoded.encoding, decoded.bom, decoded.eol), buffer)
})

test('GBK file decodes and re-encodes to identical bytes', () => {
  const original = '<html><body>简体中文测试，这一行用于验证编码检测。</body></html>\n'
  const buffer = iconv.encode(original, 'gbk')
  const decoded = decodeBuffer(buffer)
  assert.equal(decoded.text, original)
  assert.ok(['gb18030', 'gbk'].includes(decoded.encoding))
  assert.deepEqual(encodeBuffer(decoded.text, decoded.encoding, decoded.bom, decoded.eol), buffer)
})

test('utf-16le with BOM round-trips', () => {
  const original = '<html><body>中文内容</body></html>\n'
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(original, 'utf16le')])
  const decoded = decodeBuffer(buffer)
  assert.equal(decoded.encoding, 'utf16le')
  assert.equal(decoded.bom, true)
  assert.equal(decoded.text, original)
  assert.deepEqual(encodeBuffer(decoded.text, decoded.encoding, decoded.bom, decoded.eol), buffer)
})

test('line ending helpers behave', () => {
  assert.equal(normalizeEol('a\r\nb\nc', 'LF'), 'a\nb\nc')
  assert.equal(normalizeEol('a\nb\r\nc', 'CRLF'), 'a\r\nb\r\nc')
  assert.equal(detectEol('a\nb\n'), 'LF')
  assert.equal(detectEol('a\r\nb\r\n'), 'CRLF')
  assert.equal(detectEol('single line'), 'LF')
})