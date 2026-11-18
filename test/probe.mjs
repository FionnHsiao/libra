import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT = 'E:/Libra/libra'
const PROFILE = path.join(os.tmpdir(), 'libra-shot-profile2')
const DEMO_ROOT = path.join(os.tmpdir(), 'libra-demo')
const FILE = path.join(DEMO_ROOT, 'LibraNote', 'W1-如何阅读一本书.html')
const { default: electronPath } = await import('electron')
const child = spawn(electronPath, ['.', FILE, '--remote-debugging-port=9496', `--user-data-dir=${PROFILE}`], { cwd: PROJECT, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  await sleep(3000)
  const targets = await (await fetch('http://127.0.0.1:9496/json/list')).json()
  const ws = new WebSocket(targets.find((t) => t.url.startsWith('file://')).webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const id = 1
    const h = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== id) return
      ws.removeEventListener('message', h)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result?.result?.value)
    }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  })
  console.log(await evaluate(`JSON.stringify({
    jarLabelX: Math.round(document.querySelector('.tree-root-row .tree-label')?.getBoundingClientRect().left ?? -1),
    fileLabelX: Math.round(document.querySelector('.tree-file-row .tree-label')?.getBoundingClientRect().left ?? -1),
    fileRowChildren: [...(document.querySelector('.tree-file-row')?.children ?? [])].map((el) => el.className + ':' + Math.round(el.getBoundingClientRect().width))
  })`))
  ws.close()
} finally {
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return }
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolve())
  })
}