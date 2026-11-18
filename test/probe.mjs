import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-test-profile')
const PORT = 9551
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', 'E:/Libra/libra/test/fixtures/sample-gbk.html', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE], { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
child.stdout.on('data', (d) => { log += d.toString() })
child.stderr.on('data', (d) => { log += d.toString() })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  await sleep(3000)
  const targets = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
  const page = targets.find((t) => t.url.endsWith('index.html'))
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let seq = 0
  const evaluate = (expr) => new Promise((resolve) => {
    const id = (seq += 1)
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== id) return
      ws.removeEventListener('message', h)
      resolve(m.result?.result?.value)
    }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))
  })
  console.log('dom:', await evaluate('JSON.stringify({ menubar: document.querySelectorAll(".menubar-button").length, rail: document.querySelectorAll(".rail").length, len: document.body.innerHTML.length })'))
  ws.close()
  console.log('--- log ---')
  console.log(log.split('\n').filter((l) => /error|Error/.test(l)).slice(0, 5).join('\n') || '(clean)')
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}