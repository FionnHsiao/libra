import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const DIR = path.join(os.tmpdir(), 'libra-live')
const FILE = path.join(DIR, 'live.html')
const PROFILE = path.join(os.tmpdir(), 'libra-live-profile')
const PORT = 9571
const { default: electronPath } = await import('electron')

fs.mkdirSync(DIR, { recursive: true })
fs.writeFileSync(FILE, '<!doctype html><meta charset="utf-8"><h1>版本一</h1>', 'utf8')
fs.mkdirSync(PROFILE, { recursive: true })
fs.writeFileSync(path.join(PROFILE, 'settings.json'), JSON.stringify({ entries: [{ kind: 'dir', path: DIR }] }), 'utf8')

const child = spawn(electronPath, ['.', FILE, '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function previewText() {
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
  const t = list.find((x) => x.url.startsWith('libra-file://'))
  if (!t) return '(no preview)'
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  const value = await new Promise((resolve) => {
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== 1) return
      ws.removeEventListener('message', h)
      resolve(m.result?.result?.value)
    }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.body.innerText.trim()', returnByValue: true } }))
  })
  ws.close()
  return value
}

try {
  await sleep(3500)
  console.log('before:', await previewText())

  fs.writeFileSync(FILE, '<!doctype html><meta charset="utf-8"><h1>版本二</h1>', 'utf8')
  await sleep(2000)
  console.log('after :', await previewText())
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}