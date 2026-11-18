import assert from 'node:assert/strict'
import test from 'node:test'
import { baseName, dirName, isInside } from '../src/renderer/src/paths.ts'

test('盘符根目录下的文件，父目录要保留反斜杠', () => {
  assert.equal(dirName('E:\\note.html'), 'E:\\')
  assert.equal(dirName('e:/note.html'), 'e:/')
  assert.equal(dirName('E:\\潘\\note.html'), 'E:\\潘')
  assert.equal(dirName('E:\\潘\\深\\note.html'), 'E:\\潘\\深')
})

test('POSIX 路径', () => {
  assert.equal(dirName('/Users/x/note.html'), '/Users/x')
  assert.equal(dirName('/note.html'), '/')
})

test('baseName', () => {
  assert.equal(baseName('E:\\潘\\note.html'), 'note.html')
  assert.equal(baseName('E:\\'), 'E:')
  assert.equal(baseName('/'), '/')
})

test('isInside 支持盘符根目录与嵌套', () => {
  assert.equal(isInside('E:\\', 'E:\\note.html'), true)
  assert.equal(isInside('E:\\潘', 'E:\\潘\\子\\note.html'), true)
  assert.equal(isInside('E:\\潘', 'E:\\潘2\\note.html'), false)
  assert.equal(isInside('E:\\潘\\', 'E:\\潘\\note.html'), true)
})