import assert from 'node:assert/strict'
import test from 'node:test'
import { sortEntries } from '../src/renderer/src/sortEntries.ts'

const file = (name, mtimeMs = 0) => ({ name, path: `/x/${name}`, kind: 'file', mtimeMs })
const dir = (name, mtimeMs = 0) => ({ name, path: `/x/${name}`, kind: 'dir', mtimeMs })
const names = (list) => list.map((item) => item.name)

test('名称正序：目录在前，数字按大小排', () => {
  const list = [file('b.html'), dir('z-dir'), file('第10章.html'), file('第2章.html')]
  const sorted = sortEntries(list, { key: 'name', dir: 'asc' })
  assert.equal(sorted[0].name, 'z-dir')
  assert.deepEqual(names(sorted).slice(1), ['第2章.html', '第10章.html', 'b.html'])
})

test('名称倒序：目录仍然在前', () => {
  const list = [dir('a'), file('a.html'), file('c.html'), file('b.html')]
  const sorted = sortEntries(list, { key: 'name', dir: 'desc' })
  assert.equal(sorted[0].name, 'a')
  assert.deepEqual(names(sorted).slice(1), ['c.html', 'b.html', 'a.html'])
})

test('时间正序与倒序', () => {
  const list = [file('old.html', 100), file('new.html', 300), file('mid.html', 200)]
  assert.deepEqual(names(sortEntries(list, { key: 'time', dir: 'asc' })), ['old.html', 'mid.html', 'new.html'])
  assert.deepEqual(names(sortEntries(list, { key: 'time', dir: 'desc' })), ['new.html', 'mid.html', 'old.html'])
})

test('时间相同回落到名称，缺时间当 0', () => {
  const list = [file('b.html', 100), file('a.html', 100), file('none.html')]
  assert.deepEqual(names(sortEntries(list, { key: 'time', dir: 'desc' })), ['b.html', 'a.html', 'none.html'])
})

test('不改原数组', () => {
  const list = [file('b.html'), file('a.html')]
  const sorted = sortEntries(list, { key: 'name', dir: 'asc' })
  assert.deepEqual(names(list), ['b.html', 'a.html'])
  assert.deepEqual(names(sorted), ['a.html', 'b.html'])
})

