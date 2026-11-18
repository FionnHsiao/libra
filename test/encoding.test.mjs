import assert from 'node:assert/strict'
import test from 'node:test'
import iconv from 'iconv-lite'
import { decodeBuffer, detectEol } from '../src/main/encoding.ts'

test('utf-8 按原文读出', () => {
  const original = '<!doctype html>\n<html>\n  <body>你好</body>\n</html>\n'
  const decoded = decodeBuffer(Buffer.from(original, 'utf8'))
  assert.equal(decoded.encoding, 'utf8')
  assert.equal(decoded.bom, false)
  assert.equal(decoded.eol, 'LF')
  assert.equal(decoded.text, original)
})

test('utf-8 BOM 被识别并去掉', () => {
  const body = '<!doctype html>\n'
  const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body, 'utf8')])
  const decoded = decodeBuffer(buffer)
  assert.equal(decoded.encoding, 'utf8')
  assert.equal(decoded.bom, true)
  assert.equal(decoded.text, body)
})

test('GBK 文件按 gb18030 解码', () => {
  const original = '<html><body>简体中文测试，这一行用于验证编码检测。</body></html>\n'
  const decoded = decodeBuffer(iconv.encode(original, 'gbk'))
  assert.equal(decoded.text, original)
  assert.ok(['gb18030', 'gbk'].includes(decoded.encoding))
})

test('utf-16le with BOM', () => {
  const original = '<html><body>中文内容</body></html>\n'
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(original, 'utf16le')])
  const decoded = decodeBuffer(buffer)
  assert.equal(decoded.encoding, 'utf16le')
  assert.equal(decoded.bom, true)
  assert.equal(decoded.text, original)
})

test('CRLF 被识别', () => {
  const decoded = decodeBuffer(Buffer.from('<html>\r\n<body>你好</body>\r\n</html>\r\n', 'utf8'))
  assert.equal(decoded.eol, 'CRLF')
})

test('detectEol 的边界', () => {
  assert.equal(detectEol('a\nb\n'), 'LF')
  assert.equal(detectEol('a\r\nb\r\n'), 'CRLF')
  assert.equal(detectEol('single line'), 'LF')
})
